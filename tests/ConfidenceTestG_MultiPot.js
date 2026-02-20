const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'C_G-MULTIPOT',
  description: 'Verifies multi-country pension pots aggregate correctly.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 33,
      StartCountry: 'aa',
      relocationEnabled: true,
      pensionContributionsByCountry: {
        aa: { p1Pct: 0.1, capped: 'No' },
        bb: { p1Pct: 0.1, capped: 'No' }
      }
    });

    const events = [
      { type: 'SI', id: 'salary_aa', amount: 10000, fromAge: 30, toAge: 30, currency: 'AAA', rate: 0, match: 0 },
      { type: 'MV', id: 'move_bb', name: 'bb', fromAge: 31, toAge: 31 },
      { type: 'SI', id: 'salary_bb', amount: 10000, fromAge: 32, toAge: 32, currency: 'BBB', linkedCountry: 'bb', rate: 0, match: 0 }
    ];

    const scenarioDef = {
      name: 'C_G-MULTIPOT',
      description: 'Verifies multi-country pension pots aggregate correctly.',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA, bb: TOY_BB });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const state = vm.runInContext(`(function() {
      var aa = person1.pensions.aa;
      var bb = person1.pensions.bb;
      return {
        aa: aa ? aa.capital() : null,
        bb: bb ? bb.capital() : null
      };
    })()`, framework.simulationContext);

    if (state.aa === null) errors.push('Missing AA pension pot');
    if (state.bb === null) errors.push('Missing BB pension pot');
    // What is tested:
    // Country-specific pension pots are maintained separately and aggregate correctly.
    //
    // Hand math:
    // AA salary contribution at age 30:
    //   contribution = 10,000 * 10% = 1,000 (in AA pot currency)
    // Move AA->BB at age 31 with FX 1 AAA = 2 BBB, so AA pot in row currency doubles to 2,000.
    // BB salary contribution at age 32:
    //   contribution = 10,000 * 10% = 1,000 (in BB pot currency)
    // Expected per-pot capitals at age 32: AA pot 2,000 and BB pot 1,000; total 3,000.
    if (Math.abs(state.aa - 2000) > 1) errors.push(`Expected AA pension pot ≈ 2000, got ${state.aa}`);
    if (Math.abs(state.bb - 1000) > 1) errors.push(`Expected BB pension pot ≈ 1000, got ${state.bb}`);

    const row32 = results.dataSheet.find(r => r && r.age === 32);
    if (!row32) {
      errors.push('No row found at age 32');
    } else if (state.aa !== null && state.bb !== null) {
      const total = state.aa + state.bb;
      if (Math.abs(row32.pensionFund - total) > 1) {
        errors.push(`Expected pensionFund ≈ ${total}, got ${row32.pensionFund}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
