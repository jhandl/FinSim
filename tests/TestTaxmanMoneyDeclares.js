const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');

module.exports = {
  name: "Taxman Money Declarations Test",
  description: "Validates Taxman Money object declarations with parity checks and currency validation",
  category: "taxman_money",
  isCustomTest: true,

  runCustomTest: async function () {
    const framework = new TestFramework();
    const errors = [];

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    framework.ensureVMUIManagerMocks(null, null);
    await vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);

    // Create a minimal context to exercise Taxman declarations directly
    const stateJson = vm.runInContext(`
      (function () {
        params = {
          startingAge: 30,
          retirementAge: 65,
          marriageYear: null,
          youngestChildBorn: null,
          oldestChildBorn: null,
          personalTaxCredit: 0,
          StartCountry: 'ie'
        };
        currentCountry = 'ie';
        residenceCurrency = 'EUR';
        year = 2024;

        attributionManager = new AttributionManager();
        attributionManager.reset(currentCountry, year, currentCountry);

        person1 = { id: 'P1', age: 30 };

        revenue = new Taxman();
        revenue.reset(person1, null, attributionManager, currentCountry, year);

        revenue.declareSalaryIncome(Money.from(50000, 'EUR', 'ie'), 0.05, person1, 'Test Salary');
        revenue.declareOtherIncome(Money.from(5000, 'EUR', 'ie'), 'Test Other');
        revenue.declareStatePensionIncome(Money.from(10000, 'EUR', 'ie'));

        return JSON.stringify({
          income: revenue.income,
          incomeMoney: revenue.incomeMoney ? revenue.incomeMoney.amount : null,
          statePension: revenue.statePension,
          statePensionMoney: revenue.statePensionMoney ? revenue.statePensionMoney.amount : null
        });
      })();
    `, framework.simulationContext);

    const state = JSON.parse(stateJson);

    if (state.incomeMoney !== null && Math.abs(state.income - state.incomeMoney) > 1e-6) {
      errors.push('Income parity failed: numeric=' + state.income + ', Money=' + state.incomeMoney);
    }

    if (state.statePensionMoney !== null && Math.abs(state.statePension - state.statePensionMoney) > 1e-6) {
      errors.push('State pension parity failed: numeric=' + state.statePension + ', Money=' + state.statePensionMoney);
    }

    // Validate currency validation (should throw on wrong currency)
    try {
      vm.runInContext(`
        var wrongCurrencyMoney = Money.from(1000, 'USD', 'us');
        revenue.declareSalaryIncome(wrongCurrencyMoney, 0, person1, 'Test');
      `, framework.simulationContext);
      errors.push('Currency validation failed: should throw on wrong currency');
    } catch (e) {
      if (!String(e && e.message).includes('expects residence currency')) {
        errors.push('Wrong error message: ' + (e && e.message));
      }
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};

