// src/core/tax/IncomeTaxCalculator.js

/**
 * Calculates income tax based on the provided configuration and state.
 */
class IncomeTaxCalculator {
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
     * Calculates adjustments to gross income to arrive at AGI.
     * Updates taxman.calculated.adjustedGrossIncome and taxman.calculated.pensionContributionReliefAmount.
     */
    calculateAdjustments() {
        let agi = this.taxman.totalGrossIncome;
        // console.log(`[DEBUG SRC] calculateAdjustments START - Initial agi (from totalGrossIncome): ${agi}`);
        const adjustments = this.taxConfig.incomeTax?.incomeAdjustments || [];
        const pensionRules = this.taxConfig.pensionRules?.contributionTaxTreatment || [];
        // console.log(`Starting AGI calculation with Gross Income: ${agi}`);
        this.taxman.calculated.pensionContributionReliefAmount = 0; // Reset relief

        // Calculate Pension Contribution Relief first
        const totalPensionContribution = this.taxman.incomeSources.employment.pensionContribAmount; // TODO: Add other sources if applicable (e.g., self-employed pensions)
        if (totalPensionContribution > 0) {
            for (const rule of pensionRules) {
                // TODO: Refine planType matching based on simulator data if multiple plan types exist with different rules.
                // Assuming first matching rule applies for now.
                // Match plan type using regex from rule against plan type from state
                const planTypeRegex = rule.planTypeRegex ? new RegExp(rule.planTypeRegex) : /.*/; // Default to match anything if regex missing
                const currentPlanType = this.taxman.currentState?.pensionPlanType || ''; // Get plan type from state, default to empty string
                const planTypeMatches = planTypeRegex.test(currentPlanType);
                // console.log(`Pension Rule Check: Regex='${planTypeRegex}', StatePlanType='${currentPlanType}', Matches=${planTypeMatches}`);
                if (planTypeMatches) {
                    const context = { contributionAmount: totalPensionContribution, employmentIncome: this.taxman.incomeSources.employment.gross };
                    if ((!rule.conditions || rule.conditions.every(cond => this.evaluator.evaluateCondition(cond, context)))) {
                        let reliefAmount = 0;
                        let limitContext = { ...context, age: this.taxman.age }; // Limits might be age-based
                        // Calculate max allowed contribution/relief based on limitRule
                        const limit = this.evaluator.calculateValue(rule.limitRule || {}, limitContext);
                        const contributionToConsider = Math.min(totalPensionContribution, limit || Infinity);

                        if (rule.treatmentType === 'deduction') {
                            reliefAmount = contributionToConsider; // Relief is the allowed contribution amount
                            agi -= reliefAmount;
                            // console.log(`[DEBUG SRC] Pension adjustment: agi updated to ${agi}`); // Log update
                            this.taxman.calculated.pensionContributionReliefAmount += reliefAmount;
                            // console.log(`Applied Pension Deduction: ${reliefAmount} (Contribution: ${totalPensionContribution}, Limit: ${limit})`);
                        } else if (rule.treatmentType === 'credit') {
                            // Pension credits are handled in calculateCredits, not as AGI adjustment
                            // console.log(`Pension contribution provides a credit (handled later). Contribution: ${contributionToConsider}`);
                        }
                        // 'postTax' means no adjustment here
                        break; // Assume first matching rule applies
                    }
                }
            }
        }

        // Apply other income adjustments (non-pension)
        for (const adj of adjustments) { // Use 'adjustments' defined earlier in the function
            // Simple check to avoid double-counting pension if listed generically
            if (adj.name?.toLowerCase().includes('pension') || adj.name?.toLowerCase().includes('retirement')) continue;

            const context = { /* Base context for condition evaluation */ };
            if ((!adj.conditions || adj.conditions.every(cond => this.evaluator.evaluateCondition(cond, context)))) {
                let appliesToIncome = true;
                if (adj.applicableIncomeTypes && !adj.applicableIncomeTypes.includes('all')) {
                    appliesToIncome = adj.applicableIncomeTypes.some(type => this.taxman._getIncomeSourceGross(type) > 0);
                    // if (!appliesToIncome) console.log(`Adjustment '${adj.name}' skipped: No applicable income type found.`);
                }
                if (appliesToIncome) {
                    // calculateValue will use getBasisValue which checks the full context (state, calculated, specific context)
                    const amount = this.evaluator.calculateValue(adj.calculationRule, context);
                    // console.log(`[DEBUG SRC] Adjustment loop: Calculated amount for '${adj.name}': ${amount}`); // Log calculated value
                    if (adj.type === 'deduction' || adj.type === 'exclusion') {
                        agi -= amount;
                        // console.log(`[DEBUG SRC] Adjustment loop: agi updated to ${agi}`); // Log update
                        // console.log(`Applied adjustment '${adj.name}': -${amount}`);
                    } else { console.warn(`Unknown adjustment type '${adj.type}' for '${adj.name}'`); }
                }
            // } else { console.log(`Adjustment '${adj.name}' skipped: Conditions not met.`); }
            } // Closing brace for the outer if condition
        }
        // console.log(`[DEBUG SRC] calculateAdjustments END - Final agi before assignment: ${agi}`);
        this.taxman.calculated.adjustedGrossIncome = Math.max(0, agi);
        // console.log(`Finished AGI calculation. Adjusted Gross Income: ${this.taxman.calculated.adjustedGrossIncome}`);
    }

    /**
     * Calculates deductions and allowances to arrive at taxable income.
     * Updates taxman.calculated.taxableIncome, personalAllowanceAmount, standardDeductionAmount, itemizedDeductionAmount.
     */
    calculateDeductionsAndAllowances() {
        const statusRules = this.taxConfig.incomeTax?.filingStatusRules?.[this.taxman.filingStatus];
        if (!statusRules) { /* ... handle error ... */ return; }
        let incomeAfterAllowances = this.taxman.calculated.adjustedGrossIncome;
        // console.log(`[DEBUG SRC] calculateDeductions START - Initial incomeAfterAllowances (from AGI): ${incomeAfterAllowances}`);
        const context = { adjustedGrossIncome: this.taxman.calculated.adjustedGrossIncome };

        // 1. Personal Allowances
        let totalAllowance = 0;
        // console.log("Calculating Personal Allowances...");
        // console.log(`[DEBUG SRC] Allowances loop - Entering. Count: ${statusRules?.personalAllowances?.length}`);
        for (const allowance of statusRules.personalAllowances || []) {
            // console.log(`[DEBUG SRC] Allowances loop - Processing: ${allowance.name}`);
            if ((!allowance.conditions || allowance.conditions.every(cond => this.evaluator.evaluateCondition(cond, context)))) {
                let baseAmount = this.evaluator.calculateValue(allowance.calculationRule || { method: 'fixedAmount', value: allowance.amount }, context);
                // console.log(`[DEBUG SRC] Allowance loop: Calculated baseAmount for '${allowance.name}': ${baseAmount}`); // Log calculated value
                let phasedAmount = this.evaluator.applyPhaseOut(baseAmount, allowance.phaseOutRule, context);
                totalAllowance += phasedAmount;
                // console.log(`[DEBUG SRC] Allowance loop: totalAllowance updated to ${totalAllowance}`); // Log update
                // console.log(`Allowance '${allowance.name}': ${phasedAmount} (Base: ${baseAmount})`);
            // } else { console.log(`Allowance '${allowance.name}': Conditions not met.`); }
            } // Closing brace for the outer if condition
        }
        this.taxman.calculated.personalAllowanceAmount = totalAllowance;
        incomeAfterAllowances = Math.max(0, incomeAfterAllowances - totalAllowance);
        // console.log(`[DEBUG SRC] calculateDeductions - After Allowances: incomeAfterAllowances = ${incomeAfterAllowances}`);
        // console.log(`Total Personal Allowance: ${totalAllowance}. Income after Allowances: ${incomeAfterAllowances}`);

        // 2. Standard vs Itemized Deductions
        // console.log("Calculating Standard/Itemized Deductions...");
        let standardDeductionTotal = 0;
        // console.log(`[DEBUG SRC] Deductions loop - Entering Standard. Count: ${statusRules?.standardDeductions?.length}`);
        for (const deduction of statusRules.standardDeductions || []) {
            // console.log(`[DEBUG SRC] Deductions loop - Processing Standard: ${deduction.name}`);
             if ((!deduction.conditions || deduction.conditions.every(cond => this.evaluator.evaluateCondition(cond, context)))) {
                 const amount = this.evaluator.calculateValue(deduction.calculationRule || { method: 'fixedAmount', value: deduction.amount }, context);
                 // console.log(`[DEBUG SRC] Standard Deduction loop: Calculated amount for '${deduction.name}': ${amount}`); // Log calculated value
                 standardDeductionTotal += amount;
                 // console.log(`[DEBUG SRC] Standard Deduction loop: standardDeductionTotal updated to ${standardDeductionTotal}`); // Log update
                 // console.log(`Standard Deduction '${deduction.name}': ${amount}`);
             // } else { console.log(`Standard Deduction '${deduction.name}': Conditions not met.`); }
             } // Closing brace for the outer if condition
        }
        this.taxman.calculated.standardDeductionAmount = standardDeductionTotal;
        // console.log(`Total Standard Deduction: ${standardDeductionTotal}`);

        // Calculate Itemized Deductions
        let itemizedDeductionTotal = 0;
        let overallLimitApplies = false;
        // console.log("Calculating Itemized Deductions...");
        // console.log(`[DEBUG SRC] Deductions loop - Entering Itemized. Count: ${statusRules?.itemizedDeductions?.length}`);
        for (const item of statusRules.itemizedDeductions || []) {
            // console.log(`[DEBUG SRC] Deductions loop - Processing Itemized: ${item.name}`);
            const expenseKey = item.name; // Assumes expense keys match item names
            const itemContext = { ...context, expenseAmount: this.taxman.expenses[expenseKey] || 0 };
            // console.log(`Itemized Deduction '${item.name}': Expense Amount = ${itemContext.expenseAmount}`);
            if ((!item.conditions || item.conditions.every(cond => this.evaluator.evaluateCondition(cond, itemContext))) && itemContext.expenseAmount > 0) {
                let deductibleAmount = this.evaluator.calculateValue(item.calculationRule, itemContext);
                const limits = item.limits || {};
                // Apply limits using CalculationRule objects from the schema
                if (limits.percentageAGIFloorRule) {
                    // Calculate the floor amount (e.g., 7.5% of AGI)
                    const floorAmount = this.evaluator.calculateValue(limits.percentageAGIFloorRule, itemContext);
                    // The deductible amount is the expense *above* the floor
                    deductibleAmount = Math.max(0, itemContext.expenseAmount - floorAmount);
                    // console.log(`Applied AGI Floor Rule: Floor Amount=${floorAmount}. Deductible after floor: ${deductibleAmount}`);
                }
                if (limits.percentageAGICeilingRule) {
                    // Calculate the ceiling amount (e.g., 60% of AGI)
                    const ceilingAmount = this.evaluator.calculateValue(limits.percentageAGICeilingRule, itemContext);
                    deductibleAmount = Math.min(deductibleAmount, ceilingAmount);
                    // console.log(`Applied AGI Ceiling Rule: Ceiling Amount=${ceilingAmount}. Deductible after ceiling: ${deductibleAmount}`);
                }
                if (limits.absoluteAmountCeilingRule) {
                    // Calculate the absolute ceiling amount (e.g., $10,000)
                    const ceilingAmount = this.evaluator.calculateValue(limits.absoluteAmountCeilingRule, itemContext);
                    deductibleAmount = Math.min(deductibleAmount, ceilingAmount);
                    // console.log(`Applied Absolute Ceiling Rule: Ceiling Amount=${ceilingAmount}. Deductible after ceiling: ${deductibleAmount}`);
                }
                if (limits.overallLimitApplies) overallLimitApplies = true;
                itemizedDeductionTotal += deductibleAmount;
                // console.log(`[DEBUG SRC] Itemized Deduction loop: itemizedDeductionTotal updated to ${itemizedDeductionTotal}`); // Log update
                // console.log(`Itemized Deduction '${item.name}': Added ${deductibleAmount}`);
            // } else { console.log(`Itemized Deduction '${item.name}': Conditions not met or zero expense.`); }
            } // Closing brace for the outer if condition
        }

        // Apply overall itemized deduction limits if flagged
        if (overallLimitApplies) {
            const overallLimitResult = this.evaluator.utils.executeCustomRule('overallItemizedLimit', { itemizedTotal: itemizedDeductionTotal, agi: this.taxman.calculated.adjustedGrossIncome });
            // console.log(`[DEBUG SRC] Itemized Deduction loop: itemizedDeductionTotal updated to ${itemizedDeductionTotal}`); // Log update
            if (typeof overallLimitResult === 'number' && overallLimitResult < itemizedDeductionTotal) {
                 // console.log(`Applied Overall Itemized Deduction Limit: Reduced from ${itemizedDeductionTotal} to ${overallLimitResult}`);
                 itemizedDeductionTotal = overallLimitResult;
            } else { console.warn("Overall itemized deduction limit rule ('overallItemizedLimit') not implemented or did not apply."); }
        }
        this.taxman.calculated.itemizedDeductionAmount = itemizedDeductionTotal;
        // console.log(`Total Itemized Deductions Calculated: ${itemizedDeductionTotal}`);

        // Choose deduction
        let chosenDeduction = standardDeductionTotal;
        // console.log(`[DEBUG SRC] calculateDeductions - Before Choice: standard=${standardDeductionTotal}, itemized=${itemizedDeductionTotal}`);
        if (this.taxConfig.incomeTax?.allowChoiceBetweenStandardAndItemizedDeduction) {
            chosenDeduction = Math.max(standardDeductionTotal, itemizedDeductionTotal);
            // console.log(`Choice allowed. Chose: ${chosenDeduction === standardDeductionTotal ? 'Standard' : 'Itemized'} (${chosenDeduction})`);
        } else {
            // console.log(`[DEBUG SRC] calculateDeductions - Choice not allowed, using standard: ${chosenDeduction}`);
            // console.log(`Choice not allowed. Using Standard Deduction: ${chosenDeduction}`);
        }

        let finalTaxableIncome = Math.max(0, incomeAfterAllowances - chosenDeduction);
        // console.log(`[DEBUG SRC] calculateDeductions - Before QBI: finalTaxableIncome = ${finalTaxableIncome} (incomeAfterAllowances=${incomeAfterAllowances}, chosenDeduction=${chosenDeduction})`);

        // Placeholder for other final deductions (e.g., QBI)
        const qbiDeduction = this.evaluator.utils.executeCustomRule('qbiDeduction', { taxableIncomeBeforeQBI: finalTaxableIncome, /* other inputs */ });
        if (qbiDeduction > 0) {
             // console.log(`Applied QBI Deduction (Example): ${qbiDeduction}`);
             finalTaxableIncome = Math.max(0, finalTaxableIncome - qbiDeduction);
        }

        // console.log(`[DEBUG SRC] calculateDeductions END - Final taxableIncome before assignment: ${finalTaxableIncome}`);
        this.taxman.calculated.taxableIncome = finalTaxableIncome;
        // console.log(`Finished Deductions/Allowances. Taxable Income: ${this.taxman.calculated.taxableIncome}`);
    }

    /**
     * Calculates the gross income tax before credits.
     * Updates taxman.calculated.incomeTax.
     */
    calculateIncomeTax() {
        const statusRules = this.taxConfig.incomeTax?.filingStatusRules?.[this.taxman.filingStatus];
        if (!statusRules?.taxCalculationMethod) { /* ... handle error ... */ return; }
        // console.log("Computing Gross Income Tax...");
        const calcMethod = statusRules.taxCalculationMethod;
        const taxBaseString = calcMethod.taxBase || 'taxableIncome';
        let taxBaseValue = this.evaluator.getBasisValue(taxBaseString);
        let grossIncomeTax = 0;
        // console.log(`Using tax base '${taxBaseString}': ${taxBaseValue}`);

        // Handle Income Splitting / Family Quotient
        const incomeSplittingRule = this.taxConfig.systemSettings?.incomeSplitting;
        const familyQuotientRule = this.taxConfig.systemSettings?.familyQuotient;
        let effectiveTaxBase = taxBaseValue;
        let taxMultiplier = 1;
        let applyFqCap = false;
        let parts = 1;

        if (incomeSplittingRule?.method === 'fullSplitting' && incomeSplittingRule.appliesToStatus?.includes(this.taxman.filingStatus)) {
            effectiveTaxBase = taxBaseValue / 2; taxMultiplier = 2;
            // console.log(`Applying full income splitting: Base per person = ${effectiveTaxBase}`);
        } else if (familyQuotientRule?.partsDefinition && familyQuotientRule.appliesToStatus?.includes(this.taxman.filingStatus)) {
            parts = this._calculateFamilyQuotientParts(familyQuotientRule);
            if (parts > 0) {
                effectiveTaxBase = taxBaseValue / parts; taxMultiplier = parts; applyFqCap = true;
                // console.log(`Applying family quotient: Parts=${parts}, Base per part = ${effectiveTaxBase}`);
            } else { console.warn("Family quotient parts calculation resulted in zero or negative parts."); }
        }

        // Calculate tax on the effective base
        let taxOnBase = 0;
        if (calcMethod.method === 'brackets') {
            taxOnBase = this.evaluator.calculateBracketTax(calcMethod.brackets || [], effectiveTaxBase);
        } else if (calcMethod.method === 'formula') {
            taxOnBase = this.evaluator.utils.evaluateFormula(calcMethod.formula, { taxBase: effectiveTaxBase });
        } else { console.warn(`Unknown income tax calculation method: ${calcMethod.method}`); }

        grossIncomeTax = taxOnBase * taxMultiplier;

        // Apply family quotient cap if applicable
        if (applyFqCap && familyQuotientRule.maxBenefitPerHalfPartRule) {
            let taxWithoutQuotient = 0;
            if (calcMethod.method === 'brackets') taxWithoutQuotient = this.evaluator.calculateBracketTax(calcMethod.brackets || [], taxBaseValue);
            else if (calcMethod.method === 'formula') taxWithoutQuotient = this.evaluator.utils.evaluateFormula(calcMethod.formula, { taxBase: taxBaseValue });

            const baseParts = this.taxman.isCouple ? 2 : 1;
            const extraHalfParts = Math.max(0, (parts - baseParts) * 2);
            // Calculate the max benefit per half part using the rule
            const maxBenefitPerHalfPart = this.evaluator.calculateValue(familyQuotientRule.maxBenefitPerHalfPartRule, {});
            const maxTotalBenefit = extraHalfParts * maxBenefitPerHalfPart;
            const minTaxWithCap = Math.max(0, taxWithoutQuotient - maxTotalBenefit);

            if (grossIncomeTax < minTaxWithCap) {
                // console.log(`Applying Family Quotient Cap: Tax without FQ=${taxWithoutQuotient}, Parts=${parts}, ExtraHalfParts=${extraHalfParts}, MaxBenefitPerHalfPart=${maxBenefitPerHalfPart}, MaxTotalBenefit=${maxTotalBenefit}, MinTaxWithCap=${minTaxWithCap}. Calculated Tax=${grossIncomeTax}. Setting tax to ${minTaxWithCap}`);
                grossIncomeTax = minTaxWithCap;
            // } else { console.log(`Family Quotient Cap Check: Tax without FQ=${taxWithoutQuotient}, Max Benefit=${maxTotalBenefit}, Min Tax=${minTaxWithCap}. Calculated Tax=${grossIncomeTax}. No cap applied.`);
            }
        }

        this.taxman.calculated.incomeTax = grossIncomeTax;
        // console.log(`Finished Gross Income Tax calculation: ${grossIncomeTax}`);
    }

    /**
     * Calculates potential tax credits (refundable and non-refundable).
     * Updates taxman.calculated.totalNonRefundableCredits, totalRefundableCredits, totalCredits.
     */
    calculateCredits() {
        // console.log("Calculating Potential Tax Credits...");
        const statusRules = this.taxConfig.incomeTax?.filingStatusRules?.[this.taxman.filingStatus];
        if (!statusRules?.taxCredits?.length) { /* ... handle no credits ... */ return; }
        let totalNonRefundable = 0, totalRefundable = 0;
        const context = { adjustedGrossIncome: this.taxman.calculated.adjustedGrossIncome, dependents: this.taxman.dependents };

        for (const credit of statusRules.taxCredits || []) { // Add safety check for loop
             if ((!credit.conditions || credit.conditions.every(cond => this.evaluator.evaluateCondition(cond, context)))) {
                const ruleContext = { ...context, dependentTypeFilter: { type: 'child' } }; // Example filter
                let baseAmount = this.evaluator.calculateValue(credit.calculationRule, ruleContext);
                let phasedAmount = this.evaluator.applyPhaseOut(baseAmount, credit.phaseOutRule, context);
                // console.log(`Credit '${credit.name}': ${phasedAmount} (Base: ${baseAmount}, Type: ${credit.type})`);
                if (credit.type === 'nonRefundable') totalNonRefundable += phasedAmount;
                else if (credit.type === 'refundable') totalRefundable += phasedAmount;
                else console.warn(`Unknown credit type '${credit.type}'`);
            // } else { console.log(`Credit '${credit.name}': Conditions not met.`); }
            } // Closing brace for the outer if condition
        }
        this.taxman.calculated.totalNonRefundableCredits = totalNonRefundable;
        this.taxman.calculated.totalRefundableCredits = totalRefundable;
        this.taxman.calculated.totalCredits = totalNonRefundable + totalRefundable;
        // console.log(`Finished Credit Calculation. Potential Totals - NonRefundable: ${totalNonRefundable}, Refundable: ${totalRefundable}`);
    }

    // --- Helper Methods specific to Income Tax ---

    _calculateFamilyQuotientParts(rule) {
        let totalParts = 0;
        const adults = this.taxman.isCouple ? 2 : 1;
        rule.partsDefinition?.forEach(def => {
            if (def.person === 'firstAdult' && adults >= 1) totalParts += def.parts;
            if (def.person === 'secondAdult' && adults >= 2) totalParts += def.parts;
            if (def.person === 'child') {
                (this.taxman.dependents || []).forEach((dep, index) => {
                    if (dep.type === 'child') {
                         const minIndex = def.index?.[0] ?? 0;
                         const maxIndex = def.index?.[1] ?? Infinity;
                         if (index >= minIndex && index <= maxIndex) totalParts += def.parts;
                    }
                });
            }
        });
        return totalParts > 0 ? totalParts : 1;
    }
}

// Export if needed
// export default IncomeTaxCalculator;

// Node.js compatibility: Export class using module.exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IncomeTaxCalculator;
}