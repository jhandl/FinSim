# UX Experiment 1 — Country-Only Economy (Wrappers Only, Per-Country)

Goal: prototype a relocation-aware Economy editor where users only see country wrappers (per-country `investmentTypes`) and can set Growth/Volatility/Inflation assumptions per country via country chips. Also remove the idea that MV-* events carry inflation (UI-only: hide/disable the MV-* “Rate” field).

This is a UI-only prototype. It may not serialize and does not need to affect the simulation unless you explicitly wire it later.

---

## Preconditions / Setup

- [ ] Start from a clean baseline (no other UX variants applied).
- [ ] Load scenario `docs/demo3.csv` via the UI “Load” button (IE → AR at age 40).
- [ ] Confirm relocation is enabled and an MV-* relocation event exists (`MV-AR`).

## Success Criteria (What “Done” Means)

- [ ] Economy card shows country chips for the scenario countries (IE + AR for `demo3.csv`).
- [ ] Switching the selected country swaps the visible wrapper rows and that country’s Inflation input.
- [ ] Economy mode toggle still works: volatility column hidden in deterministic mode and visible in Monte Carlo mode.
- [ ] MV-* events do not show an editable Rate field in either Events table view or accordion view.
- [ ] MV-* rows expose a tooltip/help message: “Inflation is set in Economy → (country tab).”
- [ ] When relocation is inactive (relocation disabled OR no effective MV-*), the existing single-country Economy UI remains usable.

---

## Files You Will Change (and cache-bust)

- [ ] `src/frontend/web/WebUI.js` (render economy chips + per-country tables; show/hide gating)
- [ ] `src/frontend/web/ifs/index.html` (cache-bust `WebUI.js` and any other touched scripts/CSS)
- [ ] `src/frontend/UIManager.js` (MV-* required fields pattern: hide Rate)
- [ ] `src/frontend/web/components/EventSummaryRenderer.js` (accordion visibility: hide rate for MV-*)
- [ ] `src/frontend/web/components/EventsTableManager.js` (MV tooltip/help text in table view)
- [ ] `src/frontend/web/components/EventAccordionManager.js` (MV tooltip/help text in accordion view, if not covered by shared renderer)
- [ ] Optional demo richness:
  - [ ] `src/core/config/tax-rules-ie.json`
  - [ ] `src/core/config/tax-rules-ar.json`

Cache-busting rule:
- [ ] For each touched JS/CSS file, update its `?v=...` in `src/frontend/web/ifs/index.html` (SYSTEM UTILITIES script tags and any linked CSS).

---

## Implementation Plan

### 1) Add a dedicated multi-country Economy container (do not break the legacy table)

- [ ] In `src/frontend/web/WebUI.js`, implement a small “economy multi-country UI” mount point inside the Economy card:
  - [ ] Locate the Economy card root: `const growthCard = document.getElementById('growthRates')`.
  - [ ] Locate the legacy economy table: `growthCard.querySelector('table.growth-rates-table')`.
  - [ ] Create (once) a sibling container inserted between the header and the legacy table:
    - [ ] `div` with a stable id like `economyMultiCountryContainer`.
    - [ ] Inside it, a `div.country-chip-container` for the country chips.
    - [ ] Inside it, a `div` for the per-country content containers (one per country, show/hide by chip selection).
- [ ] Gate visibility:
  - [ ] Determine “effective relocation” the same way Allocations does:
    - [ ] `const cfg = Config.getInstance();`
    - [ ] `const hasMV = cfg.isRelocationEnabled() && this.hasEffectiveRelocationEvents();`
  - [ ] If `hasMV`:
    - [ ] `economyMultiCountryContainer.style.display = ''`
    - [ ] `legacyTable.style.display = 'none'` (do not delete it)
  - [ ] Else:
    - [ ] `economyMultiCountryContainer.style.display = 'none'`
    - [ ] `legacyTable.style.display = ''`

Where to call this:
- [ ] Extend `refreshCountryChipsFromScenario(...)` in `src/frontend/web/WebUI.js` to also refresh the Economy card UI after Allocations/Personal Circumstances refresh (keep it lightweight; this method is already called from Events mutations and StartCountry changes).

### 2) Render the Economy country chips (reuse existing selector + sync behavior)

- [ ] In `src/frontend/web/WebUI.js`, add a property (similar to allocations):
  - [ ] `this.economyCountryChipSelector = null;`
- [ ] Create a method `_setupEconomyCountryChips(hasMV)`:
  - [ ] If `!hasMV`: hide the chip container and set `this.economyCountryChipSelector = null`.
  - [ ] If `hasMV`:
    - [ ] Compute scenario countries: `const scenarioCountries = this.getScenarioCountries();`
    - [ ] Map to `{ code, name }` using `cfg.getCountryNameByCode(code)`.
    - [ ] Select initial country:
      - [ ] Prefer `this.countryTabSyncManager.getSelectedCountry('economy')`
      - [ ] Else use any existing selector selection
      - [ ] Else default to `cfg.getStartCountry()`
    - [ ] Create selector:
      - [ ] `new CountryChipSelector(countries, selected, (code) => this._showEconomyCountry(code), 'economy')`
    - [ ] `render(...)` into the chip container.
    - [ ] Save selection back to `countryTabSyncManager` (`setSelectedCountry('economy', selected)`).

### 3) Render per-country wrapper rows + per-country inflation input

Data source:
- [ ] For each scenario country `code`, use `cfg.getCachedTaxRuleSet(code).getResolvedInvestmentTypes()` to obtain wrapper definitions.

DOM structure per country:
- [ ] Under `economyMultiCountryContainer`, create one `div` per country:
  - [ ] Attributes: `data-country-economy-container="true"` and `data-country-code="<code>"`
  - [ ] Only the selected country container is visible.
- [ ] Inside each country container render a table that matches the legacy Economy schema:
  - [ ] 3 columns: (label) / Growth Rate / Volatility.
  - [ ] One row per wrapper type:
    - [ ] Label cell: wrapper label text (`t.label`).
    - [ ] Growth input id: `${t.key}GrowthRate` with class `percentage`.
    - [ ] Volatility input id: `${t.key}GrowthStdDev` with class `percentage`.
    - [ ] Create inputs via the existing helper `this._takeOrCreateInput(id, 'percentage')` so values persist across rerenders.
  - [ ] One “Inflation” row at the bottom:
    - [ ] Input id: `Inflation_<countryCode>` (e.g. `Inflation_ie`, `Inflation_ar`) with class `percentage`.
    - [ ] No volatility cell content.

Formatting:
- [ ] After rendering inputs, call:
  - [ ] `this.formatUtils.setupPercentageInputs();` (guard only if `this.formatUtils` exists, consistent with existing patterns).
- [ ] Call `this.updateUIForEconomyMode()` after rendering so vol column visibility matches current mode.

Country switching:
- [ ] Implement `_showEconomyCountry(code)` like `_showAllocationsCountry`:
  - [ ] Hide all economy country containers and show only the matching one.

### 4) Add tooltips: “assumptions while resident” + MV-* “inflation lives in Economy”

Economy tooltips:
- [ ] Add a short tooltip in the Economy UI:
  - [ ] Either on the chip container or on the table header label cell: set `title` to “These are assumptions while resident in this country.”

Events (table view) MV-* tooltip:
- [ ] In `src/frontend/web/components/EventsTableManager.js`, add a tooltip/help text on MV-* rows:
  - [ ] In `updateFieldVisibility(typeSelect)` (or immediately after setting MV-* in the dropdown handler), detect MV-* (`eventType.indexOf('MV-') === 0`).
  - [ ] Set a `title` on the event type toggle or container (preferred: `.event-type-container`), e.g.:
    - [ ] `container.title = 'Inflation is set in Economy → (country tab).';`

Accordion MV-* tooltip:
- [ ] In `src/frontend/web/components/EventAccordionManager.js`, set the same help text on the accordion event type toggle wrapper for MV-* rows:
  - [ ] Best hook: inside `updateAccordionFieldVisibility(...)` after `updateAccordionDropdownToggle(...)`, set `title` on the dropdown wrapper.

### 5) Hide/disable MV-* “Rate” field everywhere (UI-only)

Events table view:
- [ ] In `src/frontend/UIManager.js`, change the MV-* pattern in `UIManager.getRequiredFields(eventType)`:
  - [ ] Current MV-* pattern is `rrr-o-` (Rate optional).
  - [ ] Replace with `rrr---` so `toAge`, `rate`, and `match` are hidden.
  - [ ] This will make `EventsTableManager.updateFieldVisibility(...)` hide the Rate input for MV-* rows automatically.

Accordion view:
- [ ] In `src/frontend/web/components/EventSummaryRenderer.js`, update `showsGrowthRateField(eventType, event)` to hide the rate editor for MV-*:
  - [ ] Add at the top: if `typeof eventType === 'string' && eventType.indexOf('MV-') === 0` return `false`.
  - [ ] This ensures `EventAccordionManager.updateAccordionFieldVisibility(...)` hides the “Rate” detail row for MV-*.

### 6) Optional demo richness: ensure 2+ wrappers per country (only if needed)

- [ ] Verify `src/core/config/tax-rules-ie.json` and `src/core/config/tax-rules-ar.json` each define at least two investment types (they currently do).
- [ ] If you want to stress-test layout scaling, add one more wrapper per country:
  - [ ] Give it a unique `key` with the country suffix (e.g. `bonds_ie`, `bonds_ar`).
  - [ ] Set `label` to something short.
  - [ ] Assign `baseRef` to `globalBonds` (exists in `tax-rules-global.json`) to keep semantics coherent.
  - [ ] Add a taxation block (`exitTax` or `capitalGains`) so the simulator schema stays consistent.

### 7) Cache-bust

- [ ] In `src/frontend/web/ifs/index.html`, update `?v=...` for every changed file, typically:
  - [ ] `src/frontend/web/WebUI.js`
  - [ ] `src/frontend/web/components/EventsTableManager.js`
  - [ ] `src/frontend/web/components/EventAccordionManager.js`
  - [ ] `src/frontend/web/components/EventSummaryRenderer.js`
  - [ ] Any touched CSS file

### 8) Manual test checklist (demo3.csv)

- [ ] Load `docs/demo3.csv`; confirm MV-* event exists.
- [ ] Economy card shows chips for `IE` and `AR`.
- [ ] Switching chips swaps wrapper rows and Inflation input.
- [ ] Toggle economy mode deterministic/Monte Carlo; volatility column hides/shows.
- [ ] Events table: MV-AR row does not show Rate input; hover event type shows tooltip about Economy inflation.
- [ ] Accordion: MV-AR detail view does not show Rate row; hover the type control shows the same tooltip.
- [ ] Remove/disable effective relocation (e.g., delete MV-AR) and confirm legacy Economy table reappears and is usable.

### 9) Stop + revert workflow

- [ ] Stop and ask the user to revert these changes manually before starting the next UX variant.

