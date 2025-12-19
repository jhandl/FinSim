const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');

module.exports = {
  name: 'MoneyEquityIntegration',
  description: 'Validates Money holdings for equity portfolios.',
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

    vm.runInContext(`
      revenue = {
        declareInvestmentIncome: function() {},
        declareInvestmentGains: function() {},
        declarePrivatePensionIncome: function() {},
        declarePrivatePensionLumpSum: function() {}
      };
    `, ctx);

    // Test 1: Single-currency parity (EUR)
    try {
      const result = vm.runInContext(`
        (function() {
          var asset = new IndexFunds(0.05, 0);
          asset.buy(10000, 'EUR', 'ie');
          asset.addYear();
          return { capital: asset.capital(), principal: asset.getPortfolioStats().principal };
        })()
      `, ctx);
      if (!(result && result.capital > 10000)) {
        errors.push('Single-currency parity: capital did not grow as expected');
      }
      if (!(result && result.principal === 10000)) {
        errors.push('Single-currency parity: principal mismatch after growth');
      }
    } catch (err) {
      errors.push('Single-currency parity failed: ' + err.message);
    }

    // Test 2: Pension relocation currency stability
    try {
      const pensionResult = vm.runInContext(`
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
            c2: pension.portfolio[1].principal.currency
          };
        })()
      `, ctx);
      if (!pensionResult || pensionResult.count !== 2) {
        errors.push('Pension relocation: expected 2 holdings in portfolio');
      } else if (pensionResult.c1 !== 'EUR' || pensionResult.c2 !== 'EUR') {
        errors.push('Pension relocation: currency mismatch in portfolio holdings');
      }
    } catch (err) {
      errors.push('Pension relocation test failed: ' + err.message);
    }

    // Test 3: Multi-asset portfolio currency tracking
    try {
      const multiAssetResult = vm.runInContext(`
        (function() {
          var rs = new TaxRuleSet({
            version: 'money-integration',
            country: 'IE',
            locale: { currencyCode: 'EUR', numberFormat: { decimal: '.', thousand: ',' } },
            investmentTypes: [
              { key: 'eurAsset', label: 'EUR Asset', baseCurrency: 'EUR', assetCountry: 'ie', taxation: { capitalGains: { rate: 0.1 } } },
              { key: 'usdAsset', label: 'USD Asset', baseCurrency: 'USD', assetCountry: 'us', taxation: { capitalGains: { rate: 0.1 } } }
            ],
            incomeTax: { brackets: { '0': 0.2 } }
          });
          var assets = InvestmentTypeFactory.createAssets(rs, {}, {});
          for (var i = 0; i < assets.length; i++) {
            var entry = assets[i];
            entry.asset.buy(1000, entry.baseCurrency, entry.assetCountry);
          }
          return {
            eur: assets[0].asset.portfolio[0].principal.currency,
            usd: assets[1].asset.portfolio[0].principal.currency
          };
        })()
      `, ctx);
      if (!multiAssetResult || multiAssetResult.eur !== 'EUR' || multiAssetResult.usd !== 'USD') {
        errors.push('Multi-asset currency tracking failed: expected EUR/USD holdings');
      }
    } catch (err) {
      errors.push('Multi-asset currency tracking failed: ' + err.message);
    }

    // Test 4: Sell operations parity
    try {
      const sellResult = vm.runInContext(`
        (function() {
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          year = Config.getInstance().getSimulationStartYear();
          var asset = new Shares(0, 0);
          asset.buy(10000, 'EUR', 'ie');
          var sold = asset.sell(5000);
          var remaining = asset.capital();
          var holding = asset.portfolio[0];
          return {
            sold: sold,
            remaining: remaining,
            principal: holding.principal.amount,
            interest: holding.interest.amount
          };
        })()
      `, ctx);
      if (!sellResult || sellResult.sold !== 5000) {
        errors.push('Sell parity: expected sold amount 5000');
      }
      if (!sellResult || Math.abs(sellResult.remaining - 5000) > 0.01) {
        errors.push('Sell parity: expected remaining capital 5000');
      }
      if (!sellResult || Math.abs(sellResult.principal - 5000) > 0.01 || Math.abs(sellResult.interest) > 0.01) {
        errors.push('Sell parity: Money holdings not updated correctly');
      }
    } catch (err) {
      errors.push('Sell parity test failed: ' + err.message);
    }

    // Test 5: Verify .amount values match capital()
    try {
      const amountParity = vm.runInContext(`
        (function() {
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          var asset = new IndexFunds(0.05, 0);
          asset.buy(10000, 'EUR', 'ie');
          asset.addYear();
          
          var capital = asset.capital();
          var sumAmounts = 0;
          for (var i = 0; i < asset.portfolio.length; i++) {
            var holding = asset.portfolio[i];
            sumAmounts += holding.principal.amount + holding.interest.amount;
          }
          
          return { capital: capital, sumAmounts: sumAmounts, match: Math.abs(capital - sumAmounts) < 0.01 };
        })()
      `, ctx);
      if (!amountParity.match) {
        errors.push('Amount parity: capital() ' + amountParity.capital + ' != sum of .amount ' + amountParity.sumAmounts);
      }
    } catch (err) {
      errors.push('Amount parity test failed: ' + err.message);
    }
    
    // Test 6: Verify currency metadata persists through addYear()
    try {
      const currencyPersistence = vm.runInContext(`
        (function() {
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          var asset = new Shares(0, 0);
          asset.buy(5000, 'EUR', 'ie');
          asset.addYear();
          asset.addYear();
          
          var holding = asset.portfolio[0];
          return {
            currency: holding.principal.currency,
            country: holding.principal.country,
            interestCurrency: holding.interest.currency
          };
        })()
      `, ctx);
      if (currencyPersistence.currency !== 'EUR' || currencyPersistence.country !== 'ie') {
        errors.push('Currency metadata lost after addYear(): ' + JSON.stringify(currencyPersistence));
      }
    } catch (err) {
      errors.push('Currency persistence test failed: ' + err.message);
    }

    return { success: errors.length === 0, errors: errors };
  }
};
