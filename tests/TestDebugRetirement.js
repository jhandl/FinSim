// Debug test to understand actual simulator output
const TestDebugRetirement = {
  name: "Debug Retirement Output",
  description: "Debug test to see actual simulator field names and values",
  scenario: {
    parameters: {
      startingAge: 64,
      targetAge: 67,
      retirementAge: 65,
      initialSavings: 50000,      // Initial cash
      initialPension: 500000,     // Initial pension fund
      emergencyStash: 0,
      inflation: 0,
      pensionPercentage: 0,
      pensionCapped: "No",
      growthRatePension: 0,
      growthDevPension: 0,
      StartCountry: 'ie',
      simulation_mode: 'single',
      economy_mode: 'deterministic',
      // State pension is specified as a weekly amount for StartCountry (IE)
      statePensionWeekly: 0,
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
      // No-op marker row for readability; simulator ignores NOP.
      { type: "NOP", id: "retirementEvent", amount: 0, fromAge: 65, toAge: 65, rate: 0, match: 0 }
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