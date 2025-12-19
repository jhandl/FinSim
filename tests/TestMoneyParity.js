const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');

function withinTolerance(actual, expected, absTol) {
  return Math.abs(actual - expected) <= absTol;
}

module.exports = {
  name: 'MoneyParity',
  description: 'Regression: Money structs and numeric paths stay in sync across equities ops and state pension flows.',
  isCustomTest: true,
  runCustomTest: async function() {
    const framework = new TestFramework();
    const errors = [];

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    const ctx = framework.simulationContext;
    framework.ensureVMUIManagerMocks(null, null);
    await vm.runInContext('Config.initialize(WebUI.getInstance())', ctx);

    // Stub revenue hooks (many assets report income/gains here).
    vm.runInContext(
      `
      revenue = {
        declareInvestmentIncome: function() {},
        declareInvestmentGains: function() {},
        declarePrivatePensionIncome: function() {},
        declarePrivatePensionLumpSum: function() {}
      };
    `,
      ctx
    );

    // Equity: buy/addYear parity.
    try {
      const result = vm.runInContext(
        `
        (function() {
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          var asset = new IndexFunds(0.05, 0);
          asset.buy(10000, 'EUR', 'ie');
          asset.addYear();
          var h = asset.portfolio[0];
          var sum = h.principal.amount + h.interest.amount;
          return { capital: asset.capital(), principal: h.principal.amount, interest: h.interest.amount, sum: sum };
        })()
      `,
        ctx
      );

      if (!result || !withinTolerance(result.principal, 10000, 1e-9)) {
        errors.push('Equities parity (buy/addYear): principal mismatch');
      }
      if (!result || typeof result.interest !== 'number' || result.interest <= 0) {
        errors.push('Equities parity (buy/addYear): expected positive interest after addYear');
      }
      if (!result || !withinTolerance(result.capital, result.sum, 1e-6)) {
        errors.push('Equities parity (buy/addYear): capital() does not match Money sum');
      }
    } catch (err) {
      errors.push('Equities parity (buy/addYear) threw: ' + (err && err.message ? err.message : String(err)));
    }

    // Equity: buy/addYear/sell conservation and parity.
    try {
      const result = vm.runInContext(
        `
        (function() {
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          year = Config.getInstance().getSimulationStartYear();
          var asset = new Shares(0.05, 0);
          asset.buy(10000, 'EUR', 'ie');
          asset.addYear();
          var before = asset.capital();
          var sold = asset.sell(5000);
          var after = asset.capital();
          var sum = 0;
          for (var i = 0; i < asset.portfolio.length; i++) {
            var h = asset.portfolio[i];
            sum += h.principal.amount + h.interest.amount;
          }
          return { before: before, sold: sold, after: after, sum: sum };
        })()
      `,
        ctx
      );

      if (!result || typeof result.sold !== 'number' || !withinTolerance(result.sold, 5000, 1e-9)) {
        errors.push('Equities parity (sell): sell() did not return expected numeric amount');
      }
      if (!result || !withinTolerance(result.after, result.sum, 1e-6)) {
        errors.push('Equities parity (sell): capital() does not match Money sum after sell');
      }
      if (!result || !withinTolerance(result.before, result.after + result.sold, 1e-6)) {
        errors.push('Equities parity (sell): capital not conserved (before != after + sold)');
      }
    } catch (err) {
      errors.push('Equities parity (buy/addYear/sell) threw: ' + (err && err.message ? err.message : String(err)));
    }

    // State pension: numeric row vs Money field parity (no inflation for determinism).
    try {
      const params = {
        startingAge: 65,
        targetAge: 67,
        retirementAge: 65,
        initialSavings: 0,
        initialPension: 0,
        initialFunds: 0,
        initialShares: 0,
        emergencyStash: 0,
        pensionPercentage: 0,
        pensionCapped: 'No',
        statePensionWeekly: 289,
        statePensionCurrency: 'EUR',
        statePensionCountry: 'ie',
        growthRatePension: 0.05,
        growthDevPension: 0.0,
        growthRateFunds: 0.07,
        growthDevFunds: 0.0,
        growthRateShares: 0.08,
        growthDevShares: 0.0,
        inflation: 0,
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

      const results = await framework.executeCoreSimulation(params, []);
      if (!results || !results.success || !results.dataSheet) {
        errors.push('State pension parity: simulation failed or returned no dataSheet');
      } else {
        const expected = 52 * 289;
        const row66 = results.dataSheet.find(r => r && r.age === 66);
        const row67 = results.dataSheet.find(r => r && r.age === 67);

        if (!row66) {
          errors.push('State pension parity: missing age 66 data row');
        } else if (!withinTolerance(row66.incomeStatePension, expected, 1e-9)) {
          errors.push('State pension parity: age 66 incomeStatePension mismatch');
        }

        if (!row67) {
          errors.push('State pension parity: missing age 67 data row');
        } else if (!withinTolerance(row67.incomeStatePension, expected, 1e-9)) {
          errors.push('State pension parity: age 67 incomeStatePension mismatch');
        }

        const snapshot = vm.runInContext(
          `(function(){
            return {
              money: person1 && person1.yearlyIncomeStatePension ? person1.yearlyIncomeStatePension.amount : null,
              base: person1 && person1.yearlyIncomeStatePensionBaseCurrency ? person1.yearlyIncomeStatePensionBaseCurrency.amount : null
            };
          })()`,
          framework.simulationContext
        );

        if (!snapshot || snapshot.money === null || snapshot.base === null) {
          errors.push('State pension parity: missing Money fields on person1 after simulation');
        } else {
          if (!withinTolerance(snapshot.money, expected, 1e-9) || !withinTolerance(snapshot.base, expected, 1e-9)) {
            errors.push('State pension parity: Money amount mismatch vs expected');
          }
          if (row67 && !withinTolerance(snapshot.money, row67.incomeStatePension, 1e-9)) {
            errors.push('State pension parity: Money amount mismatch vs dataSheet numeric value');
          }
        }
      }
    } catch (err) {
      errors.push('State pension parity threw: ' + (err && err.message ? err.message : String(err)));
    }

    return { success: errors.length === 0, errors: errors };
  }
};

