const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_I-TWO-PERSON-TAX',
  description: 'Verifies two-person tax calculation in couple mode.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 31,
      simulation_mode: 'couple',
      StartCountry: 'aa',
      p2StartingAge: 30,
      p2RetirementAge: 65
    });

    const events = [
      { type: 'SI', id: 'p1-salary', amount: 10000, fromAge: 30, toAge: 30, currency: 'AAA', rate: 0, match: 0 },
      { type: 'SI2np', id: 'p2-salary', amount: 10000, fromAge: 30, toAge: 30, currency: 'AAA', rate: 0, match: 0 }
    ];

    const scenarioDef = {
      name: 'C_I-TWO-PERSON-TAX',
      description: 'Verifies two-person tax calculation in couple mode.',
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
      if (Math.abs(row30.incomeSalaries - 20000) > 1) errors.push(`Expected incomeSalaries ≈ 20000, got ${row30.incomeSalaries}`);
      if (Math.abs(row30['Tax__incomeTax'] - 2000) > 1) errors.push(`Expected Tax__incomeTax ≈ 2000, got ${row30['Tax__incomeTax']}`);
      if (Math.abs(row30['Tax__sc'] - 1000) > 1) errors.push(`Expected Tax__sc ≈ 1000, got ${row30['Tax__sc']}`);
      if (Math.abs(row30.netIncome - 17000) > 1) errors.push(`Expected netIncome ≈ 17000, got ${row30.netIncome}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
