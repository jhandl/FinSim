const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_D-SOCIAL-FLAT',
  description: 'Verifies flat rate social contribution calculation (D-SOCIAL-FLAT).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ targetAge: 31 });
    const events = [
      { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, rate: 0 }
    ];
    const scenarioDef = {
      name: 'C_D-SOCIAL-FLAT',
      description: 'Verifies flat rate social contribution calculation.',
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
      // TOY_AA has 5% SC
      // SC = 10000 * 0.05 = 500
      if (Math.abs(row30['Tax__sc'] - 500) > 1) errors.push(`Expected Tax__sc ≈ 500, got ${row30['Tax__sc']}`);
      // Confirm IT is also calculated but separate
      if (Math.abs(row30['Tax__incomeTax'] - 1000) > 1) errors.push(`Expected Tax__incomeTax ≈ 1000, got ${row30['Tax__incomeTax']}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
