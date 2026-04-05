const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'SI2 Uses P2 Age Scope',
  description: 'Verifies SI2 and SI2np age windows are evaluated against person2.age.',
  category: 'core',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      startingAge: 40,
      targetAge: 41,
      simulation_mode: 'couple',
      pensionContributionsByCountry: { aa: { p1Pct: 0, p2Pct: 0.10, capped: 'No' } },
      p2StartingAge: 30,
      p2RetirementAge: 65
    });

    const scenarioDef = {
      name: 'SI2 Uses P2 Age Scope',
      description: 'P1 and P2 start at different ages; SI2 windows should follow P2 ages.',
      scenario: {
        parameters: params,
        events: [
          { type: 'SI2', id: 'p2-salary', amount: 10000, fromAge: 30, toAge: 30, currency: 'AAA', rate: 0, match: 0 },
          { type: 'SI2np', id: 'p2-salary-np', amount: 10000, fromAge: 31, toAge: 31, currency: 'AAA', rate: 0, match: 0 }
        ]
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA });
    const results = await framework.runSimulation();

    if (!results || !results.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const errors = [];
    const row40 = results.dataSheet.find(r => r && r.age === 40);
    const row41 = results.dataSheet.find(r => r && r.age === 41);

    if (!row40) {
      errors.push('No row found at age 40');
    } else {
      if (Math.abs(row40.incomeSalaries - 10000) > 1) errors.push('Age 40: expected incomeSalaries ≈ 10000, got ' + row40.incomeSalaries);
      if (Math.abs(row40.pensionContribution - 1000) > 1) errors.push('Age 40: expected pensionContribution ≈ 1000, got ' + row40.pensionContribution);
      if (Math.abs(row40.netIncome - 7600) > 1) errors.push('Age 40: expected netIncome ≈ 7600, got ' + row40.netIncome);
    }

    if (!row41) {
      errors.push('No row found at age 41');
    } else {
      if (Math.abs(row41.incomeSalaries - 10000) > 1) errors.push('Age 41: expected incomeSalaries ≈ 10000, got ' + row41.incomeSalaries);
      if (Math.abs(row41.pensionContribution - 0) > 1) errors.push('Age 41: expected pensionContribution ≈ 0, got ' + row41.pensionContribution);
      if (Math.abs(row41.netIncome - 8500) > 1) errors.push('Age 41: expected netIncome ≈ 8500, got ' + row41.netIncome);
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};
