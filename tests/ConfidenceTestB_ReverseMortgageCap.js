const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
const { getDisplayAmountByLabel } = require('./helpers/DisplayAttributionTestHelpers.js');

module.exports = {
  name: 'C_B-ReverseMortgageCap',
  description: 'Verifies reverse mortgage cap and non-recourse write-off with hand math.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 35,
      initialSavings: 130000,
      growthRateFunds: 0
    });
    const events = [
      { type: 'R', id: 'home', amount: 100000, fromAge: 30, toAge: 34, rate: 0 },
      { type: 'MR', id: 'home', amount: 30000, fromAge: 30, toAge: 33, rate: 0.10 }
    ];

    const framework = new TestFramework();
    framework.loadScenario({
      name: 'C_B-ReverseMortgageCap',
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
    const row34 = results.dataSheet.find(r => r && r.age === 34);
    if (!row33 || !row34) {
      return { success: false, errors: ['Missing expected rows'] };
    }

    // Hand math:
    // B30 = (0 + 30,000) * 1.10 = 33,000
    // B31 = (33,000 + 30,000) * 1.10 = 69,300
    // B32 = (69,300 + 30,000) * 1.10 = 109,230
    // At age33 payout is capped to 0 (already above property value), then interest:
    // B33 = 109,230 * 1.10 = 120,153
    // Sale at age34:
    // reverse settlement = 100,000, write-off = 20,153.
    const payout33 = getDisplayAmountByLabel(row33, 'IncomeTaxFree', 'Reverse Mortgage (home)');
    if (Math.abs(payout33) > 1) {
      errors.push(`Age 33: Expected payout cap (0), got ${payout33}`);
    }

    const reverseSettlement = getDisplayAmountByLabel(row34, 'Expenses', 'Reverse Mortgage Settlement (home)');
    if (Math.abs(reverseSettlement - 100000) > 2) {
      errors.push(`Age 34: Expected reverse settlement ≈ 100000, got ${reverseSettlement}`);
    }

    const writeOff = getDisplayAmountByLabel(row34, 'RealEstateCapital', 'Reverse Mortgage Write-off (home)');
    if (Math.abs(writeOff + 20153) > 5) {
      errors.push(`Age 34: Expected write-off attribution ≈ -20153, got ${writeOff}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
