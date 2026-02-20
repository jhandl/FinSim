const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_A-NAN-INF',
  description: 'Verifies that simulation results contain no NaN or Infinity values.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ targetAge: 31 });
    const events = [
      { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, currency: 'AAA', rate: 0, match: 0 }
    ];
    const scenarioDef = {
      name: 'C_A-NAN-INF',
      description: 'Verifies that simulation results contain no NaN or Infinity values.',
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

    results.dataSheet.forEach(row => {
      if (!row || typeof row !== 'object') return;
      Object.keys(row).forEach(key => {
        const val = row[key];
        if (typeof val === 'number') {
          if (!Number.isFinite(val)) {
            errors.push(`Row age=${row.age} field=${key} is ${val}`);
          }
        }
      });
    });

    return {
      success: errors.length === 0,
      errors
    };
  }
};
