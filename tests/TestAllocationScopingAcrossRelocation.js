const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

module.exports = {
  name: 'AllocationScopingAcrossRelocation',
  description: 'Verifies investment allocations switch correctly when residence changes',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const errors = [];

    const scenarioDefinition = {
      name: 'AllocationRelocationScenario',
      description: 'IE to AR relocation with different investment allocations',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 40,
          retirementAge: 65,
          initialSavings: 100000,
          initialPension: 0,
          emergencyStash: 20000,
          inflation: 0.02,
          growthRatePension: 0.04,
          growthDevPension: 0,
          StartCountry: 'ie',
          simulation_mode: 'single',
          economy_mode: 'deterministic',
          relocationEnabled: true,
          priorityCash: 1,
          priorityPension: 4,
          priorityFunds: 2,
          priorityShares: 3,
          // IE allocations: 60% indexFunds_ie, 40% shares_ie
          investmentAllocationsByCountry: {
            ie: {
              indexFunds_ie: 0.6,
              shares_ie: 0.4
            },
            ar: {
              merval_ar: 0.8,
              cedear_ar: 0.2
            }
          },
          investmentGrowthRatesByKey: {
            indexFunds_ie: 0,
            shares_ie: 0,
            merval_ar: 0,
            cedear_ar: 0
          },
          investmentVolatilitiesByKey: {
            indexFunds_ie: 0,
            shares_ie: 0,
            merval_ar: 0,
            cedear_ar: 0
          },
          initialCapitalByKey: {
            indexFunds_ie: 30000,
            shares_ie: 20000
          }
        },
        events: [
          { type: 'SI', id: 'IE_Salary', amount: 60000, fromAge: 30, toAge: 34, rate: 0.03, currency: 'EUR' },
          { type: 'E', id: 'IE_Life', amount: 30000, fromAge: 30, toAge: 34, currency: 'EUR' },
          { type: 'MV-ar', id: 'Move_AR', amount: 0, fromAge: 35, toAge: 35 },
          { type: 'SI', id: 'AR_Salary', amount: 200000000, fromAge: 35, toAge: 40, rate: 0.02, currency: 'ARS' },
          { type: 'E', id: 'AR_Life', amount: 20000000, fromAge: 35, toAge: 40, currency: 'ARS' }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenarioDefinition)) {
      return { success: false, errors: ['Failed to load scenario'] };
    }

    installTestTaxRules(framework, {
      ie: deepClone(IE_RULES),
      ar: deepClone(AR_RULES)
    });

    const results = await framework.runSimulation();
    if (!results || !results.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const rows = results.dataSheet.filter(row => row && typeof row === 'object');

    // Find rows before and after relocation
    const row34 = rows.find(r => r.age === 34); // Last IE year
    const row35 = rows.find(r => r.age === 35); // First AR year
    const row36 = rows.find(r => r.age === 36); // Second AR year

    if (!row34 || !row35 || !row36) {
      return { success: false, errors: ['Missing key age rows'] };
    }

    if (!row34.investmentCapitalByKey || !row35.investmentCapitalByKey || !row36.investmentCapitalByKey) {
      return { success: false, errors: ['Missing investmentCapitalByKey on key age rows'] };
    }

    const ieFunds34 = row34.investmentCapitalByKey.indexFunds_ie;
    const ieShares34 = row34.investmentCapitalByKey.shares_ie;
    const ieFunds35 = row35.investmentCapitalByKey.indexFunds_ie;
    const ieShares35 = row35.investmentCapitalByKey.shares_ie;
    const ieFunds36 = row36.investmentCapitalByKey.indexFunds_ie;
    const ieShares36 = row36.investmentCapitalByKey.shares_ie;
    const arFunds35 = row35.investmentCapitalByKey.merval_ar;
    const arShares35 = row35.investmentCapitalByKey.cedear_ar;
    const arFunds36 = row36.investmentCapitalByKey.merval_ar;
    const arShares36 = row36.investmentCapitalByKey.cedear_ar;

    if (typeof ieFunds34 !== 'number' || typeof ieShares34 !== 'number') {
      return { success: false, errors: ['Missing IE capital keys in investmentCapitalByKey at age 34'] };
    }
    if (typeof ieFunds35 !== 'number' || typeof ieFunds36 !== 'number' || typeof ieShares35 !== 'number' || typeof ieShares36 !== 'number') {
      return { success: false, errors: ['Missing IE capital keys in investmentCapitalByKey at age 35/36'] };
    }
    if (typeof arFunds35 !== 'number' || typeof arShares35 !== 'number' || typeof arFunds36 !== 'number' || typeof arShares36 !== 'number') {
      const keys35 = Object.keys(row35.investmentCapitalByKey || {}).sort().join(', ');
      const keys36 = Object.keys(row36.investmentCapitalByKey || {}).sort().join(', ');
      return { success: false, errors: ['Missing AR capital keys in investmentCapitalByKey at age 35/36. Keys age35: [' + keys35 + '], age36: [' + keys36 + ']'] };
    }

    // Verify IE allocations were used pre-relocation
    if (ieFunds34 <= ieShares34) {
      errors.push('Pre-relocation: indexFunds_ie should be larger (60% vs 40% allocation)');
    }

    // Verify AR allocations were used post-relocation
    // Note: Avoid using year-over-year growth deltas here because values are reported in residence currency,
    // and FX changes can shift capital values even without contributions (especially for USD-denominated assets).
    // Instead, assert that AR assets were funded in the first AR year and are in ~80/20 ratio.
    if (arFunds35 <= 0) {
      errors.push('Post-relocation: merval_ar should be funded in the first AR year (80% allocation)');
    }
    if (arShares35 <= 0) {
      errors.push('Post-relocation: cedear_ar should be funded in the first AR year (20% allocation)');
    }
    if (arFunds35 < arShares35 * 3) {
      errors.push('Post-relocation: merval_ar should be ~4x cedear_ar in first AR year (80% vs 20%)');
    }

    return { success: errors.length === 0, errors };
  }
};
