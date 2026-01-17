const TestPerCountryPensionContribs = {
  name: "Per-Country Pension Contributions",
  description: "Validates pension contributions use residence country rates and skip state-only countries",
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 70,
      StartCountry: 'ie',
      retirementAge: 65,
      initialSavings: 0,
      initialPension: 0,
      emergencyStash: 0,
      inflation: 0.02,
      growthRatePension: 0.05,
      growthDevPension: 0,
      simulation_mode: 'single',
      economyMode: 'deterministic',
      pensionContributionsByCountry: {
        ie: { p1Pct: 1, p2Pct: 0, capped: 'No' }, // 100% of max band
        ar: { p1Pct: 0, p2Pct: 0, capped: 'No' } // State-only, should be skipped
      }
    },
    events: [
      { type: 'SI', id: 'salary_ie', name: 'IE Salary', amount: 50000, fromAge: 30, toAge: 39, currency: 'EUR', linkedCountry: 'ie', match: 0.06 },
      { type: 'MV-AR', id: 'move_ar', name: 'Move to AR', amount: 0, fromAge: 40, currency: 'ARS', linkedCountry: 'ar' },
      { type: 'SI', id: 'salary_ar', name: 'AR Salary', amount: 1000000, fromAge: 40, toAge: 49, currency: 'ARS', linkedCountry: 'ar', match: 0 },
      { type: 'MV-IE', id: 'move_ie', name: 'Return to IE', amount: 0, fromAge: 50, currency: 'EUR', linkedCountry: 'ie' },
      { type: 'SI', id: 'salary_ie2', name: 'IE Salary 2', amount: 60000, fromAge: 50, toAge: 64, currency: 'EUR', linkedCountry: 'ie', match: 0.06 }
    ]
  },
  assertions: [
    {
      type: 'comparison',
      target: 'age',
      age: 30,
      field: 'pensionContribution',
      expected: {
        operator: '>',
        value: 5000
      }
    },
    {
      type: 'comparison',
      target: 'age',
      age: 30,
      field: 'pensionContribution',
      expected: {
        operator: '<',
        value: 12000
      }
    },
    {
      type: 'exact_value',
      target: 'age',
      age: 40,
      field: 'pensionContribution',
      expected: 0,
      tolerance: 10
    },
    {
      type: 'comparison',
      target: 'age',
      age: 50,
      field: 'pensionContribution',
      expected: {
        operator: '>',
        value: 20000
      }
    },
    {
      type: 'comparison',
      target: 'age',
      age: 50,
      field: 'pensionContribution',
      expected: {
        operator: '<',
        value: 30000
      }
    }
  ]
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestPerCountryPensionContribs;
}
