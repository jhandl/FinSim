const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_D-IT-BRACKETS',
  description: 'Verifies progressive tax brackets calculation (D-IT-BRACKETS).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const TOY_AA_BRACKETS = deepClone(TOY_AA);
    TOY_AA_BRACKETS.incomeTax.brackets = { '0': 0.10, '5000': 0.20 };

    const errors = [];

    // Sub-scenario A: salary 5 000 -> IT = 5 000 * 0.10 = 500
    {
      const framework = new TestFramework();
      framework.loadScenario({
        name: 'D-IT-BRACKETS-A',
        assertions: [],
        scenario: {
          parameters: microParams({ targetAge: 31 }),
          events: [{ type: 'SI', id: 'salary', amount: 5000, fromAge: 30, toAge: 30, rate: 0 }]
        }
      });
      installTestTaxRules(framework, { aa: TOY_AA_BRACKETS });
      const results = await framework.runSimulation();
      if (!results.success) {
        errors.push('Sub-scenario A: Simulation failed');
      } else {
        const row30 = results.dataSheet.find(r => r && r.age === 30);
        if (!row30) {
          errors.push('Sub-scenario A: No row found at age 30');
        } else if (Math.abs(row30['Tax__incomeTax'] - 500) > 1) {
          errors.push(`Sub-scenario A: Expected Tax__incomeTax ≈ 500, got ${row30['Tax__incomeTax']}`);
        }
      }
    }

    // Sub-scenario B: salary 6 000 -> IT = 5 000 * 0.10 + 1 000 * 0.20 = 700
    {
      const framework = new TestFramework();
      framework.loadScenario({
        name: 'D-IT-BRACKETS-B',
        assertions: [],
        scenario: {
          parameters: microParams({ targetAge: 31 }),
          events: [{ type: 'SI', id: 'salary', amount: 6000, fromAge: 30, toAge: 30, rate: 0 }]
        }
      });
      installTestTaxRules(framework, { aa: TOY_AA_BRACKETS });
      const results = await framework.runSimulation();
      if (!results.success) {
        errors.push('Sub-scenario B: Simulation failed');
      } else {
        const row30 = results.dataSheet.find(r => r && r.age === 30);
        if (!row30) {
          errors.push('Sub-scenario B: No row found at age 30');
        } else if (Math.abs(row30['Tax__incomeTax'] - 700) > 1) {
          errors.push(`Sub-scenario B: Expected Tax__incomeTax ≈ 700, got ${row30['Tax__incomeTax']}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
