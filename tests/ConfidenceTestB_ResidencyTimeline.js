const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-ResidencyTimeline',
  description: 'Verifies multi-country residency timeline and salary attribution.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ 
      targetAge: 37, 
      initialSavings: 5000, 
      relocationEnabled: true 
    });
    const events = [
      { type: 'SI', id: 'sal-aa', amount: 50000, fromAge: 30, toAge: 34, currency: 'AAA' },
      { type: 'MV', id: 'move', name: 'bb', fromAge: 35, toAge: 35 },
      { type: 'SI', id: 'sal-bb', amount: 60000, fromAge: 35, toAge: 36, currency: 'BBB' }
    ];
    const scenarioDef = {
      name: 'C_B-ResidencyTimeline',
      description: 'Verifies multi-country residency timeline and salary attribution.',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA, bb: TOY_BB });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    for (let age = 30; age <= 36; age++) {
      const row = results.dataSheet.find(r => r && r.age === age);
      if (!row) {
        errors.push(`No row found at age ${age}`);
        continue;
      }

      // Check for NaN/Infinity
      for (const field in row) {
        if (typeof row[field] === 'number') {
          if (!Number.isFinite(row[field])) {
            errors.push(`Age ${age}: Field ${field} is ${row[field]}`);
          }
        }
      }

      if (age <= 34) {
        if (Math.abs(row.incomeSalaries - 50000) > 1) {
          errors.push(`Age ${age}: Expected incomeSalaries ≈ 50000 (AAA), got ${row.incomeSalaries}`);
        }
      } else {
        if (Math.abs(row.incomeSalaries - 60000) > 1) {
          errors.push(`Age ${age}: Expected incomeSalaries ≈ 60000 (BBB), got ${row.incomeSalaries}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
