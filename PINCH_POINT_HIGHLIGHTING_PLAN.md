# Pinch Point Highlighting Feature Plan

## Overview
Implement a dynamic, unified visual highlighting system in the simulation data table to identify financial "pinch points." This system visually encodes risk, severity, and data relevance for every year of the simulation, providing an intuitive overview of financial health.

This approach works for all simulation types, from a single run (`n=1`) to a full Monte Carlo simulation, by using a single, consistent calculation method.

## The Core Visualization Metrics
For every year of a simulation, we calculate three core metrics. These metrics are then mapped to the HSL (Hue, Saturation, Lightness) components of the row's background color, based on the settings in the `VisualizationConfig`.

**Metric 1: Failure Rate (The Risk Profile)**
This metric quantifies the immediate risk within a given year by measuring the proportion of simulations that failed or nearly failed.

*   `failureRate = (num_failures * 1.0 + num_pinch_points * 0.5) / total_runs_this_year`
*   **Meaning**: A value of `0` indicates all simulations for that year had a positive cashflow. A value of `1` indicates all of them failed. A value between 0 and 1 indicates a mix of outcomes, or a "pinch point".

**Metric 2: Normalized Magnitude (The Severity Profile)**
This metric measures the financial impact or volatility of the outcomes for the year, relative to the expenses for that same year.

*   First, the average absolute financial delta is found: `avgMagnitude = average(|NetIncome - Expenses|)`.
*   Then, it's normalized: `normalizedMagnitude = avgMagnitude / avgExpenses`.
*   **Meaning**: This contextualizes the financial swings. A value of `0.5` means the average surplus or deficit was 50% of that year's expenses. A high value signifies a year of extreme financial events (large windfalls or huge shortfalls), while a low value signifies stability.

**Metric 3: Survival Rate (The Relevance Profile)**
This metric provides the cumulative probability of a simulation run being "alive" (still successful) at the start of the current year, effectively acting as a "relevance" or "confidence" score for that year's data. A run is considered "alive" at the start of a year only if it has had `success=true` for ALL previous years. Once a run fails (gets `success=false`) in any year, it is permanently considered "dead" for all subsequent years.

*   `survivalRate = runs_alive_at_start_of_this_year / initial_total_runs`
*   **Meaning**: A value of `1` means all simulations were still successful at the start of this year. A value of `0.3` means only 30% of the original simulation runs were still successful at the start of this year, making the year's data less representative of long-term success scenarios.

### Behavior for a Single Run (n=1)
This system gracefully handles a standard, single-run simulation. The metrics naturally simplify:
1.  **Failure Rate**: Will be exactly `0.0` (positive), `0.5` (pinch-point), or `1.0` (failure).
2.  **Normalized Magnitude**: Becomes the single run's absolute delta, normalized by its expenses.
3.  **Survival Rate**: Is `1.0` for all years until the first failure, after which it becomes `0.0` for all subsequent years (even though the simulation continues generating data with `success=false`).

When used with the default configuration—which maps Failure Rate to Hue, Magnitude to Lightness, and Survival Rate to Saturation—this produces the desired intuitive result: rows are green/yellow/red, their intensity varies with the size of the surplus/deficit, and they become desaturated (gray) after the simulation fails.

## Implementation Strategy

The implementation requires two distinct phases: a minimal, generic modification to the core simulator to expose per-run data, followed by the creation of a new, self-contained frontend component to process that data and render the visualization.

### Prerequisite: Minimal Core Simulator Modification

To enable this feature, the core simulator must be modified to stop discarding the results of each individual Monte Carlo run. This will be a minimal, feature-agnostic change.

A new data structure, `perRunResults`, will be added to `Simulator.js`. Inside the `updateYearlyData` function, a few lines of code will capture the raw `netIncome`, `expenses`, and `success` status for each year of each run. This structure will then be passed to the `UIManager`. This approach avoids adding any feature-specific logic (like "pinch points") to the core engine.

**Important Implementation Detail**: The simulator continues running failed simulations until the target age, but marks them with `success=false`. The captured `success` status is crucial for calculating survival rates correctly.

### Frontend: The `PinchPointVisualizer` Component

This new component will contain the complete logic for the feature, ensuring a clean separation of concerns.

**Workflow:**
1.  **`UIManager`** receives the aggregated `dataSheet` (for the main table display) and the new `perRunResults` structure from the simulator.
2.  It instantiates the `PinchPointVisualizer` and passes the raw `perRunResults` to it.
3.  The `PinchPointVisualizer` first processes the raw data to calculate the three core metrics (Failure Rate, Magnitude, Survival Rate) for each year.
4.  It then uses its internal `RowColorCalculator` to convert these metrics into a map of `{ year: 'hsl(...)' }`.
5.  `UIManager` passes the final colors to `TableManager`, which remains a simple renderer.

**Visualizer Logic Snippet:**
```javascript
// Located in src/frontend/web/components/PinchPointVisualizer.js

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

  calculateRowColor(rowData) {
    const metrics = this.calculateMetrics(rowData);
    
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

    return {
      color: `hsl(${hue}, ${saturation * 100}%, ${lightness}%)`,
      className: this.generateClassName(metrics) // Optional: for tooltips or debugging
    };
  }

  calculateMetrics(rowData) {
    // ... logic to calculate failureRate, survivalRate, avgMagnitude, avgExpenses from rowData.runs ...
    return {
      failureRate: this.calculateFailureRate(rowData.runs),
      survivalRate: this.calculateSurvivalRate(rowData.cumulativeRuns),
      avgMagnitude: this.calculateAverageMagnitude(rowData.runs),
      avgExpenses: this.calculateAverageExpenses(rowData.runs)
    };
  }

  // ... other calculation helper methods ...
}

export class PinchPointVisualizer {
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
```

### Files to Modify

1.  **`src/core/Simulator.js` (Minimal Change)**
    *   Introduce a `perRunResults = []` variable, cleared at the start of `run()`.
    *   Introduce a `currentRun` index variable, incremented in the `run()` loop.
    *   In `updateYearlyData()`, add a small, generic block that pushes `{netIncome, expenses, success}` into `perRunResults[currentRun]` for each year.
    *   Modify `uiManager.updateDataSheet()` call to pass this new raw data structure to the UI.

2.  **NEW FILE: `src/frontend/web/components/PinchPointVisualizer.js`**
    *   Will contain the `VisualizationConfig`, `RowColorCalculator`, and the main `PinchPointVisualizer` class.
    *   It will now be responsible for the primary data aggregation (`aggregateYearlyMetrics`) before calculating colors.

3.  **`src/frontend/UIManager.js`**
    *   Import `PinchPointVisualizer`.
    *   In `updateDataSheet()`, accept `perRunResults` and pass it to the visualizer.
    *   Pass the resulting color map to `TableManager` as before.

4.  **`src/frontend/web/components/TableManager.js`**
    *   Modify `setDataRow()` to accept and apply a `backgroundColor` string (no change from previous plan).

5.  **`src/frontend/web/ifs/css/simulator.css`**
    *   Remove obsolete `cashflow-*` classes and add a generic hover style (no change from previous plan).

## Testing and Development

A developer panel could be invaluable for tuning the visualization.

#### Developer Testing UI (Optional)
```html
<!-- Hidden developer panel for testing visualization options -->
<div id="viz-tester" style="display: none;">
  <h4>Visualization Tester</h4>
  
  <label>Failure Rate Curve:</label>
  <select id="failure-curve">
    <option value="linear">Linear</option>
    <option value="sqrt">Square Root</option>
    <option value="exponential">Exponential</option>
  </select>

  <label>Magnitude Curve:</label>
  <select id="magnitude-curve">
    <option value="linear">Linear</option>
    <option value="sqrt">Square Root</option>
    <option value="log">Logarithmic</option>
  </select>

  <label>Min Saturation:</label>
  <input type="range" id="min-saturation" min="0.1" max="0.5" step="0.05" value="0.2">
  <span id="min-saturation-value">0.2</span>

  <button onclick="tester.loadTestScenario('cliff-failure')">Test: Cliff Failure</button>
  <button onclick="tester.loadTestScenario('gradual-failure')">Test: Gradual Failure</button>
</div>
```

## Success Criteria

1.  **Visual Clarity**: Users can immediately identify financial stress points through color intensity and hue.
2.  **Unified Logic**: A single, robust calculation handles all simulation types (`n>=1`).
3.  **Performance**: No noticeable impact on simulation speed.
4.  **Configurability**: Visualization parameters are easily tunable for future improvements.