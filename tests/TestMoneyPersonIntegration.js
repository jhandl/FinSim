const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');

module.exports = {
  name: "Money Person Integration - State Pension",
  description: "Verify Person state pension Money tracking works correctly",
  isCustomTest: true,
  runCustomTest: async function () {
    const framework = new TestFramework();
    const errors = [];

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    const params = {
      startingAge: 64,
      targetAge: 68,
      initialSavings: 10000,
      initialPension: 0,
      initialFunds: 0,
      initialShares: 0,
      retirementAge: 65,
      emergencyStash: 0,
      pensionPercentage: 0,
      pensionCapped: "No",
      statePensionWeekly: 289,
      growthRatePension: 0.05,
      growthDevPension: 0.0,
      growthRateFunds: 0.07,
      growthDevFunds: 0.0,
      growthRateShares: 0.08,
      growthDevShares: 0.0,
      inflation: 0.02,
      FundsAllocation: 0,
      SharesAllocation: 0,
      priorityCash: 1,
      priorityPension: 4,
      priorityFunds: 2,
      priorityShares: 3,
      marriageYear: null,
      youngestChildBorn: null,
      oldestChildBorn: null,
      personalTaxCredit: 1875,
      StartCountry: 'ie',
      simulation_mode: 'single'
    };

    const events = [
      { type: "SI", id: "salary", amount: 30000, fromAge: 64, toAge: 65, rate: 0, match: 0 }
    ];

    const results = await framework.executeCoreSimulation(params, events);
    if (!results || !results.success || !results.dataSheet) {
      errors.push('Simulation failed or returned no dataSheet');
      return { success: false, errors: errors };
    }

    const ctx = framework.simulationContext;
    const personExists = vm.runInContext('typeof person1 !== "undefined" && person1 !== null', ctx);
    if (!personExists) {
      errors.push('person1 not initialized in simulation context');
      return { success: false, errors: errors };
    }

    const row66 = results.dataSheet.find(r => r && r.age === 66);
    if (!row66) {
      errors.push('Missing age 66 data row');
    } else if (row66.incomeStatePension === 0) {
      errors.push('State pension is zero at age 66 (expected positive value)');
    } else if (!(typeof row66.incomeStatePension === 'number' && row66.incomeStatePension > 0)) {
      errors.push('Expected state pension > 0 at age 66 (got: ' + row66.incomeStatePension + ', type: ' + typeof row66.incomeStatePension + ')');
    }

    const snapshot = vm.runInContext(
      '(function(){ return { ' +
      '  statePension: (person1.yearlyIncomeStatePension && typeof person1.yearlyIncomeStatePension.amount === "number") ? person1.yearlyIncomeStatePension.amount : null, ' +
      '  baseCurrency: person1.yearlyIncomeStatePensionBaseCurrency ? person1.yearlyIncomeStatePensionBaseCurrency.amount : null, ' +
      '  currency: person1.yearlyIncomeStatePension ? person1.yearlyIncomeStatePension.currency : null ' +
      '}; })()',
      ctx
    );
    if (snapshot && snapshot.statePension !== null && snapshot.statePension <= 0) {
      errors.push('Expected positive state pension amount at age 66, got: ' + snapshot.statePension);
    }
    if (snapshot && snapshot.currency !== 'EUR') {
      errors.push('Expected EUR currency for IE state pension, got: ' + snapshot.currency);
    }

    return { success: errors.length === 0, errors: errors };
  }
};
