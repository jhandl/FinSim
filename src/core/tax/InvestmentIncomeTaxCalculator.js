// src/core/tax/InvestmentIncomeTaxCalculator.js

/**
 * Calculates taxes on investment income (dividends, interest, royalties)
 * based on the provided configuration and state.
 */
class InvestmentIncomeTaxCalculator {
    /**
     * @param {object} taxmanInstance - Reference to the main Taxman instance.
     * @param {SchemaEvaluator} schemaEvaluator - Instance of the SchemaEvaluator helper.
     * @param {CapitalGainsTaxCalculator} cgtCalculator - Instance for handling 'asCapitalGains' method.
     */
    constructor(taxmanInstance, schemaEvaluator, cgtCalculator) {
        this.taxman = taxmanInstance;
        this.evaluator = schemaEvaluator;
        this.cgtCalculator = cgtCalculator; // Needed for 'asCapitalGains'
        this.taxConfig = taxmanInstance.taxConfig; // Convenience reference
        this.invConfig = taxmanInstance.taxConfig.investmentIncomeTax; // Specific config
    }

    /**
     * Calculates total investment income tax for the period.
     * Updates taxman.calculated.investmentIncomeTax.
     */
    calculateInvestmentTax() {
        // console.log("Computing Investment Income Tax..."); // Commented out
        const config = this.invConfig;
        if (!config) {
            this.taxman.calculated.investmentIncomeTax = 0;
            console.log("No Investment Income Tax configuration found.");
            return;
        }

        let totalInvestmentTax = 0;
        const context = {
            adjustedGrossIncome: this.taxman.calculated.adjustedGrossIncome,
            taxableIncome: this.taxman.calculated.taxableIncome // Needed for income-dependent allowances/rates
        };

        // Process Dividends
        if (config.dividends && this.taxman.incomeSources.investment.dividends > 0) {
            totalInvestmentTax += this._calculateSingleInvestmentIncome(
                'dividend',
                config.dividends,
                this.taxman.incomeSources.investment.dividends,
                context
            );
        }

        // Process Interest
        if (config.interest && this.taxman.incomeSources.investment.interest > 0) {
            totalInvestmentTax += this._calculateSingleInvestmentIncome(
                'interest',
                config.interest,
                this.taxman.incomeSources.investment.interest,
                context
            );
        }

        // Process Royalties
        if (config.royalties && this.taxman.incomeSources.investment.royalties > 0) {
            totalInvestmentTax += this._calculateSingleInvestmentIncome(
                'royalty',
                config.royalties,
                this.taxman.incomeSources.investment.royalties,
                context
            );
        }

        this.taxman.calculated.investmentIncomeTax = totalInvestmentTax;
        // console.log(`Finished Investment Income Tax calculation: ${totalInvestmentTax}`); // Commented out
    }

    /**
     * Calculates tax for a single type of investment income (dividend, interest, royalty).
     * @param {string} incomeTypeName - 'dividend', 'interest', or 'royalty'.
     * @param {object} typeConfig - The specific config section (e.g., config.dividends).
     * @param {number} grossAmount - The gross amount of this income type.
     * @param {object} context - Calculation context (AGI, taxableIncome).
     * @returns {number} The calculated tax for this income type.
     */
    _calculateSingleInvestmentIncome(incomeTypeName, typeConfig, grossAmount, context) {
        let tax = 0;
        // Use the public calculateValue method for allowance
        const allowanceRule = typeConfig.allowance?.calculationRule; // Get the rule object
        let allowanceAmount = allowanceRule ? this.evaluator.calculateValue(allowanceRule, context) : 0;
        const taxableAmount = Math.max(0, grossAmount - allowanceAmount);
        // console.log(`${incomeTypeName.charAt(0).toUpperCase() + incomeTypeName.slice(1)}: Gross=${grossAmount}, Allowance=${allowanceAmount}, Taxable=${taxableAmount}`); // Keep commented

        if (taxableAmount > 0) {
            let isQualified = false;
            if (incomeTypeName === 'dividend' && typeConfig.qualifiedDefinition) {
                 // Use the public evaluateCondition method for qualified status
                 isQualified = this.evaluator.evaluateCondition(typeConfig.qualifiedDefinition, context);
            }
            // Determine the correct rate *rule* based on qualification status for dividends
            // Assumes typeConfig.rates.qualified and .nonQualified are CalculationRule objects
            const rateRule = (incomeTypeName === 'dividend' && isQualified)
                ? typeConfig.rates?.qualifiedRule // Expecting qualifiedRule
                : typeConfig.rates?.nonQualifiedRule ?? typeConfig.rates?.defaultRule; // Expecting nonQualifiedRule or defaultRule

            tax = this._calculateTaxByMethod(typeConfig.taxationMethod, taxableAmount, rateRule, incomeTypeName, context);
        }
        console.log(`${incomeTypeName.charAt(0).toUpperCase() + incomeTypeName.slice(1)} Tax Calculated: ${tax}`);
        return tax;
    }


    /**
     * Helper for calculating tax based on method for investment income.
     * @param {string} taxationMethod - The method string from the schema.
     * @param {number} taxableAmount - The amount subject to tax.
     * @param {object|number|array} rateSet - Rate definition (flat rate number, bracket array, or object containing rates).
     * @param {string} incomeTypeName - For logging purposes.
     * @param {object} context - Calculation context.
     * @returns {number} Calculated tax.
     */
    _calculateTaxByMethod(taxationMethod, taxableAmount, rateRule, incomeTypeName, context) {
        let tax = 0;
        // const incomeTaxBrackets = this.taxman.taxConfig.incomeTax?.filingStatusRules?.[this.taxman.filingStatus]?.taxCalculationMethod?.brackets || []; // Keep for 'asOrdinaryIncome'

        switch (taxationMethod) {
            case 'asOrdinaryIncome':
                // Calculate incremental tax by adding this income to the main taxable income
                const baseTaxableIncome = this.taxman.calculated.taxableIncome || 0;
                // Access filingStatus from currentState
                const filingStatus = this.taxman.currentState?.filingStatus;
                const incomeTaxConfig = this.taxman.taxConfig.incomeTax?.filingStatusRules?.[filingStatus]?.taxCalculationMethod;
                // console.log(`[DEBUG InvestCalc] asOrdinaryIncome: filingStatus=${filingStatus}, incomeTaxConfig.method = ${incomeTaxConfig?.method}, incomeTaxConfig.brackets exists = ${!!incomeTaxConfig?.brackets}`); // REMOVE DEBUG LOG
                if (incomeTaxConfig?.method === 'brackets' && incomeTaxConfig.brackets) {
                    const taxOnBase = this.evaluator.calculateBracketTax(incomeTaxConfig.brackets, baseTaxableIncome);
                    const taxOnBasePlusInvestment = this.evaluator.calculateBracketTax(incomeTaxConfig.brackets, baseTaxableIncome + taxableAmount);
                    tax = taxOnBasePlusInvestment - taxOnBase;
                    // console.log(`${incomeTypeName} taxed 'asOrdinaryIncome': BaseIncome=${baseTaxableIncome}, InvIncome=${taxableAmount}, TaxOnBase=${taxOnBase}, TaxOnTotal=${taxOnBasePlusInvestment}, IncrementalTax=${tax}`);
                } else if (incomeTaxConfig?.method === 'formula') {
                    // Formula case is harder to calculate incrementally, use marginal rate as fallback
                    const marginalRate = this.evaluator.getMarginalIncomeRate(baseTaxableIncome);
                    tax = taxableAmount * marginalRate;
                     console.warn(`${incomeTypeName} taxed 'asOrdinaryIncome' with formula income tax: Using marginal rate (${marginalRate}) approximation.`);
                } else {
                    // Fallback if income tax isn't bracket-based or configured
                     const marginalRate = this.evaluator.getMarginalIncomeRate(baseTaxableIncome);
                     tax = taxableAmount * marginalRate;
                     console.warn(`${incomeTypeName} taxed 'asOrdinaryIncome': Income tax config missing or not brackets. Using marginal rate (${marginalRate}) approximation.`);
                }
                break;
            case 'asCapitalGains':
                // Pass income type as asset type, assume long-term
                const cgtRateInfo = this.cgtCalculator._getRateInfoForCGT('longTerm', incomeTypeName);
                // console.log(`${incomeTypeName} taxed as Capital Gains (longTerm, type=${incomeTypeName}). Using rate info:`, cgtRateInfo);
                if (cgtRateInfo.type === 'flat') {
                    tax = taxableAmount * cgtRateInfo.rate;
                } else if (cgtRateInfo.type === 'brackets') {
                    tax = this.evaluator.calculateBracketTax(cgtRateInfo.brackets, taxableAmount);
                } else {
                     console.warn(`Unhandled CGT rate type '${cgtRateInfo.type}' for ${incomeTypeName} taxed as capital gains.`);
                }
                break;
            case 'preferentialRates':
            case 'flatRate':
                // Assume rateRule is the CalculationRule object for the applicable rate
                if (rateRule && typeof rateRule === 'object') {
                    // Calculate the rate using the provided rule and context
                    const applicableRate = this.evaluator.calculateValue(rateRule, context);
                    tax = taxableAmount * applicableRate;
                    // console.log(`${incomeTypeName} taxed via '${taxationMethod}': RateRule=${JSON.stringify(rateRule)}, CalculatedRate=${applicableRate}, Tax=${tax}`);
                } else {
                     console.warn(`Missing or invalid rateRule for ${incomeTypeName} taxation method '${taxationMethod}'. RateRule:`, rateRule);
                }
                break;
            case 'exempt':
                tax = 0;
                break;
            default:
                 console.warn(`Unknown ${incomeTypeName} taxation method: '${taxationMethod}'.`);
        }
        return tax;
    }

     // Note: _calculateAllowance and _checkQualified helpers were moved to SchemaEvaluator.js
     // Ensure SchemaEvaluator.js contains these methods.
}

// Export if needed
// export default InvestmentIncomeTaxCalculator;

// Node.js compatibility: Export class using module.exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InvestmentIncomeTaxCalculator;
}