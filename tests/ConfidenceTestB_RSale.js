const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-RSale',
  description: 'Verifies property sale proceeds and worth removal.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    // Start with enough to buy it cash for simplicity in this proceeds test
    const params = microParams({ targetAge: 32, initialSavings: 200000 });
    const events = [
      // Purchase at age 30, sold at age 31
      { type: 'R', id: 'home', amount: 200000, fromAge: 30, toAge: 31, rate: 0 }
    ];
    const scenarioDef = {
      name: 'C_B-RSale',
      description: 'Verifies property sale proceeds and worth removal.',
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

    const row31 = results.dataSheet.find(r => r && r.age === 31);
    if (!row31) {
      errors.push('No row found at age 31');
    } else {
      // 200000 initial - 200000 purchase + 200000 sale = 200000 cash
      if (Math.abs(row31.cash - 200000) > 1) errors.push(`Expected cash ≈ 200000, got ${row31.cash}`);
      if (Math.abs(row31.realEstateCapital - 0) > 1) errors.push(`Expected realEstateCapital ≈ 0, got ${row31.realEstateCapital}`);
      // Worth should only be the cash now
      if (Math.abs(row31.worth - 200000) > 1) errors.push(`Expected worth ≈ 200000, got ${row31.worth}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
