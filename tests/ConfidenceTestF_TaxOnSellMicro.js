const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
module.exports = {
  name: 'C_F-TAX-ON-SELL',
  description: 'Verifies CGT is charged on share sales after growth (F-TAX-ON-SELL).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 32,
      StartCountry: 'aa',
      fxMode: 'constant',
      initialShares: 1000,
      growthRateShares: 0,
      priorityShares: 1,
      priorityFunds: 2,
      priorityCash: 3,
      priorityPension: 4
    });

    const events = [
      { type: 'SM', id: 'growth', amount: 0, fromAge: 30, toAge: 30, rate: 2.0 },
      { type: 'E', id: 'expense', amount: 3000, fromAge: 31, toAge: 31, currency: 'AAA', linkedCountry: 'aa' }
    ];

    const scenarioDef = {
      name: 'C_F-TAX-ON-SELL',
      description: 'Verifies CGT is charged on share sales after growth (F-TAX-ON-SELL).',
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
    if (results.success) {
      errors.push('Expected simulation failure due zero earned income vs expenses after sale-tax drag');
    }
    const row31 = results.dataSheet.find(r => r && r.age === 31);
    if (!row31) {
      errors.push('No row found at age 31');
    } else {
      // What is tested:
      // Selling appreciated shares to fund expense triggers CGT.
      //
      // Hand math:
      // Initial shares = 1,000
      // SM rate 2.0 at age 30 means +200% growth into age 31 => value 3,000
      // Gain realized when selling to fund 3,000 expense = 3,000 - 1,000 = 2,000
      // AA CGT exemption = 1,000 => taxable gain = 1,000
      // AA CGT rate = 20% => tax = 200
      const cgt = row31.taxByKey ? row31.taxByKey['capitalGains'] : undefined;
      if (typeof cgt !== 'number') {
        errors.push('Missing capital gains tax entry for shares sale');
      } else if (Math.abs(cgt - 200) > 1) {
        errors.push(`Expected capital gains tax ≈ 200, got ${cgt}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
