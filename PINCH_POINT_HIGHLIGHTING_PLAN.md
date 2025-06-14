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

#### Unified Deterministic/Monte Carlo System
The Monte Carlo coloring system should gracefully degrade to produce identical results to the deterministic system when there's only one simulation run.

##### Single-Run Behavior Mapping
```javascript
class UnifiedColorCalculator extends MonteCarloColorCalculator {
  calculateRowColor(rowData) {
    const isSingleRun = rowData.runs.length === 1;
    
    if (isSingleRun) {
      return this.calculateDeterministicColor(rowData.runs[0], rowData.cumulativeRuns);
    } else {
      return super.calculateRowColor(rowData);
    }
  }

  calculateDeterministicColor(singleRun, cumulativeRuns) {
    const netIncome = singleRun.netIncome;
    const expenses = singleRun.expenses;
    const tolerance = 1; // €1 tolerance for break-even
    const delta = netIncome - expenses;
    
    // Map deterministic states to Monte Carlo parameters
    let failureRate, hue, isDead;
    
    if (Math.abs(delta) <= tolerance) {
      // Break-even case: Special yellow hue regardless of "failure"
      failureRate = 0.5; // Represents uncertainty/risk
      hue = this.config.hueRange.warning; // 45° yellow
      isDead = false;
    } else if (delta < -tolerance) {
      // Failure case
      failureRate = 1.0;  
      hue = this.config.hueRange.failure; // 0° red
      isDead = true;
    } else {
      // Success case  
      failureRate = 0.0;
      hue = this.config.hueRange.success; // 120° green
      isDead = false;
    }

    // Calculate survival rate (cumulative)
    const totalScenarios = cumulativeRuns.totalStarted;
    const survivingScenarios = cumulativeRuns.stillAlive;
    const survivalRate = survivingScenarios / totalScenarios;
    
    // Calculate lightness from delta magnitude
    const maxDelta = cumulativeRuns.maxDeltaSeen || Math.abs(delta);
    const normalizedDelta = Math.abs(delta) / maxDelta;
    const lightness = this.mapToLightness(normalizedDelta);
    
    // Apply saturation with minimum threshold
    const saturation = Math.max(survivalRate, this.config.minSaturation);
    
    return {
      color: `hsl(${hue}, ${saturation * 100}%, ${lightness}%)`,
      className: this.generateDeterministicClassName(delta, tolerance, survivalRate)
    };
  }

  generateDeterministicClassName(delta, tolerance, survivalRate) {
    if (survivalRate < 0.2) {
      return 'cashflow-post-failure'; // Gray out after major failure
    } else if (Math.abs(delta) <= tolerance) {
      return 'cashflow-pinch-point'; // Break-even
    } else if (delta < -tolerance) {
      return 'cashflow-failure'; // Failure
    } else {
      return 'cashflow-positive'; // Success
    }
  }
}
```

##### Parameter Equivalence
When `runs.length === 1`, the Monte Carlo parameters map to deterministic logic:

| Deterministic State | Failure Rate | Survival Rate | Hue | Saturation | Lightness | Class Name |
|---------------------|--------------|---------------|-----|------------|-----------|------------|
| Success (NetIncome > Expenses + €1) | 0.0 | 1.0 → 0.0* | 120° | 100% → 20%* | Based on Δ | `cashflow-positive` |
| Break-even (|NetIncome - Expenses| ≤ €1) | 0.5 | 1.0 → 0.0* | 45° | 100% → 20%* | Based on Δ | `cashflow-pinch-point` |  
| Failure (NetIncome < Expenses - €1) | 1.0 | 1.0 → 0.0* | 0° | 100% → 20%* | Based on Δ | `cashflow-failure` |
| Post-failure (any state after failure) | N/A | < 0.2 | Any | 20% | Any | `cashflow-post-failure` |

*Survival rate drops from 100% to minimum after first failure, creating the post-failure graying effect.

##### Validation Strategy
```javascript
// Test that single-run Monte Carlo === deterministic output
function validateUnifiedSystem() {
  const testScenarios = [
    { netIncome: 50000, expenses: 40000 }, // Success
    { netIncome: 40000, expenses: 40000 }, // Break-even  
    { netIncome: 35000, expenses: 40000 }, // Failure
  ];

  testScenarios.forEach(scenario => {
    // Run deterministic coloring
    const deterministicResult = deterministicCalculator.calculateColor(scenario);
    
    // Run Monte Carlo coloring with single run
    const monteCarloResult = unifiedCalculator.calculateRowColor({
      runs: [scenario],
      cumulativeRuns: { totalStarted: 1, stillAlive: 1, maxDeltaSeen: 10000 }
    });
    
    // Results should be identical
    assert(deterministicResult.color === monteCarloResult.color);
    assert(deterministicResult.className === monteCarloResult.className);
  });
}
```

##### Benefits of Unified System
1. **Single codebase**: No need to maintain separate deterministic and Monte Carlo logic
2. **Consistent behavior**: Users see identical colors whether they run 1 simulation or 15
3. **Smooth scaling**: Can gradually increase simulation runs without visual discontinuities  
4. **Easier testing**: Test suite only needs to validate one system
5. **Future-proof**: Any improvements to Monte Carlo coloring automatically benefit deterministic cases

#### Test Scenarios to Create
1. **Cliff Failure**: Most scenarios succeed until age 70, then 80% fail suddenly
2. **Gradual Attrition**: Scenarios fail steadily, 10% per year from age 60-75
3. **Mixed Outcomes**: Complex pattern with recoveries and multiple failure points
4. **High Variance**: Large differences in NetIncome-Expenses deltas between scenarios
5. **Low Variance**: All scenarios perform similarly with small deltas

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