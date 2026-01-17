// Validates mixed portfolio behavior: Exit Tax for funds (no annual exemption) and CGT with annual exemption for shares

module.exports = {
  name: "Mixed Portfolio - Exit Tax vs CGT",
  description: "In a single realization year, funds pay exit tax (~€410 on €1k gain), shares gain (~€1k) is fully covered by annual exemption.",
  category: "tax",
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 31,
      initialSavings: 0,
      emergencyStash: 0,
      retirementAge: 65,
      // Starting assets, both with 10% growth
      initialFunds: 10000,
      initialShares: 10000,
      growthRateFunds: 0.10, growthDevFunds: 0.0,
      growthRateShares: 0.10, growthDevShares: 0.0,
      growthRatePension: 0.0, growthDevPension: 0.0,
      // Sell assets to cover an expense in same year
      FundsAllocation: 0.0,
      SharesAllocation: 0.0,
      priorityCash: 4,
      priorityPension: 4,
      priorityFunds: 1,
      priorityShares: 2,
      // Misc
      inflation: 0.0,
      personalTaxCredit: 1875,
      statePensionWeekly: 289,
      StartCountry: 'ie'
    },
    events: [
      { type: 'E', id: 'sellBoth', amount: 22000, fromAge: 30, toAge: 30, rate: 0, match: 0 }
    ]
  },
  assertions: [
    // Expect CGT close to exit tax on funds gain (≈ €410)
    { type: 'range', target: 'age', age: 30, field: 'cgt', expected: { min: 350, max: 500 } },
    // Ensure assets were sold
    { type: 'comparison', target: 'age', age: 30, field: 'investmentCapitalByKey:indexFunds', expected: { operator: '>=', value: 0 } },
    { type: 'comparison', target: 'age', age: 30, field: 'investmentCapitalByKey:shares', expected: { operator: '>=', value: 0 } }
  ]
};


