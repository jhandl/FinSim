const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'SOCIAL-CONTRIBUTION-STATE-PENSION',
  description: 'Verifies social contribution on state pension in couple mode is not double-counted.',
  category: 'unit',
  isCustomTest: true,
  async runCustomTest() {
    const TOY_SC_SP = JSON.parse(JSON.stringify(TOY_AA));
    TOY_SC_SP.socialContributions[0].applicableIncomeTypes = ['statePension'];
    // Ensure state pension age is met
    if (!TOY_SC_SP.pensionRules) TOY_SC_SP.pensionRules = {};
    TOY_SC_SP.pensionRules.statePensionAge = 66;

    const params = microParams({
      startingAge: 66,
      targetAge: 66,
      simulation_mode: 'couple',
      p2StartingAge: 66,
      statePensionWeekly: 6000 / 52,
      p2StatePensionWeekly: 4000 / 52
    });

    const scenarioDef = {
      name: 'SOCIAL-CONTRIBUTION-STATE-PENSION',
      description: 'Verifies social contribution on state pension in couple mode is not double-counted.',
      scenario: {
        parameters: params,
        events: []
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_SC_SP });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const row66 = results.dataSheet.find(r => r && r.age === 66);
    if (!row66) {
      errors.push('No row found at age 66');
    } else {
      // Total State Pension = 6000 + 4000 = 10000
      // SC rate = 0.05
      // Expected SC = 10000 * 0.05 = 500
      const sc = row66['Tax__sc'];
      if (Math.abs(sc - 500) > 1) {
        errors.push(`Expected Tax__sc ≈ 500, got ${sc}. (If double-counted, it would be ≈ 1000)`);
      }
      
      if (Math.abs(row66.incomeStatePension - 10000) > 10) {
        errors.push(`Expected incomeStatePension ≈ 10000, got ${row66.incomeStatePension}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
