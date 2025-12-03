// Validates that Exit Tax on funds ignores annual exemption

module.exports = {
  name: "Exit Tax ignores Annual Exemption (Funds Only)",
  description: "With 10% gain on €10,000 funds and no other income, tax should be charged (~€410) despite annual exemption.",
  category: "tax",
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 31,
      initialSavings: 0,
      emergencyStash: 0,
      retirementAge: 65,
      // Assets
      initialFunds: 10000,
      initialShares: 0,
      growthRateFunds: 0.10, growthDevFunds: 0.0,
      growthRateShares: 0.0, growthDevShares: 0.0,
      growthRatePension: 0.0, growthDevPension: 0.0,
      // Allocations/priorities – force selling funds first
      FundsAllocation: 0.0,
      SharesAllocation: 0.0,
      priorityCash: 4,
      priorityPension: 4,
      priorityFunds: 1,
      priorityShares: 4,
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
    // Expect non-zero capital gains tax due to Exit Tax applying, even though gains are within annual exemption amount
    { type: 'range', target: 'age', age: 30, field: 'cgt', expected: { min: 350, max: 500 } }
  ]
};


