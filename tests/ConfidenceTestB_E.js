const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-E',
  description: 'Verifies simple expense (E) deduction from cash.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ targetAge: 31, initialSavings: 5000 });
    const events = [
      { type: 'SI', id: 'salary', amount: 4000, fromAge: 30, toAge: 30, currency: 'AAA' },
      { type: 'E', id: 'exp', amount: 3000, fromAge: 30, toAge: 30, currency: 'AAA' }
    ];
    const scenarioDef = {
      name: 'C_B-E',
      description: 'Verifies simple expense (E) deduction from cash.',
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
      // Net salary = 4000 * (1 - 0.10 - 0.05) = 3400
      // Cash = 5000 + 3400 - 3000 = 5400
      if (Math.abs(row30.cash - 5400) > 1) errors.push(`Expected cash ≈ 5400, got ${row30.cash}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
