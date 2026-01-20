# UX Experiment 2 — Global Return Profiles + Country Wrappers (Option B)

Goal: prototype an Economy editor split into:
1) A global “Return Profiles” table (editable Growth + Volatility),
2) Country tabs showing wrapper lists (tax buckets) that reference a global profile (read-only economics; tax-only info).

This variant tests whether users understand “global market behavior” vs “country tax wrappers” well enough to justify reducing duplication.

This is a UI-only prototype. It may not serialize and does not need to affect the simulation unless you explicitly wire it later.

---

## Preconditions / Setup

- [ ] Start from a clean baseline (no other UX variants applied).
- [ ] Load scenario `docs/demo3.csv` via the UI “Load” button (IE → AR at age 40).
- [ ] Confirm effective relocation is present (StartCountry differs from at least one MV-* destination).

## Success Criteria (What “Done” Means)

- [ ] Economy shows a global “Return Profiles” table (always visible).
- [ ] Below it, Economy shows country chips and a per-country wrappers list.
- [ ] Wrapper rows clearly communicate:
  - [ ] They are “tax buckets” (CGT vs Exit Tax).
  - [ ] They reference a shared “Return Profile”.
- [ ] Economy mode toggle still works (volatility columns hidden in deterministic).
- [ ] When relocation is inactive (relocation disabled OR no effective MV-*), the existing single-country Economy UI remains usable.

---

## Files You Will Change (and cache-bust)

- [ ] `src/frontend/web/WebUI.js` (render global profiles + wrappers-by-country UI; show/hide gating)
- [ ] `src/frontend/web/ifs/index.html` (cache-bust `WebUI.js` and any other touched scripts/CSS)
- [ ] Optional (demo-only schema):
  - [ ] `src/core/config/tax-rules-global.json` (add profile metadata defaults, if you don’t hardcode)
  - [ ] `src/core/config/tax-rules-ie.json`, `src/core/config/tax-rules-ar.json` (ensure wrappers carry `baseRef` to a global profile)
- [ ] Optional CSS:
  - [ ] `src/frontend/web/ifs/css/layout.css` and/or `src/frontend/web/ifs/css/simulator.css` (spacing, badges)

Cache-busting rule:
- [ ] For each touched JS/CSS file, update its `?v=...` in `src/frontend/web/ifs/index.html`.

---

## Implementation Plan

### 1) Define what a “Return Profile” is for this prototype

Preferred source (already exists):
- [ ] Use global investment base types as profiles:
  - [ ] `const profiles = Config.getInstance().getInvestmentBaseTypes();`
  - [ ] Each profile has `baseKey` and `label` (e.g. `globalEquity`, `globalBonds`).

Profile input IDs (UI-only):
- [ ] Growth input: `ReturnProfileGrowthRate_<baseKey>` (class `percentage`)
- [ ] Volatility input: `ReturnProfileVolatility_<baseKey>` (class `percentage`)

Optional defaults:
- [ ] If you want defaults without hardcoding, extend `src/core/config/tax-rules-global.json`:
  - [ ] Add `defaultGrowthRatePct` and `defaultVolatilityPct` on each item in `investmentBaseTypes`.
  - [ ] On first render, if input is empty, seed it from those defaults.

### 2) Add a dedicated Economy “variant container” without breaking the legacy table

- [ ] In `src/frontend/web/WebUI.js`, locate the Economy card root: `#growthRates`.
- [ ] Keep the legacy `table.growth-rates-table` in the DOM, but hide it when effective relocation is active.
- [ ] Create a new container inserted between the Economy header and the legacy table:
  - [ ] `div#economyVariantContainer` (stable id)
  - [ ] Inside:
    - [ ] `div#economyReturnProfilesContainer`
    - [ ] `div#economyCountryWrappersContainer`

Visibility gating:
- [ ] Compute `hasMV = Config.getInstance().isRelocationEnabled() && this.hasEffectiveRelocationEvents()`.
- [ ] If `hasMV`: show `economyVariantContainer` and hide legacy table.
- [ ] Else: hide `economyVariantContainer` and show legacy table.

Hook point:
- [ ] Extend `refreshCountryChipsFromScenario(...)` to also refresh this Economy UI (same refresh trigger as Allocations).

### 3) Render the global Return Profiles table (always visible when hasMV)

Markup:
- [ ] In `economyReturnProfilesContainer`, render a compact table with 3 columns:
  - [ ] Profile name
  - [ ] Growth Rate
  - [ ] Volatility
- [ ] One row per profile from `Config.getInstance().getInvestmentBaseTypes()`.

Input creation:
- [ ] For each profile row:
  - [ ] Create inputs via `this._takeOrCreateInput(...)` so values persist across rerenders.
  - [ ] Ensure `input.className` includes `percentage`.
  - [ ] Set `inputmode="numeric"` and `pattern="[0-9]*"` to match existing inputs.

Economy mode interaction:
- [ ] Update `WebUI.updateUIForEconomyMode()` so the volatility hiding targets only the Return Profiles table:
  - [ ] Give the profiles table a unique selector (e.g. `table.economy-profiles-table`).
  - [ ] Replace `#growthRates th:nth-child(3)` with `#growthRates table.economy-profiles-table th:nth-child(3)` (and same for `td`).
  - [ ] Preserve the existing `preserveVolatilityValues()`/`restoreVolatilityValues()` behavior by ensuring vol inputs still end with `GrowthStdDev` OR adjust those methods to also include your `ReturnProfileVolatility_...` ids.

### 4) Render country chips + “Tax Wrappers” table per country

Country chips:
- [ ] Reuse `CountryChipSelector` with panel id `economyWrappers` (distinct from other panels unless you want syncing).
- [ ] Countries come from `this.getScenarioCountries()` mapped to `{code, name}`.
- [ ] On chip selection, call `_showEconomyWrappersCountry(code)` to swap visible country wrapper table.

Wrapper table structure:
- [ ] For each country code `c`, build a table with rows from:
  - [ ] `const types = cfg.getCachedTaxRuleSet(c).getResolvedInvestmentTypes();`
- [ ] Each wrapper row shows:
  - [ ] Wrapper label (`t.label`)
  - [ ] A small “tax badge” or tooltip:
    - [ ] If `t.taxation.exitTax` exists => badge “Exit Tax”
    - [ ] Else if `t.taxation.capitalGains` exists => badge “CGT”
  - [ ] A tooltip: “Uses profile: <profile label>” derived from:
    - [ ] `t.baseRef` (profile baseKey)
    - [ ] `cfg.getInvestmentBaseTypeByKey(t.baseRef)` (for human label)

Important: wrappers are read-only economics in this experiment
- [ ] Do not render Growth/Volatility inputs here.
- [ ] Do not add per-country Inflation inputs here (keep it out of this variant to keep the mental model crisp).

### 5) Ensure wrappers reference global profiles (demo-only config verification)

- [ ] In `src/core/config/tax-rules-ie.json` and `src/core/config/tax-rules-ar.json`, verify at least one wrapper has `baseRef: "globalEquity"`.
- [ ] If missing, add `baseRef` to the relevant wrapper(s).

### 6) CSS tweaks (only if needed)

- [ ] If the Economy card becomes too tall or the badges wrap awkwardly, add minimal spacing rules in:
  - [ ] `src/frontend/web/ifs/css/layout.css` or `src/frontend/web/ifs/css/simulator.css`
- [ ] Keep CSS changes minimal; avoid new layout systems—this is a prototype.

### 7) Cache-bust

- [ ] In `src/frontend/web/ifs/index.html`, update `?v=...` for every changed JS/CSS file, especially `src/frontend/web/WebUI.js` and any CSS you touched.

### 8) Manual test checklist (demo3.csv)

- [ ] Economy shows Return Profiles section at top with at least `Global Equity Index` and `Global Bond Index`.
- [ ] Economy shows country chips below, with a wrappers list for IE and AR.
- [ ] Each wrapper row shows a clear tax badge (CGT vs Exit Tax) and a tooltip referencing the profile.
- [ ] Switching economy mode hides/shows volatility column in the Return Profiles table only.
- [ ] Remove MV-AR (making relocation ineffective) and confirm the legacy single-country Economy UI returns and is usable.

### 9) Stop + revert workflow

- [ ] Stop and ask the user to revert these changes manually before starting the next UX variant.

