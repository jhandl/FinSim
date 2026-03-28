// @finsim-test-speed: fast
const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
const { getDisplayAmountByLabel } = require('./helpers/DisplayAttributionTestHelpers.js');

module.exports = {
  name: 'TestMortgagePayoffEvent',
  description: 'Explicit MP event settles mortgage and stops future repayments.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const params = microParams({
      startingAge: 30,
      targetAge: 36,
      initialSavings: 130000,
      StartCountry: 'aa'
    });

    const events = [
      { type: 'SI', id: 'salary', amount: 60000, fromAge: 30, toAge: 36, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'R', id: 'home', amount: 100000, fromAge: 30, toAge: 60, rate: 0, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'M', id: 'home', amount: 10000, fromAge: 30, toAge: 32, rate: 0.05, mortgageTerm: 5, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'MP', id: 'home', amount: 1, fromAge: 32, toAge: 32, currency: 'AAA', linkedCountry: 'aa' }
    ];

    framework.loadScenario({
      name: 'TestMortgagePayoffEvent',
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
    if (!row32 || !row33) {
      return { success: false, errors: ['Missing expected data rows'] };
    }

    const payoff = getDisplayAmountByLabel(row32, 'Expenses', 'Mortgage Payoff (home)');
    if (!(payoff > 0)) {
      errors.push(`Expected Mortgage Payoff at age 32, got ${payoff}`);
    }

    const mortgageAfterPayoff = getDisplayAmountByLabel(row33, 'Expenses', 'Mortgage (home)');
    if (mortgageAfterPayoff > 1) {
      errors.push(`Expected no regular mortgage payment after payoff, got ${mortgageAfterPayoff}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
