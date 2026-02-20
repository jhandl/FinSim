const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_D-CGT-EXEMPTION',
  description: 'Verifies CGT annual exemption (D-CGT-EXEMPTION).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // Sub-scenario A — shares (CGT asset, exemption applies)
    // Age 30: SM 20% growth override.
    // Age 31: Growth applied (7500 * 1.2 = 9000), then forceSale sells 9000.
    // Gain = 1500. CGT = (1500 - 1000) * 0.20 = 100.
    {
      const framework = new TestFramework();
      framework.loadScenario({
        name: 'D-CGT-EXEMPTION-A',
        assertions: [],
        scenario: {
          parameters: microParams({
            targetAge: 32,
            initialShares: 7500,
            growthRateShares: 0,
            priorityShares: 1,
            priorityCash: 4,
            priorityFunds: 4,
            priorityPension: 4
          }),
          events: [
            { type: 'SM', id: 'growth', amount: 0, fromAge: 30, toAge: 30, rate: 0.20 },
            { type: 'E', id: 'forceSale', amount: 9000, fromAge: 31, toAge: 31, rate: 0 }
          ]
        }
      });
      installTestTaxRules(framework, { aa: TOY_AA });
      const results = await framework.runSimulation();
      const row31 = results.dataSheet.find(r => r && r.age === 31);
      if (!row31) {
        errors.push('Sub-scenario A: No row found at age 31');
      } else if (Math.abs(row31.cgt - 100) > 2) {
        errors.push(`Sub-scenario A: Expected cgt ≈ 100, got ${row31.cgt}`);
      }
    }

    // Sub-scenario B — funds (exit tax asset, no exemption)
    // Gain = 1500. Exit tax = 1500 * 0.40 = 600.
    {
      const framework = new TestFramework();
      framework.loadScenario({
        name: 'D-CGT-EXEMPTION-B',
        assertions: [],
        scenario: {
          parameters: microParams({
            targetAge: 32,
            initialFunds: 7500,
            growthRateFunds: 0,
            priorityFunds: 1,
            priorityCash: 4,
            priorityShares: 4,
            priorityPension: 4
          }),
          events: [
            { type: 'SM', id: 'growth', amount: 0, fromAge: 30, toAge: 30, rate: 0.20 },
            { type: 'E', id: 'forceSale', amount: 9000, fromAge: 31, toAge: 31, rate: 0 }
          ]
        }
      });
      installTestTaxRules(framework, { aa: TOY_AA });
      const results = await framework.runSimulation();
      const row31 = results.dataSheet.find(r => r && r.age === 31);
      if (!row31) {
        errors.push('Sub-scenario B: No row found at age 31');
      } else if (Math.abs(row31.cgt - 600) > 2) {
        errors.push(`Sub-scenario B: Expected cgt ≈ 600, got ${row31.cgt}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
