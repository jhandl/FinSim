# Fix PV semantics for multi-country assets

## Implementation Status

- ✅ Phase 1: Add per-country deflation helper (TICKET-1)
- ✅ Phase 2: Fix real estate nominal growth (TICKET-2)
- ✅ Phase 3: Apply asset-country PV to real estate (TICKET-3)
- ✅ Phase 4: Apply origin-country PV to pensions (TICKET-4)
- ✅ Phase 5: Apply origin-country PV to investments (TICKET-5)
- ✅ Phase 6: Document asset-country PV semantics (TICKET-6)
- ✅ Phase 7: Extract PresentValueCalculator module
- ✅ Phase 8: Extract AttributionPopulator with explicit named parameters
- ✅ Phase 9: Extract DataAggregatesCalculator
- ✅ Phase 10: Simplify updateYearlyData orchestration
- ✅ Phase 11: Strict Error Handling - Empty Catch Elimination
- ✅ Phase 12: Eliminate Unnecessary Existence Checks

## Goals

- Ensure **flows** (salaries, expenses, etc.) keep using **residency-country inflation** for PV, preserving current behaviour.
- Ensure **stocks/assets** (real estate, pension funds, investments) use **their own country inflation context** for PV, independent of where the user lives.
- Keep **unified-currency EUR charts** converting PV values via **nominal FX**, not PPP, staying aligned with ledger semantics.
- Avoid double-deflation or double-conversion; keep nominal paths unchanged as far as possible.

## Design Decisions

- **Flows vs stocks:**
- Flows (income/expenses) continue to use the existing PV logic: residency country at that age via `InflationService.resolveInflationRate(pvCountry, year, ...)`.
- Stocks (real estate, pensions, funds/shares, and aggregated `worth`) should be deflated using an inflation rate derived from the **asset’s own country** (linkedCountry/currency or a clear default), *not* the current residency country.
- **PV country per asset type (initial rules):**
- Real estate: use `linkedCountry` when present; otherwise fallback to **startCountry** (or currentCountry if no better info).
- Mortgages: follow the same country as their underlying property.
- Pension fund capital: use the **pension ruleset’s country** (typically startCountry IE for demo3).
- Index funds / shares: treat as **startCountry assets** (IE/EUR) for now, since DeGiro-style global brokerage assets are effectively EUR-based in this scenario.
- Cash: continue to behave as now (residence-currency stock); PV for cash remains under residency inflation, since it’s literally the local currency bucket.
- **Unified EUR PV display:**
- PV for each asset is first computed using the asset’s PV country as above.
- Charts then convert that PV to the selected reporting currency using **nominal FX** (`EconomicData.convert(..., fxMode: 'constant')`), same as current unified mode.
- PPP remains reserved for relocation suggestions and analytics, not ledger or chart aggregation.

### Nominal real-estate growth correction

- **Current bug:** `Property.getValue()` calls `adjust(this.paid + ..., this.appreciation, this.periods)`. When `appreciation` is not set on the `R` event, `adjust()` falls back to the **current residence country’s** inflation (`currentCountry`). After a relocation, an Irish property (`linkedCountry = ie`) starts growing under AR CPI, which is wrong and interacts badly with evolution FX.
- **Intended nominal behaviour:**
  - Keep the existing “event-to-purchase” inflation step: the `R` event `Amount` is still treated as “today’s money” and inflated from simulation start to the purchase age using the **event’s country** inflation (via `resolveCountryInflation`), as it is today.
  - After purchase, the property’s nominal value should grow using an **asset-country rate**, not the residence country:
    - If the event specifies an explicit `Rate`, use it unchanged as the annual appreciation rate.
    - Otherwise, resolve an implicit appreciation rate from `InflationService.resolveInflationRate(linkedCountry, year, ...)`, falling back to `StartCountry` (or default ruleset) when `linkedCountry` is missing.
  - `Property.getValue()` should pass this asset-country rate explicitly into `adjust(...)` so that post‑purchase growth no longer depends on `currentCountry`.
- **Scope of the fix:**
  - Real estate (and any helper that derives its value via `Property.getValue()`) must adopt this asset-country nominal growth rule.
  - Mortgages should continue to use their explicit payment/amortization schedule; they do not need an implicit inflation rate, but they should follow the same property country for any future PV work.
  - Pensions and investment assets (index funds/shares) keep their existing nominal growth logic (configured growth rates, Gaussian sampling, etc.); they are only affected in the **PV layer**, not in nominal.

## Implementation Steps

### 1. Document intended PV semantics

- Add a short section to `docs/inflation-pv-plan.md` (or a new note) clarifying:
- Flows: PV in residency-country purchasing power.
- Stocks: PV in asset-country purchasing power (then optionally expressed in reporting currency via FX).
- How this should behave at relocations (Irish house & pension remain anchored to IE CPI even after moving to AR).

### 2. Refactor PV computation in `Simulator.updateYearlyData()`

- In `src/core/Simulator.js`, within `computePresentValueAggregates()`:
- Extract the current single `deflationFactor` logic into a helper function, e.g. `getRowDeflationFactorForCountry(countryCode, ageNum, startYear, params, overrides)` that returns a factor for an arbitrary country.
- Keep the existing call site for **flows** as-is: a single `deflationFactor` based on residency country is applied to income/expenses/netIncome, etc.
- Introduce **per-asset deflation factors**:
- Compute `deflationFactorFlows` (existing) for `pvCountry = currentCountry`.
- Compute `deflationFactorIE` (or more generically `defFactorAssetHome`) for **startCountry** (e.g. `params.StartCountry || cfg.getDefaultCountry()`), to be used for assets that are known to be IE-based.
- Optionally compute `defFactorByCountry[c]` lazily if we need distinct factors for multiple asset countries (future-proofing for multi-country portfolios).
- Apply new factors:
- Keep current logic for flow PV fields (`income...PV`, `expensesPV`, `netIncomePV`) using `deflationFactorFlows`.
- Change **asset PV fields** to use their asset-country factor instead:
- `realEstateCapitalPV` and the real estate component of `worthPV` should use the property’s country factor:
- As a first iteration, use `startCountry` for demo3 (since the house is `lc=ie`), i.e. `defFactorAssetHome`.
- Leave room to refine later using per-property country info if needed.
- `pensionFundPV` and the pension component of `worthPV` should use the pension country factor (startCountry for current rulesets).
- `indexFundsCapitalPV`, `sharesCapitalPV` and their contribution to `worthPV` should use `defFactorAssetHome` (startCountry) initially.
- Ensure the **nominal fields** (`realEstateCapital`, `pensionFund`, `indexFundsCapital`, `sharesCapital`, `worth`) remain untouched.

### 3. Avoid double-conversion and preserve current nominal behaviour

- Real estate:
- `RealEstate.getTotalValueConverted()` already converts property values to **residenceCurrency nominal** for the ledger.
- When applying the asset-country PV factor, multiply **after** this conversion, but using the asset’s country factor rather than residency:
- This approximates “what this EUR-valued IE house is worth in IE start-year purchasing power, then expressed in residence currency via FX”.
- Verify we’re not calling `convertCurrencyAmount` again on the PV amounts; PV fields should be pure multiples of the nominal ledger values.
- Pensions and investments:
- Capitals are maintained in EUR; applying an IE-based deflation factor is consistent with treating them as IE/EUR assets regardless of residence.
- Cash:
- Leave `cashPV` using the residency-country factor; cash is inherently residence-currency.

### 4. Check chart behaviour and country assumptions

- Confirm `ChartManager.updateChartsRow()` already:
- Uses `*PV` fields when `presentValueMode === true` (no extra deflation).
- Determines a **single sourceCountry per age** via `this.getCountryForAge(age)`, which is appropriate for flows but less so for mixed assets.
- Decide on a pragmatic phase-1 approach:
- Allow charts to keep using the **row country** for FX conversion of all asset PV fields, acknowledging that asset PV was already computed using the proper asset-country inflation.
- Document that a later phase may introduce per-asset FX source countries for even more accurate charting.

### 5. Tests and regression checks

- Extend / add core tests under `tests/`:
- A focused test (e.g. `TestRelocationAssetPV.js`) that:
- Creates a scenario with an IE house + pension + funds, relocates to AR, and asserts:
- Nominal asset values match existing behaviour.
- `realEstateCapitalPV`, `pensionFundPV`, `indexFundsCapitalPV`, `sharesCapitalPV`, `worthPV` **do not collapse** after relocation when viewed in IE CPI terms.
- Re-run / adjust existing tests touching PV and relocation: `TestRelocationCurrency.js`, `TestChartValues.js`, `TestCorePresentValueLayer.js`.
- Manual sanity check with `demo3.csv`:
- In PV+EUR mode:
- Incomes drop as expected due to AR CPI + FX.
- Real estate, pension fund, and investments **do not show an artificial cliff** at age 40; any change is driven by genuine FX/market effects.

## Phase 7: Extract PresentValueCalculator Module (COMPLETED)

**Status**: ✅ Implemented

**Summary**: Extracted `computePresentValueAggregates` closure (~300 lines) from `Simulator.js::updateYearlyData()` into standalone `PresentValueCalculator.js` module with explicit dependency injection via context object.

**Key Changes**:
- **New Module**: `src/core/PresentValueCalculator.js` exports `computePresentValueAggregates(ctx)` function via `PresentValueCalculator` namespace object
- **Context Object Pattern**: All 40+ dependencies (persons, assets, income/expenses, helpers) passed via single `ctx` parameter
- **Context-Driven Behavior**: Function relies entirely on `ctx.cfg`, `ctx.startYear`, and `ctx.ageNum` with explicit fallbacks only when those fields are null/undefined (not always recomputing from globals)
- **Zero Behavioral Change**: Line-by-line extraction preserves exact PV semantics:
  - Residency-country deflation for flows (salaries, expenses, cash)
  - Asset-origin-country deflation for stocks (real estate, pensions, investments)
  - Special state pension handling in base currency (EUR)
- **Error Semantics**: PV calculation errors propagate to caller (no outer try/catch in `updateYearlyData`), matching original closure behavior; internal error handling within `PresentValueCalculator` applies
- **GAS Compatibility**: Plain function (no ES6 modules), relies on global `InflationService` availability
- **Load Order**: `index.html` updated to load `PresentValueCalculator.js` after `Utils.js`, before `Simulator.js`
- **API Contract**: Call site uses `PresentValueCalculator.computePresentValueAggregates(pvContext)` for explicit namespacing

**Benefits**:
1. **Testability**: PV logic now testable in isolation (future: unit tests with mock context)
2. **Maintainability**: Clear interface (`ctx` object) documents all inputs/outputs
3. **Parallel Work**: Enables subsequent phases (attribution, aggregates extraction) without merge conflicts
4. **Reduced Complexity**: `updateYearlyData()` now ~230 lines (down from ~530)

**Verification**:
- ✅ `./run-tests.sh TestChartValues` (demo3.csv baselines unchanged)
- ✅ `./run-tests.sh TestCorePresentValueLayer` (PV aggregates match deflated nominals)
- ✅ `./run-tests.sh TestRealEstatePVRelocation` (asset-country deflation preserved)
- ✅ `./run-tests.sh TestPensionPVRelocation` (pension origin-country PV stable)
- ✅ `./run-tests.sh TestInvestmentPVRelocation` (investment origin-country PV stable)
- ✅ Manual demo3.csv PV+EUR charts: €100k-500k range, no cliffs/trillions

**Next Steps**: Proceed to Phase 8 (AttributionPopulator extraction) with confidence that PV layer is stable and isolated.

## Phase 8: Extract AttributionPopulator Module (COMPLETED)

**Status**: ✅ Implemented

**Summary**: Extracted attribution population logic (~50 lines) from `Simulator.js::updateYearlyData()` into standalone `AttributionPopulator.js` module with **explicit named parameters** (NO ctx object), following user directive to eliminate "ctx abomination" pattern.

**Key Changes**:
- **New Module**: `src/core/AttributionPopulator.js` exports `populateAttributionFields(dataRow, indexFunds, shares, attributionManager, revenue)` via `AttributionPopulator` namespace
- **Explicit Parameters**: 5 focused parameters (assets, managers) instead of context object for readability and IDE support
- **Zero Behavioral Change**: Line-by-line extraction preserves:
  - Portfolio statistics recording (indexFunds/shares bought/sold/principal/P&L)
  - General attribution breakdown population from AttributionManager
  - Dynamic tax totals accumulation from revenue.taxTotals
- **In-Place Mutation**: Modifies `dataRow.attributions` and `dataRow.taxByKey` directly (matches original semantics)
- **Error Handling**: Preserves existing try-catch patterns (attribution errors logged, tax errors silent)
- **GAS Compatibility**: Plain functions (no ES6 modules), namespace export
- **Load Order**: `index.html` updated to load `AttributionPopulator.js` after `PresentValueCalculator.js`, before `Simulator.js`

**Benefits**:
1. **Readability**: Clear function signature (self-documenting dependencies)
2. **IDE Support**: Autocomplete/type hints for parameters (no object property lookup)
3. **Testability**: Attribution logic testable in isolation with focused mocks
4. **Maintainability**: Explicit contracts prevent "undefined property" runtime errors
5. **Reduced Complexity**: `updateYearlyData()` now ~180 lines (down from ~230)

**Verification**:
- ✅ `./run-tests.sh TestChartValues` (demo3.csv baselines unchanged)
- ✅ `./run-tests.sh TestAttributionPopulator` (portfolio stats, breakdowns, tax accumulation)
- ✅ Manual demo3.csv: attributions/taxes match pre-refactor values

## Phase 9: Extract DataAggregatesCalculator Module (COMPLETED)

**Status**: ✅ Implemented

**Summary**: Extracted nominal aggregate logic (~170 lines) from `Simulator.js::updateYearlyData()` into `DataAggregatesCalculator.js` with 30+ explicit named parameters (NO ctx object), following Phase 8's AttributionPopulator pattern. Reduces `updateYearlyData` to ~80 lines (orchestrator only). Preserves exact behavior: in-place mutation, try-catch blocks, dynamic maps, tax columns. Added `TestDataAggregatesCalculator.js` with 6 scenarios (basic, couple, dynamic, RE conversion, taxes, demo3 regression). Full test suite passes unchanged. Script load order: Utils → PresentValueCalculator → AttributionPopulator → **DataAggregatesCalculator** → Attribution → Simulator. Enables Phase 10 (final cleanup) without conflicts. Explicit-parameter pattern established for future extractions (Phases 11-12). Deliverables: `src/core/DataAggregatesCalculator.js`, `tests/TestDataAggregatesCalculator.js`.

**Next Steps**: Proceed to Phase 10 (final cleanup) with confidence that nominal aggregates are stable and isolated.

## Phase 10: Simplify updateYearlyData Orchestration (COMPLETED)

**Status**: ✅ Implemented

**Summary**: Transformed `updateYearlyData()` from ~138-line function with inline computations into a **~45-line slim orchestrator** by extracting pre-computation and context-building logic into dedicated helper functions. Achieves user goal of "NO TRACE of old code" while maintaining zero behavioral change.

**Key Changes**:
- **New Helper**: `computePreAggregateValues()` consolidates real estate conversion and capital computations (39 lines → 3-line call)
- **New Helper**: `buildPVContext(preComputedValues)` consolidates pvContext object building (57 lines → 3-line call)
- **Deleted**: Commented dead code (`// dataSheet[row].sharesCapital = shares.capital();`)
- **Orchestrator Pattern**: `updateYearlyData()` now purely coordinates:
  1. Per-run results capture (orchestration)
  2. Pre-compute helper call
  3. DataAggregatesCalculator call (Phase 9)
  4. PV context helper call
  5. PresentValueCalculator call (Phase 7)
  6. AttributionPopulator call (Phase 8)
  7. UI update (orchestration)

**Benefits**:
1. **Readability**: Clear orchestration flow without visual clutter
2. **Maintainability**: Helpers isolate pre-computation and context-building concerns
3. **Testability**: Helpers can be unit-tested independently (future)
4. **Enables Phase 11-12**: Strict error handling can now target specific helpers
5. **Achieves Goal**: ~45 lines (target: ~50), NO inline aggregate/PV/attribution logic

**Preserved Semantics**:
- All try-catch blocks moved to helpers unchanged (Phase 11 will address)
- Exact pvContext structure maintained for PresentValueCalculator compatibility
- Closure-scoped globals used in helpers (GAS compatibility)
- Zero behavioral change: error handling, fallbacks, strict mode all preserved

**Verification**:
- ✅ `./run-tests.sh FULL SUITE` (all tests pass unchanged)
- ✅ `./run-tests.sh TestChartValues` (demo3.csv baselines identical)
- ✅ `./run-tests.sh TestCorePresentValueLayer` (PV aggregates match)
- ✅ `./run-tests.sh TestRealEstatePVRelocation TestPensionPVRelocation TestInvestmentPVRelocation` (asset-country PV stable)
- ✅ `./run-tests.sh TestAttributionPopulator TestDataAggregatesCalculator` (extracted modules unchanged)
- ✅ Manual demo3.csv: all modes/charts identical to pre-refactor

**Next Steps**: Proceed to Phase 11 (remove empty catch blocks) and Phase 12 (eliminate fallbacks) with confidence that orchestration is clean and isolated.

## Phase 11: Strict Error Handling - Empty Catch Elimination ✅

**Status**: Complete

**Changes**:
- Removed 23 empty catch blocks across core modules, allowing original exceptions to propagate
- Simulator.js: 19 removals (currency utils, event processing, real estate, withdrawals, capitals)
- PresentValueCalculator.js: 2 removals (currency normalization, dynamic PV maps)
- AttributionPopulator.js: 1 removal (tax totals accumulation)
- DataAggregatesCalculator.js: 1 removal (investment capital maps)

**Error Handling**: Original exceptions now bubble up unchanged for full stack traces

**Benefits**:
- Pure fail-fast: No silent failures, no masking
- Original error contexts preserved
- Strict discipline: Bugs surface immediately

**Verification**:
- Full test suite pass: `./run-tests.sh FULL SUITE`
- Manual edge tests: Missing vars → crash with original stacks (not silent)
- demo3.csv: All modes/charts unchanged (no behavioral regression)

**Next**: Phase 12 (fallback elimination) will remove defensive `if (!var)` checks, completing strict error discipline.

## Phase 12: Eliminate Unnecessary Existence Checks ✅

**Objective**: Remove ALL infrastructure/code existence checks (`typeof`, `|| fallbacks`, optional chaining equivalents). Keep ONLY user data validation. Enforce fail-fast philosophy.

**Changes**:
- **PresentValueCalculator.js**: Removed ~80 checks (ctx fallbacks, typeof Config/InflationService, deflationFactor validation, property method checks)
- **AttributionPopulator.js**: Removed ~2 checks (revenue existence)
- **DataAggregatesCalculator.js**: Removed ~4 checks (map existence for investmentIncomeByKey, capsByKey, revenue.taxTotals)
- **Simulator.js**: Removed ~60 checks (normalizeCountry/Currency null checks, Config existence, || {} fallbacks, convertNominal infrastructure checks)

**Kept**:
- User data structure initialization (e.g., `if (!dataRow.attributions[metric])`)
- User data validation (e.g., `if (propertyKeys.length > 0)`, `if (incomeStatePension > 0)`)
- Try-catch for user data errors (e.g., breakdown computation)

**Benefits**:
- ~150 checks removed across 4 files
- Clearer failure modes (stack traces vs silent fallbacks)
- Performance gain from eliminating conditionals
- Enforces fail-fast: missing infrastructure → immediate exception

**Verification**:
- `./run-tests.sh FULL SUITE` passes (TestChartValues, relocation PVs, etc.)
- `demo3.csv` outputs identical (all modes/charts)
- New `TestStrictErrorHandling.js` validates exceptions on missing vars

**Trade-offs**: Crashes on misconfiguration (intended). Tests validate infrastructure present.

**Next Steps**: Phase 13+ (future refactors) can assume strict environment.

## Out of Scope / Future Enhancements

- Full “real-first” modelling where all assets and flows are simulated in real (PV) terms and nominal values are layer-derived.
- Per-asset-country FX in charts (e.g., Irish house converted using IE→EUR, US ETF using US→EUR) instead of using row-country FX.
- UI affordances to explain why PV‑EUR income may fall while asset PV remains relatively stable after moving to a cheaper country.
