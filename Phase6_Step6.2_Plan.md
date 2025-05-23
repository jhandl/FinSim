# Plan: Phase 6, Step 6.2 - Intensive Parallel Comparison & Integration Testing (Irish Config)

**Objective:** Achieve high confidence that `Taxman`, using the updated `IE-2026.json` configuration and the generalized engine from Phase 5, produces results matching `Revenue` within acceptable tolerances across a wide range of simulation scenarios relevant to the Irish tax system.

**Plan:**

**Step 6.2.1: Update `IE-2026.json` with Generalized Rules**

*   **Analysis:** Review `IE-2026.json` against the Phase 5 schema updates in `Design.md`. Identify fixed numeric values and potentially some custom rules that can now be expressed using the generic `CalculationRule` object.
*   **Task:**
    *   Replace fixed values like tax credit amounts (e.g., Personal: 1875/3750, Employee: 2000), CGT annual exemption (1270), pension earnings cap (115000), pension lump sum thresholds (200k, 500k), and potentially the PRSI flat rate (0.04) with equivalent `CalculationRule` objects (e.g., `{ "method": "fixedAmount", "value": 1875 }`).
    *   Re-evaluate `customRuleIdentifier` usage:
        *   `calculatePensionContributionLimit`: Can this now use a `CalculationRule` with `method: 'brackets'`, `basis: 'age'`, referencing the `ageBasedPercentageLimits` array, combined with a formula or condition for the `earningsCap`? *Initial assessment: Likely yes, potentially complex.*
        *   `marriedBandIncrease`: This likely still requires custom logic due to needing the second earner's income, which isn't a standard `currentState` property. *Keep as custom.*
        *   `calculateUSC`: As noted in `Design.md`, per-person calculation likely requires this to remain custom. *Keep as custom.*
        *   `hasEmploymentIncome`: Can this be replaced by a `ConditionalRule` checking if `currentState.incomeSources` (assuming this is available/populated) contains an 'employment' type entry? *Needs investigation of `currentState` details.*
        *   `itAgeExemption`: This involves checking total income against a threshold and potentially overriding calculated tax. Might remain custom or use conditional logic within the main tax calculation flow if possible.
    *   Ensure the structure aligns with the refactored schema definitions from `Design.md` (Step 5.3b).
*   **Verification:** The updated `IE-2026.json` uses `CalculationRule` where appropriate, reducing reliance on hardcoded values and potentially some custom identifiers, while adhering to the latest schema design.

**Step 6.2.2: Enhance Comparison Logging in `Simulator.js`**

*   **Analysis:** The current `updateYearlyData` function only records `Revenue` outputs. The existing CGT comparison log (lines 271-279) is a good start but needs expansion.
*   **Task:**
    *   Modify the `updateYearlyData` function (around lines 622-658).
    *   Inside the `if (taxmanResult && revenue)` block (or a similar check), retrieve detailed tax components from `taxmanResult`. This requires knowing the exact structure of the `taxmanResult` object (e.g., `taxmanResult.incomeTax.totalLiability`, `taxmanResult.socialContributions.contributions.find(c => c.name === 'PRSI').amount`, `taxmanResult.socialContributions.contributions.find(c => c.name === 'USC').amount`, `taxmanResult.capitalGainsTax.totalLiability`, `taxmanResult.totalTaxLiability`).
    *   Calculate `taxmanNetIncome` consistently (e.g., Gross Income - `taxmanResult.totalTaxLiability`). Define how Gross Income is determined for this comparison (e.g., sum of all income declarations before adjustments).
    *   Add `console.log` statements within the main loop (after `taxman.computeTaxes`) to output a clear, side-by-side comparison for each year:
        *   `Revenue IT` vs. `Taxman IT`
        *   `Revenue PRSI` vs. `Taxman PRSI`
        *   `Revenue USC` vs. `Taxman USC`
        *   `Revenue CGT` vs. `Taxman CGT`
        *   `Revenue Total Tax` vs. `Taxman Total Tax`
        *   `Revenue Net Income` vs. `Taxman Net Income`
*   **Verification:** Running simulations produces clear, year-by-year console logs comparing the key tax outputs of both modules.

**Step 6.2.3: Define Simulation Scenarios & Integration Tests**

*   **Analysis:** Need comprehensive scenarios covering deferred verification points and Phase 5 changes.
*   **Task:**
    *   Define a suite of simulation scenarios (`events` and `params` configurations) to test:
        *   Basic Income Tax & Credits (Single, Married, PAYE).
        *   Social Contributions (PRSI, USC at different income levels/ages).
        *   Pension Contributions & Relief (varying ages/earnings vs. limits).
        *   Capital Gains Tax (various asset types, gains/losses, exemption, deemed disposal for index funds > 8 years).
        *   Event-driven taxes (Gift, Inheritance, Pension Withdrawal).
        *   CGT Loss Offset vs. Income (scenarios with losses > gains).
        *   Features potentially using generalized rules (e.g., allowances/limits calculated via brackets/lookups if implemented in Step 6.2.1).
        *   Custom rules (`marriedBandIncrease`, `calculateUSC`, etc.).
    *   Plan the creation of automated integration tests (e.g., using Jest). These tests should:
        *   Load the final `IE-2026.json`.
        *   Instantiate `Simulator` components (or run the core loop).
        *   Provide specific `currentState` inputs or run short simulations with defined events.
        *   Assert that `taxman.computeTaxes(currentState)` returns results matching pre-calculated expected values (derived from `Revenue` or manual calculation) for key scenarios.
*   **Verification:** A documented set of test scenarios exists. A strategy for automated integration testing is defined.

**Step 6.2.4: Execute Comparison, Analyze & Debug**

*   **Analysis:** This is the core iterative loop of the step.
*   **Task:**
    *   Run the scenarios defined in Step 6.2.3 using the updated `IE-2026.json` and enhanced logging.
    *   Carefully analyze the side-by-side comparison logs produced in Step 6.2.2.
    *   For any discrepancies beyond acceptable rounding differences:
        *   **Isolate:** Determine if the issue lies in `Taxman`'s core logic (`SchemaEvaluator`, calculators), the `IE-2026.json` configuration, or the `currentState` data provided by `Simulator.js`.
        *   **Debug:** Use logging, unit tests, and step-through debugging to pinpoint the root cause.
        *   **Refine:** Correct the relevant code (`Taxman`, `Simulator`) or configuration (`IE-2026.json`). Implement any necessary custom logic (`_executeCustomRule` in `Taxman.js`) that couldn't be generalized.
    *   Repeat the execution and analysis until `Taxman` results consistently match `Revenue` results across all scenarios.
    *   Run/finalize the automated integration tests defined in Step 6.2.3.
*   **Verification:** All defined simulation scenarios run without errors. Logged outputs show `Taxman` results matching `Revenue` results within tolerance. Automated integration tests pass.

**Mermaid Diagram of the Process:**

```mermaid
graph TD
    A[Start Step 6.2] --> B(Step 6.2.1: Update IE-2026.json);
    B --> C(Step 6.2.2: Enhance Logging in Simulator.js);
    C --> D(Step 6.2.3: Define Scenarios & Integration Tests);
    D --> E{Execute Scenarios};
    subgraph Iterative Comparison & Debugging
        E --> F{Log Revenue & Taxman Results};
        F --> G{Compare Results};
        G -- Match --> H{All Scenarios Tested?};
        G -- Mismatch --> I{Analyze Discrepancy};
        I --> J{Debug Code / Config};
        J --> K{Refine Code / Config};
        K --> E;
    end
    H -- No --> E;
    H -- Yes --> L{Run/Pass Integration Tests};
    L --> M[End Step 6.2: Validation Complete];