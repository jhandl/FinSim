const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_G-PENSION-ASSET',
  description: 'Verifies pension asset lump sum and drawdown mechanics with toy rules.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const TOY_AA_PENSION = deepClone(TOY_AA);
    TOY_AA_PENSION.pensionRules.minRetirementAgePrivate = 30;
    TOY_AA_PENSION.pensionRules.lumpSumMaxPercent = 0.25;
    TOY_AA_PENSION.pensionRules.minDrawdownRates = { '0': 0.04 };

    const params = microParams({
      targetAge: 32,
      retirementAge: 31,
      initialPension: 10000,
      growthRatePension: 0
    });

    const scenarioDef = {
      name: 'C_G-PENSION-ASSET',
      description: 'Verifies pension asset lump sum and drawdown mechanics with toy rules.',
      scenario: {
        parameters: params,
        events: []
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA_PENSION });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const row31 = results.dataSheet.find(r => r && r.age === 31);
    if (!row31) {
      errors.push('No row found at age 31');
    } else {
      if (Math.abs(row31.pensionFund - 7200) > 1) errors.push(`Expected pensionFund ≈ 7200, got ${row31.pensionFund}`);
      if (!(row31.incomePrivatePension > 0)) errors.push('Expected incomePrivatePension > 0 at retirement year');
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
