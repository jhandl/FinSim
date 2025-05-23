# Taxman vs Revenue Comparison Status (Phase 6, Step 6.2)

**Goal:** Validate `Taxman.js` against `Revenue.js` using `IE-2026.json`.

**Current State:**
*   Setup complete: `IE-2026.json` updated, `Simulator.js` logging enhanced, `Config.js` loads Irish config.
*   Initial debugging fixed income data being reset incorrectly within `Taxman.computeTaxes`.
*   Latest simulation run shows:
    *   PRSI calculation in `Taxman` **matches** `Revenue`.
    *   CGT calculation matches `Revenue` (both zero in the test year).

**Problem:**
*   `Taxman` calculates **zero** for Income Tax (IT) and Universal Social Charge (USC).
*   **Root Cause:** IT (via pension relief) and USC rely on custom rules defined in `IE-2026.json` (`calculatePensionContributionLimit`, `calculateUSC`) that are **not yet implemented** in `Taxman.js`. Console logs confirm these rules are being called but are unhandled.

**Next Steps (Revised Approach):**

1.  **Pension Limit (`calculatePensionContributionLimit`):**
    *   **Task:** Attempt to implement the pension contribution limit logic *directly within the schema* (`IE-2026.json`) using `CalculationRule`.
    *   **Approach:** Explore using `method: 'formula'` or nested `CalculationRule`s to replicate the logic (age-based rate lookup, earnings capping) without resorting to `_executeCustomRule`. This leverages the Phase 5 generality enhancements.
    *   **Verification:** Ensure the schema-based calculation correctly determines the limit used for pension relief adjustments in `IncomeTaxCalculator.js`.

2.  **USC (`calculateUSC`):**
    *   **Task:** Implement USC calculation accurately, matching `Revenue.js`'s per-person logic.
    *   **Approach:**
        *   Modify `Taxman.js` (`declareIncome`, `incomeSources` structure) to track income sources *per individual* within the tax unit (similar to how `Revenue.js` uses the `salaries` array).
        *   Modify `SocialContributionsCalculator.js` (or create a custom USC handler called via `_executeCustomRule`) to iterate through each individual's income.
        *   Apply the USC thresholds and bracket rules (base or reduced, based on individual conditions) defined in the `IE-2026.json` schema to each person's relevant income.
        *   Sum the results for the total USC liability.
    *   **Verification:** Ensure the per-person USC calculation in `Taxman` matches the output from `Revenue.js`.