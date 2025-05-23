# Further Work for Taxman Module Implementation

This document outlines the remaining tasks and integration points required to fully implement the generic tax calculation module (`Taxman` and its associated calculators) based on `Design.md` and integrate it into the FinSim simulator according to `Architecture.md`.

## I. Simulator Integration (`Simulator.js`, `UIManager.js`, `Config.js`, Event Handling)

These tasks involve modifying the core simulator logic to work with the new `Taxman` module.

1.  **Replace `Revenue.js` with `Taxman.js`:**
    *   **Location:** `Simulator.js` (and potentially where `Revenue` is instantiated/used).
    *   **Task:** Update the simulator to instantiate `Taxman` instead of the old `Revenue` class.
    *   **Details:**
        *   Pass the loaded tax configuration JSON (see point 2) and the `simContext` (see point 3) to the `Taxman` constructor.
        *   Replace calls to `Revenue` methods (e.g., `declareSalaryIncome`, `computeTaxes`, `netIncome`) with calls to the corresponding `Taxman` methods (`declareIncome`, `computeTaxes`, `netIncome`).

2.  **Load Tax Configuration (`Config.js` / `Simulator.js`):**
    *   **Location:** Likely `Config.js` or early in `Simulator.js` initialization.
    *   **Task:** Implement logic to load the appropriate `GenericTaxSystem` JSON configuration file based on user selection or simulation parameters (e.g., country code, tax year).
    *   **Details:**
        *   The simulator needs a mechanism (likely via `UIManager`/`AbstractUI`) to allow the user to select a tax jurisdiction/year or load a configuration file.
        *   The loaded JSON object needs to be validated against the schema defined in `Design.md`. A JSON schema validator library could be integrated (though might be complex in the non-module environment). Basic structural checks should be performed at minimum.
        *   The validated configuration object must be passed to the `Taxman` constructor.

3.  **Provide `simContext` to `Taxman`:**
    *   **Location:** `Simulator.js` (where `Taxman` is instantiated).
    *   **Task:** Create and pass a `simContext` object to the `Taxman` constructor containing necessary simulator utilities and state accessors.
    *   **Details:** Based on `Taxman`'s constructor and `SchemaEvaluator`, this context needs to provide:
        *   `evaluateFormula`: A function that can parse and evaluate formula strings defined in the schema (e.g., `CalculationRule.formula`). This might require integrating a simple math expression parser library compatible with the browser/GAS environment.
        *   `executeCustomRule`: A function that acts as a dispatcher for custom logic identified by `customRuleIdentifier` or `complexRulePlaceholders`. This function would contain `switch` statements or lookup tables to call specific, hard-coded functions implementing rules too complex for the schema (e.g., overall itemized deduction limits, QBI deduction, specific country edge cases).
        *   Potentially other utility functions from `Utils.js` if they aren't globally accessible.

4.  **Provide `currentState` to `Taxman.computeTaxes`:**
    *   **Location:** `Simulator.js` (within the main simulation loop, before calling `computeTaxes`).
    *   **Task:** Gather all necessary state information for the current simulation year/period and pass it as the `currentState` object to `Taxman.computeTaxes`.
    *   **Details:** This object must include:
        *   `year`, `age`
        *   `filingStatus` (string matching IDs in `systemSettings.filingStatuses`)
        *   `dependents` (array of objects, e.g., `{ type: 'child', age: 5 }`)
        *   `residencyStatus` (string, e.g., 'resident', 'nonResident')
        *   `expenses` (object mapping expense names from `itemizedDeductions` to amounts, e.g., `{ 'Medical Expenses': 5000, 'Mortgage Interest': 10000 }`)
        *   `assets` (object detailing owned assets, including `value`, `type`, and potentially `location`, `assessedValue`, `cadastralValue` for property/wealth tax, and holding duration info for CGT/deemed disposal).
        *   `netWorth` (total net worth for wealth tax).
        *   `liabilities` (total liabilities if needed for wealth tax base).
        *   `cgtLossCarryforward` (object `{ shortTerm: amount, longTerm: amount }` from the *previous* year's `newLossCarryforward` result).
        *   Potentially `pensionPlanType` or similar identifiers if pension rules vary by plan.
        *   Potentially details of foreign income/taxes paid if `residencyRules` are implemented.

5.  **Map Simulator Events to `Taxman` Declarations:**
    *   **Location:** `Simulator.js` (where income/gain events are processed).
    *   **Task:** Update the event processing logic to call `taxman.declareIncome` or `taxman.declareCapitalGainOrLoss` with appropriately mapped parameters.
    *   **Details:**
        *   Map the simulator's event types (e.g., 'Salary', 'Dividend', 'StockSale') to the `type`/`assetType` strings expected by `Taxman` (e.g., 'employment', 'dividends', 'shares').
        *   Extract the relevant amount, details (like `pensionContribRate`), holding period (for gains), etc., from the event data.

6.  **Handle CGT Loss Carryforward State:**
    *   **Location:** `Simulator.js` (state management between years).
    *   **Task:** Store the `newLossCarryforward` object returned by `taxman.computeTaxes` and pass it back as `cgtLossCarryforward` in the `currentState` for the *next* simulation year.

7.  **Implement Event-Driven Tax Calculations:**
    *   **Location:** `Simulator.js` (event processing logic).
    *   **Task:** For events like 'Gift', 'Inheritance', 'PensionWithdrawal', 'DeemedDisposal', trigger specific calculation methods (to be added to `Taxman` or dedicated calculators).
    *   **Details:**
        *   **Transfer Tax:** Create a `TransferTaxCalculator` class. Add methods like `calculateGiftTax(details)`, `calculateInheritanceTax(details)` to it. `Simulator.js` needs to call these methods when processing corresponding events, passing relevant details (amount, relationship, etc.). The calculated tax should be added to the annual `totalTaxLiability`.
        *   **Pension Withdrawals:** Create a `PensionWithdrawalCalculator` or add logic to `IncomeTaxCalculator`. Implement methods triggered by withdrawal events, applying rules from `pensionRules.withdrawalTaxTreatment` (taxation method, penalties). The resulting income/tax needs to be incorporated into the annual calculation.
        *   **Deemed Disposals (CGT):** The simulator needs to track asset holding periods. When an asset reaches a deemed disposal threshold (e.g., 8 years for Irish funds defined in `ratesByAssetAndHolding.deemedDisposalRule`), the simulator should trigger a specific calculation within `CapitalGainsTaxCalculator`, likely simulating a sale at market value and applying the specified deemed disposal tax rate.

8.  **Integrate CGT Loss Offset vs Income:**
    *   **Location:** `Taxman.js` (`_calculateTotalTaxLiability`) or potentially `IncomeTaxCalculator.js`.
    *   **Task:** Refine how the `currentYearLossOffsettingIncome` calculated by `CapitalGainsTaxCalculator` actually reduces the income tax liability.
    *   **Options:**
        *   **(Current Approximation):** Treat the tax benefit (offset amount * marginal rate) as a negative adjustment in `_calculateTotalTaxLiability`. Simple but less accurate.
        *   **(More Accurate):** Modify the calculation order. Calculate CGT *before* final income tax calculation, reduce `taxableIncome` by the offset amount, then calculate income tax. This breaks the current modular flow slightly.
        *   **(Alternative):** Treat the offset amount as a specific non-refundable credit against income tax within `_calculateTotalTaxLiability`.

## II. Taxman Module Enhancements (`Taxman.js` and `src/core/tax/*`)

These tasks involve completing the logic within the `Taxman` module itself.

1.  **CGT: Asset Type Specificity (Losses & Rates):**
    *   **Location:** `CapitalGainsTaxCalculator.js`.
    *   **Task:** If required by specific tax configs, modify gain/loss categorization, offsetting logic, rate lookup (`_getRateInfoForCGT`), and carryforward state (`newLossCarryforward`) to handle different `assetType` categories distinctly, respecting `allowWithinSameAssetType` and `allowAcrossAssetTypes`.

2.  **CGT: `integratedWithIncome` Rate Mapping:**
    *   **Location:** `CapitalGainsTaxCalculator.js` (`_getRateInfoForCGT`).
    *   **Task:** Implement the logic to determine the correct CGT rate based on the taxpayer's income tax bracket, potentially using `taxMethodConfig.integratedIncomeThresholds` if defined in the schema extension, instead of just using the marginal rate.

3.  **Investment Income: `asOrdinaryIncome` / `asCapitalGains` Integration:**
    *   **Location:** `InvestmentIncomeTaxCalculator.js` (`_calculateTaxByMethod`).
    *   **Task:** Refine how income taxed 'as Ordinary Income' or 'as Capital Gains' is handled.
    *   **Options for 'asOrdinaryIncome':**
        *   Keep current marginal rate approximation (simplest).
        *   Modify `Taxman.computeTaxes` order: calculate investment income first, add relevant amounts to `taxableIncome`, then calculate income tax.
    *   **Options for 'asCapitalGains':**
        *   Refine the assumption about holding period (is it always long-term?).
        *   Ensure correct CGT rate (potentially asset-type specific if dividends/interest are treated as specific asset types for CGT) is applied.

4.  **Investment Income: Allowance by Income Bracket:**
    *   **Location:** `SchemaEvaluator.js` (`_calculateAllowance` helper, used by `InvestmentIncomeTaxCalculator`).
    *   **Task:** Implement the logic to determine the correct `incomeBracketLabel` based on `taxableIncome` or `adjustedGrossIncome` to apply the correct allowance amount from `amountByIncomeBracket`.

5.  **Residency Rules Implementation:**
    *   **Location:** Potentially a new `ResidencyRulesHandler.js` class, integrated into `Taxman.computeTaxes`.
    *   **Task:** Implement logic based on `taxConfig.residencyRules`.
    *   **Details:**
        *   **Non-Resident:** If `residencyStatus` is 'nonResident', apply `nonResidentTaxation` rules (limit income sources, use specific rates/methods, adjust allowances/deductions).
        *   **Foreign Tax Relief:** If resident and simulator provides foreign income/tax details, apply `foreignTaxRelief` rules (credit, exemption, deduction method with limits).
        *   **Special Regimes:** Check eligibility for `specialRegimes` based on conditions. If eligible, apply modifications described in `rulesSummary` or delegate to `executeCustomRule`.

6.  **Pension Rules: Plan Type Matching:**
    *   **Location:** `IncomeTaxCalculator.js` (`calculateAdjustments`).
    *   **Task:** Refine the `planTypeMatches` logic to use actual pension plan identifiers provided by the simulator state, matching against `planTypeRegex`.

7.  **Property Tax: Location Check:**
    *   **Location:** `PropertyTaxCalculator.js` (`calculatePropertyTax`).
    *   **Task:** Implement the check based on `rule.level` and potentially `rule.locationScope` against `property.location` provided in the simulator's asset data.

8.  **Formula/Custom Rule Implementation (`simContext`):**
    *   **Location:** `Simulator.js` or a dedicated utility module providing functions to `simContext`.
    *   **Task:** Implement the actual logic for `evaluateFormula` (using a parser library) and `executeCustomRule` (using `switch` or lookup based on identifiers like 'overallItemizedLimit', 'qbiDeduction', etc.).

## III. Schema and Configuration

1.  **Schema Validation:** Implement JSON schema validation when loading tax configurations.
2.  **Configuration Files:** Create actual JSON configuration files for different jurisdictions (e.g., `IE-2024.json`, `US-Federal-2024.json`) conforming to `Design.md`.
3.  **Schema Refinements:** Based on implementation challenges (e.g., CGT `integratedWithIncome` rate mapping, `asOrdinaryIncome` integration), consider minor refinements or clarifications to `Design.md`.