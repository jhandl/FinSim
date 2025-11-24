# Fix PV semantics for multi-country assets

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

## Out of Scope / Future Enhancements

- Full “real-first” modelling where all assets and flows are simulated in real (PV) terms and nominal values are layer-derived.
- Per-asset-country FX in charts (e.g., Irish house converted using IE→EUR, US ETF using US→EUR) instead of using row-country FX.
- UI affordances to explain why PV‑EUR income may fall while asset PV remains relatively stable after moving to a cheaper country.