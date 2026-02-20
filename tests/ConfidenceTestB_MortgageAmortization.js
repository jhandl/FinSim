const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-MortgageAmortization',
  description: 'Verifies multi-year mortgage amortization and equity growth.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 36,
      initialSavings: 30000,
      growthRateFunds: 0
    });
    const events = [
      { type: 'SI', id: 'salary', amount: 15000, fromAge: 30, toAge: 36, currency: 'AAA' },
      { type: 'R', id: 'home', amount: 30000, fromAge: 30, toAge: 50, rate: 0 },
      // 0% mortgage to make amortization linear and hand-checkable.
      { type: 'M', id: 'home', amount: 5000, fromAge: 30, toAge: 50, rate: 0, match: 0 }
    ];
    const scenarioDef = {
      name: 'C_B-MortgageAmortization',
      description: 'Verifies multi-year mortgage amortization and equity growth.',
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

    const row35 = results.dataSheet.find(r => r && r.age === 35);
    if (!row35) {
      errors.push('No row found at age 35');
    } else {
      // What is tested:
      // Linear principal accumulation over multiple years.
      //
      // Hand math:
      // Equity base = 30,000
      // Annual principal repayment = 5,000 (rate 0%)
      // By age 35 row, there have been 5 completed payment cycles (ages 30..34),
      // so equity = 30,000 + 5 * 5,000 = 55,000.
      if (Math.abs(row35.realEstateCapital - 55000) > 10) {
        errors.push(`Age 35: Expected realEstateCapital ≈ 55000, got ${row35.realEstateCapital}`);
      }
      if (Math.abs(row35.expenses - 5000) > 1) {
        errors.push(`Age 35: Expected expenses ≈ 5000, got ${row35.expenses}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
