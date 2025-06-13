# Step-by-Step Implementation Plan: Two-Person Simulation Functionality

This plan outlines the implementation steps for adding two-person simulation capability to the FinSim application, based on the requirements specified in `two_peeps.md`. It incorporates a refactoring to use a `Person` class for better modularity.

Ensure your understand the structure and architecture of the project before making any change. Read the AGENTS.md file.

**Instructions for Status Tracking:**
When completing tasks, update the corresponding phase status line to reflect progress. Mark completed phases as "Status: ✅ Complete" and phases in progress as "Status: 🔄 In Progress - Task X of Y completed". Also update the "Overall progress" line to indicate what the next step is.

**Overall Approach:**
1.  Create test files with initial (failing) test cases.
2.  Define and implement the `Person` class.
3.  Refactor core simulator logic to use `Person` objects.
4.  Implement UI changes.
5.  Implement supporting changes (validation, help text, scenario versioning).
6.  Flesh out and run all tests, ensuring they pass.

**Overall Progress:** Phase 9, Task 4 in progress (Baseline for 1st regression test set). Next step: Add more regression tests or move to TestScenarioVersioning.js.

---

**Phase 1: Test Scaffolding (Expected to Fail Initially)**

**Status: Completed**

*   **Objective:** Create the necessary test files and basic test structures. These tests will be fully developed and validated in Phase 9.
*   **Tasks:** (File paths updated to common `test/` directory)
    1.  **Create `TestTwoPersonTaxCalculation.js`**:
        *   File path: `test/core/TestTwoPersonTaxCalculation.js`.
        *   Initial content: Basic test suite structure. Include placeholders for tests related to age-related IT credits, PRSI exemptions, and USC bands for couples with different ages.
    2.  **Create `TestSeparatePensionPots.js`**:
        *   File path: `test/core/TestSeparatePensionPots.js`.
        *   Initial content: Structure for testing individual pension contribution rates, lump sums, separate drawdowns, and conditional P2 pension withdrawals using `SI` and `SInp` events, now considering `Person` objects.
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
        *   File path: `test/ui/TestValidation.js` (or `test/frontend/TestValidation.js` depending on structure).
        *   Initial content: Structure for testing Person 2 validation logic and error messages in the UI.
    7.  **Initial Test Run (Optional but Recommended):** Ensure test runner picks them up.

---

**Phase 2: Define `Person` Class (`src/core/Person.js`)**

**Status: ✅ Complete**

*   **Objective:** Create a new `Person` class using ES6 syntax to encapsulate all person-specific data and core logic. This file must work in web and Google Apps Script environments.
*   **Tasks:**
    1.  **Create `src/core/Person.js` file.**
    2.  **Implement the `Person` class with the following structure and logic:**
        *   **Constructor `constructor(id, personSpecificUIParams, commonSimParams, commonPensionConfig)`:**
            *   Store `id`.
            *   Initialize `age` based on `personSpecificUIParams.startingAge` (to be incremented at the start of the first simulation year).
            *   Initialize `phase` to `Phases.growth` (using `Phases` enum from `Simulator.js`).
            *   Create and store a `new Pension(...)` object instance, configured with `commonPensionConfig`.
            *   Store essential person-specific parameters like `retirementAgeParam`, `statePensionWeeklyParam`, and `pensionContributionPercentageParam` from `personSpecificUIParams`.
            *   Call `this.resetYearlyVariables()` at the end of the constructor.
        *   **Method `resetYearlyVariables()`:**
            *   Initialize/reset person-specific yearly income accumulators, such as `this.yearlyIncomeStatePension = 0;` and `this.yearlyIncomePrivatePension = 0;`.
        *   **Method `addYear()`:**
            *   Increment `this.age`.
            *   Call `this.pension.addYear()`.
        *   **Method `calculateYearlyPensionIncome(config)`:**
            *   Accepts the global `config` object.
            *   **Lump Sum:** If `this.age` matches `this.retirementAgeParam` and `this.phase` is `Phases.growth`:
                *   Calculate lump sum from `this.pension.getLumpsum()`.
                *   Set `this.phase` to `Phases.retired`.
                *   Store the calculated lump sum amount for return.
            *   **Private Pension Drawdown:** If `this.phase` is `Phases.retired`, calculate drawdown from `this.pension.drawdown()` and store in `this.yearlyIncomePrivatePension`.
            *   **State Pension:** If `this.statePensionWeeklyParam` is valid and `this.age` meets `config.statePensionQualifyingAge`:
                *   Calculate yearly state pension (52 * weekly amount, using global `adjust()`).
                *   If `this.age` meets `config.statePensionIncreaseAge`, add the increase amount (52 * `config.statePensionIncreaseAmount`, using `adjust()`).
                *   Store in `this.yearlyIncomeStatePension`.
            *   **Return:** An object like `{ lumpSumAmount: /* value or 0 */ }`. This allows the simulator to handle adding the lump sum to global `cash` and declaring it to revenue.
        *   Ensure the class relies on `Phases` enum and the global `adjust()` function being available from `Simulator.js` or its execution environment.

---

**Phase 3: Core Simulator Logic Refactor (`src/core/Simulator.js`)**

**Status: ✅ Complete**

*   **Objective:** Refactor `Simulator.js` to use `Person` objects, removing P1/P2 specific global variables where possible and simplifying logic.
*   **Global variables to adapt/introduce:**
    *   `person1` (instance of `Person`)
    *   `person2` (instance of `Person`, or `null` if not applicable)
    *   The main simulation loop (`runSimulation`) will be driven by `person1.age` directly. Global `row` and `periods` variables will continue to be updated at the start of each yearly iteration within this loop.
*   **Tasks:**
    1.  **Update `initializeSimulationVariables()`:**
        *   Remove old P1-specific globals that are now in `Person` (e.g., global `age` variable, `phase` for P1 state, `pension` object for P1).
        *   Define `p1SpecificParams` from the global `params` object (e.g., `params.startingAge`, `params.retirementAge`, `params.statePensionWeekly`, `params.initialPension`, `params.pensionPercentage`).
        *   Create `person1 = new Person('P1', p1SpecificParams, params, { growthRatePension: params.growthRatePension, growthDevPension: params.growthDevPension });`.
        *   If `params.initialPension > 0`, fund `person1.pension.buy(params.initialPension);`.
        *   **Person 2 Initialization:**
            *   If `params.p2StartingAge` is provided (indicating Person 2 exists):
                *   Determine `p2PensionContribPercentage` (use `params.pensionPercentageP2` or default to `params.pensionPercentage`).
                *   Define `p2SpecificParams` (e.g., `params.p2StartingAge`, `params.p2RetirementAge`, `params.p2StatePensionWeekly`, `params.initialPensionP2`, `p2PensionContribPercentage`).
                *   Create `person2 = new Person('P2', p2SpecificParams, params, { growthRatePension: params.growthRatePension, growthDevPension: params.growthDevPension });`.
                *   If `params.initialPensionP2 > 0`, fund `person2.pension.buy(params.initialPensionP2);`.
            *   Else, `person2 = null;`.
        *   Loop control: `while (person1.age < params.targetAge)`.
        *   Initialize global `year`.
    2.  **Update `resetYearlyVariables()`:**
        *   Call `person1.resetYearlyVariables();`.
        *   If `person2`, call `person2.resetYearlyVariables();`.
        *   Reset global yearly accumulators (e.g., `incomeSalaries = 0; incomePrivatePension = 0; incomeStatePension = 0;`).
        *   Modify `revenue.reset(person1, person2);` // Pass Person objects (or derived data like ages).
        *   Call `person1.addYear();` (which internally calls `pension.addYear()` and increments `person1.age`). This replaces the old global `age++` logic.
        *   If `person2`, call `person2.addYear();`.
        *   Global `year++` remains.
    3.  **Pension Income Calculation in `runSimulation()` loop (replaces `calculatePensionIncome` call):**
        *   Before `processEvents()`:
            *   `const p1CalcResults = person1.calculateYearlyPensionIncome(config);`
            *   `if (p1CalcResults.lumpSumAmount > 0) { cash += p1CalcResults.lumpSumAmount; revenue.declarePrivatePensionLumpSum(p1CalcResults.lumpSumAmount); }`
            *   `incomePrivatePension += person1.yearlyIncomePrivatePension;`
            *   `incomeStatePension += person1.yearlyIncomeStatePension;`
            *   If `person2` exists:
                *   `const p2CalcResults = person2.calculateYearlyPensionIncome(config);`
                *   `if (p2CalcResults.lumpSumAmount > 0) { cash += p2CalcResults.lumpSumAmount; revenue.declarePrivatePensionLumpSum(p2CalcResults.lumpSumAmount); }`
                *   `incomePrivatePension += person2.yearlyIncomePrivatePension;`
                *   `incomeStatePension += person2.yearlyIncomeStatePension;`
            *   After processing both (if applicable), declare total state pension: `revenue.declareStatePensionIncome(incomeStatePension);`
    4.  **Update Pension Contributions in `processEvents()`:**
        *   **`case 'SI':` (Salary Income - Person 1)**
            *   Calculate `contribRate` using `person1.pensionContributionPercentageParam` and `person1.age` for bands.
            *   Calculate `totalContrib`.
            *   `person1.pension.buy(totalContrib);`
            *   `revenue.declareSalaryIncome(amount, contribRate, person1.age);` (Pass P1's age).
        *   **`case 'SInp':` (Salary Income - Partner/Person 2)**
            *   If `person2` exists:
                *   Calculate `contribRate` using `person2.pensionContributionPercentageParam` and `person2.age` for bands.
                *   Calculate `totalContrib`.
                *   `person2.pension.buy(totalContrib);`
                *   `revenue.declareSalaryIncome(amount, contribRate, person2.age);` (Pass P2's age).
            *   Else (SInp event but no Person 2 defined): Log warning or treat as salary with no pension for P1 (needs clarification based on desired behavior if P2 not present but SInp used).
        *   **Other event processing:** Update any age-based conditions to use `person1.age` instead of global `age`.
    5.  **Refactor `withdraw()` function (Deficit Handling):**
        *   Function may need access to `person1` and `person2` (passed as args or accessed as globals if they are made global in `Simulator.js`).
        *   When considering pension withdrawal for P1: use `person1.pension.capital()`, `person1.pension.sell()`, `person1.phase`, `person1.age`, `person1.retirementAgeParam`.
        *   If deficit remains & P2 withdrawal is considered: use `person2.pension.capital()`, `person2.pension.sell()`, check `person2.phase === Phases.retired || person2.age >= person2.retirementAgeParam`.
        *   Update global `incomePrivatePension` and `cash`.
    6.  **Refactor `liquidateAll()` function:**
        *   If `person1.pension.capital() > 0`, add `person1.pension.sell(person1.pension.capital())` to `incomePrivatePension`.
        *   If `person2 && person2.pension.capital() > 0`, add `person2.pension.sell(person2.pension.capital())` to `incomePrivatePension`.
    7.  **Update `updateYearlyData()` (Combined Pension Display):**
        *   Update `dataSheet[row].age += person1.age;` instead of using global `age`.
        *   `dataSheet[row].pensionFund += person1.pension.capital() + (person2 ? person2.pension.capital() : 0);`
        *   `dataSheet[row].worth` calculation to sum `person1.pension.capital()`, `person2.pension.capital()` (if P2 exists), along with other assets.

---

**Phase 4: Revenue & Tax Calculation (`src/core/Revenue.js`)**

**Status: ✅ Complete**

*   **Objective:** Update revenue and tax logic for two individuals.
*   **Tasks:**
    1.  **Adapt `Revenue.prototype.reset(person1, person2_optional)`:** **Status: ✅ Complete**
        *   Accept `person1` (Person object) and optional `person2` (Person object).
        *   Store `this.currentAgeP1 = person1.age;` // Note: currentAgeP1/P2 later removed, using personRef.age directly
        *   Store `this.currentAgeP2 = person2 ? person2.age : undefined;` // Note: currentAgeP1/P2 later removed
        *   Revenue.js detects Person 2 presence via `this.person2Ref`.
    2.  **Adapt `Revenue.prototype.declareSalaryIncome(amount, contribRate, personAge)`:** **Status: ✅ Complete** // Note: Later changed to accept person object
        *   This function now takes `personAge`. It should store salaries along with the associated `personAge` (e.g., in an array of objects `[{amount, contribRate, age}, ...]`). // Note: Later changed to store in person-specific arrays without age, using personRef.age for calcs.
    3.  **Update `this.people`:** Logic based on presence of `this.person1Ref` and `this.person2Ref`. **Status: ✅ Complete**
    4.  **Refine `computeIT()`:** Use `personRef.age` for age-related credits and exemptions. **Status: ✅ Complete**
    5.  **Refine `computePRSI()`:** Base PRSI exemption on `personRef.age` for PAYE and non-PAYE. **Status: ✅ Complete**
    6.  **Refine `computeUSC()`:** Use `personRef.age` for USC bands/rates for each person's total USC-liable income. **Status: ✅ Complete**
        *   When looping through stored salaries, use the `age` associated with each salary entry for correct USC bands/rates (`config.uscReducedRateAge`). // Note: Logic updated to sum person's salaries and use personRef.age for their total USC income.
        *   Handle non-salary income USC based on `personRef.age` after attributing income. // Note: Logic updated for per-person non-salary income attribution.
    7.  **Lump Sum Handling (`declarePrivatePensionLumpSum`):** Refactored for per-person declaration and IT calculation. **Status: ✅ Complete**

---

**Phase 5: HTML Updates (`src/frontend/web/ifs/index.html`)**

**Status: ✅ Complete**

*   **Objective:** Add new input fields to the HTML for Person 2's data.
*   **Tasks (referencing Section 1 of `two_peeps.md`):**
    1.  Add Input Fields: `P2StartingAge`, `P2RetirementAge`, `P2StatePensionWeekly`, `InitialPensionP2`, `PensionContributionPercentageP2`. Ensure HTML IDs match. **Status: ✅ Complete**
    2.  Update Labels for P1 fields and joint fields (e.g., "Person 1 Current Age", "Current Savings (Joint)", "Person 1 Pension Fund"). **Status: ✅ Complete**
    3.  Data Table: Keep existing `PensionFund` column for combined value. **Status: ✅ Complete**

---

**Phase 6: UI Parameter Reading & Validation (JavaScript - `WebUI.js`)**

**Status: ✅ Partially complete** Task 5 not started.

*   **Objective:** Update UI logic to read new parameters and implement validation.
*   **Tasks (referencing Section 2 of `two_peeps.md`):**
    1.  Modify `WebUI.prototype.getParameters`: Read new P2 fields and pension fields, store as `p2StartingAge`, `initialPensionP2`, etc. in `params`. **Status: ✅ Complete**
    2.  Person 1 Validation: `startingAge` and `retirementAge` required if either provided. **Status: ✅ Complete**
    3.  Person 2 Validation: If any P2 field provided, `p2StartingAge` and `p2RetirementAge` become required. **Status: ✅ Complete**
    4.  Person 2 Detection Logic (for UI): Based on `params.p2StartingAge`. **Status: ✅ Complete**
    5.  When in single person mode, second person fields have to be read as if they were blank (but not made blank, so if the mode is set to two person again, they still have the values enyered before). This means that the current mode has to influence the behaviour of the simulator.
    6. When switching to single person mode, if there are second person events in the events table, a warning must be shown that they will be hidden and ignored. They need to come back if two-person mode is enabled again.

---

**Phase 7: Supporting Updates (Validation, Help, Event Labels)**

**Status: ✅ Complete**

*   **Objective:** Update various supporting parts of the application.
*   **Tasks (referencing Sections 3 & 5 of `two_peeps.md`):**
    1.  Update Dropdown Labels in `EventsTableManager.getEventTypeOptions()`: `SI: Salary Income (You)`, `SInp: Salary Income (Partner)`. **Status: ✅ Complete**
    2.  Event Validation (`UIManager.js`): Update `SInp` description in `valid` object. **Status: ✅ Complete**
    3.  Help System (`help.yml`): Update for `SInp` and two-person functionality. **Status: ✅ Complete**
    4.  Error Messages: Review and update messages related to old `SInp` behavior. **Status: ✅ Complete**

---

**Phase 8: Scenario File Versioning & Migration**

**Status: ✅ Complete**

*   **Objective:** Handle new scenario file formats.
*   **Tasks (referencing Section 6 of `two_peeps.md`):**
    1.  Increment the version number when saving a scenario, and add the necessary data for two-person mode scenarios. **Status: ✅ Complete**
    2.  Adapt the scenario load code to read both old and new versions. Two options are possible if the scenario is the old version:
        2.1. Migration Error Display: Explain changes, `SInp` meaning, manual review needed (no automatic migration).
        2.2. Replicate the P1 settings for P2. This should keep old scenarios working. Open a warning that explains the new settings. **Chosen Approach: Show warning, leave P2 blank. Status: ✅ Complete**
    3.  Adapt the Demo scenario to the new version. **Status: ✅ Complete**

---

**Phase 8.5: Refine Salary Event Types for Two Persons**

**Status: ✅ Complete**

*   **Objective:** Implement distinct salary event types for each person, keeping existing codes for Person 1 (`SI`, `SInp`) and introducing new codes for Person 2 (`SI2`, `SI2np`). This enhances clarity, consistency, ensures both persons have similar options in joint mode, and maintains backward compatibility for P1 events.
*   **Tasks:**
    1.  **Update `EventsTableManager.js` (`getEventTypeOptions`):** **Status: ✅ Complete**
        *   Modify to generate dropdown options for `SI`, `SInp`, `SI2`, `SI2np`.
        *   Labels:
            *   Single Mode: `SI` ("Salary Income"), `SInp` ("Salary (No Pension)").
            *   Joint Mode: `SI` ("Salary (You)"), `SInp` ("Salary (You, No Pension)"), `SI2` ("Salary (Them, Pensionable)"), `SI2np` ("Salary (Them, No Pension)").
            *   `SI2` and `SI2np` options should only appear in joint mode.
    2.  **Confirm Data Handling for Event Codes:** **Status: ✅ Complete**
        *   Verify that scenario loading logic correctly interprets existing `SI` and `SInp` events as belonging to Person 1. No explicit data migration is needed for these P1 event codes as they remain unchanged.
        *   Ensure new `SI2` and `SI2np` event types are handled correctly if encountered in future scenario versions.
    3.  **Implement Event Row Visibility Logic:** **Status: ✅ Complete**
        *   Add JavaScript (likely in `EventsTableManager.js` or `WebUI.js`) to:
            *   Hide event table rows of type `SI2` or `SI2np` when `simulation_mode` is switched to 'single'.
            *   Show these rows when `simulation_mode` is switched back to 'joint'.
            *   Ensure event type dropdowns in existing rows are refreshed or updated if available types change with mode.
    4.  **Update Core Simulation Logic (`Simulator.js`, `Person.js`):** **Status: ✅ Complete**
        *   Refactor `processEvents()` in `Simulator.js`:
            *   Handle `SI` (P1 pensionable salary), `SInp` (P1 non-pensionable salary).
            *   Handle `SI2` (P2 pensionable salary), `SI2np` (P2 non-pensionable salary), ensuring these are processed only if `person2` exists.
            *   Pension contributions for `SI`/`SI2` should use `person1.pensionContributionPercentageParam` and `person2.pensionContributionPercentageParam` respectively, applied to the event amount, and then `personX.pension.buy()`.
            *   `SInp`/`SI2np` events are salaries with no automatic pension contributions from that specific salary event.
        *   Verify `Revenue.js` correctly processes income attributed from these event types for tax calculations.
    5.  **Update `UIManager.js`:** **Status: ✅ Complete**
        *   Modify `getRequiredFields()` and any other validation logic to recognize `SI`, `SInp`, `SI2`, `SI2np`.
        *   Update descriptions, help text snippets, or placeholder text related to these salary event types.
    6.  **Update Test Cases:** **Status: ✅ Complete - Core logic & existing UI validation tests reviewed/updated for new salary event types. Specific UI row visibility tests may require new test cases.**
        *   Review and adapt existing tests (e.g., `TestSeparatePensionPots.js`, `TestRegressionTwoPerson.js`, relevant UI tests) to use and verify `SI`, `SInp`, `SI2`, `SI2np`.
        *   Include tests for correct pension contributions (or lack thereof for `SInp`/`SI2np` types).
        *   Test row visibility.
    7.  **Update Help System (`help.yml`):** **Status: ✅ Complete - User reviewed help.yml and opted for a minimal description for #EventType; detailed new salary type descriptions not included.**
        *   Revise help content to accurately describe `SI`, `SInp`, `SI2`, `SI2np`, their meanings, and their availability in single vs. joint modes.

---

**Phase 9: Testing & Refinement**

Status: 🔄 In Progress - Tasks 4, 5, & 6 complete.

*   **Objective:** Populate test cases from Phase 1, run all tests, ensure functionality.
*   **Tasks (referencing Section 8 of `two_peeps.md`):**
    1.  Flesh out `TestTwoPersonTaxCalculation.js` (age-related credits, PRSI, USC for P1/P2). **Status: ✅ Complete**
    2.  Flesh out `TestSeparatePensionPots.js` (individual contributions via `Person` objects, lump sums, drawdowns, P2 `withdraw` logic). **Status: ✅ Complete**
    3.  Flesh out `TestDualStatePensions.js` (timing/calculation for two people). **Status: ✅ Complete**
    4.  Flesh out `TestRegressionTwoPerson.js` (baseline scenarios). **Status: ✅ Complete**
        *   Established baseline financial metrics for the first two-person scenario (P1 Age 60).
        *   Added tests for P1 retirement, P2 retirement, late simulation stage, different income profile, and married scenario.
    5.  Flesh out `TestScenarioVersioning.js` (old/new format detection, errors). **Status: ✅ Complete**
    6.  Flesh out `TestValidation.js` (UI validation for P1/P2 data). **Status: ✅ Complete**
    7.  Comprehensive Scenario Testing: Manual tests for pension pots, lump sums, `withdraw` logic, error handling.
    8.  Iterate and Debug until all tests pass.

