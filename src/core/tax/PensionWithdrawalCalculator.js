// src/core/tax/PensionWithdrawalCalculator.js

/**
 * Calculates taxes on pension withdrawals based on schema rules.
 * This is a placeholder implementation.
 * Note: This calculator primarily determines the *taxable amount* of a withdrawal and any *specific penalties*.
 * The taxation of the taxable amount (e.g., 'asOrdinaryIncome') is typically handled by the IncomeTaxCalculator.
 */
class PensionWithdrawalCalculator {
    /**
     * @param {object} taxmanInstance - Reference to the main Taxman instance.
     * @param {SchemaEvaluator} schemaEvaluator - Instance of the SchemaEvaluator helper.
     */
    constructor(taxmanInstance, schemaEvaluator) {
        this.taxman = taxmanInstance;
        this.evaluator = schemaEvaluator;
        this.config = taxmanInstance.taxConfig; // Convenience reference to full config
        this.pensionConfig = taxmanInstance.taxConfig.pensionRules; // Specific config
        this.withdrawals = [];
        // console.log("PensionWithdrawalCalculator initialized.");
    }

    /**
     * Resets the internal state for a new calculation cycle.
     */
    reset() {
        this.withdrawals = [];
        // console.log("PensionWithdrawalCalculator reset.");
    }

    /**
     * Declares a pension withdrawal event.
     * @param {object} withdrawalDetails - Details of the withdrawal (e.g., amount, type - regular, lump sum, early, sourcePlanType).
     */
    declareWithdrawal(withdrawalDetails) {
        // TODO: Validate withdrawalDetails against schema expectations
        // console.log("PensionWithdrawalCalculator: Declaring withdrawal", withdrawalDetails);
        this.withdrawals.push(withdrawalDetails);
    }

    /**
     * Calculates the specific taxes related to pension withdrawals for the current period.
     * Note: This might calculate specific penalties or determine the taxable portion,
     * which could then feed into the main IncomeTaxCalculator.
     * @param {object} currentState - The overall simulation state for context.
     * @returns {object} An object containing calculated pension withdrawal tax details.
     */
    calculatePensionWithdrawalTax(currentState) {
        // console.log("PensionWithdrawalCalculator: Calculating withdrawal tax for state:", currentState);
        let totalWithdrawalSpecificTax = 0;
        let totalTaxableWithdrawalAmount = 0;
        const calculationDetails = [];

        if (!this.pensionConfig?.withdrawalTaxTreatment) {
            // console.log("PensionWithdrawalCalculator: No pension withdrawal rules found in config.");
            // Default: all withdrawals are fully taxable, no specific tax
            this.withdrawals.forEach(withdrawal => {
                totalTaxableWithdrawalAmount += withdrawal.amount || 0;
                calculationDetails.push({ withdrawal: withdrawal, specificTax: 0, taxableAmount: withdrawal.amount || 0, notes: "No rules found" });
            });
            return { totalWithdrawalSpecificTax: 0, totalTaxableWithdrawalAmount, details: calculationDetails };
        }

        this.withdrawals.forEach(withdrawal => {
            const withdrawalAmount = withdrawal.amount || 0;
            const planType = withdrawal.planType || 'genericPension'; // Default plan type if not specified
            let specificTax = 0;
            let taxableAmount = withdrawalAmount; // Default to fully taxable
            let notes = [];

            // Find the first matching rule based on planTypeRegex
            const rule = this.pensionConfig.withdrawalTaxTreatment.find(r => {
                try {
                    return new RegExp(r.planTypeRegex, 'i').test(planType);
                } catch (e) {
                    // console.error(`Invalid regex in pension rule: ${r.planTypeRegex}`, e); // Keep errors for now
                    return false;
                }
            });

            if (!rule) {
                notes.push(`No matching rule found for planType '${planType}'. Defaulting to fully taxable.`);
            } else {
                notes.push(`Applying rule for planTypeRegex '${rule.planTypeRegex}'.`);
                const age = currentState.age;
                const ageContext = { ...currentState }; // Context for age rules

                // Calculate withdrawal ages using rules
                const normalMinAgeRule = rule.withdrawalAge?.normalMinAgeRule || { method: 'fixedAmount', value: 999 };
                const normalMinAge = this.evaluator.calculateValue(normalMinAgeRule, ageContext);

                const earlyMinAgeRule = rule.withdrawalAge?.earlyMinAgeRule || { method: 'fixedAmount', value: 0 };
                const earlyMinAge = this.evaluator.calculateValue(earlyMinAgeRule, ageContext);

                // Determine the effective withdrawal type based on age
                let effectiveType = withdrawal.withdrawalType?.toLowerCase() || 'normal'; // Default to normal
                if (effectiveType !== 'lumpsum' && effectiveType !== 'lumpSum') { // Lump sum ignores age rules for type determination
                     if (age < earlyMinAge) {
                         notes.push(`Age ${age} is below early withdrawal age ${earlyMinAge}. Treating as early (potentially penalized).`);
                         effectiveType = 'early'; // Force early if below minimum age
                     } else if (age < normalMinAge) {
                         notes.push(`Age ${age} is between early (${earlyMinAge}) and normal (${normalMinAge}) withdrawal age.`);
                         // Keep declared type ('early' or 'normal'), logic below handles penalty/taxation
                     } else {
                          notes.push(`Age ${age} is at or above normal withdrawal age ${normalMinAge}. Treating as normal.`);
                          effectiveType = 'normal'; // Force normal if at or above normal age
                     }
                } else {
                     effectiveType = 'lumpSum'; // Standardize casing
                     notes.push(`Processing as lump sum withdrawal.`);
                }


                // Apply taxation method based on the *effective* type
                const methodConfig = rule.taxationMethod || {};
                const ratesConfig = rule.ratesAndPenalties || {};
                let taxationMethod;

                switch (effectiveType) {
                    case 'early':
                        taxationMethod = methodConfig.earlyWithdrawal || 'asOrdinaryIncomePlusPenalty'; // Default early treatment
                        notes.push(`Effective type: early. Taxation method: ${taxationMethod}.`);
                        if (taxationMethod === 'asOrdinaryIncomePlusPenalty') {
                            // Calculate penalty rate using the rule
                            const penaltyRateRule = ratesConfig.earlyWithdrawalPenaltyRateRule || { method: 'fixedAmount', value: 0 };
                            const penaltyContext = { ...currentState, withdrawalAmount, age }; // Context for penalty calc
                            const penaltyRate = this.evaluator.calculateValue(penaltyRateRule, penaltyContext);
                            specificTax = withdrawalAmount * penaltyRate;
                            taxableAmount = withdrawalAmount; // Still fully taxable for income tax calc
                            if (specificTax > 0) notes.push(`Applied early withdrawal penalty: ${specificTax.toFixed(2)} (${penaltyRate * 100}%)`);
                        } else if (taxationMethod === 'asOrdinaryIncome') {
                             taxableAmount = withdrawalAmount;
                             notes.push(`Taxed as ordinary income (no specific penalty).`);
                        } else if (taxationMethod === 'taxFree') {
                             taxableAmount = 0;
                             notes.push(`Tax free.`);
                        }
                        // Add other early methods if needed
                        break;
                    case 'lumpSum':
                         taxationMethod = methodConfig.lumpSum || 'partialTaxFree'; // Default lump sum treatment
                         notes.push(`Effective type: lumpSum. Taxation method: ${taxationMethod}.`);
                         if (taxationMethod === 'partialTaxFree') {
                             // Calculate tax-free portion using the rule
                             const taxFreeRule = ratesConfig.lumpSumTaxFreePortionRule || { method: 'fixedAmount', value: 0 };
                             const taxFreeContext = { ...currentState, withdrawalAmount, age }; // Context for tax-free calc
                             const taxFreePortion = this.evaluator.calculateValue(taxFreeRule, taxFreeContext); // This should return the portion (e.g., 0.25)
                             taxableAmount = withdrawalAmount * (1 - taxFreePortion);
                             if (taxFreePortion > 0) notes.push(`Applied tax-free portion: ${(taxFreePortion * 100).toFixed(2)}%. Taxable amount: ${taxableAmount.toFixed(2)}`);
                         } else if (taxationMethod === 'asOrdinaryIncome') {
                              taxableAmount = withdrawalAmount;
                              notes.push(`Taxed fully as ordinary income.`);
                         } else if (taxationMethod === 'taxFree') {
                              taxableAmount = 0;
                              notes.push(`Tax free.`);
                         }
                         // Add other lump sum methods if needed
                         break;
                    case 'normal':
                    default:
                        taxationMethod = methodConfig.normalWithdrawal || 'asOrdinaryIncome'; // Default normal treatment
                        notes.push(`Effective type: normal. Taxation method: ${taxationMethod}.`);
                         if (taxationMethod === 'asOrdinaryIncome') {
                              taxableAmount = withdrawalAmount;
                              notes.push(`Taxed as ordinary income.`);
                         } else if (taxationMethod === 'taxFree') {
                              taxableAmount = 0;
                              notes.push(`Tax free.`);
                         }
                         // Add other normal methods if needed
                        break;
                }
            }

            totalWithdrawalSpecificTax += specificTax;
            totalTaxableWithdrawalAmount += taxableAmount;
            calculationDetails.push({
                withdrawal: withdrawal,
                specificTax: specificTax,
                taxableAmount: taxableAmount,
                notes: notes.join('; ')
            });
        });

        // console.log(`PensionWithdrawalCalculator: Calculated total specific tax: ${totalWithdrawalSpecificTax}, Total taxable amount: ${totalTaxableWithdrawalAmount}`);
        return {
            totalWithdrawalSpecificTax: totalWithdrawalSpecificTax,
            totalTaxableWithdrawalAmount: totalTaxableWithdrawalAmount, // To be added to income for IncomeTaxCalculator
            details: calculationDetails,
        };
    }
}

// Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PensionWithdrawalCalculator;
}