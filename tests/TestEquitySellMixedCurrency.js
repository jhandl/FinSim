const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules } = require('./helpers/RelocationTestHelpers.js');
const vm = require('vm');

const US_RULES = require('../src/core/config/tax-rules-us.json');

module.exports = {
  name: 'EquitySellMixedCurrency',
  description: 'Ensures Equity.sell() converts per holding for mixed-currency portfolios.',
  isCustomTest: true,
  runCustomTest: async function () {
    const framework = new TestFramework();
    const errors = [];

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    const ctx = framework.simulationContext;
    framework.ensureVMUIManagerMocks(null, null);
    await vm.runInContext('Config.initialize(WebUI.getInstance())', ctx);

    // Ensure USD is a known currency->country mapping for strict FX conversions
    installTestTaxRules(framework, { us: US_RULES });

    // Simulator-level helpers (convertCurrencyAmount -> convertNominal) expect global `config`/`economicData`.
    vm.runInContext(`
      config = Config.getInstance();
      economicData = config.getEconomicData();
    `, ctx);

    vm.runInContext(`
      revenue = {
        lastIncome: null,
        lastGains: null,
        declareInvestmentIncome: function(money) { this.lastIncome = money.amount; },
        declareInvestmentGains: function(money) { this.lastGains = money.amount; },
        declarePrivatePensionIncome: function() {},
        declarePrivatePensionLumpSum: function() {}
      };
    `, ctx);

    try {
      const result = vm.runInContext(`
        (function() {
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          year = Config.getInstance().getSimulationStartYear();

          var asset = new Shares(0, 0);
          asset.buy(100, 'USD', 'us');
          asset.buy(200, 'EUR', 'ie');
          asset.portfolio[0].interest.amount = 20; // USD gains
          asset.portfolio[1].interest.amount = 10; // EUR gains

          var usdCap = asset.portfolio[0].principal.amount + asset.portfolio[0].interest.amount; // 120 USD
          var usdCapEur = convertCurrencyAmount(usdCap, 'USD', 'us', 'EUR', 'ie', year, true);
          var usdGainsEur = convertCurrencyAmount(20, 'USD', 'us', 'EUR', 'ie', year, true);
          if (usdCapEur === null || usdGainsEur === null) throw new Error('FX conversion failed for USD->EUR');

          var eurCap = asset.portfolio[1].principal.amount + asset.portfolio[1].interest.amount; // 210 EUR
          var targetSell = usdCapEur + 0.25 * eurCap;
          var expectedGains = usdGainsEur + 0.25 * 10;

          var sold = asset.sell(targetSell);
          var remaining = asset.capital();

          return {
            sold: sold,
            remaining: remaining,
            expectedSold: targetSell,
            expectedRemaining: (usdCapEur + eurCap) - targetSell,
            expectedGains: expectedGains,
            lastIncome: revenue.lastIncome,
            lastGains: revenue.lastGains,
            holdingCount: asset.portfolio.length,
            remainingCurrency: asset.portfolio[0] ? asset.portfolio[0].principal.currency : null,
            remainingCountry: asset.portfolio[0] ? asset.portfolio[0].principal.country : null,
            remainingPrincipal: asset.portfolio[0] ? asset.portfolio[0].principal.amount : null,
            remainingInterest: asset.portfolio[0] ? asset.portfolio[0].interest.amount : null
          };
        })()
      `, ctx);

      const tol = 1e-6;
      if (!result || typeof result.sold !== 'number') {
        errors.push('Expected numeric sold result');
      } else {
        if (Math.abs(result.sold - result.expectedSold) > 1e-4) {
          errors.push('Sold mismatch: sold=' + result.sold + ' expected=' + result.expectedSold);
        }
        if (Math.abs(result.remaining - result.expectedRemaining) > 1e-4) {
          errors.push('Remaining mismatch: remaining=' + result.remaining + ' expected=' + result.expectedRemaining);
        }
        if (Math.abs(result.lastIncome - result.expectedSold) > 1e-4) {
          errors.push('Revenue income mismatch: income=' + result.lastIncome + ' expected=' + result.expectedSold);
        }
        if (Math.abs(result.lastGains - result.expectedGains) > 1e-4) {
          errors.push('Revenue gains mismatch: gains=' + result.lastGains + ' expected=' + result.expectedGains);
        }
        if (result.holdingCount !== 1) {
          errors.push('Expected 1 remaining holding, got ' + result.holdingCount);
        }
        if (result.remainingCurrency !== 'EUR' || result.remainingCountry !== 'ie') {
          errors.push('Expected remaining holding in EUR/ie, got ' + result.remainingCurrency + '/' + result.remainingCountry);
        }
        if (Math.abs(result.remainingPrincipal - 150) > tol) {
          errors.push('Expected remaining principal 150 EUR, got ' + result.remainingPrincipal);
        }
        if (Math.abs(result.remainingInterest - 7.5) > tol) {
          errors.push('Expected remaining interest 7.5 EUR, got ' + result.remainingInterest);
        }
      }
    } catch (err) {
      errors.push('Mixed-currency sell test failed: ' + err.message);
    }

    return { success: errors.length === 0, errors: errors };
  }
};
