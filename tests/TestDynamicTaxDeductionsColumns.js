module.exports = {
  name: 'TestDynamicTaxDeductionsColumns',
  description: 'Validates deductions columns aggregate equivalent foreign taxes and keep unmatched source taxes as separate columns.',
  isCustomTest: true,
  runCustomTest: async function () {
    const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
    const IE_RULES = require('../src/core/config/tax-rules-ie.json');
    const AR_RULES = require('../src/core/config/tax-rules-ar.json');
    const errors = [];

    function assert(cond, msg) {
      if (!cond) errors.push(msg);
    }

    function deepClone(obj) {
      return JSON.parse(JSON.stringify(obj));
    }

    const ieRules = deepClone(IE_RULES);
    ieRules.additionalTaxes = ieRules.additionalTaxes || [];
    ieRules.additionalTaxes.push({
      name: 'Extra Levy',
      brackets: { "0": 0.01 }
    });

    const cache = {
      ie: new TaxRuleSet(ieRules),
      ar: new TaxRuleSet(AR_RULES)
    };

    const configStub = {
      getCachedTaxRuleSet: (countryCode) => {
        const code = String(countryCode || '').toLowerCase();
        return cache[code] || null;
      },
      listCachedRuleSets: () => {
        return Object.assign({}, cache);
      }
    };

    const originalConfig = global.Config;
    const originalWindow = global.window;
    global.Config = { getInstance: () => configStub };
    global.window = {
      dataSheet: [
        null,
        {
          attributions: {
            'tax:incomeTax:ie': { 'Salary Income Tax (IE)': 1200 },
            'tax:capitalGains:ie': { 'CGT (IE)': 200 },
            'tax:prsi:ie': { PRSI: 500 },
            'tax:usc:ie': { USC: 200 },
            'tax:extra levy:ie': { 'Extra Levy': 50 }
          }
        }
      ]
    };

    try {
      const { DYNAMIC_SECTIONS } = require('../src/frontend/web/components/DynamicSectionsConfig.js');
      const section = (DYNAMIC_SECTIONS || []).find((s) => s && s.id === 'deductions');
      assert(!!section, 'Missing deductions dynamic section config');
      if (!section) return { success: false, errors };

      const columns = section.getColumns('ar');
      const keys = columns.map((c) => c && c.key).filter(Boolean);
      const labelsByKey = {};
      for (let i = 0; i < columns.length; i++) {
        const c = columns[i];
        if (!c || !c.key) continue;
        labelsByKey[c.key] = c.label;
      }

      assert(keys.indexOf('Tax__incomeTax') !== -1, 'Expected residence income tax column Tax__incomeTax');
      assert(keys.indexOf('Tax__incomeTax:ie') === -1, 'Matching foreign incomeTax should be aggregated, not split into Tax__incomeTax:ie');
      assert(keys.indexOf('Tax__capitalGains:ie') === -1, 'Matching foreign capitalGains should be aggregated, not split into Tax__capitalGains:ie');
      assert(keys.indexOf('Tax__prsi:ie') === -1, 'Equivalent foreign PRSI should aggregate into a residence tax column');
      assert(keys.indexOf('Tax__usc:ie') === -1, 'Equivalent foreign USC should aggregate into a residence tax column');
      assert(keys.indexOf('Tax__extra levy:ie') !== -1, 'Unmatched source-only foreign tax should appear as Tax__extra levy:ie');

      const extraLevyLabel = labelsByKey['Tax__extra levy:ie'] || '';
      assert(extraLevyLabel.indexOf('Extra Levy') !== -1, 'Expected source-only column label to use source tax name (Extra Levy)');
      assert(extraLevyLabel.indexOf('(IE)') !== -1, 'Expected source-only column label to include country suffix (IE)');

      // Regression: during runtime these columns are needed before overlap rows exist.
      // Source-only columns must be derivable from rulesets, not only from sampled attributions.
      global.window = { dataSheet: [null] };
      const columnsSchemaOnly = section.getColumns('ar');
      const keysSchemaOnly = columnsSchemaOnly.map((c) => c && c.key).filter(Boolean);
      assert(keysSchemaOnly.indexOf('Tax__prsi:ie') === -1, 'Equivalent PRSI should not appear as source-only in schema-only discovery');
      assert(keysSchemaOnly.indexOf('Tax__usc:ie') === -1, 'Equivalent USC should not appear as source-only in schema-only discovery');
      assert(keysSchemaOnly.indexOf('Tax__extra levy:ie') !== -1, 'Expected unmatched Tax__extra levy:ie from schema-only source tax discovery');
    } finally {
      global.Config = originalConfig;
      global.window = originalWindow;
    }

    return { success: errors.length === 0, errors };
  }
};
