const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
const { TOY_AA, TOY_BB } = require('./helpers/CoreConfidenceFixtures.js');

function createConfigShim() {
  function ConfigShim() {
    this._taxRuleSets = {};
    this._defaultCountry = 'aa';
  }
  ConfigShim.prototype.getCachedTaxRuleSet = function(country) {
    const code = (country || '').toString().toLowerCase();
    return this._taxRuleSets[code] || null;
  };
  ConfigShim.prototype.getDefaultCountry = function() {
    return this._defaultCountry;
  };
  ConfigShim.prototype.getSimulationStartYear = function() {
    return 2025;
  };
  ConfigShim.prototype.registerRule = function(code, rule) {
    const normalized = (code || '').toString().toLowerCase();
    this._taxRuleSets[normalized] = rule;
  };
  return new ConfigShim();
}

module.exports = {
  name: 'C_FXUtilities',
  description: 'Verifies EconomicData FX utility methods in Layer A (direct Node.js).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];
    const BASE_YEAR = 2025;
    const originalConfig = global.Config;

    try {
      const cfg = createConfigShim();
      global.Config = { getInstance: () => cfg };
      cfg.registerRule('aa', new TaxRuleSet(TOY_AA));
      cfg.registerRule('bb', new TaxRuleSet(TOY_BB));

      const econ = new EconomicData();
      econ.refreshFromConfig(cfg);

      if (!econ.ready) {
        return { success: false, errors: ['EconomicData failed to initialize'] };
      }

      const options = { fxMode: 'constant', baseYear: BASE_YEAR };

      // 10000 BBB -> AAA (1 BBB = 0.5 AAA)
      const toAA = econ.convert(10000, 'bb', 'aa', BASE_YEAR, options);
      if (Math.abs(toAA - 5000) > 0.01) errors.push(`10000 BBB -> AA: Expected 5000, got ${toAA}`);

      // 5000 AAA -> BBB (1 AAA = 2.0 BBB)
      const toBB = econ.convert(5000, 'aa', 'bb', BASE_YEAR, options);
      if (Math.abs(toBB - 10000) > 0.01) errors.push(`5000 AAA -> BB: Expected 10000, got ${toBB}`);

      // Zero preservation
      const zero = econ.convert(0, 'aa', 'bb', BASE_YEAR, options);
      if (zero !== 0) errors.push(`Zero conversion failed: got ${zero}`);

      // Identity
      const identity = econ.convert(12345, 'aa', 'aa', BASE_YEAR, options);
      if (identity !== 12345) errors.push(`Identity conversion failed: got ${identity}`);

      // getFX returns 1 AAA = X units of dest
      // getFX('aa', 'bb') -> 2.0
      const fxAtoB = econ.getFX('aa', 'bb', BASE_YEAR, 'constant');
      if (Math.abs(fxAtoB - 2.0) > 0.001) errors.push(`getFX('aa', 'bb'): Expected 2.0, got ${fxAtoB}`);

      // getFX('bb', 'aa') -> 0.5
      const fxBtoA = econ.getFX('bb', 'aa', BASE_YEAR, 'constant');
      if (Math.abs(fxBtoA - 0.5) > 0.001) errors.push(`getFX('bb', 'aa'): Expected 0.5, got ${fxBtoA}`);

    } catch (err) {
      errors.push(err.message);
    } finally {
      global.Config = originalConfig;
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
