/**
 * DynamicSectionsConfig
 *
 * Registry of dynamic table sections. A "dynamic section" is rendered as a flexbox
 * row inside a single colspan cell so each country/period can have a different
 * column set without changing the table's overall column structure.
 */

const DYNAMIC_SECTIONS = [
  {
    id: 'deductions',
    groupKey: 'deductions',
    anchorKey: 'PensionContribution',
    periodZeroHideKeys: ['PensionContribution'],
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
