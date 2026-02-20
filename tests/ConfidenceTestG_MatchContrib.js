const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_G-PENSION-MATCH',
  description: 'Verifies employer match contributions are included in pension totals.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 31,
      // Pension contributions are configured via params (not the event's rate field).
      pensionContributionsByCountry: { aa: { p1Pct: 0.05, p2Pct: 0, capped: 'No' } }
    });
    const events = [
      // rate is inflation override; keep it 0 for this test.
      { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, currency: 'AAA', rate: 0, match: 0.05 }
    ];
    const scenarioDef = {
      name: 'C_G-PENSION-MATCH',
      description: 'Verifies employer match contributions are included in pension totals.',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const row30 = results.dataSheet.find(r => r && r.age === 30);
    if (!row30) {
      errors.push('No row found at age 30');
    } else {
      // pensionContribution is employee-only; employer match is reflected in pensionFund.
      if (Math.abs(row30.pensionContribution - 500) > 1) errors.push(`Expected pensionContribution ≈ 500, got ${row30.pensionContribution}`);
      if (Math.abs(row30.netIncome - 8050) > 1) errors.push(`Expected netIncome ≈ 8050, got ${row30.netIncome}`);
      if (Math.abs(row30.cashInflows - 8050) > 1) errors.push(`Expected cashInflows ≈ 8050, got ${row30.cashInflows}`);
      if (Math.abs(row30.pensionFund - 1000) > 1) errors.push(`Expected pensionFund ≈ 1000, got ${row30.pensionFund}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
