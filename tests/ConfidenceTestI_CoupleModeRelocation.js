const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules, installTreatyPairs, TREATY_PAIRS } = require('./helpers/CoreConfidenceFixtures.js');
const { getDisplayAmountByMeta } = require('./helpers/DisplayAttributionTestHelpers.js');

module.exports = {
  name: 'C_I-COUPLE-RELOC',
  description: 'Verifies couple mode net income with cross-country salaries (I-COUPLE-RELOC).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 31,
      simulation_mode: 'couple',
      StartCountry: 'aa',
      relocationEnabled: true,
      p2StartingAge: 30,
      p2RetirementAge: 65
    });

    const events = [
      { type: 'SI', id: 'p1-salary', amount: 10000, fromAge: 30, toAge: 30, currency: 'AAA', rate: 0, match: 0 },
      { type: 'SI2np', id: 'p2-salary', amount: 10000, fromAge: 30, toAge: 30, currency: 'BBB', linkedCountry: 'bb', rate: 0, match: 0 },
      { type: 'MV', id: 'move-bb', name: 'bb', fromAge: 31, toAge: 31 }
    ];

    const scenarioDef = {
      name: 'C_I-COUPLE-RELOC',
      description: 'Verifies couple mode net income with cross-country salaries (I-COUPLE-RELOC).',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA, bb: TOY_BB });
    installTreatyPairs(framework, TREATY_PAIRS);
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const row30 = results.dataSheet.find(r => r && r.age === 30);
    if (!row30) {
      errors.push('No row found at age 30');
    } else {
      if (Math.abs(row30.netIncome - 12600) > 5) errors.push(`Expected netIncome ≈ 12600, got ${row30.netIncome}`);
    }

    // Assert tax attribution on the specific year row (Taxman yearlyAttributions resets each year).
    const domesticIncomeTax = getDisplayAmountByMeta(row30, 'Tax__incomeTax', (item) => {
      return String(item.taxCountry || '').toLowerCase() === 'aa' && item.amount > 0;
    });
    const bbIncomeTax = getDisplayAmountByMeta(row30, 'Tax__incomeTax', (item) => {
      return String(item.taxCountry || '').toLowerCase() === 'bb' && item.amount > 0;
    });
    if (!(domesticIncomeTax > 0)) errors.push('Missing domestic Tax__incomeTax attribution');
    if (!(bbIncomeTax > 0)) errors.push('Missing BB Tax__incomeTax attribution');

    return {
      success: errors.length === 0,
      errors
    };
  }
};
