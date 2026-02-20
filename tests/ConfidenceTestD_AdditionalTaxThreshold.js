const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_D-ADD-TAX-THRESH',
  description: 'Verifies additional tax threshold calculation (D-ADD-TAX-THRESH).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const TOY_AA_ADD = deepClone(TOY_AA);
    TOY_AA_ADD.additionalTaxes = [{ name: 'ST', brackets: { '0': 0, '8000': 0.10 } }];

    const errors = [];

    // Sub-scenario A: salary 10 000 -> surcharge = (10 000 - 8 000) * 0.10 = 200
    {
      const framework = new TestFramework();
      framework.loadScenario({
        name: 'D-ADD-TAX-THRESH-A',
        assertions: [],
        scenario: {
          parameters: microParams({ targetAge: 31 }),
          events: [{ type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, rate: 0 }]
        }
      });
      installTestTaxRules(framework, { aa: TOY_AA_ADD });
      const results = await framework.runSimulation();
      if (!results.success) {
        errors.push('Sub-scenario A: Simulation failed');
      } else {
        const row30 = results.dataSheet.find(r => r && r.age === 30);
        if (!row30) {
          errors.push('Sub-scenario A: No row found at age 30');
        } else {
          // Additional taxes are usually in Tax__NAME columns
          if (Math.abs(row30['Tax__ST'] - 200) > 1) {
            errors.push(`Sub-scenario A: Expected Tax__ST ≈ 200, got ${row30['Tax__ST']}`);
          }
        }
      }
    }

    // Sub-scenario B: salary 7 000 -> surcharge = 0
    {
      const framework = new TestFramework();
      framework.loadScenario({
        name: 'D-ADD-TAX-THRESH-B',
        assertions: [],
        scenario: {
          parameters: microParams({ targetAge: 31 }),
          events: [{ type: 'SI', id: 'salary', amount: 7000, fromAge: 30, toAge: 30, rate: 0 }]
        }
      });
      installTestTaxRules(framework, { aa: TOY_AA_ADD });
      const results = await framework.runSimulation();
      if (!results.success) {
        errors.push('Sub-scenario B: Simulation failed');
      } else {
        const row30 = results.dataSheet.find(r => r && r.age === 30);
        if (!row30) {
          errors.push('Sub-scenario B: No row found at age 30');
        } else {
          const st = row30['Tax__ST'] || 0;
          if (Math.abs(st - 0) > 1) {
            errors.push(`Sub-scenario B: Expected Tax__ST ≈ 0, got ${st}`);
          }
        }
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
