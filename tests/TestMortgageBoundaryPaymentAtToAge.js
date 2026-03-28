// @finsim-test-speed: fast
const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
const { getDisplayAmountByLabel } = require('./helpers/DisplayAttributionTestHelpers.js');

module.exports = {
  name: 'TestMortgageBoundaryPaymentAtToAge',
  description: 'Legacy mortgage flow keeps regular payment on M.toAge boundary.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const params = microParams({
      startingAge: 30,
      targetAge: 33,
      initialSavings: 30000,
      StartCountry: 'aa'
    });

    const events = [
      { type: 'SI', id: 'salary', amount: 40000, fromAge: 30, toAge: 33, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'R', id: 'home', amount: 10000, fromAge: 30, toAge: 60, rate: 0, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'M', id: 'home', amount: 1000, fromAge: 30, toAge: 31, rate: 0, currency: 'AAA', linkedCountry: 'aa' }
    ];

    framework.loadScenario({
      name: 'TestMortgageBoundaryPaymentAtToAge',
      scenario: { parameters: params, events: events },
      assertions: []
    });
    installTestTaxRules(framework, { aa: TOY_AA });

    const results = await framework.runSimulation();
    if (!results || !results.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const row31 = results.dataSheet.find(r => r && r.age === 31);
    const row32 = results.dataSheet.find(r => r && r.age === 32);
    if (!row31 || !row32) {
      return { success: false, errors: ['Missing expected rows'] };
    }

    const mortgageAtBoundary = getDisplayAmountByLabel(row31, 'Expenses', 'Mortgage (home)');
    const mortgageAfterBoundary = getDisplayAmountByLabel(row32, 'Expenses', 'Mortgage (home)');

    const errors = [];
    if (Math.abs(mortgageAtBoundary - 1000) > 1) {
      errors.push(`Age 31: expected boundary mortgage payment ≈ 1000, got ${mortgageAtBoundary}`);
    }
    if (Math.abs(mortgageAfterBoundary) > 1) {
      errors.push(`Age 32: expected no mortgage payment after toAge, got ${mortgageAfterBoundary}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
