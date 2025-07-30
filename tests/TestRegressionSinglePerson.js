/* Regression Test - Single Person Career Baseline
 * 
 * This file establishes a stable single-person career progression baseline for regression testing.
 * It validates core simulation behavior for a straightforward single-person scenario without
 * the complexity of marriage, children, or property transactions.
 *
 * PURPOSE:
 * - Validate single person tax calculations remain consistent
 * - Test career progression and pension accumulation logic
 * - Provide simpler baseline for isolating core calculation issues
 * - Verify retirement transition for single individuals
 *
 * BASELINE CAPTURE: 2024-12-19, Tax Year: 2024/2025, Simulator Version: 1.26
 */

const TestUtils = require('../src/core/TestUtils');

module.exports = {
  name: "Single Person Career Regression Baseline",
  description: "Simple single person career progression - stable reference scenario",
  category: "regression",
  
  scenario: {
    parameters: {
      startingAge: 25,
      targetAge: 70,
      retirementAge: 65,
      initialSavings: 5000,         // Young professional starting savings
      initialPension: 0,
      initialFunds: 0,
      initialShares: 0,
      emergencyStash: 20000,
      FundsAllocation: 0.6,         // 60% to index funds
      SharesAllocation: 0.4,        // 40% to shares
      pensionPercentage: 0.8,       // 80% of maximum allowed pension contribution
      pensionCapped: "Yes",
      statePensionWeekly: 289,
      growthRatePension: 0.06,      // 6% pension growth
      growthDevPension: 0.0,        // No volatility for deterministic testing
      growthRateFunds: 0.07,        // 7% index funds growth
      growthDevFunds: 0.0,          // No volatility for deterministic testing
      growthRateShares: 0.08,       // 8% shares growth
      growthDevShares: 0.0,         // No volatility for deterministic testing
      inflation: 0.0,               // No inflation for deterministic testing
      marriageYear: null,           // Single person
      youngestChildBorn: null,
      oldestChildBorn: null,
      personalTaxCredit: 1875,      // Standard single person tax credit
      priorityCash: 1,              // Withdraw from cash first
      priorityPension: 4,           // Withdraw from pension last
      priorityFunds: 2,             // Withdraw from funds second
      priorityShares: 3             // Withdraw from shares third
    },
    
    events: [
      // Single salary throughout career for simplicity
      {
        type: "SI",
        id: "career_salary",
        amount: 50000,              // €50,000 steady salary
        fromAge: 25,
        toAge: 64,
        rate: 0.0,                  // 0% salary growth (compute constant salary)
        match: 0.06                 // 6% employer match
      },
      
      // Stable living expenses throughout career
      {
        type: "E",
        id: "living_expenses",
        amount: 30000,              // €30,000 annual living expenses
        fromAge: 25,
        toAge: 69,
        rate: 0,
        match: 0
      }
    ]
  },
  
  assertions: [
    // =============================================================================
    // EARLY CAREER PHASE (Ages 25-35)
    // =============================================================================
    
    // Career progression validation - steady salary
    {
      type: 'exact_value',
      target: 'age',
      age: 30,
      field: 'incomeSalaries',
      expected: 50000,              // Salary should be €50k
      tolerance: 50
    },
    
    // Early pension accumulation
    {
      type: 'range',
      target: 'age',
      age: 30,
      field: 'pensionFund',
      expected: {
        min: 60000,                 // Updated to reflect actual accumulation
        max: 70000
      }
    },
    
    // Single person tax validation at moderate income
    {
      type: 'range',
      target: 'age',
      age: 30,
      field: 'it',
      expected: {
        min: 4000,                  // Updated for pension contributions reducing taxable income
        max: 6000
      }
    },
    
    // PRSI validation
    {
      type: 'range',
      target: 'age',
      age: 30,
      field: 'prsi',
      expected: {
        min: 1800,                  // PRSI at 4.1% of €50k
        max: 2200
      }
    },
    
    // USC validation
    {
      type: 'range',
      target: 'age',
      age: 30,
      field: 'usc',
      expected: {
        min: 1000,                  // USC on €50k salary
        max: 1400
      }
    },
    
    // =============================================================================
    // MID-CAREER PHASE (Ages 35-50)
    // =============================================================================
    
    // Mid-career salary validation
    {
      type: 'exact_value',
      target: 'age',
      age: 40,
      field: 'incomeSalaries',
      expected: 50000,              // €50k steady salary
      tolerance: 50
    },
    
    // Pension accumulation at mid-career
    {
      type: 'range',
      target: 'age',
      age: 45,
      field: 'pensionFund',
      expected: {
        min: 400000,                // Updated to reflect actual mid-career accumulation
        max: 500000
      }
    },
    
    // Income tax at mid-career
    {
      type: 'range',
      target: 'age',
      age: 40,
      field: 'it',
      expected: {
        min: 3500,                  // Updated for increased pension contributions
        max: 5000
      }
    },
    
    // Investment accumulation validation
    {
      type: 'range',
      target: 'age',
      age: 45,
      field: 'indexFundsCapital',
      expected: {
        min: 90000,                 // Updated to actual index fund accumulation
        max: 110000
      }
    },
    
    // =============================================================================
    // SENIOR CAREER PHASE (Ages 50-65)
    // =============================================================================
    
    // Peak earning years validation
    {
      type: 'exact_value',
      target: 'age',
      age: 55,
      field: 'incomeSalaries',
      expected: 50000,              // €50k steady salary
      tolerance: 50
    },
    
    // Pension contributions validation
    {
      type: 'range',
      target: 'age',
      age: 55,
      field: 'pensionContribution',
      expected: {
        min: 13000, // Actual observed value is about 14,000
        max: 15000
      }
    },
    
    // Pre-retirement pension accumulation
    {
      type: 'range',
      target: 'age',
      age: 60,
      field: 'pensionFund',
      expected: {
        min: 1300000,               // Updated to actual pre-retirement accumulation
        max: 1500000
      }
    },
    
    // Tax validation at senior age
    {
      type: 'range',
      target: 'age',
      age: 55,
      field: 'it',
      expected: {
        min: 3000,                  // Updated for pension contributions reducing taxable income
        max: 4500
      }
    },
    
    // =============================================================================
    // RETIREMENT PHASE (Age 65+)
    // =============================================================================
    
    // Retirement readiness validation
    {
      type: 'comparison',
      target: 'age',
      age: 65,
      field: 'worth',
      expected: {
        operator: '>',
        value: 500000               // Should have substantial retirement funds
      }
    },
    
    // Pension drawdown begins
    {
      type: 'comparison',
      target: 'age',
      age: 66,
      field: 'incomePrivatePension',
      expected: {
        operator: '>',
        value: 15000                // Should be drawing from pension
      }
    },
    
    // State pension begins at 66
    {
      type: 'comparison',
      target: 'age',
      age: 67,
      field: 'incomeStatePension',
      expected: {
        operator: '>',
        value: 14000                // Should receive state pension
      }
    },
    
    // Salary income should stop
    {
      type: 'exact_value',
      target: 'age',
      age: 66,
      field: 'incomeSalaries',
      expected: 0,                  // No more salary income
      tolerance: 10
    },
    
    // =============================================================================
    // END-OF-SIMULATION VALIDATION
    // =============================================================================
    
    // Simulation completion
    {
      type: 'comparison',
      target: 'final',
      field: 'age',
      expected: {
        operator: '>=',
        value: 69                   // Should reach target age
      }
    },
    
    // Final net worth validation
    {
      type: 'comparison',
      target: 'final',
      field: 'worth',
      expected: {
        operator: '>',
        value: 300000               // Should maintain wealth in retirement
      }
    },
    
    // =============================================================================
    // TAX EFFICIENCY VALIDATION
    // =============================================================================
    
    // Tax efficiency validation
    {
      type: 'range',
      target: 'age',
      age: 55,
      field: 'netIncome',
      expected: {
        min: 40000,                 // Updated to reflect net income after contributions
        max: 50000
      }
    },
    
    // =============================================================================
    // INVESTMENT BEHAVIOR VALIDATION
    // =============================================================================
    
    // Investment allocation should follow parameters
    {
      type: 'comparison',
      target: 'age',
      age: 50,
      field: 'indexFundsCapital',
      expected: {
        operator: '>',
        value: 0                    // Should have index fund investments
      }
    },
    
    {
      type: 'comparison',
      target: 'age',
      age: 50,
      field: 'sharesCapital',
      expected: {
        operator: '>',
        value: 0                    // Should have shares investments
      }
    },
    
    // Withdrawal rate during retirement should be sustainable
    {
      type: 'range',
      target: 'age',
      age: 68,
      field: 'withdrawalRate',
      expected: {
        min: 0.0,
        max: 0.06                   // Should not exceed 6% withdrawal rate
      }
    }
  ],
  
  // Regression test metadata
  regressionInfo: {
    baselineDate: "2024-12-19",
    simulatorVersion: "1.26",
    taxYear: "2024/2025",
    updateNotes: "Single person career progression baseline for regression testing",
    maintainer: "Generated by TestRegression implementation"
  }
}; 
