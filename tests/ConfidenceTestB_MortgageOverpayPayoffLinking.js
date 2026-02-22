const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-MortgageOverpayPayoffLinking',
  description: 'Verifies MO + MP hand-derived payoff amount and mortgage stop age.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 42,
      initialSavings: 120000,
      growthRateFunds: 0
    });
    const events = [
      { type: 'SI', id: 'salary', amount: 20000, fromAge: 30, toAge: 42, currency: 'AAA' },
      { type: 'R', id: 'home', amount: 80000, fromAge: 30, toAge: 60, rate: 0 },
      { type: 'M', id: 'home', amount: 4000, fromAge: 30, toAge: 40, rate: 0, mortgageTerm: 20, match: 0 },
      { type: 'MO', id: 'home', amount: 3000, fromAge: 31, toAge: 40 },
      { type: 'MP', id: 'home', amount: 10000, fromAge: 40, toAge: 40 }
    ];

    const framework = new TestFramework();
    framework.loadScenario({
      name: 'C_B-MortgageOverpayPayoffLinking',
      scenario: { parameters: params, events: events },
      assertions: []
    });
    installTestTaxRules(framework, { aa: TOY_AA });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const row40 = results.dataSheet.find(r => r && r.age === 40);
    const row41 = results.dataSheet.find(r => r && r.age === 41);
    if (!row40 || !row41) {
      return { success: false, errors: ['Missing expected rows'] };
    }

    // Hand math (0% rate):
    // Principal = 4,000 * 20 = 80,000.
    // By age-40 payoff row, regular amortization has reduced 40,000.
    // MO contributes 3,000 for ages 31..40 => 30,000.
    // Remaining = 80,000 - 40,000 - 30,000 = 10,000.
    const payoff = row40.attributions.expenses['Mortgage Payoff (home)'] || 0;
    if (Math.abs(payoff - 10000) > 2) {
      errors.push(`Age 40: Expected payoff ≈ 10000, got ${payoff}`);
    }

    const row41Expenses = row41.attributions && row41.attributions.expenses ? row41.attributions.expenses : {};
    const mortgageAt41 = row41Expenses['Mortgage (home)'] || 0;
    if (Math.abs(mortgageAt41) > 1) {
      errors.push(`Age 41: Expected no mortgage payment after payoff, got ${mortgageAt41}`);
    }

    if (Math.abs(row41.realEstateCapital - 160000) > 5) {
      errors.push(`Age 41: Expected realEstateCapital ≈ 160000 after full payoff, got ${row41.realEstateCapital}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
