const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-SI',
  description: 'Verifies pensionable salary (SI) income and associated taxes/pension contributions.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 31,
      // Pension contributions are configured via params (not the event's rate field).
      pensionContributionsByCountry: { aa: { p1Pct: 0.10, p2Pct: 0, capped: 'No' } }
    });
    const events = [
      // rate is inflation override; keep it 0 for this test.
      { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, currency: 'AAA', rate: 0, match: 0 }
    ];
    const scenarioDef = {
      name: 'C_B-SI',
      description: 'Verifies pensionable salary (SI) income and associated taxes/pension contributions.',
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
      // Pension (personal) = 10000 * 0.10 = 1000
      // IT = (10000 - 1000) * 0.10 = 900  (pension relief reduces taxable income)
      // SC = 10000 * 0.05 = 500
      // netIncome is take-home cash excluding withdrawals:
      // netIncome = 10000 - 1000 - 900 - 500 = 7600
      if (Math.abs(row30.incomeSalaries - 10000) > 1) errors.push(`Expected incomeSalaries ≈ 10000, got ${row30.incomeSalaries}`);
      if (Math.abs(row30['Tax__incomeTax'] - 900) > 1) errors.push(`Expected Tax__incomeTax ≈ 900, got ${row30['Tax__incomeTax']}`);
      if (Math.abs(row30['Tax__sc'] - 500) > 1) errors.push(`Expected Tax__sc ≈ 500, got ${row30['Tax__sc']}`);
      if (Math.abs(row30.pensionContribution - 1000) > 1) errors.push(`Expected pensionContribution ≈ 1000, got ${row30.pensionContribution}`);
      if (Math.abs(row30.netIncome - 7600) > 1) errors.push(`Expected netIncome ≈ 7600, got ${row30.netIncome}`);
      if (Math.abs(row30.cashInflows - 7600) > 1) errors.push(`Expected cashInflows ≈ 7600, got ${row30.cashInflows}`);
      
      // Pension fund should increase by the contribution
      if (Math.abs(row30.pensionFund - 1000) > 1) errors.push(`Expected pensionFund ≈ 1000, got ${row30.pensionFund}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
