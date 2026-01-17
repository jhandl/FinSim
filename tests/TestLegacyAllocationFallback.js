const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');

module.exports = {
  name: 'LegacyAllocationFallback',
  description: 'FundsAllocation/SharesAllocation fallback invests into namespaced StartCountry assets',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const errors = [];

    const scenarioDefinition = {
      name: 'LegacyAllocationFallbackScenario',
      description: 'No investmentAllocationsBy* provided; uses FundsAllocation/SharesAllocation',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 31,
          retirementAge: 65,
          StartCountry: 'ie',
          simulation_mode: 'single',
          economy_mode: 'deterministic',
          relocationEnabled: false,

          // Force an investable surplus without requiring income events.
          initialSavings: 100000,
          emergencyStash: 0,
          initialPension: 0,
          inflation: 0.0,

          // Legacy allocation knobs (no investmentAllocationsByCountry / ByKey)
          FundsAllocation: 0.6,
          SharesAllocation: 0.4,

          // Ensure assets exist (growth settings defaulting to 0 is fine)
          investmentGrowthRatesByKey: {
            indexFunds_ie: 0,
            shares_ie: 0
          },
          investmentVolatilitiesByKey: {
            indexFunds_ie: 0,
            shares_ie: 0
          }
        },
        events: []
      },
      assertions: []
    };

    if (!framework.loadScenario(scenarioDefinition)) {
      return { success: false, errors: ['Failed to load scenario'] };
    }

    installTestTaxRules(framework, {
      ie: deepClone(IE_RULES)
    });

    const results = await framework.runSimulation();
    if (!results || !results.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const rows = (results.dataSheet || []).filter(function (r) { return r && typeof r === 'object'; });
    const startAge = scenarioDefinition.scenario.parameters.startingAge;
    const startRow = rows.find(function (r) { return r.age === startAge; });
    if (!startRow) {
      return { success: false, errors: ['Missing data row for starting age ' + startAge] };
    }

    const caps = startRow.investmentCapitalByKey || {};
    const funds = caps.indexFunds_ie;
    const shares = caps.shares_ie;
    if (typeof funds !== 'number' || typeof shares !== 'number') {
      errors.push('Expected namespaced capital keys (indexFunds_ie, shares_ie) to exist on investmentCapitalByKey');
    } else {
      if (Math.abs(funds - 60000) > 0.01) errors.push('Expected indexFunds_ie ~= 60000, got ' + funds);
      if (Math.abs(shares - 40000) > 0.01) errors.push('Expected shares_ie ~= 40000, got ' + shares);
    }

    return { success: errors.length === 0, errors };
  }
};

