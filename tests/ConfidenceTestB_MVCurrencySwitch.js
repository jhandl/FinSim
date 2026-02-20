const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-MVCurrencySwitch',
  description: 'Verifies cash currency conversion during relocation (MV).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ 
      targetAge: 32, 
      initialSavings: 1000, 
      relocationEnabled: true 
    });
    const events = [
      { type: 'MV', name: 'bb', id: 'move-bb', amount: 0, fromAge: 31, toAge: 31 }
    ];
    const scenarioDef = {
      name: 'C_B-MVCurrencySwitch',
      description: 'Verifies cash currency conversion during relocation (MV).',
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

    const row31 = results.dataSheet.find(r => r && r.age === 31);
    if (!row31) {
      errors.push('No row found at age 31');
    } else {
      // 1000 AAA * (2.0 / 1.0) = 2000 BBB
      if (Math.abs(row31.cash - 2000) > 1) errors.push(`Expected cash ≈ 2000, got ${row31.cash}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
