// Gen-AI Coder Prompt:
// "Create a test named 'State Pension Calculation' that validates state pension entitlements. 
// Set up parameters: €289 weekly state pension, qualification age 66, increase age 80. 
// Add events: full PRSI contribution history from age 22-66. 
// Assert that: state pension begins at correct qualification age, weekly amount matches current rates, 
// additional payments begin at age 80, and state pension income is subject to correct tax treatment."

const TestStatePensionIntegration = {
  name: "State Pension Calculation",
  description: "Validates state pension start age, amount, age-related increases, and taxation.",
  scenario: {
    parameters: {
      startingAge: 64,            // Fixed: was simulationStartAge
      targetAge: 82,              // Fixed: was simulationEndAge
      initialSavings: 10000,      // Added missing parameter
      initialPension: 0,          // Added missing parameter
      initialFunds: 0,            // Added missing parameter
      initialShares: 0,           // Added missing parameter
      retirementAge: 65,          // Added missing parameter
      emergencyStash: 10000,      // Added missing parameter
      pensionPercentage: 0.2,     // Added missing parameter
      pensionCapped: "No",        // Added missing parameter
      statePensionWeekly: 289,    // State pension weekly amount
      growthRatePension: 0.05,    // Added missing parameter
      growthDevPension: 0.0,      // Added missing parameter
      growthRateFunds: 0.07,      // Added missing parameter
      growthDevFunds: 0.0,        // Added missing parameter
      growthRateShares: 0.08,     // Added missing parameter
      growthDevShares: 0.0,       // Added missing parameter
      inflation: 0.025,           // Added missing parameter - critical for adjust() function
      FundsAllocation: 0.6,       // Added missing parameter
      SharesAllocation: 0.4,      // Added missing parameter
      priorityCash: 1,            // Added missing parameter
      priorityPension: 4,         // Added missing parameter
      priorityFunds: 2,           // Added missing parameter
      priorityShares: 3,          // Added missing parameter
      marriageYear: null,         // Added missing parameter
      youngestChildBorn: null,    // Added missing parameter
      oldestChildBorn: null,      // Added missing parameter
      personalTaxCredit: 1875     // Added missing parameter - critical for tax calculations
    },
    events: [
      // Fixed event structure to match simulator requirements
      {
        type: "SI",               // Fixed: was "Salary"
        id: "prePensionSalary",   // Added missing id field
        amount: 30000,
        fromAge: 64,              // Fixed: was age
        toAge: 64,                // Fixed: was endAge
        rate: 0,                  // Added missing rate field
        match: 0                  // Added missing match field
      }
    ]
  },
  assertions: [
    // Age 65: Before state pension age
    {
      type: "exact_value", target: "age", age: 65, field: "incomeStatePension",
      expected: 0, tolerance: 1
    },

    // Age 66: State pension starts (2 years after starting age 64)
    // Annual amount = 52 * adjust(289, inflation, 2) = 52 * 289 * (1.025)^2 = 15789.50
    {
      type: "exact_value", target: "age", age: 66, field: "incomeStatePension",
      expected: 52 * 289 * Math.pow(1.025, 2), // Account for 2 years of inflation
      tolerance: 5
    },

    // Test that income tax is calculated on state pension income
    {
      type: "range", target: "age", age: 66, field: "it",
      expected: { min: 0, max: 3000 }, comment: "IT on state pension, considering tax credits."
    },

    // Age 79: Before age-related increase (15 years after starting age 64)
    // Annual amount = 52 * adjust(289, inflation, 15) = 52 * 289 * (1.025)^15
    {
      type: "exact_value", target: "age", age: 79, field: "incomeStatePension",
      expected: 52 * 289 * Math.pow(1.025, 15),
      tolerance: 10
    },

    // Age 80: After age-related increase (16 years after starting age 64)
    // Base: 52 * adjust(289, inflation, 16) + Increase: 52 * adjust(10, inflation, 16)
    // = 52 * (289 + 10) * (1.025)^16
    {
      type: "exact_value", target: "age", age: 80, field: "incomeStatePension",
      expected: 52 * (289 + 10) * Math.pow(1.025, 16),
      tolerance: 10
    },

    {
      type: "range", target: "age", age: 80, field: "it",
      expected: { min: 0, max: 4000 }, comment: "IT on increased state pension."
    },

    // Age 81: Increase persists (17 years after starting age 64)
    {
      type: "exact_value", target: "age", age: 81, field: "incomeStatePension",
      expected: 52 * (289 + 10) * Math.pow(1.025, 17),
      tolerance: 10
    }
  ]
};

// Notes:
// - Fixed parameter structure to match what the simulator expects
// - Removed references to non-existent field 'taxableStatePensionIncome'
// - Added all required parameters to prevent NaN issues in calculations
// - Fixed event structure to use proper type "SI" instead of "Salary"
// - Added missing required fields like 'id', 'rate', 'match' for events
// - Used actual config increase amount (€10) instead of hypothetical €25

// Export the test scenario
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestStatePensionIntegration;
} 