# Summary: Implementing Two-Person Simulation Functionality (with separate Pension Pots)

This document outlines the summarized steps to add two-person simulation capability, focusing on different ages impacting taxes, state pensions, and separate private pension pots for lump sums and drawdown.

**1. HTML Updates (`src/frontend/web/ifs/index.html`)**
    *   Add input fields for:
        *   `P2StartingAge` (Optional)
        *   `P2RetirementAge` (Optional)
        *   `P2StatePensionWeekly` (Optional)
        *   `InitialPensionP2` (Optional, new field)
        *   `PensionContributionPercentageP2` (Optional, new field for Person 2's pension contribution rate)
    *   HTML IDs for new fields should match the above names.
    *   Update labels for clarity (e.g., "Person 1 Current Age" for existing `StartingAge`, "Current Savings (Joint)", "Person 1 Pension Fund" for existing `InitialPension`, "Person 1 Pension %" for existing `PensionContributionPercentage`).
    *   **Data Table:** For now, keep existing output table unchanged. The `PensionFund` column will represent the combined value of both pension pots.

**2. UI Parameter Reading & Validation (JavaScript - `WebUI.js`)**
    *   Modify `WebUI.prototype.getParameters` to read:
        *   New P2 fields: `P2StartingAge`, `P2RetirementAge`, `P2StatePensionWeekly`.
        *   New pension fields: `InitialPensionP2`, `PensionContributionPercentageP2`.
        *   Store them in the `params` object as: `p2StartingAge`, `p2RetirementAge`, `p2StatePensionWeekly`, `initialPensionP2`, `pensionPercentageP2`.
    *   **Person 1 Validation:** 
        *   Required fields for Person 1: `startingAge` and `retirementAge` must both be provided.
        *   Show validation error if incomplete Person 1 data is entered.
    *   **Person 2 Validation:** If any Person 2 field is provided, the same requirements apply to Person 2.
    *   **Person 2 Detection Logic:** Person 2 exists if `params.p2StartingAge` is provided and valid.

**3. Core Simulator Logic (`src/core/Simulator.js`)**
    *   **Track Person 2's Age:** Add `ageP2` to global variables. Initialize `ageP2` from `params.p2StartingAge` (if provided) and increment it yearly.
    *   **Pension Objects & Initialization:**
        *   In `initializeSimulationVariables`: Create `pensionP1 = new Pension(...)` and `pensionP2 = new Pension(...)` (if `params.p2StartingAge` is provided).
        *   Fund them: `pensionP1.buy(params.initialPension);` and `if (pensionP2 && params.initialPensionP2 > 0) pensionP2.buy(params.initialPensionP2);`.
    *   **Yearly Updates:**
        *   In `resetYearlyVariables`: Call `pensionP1.addYear();` and `if (pensionP2) pensionP2.addYear();`.
        *   **Pass Ages to Revenue Module:** Modify `revenue.reset()` call to pass an object containing `ageP1: age` and `ageP2: ageP2`. Update method signature from `reset()` to `reset(agesInput = {})`.
    *   **Lump Sums & Drawdown (`calculatePensionIncome`):
        *   Person 1: When `age === params.retirementAge`, get lump sum from `pensionP1.getLumpsum()`, add to `cash`, and `revenue.declarePrivatePensionLumpSum()`. P1 starts drawing down from `pensionP1.drawdown()` into `incomePrivatePension`.
        *   Person 2: If P2 exists (`params.p2StartingAge != null`) and `ageP2 === params.p2RetirementAge`, get lump sum from `pensionP2.getLumpsum()`, add to `cash`, and `revenue.declarePrivatePensionLumpSum()`. If `ageP2 >= params.p2RetirementAge`, P2 draws down from `pensionP2.drawdown()` into `incomePrivatePension`.
        *   **Calculate Person 2's State Pension:** Add logic to calculate and include Person 2's state pension if `params.p2StatePensionWeekly` is provided and `ageP2` meets the same qualifying conditions as Person 1 (`config.statePensionQualifyingAge` and `config.statePensionIncreaseAge`).
    *   **Pension Contributions (`processEvents` for salary events):
        *   **Repurpose Event Types:** Change the semantic meaning of existing event types:
            *   `SI` = "Salary Income (Person 1)" - contributes to `pensionP1` using `params.pensionPercentage`
            *   `SInp` = "Salary Income (Partner)" - contributes to `pensionP2` using `params.pensionPercentageP2` (defaults to `params.pensionPercentage` if not specified)
        *   **Processing Changes:** Modify the `case 'SInp':` section in `processEvents` to route pension contributions to `pensionP2` instead of skipping them.
        *   Update dropdown labels in `EventsTableManager.getEventTypeOptions()`:
            *   `SI: Salary Income` → `SI: Salary Income (Person 1)`
            *   `SInp: Salary (No Pension)` → `SInp: Salary Income (Partner)`
    *   **`withdraw` function (Deficit Handling):
        *   If `pensionPriority` is active:
            *   Attempt to withdraw `needed` amount from `pensionP1.sell()`, updating `incomePrivatePension`.
            *   If `needed` is still positive, AND `pensionP2` exists, AND `ageP2 >= params.p2RetirementAge`:
                *   Attempt to withdraw remaining `needed` from `pensionP2.sell()`, updating `incomePrivatePension`.
    *   **`liquidateAll` function:**
        *   If `pensionP2` exists and has capital, add `pensionP2.sell(pensionP2.capital())` to `incomePrivatePension`.
    *   **Data Output (`updateYearlyData` - Combined Pension Display):
        *   Keep existing `pensionFund` field but update calculation to sum both pensions: `dataSheet[row].pensionFund += pensionP1.capital() + (pensionP2 ? pensionP2.capital() : 0);`
        *   Update `worth` calculation to include both pension pots.

**4. Revenue & Tax Calculation (`src/core/Revenue.js`)**
    *   **Store Individual Ages:** Modify `Revenue.prototype.reset(agesInput = {})` to accept optional `agesInput` (with `ageP1`, `ageP2`) and store `this.currentAgeP1` and `this.currentAgeP2`. If no ages provided, use existing global `age` for `this.currentAgeP1` and leave `this.currentAgeP2` undefined.
    *   **Person 2 Detection:** Revenue.js detects Person 2 presence by checking if `this.currentAgeP2` is defined (not `null` or `undefined`).
    *   **Update `this.people`:** Adjust logic for `this.people` based on `this.salaries.length` and the presence of `this.currentAgeP2` for accurate age-related credit counting.
    *   **Refine `computeIT()`:**
        *   Calculate age-related tax credits based on `this.currentAgeP1` and `this.currentAgeP2` (if applicable, e.g., if married or `this.people === 2`).
        *   Adjust IT exemption logic to consider `this.currentAgeP1` (and `this.currentAgeP2` if married) for the age condition (`config.itExemptionAge`).
    *   **Refine `computePRSI()`:** Base PRSI exemption age check (`config.prsiExemptAge`) on `this.currentAgeP1` for non-PAYE income.
    *   **Refine `computeUSC()`:**
        *   When looping through salaries, use `this.currentAgeP1` for the first salary and `this.currentAgeP2` (if available) for the second salary to apply correct USC bands and reduced rates (`config.uscRaducedRateAge`).
        *   Handle USC for non-salary income based on `this.currentAgeP1` if no salaries.
    *   **Lump Sum Handling:** `declarePrivatePensionLumpSum(amount)` will be called for each lump sum (P1 and P2). The existing aggregation in `this.privatePensionLumpSum` and `this.privatePensionLumpSumCount` should correctly apply tiered tax bands for lump sums based on Irish tax rules across multiple receipts.

**5. Validation & Help System Updates**
    *   **Event Validation (`UIManager.js`):** Update the validation description for `SInp` from "Salary Income (no private pension contribution)" to "Salary Income (Partner)" in the `valid` object.
    *   **Help System (`help.yml`):** Update help text and tooltips to reflect the new meaning of `SInp` events and explain the two-person functionality.
    *   **Error Messages:** Update any validation messages that reference the old `SInp` behavior.

**6. Scenario File Versioning & Migration**
    *   **Version Number:** Increment the scenario file version number to distinguish between old and new formats.
    *   **Old Scenario Detection:** When loading a scenario file, check the version number.
    *   **Migration Error Display:** If an old scenario is detected, show a clear error message explaining:
        *   The scenario format has changed to support two-person functionality
        *   `SInp` events now represent "Partner's Salary" instead of "Salary with no pension"
        *   Users need to review their scenarios and change any second `SI` events (representing partner's salary) to `SInp` events
        *   Provide specific guidance on what changes are needed
    *   **No Automatic Migration:** Do not attempt to automatically convert old scenarios - require explicit user action.

**7. Key Simplifications for this Phase**
    *   Person 2's pension contribution rate defaults to Person 1's rate if `pensionPercentageP2` is not specified.
    *   Financial accounts (savings, funds, shares) remain joint.
    *   The existing event system leverages the current `SI`/`SInp` distinction for person identification.
    *   Combined pension display in output table for simplicity.
    *   Clear validation errors rather than complex auto-detection for Person 2 data.

**8. Testing**

    *   **TestTwoPersonTaxCalculation.js**: Validate age-related IT credits, PRSI exemptions, and USC bands for couples with different ages
    *   **TestSeparatePensionPots.js**: Test individual pension contribution rates, lump sums, separate drawdowns, and conditional P2 pension withdrawals using `SI` and `SInp` events
    *   **TestDualStatePensions.js**: Verify correct timing and calculation of state pensions for two people reaching qualifying age at different times
    *   **TestRegressionTwoPerson.js**: Establish baseline scenarios for two-person simulations
    *   **TestScenarioVersioning.js**: Verify proper detection and error handling for old scenario file formats
    *   **TestValidation.js**: Test Person 2 validation logic and error messages
    *   Test scenarios as before, now paying close attention to separate pension pot values, individual lump sum events, and the new `withdraw` logic tapping into `pensionP2` under specified conditions. Verify proper error handling for incomplete Person 2 data and old scenario files. 