module.exports = {
  name: 'LocalVsNonLocalWrappers',
  description: 'Verifies parameter resolution for local vs non-local investment wrappers',
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
    // Money.js exports nicely but also sets global if we require it (it has an IIFE)
    require('../src/core/Money.js'); 
    
    // InvestmentAsset.js does NOT export, defines classes in scope. Must load into global.
    loadIntoGlobal('../src/core/InvestmentAsset.js');
    
    // InvestmentTypeFactory.js assigns to 'this'. By running in this context, it assigns to global (module's this? no, vm's global).
    // Actually vm.runInThisContext uses the current global object.
    loadIntoGlobal('../src/core/InvestmentTypeFactory.js');

    const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
    
    const testResults = { success: true, errors: [] };
    const originalConfig = global.Config;
    
    try {
      // Create a global Config shim with getInvestmentBaseTypeByKey
      global.Config = (function() {
        function C() {
          this._baseTypes = {
            'globalEquity': {
              baseKey: 'globalEquity',
              label: 'Global Equity',
              baseCurrency: 'USD',
              assetCountry: 'us',
              residenceScope: 'global'
            }
          };
        }
        C.prototype.getInvestmentBaseTypeByKey = function(key) {
          return this._baseTypes[key] || null;
        };
        C.prototype.getCountryCode = function() { return 'ie'; }; // shim for ruleset.getCountryCode check
        C.prototype.getCachedTaxRuleSet = function() { return null; };
        C.prototype.getDefaultCountry = function() { return 'ie'; };
        var inst = new C();
        return { getInstance: function(){ return inst; } };
      })();

      // Define ruleset with:
      // 1. wrapper_ie (inherits from globalEquity)
      // 2. localWrapper_ie (no baseRef)
      const raw = {
        country: 'IE',
        investmentTypes: [
          {
            key: 'wrapper_ie',
            baseRef: 'globalEquity',
            label: 'Wrapper (Non-Local)',
            taxation: { exitTax: { rate: 0.41 } }
          },
          {
            key: 'localWrapper_ie',
            label: 'Local Wrapper',
            baseCurrency: 'EUR',
            assetCountry: 'ie',
            residenceScope: 'local',
            taxation: { capitalGains: { rate: 0.33 } }
          }
        ]
      };
      
      const ruleset = new TaxRuleSet(raw);
      
      // Setup params
      const growthRatesByKey = {
        'wrapper_ie': 0.05,        // Should be ignored
        'localWrapper_ie': 0.06    // Should be used
      };
      
      const stdDevsByKey = {
        'wrapper_ie': 0.01,
        'localWrapper_ie': 0.02
      };
      
      const params = {
        'GlobalAssetGrowth_globalEquity': 8,      // Should be used for wrapper_ie
        'GlobalAssetVolatility_globalEquity': 15,  // Should be used for wrapper_ie
        // Some random other param
        'OtherParam': 123
      };
      
      // Call factory
      const assets = InvestmentTypeFactory.createAssets(ruleset, growthRatesByKey, stdDevsByKey, params);
      
      // Verify wrapper_ie (Non-local)
      const wrapperAsset = assets.find(a => a.key === 'wrapper_ie');
      if (!wrapperAsset) {
        testResults.success = false;
        testResults.errors.push('wrapper_ie not created');
      } else {
        if (Math.abs(wrapperAsset.asset.growth - 0.08) > 0.0001) {
           testResults.success = false;
           testResults.errors.push(`wrapper_ie growth mismatch: expected 0.08 (Global), got ${wrapperAsset.asset.growth}`);
        }
        if (Math.abs(wrapperAsset.asset.stdev - 0.15) > 0.0001) {
           testResults.success = false;
           testResults.errors.push(`wrapper_ie vol mismatch: expected 0.15 (Global), got ${wrapperAsset.asset.stdev}`);
        }
      }
      
      // Verify localWrapper_ie (Local)
      const localAsset = assets.find(a => a.key === 'localWrapper_ie');
      if (!localAsset) {
        testResults.success = false;
        testResults.errors.push('localWrapper_ie not created');
      } else {
        if (Math.abs(localAsset.asset.growth - 0.06) > 0.0001) {
           testResults.success = false;
           testResults.errors.push(`localWrapper_ie growth mismatch: expected 0.06 (Wrapper), got ${localAsset.asset.growth}`);
        }
        if (Math.abs(localAsset.asset.stdev - 0.02) > 0.0001) {
           testResults.success = false;
           testResults.errors.push(`localWrapper_ie vol mismatch: expected 0.02 (Wrapper), got ${localAsset.asset.stdev}`);
        }
      }
      
      // Verify Backward Compatibility (Local)
      // Create another ruleset/call for compat check
      const rawCompat = {
        country: 'IE',
        investmentTypes: [
          {
             key: 'localOld_ie',
             label: 'Old Local',
             baseCurrency: 'EUR'
          }
        ]
      };
      const rulesetCompat = new TaxRuleSet(rawCompat);
      const growthCompat = { 'localOld': 0.07 }; // legacy key
      const assetsCompat = InvestmentTypeFactory.createAssets(rulesetCompat, growthCompat, {}, {});
      
      const oldAsset = assetsCompat.find(a => a.key === 'localOld_ie');
      if (!oldAsset || Math.abs(oldAsset.asset.growth - 0.07) > 0.0001) {
        testResults.success = false;
        testResults.errors.push(`Compat mismatch: expected 0.07, got ${oldAsset ? oldAsset.asset.growth : 'missing'}`);
      }

      global.Config = originalConfig;
      return testResults;

    } catch (e) {
      global.Config = originalConfig;
      return { success: false, errors: [e.message + '\n' + e.stack] };
    }
  }
};