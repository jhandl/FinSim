const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-SM',
  description: 'Verifies market growth override (SM) behavior.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ 
      targetAge: 33, 
      initialFunds: 10000, 
      growthRateFunds: 0 
    });
    const events = [
      { type: 'SM', id: 'override', amount: 0, fromAge: 31, toAge: 31, rate: 0.20 }
    ];
    const scenarioDef = {
      name: 'C_B-SM',
      description: 'Verifies market growth override (SM) behavior.',
      scenario: {
        parameters: params,
        events: events
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

    const row31 = results.dataSheet.find(r => r && r.age === 31);
    const row32 = results.dataSheet.find(r => r && r.age === 32);

    if (!row31) errors.push('No row found at age 31');
    else {
      // What is tested:
      // SM at age 31 overrides growth for the NEXT growth step (31 -> 32),
      // not retroactively on age 31 balances.
      const funds = row31.investmentCapitalByKey ? row31.investmentCapitalByKey['funds_aa'] : 0;
      if (Math.abs(funds - 10000) > 1) errors.push(`Age 31: Expected funds_aa ≈ 10000, got ${funds}`);
    }

    if (!row32) errors.push('No row found at age 32');
    else {
      // Hand math:
      // Start funds = 10,000
      // Override growth = +20% for 31->32 step
      // Funds at age 32 = 10,000 * 1.20 = 12,000
      const funds = row32.investmentCapitalByKey ? row32.investmentCapitalByKey['funds_aa'] : 0;
      if (Math.abs(funds - 12000) > 1) errors.push(`Age 32: Expected funds_aa ≈ 12000, got ${funds}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
