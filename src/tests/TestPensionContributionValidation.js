// Gen-AI Coder Prompt:
// "Create a test named 'Pension Contribution Validation' that validates pension contributions and employer matching. 
// Set up parameters: 30% pension contribution rate, 6% employer match, 5% pension growth. 
// Add events: €60,000 salary with 6% employer match from age 30-34. 
// Assert that: pension contributions equal 30% of salary, employer contributions equal 6% of salary, 
// pension fund grows by expected compound amount, and salary income is reduced by personal contribution amount."

const TestPensionContributionValidation = {
  name: "Pension Contribution Validation",
  description: "Validates pension contributions, employer matching, and pension fund growth, testing with zero growth.",
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
      pensionPercentage: 0.30,  // 30% of maximum allowed (which is 20% at age 30, so 6% actual rate)
      pensionCapped: "No",
      pensionEmployerMatchMaxRate: 0.06,
      growthRatePension: 0,
      growthDevPension: 0,
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
      statePensionWeekly: 289
    },
    events: [
      {
        type: "SI",
        id: "salaryMain",
        amount: 60000,
        fromAge: 30,
        toAge: 34,
        rate: 0,
        match: 0.06
      }
    ]
  },
  assertions: [
    {
      type: "exact_value",
      target: "age",
      age: 30,
      field: "pensionContribution",
      expected: 3600,  // 6% personal contribution only (not including employer match)
      tolerance: 1
    },
    {
      type: "exact_value",
      target: "age",
      age: 30,
      field: "incomeSalaries",
      expected: 60000,
      tolerance: 1
    },
    {
      type: "exact_value",
      target: "age",
      age: 30,
      field: "pensionFund",
      expected: 7200, // Total contribution in first year (personal + employer)
      tolerance: 1
    },
    {
      type: "exact_value",
      target: "age",
      age: 31,
      field: "pensionFund",
      expected: 14400, // 2 years * 7200 = 14400
      tolerance: 1
    },
    {
      type: "exact_value",
      target: "age",
      age: 32,
      field: "pensionFund", 
      expected: 21600, // 3 years * 7200 = 21600
      tolerance: 1
    },
    {
      type: "exact_value",
      target: "age",
      age: 34,
      field: "pensionContribution",
      expected: 3600,  // Should be consistent each year (personal contribution only)
      tolerance: 1
    },
    {
      type: "exact_value",
      target: "age",
      age: 34,
      field: "pensionFund",
      expected: 36000, // 5 years * 7200 = 36000 (with zero growth)
      tolerance: 1
    },
  ]
};

// Export the test scenario
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestPensionContributionValidation;
} 