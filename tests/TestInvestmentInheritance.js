module.exports = {
  name: 'InvestmentInheritance',
  description: 'Validates baseRef inheritance with shallow merge',
  isCustomTest: true,
  runCustomTest: async function() {
    const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
    
    const testResults = { success: true, errors: [] };
    const originalConfig = global.Config;
    
    try {
      // Create a global Config shim with getInvestmentBaseTypeByKey
      global.Config = (function() {
        function C() {
          this._baseTypes = {
            'testBase': {
              baseKey: 'testBase',
              label: 'Base Label',
              baseCurrency: 'USD',
              assetCountry: 'us',
              residenceScope: 'global'
            }
          };
        }
        C.prototype.getInvestmentBaseTypeByKey = function(key) {
          return this._baseTypes[key] || null;
        };
        var inst = new C();
        return { getInstance: function(){ return inst; } };
      })();
      
      // Create ruleset with baseRef type
      const raw = {
        investmentTypes: [
          {
            key: 'testType',
            baseRef: 'testBase',
            label: 'Override Label',
            taxation: { exitTax: { rate: 0.4 } }
          }
        ]
      };
      
      const ruleset = new TaxRuleSet(raw);
      const resolved = ruleset.getResolvedInvestmentTypes();
      
      // Verify inheritance
      if (resolved.length !== 1) {
        testResults.success = false;
        testResults.errors.push('Expected 1 resolved type, got ' + resolved.length);
      }
      
      const type = resolved[0];
      if (type.baseCurrency !== 'USD') {
        testResults.success = false;
        testResults.errors.push('baseCurrency not inherited: ' + type.baseCurrency);
      }
      if (type.assetCountry !== 'us') {
        testResults.success = false;
        testResults.errors.push('assetCountry not inherited: ' + type.assetCountry);
      }
      if (type.label !== 'Override Label') {
        testResults.success = false;
        testResults.errors.push('label not overridden: ' + type.label);
      }
      if (!type.taxation || !type.taxation.exitTax || type.taxation.exitTax.rate !== 0.4) {
        testResults.success = false;
        testResults.errors.push('taxation not preserved');
      }
      
      // Test unknown baseRef error
      const badRaw = {
        investmentTypes: [
          { key: 'bad', baseRef: 'unknown' }
        ]
      };
      const badRuleset = new TaxRuleSet(badRaw);
      try {
        badRuleset.getResolvedInvestmentTypes();
        testResults.success = false;
        testResults.errors.push('Should throw for unknown baseRef');
      } catch (e) {
        if (e.message.indexOf('Unknown baseRef') === -1) {
          testResults.success = false;
          testResults.errors.push('Wrong error message: ' + e.message);
        }
      }
      
      // Restore
      global.Config = originalConfig;
      
      return testResults;
    } catch (e) {
      global.Config = originalConfig;
      return { success: false, errors: [e.message] };
    }
  }
};
