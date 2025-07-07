module.exports = {
  name: "Explainability and Tracing",
  description: "Validates that the new tracing mechanism can explain where numbers come from",
  category: "explainability",
  
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 35,
      initialSavings: 0,
      initialPension: 0,
      initialFunds: 0,
      initialShares: 0,
      retirementAge: 65,
      emergencyStash: 10000,
      pensionPercentage: 0.10,
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
      personalTaxCredit: 1875
    },
    
    events: [
      {
        type: 'SI',
        id: 'test-salary',
        amount: 50000,
        fromAge: 30,
        toAge: 34,
        rate: 0,
        match: 0
      }
    ]
  },

  assertions: [
    {
      type: 'exact_value',
      target: 'age',
      age: 31,
      field: 'traces.it',
      expected: "€6672 (100%) from income 'Income Tax'",
      tolerance: 0
    },
    {
        type: 'exact_value',
        target: 'age',
        age: 31,
        field: 'traces.pensionContribution',
        expected: "€1000 (100%) from salary 'test-salary'",
        tolerance: 0
    }
  ]
};