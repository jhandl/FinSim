// @finsim-test-speed: slow
/* Monte Carlo High Volatility Test
 * 
 * This test validates the statistical behavior of high volatility (25% std dev) Monte Carlo simulation.
 * High volatility triggers Monte Carlo simulation (5000 runs) and demonstrates:
 * 1. Run-to-run variability - Results vary around median baseline
 * 2. Statistical range - Results cluster around median which is lower than deterministic due to volatility
 * 3. No extreme outliers - Median calculation across 5000 runs prevents extreme values
 * 
 * Key insight: Monte Carlo MEDIAN results are lower than mean due to lognormal distribution properties.
 * Median provides more conservative/realistic projections than mean for compound growth with volatility.
 */

const path = require('path');
const TestUtilsPath = path.join(__dirname, '..', 'src', 'core', 'TestUtils.js');
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
      pensionCapped: "No",
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
      priorityShares: 3,
      StartCountry: 'ie'
    },
    
    events: []  // Pure investment growth to isolate volatility effects
  },

  assertions: [
    // Test 1: Monte Carlo median results should be in reasonable range 
    // Median is significantly lower than mean due to lognormal distribution skew
    {
      type: 'range',
      target: 'final',
      field: 'investmentCapitalByKey:shares',
      expected: {
        min: 450000,              // Allow for Monte Carlo median variation (updated based on 21-year period)
        max: 550000               // Median range around deterministic baseline of ~€503k
      }
    },

    // Test 2: Results should still show substantial growth from initial €100k
    {
      type: 'comparison',
      target: 'final',
      field: 'investmentCapitalByKey:shares',
      expected: {
        operator: '>',
        value: 200000             // Significantly higher than initial €100k investment
      }
    },

    // Test 3: Statistical median - no extreme outliers due to Monte Carlo median calculation
    {
      type: 'comparison',
      target: 'final',
      field: 'investmentCapitalByKey:shares',
      expected: {
        operator: '<',
        value: 600000             // No extreme high outliers with median across 5000 runs (updated)
      }
    },

    // Test 4: No extreme downside either - median protects against worst cases
    {
      type: 'comparison',
      target: 'final',
      field: 'investmentCapitalByKey:shares',
      expected: {
        operator: '>',
        value: 400000             // Median prevents extreme low outliers (updated)
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

    // Test 7: Monte Carlo median result should be in realistic range
    // Based on median calculation showing updated results for 21-year period
    {
      type: 'comparison',
      target: 'final',
      field: 'investmentCapitalByKey:shares',
      expected: {
        operator: '>',
        value: 400000             // Should be substantially higher than initial €100k (updated)
      }
    },

    // Test 8: Net worth should reflect share value plus cash
    {
      type: 'range',
      target: 'final',
      field: 'worth',
      expected: {
        min: 460000,              // Cash (~€10k) + shares (€450k-€550k range)
        max: 560000
      }
    },

    // Test 9: No other asset activity (isolation test)
    {
      type: 'exact_value',
      target: 'final',
      field: 'investmentCapitalByKey:indexFunds',
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

    // Test 10: Validate Monte Carlo median produces reasonable results
    // Median provides conservative projections compared to mean
    {
      type: 'comparison',
      target: 'final',
      field: 'investmentCapitalByKey:shares',
      expected: {
        operator: '<',
        value: 600000             // Upper bound - median is more conservative than mean (updated)
      }
    }
  ]
}; 
