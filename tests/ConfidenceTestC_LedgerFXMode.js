const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
const { TOY_AA, TOY_BB, deepClone } = require('./helpers/CoreConfidenceFixtures.js');

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
  name: 'C_LedgerFXMode',
  description: 'Verifies FX mode enforcement and default behavior in EconomicData.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];
    const BASE_YEAR = 2025;
    const originalConfig = global.Config;

    try {
      const TOY_BB_PPP = deepClone(TOY_BB);
      TOY_BB_PPP.economicData.purchasingPowerParity.value = 0.5;

      const cfg = createConfigShim();
      global.Config = { getInstance: () => cfg };
      cfg.registerRule('aa', new TaxRuleSet(TOY_AA));
      cfg.registerRule('bb', new TaxRuleSet(TOY_BB_PPP));

      const econ = new EconomicData();
      econ.refreshFromConfig(cfg);

      if (!econ.ready) {
        return { success: false, errors: ['EconomicData failed to initialize'] };
      }

      // Default fxMode is 'evolution'
      const def = econ.convert(1000, 'aa', 'bb', BASE_YEAR, {});
      const evo = econ.convert(1000, 'aa', 'bb', BASE_YEAR, { fxMode: 'evolution' });
      if (def !== evo) errors.push('Default fxMode should be "evolution"');

      // Explicit 'constant'
      // 10000 BBB -> 5000 AAA (1 BBB = 0.5 AAA)
      const constant = econ.convert(10000, 'bb', 'aa', BASE_YEAR, { fxMode: 'constant' });
      if (Math.abs(constant - 5000) > 0.01) errors.push(`Explicit constant mode failed: expected 5000, got ${constant}`);

      // Explicit 'ppp'
      // getPPP('aa', 'bb') = ppp_bb / ppp_aa = 0.5 / 1.0 = 0.5
      // 10000 AAA -> 5000 BBB
      const ppp = econ.convert(10000, 'aa', 'bb', BASE_YEAR, { fxMode: 'ppp' });
      if (Math.abs(ppp - 5000) > 0.01) errors.push(`Explicit PPP mode failed: expected 5000, got ${ppp}`);

      // Unknown mode returns null (per EconomicData implementation)
      const unknown = econ.convert(1000, 'aa', 'bb', BASE_YEAR, { fxMode: 'magic' });
      if (unknown !== null) errors.push(`Unknown fxMode should return null, got ${unknown}`);

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
