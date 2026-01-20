# UX Experiment 4 — Asset Mix Controls in Allocations (Static + Glidepath)

Goal: prototype a country-scoped “Asset Mix” control (Equities vs Bonds) inside the Allocations card, including an optional glidepath editor. This is purely about UX shape; it does not require the simulator to implement bonds.

This is a UI-only prototype. It may not serialize and does not need to affect the simulation unless you explicitly wire it later.

---

## Preconditions / Setup

- [ ] Start from a clean baseline (no other UX variants applied).
- [ ] Load scenario `docs/demo3.csv` via the UI “Load” button (IE → AR at age 40).
- [ ] Confirm Allocations shows country chips (effective relocation present).

## Success Criteria (What “Done” Means)

- [ ] Under Allocations, each country tab shows an “Asset Mix” block above the wrapper allocation rows.
- [ ] Mode toggle works:
  - [ ] Static shows only a single “Equities %” input.
  - [ ] Glidepath shows `Start age`, `End age`, `Equities % before`, `Equities % at end`.
- [ ] A compact preview string updates live (e.g. “100 → 60 from 55–65”).
- [ ] Switching country chips preserves per-country Asset Mix values.
- [ ] Layout remains compact and doesn’t break the existing allocation inputs.

---

## Files You Will Change (and cache-bust)

- [ ] `src/frontend/web/WebUI.js` (inject Asset Mix block into per-country allocation containers)
- [ ] `src/frontend/web/ifs/index.html` (cache-bust `WebUI.js` and any other touched scripts/CSS)
- [ ] Optional CSS:
  - [ ] `src/frontend/web/ifs/css/layout.css` and/or `src/frontend/web/ifs/css/simulator.css`
- [ ] Optional help text:
  - [ ] `src/frontend/web/assets/help.yml`

Cache-busting rule:
- [ ] For each touched JS/CSS file, update its `?v=...` in `src/frontend/web/ifs/index.html`.

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

### 2) Render the Asset Mix block UI

DOM structure inside a given `countryContainer`:
- [ ] `div` wrapper with `data-asset-mix="true"` and `data-country-code="<code>"`
- [ ] Header row:
  - [ ] Label: “Asset Mix”
  - [ ] Mode toggle: two `span.mode-toggle-option` elements: `Static` and `Glidepath`
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

Input creation:
- [ ] Use `this._takeOrCreateInput(id, className)` for each input so values persist across rerenders.
- [ ] Match existing patterns:
  - [ ] `inputmode="numeric"` and `pattern="[0-9]*"` on numeric inputs.
  - [ ] `placeholder=" "` for percentage inputs to keep alignment with existing styles.

Tooltips (as `title` attributes):
- [ ] On the Asset Mix wrapper: “Applies to new investing while resident in this country.”
- [ ] On the mode toggle: “Static = fixed equities %, Glidepath = linear shift over age range.”
- [ ] On the preview: “Preview of equities allocation policy.”

### 3) Wire up mode switching + per-country persistence

Mode state:
- [ ] Store mode in a hidden input per country (UI-only):
  - [ ] `AssetMixMode_<code>` with values `static` or `glidepath`
- [ ] Default mode to `static`.

Switching behavior:
- [ ] Clicking `Static`:
  - [ ] Set hidden mode value to `static`
  - [ ] Show the static editor row(s)
  - [ ] Hide the glidepath editor row(s)
- [ ] Clicking `Glidepath`:
  - [ ] Set hidden mode value to `glidepath`
  - [ ] Hide static editor row(s)
  - [ ] Show glidepath editor row(s)

Preview updater:
- [ ] Implement a small function `updateAssetMixPreview(countryCode)` that:
  - [ ] Reads the current mode and inputs for that country
  - [ ] Formats a string like:
    - [ ] Static: “Equities: 80 (Bonds: 20)”
    - [ ] Glidepath: “100 → 60 from 55–65”
  - [ ] Writes it into `#AssetMixPreview_<code>`
- [ ] Bind this updater to `input` events on all Asset Mix inputs.

Formatting:
- [ ] After inserting the Asset Mix inputs, call:
  - [ ] `this.formatUtils.setupPercentageInputs();`

### 4) Ensure no regressions in Allocations chip switching

- [ ] Do not change `data-country-allocation-container="true"` logic.
- [ ] Do not change allocation input ids (they must remain `InvestmentAllocation_<country>_<baseKey>`).
- [ ] Asset Mix inputs must be namespaced by country so values are per-tab.

### 5) Optional minimal CSS tweaks

Only if needed for spacing:
- [ ] Add a CSS rule for the Asset Mix wrapper so it visually groups and doesn’t push wrapper rows too far down.

### 6) Cache-bust

- [ ] In `src/frontend/web/ifs/index.html`, update `?v=...` for:
  - [ ] `src/frontend/web/WebUI.js`
  - [ ] Any changed CSS

### 7) Manual test checklist (demo3.csv)

- [ ] Load `docs/demo3.csv`; confirm Allocations shows IE + AR chips.
- [ ] In IE tab:
  - [ ] Set Asset Mix mode Static; enter Equities %; confirm preview updates.
  - [ ] Switch to Glidepath; enter all fields; confirm preview updates.
- [ ] Switch to AR tab:
  - [ ] Confirm AR has independent values and mode.
- [ ] Switch back to IE and confirm values persisted.
- [ ] Confirm wrapper allocation inputs still present and editable.

### 8) Stop + revert workflow

- [ ] Stop and ask the user to revert these changes manually before starting the next UX variant.

