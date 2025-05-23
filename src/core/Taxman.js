// src/core/Taxman.js

// No top-level declaration or loading logic for TaxmanDependencyLoader here
// to avoid conflicts with global scope in browser.

class Taxman {
    /**
     * Creates a new Taxman instance.
     * @param {object} taxConfig - The JSON object conforming to the GenericTaxSystem schema.
     * @param {object} simContext - Context from the simulator (e.g., helper functions, initial state, providing expense/asset data).
     */
    constructor(taxConfig, simContext = {}) {
        // Determine the correct Loader class (require for Node, global for Browser/GAS)
        const Loader = typeof require !== 'undefined' ? require('./TaxmanDependencyLoader') : (typeof TaxmanDependencyLoader !== 'undefined' ? TaxmanDependencyLoader : null);
        // Instantiate the loader, throwing an error if the class couldn't be determined
        const loader = Loader ? new Loader() : (() => { throw new Error("TaxmanDependencyLoader class is not available. Ensure it's loaded globally via <script> or require is supported."); })();
        if (!taxConfig || !taxConfig.schemaName || taxConfig.schemaName !== 'GenericTaxSystem') {
            throw new Error("Invalid or missing tax configuration provided to Taxman.");
        }
        this.taxConfig = taxConfig;
        this.simContext = simContext; // Keep original context if needed elsewhere
        this.utils = {
            // Use isBetween from global scope (Utils.js) or fallback
            isBetween: typeof isBetween !== 'undefined' ? isBetween : (num, min, max) => (num >= min && num <= max),
            // Use evaluateFormula from global scope (Utils.js) or fallback
            evaluateFormula: typeof evaluateFormula !== 'undefined' ? evaluateFormula : ((formula, vars) => { console.warn(`Utils.evaluateFormula not found. Formula evaluation needed for '${formula}'. No parser provided.`); return 0; }),
            // Use the internal _executeCustomRule method
            executeCustomRule: this._executeCustomRule.bind(this)
        };

        // Instantiate helpers and calculators
        // Instantiate helpers and calculators using the loader
        this.evaluator = new (loader.get('SchemaEvaluator'))(this);
        this.incomeTaxCalculator = new (loader.get('IncomeTaxCalculator'))(this, this.evaluator);
        this.socialContributionsCalculator = new (loader.get('SocialContributionsCalculator'))(this, this.evaluator);
        this.cgtCalculator = new (loader.get('CapitalGainsTaxCalculator'))(this, this.evaluator);
        this.investmentIncomeTaxCalculator = new (loader.get('InvestmentIncomeTaxCalculator'))(this, this.evaluator, this.cgtCalculator); // Pass instance
        this.wealthTaxCalculator = new (loader.get('WealthTaxCalculator'))(this, this.evaluator);
        this.propertyTaxCalculator = new (loader.get('PropertyTaxCalculator'))(this, this.evaluator);
        this.residencyRulesHandler = new (loader.get('ResidencyRulesHandler'))(this, this.evaluator); // Instantiate Residency Handler
        // Add other calculators as needed (e.g., TransferTaxCalculator for event handling)

        this.reset();
    }

    /**
     * Resets the internal state for a new calculation period (e.g., a year).
     * @param {object} currentState - Current state from the simulator.
     */
    reset(currentState = {}) {
        this.currentState = currentState;

        this.incomeSources = {
            employment: { gross: 0, pensionContribAmount: 0, count: 0 }, selfEmployment: { gross: 0 },
            investment: { dividends: 0, interest: 0, royalties: 0 }, pensions: { state: 0, private: 0, privateLumpSum: 0, privateLumpSumCount: 0 },
            rental: { gross: 0 }, other: { gross: 0 }
        };
        this.totalGrossIncome = 0;

        this.capitalGains = {
            entries: [], summary: { shortTerm: { netGain: 0, remainingLoss: 0 }, longTerm: { netGain: 0, remainingLoss: 0 } },
            lossCarryforward: { shortTerm: currentState.cgtLossCarryforward?.shortTerm || 0, longTerm: currentState.cgtLossCarryforward?.longTerm || 0 },
            currentYearLossOffsettingIncome: 0, newLossCarryforward: { shortTerm: 0, longTerm: 0 }
        };
        this.annualExemptionUsed = 0;

        this.calculated = {
            adjustedGrossIncome: 0, taxableIncome: 0, incomeTax: 0, socialContributions: {},
            capitalGainsTax: 0, investmentIncomeTax: 0, wealthTax: 0, propertyTax: {},
            transferTax: {}, totalTaxLiability: 0, standardDeductionAmount: 0, itemizedDeductionAmount: 0,
            personalAllowanceAmount: 0, totalCredits: 0, totalNonRefundableCredits: 0,
            totalRefundableCredits: 0, appliedNonRefundableCredits: 0, pensionContributionReliefAmount: 0,
        };

        this.filingStatus = currentState.filingStatus || this.taxConfig.systemSettings?.defaultFilingStatus || 'single';
        this.age = currentState.age || 0;
        this.isCouple = ['marriedJointly', 'marriedSeparately'].includes(this.filingStatus);
        this.dependents = currentState.dependents || [];
        this.residencyStatus = currentState.residencyStatus || 'resident';
        this.expenses = currentState.expenses || {};
        this.assets = currentState.assets || {};
        this.netWorth = currentState.netWorth || 0;
    }

    // --- Income/Gains Declaration Methods ---
    declareIncome(type, amount, details = {}) {
        // (Implementation remains largely the same as before, updates incomeSources)
        // console.log(`Declared Income: Type=${type}, Amount=${amount}, Details=`, details); // Commented out for CGT focus
        amount = Number(amount) || 0;
        if (amount === 0) return;
        const typeLower = type.toLowerCase();
        if (typeLower === 'employment' || typeLower === 'salary') {
            this.incomeSources.employment.gross += amount;
            if (details.pensionContribRate) {
                const contribution = amount * (Number(details.pensionContribRate) || 0);
                this.incomeSources.employment.pensionContribAmount += contribution;
            }
            this.incomeSources.employment.count++;
        } else if (typeLower === 'selfemployment' || typeLower === 'business') {
            this.incomeSources.selfEmployment.gross += amount;
        } else if (typeLower === 'dividend' || typeLower === 'dividends') {
            this.incomeSources.investment.dividends += amount;
        } else if (typeLower === 'interest') {
            this.incomeSources.investment.interest += amount;
        } else if (typeLower === 'royalties') {
            this.incomeSources.investment.royalties += amount;
        } else if (typeLower === 'statepension') {
            this.incomeSources.pensions.state += amount;
        } else if (typeLower === 'privatepension') {
            this.incomeSources.pensions.private += amount;
        } else if (typeLower === 'privatepensionlumpsum') {
            this.incomeSources.pensions.privateLumpSum += amount;
            this.incomeSources.pensions.privateLumpSumCount++;
        } else if (typeLower === 'rental' || typeLower === 'rentalincome') {
             this.incomeSources.rental.gross += amount;
        } else { this.incomeSources.other.gross += amount; }
        this._recalculateTotalGrossIncome();
    }

    // Method signature changed in Equities.js to pass a single object
    declareCapitalGainOrLoss(entry) {
        // Delegate declaration to the CGT calculator instance
        if (this.cgtCalculator) {
             // Pass the entry object directly, assuming it has the required fields
             // (amount, assetType, holdingPeriodYears/holdingPeriodLabel, costBasis, saleProceeds etc.)
             // The calculator's declareGainOrLoss will handle normalization/validation.
             this.cgtCalculator.declareGainOrLoss(entry);
        } else {
            console.error("CGT Calculator instance not found in Taxman!");
        }
        // Note: We are no longer storing entries in Taxman.capitalGains.entries directly.
        // The calculator manages its own state. If Taxman needs this data later,
        // the calculator might need to expose it or Taxman needs to store it again.
    }

    _recalculateTotalGrossIncome() {
        // (Implementation remains the same)
        this.totalGrossIncome = Object.values(this.incomeSources).reduce((sum, source) => {
            if (source && typeof source.gross === 'number') return sum + source.gross;
            if (source?.dividends !== undefined) return sum + (source.dividends || 0) + (source.interest || 0) + (source.royalties || 0);
            if (source?.state !== undefined) return sum + (source.state || 0) + (source.private || 0);
            return sum;
        }, 0);
        // console.log(`Recalculated Total Gross Income: ${this.totalGrossIncome}`); // Commented out
    }

    // --- Core Calculation Method ---
    computeTaxes(currentState) {
        // Reset should happen at the start of the year (in Simulator.resetYearlyVariables), not here.
        // Ensure currentState is updated if needed, but don't reset incomeSources.
        if (currentState) {
             this.currentState = currentState;
             // Update properties derived directly from currentState if necessary (age, filingStatus etc.)
             // These are already updated in the existing reset logic, but let's ensure they are fresh if currentState is passed here.
             this.filingStatus = currentState.filingStatus || this.taxConfig.systemSettings?.defaultFilingStatus || 'single';
             this.age = currentState.age || 0;
             this.isCouple = ['marriedJointly', 'marriedSeparately'].includes(this.filingStatus);
             this.dependents = currentState.dependents || [];
             this.residencyStatus = currentState.residencyStatus || 'resident';
             this.expenses = currentState.expenses || {};
             this.assets = currentState.assets || {};
             this.netWorth = currentState.netWorth || 0;
             // DO NOT reset this.incomeSources or this.calculated here.
        } else if (!this.currentState) {
             // Should not happen if called correctly after resetYearlyVariables and declarations
             console.error("Taxman.computeTaxes called without valid currentState after initial reset.");
             this.reset({}); // Reset to empty state as a fallback
        }
        // --- Calculation Order Matters ---
        // Delegate calculations to specialized classes
        this.incomeTaxCalculator.calculateAdjustments();
        this.incomeTaxCalculator.calculateDeductionsAndAllowances();
        this.incomeTaxCalculator.calculateIncomeTax();
        // Add debug log before Social Contributions
        console.log(`[DEBUG computeTaxes] Before Social Contributions - incomeSources:`, JSON.stringify(this.incomeSources));
        this.socialContributionsCalculator.calculateContributions();
        const cgtResult = this.cgtCalculator.calculateCapitalGainsTax();
        this.calculated.capitalGainsTax = cgtResult.taxDue;
        // Store the detailed carryforward object
        this.capitalGains.newLossCarryforward = cgtResult.details.lossCarryforwardByType || {};
        // Store potential income offset amount if needed later
        this.capitalGains.currentYearLossOffsettingIncome = cgtResult.details.lossOffsetAgainstIncome || 0;
        // Store exemption used if needed
        this.annualExemptionUsed = cgtResult.details.exemptionUsed || 0; // Assuming Taxman tracks this directly
        this.investmentIncomeTaxCalculator.calculateInvestmentTax();
        this.wealthTaxCalculator.calculateWealthTax();
        this.propertyTaxCalculator.calculatePropertyTax();
        // Transfer tax is event-driven, not called here
        this.incomeTaxCalculator.calculateCredits(); // Calculate potential credits after main taxes are known (for phaseouts etc.)
        // Apply residency rules before final liability calculation
        this.calculated = this.residencyRulesHandler.applyResidencyRules(this.calculated);

        this._calculateTotalTaxLiability(); // Final step: apply credits, final adjustments

        // console.log(`Tax Calculation Complete for Year ${this.currentState?.year || 'N/A'}. Results:`, this.calculated); // Commented out (will add specific comparison log in Simulator)
        return { ...this.calculated, newLossCarryforward: this.capitalGains.newLossCarryforward };
    }

    // --- Net Income Method ---
    netIncome() {
        // (Implementation remains the same)
        return this.totalGrossIncome - this.calculated.totalTaxLiability;
    }

    // --- Final Liability Calculation (Remains in Taxman) ---
    _calculateTotalTaxLiability() {
        // console.log("Calculating Final Tax Liability..."); // Commented out
        let grossTaxLiability = 0;
        grossTaxLiability += this.calculated.incomeTax || 0;
        grossTaxLiability += this.calculated.capitalGainsTax || 0;
        grossTaxLiability += this.calculated.investmentIncomeTax || 0;
        grossTaxLiability += this.calculated.wealthTax || 0;
        Object.values(this.calculated.socialContributions).forEach(amount => grossTaxLiability += (Number(amount) || 0));
        Object.values(this.calculated.propertyTax).forEach(amount => grossTaxLiability += (Number(amount) || 0));
        Object.values(this.calculated.transferTax).forEach(amount => grossTaxLiability += (Number(amount) || 0)); // Usually 0 here
        // console.log(`Total Gross Tax Liability (before credits): ${grossTaxLiability}`); // Commented out

        // Apply Non-Refundable Credits
        const taxToOffset = this.calculated.incomeTax || 0; // Primarily offset income tax
        const potentialNonRefundable = this.calculated.totalNonRefundableCredits || 0;
        const appliedNonRefundable = Math.min(potentialNonRefundable, Math.max(0, taxToOffset));
        this.calculated.appliedNonRefundableCredits = appliedNonRefundable;
        // console.log(`Applied Non-Refundable Credits: ${appliedNonRefundable}`); // Commented out

        let netLiability = grossTaxLiability - appliedNonRefundable;

        // Apply Refundable Credits
        const totalRefundable = this.calculated.totalRefundableCredits || 0;
        netLiability -= totalRefundable;
        // console.log(`Applied Refundable Credits: ${totalRefundable}`); // Commented out

        // Apply CGT loss offset against income tax as a final adjustment (approximation)
        if (this.capitalGains.currentYearLossOffsettingIncome > 0) {
             const taxBenefitRate = this.evaluator.getMarginalIncomeRate(); // Use evaluator's helper
             const taxBenefit = this.capitalGains.currentYearLossOffsettingIncome * taxBenefitRate;
             // console.log(`Applying CGT loss offset against income (${this.capitalGains.currentYearLossOffsettingIncome}) as final liability reduction (estimated benefit: ${taxBenefit}).`); // Commented out
             netLiability -= taxBenefit;
             // console.warn("Applying CGT loss offset against income as a final tax reduction is an approximation."); // Commented out
        }

        this.calculated.totalTaxLiability = netLiability;
        // console.log(`Finished Final Tax Liability calculation. Total Tax Liability: ${netLiability}`); // Commented out
    }

     // --- Helper to get income (used by calculators via this.taxman._getIncomeSourceGross) ---
     _getIncomeSourceGross(type) {
        switch(type) {
            case 'employment': return this.incomeSources.employment.gross || 0;
            case 'selfemployment': // Allow lowercase alias
            case 'selfEmployment': return this.incomeSources.selfEmployment?.gross || 0;
            case 'investment': return (this.incomeSources.investment.dividends || 0) + (this.incomeSources.investment.interest || 0) + (this.incomeSources.investment.royalties || 0);
            case 'pension': return (this.incomeSources.pensions.state || 0) + (this.incomeSources.pensions.private || 0);
            case 'rental': return this.incomeSources.rental.gross || 0;
            case 'other': return this.incomeSources.other.gross || 0;
            default: console.warn(`Cannot get gross for unknown income type '${type}'.`); return 0;
        }
    }
    _getIncomeByTypes(types) {
        if (!types || types.length === 0) return 0;
        if (types.includes('all')) {
             // More accurate 'all' - sum all known gross sources relevant for typical tax base
             return (this.incomeSources.employment?.gross || 0) +
                    (this.incomeSources.selfEmployment?.gross || 0) +
                    (this.incomeSources.investment?.dividends || 0) +
                    (this.incomeSources.investment?.interest || 0) +
                    (this.incomeSources.investment?.royalties || 0) +
                    (this.incomeSources.pensions?.state || 0) +
                    (this.incomeSources.pensions?.private || 0) + // Exclude lump sum from regular income base
                    (this.incomeSources.rental?.gross || 0) +
                    (this.incomeSources.other?.gross || 0);
        }
        // Sum specific types, handling category roll-ups
        console.log(`[DEBUG _getIncomeByTypes] Requested types: ${types.join(', ')}`);
        const totalSum = types.reduce((sum, type) => {
            let incomeForType = 0;
            const typeLower = type.toLowerCase(); // Normalize type
            if (typeLower === 'investment') {
                incomeForType = (this.incomeSources.investment?.dividends || 0) + (this.incomeSources.investment?.interest || 0) + (this.incomeSources.investment?.royalties || 0);
                console.log(`[DEBUG _getIncomeByTypes] Type: ${typeLower} (Roll-up) -> ${incomeForType}`);
            } else if (typeLower === 'pension' || typeLower === 'pensions') { // Allow plural
                 incomeForType = (this.incomeSources.pensions?.state || 0) + (this.incomeSources.pensions?.private || 0); // Exclude lump sum
                 console.log(`[DEBUG _getIncomeByTypes] Type: ${typeLower} (Roll-up) -> ${incomeForType}`);
            } else {
                 incomeForType = this._getIncomeSourceGross(typeLower); // Pass normalized type
                 console.log(`[DEBUG _getIncomeByTypes] Type: ${typeLower} (Direct) -> ${incomeForType}`);
            }
            return sum + incomeForType;
        }, 0);
        console.log(`[DEBUG _getIncomeByTypes] Total Sum for types [${types.join(', ')}]: ${totalSum}`);
        return totalSum;
    }

    /**
     * Internal handler for custom rules defined in the schema.
     * This acts as a dispatcher. Implement specific rule logic here.
     * @param {string} identifier - The unique identifier for the custom rule.
     * @param {object} context - The full context available at the point of execution.
     * @returns {any} The result of the custom rule (e.g., boolean for conditions, number for calculations).
     * @private
     */
    _executeCustomRule(identifier, context) {
        // console.log(`Taxman._executeCustomRule called: Identifier=${identifier}`, context); // Commented out
        // --- Add specific custom rule logic here ---
        switch (identifier) {
            case 'overallItemizedLimit':
                // Placeholder: Implement Pease limitation or similar logic if needed by a schema.
                console.warn(`Custom rule 'overallItemizedLimit' is a placeholder. Returning original total.`);
                return context?.itemizedTotal; // Return the input total, effectively no limit applied yet.
            case 'qbiDeduction':
                // Placeholder: Implement Qualified Business Income deduction logic.
                console.warn(`Custom rule 'qbiDeduction' is a placeholder. Returning 0.`);
                return 0; // Return 0 deduction for now.
            case 'hasEmploymentIncome':
                 // Check if any employment income has been declared
                 return (this.incomeSources.employment?.gross || 0) > 0;
            // Add other custom rule cases here...
            // case 'isEligibleForSpecialCredit':
            //     return context.age > 65 && context.income < 30000;
        }

        // Default fallback if no specific rule matches
        console.warn(`Execution needed for unhandled custom rule '${identifier}'. No specific handler implemented.`);
        // Return a sensible default based on expected type (often inferred from context or rule structure)
        return context?.expectedType === 'boolean' ? false : 0;
    }

    // NOTE: All calculation logic previously in _compute... methods is now delegated
    // NOTE: All schema evaluation helpers previously here are now in SchemaEvaluator
}

// Export if needed
// export default Taxman;

// Node.js compatibility: Export class using module.exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Taxman;
}