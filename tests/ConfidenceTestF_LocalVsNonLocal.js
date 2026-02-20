const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_F-LOCAL-NONLOCAL',
  description: 'Verifies local vs non-local wrapper growth parameter resolution.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const TOY_AA_BASE = deepClone(TOY_AA);
    TOY_AA_BASE.investmentTypes = TOY_AA_BASE.investmentTypes.concat([
      {
        key: 'globalFunds_aa',
        label: 'Global Funds AA',
        baseCurrency: 'AAA',
        assetCountry: 'aa',
        baseRef: 'globalEquity',
        taxation: { exitTax: { rate: 0.40 } }
      }
    ]);

    const params = microParams({
      targetAge: 31,
      StartCountry: 'aa',
      investmentAllocationsByCountry: { aa: { funds_aa: 1 } },
      investmentGrowthRatesByKey: {
        funds_aa: 0.06,
        globalFunds_aa: 0.01
      },
      investmentVolatilitiesByKey: {
        funds_aa: 0.02,
        globalFunds_aa: 0.03
      },
      GlobalAssetGrowth_globalEquity: 8,
      GlobalAssetVolatility_globalEquity: 12
    });

    const scenarioDef = {
      name: 'C_F-LOCAL-NONLOCAL',
      description: 'Verifies local vs non-local wrapper growth parameter resolution.',
      scenario: {
        parameters: params,
        events: []
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA_BASE });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const assets = framework.simulationContext.investmentAssets || [];
    const localEntry = assets.find(entry => entry && entry.key === 'funds_aa');
    const nonLocalEntry = assets.find(entry => entry && entry.key === 'globalFunds_aa');

    if (!localEntry || !localEntry.asset) {
      errors.push('Missing local funds_aa asset');
    } else if (Math.abs(localEntry.asset.growth - 0.06) > 0.0001) {
      errors.push(`Expected funds_aa growth ≈ 0.06, got ${localEntry.asset.growth}`);
    }

    if (!nonLocalEntry || !nonLocalEntry.asset) {
      errors.push('Missing non-local globalFunds_aa asset');
    } else if (Math.abs(nonLocalEntry.asset.growth - 0.08) > 0.0001) {
      errors.push(`Expected globalFunds_aa growth ≈ 0.08, got ${nonLocalEntry.asset.growth}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
