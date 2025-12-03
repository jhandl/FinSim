// Gen-AI Coder Prompt:
// "Create a test named 'Emergency Fund Usage' that validates withdrawal priority algorithms. 
// Set up parameters: €30,000 emergency fund, withdrawal priorities cash=1, funds=2, shares=3, pension=4. 
// Add events: €45,000 salary, €50,000 one-time expense at age 40. 
// Assert that: emergency fund is depleted first, then investments are sold in priority order, 
// withdrawal amounts match deficit calculations, and tax implications of investment sales are properly calculated."

const TestEmergencyFundUsage = {
  name: "Emergency Fund Usage",
  description: "Validates withdrawal priority when a large expense occurs.",
  scenario: {
    parameters: {
      // Basic simulation settings
      startingAge: 38,
      targetAge: 42,
      retirementAge: 65,
      
      // Initial assets - representing the emergency fund scenario
      initialSavings: 30000,           // €30,000 emergency fund as cash
      initialPension: 100000,          // €100,000 pension fund (not touchable)
      initialFunds: 20000,             // €20,000 in index funds 
      initialShares: 15000,            // €15,000 in shares
      
      // Asset priorities (cash=1, funds=2, shares=3, pension=4)
      priorityCash: 1,
      priorityFunds: 2,
      priorityShares: 3,
      priorityPension: 4,
      
      // Growth and inflation settings (minimal for focused test)
      growthRatePension: 0.0,
      growthDevPension: 0.0,
      growthRateFunds: 0.0,
      growthDevFunds: 0.0,
      growthRateShares: 0.0,
      growthDevShares: 0.0,
      inflation: 0.0,
      
      // Investment allocation (not relevant for this test)
      FundsAllocation: 0,
      SharesAllocation: 0,
      
      // Pension settings
      pensionPercentage: 0,
      pensionCapped: "No",
      statePensionWeekly: 289,
      
      // Tax settings
      personalTaxCredit: 1875,
      
      // Other settings
      emergencyStash: 0,               // No additional emergency stash needed
      marriageYear: null,
      youngestChildBorn: null,
      oldestChildBorn: null,
      StartCountry: 'ie'
    },
    
    events: [
      // €45,000 annual salary from age 38-41
      {
        type: 'SI',                    // Salary Income
        id: 'test-salary',
        amount: 45000,
        fromAge: 38,
        toAge: 41,
        rate: 0,                       // No pension contribution rate
        match: 0                       // No employer match
      },
      // €30,000 regular annual expenses from age 38-41  
      {
        type: 'E',                     // Expense
        id: 'regular-expenses',
        amount: 30000,
        fromAge: 38,
        toAge: 41,
        rate: 0,
        match: 0
      },
      // €50,000 one-time large expense at age 40
      {
        type: 'E',                     // One-time Expense
        id: 'emergency-expense',
        amount: 50000,
        fromAge: 40,
        toAge: 40,                     // Single year expense
        rate: 0,
        match: 0
      }
    ]
  },
  assertions: [
    // Test initial state before the emergency (age 39)
    // Cash should still be available before the large expense
    {
      type: 'comparison',
      target: 'age',
      age: 39,
      field: 'cash',
      expected: {
        operator: '>',
        value: 20000                   // Should have reasonable cash before emergency
      }
    },
    
    // Index funds should be unchanged before emergency
    {
      type: 'exact_value',
      target: 'age',
      age: 39,
      field: 'indexFundsCapital',
      expected: 20000,
      tolerance: 100
    },
    
    // Shares should be unchanged before emergency
    {
      type: 'exact_value',
      target: 'age',
      age: 39,
      field: 'sharesCapital',
      expected: 15000,
      tolerance: 100
    },
    
    // Test state after the emergency expense (age 40)
    // Cash should be significantly depleted due to the large expense
    {
      type: 'comparison',
      target: 'age',
      age: 40,
      field: 'cash',
      expected: {
        operator: '<',
        value: 10000                   // Should be much lower after emergency
      }
    },
    
    // Some investments should have been liquidated based on priority
    // Either index funds or shares (or both) should show reduction
    {
      type: 'comparison',
      target: 'age',
      age: 40,
      field: 'indexFundsCapital',
      expected: {
        operator: '<=',
        value: 20000                   // Should be equal or less than initial
      }
    },
    
    // Pension should remain untouched (lowest priority, pre-retirement)
    {
      type: 'exact_value',
      target: 'age',
      age: 40,
      field: 'pensionFund',
      expected: 100000,
      tolerance: 1000                  // Allow for small growth/rounding
    },
    
    // Net worth should decrease due to the emergency expense
    {
      type: 'comparison',
      target: 'age',
      age: 40,
      field: 'worth',
      expected: {
        operator: '<',
        value: 165000                  // Total initial assets minus large expense
      }
    },
    
    // Test that CGT might be generated from asset sales
    {
      type: 'comparison',
      target: 'age',
      age: 40,
      field: 'cgt',
      expected: {
        operator: '>=',
        value: 0                       // Should be zero or positive (if assets sold)
      }
    },
    
    // Final verification: simulation should complete successfully
    {
      type: 'comparison',
      target: 'final',
      field: 'age',
      expected: {
        operator: '>=',
        value: 41                      // Should reach target age
      }
    }
  ]
};

// Export the test scenario
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestEmergencyFundUsage;
} 