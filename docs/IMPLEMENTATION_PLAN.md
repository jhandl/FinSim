# FinSim - Tax System v2.0 Implementation Plan

This document details the step-by-step plan to refactor FinSim's tax system, aligning with the architecture in `docs/ARCHITECTURE.md`.

The core principle remains **iterative implementation**. Each phase is designed to be completed and tested independently, ensuring all existing tests pass before moving to the next.

---

## Phase 1: Create the Irish Tax Configuration File

The first step is to translate the existing, hardcoded Irish tax rules into the new JSON format.

*   **Action:** Create a new file: `src/core/config/tax/tax-config-ie-2.0.json`.
*   **Content:** Populate this file with all the Irish tax rules (income tax brackets, PRSI/USC rates, CGT, pension rules, etc.) currently hardcoded in `Revenue.js` and `Config.js`. This must be a complete and accurate representation according to the `tax_config_spec.md`.
*   **Verification:** Manually cross-reference the values in the new JSON file with the existing hardcoded values in the JavaScript files to ensure accuracy. No code changes yet, so all tests will pass by default.

---

## Phase 2: Introduce the `TaxRuleSet` Component

This phase introduces the new `TaxRuleSet` class, a data object for holding a parsed tax configuration.

*   **Action:** Create `src/core/TaxRuleSet.js`.
*   **Content:** Implement the `TaxRuleSet` class. It will take a raw JSON object in its constructor and provide getter methods for each major section of the tax spec (e.g., `getIncomeTax()`, `getCapitalGainsTax()`). These getters will handle default values for optional fields.
*   **Action:** Create a new test file `tests/TestTaxRuleSet.js`.
*   **Content:** Add unit tests for the `TaxRuleSet` class. These tests will load the `tax-config-ie-2.0.json` file and assert that the getter methods return the correct structures and values.
*   **Verification:** Run the new `TestTaxRuleSet.js` test and ensure it passes. All existing tests should also pass as this new code is not yet integrated into the simulator.

---

## Phase 3: Refactor `Config.js` to Manage `TaxRuleSet`s

This phase modifies the central `Config.js` to load and manage the new tax configurations.

*   **Action:** Modify `src/core/Config.js`.
*   **Content:**
    1.  Add logic to load the `tax-config-ie-2.0.json` file upon initialization.
    2.  Instantiate the `TaxRuleSet` class with the loaded data and cache it.
    3.  Add a new method, `getTaxRuleSet(countryCode)`, which will (for now) always return the cached Irish `TaxRuleSet` instance.
    4.  **Crucially, do not remove the old hardcoded config values yet.**
*   **Verification:** Update `TestConfigVersioning.js` to check that the new tax ruleset is loaded and cached correctly. All existing tests must continue to pass.

---

## Phase 4: Data-Driven Income Tax Calculation

This is the first major refactoring of the core logic, focusing on income tax while ensuring couple-based calculations remain correct.

*   **Action:** Modify `src/core/Revenue.js`.
*   **Content:**
    1.  In the `reset()` method, fetch the Irish `TaxRuleSet` from `Config.js` and store it as `this.ruleset`.
    2.  Refactor the `computeIT()` function. It must now source all parameters (brackets, allowances, credits) from `this.ruleset`.
    3.  Pay special attention to the logic for married couples. Ensure that joint bands (`jointBracketMultiplier`) and other couple-specific rules from the ruleset are applied correctly, preserving the existing behavior.
    4.  Once the tests pass, remove the now-redundant hardcoded income tax variables from `Config.js` and `Revenue.js`.
*   **Verification:** Run all existing tax-related tests (e.g., `TestBasicTaxCalculation.js`, `TestIrishTaxSystem.js`, `TestTwoPersonTaxCalculation.js`, `TestRegressionTwoPersonMarried.js`). They **must** all pass. Any discrepancies must be fixed before proceeding.

---

## Phase 5: Refactor Remaining Tax Calculations

Apply the same data-driven pattern to all other tax and contribution types.

*   **Action:** Modify `src/core/Revenue.js` and `src/core/Config.js`.
*   **Content:** For each of the following, refactor the calculation function in `Revenue.js` to use `this.ruleset` and remove the corresponding hardcoded values:
    1.  Social Contributions (PRSI)
    2.  Additional Taxes (USC)
    3.  Capital Gains Tax (CGT)
    4.  Dividend & Interest Tax
    5.  Pension Contribution Rules
*   **Verification:** After refactoring each calculation, run the entire test suite. All tests must pass before proceeding to the next calculation.

---

## Phase 6: Implement Full Residency and `TaxContext` Logic

This final phase implements the complete residency model.

*   **Action:** Modify `src/core/Person.js`.
*   **Content:**
    1.  Implement an internal structure to store a history of tax residency events (country and start year).
    2.  Create the `getTaxContext(year)` method. This will analyze the residency history and return a `TaxContext` object for the given year (e.g., `{ primary: "IE" }`).
*   **Action:** Modify `src/core/Simulator.js`.
*   **Content:**
    1.  In the main loop, call `person.getTaxContext(year)` and pass the resulting context to `revenue.reset()`.
    2.  Implement the handler for the new `ChangeTaxResidency` event, which should call a new method on the `Person` object to add to their residency history.
*   **Action:** Modify `src/core/Revenue.js`.
*   **Content:** Update the `reset(taxContext)` method. It will now use the `taxContext.primary` country code to request the correct `TaxRuleSet` from `Config.js`.
*   **Action:** Modify `src/core/Config.js`.
*   **Content:** Update `getTaxRuleSet(countryCode)` to dynamically load and cache tax files based on the requested country code.
*   **Action:** Create `tests/TestResidencyChange.js`.
*   **Content:** Create a simple `tax-config-uk-2.0.json` with distinctly different tax rules. The test will define a scenario where a person moves from Ireland to the UK and will assert that the tax calculations switch to using the UK rules in the correct year.
*   **Verification:** Run all tests. The new `TestResidencyChange.js` test must pass, along with all existing tests.