const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_FXConstantMode',
  description: 'Verifies constant FX mode: rate 1 BBB = 0.5 AAA is applied identically each year.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ 
      targetAge: 32, 
      fxMode: 'constant',
      StartCountry: 'aa'
    });
    
    // UI events with currency BBB and linkedCountry bb
    const events = [
      { type: 'UI', id: 'inc1', amount: 10000, fromAge: 30, toAge: 30, currency: 'BBB', linkedCountry: 'bb', label: 'Income Yr1' },
      { type: 'UI', id: 'inc2', amount: 10000, fromAge: 31, toAge: 31, currency: 'BBB', linkedCountry: 'bb', label: 'Income Yr2' }
    ];

    const scenarioDef = {
      name: 'C_FXConstantMode',
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
    const row31 = results.dataSheet.find(r => r && r.age === 31);

    if (!row30 || !row31) {
      errors.push('Required rows (age 30, 31) missing');
    } else {
      // 10000 BBB -> AAA (1 BBB = 0.5 AAA because AA=1.0 perEur, BB=2.0 perEur)
      // incomeSalaries or incomeTotal should be 5000 AAA
      const inc30 = row30.incomeSalaries || row30.incomeTotal;
      const inc31 = row31.incomeSalaries || row31.incomeTotal;

      if (Math.abs(inc30 - 5000) > 1) errors.push(`Age 30: Expected income ≈ 5000 AAA, got ${inc30}`);
      if (Math.abs(inc31 - 5000) > 1) errors.push(`Age 31: Expected income ≈ 5000 AAA, got ${inc31}`);
      if (Math.abs(inc30 - inc31) > 1) errors.push(`FX drift detected in constant mode: ${inc30} vs ${inc31}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
