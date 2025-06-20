/* Pinch Point Visualization Component */

class VisualizationConfig {
  constructor(presetName = 'default') {
    const presets = VisualizationConfig.getPresets();
    const preset = presets[presetName] || presets['default'];
    
    this.hueMap = preset.hueMap;
    this.saturationMap = preset.saturationMap;
    this.lightnessMap = preset.lightnessMap;
    this.hue = preset.hue;
    this.saturation = preset.saturation;
    this.lightness = preset.lightness;

    // Financial Definitions
    this.pinchPointTolerance = 1; // € tolerance for break-even
    this.failureThreshold = 0; // NetIncome < Expenses + threshold
  }

  static getPresets() {
    return {
      'default': {
        name: 'Plain',
        description: 'No color highlighting.',
        hueMap: { metric: 'none', invert: false },
        saturationMap: { metric: 'none', invert: false },
        lightnessMap: { metric: 'none', invert: false },
        hue: { curve: 'linear', range: { from: 120, to: 120 } },
        saturation: { curve: 'linear', range: { from: 0.0, to: 0.0 } },
        lightness: { curve: 'linear', range: { from: 100, to: 100 } }
      },
      'cashflow': {
        name: 'Cash Flow',
        description: '### Cash Flow Health\n\n- **Green**: income covers expenses without asset sales.\n\n- **Red**: assets need to be sold to cover expenses.\n\n- **Color intensity**: the surplus / deficit size.',
        hueMap: { metric: 'cashflowDeficitRate', invert: false },
        saturationMap: { metric: 'cashflowDeficitMagnitude', invert: false },
        lightnessMap: { metric: 'cashflowDeficitMagnitude', invert: false },
        hue: { curve: 'linear', range: { from: 120, to: 0 } },
        saturation: { curve: 'sqrt', range: { from: 0.4, to: 0.8 } },
        lightness: { curve: 'sqrt', range: { from: 95, to: 65 } }
      },
      'survival': {
        name: 'Survival',
        description: '### Survival Rate\n\n- **Greener**: more scenarios survived up to this point.\n\n- **Redder**: fewer scenarios survived this far.',
        hueMap: { metric: 'survivalRate', invert: true },
        saturationMap: { metric: 'none', invert: false },
        lightnessMap: { metric: 'none', invert: true },
        hue: { curve: 'linear', range: { from: 120, to: 0 } },
        saturation: { curve: 'linear', range: { from: 0.2, to: 1.0 } },
        lightness: { curve: 'linear', range: { from: 90, to: 50 } }
      },
      'classic': {
        name: 'Failure',
        description: '### Failure Rate\n\n- **Greener**: lower chance of failing this year.\n\n- **Redder**: higher chance of failing this year.',
        hueMap: { metric: 'failureRate', invert: false },
        saturationMap: { metric: 'none', invert: false },
        lightnessMap: { metric: 'none', invert: true },
        hue: { curve: 'linear', range: { from: 120, to: 0 } },
        saturation: { curve: 'linear', range: { from: 0.8, to: 0.8 } },
        lightness: { curve: 'linear', range: { from: 75, to: 45 } }
      },
      'combined': {
        name: 'Combined',
        description: '### Combined\n\n- **Greener**: lower chance of failing this year.\n\n- **Brighter**: more excess money.\n\n- **Grayer**: lower chance of reaching this year with money.',
        hueMap: { metric: 'failureRate', invert: false },
        saturationMap: { metric: 'survivalRate', invert: false },
        lightnessMap: { metric: 'magnitude', invert: false },
        hue: { curve: 'linear', range: { from: 120, to: 0 } },
        saturation: { curve: 'linear', range: { from: 0.05, to: 0.8 } },
        lightness: { curve: 'linear', range: { from: 75, to: 30 } }
      }
    };
  }

  static createFromPreset(presetName) {
    return new VisualizationConfig(presetName);
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
    const metrics = this.calculateMetrics(yearlyData, totalRuns);
    
    // Calculate the base, un-curved, normalized metric values
    const normalizedMagnitude = metrics.avgMagnitude > 0 ? metrics.avgMagnitude / metrics.avgExpenses : 0;
    const normalizedCashflowDeficit = metrics.avgCashflowDeficit > 0 ? metrics.avgCashflowDeficit / metrics.avgExpenses : 0;
    const rawMetricValues = {
      failureRate: metrics.failureRate,
      survivalRate: metrics.survivalRate,
      magnitude: Math.min(normalizedMagnitude, 1.5) / 1.5, // Cap magnitude and normalize to 0-1 range
      cashflowDeficitRate: metrics.cashflowDeficitRate,
      cashflowDeficitMagnitude: Math.min(normalizedCashflowDeficit, 1.5) / 1.5
    };

    // A generic function to get, process, and map a metric to its final HSL value
    const getFinalValue = (hslComponent) => {
      const map = this.config[hslComponent + 'Map'];       // e.g., config.hueMap
      const componentConfig = this.config[hslComponent]; // e.g., config.hue

      // If metric is 'none', return constant value based on invert flag
      if (map.metric === 'none') {
        return map.invert ? componentConfig.range.from : componentConfig.range.to;
      }

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

    return {
      color: `hsl(${hue}, ${saturation * 100}%, ${lightness}%)`,
      className: this.generateClassName(metrics) // Optional: for tooltips or debugging
    };
  }

  calculateMetrics(yearlyData, totalRuns) {
    const failureRate = this.calculateFailureRate(yearlyData, totalRuns);
    const survivalRate = this.calculateSurvivalRate(yearlyData, totalRuns);
    const avgMagnitude = this.calculateAverageMagnitude(yearlyData);
    const avgExpenses = this.calculateAverageExpenses(yearlyData);
    const cashflowDeficitRate = this.calculateCashflowDeficitRate(yearlyData, totalRuns);
    const avgCashflowDeficit = this.calculateAverageCashflowDeficit(yearlyData);

    return {
      failureRate,
      survivalRate,
      avgMagnitude,
      avgExpenses,
      cashflowDeficitRate,
      avgCashflowDeficit
    };
  }

  calculateFailureRate(yearlyData, totalRuns) {
    if (totalRuns === 0) return 0;
    return (yearlyData.failures * 1.0 + yearlyData.pinchPoints * 0.5) / totalRuns;
  }

  calculateSurvivalRate(yearlyData, totalRuns) {
    if (totalRuns === 0) return 0;
    return yearlyData.runsAliveAtStartOfYear / totalRuns;
  }

  calculateAverageMagnitude(yearlyData) {
    if (yearlyData.totalRunsReachedThisYear === 0) return 0;
    return yearlyData.sumOfMagnitude / yearlyData.totalRunsReachedThisYear;
  }

  calculateAverageExpenses(yearlyData) {
    if (yearlyData.totalRunsReachedThisYear === 0) return 1; // Avoid division by zero
    return yearlyData.sumOfExpenses / yearlyData.totalRunsReachedThisYear;
  }

  calculateCashflowDeficitRate(yearlyData, totalRuns) {
    if (totalRuns === 0) return 0;
    return yearlyData.cashflowDeficits / totalRuns;
  }

  calculateAverageCashflowDeficit(yearlyData) {
    if (yearlyData.cashflowDeficits === 0) return 0;
    return yearlyData.sumOfCashflowDeficit / yearlyData.cashflowDeficits;
  }

  generateClassName(metrics) {
    // Optional: Generate CSS class names for debugging or tooltips
    const failureLevel = metrics.failureRate > 0.7 ? 'high' : 
                        metrics.failureRate > 0.3 ? 'medium' : 'low';
    const survivalLevel = metrics.survivalRate > 0.7 ? 'high' : 
                         metrics.survivalRate > 0.3 ? 'medium' : 'low';
    return `failure-${failureLevel} survival-${survivalLevel}`;
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
            totalRunsReachedThisYear: 0,
            cashflowDeficits: 0, // Count of runs with cashflow deficit
            sumOfCashflowDeficit: 0
          };
        }

        // All runs reach all years (simulator continues even after failure)
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

        // Check for cashflow deficit during growth phase
        if (yearData.householdPhase === 'growth' && yearData.earnedNetIncome < yearData.expenses) {
          yearlyAggregates[row].cashflowDeficits++;
          yearlyAggregates[row].sumOfCashflowDeficit += yearData.expenses - yearData.earnedNetIncome;
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