// @finsim-test-speed: fast
const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'TestMortgageOverpayShortensTerm',
  description: 'MO+MP combination shortens active mortgage period and settles at linked age.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const params = microParams({
      startingAge: 30,
      targetAge: 44,
      initialSavings: 120000,
      StartCountry: 'aa'
    });

    const baselineEvents = [
      { type: 'SI', id: 'salary', amount: 50000, fromAge: 30, toAge: 44, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'R', id: 'home', amount: 80000, fromAge: 30, toAge: 60, rate: 0, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'M', id: 'home', amount: 4000, fromAge: 30, toAge: 50, rate: 0, mortgageTerm: 20, currency: 'AAA', linkedCountry: 'aa' }
    ];

    const overpayEvents = [
      { type: 'SI', id: 'salary', amount: 50000, fromAge: 30, toAge: 44, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'R', id: 'home', amount: 80000, fromAge: 30, toAge: 60, rate: 0, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'M', id: 'home', amount: 4000, fromAge: 30, toAge: 40, rate: 0, mortgageTerm: 20, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'MO', id: 'home', amount: 3000, fromAge: 31, toAge: 40, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'MP', id: 'home', amount: 10000, fromAge: 40, toAge: 40, currency: 'AAA', linkedCountry: 'aa' }
    ];

    framework.loadScenario({
      name: 'BaselineMortgage',
      scenario: { parameters: params, events: baselineEvents },
      assertions: []
    });
    installTestTaxRules(framework, { aa: TOY_AA });
    const baseline = await framework.runSimulation();

    framework.loadScenario({
      name: 'OverpayMortgage',
      scenario: { parameters: params, events: overpayEvents },
      assertions: []
    });
    installTestTaxRules(framework, { aa: TOY_AA });
    const withOverpay = await framework.runSimulation();

    const errors = [];
    if (!baseline || !baseline.success || !withOverpay || !withOverpay.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const row40Overpay = withOverpay.dataSheet.find(r => r && r.age === 40);
    const row41Overpay = withOverpay.dataSheet.find(r => r && r.age === 41);
    const row41Baseline = baseline.dataSheet.find(r => r && r.age === 41);
    if (!row40Overpay || !row41Overpay || !row41Baseline) {
      return { success: false, errors: ['Missing expected data rows'] };
    }

    const payoff = row40Overpay.attributions && row40Overpay.attributions.expenses
      ? row40Overpay.attributions.expenses['Mortgage Payoff (home)']
      : 0;
    // Hand math at 0%:
    // principal 80,000 (4,000 * 20 years), after 10 amortized years -> 40,000 remaining.
    // MO from 31..40 adds 30,000 total, leaving 10,000 payoff.
    if (Math.abs(payoff - 10000) > 2) {
      errors.push(`Expected payoff around 10000 at age 40, got ${payoff}`);
    }

    const mortgageAfterOverpayPlan = row41Overpay.attributions && row41Overpay.attributions.expenses
      ? (row41Overpay.attributions.expenses['Mortgage (home)'] || 0)
      : 0;
    if (mortgageAfterOverpayPlan > 1) {
      errors.push(`Expected no mortgage payment at age 41 in overpay scenario, got ${mortgageAfterOverpayPlan}`);
    }

    const baselineMortgageAt41 = row41Baseline.attributions && row41Baseline.attributions.expenses
      ? (row41Baseline.attributions.expenses['Mortgage (home)'] || 0)
      : 0;
    if (Math.abs(baselineMortgageAt41 - 4000) > 1) {
      errors.push(`Expected baseline mortgage payment ≈ 4000 at age 41, got ${baselineMortgageAt41}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
