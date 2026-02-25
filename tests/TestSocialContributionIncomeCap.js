const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'SOCIAL-CONTRIBUTION-INCOME-CAP',
  description: 'Verifies social contribution income cap logic.',
  category: 'unit',
  isCustomTest: true,
  async runCustomTest() {
    // Clone TOY_AA and set incomeCap = 5000 (rate stays 0.05)
    const TOY_CAP = JSON.parse(JSON.stringify(TOY_AA));
    TOY_CAP.socialContributions[0].incomeCap = 5000;

    const params = microParams({ targetAge: 32 });
    
    // Scenario 1: Salary 10000 (above cap 5000)
    const events1 = [
      { type: 'SI', id: 'salary1', amount: 10000, fromAge: 30, toAge: 30, rate: 0 }
    ];
    
    // Scenario 2: Salary 3000 (below cap 5000)
    const events2 = [
      { type: 'SI', id: 'salary2', amount: 3000, fromAge: 31, toAge: 31, rate: 0 }
    ];

    const scenarioDef = {
      name: 'SOCIAL-CONTRIBUTION-INCOME-CAP',
      description: 'Verifies social contribution income cap logic.',
      scenario: {
        parameters: params,
        events: [...events1, ...events2]
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_CAP });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    // Age 30: Salary 10000 > Cap 5000
    // Expected SC = 5000 * 0.05 = 250
    const row30 = results.dataSheet.find(r => r && r.age === 30);
    if (!row30) {
      errors.push('No row found at age 30');
    } else {
      if (Math.abs(row30['Tax__sc'] - 250) > 1) {
        errors.push(`Expected Tax__sc ≈ 250 at age 30 (capped), got ${row30['Tax__sc']}`);
      }
    }

    // Age 31: Salary 3000 < Cap 5000
    // Expected SC = 3000 * 0.05 = 150
    const row31 = results.dataSheet.find(r => r && r.age === 31);
    if (!row31) {
      errors.push('No row found at age 31');
    } else {
      if (Math.abs(row31['Tax__sc'] - 150) > 1) {
        errors.push(`Expected Tax__sc ≈ 150 at age 31 (uncapped), got ${row31['Tax__sc']}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
