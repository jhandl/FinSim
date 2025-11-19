# Inflation and Present-Value Calculation Handover

## Current State

The inflation logic for event amounts has been fixed to correctly handle multi-country scenarios with relocations. However, two major issues remain:

1. **`adjust()` and `deflate()` use only `params.inflation`**, ignoring country, currency, and relocation. This is incorrect in a multi-country, high-inflation world and must be fixed first.
2. **Present-value (PV) mode is implemented in the UI by trying to reconstruct inflation**, which is fragile and cannot be exact when inflation sources are complex.

The goal of this plan is to:
- Centralize inflation logic in a single framework that is explicitly aware of **country, residency, currency, and overrides**, and
- Make PV values **exact by construction** by separating real (present-value) dynamics from price-level (inflation) dynamics in the core simulator.

## How Inflation Works (Current Implementation)

**Principle**: All event amounts are entered in present value (at simulation start). They are compounded forward to the current simulation year using inflation.

### Inflation Rate Selection (Priority Order)

1. **Explicit rate override** (`event.rate`): Use this single rate for the entire period, regardless of country.

2. **Linked country** (`event.linkedCountry`): Use that country's inflation rate for the entire compounding period (from simulation start to current year), regardless of where the person lives.

3. **Currency-based** (`event.currency`): If the currency maps to a country, use that country's inflation rate for the entire period. Example: ARS → Argentina's inflation.

4. **Person's location** (fallback): Use the person's actual country for each year, which can change with relocations.

### Applies to All Event Types

- **SI/SI2/SInp/SI2np** (Salaries): Use the country where the salary is paid (via currency or linkedCountry)
- **E** (Expenses): Use the country where expenses occur (via currency or linkedCountry)
- **R** (Rentals): Use the property's country (via linkedCountry, typically)
- **M** (Mortgages): Use the property's country (via linkedCountry, typically)
- **RI** (Rental Income): Use the property's country
- **UI** (RSUs): Use the country where the income is earned
- **DBI/FI** (Defined Benefit/Tax-Free Income): Use the country where income is earned

### Relocation Events (MV-*)

- **Inflation for relocation cost**: If the event has an `amount`, it's inflated using the source country's inflation (or `linkedCountry` if set) up to the relocation year.
- **Rate override**: If the event has a `rate`, that rate becomes the inflation override for the destination country, affecting future events without currency/linkedCountry that fall back to person's location.
- **Location change**: After relocation, the person's country changes, which affects the inflation used for future events that don't have currency or linkedCountry.

**Key insight**: Inflation follows the economic context of the money (where it's earned/spent), not necessarily the person's physical location. Relocations can override the default inflation rate for the destination country and change which country's inflation is used for location-dependent events.

## Implementation Details

### Core Inflation Function

The inflation is applied in `Simulator.js` in the `processEvents()` function:

```javascript
// Lines 1182-1192
if (event.rate !== null && event.rate !== undefined && event.rate !== '') {
  // Explicit rate override
  amount = adjust(event.amount, inflationRate);
} else {
  // Determine country for inflation
  var eventCountryForInflation = null;
  if (event.linkedCountry) {
    eventCountryForInflation = normalizeCountry(event.linkedCountry);
  } else if (event.currency) {
    var eventInfo = getEventCurrencyInfo(event, currentCountry);
    eventCountryForInflation = eventInfo.country ? normalizeCountry(eventInfo.country) : null;
  }
  // Compound year-by-year
  amount = adjustWithCountryHistory(event.amount, eventCountryForInflation, fromAge, toAge);
}
```

The `adjustWithCountryHistory()` function (lines 723-742) compounds year-by-year:
- If `eventCountryForInflation` is set, uses that country's rate for all years
- Otherwise, uses `getCountryForAge(age)` to get the person's country for each year
- Calls `resolveCountryInflationForYear()` which checks `countryInflationOverrides` first (set by relocation events)

### Relocation Logic

Relocation events (lines 1361-1412):
- Determine inflation country for relocation cost (currency → linkedCountry → prevCountry)
- Inflate relocation cost using `resolveCountryInflation()`
- If relocation has a `rate`, set `countryInflationOverrides[destCountry] = event.rate`
- Update `currentCountry = destCountry` (affects future `getCountryForAge()` calls)

## Phase 1: Centralized Inflation Framework (Top Priority)

### Problem: `adjust()` / `deflate()` ignore country context

- `adjust(value, rate = null, n = periods)` and `deflate(value, rate = null, n = periods)` default to **`params.inflation`**, a single global rate.
- Tax thresholds, credits, caps, and bands use `adjust()` in `Taxman`, so they are indexed by this global rate.
- Event flows (salaries, expenses, rents, relocation costs) now use **country-aware CPI** via `resolveCountryInflationForYear()` and relocation-aware logic.
- This creates a **mismatch**: thresholds are indexed by a global scalar, while flows are driven by per-country, per-year CPI and overrides. In high-inflation cases (e.g., AR) this is catastrophically wrong.

### Goal

Create a **central, country-aware inflation service** that:

1. Knows about **country, residency, currency, and overrides** (MV events, ruleset defaults, scenario `params.inflation`).
2. Exposes a small, clear API used everywhere, including `adjust()` and `deflate()`.
3. Is implemented in a GAS-compatible style (no ES modules, classes only where already used).

### Proposed API (conceptual)

- `getInflationRate(country, year)` → single-year CPI (decimal).
- `getCumulativeIndex(country, fromYear, toYear)` → cumulative \(\prod (1 + \pi)\) between years.
- `getRealRate(nominalRate, country, year)` → real rate for event/asset returns:
  - Basic version: `real ≈ nominalRate - inflationRate`.
  - More exact version: `real = (1 + nominalRate) / (1 + inflationRate) - 1`.

### Integration points

1. **`adjust()` / `deflate()`**:
   - Change semantics so that they are thin wrappers over the central service and are **explicitly country-aware**.
   - E.g. `adjust(value, null, n, country, fromYear)` uses `getCumulativeIndex(country, fromYear, fromYear + n)`.
   - Keep a backward-compatible path where `country`/`year` are omitted, defaulting to base country + simulation start year.

2. **Tax thresholds, bands, caps, credits**:
   - Replace direct `adjust()` calls with **contextual calls**:
     - Country = active tax country for the computation.
     - Years = elapsed since simulation start.
   - Ensure thresholds move consistently with the same CPI logic used for flows in that country.

3. **Event flows and assets**:
   - When an event or asset has a **nominal rate** (market return, `event.rate`), convert it to a **real rate** by subtracting the country’s inflation (via `getRealRate(...)`).
   - Real dynamics (raises above inflation, real returns) are modelled separately from inflation; inflation is applied only via the central index.

This phase must be completed **before** any PV work so that both nominal and PV paths share a single, coherent notion of inflation.

### Design Principles: Clarity and Maintainability

To keep the implementation readable and maintainable:

1. **Single Source of Truth**: All inflation-related decisions (rates, indices, overrides) must live in the centralized service. No component should re-implement inflation resolution logic.
2. **Layered Responsibilities**:
   - Inflation service: “Given country/year/context, what is the inflation rate/index?”
   - Simulator/events/assets: “Given real flows/capital and an index, compute nominal.”
   - Taxman: “Given nominal flows/capital, compute tax.”
   - UI (Table/Charts): “Given nominal and PV fields, choose which to display.”
3. **No PV Conditionals in Core Math**: Core formulas should not branch on “PV vs nominal”. They always compute real first, then nominal via the index. PV is exposed by reading the real layer, not by toggling logic.
4. **Small Context Helpers Instead of Inline If-Spaghetti**:
   - When different contexts are needed (tax country vs event country vs residence country), use small helper functions to prepare the arguments for the inflation service.
   - Avoid duplicating multi-branch logic (`if (country === baseCountry)` etc.) at every call site.
5. **Behaviour-Preserving Refactor**:
   - Treat existing nominal outputs (including failure age) as regression targets.
   - Add tests that assert nominal behaviour does not change after centralizing inflation and adding the real/PV layer.

## Phase 2: Exact Present-Value (Real Layer) in the Core

Once inflation is centralized, implement PV as a **real-value layer** in the simulator:

1. Represent recurring flows (salaries, expenses, rents, DBI, etc.) in **real terms** first:
   - Use real rates (already stripped of inflation by Phase 1).
   - For each year: compute `realAmount` and then derive `nominalAmount = realAmount × cumulativeIndex(country, ...)`.

2. Represent asset state (pensions, funds, shares, property) in **real capital**:
   - Contributions are in PV and therefore real.
   - Real returns apply on real capital.
   - Nominal capital is obtained only when needed via the central cumulative index.

3. In `updateYearlyData()`:
   - Store **both** nominal and PV aggregates per metric and per dynamic key:
     - `incomeSalaries` / `incomeSalariesPV`
     - `expenses` / `expensesPV`
     - `pensionFund` / `pensionFundPV`
     - `realEstateCapital` / `realEstateCapitalPV`
     - `worth` / `worthPV`

With this design, PV is **exact by construction**: the UI never deflates nominal values, it just reads the PV fields.

## Current PV Implementation State

The PV implementation has now moved from **UI‑side deflation** to a **pure core PV layer**:

- **Core PV layer (aggregates + dynamics)**:
  - `Simulator.updateYearlyData()` computes a **single per‑row deflation factor** using `InflationService.resolveInflationRate(...)` + `getDeflationFactor(...)` for the residency country and applies it to:
    - All primary aggregates (income buckets, expenses, pension fund, real‑estate capital, cash, index‑funds/shares capital, worth), and
    - Dynamic per‑investment maps (`investmentIncomeByKey` / `investmentIncomeByKeyPV`, `investmentCapitalByKey` / `investmentCapitalByKeyPV`).
  - The core data sheet therefore carries parallel nominal and PV values for every metric that drives table/chart columns.
- **UI consumption only switches between nominal and PV**:
  - `UIManager.updateDataRow()` exposes both nominal keys and their `*PV` counterparts (for aggregates and dynamic `Income__*` / `Capital__*` fields).
  - `TableManager` and `ChartManager` in PV mode now **only read the `*PV` fields**; they no longer compute PV in the frontend or resolve inflation themselves.

Overall, **PV is now exact by construction across tables and charts**: the UI never deflates nominal values, it simply chooses between nominal and PV fields produced by the core. A full real‑first refactor of flows/assets (modelling real dynamics internally instead of nominal‑first) remains a possible future enhancement but is no longer required to get consistent PV presentation.

## Code Duplication Problem

To keep maintenance costs low and behaviour consistent, **all inflation-related logic must be centralized** and not re‑implemented in individual components.

## Refactoring Plan: Centralize Inflation Logic

### Goal

Create a single, centralized inflation service that can be used by:
- Simulator (for inflating event amounts and projecting real → nominal)
- Taxman (for indexing thresholds, caps, and credits)
- Any future code that needs inflation calculations

### Proposed Structure

Create a new module `src/core/InflationService.js` (or similar) that provides:

1. **`resolveInflationRate(country, year, options)`**
   - Centralized inflation rate resolution
   - Handles: overrides → scenario inflation → EconomicData → TaxRuleSet → fallback
   - Replaces: `resolveCountryInflation()`, `resolveCountryInflationForYear()`, and all duplicated inline logic

2. **`getCountryForAge(age, relocationTimeline)`**
   - Centralized country-for-age calculation
   - Takes relocation timeline as parameter (can be built from events)
   - Replaces: all `getCountryForAge()` implementations

3. **`determineEventInflationCountry(event, currentCountry, getCountryForAgeFn)`**
   - Determines which country's inflation to use for an event
   - Implements: `linkedCountry` → `currency` → person's location priority
   - Uses `getEventCurrencyInfo()` internally
   - Replaces: logic in Simulator.js lines 1185-1191
4. **`adjustWithCountryHistory(value, eventCountryForInflation, fromAge, toAge, options)`**
   - Centralized forward inflation compounding
   - Uses the above functions internally
   - Can be called from Simulator wherever a pure “apply inflation over history” step is still needed

### Migration Steps

1. **Create `InflationService.js`** with all centralized functions
2. **Update Simulator.js** to use centralized service, removing its local inflation-resolution helpers
3. **Update Taxman.js** to use centralized service for all inflation/indexing of thresholds, caps, and credits
4. **Update TableManager.js** and **ChartManager.js** to stop performing their own inflation/deflation logic and instead consume nominal vs PV fields produced by the core
5. **Add tests** to ensure all implementations behave identically in nominal mode
6. **Verify** that simulation results (including failure age) are unchanged after migration

### Benefits

- **Single source of truth**: One place to change inflation logic
- **Consistency**: Nominal and PV paths are generated from the same real + index model
- **Maintainability**: Changes require one update, not three
- **Testability**: Can test inflation logic independently
- **Reusability**: Other code can use the same service

## Future Direction: Economic Data & FX Model Simplification

The current economic data layer still exposes **CPI/FX/PPP time series** and projects
missing years via weighted averages. For a 60‑year forward simulator this adds
complexity without corresponding realism: beyond the observed window the FX path is
effectively flattened, and long‑run behaviour is dominated by that tail rather than
by inflation differentials.

The long‑term direction is therefore:

- **Drop per‑year CPI/FX/PPP time series** from the economic profiles:
  - Keep **per‑country long‑run CPI averages** (e.g. 20–30 year weighted averages)
    and a **base‑year FX (and/or PPP) anchor** per country.
  - `EconomicData` becomes a thin accessor over these scalar values rather than a
    time‑series interpolation/projection engine.

- **Derive FX paths from inflation differentials via the inflation service**:
  - Treat FX as a **derived quantity** built from:
    - A base cross‑rate \( FX_{X\to Y}(t_0) \) at the simulation base year, and
    - The per‑country effective inflation path \( \pi_X(t), \pi_Y(t) \).
  - Each simulation year, evolve FX using:
    \[
      FX_{X\to Y}(t+1) = FX_{X\to Y}(t) \cdot \frac{1 + \pi_X(t)}{1 + \pi_Y(t)}
    \]
  - Over multiple years this gives:
    \[
      FX_{X\to Y}(T) = FX_{X\to Y}(t_0) \cdot
      \prod_{k=t_0}^{T-1} \frac{1 + \pi_X(k)}{1 + \pi_Y(k)}
    \]
  - **Source of \(\pi_c(t)\)**: always `InflationService.resolveInflationRate(country, year, ...)`,
    so FX evolution automatically respects the same overrides and rules as the rest
    of the simulator.

- **Align ledger/unified‑currency conversions with the new FX model**:
  - For the main simulation path (including PV + unified‑currency display), replace
    the current “constant FX” usage with this CPI‑driven FX evolution.
  - PPP/reversion modes can remain for specialised tools, but PV and core cash‑flow
    logic should rely on a **single, inflation‑aware FX evolution model**.

- **Support future “macro inflation shock” events**:
  - Introduce a new event type (e.g. `MI-<country>` or similar) that perturbs a
    country’s inflation path for a bounded window:
    - For years within \([fromYear, toYear]\), adjust the effective inflation
      \(\pi_c(t)\) up or down relative to the baseline.
    - Implementation‑wise, this is expressed as **year‑bounded overrides** consulted
      by `InflationService.resolveInflationRate(...)` (similar to
      `countryInflationOverrides`, but with explicit time bounds).
  - Because FX is recomputed from the effective \(\pi_c(t)\) each year, any such
    “high/low inflation” event automatically produces a corresponding FX regime
    change for that window, and its compounded effects persist afterwards.

This direction preserves the core design principles of this plan (single inflation
service; real‑first thinking; no duplicated logic) while making **long‑run FX
behaviour an explicit, transparent function of inflation**, rather than a side
effect of short historical series and ad‑hoc projections.

### Important Notes

- The service must work in both browser and Google Apps Script environments (no modern JS features)
- Must handle the same edge cases: missing data, fallbacks, relocation overrides
- Should accept configuration objects to avoid global variable dependencies where possible
- May need to pass `countryInflationOverrides` and `relocationTimeline` as parameters rather than accessing globals

## Success Criteria

When PV mode is enabled:
1. All monetary values in tables and charts are expressed in present-value terms (simulation start year), as produced by the core simulator’s real layer.
2. Conceptually, for each metric, nominal values equal PV values multiplied by the appropriate cumulative inflation index defined by the central service.
3. This holds true for all event types across all scenarios.
4. Relocations are handled correctly (rate overrides and location changes).
5. Events with linkedCountry or currency use the correct country's inflation throughout.

After refactoring:
6. All inflation logic uses the centralized service.
7. No duplicated inflation resolution code exists.
8. Changes to inflation logic require updates in one place only.

## Progress

### Phase 1 – Centralized Inflation Framework

- **Inflation service implementation**: **Complete**  
  `src/core/InflationService.js` exists and exposes `resolveInflationRate`, `getCumulativeIndex`, and `getRealRate` in a GAS‑compatible, UMD‑style global, with fallbacks to `Config`, `params`, `EconomicData`, and `countryInflationOverrides`.

- **Core integration (`adjust()` / `deflate()` + simulator flows)**: **Complete**  
  `adjust()` and `deflate()` in `Utils.js` now delegate to `InflationService.resolveInflationRate(...)` whenever no explicit rate is passed, using the active `currentCountry` and `year`, so all implicit uses (including simulator thresholds and targets) move with the same CPI that drives event flows; `Simulator.processEvents()` resolves per‑country inflation via the same service (with a legacy inline fallback kept only for non‑browser/test contexts).

- **Tax thresholds, bands, caps, credits (Taxman)**: **Complete for current scope**  
  `Taxman` still calls `adjust()` directly for indexing brackets and credits, but since `adjust()` is now country‑aware and InflationService‑backed, those thresholds automatically follow the same per‑country CPI as flows without changing `Taxman`’s formulas; no additional per‑country inflation logic is duplicated inside `Taxman.js`.

- **UI PV alignment (tables + charts)**: **Complete for current PV model**  
  `TableManager` and `ChartManager` now resolve inflation via `InflationService.resolveInflationRate(...)` (with `params`, `Config`, and `countryInflationOverrides`) in all PV code paths, then use `getDeflationFactor(...)` to deflate nominal values; this removed the previous UI‑side re‑implementation of inflation selection and fixed inconsistencies when toggling PV mode or exporting CSV.

- **Duplication reduction**: **Partially complete**  
  All frontend PV consumers (table + charts) now share the centralized service instead of duplicating `resolveCountryInflation`/`getInflationForYear`/`getCountryForAge` logic; `Simulator` still carries a small legacy inline resolver as a safety fallback when `InflationService` is unavailable, but its primary path delegates to the service so future changes can be made centrally.

- **Tests and regressions**: **Complete (initial pass)**  
  The custom core test `TestDeflationUtils` validates `deflate()` and `getDeflationFactor()` (including defaulting through `params.inflation`), and targeted runs of the existing regression suite show nominal outputs unchanged; UI Jest/Playwright tests around chart currency conversion remain valid since only PV deflation (not FX) was altered.

### Phase 2 – Exact Present‑Value (Real Layer in the Core)

- **Real‑layer flows and assets in core**: **Partially complete**  
  Recurring flows and asset states are still simulated in nominal (inflated) terms, but the core now computes a per‑row present‑value deflation factor using `InflationService.resolveInflationRate(...)` + `getDeflationFactor(...)` and applies it to the main aggregates; this exposes a first pass of core‑computed PV metrics without changing any nominal behaviour.

- **Parallel nominal + PV metrics in `updateYearlyData()`**: **Complete (aggregates + dynamic maps)**  
  `updateYearlyData()` now maintains parallel `...PV` fields for the key metrics (`incomeSalaries`, `incomeRSUs`, `incomeRentals`, `incomePrivatePension`, `incomeStatePension`, `incomeFundsRent`, `incomeSharesRent`, `incomeCash`, `incomeDefinedBenefit`, `incomeTaxFree`, `realEstateCapital`, `netIncome`, `expenses`, `pensionFund`, `cash`, `indexFundsCapital`, `sharesCapital`, `worth`) **and** per‑investment‑type maps (`investmentIncomeByKey` / `investmentIncomeByKeyPV`, `investmentCapitalByKey` / `investmentCapitalByKeyPV`), so the data sheet carries both nominal and PV values for all metrics that drive table/chart columns.

- **UI consumption of core PV fields**: **Complete for all table/chart columns**  
  `TableManager` and `ChartManager` now **prefer core `*PV` fields** for both primary aggregates and dynamic per‑investment columns (`Income__*`, `Capital__*`) whenever present, falling back to UI‑side deflation via `getDeflationFactor(...)` + `InflationService` only when a corresponding PV field is missing; this makes PV display “exact by construction” across the table and charts while reusing the same core inflation logic.