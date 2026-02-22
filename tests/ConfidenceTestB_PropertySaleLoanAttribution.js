const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-PropertySaleLoanAttribution',
  description: 'Verifies net sale proceeds and explicit forward/reverse loan attributions.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 34,
      initialSavings: 120000,
      growthRateFunds: 0
    });
    const events = [
      { type: 'R', id: 'home', amount: 50000, fromAge: 30, toAge: 33, rate: 0 },
      { type: 'M', id: 'home', amount: 5000, fromAge: 30, toAge: 40, rate: 0 },
      { type: 'MR', id: 'home', amount: 10000, fromAge: 31, toAge: 32, rate: 0 }
    ];

    const framework = new TestFramework();
    framework.loadScenario({
      name: 'C_B-PropertySaleLoanAttribution',
      scenario: { parameters: params, events: events },
      assertions: []
    });
    installTestTaxRules(framework, { aa: TOY_AA });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const row33 = results.dataSheet.find(r => r && r.age === 33);
    if (!row33) {
      return { success: false, errors: ['Missing age 33 row'] };
    }

    // Hand math at 0%:
    // Property basis = paid (50,000) + borrowed (50,000) = 100,000.
    // Mortgage principal = 50,000. Remaining at age-33 sale = 35,000.
    // Reverse balance at sale = 20,000.
    // Net sale proceeds = 100,000 - 35,000 - 20,000 = 45,000.
    const mortgageSettlement = row33.attributions.expenses['Mortgage Settlement (home)'] || 0;
    const reverseSettlement = row33.attributions.expenses['Reverse Mortgage Settlement (home)'] || 0;
    const saleAttribution = row33.attributions.realestatecapital['Sale (home)'] || 0;
    const writeOff = row33.attributions.realestatecapital['Reverse Mortgage Write-off (home)'] || 0;

    if (Math.abs(mortgageSettlement - 35000) > 2) {
      errors.push(`Expected Mortgage Settlement ≈ 35000, got ${mortgageSettlement}`);
    }
    if (Math.abs(reverseSettlement - 20000) > 2) {
      errors.push(`Expected Reverse Mortgage Settlement ≈ 20000, got ${reverseSettlement}`);
    }
    if (Math.abs(saleAttribution + 45000) > 2) {
      errors.push(`Expected Sale(home) attribution ≈ -45000, got ${saleAttribution}`);
    }
    if (Math.abs(writeOff) > 1) {
      errors.push(`Expected no reverse write-off in this setup, got ${writeOff}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
