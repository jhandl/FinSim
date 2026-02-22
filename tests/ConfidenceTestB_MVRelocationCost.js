const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-MVRelocationCost',
  description: 'Verifies relocation cost deduction from cash.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ 
      targetAge: 31, 
      initialSavings: 2000, 
      relocationEnabled: true 
    });
    const events = [
      { type: 'SI', id: 'salary', amount: 1000, fromAge: 30, toAge: 30, currency: 'AAA', linkedCountry: 'aa' },
      { type: 'MV', name: 'bb', id: 'move-bb', amount: 500, fromAge: 30, toAge: 30 }
    ];
    const scenarioDef = {
      name: 'C_B-MVRelocationCost',
      description: 'Verifies relocation cost deduction from cash.',
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

    const row30 = results.dataSheet.find(r => r && r.age === 30);
    if (!row30) {
      errors.push('No row found at age 30');
    } else {
      // What is tested:
      // MV event amount is treated as a direct expense in move year.
      //
      // Hand math:
      // Relocation amount = 500 => expenses must include 500.
      if (Math.abs(row30.expenses - 500) > 1) errors.push(`Expected relocation expenses ≈ 500, got ${row30.expenses}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
