/* Pinch Point Visualization Component */

/**
 * Configuration class for visualization parameters
 */
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
        range: { from: 120, to: 0 } // e.g., Green to Red
    };
    this.saturation = {
        curve: 'linear',
        range: { from: 0.2, to: 1.0 } // e.g., 20% to 100% saturation
    };
    this.lightness = {
        curve: 'linear',
        range: { from: 90, to: 30 } // e.g., Pale to Dark/Intense
    };

    // Financial Definitions
    this.pinchPointTolerance = 1; // € tolerance for break-even
    this.failureThreshold = 0; // NetIncome < Expenses + threshold
  }
}

/**
 * Calculator class for converting metrics to row colors
 */
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
    const metrics = this.calculateMetrics(yearlyData, totalRuns);
    
    // Calculate the base, un-curved, normalized metric values
    const normalizedMagnitude = metrics.avgMagnitude > 0 ? metrics.avgMagnitude / metrics.avgExpenses : 0;
    const rawMetricValues = {
      failureRate: metrics.failureRate,
      survivalRate: metrics.survivalRate,
      magnitude: Math.min(normalizedMagnitude, 1.5) // Cap magnitude to prevent extreme values
    };

    // A generic function to get, process, and map a metric to its final HSL value
    const getFinalValue = (hslComponent) => {
      const map = this.config[hslComponent + 'Map'];       // e.g., config.hueMap
      const componentConfig = this.config[hslComponent]; // e.g., config.hue

      // 1. Get raw value and apply curve
      const rawValue = rawMetricValues[map.metric] || 0;
      const curve = this.curveFunctions[componentConfig.curve];
      let processedValue = curve(rawValue);

      // 2. Invert if needed
      if (map.invert) {
        processedValue = 1 - processedValue;
      }
      
      // 3. Linearly interpolate across the configured range
      return componentConfig.range.from * (1 - processedValue) + componentConfig.range.to * processedValue;
    };

    const hue = getFinalValue('hue');
    const lightness = getFinalValue('lightness');
    const saturation = getFinalValue('saturation');

    // Debug logging removed - feature working correctly

    return {
      color: `hsl(${hue}, ${saturation * 100}%, ${lightness}%)`,
      className: this.generateClassName(metrics) // Optional: for tooltips or debugging
    };
  }

  calculateMetrics(yearlyData, totalRuns) {
    const failures = yearlyData.failures || 0;
    const pinchPoints = yearlyData.pinchPoints || 0;
    const sumOfMagnitude = yearlyData.sumOfMagnitude || 0;
    const sumOfExpenses = yearlyData.sumOfExpenses || 0;
    const totalRunsReachedThisYear = yearlyData.totalRunsReachedThisYear || 0;

    // Failure rate: proportion of runs that failed or nearly failed in this year
    const failureRate = totalRunsReachedThisYear > 0 ?
      (failures * 1.0 + pinchPoints * 0.5) / totalRunsReachedThisYear : 0;

    // Survival rate: proportion of original runs that were still alive at start of this year
    // This represents the "relevance" or "confidence" of this year's data
    const runsAliveAtStartOfYear = yearlyData.runsAliveAtStartOfYear || 0;
    const survivalRate = totalRuns > 0 ? runsAliveAtStartOfYear / totalRuns : 0;

    // Survival rate calculation working correctly

    const avgMagnitude = totalRunsReachedThisYear > 0 ? sumOfMagnitude / totalRunsReachedThisYear : 0;
    const avgExpenses = totalRunsReachedThisYear > 0 ? sumOfExpenses / totalRunsReachedThisYear : 1; // Avoid division by zero

    return {
      failureRate,
      survivalRate,
      avgMagnitude,
      avgExpenses
    };
  }

  generateClassName(metrics) {
    // Generate a CSS class name for debugging/tooltips
    const failureLevel = metrics.failureRate > 0.7 ? 'high' : 
                        metrics.failureRate > 0.3 ? 'medium' : 'low';
    const survivalLevel = metrics.survivalRate > 0.7 ? 'high' : 
                         metrics.survivalRate > 0.3 ? 'medium' : 'low';
    return `pinch-failure-${failureLevel} pinch-survival-${survivalLevel}`;
  }
}

/**
 * Main visualizer class that processes raw simulation data and generates colors
 */
class PinchPointVisualizer {
  constructor(config = new VisualizationConfig()) {
    this.config = config;
    this.calculator = new RowColorCalculator(config);
  }

  // Step 1: Process raw data into aggregated metrics for each year
  aggregateYearlyMetrics(perRunResults) {
    const yearlyAggregates = {};
    const pinchPointTolerance = this.config.pinchPointTolerance;

    for (const run of perRunResults) {
      let runIsStillAlive = true; // Track if this run is still alive

      for (let i = 0; i < run.length; i++) {
        const row = i + 1; // 1-indexed row
        const yearData = run[i];

        if (!yearlyAggregates[row]) {
          yearlyAggregates[row] = {
            failures: 0,
            pinchPoints: 0,
            runsAliveAtStartOfYear: 0, // Runs that were still alive at start of this year
            sumOfMagnitude: 0,
            sumOfExpenses: 0,
            totalRunsReachedThisYear: 0
          };
        }

        // If this year exists in the data, the simulation reached this year
        yearlyAggregates[row].totalRunsReachedThisYear++;

        // Count this run as alive at the start of this year if it hasn't failed yet
        if (runIsStillAlive) {
          yearlyAggregates[row].runsAliveAtStartOfYear++;
        }

        // Process financial metrics for all years (regardless of success status)
        if (yearData.netIncome < yearData.expenses - pinchPointTolerance) {
          yearlyAggregates[row].failures++;
        } else if (yearData.netIncome <= yearData.expenses + pinchPointTolerance) {
          yearlyAggregates[row].pinchPoints++;
        }

        yearlyAggregates[row].sumOfMagnitude += Math.abs(yearData.netIncome - yearData.expenses);
        yearlyAggregates[row].sumOfExpenses += yearData.expenses;

        // Update the alive status for next year: once a run fails, it's permanently dead
        if (!yearData.success) {
          runIsStillAlive = false;
        }
      }
    }
    return yearlyAggregates;
  }

  // Step 2: Calculate final colors from the aggregated metrics
  calculateRowColors(perRunResults) {
    if (!perRunResults || perRunResults.length === 0) {
      return {};
    }

    const yearlyAggregates = this.aggregateYearlyMetrics(perRunResults);
    const colors = {};
    const totalRuns = perRunResults.length;

    for (const row in yearlyAggregates) {
      const yearlyData = yearlyAggregates[row];
      // The RowColorCalculator needs the aggregated data for a single year
      colors[row] = this.calculator.calculateRowColor(yearlyData, totalRuns).color;
    }
    return colors;
  }
}
