// src/core/tax/SchemaEvaluator.js

/**
 * Helper class to evaluate common structures defined in the GenericTaxSystem schema.
 */
class SchemaEvaluator {
    /**
     * @param {object} taxmanInstance - Reference to the main Taxman instance to access state (currentState, calculated, incomeSources, etc.) and config.
     */
    constructor(taxmanInstance) {
        this.taxman = taxmanInstance; // Store reference to access Taxman's state and config
        this.utils = taxmanInstance.utils; // Access utils like formula evaluator
    }

    /**
     * Evaluates a ConditionalRule object against the current state.
     * @param {object} rule - The ConditionalRule object from the schema.
     * @param {object} context - Additional context specific to the evaluation point.
     * @returns {boolean} True if the condition is met, false otherwise.
     */
    evaluateCondition(rule, context = {}) {
        // Validate rule structure, but allow custom conditions to omit operator/value
        if (!rule?.conditionType || (rule.conditionType !== 'custom' && (!rule.operator || rule.value === undefined))) {
            console.warn("Invalid or incomplete ConditionalRule:", rule);
            return rule.conditionType === 'custom' ? false : true; // Fail custom if incomplete, default others (risky?)
        }
        let subjectValue;
        // Combine all available context: specific context > calculated values > current state
        const fullContext = { ...this.taxman.currentState, ...this.taxman.calculated, ...context };
        try {
            switch (rule.conditionType) {
                case 'age': subjectValue = this.taxman.age; break;
                case 'income': subjectValue = fullContext.income ?? fullContext.adjustedGrossIncome; break; // Default to AGI if 'income' not in specific context
                case 'residencyStatus': subjectValue = this.taxman.residencyStatus; break;
                case 'filingStatus': subjectValue = this.taxman.filingStatus; break;
                case 'familySize': subjectValue = 1 + (this.taxman.isCouple ? 1 : 0) + (this.taxman.dependents?.length || 0); break;
                case 'assetType': subjectValue = fullContext.assetType; break; // Must be in context
                case 'holdingPeriodMonths': subjectValue = fullContext.holdingPeriodMonths; break; // Must be in context
                case 'relationship': subjectValue = fullContext.relationship; break; // Must be in context
                case 'custom':
                    // Delegate to custom rule handler provided via Taxman's utils
                    return this.utils.executeCustomRule(rule.customRuleIdentifier, { ...fullContext, expectedType: 'boolean' });
                default:
                    // Allow checking against any property in the combined context
                    if (fullContext.hasOwnProperty(rule.conditionType)) {
                        subjectValue = fullContext[rule.conditionType];
                    } else {
                        // console.warn(`Unknown conditionType in condition: ${rule.conditionType}`);
                        return false;
                    }
            }

            const compareValue = rule.value;
            // Perform comparison
            switch (rule.operator) {
                case '==': return subjectValue == compareValue;
                case '!=': return subjectValue != compareValue;
                case '>': return subjectValue > Number(compareValue);
                case '>=': return subjectValue >= Number(compareValue);
                case '<': return subjectValue < Number(compareValue);
                case '<=': return subjectValue <= Number(compareValue);
                case 'in': return Array.isArray(compareValue) && compareValue.map(String).includes(String(subjectValue));
                case 'notIn': return Array.isArray(compareValue) && !compareValue.map(String).includes(String(subjectValue));
                default: // console.warn(`Unknown operator in condition: ${rule.operator}`);
                         return false;
            }
        } catch (e) { console.error(`Error evaluating condition: ${e}`, { rule, subjectValue, context: fullContext }); return false; }
    }

    /**
     * Calculates the value based on a CalculationRule object.
     * @param {object} rule - The CalculationRule object from the schema.
     * @param {object} context - Additional context specific to the calculation.
     * @returns {number} The calculated value.
     */
    calculateValue(rule, context = {}) {
         if (!rule?.method) { /* console.warn("Invalid CalculationRule:", rule); */ return 0; }
        let calculatedValue = 0;
        const fullContext = { ...this.taxman.currentState, ...this.taxman.calculated, ...context };
        try {
            switch (rule.method) {
                case 'fixedAmount': calculatedValue = Number(rule.value) || 0; break;
                case 'percentage': calculatedValue = this.getBasisValue(rule.basis, fullContext) * (Number(rule.value) || 0); break;
                case 'perDependent': calculatedValue = this.countDependents(rule.dependentTypeFilter) * (Number(rule.amountPerDependent) || 0); break;
                case 'formula': calculatedValue = this.utils.evaluateFormula(rule.formula, fullContext); break;
                case 'lookup':
                     const lookupKey = fullContext.lookupKey ?? this.getBasisValue(rule.basis, fullContext); // Use basis as key if lookupKey not provided
                     const entry = rule.lookupTable?.find(item => item.key == lookupKey);
                     calculatedValue = Number(entry?.value) || 0;
                     if (!entry) { /* console.warn(`Lookup failed for key '${lookupKey}' in rule:`, rule); */ }
                     break;
                case 'custom': calculatedValue = this.utils.executeCustomRule(rule.customRuleIdentifier, fullContext); break;
                case 'brackets':
                    // Calculate value based on applying brackets to a basis amount
                    const basisAmount = this.getBasisValue(rule.basis, fullContext);
                    calculatedValue = this.calculateBracketTax(rule.brackets, basisAmount);
                    break;
                default: // console.warn(`Unknown calculation method: ${rule.method}`);
            }
        } catch (e) { console.error(`Error calculating value: ${e}`, { rule, context: fullContext }); calculatedValue = 0; }
        // Apply min/max caps
        if (rule.maxValue !== undefined && rule.maxValue !== null) calculatedValue = Math.min(calculatedValue, Number(rule.maxValue));
        if (rule.minValue !== undefined && rule.minValue !== null) calculatedValue = Math.max(calculatedValue, Number(rule.minValue));
        return calculatedValue;
    }

    /**
     * Calculates the value of an allowance, handling fixed amounts, amounts by income bracket, conditions, and phase-outs.
     * @param {object} allowanceRule - The allowance rule object from the schema (e.g., incomeTax.personalAllowances[0], investmentIncomeTax.dividends.allowance).
     * @param {object} context - Additional context specific to the calculation.
     * @returns {number} The calculated allowance amount.
     */
    _calculateAllowance(allowanceRule, context = {}) {
        if (!allowanceRule) return 0;

        // 1. Check conditions
        if (allowanceRule.conditions && Array.isArray(allowanceRule.conditions)) {
            if (!allowanceRule.conditions.every(cond => this.evaluateCondition(cond, context))) {
                return 0; // Condition not met
            }
        }

        // 2. Determine base amount (Prioritize CalculationRule for generality)
        let baseAmount = 0;
        if (allowanceRule.calculationRule) {
             // Preferred method: Use generic CalculationRule
             baseAmount = this.calculateValue(allowanceRule.calculationRule, context);
        } else if (allowanceRule.amount !== undefined) {
             // Fallback: Fixed amount
             baseAmount = Number(allowanceRule.amount) || 0;
        } else if (allowanceRule.amountByIncomeBracket && Array.isArray(allowanceRule.amountByIncomeBracket)) {
             // Deprecated: Handle old 'amountByIncomeBracket' structure with a warning
             console.warn(`Schema Warning: 'amountByIncomeBracket' is deprecated for allowance '${allowanceRule.name || JSON.stringify(allowanceRule)}'. Use 'calculationRule' with method 'lookup' or 'brackets' instead. Returning 0 for now.`);
             // Returning 0 encourages schema migration. If necessary, the old logic could be temporarily kept here behind the warning.
             baseAmount = 0;
        }
         // console.log(`Allowance base amount for ${allowanceRule.name || 'allowance'}: ${baseAmount}`);


        // 3. Apply phase-out if defined
        if (allowanceRule.phaseOutRule) {
            baseAmount = this.applyPhaseOut(baseAmount, allowanceRule.phaseOutRule, context);
        }

        return baseAmount;
    }

    /**
     * Applies a PhaseOutRule to a base benefit amount.
     * @param {number} baseAmount - The initial amount of the benefit.
     * @param {object} rule - The PhaseOutRule object from the schema.
     * @param {object} context - Additional context specific to the calculation.
     * @returns {number} The benefit amount after applying the phase-out.
     */
    applyPhaseOut(baseAmount, rule, context = {}) {
        // Check if the necessary rule components (defined as CalculationRule objects) exist
        if (!rule?.basedOn || !rule.thresholdRule || !rule.taperRateRule) {
             // console.warn("Incomplete PhaseOutRule definition:", rule);
             return baseAmount; // Cannot apply phase-out without essential rules
        }
        const fullContext = { ...this.taxman.currentState, ...this.taxman.calculated, ...context };

        // Calculate threshold, taper rate, and floor using the generalized calculateValue
        const threshold = this.calculateValue(rule.thresholdRule, fullContext);
        const taperRate = this.calculateValue(rule.taperRateRule, fullContext);
        // Floor is optional, default to 0 if not defined or calculation fails
        const floor = rule.floorRule ? this.calculateValue(rule.floorRule, fullContext) : 0;

        // Get the value the phase-out is based on
        const phaseOutBasisValue = this.getBasisValue(rule.basedOn, fullContext);

        // Calculate reduction
        let reduction = 0;
        if (phaseOutBasisValue > threshold && taperRate > 0) {
            reduction = (phaseOutBasisValue - threshold) * taperRate;
        }
        reduction = Math.max(0, reduction); // Reduction cannot be negative

        // Apply reduction and floor
        const phasedAmount = Math.max(baseAmount - reduction, floor);

        // Optional logging for debugging
        if (phasedAmount < baseAmount) {
            console.log(`Phase-out applied to ${rule.description || 'benefit'}: Base=${baseAmount}, Basis (${rule.basedOn})=${phaseOutBasisValue}, Threshold=${threshold}, TaperRate=${taperRate}, Reduction=${reduction}, Floor=${floor}, Final=${phasedAmount}`);
        }
        return phasedAmount;
    }

    /**
     * Calculates tax based on a set of tax brackets.
     * @param {Array<object>} brackets - Array of TaxBracket objects from the schema.
     * @param {number} taxableAmount - The amount subject to tax.
     * @returns {number} The calculated tax.
     */
    calculateBracketTax(brackets, taxableAmount) {
        if (!Array.isArray(brackets) || brackets.length === 0 || taxableAmount <= 0) return 0;
        let totalTax = 0;
        let amountAlreadyTaxed = 0;
        // Ensure brackets are sorted by lowerBound
        const sortedBrackets = [...brackets].sort((a, b) => (Number(a.lowerBound) || 0) - (Number(b.lowerBound) || 0));
        for (const bracket of sortedBrackets) {
            const lowerBound = Number(bracket.lowerBound) || 0;
            const upperBound = bracket.upperBound ?? Infinity; // Use Infinity if null or undefined
            const rate = Number(bracket.rate) || 0;
            const effectiveLowerBound = Math.max(lowerBound, amountAlreadyTaxed); // Start taxing from where the last bracket left off, or the bracket's start
            if (taxableAmount <= effectiveLowerBound) continue; // Amount is below the range this bracket covers in this iteration
            const amountInBracket = Math.min(taxableAmount, upperBound) - effectiveLowerBound;
            if (amountInBracket <= 0) continue; // No portion of the remaining amount falls into this specific bracket range
            totalTax += amountInBracket * rate;
            amountAlreadyTaxed += amountInBracket;
            if (taxableAmount <= amountAlreadyTaxed) break; // Optimization: stop if entire amount is taxed
        }
        return totalTax;
    }

    /**
     * Helper to get the value for a given basis string (e.g., 'grossIncome', 'adjustedGrossIncome').
     * @param {string} basis - The basis string from the schema.
     * @param {object} context - Combined context (currentState, calculated, specific context).
     * @returns {number} The value of the basis.
     */
    getBasisValue(basis, context = {}) {
        if (!basis) return 0;
        try {
            // Check context levels: specific context > calculated > currentState > incomeSources
            if (context.hasOwnProperty(basis)) return context[basis];
            if (this.taxman.calculated.hasOwnProperty(basis)) return this.taxman.calculated[basis];
            if (this.taxman.currentState?.hasOwnProperty(basis)) return this.taxman.currentState[basis];
            if (this.taxman.incomeSources.hasOwnProperty(basis)) {
                 const source = this.taxman.incomeSources[basis];
                 if (typeof source === 'number') return source;
                 if (typeof source?.gross === 'number') return source.gross;
                 // Handle nested structures explicitly if needed (e.g., investment income sum)
                 if (basis === 'investmentIncomeTotal') return (source.dividends || 0) + (source.interest || 0) + (source.royalties || 0);
                 if (basis === 'pensionIncomeTotal') return (source.state || 0) + (source.private || 0);
            }
            // Check nested properties e.g., employment.gross
            // Handle dot notation for nested properties (e.g., 'incomeSources.employment.gross', 'currentState.someProp')
            if (basis.includes('.')) {
                const parts = basis.split('.');
                let baseObject;
                // Determine the starting object based on the first part
                if (this.taxman.currentState?.hasOwnProperty(parts[0])) {
                    baseObject = this.taxman.currentState;
                } else if (this.taxman.calculated?.hasOwnProperty(parts[0])) {
                    baseObject = this.taxman.calculated;
                } else if (this.taxman.incomeSources?.hasOwnProperty(parts[0])) {
                    baseObject = this.taxman.incomeSources;
                } else if (this.taxman.hasOwnProperty(parts[0])) {
                     // Fallback to direct property on taxman instance (less common)
                     baseObject = this.taxman;
                }

                if (baseObject) {
                    let value = baseObject;
                    for (const part of parts) {
                        if (value && typeof value === 'object' && value.hasOwnProperty(part)) {
                            value = value[part];
                        } else {
                            value = undefined;
                            break;
                        }
                    }
                    if (value !== undefined) return value;
                }
            }
            // console.warn(`Unknown or unavailable basis string: ${basis}`);
            return 0;
        } catch (e) { console.error(`Error getting basis value for '${basis}': ${e}`, { context }); return 0; }
    }

     /**
      * Helper to count dependents based on criteria.
      * @param {object} filter - Optional filter criteria (e.g., { type: 'child', maxAge: 18 }).
      * @returns {number} Count of matching dependents.
      */
     countDependents(filter = {}) {
         if (!this.taxman.dependents?.length) return 0;
         return this.taxman.dependents.filter(dep => {
             let match = true;
             if (filter?.type && dep.type !== filter.type) match = false;
             if (filter?.minAge && dep.age < filter.minAge) match = false;
             if (filter?.maxAge && dep.age > filter.maxAge) match = false;
             // Add other potential filter properties from dependent object if needed
             return match;
         }).length;
     }

     /**
      * Helper to get marginal income tax rate for a given income level.
      * @param {number} incomeLevel - The income level to check (defaults to calculated taxableIncome).
      * @returns {number} The marginal rate.
      */
     getMarginalIncomeRate(incomeLevel = this.taxman.calculated.taxableIncome) {
          const brackets = this.taxman.taxConfig.incomeTax?.filingStatusRules?.[this.taxman.filingStatus]?.taxCalculationMethod?.brackets || [];
          if (!brackets.length) return 0;
          const sortedBrackets = [...brackets].sort((a, b) => (Number(a.lowerBound) || 0) - (Number(b.lowerBound) || 0));
          let marginalRate = 0;
          for (const bracket of sortedBrackets) {
               const lower = Number(bracket.lowerBound) || 0;
               const upper = bracket.upperBound ?? Infinity;
               marginalRate = Number(bracket.rate) || 0; // Rate of the current bracket
               if (incomeLevel < upper) break; // Found the bracket the income falls into
          }
          return marginalRate;
     }

     /**
      * Helper to get the label of the income tax bracket for a given income level.
      * Assumes brackets in the config might have a 'label' property.
      * @param {number} incomeLevel - The income level to check.
      * @param {string} incomeBasis - The type of income level provided (e.g., 'taxableIncome', 'adjustedGrossIncome'). Used for context if needed.
      * @returns {string|null} The label of the matching bracket, or null if not found or labels aren't defined.
      */
     getIncomeBracketLabel(incomeLevel, incomeBasis = 'taxableIncome') {
         const brackets = this.taxman.taxConfig.incomeTax?.filingStatusRules?.[this.taxman.filingStatus]?.taxCalculationMethod?.brackets || [];
         if (!brackets.length) return null;
         const sortedBrackets = [...brackets].sort((a, b) => (Number(a.lowerBound) || 0) - (Number(b.lowerBound) || 0));
         let bracketLabel = null;
         for (const bracket of sortedBrackets) {
              const lower = Number(bracket.lowerBound) || 0;
              const upper = bracket.upperBound ?? Infinity;
              // Use the label of the first bracket the income level falls into or exceeds its lower bound
              if (incomeLevel >= lower) {
                   bracketLabel = bracket.label ?? null; // Use label if present
              }
              if (incomeLevel < upper) break; // Stop once the income is within a bracket's upper bound
         }
         // If income exceeds the top bracket, return the top bracket's label
         if (incomeLevel >= (sortedBrackets[sortedBrackets.length - 1].upperBound ?? Infinity)) {
              bracketLabel = sortedBrackets[sortedBrackets.length - 1].label ?? null;
         }
         return bracketLabel;
     }
}

// Export if needed (depends on how Taxman.js imports it)
// export default SchemaEvaluator;

// Node.js compatibility: Export class using module.exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SchemaEvaluator;
}