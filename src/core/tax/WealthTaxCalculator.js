// src/core/tax/WealthTaxCalculator.js

/**
 * Calculates Wealth Tax based on the provided configuration and state.
 */
class WealthTaxCalculator {
    /**
     * @param {object} taxmanInstance - Reference to the main Taxman instance.
     * @param {SchemaEvaluator} schemaEvaluator - Instance of the SchemaEvaluator helper.
     */
    constructor(taxmanInstance, schemaEvaluator) {
        this.taxman = taxmanInstance;
        this.evaluator = schemaEvaluator;
        this.taxConfig = taxmanInstance.taxConfig; // Convenience reference
        this.wealthConfig = taxmanInstance.taxConfig.wealthTax; // Specific config
    }

    /**
     * Calculates wealth tax for the period.
     * Updates taxman.calculated.wealthTax.
     */
    calculateWealthTax() {
        // console.log("Computing Wealth Tax..."); // Commented out
        const config = this.wealthConfig;
        if (!config?.applies) {
            this.taxman.calculated.wealthTax = 0;
            // console.log("Wealth Tax does not apply."); // Commented out
            return;
        }

        // 1. Determine Tax Base
        let wealthBase = 0;
        const baseDef = config.baseDefinition || {};
        const assets = this.taxman.assets || {};
        const liabilities = this.taxman.currentState?.liabilities || 0; // Simulator needs to provide total liabilities

        // Calculate gross assets based on included/excluded types
        let includedAssetValue = 0;
        const includedTypes = baseDef.includedAssetTypes || ['all'];
        const excludedTypes = baseDef.excludedAssetTypes || [];

        for (const assetName in assets) {
            const asset = assets[assetName];
            // Ensure it's a valid asset object with value and type
            if (typeof asset === 'object' && asset !== null && asset.value !== undefined) {
                const assetType = asset.type || 'general'; // Default type if missing
                const isIncluded = includedTypes.includes('all') || includedTypes.includes(assetType);
                const isExcluded = excludedTypes.includes(assetType);

                if (isIncluded && !isExcluded) {
                    includedAssetValue += Number(asset.value) || 0;
                }
            }
        }

        // Determine final base according to definition
        if (baseDef.type === 'netWorth') {
            // Deduct liabilities only if specified
            wealthBase = Math.max(0, includedAssetValue - (baseDef.liabilityInclusion === 'include' ? liabilities : 0));
        } else if (baseDef.type === 'grossAssets' || baseDef.type === 'specificAssets') {
             wealthBase = includedAssetValue; // Use only the sum of included assets
        } else {
             console.warn(`Unknown wealth tax base type: ${baseDef.type}. Defaulting to net worth (including liabilities).`);
             wealthBase = Math.max(0, includedAssetValue - liabilities);
        }
        console.log(`Wealth Base Calculation: Included Assets=${includedAssetValue}, Liabilities=${liabilities}, Base Type=${baseDef.type}, Final Base=${wealthBase}`);

        // 2. Apply Exemption Threshold (using CalculationRule)
        const exemptionRule = config.exemptionThreshold?.calculationRule || { method: 'fixedAmount', value: 0 };
        const exemptionContext = { ...this.taxman.currentState, wealthBase }; // Context for exemption calculation
        let exemptionAmount = this.evaluator.calculateValue(exemptionRule, exemptionContext);
        let taxableWealth = Math.max(0, wealthBase - exemptionAmount);
        console.log(`Wealth Base=${wealthBase}, Exemption=${exemptionAmount}, Taxable Wealth=${taxableWealth}`);

        // 3. Calculate Tax
        let wealthTax = 0;
        const calcMethod = config.taxCalculationMethod;
        if (calcMethod && taxableWealth > 0) {
            switch(calcMethod.method) {
                case 'brackets':
                    wealthTax = this.evaluator.calculateBracketTax(calcMethod.brackets || [], taxableWealth);
                    break;
                case 'flatRate':
                    const rateRule = calcMethod.flatRateRule || { method: 'fixedAmount', value: 0 };
                    const rateContext = { ...this.taxman.currentState, taxableWealth }; // Context for rate calculation
                    const rate = this.evaluator.calculateValue(rateRule, rateContext);
                    wealthTax = taxableWealth * rate;
                    break;
                default:
                    console.warn(`Unknown wealth tax calculation method: ${calcMethod.method}`);
            }
        }

        // 4. Apply Liability Cap Rule
        if (config.liabilityCapRule?.applies && config.liabilityCapRule.maxPercentageOfIncomeRule) {
            const capRule = config.liabilityCapRule.maxPercentageOfIncomeRule;
            const capContext = { ...this.taxman.currentState, ...this.taxman.calculated }; // Context for cap calculation
            const capPercent = this.evaluator.calculateValue(capRule, capContext);

            if (capPercent > 0) {
                 const incomeBasisForCap = config.liabilityCapRule.basedOn || 'adjustedGrossIncome'; // Allow specifying income base
                 const incomeForCap = this.evaluator.getBasisValue(incomeBasisForCap, capContext);
                 const maxTotalTax = incomeForCap * capPercent;
                 // Income tax considered for cap is after non-refundable credits
                 const incomeTaxAfterNonRefundable = Math.max(0, this.taxman.calculated.incomeTax - this.taxman.calculated.appliedNonRefundableCredits);
                 // Max wealth tax allowed = Max Total Tax - Income Tax (cannot be negative)
                 const maxWealthTax = Math.max(0, maxTotalTax - incomeTaxAfterNonRefundable);
                 if (wealthTax > maxWealthTax) {
                     console.log(`Applying Wealth Tax Liability Cap: Max Total Tax=${maxTotalTax}, Income Tax=${incomeTaxAfterNonRefundable}. Wealth tax reduced from ${wealthTax} to ${maxWealthTax}`);
                     wealthTax = maxWealthTax;
                 }
            } else {
                 console.warn("Wealth tax liability cap rule has invalid maxPercentageOfIncome.");
            }
        }

        this.taxman.calculated.wealthTax = wealthTax;
        console.log(`Finished Wealth Tax calculation: ${wealthTax}`);
    }
}

// Export if needed
// export default WealthTaxCalculator;

// Node.js compatibility: Export class using module.exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WealthTaxCalculator;
}