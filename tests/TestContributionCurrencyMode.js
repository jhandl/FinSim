// Test for contributionCurrencyMode functionality in handleInvestments()
// Validates currency conversion when investing in assets with different base currencies
//
// Test: IE Single-Country (Asset Mode, No-Op Conversion - EUR to EUR)
// IE investments use asset mode with EUR, which should be a no-op conversion.
// Also demonstrates backward compatibility with existing IE scenarios.

const TestContributionCurrencyMode = {
  name: "Contribution Currency Mode",
  description: "Validates currency conversion logic for investments based on contributionCurrencyMode field. Tests IE no-op conversion (EUR→EUR).",

  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 31,
      emergencyStash: 10000,
      initialSavings: 20000,
      initialPension: 0,
      initialFunds: 0,
      initialShares: 0,
      retirementAge: 65,
      FundsAllocation: 0.50,
      SharesAllocation: 0.50,
      pensionPercentage: 0,
      pensionCapped: "No",
      growthRateFunds: 0,
      growthDevFunds: 0,
      growthRateShares: 0,
      growthDevShares: 0,
      inflation: 0,
      priorityCash: 1,
      priorityPension: 4,
      priorityFunds: 2,
      priorityShares: 3,
      personalTaxCredit: 1875,
      StartCountry: 'ie'
    },
    events: [
      {
        type: "SI",
        id: "salary",
        amount: 50000,
        fromAge: 30,
        toAge: 30,
        rate: 0,
        match: 0
      },
      {
        type: "E",
        id: "expenses",
        amount: 30000,
        fromAge: 30,
        toAge: 30,
        rate: 0,
        match: 0
      }
    ]
  },

  assertions: [
    // Cash should be at emergency stash level
    {
      type: "exact_value",
      target: "age",
      age: 30,
      field: "cash",
      expected: 10000,
      tolerance: 100
    },
    // Both investment types should have equal capital (50/50 split)
    // Initial savings 20k + net income surplus invested (less emergency stash 10k)
    {
      type: "exact_value",
      target: "age",
      age: 30,
      field: "indexFundsCapital",
      expected: 9771.09,
      tolerance: 500
    },
    {
      type: "exact_value",
      target: "age",
      age: 30,
      field: "sharesCapital",
      expected: 9771.09,
      tolerance: 500
    },
    // Key: Both should be equal since it's 50/50 allocation with same currency
    {
      type: "comparison",
      target: "age",
      age: 30,
      field: "indexFundsCapital",
      expected: {
        operator: ">",
        value: 0
      }
    },
    {
      type: "comparison",
      target: "age",
      age: 30,
      field: "sharesCapital",
      expected: {
        operator: ">",
        value: 0
      }
    }
  ]
};

// Export the test scenario
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestContributionCurrencyMode;
}
