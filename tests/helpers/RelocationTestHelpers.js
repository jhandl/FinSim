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
          if (!this._taxRuleSets[code] && map[code]) {
            this._taxRuleSets[code] = new TaxRuleSet(map[code]);
            if (this._economicData && typeof this._economicData.refreshFromConfig === 'function') {
              this._economicData.refreshFromConfig(this);
            }
            return this._taxRuleSets[code];
          }
          try {
            var loaded = await originalGetTaxRuleSet.call(this, countryCode);
            if (loaded) return loaded;
          } catch (err) {
            if (map[code]) {
              this._taxRuleSets[code] = new TaxRuleSet(map[code]);
              if (this._economicData && typeof this._economicData.refreshFromConfig === 'function') {
                this._economicData.refreshFromConfig(this);
              }
              return this._taxRuleSets[code];
            }
            throw err;
          }
          if (map[code] && !this._taxRuleSets[code]) {
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
      }

      (function hydrateInitialCache() {
        var map = (typeof __testTaxRules !== 'undefined' && __testTaxRules) ? __testTaxRules : {};
        if (!map || !Config_instance) return;
        if (!Config_instance._taxRuleSets) Config_instance._taxRuleSets = {};
        for (var key in map) {
          if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
          Config_instance._taxRuleSets[key] = new TaxRuleSet(map[key]);
        }
        if (Config_instance._economicData && typeof Config_instance._economicData.refreshFromConfig === 'function') {
          Config_instance._economicData.refreshFromConfig(Config_instance);
        }
      })();
    })();
  `, framework.simulationContext);
}

module.exports = {
  installTestTaxRules,
  deepClone
};
