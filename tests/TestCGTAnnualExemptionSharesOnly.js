// Validates that CGT annual exemption applies to shares gains and reduces CGT to zero

module.exports = {
  name: "CGT Annual Exemption - Shares Only",
  description: "With 10% gain on €10,000 shares and no other income, CGT should be 0 due to €1,270 annual exemption.",
  category: "tax",
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 31,
      initialSavings: 0,
      emergencyStash: 0,
      retirementAge: 65,
      // Assets
      initialFunds: 0,
      initialShares: 10000,
      growthRateFunds: 0.0, growthDevFunds: 0.0,
      growthRateShares: 0.10, growthDevShares: 0.0,
      growthRatePension: 0.0, growthDevPension: 0.0,
      // Allocations/priorities – force selling shares first
      FundsAllocation: 0.0,
      SharesAllocation: 0.0,
      priorityCash: 4,
      priorityPension: 4,
      priorityFunds: 4,
      priorityShares: 1,
      // Other
      inflation: 0.0,
      personalTaxCredit: 1875,
      statePensionWeekly: 289,
      StartCountry: 'ie'
    },
    events: [
      { type: 'E', id: 'bigExpense', amount: 11000, fromAge: 30, toAge: 30, rate: 0, match: 0 }
    ]
  },
  assertions: [
    { type: 'exact_value', target: 'age', age: 30, field: 'cgt', expected: 0, tolerance: 1 },
    // Ensure shares were liquidated (principal + 10% gain ≈ 11,000 sold and cashflow recorded)
    // Note: TestFramework assertions read raw dataSheet keys (lowercase), not UI-mapped keys
    { type: 'comparison', target: 'age', age: 30, field: 'incomeSharesRent', expected: { operator: '>=', value: 10000 } }
  ]
};



