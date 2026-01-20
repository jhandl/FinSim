# UX Experiment 3 — Wrappers Only, Reveal Shared Profiles via Tooltips

Goal: keep the Economy UI wrapper-centric (per-country `investmentTypes` under country chips), but expose shared market behavior only via tooltips/metadata. No explicit global “Return Profiles” table.

This variant tests whether users can discover the “shared market behavior” concept without introducing new global UI surfaces.

This is a UI-only prototype. It may not serialize and does not need to affect the simulation unless you explicitly wire it later.

---

## Preconditions / Setup

- [ ] Start from a clean baseline (no other UX variants applied).
- [ ] Load scenario `docs/demo3.csv` via the UI “Load” button (IE → AR at age 40).
- [ ] Confirm effective relocation is present (StartCountry differs from at least one MV-* destination).

## Success Criteria (What “Done” Means)

- [ ] Economy shows country chips (IE + AR for `demo3.csv`).
- [ ] For each wrapper row, hovering reveals:
  - [ ] Profile identity (“Profile: …”) based on `baseRef`
  - [ ] Tax category (“Tax: CGT” / “Tax: Exit Tax”)
- [ ] Optional: a visible “linked” indicator appears when multiple wrappers in the same country share the same profile.
- [ ] Economy mode toggle still works (volatility column hidden in deterministic).
- [ ] When relocation is inactive, the existing single-country Economy UI remains usable.

---

## Files You Will Change (and cache-bust)

- [ ] `src/frontend/web/WebUI.js` (economy chips + per-country tables + tooltips/indicators)
- [ ] `src/frontend/web/ifs/index.html` (cache-bust `WebUI.js` and any other touched scripts/CSS)
- [ ] Demo-only config to create “shared profile” cases:
  - [ ] `src/core/config/tax-rules-ie.json`
  - [ ] `src/core/config/tax-rules-ar.json`
- [ ] Optional CSS for the linked indicator:
  - [ ] `src/frontend/web/ifs/css/simulator.css` and/or `src/frontend/web/ifs/css/layout.css`

Cache-busting rule:
- [ ] For each touched JS/CSS file, update its `?v=...` in `src/frontend/web/ifs/index.html`.

---

## Implementation Plan

### 1) Render the per-country wrapper-only Economy UI (same skeleton as UX #1)

- [ ] Implement the same “economy multi-country container” approach as UX #1:
  - [ ] Show it only when `hasMV = cfg.isRelocationEnabled() && this.hasEffectiveRelocationEvents()`.
  - [ ] Hide the legacy `table.growth-rates-table` only when `hasMV` is true.
- [ ] Country chips:
  - [ ] Use `CountryChipSelector` with a stable panel id (e.g. `economy`).
  - [ ] Switching chips shows/hides `data-country-economy-container="true"` blocks.
- [ ] Per-country table:
  - [ ] 3 columns: wrapper label / Growth Rate / Volatility.
  - [ ] Row inputs:
    - [ ] Growth: `${t.key}GrowthRate`
    - [ ] Vol: `${t.key}GrowthStdDev`
  - [ ] Use `this._takeOrCreateInput` to reuse inputs across rerenders.

### 2) Add tooltip metadata for each wrapper row

For each wrapper row:
- [ ] Compute profile label:
  - [ ] If `t.baseRef` exists: lookup `Config.getInstance().getInvestmentBaseTypeByKey(t.baseRef)` and use its `label` (fallback to the baseRef key if label missing).
  - [ ] If `t.baseRef` is missing: set profile to “(local-only)” or omit the profile line.
- [ ] Compute tax category:
  - [ ] If `t.taxation && t.taxation.exitTax` exists => `Exit Tax`
  - [ ] Else if `t.taxation && t.taxation.capitalGains` exists => `CGT`
  - [ ] Else => `Unknown`
- [ ] Set tooltip text (use `title` attribute on the label cell or entire row):
  - [ ] `Profile: <profileLabel> (<baseRef>)`
  - [ ] `Tax: <CGT|Exit Tax>`
  - [ ] (Optional) `Wrapper key: <t.key>`

### 3) Optional: visible “linked” indicator for shared profiles within a country

- [ ] For each country, build a frequency map of `baseRef` across that country’s `investmentTypes`:
  - [ ] Only count types with a truthy `baseRef`.
- [ ] When rendering each wrapper row:
  - [ ] If `countByBaseRef[t.baseRef] >= 2`, add a small inline indicator next to the label:
    - [ ] Example: a `<span class="economy-linked-indicator">linked</span>`
  - [ ] Add `title` to the indicator: “Shares market behavior with other wrappers in this country.”

CSS (minimal):
- [ ] Add a compact style for `.economy-linked-indicator`:
  - [ ] Small font-size, subdued color, slight border/background.

### 4) Demo-only config tweak: ensure each country has 2 wrappers sharing the same baseRef

Current baseline has only one `baseRef` per country (IE has `indexFunds_ie` with `globalEquity`; AR has `shares_ar` with `globalEquity`). To validate the “linked” indicator, add another wrapper in each country that shares `baseRef: "globalEquity"`.

In `src/core/config/tax-rules-ie.json`:
- [ ] Add a new investment type object to the `investmentTypes` array, for example:
  - [ ] `key`: `equityEtf_ie` (must be unique, include `_ie`)
  - [ ] `label`: “Equity ETF”
  - [ ] `baseRef`: `"globalEquity"`
  - [ ] Provide a `taxation` block (pick one consistent with the country):
    - [ ] Either copy the `exitTax` shape from `indexFunds_ie` (keeps the “wrapper” concept consistent),
    - [ ] Or use a `capitalGains` block if you want a mixed-tax demo.

In `src/core/config/tax-rules-ar.json`:
- [ ] Add a new investment type object to the `investmentTypes` array, for example:
  - [ ] `key`: `cedears2_ar` (must be unique, include `_ar`)
  - [ ] `label`: “CEDEARs (Alt)”
  - [ ] `baseRef`: `"globalEquity"`
  - [ ] Provide a `taxation.capitalGains` block (copy the shape from `shares_ar`).

Notes:
- [ ] These are temporary demo-only changes; they may influence simulation behavior if you run it.

### 5) Ensure economy mode toggle still works

- [ ] After rendering the per-country tables, call `this.updateUIForEconomyMode()` so volatility column visibility matches current mode.
- [ ] Ensure volatility inputs end with `GrowthStdDev` so existing preserve/restore logic still works.

### 6) Cache-bust

- [ ] In `src/frontend/web/ifs/index.html`, update `?v=...` for:
  - [ ] `src/frontend/web/WebUI.js`
  - [ ] Any changed CSS
  - [ ] Any other touched JS files

### 7) Manual test checklist (demo3.csv)

- [ ] Load `docs/demo3.csv`; confirm countries IE + AR.
- [ ] Economy shows chips and wrapper rows per country.
- [ ] Hover each wrapper row and confirm tooltip shows Profile and Tax category.
- [ ] If linked indicator implemented:
  - [ ] Verify it appears for wrappers sharing `globalEquity` in IE and AR.
- [ ] Toggle economy mode deterministic/Monte Carlo and confirm volatility column hides/shows.
- [ ] Remove MV-AR and confirm the legacy single-country Economy table returns and is usable.

### 8) Stop + revert workflow

- [ ] Stop and ask the user to revert these changes manually before starting the next UX variant.

