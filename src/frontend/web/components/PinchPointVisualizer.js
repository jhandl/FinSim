/*
 Pinch Point Visualizer
 Calculates per-row background colors to highlight financial stress points using HSL mapping.
 This implementation follows the plan described in PINCH_POINT_HIGHLIGHTING_PLAN.md but with
 a pragmatic subset that is sufficient for first-pass visualisation. The algorithm is self-contained
 and makes zero assumptions about the rest of the codebase.
*/

class VisualizationConfig {
  constructor() {
    // Metric mapping to HSL components
    this.hueMap        = { metric: 'failureRate',  invert: false };
    this.saturationMap = { metric: 'survivalRate', invert: false };
    this.lightnessMap  = { metric: 'magnitude',    invert: false };

    // Component ranges (green→red, desaturated→full, light→dark)
    this.hue =        { curve: 'linear', range: { from: 120, to: 0   } };
    this.saturation = { curve: 'linear', range: { from: 0.2, to: 1.0 } };
    this.lightness =  { curve: 'linear', range: { from: 90,  to: 30  } };

    // Financial definitions
    this.pinchPointTolerance = 1;  // € tolerance for break-even
  }
}

class RowColorCalculator {
  constructor(config = new VisualizationConfig()) {
    this.config = config;
    this.curveFunctions = {
      linear:   x => x,
      sqrt:     x => Math.sqrt(x),
      log:      x => Math.log10(x * 9 + 1), // Scaled log 0-1
      exponential: x => x * x
    };
  }

  /**
   * Calculates a final HSL color string for one year from aggregated metrics.
   * @param {Object} metrics Aggregated metrics for the year.
   * @param {number} totalRuns Count of total simulation runs.
   * @returns {{color: string}}
   */
  calculateRowColor(metrics, totalRuns) {
    // Normalise magnitude by average expenses
    const normalizedMagnitude = metrics.avgExpenses > 0 ? (metrics.avgMagnitude / metrics.avgExpenses) : 0;
    const capMagnitude = Math.min(normalizedMagnitude, 1.5); // cap to sane upper bound

    const rawMetricValues = {
      failureRate: metrics.failureRate,
      survivalRate: metrics.survivalRate,
      magnitude: capMagnitude
    };

    const getComponentValue = (componentKey) => {
      const map = this.config[componentKey + 'Map'];
      const componentCfg = this.config[componentKey];
      const curveFn = this.curveFunctions[componentCfg.curve] || this.curveFunctions.linear;
      let v = rawMetricValues[map.metric] || 0;
      v = curveFn(v);
      if (map.invert) v = 1 - v;
      return componentCfg.range.from * (1 - v) + componentCfg.range.to * v;
    };

    const h = getComponentValue('hue');
    const s = getComponentValue('saturation');
    const l = getComponentValue('lightness');

    return { color: `hsl(${h}, ${s * 100}%, ${l}%)` };
  }
}

class PinchPointVisualizer {
  constructor(config = new VisualizationConfig()) {
    this.config = config;
    this.calculator = new RowColorCalculator(config);
  }

  /**
   * Aggregates raw per-run results into yearly metrics across all runs.
   * @param {Array<Array<Object>>} perRunResults Array indexed by run, each containing yearly objects.
   * @returns {Object} keyed by row (1-based) with aggregated statistics
   */
  aggregateYearlyMetrics(perRunResults) {
    const aggregates = {};
    const tol = this.config.pinchPointTolerance;

    for (const run of perRunResults) {
      let runAlive = true;

      for (let i = 0; i < run.length; i++) {
        const row = i + 1; // 1-based index for rows
        const yr = run[i];
        if (!aggregates[row]) {
          aggregates[row] = {
            failures: 0,
            pinchPoints: 0,
            runsAliveAtStartOfYear: 0,
            sumOfMagnitude: 0,
            sumOfExpenses: 0,
            totalRunsReachedThisYear: 0
          };
        }

        const agg = aggregates[row];
        agg.totalRunsReachedThisYear++;
        if (runAlive) agg.runsAliveAtStartOfYear++;

        if (yr.netIncome < yr.expenses - tol) {
          agg.failures++;
        } else if (Math.abs(yr.netIncome - yr.expenses) <= tol) {
          agg.pinchPoints++;
        }

        agg.sumOfMagnitude += Math.abs(yr.netIncome - yr.expenses);
        agg.sumOfExpenses += yr.expenses;

        if (!yr.success) {
          runAlive = false; // once failed, remains dead
        }
      }
    }

    return aggregates;
  }

  calculateRowColors(perRunResults) {
    const aggregates = this.aggregateYearlyMetrics(perRunResults);
    const colors = {};
    const totalRuns = perRunResults.length;

    Object.entries(aggregates).forEach(([row, data]) => {
      const avgMagnitude = data.sumOfMagnitude / data.totalRunsReachedThisYear;
      const avgExpenses = data.sumOfExpenses / data.totalRunsReachedThisYear;
      const failureRate = (data.failures + data.pinchPoints * 0.5) / data.totalRunsReachedThisYear;
      const survivalRate = data.runsAliveAtStartOfYear / perRunResults.length;

      const metrics = {
        failureRate,
        survivalRate,
        avgMagnitude,
        avgExpenses
      };

      colors[row] = this.calculator.calculateRowColor(metrics, totalRuns).color;
    });

    return colors;
  }
}

// Expose globally when running in browser so UIManager can access it without import semantics
if (typeof window !== 'undefined') {
  window.PinchPointVisualizer = PinchPointVisualizer;
} 