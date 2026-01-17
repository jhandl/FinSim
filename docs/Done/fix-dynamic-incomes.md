# Fix Dynamic Investment Incomes (Table + Cashflow Chart)

## Context / Problem

Loading `docs/demo3.csv` shows clear investment liquidation income around age 35 (sale of index funds), but:

- The **data table** is missing the investment income columns/values.
- The **cashflow chart** is missing the corresponding income series.

This is currently caused by a mismatch between:

- **How the core emits per-investment-type income** (via `dataSheet[row].investmentIncomeByKey` and UI-flattened `Income__${key}` fields), and
- **How the web UI decides which income columns/datasets to show** (visibility scan is legacy-shaped and doesn’t consider per-key maps), plus
- **A table rendering bug** that reads `data.investmentIncomeByKey[...]` even though the UI row object does not provide that map.

This plan fixes the user-visible bug first, then removes runtime dependencies on the legacy two-type investment model (index funds + shares) so the only legacy handling left is during scenario import (resolving old files).

## Goals

- Investment liquidation income appears in:
  - The **investment income section** of the data table, and
  - The **cashflow chart** (stacked income series),
  for all ruleset-resolved investment types (e.g. `indexFunds_ie`, `shares_ie`).
- Remove **runtime** references to the legacy two-type investment model (where feasible), keeping legacy logic only in **CSV import/deserialization** to resolve old scenarios.
- Preserve GAS compatibility for `src/core/**`.

## Non-Goals (for this change)

- Redesign of the entire investments UX (priorities UI, wizard flows).
- Changing the financial meaning of “income” vs “capital gains”; this is a display/data-plumbing fix.

## Phase 1 — Lock in a Core Regression Signal (Data Exists)

### Why
Before changing UI plumbing, prove that demo3 actually produces the expected per-key investment income in `dataSheet` (so UI is the culprit).

### Tasks
- Add/extend assertions in an existing core regression test that already loads `docs/demo3.csv`:
  - Prefer `tests/TestChartValues.js` (already runs demo3 and validates chart-facing invariants).
  - Add a focused assertion that:
    - At age 35 (or the first liquidation year), `dataSheet[row].investmentIncomeByKey` contains at least one non-zero entry.
    - The keys are ruleset-resolved keys (e.g. `*_ie` for IE residence), not legacy unscoped `indexFunds` / `shares`.
- If demo3 is too noisy for a crisp assertion, add a small synthetic scenario in a new `tests/TestDynamicInvestmentIncomeKeys.js` that:
  - Uses a single country ruleset and a deterministic forced sell,
  - Asserts that `investmentIncomeByKey` is populated with resolved keys, and
  - Asserts that `incomeFundsRent` / `incomeSharesRent` are not required for the investment income to exist (prepping legacy removal).

### Acceptance Criteria
- The core test suite proves that liquidation income is present in `investmentIncomeByKey` for demo3 (or a synthetic minimal scenario).

### Ask User to Run Core Tests
- Do not continue until the user tells you the tests passed.

## Phase 2 — Fix UI Data Plumbing (No More Missing Values)

### Why
Right now the UI “has the data” but drops/hides it due to:

- Visibility computation ignoring `investmentIncomeByKey` keys.
- Table render path reading `data.investmentIncomeByKey` (which isn’t provided on display rows).

This phase fixes the table + chart without attempting to remove all legacy runtime structures yet.

### Tasks
1. Fix the table investment income value source:
   - In `src/frontend/web/components/TableManager.js`, for dynamic income cells (`key.startsWith('Income__')`), read from:
     - `data['Income__' + typeKey]` (preferred, because `UIManager.buildDisplayDataRow()` already flattens), or
     - (optionally) a map if we decide to expose it on the UI row object.
2. Fix income visibility to include per-key investment incomes:
   - In `src/frontend/web/WebUI.js#getIncomeColumnVisibility()`:
     - Keep existing fixed-income scanning logic for `incomeSalaries`, `incomeRentals`, etc.
     - Add a scan across `dataSheet[row].investmentIncomeByKey` (and PV map if present) and emit visibility keys of the form:
      - `income__${investmentKey}` lowercased (must match `Income__${investmentKey}` cells in the Gross Income dynamic section).
     - Remove the legacy-only mapping (`IncomeFundsRent -> income__indexfunds`, `IncomeSharesRent -> income__shares`).
3. Ensure chart visibility uses the same key scheme:
   - Verify `ChartManager.applyInvestmentTypes()` sets `cashflowIncomeKeys` to the resolved keys.
   - Verify `ChartManager.applyIncomeVisibility()` recognizes `income__${resolvedKey}`.
   - Remove any fallback paths that only work for `indexFunds` / `shares` unscoped keys.
4. Cache busting for the web build:
   - Update JS cache-busters in `src/frontend/web/ifs/index.html` for any changed scripts (per AGENTS rule).

### Manual Verification (no automation)
- Load `docs/demo3.csv` in the already-running web UI.
- Run simulation.
- Confirm:
  - The investment income section shows per-type columns (e.g. `Index Funds (IE)`, `Shares (IE)`).
  - Age 35 row shows a non-zero value in at least one investment income column.
  - Cashflow chart shows the matching investment income series (not only “Inflows”).

### Ask User to Run Core Tests
- Do not continue until the user tells you the tests passed.

## Phase 3 — Gross Income Dynamic Section Contract

### Why
Investment income must be rendered as `Income__${resolvedKey}` columns inside the **Gross Income** dynamic section (not as main-header `<th>` columns).

### Tasks
- Implement Phase 3 per these documents:
  - `docs/Doing/data-table-model.md`
  - `docs/Doing/phase3-data-table-contract.md`

### Acceptance Criteria
- Match the contract invariants (empty-state layout, post-run alignment, per-period hiding for `Income__*` keys).

### Ask User to Run Core Tests
- Do not continue until the user tells you the tests passed.

## Phase 4 — Remove Core Runtime Legacy Buckets (Keep Only Import-Time Resolution)

### Why
Investment income/capital are represented via the per-key maps:

- `dataSheet[row].investmentIncomeByKey`
- `dataSheet[row].investmentCapitalByKey`
- PV mirrors: `investmentIncomeByKeyPV`, `investmentCapitalByKeyPV`

### Tasks
0. Preconditions
   - Phase 3 must be complete (Gross Income is a dynamic section; investment income rendered as `Income__*` cells).

1. Remove UI runtime reliance on legacy investment aggregates
   - In `src/frontend/UIManager.js#buildDisplayDataRow()`:
     - Compute investment income totals from `investmentIncomeByKey` only.
     - Stop emitting legacy display keys that are no longer structurally required by the table/chart (`IncomeFundsRent`, `IncomeSharesRent`, `FundsCapital`, `SharesCapital`, and their `PV` variants).

2. Migrate nominal aggregation logic off legacy buckets
   - In `src/core/DataAggregatesCalculator.js`:
     - Replace any remaining legacy-only logic that depends on `incomeFundsRent` / `incomeSharesRent` with a per-key equivalent (based on `investmentIncomeByKey`, plus any other flows that are still part of the same accounting concept).
     - Remove legacy row fields (`incomeFundsRent`, `incomeSharesRent`, `indexFundsCapital`, `sharesCapital`) once no consumers remain.

3. Migrate PV aggregation logic off legacy buckets
   - In `src/core/PresentValueCalculator.js`:
     - Remove PV computations and row fields for the legacy buckets once the UI and any exports no longer depend on them.
     - Keep PV maps (`investmentIncomeByKeyPV`, `investmentCapitalByKeyPV`) as the canonical per-type PV representation.

4. Stop writing legacy buckets in the simulator (last, after consumers are migrated)
   - In `src/core/Simulator.js`:
     - Remove runtime updates of `incomeFundsRent`, `incomeSharesRent`, `indexFundsCapital`, `sharesCapital` (and any dependent accumulators).
     - Keep only per-key map updates and canonical caps-by-key.

5. Preserve legacy scenario compatibility only at import-time
   - In `src/core/Utils.js#deserializeSimulation()`:
     - Continue accepting legacy CSV fields and translate them into the resolved key space (canonical internal representation).
     - Ensure serialization writes canonical fields (and only writes legacy fields if we explicitly choose to keep export compatibility).

6. Update tests
   - Replace assertions/baselines that reference legacy buckets with assertions against:
     - `investmentIncomeByKey` / `investmentCapitalByKey` (and PV maps as needed),
     - and the table/chart-facing `Income__*` / `Capital__*` fields emitted by `UIManager.buildDisplayDataRow()`.

### Acceptance Criteria
- Core and UI contain **no runtime dependencies** on the legacy two-type buckets/fields (`incomeFundsRent`, `incomeSharesRent`, `indexFundsCapital`, `sharesCapital`, and PV variants), except for **import-time resolution** of old scenarios.
- demo3 and other regressions still pass.

### Ask User to Run Core Tests
- Do not continue until the user tells you the tests passed.

## Phase 5 — Optional: Add a Focused UI/Jest Guardrail

### Why
The original bug is UI-layer. A small Jest test can prevent regressions in:

- `getIncomeColumnVisibility()` correctly turning on `income__${resolvedKey}` when dataSheet contains `investmentIncomeByKey`.

### Tasks
- Add a Jest test (e.g. `tests/IncomeVisibility.test.js`) that:
  - Mocks a minimal `dataSheet` with `investmentIncomeByKey`,
  - Calls `WebUI.getIncomeColumnVisibility()` and asserts dynamic keys are set to `true`.

### Ask User to Run Core Tests
- Do not continue until the user tells you the tests passed.

