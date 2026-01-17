// Custom test for DynamicSectionsConfig grossIncome section (dynamic investment income columns)

module.exports = {
  name: 'TestDynamicInvestmentIncomeSections',
  description: 'Validates grossIncome dynamic section columns include per-country Income__ investment types',
  isCustomTest: true,
  runCustomTest: async function () {
    const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
    const IE_RULES = require('../src/core/config/tax-rules-ie.json');
    const AR_RULES = require('../src/core/config/tax-rules-ar.json');
    const GLOBAL_RULES = require('../src/core/config/tax-rules-global.json');

    const errors = [];

    function assert(cond, msg) {
      if (!cond) errors.push(msg);
    }

    // Minimal Config stub for TaxRuleSet.getResolvedInvestmentTypes() and DynamicSectionsConfig.getColumns()
    const baseTypes = Array.isArray(GLOBAL_RULES.investmentBaseTypes) ? GLOBAL_RULES.investmentBaseTypes : [];
    const baseTypeByKey = {};
    for (let i = 0; i < baseTypes.length; i++) {
      const t = baseTypes[i];
      if (!t) continue;
      const k = t.baseKey || t.key;
      if (k) baseTypeByKey[k] = t;
    }

    const cache = {
      ie: new TaxRuleSet(IE_RULES),
      ar: new TaxRuleSet(AR_RULES)
    };

    const configStub = {
      getCachedTaxRuleSet: (countryCode) => {
        const code = (countryCode || 'ie').toLowerCase();
        return cache[code];
      },
      listCachedRuleSets: () => {
        return Object.assign({}, cache);
      },
      getInvestmentBaseTypeByKey: (key) => {
        return baseTypeByKey[key] || null;
      }
    };

    global.Config = {
      getInstance: () => configStub
    };

    const { DYNAMIC_SECTIONS } = require('../src/frontend/web/components/DynamicSectionsConfig.js');
    const section = (DYNAMIC_SECTIONS || []).find(s => s && s.id === 'grossIncome');
    assert(!!section, 'Missing grossIncome dynamic section config');

    if (!section) return { success: false, errors };

    function validateCountry(countryCode) {
      const taxRuleSet = configStub.getCachedTaxRuleSet(countryCode);
      const resolvedTypes = taxRuleSet.getResolvedInvestmentTypes();
      const cols = section.getColumns(countryCode);

      assert(Array.isArray(cols) && cols.length >= 1, `No columns returned for ${countryCode}`);
      if (!Array.isArray(cols) || cols.length === 0) return { keys: [] };

      const colKeys = cols.map(c => c && c.key).filter(Boolean);
      const dynKeys = colKeys.filter(k => k.indexOf('Income__') === 0);
      const expectedDynKeys = resolvedTypes.map(t => 'Income__' + t.key);

      // Ensure every resolved type has a corresponding Income__ column
      for (let i = 0; i < expectedDynKeys.length; i++) {
        const k = expectedDynKeys[i];
        assert(dynKeys.indexOf(k) !== -1, `Missing ${k} for ${countryCode}`);
      }

      // Truncation contract: Income__ labels are max 12 + "..."
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (!c || typeof c.key !== 'string') continue;
        if (c.key.indexOf('Income__') === 0) {
          assert(typeof c.label === 'string', `Missing label for ${c.key} (${countryCode})`);
          if (typeof c.label === 'string') {
            assert(c.label.length <= 15, `Label too long for ${c.key} (${countryCode}): "${c.label}"`);
          }
        }
      }

      return { keys: dynKeys.slice().sort() };
    }

    const ie = validateCountry('ie');
    const ar = validateCountry('ar');

    // Negative test: missing cached ruleset should throw
    try {
      section.getColumns('xx');
      errors.push('Expected getColumns("xx") to throw when ruleset is not cached');
    } catch (_) {
      // ok
    }

    // Best-effort: if IE and AR resolved types differ, column keys should differ too
    const ieKeyStr = ie.keys.join(',');
    const arKeyStr = ar.keys.join(',');
    if (ieKeyStr !== arKeyStr) {
      assert(ie.keys.length !== 0, 'IE dynamic Income__ keys unexpectedly empty');
      assert(ar.keys.length !== 0, 'AR dynamic Income__ keys unexpectedly empty');
    }

    return { success: errors.length === 0, errors };
  }
};

