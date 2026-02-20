const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'E_PropertySalePrimaryResidenceRelocation',
  description: 'Verifies full primary-residence period yields zero taxable property gain, even with relocation at sale age.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    // Resident in AA, buy property in AA, relocate at sale age.
    const params = microParams({ 
      startingAge: 30,
      targetAge: 36, 
      relocationEnabled: true,
      StartCountry: 'aa',
      initialSavings: 1000000
    });
    
    const events = [
      { type: 'SI', id: 'salary', amount: 20000, fromAge: 35, toAge: 35, currency: 'BBB', linkedCountry: 'bb' },
      { type: 'R', id: 'prop', amount: 100000, fromAge: 31, toAge: 35, currency: 'AAA', linkedCountry: 'aa', rate: 0.10, label: 'Buy/Sell Property' },
      { type: 'MV', id: 'move', name: 'bb', fromAge: 35, toAge: 35, label: 'Move to BB' }
    ];

    const scenarioDef = {
      name: 'E_PropertySalePrimaryResidenceRelocation',
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
      errors.push(`Simulation failed at age ${results.failedAt}: ${results.error || 'Unknown error'}`);
      return { success: false, errors };
    }

    const row35 = results.dataSheet.find(r => r && r.age === 35);
    if (!row35) {
        errors.push('Row at age 35 not found');
    } else {
        const sourceCGT = row35.taxByKey['capitalGains:aa'] || 0;
        const residenceCGT = row35.taxByKey['capitalGains'] || 0;
        // What is tested:
        // Property is primary residence for the entire hold period.
        //
        // Hand math:
        // Hold interval years counted by engine: ages 31..34 (4 years total).
        // Move happens at age 35, so primaryYears = 4, totalYears = 4.
        // primaryResidenceProportion = 4 / 4 = 1
        // Taxable gain after proportional exemption = gain * (1 - 1) = 0
        // Therefore source and residence property CGT buckets must both be zero.
        if (Math.abs(sourceCGT - 0) > 1e-9) errors.push(`Expected source-country CGT = 0, got ${sourceCGT}`);
        if (Math.abs(residenceCGT - 0) > 1e-9) errors.push(`Expected residence-country CGT = 0, got ${residenceCGT}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
