/* Monte Carlo Portfolio Volatility Test
 * 
 * This file implements step 7 in Phase 3 of the test plan:
 * "Implement Monte Carlo simulation tests in `TestMonteCarloValidation.js` that validate 
 * statistical outcomes over multiple runs. Test scenarios with different volatility settings 
 * and verify that results fall within expected statistical ranges."
 *
 * This specific test validates portfolio returns with moderate volatility (18% standard deviation)
 * across multiple Monte Carlo runs to ensure statistical properties are maintained.
 * The config file sets simulationRuns to 5000, which will be used automatically when volatility > 0.
 */

// Import test utilities
const path = require('path');
const TestUtilsPath = path.join(__dirname, '..', 'core', 'TestUtils.js');
const TestUtils = require(TestUtilsPath);

module.exports = {
  name: "Monte Carlo Portfolio Volatility Validation",
  description: "Validates that index fund portfolio with 18% volatility produces statistically valid distributions over Monte Carlo runs with 5000 simulations",
  category: "monte_carlo",
  
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 40,              // Shorter timeframe for faster test execution
      retirementAge: 65,
      initialSavings: 0,
      initialPension: 0,
      initialFunds: 100000,       // €100k starting in index funds
      initialShares: 0,
      emergencyStash: 10000,
      FundsAllocation: 1.0,       // 100% allocation to funds for focused test
      SharesAllocation: 0.0,
      pensionPercentage: 0,       // No pension to isolate fund growth
      pensionCapped: false,
      growthRatePension: 0.05,
      growthDevPension: 0.0,      // No pension volatility
      growthRateFunds: 0.07,      // 7% expected return
      growthDevFunds: 0.18,       // 18% volatility - this triggers Monte Carlo with 5000 runs
      growthRateShares: 0.08,
      growthDevShares: 0.0,       // No shares volatility
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
    
    events: []  // Pure investment growth scenario - no income or expenses
  },

  assertions: [
    // Test 1: Final fund value should be within reasonable range for statistical mean
    // With 7% growth over 10 years: €100k * (1.07)^10 ≈ €196,715
    // With Monte Carlo averaging and 18% volatility, expect some reduction from ideal
    {
      type: 'range',
      target: 'final',
      field: 'indexFundsCapital',
      expected: {
        min: 150000,              // Allow for volatility impact
        max: 220000               // Upper bound for good outcomes
      }
    },

    // Test 2: Net worth should be positive (Monte Carlo averaging should prevent total failures)
    {
      type: 'comparison',
      target: 'final', 
      field: 'worth',
      expected: {
        operator: '>',
        value: 150000             // Should be substantial with averaging
      }
    },

    // Test 3: Final cash should be close to emergency stash
    // (Most growth should be in index funds, cash shouldn't grow much)
    {
      type: 'range',
      target: 'final',
      field: 'cash',
      expected: {
        min: 9000,                // Close to initial emergency stash
        max: 12000
      }
    },

    // Test 4: Index funds should be the dominant asset
    {
      type: 'comparison',
      target: 'final',
      field: 'indexFundsCapital',
      expected: {
        operator: '>',
        value: 140000             // Significantly grown from initial €100k with volatility
      }
    },

    // Test 5: Simulation should complete successfully
    {
      type: 'exact_value',
      target: 'final',
      field: 'age',
      expected: 40,               // Should reach target age
      tolerance: 0
    },

    // Test 6: No pension contributions (isolation test)
    {
      type: 'exact_value',
      target: 'final',
      field: 'pensionContribution',
      expected: 0,
      tolerance: 1
    },

    // Test 7: No salary income (pure investment test)
    {
      type: 'exact_value',
      target: 'final',
      field: 'incomeSalaries',
      expected: 0,
      tolerance: 1
    },

    // Test 8: Test reasonable volatility impact - final worth should not be extreme
    // With Monte Carlo averaging, results should be more stable
    {
      type: 'range',
      target: 'final',
      field: 'worth',
      expected: {
        min: 160000,              // Reasonable lower bound with averaging and volatility
        max: 230000               // Reasonable upper bound with averaging
      }
    },

    // Test 9: Validate that sufficient growth occurred (above inflation)
    // Even with volatility, 10 years of 7% nominal growth should outpace 2.5% inflation
    {
      type: 'comparison',
      target: 'final',
      field: 'indexFundsCapital',
      expected: {
        operator: '>',
        value: 128000             // Initial €100k adjusted for 10 years of 2.5% inflation ≈ €128k
      }
    },

    // Test 10: Verify statistical stability - no extreme outlier results due to averaging
    {
      type: 'comparison',
      target: 'final',
      field: 'indexFundsCapital',
      expected: {
        operator: '<',
        value: 400000             // Upper bound to ensure no extreme outliers with averaging
      }
    }
  ]
}; 