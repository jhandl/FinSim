const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules, installTreatyPairs } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'E_PropertySaleCrossBorder',
  description: 'Verifies zero-gain cross-border property sale produces zero CGT in both source and residence buckets.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    // Resident in AA, property located in BB.
    const params = microParams({ 
      startingAge: 30,
      targetAge: 33, 
      StartCountry: 'aa',
      initialSavings: 1000000
    });
    
    // Property bought and sold with 0% growth => gain is exactly 0.
    // Salary exists only to keep yearly net income positive.
    const events = [
      { type: 'SI', id: 'salary', amount: 10000, fromAge: 32, toAge: 32, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'R', id: 'prop', amount: 100000, fromAge: 31, toAge: 32, currency: 'BBB', linkedCountry: 'bb', rate: 0, label: 'Buy/Sell BB Property' }
    ];

    const scenarioDef = {
      name: 'E_PropertySaleCrossBorder',
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
      errors.push(`Simulation failed at age ${results.failedAt}: ${results.error || 'Unknown error'}`);
      return { success: false, errors };
    }

    const row32 = results.dataSheet.find(r => r && r.age === 32);
    if (!row32) {
        errors.push('Row at age 32 not found');
    } else {
        const sourceCGT = row32.taxByKey['capitalGains:bb'] || 0;
        const netResidenceCGT = row32.taxByKey['capitalGains'] || 0;

        // What is tested:
        // Zero gain in source country must imply zero capital gains tax everywhere.
        //
        // Hand math:
        // Gain = 100,000 * (1 + 0) - 100,000 = 0
        // Source CGT(BB) on zero gain = 0
        // Residence CGT(AA) on zero gain = 0
        if (Math.abs(sourceCGT - 0) > 1e-9) errors.push(`Expected BB source CGT = 0, got ${sourceCGT}`);
        if (Math.abs(netResidenceCGT - 0) > 1e-9) errors.push(`Expected AA residence CGT = 0, got ${netResidenceCGT}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
