const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_D-IT-FLAT',
  description: 'Verifies flat rate income tax calculation (D-IT-FLAT).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ targetAge: 31 });
    const events = [
      { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, rate: 0 }
    ];
    const scenarioDef = {
      name: 'C_D-IT-FLAT',
      description: 'Verifies flat rate income tax calculation.',
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
      // TOY_AA has 10% IT and 5% SC
      // IT = 10000 * 0.10 = 1000
      // SC = 10000 * 0.05 = 500
      // Net Income = 10000 - 1000 - 500 = 8500
      if (Math.abs(row30['Tax__incomeTax'] - 1000) > 1) errors.push(`Expected Tax__incomeTax ≈ 1000, got ${row30['Tax__incomeTax']}`);
      if (Math.abs(row30['Tax__sc'] - 500) > 1) errors.push(`Expected Tax__sc ≈ 500, got ${row30['Tax__sc']}`);
      if (Math.abs(row30.netIncome - 8500) > 1) errors.push(`Expected netIncome ≈ 8500, got ${row30.netIncome}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
