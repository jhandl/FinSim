const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');

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

async function runScenario(parameters, events, name) {
  const framework = new TestFramework();
  const scenarioDefinition = {
    name: name || 'EconomicSensitivityScenario',
    description: 'Economic parameter sensitivity scenario',
    scenario: { parameters: parameters, events: events || [] },
    assertions: []
  };

  if (!framework.loadScenario(scenarioDefinition)) {
    return { framework: framework, results: null, error: 'Failed to load scenario' };
  }

  installTestTaxRules(framework, { ie: deepClone(IE_RULES) });
  const results = await framework.runSimulation();
  return { framework: framework, results: results, error: null };
}

async function computeRange(parameters, runs) {
  const values = [];
  for (let i = 0; i < runs; i++) {
    const { results, error } = await runScenario(parameters, [], 'EconomicSensitivityRange');
    if (error || !results || !results.success) continue;
    const value = getFinalInvestment(results, 'indexFunds_ie');
    if (typeof value === 'number') values.push(value);
  }
  if (!values.length) return null;
  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const range = max - min;
  return { min: min, max: max, range: range };
}

module.exports = {
  name: 'EconomicParameterSensitivity',
  description: 'Validates sensitivity to global/local growth, mix strategy differences, and volatility impacts.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // Global asset growth sensitivity
    {
      const baseParams = {
        startingAge: 30,
        targetAge: 40,
        retirementAge: 65,
        initialSavings: 0,
        initialFunds: 10000,
        initialShares: 0,
        emergencyStash: 0,
        FundsAllocation: 1,
        SharesAllocation: 0,
        inflation: 0,
        priorityCash: 1,
        priorityPension: 4,
        priorityFunds: 2,
        priorityShares: 3,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economy_mode: 'deterministic',
        GlobalAssetVolatility_globalEquity: 0
      };

      const lowParams = Object.assign({}, baseParams, { GlobalAssetGrowth_globalEquity: 5 });
      const highParams = Object.assign({}, baseParams, { GlobalAssetGrowth_globalEquity: 10 });

      const low = await runScenario(lowParams, [], 'GlobalGrowthLow');
      const high = await runScenario(highParams, [], 'GlobalGrowthHigh');

      const lowVal = low.results ? getFinalInvestment(low.results, 'indexFunds_ie') : null;
      const highVal = high.results ? getFinalInvestment(high.results, 'indexFunds_ie') : null;

      if (low.error || !low.results || !low.results.success) {
        errors.push('Global growth low scenario failed to run');
      } else if (typeof lowVal !== 'number') {
        errors.push('Global growth low scenario missing indexFunds_ie value');
      }

      if (high.error || !high.results || !high.results.success) {
        errors.push('Global growth high scenario failed to run');
      } else if (typeof highVal !== 'number') {
        errors.push('Global growth high scenario missing indexFunds_ie value');
      }

      if (typeof lowVal === 'number' && typeof highVal === 'number' && highVal <= lowVal) {
        errors.push('Expected higher GlobalAssetGrowth_globalEquity to increase indexFunds_ie capital');
      }
    }

    // Local wrapper growth sensitivity
    {
      const baseParams = {
        startingAge: 30,
        targetAge: 40,
        retirementAge: 65,
        initialSavings: 0,
        initialFunds: 0,
        initialShares: 10000,
        emergencyStash: 0,
        FundsAllocation: 0,
        SharesAllocation: 1,
        inflation: 0,
        priorityCash: 1,
        priorityPension: 4,
        priorityFunds: 2,
        priorityShares: 3,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economy_mode: 'deterministic',
        GlobalAssetGrowth_globalEquity: 0,
        GlobalAssetVolatility_globalEquity: 0
      };

      const lowParams = Object.assign({}, baseParams, {
        investmentGrowthRatesByKey: { shares_ie: 0.05 },
        investmentVolatilitiesByKey: { shares_ie: 0 }
      });
      const highParams = Object.assign({}, baseParams, {
        investmentGrowthRatesByKey: { shares_ie: 0.10 },
        investmentVolatilitiesByKey: { shares_ie: 0 }
      });

      const low = await runScenario(lowParams, [], 'LocalGrowthLow');
      const high = await runScenario(highParams, [], 'LocalGrowthHigh');

      const lowVal = low.results ? getFinalInvestment(low.results, 'shares_ie') : null;
      const highVal = high.results ? getFinalInvestment(high.results, 'shares_ie') : null;

      if (low.error || !low.results || !low.results.success) {
        errors.push('Local growth low scenario failed to run');
      } else if (typeof lowVal !== 'number') {
        errors.push('Local growth low scenario missing shares_ie value');
      }

      if (high.error || !high.results || !high.results.success) {
        errors.push('Local growth high scenario failed to run');
      } else if (typeof highVal !== 'number') {
        errors.push('Local growth high scenario missing shares_ie value');
      }

      if (typeof lowVal === 'number' && typeof highVal === 'number' && highVal <= lowVal) {
        errors.push('Expected higher local wrapper growth to increase shares_ie capital');
      }
    }

    // Fixed mix vs glide path
    {
      const baseParams = {
        startingAge: 30,
        targetAge: 31,
        retirementAge: 65,
        initialSavings: 1000,
        initialPension: 0,
        emergencyStash: 0,
        inflation: 0,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economy_mode: 'deterministic',
        priorityCash: 1,
        priorityPension: 4,
        priorityFunds: 2,
        priorityShares: 3,
        investmentAllocationsByCountry: { ie: { indexFunds_ie: 1, shares_ie: 0 } },
        investmentGrowthRatesByKey: { shares_ie: 0 },
        investmentVolatilitiesByKey: { shares_ie: 0 },
        GlobalAssetGrowth_globalEquity: 10,
        GlobalAssetGrowth_globalBonds: 0,
        GlobalAssetVolatility_globalEquity: 0,
        GlobalAssetVolatility_globalBonds: 0,
        MixConfig_ie_indexFunds_asset1: 'globalEquity',
        MixConfig_ie_indexFunds_asset2: 'globalBonds'
      };

      const fixedParams = Object.assign({}, baseParams, {
        MixConfig_ie_indexFunds_type: 'fixed',
        MixConfig_ie_indexFunds_startAsset1Pct: 50,
        MixConfig_ie_indexFunds_endAsset1Pct: 50
      });

      const glideParams = Object.assign({}, baseParams, {
        MixConfig_ie_indexFunds_type: 'glide',
        MixConfig_ie_indexFunds_startAge: 30,
        MixConfig_ie_indexFunds_targetAge: 31,
        MixConfig_ie_indexFunds_startAsset1Pct: 100,
        MixConfig_ie_indexFunds_endAsset1Pct: 0
      });

      const fixed = await runScenario(fixedParams, [], 'MixFixed');
      const glide = await runScenario(glideParams, [], 'MixGlide');

      const fixedVal = fixed.results ? getFinalInvestment(fixed.results, 'indexFunds_ie') : null;
      const glideVal = glide.results ? getFinalInvestment(glide.results, 'indexFunds_ie') : null;

      if (fixed.error || !fixed.results || !fixed.results.success) {
        errors.push('Fixed mix scenario failed to run');
      } else if (typeof fixedVal !== 'number') {
        errors.push('Fixed mix scenario missing indexFunds_ie value');
      }

      if (glide.error || !glide.results || !glide.results.success) {
        errors.push('Glide mix scenario failed to run');
      } else if (typeof glideVal !== 'number') {
        errors.push('Glide mix scenario missing indexFunds_ie value');
      }

      if (typeof fixedVal === 'number' && typeof glideVal === 'number' && glideVal <= fixedVal) {
        errors.push('Expected glide path to produce different allocation outcome vs fixed mix');
      }
    }

    // Volatility impact (Monte Carlo range)
    {
      const baseParams = {
        startingAge: 30,
        targetAge: 40,
        retirementAge: 65,
        initialSavings: 0,
        initialFunds: 10000,
        initialShares: 0,
        emergencyStash: 0,
        FundsAllocation: 1,
        SharesAllocation: 0,
        inflation: 0,
        priorityCash: 1,
        priorityPension: 4,
        priorityFunds: 2,
        priorityShares: 3,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economy_mode: 'montecarlo',
        economyMode: 'montecarlo',
        monteCarloRuns: 200,
        GlobalAssetGrowth_globalEquity: 7
      };

      const lowParams = Object.assign({}, baseParams, { GlobalAssetVolatility_globalEquity: 0 });
      const highParams = Object.assign({}, baseParams, { GlobalAssetVolatility_globalEquity: 20 });

      const lowRange = await computeRange(lowParams, 4);
      const highRange = await computeRange(highParams, 4);

      if (!lowRange) {
        errors.push('Monte Carlo low-volatility range could not be computed');
      }
      if (!highRange) {
        errors.push('Monte Carlo high-volatility range could not be computed');
      }
      if (lowRange && highRange && highRange.range <= lowRange.range + 1e-3) {
        errors.push('Expected higher volatility to produce a wider range of outcomes');
      }
    }

    return { success: errors.length === 0, errors: errors };
  }
};
