const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_F-HYBRID-REBAL',
  description: 'Verifies hybrid rebalance behavior with toy rules.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // Surplus rebalance: no sells
    {
      const params = microParams({
        targetAge: 30,
        StartCountry: 'aa',
        initialSavings: 1000,
        investmentAllocationsByCountry: { aa: { funds_aa: 1 } },
        investmentGrowthRatesByKey: { funds_aa: 0 },
        investmentVolatilitiesByKey: { funds_aa: 0 },
        GlobalAssetGrowth_globalEquity: 100,
        GlobalAssetGrowth_globalBonds: 0,
        GlobalAssetVolatility_globalEquity: 0,
        GlobalAssetVolatility_globalBonds: 0,
        MixConfig_aa_funds_type: 'fixed',
        MixConfig_aa_funds_asset1: 'globalEquity',
        MixConfig_aa_funds_asset2: 'globalBonds',
        MixConfig_aa_funds_startAsset1Pct: 60,
        MixConfig_aa_funds_endAsset1Pct: 60
      });

      const scenarioDef = {
        name: 'C_F-HYBRID-REBAL-SURPLUS',
        scenario: {
          parameters: params,
          events: [
            { type: 'SI', id: 'salary', amount: 100000, fromAge: 30, toAge: 30, rate: 0, match: 0 }
          ]
        },
        assertions: []
      };

      const framework = new TestFramework();
      framework.loadScenario(scenarioDef);
      installTestTaxRules(framework, { aa: TOY_AA });
      const results = await framework.runSimulation();

      if (!results.success) {
        errors.push('Surplus rebalance: simulation failed');
      } else {
        const entry = (framework.simulationContext.investmentAssets || []).find(e => e && e.key === 'funds_aa');
        if (!entry || !entry.asset) {
          errors.push('Surplus rebalance: funds_aa asset missing');
        } else if (entry.asset.yearlySold !== 0) {
          // What is tested:
          // When surplus cash is available in the same year, rebalance should buy-only.
          //
          // Hand math:
          // Salary 100,000 in AA => net 85,000 (IT 10,000 + SC 5,000).
          // With available net inflow and no mandatory withdrawals, drift can be corrected by buys.
          // Therefore yearlySold must be 0 in this scenario.
          errors.push(`Surplus rebalance: expected yearlySold 0, got ${entry.asset.yearlySold}`);
        }
      }
    }

    // No surplus: sells occur to rebalance
    {
      const params = microParams({
        targetAge: 31,
        StartCountry: 'aa',
        initialSavings: 0,
        initialCapitalByKey: { funds_aa: 10000 },
        investmentAllocationsByCountry: { aa: { funds_aa: 1 } },
        investmentGrowthRatesByKey: { funds_aa: 0 },
        investmentVolatilitiesByKey: { funds_aa: 0 },
        GlobalAssetGrowth_globalEquity: 100,
        GlobalAssetGrowth_globalBonds: 0,
        GlobalAssetVolatility_globalEquity: 0,
        GlobalAssetVolatility_globalBonds: 0,
        MixConfig_aa_funds_type: 'fixed',
        MixConfig_aa_funds_asset1: 'globalEquity',
        MixConfig_aa_funds_asset2: 'globalBonds',
        MixConfig_aa_funds_startAsset1Pct: 60,
        MixConfig_aa_funds_endAsset1Pct: 60
      });

      const scenarioDef = {
        name: 'C_F-HYBRID-REBAL-SELL',
        scenario: {
          parameters: params,
          events: []
        },
        assertions: []
      };

      const framework = new TestFramework();
      framework.loadScenario(scenarioDef);
      installTestTaxRules(framework, { aa: TOY_AA });
      const results = await framework.runSimulation();

      if (!results.success) {
        errors.push('Sell rebalance: simulation failed');
      } else {
        const entry = (framework.simulationContext.investmentAssets || []).find(e => e && e.key === 'funds_aa');
        if (!entry || !entry.asset) {
          errors.push('Sell rebalance: funds_aa asset missing');
        } else if (!(entry.asset.yearlySold > 0)) {
          // What is tested:
          // Without surplus cash, rebalance must sell overweight sleeve to restore target mix.
          errors.push('Sell rebalance: expected yearlySold > 0');
        }
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
