/* Scenario Versioning Test
 * 
 * This test validates basic single-person functionality using the current 
 * scenario format to ensure compatibility.
 */

module.exports = {
  name: "Scenario Versioning Test",
  description: "Validates basic single-person simulation with current scenario format",
  category: "validation",
  
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 35,
      initialSavings: 0,           // Start simple like BasicTaxCalculation
      initialPension: 0,
      initialFunds: 0,
      initialShares: 0,
      retirementAge: 65,
      emergencyStash: 10000,
      pensionPercentage: 0,        // No pension for simplicity
      pensionCapped: false,
      statePensionWeekly: 289,
      growthRatePension: 0.05,
      growthDevPension: 0.0,
      growthRateFunds: 0.07,
      growthDevFunds: 0.0,
      growthRateShares: 0.08,
      growthDevShares: 0.0,
      inflation: 0.02,
      FundsAllocation: 0,
      SharesAllocation: 0,
      priorityCash: 1,
      priorityPension: 4,
      priorityFunds: 2,
      priorityShares: 3,
      marriageYear: null,
      youngestChildBorn: null,
      oldestChildBorn: null,
      personalTaxCredit: 1875      // Same as BasicTaxCalculation
    },
    
    events: [
      {
        type: 'SI',                // Single person salary
        id: 'test-salary',
        amount: 40000,             // €40,000 annual salary
        fromAge: 30,
        toAge: 34,                 // Same pattern as BasicTaxCalculation
        rate: 0,                   // No pension contribution
        match: 0
      }
    ]
  },

  assertions: [
    // Test that salary is recorded correctly
    {
      type: 'exact_value',
      target: 'age',
      age: 31,
      field: 'incomeSalaries',
      expected: 40000,
      tolerance: 10
    },

    // Test that no pension fund accumulates (since rate = 0)
    {
      type: 'exact_value',
      target: 'age',
      age: 31,
      field: 'pensionFund',
      expected: 0,
      tolerance: 10
    },

    // Test simulation completes
    {
      type: 'comparison',
      target: 'final',
      field: 'age',
      expected: {
        operator: '>=',
        value: 34
      }
    }
  ]
};
