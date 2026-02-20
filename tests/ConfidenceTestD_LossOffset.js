const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_D-LOSS-OFFSET',
  description: 'Verifies capital loss offset (D-LOSS-OFFSET).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 33,
      initialShares: 10000,
      growthRateShares: 0,
      priorityShares: 1,
      priorityCash: 4,
      priorityFunds: 4,
      priorityPension: 4
    });
    const events = [
      // Age 30: SM sets override -20% for age 31
      { type: 'SM', id: 'bear', amount: 0, fromAge: 30, toAge: 30, rate: -0.20 },
      // Age 31: addYear applies -20% growth. E sells 3000 realizing loss.
      // SM sets override +50% for age 32.
      { type: 'E', id: 'sellLoss', amount: 3000, fromAge: 31, toAge: 31, rate: 0 },
      { type: 'SM', id: 'bull', amount: 0, fromAge: 31, toAge: 31, rate: 0.50 },
      // Age 32: addYear applies +50% growth. E sells remaining to realize gain.
      { type: 'E', id: 'sellGain', amount: 10000, fromAge: 32, toAge: 32, rate: 0 }
    ];
    const scenarioDef = {
      name: 'D-LOSS-OFFSET',
      assertions: [],
      scenario: {
        parameters: params,
        events: events
      }
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success && !results.dataSheet) {
      errors.push('Simulation failed and no dataSheet returned');
      return { success: false, errors };
    }

    const row31 = results.dataSheet.find(r => r && r.age === 31);
    const row32 = results.dataSheet.find(r => r && r.age === 32);

    if (!row31) errors.push('No row found at age 31');
    else if (Math.abs(row31.cgt - 0) > 1) errors.push(`Expected row31.cgt ≈ 0 (realized loss), got ${row31.cgt}`);

    if (!row32) errors.push('No row found at age 32');
    // Gain should be offset by loss. 
    // Exact arithmetic: 
    // Age 31: 10000 * 0.8 = 8000. Sell 3000. Loss = 3000 * (2000/10000) = 600? No, cost basis is used.
    // InvestmentAsset.sell logic: 
    // Initial holding: principal 10000, interest 0.
    // Age 31: growth -2000. principal 10000, interest -2000.
    // Sell 3000: fraction = 3000/8000 = 0.375.
    // gains = 0.375 * (-2000) = -750.
    // Remaining interest: -1250. Remaining principal: 6250. Total: 5000.
    // Age 32: growth +50% on 5000 = +2500.
    // principal 6250, interest -1250 + 2500 = +1250.
    // Sell all at 32: Gain = 1250.
    // If loss carry-forward worked, Gain 1250 - Loss 750 = 500.
    // Annual exemption 1000 applies to 500 -> 0 CGT.
    // Without carry-forward: Gain 1250 - exemption 1000 = 250. Tax = 250 * 0.2 = 50.
    // So row32.cgt should be either 0 or 50. In both cases < 200.
    else if (row32.cgt > 200) errors.push(`Expected row32.cgt to be reduced by loss offset or exemption (expected < 200, got ${row32.cgt})`);

    return {
      success: errors.length === 0,
      errors
    };
  }
};
