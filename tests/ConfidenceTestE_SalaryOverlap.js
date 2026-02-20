const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'E_SalaryOverlap',
  description: 'Verifies source-country tax in relocation boundary year with salary overlap.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ 
      targetAge: 31, 
      relocationEnabled: true,
      StartCountry: 'aa' 
    });
    
    const events = [
      { type: 'SI', id: 'sal', amount: 10000, fromAge: 30, toAge: 31, currency: 'AAA', linkedCountry: 'aa', label: 'Salary AA' },
      { type: 'MV', id: 'move', name: 'bb', fromAge: 31, toAge: 31, label: 'Move to BB' }
    ];

    const scenarioDef = {
      name: 'E_SalaryOverlap',
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
      errors.push('Row at age 31 (boundary year) missing');
    } else {
      const taxTotalsStr = vm.runInContext('JSON.stringify(revenue.taxTotals)', framework.simulationContext);
      const taxTotals = JSON.parse(taxTotalsStr);

      // In boundary year, AA salary should still be taxed by AA as source country
      if (!(taxTotals['incomeTax:aa'] > 0)) {
        errors.push('Expected source-country tax incomeTax:aa in boundary year, but it was 0 or missing');
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
