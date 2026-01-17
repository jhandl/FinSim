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
      addTypes(taxRuleSet.getResolvedInvestmentTypes());
      const cached = config.listCachedRuleSets();
      for (const cc in cached) {
        const rs = cached[cc];
        if (!rs || rs === taxRuleSet) continue;
        addTypes(rs.getResolvedInvestmentTypes());
      }

      for (let i = 0; i < orderedKeys.length; i++) {
        const t = typeByKey[orderedKeys[i]];
        const label = t.label || t.key;
        columns.push({
          key: `Income__${t.key}`,
          label: label.substring(0, 12) + (label.length > 12 ? '...' : ''),
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
    id: 'deductions',
    groupKey: 'deductions',
    anchorKey: 'PensionContribution',
    isGroupBoundary: true,
    enableVisibilityEngine: false,
    pinnedKeys: [],
    zeroHide: { keys: ['PensionContribution'] },
    emptyState: {
      minWidthByKey: { PensionContribution: 'label' },
      minWeightAvgFactorByKey: { PensionContribution: 0.85 }
    },
    getColumns: (countryCode) => {
      const taxRuleSet = Config.getInstance().getCachedTaxRuleSet(countryCode);
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
      taxOrder.forEach((taxId) => {
        columns.push({
          key: `Tax__${taxId}`,
          label: taxRuleSet.getDisplayNameForTax(taxId),
          tooltip: taxRuleSet.getTooltipForTax(taxId)
        });
      });

      return columns;
    }
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DYNAMIC_SECTIONS };
}
