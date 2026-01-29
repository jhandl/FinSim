const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');

function approxEqual(a, b, eps) {
  return Math.abs(a - b) <= eps;
}

function buildParams(overrides) {
  const base = {
    startingAge: 30,
    targetAge: 31,
    retirementAge: 70,
    initialSavings: 0,
    initialPension: 1000,
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
    investmentAllocationsByCountry: { ie: { indexFunds_ie: 0, shares_ie: 0 } },
    investmentGrowthRatesByKey: { indexFunds_ie: 0, shares_ie: 0 },
    investmentVolatilitiesByKey: { indexFunds_ie: 0, shares_ie: 0 },
    GlobalAssetGrowth_globalEquity: 0.1,
    GlobalAssetGrowth_globalBonds: 0,
    GlobalAssetVolatility_globalEquity: 0,
    GlobalAssetVolatility_globalBonds: 0,
    pensionContributionsByCountry: { ie: { p1Pct: 1, capped: 'No' } },
    MixConfig_ie_pensionP1_type: 'fixed',
    MixConfig_ie_pensionP1_asset1: 'globalEquity',
    MixConfig_ie_pensionP1_asset2: 'globalBonds',
    MixConfig_ie_pensionP1_startAsset1Pct: 60,
    MixConfig_ie_pensionP1_endAsset1Pct: 60
  };
  return Object.assign(base, overrides || {});
}

async function runScenario(parameters, events) {
  const framework = new TestFramework();
  const scenarioDefinition = {
    name: 'PensionMixScenario',
    description: 'Pension mix/glide test scenario',
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

function getPotHoldingsByMix(pot, mixConfig) {
  const matchTolerance = 0.0001;
  let count1 = 0;
  let count2 = 0;
  for (let i = 0; i < pot.portfolio.length; i++) {
    const holding = pot.portfolio[i];
    if (typeof holding.growth !== 'number' || typeof holding.stdev !== 'number') continue;
    const isAsset1 = Math.abs(holding.growth - mixConfig.asset1Growth) < matchTolerance &&
      Math.abs(holding.stdev - mixConfig.asset1Vol) < matchTolerance;
    const isAsset2 = Math.abs(holding.growth - mixConfig.asset2Growth) < matchTolerance &&
      Math.abs(holding.stdev - mixConfig.asset2Vol) < matchTolerance;
    if (isAsset1) count1++;
    if (isAsset2) count2++;
  }
  return { count1: count1, count2: count2 };
}

module.exports = {
  name: 'PensionMixRebalance',
  description: 'Validates pension mix config application and tax-advantaged rebalancing.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // P1: Mix-applied buys + tax-advantaged rebalancing
    {
      const params = buildParams();
      const events = [
        { type: 'SI', id: 'Salary_IE', amount: 100000, fromAge: 30, toAge: 30, rate: 0, match: 0 }
      ];
      const { framework, results, error } = await runScenario(params, events);
      if (error || !results || !results.success) {
        errors.push('P1 pension mix: simulation failed');
      } else {
        const pot = framework.simulationContext.person1.pensions.ie;
        if (!pot || !pot.mixConfig) {
          errors.push('P1 pension mix: missing pension pot mix config');
        } else {
          const counts = getPotHoldingsByMix(pot, pot.mixConfig);
          if (counts.count1 === 0 || counts.count2 === 0) {
            errors.push('P1 pension mix: expected holdings for both mix assets');
          }
          if (!(pot.yearlySold > 0)) {
            errors.push('P1 pension mix: expected rebalancing sales');
          }
          const priv = framework.simulationContext.revenue.privatePensionP1;
          if (!approxEqual(priv, 0, 0.0001)) {
            errors.push('P1 pension mix: expected no pension tax during rebalancing, got ' + priv);
          }
        }
      }
    }

    // P2: Per-person mix config keys
    {
      const params = buildParams({
        simulation_mode: 'couple',
        p2StartingAge: 30,
        p2RetirementAge: 70,
        initialPensionP2: 500,
        pensionContributionsByCountry: { ie: { p1Pct: 1, p2Pct: 1, capped: 'No' } },
        MixConfig_ie_pensionP2_type: 'fixed',
        MixConfig_ie_pensionP2_asset1: 'globalBonds',
        MixConfig_ie_pensionP2_asset2: 'globalEquity',
        MixConfig_ie_pensionP2_startAsset1Pct: 80,
        MixConfig_ie_pensionP2_endAsset1Pct: 80
      });
      const { framework, results, error } = await runScenario(params, []);
      if (error || !results || !results.success) {
        errors.push('P2 pension mix: simulation failed');
      } else {
        const p1Pot = framework.simulationContext.person1.pensions.ie;
        const p2Pot = framework.simulationContext.person2.pensions.ie;
        if (!p1Pot || !p2Pot) {
          errors.push('P2 pension mix: missing pension pots');
        } else {
          if (p1Pot.mixConfig.baseKey !== 'pensionP1' || p2Pot.mixConfig.baseKey !== 'pensionP2') {
            errors.push('P2 pension mix: expected per-person mix base keys');
          }
          if (p1Pot.mixConfig.asset1 !== 'globalEquity' || p2Pot.mixConfig.asset1 !== 'globalBonds') {
            errors.push('P2 pension mix: expected per-person mix assets');
          }
        }
      }
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};
