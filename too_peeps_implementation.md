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

**Overall Progress:** Phase 3 Complete. Next step: Phase 4 - Task 1.

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

**Status: ⏸️ Not started**

*   **Objective:** Update revenue and tax logic for two individuals.
*   **Tasks:**
    1.  **Adapt `Revenue.prototype.reset(person1, person2_optional)`:**
        *   Accept `person1` (Person object) and optional `person2` (Person object).
        *   Store `this.currentAgeP1 = person1.age;`
        *   Store `this.currentAgeP2 = person2 ? person2.age : undefined;`
        *   Revenue.js detects Person 2 presence via `this.currentAgeP2`.
    2.  **Adapt `Revenue.prototype.declareSalaryIncome(amount, contribRate, personAge)`:**
        *   This function now takes `personAge`. It should store salaries along with the associated `personAge` (e.g., in an array of objects `[{amount, contribRate, age}, ...]`).
    3.  **Update `this.people`:** Logic based on `this.salaries.length` and presence of `this.currentAgeP2`.
    4.  **Refine `computeIT()`:** Use `this.currentAgeP1` and `this.currentAgeP2` for age-related credits and exemptions.
    5.  **Refine `computePRSI()`:** Base PRSI exemption on `this.currentAgeP1` for non-PAYE. For PAYE, it will use ages from stored salaries.
    6.  **Refine `computeUSC()`:**
        *   When looping through stored salaries, use the `age` associated with each salary entry for correct USC bands/rates (`config.uscReducedRateAge`).
        *   Handle non-salary income USC based on `this.currentAgeP1`.
    7.  **Lump Sum Handling (`declarePrivatePensionLumpSum`):** The existing aggregation logic should still work as it's called per lump sum event.

---

**Phase 5: HTML Updates (`src/frontend/web/ifs/index.html`)**

**Status: ⏸️ Not started**

*   **Objective:** Add new input fields to the HTML for Person 2's data.
*   **Tasks (referencing Section 1 of `two_peeps.md`):**
    1.  Add Input Fields: `P2StartingAge`, `P2RetirementAge`, `P2StatePensionWeekly`, `InitialPensionP2`, `PensionContributionPercentageP2`. Ensure HTML IDs match.
    2.  Update Labels for P1 fields and joint fields (e.g., "Person 1 Current Age", "Current Savings (Joint)", "Person 1 Pension Fund").
    3.  Data Table: Keep existing `PensionFund` column for combined value.

---

**Phase 6: UI Parameter Reading & Validation (JavaScript - `WebUI.js`)**

**Status: ⏸️ Not started**

*   **Objective:** Update UI logic to read new parameters and implement validation.
*   **Tasks (referencing Section 2 of `two_peeps.md`):**
    1.  Modify `WebUI.prototype.getParameters`: Read new P2 fields and pension fields, store as `p2StartingAge`, `initialPensionP2`, etc. in `params`.
    2.  Person 1 Validation: `startingAge` and `retirementAge` required if either provided.
    3.  Person 2 Validation: If any P2 field provided, `p2StartingAge` and `p2RetirementAge` become required.
    4.  Person 2 Detection Logic (for UI): Based on `params.p2StartingAge`.

---

**Phase 7: Supporting Updates (Validation, Help, Event Labels)**

**Status: ⏸️ Not started**

*   **Objective:** Update various supporting parts of the application.
*   **Tasks (referencing Sections 3 & 5 of `two_peeps.md`):**
    1.  Update Dropdown Labels in `EventsTableManager.getEventTypeOptions()`: `SI: Salary Income (Person 1)`, `SInp: Salary Income (Partner)`.
    2.  Event Validation (`UIManager.js`): Update `SInp` description in `valid` object.
    3.  Help System (`help.yml`): Update for `SInp` and two-person functionality.
    4.  Error Messages: Review and update messages related to old `SInp` behavior.

---

**Phase 8: Scenario File Versioning & Migration**

**Status: ⏸️ Not started**

*   **Objective:** Handle new scenario file formats.
*   **Tasks (referencing Section 6 of `two_peeps.md`):**
    1.  Increment Scenario File Version Number.
    2.  Old Scenario Detection on load.
    3.  Migration Error Display: Explain changes, `SInp` meaning, manual review needed.
    4.  No Automatic Migration.

---

**Phase 9: Testing & Refinement**

**Status: ⏸️ Not started**

*   **Objective:** Populate test cases from Phase 1, run all tests, ensure functionality.
*   **Tasks (referencing Section 8 of `two_peeps.md`):**
    1.  Flesh out `TestTwoPersonTaxCalculation.js` (age-related credits, PRSI, USC for P1/P2).
    2.  Flesh out `TestSeparatePensionPots.js` (individual contributions via `Person` objects, lump sums, drawdowns, P2 `withdraw` logic).
    3.  Flesh out `TestDualStatePensions.js` (timing/calculation for two people).
    4.  Flesh out `TestRegressionTwoPerson.js` (baseline scenarios).
    5.  Flesh out `TestScenarioVersioning.js` (old/new format detection, errors).
    6.  Flesh out `TestValidation.js` (UI validation for P1/P2 data).
    7.  Comprehensive Scenario Testing: Manual tests for pension pots, lump sums, `withdraw` logic, error handling.
    8.  Iterate and Debug until all tests pass.

---

**Key Simplifications (to keep in mind, from Section 7 of `two_peeps.md`):**
*   P2's pension contribution rate defaults to P1's if not specified (handled during `Person` object creation for P2).
*   Financial accounts (savings, funds, shares) remain joint.
*   `SI`/`SInp` for person identification in salary events.
*   Combined pension display in output table.
*   Clear validation errors for P2 data. 