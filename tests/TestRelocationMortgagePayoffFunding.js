const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { getDisplayAmountByLabel } = require('./helpers/DisplayAttributionTestHelpers.js');

function findRowByAge(rows, age) {
  return rows.find(row => row && typeof row === 'object' && Math.round(row.age) === age);
}

module.exports = {
  name: 'RelocationMortgagePayoffFunding',
  description: 'A relocation-cut-short mortgage with payoff marker must draw down reserves at payoff age.',
  isCustomTest: true,
  runCustomTest: async function () {
    const framework = new TestFramework();
    const errors = [];

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    const params = {
      startingAge: 30,
      targetAge: 41,
      retirementAge: 65,
      initialSavings: 100000,
      initialPension: 0,
      initialFunds: 0,
      initialShares: 0,
      emergencyStash: 0,
      FundsAllocation: 0,
      SharesAllocation: 0,
      priorityCash: 1,
      priorityFunds: 2,
      priorityShares: 3,
      priorityPension: 4,
      pensionPercentage: 0,
      pensionCapped: 'No',
      statePensionWeekly: 0,
      growthRateFunds: 0,
      growthDevFunds: 0,
      growthRateShares: 0,
      growthDevShares: 0,
      growthRatePension: 0,
      growthDevPension: 0,
      inflation: 0,
      simulation_mode: 'single',
      economy_mode: 'deterministic',
      StartCountry: 'ie'
    };

    const events = [
      { type: 'FI', id: 'SupportIncome', amount: 12000, fromAge: 30, toAge: 39, currency: 'EUR', linkedCountry: 'ie' },
      { type: 'M', id: 'HomeA', amount: 12000, fromAge: 30, toAge: 39, rate: 0.04, currency: 'EUR', linkedCountry: 'ie' },
      { type: 'MV', id: 'Move_US', name: 'US', fromAge: 40, toAge: 40 }
    ];

    framework.ensureVMUIManagerMocks(params, events);
    await vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);

    // Mirror relocation "Pay Off" metadata on a cut-short mortgage.
    // Override settleMortgage with deterministic positive payoff so this test focuses
    // on reserve drawdown behavior at payoff age.
    vm.runInContext(`
      (function () {
        for (var i = 0; i < testEvents.length; i++) {
          var evt = testEvents[i];
          if (evt && evt.type === 'M' && evt.id === 'HomeA') {
            evt.relocationSellMvId = 'mvlink_payoff_homea';
            evt.relocationSellAnchorAge = 40;
          }
        }
        RealEstate.prototype.settleMortgage = function (id) {
          if (id in this.properties) {
            this.properties[id].borrowed = null;
            this.properties[id].payment = null;
            this.properties[id].totalPayments = 0;
            this.properties[id].monthsPaid = 0;
            this.properties[id].monthlyRate = 0;
            this.properties[id].monthlyPaymentAmount = 0;
            this.properties[id].fractionRepaid = this.properties[id].purchaseBasisAmount > 0 ? 1 : 0;
          }
          return 30000;
        };
      })();
    `, framework.simulationContext);

    const runPromise = vm.runInContext('run()', framework.simulationContext);
    if (runPromise && typeof runPromise.then === 'function') await runPromise;

    const result = vm.runInContext('({ success: success, failedAt: failedAt, dataSheet: dataSheet })', framework.simulationContext);
    if (!result || !Array.isArray(result.dataSheet)) {
      return { success: false, errors: ['Simulation did not produce a data sheet'] };
    }
    if (!result.success) {
      errors.push('Simulation failed at age ' + result.failedAt);
      return { success: false, errors };
    }

    const rows = result.dataSheet.filter(row => row && typeof row === 'object');
    const prePayoffRow = findRowByAge(rows, 38);
    const payoffRow = findRowByAge(rows, 39);
    if (!prePayoffRow || !payoffRow) {
      return { success: false, errors: ['Missing required rows around payoff age (38/39)'] };
    }

    const payoffLabel = 'Mortgage Payoff (HomeA)';
    const payoffAmount = getDisplayAmountByLabel(payoffRow, 'Expenses', payoffLabel);

    if (!(payoffAmount > 0)) {
      errors.push('Expected positive "' + payoffLabel + '" expense at payoff age');
    }
    if (!(payoffRow.expenses > prePayoffRow.expenses)) {
      errors.push('Expected payoff-year expenses to exceed pre-payoff-year expenses');
    }
    if (!(payoffRow.cash < prePayoffRow.cash)) {
      errors.push('Expected reserves (cash) to be drawn down at payoff age');
    }

    return { success: errors.length === 0, errors };
  }
};
