// Debug test to understand actual simulator output
const TestDebugRetirement = {
  name: "Debug Retirement Output",
  description: "Debug test to see actual simulator field names and values",
  scenario: {
    parameters: {
      startingAge: 64,
      targetAge: 67,
      retirementAge: 65,
      pensionLumpSumRate: 0.25,
      pensionDrawdownRate: 0.04,
      statePensionAge: 66,
      statePensionAmount: 15028,
      pensionGrowthRate: 0,
      initialSavings: 50000,      // Initial cash
      initialPension: 500000      // Initial pension fund
    },
    events: [
      {
        type: "SI",
        id: "finalSalary",
        amount: 80000,
        fromAge: 64,
        toAge: 64,
        rate: 0,
        match: 0
      },
      {
        type: "R",
        id: "retirementEvent",
        amount: 0,
        fromAge: 65,
        toAge: 65,
        rate: 0,
        match: 0
      }
    ]
  },
  assertions: [
    // Just check one simple thing to see the output structure
    {
      type: "exact_value",
      target: "age",
      age: 64,
      field: "incomeSalaries",
      expected: 80000,
      tolerance: 1
    }
  ]
};

// Export the test scenario
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestDebugRetirement;
} 