// src/core/tax/ResidencyRulesHandler.js

/**
 * Handles tax calculations related to residency status, foreign income, and special regimes.
 */
class ResidencyRulesHandler {
    /**
     * @param {object} taxmanInstance - Reference to the main Taxman instance.
     * @param {SchemaEvaluator} schemaEvaluator - Instance of the SchemaEvaluator helper.
     */
    constructor(taxmanInstance, schemaEvaluator) {
        this.taxman = taxmanInstance;
        this.evaluator = schemaEvaluator;
        this.taxConfig = taxmanInstance.taxConfig;
        this.residencyConfig = taxmanInstance.taxConfig?.residencyRules;
    }

    /**
     * Applies modifications to the tax calculation based on residency rules.
     * This could modify income sources, apply different rates, or adjust final tax liability.
     * @param {object} currentTaxResult - The tax result object calculated so far by Taxman.
     * @returns {object} The modified tax result object.
     */
    applyResidencyRules(currentTaxResult) {
        if (!this.residencyConfig) {
            // console.log("No Residency Rules configuration found.");
            return currentTaxResult; // No rules to apply
        }

        const residencyStatus = this.taxman.currentState?.residencyStatus;
        let modifiedResult = { ...currentTaxResult }; // Start with a copy

        if (residencyStatus === 'nonResident') {
            modifiedResult = this._applyNonResidentRules(modifiedResult);
        } else { // Assume 'resident' or similar default
            modifiedResult = this._applyForeignTaxRelief(modifiedResult);
            modifiedResult = this._applySpecialRegimes(modifiedResult);
        }

        return modifiedResult;
    }

    /**
     * Applies rules specific to non-residents.
     * @param {object} currentTaxResult - The tax result object.
     * @returns {object} The modified tax result object.
     * @private
     */
    _applyNonResidentRules(currentTaxResult) {
        const rules = this.residencyConfig.nonResidentTaxation;
        if (!rules) return currentTaxResult;

        console.warn("Non-resident taxation rules application is not fully implemented.");
        // Placeholder logic:
        // 1. Filter income sources based on rules.incomeTypesSubjectToTax.
        // 2. Recalculate taxes based on rules.taxationMethod and rules.rates.
        // 3. Adjust allowances/deductions based on rules.allowancesDeductions.
        // This likely requires significant interaction with other calculators or Taxman's main flow.

        return currentTaxResult;
    }

    /**
     * Applies foreign tax relief rules for residents.
     * @param {object} currentTaxResult - The tax result object.
     * @returns {object} The modified tax result object.
     * @private
     */
    _applyForeignTaxRelief(currentTaxResult) {
        const rules = this.residencyConfig.foreignTaxRelief;
        if (!rules || !rules.applies) return currentTaxResult;

        console.warn("Foreign tax relief application is not fully implemented.");
        // Placeholder logic:
        // 1. Get foreign income and foreign tax paid from currentState (needs to be added).
        // 2. Apply relief based on rules.method ('credit', 'exemption', 'deduction').
        // 3. For 'credit', calculate the limit based on rules.creditLimitRule.
        // 4. Adjust the final totalTaxLiability.

        return currentTaxResult;
    }

    /**
     * Applies rules for special tax regimes (non-dom, expat, etc.).
     * @param {object} currentTaxResult - The tax result object.
     * @returns {object} The modified tax result object.
     * @private
     */
    _applySpecialRegimes(currentTaxResult) {
        const regimes = this.residencyConfig.specialRegimes;
        if (!regimes || !Array.isArray(regimes) || regimes.length === 0) {
            return currentTaxResult;
        }

        console.warn("Special tax regime application is not fully implemented.");
        // Placeholder logic:
        // 1. Iterate through regimes.
        // 2. Check eligibility using evaluator.evaluateCondition on regime.eligibilityCriteria.
        // 3. If eligible:
        //    - Apply modifications based on regime.rulesSummary (might involve custom logic via executeCustomRule).
        //    - Add regime.annualCharge to tax liability.
        //    - Potentially flag loss of allowances (regime.lossOfAllowances).

        return currentTaxResult;
    }
}

// Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResidencyRulesHandler;
}