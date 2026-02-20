const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-PrimaryResidenceTiming',
  description: 'Verifies primary residence relief on property sale.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ 
      targetAge: 37, 
      initialSavings: 150000 
    });
    const events = [
      // Primary residence in 'aa' from age 30 to 35
      { type: 'R', id: 'Home', amount: 100000, fromAge: 30, toAge: 35, rate: 0.08, currency: 'AAA', linkedCountry: 'aa' }
    ];
    const scenarioDef = {
      name: 'C_B-PrimaryResidenceTiming',
      description: 'Verifies primary residence relief on property sale.',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    // Override annual exemption to 0 to isolate relief impact
    const customAA = deepClone(TOY_AA);
    customAA.capitalGainsTax.annualExemption = 0;

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: customAA });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const row35 = results.dataSheet.find(r => r && r.age === 35);
    if (!row35) {
      errors.push('No row found at age 35');
    } else {
      // Gain: 100000 * ((1.08)^5 - 1) ≈ 46932
      // CGT should be 0 because it's primary residence 100% of the time.
      if (Math.abs(row35['Tax__capitalGains'] - 0) > 1) {
        errors.push(`Age 35: Expected Tax__capitalGains ≈ 0, got ${row35['Tax__capitalGains']}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
