# UX Experiment 6 — Per-Country Inputs + Copy/Clone Helpers (No Global Concepts)

Goal: accept per-country duplication as the default mental model (simple, wrapper-centric), but reduce user effort with one-click copy actions:
- Economy: copy all wrapper assumptions + inflation from another country.
- Allocations: copy wrapper allocation percentages from another country.

This avoids exposing global profile concepts while still making multi-country setup fast.

This is a UI-only prototype. It may not serialize and does not need to affect the simulation unless you explicitly wire it later.

---

## Preconditions / Setup

- [ ] Start from a clean baseline (no other UX variants applied).
- [ ] Load scenario `docs/demo3.csv` via the UI “Load” button (IE → AR at age 40).
- [ ] Confirm effective relocation is present (IE + AR).

## Success Criteria (What “Done” Means)

- [ ] Economy shows country chips and per-country wrapper assumption inputs (Growth/Volatility + Inflation per country).
- [ ] Economy has a “Copy from…” control that copies:
  - [ ] Wrapper Growth/Volatility values (best-effort matching)
  - [ ] Inflation
- [ ] Allocations has a “Copy from…” control per country tab that copies wrapper allocation percentages.
- [ ] Copy actions show a toast and overwrite the target country values.
- [ ] When relocation is inactive, existing single-country UIs remain usable.

---

## Files You Will Change (and cache-bust)

- [ ] `src/frontend/web/WebUI.js` (economy per-country UI + copy controls for Economy + Allocations)
- [ ] `src/frontend/web/ifs/index.html` (cache-bust `WebUI.js` and any other touched scripts/CSS)
- [ ] Optional CSS:
  - [ ] `src/frontend/web/ifs/css/layout.css` and/or `src/frontend/web/ifs/css/simulator.css`

Cache-busting rule:
- [ ] For each touched JS/CSS file, update its `?v=...` in `src/frontend/web/ifs/index.html`.

---

## Implementation Plan

### 1) Render per-country Economy inputs (wrapper-only, per country)

Implement the same skeleton as UX #1:
- [ ] In `WebUI`, create a multi-country economy container shown only when:
  - [ ] `hasMV = cfg.isRelocationEnabled() && this.hasEffectiveRelocationEvents()`
- [ ] Use `CountryChipSelector` to switch visible country economy containers.
- [ ] In each country economy container render:
  - [ ] One row per wrapper (`rs.getResolvedInvestmentTypes()`):
    - [ ] Growth: `${t.key}GrowthRate`
    - [ ] Vol: `${t.key}GrowthStdDev`
  - [ ] One inflation input per country: `Inflation_<code>` (e.g. `Inflation_ie`, `Inflation_ar`)
- [ ] Ensure `updateUIForEconomyMode()` runs after render so vol column hides/shows.

### 2) Add “Copy from…” control to the Economy card

UI placement:
- [ ] In the Economy multi-country container (above the country chips), add:
  - [ ] A `<select>` listing “other countries” (all scenario countries except currently selected).
  - [ ] A “Copy” button.
  - [ ] A tooltip: “Copy overwrites current country values.”

Suggested ids:
- [ ] `EconomyCopyFromSelect`
- [ ] `EconomyCopyFromButton`

Behavior:
- [ ] On click:
  - [ ] `target = selected country` (from the economy chip selector)
  - [ ] `source = select value`
  - [ ] Copy inflation:
    - [ ] `Inflation_<source>` → `Inflation_<target>`
  - [ ] Copy wrapper assumptions (best-effort matching):
    - [ ] Build source map:
      - [ ] For each source wrapper type `tSrc`, derive a base key:
        - [ ] Use existing helper `this._toBaseInvestmentKey(tSrc.key, source)` (removes `_ie` / `_ar` suffix).
      - [ ] Map `baseKey -> tSrc.key`
    - [ ] Build target map similarly: `baseKey -> tTgt.key`
    - [ ] For each `baseKey` present in both:
      - [ ] Copy growth:
        - [ ] `${tSrc.key}GrowthRate` → `${tTgt.key}GrowthRate`
      - [ ] Copy volatility:
        - [ ] `${tSrc.key}GrowthStdDev` → `${tTgt.key}GrowthStdDev`
    - [ ] Ignore wrappers that don’t match; this is acceptable for the prototype.
  - [ ] Show toast: `Copied Economy from <SRC> to <TGT>`.

### 3) Add “Copy from…” control to Allocations

Allocations already has per-country containers when relocation is enabled and effective; reuse that structure.

Placement:
- [ ] In `_setupAllocationsCountryChips(...)`, after you create `countryContainer` for each country and before wrapper allocation inputs, inject a copy control row.
- [ ] The control must be per-country container so each tab has its own dropdown that excludes itself.

Suggested ids (per country):
- [ ] `AllocationsCopyFromSelect_<code>`
- [ ] `AllocationsCopyFromButton_<code>`

Copy behavior:
- [ ] On click, copy wrapper allocation percentages only:
  - [ ] Build source wrapper base-key map using `rs.getResolvedInvestmentTypes()` for source:
    - [ ] `baseKey = this._toBaseInvestmentKey(t.key, source)`
    - [ ] Allocation input id source: `InvestmentAllocation_<source>_<baseKey>`
  - [ ] For each matching baseKey in target:
    - [ ] Target input id: `InvestmentAllocation_<target>_<baseKey>`
    - [ ] Set target value to source value (if non-empty).
  - [ ] Show toast: `Copied Allocations from <SRC> to <TGT>`.

Important constraints:
- [ ] Do not rename or remove any existing allocation inputs; only set their values.
- [ ] Do not attempt to copy pension contribution fields unless explicitly desired; keep scope to wrapper allocation percentages.

### 4) Keep legacy single-country behavior intact

- [ ] Only show Economy copy controls when `hasMV` and there are at least 2 scenario countries.
- [ ] Allocations copy controls should only appear inside per-country containers (i.e., when those containers are rendered).
- [ ] If relocation is inactive, do not show copy controls; keep the legacy UI unchanged.

### 5) CSS tweaks (optional)

- [ ] If the copy control looks cramped, add minimal spacing rules in `layout.css` or `simulator.css`.

### 6) Cache-bust

- [ ] In `src/frontend/web/ifs/index.html`, update `?v=...` for `src/frontend/web/WebUI.js` (and any other changed assets).

### 7) Manual test checklist (demo3.csv)

Economy:
- [ ] In IE tab, set Growth/Vol values + Inflation.
- [ ] Switch to AR tab; use “Copy from IE”; confirm AR values populate.
- [ ] Change AR values; copy again to confirm overwrite semantics.

Allocations:
- [ ] In IE tab, set wrapper allocations to distinctive values.
- [ ] Switch to AR tab; use “Copy from IE”; confirm AR allocations populate.

General:
- [ ] Confirm toasts appear for copy actions.
- [ ] Confirm removing MV-AR returns to legacy single-country UI (no copy controls shown).

### 8) Stop + revert workflow

- [ ] Stop and ask the user to revert these changes manually before starting the next UX variant.

