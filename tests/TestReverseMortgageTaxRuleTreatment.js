// @finsim-test-speed: fast
const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');
const { getDisplayAmountByLabel } = require('./helpers/DisplayAttributionTestHelpers.js');

module.exports = {
  name: 'TestReverseMortgageTaxRuleTreatment',
  description: 'Reverse mortgage payout taxation follows tax-rules configuration.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const params = microParams({
      startingAge: 30,
      targetAge: 31,
      initialSavings: 130000,
      StartCountry: 'aa'
    });

    const aaRules = deepClone(TOY_AA);
    aaRules.realEstate = aaRules.realEstate || {};
    aaRules.realEstate.reverseMortgage = aaRules.realEstate.reverseMortgage || {};
    aaRules.realEstate.reverseMortgage.payoutTaxTreatment = 'otherIncome';

    const events = [
      { type: 'R', id: 'home', amount: 100000, fromAge: 30, toAge: 60, rate: 0, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'MR', id: 'home', amount: 10000, fromAge: 30, toAge: 30, rate: 0, currency: 'AAA', linkedCountry: 'aa' }
    ];

    framework.loadScenario({
      name: 'ReverseMortgageTaxRuleTreatment',
      scenario: { parameters: params, events: events },
      assertions: []
    });
    installTestTaxRules(framework, { aa: aaRules });

    const results = await framework.runSimulation();
    const errors = [];
    if (!results || !results.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const row30 = results.dataSheet.find(r => r && r.age === 30);
    if (!row30) {
      return { success: false, errors: ['Missing age 30 row'] };
    }

    const reverseTaxFree = getDisplayAmountByLabel(row30, 'IncomeTaxFree', 'Reverse Mortgage (home)');
    const reverseTaxable = getDisplayAmountByLabel(row30, 'Tax__incomeTax', 'Reverse Mortgage (home)');

    if (Math.abs(reverseTaxFree) > 0.5) {
      errors.push(`Expected reverse payout not to be tax-free, got incometaxfree=${reverseTaxFree}`);
    }
    if (!(reverseTaxable > 0)) {
      errors.push(`Expected reverse payout to create positive income tax attribution, got ${reverseTaxable}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
