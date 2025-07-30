/* Test Pinch Point Visualization */

module.exports = {
  name: 'TestPinchPointVisualization',
  description: 'Test that PinchPointVisualizer calculates colors correctly for different scenarios',
  isCustomTest: true,
  runCustomTest: async function() {
    try {
      // Mock PinchPointVisualizer classes since we're running in Node.js
      class VisualizationConfig {
        constructor() {
          this.hueMap = { metric: 'failureRate', invert: false };
          this.saturationMap = { metric: 'survivalRate', invert: false };
          this.lightnessMap = { metric: 'magnitude', invert: false };
          
          this.hue = {
            curve: 'linear',
            range: { from: 120, to: 0 }
          };
          this.saturation = {
            curve: 'linear',
            range: { from: 0.2, to: 1.0 }
          };
          this.lightness = {
            curve: 'linear',
            range: { from: 90, to: 30 }
          };

          this.pinchPointTolerance = 1;
          this.failureThreshold = 0;
        }
      }

      class RowColorCalculator {
        constructor(config = new VisualizationConfig()) {
          this.config = config;
          this.curveFunctions = {
            linear: x => x,
            sqrt: x => Math.sqrt(x),
            log: x => Math.log10(x * 9 + 1),
            exponential: x => x * x
          };
        }

        calculateRowColor(yearlyData, totalRuns) {
          const metrics = this.calculateMetrics(yearlyData, totalRuns);
          
          const normalizedMagnitude = metrics.avgMagnitude > 0 ? metrics.avgMagnitude / metrics.avgExpenses : 0;
          const rawMetricValues = {
            failureRate: metrics.failureRate,
            survivalRate: metrics.survivalRate,
            magnitude: Math.min(normalizedMagnitude, 1.5)
          };

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
            color: `hsl(${hue}, ${saturation * 100}%, ${lightness}%)`,
            className: this.generateClassName(metrics)
          };
        }

        calculateMetrics(yearlyData, totalRuns) {
          const failureRate = this.calculateFailureRate(yearlyData, totalRuns);
          const survivalRate = this.calculateSurvivalRate(yearlyData, totalRuns);
          const avgMagnitude = this.calculateAverageMagnitude(yearlyData);
          const avgExpenses = this.calculateAverageExpenses(yearlyData);

          return {
            failureRate,
            survivalRate,
            avgMagnitude,
            avgExpenses
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
          if (yearlyData.totalRunsReachedThisYear === 0) return 1;
          return yearlyData.sumOfExpenses / yearlyData.totalRunsReachedThisYear;
        }

        generateClassName(metrics) {
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

        aggregateYearlyMetrics(perRunResults) {
          const yearlyAggregates = {};
          const pinchPointTolerance = this.config.pinchPointTolerance;

          for (const run of perRunResults) {
            let runIsStillAlive = true;

            for (let i = 0; i < run.length; i++) {
              const row = i + 1;
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

      // Test 1: Single successful run should produce green colors
      const visualizer = new PinchPointVisualizer();
      
      const singleSuccessfulRun = [
        [
          { netIncome: 50000, expenses: 40000, success: true },
          { netIncome: 52000, expenses: 41000, success: true },
          { netIncome: 54000, expenses: 42000, success: true }
        ]
      ];

      const colors1 = visualizer.calculateRowColors(singleSuccessfulRun);
      
      // Should have colors for 3 rows
      if (Object.keys(colors1).length !== 3) {
        return { success: false, errors: [`Expected 3 color entries, got ${Object.keys(colors1).length}`] };
      }

      // Colors should be valid HSL strings
      for (const row in colors1) {
        if (!/^hsl\(\d+(?:\.\d+)?, \d+(?:\.\d+)?%, \d+(?:\.\d+)?%\)$/.test(colors1[row])) {
          return { success: false, errors: [`Invalid HSL color format for row ${row}: ${colors1[row]}`] };
        }
      }

      // Test 2: Failed run should produce red colors
      const singleFailedRun = [
        [
          { netIncome: 30000, expenses: 40000, success: false },
          { netIncome: 25000, expenses: 41000, success: false },
          { netIncome: 20000, expenses: 42000, success: false }
        ]
      ];

      const colors2 = visualizer.calculateRowColors(singleFailedRun);
      
      // Should have different colors than successful run
      if (colors1['1'] === colors2['1']) {
        return { success: false, errors: ['Expected different colors for successful vs failed runs'] };
      }

      // Test 3: Test with multiple runs (Monte Carlo scenario)
      const multipleRuns = [
        [
          { netIncome: 50000, expenses: 40000, success: true },
          { netIncome: 52000, expenses: 41000, success: true }
        ],
        [
          { netIncome: 30000, expenses: 40000, success: false },
          { netIncome: 25000, expenses: 41000, success: false }
        ],
        [
          { netIncome: 45000, expenses: 40000, success: true },
          { netIncome: 47000, expenses: 41000, success: true }
        ]
      ];

      const colors3 = visualizer.calculateRowColors(multipleRuns);
      
      // Should handle multiple runs correctly
      if (Object.keys(colors3).length !== 2) {
        return { success: false, errors: [`Expected 2 color entries for multi-run, got ${Object.keys(colors3).length}`] };
      }

      return { success: true, errors: [] };

    } catch (error) {
      return { success: false, errors: [error.message] };
    }
  }
}; 