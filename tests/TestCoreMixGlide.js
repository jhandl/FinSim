const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

function approxEqual(a, b, eps) {
  return Math.abs(a - b) <= eps;
}

function getRowByAge(results, age) {
  if (!results || !results.dataSheet) return null;
  const rows = results.dataSheet.filter(row => row && typeof row === 'object');
  return rows.find(r => r.age === age) || null;
}

function getMixTotals(context, entry) {
  const asset = entry.asset;
  const mixConfig = asset.mixConfig;
  const matchTolerance = 0.0001;
  let v1 = 0;
  let v2 = 0;
  for (let i = 0; i < asset.portfolio.length; i++) {
    const holding = asset.portfolio[i];
    if (typeof holding.growth !== 'number' || typeof holding.stdev !== 'number') continue;
    const isAsset1 = Math.abs(holding.growth - mixConfig.asset1Growth) < matchTolerance &&
      Math.abs(holding.stdev - mixConfig.asset1Vol) < matchTolerance;
    const isAsset2 = Math.abs(holding.growth - mixConfig.asset2Growth) < matchTolerance &&
      Math.abs(holding.stdev - mixConfig.asset2Vol) < matchTolerance;
    if (!isAsset1 && !isAsset2) continue;
    const holdingCapital = holding.principal.amount + holding.interest.amount;
    if (isAsset1) v1 += holdingCapital;
    if (isAsset2) v2 += holdingCapital;
  }
  return { v1: v1, v2: v2, total: v1 + v2 };
}

async function runScenario(parameters, events) {
  const framework = new TestFramework();
  const scenarioDefinition = {
    name: 'CoreMixGlideScenario',
    description: 'Core mix/glide test scenario',
    scenario: {
      parameters: parameters,
      events: events || []
    },
    assertions: []
  };

  if (!framework.loadScenario(scenarioDefinition)) {
    return { framework: framework, results: null, error: 'Failed to load scenario' };
  }

  installTestTaxRules(framework, {
    ie: deepClone(IE_RULES),
    ar: deepClone(AR_RULES)
  });

  const results = await framework.runSimulation();
  return { framework: framework, results: results, error: null };
}

module.exports = {
  name: 'CoreMixGlide',
  description: 'Validates core mix/glide path behavior, per-country config, and legacy fallback.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // Fixed mix: split contributions between assets with their own growth
    {
      const params = {
        startingAge: 30,
        targetAge: 31,
        retirementAge: 65,
        initialSavings: 1000,
        initialPension: 0,
        emergencyStash: 0,
        inflation: 0,
        growthRatePension: 0,
        growthDevPension: 0,
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
        MixConfig_ie_indexFunds_type: 'fixed',
        MixConfig_ie_indexFunds_asset1: 'globalEquity',
        MixConfig_ie_indexFunds_asset2: 'globalBonds',
        MixConfig_ie_indexFunds_startAsset1Pct: 50,
        MixConfig_ie_indexFunds_endAsset1Pct: 50
      };

      const { results, error } = await runScenario(params, []);
      if (error || !results || !results.success) {
        errors.push('Fixed mix: simulation failed');
      } else {
        const row31 = getRowByAge(results, 31);
        const cap = row31 && row31.investmentCapitalByKey ? row31.investmentCapitalByKey.indexFunds_ie : null;
        if (typeof cap !== 'number' || !approxEqual(cap, 1050, 0.01)) {
          errors.push('Fixed mix: expected indexFunds_ie ≈ 1050 at age 31, got ' + cap);
        }
      }
    }

    // Glide path: mix applied when buying contributions
    {
      const params = {
        startingAge: 30,
        targetAge: 31,
        retirementAge: 65,
        initialSavings: 1000,
        initialPension: 0,
        emergencyStash: 0,
        inflation: 0,
        growthRatePension: 0,
        growthDevPension: 0,
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
        MixConfig_ie_indexFunds_type: 'glide',
        MixConfig_ie_indexFunds_asset1: 'globalEquity',
        MixConfig_ie_indexFunds_asset2: 'globalBonds',
        MixConfig_ie_indexFunds_startAge: 30,
        MixConfig_ie_indexFunds_targetAge: 31,
        MixConfig_ie_indexFunds_startAsset1Pct: 100,
        MixConfig_ie_indexFunds_endAsset1Pct: 0
      };

      const { results, error } = await runScenario(params, []);
      if (error || !results || !results.success) {
        errors.push('Glide path: simulation failed');
      } else {
        const row31 = getRowByAge(results, 31);
        const cap31 = row31 && row31.investmentCapitalByKey ? row31.investmentCapitalByKey.indexFunds_ie : null;
        if (typeof cap31 !== 'number' || !approxEqual(cap31, 1100, 0.01)) {
          errors.push('Glide path: expected indexFunds_ie ≈ 1100 at age 31, got ' + cap31);
        }
      }
    }

    // Per-country mix config: assets use per-country settings
    {
      const params = {
        startingAge: 30,
        targetAge: 32,
        retirementAge: 65,
        initialSavings: 1000,
        initialPension: 0,
        emergencyStash: 0,
        inflation: 0,
        growthRatePension: 0,
        growthDevPension: 0,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economy_mode: 'deterministic',
        relocationEnabled: true,
        priorityCash: 1,
        priorityPension: 4,
        priorityFunds: 2,
        priorityShares: 3,
        investmentAllocationsByCountry: {
          ie: { indexFunds_ie: 1, shares_ie: 0 },
          ar: { merval_ar: 1, cedear_ar: 0 }
        },
        investmentGrowthRatesByKey: { merval_ar: 0, shares_ie: 0 },
        investmentVolatilitiesByKey: { merval_ar: 0, shares_ie: 0 },
        GlobalAssetGrowth_globalEquity: 10,
        GlobalAssetGrowth_globalBonds: 0,
        GlobalAssetVolatility_globalEquity: 0,
        GlobalAssetVolatility_globalBonds: 0,
        MixConfig_ie_indexFunds_type: 'fixed',
        MixConfig_ie_indexFunds_asset1: 'globalEquity',
        MixConfig_ie_indexFunds_asset2: 'globalBonds',
        MixConfig_ie_indexFunds_startAsset1Pct: 100,
        MixConfig_ar_merval_type: 'fixed',
        MixConfig_ar_merval_asset1: 'globalBonds',
        MixConfig_ar_merval_asset2: 'globalEquity',
        MixConfig_ar_merval_startAsset1Pct: 100
      };
      const events = [
        { type: 'MV-ar', id: 'Move_AR', amount: 0, fromAge: 31, toAge: 31 },
        { type: 'SI', id: 'AR_Salary', amount: 1000, fromAge: 31, toAge: 31, rate: 0, currency: 'ARS' },
        { type: 'E', id: 'AR_Life', amount: 0, fromAge: 31, toAge: 31, rate: 0, currency: 'ARS' }
      ];

      const { framework, results, error } = await runScenario(params, events);
      if (error || !results || !results.success) {
        errors.push('Per-country mix: simulation failed');
      } else {
        const assets = framework.simulationContext.investmentAssets || [];
        const ieEntry = assets.find(entry => entry && entry.key === 'indexFunds_ie');
        const arEntry = assets.find(entry => entry && entry.key === 'merval_ar');
        const ieHoldings = ieEntry && ieEntry.asset ? ieEntry.asset.portfolio || [] : [];
        const arHoldings = arEntry && arEntry.asset ? arEntry.asset.portfolio || [] : [];
        const ieGrowth = ieHoldings.length ? ieHoldings[0].growth : null;
        const arGrowth = arHoldings.length ? arHoldings[0].growth : null;
        if (typeof ieGrowth !== 'number' || !approxEqual(ieGrowth, 0.1, 0.0001)) {
          errors.push('Per-country mix: expected IE holding growth ≈ 0.1, got ' + ieGrowth);
        }
        if (typeof arGrowth !== 'number' || !approxEqual(arGrowth, 0, 0.0001)) {
          errors.push('Per-country mix: expected AR holding growth ≈ 0, got ' + arGrowth);
        }
      }
    }

    // Legacy fallback: no mix config uses per-asset growth rate
    {
      const params = {
        startingAge: 30,
        targetAge: 31,
        retirementAge: 65,
        initialSavings: 1000,
        initialPension: 0,
        emergencyStash: 0,
        inflation: 0,
        growthRatePension: 0,
        growthDevPension: 0,
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
        GlobalAssetGrowth_globalEquity: 7
      };

      const { results, error } = await runScenario(params, []);
      if (error || !results || !results.success) {
        errors.push('Legacy fallback: simulation failed');
      } else {
        const row31 = getRowByAge(results, 31);
        const cap = row31 && row31.investmentCapitalByKey ? row31.investmentCapitalByKey.indexFunds_ie : null;
        if (typeof cap !== 'number' || !approxEqual(cap, 1070, 0.01)) {
          errors.push('Legacy fallback: expected indexFunds_ie ≈ 1070 at age 31, got ' + cap);
        }
      }
    }

    // Hybrid rebalance: multi-year drift corrected with taxable sells
    {
      const params = {
        startingAge: 30,
        targetAge: 32,
        retirementAge: 65,
        initialSavings: 1000,
        initialPension: 0,
        emergencyStash: 0,
        inflation: 0,
        growthRatePension: 0,
        growthDevPension: 0,
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
        MixConfig_ie_indexFunds_type: 'fixed',
        MixConfig_ie_indexFunds_asset1: 'globalEquity',
        MixConfig_ie_indexFunds_asset2: 'globalBonds',
        MixConfig_ie_indexFunds_startAsset1Pct: 60,
        MixConfig_ie_indexFunds_endAsset1Pct: 60
      };

      const { framework, results, error } = await runScenario(params, []);
      if (error || !results || !results.success) {
        errors.push('Hybrid rebalance: simulation failed');
      } else {
        const entry = (framework.simulationContext.investmentAssets || []).find(e => e && e.key === 'indexFunds_ie');
        if (!entry || !entry.asset || !entry.asset.mixConfig) {
          errors.push('Hybrid rebalance: mix asset missing');
        } else {
          if (!(entry.asset.yearlySold > 0)) {
            errors.push('Hybrid rebalance: expected sales from rebalancing');
          }
          const totals = getMixTotals(framework.simulationContext, entry);
          const pct1 = totals.total > 0 ? (totals.v1 / totals.total) : 0;
          if (!approxEqual(pct1, 0.6, 0.01)) {
            errors.push('Hybrid rebalance: expected mix ≈ 60/40 after rebalance');
          }
        }
      }
    }

    return { success: errors.length === 0, errors: errors };
  }
};
