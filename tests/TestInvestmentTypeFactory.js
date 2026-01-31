module.exports = {
  name: 'InvestmentTypeFactory',
  description: 'Verifies investment type parameter resolution and mix config behavior',
  isCustomTest: true,
  runCustomTest: async function() {
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');

    // Helper to load GAS-style files into global scope
    function loadIntoGlobal(filePath) {
      const content = fs.readFileSync(path.resolve(__dirname, filePath), 'utf8');
      vm.runInThisContext(content, filePath);
    }

    // Load dependencies
    require('../src/core/Money.js');
    loadIntoGlobal('../src/core/Equities.js');
    loadIntoGlobal('../src/core/InvestmentTypeFactory.js');
    const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');

    const testResults = { success: true, errors: [] };
    const originalConfig = global.Config;

    function fail(message) {
      testResults.success = false;
      testResults.errors.push(message);
    }

    function assertApprox(actual, expected, label) {
      if (Math.abs(actual - expected) > 0.0001) {
        fail(label + ': expected ' + expected + ', got ' + actual);
      }
    }

    function findAsset(assets, key, label) {
      const asset = assets.find(a => a.key === key);
      if (!asset) {
        fail(label + ' missing: ' + key);
        return null;
      }
      return asset;
    }

    function readRules(file) {
      const content = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
      return JSON.parse(content);
    }

    try {
      // Config shim with base type definitions
      global.Config = (function() {
        function C() {
          this._baseTypes = {
            globalEquity: {
              baseKey: 'globalEquity',
              label: 'Global Equity',
              baseCurrency: 'USD',
              assetCountry: 'us',
              residenceScope: 'global'
            },
            globalBonds: {
              baseKey: 'globalBonds',
              label: 'Global Bonds',
              baseCurrency: 'USD',
              assetCountry: 'us',
              residenceScope: 'global'
            }
          };
        }
        C.prototype.getInvestmentBaseTypeByKey = function(key) {
          return this._baseTypes[key] || null;
        };
        C.prototype.getCountryCode = function() { return 'ie'; };
        C.prototype.getCachedTaxRuleSet = function() { return null; };
        C.prototype.getDefaultCountry = function() { return 'ie'; };
        const inst = new C();
        return { getInstance: function() { return inst; } };
      })();

      // IE ruleset (baseRef wrapper)
      const ieRuleset = new TaxRuleSet(readRules('../src/core/config/tax-rules-ie.json'));
      const ieGrowth = {
        indexFunds_ie: 0.05,
        shares_ie: 0.06
      };
      const ieStdev = {
        indexFunds_ie: 0.2,
        shares_ie: 0.11
      };
      const ieParams = {
        GlobalAssetGrowth_globalEquity: 8,
        GlobalAssetVolatility_globalEquity: 15
      };
      const ieAssets = InvestmentTypeFactory.createAssets(ieRuleset, ieGrowth, ieStdev, ieParams);

      const ieIndexFunds = findAsset(ieAssets, 'indexFunds_ie', 'IE assets');
      if (ieIndexFunds) {
        assertApprox(ieIndexFunds.asset.growth, 0.08, 'indexFunds_ie growth');
        assertApprox(ieIndexFunds.asset.stdev, 0.15, 'indexFunds_ie vol');
        if (ieIndexFunds.key !== 'indexFunds_ie') fail('indexFunds_ie key mismatch');
        if (ieIndexFunds.label !== 'Index Funds') fail('indexFunds_ie label mismatch: ' + ieIndexFunds.label);
        if (ieIndexFunds.baseCurrency !== 'EUR') fail('indexFunds_ie baseCurrency mismatch: ' + ieIndexFunds.baseCurrency);
        if (ieIndexFunds.assetCountry !== 'ie') fail('indexFunds_ie assetCountry mismatch: ' + ieIndexFunds.assetCountry);
        if (ieIndexFunds.residenceScope !== 'local') fail('indexFunds_ie residenceScope mismatch: ' + ieIndexFunds.residenceScope);
        if (ieIndexFunds.asset.baseCurrency !== 'EUR') fail('indexFunds_ie asset baseCurrency mismatch: ' + ieIndexFunds.asset.baseCurrency);
        if (ieIndexFunds.asset.assetCountry !== 'ie') fail('indexFunds_ie assetCountry override lost: ' + ieIndexFunds.asset.assetCountry);
      }

      const ieShares = findAsset(ieAssets, 'shares_ie', 'IE assets');
      if (ieShares) {
        assertApprox(ieShares.asset.growth, 0.06, 'shares_ie growth');
        assertApprox(ieShares.asset.stdev, 0.11, 'shares_ie vol');
      }

      // US ruleset (local wrappers)
      const usRuleset = new TaxRuleSet(readRules('../src/core/config/tax-rules-us.json'));
      const usGrowth = { usIndexFunds: 0.07, usShares: 0.06 };
      const usStdev = { usIndexFunds: 0.12, usShares: 0.10 };
      const usAssets = InvestmentTypeFactory.createAssets(usRuleset, usGrowth, usStdev, {});

      const usIndexFunds = findAsset(usAssets, 'usIndexFunds', 'US assets');
      if (usIndexFunds) {
        assertApprox(usIndexFunds.asset.growth, 0.07, 'usIndexFunds growth');
        assertApprox(usIndexFunds.asset.stdev, 0.12, 'usIndexFunds vol');
        if (usIndexFunds.baseCurrency !== 'USD') fail('usIndexFunds baseCurrency mismatch: ' + usIndexFunds.baseCurrency);
        if (usIndexFunds.assetCountry !== 'us') fail('usIndexFunds assetCountry mismatch: ' + usIndexFunds.assetCountry);
      }

      const usShares = findAsset(usAssets, 'usShares', 'US assets');
      if (usShares) {
        assertApprox(usShares.asset.growth, 0.06, 'usShares growth');
        assertApprox(usShares.asset.stdev, 0.10, 'usShares vol');
      }

      // BaseRef parameter resolution priority (asset-level wins)
      const ieFallbackAssets = InvestmentTypeFactory.createAssets(
        ieRuleset,
        { indexFunds_ie: 0.05 },
        { indexFunds_ie: 0.03 },
        { GlobalAssetGrowth_globalEquity: 10 }
      );
      const ieFallbackIndex = findAsset(ieFallbackAssets, 'indexFunds_ie', 'IE fallback');
      if (ieFallbackIndex) {
        assertApprox(ieFallbackIndex.asset.growth, 0.10, 'indexFunds_ie asset-level priority');
        assertApprox(ieFallbackIndex.asset.stdev, 0.03, 'indexFunds_ie wrapper-level fallback vol');
      }

      // BaseRef fallback when asset-level missing
      const ieWrapperOnly = InvestmentTypeFactory.createAssets(
        ieRuleset,
        { indexFunds_ie: 0.04 },
        { indexFunds_ie: 0.02 },
        {}
      );
      const ieWrapperIndex = findAsset(ieWrapperOnly, 'indexFunds_ie', 'IE wrapper-only');
      if (ieWrapperIndex) {
        assertApprox(ieWrapperIndex.asset.growth, 0.04, 'indexFunds_ie wrapper fallback growth');
        assertApprox(ieWrapperIndex.asset.stdev, 0.02, 'indexFunds_ie wrapper fallback vol');
      }

      // Normalization edge cases for asset-level params (percentages)
      const normalizeCases = [
        { value: 0, expected: 0 },
        { value: 1.0, expected: 1.0 },
        { value: 100, expected: 1.0 },
        { value: -5, expected: -0.05 }
      ];
      for (let i = 0; i < normalizeCases.length; i++) {
        const c = normalizeCases[i];
        const assets = InvestmentTypeFactory.createAssets(ieRuleset, {}, {}, {
          GlobalAssetGrowth_globalEquity: c.value,
          GlobalAssetVolatility_globalEquity: c.value
        });
        const asset = findAsset(assets, 'indexFunds_ie', 'Normalization');
        if (asset) {
          assertApprox(asset.asset.growth, c.expected, 'normalize growth ' + c.value);
          assertApprox(asset.asset.stdev, c.expected, 'normalize vol ' + c.value);
        }
      }

      // Mix config resolution
      const mixParams = {
        MixConfig_ie_indexFunds_type: 'fixed',
        MixConfig_ie_indexFunds_asset1: 'globalEquity',
        MixConfig_ie_indexFunds_asset2: 'globalBonds',
        MixConfig_ie_indexFunds_startAsset1Pct: 60,
        MixConfig_ie_indexFunds_startAsset2Pct: 40,
        GlobalAssetGrowth_globalEquity: 8,
        GlobalAssetGrowth_globalBonds: 4,
        GlobalAssetVolatility_globalEquity: 12,
        GlobalAssetVolatility_globalBonds: 6
      };
      const mix = InvestmentTypeFactory.resolveMixConfig(mixParams, 'ie', 'indexFunds');
      if (!mix) {
        fail('mix config not resolved');
      } else {
        if (mix.type !== 'fixed') fail('mix type mismatch: ' + mix.type);
        if (mix.asset1 !== 'globalEquity') fail('mix asset1 mismatch: ' + mix.asset1);
        if (mix.asset2 !== 'globalBonds') fail('mix asset2 mismatch: ' + mix.asset2);
        assertApprox(mix.startAsset1Pct, 60, 'mix startAsset1Pct');
        assertApprox(mix.startAsset2Pct, 40, 'mix startAsset2Pct');
        assertApprox(mix.asset1Growth, 0.08, 'mix asset1Growth');
        assertApprox(mix.asset2Growth, 0.04, 'mix asset2Growth');
        assertApprox(mix.asset1Vol, 0.12, 'mix asset1Vol');
        assertApprox(mix.asset2Vol, 0.06, 'mix asset2Vol');
      }

      const globalMixParams = {
        GlobalMixConfig_indexFunds_type: 'glide',
        GlobalMixConfig_indexFunds_asset1: 'globalEquity',
        GlobalMixConfig_indexFunds_asset2: 'globalBonds'
      };
      const mixGlobal = InvestmentTypeFactory.resolveMixConfig(globalMixParams, 'ie', 'indexFunds');
      if (!mixGlobal || mixGlobal.type !== 'glidePath') {
        fail('global mix glide normalization failed');
      }

      const mixInvalid = InvestmentTypeFactory.resolveMixConfig({ MixConfig_ie_indexFunds_type: 'bad' }, 'ie', 'indexFunds');
      if (mixInvalid !== null) fail('invalid mix type should return null');

      const mixMissingType = InvestmentTypeFactory.resolveMixConfig({ MixConfig_ie_indexFunds_asset1: 'globalEquity' }, 'ie', 'indexFunds');
      if (mixMissingType !== null) fail('missing mix type should return null');

      // Currency/country defaults from ruleset
      const defaultRuleset = new TaxRuleSet({
        country: 'IE',
        investmentTypes: [{ key: 'defaultLocal_ie', label: 'Default Local' }]
      });
      const defaultAssets = InvestmentTypeFactory.createAssets(defaultRuleset, {}, {}, {});
      const defaultAsset = findAsset(defaultAssets, 'defaultLocal_ie', 'Default ruleset');
      if (defaultAsset) {
        if (defaultAsset.asset.baseCurrency !== 'EUR') fail('default baseCurrency mismatch: ' + defaultAsset.asset.baseCurrency);
        if (defaultAsset.asset.assetCountry !== 'ie') fail('default assetCountry mismatch: ' + defaultAsset.asset.assetCountry);
      }

      // Backward compatibility: base key fallback
      const compatRuleset = new TaxRuleSet({
        country: 'IE',
        investmentTypes: [{ key: 'localWrapper_ie', label: 'Local Wrapper' }]
      });
      const compatAssets = InvestmentTypeFactory.createAssets(
        compatRuleset,
        { localWrapper: 0.07 },
        { localWrapper: 0.02 },
        {}
      );
      const compatAsset = findAsset(compatAssets, 'localWrapper_ie', 'Compat');
      if (compatAsset) {
        assertApprox(compatAsset.asset.growth, 0.07, 'compat growth fallback');
        assertApprox(compatAsset.asset.stdev, 0.02, 'compat vol fallback');
      }

      // Error handling / defaults
      const nullAssets = InvestmentTypeFactory.createAssets(null, {}, {}, {});
      if (!Array.isArray(nullAssets) || nullAssets.length !== 0) {
        fail('null ruleset should return empty array');
      }
      const missingMethodAssets = InvestmentTypeFactory.createAssets({}, {}, {}, {});
      if (!Array.isArray(missingMethodAssets) || missingMethodAssets.length !== 0) {
        fail('ruleset without getInvestmentTypes should return empty array');
      }

      const zeroDefaultsRuleset = new TaxRuleSet({
        country: 'IE',
        investmentTypes: [{ key: 'zeroLocal_ie', label: 'Zero Local' }]
      });
      const zeroAssets = InvestmentTypeFactory.createAssets(zeroDefaultsRuleset, null, null, {});
      const zeroAsset = findAsset(zeroAssets, 'zeroLocal_ie', 'Zero defaults');
      if (zeroAsset) {
        assertApprox(zeroAsset.asset.growth, 0, 'default growth');
        assertApprox(zeroAsset.asset.stdev, 0, 'default stdev');
      }

      return testResults;
    } catch (e) {
      return { success: false, errors: [e.message + '\n' + e.stack] };
    } finally {
      global.Config = originalConfig;
    }
  }
};
