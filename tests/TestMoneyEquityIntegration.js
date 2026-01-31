const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules } = require('./helpers/RelocationTestHelpers.js');
const vm = require('vm');

const AR_RULES = require('../src/core/config/tax-rules-ar.json');

module.exports = {
  name: 'MoneyEquityIntegration',
  description: 'Validates Money holdings for equity portfolios.',
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

    // Install AR rules for FX conversion tests
    installTestTaxRules(framework, { ar: AR_RULES });

    // Set up economicData global for FX conversions
    vm.runInContext(`
      config = Config.getInstance();
      economicData = config.getEconomicData();
    `, ctx);

    vm.runInContext(`
      revenue = {
        declareInvestmentIncome: function(money, desc, assetCountry) {},
        declareInvestmentGains: function(money, rate, desc, opts, assetCountry) {},
        declarePrivatePensionIncome: function() {},
        declarePrivatePensionLumpSum: function() {}
      };
    `, ctx);

    // Test 1: Single-currency parity (EUR)
    try {
      const result = vm.runInContext(`
        (function() {
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          var rs = new TaxRuleSet({
            version: 'test-1',
            country: 'IE',
            locale: { currencyCode: 'EUR', numberFormat: { decimal: '.', thousand: ',' } },
            investmentTypes: [{ key: 'indexFunds', label: 'Index Funds', baseCurrency: 'EUR', assetCountry: 'ie', taxation: { exitTax: { rate: 0.41 } } }],
            incomeTax: { brackets: { '0': 0.2 } }
          });
          var assets = InvestmentTypeFactory.createAssets(rs, { indexFunds: 0.05 }, { indexFunds: 0 });
          var asset = assets[0].asset;
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
          var rs = new TaxRuleSet({
            version: 'test-4',
            country: 'IE',
            locale: { currencyCode: 'EUR', numberFormat: { decimal: '.', thousand: ',' } },
            investmentTypes: [{ key: 'shares', label: 'Shares', baseCurrency: 'EUR', assetCountry: 'ie', taxation: { capitalGains: { rate: 0.33 } } }],
            incomeTax: { brackets: { '0': 0.2 } }
          });
          var assets = InvestmentTypeFactory.createAssets(rs, { shares: 0 }, { shares: 0 });
          var asset = assets[0].asset;
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
          var rs = new TaxRuleSet({
            version: 'test-5',
            country: 'IE',
            locale: { currencyCode: 'EUR', numberFormat: { decimal: '.', thousand: ',' } },
            investmentTypes: [{ key: 'indexFunds', label: 'Index Funds', baseCurrency: 'EUR', assetCountry: 'ie', taxation: { exitTax: { rate: 0.41 } } }],
            incomeTax: { brackets: { '0': 0.2 } }
          });
          var assets = InvestmentTypeFactory.createAssets(rs, { indexFunds: 0.05 }, { indexFunds: 0 });
          var asset = assets[0].asset;
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
          var rs = new TaxRuleSet({
            version: 'test-6',
            country: 'IE',
            locale: { currencyCode: 'EUR', numberFormat: { decimal: '.', thousand: ',' } },
            investmentTypes: [{ key: 'shares', label: 'Shares', baseCurrency: 'EUR', assetCountry: 'ie', taxation: { capitalGains: { rate: 0.33 } } }],
            incomeTax: { brackets: { '0': 0.2 } }
          });
          var assets = InvestmentTypeFactory.createAssets(rs, { shares: 0 }, { shares: 0 });
          var asset = assets[0].asset;
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

    // Test 7: Homogeneous portfolio conversion (relocation scenario)
    // Portfolio is all the same currency (EUR) but residence is different (ARS)
    try {
      const homogConvResult = vm.runInContext(`
        (function() {
          // Setup: Start in Ireland, buy EUR holdings
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          year = 2024;
          
          var rs = new TaxRuleSet({
            version: 'test-7',
            country: 'IE',
            locale: { currencyCode: 'EUR', numberFormat: { decimal: '.', thousand: ',' } },
            investmentTypes: [{ key: 'indexFunds', label: 'Index Funds', baseCurrency: 'EUR', assetCountry: 'ie', taxation: { exitTax: { rate: 0.41 } } }],
            incomeTax: { brackets: { '0': 0.2 } }
          });
          var assets = InvestmentTypeFactory.createAssets(rs, { indexFunds: 0.05 }, { indexFunds: 0 });
          var asset = assets[0].asset;
          asset.buy(10000, 'EUR', 'ie');
          asset.addYear(); // Grows to ~10500
          asset.buy(5000, 'EUR', 'ie');
          
          // Relocate to Argentina - portfolio stays EUR but residence is now ARS
          currentCountry = 'ar';
          residenceCurrency = 'ARS';
          
          // Get stats - should convert EUR holdings to ARS
          var stats = asset.getPortfolioStats();
          
          return {
            principal: stats.principal,
            totalGain: stats.totalGain,
            holdingCount: asset.portfolio.length
          };
        })()
      `, ctx);

      if (!homogConvResult || homogConvResult.holdingCount !== 2) {
        errors.push('Homogeneous conversion test: expected 2 holdings');
      }
      // Stats should be in ARS (converted), not raw EUR sum
      // EUR ~15000 * ARS/EUR rate (typically >900) = principal should be >100,000
      if (homogConvResult && homogConvResult.principal < 100000) {
        errors.push('Homogeneous conversion test: principal ' + homogConvResult.principal + ' appears to be in EUR, not converted to ARS');
      }
    } catch (err) {
      errors.push('Homogeneous conversion test failed: ' + err.message);
    }

    // Test 8: Homogeneous portfolio stats
    try {
      const homogeneousStatsResult = vm.runInContext(`
        (function() {
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          
          var rs = new TaxRuleSet({
            version: 'test-8',
            country: 'IE',
            locale: { currencyCode: 'EUR', numberFormat: { decimal: '.', thousand: ',' } },
            investmentTypes: [{ key: 'shares', label: 'Shares', baseCurrency: 'EUR', assetCountry: 'ie', taxation: { capitalGains: { rate: 0.33 } } }],
            incomeTax: { brackets: { '0': 0.2 } }
          });
          var assets = InvestmentTypeFactory.createAssets(rs, { shares: 0 }, { shares: 0 });
          var asset = assets[0].asset;
          asset.buy(10000, 'EUR', 'ie');
          asset.buy(5000, 'EUR', 'ie');
          
          var stats = asset.getPortfolioStats();
          
          return {
            principal: stats.principal,
            totalGain: stats.totalGain
          };
        })()
      `, ctx);

      if (!homogeneousStatsResult || homogeneousStatsResult.principal !== 15000) {
        errors.push('Homogeneous stats: expected principal 15000, got ' + homogeneousStatsResult.principal);
      }
      if (!homogeneousStatsResult || homogeneousStatsResult.totalGain !== 0) {
        errors.push('Homogeneous stats: expected totalGain 0, got ' + homogeneousStatsResult.totalGain);
      }
    } catch (err) {
      errors.push('Homogeneous portfolio stats test failed: ' + err.message);
    }

    // Test 9: Mixed-currency portfolio stats (true mixed portfolio)
    // Portfolio has holdings in different currencies; per-holding conversion handles this correctly
    try {
      const mixedStatsResult = vm.runInContext(`
        (function() {
          // Setup: Start in Ireland with EUR residence
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          year = 2024;
          
          var rs = new TaxRuleSet({
            version: 'test-9',
            country: 'IE',
            locale: { currencyCode: 'EUR', numberFormat: { decimal: '.', thousand: ',' } },
            investmentTypes: [{ key: 'indexFunds', label: 'Index Funds', baseCurrency: 'EUR', assetCountry: 'ie', taxation: { exitTax: { rate: 0.41 } } }],
            incomeTax: { brackets: { '0': 0.2 } }
          });
          var assets = InvestmentTypeFactory.createAssets(rs, { indexFunds: 0.05 }, { indexFunds: 0 });
          var asset = assets[0].asset;
          asset.buy(10000, 'EUR', 'ie');  // EUR holding
          asset.addYear(); // Grows to ~10500 (with ~500 gain)
          
          // Relocate to Argentina
          currentCountry = 'ar';
          residenceCurrency = 'ARS';
          
          // Buy more in ARS (different currency creates mixed portfolio)
          asset.buy(50000, 'ARS', 'ar');
          
          // Get stats - should convert both EUR and ARS holdings to ARS residence currency
          var stats = asset.getPortfolioStats();
          
          // Get FX rate to calculate expected values
          var eurToArs = convertCurrencyAmount(1, 'EUR', 'ie', 'ARS', 'ar', year, true);
          var expectedEurPrincipalInArs = 10000 * eurToArs;
          var expectedEurGainInArs = (asset.portfolio[0].interest.amount) * eurToArs;
          var expectedArsPrincipal = 50000; // Already in ARS
          var expectedTotalPrincipal = expectedEurPrincipalInArs + expectedArsPrincipal;
          var expectedTotalGain = expectedEurGainInArs; // ARS holding has no gain yet
          
          return {
            principal: stats.principal,
            totalGain: stats.totalGain,
            expectedPrincipal: expectedTotalPrincipal,
            expectedGain: expectedTotalGain,
            holdingCount: asset.portfolio.length,
            eurToArs: eurToArs
          };
        })()
      `, ctx);

      if (!mixedStatsResult || mixedStatsResult.holdingCount !== 2) {
        errors.push('Mixed-currency stats: expected 2 holdings, got ' + (mixedStatsResult ? mixedStatsResult.holdingCount : 'null'));
      }
      // Verify principal is in ARS (should be much larger than raw sum of 10000+50000)
      if (mixedStatsResult && mixedStatsResult.principal < 1000000) {
        errors.push('Mixed-currency stats: principal ' + mixedStatsResult.principal + ' appears not to be fully converted to ARS');
      }
      // Verify principal matches expected (within tolerance for FX rounding)
      if (mixedStatsResult && Math.abs(mixedStatsResult.principal - mixedStatsResult.expectedPrincipal) > 1) {
        errors.push('Mixed-currency stats: principal mismatch, got=' + mixedStatsResult.principal + ' expected=' + mixedStatsResult.expectedPrincipal);
      }
      // Verify totalGain matches expected (within tolerance for FX rounding)
      if (mixedStatsResult && Math.abs(mixedStatsResult.totalGain - mixedStatsResult.expectedGain) > 1) {
        errors.push('Mixed-currency stats: totalGain mismatch, got=' + mixedStatsResult.totalGain + ' expected=' + mixedStatsResult.expectedGain);
      }
    } catch (err) {
      errors.push('Mixed-currency portfolio stats test failed: ' + err.message);
    }

    return { success: errors.length === 0, errors: errors };
  }
};
