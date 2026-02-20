const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'C_I-DUAL-STATE-PENSIONS',
  description: 'Verifies dual state pensions are aggregated per country.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const TOY_AA_STATE = deepClone(TOY_AA);
    TOY_AA_STATE.pensionRules.statePensionAge = 70;
    TOY_AA_STATE.pensionRules.statePensionPeriod = 'weekly';

    const params = microParams({
      targetAge: 71,
      retirementAge: 70,
      StartCountry: 'aa',
      statePensionByCountry: { aa: 100, bb: 50 }
    });

    const scenarioDef = {
      name: 'C_I-DUAL-STATE-PENSIONS',
      description: 'Verifies dual state pensions are aggregated per country.',
      scenario: {
        parameters: params,
        events: []
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA_STATE, bb: TOY_BB });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const row70 = results.dataSheet.find(r => r && r.age === 70);
    if (!row70) {
      errors.push('No row found at age 70');
    } else if (!(row70.incomeStatePension > 0)) {
      errors.push('Expected incomeStatePension > 0 at age 70');
    }

    const stateByCountry = vm.runInContext('JSON.stringify(person1.yearlyIncomeStatePensionByCountry)', framework.simulationContext);
    const parsed = JSON.parse(stateByCountry);
    if (!parsed.aa) errors.push('Missing AA state pension in yearlyIncomeStatePensionByCountry');
    if (!parsed.bb) errors.push('Missing BB state pension in yearlyIncomeStatePensionByCountry');

    return {
      success: errors.length === 0,
      errors
    };
  }
};
