const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_F-INV-FACTORY',
  description: 'Verifies InvestmentTypeFactory output for toy rulesets.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ targetAge: 31 });
    const scenarioDef = {
      name: 'C_F-INV-FACTORY',
      description: 'Verifies InvestmentTypeFactory output for toy rulesets.',
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

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const assets = framework.simulationContext.investmentAssets || [];
    const funds = assets.find(entry => entry && entry.key === 'funds_aa');
    const shares = assets.find(entry => entry && entry.key === 'shares_aa');

    if (!funds || !funds.asset) {
      errors.push('Missing funds_aa asset');
    } else {
      if (funds.asset._taxCategory !== 'exitTax') errors.push(`Expected funds_aa _taxCategory exitTax, got ${funds.asset._taxCategory}`);
      if (Math.abs(funds.asset.taxRate - 0.40) > 0.0001) errors.push(`Expected funds_aa taxRate ≈ 0.40, got ${funds.asset.taxRate}`);
      if (funds.asset.eligibleForAnnualExemption !== false) errors.push('Expected funds_aa eligibleForAnnualExemption = false');
    }

    if (!shares || !shares.asset) {
      errors.push('Missing shares_aa asset');
    } else {
      if (shares.asset._taxCategory !== 'capitalGains') errors.push(`Expected shares_aa _taxCategory capitalGains, got ${shares.asset._taxCategory}`);
      if (Math.abs(shares.asset.taxRate - 0.20) > 0.0001) errors.push(`Expected shares_aa taxRate ≈ 0.20, got ${shares.asset.taxRate}`);
      if (shares.asset.eligibleForAnnualExemption !== true) errors.push('Expected shares_aa eligibleForAnnualExemption = true');
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
