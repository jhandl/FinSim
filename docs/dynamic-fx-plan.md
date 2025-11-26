# Dynamic FX Unification Plan (Evolution Mode Everywhere, No Fallbacks to Legacy Modes for Core Paths) <!-- Tuning: dynamic-fx-phase-1-2025-11-26-v1 -->

## 1. Goals and Scope

- **Single FX engine:** Use `EconomicData.convert(..., fxMode: 'evolution')` (inflation-driven FX evolution) as the **only** FX mechanism for all simulator and UI currency conversions that affect:
  - Ledger math (`Taxman`, balances, cashflows, data sheet metrics)
  - Charts (nominal and PV, unified-currency views)
  - Relocation side effects (cash sweeps, relocation expenses)
  - Attribution normalization
- **No legacy-mode fallbacks in core paths:**
  - Core and UI conversion call sites should **not** rely on implicit defaults that switch to `'constant'` or PPP for “safety”.
  - PPP/reversion can remain available only for explicit, opt‑in analytics or suggestion helpers (e.g., relocation split suggestions), not for tax/ledger flows or standard charts.
- **Deterministic, inflation‑coherent FX:**
  - FX evolution derives from base FX and per‑country inflation (via `InflationService`) using a consistent base year (simulation start).
  - Conversions should be deterministic for a given scenario (no dependence on wall‑clock time).

Out of scope for this step:
- Changing the **PV semantics** themselves (flows vs. assets) — that is covered by `docs/multi-country-assets-plan.md`.
- Redesigning PPP/reversion math; they only need to stay functional when explicitly requested by tests or analytics helpers.

---

## 2. Current State Snapshot (FX + Call Sites)

### 2.1 Core FX Engine

- `EconomicData.convert(value, fromCountry, toCountry, year, options)` (`src/core/EconomicData.js:141-249`):
  - Supports `fxMode: 'constant' | 'evolution' | 'ppp' | 'reversion'`.
  - Currently **defaults** to `'evolution'` when `options.fxMode` is missing.
  - `'evolution'` uses `_fxCrossRateForYear(..., { fxMode: 'evolution', baseYear })` and `_computeEvolvedFX` (inflation‑driven evolution).
  - PPP/reversion modes exist primarily for tests and analytics refactors.
- `convertNominal(value, fromCountry, toCountry, year)` (`src/core/Simulator.js:206-244`):
  - Global helper for **ledger conversions**, calling `econ.convert(..., { fxMode: 'evolution', baseYear })`.
- `convertCurrencyAmount(...)` and `convertToResidenceCurrency(...)` (`src/core/Simulator.js:248-313`):
  - Map from currencies to countries and delegate to `convertNominal` for actual conversions.

### 2.2 Core Consumers

- **Flows & ledger consolidation** (`src/core/Simulator.js:760-940`):
  - `getConversionFactor()` uses `convertCurrencyAmount(1, ...)` for per‑currency net → residence currency.
  - Relies fully on `convertNominal` → `EconomicData.convert` under the hood.
- **Real estate** (`src/core/RealEstate.js:40-94`):
  - `getTotalValueConverted()` calls `convertCurrencyAmount` per property.
- **State pension & other cross‑currency incomes** (`src/core/Person.js:131-152`):
  - Use `convertCurrencyAmount` to convert from base/paying country into residence currency for ledger.
- **Relocation cash sweeps & relocation costs** (`src/core/Simulator.js:1327-1346`):
  - Call `convertCurrencyAmount(...)` in strict mode for relocation expense and cash conversion.
- **Attribution normalization** (`src/core/Attribution.js:52-88`):
  - Prefers `convertNominal` when available, else falls back to `economicData.convert(...)` with `baseYear` but no explicit `fxMode`.

### 2.3 Frontend Consumers

- **Charts (unified currency)** (`src/frontend/web/components/ChartManager.js:844-920`):
  - In unified‑currency mode, uses `cfg.getEconomicData().convert(...)` for:
    - Fixed monetary columns (NetIncome, Expenses, RealEstateCapital, PensionFund, Cash, FundsCapital, SharesCapital, etc.).
    - Dynamic `Income__*` / `Capital__*` fields.
  - Uses:
    - `yearForFX = data.Year` in nominal mode.
    - `yearForFX = simStartYear` in PV mode (effectively base FX).
    - Special‑cases State Pension in PV mode to use `fxMode: 'constant'` to avoid double inflation.
- **Table unified currency** (if any direct FX use) and data export rely mostly on core, but may contain ad‑hoc conversions that need auditing.

### 2.4 Tests & Docs Expectations

- `tests/TestFXConversions.js`: exercises all modes (`constant`, `ppp`, `reversion`, `evolution`) for invariants.
- `tests/TestLedgerFxModeEnforcement.js`:
  - Currently asserts that ledger conversions use **`fxMode: 'constant'`** and that the default fxMode is `'constant'` for “ledger safety” (now outdated).
- `docs/econ_data_refactor.md`, `docs/economic-data-v1-info.md`, `docs/economic-data-v2-plan.md`:
  - Some text still assumes **nominal constant FX** for ledger and PPP for analytics (pre‑dynamic‑FX direction).

---

## 3. Target Design: FX Evolution as the Only Ledger/UI Engine

### 3.1 High-Level Rules

1. **All core conversions** (flows, asset values, relocation cash moves, attribution normalization) **must go through `EconomicData.convert(..., fxMode: 'evolution')`** with a well‑defined `baseYear` equal to the simulation start year.
2. **Charts and tables**:
   - For **nominal** views, use evolution with `(baseYear = simStartYear, year = row.Year)` so cross‑rates reflect cumulative inflation differences as of that year.
   - For **PV + unified currency**, we will:
     - Keep the existing PV semantics (PV amounts computed in base‑year purchasing power), and
     - Decide explicitly whether cross‑currency PV conversion should:
       - (A) use **base‑year FX** (i.e., `yearForFX = simStartYear`) — current behavior, effectively a constant cross‑rate for PV, or
       - (B) use **evolved FX at row year** while still applying PV deflation in the core.
     - This decision will be documented and enforced consistently; no silent mode switches.
3. **PPP/reversion modes**:
   - Remain **available** but only for:
     - Explicit test coverage (`TestFXConversions`, potential analytics experiments).
     - Explicit analytics helpers (e.g., relocation suggestion panels) where PPP is conceptually desired.
   - Are not used by any ledger, table, or chart code paths by default.

### 3.2 Error Handling & Fallback Philosophy

“No fallbacks” in this phase means:
- No implicit switching from `'evolution'` to `'constant'`/PPP inside production paths when data is missing.
- Instead:
  - If evolution cannot compute a valid FX rate (null/NaN/<=0), the conversion returns `null`, and the caller:
    - Logs a specific error, and
    - Either fails the simulation / marks errors, or
    - Leaves the amount in its original currency but surfaces a visible warning.
- We can still keep **defensive numeric bounds** (e.g., capping at `1e6`) to avoid catastrophic blowups; that’s not considered a “mode fallback.”

---

## 4. Implementation Plan (Step-by-Step)

### Step 1 – Centralize and Lock EconomicData Defaults

1. **Lock default fxMode to `'evolution'`**:
   - In `EconomicData.convert`, keep `var fxMode = opts.fxMode || 'evolution';` and remove comments suggesting `'constant'` as a safer default.
   - Ensure that any `options` object passed from core/UI that omits `fxMode` is intended to mean “evolution”.
2. **Remove implicit internal fallbacks to other modes**:
   - In `convert`, treat any unknown `fxMode` as an immediate error (return `null`) instead of silently falling back to `'evolution'` or `'constant'`.
   - Ensure `_fxCrossRateForYear` respects `fxMode` only for:
     - `'constant'` (base FX),
     - `'evolution'` (current default),
     and rejects anything else.
3. **Tighten evolution’s dependency on InflationService**:
   - Confirm `_computePerEurFX` uses `InflationService.resolveInflationRate` where possible and falls back only to:
     - Tax rules CPI, or
     - 2% default when absolutely no data exists.
   - Document these numeric fallbacks clearly in comments so they’re not confused with mode fallbacks.

Deliverable: EconomicData behavior clearly documented as “evolution by default” with no implicit switching to constant/PPP modes.

### Step 2 – Align All Core Ledger Paths to Evolution

1. **Audit and normalize ledger call sites** to ensure they all go through `convertNominal`:
   - `convertCurrencyAmount` / `convertToResidenceCurrency` in `Simulator.js`.
   - Real estate (`RealEstate.getTotalValueConverted`).
   - State pension and any cross‑border incomes (`Person.js`, `Simulator.js` relocation handlers).
   - Attribution normalization (`Attribution.getNormalizedTotal`).
2. **Guarantee evolution for ledger conversions**:
   - Make `convertNominal` the **single canonical ledger entry point**; any core code that currently calls `EconomicData.convert` directly for ledger purposes should be refactored to call `convertNominal` instead.
   - In `convertNominal`, explicitly set `fxMode: 'evolution'` in the options and pass `baseYear = Config.getSimulationStartYear()`.
   - Remove any legacy code/comment suggesting constant FX is a safer or preferred ledger mode.
3. **Relocation cash & relocation costs**:
   - Confirm both flows use `convertCurrencyAmount(..., strict = true)` → `convertNominal`.
   - Ensure error handling remains strict (simulation fails when dynamic FX cannot be computed).

Deliverable: A single, evolution‑only ledger conversion flow accessible via `convertNominal`, with all core consumers routed through it.

### Step 3 – Align Frontend Currency Modes (Charts + Tables)

1. **Charts – nominal mode**:
   - In `ChartManager.updateChartsRow`:
     - For unified‑currency nominal charts, ensure all conversions use:
       - `economicData.convert(value, sourceCountry, targetCountry, data.Year, { baseYear: simStartYear })` with **no `fxMode` override** (thus evolution).
     - Confirm dynamic fields (`Income__*`, `Capital__*`) follow the same pattern.
2. **Charts – PV mode**:
   - Decide and document PV+FX policy:
     - Option A (current behavior): keep `yearForFX = simStartYear` so PV rows use base‑year cross‑rates (constant cross‑rate but produced by the same evolution engine). This is effectively “evolved engine, base‑year FX for PV”.
     - Option B (alternate): use `yearForFX = data.Year` even in PV mode, so PV rows still see changing cross‑rates (more realistic PV cross‑currency dynamics, but less intuitive for users expecting PV in start‑year terms).
   - Implement the chosen option consistently:
     - Remove the State Pension PV special‑case that forces `fxMode: 'constant'`. Instead:
       - Treat State Pension amounts like any other PV metric, but make sure we pass the correct **source country** (`'ie'` for IE pensions) and rely on evolution and the chosen `yearForFX`.
3. **Tables / data exports**:
   - Check for any direct FX use (e.g., unified‑currency table modes or CSV export adjustments).
   - Route them to:
     - `convertNominal` when appropriate, or
     - `economicData.convert` with no `fxMode` override (evolution) and explicit `{ baseYear: simStartYear }`.

Deliverable: Unified evolution‑based FX behavior across charts and any table/export currency modes, with PV+FX behavior explicitly chosen and documented.

### Step 4 – Tests and Documentation Updates

1. **Update FX-focused tests**:
   - `TestFXConversions.js`:
     - Keep exercising all modes but clarify in test descriptions that `'evolution'` is the canonical default and ledger mode.
     - Adjust any assertions that assumed a `'constant'` default.
   - `TestLedgerFxModeEnforcement.js`:
     - Rewrite to assert:
       - Ledger paths (`convertNominal`, `convertCurrencyAmount`, Relocation, RealEstate, Attribution) **always** call `EconomicData.convert` with `fxMode: 'evolution'`.
       - The default `fxMode` for calls without `options.fxMode` is `'evolution'`.
     - Remove expectations around `'constant'` as the ledger default.
   - Any tests that bake in exact constant‑FX values should be updated to either:
     - Use new deterministic baselines for evolution, or
     - Use relative tolerances that tolerate the evolution path while enforcing directionality and sanity bounds.
2. **Update documentation**:
   - `docs/econ_data_refactor.md`:
     - Clarify that the ledger now uses evolution FX everywhere; PPP and constant modes are available only explicitly.
   - `docs/economic-data-v1-info.md` and `docs/economic-data-v2-plan.md`:
     - Replace statements that describe PPP as the default ledger mode or constant FX as the “safe” mode with the new evolution‑only ledger design.
     - Document the PV+FX choice (A or B) taken in Step 3.

Deliverable: Tests and docs aligned to “evolution by default, evolution in all ledger/UI paths.”

### Step 5 – Regression & Sanity Validation

1. **Core regression tests**:
   - Run the full custom/core test suite via `./run-tests.sh TestFXConversions` and `./run-tests.sh TestLedgerFxModeEnforcement` once updated.
   - Then run `./run-tests.sh TestRelocationCurrency` and `./run-tests.sh TestChartValues` to ensure:
     - No catastrophic discontinuities at relocation.
     - Charts remain finite and directionally sensible under the new FX behavior.
2. **Scenario sanity with `docs/demo3.csv`**:
   - Check manually (or via existing tests) that, after the IE→AR move:
     - Nominal flows look similar in shape (allowing for slightly different FX evolution vs. legacy).
     - Unified‑currency charts remain free of wild spikes or sign flips.
3. **Performance check**:
   - Confirm that `_fxEvolutionCache` in `EconomicData` keeps the simulation performant under evolution mode with many years/countries.

Deliverable: Green tests for FX and relocation/chart invariants, plus a quick manual inspection of `demo3.csv` under unified currency and PV modes.

---

## 5. Rollout Notes and Follow-Ups

- After this step, **all FX usage** (ledger + charts + relocation) is conceptually:
  - “Base FX, evolved forward year‑by‑year using inflation differentials.”
- Next planned phase (separate plan):
  - Implement the per‑asset PV semantics and per‑asset country PV factors as described in `docs/multi-country-assets-plan.md`, ensuring that:
    - Flows keep using residency‑country PV.
    - Assets use their own country PV.
    - Charts consume these PV fields and then apply evolution‑based FX as per this plan.

