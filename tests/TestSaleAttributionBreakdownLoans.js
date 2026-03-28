// @finsim-test-speed: fast
const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
const { getDisplayAmountByLabel } = require('./helpers/DisplayAttributionTestHelpers.js');

module.exports = {
  name: 'TestSaleAttributionBreakdownLoans',
  description: 'Property sale keeps net cash flow while exposing loan settlement attributions.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const params = microParams({
      startingAge: 30,
      targetAge: 34,
      initialSavings: 120000,
      StartCountry: 'aa'
    });

    const events = [
      { type: 'R', id: 'home', amount: 50000, fromAge: 30, toAge: 33, rate: 0, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'M', id: 'home', amount: 5000, fromAge: 30, toAge: 40, rate: 0, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'MR', id: 'home', amount: 10000, fromAge: 31, toAge: 32, rate: 0, currency: 'AAA', linkedCountry: 'aa' }
    ];

    framework.loadScenario({
      name: 'SaleAttributionLoans',
      scenario: { parameters: params, events: events },
      assertions: []
    });
    installTestTaxRules(framework, { aa: TOY_AA });

    const results = await framework.runSimulation();
    const errors = [];
    if (!results || !results.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const row33 = results.dataSheet.find(r => r && r.age === 33);
    if (!row33) {
      return { success: false, errors: ['Missing age 33 row'] };
    }

    // Hand math at 0%:
    // Mortgage principal = 5,000 * 10 = 50,000.
    // Remaining at age 33 sale = 35,000.
    // Reverse balance at sale = 20,000 (10,000 on age 31 + 10,000 on age 32).
    // Property basis = paid (50,000) + borrowed (50,000) = 100,000.
    // Net proceeds = 100,000 - 35,000 - 20,000 = 45,000.
    const mortgageSettlement = getDisplayAmountByLabel(row33, 'Expenses', 'Mortgage Settlement (home)');
    const reverseSettlement = getDisplayAmountByLabel(row33, 'Expenses', 'Reverse Mortgage Settlement (home)');
    const saleNet = getDisplayAmountByLabel(row33, 'RealEstateCapital', 'Sale (home)');
    const reverseWriteoff = getDisplayAmountByLabel(row33, 'RealEstateCapital', 'Reverse Mortgage Write-off (home)');

    if (Math.abs(mortgageSettlement - 35000) > 2) {
      errors.push(`Expected mortgage settlement ≈ 35000, got ${mortgageSettlement}`);
    }
    if (Math.abs(reverseSettlement - 20000) > 2) {
      errors.push(`Expected reverse settlement ≈ 20000, got ${reverseSettlement}`);
    }
    if (Math.abs(saleNet + 45000) > 2) {
      errors.push(`Expected Sale(home) attribution ≈ -45000 (net proceeds), got ${saleNet}`);
    }
    if (Math.abs(reverseWriteoff) > 1) {
      errors.push(`Expected no reverse write-off in this scenario, got ${reverseWriteoff}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
