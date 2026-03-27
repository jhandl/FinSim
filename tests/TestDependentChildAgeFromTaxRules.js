const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'DependentChildAgeFromTaxRules',
  description: 'Verifies Taxman reads the dependent-child cutoff age from the active tax ruleset',
  isCustomTest: true,
  runCustomTest: async function() {
    const originalGlobals = {
      Config: global.Config,
      Money: global.Money,
      params: global.params,
      isBetween: global.isBetween,
      residenceCurrency: global.residenceCurrency
    };

    const restore = (key, value) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    };

    try {
      const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
      const { Taxman } = require('../src/core/Taxman.js');
      const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'config', 'tax-rules-ie.json'), 'utf8'));
      raw.incomeTax.dependentChildMaxAge = 16;

      const ruleset = new TaxRuleSet(raw);
      global.Config = {
        getInstance: function() {
          return {
            getDefaultCountry: function() { return 'ie'; },
            getCachedTaxRuleSet: function() { return ruleset; }
          };
        }
      };
      global.Money = {
        zero: function(currency, country) {
          return { amount: 0, currency: currency || 'EUR', country: country || 'ie' };
        }
      };
      global.isBetween = function(num, min, max) {
        return num >= min && num <= max;
      };
      global.params = {
        marriageYear: null,
        oldestChildBorn: 2024,
        youngestChildBorn: 2026
      };
      global.residenceCurrency = 'EUR';

      const taxman = new Taxman();
      taxman.reset(null, null, { record: function() {} }, 'ie', 2042);
      if (taxman.dependentChildren !== true) {
        return { success: false, errors: ['Dependent children should remain active through the configured cutoff year'] };
      }

      taxman.reset(null, null, { record: function() {} }, 'ie', 2043);
      if (taxman.dependentChildren !== false) {
        return { success: false, errors: ['Dependent children should stop after the configured cutoff age from tax rules'] };
      }

      return { success: true, errors: [] };
    } catch (error) {
      return { success: false, errors: [error.message] };
    } finally {
      restore('Config', originalGlobals.Config);
      restore('Money', originalGlobals.Money);
      restore('params', originalGlobals.params);
      restore('isBetween', originalGlobals.isBetween);
      restore('residenceCurrency', originalGlobals.residenceCurrency);
    }
  }
};
