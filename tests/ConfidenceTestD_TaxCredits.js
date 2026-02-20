const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_D-IT-CREDITS',
  description: 'Verifies tax credits application (D-IT-CREDITS).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const TOY_AA_CREDIT = deepClone(TOY_AA);
    TOY_AA_CREDIT.incomeTax.taxCredits = { personal: { amount: 500 } };

    const errors = [];

    // Sub-scenario A: salary 10 000 -> IT before credit = 1 000, after = 500
    {
      const framework = new TestFramework();
      framework.loadScenario({
        name: 'D-IT-CREDITS-A',
        assertions: [],
        scenario: {
          parameters: microParams({ targetAge: 31 }),
          events: [{ type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, rate: 0 }]
        }
      });
      installTestTaxRules(framework, { aa: TOY_AA_CREDIT });
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

    // Sub-scenario B: salary 4 000 -> IT before credit = 400, after = max(0, -100) = 0
    {
      const framework = new TestFramework();
      framework.loadScenario({
        name: 'D-IT-CREDITS-B',
        assertions: [],
        scenario: {
          parameters: microParams({ targetAge: 31 }),
          events: [{ type: 'SI', id: 'salary', amount: 4000, fromAge: 30, toAge: 30, rate: 0 }]
        }
      });
      installTestTaxRules(framework, { aa: TOY_AA_CREDIT });
      const results = await framework.runSimulation();
      if (!results.success) {
        errors.push('Sub-scenario B: Simulation failed');
      } else {
        const row30 = results.dataSheet.find(r => r && r.age === 30);
        if (!row30) {
          errors.push('Sub-scenario B: No row found at age 30');
        } else if (Math.abs(row30['Tax__incomeTax'] - 0) > 1) {
          errors.push(`Sub-scenario B: Expected Tax__incomeTax ≈ 0, got ${row30['Tax__incomeTax']}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
