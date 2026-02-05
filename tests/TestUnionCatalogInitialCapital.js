const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');
const vm = require('vm');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

module.exports = {
  name: 'UnionCatalogInitialCapital',
  description: 'Union catalog builds across countries but only StartCountry seeds initial capital',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const errors = [];

    const scenarioDefinition = {
      name: 'UnionCatalogInitialCapitalScenario',
      description: 'Start in IE, relocate to AR, seed initial capital across keys',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 40,
          retirementAge: 65,
          initialSavings: 0,
          initialPension: 0,
          emergencyStash: 0,
          inflation: 0.02,
          growthRatePension: 0.04,
          StartCountry: 'ie',
          simulation_mode: 'single',
          economy_mode: 'deterministic',
          relocationEnabled: true,
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
            indexFunds_ie: 10000,
            shares_ie: 5000,
            merval_ar: 8000, // Should NOT seed
            cedear_ar: 3000      // Should NOT seed
          }
        },
        events: [
          { type: 'MV-ar', id: 'move-ar', amount: 0, fromAge: 40, toAge: 40 }
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

    const ctx = framework.simulationContext;
    const keys = vm.runInContext('investmentAssets && investmentAssets.map(function(a){ return a && a.key; })', ctx) || [];
    const expectedKeys = ['indexFunds_ie', 'shares_ie', 'merval_ar', 'cedear_ar'];
    for (var ki = 0; ki < expectedKeys.length; ki++) {
      if (keys.indexOf(expectedKeys[ki]) === -1) {
        errors.push('Missing investment key in union catalog: ' + expectedKeys[ki]);
      }
    }

    const rows = (results.dataSheet || []).filter(function (r) { return r && typeof r === 'object'; });
    const startAge = scenarioDefinition.scenario.parameters.startingAge;
    const startRow = rows.find(function (r) { return r.age === startAge; });

    if (!startRow) {
      errors.push('Missing data row for starting age ' + startAge);
    } else {
      const caps = startRow.investmentCapitalByKey || {};

      function approxEqual(value, expected) {
        if (typeof value !== 'number') return false;
        return Math.abs(value - expected) < 0.01;
      }

      if (!approxEqual(caps.indexFunds_ie, 10000)) {
        errors.push('indexFunds_ie should seed to 10000; got ' + caps.indexFunds_ie);
      }
      if (!approxEqual(caps.shares_ie, 5000)) {
        errors.push('shares_ie should seed to 5000; got ' + caps.shares_ie);
      }

      if (typeof caps.merval_ar !== 'number') {
        errors.push('merval_ar capital missing or non-numeric');
      } else if (Math.abs(caps.merval_ar) > 0.01) {
        errors.push('merval_ar should remain zero; got ' + caps.merval_ar);
      }

      if (typeof caps.cedear_ar !== 'number') {
        errors.push('cedear_ar capital missing or non-numeric');
      } else if (Math.abs(caps.cedear_ar) > 0.01) {
        errors.push('cedear_ar should remain zero; got ' + caps.cedear_ar);
      }
    }

    return { success: errors.length === 0, errors };
  }
};
