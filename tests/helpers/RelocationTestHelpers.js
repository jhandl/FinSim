const vm = require('vm');

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function installTestTaxRules(framework, rulesByCode) {
  if (!framework || !framework.simulationContext) {
    throw new Error('TestFramework simulation context not initialized');
  }
  const mapClone = deepClone(rulesByCode || {});
  framework.simulationContext.__testTaxRules = mapClone;

  vm.runInContext(`
    (function() {
      var proto = Config.prototype;
      if (!proto.__testTaxRulePatch) {
        proto.__testTaxRulePatch = true;
        
        var originalGetTaxRuleSet = proto.getTaxRuleSet;
        proto.getTaxRuleSet = async function(countryCode) {
          var map = (typeof __testTaxRules !== 'undefined' && __testTaxRules) ? __testTaxRules : {};
          var code = (countryCode || this.getDefaultCountry()).toLowerCase();
          if (!this._taxRuleSets) this._taxRuleSets = {};
          if (map[code]) {
            this._taxRuleSets[code] = new TaxRuleSet(map[code]);
            if (this._economicData && typeof this._economicData.refreshFromConfig === 'function') {
              this._economicData.refreshFromConfig(this);
            }
            return this._taxRuleSets[code];
          }
          return await originalGetTaxRuleSet.call(this, countryCode);
        };

        var originalGetCachedTaxRuleSet = proto.getCachedTaxRuleSet;
        proto.getCachedTaxRuleSet = function(countryCode) {
          var map = (typeof __testTaxRules !== 'undefined' && __testTaxRules) ? __testTaxRules : {};
          var code = (countryCode || this.getDefaultCountry()).toLowerCase();
          if (!this._taxRuleSets) this._taxRuleSets = {};
          if (map[code]) {
            this._taxRuleSets[code] = new TaxRuleSet(map[code]);
            if (this._economicData && typeof this._economicData.refreshFromConfig === 'function') {
              this._economicData.refreshFromConfig(this);
            }
          }
          return this._taxRuleSets[code] || null;
        };

        var originalGetCountryMap = proto.getCountryMap;
        proto.getCountryMap = function() {
          var map = (typeof __testTaxRules !== 'undefined' && __testTaxRules) ? __testTaxRules : {};
          var result = originalGetCountryMap.call(this);
          for (var code in map) {
            if (!Object.prototype.hasOwnProperty.call(result, code)) {
              var raw = map[code] || {};
              var name = raw.countryName || code.toUpperCase();
              result[code] = name;
            }
          }
          return result;
        };

        proto.getAvailableCountries = function() {
          var map = (typeof __testTaxRules !== 'undefined' && __testTaxRules) ? __testTaxRules : {};
          var out = [];
          for (var code in map) {
            if (!Object.prototype.hasOwnProperty.call(map, code)) continue;
            var raw = map[code] || {};
            out.push({ code: String(code).toLowerCase(), name: raw.countryName || String(code).toUpperCase() });
          }
          return out;
        };

        proto.listCachedRuleSets = function() {
          var map = (typeof __testTaxRules !== 'undefined' && __testTaxRules) ? __testTaxRules : {};
          if (!this._taxRuleSets) this._taxRuleSets = {};
          for (var code in map) {
            var normalized = code.toLowerCase();
            this._taxRuleSets[normalized] = new TaxRuleSet(map[code]);
          }
          return this._taxRuleSets;
        };

        var originalSyncTaxRuleSetsWithEvents = proto.syncTaxRuleSetsWithEvents;
        proto.syncTaxRuleSetsWithEvents = async function(events, startCountry) {
          var map = (typeof __testTaxRules !== 'undefined' && __testTaxRules) ? __testTaxRules : {};
          if (!this._taxRuleSets) this._taxRuleSets = {};
          
          // Pre-load anything in our map
          for (var code in map) {
            var normalized = code.toLowerCase();
            this._taxRuleSets[normalized] = new TaxRuleSet(map[code]);
          }

          // Delegate to real sync logic so dependent countries (e.g. assetCountry)
          // are loaded exactly as production does.
          var result = await originalSyncTaxRuleSetsWithEvents.call(this, events, startCountry);
          return result || { failed: [] };
        };
      }

      // Initial hydration if instance already exists
      if (typeof Config_instance !== 'undefined' && Config_instance) {
        Config_instance.listCachedRuleSets();
        if (Config_instance._economicData && typeof Config_instance._economicData.refreshFromConfig === 'function') {
          Config_instance._economicData.refreshFromConfig(Config_instance);
        }
      }
    })();
  `, framework.simulationContext);
}

module.exports = {
  installTestTaxRules,
  deepClone
};
