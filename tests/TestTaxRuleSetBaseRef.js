const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');

const GLOBAL_RULES = require('../src/core/config/tax-rules-global.json');
const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

module.exports = {
  name: 'TaxRuleSetBaseRef',
  description: 'Validates baseRef inheritance for investment types.',
  isCustomTest: true,
  runCustomTest: async function() {
    const errors = [];
    const originalConfig = global.Config;

    try {
      const baseByKey = {};
      const baseTypes = Array.isArray(GLOBAL_RULES.investmentBaseTypes) ? GLOBAL_RULES.investmentBaseTypes : [];
      for (let i = 0; i < baseTypes.length; i++) {
        const t = baseTypes[i];
        if (t && t.baseKey) baseByKey[t.baseKey] = t;
      }

      global.Config = {
        getInstance: () => ({
          getInvestmentBaseTypeByKey: (key) => baseByKey[key] || null
        })
      };

      const ieRules = new TaxRuleSet(IE_RULES);
      const arRules = new TaxRuleSet(AR_RULES);

      const ieType = (ieRules.getResolvedInvestmentTypes() || []).find(t => t && t.key === 'indexFunds_ie');
      if (!ieType) {
        errors.push('Missing indexFunds_ie after baseRef resolution');
      } else {
        if (ieType.baseKey !== 'globalEquity') errors.push('indexFunds_ie should inherit baseKey globalEquity');
        if (ieType.baseCurrency !== 'EUR') errors.push('indexFunds_ie should preserve local baseCurrency EUR');
        if (ieType.assetCountry !== 'ie') errors.push('indexFunds_ie should preserve local assetCountry ie');
      }

      const arType = (arRules.getResolvedInvestmentTypes() || []).find(t => t && t.key === 'shares_ar');
      if (!arType) {
        errors.push('Missing shares_ar after baseRef resolution');
      } else {
        if (arType.baseKey !== 'globalEquity') errors.push('shares_ar should inherit baseKey globalEquity');
        if (arType.label !== 'Global USD ETF (AR)') errors.push('shares_ar should preserve local label');
      }
    } catch (err) {
      errors.push('Unexpected error: ' + (err && err.message ? err.message : String(err)));
    } finally {
      global.Config = originalConfig;
    }

    return { success: errors.length === 0, errors };
  }
};
