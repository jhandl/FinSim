const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-MortgagePayment',
  description: 'Verifies precise year-one mortgage principal reduction.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ targetAge: 31, initialSavings: 100000 });
    const events = [
      { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 31, currency: 'AAA' },
      { type: 'R', id: 'home', amount: 100000, fromAge: 30, toAge: 49, rate: 0 },
      // Non-zero mortgage rate to test interest impact directly.
      { type: 'M', id: 'home', amount: 7920, fromAge: 30, toAge: 50, rate: 0.05, match: 0 }
    ];
    const scenarioDef = {
      name: 'C_B-MortgagePayment',
      description: 'Verifies precise year-one mortgage principal reduction.',
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
    if (!row31) {
      errors.push('No row found at age 31');
    } else {
      // What is tested:
      // Mortgage interest reduces principal repayment vs a 0% loan.
      //
      // Hand math:
      // Annual payment = 7,920 => monthlyPayment = 660
      // Mortgage years = 20 => n = 240 months
      // Annual rate = 5% => monthly rate r = 0.05 / 12
      //
      // Initial borrowed principal:
      // P = monthlyPayment * ( (1+r)^n - 1 ) / ( r * (1+r)^n )
      //
      // Remaining principal after 12 months:
      // R12 = P*(1+r)^12 - monthlyPayment * ( ((1+r)^12 - 1) / r )
      //
      // Equity at age 31 row:
      // Equity = downpayment + (P - R12)
      // where downpayment = 100,000
      const n = 20 * 12;
      const r = 0.05 / 12;
      const monthlyPayment = 7920 / 12;
      const c = Math.pow(1 + r, n);
      const principal = monthlyPayment * (c - 1) / (r * c);
      const g12 = Math.pow(1 + r, 12);
      const remainingAfter12 = principal * g12 - monthlyPayment * ((g12 - 1) / r);
      const expectedEquity = 100000 + (principal - remainingAfter12);
      if (Math.abs(row31.realEstateCapital - expectedEquity) > 1) {
        errors.push(`Expected realEstateCapital ≈ ${expectedEquity}, got ${row31.realEstateCapital}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
