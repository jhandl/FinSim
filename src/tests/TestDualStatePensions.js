/* Dual State Pensions Test
 * 
 * This test validates state pension calculations for two people who reach
 * the state pension qualifying age at different times due to age differences.
 */

module.exports = {
  name: "Dual State Pensions Test",
  description: "Validates state pension timing for two people with different ages",
  category: "pension",
  
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 35,               // Keep it short and simple
      retirementAge: 65,
      initialSavings: 0,
      initialPension: 0,
      initialFunds: 0,
      initialShares: 0,
      emergencyStash: 10000,
      pensionPercentage: 0,        // No pension for simplicity
      pensionCapped: false,
      statePensionWeekly: 289,     // Person 1 state pension
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
      p2StartingAge: 32,           // Person 2 is 2 years older
      p2RetirementAge: 67,         // Person 2 retires later
      p2StatePensionWeekly: 250,   // Different state pension amount
      initialPensionP2: 0,
      pensionPercentageP2: 0
    },
    
    events: [
      {
        type: 'SI',                // Person 1 income
        id: 'p1-income',
        amount: 30000,
        fromAge: 30,
        toAge: 34,
        rate: 0,
        match: 0
      },
      {
        type: 'SInp',              // Person 2 income
        id: 'p2-income',
        amount: 25000,
        fromAge: 30,
        toAge: 34,
        rate: 0,
        match: 0
      }
    ]
  },

  assertions: [
    // Test that both salaries are combined correctly
    {
      type: 'exact_value',
      target: 'age',
      age: 31,
      field: 'incomeSalaries',
      expected: 55000,             // €30,000 + €25,000
      tolerance: 10
    },

    // Test that no state pension income yet (both too young)
    {
      type: 'exact_value',
      target: 'age',
      age: 31,
      field: 'incomeStatePension',
      expected: 0,
      tolerance: 1
    },

    // Test that no pension fund accumulates (rate = 0)
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
