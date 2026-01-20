# UX Experiment 4 — Asset Mix Controls in Allocations (Static + Glidepath) — Merged

Goal: prototype a country-scoped “Asset Mix” control (Equities vs Bonds) inside the Allocations card, including an optional glidepath editor. This is purely about UX shape; it does not require the simulator to implement bonds.

This is a UI-only prototype. It may not serialize and does not need to affect the simulation unless you explicitly wire it later.

Workflow constraint: implement **only** this UX variant, ask for manual testing, then revert to baseline before starting any other variant.

---

## Baseline Setup (once)

- [ ] Open FinSim in the browser.
- [ ] Load scenario `docs/demo3.csv` via the UI “Load” button (IE → AR at age 40).
- [ ] Confirm relocation is enabled and an MV-* event exists (`MV-AR`).
- [ ] Confirm Allocations shows country chips (IE + AR).

Revert workflow between variants:
- [ ] Ask the user to revert the changes manually. Do not use git commands.

Cache-busting rule (because JS/CSS will change):
- [ ] Update `?v=...` for any changed JS/CSS in `src/frontend/web/ifs/index.html` (SYSTEM UTILITIES script tags and any linked CSS).

---

## Success Criteria (What “Done” Means)

- [ ] Under Allocations, each country tab shows an “Asset Mix” block above the wrapper allocation rows.
- [ ] Mode toggle works:
  - [ ] Static shows only a single “Equities %” input (Bonds implied as remainder).
  - [ ] Glidepath shows `Start age`, `End age`, `Equities % before`, `Equities % at end`.
- [ ] A compact preview string updates live (e.g. `100 → 60 from 55–65`).
- [ ] Switching country chips preserves per-country Asset Mix values.
- [ ] Layout remains compact and doesn’t break the existing allocation inputs.
- [ ] No simulator behavior changes required (UI-only).

---

## Files You Will Change (and cache-bust)

- [ ] `src/frontend/web/WebUI.js` (inject Asset Mix block into per-country allocation containers; wire mode + preview)
- [ ] `src/frontend/web/ifs/index.html` (cache-bust `WebUI.js` and any other touched scripts/CSS)
- [ ] Optional CSS:
  - [ ] `src/frontend/web/ifs/css/layout.css` and/or `src/frontend/web/ifs/css/simulator.css`
- [ ] Optional help text:
  - [ ] `src/frontend/web/assets/help.yml`

---

## Implementation Plan

### 1) Decide where to render Asset Mix (must be per-country)

Render location:
- [ ] In `src/frontend/web/WebUI.js`, add the Asset Mix block inside each per-country allocations container created by `_setupAllocationsCountryChips(...)`.
  - [ ] For the `hasMV` path: inside the loop that creates `countryContainer` for each scenario country.
  - [ ] For the `!hasMV && relocationEnabled` path (single-country-but-relocation-enabled): inside the single `countryContainer`.

Placement:
- [ ] Insert Asset Mix block after pension contribution fields (or before them), but always above wrapper allocation rows.
- [ ] Keep the existing wrapper allocation inputs untouched.

Important persistence constraint:
- [ ] Do not delete/recreate Asset Mix inputs during re-render; reuse existing nodes via `this._takeOrCreateInput(...)` and only hide/show rows for mode switching. This prevents losing typed values when chips/containers rebuild.

### 2) Render the Asset Mix block UI

DOM structure inside a given `countryContainer`:
- [ ] `div` wrapper with `data-asset-mix="true"` and `data-country-code="<code>"`
- [ ] Header row:
  - [ ] Label: “Asset Mix”
  - [ ] Mode: two `span.mode-toggle-option` elements: `Static` and `Glidepath` (apply `mode-toggle-active` to the selected one)
- [ ] Static editor row:
  - [ ] Label: “Equities %”
  - [ ] Input: `AssetMixEquitiesPct_<code>` (class `percentage`)
  - [ ] Bonds implied as `100 - equities`
- [ ] Glidepath editor rows:
  - [ ] `AssetMixGlideStartAge_<code>` (type age)
  - [ ] `AssetMixGlideEndAge_<code>` (type age)
  - [ ] `AssetMixGlideStartEquitiesPct_<code>` (class `percentage`)
  - [ ] `AssetMixGlideEndEquitiesPct_<code>` (class `percentage`)
- [ ] Preview line:
  - [ ] A small text element with id like `AssetMixPreview_<code>` that updates on input changes.

Input creation (must preserve values):
- [ ] Use `this._takeOrCreateInput(id, className)` for each input so values persist across rerenders and chip switching.

Input attributes (match existing UI patterns):
- [ ] Percentage inputs:
  - [ ] `type="text"`, `inputmode="numeric"`, `pattern="[0-9]*"`, `step="1"`, `placeholder=" "`
- [ ] Age inputs:
  - [ ] `type="text"`, `inputmode="numeric"`, `pattern="[0-9]*"`

Tooltips (use `title` attributes; keep short):
- [ ] Asset Mix wrapper: “Applies to new investing while resident in this country.”
- [ ] Add to the preview line: “Preview of equities allocation policy.”

Formatting:
- [ ] After inserting the Asset Mix inputs, call `this.formatUtils.setupPercentageInputs()` (consistent with other UI code).

### 3) Wire up mode switching + per-country persistence

Mode state:
- [ ] Store mode in a hidden input per country (UI-only): `AssetMixMode_<code>` with values `static` or `glidepath`.
- [ ] Default mode to `static` when empty.

Switching behavior:
- [ ] Clicking `Static`:
  - [ ] Set hidden mode value to `static`
  - [ ] Show the static editor row(s)
  - [ ] Hide the glidepath editor row(s)
- [ ] Clicking `Glidepath`:
  - [ ] Set hidden mode value to `glidepath`
  - [ ] Hide static editor row(s)
  - [ ] Show glidepath editor row(s)

### 4) Implement the preview updater

- [ ] Implement a small function `updateAssetMixPreview(countryCode)` that:
  - [ ] Reads the current mode and inputs for that country
  - [ ] Formats a string like:
    - [ ] Static: `Equities: 80 (Bonds: 20)`
    - [ ] Glidepath: `100 → 60 from 55–65`
  - [ ] Writes it into `#AssetMixPreview_<code>`
- [ ] Bind this updater to `input` events on all Asset Mix inputs for the country.
- [ ] Call it once after rendering to initialize the preview.

### 5) Ensure no regressions in Allocations chip switching

- [ ] Do not change `data-country-allocation-container="true"` logic.
- [ ] Do not change allocation input ids (they must remain `InvestmentAllocation_<country>_<baseKey>`).
- [ ] Asset Mix inputs must be namespaced by country (as specified above) so values are per-tab.

### 6) Optional minimal CSS tweaks (only if needed)

- [ ] If spacing/compactness is off, add a small rule for the Asset Mix wrapper so it visually groups and doesn’t push wrapper rows too far down.
- [ ] Keep CSS changes minimal; this is a prototype.

### 7) Cache-bust

- [ ] In `src/frontend/web/ifs/index.html`, update `?v=...` for:
  - [ ] `src/frontend/web/WebUI.js`
  - [ ] Any changed CSS

---

## Manual Test Checklist (demo3.csv)

- [ ] Load `docs/demo3.csv`; confirm Allocations shows IE + AR chips.
- [ ] In IE tab:
  - [ ] Asset Mix block appears above wrapper allocation rows.
  - [ ] Static: enter Equities %; preview updates and bonds implied.
  - [ ] Glidepath: enter all four fields; preview updates to `X → Y from A–B`.
- [ ] Switch to AR tab:
  - [ ] Confirm AR has independent values and mode.
- [ ] Switch back to IE:
  - [ ] Confirm values persisted.
- [ ] Confirm wrapper allocation inputs still present and editable.

**Stop here and wait for feedback.** Then revert all changes to baseline.

