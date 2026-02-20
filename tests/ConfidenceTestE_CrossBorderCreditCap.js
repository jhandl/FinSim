const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules, installTreatyPairs } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'E_CrossBorderCreditCap',
  description: 'Verifies treaty credit is capped at domestic tax amount (ordinary credit).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    // Resident in AA (10% IT), Income sourced in BB (15% IT)
    // Treaty exists: Credit = min(source_tax, domestic_tax_on_that_income)
    const params = microParams({ 
      targetAge: 30, 
      StartCountry: 'aa' 
    });
    
    const events = [
      { type: 'SI', id: 'inc1', amount: 10000, fromAge: 30, toAge: 30, currency: 'BBB', linkedCountry: 'bb', label: 'BB Income' }
    ];

    const scenarioDef = {
      name: 'E_CrossBorderCreditCap',
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

    // Derivation:
    // 10,000 BBB sourced to BB. BB IT = 10,000 * 0.15 = 1,500 BBB
    // In AA: 10,000 BBB = 5,000 AAA (1 AAA = 2 BBB)
    // AA IT (gross) = 5,000 * 0.10 = 500 AAA
    // Credit = min(SourceTaxInAAA, GrossDomesticTax)
    // SourceTaxInAAA = 1500 / 2 = 750 AAA
    // Credit = min(750, 500) = 500 AAA
    // Net AA IT = 500 - 500 = 0
    // BB SC = 300 BBB = 150 AAA
    // AA SC = 250 AAA
    // Total Tax = SourceTaxInAAA + NetAAIT + BB SC In AAA + AA SC = 750 + 0 + 150 + 250 = 1150 AAA

    const taxTotalsStr = vm.runInContext('JSON.stringify(revenue.taxTotals)', framework.simulationContext);
    const taxTotals = JSON.parse(taxTotalsStr);
    const totalTax = vm.runInContext('revenue.getAllTaxesTotal()', framework.simulationContext);

    if (Math.abs(taxTotals['incomeTax:bb'] - 750) > 1) {
      errors.push(`Expected BB source tax incomeTax:bb ≈ 750, got ${taxTotals['incomeTax:bb']}`);
    }

    if (Math.abs(taxTotals.incomeTax - 0) > 1) {
      errors.push(`Expected net AA residence tax incomeTax ≈ 0 (fully credited), got ${taxTotals.incomeTax}`);
    }

    if (Math.abs(totalTax - 1150) > 5) {
      errors.push(`Expected total tax ≈ 1150 AAA, got ${totalTax}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
