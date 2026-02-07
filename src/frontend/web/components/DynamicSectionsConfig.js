/**
 * DynamicSectionsConfig
 *
 * Registry of dynamic table sections. A "dynamic section" is rendered as a flexbox
 * row inside a single colspan cell so each country/period can have a different
 * column set without changing the table's overall column structure.
 */

function normalizePinnedIncomeKey(rawKey) {
  if (rawKey == null) return null;
  const s = String(rawKey).trim();
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const DYNAMIC_SECTIONS = [
  {
    id: 'grossIncome',
    groupKey: 'grossIncome',
    anchorKey: 'GrossIncome',
    isGroupBoundary: true,
    enableVisibilityEngine: true,
    pinnedKeys: [],
    zeroHide: { keyPrefixes: ['Income__'] },
    emptyState: {
      minWidthByKey: {
        IncomeSalaries: 'label',
        IncomeRentals: 'label',
        IncomeRSUs: 'label',
        IncomePrivatePension: 'label',
        IncomeStatePension: 'label',
        IncomeDefinedBenefit: 'label',
        IncomeTaxFree: 'label',
        IncomeCash: 'label'
      },
      minWeightAvgFactorByKey: {
        IncomeSalaries: 0.9,
        IncomeRentals: 0.9,
        IncomeRSUs: 0.9,
        IncomePrivatePension: 0.9,
        IncomeStatePension: 0.9,
        IncomeDefinedBenefit: 0.9,
        IncomeTaxFree: 0.9,
        IncomeCash: 0.9
      }
    },
    getColumns: function (countryCode) {
      const config = Config.getInstance();
      const taxRuleSet = config.getCachedTaxRuleSet(countryCode);
      if (!taxRuleSet) {
        throw new Error(`TaxRuleSet not cached for country: ${countryCode}`);
      }

      // Resolve pinned keys once (section-level); derived from ruleset configuration.
      if (this.enableVisibilityEngine && (!Array.isArray(this.pinnedKeys) || this.pinnedKeys.length === 0)) {
        const pinned = taxRuleSet.getPinnedIncomeTypes ? (taxRuleSet.getPinnedIncomeTypes() || []) : [];
        const out = [];
        for (let i = 0; i < pinned.length; i++) {
          const k = normalizePinnedIncomeKey(pinned[i]);
          if (k) out.push(k);
        }
        this.pinnedKeys = out;
      }

      const columns = [
        { key: 'IncomeSalaries', label: 'Salaries', tooltip: 'Total salary income received this year' },
        { key: 'IncomeRentals', label: 'Rentals', tooltip: 'Rental income from real estate properties' },
        { key: 'IncomeRSUs', label: 'RSUs', tooltip: 'Income from Restricted Stock Units (RSUs) vesting' },
        { key: 'IncomePrivatePension', label: 'P.Pension', tooltip: 'Withdrawals from private pension funds' },
        { key: 'IncomeStatePension', label: 'S.Pension', tooltip: 'State pension payments received' },
        { key: 'IncomeDefinedBenefit', label: 'DBI', tooltip: 'Defined Benefit pension income' },
        { key: 'IncomeTaxFree', label: 'Tax Free', tooltip: 'Tax-free income' }
      ];

      // Dynamic Income__ columns: use the union of investment types across cached rulesets.
      // This ensures relocated periods can still display income for asset keys originating
      // from a previous ruleset (e.g., "shares_ie" while resident in "ar").
      // Ordering: types from non-current countries first, current country last.
      const typeByKey = {};
      const orderedKeys = [];
      const addTypes = (types) => {
        const list = Array.isArray(types) ? types : [];
        for (let i = 0; i < list.length; i++) {
          const t = list[i] || {};
          const k = t.key;
          if (!k) continue;
          if (!typeByKey[k]) {
            typeByKey[k] = t;
            orderedKeys.push(k);
          }
        }
      };
      const cached = config.listCachedRuleSets();
      const cachedKeys = Object.keys(cached || {});
      for (let i = 0; i < cachedKeys.length; i++) {
        const cc = cachedKeys[i];
        if (cc === countryCode) continue;
        const rs = cached[cc];
        if (!rs) continue;
        addTypes(rs.getResolvedInvestmentTypes());
      }
      addTypes(taxRuleSet.getResolvedInvestmentTypes());

      for (let i = 0; i < orderedKeys.length; i++) {
        const t = typeByKey[orderedKeys[i]];
        const label = t.label || t.key;
        columns.push({
          key: `Income__${t.key}`,
          label: label,
          tooltip: `Income from ${label}`
        });
      }

      columns.push({
        key: 'IncomeCash',
        label: 'Cash',
        tooltip: 'Withdrawals from cash savings'
      });

      return columns;
    }
  },
  {
    id: 'assets',
    groupKey: 'assets',
    anchorKey: 'RealEstateCapital',
    isGroupBoundary: true,
    enableVisibilityEngine: true,
    pinnedKeys: ['PensionFund', 'Cash', 'RealEstateCapital'],
    getColumns: function (countryCode) {
      const config = Config.getInstance();
      const taxRuleSet = config.getCachedTaxRuleSet(countryCode);
      if (!taxRuleSet) {
        throw new Error(`TaxRuleSet not cached for country: ${countryCode}`);
      }

      const columns = [
        { key: 'PensionFund', label: 'Pension', tooltip: 'Total value of private pension funds' },
        { key: 'Cash', label: 'Cash', tooltip: 'Total cash savings' },
        { key: 'RealEstateCapital', label: 'R.Estate', tooltip: 'Total value of your owned real estate' }
      ];

      // Dynamic Capital__ columns: use the union of investment types across cached rulesets.
      // Ordering: types from non-current countries first, current country last.
      const typeByKey = {};
      const orderedKeys = [];
      const addTypes = (types) => {
        const list = Array.isArray(types) ? types : [];
        for (let i = 0; i < list.length; i++) {
          const t = list[i] || {};
          const k = t.key;
          if (!k) continue;
          if (!typeByKey[k]) {
            typeByKey[k] = t;
            orderedKeys.push(k);
          }
        }
      };
      const cached = config.listCachedRuleSets();
      const cachedKeys = Object.keys(cached || {});
      for (let i = 0; i < cachedKeys.length; i++) {
        const cc = cachedKeys[i];
        if (cc === countryCode) continue;
        const rs = cached[cc];
        if (!rs) continue;
        addTypes(rs.getResolvedInvestmentTypes());
      }
      addTypes(taxRuleSet.getResolvedInvestmentTypes());

      for (let i = 0; i < orderedKeys.length; i++) {
        const t = typeByKey[orderedKeys[i]];
        const label = t.label || t.key;
        columns.push({
          key: `Capital__${t.key}`,
          label: label,
          tooltip: `Total value of your ${label} investments`
        });
      }

      return columns;
    }
  },
  {
    id: 'deductions',
    groupKey: 'deductions',
    anchorKey: 'PensionContribution',
    isGroupBoundary: true,
    enableVisibilityEngine: false,
    pinnedKeys: [],
    zeroHide: {
      keys: ['PensionContribution'],
      matcher: (key) => {
        return key.indexOf('Tax__') === 0 && key.indexOf(':') > 0;
      }
    },
    emptyState: {
      minWidthByKey: { PensionContribution: 'label' },
      minWeightAvgFactorByKey: { PensionContribution: 0.85 }
    },
    getColumns: (countryCode) => {
      const config = Config.getInstance();
      const taxRuleSet = config.getCachedTaxRuleSet(countryCode);
      if (!taxRuleSet) {
        throw new Error(`TaxRuleSet not cached for country: ${countryCode}`);
      }

      const columns = [
        {
          key: 'PensionContribution',
          label: 'P.Contrib',
          tooltip: 'Amount contributed to private pensions (excluding employer match)'
        }
      ];

      const taxOrder = taxRuleSet.getTaxOrder();
      const residenceTaxSet = {};
      for (let i = 0; i < taxOrder.length; i++) {
        const tid = String(taxOrder[i] || '').toLowerCase();
        if (tid) residenceTaxSet[tid] = true;
      }
      const lowerCountryCode = String(countryCode || '').toLowerCase();
      const cachedRuleSets = config.listCachedRuleSets();

      const sampleAttributions = [];
      if (typeof window !== 'undefined' && Array.isArray(window.dataSheet) && window.dataSheet.length > 1) {
        for (let i = 1; i < window.dataSheet.length; i++) {
          const row = window.dataSheet[i];
          const attrs = row && row.attributions;
          if (attrs) {
            sampleAttributions.push(attrs);
          }
        }
      }

      const sourceOnlyTaxIdsByCountry = {};
      const cachedCountries = Object.keys(cachedRuleSets || {}).sort();
      for (let ci = 0; ci < cachedCountries.length; ci++) {
        const foreignCountry = String(cachedCountries[ci] || '').toLowerCase();
        if (!foreignCountry || foreignCountry === lowerCountryCode) continue;
        const sourceRuleSet = cachedRuleSets[foreignCountry];
        if (!sourceRuleSet || typeof sourceRuleSet.getTaxOrder !== 'function') continue;
        const sourceTaxOrder = sourceRuleSet.getTaxOrder() || [];
        for (let ti = 0; ti < sourceTaxOrder.length; ti++) {
          const sourceTaxId = String(sourceTaxOrder[ti] || '');
          const sourceTaxIdLower = sourceTaxId.toLowerCase();
          if (!sourceTaxId) continue;
          let mappedTaxId = null;
          if (sourceRuleSet && typeof sourceRuleSet.getEquivalentTaxIdIn === 'function') {
            mappedTaxId = sourceRuleSet.getEquivalentTaxIdIn(taxRuleSet, sourceTaxId);
          } else if (residenceTaxSet[sourceTaxIdLower]) {
            mappedTaxId = sourceTaxId;
          }
          if (mappedTaxId) continue;
          if (!sourceOnlyTaxIdsByCountry[foreignCountry]) sourceOnlyTaxIdsByCountry[foreignCountry] = {};
          sourceOnlyTaxIdsByCountry[foreignCountry][sourceTaxId] = true;
        }
      }

      for (let i = 0; i < sampleAttributions.length; i++) {
        const attrs = sampleAttributions[i];
        if (!attrs || typeof attrs !== 'object') continue;
        const metricKeys = Object.keys(attrs);
        for (let mk = 0; mk < metricKeys.length; mk++) {
          const metricKey = metricKeys[mk];
          const match = /^tax:([^:]+):([a-z]{2,})$/i.exec(metricKey);
          if (!match) continue;
          const taxId = String(match[1] || '');
          const taxIdLower = taxId.toLowerCase();
          const foreignCountry = String(match[2] || '').toLowerCase();
          if (!foreignCountry || foreignCountry === lowerCountryCode) continue;
          const sourceRuleSet = cachedRuleSets ? cachedRuleSets[foreignCountry] : null;
          let mappedTaxId = null;
          if (sourceRuleSet && typeof sourceRuleSet.getEquivalentTaxIdIn === 'function') {
            mappedTaxId = sourceRuleSet.getEquivalentTaxIdIn(taxRuleSet, taxId);
          } else if (residenceTaxSet[taxIdLower]) {
            mappedTaxId = taxId;
          }
          if (mappedTaxId) continue;
          const metric = attrs[metricKey];
          if (!metric || typeof metric !== 'object') continue;
          const sources = Object.keys(metric);
          let hasAmount = false;
          for (let j = 0; j < sources.length; j++) {
            const amount = metric[sources[j]];
            if (typeof amount === 'number' && amount !== 0) {
              hasAmount = true;
              break;
            }
          }
          if (!hasAmount) continue;
          if (!sourceOnlyTaxIdsByCountry[foreignCountry]) sourceOnlyTaxIdsByCountry[foreignCountry] = {};
          sourceOnlyTaxIdsByCountry[foreignCountry][taxId] = true;
        }
      }

      taxOrder.forEach((taxId) => {
        const taxLabel = taxRuleSet.getDisplayNameForTax(taxId);
        const taxTooltip = taxRuleSet.getTooltipForTax(taxId);
        columns.push({
          key: `Tax__${taxId}`,
          label: taxLabel,
          tooltip: taxTooltip
        });
      });

      const sourceOnlyCountries = Object.keys(sourceOnlyTaxIdsByCountry).sort();
      for (let i = 0; i < sourceOnlyCountries.length; i++) {
        const foreignCountry = sourceOnlyCountries[i];
        const sourceRuleSet = cachedRuleSets ? cachedRuleSets[foreignCountry] : null;
        const sourceTaxIds = Object.keys(sourceOnlyTaxIdsByCountry[foreignCountry] || {}).sort();
        for (let j = 0; j < sourceTaxIds.length; j++) {
          const sourceTaxId = sourceTaxIds[j];
          const sourceTaxLabel = (sourceRuleSet && typeof sourceRuleSet.getDisplayNameForTax === 'function')
            ? sourceRuleSet.getDisplayNameForTax(sourceTaxId)
            : sourceTaxId;
          const sourceTaxTooltip = (sourceRuleSet && typeof sourceRuleSet.getTooltipForTax === 'function')
            ? sourceRuleSet.getTooltipForTax(sourceTaxId)
            : null;
          columns.push({
            key: `Tax__${sourceTaxId}:${foreignCountry}`,
            label: `${sourceTaxLabel} (${foreignCountry.toUpperCase()})`,
            tooltip: sourceTaxTooltip
              ? `${sourceTaxTooltip} paid to ${foreignCountry.toUpperCase()}`
              : `Tax paid to ${foreignCountry.toUpperCase()}`
          });
        }
      }

      return columns;
    }
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DYNAMIC_SECTIONS };
}
