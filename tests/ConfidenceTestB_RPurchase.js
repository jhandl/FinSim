const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-RPurchase',
  description: 'Verifies property purchase with mortgage and equity initialization.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    // Initial savings 60,000; purchase downpayment is 50,000.
    const params = microParams({ targetAge: 31, initialSavings: 60000 });
    const events = [
      { type: 'SI', id: 'salary', amount: 15000, fromAge: 30, toAge: 31, currency: 'AAA' },
      // Downpayment-style purchase event
      { type: 'R', id: 'home', amount: 50000, fromAge: 30, toAge: 49, rate: 0 },
      // 0% mortgage so principal repayment is exactly the payment amount.
      { type: 'M', id: 'home', amount: 10000, fromAge: 30, toAge: 50, rate: 0, match: 0 }
    ];
    const scenarioDef = {
      name: 'C_B-RPurchase',
      description: 'Verifies property purchase with mortgage and equity initialization.',
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
      // Purchase cash outflow + mortgage payment + salary net flow + equity accumulation,
      // all at one consistent snapshot: the age-31 row.
      //
      // Snapshot convention for this test:
      // age-31 row is treated as "end of year age 31" for both cash and equity checks.
      //
      // Hand math under that convention:
      // Salary net per year in AA = 15,000 * (1 - 0.10 - 0.05) = 12,750
      // Cash after age 30 = 60,000 + 12,750 - 50,000 - 10,000 = 12,750
      // Cash after age 31 = 12,750 + 12,750 - 10,000 = 15,500
      // Equity at age-31 snapshot:
      // 50,000 + 10,000 = 60,000
      // Worth = cash + equity = 15,500 + 60,000 = 75,500
      if (Math.abs(row31.cash - 15500) > 2) errors.push(`Expected cash ≈ 15500, got ${row31.cash}`);
      if (Math.abs(row31.realEstateCapital - 60000) > 10) {
        errors.push(`Expected realEstateCapital ≈ 60000, got ${row31.realEstateCapital}`);
      }
      if (Math.abs(row31.worth - 75500) > 12) {
        errors.push(`Expected worth ≈ 75500, got ${row31.worth}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
