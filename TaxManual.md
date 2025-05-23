# Taxman Module Documentation (`TaxManual.md`)

This document describes the classes involved in the generic tax calculation module (`Taxman`) designed to work with tax configurations conforming to the `GenericTaxSystem` schema specified in `Design.md`.

## Overview

The `Taxman` module replaces the previous Ireland-specific `Revenue.js`. It provides a flexible, data-driven approach to calculating taxes for various jurisdictions. The core idea is to separate the orchestration and state management (`Taxman.js`) from the interpretation of schema rules (`SchemaEvaluator.js`) and the specific calculation logic for different tax types (handled by dedicated calculator classes in `src/core/tax/`).

## Core Classes

### 1. `Taxman.js`

*   **Purpose:** Acts as the main orchestrator and state manager for all tax calculations within a simulation period (typically a year). It serves as the primary interface for the `Simulator.js`.
*   **How it Works:**
    *   **Initialization (`constructor`):**
        *   Receives the specific tax configuration JSON (`taxConfig`) for the jurisdiction/year being simulated and a `simContext` object from the simulator.
        *   Validates the `taxConfig` schema name.
        *   Stores references to `taxConfig` and `simContext`.
        *   Initializes utility functions (`this.utils`), potentially including formula evaluators or custom rule handlers passed via `simContext`.
        *   Instantiates the `SchemaEvaluator` and all specific tax calculator classes (`IncomeTaxCalculator`, `CapitalGainsTaxCalculator`, etc.), passing necessary references (`this`, `evaluator`).
        *   Calls `reset()` to initialize internal state.
    *   **State Management (`reset`):**
        *   Called at the beginning of each calculation period (or on instantiation).
        *   Stores the `currentState` object received from the simulator (containing age, filing status, assets, expenses, loss carryforwards, etc.).
        *   Resets internal data structures:
            *   `incomeSources`: Object to store categorized gross income amounts received during the period.
            *   `capitalGains`: Object to store declared gain/loss entries and manage loss carryforward state.
            *   `calculated`: Object to store the results of tax calculations (AGI, taxable income, individual tax amounts, total liability, credits, etc.).
        *   Initializes period-specific state like `filingStatus`, `age`, `isCouple`, `dependents`, `residencyStatus` based on `currentState`.
    *   **Data Input (`declareIncome`, `declareCapitalGainOrLoss`):**
        *   Methods called by the `Simulator` when processing income or capital gain/loss events.
        *   They categorize the input based on `type`/`assetType` and store the relevant amounts and details in `incomeSources` or `capitalGains.entries`.
        *   `declareIncome` also calls `_recalculateTotalGrossIncome` to update the running total.
    *   **Calculation Orchestration (`computeTaxes`):**
        *   The main method called by the `Simulator` once per period after all income/gains have been declared.
        *   Resets/updates state based on the `currentState` passed in.
        *   Calls the primary calculation methods on the instantiated calculator classes in a specific, logical order (e.g., AGI -> Deductions -> Income Tax -> Other Taxes -> Credits -> Final Liability).
        *   Returns the `calculated` results object, including the `newLossCarryforward` state for the simulator to persist.
    *   **Final Liability (`_calculateTotalTaxLiability`):**
        *   Sums up the gross tax amounts calculated by the individual calculators.
        *   Applies non-refundable credits (capped by income tax liability).
        *   Applies refundable credits.
        *   Applies an approximate adjustment for CGT losses offset against ordinary income.
        *   Stores the final `totalTaxLiability`.
    *   **Net Income (`netIncome`):**
        *   Provides a simple calculation of net income (Gross Income - Total Tax Liability).
*   **Interactions:**
    *   Instantiated and called by `Simulator.js`.
    *   Receives configuration from `Config.js` (via `Simulator`).
    *   Receives state updates and event data from `Simulator.js`.
    *   Instantiates and delegates calculations to all calculator classes (`IncomeTaxCalculator`, `CapitalGainsTaxCalculator`, etc.) and `SchemaEvaluator`.
    *   Uses utility functions provided via `simContext`.
*   **Schema Reference:** Orchestrates the overall flow described in `Design.md` Section 15, Implementation Note 2.

### 2. `tax/SchemaEvaluator.js`

*   **Purpose:** Provides reusable methods for interpreting and evaluating the common data structures defined in the `GenericTaxSystem` schema (`Design.md` Section 4). It centralizes the logic for handling conditions, calculations, brackets, and phase-outs.
*   **How it Works:**
    *   **Initialization (`constructor`):** Receives and stores a reference to the main `Taxman` instance to access its state (`currentState`, `calculated`, `incomeSources`), configuration (`taxConfig`), and utilities (`utils`).
    *   **`evaluateCondition(rule, context)`:** Takes a `ConditionalRule` object and evaluates it based on the `conditionType`, `operator`, and `value`, using data from the combined context (specific context + calculated state + current state). Handles `'custom'` conditions by delegating to `utils.executeCustomRule`.
    *   **`calculateValue(rule, context)`:** Takes a `CalculationRule` object and calculates a value based on the `method` ('fixedAmount', 'percentage', 'perDependent', 'formula', 'lookup', 'custom'). Uses `getBasisValue` for percentage calculations, `countDependents` for per-dependent, and delegates 'formula' and 'custom' methods to `utils.evaluateFormula` and `utils.executeCustomRule`. Applies `minValue` and `maxValue` caps.
    *   **`applyPhaseOut(baseAmount, rule, context)`:** Takes a base amount and a `PhaseOutRule` object. Calculates the reduction based on the `taperRate` applied to the amount by which the `basedOn` value exceeds the `threshold`. Returns the base amount less the reduction, respecting the `floor`.
    *   **`calculateBracketTax(brackets, taxableAmount)`:** Takes an array of `TaxBracket` objects and calculates the total tax by applying the respective rates to the portions of the `taxableAmount` falling into each bracket's range (lowerBound to upperBound). Handles marginal application correctly.
    *   **`getBasisValue(basis, context)`:** Resolves a basis string (e.g., 'adjustedGrossIncome', 'employment.gross') to its numerical value by checking the specific context, then `taxman.calculated`, then `taxman.currentState`, then `taxman.incomeSources`.
    *   **`countDependents(filter)`:** Counts dependents in `taxman.dependents` matching optional filter criteria (type, minAge, maxAge).
    *   **`getMarginalIncomeRate(incomeLevel)`:** Determines the income tax rate applicable at a given income level based on the configured brackets.
*   **Interactions:**
    *   Instantiated by `Taxman`.
    *   Called by all calculator classes to interpret schema rules.
    *   Accesses state and configuration via its stored `taxman` reference.
    *   Uses `utils` (from `Taxman`) for formula/custom rule evaluation.
*   **Schema Reference:** Directly implements the logic for evaluating structures in `Design.md` Section 4 (`TaxBracket`, `ConditionalRule`, `PhaseOutRule`, `CalculationRule`).

### 3. `tax/IncomeTaxCalculator.js`

*   **Purpose:** Calculates ordinary income tax, including adjustments, deductions, allowances, the tax itself, and credits.
*   **How it Works:**
    *   **`calculateAdjustments()`:** Calculates Adjusted Gross Income (AGI) by starting with `totalGrossIncome` and applying rules from `taxConfig.incomeTax.incomeAdjustments` and relevant `taxConfig.pensionRules.contributionTaxTreatment` (for deductions). Uses `SchemaEvaluator` to check conditions and calculate amounts. Updates `taxman.calculated.adjustedGrossIncome` and `taxman.calculated.pensionContributionReliefAmount`.
    *   **`calculateDeductionsAndAllowances()`:** Calculates Taxable Income. Starts with AGI, subtracts `personalAllowances`, then calculates and compares `standardDeductions` vs. `itemizedDeductions` (if choice allowed), subtracting the larger. Uses `SchemaEvaluator` extensively for conditions, phase-outs, and calculation rules (including itemized deduction limits). Handles overall itemized limits and QBI deduction via delegation to custom rules. Updates `taxman.calculated.taxableIncome` and related deduction/allowance amounts.
    *   **`calculateIncomeTax()`:** Calculates the gross income tax liability before credits. Applies `incomeSplitting` or `familyQuotient` logic if configured in `systemSettings`. Calculates tax on the (potentially adjusted) `taxBase` using the `taxCalculationMethod` (brackets or formula via `SchemaEvaluator`). Updates `taxman.calculated.incomeTax`.
    *   **`calculateCredits()`:** Calculates the *potential* value of refundable and non-refundable tax credits based on `taxConfig.incomeTax.filingStatusRules.taxCredits`. Uses `SchemaEvaluator` for conditions, calculations, and phase-outs. Updates `taxman.calculated.totalNonRefundableCredits` and `taxman.calculated.totalRefundableCredits`. (Actual application happens in `Taxman._calculateTotalTaxLiability`).
*   **Interactions:**
    *   Instantiated by `Taxman`.
    *   Called by `Taxman.computeTaxes`.
    *   Uses `SchemaEvaluator` for rule interpretation.
    *   Reads state from `taxman.currentState`, `taxman.calculated` (e.g., AGI), `taxman.incomeSources`, `taxman.expenses`.
    *   Writes results to `taxman.calculated`.
*   **Schema Reference:** Implements logic defined in `Design.md` Section 6 (`incomeTax`, `FilingStatusSpecificRules`) and relevant parts of Section 5 (`systemSettings` for splitting/quotient) and Section 13 (`pensionRules` for contribution treatment).

### 4. `tax/SocialContributionsCalculator.js`

*   **Purpose:** Calculates mandatory social insurance contributions (e.g., Social Security, Medicare, PRSI, USC).
*   **How it Works:**
    *   **`calculateContributions()`:** Iterates through each contribution defined in `taxConfig.socialContributions`.
        *   Checks `exemptions` using `SchemaEvaluator`.
        *   Determines the `relevantIncome` base by summing income from sources listed in `appliesToIncomeType` (using `Taxman._getIncomeByTypes`).
        *   Applies `incomeThresholds` (lowerBound, upperBoundCeiling) to determine the income slice subject to tax/contribution.
        *   Calculates the contribution amount using the specified `calculationMethod` ('brackets', 'flatRate', 'custom') via `SchemaEvaluator`. Handles nuances of applying brackets/rates to the relevant income vs. the marginal slice based on interpretation.
        *   Applies the `employeeRateFactor`.
        *   Stores the result in `taxman.calculated.socialContributions` keyed by the contribution name.
*   **Interactions:**
    *   Instantiated by `Taxman`.
    *   Called by `Taxman.computeTaxes`.
    *   Uses `SchemaEvaluator`.
    *   Reads state from `taxman.currentState` (age), `taxman.incomeSources`.
    *   Writes results to `taxman.calculated.socialContributions`.
*   **Schema Reference:** Implements logic defined in `Design.md` Section 7 (`socialContributions`).

### 5. `tax/CapitalGainsTaxCalculator.js`

*   **Purpose:** Calculates Capital Gains Tax (CGT).
*   **How it Works:**
    *   **`calculateCGT()`:**
        *   Categorizes declared gains/losses (`taxman.capitalGains.entries`) into `shortTerm` and `longTerm` totals. Adds `lossCarryforward`.
        *   Applies loss offsetting rules (within period, across periods) based on `lossTreatment.offsetGains`.
        *   Applies the `annualExemption` using `SchemaEvaluator`.
        *   Calculates potential loss offset against ordinary income based on `lossTreatment.offsetOrdinaryIncomeLimit` and updates `taxman.capitalGains.currentYearLossOffsettingIncome`.
        *   Calculates `newLossCarryforward` based on remaining losses.
        *   Calculates tax on remaining net gains (`shortTerm`, `longTerm`) by determining the applicable rate/method using the `_getRateInfoForCGT` helper (which considers `taxationMethod`, `ratesByAssetAndHolding`, and potentially income integration). Uses `SchemaEvaluator` for bracket calculations.
        *   Updates `taxman.calculated.capitalGainsTax`.
    *   **`_getRateInfoForCGT()`:** Helper to determine the correct tax rate or bracket set based on holding period, asset type (basic implementation), and the main `taxationMethod`. Handles `integratedWithIncome` as a placeholder.
*   **Interactions:**
    *   Instantiated by `Taxman`.
    *   Called by `Taxman.computeTaxes`.
    *   Uses `SchemaEvaluator`.
    *   Reads state from `taxman.capitalGains` (entries, carryforward), `taxman.calculated` (AGI, taxableIncome for integrated rates).
    *   Writes results to `taxman.calculated.capitalGainsTax`, `taxman.annualExemptionUsed`, `taxman.capitalGains.currentYearLossOffsettingIncome`, `taxman.capitalGains.newLossCarryforward`.
*   **Schema Reference:** Implements logic defined in `Design.md` Section 8 (`capitalGainsTax`).

### 6. `tax/InvestmentIncomeTaxCalculator.js`

*   **Purpose:** Calculates taxes specifically on investment income types like dividends, interest, and royalties, where they might be treated differently from ordinary income or capital gains.
*   **How it Works:**
    *   **`calculateInvestmentTax()`:** Iterates through configured sections (dividends, interest, royalties). If income exists for that type, calls `_calculateSingleInvestmentIncome`. Sums results. Updates `taxman.calculated.investmentIncomeTax`.
    *   **`_calculateSingleInvestmentIncome()`:** Calculates tax for one income type. Applies allowances using `SchemaEvaluator._calculateAllowance`. Determines qualified status for dividends using `SchemaEvaluator._checkQualified`. Calls `_calculateTaxByMethod` on the taxable amount.
    *   **`_calculateTaxByMethod()`:** Determines the tax based on the `taxationMethod` ('asOrdinaryIncome', 'asCapitalGains', 'preferentialRates', 'flatRate', 'exempt'). Uses `SchemaEvaluator` for bracket calculations, `CapitalGainsTaxCalculator._getRateInfoForCGT` for 'asCapitalGains', and approximates 'asOrdinaryIncome' using the marginal income rate.
*   **Interactions:**
    *   Instantiated by `Taxman`.
    *   Called by `Taxman.computeTaxes`.
    *   Uses `SchemaEvaluator`.
    *   Uses `CapitalGainsTaxCalculator` (passed during instantiation) for 'asCapitalGains' rates.
    *   Reads state from `taxman.incomeSources.investment`, `taxman.calculated` (AGI, taxableIncome for context).
    *   Writes result to `taxman.calculated.investmentIncomeTax`.
*   **Schema Reference:** Implements logic defined in `Design.md` Section 9 (`investmentIncomeTax`).

### 7. `tax/WealthTaxCalculator.js`

*   **Purpose:** Calculates annual wealth tax, if applicable.
*   **How it Works:**
    *   **`calculateWealthTax()`:**
        *   Checks if wealth tax `applies` in the config.
        *   Determines the `wealthBase` by summing values of relevant `assets` (filtering by `includedAssetTypes`/`excludedAssetTypes`) and potentially subtracting `liabilities` based on `baseDefinition`. Requires asset/liability data from `taxman.currentState`.
        *   Applies the `exemptionThreshold` using `SchemaEvaluator._calculateAllowance`.
        *   Calculates tax on the `taxableWealth` using the `taxCalculationMethod` (brackets or flat rate via `SchemaEvaluator`).
        *   Applies the `liabilityCapRule` if configured, limiting wealth tax based on a percentage of income and already calculated income tax.
        *   Updates `taxman.calculated.wealthTax`.
*   **Interactions:**
    *   Instantiated by `Taxman`.
    *   Called by `Taxman.computeTaxes`.
    *   Uses `SchemaEvaluator`.
    *   Reads state from `taxman.currentState` (assets, liabilities, netWorth), `taxman.calculated` (AGI, incomeTax for cap).
    *   Writes result to `taxman.calculated.wealthTax`.
*   **Schema Reference:** Implements logic defined in `Design.md` Section 10 (`wealthTax`).

### 8. `tax/PropertyTaxCalculator.js`

*   **Purpose:** Calculates taxes on owned real estate based on potentially multiple jurisdictional rules (local, regional, etc.).
*   **How it Works:**
    *   **`calculatePropertyTax()`:**
        *   Iterates through assets in `taxman.assets` identified as real estate.
        *   For each property, iterates through rules in `taxConfig.propertyTax`.
        *   Checks if a rule `appliesToPropertyType` (and potentially location).
        *   Determines the `taxBasis` (assessed, market, cadastral, fixed) using property data from `taxman.currentState.assets` and applies `assessmentRatio`.
        *   Applies `valueReduction` or `fullExemption` types from `exemptions` using `SchemaEvaluator`.
        *   If not fully exempt, calculates the applicable `rate` based on `rateDefinition` (mill, percentage, fixed) and applies `rateReduction` exemptions.
        *   Calculates tax for the rule (`basisAfterExemptions * rate`).
        *   Accumulates tax per rule key (description or level) in `taxman.calculated.propertyTax`.
*   **Interactions:**
    *   Instantiated by `Taxman`.
    *   Called by `Taxman.computeTaxes`.
    *   Uses `SchemaEvaluator`.
    *   Reads state from `taxman.currentState.assets`.
    *   Writes results to `taxman.calculated.propertyTax`.
*   **Schema Reference:** Implements logic defined in `Design.md` Section 11 (`propertyTax`).

---

This structure provides a modular and extensible way to handle the complexities of different tax systems based on the `Design.md` specification. Further work involves integrating this module fully with the simulator state and event flow, and implementing handlers for custom rules and formulas as detailed in `FurtherWork.md`.