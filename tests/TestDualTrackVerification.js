const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');

function withinTolerance(actual, expected, absTol) {
  return Math.abs(actual - expected) <= absTol;
}

module.exports = {
  name: 'DualTrackVerification',
  description: 'Verifies Money-only contract across equities, real estate, and pensions.',
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

    async function runCase(name, fn) {
      try {
        await fn();
      } catch (err) {
        errors.push(name + ' failed: ' + (err && err.message ? err.message : String(err)));
      }
    }

    await runCase('Money parity toggle', () => {
      const result = vm.runInContext(
        `
        (function() {
          Money.enableParityChecks(true);
          var enabled = Money.parityChecksEnabled();
          Money.enableParityChecks(false);
          var disabled = Money.parityChecksEnabled();
          return { enabled: enabled, disabled: disabled };
        })()
      `,
        ctx
      );
      if (!result || result.enabled !== true || result.disabled !== false) {
        errors.push('Money parity toggle did not behave as expected');
      }
    });

    await runCase('IndexFunds buy creates Money holdings', () => {
      const result = vm.runInContext(
        `
        (function() {
          var asset = new IndexFunds(0.05, 0);
          asset.buy(10000, 'EUR', 'ie');
          var holding = asset.portfolio[0];
          var cap = asset.capital();
          return {
            portfolioLen: asset.portfolio.length,
            hasPortfolioMoney: typeof asset.portfolioMoney !== 'undefined',
            principalAmountType: typeof holding.principal.amount,
            interestAmountType: typeof holding.interest.amount,
            currency: holding.principal.currency,
            country: holding.principal.country,
            capitalType: typeof cap,
            capital: cap
          };
        })()
      `,
        ctx
      );
      if (!result || result.portfolioLen !== 1) {
        errors.push('IndexFunds buy did not create a holding in portfolio');
      }
      if (result.hasPortfolioMoney) {
        errors.push('IndexFunds should not expose portfolioMoney in Money-only mode');
      }
      if (result.principalAmountType !== 'number' || result.interestAmountType !== 'number') {
        errors.push('IndexFunds holding Money amount fields are not numbers');
      }
      if (result.currency !== 'EUR' || result.country !== 'ie') {
        errors.push('IndexFunds Money metadata mismatch (currency/country)');
      }
      if (result.capitalType !== 'number' || !withinTolerance(result.capital, 10000, 1e-9)) {
        errors.push('IndexFunds capital() should return a number equal to principal before growth');
      }
    });

    await runCase('IndexFunds addYear grows Money interest', () => {
      const result = vm.runInContext(
        `
        (function() {
          var asset = new IndexFunds(0.05, 0);
          asset.buy(10000, 'EUR', 'ie');
          asset.addYear();
          var h = asset.portfolio[0];
          var cap = asset.capital();
          return {
            principalAmount: h.principal.amount,
            interestAmount: h.interest.amount,
            capital: cap
          };
        })()
      `,
        ctx
      );
      if (!result || typeof result.interestAmount !== 'number' || result.interestAmount <= 0) {
        errors.push('IndexFunds addYear did not apply growth to Money interest');
      }
      if (typeof result.capital !== 'number' || result.capital <= 10000) {
        errors.push('IndexFunds capital() did not reflect growth after addYear');
      }
    });

    await runCase('Shares sell returns number and mutates holdings', () => {
      const result = vm.runInContext(
        `
        (function() {
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          year = Config.getInstance().getSimulationStartYear();
          var asset = new Shares(0, 0);
          asset.buy(10000, 'EUR', 'ie');
          var sold = asset.sell(5000);
          var remaining = asset.capital();
          var len = asset.portfolio.length;
          var hasPortfolioMoney = typeof asset.portfolioMoney !== 'undefined';
          var principal = asset.portfolio.length ? asset.portfolio[0].principal.amount : null;
          return { sold: sold, remaining: remaining, len: len, hasPortfolioMoney: hasPortfolioMoney, principal: principal };
        })()
      `,
        ctx
      );
      if (!result || typeof result.sold !== 'number' || typeof result.remaining !== 'number') {
        errors.push('Shares sell() and capital() must return numbers');
      }
      if (result.hasPortfolioMoney) {
        errors.push('Shares should not expose portfolioMoney in Money-only mode');
      }
      if (result.sold < 0 || result.remaining < 0) {
        errors.push('Shares sell produced negative values');
      }
      if (result.len !== 1 || !withinTolerance(result.principal, 5000, 1e-6)) {
        errors.push('Shares sell did not leave expected remaining principal');
      }
    });

    await runCase('Pension holdings preserve source currency/country', () => {
      const result = vm.runInContext(
        `
        (function() {
          params = { StartCountry: 'ie' };
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          var pension = new Pension(0, 0, { name: 'P1' });
          pension.buy(10000, 'EUR', 'ie');
          currentCountry = 'ar';
          residenceCurrency = 'ARS';
          pension.buy(5000, 'EUR', 'ie');
          return {
            count: pension.portfolio.length,
            c1: pension.portfolio[0].principal.currency,
            k1: pension.portfolio[0].principal.country,
            c2: pension.portfolio[1].principal.currency,
            k2: pension.portfolio[1].principal.country
          };
        })()
      `,
        ctx
      );
      if (!result || result.count !== 2) {
        errors.push('Pension expected 2 Money holdings after two buys');
      } else if (result.c1 !== 'EUR' || result.c2 !== 'EUR' || result.k1 !== 'ie' || result.k2 !== 'ie') {
        errors.push('Pension Money holdings did not preserve source currency/country');
      }
    });

    await runCase('Property uses Money fields and methods return numbers', () => {
      const result = vm.runInContext(
        `
        (function() {
          var p = new Property();
          p.buy(100000, 0.03, 'EUR', 'ie');
          p.mortgage(30, 0.02, 12000, 'EUR', 'ie');
          p.addYear();
          var v = p.getValue();
          var pay = p.getPayment();
          return {
            paid: p.paid,
            borrowed: p.borrowed,
            payment: p.payment,
            currency: p.getCurrency(),
            country: p.getLinkedCountry(),
            valueType: typeof v,
            paymentType: typeof pay,
            value: v,
            pay: pay
          };
        })()
      `,
        ctx
      );

      if (!result || !result.paid || typeof result.paid.amount !== 'number') {
        errors.push('Property.paid must be a Money struct');
      }
      if (!result.payment || typeof result.payment.amount !== 'number') {
        errors.push('Property.payment must be a Money struct after mortgage()');
      }
      if (!result.borrowed || typeof result.borrowed.amount !== 'number') {
        errors.push('Property.borrowed must be a Money struct after mortgage()');
      }
      if (typeof result.value !== 'number' || typeof result.pay !== 'number') {
        errors.push('Property.getValue()/getPayment() must return numbers');
      }
      if (result.valueType !== 'number' || result.paymentType !== 'number') {
        errors.push('Property public method return types are not numbers');
      }
      if (result.currency !== 'EUR' || result.country !== 'ie') {
        errors.push('Property.getCurrency()/getLinkedCountry() must derive from Money fields');
      }
    });

    await runCase('RealEstate.getTotalValue returns number', () => {
      const result = vm.runInContext(
        `
        (function() {
          Money.enableParityChecks(true);
          var re = new RealEstate();
          re.buy('p1', 100000, 0.03, 'EUR', 'ie');
          re.buy('p2', 200000, 0.01, 'EUR', 'ie');
          re.addYear();
          var total = re.getTotalValue();
          Money.enableParityChecks(false);
          return { totalType: typeof total, total: total };
        })()
      `,
        ctx
      );
      if (!result || result.totalType !== 'number' || !(result.total > 0)) {
        errors.push('RealEstate.getTotalValue() must return a positive number');
      }
    });

    await runCase('Person state pension stored as Money', () => {
      const result = vm.runInContext(
        `
        (function() {
          var cfg = Config.getInstance();
          var startYear = cfg.getSimulationStartYear();
          var p = new Person('P1', {
            startingAge: 70,
            retirementAge: 65,
            statePensionWeekly: 250,
            pensionContributionPercentage: 0,
            statePensionCurrency: 'EUR',
            statePensionCountry: 'ie'
          }, { inflation: 0 }, { growthRatePension: 0, growthDevPension: 0 });
          p.calculateYearlyPensionIncome(cfg, 'ie', 'EUR', startYear);
          var sp = p.yearlyIncomeStatePension;
          var spBase = p.yearlyIncomeStatePensionBaseCurrency;
          return {
            hasStatePension: !!sp,
            hasStatePensionBase: !!spBase,
            spAmountType: sp ? typeof sp.amount : null,
            spBaseAmountType: spBase ? typeof spBase.amount : null,
            spAmount: sp ? sp.amount : 0,
            spBaseAmount: spBase ? spBase.amount : 0
          };
        })()
      `,
        ctx
      );
      if (!result || !result.hasStatePension || result.spAmountType !== 'number' || !(result.spAmount > 0)) {
        errors.push('Person.yearlyIncomeStatePension must be a positive Money struct');
      }
      if (!result.hasStatePensionBase || result.spBaseAmountType !== 'number' || !(result.spBaseAmount > 0)) {
        errors.push('Person.yearlyIncomeStatePensionBaseCurrency must be a positive Money struct');
      }
    });

    await runCase('Private pension drawdown returns number in simulation', async () => {
      const params = {
        startingAge: 64,
        targetAge: 67,
        initialSavings: 0,
        initialPension: 100000,
        initialFunds: 0,
        initialShares: 0,
        retirementAge: 65,
        emergencyStash: 0,
        pensionPercentage: 0,
        pensionCapped: 'No',
        statePensionWeekly: 0,
        growthRatePension: 0,
        growthDevPension: 0.0,
        growthRateFunds: 0,
        growthDevFunds: 0.0,
        growthRateShares: 0,
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
      const events = [];

      const results = await framework.executeCoreSimulation(params, events);

      if (!results || !results.success || !Array.isArray(results.dataSheet)) {
        errors.push('Core simulation failed when verifying pension drawdown');
        return;
      }
      const row66 = results.dataSheet.find(r => r && r.age === 66);
      if (!row66) {
        errors.push('Missing age 66 row for pension drawdown verification');
        return;
      }
      if (!(typeof row66.incomePrivatePension === 'number')) {
        errors.push('incomePrivatePension must be a number');
      }
      if (!(row66.incomePrivatePension >= 0)) {
        errors.push('incomePrivatePension must be non-negative');
      }
    });

    return { success: errors.length === 0, errors: errors };
  }
};
