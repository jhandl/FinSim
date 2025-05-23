// src/core/tax/TransferTaxCalculator.js

/**
 * Calculates taxes on transfers like gifts and inheritances based on schema rules.
 * Calculates taxes on transfers like gifts and inheritances based on schema rules.
 */
class TransferTaxCalculator {
    /**
     * @param {object} taxmanInstance - Reference to the main Taxman instance.
     * @param {SchemaEvaluator} schemaEvaluator - Instance of the SchemaEvaluator helper.
     */
    constructor(taxmanInstance, schemaEvaluator) {
        this.taxman = taxmanInstance;
        this.evaluator = schemaEvaluator;
        this.config = taxmanInstance.taxConfig; // Convenience reference to full config
        this.transferConfig = taxmanInstance.taxConfig.transferTax || []; // Specific config
        this.transfers = [];
        // console.log("TransferTaxCalculator initialized.");
    }

    /**
     * Resets the internal state for a new calculation cycle (e.g., new year).
     */
    reset() {
        this.transfers = [];
        // console.log("TransferTaxCalculator reset.");
    }

    /**
     * Declares a transfer event (gift or inheritance).
     * @param {object} transferDetails - Details of the transfer (e.g., type, amount, donorRelationship, date).
     */
    declareTransfer(transferDetails) {
        // TODO: Validate transferDetails against schema expectations
        // console.log("TransferTaxCalculator: Declaring transfer", transferDetails);
        this.transfers.push(transferDetails);
    }

    /**
     * Calculates the total transfer tax liability for the current period.
     * @param {object} currentState - The overall simulation state for context.
     * @returns {object} An object containing calculated transfer tax details.
     */
    calculateTransferTax(currentState) {
        // console.log("TransferTaxCalculator: Calculating transfer tax for state:", currentState);
        let totalTransferTax = 0;
        const calculationDetails = [];
        const giftsPerRecipient = {}; // Track total gifts per recipient for annual exclusion

        if (!this.transferConfig || this.transferConfig.length === 0) {
            // console.log("TransferTaxCalculator: No transfer tax rules found in config.");
            // If no rules, assume no tax, but process transfers for details array
             this.transfers.forEach(transfer => {
                calculationDetails.push({ transfer: transfer, tax: 0, taxableAmount: 0, notes: "No applicable rules found" });
            });
            return { totalTransferTax: 0, details: calculationDetails };
        }

        this.transfers.forEach(transfer => {
            const transferType = transfer.type?.toLowerCase(); // 'gift' or 'inheritance'
            const rulesForType = this.transferConfig.find(rule => rule.taxType === transferType);

            if (!rulesForType) {
                // console.log(`TransferTaxCalculator: No rules found for transfer type '${transferType}'.`);
                calculationDetails.push({ transfer: transfer, tax: 0, taxableAmount: transfer.value || 0, notes: `No rules for type ${transferType}` });
                return; // Skip to next transfer
            }

            let taxableAmount = transfer.value || 0;
            let tax = 0;
            let notes = [];
            let relationshipCategory = 'other'; // Default relationship

            // 1. Apply Gift Annual Exclusion (per recipient)
            if (transferType === 'gift') {
                relationshipCategory = transfer.relationshipToDonor || 'other';
                const recipientId = transfer.recipientId || 'defaultRecipient'; // Need recipient ID for exclusion tracking
                const annualExclusionRule = rulesForType.annualExclusionPerRecipient?.calculationRule || { method: 'fixedAmount', value: 0 };
                const exclusionContext = { ...currentState, transferType, relationshipCategory }; // Context for exclusion calc
                const annualExclusionAmount = this.evaluator.calculateValue(annualExclusionRule, exclusionContext);

                if (annualExclusionAmount > 0) {
                    const previousGiftsToRecipient = giftsPerRecipient[recipientId] || 0;
                    const totalGiftsToRecipient = previousGiftsToRecipient + transfer.value;
                    const exclusionAlreadyUsed = Math.min(previousGiftsToRecipient, annualExclusionAmount);
                    const exclusionAvailableForThisGift = Math.max(0, annualExclusionAmount - exclusionAlreadyUsed);
                    const applicableExclusion = Math.min(transfer.value, exclusionAvailableForThisGift);

                    taxableAmount = Math.max(0, transfer.value - applicableExclusion);
                    giftsPerRecipient[recipientId] = totalGiftsToRecipient; // Update total for next gift to same recipient
                    notes.push(`Applied annual exclusion: ${applicableExclusion.toFixed(2)} (Limit: ${annualExclusionAmount}, Total to ${recipientId}: ${totalGiftsToRecipient.toFixed(2)})`);
                }
            } else if (transferType === 'inheritance') {
                relationshipCategory = transfer.relationshipFromDeceased || 'other';
            }

            // 2. Find Relationship-Specific Rules
            const relationshipRule = rulesForType.exemptionsAndRatesByRelationship?.find(
                r => r.relationshipCategory === relationshipCategory
            );

            if (!relationshipRule) {
                // console.log(`TransferTaxCalculator: No relationship rule found for category '${relationshipCategory}' and type '${transferType}'.`);
                notes.push(`No specific rule for relationship ${relationshipCategory}`);
                // Decide default behavior: Assume fully taxable at a default rate? Or zero tax?
                // For now, assume zero tax if no specific relationship rule found after applying exclusion.
                tax = 0;
            } else {
                // 3. Apply Tax-Free Threshold (using CalculationRule)
                const thresholdRule = relationshipRule.taxFreeThresholdRule || { method: 'fixedAmount', value: 0 };
                const thresholdContext = { ...currentState, transferType, relationshipCategory }; // Context for threshold calc
                const threshold = this.evaluator.calculateValue(thresholdRule, thresholdContext);
                if (taxableAmount > 0 && threshold > 0) {
                    const amountOverThreshold = Math.max(0, taxableAmount - threshold);
                     notes.push(`Applied threshold: ${threshold.toFixed(2)}. Amount over threshold: ${amountOverThreshold.toFixed(2)}`);
                    taxableAmount = amountOverThreshold; // Only amount over threshold is potentially taxed by rates/brackets
                } else if (taxableAmount > 0) {
                     notes.push(`No threshold applied or threshold is 0.`);
                     taxableAmount = taxableAmount; // Keep the already calculated taxable amount (after exclusion)
                } else {
                    taxableAmount = 0; // Already below threshold or exclusion
                    notes.push(`Amount below threshold (${threshold.toFixed(2)}) or already excluded.`);
                }


                // 4. Calculate Tax based on Method
                const calcMethod = relationshipRule.taxCalculationMethod;
                if (taxableAmount > 0 && calcMethod) {
                    switch (calcMethod.method) {
                        case 'flatRate':
                            const rateRule = calcMethod.flatRateRule || { method: 'fixedAmount', value: 0 };
                            const rateContext = { ...currentState, transferType, relationshipCategory, taxableAmount }; // Context for rate calc
                            const rate = this.evaluator.calculateValue(rateRule, rateContext);
                            tax = taxableAmount * rate;
                            notes.push(`Calculated tax using flat rate: ${rate * 100}% on ${taxableAmount.toFixed(2)}`);
                            break;
                        case 'brackets':
                            tax = this.evaluator.calculateBracketTax(calcMethod.brackets || [], taxableAmount);
                            notes.push(`Calculated tax using brackets on ${taxableAmount.toFixed(2)}`);
                            break;
                        case 'exempt':
                            tax = 0;
                            taxableAmount = 0; // Entire amount is exempt
                            notes.push(`Exempt based on relationship rule.`);
                            break;
                        default:
                            notes.push(`Unknown calculation method: ${calcMethod.method}`);
                            tax = 0;
                    }
                } else if (taxableAmount <= 0) {
                     tax = 0; // No tax if taxable amount is zero or less
                }
            }

            totalTransferTax += tax;
            calculationDetails.push({
                transfer: transfer,
                tax: tax,
                taxableAmount_final: taxableAmount, // The amount tax was calculated on
                notes: notes.join('; ')
            });
        });

        // console.log(`TransferTaxCalculator: Calculated total tax: ${totalTransferTax}`);
        return {
            totalTransferTax: totalTransferTax,
            details: calculationDetails,
        };
    }
}

// Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TransferTaxCalculator;
}