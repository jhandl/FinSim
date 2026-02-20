const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_FXEvolutionMode',
  description: 'Verifies evolution FX mode: rate drifts due to inflation differential.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    // Create BB with 2% inflation (CPI=2.0), AA has 0%
    const TOY_BB_DRIFT = deepClone(TOY_BB);
    TOY_BB_DRIFT.economicData.inflation.cpi = 2.0;

    const params = microParams({ 
      targetAge: 32, 
      fxMode: 'evolution',
      StartCountry: 'aa'
    });
    
    const events = [
      { type: 'UI', id: 'inc1', amount: 10000, fromAge: 30, toAge: 30, currency: 'BBB', linkedCountry: 'bb' },
      { type: 'UI', id: 'inc2', amount: 10000, fromAge: 31, toAge: 31, currency: 'BBB', linkedCountry: 'bb' }
    ];

    const scenarioDef = {
      name: 'C_FXEvolutionMode',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA, bb: TOY_BB_DRIFT });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const row30 = results.dataSheet.find(r => r && r.age === 30);
    const row31 = results.dataSheet.find(r => r && r.age === 31);

    if (!row30 || !row31) {
      errors.push('Required rows (age 30, 31) missing');
    } else {
      const inc30 = row30.incomeSalaries || row30.incomeTotal;
      const inc31 = row31.incomeSalaries || row31.incomeTotal;

      // Year 1 (Base): 10000 BBB -> 5000 AAA (1 BBB = 0.5 AAA)
      // Year 2: BB perEur evolves: 2.0 * 1.02 = 2.04
      // New rate: 1 AAA = 2.04 BBB, so 1 BBB = 1/2.04 ≈ 0.4902 AAA
      // 10000 BBB -> 4901.96 AAA
      
      if (Math.abs(inc30 - 5000) > 1) errors.push(`Age 30: Expected income ≈ 5000 AAA, got ${inc30}`);
      if (inc31 >= inc30) errors.push(`Age 31 income (${inc31}) should be less than age 30 (${inc30}) due to BB inflation drift`);
      if (Math.abs(inc31 - 4902) > 5) errors.push(`Age 31: Expected income ≈ 4902 AAA, got ${inc31}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
