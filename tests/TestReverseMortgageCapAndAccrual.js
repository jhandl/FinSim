// @finsim-test-speed: fast
const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'TestReverseMortgageCapAndAccrual',
  description: 'Reverse mortgage payouts are capped by property value and interest accrues on balance.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const params = microParams({
      startingAge: 30,
      targetAge: 35,
      initialSavings: 130000,
      StartCountry: 'aa'
    });

    const events = [
      { type: 'R', id: 'home', amount: 100000, fromAge: 30, toAge: 34, rate: 0, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'MR', id: 'home', amount: 30000, fromAge: 30, toAge: 33, rate: 0.10, currency: 'AAA', linkedCountry: 'aa' }
    ];

    framework.loadScenario({
      name: 'ReverseMortgageCap',
      scenario: { parameters: params, events: events },
      assertions: []
    });
    installTestTaxRules(framework, { aa: TOY_AA });

    const results = await framework.runSimulation();
    const errors = [];
    if (!results || !results.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const row32 = results.dataSheet.find(r => r && r.age === 32);
    const row33 = results.dataSheet.find(r => r && r.age === 33);
    const row34 = results.dataSheet.find(r => r && r.age === 34);
    if (!row32 || !row33 || !row34) {
      return { success: false, errors: ['Missing expected data rows'] };
    }

    const payout32 = row32.attributions && row32.attributions.incometaxfree
      ? (row32.attributions.incometaxfree['Reverse Mortgage (home)'] || 0)
      : 0;
    if (Math.abs(payout32 - 30000) > 1) {
      errors.push(`Expected reverse payout ≈ 30000 at age 32, got ${payout32}`);
    }

    const payout33 = row33.attributions && row33.attributions.incometaxfree
      ? (row33.attributions.incometaxfree['Reverse Mortgage (home)'] || 0)
      : 0;
    if (payout33 > 1) {
      errors.push(`Expected reverse payout to be capped to 0 at age 33, got ${payout33}`);
    }

    const reverseSettlement = row34.attributions && row34.attributions.expenses
      ? (row34.attributions.expenses['Reverse Mortgage Settlement (home)'] || 0)
      : 0;
    if (Math.abs(reverseSettlement - 100000) > 2) {
      errors.push(`Expected reverse settlement ≈ 100000 at sale, got ${reverseSettlement}`);
    }

    const reverseWriteoff = row34.attributions && row34.attributions.realestatecapital
      ? (row34.attributions.realestatecapital['Reverse Mortgage Write-off (home)'] || 0)
      : 0;
    // Hand math:
    // Age30: (0 + 30,000) * 1.10 = 33,000
    // Age31: (33,000 + 30,000) * 1.10 = 69,300
    // Age32: (69,300 + 30,000) * 1.10 = 109,230
    // Age33: payout capped to 0, balance grows to 120,153
    // Sale value 100,000 => write-off = 20,153 (recorded as negative realestatecapital attribution).
    if (Math.abs(reverseWriteoff + 20153) > 5) {
      errors.push(`Expected reverse write-off attribution ≈ -20153, got ${reverseWriteoff}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
