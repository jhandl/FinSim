const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules, installTreatyPairs } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'E_TreatyCredit',
  description: 'Verifies treaty credit attribution and breakdown in the attribution manager.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    // Resident in AA (10% IT), Income sourced in BB (15% IT)
    const params = microParams({ 
      targetAge: 30, 
      StartCountry: 'aa' 
    });
    
    const events = [
      { type: 'SI', id: 'inc1', amount: 10000, fromAge: 30, toAge: 30, currency: 'BBB', linkedCountry: 'bb', label: 'BB Income' }
    ];

    const scenarioDef = {
      name: 'E_TreatyCredit',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA, bb: TOY_BB });
    installTreatyPairs(framework, [['aa', 'bb']]);
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    // Inspect attributionManager for the current year
    const attrStr = vm.runInContext('JSON.stringify(revenue.attributionManager.yearlyAttributions)', framework.simulationContext);
    const yearlyAttributions = JSON.parse(attrStr);

    // Attribution keys often follow the format tax:incomeTax or tax:incomeTax:bb
    if (!yearlyAttributions['tax:incomeTax:bb']) {
      errors.push('Expected attribution key tax:incomeTax:bb missing');
    }

    // The treaty credit itself might be recorded as a breakdown in the domestic tax key
    const itAttr = yearlyAttributions['tax:incomeTax'];
    if (!itAttr) {
      errors.push('Attribution key tax:incomeTax missing');
    } else {
      // breakdown should have Foreign Tax Credit in 'slices'
      if (!itAttr.slices || !itAttr.slices['Foreign Tax Credit']) {
        errors.push(`Expected "Foreign Tax Credit" breakdown in tax:incomeTax, but it was missing: ${JSON.stringify(itAttr)}`);
      } else {
        const creditValue = itAttr.slices['Foreign Tax Credit'];
        // From Step 8 derivation, credit should be 500 AAA (stored as negative in attribution breakdown usually)
        if (Math.abs(Math.abs(creditValue) - 500) > 1) {
          errors.push(`Expected credit ≈ 500 AAA, got ${creditValue}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
