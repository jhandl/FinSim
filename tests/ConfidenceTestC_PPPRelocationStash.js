const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'C_PPPRelocationStash',
  description: 'Verifies emergency stash is converted via PPP during relocation.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    // BB FX: 2.0 perEur, PPP: 0.5. AA FX: 1.0, PPP: 1.0
    const TOY_BB_PPP = deepClone(TOY_BB);
    TOY_BB_PPP.economicData.purchasingPowerParity.value = 0.5;

    const params = microParams({ 
      targetAge: 31, 
      emergencyStash: 10000, 
      relocationEnabled: true,
      StartCountry: 'aa'
    });
    
    const events = [
      { type: 'MV', id: 'move', name: 'bb', fromAge: 30, toAge: 30, label: 'Move to BB' }
    ];

    const scenarioDef = {
      name: 'C_PPPRelocationStash',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA, bb: TOY_BB_PPP });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    // Read targetCash from simulationContext
    // targetCash is converted during MV event
    // getPPP('aa', 'bb') = ppp_bb / ppp_aa = 0.5 / 1.0 = 0.5
    // 10000 AAA -> 5000 BBB
    const targetCash = vm.runInContext('targetCash', framework.simulationContext);

    if (Math.abs(targetCash - 5000) > 1) {
      errors.push(`Expected targetCash ≈ 5000 BBB (via PPP), got ${targetCash}. (If it were via FX, it would be 20000)`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
