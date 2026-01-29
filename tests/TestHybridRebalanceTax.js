const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');

function approxEqual(a, b, eps) {
  return Math.abs(a - b) <= eps;
}

function getRowByAge(results, age) {
  if (!results || !results.dataSheet) return null;
  const rows = results.dataSheet.filter(row => row && typeof row === 'object');
  return rows.find(r => r.age === age) || null;
}

function buildParams(overrides) {
  const base = {
    startingAge: 30,
    targetAge: 32,
    retirementAge: 65,
    initialSavings: 0,
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
    GlobalAssetGrowth_globalEquity: 0.1,
    GlobalAssetGrowth_globalBonds: 0,
    GlobalAssetVolatility_globalEquity: 0,
    GlobalAssetVolatility_globalBonds: 0,
    MixConfig_ie_indexFunds_type: 'fixed',
    MixConfig_ie_indexFunds_asset1: 'globalEquity',
    MixConfig_ie_indexFunds_asset2: 'globalBonds',
    MixConfig_ie_indexFunds_startAsset1Pct: 60,
    MixConfig_ie_indexFunds_endAsset1Pct: 60
  };
  return Object.assign(base, overrides || {});
}

async function runScenario(parameters, events) {
  const framework = new TestFramework();
  const scenarioDefinition = {
    name: 'HybridRebalanceScenario',
    description: 'Hybrid rebalance tax scenarios',
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
    ie: deepClone(IE_RULES)
  });

  const results = await framework.runSimulation();
  return { framework: framework, results: results, error: null };
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

    let holdingCapital = holding.principal.amount + holding.interest.amount;
    if (holding.principal.currency !== context.residenceCurrency || holding.principal.country !== context.currentCountry) {
      holdingCapital = context.convertCurrencyAmount(
        holdingCapital,
        holding.principal.currency,
        holding.principal.country,
        context.residenceCurrency,
        context.currentCountry,
        context.year,
        true
      );
    }
    if (isAsset1) v1 += holdingCapital;
    if (isAsset2) v2 += holdingCapital;
  }

  return { v1: v1, v2: v2, total: v1 + v2 };
}

module.exports = {
  name: 'Hybrid Rebalance Tax',
  description: 'Validates hybrid rebalancing for mix-enabled assets with tax behavior.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // Surplus corrects drift (no tax)
    {
      const params = buildParams({
        initialSavings: 1000,
        investmentAllocationsByCountry: { ie: { indexFunds_ie: 0.5, shares_ie: 0 } },
        MixConfig_ie_indexFunds_startAsset1Pct: 60,
        MixConfig_ie_indexFunds_endAsset1Pct: 60
      });
      const events = [
        { type: 'SI', id: 'Salary_Surplus', amount: 100000, fromAge: 32, toAge: 32, rate: 0, match: 0 }
      ];

      const { framework, results, error } = await runScenario(params, events);
      if (error || !results || !results.success) {
        errors.push('Surplus rebalance: simulation failed');
      } else {
        const entry = (framework.simulationContext.investmentAssets || []).find(e => e.key === 'indexFunds_ie');
        if (!entry || !entry.asset || !entry.asset.mixConfig) {
          errors.push('Surplus rebalance: mix asset missing');
        } else {
          if (entry.asset.yearlySold !== 0) {
            errors.push('Surplus rebalance: expected no sales, got sold=' + entry.asset.yearlySold);
          }
          const totals = getMixTotals(framework.simulationContext, entry);
          const pct1 = totals.total > 0 ? (totals.v1 / totals.total) : 0;
          if (!approxEqual(pct1, 0.6, 0.01)) {
            errors.push('Surplus rebalance: expected mix ≈ 60/40, got ' + (pct1 * 100).toFixed(2) + '%');
          }
        }
      }
    }

    // Surplus insufficient (minimal sell/tax)
    {
      const params = buildParams({
        initialSavings: 1000,
        investmentAllocationsByCountry: { ie: { indexFunds_ie: 1, shares_ie: 0 } },
        MixConfig_ie_indexFunds_startAsset1Pct: 60,
        MixConfig_ie_indexFunds_endAsset1Pct: 60
      });

      const { framework, results, error } = await runScenario(params, []);
      if (error || !results || !results.success) {
        errors.push('Sell rebalance: simulation failed');
      } else {
        const entry = (framework.simulationContext.investmentAssets || []).find(e => e.key === 'indexFunds_ie');
        const totals = entry ? getMixTotals(framework.simulationContext, entry) : null;
        const pct1 = totals && totals.total > 0 ? (totals.v1 / totals.total) : null;
        if (!entry || !entry.asset || !(entry.asset.yearlySold > 0)) {
          errors.push('Sell rebalance: expected sales from rebalancing');
        }
        if (pct1 === null || !approxEqual(pct1, 0.6, 0.01)) {
          errors.push('Sell rebalance: expected mix ≈ 60/40 after rebalance');
        }
      }
    }

    // Glide path progression
    {
      const params = buildParams({
        initialSavings: 1000,
        MixConfig_ie_indexFunds_type: 'glide',
        MixConfig_ie_indexFunds_startAge: 30,
        MixConfig_ie_indexFunds_targetAge: 40,
        MixConfig_ie_indexFunds_startAsset1Pct: 100,
        MixConfig_ie_indexFunds_endAsset1Pct: 60
      });

      const { framework, results, error } = await runScenario(params, []);
      if (error || !results || !results.success) {
        errors.push('Glide rebalance: simulation failed');
      } else {
        const entry = (framework.simulationContext.investmentAssets || []).find(e => e.key === 'indexFunds_ie');
        if (!entry || !entry.asset || !entry.asset.mixConfig) {
          errors.push('Glide rebalance: mix asset missing');
        } else {
          const target = framework.simulationContext.GlidePathCalculator.getCurrentMix(32, entry.asset.mixConfig);
          const totals = getMixTotals(framework.simulationContext, entry);
          const pct1 = totals.total > 0 ? (totals.v1 / totals.total) : 0;
          const targetPct = target ? (target.asset1Pct / 100) : 0;
          if (!approxEqual(pct1, targetPct, 0.01)) {
            errors.push('Glide rebalance: expected mix ≈ ' + (targetPct * 100).toFixed(2) + '%, got ' + (pct1 * 100).toFixed(2) + '%');
          }
        }
      }
    }

    // Fixed mix (no glide)
    {
      const params = buildParams({
        initialSavings: 1000,
        MixConfig_ie_indexFunds_startAsset1Pct: 80,
        MixConfig_ie_indexFunds_endAsset1Pct: 80
      });

      const { framework, results, error } = await runScenario(params, []);
      if (error || !results || !results.success) {
        errors.push('Fixed rebalance: simulation failed');
      } else {
        const entry = (framework.simulationContext.investmentAssets || []).find(e => e.key === 'indexFunds_ie');
        const totals = entry ? getMixTotals(framework.simulationContext, entry) : null;
        const pct1 = totals && totals.total > 0 ? (totals.v1 / totals.total) : null;
        if (pct1 === null || !approxEqual(pct1, 0.8, 0.01)) {
          errors.push('Fixed rebalance: expected mix ≈ 80/20');
        }
      }
    }

    // Tolerance check
    {
      const params = buildParams({
        initialSavings: 1000,
        GlobalAssetGrowth_globalEquity: 0.0001,
        GlobalAssetGrowth_globalBonds: 0,
        MixConfig_ie_indexFunds_startAsset1Pct: 60,
        MixConfig_ie_indexFunds_endAsset1Pct: 60
      });

      const { framework, results, error } = await runScenario(params, []);
      if (error || !results || !results.success) {
        errors.push('Tolerance rebalance: simulation failed');
      } else {
        const entry = (framework.simulationContext.investmentAssets || []).find(e => e.key === 'indexFunds_ie');
        if (entry && entry.asset && entry.asset.yearlySold !== 0) {
          errors.push('Tolerance rebalance: expected no sales, got sold=' + entry.asset.yearlySold);
        }
      }
    }

    // Legacy fallback (no mix config)
    {
      const params = buildParams({
        initialSavings: 1000,
        MixConfig_ie_indexFunds_type: null,
        MixConfig_ie_indexFunds_asset1: null,
        MixConfig_ie_indexFunds_asset2: null
      });

      const { framework, results, error } = await runScenario(params, []);
      if (error || !results || !results.success) {
        errors.push('Legacy fallback: simulation failed');
      } else {
        const entry = (framework.simulationContext.investmentAssets || []).find(e => e.key === 'indexFunds_ie');
        if (entry && entry.asset && entry.asset.yearlySold !== 0) {
          errors.push('Legacy fallback: expected no sales, got sold=' + entry.asset.yearlySold);
        }
      }
    }

    return { success: errors.length === 0, errors: errors };
  }
};
