const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_D-EXIT-TAX-NO-EXEMPTION',
  description: 'Verifies exit tax ignores annual exemption (D-EXIT-TAX-NO-EXEMPTION).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 32,
      initialFunds: 7500,
      growthRateFunds: 0,
      priorityFunds: 1,
      priorityCash: 4,
      priorityShares: 4,
      priorityPension: 4
    });
    const events = [
      { type: 'SM', id: 'growth', amount: 0, fromAge: 30, toAge: 30, rate: 0.20 },
      { type: 'E', id: 'forceSale', amount: 9000, fromAge: 31, toAge: 31, rate: 0 }
    ];
    const scenarioDef = {
      name: 'D-EXIT-TAX-NO-EXEMPTION',
      assertions: [],
      scenario: {
        parameters: params,
        events: events
      }
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA });
    const results = await framework.runSimulation();

    const errors = [];
    const row31 = results.dataSheet.find(r => r && r.age === 31);
    if (!row31) {
      errors.push('No row found at age 31');
    } else {
      // gain = 1500, exit tax = 0.40 * 1500 = 600
      if (Math.abs(row31.cgt - 600) > 2) errors.push(`Expected exit tax ≈ 600, got ${row31.cgt}`);
      if (row31.cgt <= 500) errors.push(`Exit tax should be > 500 if exemption is ignored (got ${row31.cgt})`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
