# Pinch Point Highlighting Feature Plan

## Overview
Implement visual highlighting in the simulation data table to identify financial "pinch points" - periods where income and expenses create different financial scenarios. This helps users quickly identify critical periods in their financial simulation.

## Visual Design

### Color Scheme
- **Red background**: Simulation failure (NetIncome < Expenses)
- **Yellow background**: Break-even/pinch point (NetIncome ≈ Expenses) 
- **Light green background**: Positive cashflow (NetIncome > Expenses)
- **Gray background**: Post-failure rows (grayed out after first failure)

### CSS Class Naming Convention
Use `cashflow-` prefix with descriptive suffixes:
- `cashflow-failure`: Red background for simulation failures
- `cashflow-pinch-point`: Yellow background for break-even scenarios
- `cashflow-positive`: Light green background for positive cashflow
- `cashflow-post-failure`: Gray background for rows after failure

## Implementation Details

### 1. TableManager.js Modifications

#### State Tracking
```javascript
class TableManager {
  constructor(webUI) {
    this.webUI = webUI;
    // Track simulation failure state
    this.simulationFailed = false;
    this.failureRowIndex = -1;
  }
}
```

#### Reset Method
```javascript
resetSimulationState() {
  this.simulationFailed = false;
  this.failureRowIndex = -1;
}
```

#### Enhanced setDataRow Method
- Compare `NetIncome` vs `Expenses` with €1 tolerance
- Apply appropriate CSS classes based on financial status
- Track failure state to gray out subsequent rows
- Clear existing cashflow classes before applying new ones

### 2. CSS Styles (simulator.css)

#### Primary States
```css
/* Simulation failure - red background */
#Data tbody tr.cashflow-failure {
    background-color: #ffebee !important;
}

#Data tbody tr.cashflow-failure:hover {
    background-color: #ffcdd2 !important;
}

/* Break-even/pinch point - yellow background */
#Data tbody tr.cashflow-pinch-point {
    background-color: #fff8e1 !important;
}

#Data tbody tr.cashflow-pinch-point:hover {
    background-color: #ffecb3 !important;
}

/* Positive cashflow - light green background */
#Data tbody tr.cashflow-positive {
    background-color: #e8f5e8 !important;
}

#Data tbody tr.cashflow-positive:hover {
    background-color: #c8e6c9 !important;
}

/* Post-failure grayed out rows */
#Data tbody tr.cashflow-post-failure {
    background-color: #f5f5f5 !important;
    opacity: 0.6;
    color: #888;
}

#Data tbody tr.cashflow-post-failure:hover {
    background-color: #eeeeee !important;
}
```

### 3. UIManager.js Integration

Modify `updateDataSheet()` to reset pinch point state:
```javascript
updateDataSheet(runs) {
  // Reset cashflow highlighting state at simulation start
  this.ui.tableManager.resetSimulationState();
  
  // ... existing code continues
}
```

## Logic Flow

### Financial Status Determination
1. **Extract values**: Get `NetIncome` and `Expenses` from data object
2. **Apply tolerance**: Use €1 tolerance for break-even detection to handle rounding
3. **Determine status**:
   - If `NetIncome < Expenses - tolerance` → `cashflow-failure`
   - If `|NetIncome - Expenses| <= tolerance` → `cashflow-pinch-point`  
   - If `NetIncome > Expenses + tolerance` → `cashflow-positive`

### Failure State Tracking
1. **Track first failure**: When first `cashflow-failure` occurs, record the row index
2. **Gray out subsequent rows**: All rows after first failure get `cashflow-post-failure`
3. **Reset on new simulation**: Clear failure state when simulation restarts

## Technical Considerations

### Compatibility
- Maintain existing table functionality
- Work with current data structure from UIManager

### Performance  
- Minimal performance impact as logic runs only during row creation
- CSS classes are lightweight and leverage existing table styling
- State tracking uses simple boolean and index variables

### Scope (Non-Monte Carlo)
This initial implementation focuses on standard (non-Monte Carlo) simulations where:
- Single simulation run produces deterministic results
- Clear sequential row-by-row analysis is possible
- Failure state can be definitively tracked

## Files to Modify

1. **src/frontend/web/components/TableManager.js**
   - Add state tracking properties
   - Add `resetSimulationState()` method
   - Enhance `setDataRow()` with cashflow analysis logic

2. **src/frontend/web/ifs/css/simulator.css**
   - Add cashflow highlighting CSS classes
   - Include hover states for better UX

3. **src/frontend/UIManager.js**
   - Add reset call in `updateDataSheet()` method

## Monte Carlo Implementation Strategy

### Three-Dimensional Color Encoding
For Monte Carlo simulations, we need to encode three variables simultaneously:
1. **Failure Rate** (among surviving scenarios in current year)
2. **Survival Rate** (cumulative from simulation start) 
3. **Delta Magnitude** (average size of NetIncome - Expenses gap)

### Flexible Testing Framework

#### Configuration Class
```javascript
class MonteCarloVisualizationConfig {
  constructor() {
    // Core approach selection
    this.coloringMethod = 'hsl-three-dimensional'; // 'hsl-three-dimensional', 'border-thickness', 'brightness-variation'
    
    // HSL Mapping
    this.hueMapping = 'failure-rate'; // 'failure-rate', 'delta-magnitude'
    this.saturationMapping = 'survival-rate'; // 'survival-rate', 'confidence-level'
    this.lightnessMapping = 'delta-magnitude'; // 'delta-magnitude', 'failure-rate'
    
    // Curve types for each dimension
    this.failureRateCurve = 'linear'; // 'linear', 'sqrt', 'exponential'
    this.survivalRateCurve = 'linear'; // 'linear', 'sqrt', 'log'
    this.deltaCurve = 'linear'; // 'linear', 'sqrt', 'log', 'exponential'
    
    // Bounds and limits
    this.minSaturation = 0.2; // Never go below 20% saturation for readability
    this.lightnessRange = { min: 30, max: 85 }; // Dark to light range
    this.hueRange = { success: 120, warning: 45, failure: 0 }; // Green, yellow, red
    
    // Failure definitions
    this.failureThreshold = 0; // NetIncome < Expenses + threshold
    this.survivalDefinition = 'permanent-death'; // 'permanent-death', 'recovery-allowed'
    
    // Delta calculation
    this.deltaCalculation = 'mean'; // 'mean', 'median', 'percentile-25'
    this.deltaReference = 'expenses'; // 'expenses', 'income', 'larger-value'
  }
}
```

#### Modular Color Calculator
```javascript
class MonteCarloColorCalculator {
  constructor(config = new MonteCarloVisualizationConfig()) {
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
    
    switch(this.config.coloringMethod) {
      case 'hsl-three-dimensional':
        return this.calculateHSLColor(metrics);
      case 'border-thickness':
        return this.calculateBorderColor(metrics);
      case 'brightness-variation':
        return this.calculateBrightnessColor(metrics);
      default:
        return this.calculateHSLColor(metrics);
    }
  }

  calculateMetrics(rowData) {
    return {
      failureRate: this.calculateFailureRate(rowData.runs),
      survivalRate: this.calculateSurvivalRate(rowData.cumulativeRuns),
      avgDelta: this.calculateAverageDelta(rowData.runs),
      deltaRange: this.calculateDeltaRange(rowData.runs)
    };
  }

  calculateHSLColor(metrics) {
    // Apply curve transformations
    const failureValue = this.curveFunctions[this.config.failureRateCurve](metrics.failureRate);
    const survivalValue = this.curveFunctions[this.config.survivalRateCurve](metrics.survivalRate);
    const deltaValue = this.curveFunctions[this.config.deltaCurve](metrics.avgDelta / metrics.deltaRange);

    // Map to HSL dimensions based on configuration
    const hue = this.mapToHue(failureValue);
    const saturation = Math.max(survivalValue, this.config.minSaturation);
    const lightness = this.mapToLightness(deltaValue);

    return {
      color: `hsl(${hue}, ${saturation * 100}%, ${lightness}%)`,
      className: this.generateClassName(metrics)
    };
  }

  // Additional calculation methods...
}
```

#### Testing Interface
```javascript
class MonteCarloVisualizationTester {
  constructor(tableManager) {
    this.tableManager = tableManager;
    this.config = new MonteCarloVisualizationConfig();
    this.calculator = new MonteCarloColorCalculator(this.config);
    this.testData = null;
  }

  // Easy parameter switching for live testing
  setColoringMethod(method) {
    this.config.coloringMethod = method;
    this.refreshVisualization();
  }

  setCurveType(dimension, curveType) {
    switch(dimension) {
      case 'failure': this.config.failureRateCurve = curveType; break;
      case 'survival': this.config.survivalRateCurve = curveType; break;
      case 'delta': this.config.deltaCurve = curveType; break;
    }
    this.refreshVisualization();
  }

  setMinSaturation(value) {
    this.config.minSaturation = value;
    this.refreshVisualization();
  }

  // Apply current configuration to existing table data
  refreshVisualization() {
    if (this.testData) {
      this.tableManager.applyMonteCarloColoring(this.testData, this.calculator);
    }
  }

  // Load test scenarios for experimentation
  loadTestScenario(scenario) {
    this.testData = scenario;
    this.refreshVisualization();
  }
}
```

#### Developer Testing UI (Optional)
```html
<!-- Hidden developer panel for testing visualization options -->
<div id="monte-carlo-viz-tester" style="display: none;">
  <h4>Monte Carlo Visualization Tester</h4>
  
  <label>Coloring Method:</label>
  <select id="coloring-method">
    <option value="hsl-three-dimensional">HSL Three-Dimensional</option>
    <option value="border-thickness">Border Thickness</option>
    <option value="brightness-variation">Brightness Variation</option>
  </select>

  <label>Failure Rate Curve:</label>
  <select id="failure-curve">
    <option value="linear">Linear</option>
    <option value="sqrt">Square Root</option>
    <option value="exponential">Exponential</option>
  </select>

  <label>Survival Rate Curve:</label>
  <select id="survival-curve">
    <option value="linear">Linear</option>
    <option value="sqrt">Square Root</option>
    <option value="log">Logarithmic</option>
  </select>

  <label>Delta Curve:</label>
  <select id="delta-curve">
    <option value="linear">Linear</option>
    <option value="sqrt">Square Root</option>
    <option value="log">Logarithmic</option>
  </select>

  <label>Min Saturation:</label>
  <input type="range" id="min-saturation" min="0.1" max="0.5" step="0.05" value="0.2">
  <span id="min-saturation-value">0.2</span>

  <button onclick="tester.loadTestScenario('cliff-failure')">Test: Cliff Failure</button>
  <button onclick="tester.loadTestScenario('gradual-failure')">Test: Gradual Failure</button>
  <button onclick="tester.loadTestScenario('mixed-outcomes')">Test: Mixed Outcomes</button>
</div>
```

#### Implementation Strategy
1. **Start with HSL three-dimensional approach** as baseline
2. **Make all parameters easily configurable** through the config class
3. **Implement live-switching** between different approaches and parameters
4. **Create test scenarios** representing different failure patterns
5. **A/B test with users** to determine optimal default settings

#### The Three-Step Unified Calculation
The coloring for every year (for any number of runs, `n>=1`) is determined by a clear, three-step process. This process uses data from all simulations that were **alive at the start of the current year**.

**Step 1: Calculate Hue (The Risk Profile)**
The base color is determined by the *failure rate* of the current year's outcomes, which correctly accounts for pinch-points.

*   `failureRate = (num_failures * 1.0 + num_pinch_points * 0.5) / total_runs_this_year`
*   This score is mapped to a continuous hue gradient: `hue = 120 * (1 - failureRate)`
*   **Result**: 0% failure -> Green, 50% failure -> Yellow, 100% failure -> Red.

**Step 2: Calculate Lightness (The Severity of Outcomes)**
The intensity of the color is determined by the average *magnitude* of the financial outcomes across **ALL** scenarios (both successes and failures) for the current year. This ensures that large failures produce intense colors.

*   For each run, calculate `delta = |NetIncome - Expenses|`.
*   Calculate `avg_magnitude = average(all_deltas)`.
*   This average magnitude is normalized and mapped to a lightness value (e.g., from 90% down to 30%). A larger average magnitude results in a darker, more intense color.
*   **Result**: A year with small surpluses/deficits will be pale. A year with huge surpluses/deficits will be dark and intense.

**Step 3: Calculate Saturation (The Data's Relevance)**
Finally, the color's vibrancy is determined by the *cumulative survival rate* from the very start of the simulation.

*   `survivalRate = runs_alive_at_start_of_this_year / initial_total_runs`
*   The final color's saturation is set to this rate (with a minimum floor for readability, e.g., 20%).
*   **Result**: If only 30% of simulations survived to this year, the color will be 70% desaturated (grayed out), indicating its low relevance to the overall success probability.

##### Natural Convergence with n=1
This three-step system works for a single run without special code:
1.  **Hue**: The `failureRate` will be exactly 0.0 (Green), 0.5 (Yellow), or 1.0 (Red).
2.  **Lightness**: `avg_magnitude` is simply the absolute delta of that single run.
3.  **Saturation**: `survivalRate` is 100% until the first failure year, after which it becomes 0%, causing subsequent years to be desaturated (gray).

## Future Considerations

### User Preferences
- Potential future feature: Allow users to toggle highlighting on/off
- Color customization for accessibility needs
- Threshold adjustment (currently €1 tolerance)

## Testing Strategy

### Manual Testing
- Test with scenarios that have clear failure points
- Verify break-even detection with various tolerance scenarios
- Ensure post-failure graying works correctly
- Test hover states and visual feedback

### Edge Cases
- Zero income/expenses scenarios
- Very small differences near tolerance threshold
- Simulations with no failures (all positive)
- Single-year simulations

## Success Criteria

1. **Visual Clarity**: Users can immediately identify financial stress points
2. **Accurate Detection**: Proper classification of failure/pinch-point/positive scenarios
3. **Performance**: No noticeable impact on simulation speed
4. **Compatibility**: Works with existing simulator functionality
5. **User Experience**: Intuitive color scheme and hover interactions 