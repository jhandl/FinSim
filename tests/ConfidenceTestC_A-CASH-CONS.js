const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_A-CASH-CONS',
  description: 'Verifies cashflow consistency via hand-calculated simple case.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ targetAge: 31 });
    const events = [
      { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, currency: 'AAA', rate: 0, match: 0 },
      { type: 'E', id: 'expense', amount: 2000, fromAge: 30, toAge: 30, currency: 'AAA' }
    ];
    const scenarioDef = {
      name: 'C_A-CASH-CONS',
      description: 'Verifies cashflow consistency via hand-calculated simple case.',
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
      // Hand-derived value:
      // IT = 10,000 * 0.10 = 1,000
      // SC = 10,000 * 0.05 = 500
      // Net income = 10,000 - 1,000 - 500 = 8,500
      // Cash end = 0 + 8,500 - 2,000 = 6,500
      const expectedCash = 6500;
      if (Math.abs(row30.cash - expectedCash) > 1) {
        errors.push(`Expected cash ≈ 6500 ±1, got ${row30.cash}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
