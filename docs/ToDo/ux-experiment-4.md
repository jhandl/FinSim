# UX Experiment 4 — Asset Mix Controls in Allocations (Static + Glidepath)

Intent: add a country-scoped “Asset Mix” control (Equities vs Bonds) to the Allocations card, including an optional glidepath editor. This is a UX-shape experiment only; it does not require the simulator to actually model bonds.

Scope: UI-only prototype. It does not need to serialize, and it does not need to affect simulation outputs.

Workflow constraint: implement only this UX variant, ask for manual testing, then revert to baseline before starting any other variant.

---

## Baseline Setup (once)

- [ ] Open FinSim in the browser.
- [ ] Load scenario `docs/demo3.csv` via the UI file import (IE → AR at age 40).
- [ ] Confirm relocation is enabled and the scenario includes an MV-* event (`MV-AR`).
- [ ] Confirm Allocations already shows country chips (IE + AR) in this scenario.

---

## Definition of “Done” (Acceptance Criteria)

- [ ] In Allocations, under the country chips and above wrapper allocation rows, render an “Asset Mix” block for the currently selected country.
- [ ] The Asset Mix block exists independently per country; switching chips preserves each country’s values.
- [ ] Asset Mix supports two modes:
  - [ ] `Static`: one field `Equities %` (Bonds is implied as remainder).
  - [ ] `Glidepath`: fields `Start age`, `End age`, `Equities % before`, `Equities % at end`.
- [ ] A compact preview string updates live:
  - [ ] Example: `100 → 60 from 55–65` for glidepath, or `Equities 80 / Bonds 20` for static.
- [ ] Layout stays compact and does not break existing allocation inputs.
- [ ] No changes to core simulation behavior; this is purely UI surface.

---

## Files Likely Touched

- [ ] `src/frontend/web/WebUI.js` (inject Asset Mix UI into per-country allocation containers; wire mode + preview)
- [ ] `src/frontend/web/ifs/index.html` (cache-bust `WebUI.js` and any changed CSS)
- [ ] Optional: `src/frontend/web/ifs/css/layout.css` and/or `src/frontend/web/ifs/css/simulator.css` (spacing/presentation)
- [ ] Optional: `src/frontend/web/assets/help.yml` (tooltip/help text only; keep it short)

Cache-busting rule:
- [ ] Update `?v=...` for any changed JS/CSS in `src/frontend/web/ifs/index.html` (SYSTEM UTILITIES script tags and any linked CSS).

Revert workflow between variants:
- [ ] Ask the user to revert the changes manually. Do not use git commands.

---

## Implementation Plan

### 1) Decide storage + IDs (must be per-country and not collide)

All Asset Mix fields must be keyed by country code (lowercase), so per-country values persist across chip switching.

Use these IDs (recommended):

- [ ] Hidden mode:
  - [ ] `AssetMixMode_<cc>` with values `static` or `glidepath`
- [ ] Static:
  - [ ] `AssetMixEquitiesPct_<cc>` (percentage input)
- [ ] Glidepath:
  - [ ] `AssetMixStartAge_<cc>` (age input)
  - [ ] `AssetMixEndAge_<cc>` (age input)
  - [ ] `AssetMixStartEquitiesPct_<cc>` (percentage input)
  - [ ] `AssetMixEndEquitiesPct_<cc>` (percentage input)
- [ ] Preview:
  - [ ] `AssetMixPreview_<cc>` (plain text element)

Example for IE:
- `AssetMixMode_ie`, `AssetMixEquitiesPct_ie`, `AssetMixStartAge_ie`, etc.

Create inputs using the existing helper `this._takeOrCreateInput(id, className)` to preserve values even if the container is rebuilt.

### 2) Choose the render hook (Allocations is the source of truth)

The Allocations per-country containers are built in `src/frontend/web/WebUI.js` in `_setupAllocationsCountryChips(...)`.

You must insert the Asset Mix block in two code paths:

1) Effective relocation path (chips visible):
- [ ] In `_setupAllocationsCountryChips(...)`, inside the loop that creates each `countryContainer` for `scenarioCountries`, insert Asset Mix UI immediately after pension contribution fields and before wrapper allocation rows.

2) “Relocation enabled but no effective MV-*” path (chips hidden, but per-country IDs still used):
- [ ] In the `if (!hasMV)` branch where `relocationEnabled` is true and a single `countryContainer` is built for StartCountry, insert Asset Mix UI in that container as well (same placement).

Do not add Asset Mix UI to the legacy (relocation disabled) path unless you explicitly want it there. This experiment is about country-scoped behavior, so only show it when per-country containers exist.

### 3) Render the Asset Mix block markup

Inside a given per-country `countryContainer`, create:

- [ ] Wrapper: `div` with:
  - [ ] `data-asset-mix="true"`
  - [ ] `data-country-code="<cc>"`
  - [ ] A compact tooltip via `title`:
    - [ ] “Applies to new investing while resident in this country. Does not change wrapper tax categories.”

Recommended layout inside the wrapper:

- [ ] Title row: `div` with text “Asset Mix”.
- [ ] Mode toggle row:
  - [ ] Two clickable `span.mode-toggle-option` elements: “Static” and “Glidepath”.
  - [ ] Apply `mode-toggle-active` class to the active one (match existing toggle styling).
- [ ] Static editor row:
  - [ ] Label “Equities %”
  - [ ] Input `AssetMixEquitiesPct_<cc>` (class `percentage`)
  - [ ] Optional small text “Bonds = 100 − equities”
- [ ] Glidepath editor rows (can be stacked vertically):
  - [ ] Start age input
  - [ ] End age input
  - [ ] Equities % before
  - [ ] Equities % at end
- [ ] Preview row:
  - [ ] A small text element with id `AssetMixPreview_<cc>`

Input attributes (match existing patterns):

- Percentage inputs:
  - [ ] `type="text"`, `inputmode="numeric"`, `pattern="[0-9]*"`, `step="1"`, `placeholder=" "`
  - [ ] class includes `percentage`
- Age inputs:
  - [ ] `type="text"`, `inputmode="numeric"`, `pattern="[0-9]*"`

After inserting, call existing formatting hooks:
- [ ] `this.formatUtils.setupPercentageInputs()` (if `this.formatUtils` exists).

### 4) Implement mode switching (per-country)

State:
- [ ] Ensure a hidden input exists for `AssetMixMode_<cc>`:
  - [ ] Use `this._takeOrCreateInput('AssetMixMode_' + cc, 'string')`.
  - [ ] Set default value to `static` if empty.

Show/hide:
- [ ] When mode is `static`:
  - [ ] Show the static editor row(s)
  - [ ] Hide the glidepath editor row(s)
- [ ] When mode is `glidepath`:
  - [ ] Hide the static editor row(s)
  - [ ] Show the glidepath editor row(s)

Click handlers:
- [ ] Clicking “Static” sets mode value and updates UI.
- [ ] Clicking “Glidepath” sets mode value and updates UI.

Important:
- [ ] Do not delete/recreate inputs when switching mode; only hide rows. This preserves typed values.

### 5) Implement live preview formatting

Add a small function on `WebUI` (or a closure inside the render method) like:
- [ ] `_updateAssetMixPreview(cc)`

Behavior:
- [ ] Read `AssetMixMode_<cc>`.
- [ ] If `static`:
  - [ ] Read equities input value; if numeric, compute implied bonds as `100 - equities`.
  - [ ] Render preview like `Equities 80 / Bonds 20` (or `80% / 20%` depending on the existing percentage formatting conventions).
- [ ] If `glidepath`:
  - [ ] Read start age/end age and equities before/at end.
  - [ ] Render preview like `<startPct> → <endPct> from <startAge>–<endAge>`.

Wiring:
- [ ] Attach `input` listeners to all Asset Mix inputs for that country, all calling `_updateAssetMixPreview(cc)`.
- [ ] Call `_updateAssetMixPreview(cc)` once after rendering to initialize the preview.

### 6) Ensure chip switching stays correct (no regressions)

Do not change existing Allocations chip logic:
- [ ] Keep `data-country-allocation-container="true"` containers intact.
- [ ] Keep allocation input ids unchanged:
  - [ ] `InvestmentAllocation_<countryCode>_<baseKey>` for wrapper allocation inputs.

Asset Mix must:
- [ ] Live inside each per-country container, so it naturally swaps with chip switching.
- [ ] Use only country-namespaced ids.

### 7) Optional CSS tweaks (only if needed)

If the block needs compact styling:
- [ ] Add minimal rules to one existing stylesheet (prefer `layout.css` if it’s layout/spacing):
  - [ ] Slight margin/padding for the Asset Mix wrapper
  - [ ] Smaller preview text styling
  - [ ] Make the mode toggle align with existing toggle styling

Do not introduce new layout frameworks; keep it a prototype.

### 8) Cache-bust

- [ ] Update `?v=...` for any changed assets in `src/frontend/web/ifs/index.html`:
  - [ ] `src/frontend/web/WebUI.js`
  - [ ] Any CSS files touched

### 9) Manual Test Checklist (demo3.csv)

- [ ] Load `docs/demo3.csv`.
- [ ] Go to Allocations and confirm chips show `IE` and `AR`.
- [ ] In IE tab:
  - [ ] Asset Mix appears above wrapper rows.
  - [ ] Switch to Static and enter Equities %; preview updates.
  - [ ] Switch to Glidepath and enter all fields; preview updates.
- [ ] Switch to AR tab:
  - [ ] Asset Mix has its own values and mode (not copied from IE).
- [ ] Switch back to IE:
  - [ ] Values persisted.
- [ ] Confirm wrapper allocation inputs are still present and editable.

### 10) Stop + revert workflow

- [ ] Stop here and ask the user to revert all changes manually back to baseline before starting another UX variant.

