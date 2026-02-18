const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');
const vm = require('vm');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const GLOBAL_RULES = require('../src/core/config/tax-rules-global.json');

function getFinalRow(results) {
  if (!results || !Array.isArray(results.dataSheet)) return null;
  const rows = results.dataSheet.filter(row => row && typeof row === 'object');
  return rows.length ? rows[rows.length - 1] : null;
}

function getFinalInvestment(results, key) {
  const row = getFinalRow(results);
  if (!row || !row.investmentCapitalByKey) return null;
  const value = row.investmentCapitalByKey[key];
  return (typeof value === 'number') ? value : null;
}

async function runScenario(parameters, events, name, options) {
  const framework = new TestFramework();
  const scenarioDefinition = {
    name: name || 'EconomicRegimeScenario',
    description: 'Economic regime model test scenario',
    scenario: { parameters: parameters, events: events || [] },
    assertions: []
  };

  if (!framework.loadScenario(scenarioDefinition)) {
    return { framework: framework, results: null, error: 'Failed to load scenario' };
  }

  const globalRules = options && options.globalRules ? options.globalRules : deepClone(GLOBAL_RULES);
  const ieRules = options && options.ieRules ? options.ieRules : deepClone(IE_RULES);

  const originalEnsure = framework.ensureVMUIManagerMocks;
  framework.ensureVMUIManagerMocks = function(params, events) {
    originalEnsure.call(this, params, events);
    vm.runInContext('WebUI.getInstance().storeSimulationResults = function() {};', this.simulationContext);
  };

  // Patch global rules in the framework context
  framework.simulationContext.Config.prototype.getGlobalTaxRules = function() {
    return globalRules;
  };

  installTestTaxRules(framework, { ie: ieRules });

  if (options && options.beforeRun) {
    options.beforeRun(framework);
  }

  const results = await framework.runSimulation();
  return { framework: framework, results: results, error: null };
}

function forceRegime(framework, regimeKey) {
  vm.runInContext(`
    (function() {
      if (economicRegimesModel && economicRegimesModel.regimeMap["${regimeKey}"]) {
        currentEconomicRegime = economicRegimesModel.regimeMap["${regimeKey}"];
      }
    })();
  `, framework.simulationContext);
}

module.exports = {
  name: 'EconomicRegimeModel',
  description: 'Validates regime-aware growth modifiers, transition logic, and configuration safety.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    const baseParams = {
      startingAge: 30,
      targetAge: 35,
      retirementAge: 65,
      initialSavings: 0,
      initialFunds: 0,
      initialShares: 0,
      emergencyStash: 0,
      inflation: 0,
      StartCountry: 'ie',
      simulation_mode: 'single',
      economy_mode: 'montecarlo',
      economicRegimesEnabled: true,
      monteCarloRuns: 1,
      GlobalAssetGrowth_globalEquity: 7,
      GlobalAssetGrowth_globalBonds: 3,
      GlobalAssetVolatility_globalEquity: 0,
      GlobalAssetVolatility_globalBonds: 0,
      investmentAllocationsByCountry: { ie: { indexFunds_ie: 1 } }
    };

    // Test 1 — Equity modifier applied (recession)
    {
      const params = Object.assign({}, baseParams, {
        initialCapitalByKey: { indexFunds_ie: 10000 }
      });
      
      const baseline = await runScenario(Object.assign({}, params, { economicRegimesEnabled: false }), [], 'EquityBaseline');
      const regime = await runScenario(params, [], 'EquityRecession', {
        beforeRun: (fw) => {
          vm.runInContext(`
            var originalInitVars = initializeSimulationVariables;
            initializeSimulationVariables = function() {
              originalInitVars();
              if (economicRegimesModel && economicRegimesModel.regimeMap["recession"]) {
                currentEconomicRegime = economicRegimesModel.regimeMap["recession"];
              }
            };
          `, fw.simulationContext);
        }
      });

      const baseVal = getFinalInvestment(baseline.results, 'indexFunds_ie');
      const regimeVal = getFinalInvestment(regime.results, 'indexFunds_ie');

      if (!baseVal || !regimeVal) {
        errors.push('Equity test: Failed to get investment values');
      } else if (regimeVal >= baseVal) {
        errors.push('Expected recession regime to lower equity returns (modifier -20)');
      }
    }

    // Test 2 — Bond modifier applied (recession)
    {
      const params = Object.assign({}, baseParams, {
        initialCapitalByKey: { bondFunds_ie: 10000 },
        investmentAllocationsByCountry: { ie: { bondFunds_ie: 1 } }
      });
      
      // Patch IE rules to add bondFunds_ie
      const customIE = deepClone(IE_RULES);
      customIE.investmentTypes.push({
        key: "bondFunds_ie",
        label: "Bond Funds",
        baseRef: "globalBonds",
        taxation: { exitTax: { rate: 0.41 } }
      });

      const baseline = await runScenario(Object.assign({}, params, { economicRegimesEnabled: false }), [], 'BondBaseline', { ieRules: customIE });
      const regime = await runScenario(params, [], 'BondRecession', {
        ieRules: customIE,
        beforeRun: (fw) => {
          vm.runInContext(`
            var originalInitVars = initializeSimulationVariables;
            initializeSimulationVariables = function() {
              originalInitVars();
              if (economicRegimesModel && economicRegimesModel.regimeMap["recession"]) {
                currentEconomicRegime = economicRegimesModel.regimeMap["recession"];
              }
            };
          `, fw.simulationContext);
        }
      });

      const baseVal = getFinalInvestment(baseline.results, 'bondFunds_ie');
      const regimeVal = getFinalInvestment(regime.results, 'bondFunds_ie');

      if (!baseVal || !regimeVal) {
        errors.push('Bond test: Failed to get investment values');
      } else if (regimeVal <= baseVal) {
        errors.push('Expected recession regime to increase bond returns (modifier +6)');
      }
    }

    // Test 3 — Untagged asset unaffected
    {
      const params = Object.assign({}, baseParams, {
        initialCapitalByKey: { shares_ie: 10000 },
        investmentAllocationsByCountry: { ie: { shares_ie: 1 } },
        investmentGrowthRatesByKey: { shares_ie: 0.07 },
        investmentVolatilitiesByKey: { shares_ie: 0 }
      });

      const baseline = await runScenario(Object.assign({}, params, { economicRegimesEnabled: false }), [], 'UntaggedBaseline');
      const regime = await runScenario(params, [], 'UntaggedRecession', {
        beforeRun: (fw) => {
          vm.runInContext(`
            var originalInitVars = initializeSimulationVariables;
            initializeSimulationVariables = function() {
              originalInitVars();
              if (economicRegimesModel && economicRegimesModel.regimeMap["recession"]) {
                currentEconomicRegime = economicRegimesModel.regimeMap["recession"];
              }
            };
          `, fw.simulationContext);
        }
      });

      const baseVal = getFinalInvestment(baseline.results, 'shares_ie');
      const regimeVal = getFinalInvestment(regime.results, 'shares_ie');

      if (Math.abs(baseVal - regimeVal) > 1e-6) {
        errors.push('Expected untagged asset (shares_ie) to be unaffected by regimes');
      }
    }

    // Test 4 — Deterministic mode unaffected (Regression Guard)
    {
      const params = Object.assign({}, baseParams, {
        initialCapitalByKey: { indexFunds_ie: 10000 },
        economy_mode: 'deterministic',
        economyMode: 'deterministic'
      });

      const baseline = await runScenario(Object.assign({}, params, { economicRegimesEnabled: false }), [], 'DeterministicBaseline');
      const regime = await runScenario(params, [], 'DeterministicRegime');
      
      const baseVal = getFinalInvestment(baseline.results, 'indexFunds_ie');
      const regimeVal = getFinalInvestment(regime.results, 'indexFunds_ie');

      if (Math.abs(baseVal - regimeVal) > 1e-6) {
        errors.push('Expected deterministic mode to be unaffected by enabling economic regimes (Regression Guard failed)');
      }

      const regimeUsed = vm.runInContext('currentEconomicRegime', regime.framework.simulationContext);
      if (regimeUsed !== null) {
        errors.push('Expected currentEconomicRegime to be null in deterministic mode');
      }
    }

    // Test 5 — Invalid config: missing regime key in transitionMatrix (Comment 1)
    {
      const badGlobal = deepClone(GLOBAL_RULES);
      delete badGlobal.economicRegimes.transitionMatrix.stagnation;
      
      const params = Object.assign({}, baseParams, {
        initialCapitalByKey: { indexFunds_ie: 10000 }
      });

      const result = await runScenario(params, [], 'InvalidConfig_MissingRow', { globalRules: badGlobal });
      
      const hasErrors = vm.runInContext('errors', result.framework.simulationContext);
      if (!hasErrors) {
        errors.push('Expected missing transition matrix row to trigger simulator error');
      }
    }

    // Test 5b — Invalid config: extra regime key in transitionMatrix (Comment 1)
    {
      const badGlobal = deepClone(GLOBAL_RULES);
      badGlobal.economicRegimes.transitionMatrix.extra = { growth: 1, recession: 0, stagnation: 0 };
      
      const params = Object.assign({}, baseParams, {
        initialCapitalByKey: { indexFunds_ie: 10000 }
      });

      const result = await runScenario(params, [], 'InvalidConfig_ExtraRow', { globalRules: badGlobal });
      
      const hasErrors = vm.runInContext('errors', result.framework.simulationContext);
      if (!hasErrors) {
        errors.push('Expected extra transition matrix row to trigger simulator error');
      }
    }

    // Test 5c — Invalid config: invalid volatility multiplier (Comment 2)
    {
      const badGlobal = deepClone(GLOBAL_RULES);
      badGlobal.economicRegimes.regimes[0].equity.volatilityMultiplier = NaN;
      
      const params = Object.assign({}, baseParams, {
        initialCapitalByKey: { indexFunds_ie: 10000 }
      });

      const result = await runScenario(params, [], 'InvalidConfig_NaNVol', { globalRules: badGlobal });
      
      const hasErrors = vm.runInContext('errors', result.framework.simulationContext);
      if (!hasErrors) {
        errors.push('Expected NaN volatility multiplier to trigger simulator error');
      }
    }

    // Test 5d — Invalid meanModifier (NaN)
    {
      const badGlobal = deepClone(GLOBAL_RULES);
      badGlobal.economicRegimes.regimes[0].equity.meanModifier = NaN;
      
      const params = Object.assign({}, baseParams, {
        initialCapitalByKey: { indexFunds_ie: 10000 }
      });

      const result = await runScenario(params, [], 'InvalidConfig_NaNMean', { globalRules: badGlobal });
      
      const hasErrors = vm.runInContext('errors', result.framework.simulationContext);
      if (!hasErrors) {
        errors.push('Expected NaN meanModifier to trigger simulator error');
      }
    }

    // Test 5e — Out-of-bounds transition probability (negative)
    {
      const badGlobal = deepClone(GLOBAL_RULES);
      badGlobal.economicRegimes.transitionMatrix.growth.recession = -0.1;
      
      const params = Object.assign({}, baseParams, {
        initialCapitalByKey: { indexFunds_ie: 10000 }
      });

      const result = await runScenario(params, [], 'InvalidConfig_NegProb', { globalRules: badGlobal });
      
      const hasErrors = vm.runInContext('errors', result.framework.simulationContext);
      if (!hasErrors) {
        errors.push('Expected negative transition probability to trigger simulator error');
      }
    }

    // Test 5f — Zero-sum mean constraint violation
    {
      const badGlobal = deepClone(GLOBAL_RULES);
      badGlobal.economicRegimes.regimes[0].equity.meanModifier += 1;

      const params = Object.assign({}, baseParams, {
        initialCapitalByKey: { indexFunds_ie: 10000 }
      });

      const result = await runScenario(params, [], 'InvalidConfig_ZeroSum', { globalRules: badGlobal });
      const hasErrors = vm.runInContext('errors', result.framework.simulationContext);
      if (!hasErrors) {
        errors.push('Expected zero-sum mean constraint violation to trigger simulator error');
      }
    }

    // Test 6 — Regime variability with zero volatility
    {
      const params = Object.assign({}, baseParams, {
        initialCapitalByKey: { indexFunds_ie: 10000 },
        monteCarloRuns: 1,
        GlobalAssetVolatility_globalEquity: 0
      });

      const values = [];
      for (let i = 0; i < 10; i++) {
        const result = await runScenario(params, [], 'VariabilityRun' + i);
        const val = getFinalInvestment(result.results, 'indexFunds_ie');
        if (typeof val === 'number') values.push(val);
      }

      const allSame = values.length > 0 && values.every(v => Math.abs(v - values[0]) < 1e-6);
      if (allSame && values.length > 1) {
        errors.push('Expected regime transitions to produce variability across independent runs even with zero asset volatility');
      }
    }

    return { success: errors.length === 0, errors: errors };
  }
};
