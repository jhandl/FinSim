# Plan: Incremental Integration of Taxman Module with Unit Testing

**Objective:** Replace the legacy `Revenue.js` module with the new schema-driven `Taxman.js` module within `Simulator.js`. This plan outlines incremental steps to achieve this, incorporating **command-line unit testing** using Jest for robustness, emphasizing Test-Driven Development (TDD) principles for verification, and enabling parallel execution of both modules for comparison before the final switchover.

**Target Audience:** Senior Software Engineer

**Core Principles:**
*   **Incrementalism:** Each step should be small, verifiable, and leave the simulator in a runnable state.
*   **Unit Testing (Jest):** Implement unit tests for `Taxman` components using Jest, run via Node.js. Test pure logic, mocking dependencies. Load non-module scripts using `fs`/`eval`.
*   **Integration Verification (TDD):** Use logging/manual checks within simulator runs to verify integration steps. Consider adding automated integration tests later (Phase 6) that run the simulator with specific scenarios and configurations to catch issues missed by unit tests.
*   **Parallel Execution:** Implement `Taxman` alongside `Revenue` initially, allowing direct comparison of calculations using the same inputs.
*   **Deferred Switchover:** The core simulation logic will continue using `Revenue.netIncome()` until `Taxman` is fully verified. The final replacement of `Revenue` is the last step.
*   **Environment Agnosticism:** Ensure `Taxman` and its calculators (`src/core/tax/*`) are implemented as pure JavaScript logic, avoiding browser-specific dependencies.

---

### Phase 1: Setup and Basic Integration (Parallel Mode)

**Goal:** Set up testing, get `Taxman` instantiated, and receiving basic inputs alongside `Revenue` without affecting core simulation logic.

**Step 1.0: Set up Command-Line Unit Testing Infrastructure (Node.js + Jest)**
*   **Task (Completed):**
    *   Ensured npm was initialized (existing `package.json`).
    *   Installed Jest: `npm install --save-dev jest`.
    *   Configured Jest (added `test` script to `package.json`).
    *   Created the `test/` directory.
    *   **Compatibility Modifications:**
        *   Created `src/core/TaxmanDependencyLoader.js` to handle loading calculator/evaluator dependencies conditionally based on environment (Node.js `require` vs. Browser/GAS global).
        *   Modified `Taxman.js` constructor to use `TaxmanDependencyLoader`.
        *   Added conditional `module.exports = ClassName;` to `Taxman.js` and all calculator/evaluator scripts (`src/core/tax/*`) for Node.js compatibility.
    *   Wrote a simple placeholder test (`test/taxman.test.js`) that uses `require('../src/core/Taxman')` and verifies basic instantiation.
*   **Verification:** Ran `npm test` (or `npx jest`). The placeholder test passed, confirming the basic infrastructure and Node.js compatibility modifications work.

**Step 1.1: Instantiate Both Modules**
*   **Task (Completed):** Modified `initializeSimulator` in `Simulator.js`. Instantiated `Taxman` alongside `Revenue`. Added necessary `<script>` tags for `Taxman` and dependencies to `index.html`. Resolved environment-specific loading issues for `TaxmanDependencyLoader` in `Taxman.js`.
    ```javascript
    // In initializeSimulator()
    config = Config.getInstance(uiManager.ui);
    revenue = new Revenue(); // Keep existing
    try {
        // Placeholder for config and context for now
        const dummyTaxConfig = { schemaName: "GenericTaxSystem", schemaVersion: "1.0", countryCode: "XX", /* ... other minimal required fields */ };
        const dummySimContext = { evaluateFormula: () => 0, executeCustomRule: () => null };
        taxman = new Taxman(dummyTaxConfig, dummySimContext); // Add new Taxman instance
        console.log("Taxman instantiated successfully (dummy config).");
    } catch (e) {
        console.error("Failed to instantiate Taxman:", e);
        uiManager.setStatus("Taxman Init Error", STATUS_COLORS.ERROR);
        taxman = null; // Ensure taxman is null if init fails
    }
    dataSheet = [];
    return readScenario(validate = true);
    ```
*   **Verification (Integration & Unit Test):**
    *   Ran the simulator in the browser. Console logs showed "Taxman instantiated successfully (dummy config)." No initialization errors occurred.
    *   Ran `npm test`. Jest tests passed, confirming `Taxman` instantiation works in the Node.js environment.

**Step 1.2: Basic `simContext` Stub Implementation**
*   **Task (Completed):** Defined stub functions `evaluateFormulaStub` and `executeCustomRuleStub` directly within `Simulator.js` scope. These log their calls and return default values. Updated the `Taxman` instantiation in `initializeSimulator` to use these stubs. Ensured stubs are environment-agnostic.
    ```javascript
    // Example stubs (e.g., in Utils.js or Simulator.js scope)
    function evaluateFormulaStub(formula, contextData) {
        console.log(`evaluateFormulaStub called: ${formula}`, contextData);
        // Basic check for simple arithmetic if needed, otherwise return 0/NaN
        try {
            // VERY basic evaluation, replace with proper library later
            // Ensure contextData is safely accessible
            const safeContext = contextData || {};
            return new Function('context', `with(context) { try { return ${formula} } catch(e) { return NaN; } }`)(safeContext);
        } catch (e) {
            console.warn(`Formula evaluation failed for "${formula}": ${e}`);
            return NaN;
        }
    }
    function executeCustomRuleStub(identifier, contextData) {
        console.log(`executeCustomRuleStub called: ${identifier}`, contextData);
        return null; // Or a default structure if needed by Taxman
    }

    // In initializeSimulator() where Taxman is instantiated:
    const simContext = {
        evaluateFormula: evaluateFormulaStub,
        executeCustomRule: executeCustomRuleStub
        // Add other context needs later
    };
    taxman = new Taxman(dummyTaxConfig, simContext);
    ```
*   **Verification (Integration):**
    *   Run the simulator.
    *   Confirm `Taxman` still instantiates correctly.

**Step 1.3: Implement Configuration Loading (Task I.2)**
*   **Task (Completed):**
    *   Created a minimal Taxman configuration file: `src/core/config/minimal-tax-config.json`.
    *   Modified `src/core/Config.js`: Added a `loadTaxmanConfig` method to fetch the `minimal-tax-config.json` file using `ui.fetchUrl` and store it in `config.taxmanConfig`. Included basic validation checks (object type, schemaName, schemaVersion, countryCode).
    *   Modified `src/core/Simulator.js`: Updated `initializeSimulator` to retrieve the loaded configuration from `config.taxmanConfig` and pass it to the `Taxman` constructor, replacing the previous dummy/embedded config logic.
*   **Verification (Integration):**
    *   Ran the simulator.
    *   Checked console logs: Confirmed `Config.js` loaded `minimal-tax-config.json` successfully and performed basic validation.
    *   Checked console logs: Confirmed `Simulator.js` received the config from `Config.js`.
    *   Verified `Taxman` instantiated without errors using the configuration loaded via `Config.js`.

**Step 1.4: Parallel Income Declaration Mapping (Task I.5 - Income)**
*   **Task (Completed):** Went through `calculatePensionIncome` and `processEvents` in `Simulator.js`. For every `revenue.declareXyzIncome(...)` call, added a corresponding `taxman.declareIncome(type, amount, details)` call, passing arguments separately. Mapped the event types and amounts according to the `Taxman` API and the loaded schema's income types (e.g., 'employment', 'rental', 'state_pension', 'investment' for RSU).
    ```javascript
    // Example within processEvents case 'SI':
    revenue.declareSalaryIncome(amount, contribRate);
    if (taxman) {
        taxman.declareIncome({
            type: 'employment', // Map to schema's income type ID
            amount: amount,
            details: { pensionContribRate: contribRate } // Pass relevant details
        });
        console.log(`Taxman declared income: type=employment, amount=${amount}`);
    }
    // ... map other income types
    ```
*   **Verification (Integration - Completed):**
    *   Ran scenarios with various income events.
    *   Corrected `taxman.declareIncome` calls to pass arguments separately (`type`, `amount`, `details`) instead of as a single object, resolving `Type=[object Object], Amount=undefined` errors.
    *   Confirmed via console logs (`Taxman.js:84`) that `Taxman` receives the correct income types and amounts for each declaration within a year.

**Step 1.5: Yearly Reset**
*   **Task (Completed):** In `resetYearlyVariables` in `Simulator.js`, added a call to `taxman.reset()` to clear internal state at the start of each year.
*   **Verification (Integration - Completed):**
    *   Initially observed unreasonably high `Recalculated Total Gross Income` in `Taxman.js` logs, indicating state wasn't resetting.
    *   Added `taxman.reset()` call to `resetYearlyVariables`.
    *   Resolved `ReferenceError: currentState is not defined` by calling `taxman.reset()` without arguments (using its internal default `{}`).
    *   Confirmed via console logs (`Taxman.js:139`) that `Recalculated Total Gross Income` resets correctly each year and stays within reasonable bounds.

---

### Phase 2: Enabling Tax Calculation (Parallel Mode)

**Goal:** Assemble `currentState`, call `Taxman.computeTaxes`, add unit tests for core calculations, and log results for comparison.

**Step 2.1: Unit Test Core `Taxman` Logic**
*   **Task (Completed):** Wrote initial unit tests (`test/taxman.test.js`) for `Taxman`'s basic orchestration:
    *   Tested instantiation with valid/invalid configs.
    *   Tested `declareIncome` and verified internal state updates.
    *   Tested `reset` (including updating `currentState`).
    *   Tested `computeTaxes` with minimal `currentState` and a simple config, mocking calculator methods (`calculateAdjustments`, `calculateDeductionsAndAllowances`, `calculateIncomeTax`, `calculateContributions`, `calculateCGT`, `calculateInvestmentTax`, `calculateWealthTax`, `calculatePropertyTax`, `calculateCredits`, `_calculateTotalTaxLiability`).
*   **Verification (Unit Test - Completed):** Ran `npx jest`. All 15 tests in `test/taxman.test.js` passed, confirming the core logic tests are successful.

**Step 2.2: Assemble `currentState` Object (Task I.4)**
*   **Task (Completed):** In the main loop (`runSimulation` in `Simulator.js`), created the `currentState` object required by `taxman.computeTaxes`. Populated incrementally: `year`, `age`, `filingStatus` (placeholder 'single'), `dependents` (placeholder 0), basic `expenses` (`{ total: expenses }`). Added placeholders (`null` or `0`) for `assets`, `netWorth`, `liabilities`, `cgtLossCarryforward`, `pensionPlanType`, `residencyStatus`.
*   **Verification (Integration - Completed):**
    *   Added `console.log("Current State for Taxman (Initial):", currentState);`.
    *   Ran a simulation. Inspected the logged `currentState` each year. Confirmed basic fields populated.

**Step 2.3: Initial `Taxman.computeTaxes` Call (Parallel)**
*   **Task (Completed):** In `runSimulation` after assembling `currentState`, added a call `taxmanResult = taxman.computeTaxes(currentState)` within a `try...catch` block (only if `taxman` is not null). Stored the result in `taxmanResult`. Logged the result using `JSON.stringify(taxmanResult, null, 2)`. Ensured core logic still uses `Revenue`.
*   **Verification (Integration - Completed):**
    *   Ran a simple simulation. Checked console logs for `Taxman Result`. Verified execution without errors.
    *   **Bug Found & Fixed:** A `TypeError: contributions is not iterable` occurred in `SocialContributionsCalculator` because `minimal-tax-config.json` had `"socialContributions": {}` instead of `[]`. Fixed the config file.

**Step 2.4: Unit Test `IncomeTaxCalculator` Basics**
*   **Task (Completed):** Wrote unit tests (`test/incomeTaxCalculator.test.js`) for basic `IncomeTaxCalculator` functions:
    *   Calculating taxable income from gross/AGI with simple allowances/deductions.
    *   Applying tax brackets (`calculateTaxWithBrackets`).
    *   Calculating simple credits.
*   **Verification (Unit Test - Completed):**
    *   **Debugging:** Initial tests failed (received 0 instead of expected values). Debugging revealed issues with mocking `SchemaEvaluator.calculateValue` and how the test configuration was being accessed by the calculator instance.
    *   **Resolution:**
        *   Refined the `calculateValue` mock to better handle common rule structures (`calculationRule.value`, `rule.value`, `rule.amount`).
        *   Moved `IncomeTaxCalculator` instantiation inside each `it` block, after setting up the test-specific configuration in `mockTaxman.taxConfig`.
        *   Ensured relevant `mockTaxman.calculated` properties were reset before each test method call.
        *   Added mock expense data (`mockTaxman.expenses`) for the itemized deduction test.
    *   Ran `npx jest`. All tests in `test/incomeTaxCalculator.test.js` (and `test/taxman.test.js`) passed.

**Step 2.5: Complete `currentState` Assembly (Task I.4 continued)**
*   **Task (Completed):** Reviewed `Simulator.js` (`runSimulation` loop, lines ~179-245). The code already populates the `currentState` object by carefully mapping the simulator's state:
    *   Calculated `assets` array (including `cash`, `indexFund`, `shares`, `pension`, and individual `realEstateProperty` objects with `value` derived from asset class methods and `costBasis` derived from internal state like purchase amounts or downpayments). The existing asset classes provide sufficient data for this mapping at present.
    *   Calculated `liabilities` (currently `mortgageTotal` estimated from property data).
    *   Calculated `netWorth` (`totalAssetsValue - totalLiabilities`).
    *   Included placeholders: `cgtLossCarryforward: 0` (handled in Step 3.4), `filingStatus: 'single'`, `dependents: 0`, `pensionPlanType: null`, `residencyStatus: 'resident'`. These will be mapped properly when required by later features or specific tax schemas.
*   **Verification (Integration - Completed):**
    *   Ran diverse simulations. Inspected the existing `console.log` output for `currentState` each year. Verified all fields are populated plausibly based on the simulation state and the current mapping logic.

---

### Phase 3: Implementing Core `Taxman` Features & Tests

**Goal:** Implement essential supporting logic (`simContext`, CGT) and corresponding unit tests.

**Step 3.1: Unit Test `SchemaEvaluator`**
*   **Task (Completed):** Wrote unit tests (`test/schemaEvaluator.test.js`) for `SchemaEvaluator`:
    *   Tested `evaluateCondition` with various operators, data types, context precedence, and custom rules.
    *   Tested `calculateValue` with different methods (fixed, percentage, perDependent, formula, lookup, custom), basis sources, context, filters, and min/max caps. This covers the core logic for schema-defined allowances, deductions, and credits which rely on `CalculationRule` objects.
    *   Tested the *call* to the mocked `evaluateFormula` utility when `rule.method === 'formula'` (full implementation/testing of `evaluateFormula` is Step 3.2).
    *   Tested `applyPhaseOut` with thresholds, taper rates, and floors, covering phase-out logic applicable to allowances/deductions/credits.
    *   Tested `calculateBracketTax` with various amounts and bracket structures.
    *   Tested internal helpers `getBasisValue` (including dot notation), `countDependents` (including filters), and `getMarginalIncomeRate`.
*   **Verification (Unit Test - Completed):**
    *   Ran `npx jest test/schemaEvaluator.test.js`.
    *   Initial run failed 2 tests (`calculateValue` with `dependentTypeFilter` and `getBasisValue` with dot notation into `incomeSources`).
    *   Fixed issues in `SchemaEvaluator.js` related to filter source and dot notation object traversal.
    *   Re-ran `npx jest test/schemaEvaluator.test.js`. All 66 tests passed.

**Step 3.2: Implement `simContext` (Task I.3, II.8)**
*   **Task (Completed):** Replaced the stub functions from `Simulator.js`.
    *   **`evaluateFormula`:** Moved the existing basic `Function`-based implementation from the `Simulator.js` stub to `Utils.js` as a global function. `Taxman.js` was updated to use this global function directly. *Note: A more robust parser like `expr-eval` might be considered later if complex formulas are needed.*
    *   **`executeCustomRule`:** Added a private dispatcher method `_executeCustomRule` within `Taxman.js`. `Taxman.js` constructor now points `this.utils.executeCustomRule` to this internal method. Specific custom rule logic needs to be added to `_executeCustomRule` as required by schemas.
*   **Verification (Unit Test & Integration - Completed):**
    *   Unit tests added for `Utils.evaluateFormula` and `Taxman._executeCustomRule` (`test/utils.test.js`, `test/taxman.test.js`), confirming their basic functionality.
    *   Simulation runs with the minimal config confirmed these functions are not currently triggered (as expected), deferring comparison with `Revenue` using complex configs to Phase 6.

**Step 3.3: Unit Test `CapitalGainsTaxCalculator` Basics**
*   **Task (Completed):** Wrote unit tests (`test/cgtCalculator.test.js`) for `CapitalGainsTaxCalculator`:
    *   Tested gain/loss declaration and aggregation (by type).
    *   Tested application of annual exemption.
    *   Tested basic rate calculation (flat rate).
    *   Tested basic loss offsetting (within year, same type).
    *   Tested carryforward calculation (including using previous year's carryforward).
    *   **Refactoring:** Added `reset()` and `declareGainOrLoss()` methods to `CapitalGainsTaxCalculator` and refactored `calculateCapitalGainsTax()` (renamed from `calculateCGT`) to read internal state and return a result object, improving testability.
*   **Verification (Unit Test - Completed):**
    *   Ran `npx jest test/cgtCalculator.test.js`. Initial runs failed due to missing `reset` method and incorrect test expectations after refactoring.
    *   Ran `npx jest` (full suite). Revealed failures in `test/taxman.test.js` due to the method rename (`calculateCGT` -> `calculateCapitalGainsTax`).
    *   Updated `test/taxman.test.js` mocks and `Taxman.js` internal calls to use the new method name and handle the returned result object.
    *   Ran `npx jest` again. All 96 tests across 4 suites passed.

**Step 3.4: Map CGT Declarations & Handle Carryforward (Task I.5-CGT, I.6)**
*   **Task (Completed):**
    *   Added minimal calls to `taxman.declareCapitalGainOrLoss` within `Equity.sell` and `IndexFunds.addYear` (for deemed disposal) in `src/core/Equities.js`. These calls derive necessary parameters (gain/loss, cost basis, sale proceeds, holding period, asset type) from existing variables used by the original `Revenue` logic path, ensuring no change to the `Revenue` calculations or the original class structure. The original calls to `revenue.declareInvestmentIncome` and `revenue.declareInvestmentGains` remain untouched.
    *   Verified `src/core/RealEstate.js` contains the `taxman.declareCapitalGainOrLoss` call in `sell`, added previously without affecting original logic.
    *   Verified `src/core/Simulator.js` correctly initializes `cgtLossCarryforward`, passes it to `currentState.cgtLossCarryforward`, and updates it with `taxmanResult.newLossCarryforward` after each `computeTaxes` call.
*   **Verification (Integration & Debugging - Completed):**
    *   Ran scenarios with asset sales.
    *   Verified `taxman.declareCapitalGainOrLoss` delegation via logs. Debugged and fixed issues in declaration flow (Taxman -> Calculator) and calculator's entry processing/validation.
    *   Verified `cgtLossCarryforward` state propagation via `currentState` logs and `taxmanResult.newLossCarryforward`.
    *   Confirmed `Taxman` calculates non-zero CGT using the updated minimal config. Comparison logging added to `Simulator.js`. Full comparison/reconciliation with `revenue.cgt` deferred to Phase 6 (using full config).

---

### Phase 4: Implementing Event-Driven & Advanced Features & Tests

**Goal:** Implement calculators/logic for specific events and advanced `Taxman` features, adding unit tests.

**Step 4.1: Implement and Unit Test Event-Driven Calculators**
*   **Task (Completed):**
    *   **Implement:**
        *   Created `src/core/tax/TransferTaxCalculator.js` with placeholder logic and `reset`/`declareTransfer`/`calculateTransferTax` methods. Added Node.js compatibility.
        *   Created `src/core/tax/PensionWithdrawalCalculator.js` with placeholder logic and `reset`/`declareWithdrawal`/`calculatePensionWithdrawalTax` methods. Added Node.js compatibility.
        *   Refactored `src/core/tax/CapitalGainsTaxCalculator.js`: Removed incorrect `declareDeemedDisposal`. Added logic within `calculateCapitalGainsTax` to automatically check `currentState.assets` against `unrealizedGainsTaxRules` from the schema, calculate tax on unrealized gains if rules are met (e.g., holding period), and add results to a new `unrealizedGainsTax` section in the return object. Added `costBasisUpdates` array to the return object to signal necessary updates to the simulator. Corrected `calculateValue` calls in `TransferTaxCalculator` and `PensionWithdrawalCalculator` to pass the full rule object.
    *   **Unit Test:**
        *   Created `test/transferTaxCalculator.test.js` covering instantiation, reset, declaration, and basic calculation logic using mocks. Corrected mock implementation and assertion for `calculateValue` calls.
        *   Created `test/pensionWithdrawalCalculator.test.js` covering instantiation, reset, declaration, and placeholder logic for early/lump sum withdrawals using mocks.
        *   Added tests to `test/cgtCalculator.test.js` specifically for the automatic unrealized gains tax logic, covering threshold checks (holding period, asset type), calculation, rate application, cost basis update signalling, and interaction with regular CGT. Removed outdated "deemed disposal" tests. Corrected `declareGainOrLoss` calls to use `amount` property and fixed incorrect re-instantiation in one test.
*   **Verification (Unit Test - Completed):** Ran `npm test`. All 7 test suites (131 tests) passed, confirming the new calculators and modifications function correctly at the unit level.

**Step 4.2: Implement Event-Driven Calculator Calls & Cost Basis Updates (Task I.7)**
*   **Task (Completed):**
    *   Modified `processEvents` in `Simulator.js`: Added `case` statements for 'Gift', 'Inheritance', and 'PensionWithdrawal' events. These cases now call `taxman.declareTransfer` or `taxman.declarePensionWithdrawal` respectively, passing relevant details extracted or defaulted from the event object.
    *   Added `applyUnrealizedGainsTax` method to `IndexFunds` class in `src/core/Equities.js`. This method updates the internal cost basis of holdings affected by unrealized gains tax rules (e.g., deemed disposal), mirroring the existing logic in `addYear` to maintain compatibility during the parallel run phase.
    *   Modified `runSimulation` in `Simulator.js`: After the `taxman.computeTaxes` call, added logic to check for `taxmanResult.costBasisUpdates`. If updates exist (signalled by `CapitalGainsTaxCalculator`), it now calls the `applyUnrealizedGainsTax` method on the relevant asset instance (`indexFunds`) to apply the cost basis change.
    *   Removed 'DeemedDisposal' event handling from `processEvents` as this is now automatically handled within `CapitalGainsTaxCalculator` based on schema rules and `currentState`, triggering the `costBasisUpdates` signal.
*   **Verification (Unit Test - Completed):**
    *   Enhanced unit tests for `TransferTaxCalculator`, `PensionWithdrawalCalculator`, and `CapitalGainsTaxCalculator` using mock configurations based on `Design.md`.
    *   Fixed calculator logic in `TransferTaxCalculator`, `PensionWithdrawalCalculator`, and `CapitalGainsTaxCalculator` to correctly implement schema rules for annual exclusions, relationship thresholds, withdrawal penalties/tax-free portions, and unrealized gains tax.
    *   Fixed test expectations and mock interactions in `test/transferTaxCalculator.test.js`, `test/pensionWithdrawalCalculator.test.js`, and `test/cgtCalculator.test.js`.
    *   Ran `npm test`. All 7 test suites (135 tests) now pass.
    *   *Note: Integration testing with specific simulation scenarios is still recommended in Phase 6.*

**Step 4.3: Unit Test `Taxman` Module Enhancements**
*   **Task (Completed):** Added specific unit tests (`test/taxman.test.js`) covering the enhancements from `FurtherWork.md` Section II, focusing on verifying that `Taxman` makes the necessary context available to the calculators:
    *   CGT asset type specificity (verified `declareCapitalGainOrLoss` receives type).
    *   CGT `integratedWithIncome` rate mapping (verified `taxableIncome` is calculated before `calculateCapitalGainsTax`).
    *   Investment Income `asOrdinaryIncome`/`asCapitalGains` (verified `taxableIncome` is calculated before `calculateInvestmentTax`).
    *   Investment Income allowance by bracket (verified `adjustedGrossIncome` is calculated before `calculateInvestmentTax`).
    *   Residency Rules (non-resident, foreign tax relief) (verified `residencyStatus` and `foreignIncome` are set on the instance).
    *   Pension Plan Type Matching (verified `pensionPlanType` is set on the instance before `calculateAdjustments`).
    *   Property Tax Location Check (verified `assets` with location are set on the instance before `calculatePropertyTax`).
*   **Verification (Unit Test - Completed):** Ran `npx jest`. All 7 test suites (143 tests) passed, confirming the new tests function correctly.

**Step 4.4: Implement `Taxman` Module Enhancements (Task Section II)**
*   **Task (Completed):** Systematically implemented the refinements listed in `FurtherWork.md` Section II within the respective `Taxman` calculator classes (`SchemaEvaluator`, `CapitalGainsTaxCalculator`, `InvestmentIncomeTaxCalculator`, `IncomeTaxCalculator`, `PropertyTaxCalculator`) and `Taxman.js` (`_executeCustomRule`). Integrated the new `ResidencyRulesHandler` structure.
*   **Verification (Unit Test - Completed, Integration - Deferred):**
    *   Unit tests in `test/taxman.test.js` (Step 4.3) confirmed that `Taxman` correctly passes the necessary context (e.g., income levels, residency status, asset details) to the relevant calculators for these enhancements.
    *   Integration testing with specific simulation scenarios and tailored tax configs to fully exercise these enhancements is deferred to Phase 6.

**Step 4.5: Unit Test CGT Loss Offset vs Income**
*   **Task (Completed):** Add unit tests to `IncomeTaxCalculator` or `Taxman` tests verifying the chosen mechanism for offsetting CGT losses against income tax correctly reduces the final income tax liability.
*   **Verification (Unit Test - Completed):** Ran `npx jest`. Added test in `test/taxman.test.js` verified that `_calculateTotalTaxLiability` correctly reduces liability based on `lossOffsetAgainstIncome` and the mocked marginal rate. All tests passed.

**Step 4.6: Implement CGT Loss Offset vs Income (Task I.8)**
*   **Task (Completed):** Reviewed the existing implementation in `Taxman.js` (`_calculateTotalTaxLiability`). It already handles `currentYearLossOffsettingIncome` by calculating an estimated tax benefit using the marginal income rate (`SchemaEvaluator.getMarginalIncomeRate()`) and subtracting this benefit from the final `netLiability`. This fulfills the requirement.
*   **Verification (Unit Test - Completed):** Unit tests added in Step 4.5 (`test/taxman.test.js`) already cover this mechanism and passed, verifying the liability reduction logic.
*   **Verification (Integration - Deferred):** Integration testing with scenarios involving capital losses exceeding gains is deferred to Phase 6.
    *   Verify the mechanism correctly reduces income tax liability in `taxmanResult`. Compare with unit tests/manual calculations.

---

### Phase 5: Enhance Schema/Engine Generality (New)

**Goal:** Refactor the `Taxman` engine, schema design, and calculator implementations to allow common calculation methods (brackets, lookups, formulas) to be applied more universally across different tax components (limits, allowances, contributions, etc.), making calculators agnostic to the specific calculation method defined in the configuration and reducing the need for custom code identifiers.

**Step 5.1: Analyze Engine & Identify Assumptions**
*   **Task (Completed):** Performed a detailed analysis of `SchemaEvaluator.js` and its usage in `IncomeTaxCalculator.js`. Identified that the primary limitation for generality is the lack of `method: 'brackets'` support in the generic `calculateValue` function and the specialized handling of brackets, allowances, and itemized deductions within specific calculators.
*   **Verification (Completed):** The analysis and identified limitations/assumptions are documented in `EngineAnalysis.md`.

**Step 5.2: Refactor Core Engine Logic (`SchemaEvaluator`)**
*   **Task (Completed):** Reviewed `SchemaEvaluator.calculateValue`. Contrary to the initial analysis in `EngineAnalysis.md` (Finding 1), the `calculateValue` method *already* included a `case` for `method: 'brackets'`, correctly using `getBasisValue` and `calculateBracketTax`. Therefore, no code changes were required for this specific aspect of generalization. The engine already supports universal bracket application via `CalculationRule`.
*   **Verification (Completed):** Code review confirmed the existing implementation handles `method: 'brackets'` correctly within `calculateValue`. Unit tests in Step 5.6 will further verify this generalization.

**Step 5.3a: Update `Design.md` Schema Documentation**
*   **Task (Completed):** Modified `Design.md` (Section 4, Common Data Structures). Updated the descriptions for `TaxBracket` and `CalculationRule` to explicitly state that methods like `brackets` and `lookup` are generally applicable to any component defined via `CalculationRule` (e.g., limits, allowances, rates). Clarified the `basis` field description within `CalculationRule`. Removed a deprecated comment related to `amountByIncomeBracket` in the `investmentIncomeTax` section example.
*   **Verification (Completed):** `Design.md` accurately reflects the enhanced, more generic capabilities of the `CalculationRule` and provides clear examples. The changes were applied successfully.

**Step 5.3b: Refactor `Design.md` Schema Definitions**
*   **Task (Completed):** Systematically reviewed and refactored schema definitions in `Design.md`. Replaced numerous fixed numeric attributes (identified in `EngineAnalysis.md`, Finding 2, such as thresholds, rates, limits, exemptions, allowances across various tax sections) with `CalculationRule` objects (e.g., `thresholdRule`, `rateRule`, `amountRule`). This enhances schema flexibility for dynamic calculations using the generalized engine.
*   **Verification (Completed):** Code review confirms schema definitions in `Design.md` were successfully updated to use `CalculationRule` where appropriate, replacing previous fixed numeric values.

**Step 5.4: Adapt Calculators to Use Generalized Engine**
*   **Task (Completed):** Reviewed and modified calculator classes (`SchemaEvaluator`, `IncomeTaxCalculator`, `SocialContributionsCalculator`, `CapitalGainsTaxCalculator`, `InvestmentIncomeTaxCalculator`, `WealthTaxCalculator`, `PropertyTaxCalculator`, `TransferTaxCalculator`, `PensionWithdrawalCalculator`). Updated code to consistently use `SchemaEvaluator.calculateValue` for values previously defined as fixed numbers in the schema but now represented by `CalculationRule` objects (e.g., thresholds, rates, limits, exemptions, allowances, penalties, tax-free portions). Refactored `SchemaEvaluator.applyPhaseOut` to use `calculateValue` for its components. `ResidencyRulesHandler.js` required no changes as its relevant methods are currently placeholders.
*   **Verification (Completed):** Code review confirms calculators now consistently use `SchemaEvaluator.calculateValue` for components defined via `CalculationRule` in the updated schema (`Design.md` Step 5.3b), replacing previous direct access or specialized logic.

**Step 5.5: Re-evaluate & Document USC Per-Person Logic**
*   **Task (Completed):** Investigated if the per-person USC calculation could be modeled purely via schema configuration after the Phase 5 generality refactoring. **Conclusion:** While the engine is more general, handling per-person calculations like USC still requires a `customRuleIdentifier` (e.g., 'calculateUSC'). This is because the generic calculator processes aggregated income from `currentState` by default, and `currentState` lacks the necessary structured per-individual income breakdown for purely schema-driven per-person application. Relying on a custom rule is more practical and isolates the specific logic.
*   **Task (Completed):** Updated `Design.md` (Sections 4 & 7) based on the findings, clarifying the need for custom rules for per-person calculations and refining the description of `customRuleIdentifier`.
*   **Verification (Completed):** `Design.md` was updated to explain how per-person social contributions are handled, confirming the necessity of the custom rule approach for cases like USC.

**Step 5.6: Implement & Verify Unit Tests for Generality**
*   **Task (Completed):** Wrote new unit tests (`test/socialContributionsCalculator.test.js`, `test/investmentIncomeTaxCalculator.test.js`, `test/wealthTaxCalculator.test.js`, `test/propertyTaxCalculator.test.js`) and updated existing ones (`test/schemaEvaluator.test.js`, `test/incomeTaxCalculator.test.js`, `test/cgtCalculator.test.js`, `test/transferTaxCalculator.test.js`, `test/pensionWithdrawalCalculator.test.js`) for `SchemaEvaluator` and the adapted calculators (from Step 5.4). These tests specifically verified:
    *   `SchemaEvaluator.calculateValue` correctly applies different methods (`brackets`, `lookup`, `formula`, etc.) universally based on the rule definition and context.
    *   Calculators correctly invoke `calculateValue` or `calculateBracketTax` for various components (limits, allowances, deductions, credits, rates, thresholds, etc.) defined via `CalculationRule`.
    *   End-to-end calculation works for components now using generalized rules (e.g., calculating a pension contribution limit using `method: 'brackets'` based on `age`, calculating an allowance using `method: 'lookupTable'` based on `filingStatus`).
*   **Verification (Completed):** Ran `npm test`. All 11 test suites (178 tests) passed, confirming the engine correctly applies different calculation methods universally and that calculators correctly use the generalized engine based on the rule definition and context after debugging and fixing test setup/logic issues.

---

### Phase 6: Validation, Final Switchover, and Cleanup (Was Phase 5)

**Goal:** Validate `Taxman` against `Revenue` (Irish config), ensure asset class compatibility, switch core logic, perform final cleanup, and update documentation.

**Step 6.0: Create Irish Tax Configuration File (Completed)**
*   **Task (Completed):** Created the `src/core/config/IE-2026.json` configuration file based on `Design.md`, `Revenue.js`, and `finance-simulation-config-1.26.json`. Mapped existing Irish tax rules (IT, PRSI, USC, CGT, Pensions) to the new schema structure. Removed comments to ensure valid JSON. **Note:** This config may need updates after Phase 5 refactoring to use newly generalized calculation methods instead of custom identifiers where applicable.
*   **Verification (Completed):** The file `src/core/config/IE-2026.json` was created, is valid JSON, structurally conforms to `Design.md`, and reflects the logic from `Revenue.js` and the legacy config. Identified areas requiring custom logic (`complexRulePlaceholders`) - *subject to revision after Phase 5*.

**Step 6.1: Analyze Asset Classes & Adapt Config/State (Completed)**
*   **Task (Completed):** Reviewed core asset classes (`Equities.js`, `RealEstate.js`) and compared their data with `Design.md` and `IE-2026.json`. Identified that specific asset subtypes (e.g., `indexFundIreland`, `nonEuShare`) were not tracked. Instead of modifying asset classes, adapted the configuration and simulator state:
    *   Modified `src/core/config/IE-2026.json`: Changed the specific Irish index fund CGT rule (`ratesByAssetAndHolding`) to apply to the generic `assetType: "index_fund"`. Removed the `nonEuShares` section from `investmentIncomeTax`.
    *   Modified `src/core/Simulator.js`: Corrected the calculation of `costBasis` for `realEstateProperty` within `currentState.assets` to be `prop.paid + prop.borrowed`.
*   **Verification (Completed):** Code review confirmed the changes in `IE-2026.json` and `Simulator.js`. Simulation runs can now proceed using the adapted configuration and corrected state calculation.

**Step 6.2: Intensive Parallel Comparison & Integration Testing (Irish Config)**
*   **Task:**
    *   Update `src/core/config/IE-2026.json` based on the outcomes of Phase 5 (replacing custom identifiers **and fixed values** with generalized schema rules where possible).
    *   Load the updated Irish tax configuration JSON into `Taxman`.
    *   Run a wide range of simulation scenarios, specifically including those exercising:
        *   Complex formulas and potentially remaining custom rules (`simContext` comparison deferred from Step 3.2).
        *   Newly generalized calculation methods (e.g., pension limits via brackets) introduced in Phase 5.
        *   Various capital gains/loss scenarios (CGT comparison deferred from Step 3.4).
        *   Gift, Inheritance, and Pension Withdrawal events (Integration testing deferred from Step 4.2).
        *   Unrealized gains tax and cost basis updates (Integration testing deferred from Step 4.2, using data verified in Step 6.1).
        *   Module enhancements from Section II (Residency, advanced CGT/Investment rules, etc.) (Integration testing deferred from Step 4.4).
        *   Scenarios with capital losses exceeding gains (CGT loss offset vs income integration deferred from Step 4.6).
    *   Enhance logging in `updateYearlyData` for clear side-by-side comparison of `revenue` vs `taxmanResult` tax components (including CGT, net income, etc.).
    *   Analyze discrepancies. Debug `Taxman` logic/config or asset class data provision (Step 6.1) as needed. Implement any remaining necessary custom logic or refine generic engine logic based on Phase 5 findings.
    *   Add automated integration tests that run the full tax system with specific input scenarios and configurations (like the Irish config) to verify end-to-end behavior and catch configuration-related errors missed by unit tests.
*   **Verification (Integration & Unit Test):** Achieve confidence that `Taxman`, using the updated configuration, the enhanced engine from Phase 5, and data from the reviewed asset classes (Step 6.1), produces results matching `Revenue` **within acceptable rounding tolerances** given the same inputs. Ensure relevant unit tests pass with the Irish config snippets. Integration tests should pass for key scenarios.

**Step 6.3: Adapt Core Simulation Logic (Conditional)**
*   **Task:** Modify `handleInvestments` and `withdraw` function.
    *   Introduce `const USE_TAXMAN_FOR_LOGIC = true;`.
    *   If true and `taxmanResult` available, calculate `taxmanNetIncome` (Gross Income - `taxmanResult.totalTaxLiability`). Define Gross Income consistently.
    *   Use `taxmanNetIncome` instead of `revenue.netIncome()` for savings/withdrawal logic.
*   **Verification (Integration):**
    *   Run simulations with `USE_TAXMAN_FOR_LOGIC = true`.
    *   Monitor savings/withdrawal behavior. Verify logical progression using `Taxman`'s net income. Compare key outcomes (e.g., final net worth) with runs using `Revenue`.

**Step 6.4: Final Switchover**
*   **Task:** Once Step 6.3 is validated:
    *   Remove `Revenue` instantiation and all calls.
    *   Remove `USE_TAXMAN_FOR_LOGIC` flag and conditional logic.
    *   Update `updateYearlyData` to source tax components from `taxmanResult`.
    *   Remove parallel execution code/comparison logging.
*   **Verification (Integration):**
    *   Run final regression tests. Ensure simulator runs correctly using only `Taxman`. Verify output data sheet and UI.

**Step 6.5: Schema Validation & Refinement (Task III.1, III.3)**
*   **Task:**
    *   Implement robust JSON schema validation during config loading (Task III.1), potentially using a library like `ajv`. Add unit tests for the validation logic.
    *   Based on challenges encountered during implementation and testing (especially Step 6.2 and the generality enhancements in Phase 5), refine `Design.md` if necessary (Task III.3).
*   **Verification (Unit Test & Integration):** Test config loading with invalid schemas. Review `Design.md` changes. Ensure the final Irish config passes validation.

**Step 6.6: Final Review (New)**
*   **Task:** Perform a holistic review of the completed work against the original objectives (`FurtherWork.md`) and this plan. Confirm all tasks are complete, documentation is updated, tests pass, and the system functions as expected with `Taxman`.
*   **Verification:** Stakeholder confirmation that the project goals have been met and the `Taxman` integration is complete and correct according to the plan.

**Step 6.7: Cleanup and Documentation**
*   **Task:**
    *   Remove temporary logging/test code from simulator and asset classes.
    *   Ensure code comments are updated throughout the affected modules.
    *   Ensure all unit and integration tests pass. Review test coverage reports.
    *   **Unify Deemed Disposal Logic:** Refactor `IndexFunds.js` to remove the duplicated deemed disposal / unrealized gains tax logic. The cost basis update should be driven solely by the `applyUnrealizedGainsTax` method called from `Simulator.js` based on `Taxman` results, removing the logic from `IndexFunds.addYear`. Verify this refactoring with tests.
    *   Finalize this `FurtherWorkPlan.md` document, marking all steps as complete.
    *   Update `TaxManual.md` to reflect the `Taxman` implementation.
    *   **Update `Architecture.md` to reflect the final state with `Taxman` replacing `Revenue`.**
*   **Verification:** Code review, final simulation runs, passing unit and integration tests, updated and reviewed documentation artifacts (`FurtherWorkPlan.md`, `TaxManual.md`, `Architecture.md`).

---