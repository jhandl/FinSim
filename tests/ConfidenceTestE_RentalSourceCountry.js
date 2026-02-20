const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'E_RentalSourceCountry',
  description: 'Verifies rental income is sourced to property country (source-based taxation).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    // Resident in BB (15% IT), Property in AA (10% IT)
    const params = microParams({ 
      targetAge: 30, 
      StartCountry: 'bb' 
    });
    
    // R property in AA, currency AAA
    const events = [
      { type: 'R', id: 'prop1', amount: 0, fromAge: 30, toAge: 60, currency: 'AAA', linkedCountry: 'aa', label: 'Property in AA' },
      { type: 'RI', id: 'rent1', amount: 10000, fromAge: 30, toAge: 30, currency: 'AAA', linkedCountry: 'aa', label: 'Rent in AA' }
    ];

    const scenarioDef = {
      name: 'E_RentalSourceCountry',
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

    // After simulation, read taxTotals at age 30
    // rental income 10,000 AAA sourced to AA; AA IT = 10,000 * 0.10 = 1,000 AAA
    // Since resident in BB, taxTotals are in BBB. 1 AAA = 2 BBB, so source tax = 2000 BBB.
    const taxTotalsStr = vm.runInContext('JSON.stringify(revenue.taxTotals)', framework.simulationContext);
    const taxTotals = JSON.parse(taxTotalsStr);

    if (Math.abs(taxTotals['incomeTax:aa'] - 2000) > 1) {
      errors.push(`Expected source-country tax incomeTax:aa ≈ 2000, got ${taxTotals['incomeTax:aa']}`);
    }

    // BB resident IT on other income? No other income. 
    // BB should not have incomeTax listed for this source unless credit applied (handled in treaty tests)
    if (taxTotals['incomeTax:bb'] > 0) {
      errors.push(`Expected no residence tax incomeTax:bb, got ${taxTotals['incomeTax:bb']}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
