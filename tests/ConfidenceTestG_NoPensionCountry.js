const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_CC, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'C_G-NO-PENSION',
  description: 'Verifies no private pension contributions in a no-pension country (G-NO-PENSION).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ targetAge: 31, StartCountry: 'cc' });
    const events = [
      { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, currency: 'CCC', rate: 0.10, match: 0 }
    ];
    const scenarioDef = {
      name: 'C_G-NO-PENSION',
      description: 'Verifies no private pension contributions in a no-pension country (G-NO-PENSION).',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { cc: TOY_CC });
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
      // What is tested:
      // In no-private-pension country CC, salary should not create pension contributions.
      //
      // Hand math on salary 10,000 CCC:
      // IT = 10,000 * 20% = 2,000
      // SC = 10,000 * 8% = 800
      // Private pension contribution = 0
      if (Math.abs(row30.pensionContribution - 0) > 1) errors.push(`Expected pensionContribution ≈ 0, got ${row30.pensionContribution}`);
      if (Math.abs(row30['Tax__incomeTax'] - 2000) > 1) errors.push(`Expected Tax__incomeTax ≈ 2000, got ${row30['Tax__incomeTax']}`);
      if (Math.abs(row30['Tax__sc'] - 800) > 1) errors.push(`Expected Tax__sc ≈ 800, got ${row30['Tax__sc']}`);
    }

    const pensionState = vm.runInContext(`(function() {
      var pot = (person1 && person1.pensions) ? person1.pensions.cc : null;
      return { hasCC: !!pot, capital: pot ? pot.capital() : 0 };
    })()`, framework.simulationContext);
    // Implementation may materialize an empty pot object, but capital must remain zero.
    if (!pensionState.hasCC) errors.push('Expected CC pension pot to exist');
    if (Math.abs(pensionState.capital) > 1) errors.push(`Expected CC pension pot capital ≈ 0, got ${pensionState.capital}`);

    return {
      success: errors.length === 0,
      errors
    };
  }
};
