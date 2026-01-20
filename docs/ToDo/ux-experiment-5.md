# UX Experiment 5 — Automatic Linked Updates (Hidden Linking Key, No Global UI)

Goal: keep a per-country, wrapper-only Economy UI (country chips; editable Growth/Volatility per wrapper), but reduce user effort by automatically syncing market assumptions across wrappers that declare equivalence via a hidden link key (use `baseRef` as the linking key).

This variant tests whether “automatic syncing” feels helpful or confusing.

This is a UI-only prototype. It may not serialize and does not need to affect the simulation unless you explicitly wire it later.

---

## Preconditions / Setup

- [ ] Start from a clean baseline (no other UX variants applied).
- [ ] Load scenario `docs/demo3.csv` via the UI “Load” button (IE → AR at age 40).
- [ ] Confirm effective relocation is present (IE + AR).

## Success Criteria (What “Done” Means)

- [ ] Economy shows country chips and wrapper rows (like UX #1).
- [ ] Economy header includes toggle: “Link identical wrappers across countries” (default ON for this experiment).
- [ ] When ON, editing Growth/Volatility for a wrapper with `baseRef` updates all wrappers in all scenario countries with the same `baseRef`.
- [ ] Each wrapper row shows a tooltip listing its link key and which other rows will update.
- [ ] An unlinked wrapper (no `baseRef`) does not propagate changes.
- [ ] A toast confirms propagation (e.g. “Updated 2 linked rows”).
- [ ] When relocation is inactive, the existing single-country Economy UI remains usable.

---

## Files You Will Change (and cache-bust)

- [ ] `src/frontend/web/WebUI.js` (economy chips + per-country tables + linking toggle + propagation behavior + tooltips)
- [ ] `src/frontend/web/ifs/index.html` (cache-bust `WebUI.js` and any other touched scripts/CSS)
- [ ] Demo-only config verification:
  - [ ] `src/core/config/tax-rules-ie.json`
  - [ ] `src/core/config/tax-rules-ar.json`

Cache-busting rule:
- [ ] For each touched JS/CSS file, update its `?v=...` in `src/frontend/web/ifs/index.html`.

---

## Implementation Plan

### 1) Confirm the demo has linked + unlinked wrappers (config check)

For `docs/demo3.csv` (IE + AR), you need:
- [ ] At least one shared `baseRef` across countries (e.g. `globalEquity`).
- [ ] At least one wrapper in at least one country without `baseRef` to prove non-propagation.

Current baseline already satisfies this:
- [ ] IE: `indexFunds_ie` has `baseRef: globalEquity`
- [ ] AR: `shares_ar` has `baseRef: globalEquity`
- [ ] AR: `indexFunds_ar` has no `baseRef` (unlinked)

If this ever changes, update `src/core/config/tax-rules-ie.json` and/or `src/core/config/tax-rules-ar.json` to restore it.

### 2) Render the per-country wrapper-only Economy UI (same skeleton as UX #1)

- [ ] Implement the same per-country Economy UI as UX #1:
  - [ ] Country chips shown only when `hasMV = cfg.isRelocationEnabled() && this.hasEffectiveRelocationEvents()`.
  - [ ] A per-country table with editable wrapper rows:
    - [ ] Growth input id: `${t.key}GrowthRate`
    - [ ] Vol input id: `${t.key}GrowthStdDev`
  - [ ] (Optional) per-country inflation inputs if you want parity with UX #1; not required for the linking behavior itself.

### 3) Add the “Link identical wrappers across countries” toggle

UI placement:
- [ ] In the Economy card header (`#growthRates .card-header-flex`), add a compact toggle control:
  - [ ] Prefer a checkbox + label, or reuse an existing toggle-switch class if available.

State:
- [ ] In `WebUI`, store state in a boolean like `this.linkIdenticalWrappersEnabled`.
- [ ] Default it to `true` for this experiment.
- [ ] Persist to localStorage (optional, but helpful):
  - [ ] Key: `linkIdenticalWrappersAcrossCountries`
  - [ ] Value: `"true"` / `"false"`

### 4) Compute linked groups (by `baseRef`)

Build a cross-country lookup each time you render the Economy table:
- [ ] Gather all scenario countries: `this.getScenarioCountries()`.
- [ ] For each country code:
  - [ ] Read resolved investment types: `rs.getResolvedInvestmentTypes()`.
  - [ ] For each type with a truthy `baseRef`, append it to `groups[baseRef]`.

Store enough metadata to build nice tooltips:
- [ ] For each entry, keep:
  - [ ] `countryCode`
  - [ ] wrapper label (`t.label`)
  - [ ] wrapper key (`t.key`)

### 5) Attach propagation behavior to edits

Event binding:
- [ ] When rendering each wrapper row, attach an `input` or `change` listener to:
  - [ ] Growth input
  - [ ] Volatility input

Propagation rules:
- [ ] Only propagate if:
  - [ ] toggle is enabled
  - [ ] the wrapper has a `baseRef`
  - [ ] you are not already propagating (avoid loops)

Implementation details:
- [ ] Use a guard flag on `WebUI`, e.g. `this._isEconomyPropagating = true/false`.
- [ ] Determine the link key: `const linkKey = t.baseRef`.
- [ ] Compute the list of “other wrappers” from `groups[linkKey]` excluding the current wrapper key.
- [ ] For each target wrapper `other`:
  - [ ] Find its inputs by ids:
    - [ ] `${other.key}GrowthRate`
    - [ ] `${other.key}GrowthStdDev`
  - [ ] Set their `.value` to match the edited value(s).
  - [ ] Do not dispatch a synthetic change event unless you need other parts of the UI to react; keep it minimal to avoid loops.
- [ ] After propagation, show a toast:
  - [ ] `this.showToast(\`Updated ${n} linked rows\`, 'Linked update', 4);`

### 6) Tooltip: show link key + “also updates …”

For each wrapper row where `t.baseRef` exists:
- [ ] Set a tooltip (e.g. on the label cell’s `title`) that includes:
  - [ ] `Linked key: <baseRef>`
  - [ ] `Also updates: IE Index Funds, AR CEDEARs` (build list from the group)

Tooltip string format recommendation:
- [ ] Keep it short and single-paragraph so it renders well in native tooltips.

### 7) Cache-bust

- [ ] In `src/frontend/web/ifs/index.html`, update `?v=...` for `src/frontend/web/WebUI.js` (and any other touched assets).

### 8) Manual test checklist (demo3.csv)

- [ ] Load `docs/demo3.csv`; confirm countries IE + AR.
- [ ] Ensure the linking toggle is visible and ON.
- [ ] In Economy → IE tab:
  - [ ] Set “Index Funds” Growth to a visible value (e.g. 7).
  - [ ] Switch to AR tab and confirm the linked wrapper (“CEDEARs”) Growth matches.
  - [ ] Confirm the unlinked wrapper (“MERVAL”) did not change.
- [ ] Toggle linking OFF and confirm edits no longer propagate.
- [ ] Hover wrapper labels and confirm tooltips show link key + also-updates list.

### 9) Stop + revert workflow

- [ ] Stop and ask the user to revert these changes manually before starting the next UX variant.

