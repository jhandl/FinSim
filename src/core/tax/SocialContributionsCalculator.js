// src/core/tax/SocialContributionsCalculator.js

/**
 * Calculates social contributions based on the provided configuration and state.
 */
class SocialContributionsCalculator {
    /**
     * @param {object} taxmanInstance - Reference to the main Taxman instance.
     * @param {SchemaEvaluator} schemaEvaluator - Instance of the SchemaEvaluator helper.
     */
    constructor(taxmanInstance, schemaEvaluator) {
        this.taxman = taxmanInstance;
        this.evaluator = schemaEvaluator;
        this.taxConfig = taxmanInstance.taxConfig; // Convenience reference
    }

    /**
     * Calculates all applicable social contributions.
     * Updates taxman.calculated.socialContributions.
     */
    calculateContributions() {
        // console.log("Computing Social Contributions..."); // Commented out
        const contributions = this.taxConfig.socialContributions || [];
        this.taxman.calculated.socialContributions = {}; // Reset

        // console.log(`[DEBUG SRC] SocialContributions - Value before loop:`, contributions, `Type: ${typeof contributions}`); // Remove log
        for (const contrib of contributions) {
            let contributionAmount = 0;
            const context = { age: this.taxman.age }; // Base context

            // 1. Check Exemptions
            let isExempt = false;
            if (contrib.exemptions && contrib.exemptions.length > 0) {
                isExempt = contrib.exemptions.some(cond => this.evaluator.evaluateCondition(cond, context));
            }

            if (!isExempt) {
                // 2. Determine Relevant Income Base
                let relevantIncome = this.taxman._getIncomeByTypes(contrib.appliesToIncomeType || ['all']); // Use Taxman's helper
                console.log(`Contribution '${contrib.name}': Relevant Income Base = ${relevantIncome}`);

                // 3. Apply Thresholds (using CalculationRule)
                const lowerBound = this.evaluator.calculateValue(contrib.incomeThresholds?.lowerBoundRule || { method: 'fixedAmount', value: 0 }, context);
                const upperBound = this.evaluator.calculateValue(contrib.incomeThresholds?.upperBoundCeilingRule || { method: 'fixedAmount', value: Infinity }, context);
                // Ensure upperBound defaults to Infinity if rule is missing or calculation results in 0/null/undefined inappropriately
                const effectiveUpperBound = (upperBound === null || upperBound === undefined || upperBound === 0) ? Infinity : upperBound;

                // Determine income subject to contribution based on thresholds
                let incomeSubjectToContrib = 0;
                if (relevantIncome > lowerBound) {
                    // Use effectiveUpperBound which defaults to Infinity if rule is missing/zero
                    incomeSubjectToContrib = Math.min(relevantIncome, effectiveUpperBound) - lowerBound;
                }
                incomeSubjectToContrib = Math.max(0, incomeSubjectToContrib);
                console.log(`Contribution '${contrib.name}': Income Subject to Contribution (Marginal Slice) = ${incomeSubjectToContrib}`);

                // 4. Calculate Contribution
                let calculatedRateBasedAmount = 0;
                const calcMethod = contrib.calculationMethod;
                // Determine the base for rate application (can differ)
                let calculationBase = relevantIncome; // Default base for brackets (applied to total relevant income)
                if (calcMethod?.method === 'flatRate') {
                    calculationBase = incomeSubjectToContrib; // Base for flat rate is usually the slice above threshold
                }

                if (calcMethod && calculationBase > 0 && relevantIncome > lowerBound) {
                     switch (calcMethod.method) {
                        case 'brackets':
                            calculatedRateBasedAmount = this.evaluator.calculateBracketTax(calcMethod.brackets || [], calculationBase);
                            // Adjust if upper bound caps the tax amount on the slice
                            if (upperBound !== Infinity) {
                                const taxAtUpperBound = this.evaluator.calculateBracketTax(calcMethod.brackets || [], upperBound);
                                const taxAtLowerBound = this.evaluator.calculateBracketTax(calcMethod.brackets || [], lowerBound);
                                calculatedRateBasedAmount = Math.min(calculatedRateBasedAmount, taxAtUpperBound - taxAtLowerBound);
                            }
                            break;
                        case 'flatRate':
                            // Calculate the flat rate using the rule
                            const flatRate = this.evaluator.calculateValue(calcMethod.flatRateRule || { method: 'fixedAmount', value: 0 }, context);
                            calculatedRateBasedAmount = calculationBase * flatRate;
                            break;
                        case 'custom':
                             calculatedRateBasedAmount = this.evaluator.utils.executeCustomRule(calcMethod.customRuleIdentifier, { relevantIncome, incomeSubjectToContrib });
                             break;
                        default: console.warn(`Unknown social contribution method: ${calcMethod.method}`);
                     }
                }

                // 5. Apply Employee Rate Factor
                const employeeFactor = Number(contrib.rates?.employeeRateFactor) ?? 1.0;
                contributionAmount = calculatedRateBasedAmount * employeeFactor;
            } else {
                 console.log(`Contribution '${contrib.name}': Exempt.`);
            }

            this.taxman.calculated.socialContributions[contrib.name] = contributionAmount;
            console.log(`Calculated Social Contribution '${contrib.name}': ${contributionAmount}`);
        }
        // console.log("Finished Social Contributions calculation."); // Commented out
    }
}

// Export if needed
// export default SocialContributionsCalculator;

// Node.js compatibility: Export class using module.exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SocialContributionsCalculator;
}