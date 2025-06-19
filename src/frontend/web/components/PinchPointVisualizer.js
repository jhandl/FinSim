// Pinch Point Highlighting Visualizer
// Implements VisualizationConfig, RowColorCalculator, and PinchPointVisualizer

class VisualizationConfig {
  constructor() {
    // Step 1: Define which metric drives which HSL component.
    // `invert: true` flips the metric's meaning, mapping high values to the 'from' of the range.
    this.hueMap        = { metric: 'failureRate',  invert: false };
    this.saturationMap = { metric: 'survivalRate', invert: false };
    this.lightnessMap  = { metric: 'magnitude',    invert: false };

    // Step 2: Configure the behavior of each HSL component.
    this.hue = {
        curve: 'linear',
        range: { from: 120, to: 0 } // Green to Red
    };
    this.saturation = {
        curve: 'linear',
        range: { from: 0.2, to: 1.0 } // 20% to 100% saturation
    };
    this.lightness = {
        curve: 'linear',
        range: { from: 90, to: 30 } // Pale to Dark/Intense
    };

    // Financial Definitions
    this.pinchPointTolerance = 1; // € tolerance for break-even
    this.failureThreshold = 0; // NetIncome < Expenses + threshold
  }
}

class RowColorCalculator {
  constructor(config = new VisualizationConfig()) {
    this.config = config;
    this.curveFunctions = {
      linear: x => x,
      sqrt: x => Math.sqrt(x),
      log: x => Math.log10(x * 9 + 1), // Scaled log to 0-1 range
      exponential: x => x * x
    };
  }

  calculateRowColor(yearlyData, totalRuns) {
    // Calculate metrics
    const failureRate = this.calculateFailureRate(yearlyData, totalRuns);
    const survivalRate = this.calculateSurvivalRate(yearlyData, totalRuns);
    const avgMagnitude = this.calculateAverageMagnitude(yearlyData);
    const avgExpenses = this.calculateAverageExpenses(yearlyData);
    const normalizedMagnitude = avgExpenses > 0 ? avgMagnitude / avgExpenses : 0;
    const rawMetricValues = {
      failureRate: failureRate,
      survivalRate: survivalRate,
      magnitude: Math.min(normalizedMagnitude, 1.5)
    };

    // Generic function to get, process, and map a metric to its final HSL value
    const getFinalValue = (hslComponent) => {
      const map = this.config[hslComponent + 'Map'];
      const componentConfig = this.config[hslComponent];
      const rawValue = rawMetricValues[map.metric] || 0;
      const curve = this.curveFunctions[componentConfig.curve];
      let processedValue = curve(rawValue);
      if (map.invert) {
        processedValue = 1 - processedValue;
      }
      return componentConfig.range.from * (1 - processedValue) + componentConfig.range.to * processedValue;
    };

    const hue = getFinalValue('hue');
    const lightness = getFinalValue('lightness');
    const saturation = getFinalValue('saturation');

    return {
      color: `hsl(${hue}, ${saturation * 100}%, ${lightness}%)`
    };
  }

  calculateFailureRate(yearlyData, totalRuns) {
    // (num_failures * 1.0 + num_pinch_points * 0.5) / total_runs_this_year
    if (!yearlyData || !totalRuns) return 0;
    return (yearlyData.failures * 1.0 + yearlyData.pinchPoints * 0.5) / yearlyData.totalRunsReachedThisYear;
  }

  calculateSurvivalRate(yearlyData, totalRuns) {
    // runs_alive_at_start_of_this_year / initial_total_runs
    if (!yearlyData || !totalRuns) return 0;
    return yearlyData.runsAliveAtStartOfYear / totalRuns;
  }

  calculateAverageMagnitude(yearlyData) {
    // average(|NetIncome - Expenses|)
    if (!yearlyData || yearlyData.totalRunsReachedThisYear === 0) return 0;
    return yearlyData.sumOfMagnitude / yearlyData.totalRunsReachedThisYear;
  }

  calculateAverageExpenses(yearlyData) {
    if (!yearlyData || yearlyData.totalRunsReachedThisYear === 0) return 0;
    return yearlyData.sumOfExpenses / yearlyData.totalRunsReachedThisYear;
  }
}

class PinchPointVisualizer {
  constructor(config = new VisualizationConfig()) {
    this.config = config;
    this.calculator = new RowColorCalculator(config);
  }

  // Step 1: Process raw data into aggregated metrics for each year
  aggregateYearlyMetrics(perRunResults) {
    const yearlyAggregates = {};
    const pinchPointTolerance = this.config.pinchPointTolerance;
    const totalRuns = perRunResults.length;
    for (let runIdx = 0; runIdx < totalRuns; runIdx++) {
      const run = perRunResults[runIdx];
      let runIsStillAlive = true;
      for (let i = 0; i < run.length; i++) {
        const row = i + 1; // 1-indexed row
        const yearData = run[i];
        if (!yearlyAggregates[row]) {
          yearlyAggregates[row] = {
            failures: 0,
            pinchPoints: 0,
            runsAliveAtStartOfYear: 0,
            sumOfMagnitude: 0,
            sumOfExpenses: 0,
            totalRunsReachedThisYear: 0
          };
        }
        yearlyAggregates[row].totalRunsReachedThisYear++;
        if (runIsStillAlive) {
          yearlyAggregates[row].runsAliveAtStartOfYear++;
        }
        if (yearData.netIncome < yearData.expenses - pinchPointTolerance) {
          yearlyAggregates[row].failures++;
        } else if (yearData.netIncome <= yearData.expenses + pinchPointTolerance) {
          yearlyAggregates[row].pinchPoints++;
        }
        yearlyAggregates[row].sumOfMagnitude += Math.abs(yearData.netIncome - yearData.expenses);
        yearlyAggregates[row].sumOfExpenses += yearData.expenses;
        if (!yearData.success) {
          runIsStillAlive = false;
        }
      }
    }
    return yearlyAggregates;
  }

  // Step 2: Calculate final colors from the aggregated metrics
  calculateRowColors(perRunResults) {
    const yearlyAggregates = this.aggregateYearlyMetrics(perRunResults);
    const colors = {};
    const totalRuns = perRunResults.length;
    for (const row in yearlyAggregates) {
      const yearlyData = yearlyAggregates[row];
      colors[row] = this.calculator.calculateRowColor(yearlyData, totalRuns).color;
    }
    return colors;
  }
}

// Attach to window for browser compatibility
window.PinchPointVisualizer = PinchPointVisualizer; 