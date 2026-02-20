const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_CC, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'E_CrossBorderNoTreaty',
  description: 'Verifies double taxation when no treaty exists between countries.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    // Resident in AA (10% IT), Income sourced in CC (20% IT)
    // No treaty between AA and CC
    const params = microParams({ 
      targetAge: 30, 
      StartCountry: 'aa' 
    });
    
    const events = [
      { type: 'SI', id: 'inc1', amount: 10000, fromAge: 30, toAge: 30, currency: 'CCC', linkedCountry: 'cc', label: 'CC Income' }
    ];

    const scenarioDef = {
      name: 'E_CrossBorderNoTreaty',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA, cc: TOY_CC });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    // Derivation (Base Year 2025):
    // 10,000 CCC sourced to CC. CC IT = 10,000 * 0.20 = 2,000 CCC
    // In AA (residence): 10,000 CCC = 3,333.33 AAA (1 AAA = 3 CCC)
    // AA IT = 3,333.33 * 0.10 = 333.33 AAA
    // Total Tax (in AAA): CC IT (2000 CCC / 3) + CC SC (800 CCC / 3) + AA IT (333.33 AAA) + AA SC (166.67 AAA)
    // = 666.67 + 266.67 + 333.33 + 166.67 = 1433.33 AAA
    
    const taxTotalsStr = vm.runInContext('JSON.stringify(revenue.taxTotals)', framework.simulationContext);
    const taxTotals = JSON.parse(taxTotalsStr);

    const totalTax = vm.runInContext('revenue.getAllTaxesTotal()', framework.simulationContext);

    // CC IT: 2000 CCC = 666.67 AAA
    if (Math.abs(taxTotals['incomeTax:cc'] - 666.67) > 1) {
      errors.push(`Expected CC source tax incomeTax:cc ≈ 666.67, got ${taxTotals['incomeTax:cc']}`);
    }

    // AA Residence IT: 333 AAA (on 3333 AAA converted income)
    if (Math.abs(taxTotals.incomeTax - 333) > 5) {
      errors.push(`Expected AA residence tax incomeTax ≈ 333, got ${taxTotals.incomeTax}`);
    }

    // Total: 1433.33 AAA
    if (Math.abs(totalTax - 1433.33) > 5) {
      errors.push(`Expected total tax ≈ 1433.33 AAA, got ${totalTax}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
