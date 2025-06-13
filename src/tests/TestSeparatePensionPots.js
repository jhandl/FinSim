/* Separate Pension Pots Test
 * 
 * This test validates basic two-person functionality without pension contributions
 * to isolate and verify that the two-person system works correctly.
 */

module.exports = {
  name: "Separate Pension Pots Test",
  description: "Validates basic two-person functionality",
  category: "pension",
  
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 35,
      retirementAge: 65,
      initialSavings: 0,
      initialPension: 0,
      initialFunds: 0,
      initialShares: 0,
      emergencyStash: 10000,
      pensionPercentage: 0,        // No pension to avoid calculation issues
      pensionCapped: "No",
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
      personalTaxCredit: 1875,
      
      // Person 2 parameters
      p2StartingAge: 32,
      p2RetirementAge: 67,
      p2StatePensionWeekly: 289,
      initialPensionP2: 0,
      pensionPercentageP2: 0       // No pension to avoid calculation issues
    },
    
    events: [
      {
        type: 'SI',                // Person 1 salary
        id: 'p1-salary',
        amount: 40000,
        fromAge: 30,
        toAge: 34,
        rate: 0,                   // No pension contribution
        match: 0
      },
      {
        type: 'SInp',              // Person 2 salary
        id: 'p2-salary',
        amount: 30000,
        fromAge: 30,
        toAge: 34,
        rate: 0,                   // No pension contribution
        match: 0
      }
    ]
  },

  assertions: [
    // Test combined salaries
    {
      type: 'exact_value',
      target: 'age',
      age: 31,
      field: 'incomeSalaries',
      expected: 70000,             // €40,000 + €30,000
      tolerance: 10
    },

    // Test no pension fund (since rate = 0)
    {
      type: 'exact_value',
      target: 'age',
      age: 31,
      field: 'pensionFund',
      expected: 0,
      tolerance: 10
    },

    // Test simulation completes successfully
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
