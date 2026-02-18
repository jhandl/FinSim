const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');
const IE_RULES = require('../src/core/config/tax-rules-ie.json');

function approxEqual(a, b, eps) {
  return Math.abs(a - b) <= eps;
}

module.exports = {
  name: 'MixedPortfolioRegimeAware',
  description: 'Verifies that MixedInvestmentAsset legs respond independently to economic regimes (e.g. recession affects equity leg differently than bond leg).',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // Setup base params
    const baseParams = {
      startingAge: 30,
      targetAge: 32,
      retirementAge: 65,
      initialSavings: 1000,
      emergencyStash: 0,
      inflation: 0,
      StartCountry: 'ie',
      simulation_mode: 'single',
      priorityCash: 1,
      priorityPension: 4,
      priorityFunds: 2,
      priorityShares: 3,
      investmentAllocationsByCountry: { ie: { indexFunds_ie: 1, shares_ie: 0 } },
      
      // Asset definitions
      GlobalAssetGrowth_globalEquity: 10,
      GlobalAssetVolatility_globalEquity: 0,
      GlobalAssetGrowth_globalBonds: 0,
      GlobalAssetVolatility_globalBonds: 0,
      
      // Mix config (fixed 50/50)
      MixConfig_ie_indexFunds_type: 'fixed',
      MixConfig_ie_indexFunds_asset1: 'globalEquity',
      MixConfig_ie_indexFunds_asset2: 'globalBonds',
      MixConfig_ie_indexFunds_startAsset1Pct: 50,
      MixConfig_ie_indexFunds_endAsset1Pct: 50
    };

    // Helper to run simulation
    async function run(paramsOverride, forceRegime) {
      const framework = new TestFramework();
      const params = Object.assign({}, baseParams, paramsOverride);
      
      // Force regime if provided
      if (forceRegime) {
        framework.forceRegime = forceRegime;
      }
      
      framework.loadScenario({
        name: 'RegimeTest',
        scenario: { parameters: params, events: [] },
        assertions: []
      });
      installTestTaxRules(framework, { ie: deepClone(IE_RULES) });
      
      // Inject forceRegime logic into simulator context if needed
      // (TestFramework doesn't natively support forcing regime easily without mocking EconomicRegimeModel)
      // BUT, we can mock EconomicRegimeModel in the test framework context or use a trick.
      // Easiest is to set `currentEconomicRegime` directly after init if framework allows.
      // Since we can't easily hook into the run loop from here without framework support,
      // we'll rely on `economicRegimesEnabled` and a mock regime model or just assume 
      // the test setup allows injecting the regime.
      // Actually, standard Simulator uses EconomicRegimeModel.
      // We can use a trick: override `EconomicRegimeModel` prototype in the sandbox.
      
      if (forceRegime) {
        const vm = require('vm');
        const code = `
          EconomicRegimeModel.prototype.sampleStartingRegime = function() { return ${JSON.stringify(forceRegime)}; };
          EconomicRegimeModel.prototype.getNextRegime = function() { return ${JSON.stringify(forceRegime)}; };
        `;
        vm.runInContext(code, framework.simulationContext);
      }
      
      const results = await framework.runSimulation();
      return { framework, results };
    }

    // 1. Test Deterministic Mode (Regimes Ignored)
    // Equity grows 10%, Bonds 0%. 50/50 split.
    // 1000 -> 500 eq, 500 bond.
    // Year 1: 500 * 1.1 = 550, 500 * 1.0 = 500. Total = 1050. Rebalanced -> 525 each.
    // Year 2: 525 * 1.1 = 577.5, 525 * 1.0 = 525. Total = 1102.5. Rebalanced -> 551.25 each.
    {
      const { framework, results } = await run({ economy_mode: 'deterministic', economicRegimesEnabled: false });
      if (!results.success) errors.push('Deterministic run failed');
      const asset = framework.simulationContext.investmentAssets.find(a => a.key === 'indexFunds_ie').asset;
      // Should be MixedInvestmentAsset
      if (!asset.leg1 || !asset.leg2) errors.push('Asset is not mixed in deterministic mode');
      const v1 = asset.leg1.capital();
      const v2 = asset.leg2.capital();
      // Allow slight drift or rebalance noise? 
      // With rebalance at end of year, it might reset. But capital() is called after addYear but before rebalance?
      // Actually Simulator calls handleInvestments (rebalance) then updateYearlyData.
      // So final state is post-rebalance.
      if (!approxEqual(v1, 551.25, 1) || !approxEqual(v2, 551.25, 1)) {
        errors.push(`Deterministic: expected ~551.25/551.25, got ${v1}/${v2}`);
      }
    }

    // 2. Test Monte Carlo with Forced Recession
    // Recession modifiers (from EconomicRegimeModel default or we define them):
    // Let's rely on the mock injecting a specific regime object.
    const RECESSION = {
      id: 'recession',
      equity: { meanModifier: -20, volatilityMultiplier: 1.5 }, // Equity -20%
      bond: { meanModifier: 5, volatilityMultiplier: 1.0 }      // Bonds +5%
    };
    
    // Equity (10% base) - 20% = -10%
    // Bonds (0% base) + 5% = +5%
    // Year 1: 500 * 0.9 = 450, 500 * 1.05 = 525. Total = 975. Rebalanced -> 487.5 each.
    // Year 2: 487.5 * 0.9 = 438.75, 487.5 * 1.05 = 511.875. Total = 950.625. Rebalanced -> 475.3125 each.
    {
      const { framework, results } = await run({ 
        economy_mode: 'montecarlo', 
        economicRegimesEnabled: true,
        monteCarloRuns: 1,
        // Ensure volatility is zero so we only test mean shift
        GlobalAssetVolatility_globalEquity: 0,
        GlobalAssetVolatility_globalBonds: 0
      }, RECESSION);
      
      if (!results.success) errors.push('Recession run failed');
      const asset = framework.simulationContext.investmentAssets.find(a => a.key === 'indexFunds_ie').asset;
      const v1 = asset.leg1.capital();
      const v2 = asset.leg2.capital();
      
      if (!approxEqual(v1 + v2, 950.625, 2)) {
         errors.push(`Recession: expected total ~950.625, got ${v1+v2}`);
      }
      // Check legs are roughly equal (rebalanced)
      if (!approxEqual(v1, 475.3125, 2) || !approxEqual(v2, 475.3125, 2)) {
        errors.push(`Recession: expected rebalanced ~475.3125 each, got ${v1}/${v2}`);
      }
    }

    return { success: errors.length === 0, errors: errors };
  }
};
