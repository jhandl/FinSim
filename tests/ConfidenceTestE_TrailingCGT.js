const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'E_TrailingCGT',
  description: 'Verifies trailing source-country taxation after relocation.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // --- Scenario 1: Baseline (Trailing Disabled) ---
    {
      const TOY_AA_NO_TRAILING = deepClone(TOY_AA);
      TOY_AA_NO_TRAILING.residencyRules.postEmigrationTaxYears = 0;

      const params = microParams({ 
        startingAge: 30,
        targetAge: 33, 
        relocationEnabled: true,
        StartCountry: 'aa',
        initialSavings: 0
      });
      
      const events = [
        { type: 'MV', id: 'move', name: 'bb', fromAge: 31, toAge: 31, label: 'Move to BB' },
        { type: 'SI', id: 'salary_bb_source', amount: 20000, fromAge: 32, toAge: 32, currency: 'BBB', linkedCountry: 'bb' }
      ];

      const scenarioDef = {
        name: 'E_TrailingCGT_Baseline',
        scenario: { parameters: params, events: events },
        assertions: []
      };

      const framework = new TestFramework();
      framework.loadScenario(scenarioDef);
      installTestTaxRules(framework, { aa: TOY_AA_NO_TRAILING, bb: TOY_BB });
      const results = await framework.runSimulation();

      if (!results.success) {
        errors.push(`Baseline simulation failed at age ${results.failedAt}`);
      } else {
        const row32 = results.dataSheet.find(r => r && r.age === 32);
        const incomeTaxBB = row32 ? (row32.taxByKey.incomeTax || 0) : 0;
        const scBB = row32 ? (row32.taxByKey.sc || 0) : 0;
        const trailingIncomeTaxAA = row32 ? (row32.taxByKey['incomeTax:aa'] || 0) : 0;
        const trailingScAA = row32 ? (row32.taxByKey['sc:aa'] || 0) : 0;
        // What is tested:
        // With trailing disabled, only BB residence tax applies after relocation.
        //
        // Hand math on BB salary 20,000 BBB:
        // BB IT = 20,000 * 0.15 = 3,000
        // BB SC = 20,000 * 0.03 = 600
        if (Math.abs(incomeTaxBB - 3000) > 1) errors.push(`Expected BB incomeTax ≈ 3000, got ${incomeTaxBB}`);
        if (Math.abs(scBB - 600) > 1) errors.push(`Expected BB SC ≈ 600, got ${scBB}`);
        if (trailingIncomeTaxAA > 0) {
          errors.push(`Expected no trailing AA source tax in baseline, but got ${trailingIncomeTaxAA}`);
        }
        if (trailingScAA > 0) {
          errors.push(`Expected no trailing AA source SC in baseline, but got ${trailingScAA}`);
        }
      }
    }

    // --- Scenario 2: Trailing Enabled ---
    {
      const TOY_AA_TRAILING = deepClone(TOY_AA);
      TOY_AA_TRAILING.residencyRules.postEmigrationTaxYears = 2;

      const params = microParams({ 
        startingAge: 30,
        targetAge: 33, 
        relocationEnabled: true,
        StartCountry: 'aa',
        initialSavings: 0
      });
      
      const events = [
        { type: 'MV', id: 'move', name: 'bb', fromAge: 31, toAge: 31, label: 'Move to BB' },
        { type: 'SI', id: 'salary_bb_source', amount: 20000, fromAge: 32, toAge: 32, currency: 'BBB', linkedCountry: 'bb' }
      ];

      const scenarioDef = {
        name: 'E_TrailingCGT_Enabled',
        scenario: { parameters: params, events: events },
        assertions: []
      };

      const framework = new TestFramework();
      framework.loadScenario(scenarioDef);
      installTestTaxRules(framework, { aa: TOY_AA_TRAILING, bb: TOY_BB });
      const results = await framework.runSimulation();

      if (!results.success) {
        errors.push(`Enabled trailing simulation failed at age ${results.failedAt}`);
      } else {
        const row32 = results.dataSheet.find(r => r && r.age === 32);
        const incomeTaxBB = row32 ? (row32.taxByKey.incomeTax || 0) : 0;
        const scBB = row32 ? (row32.taxByKey.sc || 0) : 0;
        const trailingIncomeTaxAA = row32 ? (row32.taxByKey['incomeTax:aa'] || 0) : 0;
        const trailingScAA = row32 ? (row32.taxByKey['sc:aa'] || 0) : 0;
        // What is tested:
        // With trailing enabled (2 years), AA still taxes BB-source salary after move.
        //
        // Hand math:
        // BB residence taxes (same as baseline): IT 3,000 and SC 600.
        // AA trailing source taxes on same 20,000 base:
        // AA IT = 20,000 * 0.10 = 2,000
        // AA SC = 20,000 * 0.05 = 1,000
        if (Math.abs(incomeTaxBB - 3000) > 1) errors.push(`Expected BB incomeTax ≈ 3000, got ${incomeTaxBB}`);
        if (Math.abs(scBB - 600) > 1) errors.push(`Expected BB SC ≈ 600, got ${scBB}`);
        if (Math.abs(trailingIncomeTaxAA - 2000) > 1) errors.push(`Expected trailing AA incomeTax:aa ≈ 2000, got ${trailingIncomeTaxAA}`);
        if (Math.abs(trailingScAA - 1000) > 1) errors.push(`Expected trailing AA sc:aa ≈ 1000, got ${trailingScAA}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
