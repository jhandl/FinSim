/* Monte Carlo High Volatility Test
 * 
 * This test validates the statistical behavior of high volatility (25% std dev) Monte Carlo simulation.
 * High volatility triggers Monte Carlo simulation (5000 runs) and demonstrates:
 * 1. Run-to-run variability - Results vary €500k-€523k between test executions
 * 2. Statistical range - Results cluster around deterministic €503k but with variation
 * 3. No extreme outliers - Averaging across 5000 runs prevents extreme values
 * 
 * Key insight: Monte Carlo results have inherent variability even with 5000 runs,
 * which is the statistical behavior we need to test for, not precise values.
 */

const path = require('path');
const TestUtilsPath = path.join(__dirname, '..', 'core', 'TestUtils.js');
const TestUtils = require(TestUtilsPath);

module.exports = {
  name: "Monte Carlo High Volatility Test",
  description: "Validates Monte Carlo statistical behavior with 25% volatility showing run-to-run variability around deterministic baseline across 5000 runs",
  category: "monte_carlo",
  
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 50,              // 20-year test period for clear volatility effects
      retirementAge: 65,
      initialSavings: 10000,      // Small emergency fund
      initialPension: 0,
      initialFunds: 0,
      initialShares: 100000,      // €100k starting investment in volatile shares
      emergencyStash: 10000,
      FundsAllocation: 0.0,       // Focus purely on shares
      SharesAllocation: 1.0,      // 100% to shares for clean test
      pensionPercentage: 0,       // No pension contributions
      pensionCapped: false,
      growthRatePension: 0.05,
      growthDevPension: 0.0,      // No pension volatility
      growthRateFunds: 0.07,
      growthDevFunds: 0.0,        // No funds volatility  
      growthRateShares: 0.08,     // 8% expected return
      growthDevShares: 0.25,      // 25% HIGH volatility - triggers Monte Carlo
      inflation: 0.025,
      marriageYear: null,
      youngestChildBorn: null,
      oldestChildBorn: null,
      personalTaxCredit: TestUtils.IRISH_TAX_RATES.TAX_CREDITS.PERSONAL_SINGLE,
      statePensionWeekly: TestUtils.IRISH_TAX_RATES.STATE_PENSION.WEEKLY_RATE,
      priorityCash: 1,
      priorityPension: 4,
      priorityFunds: 2,
      priorityShares: 3
    },
    
    events: []  // Pure investment growth to isolate volatility effects
  },

  assertions: [
    // Test 1: Monte Carlo results should be in reasonable range around deterministic €503k
    // Observed variation: €500k to €523k across different runs
    {
      type: 'range',
      target: 'final',
      field: 'sharesCapital',
      expected: {
        min: 480000,              // Allow for Monte Carlo variation below deterministic
        max: 550000               // Allow for Monte Carlo variation above deterministic
      }
    },

    // Test 2: Results should still show substantial growth from initial €100k
    {
      type: 'comparison',
      target: 'final',
      field: 'sharesCapital',
      expected: {
        operator: '>',
        value: 400000             // Much higher than initial €100k investment
      }
    },

    // Test 3: Statistical averaging - no extreme outliers due to Monte Carlo averaging
    {
      type: 'comparison',
      target: 'final',
      field: 'sharesCapital',
      expected: {
        operator: '<',
        value: 600000             // No extreme high outliers with averaging across 5000 runs
      }
    },

    // Test 4: No extreme downside either - averaging protects against worst cases
    {
      type: 'comparison',
      target: 'final',
      field: 'sharesCapital',
      expected: {
        operator: '>',
        value: 400000             // Averaging prevents extreme low outliers
      }
    },

    // Test 5: Cash should remain stable (no income/expenses to change it)
    {
      type: 'range',
      target: 'final',
      field: 'cash',
      expected: {
        min: 9500,                // Should be close to initial €10k
        max: 10500
      }
    },

    // Test 6: Simulation completes successfully across Monte Carlo runs
    {
      type: 'exact_value',
      target: 'final',
      field: 'age',
      expected: 50,
      tolerance: 0
    },

    // Test 7: Monte Carlo result should be reasonably close to expected range
    // Based on actual result of €496k, test that it's in a realistic range
    {
      type: 'comparison',
      target: 'final',
      field: 'sharesCapital',
      expected: {
        operator: '>',
        value: 450000             // Should be substantially higher than initial €100k
      }
    },

    // Test 8: Net worth should reflect share value plus cash
    {
      type: 'range',
      target: 'final',
      field: 'worth',
      expected: {
        min: 490000,              // Cash (~€10k) + shares (€480k-€550k range)
        max: 560000
      }
    },

    // Test 9: No other asset activity (isolation test)
    {
      type: 'exact_value',
      target: 'final',
      field: 'indexFundsCapital',
      expected: 0,
      tolerance: 10
    },

    {
      type: 'exact_value',
      target: 'final',
      field: 'pensionFund',
      expected: 0,
      tolerance: 10
    },

    // Test 10: Validate Monte Carlo produces reasonable results
    // Multiple runs show €500k-€523k range, demonstrating run-to-run variability
    {
      type: 'comparison',
      target: 'final',
      field: 'sharesCapital',
      expected: {
        operator: '<',
        value: 600000             // Upper bound - no extreme outliers due to averaging
      }
    }
  ]
}; 