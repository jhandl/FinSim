const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-SI2',
  description: 'Verifies Person 2 salary income (SI2/SI2np) and pension fund in couple mode.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 32,
      simulation_mode: 'couple',
      // Pension contributions are configured via params (not the event's rate field).
      pensionContributionsByCountry: { aa: { p1Pct: 0, p2Pct: 0.10, capped: 'No' } },
      p2StartingAge: 30,
      p2RetirementAge: 65
    });
    const events = [
      // rate is inflation override; keep it 0 for this test.
      { type: 'SI2', id: 'p2sal', amount: 10000, fromAge: 30, toAge: 30, currency: 'AAA', rate: 0, match: 0 },
      { type: 'SI2np', id: 'p2sal-np', amount: 10000, fromAge: 31, toAge: 31, currency: 'AAA', rate: 0, match: 0 }
    ];
    const scenarioDef = {
      name: 'C_B-SI2',
      description: 'Verifies Person 2 salary income (SI2/SI2np) and pension fund in couple mode.',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const row30 = results.dataSheet.find(r => r && r.age === 30);
    const row31 = results.dataSheet.find(r => r && r.age === 31);

    if (!row30) errors.push('No row found at age 30');
    else {
      // SI2: Pension(personal)=1000, IT=(10000-1000)*0.10=900, SC=500, netIncome=10000-1000-900-500=7600.
      if (Math.abs(row30.incomeSalaries - 10000) > 1) errors.push(`Age 30: Expected incomeSalaries ≈ 10000, got ${row30.incomeSalaries}`);
      if (Math.abs(row30.pensionContribution - 1000) > 1) errors.push(`Age 30: Expected pensionContribution ≈ 1000, got ${row30.pensionContribution}`);
      if (Math.abs(row30.netIncome - 7600) > 1) errors.push(`Age 30: Expected netIncome ≈ 7600, got ${row30.netIncome}`);
      if (Math.abs(row30.cashInflows - 7600) > 1) errors.push(`Age 30: Expected cashInflows ≈ 7600, got ${row30.cashInflows}`);
      if (Math.abs(row30.pensionFund - 1000) > 1) errors.push(`Age 30: Expected pensionFund ≈ 1000, got ${row30.pensionFund}`);
    }

    if (!row31) errors.push('No row found at age 31');
    else {
      // SI2np: IT=1000, SC=500, Pension=0. Net=8500.
      if (Math.abs(row31.incomeSalaries - 10000) > 1) errors.push(`Age 31: Expected incomeSalaries ≈ 10000, got ${row31.incomeSalaries}`);
      if (Math.abs(row31.pensionContribution - 0) > 1) errors.push(`Age 31: Expected pensionContribution ≈ 0, got ${row31.pensionContribution}`);
      if (Math.abs(row31.netIncome - 8500) > 1) errors.push(`Age 31: Expected netIncome ≈ 8500, got ${row31.netIncome}`);
      if (Math.abs(row31.cashInflows - 8500) > 1) errors.push(`Age 31: Expected cashInflows ≈ 8500, got ${row31.cashInflows}`);
      // Fund remains 1000 from previous year (no growth in this test)
      if (Math.abs(row31.pensionFund - 1000) > 1) errors.push(`Age 31: Expected pensionFund ≈ 1000, got ${row31.pensionFund}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
