# Step-by-Step Implementation Plan: Two-Person Simulation Functionality

This plan outlines the implementation steps for adding two-person simulation capability to the FinSim application, based on the requirements specified in `two_peeps.md`.

**Overall Approach:**
1.  Create test files with initial (failing) test cases.
2.  Implement core logic changes.
3.  Implement UI changes.
4.  Implement supporting changes (validation, help text, scenario versioning).
5.  Flesh out and run all tests, ensuring they pass.

---

**Phase 1: Test Scaffolding (Expected to Fail Initially)**

*   **Objective:** Create the necessary test files and basic test structures. These tests will be fully developed and validated in Phase 8.
*   **Tasks:**
    1.  **Create `TestTwoPersonTaxCalculation.js`**:
        *   File path: `test/core/TestTwoPersonTaxCalculation.js` (assuming a similar structure to existing tests).
        *   Initial content: Basic test suite structure (e.g., using a testing framework like Mocha or Jest if applicable, otherwise plain JS asserts). Include placeholders or comments for tests related to age-related IT credits, PRSI exemptions, and USC bands for couples with different ages.
    2.  **Create `TestSeparatePensionPots.js`**:
        *   File path: `test/core/TestSeparatePensionPots.js`.
        *   Initial content: Structure for testing individual pension contribution rates, lump sums, separate drawdowns, and conditional P2 pension withdrawals using `SI` and `SInp` events.
    3.  **Create `TestDualStatePensions.js`**:
        *   File path: `test/core/TestDualStatePensions.js`.
        *   Initial content: Structure for verifying correct timing and calculation of state pensions for two people.
    4.  **Create `TestRegressionTwoPerson.js`**:
        *   File path: `test/core/TestRegressionTwoPerson.js`.
        *   Initial content: Plan for establishing baseline scenarios for two-person simulations.
    5.  **Create `TestScenarioVersioning.js`**:
        *   File path: `test/core/TestScenarioVersioning.js`.
        *   Initial content: Structure for verifying proper detection and error handling for old scenario file formats.
    6.  **Create `TestValidation.js`**:
        *   File path: `test/ui/TestValidation.js` (or similar, depending on project structure).
        *   Initial content: Structure for testing Person 2 validation logic and error messages in the UI.
    7.  **Initial Test Run (Optional but Recommended):**
        *   If possible, run these empty/stubbed tests to ensure the test runner picks them up. They should fail or report no tests found.

---

**Phase 2: Core Simulator Logic (`src/core/Simulator.js`)**

*   **Objective:** Implement the backend logic for handling two individuals within the simulation.
*   **Tasks (referencing Section 3 of `two_peeps.md`):**
    1.  **Track Person 2's Age:**
        *   Add `ageP2` to global simulation variables.
        *   Initialize `ageP2` from `params.p2StartingAge` (if provided) in `initializeSimulationVariables`.
        *   Increment `ageP2` yearly.
    2.  **Pension Objects & Initialization:**
        *   In `initializeSimulationVariables`:
            *   Create `pensionP1 = new Pension(...)`.
            *   Conditionally create `pensionP2 = new Pension(...)` if `params.p2StartingAge` is provided.
        *   Fund pensions:
            *   `pensionP1.buy(params.initialPension);`
            *   `if (pensionP2 && params.initialPensionP2 > 0) pensionP2.buy(params.initialPensionP2);`
    3.  **Yearly Updates:**
        *   In `resetYearlyVariables`:
            *   Call `pensionP1.addYear();`
            *   Call `if (pensionP2) pensionP2.addYear();`.
        *   Modify `revenue.reset()` call to pass an object: `{ ageP1: age, ageP2: ageP2 }`. (Note: this requires changes in `Revenue.js` first or simultaneously).
    4.  **Lump Sums & Drawdown (`calculatePensionIncome`):**
        *   **Person 1:** Implement logic for P1 lump sum from `pensionP1` at `params.retirementAge`, adding to `cash`, declaring to revenue, and starting drawdown from `pensionP1`.
        *   **Person 2:**
            *   If P2 exists and `ageP2 === params.p2RetirementAge`, implement P2 lump sum from `pensionP2`, add to `cash`, and declare to revenue.
            *   If `ageP2 >= params.p2RetirementAge`, P2 draws down from `pensionP2` into `incomePrivatePension`.
        *   **Person 2's State Pension:** Add logic to calculate and include Person 2's state pension if `params.p2StatePensionWeekly` is provided and `ageP2` meets qualifying conditions.
    5.  **Pension Contributions (`processEvents` for salary events):**
        *   Modify the `case 'SInp':` section to route pension contributions to `pensionP2` using `params.pensionPercentageP2` (defaulting to `params.pensionPercentage` if `pensionPercentageP2` is not specified), instead of skipping them.
    6.  **`withdraw` Function (Deficit Handling):**
        *   If `pensionPriority` is active:
            *   Attempt withdrawal from `pensionP1.sell()`.
            *   If `needed` is still positive, AND `pensionP2` exists, AND `ageP2 >= params.p2RetirementAge`:
                *   Attempt to withdraw remaining `needed` from `pensionP2.sell()`.
    7.  **`liquidateAll` Function:**
        *   If `pensionP2` exists and has capital, add `pensionP2.sell(pensionP2.capital())` to `incomePrivatePension`.
    8.  **Data Output (`updateYearlyData` - Combined Pension Display):**
        *   Update `dataSheet[row].pensionFund` calculation: `+= pensionP1.capital() + (pensionP2 ? pensionP2.capital() : 0);`.
        *   Update `worth` calculation to include both pension pots.

---

**Phase 3: Revenue & Tax Calculation (`src/core/Revenue.js`)**

*   **Objective:** Update the revenue and tax calculation logic to account for two individuals with potentially different ages.
*   **Tasks (referencing Section 4 of `two_peeps.md`):**
    1.  **Store Individual Ages:**
        *   Modify `Revenue.prototype.reset(agesInput = {})` to accept optional `agesInput` (with `ageP1`, `ageP2`).
        *   Store `this.currentAgeP1` and `this.currentAgeP2`.
        *   If no ages provided, use existing global `age` for `this.currentAgeP1` and leave `this.currentAgeP2` undefined.
    2.  **Person 2 Detection:**
        *   Implement logic where `Revenue.js` detects Person 2 presence by checking if `this.currentAgeP2` is defined.
    3.  **Update `this.people`:**
        *   Adjust logic for `this.people` based on `this.salaries.length` and the presence of `this.currentAgeP2` for accurate age-related credit counting.
    4.  **Refine `computeIT()`:**
        *   Calculate age-related tax credits based on `this.currentAgeP1` and `this.currentAgeP2` (if applicable, e.g., if married or `this.people === 2`).
        *   Adjust IT exemption logic to consider `this.currentAgeP1` (and `this.currentAgeP2` if married) for the age condition (`config.itExemptionAge`).
    5.  **Refine `computePRSI()`:**
        *   Base PRSI exemption age check (`config.prsiExemptAge`) on `this.currentAgeP1` for non-PAYE income.
    6.  **Refine `computeUSC()`:**
        *   When looping through salaries, use `this.currentAgeP1` for the first salary and `this.currentAgeP2` (if available) for the second salary to apply correct USC bands and reduced rates (`config.uscReducedRateAge`).
        *   Handle USC for non-salary income based on `this.currentAgeP1` if no salaries.
    7.  **Lump Sum Handling:**
        *   Ensure `declarePrivatePensionLumpSum(amount)` (called from `Simulator.js`) correctly aggregates multiple lump sums in `this.privatePensionLumpSum` and `this.privatePensionLumpSumCount` for tiered tax bands.

---

**Phase 4: HTML Updates (`src/frontend/web/ifs/index.html`)**

*   **Objective:** Add new input fields to the HTML for Person 2's data.
*   **Tasks (referencing Section 1 of `two_peeps.md`):**
    1.  **Add Input Fields:**
        *   `P2StartingAge` (Optional)
        *   `P2RetirementAge` (Optional)
        *   `P2StatePensionWeekly` (Optional)
        *   `InitialPensionP2` (Optional, new field)
        *   `PensionContributionPercentageP2` (Optional, new field)
        *   Ensure HTML IDs for new fields match the names above.
    2.  **Update Labels:**
        *   Change "Current Age" to "Person 1 Current Age" (for existing `StartingAge`).
        *   Change "Current Savings" to "Current Savings (Joint)".
        *   Change "Pension Fund" to "Person 1 Pension Fund" (for existing `InitialPension`).
        *   Change "Pension %" to "Person 1 Pension %" (for existing `PensionContributionPercentage`).
    3.  **Data Table:**
        *   Confirm that the existing output table remains unchanged for now, with `PensionFund` column representing the combined value (as handled in `Simulator.js`).

---

**Phase 5: UI Parameter Reading & Validation (JavaScript - `WebUI.js`)**

*   **Objective:** Update the JavaScript UI logic to read new parameters and implement validation.
*   **Tasks (referencing Section 2 of `two_peeps.md`):**
    1.  **Modify `WebUI.prototype.getParameters`:**
        *   Read new P2 fields: `P2StartingAge`, `P2RetirementAge`, `P2StatePensionWeekly`.
        *   Read new pension fields: `InitialPensionP2`, `PensionContributionPercentageP2`.
        *   Store them in the `params` object as: `p2StartingAge`, `p2RetirementAge`, `p2StatePensionWeekly`, `initialPensionP2`, `pensionPercentageP2`.
    2.  **Person 1 Validation:**
        *   Ensure `startingAge` and `retirementAge` must both be provided if either is entered.
        *   Implement and show validation error if incomplete Person 1 data is entered.
    3.  **Person 2 Validation:**
        *   If any Person 2 field (`P2StartingAge`, `P2RetirementAge`, `P2StatePensionWeekly`, `InitialPensionP2`, or `PensionContributionPercentageP2`) is provided, then `P2StartingAge` and `P2RetirementAge` become required.
        *   Implement and show validation error if incomplete Person 2 data is entered (i.e., some P2 fields provided but not `P2StartingAge` and `P2RetirementAge`).
    4.  **Person 2 Detection Logic (for UI purposes, if needed):**
        *   Person 2 exists if `params.p2StartingAge` is provided and valid.

---

**Phase 6: Supporting Updates (Validation, Help, Event Labels)**

*   **Objective:** Update various supporting parts of the application to reflect the new two-person functionality.
*   **Tasks (referencing Sections 3 & 5 of `two_peeps.md`):**
    1.  **Update Dropdown Labels in `EventsTableManager.getEventTypeOptions()` (from `Simulator.js` section):**
        *   Change `SI: Salary Income` to `SI: Salary Income (Person 1)`.
        *   Change `SInp: Salary (No Pension)` to `SInp: Salary Income (Partner)`.
    2.  **Event Validation (`UIManager.js`):**
        *   Update the validation description for `SInp` in the `valid` object from "Salary Income (no private pension contribution)" to "Salary Income (Partner)".
    3.  **Help System (`help.yml`):**
        *   Update help text and tooltips to reflect the new meaning of `SInp` events.
        *   Explain the two-person functionality, new input fields, and how Person 2's pension contribution rate defaults if not specified.
    4.  **Error Messages:**
        *   Review and update any validation messages that reference the old `SInp` behavior or other assumptions changed by two-person support.

---

**Phase 7: Scenario File Versioning & Migration**

*   **Objective:** Implement a mechanism to handle new scenario file formats and guide users with old files.
*   **Tasks (referencing Section 6 of `two_peeps.md`):**
    1.  **Increment Scenario File Version Number:**
        *   Define and implement a new version number for scenarios that include two-person data.
    2.  **Old Scenario Detection:**
        *   When loading a scenario file, check its version number (or lack thereof for very old files).
    3.  **Migration Error Display:**
        *   If an old scenario is detected:
            *   Show a clear, non-technical error message to the user.
            *   Explain:
                *   The scenario format has changed for two-person functionality.
                *   `SInp` events now mean "Partner's Salary" and contribute to Person 2's pension.
                *   Users must manually review their scenarios:
                    *   Change any events previously intended as a second salary for Person 1 (but using `SInp` to avoid pension) to `SI` if they still want no pension for P1 on that income, or adjust event types as needed.
                    *   Identify and convert previous "second person salary" events (likely `SI` events) to `SInp`.
                    *   Input Person 2's details in the new UI fields.
            *   Provide specific guidance on what changes are needed in their existing events.
    4.  **No Automatic Migration:**
        *   Confirm that no automatic conversion of old scenarios is implemented. The user must perform manual updates.

---

**Phase 8: Testing & Refinement**

*   **Objective:** Populate the test cases created in Phase 1, run all tests, and ensure all functionality works as expected.
*   **Tasks (referencing Section 8 of `two_peeps.md`):**
    1.  **Flesh out `TestTwoPersonTaxCalculation.js`**:
        *   Write specific test cases to validate age-related IT credits, PRSI exemptions, and USC bands for couples with different ages, using various scenarios.
    2.  **Flesh out `TestSeparatePensionPots.js`**:
        *   Write test cases for:
            *   Individual pension contribution rates (`params.pensionPercentage` vs `params.pensionPercentageP2`).
            *   Correct lump sum calculations and timing for P1 and P2.
            *   Separate drawdown functionality for P1 and P2.
            *   Conditional P2 pension withdrawals via the `withdraw` function (deficit handling).
            *   Use `SI` and `SInp` events to drive P1 and P2 contributions respectively.
    3.  **Flesh out `TestDualStatePensions.js`**:
        *   Write test cases to verify correct timing and calculation of state pensions for two people reaching qualifying age at different times, including scenarios where one or both have state pensions.
    4.  **Flesh out `TestRegressionTwoPerson.js`**:
        *   Establish and save baseline scenarios for two-person simulations. These will serve as regression tests for future changes. Include scenarios with:
            *   Only Person 1.
            *   Person 1 and Person 2 with various age differences.
            *   Different retirement ages.
            *   Different pension contribution strategies.
    5.  **Flesh out `TestScenarioVersioning.js`**:
        *   Write test cases to verify:
            *   Proper detection of old scenario file formats.
            *   Correct display of the migration error message.
            *   Successful loading of new format scenarios.
    6.  **Flesh out `TestValidation.js`**:
        *   Write test cases for UI validation:
            *   P1 data completion requirements.
            *   P2 data completion requirements (if any P2 field is present).
            *   Correct error messages for incomplete data for P1 and P2.
    7.  **Comprehensive Scenario Testing:**
        *   Manually test various scenarios as outlined in `two_peeps.md`, focusing on:
            *   Separate pension pot values throughout the simulation.
            *   Individual lump sum events and their impact on cash and taxes.
            *   The new `withdraw` logic correctly tapping into `pensionP2` under specified conditions.
            *   Proper error handling for incomplete Person 2 data (UI and core).
            *   Proper error handling for old scenario files.
    8.  **Iterate and Debug:**
        *   Run all automated and manual tests.
        *   Identify, debug, and fix any issues found in the implementation.
        *   Repeat testing until all tests pass and functionality is confirmed.

---

**Key Simplifications (to keep in mind, from Section 7 of `two_peeps.md`):**
*   Person 2's pension contribution rate (`pensionPercentageP2`) defaults to Person 1's rate (`params.pensionPercentage`) if not specified.
*   Financial accounts (savings, funds, shares) remain joint.
*   The existing event system leverages the `SI`/`SInp` distinction for person identification regarding salary and pension contributions.
*   Combined pension display in the main output table.
*   Clear validation errors rather than complex auto-detection for Person 2 data completeness. 