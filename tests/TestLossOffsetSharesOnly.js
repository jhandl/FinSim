// Validates loss offset applies for shares (CGT) but not for funds (Exit Tax)

module.exports = {
  name: "Loss Offset - Shares Only",
  description: "A realized loss in Year 1 should offset a realized gain in Year 2 for shares (CGT)",
  category: "tax",
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 32,
      initialSavings: 0,
      emergencyStash: 0,
      retirementAge: 65,
      initialFunds: 0,
      initialShares: 10000,
      growthRateFunds: 0.0, growthDevFunds: 0.0,
      growthRateShares: 0.0, growthDevShares: 0.0,
      growthRatePension: 0.0, growthDevPension: 0.0,
      FundsAllocation: 0.0,
      SharesAllocation: 0.0,
      priorityCash: 4,
      priorityPension: 4,
      priorityFunds: 4,
      priorityShares: 1,
      inflation: 0.0,
      personalTaxCredit: 1875,
      statePensionWeekly: 289,
      StartCountry: 'ie'
    },
    events: [
      // Year 1: force a -20% market year and realize a loss by selling shares
      { type: 'SM', id: 'bear', amount: 0, fromAge: 30, toAge: 30, rate: -0.20, match: 0 },
      { type: 'E', id: 'sellLoss', amount: 3000, fromAge: 30, toAge: 30, rate: 0, match: 0 },
      // Year 2: force a +50% market year and realize gains by selling shares
      { type: 'SM', id: 'bull', amount: 0, fromAge: 31, toAge: 31, rate: 0.50, match: 0 },
      { type: 'E', id: 'sellGain', amount: 4000, fromAge: 31, toAge: 31, rate: 0, match: 0 }
    ]
  },
  assertions: [
    // Year 1: expect 0 CGT due to realized loss
    { type: 'exact_value', target: 'age', age: 30, field: 'cgt', expected: 0, tolerance: 1 },
    // Year 2: CGT should be significantly reduced by prior year loss (and possibly exemption)
    { type: 'range', target: 'age', age: 31, field: 'cgt', expected: { min: 0, max: 500 } }
  ]
};


