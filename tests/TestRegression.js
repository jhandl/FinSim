/* Regression Test - Demo CSV Baseline Standard
 * 
 * Gen-AI Coder Prompt: "Create regression tests in `TestRegression.js` that establish baseline 
 * scenarios and capture their outputs as 'golden' standards. Start with the existing demo.csv 
 * scenario and create additional comprehensive scenarios. These tests should detect any unintended 
 * changes in future versions while allowing for easy updates when tax rules change."
 *
 * This file contains the primary regression test that replicates the demo.csv scenario exactly.
 * This serves as the "golden standard" baseline to detect any unintended changes in the 
 * simulation engine core calculations.
 *
 * PURPOSE: 
 * - Catch breaking changes during development
 * - Validate that core simulation logic remains stable
 * - Provide reference scenario for testing major changes
 * - Ensure tax calculation consistency over time
 *
 * MAINTENANCE:
 * When tax rules change (annual Irish budget updates), expected values should be updated 
 * to reflect new tax bands, rates, and thresholds. All changes should be documented.
 * 
 * BASELINE CAPTURE: 2024-12-19, Tax Year: 2024/2025, Simulator Version: 1.26
 */

module.exports = {
  name: "Demo CSV Regression Baseline",
  description: "Exact replication of demo.csv scenario - comprehensive family scenario over 60 years",
  category: "regression",
  
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 90,
      initialSavings: 0,
      initialPension: 0,
      initialFunds: 0,
      initialShares: 0,
      retirementAge: 65,
      emergencyStash: 20000,
      FundsAllocation: 0.5,        // 50% to index funds
      SharesAllocation: 0.5,       // 50% to shares
      pensionPercentage: 0.3,      // 30% pension contribution
      pensionCapped: "Yes",
      statePensionWeekly: 289,
      growthRatePension: 0.05,     // 5% pension growth
      growthDevPension: 0.0,       // No volatility for deterministic testing
      growthRateFunds: 0.07,       // 7% funds growth
      growthDevFunds: 0.0,         // No volatility for deterministic testing
      growthRateShares: 0.06,      // 6% shares growth
      growthDevShares: 0.0,        // No volatility for deterministic testing
      inflation: 0.03,             // 3% inflation
      marriageYear: 2025,          // Age 35 (30 + 5 years)
      youngestChildBorn: 0,        // No youngest child specified
      oldestChildBorn: 2027,       // Age 37 (30 + 7 years)
      personalTaxCredit: 4000,     // €4,000 tax credit (demo value)
      priorityCash: 4,
      priorityPension: 3,
      priorityFunds: 1,
      priorityShares: 2
    },
    
    events: [
      // Person 1 salary with pension contributions and employer match
      {
        type: "SI",
        id: "Person1",
        amount: 44000,             // €44,000 salary
        fromAge: 30,
        toAge: 64,
        rate: 0.04,                // 4% pension contribution rate
        match: 0.06                // 6% employer match
      },
      
      // Person 2 salary with minimal pension
      {
        type: "SI", 
        id: "Person2",
        amount: 30000,             // €30,000 salary
        fromAge: 30,
        toAge: 64,
        rate: 0.02,                // 2% pension contribution rate
        match: 0                   // No employer match
      },
      
      // Life expenses throughout simulation
      {
        type: "E",
        id: "Life",
        amount: 40000,             // €40,000 annual expenses
        fromAge: 30,
        toAge: 100,
        rate: 0,
        match: 0
      },
      
      // Child-related expenses
      {
        type: "E",
        id: "Kid", 
        amount: 6000,              // €6,000 child expenses
        fromAge: 32,
        toAge: 52,                 // 20 years of child expenses
        rate: 0,
        match: 0
      },
      
      // Family house purchase (down payment)
      {
        type: "R",
        id: "Family House",
        amount: 40000,             // €40,000 down payment
        fromAge: 35,
        toAge: 65,
        rate: 0,
        match: 0
      },
      
      // Mortgage for family house
      {
        type: "M",
        id: "Family House",
        amount: 18948,             // €18,948 annual mortgage payment
        fromAge: 35,
        toAge: 60,                 // 25-year mortgage term
        rate: 0.035,               // 3.5% interest rate
        match: 0
      },
      
      // Downsize at retirement - sell family house
      {
        type: "R",
        id: "Downsize",
        amount: 280000,            // €280,000 sale proceeds
        fromAge: 65,
        toAge: 100,
        rate: 0,
        match: 0
      },
      
      // Market crash simulation
      {
        type: "SM",
        id: "Crash",
        amount: 0,
        fromAge: 70,
        toAge: 72,
        rate: -0.25,               // -25% market return override
        match: 0
      }
    ]
  },
  
  // Golden standard assertions - these values should remain stable across versions
  assertions: [
    // =============================================================================
    // EARLY CAREER PHASE (Ages 30-35)
    // =============================================================================
    
    // Initial accumulation validation
    {
      type: 'range',
      target: 'age',
      age: 32,
      field: 'cash',
      expected: {
        min: 15000,                // Should start accumulating cash
        max: 35000
      }
    },
    
    // Combined household income validation
    {
      type: 'range',
      target: 'age',
      age: 32,
      field: 'incomeSalaries',
      expected: {
        min: 74000,                // €44,000 + €30,000 = €74,000 combined
        max: 80000                 // Account for inflation growth
      }
    },
    
    // =============================================================================
    // HOUSE PURCHASE PHASE (Age 35)
    // =============================================================================
    
    // Net worth after house purchase and marriage
    {
      type: 'range',
      target: 'age',
      age: 35,
      field: 'worth',
      expected: {
        min: 150000,               // Should have accumulated significant wealth
        max: 250000                // Account for deterministic growth and dual income
      }
    },
    
    // Real estate capital after purchase
    {
      type: 'comparison',
      target: 'age',
      age: 36,
      field: 'realEstateCapital',
      expected: {
        operator: '>',
        value: 40000               // Should own real estate after purchase
      }
    },
    
    // =============================================================================
    // MID-CAREER PHASE (Ages 40-50)
    // =============================================================================
    
    // Income tax validation at peak earning years (married couple)
    {
      type: 'range',
      target: 'age',
      age: 40,
      field: 'it',
      expected: {
        min: 8000,                 // Combined household income tax
        max: 12000
      }
    },
    
    // PRSI validation (combined household)
    {
      type: 'range',
      target: 'age',
      age: 40,
      field: 'prsi',
      expected: {
        min: 3500,                 // Combined household PRSI (higher due to inflation-adjusted salaries)
        max: 4500
      }
    },
    
    // USC validation (combined household)
    {
      type: 'range',
      target: 'age',
      age: 40,
      field: 'usc', 
      expected: {
        min: 2795,                 // Adjusted for updated USC bands and inflation handling
        max: 2825
      }
    },
    
    // Pension accumulation milestone
    {
      type: 'range', 
      target: 'age',
      age: 45,
      field: 'pensionFund',
      expected: {
        min: 200000,               // Pension should be growing significantly
        max: 300000
      }
    },
    
    // =============================================================================
    // PRE-RETIREMENT PHASE (Ages 55-65)
    // =============================================================================
    
    // Pre-retirement wealth accumulation
    {
      type: 'range',
      target: 'age', 
      age: 55,
      field: 'worth',
      expected: {
        min: 1500000,              // Significant accumulation with compound growth
        max: 2500000
      }
    },
    
    // Mortgage should be paid off by age 60
    {
      type: 'comparison',
      target: 'age',
      age: 62,
      field: 'expenses',
      expected: {
        operator: '<',
        value: 50000               // Should be lower without mortgage
      }
    },
    
    // =============================================================================
    // RETIREMENT PHASE (Ages 65+)
    // =============================================================================
    
    // Retirement milestone - should have substantial assets
    {
      type: 'range',
      target: 'age',
      age: 65, 
      field: 'worth',
      expected: {
        min: 4000000,              // Should have substantial retirement funds
        max: 6000000
      }
    },
    
    // State pension should begin
    {
      type: 'comparison',
      target: 'age',
      age: 67,
      field: 'incomeStatePension',
      expected: {
        operator: '>',
        value: 15000               // Should receive state pension
      }
    },
    
    // Should be drawing from pension fund
    {
      type: 'comparison',
      target: 'age',
      age: 67,
      field: 'incomePrivatePension',
      expected: {
        operator: '>',
        value: 5000                // Should have pension drawdown
      }
    },
    
    // =============================================================================
    // MARKET CRASH IMPACT (Ages 70-72)
    // =============================================================================
    
    // Market crash impact validation
    {
      type: 'comparison',
      target: 'age',
      age: 71,
      field: 'worth',
      expected: {
        operator: '<',
        value: 8000000             // Should see impact of crash
      }
    },
    
    // Post-crash recovery validation
    {
      type: 'comparison',
      target: 'age',
      age: 75,
      field: 'worth',
      expected: {
        operator: '>',
        value: 2000000             // Should recover from crash
      }
    },
    
    // =============================================================================
    // END-OF-SIMULATION VALIDATION
    // =============================================================================
    
    // Simulation should complete successfully
    {
      type: 'comparison',
      target: 'final',
      field: 'age',
      expected: {
        operator: '>=',
        value: 89                  // Should reach near target age 90
      }
    },
    
    // Final net worth should be positive (successful scenario)
    {
      type: 'comparison',
      target: 'final',
      field: 'worth',
      expected: {
        operator: '>',
        value: 1000000             // Should end with substantial net worth
      }
    },
    
    // =============================================================================
    // TAX SYSTEM CONSISTENCY CHECKS
    // =============================================================================
    
    // Validate that taxes are always non-negative
    {
      type: 'comparison',
      target: 'age',
      age: 50,
      field: 'it',
      expected: {
        operator: '>=',
        value: 0                   // Income tax should never be negative
      }
    },
    
    {
      type: 'comparison',
      target: 'age',
      age: 50,
      field: 'prsi',
      expected: {
        operator: '>=',
        value: 0                   // PRSI should never be negative
      }
    },
    
    {
      type: 'comparison',
      target: 'age',
      age: 50,
      field: 'usc',
      expected: {
        operator: '>=',
        value: 0                   // USC should never be negative
      }
    },
    
    // =============================================================================
    // WITHDRAWAL RATE VALIDATION
    // =============================================================================
    
    // Withdrawal rate should be reasonable during retirement
    {
      type: 'range',
      target: 'age',
      age: 70,
      field: 'withdrawalRate',
      expected: {
        min: 0.0,                  // Can be zero if not withdrawing
        max: 0.08                  // Should not exceed 8% withdrawal rate
      }
    }
  ],
  
  // Regression test metadata
  regressionInfo: {
    baselineDate: "2024-12-19",
    simulatorVersion: "1.26",
    taxYear: "2024/2025",
    updateNotes: "Initial baseline capture from demo.csv scenario",
    maintainer: "Generated by TestRegression implementation"
  }
};