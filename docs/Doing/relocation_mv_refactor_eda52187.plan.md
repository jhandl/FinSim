---
name: Relocation MV Refactor
overview: "Refactor relocation events from per-country `type: MV-XX` to a single `type: MV` with destination country stored as a code in `event.name`, updating all core/UI/test call sites that currently pattern-match `MV-`."
todos:
  - id: inventory-mv-usage
    content: Inventory and remove all `MV-*` pattern-matching; migrate call sites to `type === 'MV'` and destination-from-`name` (use tiny local helpers only where they reduce duplication).
    status: completed
  - id: update-events-ui
    content: Update EventsTableManager and EventAccordionManager to store `type='MV'`, replace Name input with country dropdown, and keep labels/currency updates working.
    status: completed
  - id: update-core-derivations
    content: Update Simulator/Utils/Config residency timeline, getCountryForAge/getUniqueCountries, and syncTaxRuleSetsWithEvents to use MV + destination-in-name.
    status: completed
  - id: update-relocation-systems
    content: Update RelocationUtils, RelocationImpactDetector, and RelocationImpactAssistant to use MV + destination-in-name (remove substring(3)/MV- checks).
    status: completed
  - id: update-scenario-country-aggregation
    content: Update WebUI/UIManager/FileManager scenario-country detection and event-type validation to recognize MV and require destination selected.
    status: completed
  - id: update-wizard-docs-tests
    content: Update relocation wizard to write MV+name, update relocation docs, update all tests to new encoding, and ensure cache-busting is handled for edited web assets.
    status: completed
isProject: false
---

## Goal

Switch relocation encoding from `event.type = "MV-XX"` to:

- `event.type = "MV"`
- `event.name = "XX"` (destination ISO2 code in the same format as today’s `MV-XX` suffix)
- UI shows event type label as **Relocation** and uses a **Country dropdown** (no free text) instead of the Name field for MV rows.

## Guiding approach

- **Remove `MV-*` encoding entirely**. Replace all `type.startsWith('MV-')` / `^MV-[A-Z]{2,}$` / `substring(3)` usage with `type === 'MV'` and destination-from-`event.name`.
- Keep changes minimal and mechanical. Prefer inlining the new checks; introduce tiny local helper functions only when it clearly reduces duplication within a file.
- Maintain GAS compatibility for anything under `src/core/` (no imports/exports, simple functions).
- Do **not** add compatibility layers, fallbacks, or alternate parsing for legacy `MV-*` encodings.

## New canonical semantics

- **Relocation event**: `event.type === 'MV'`.
- **Destination country code**: `event.name` (e.g. `"AR"`).
- **Normalization rule**: for lookups and ruleset/cache keys, normalize to lowercase (`"ar"`) at the point of use (this matches existing behavior where `MV-XX` is stored uppercase but consumed as lowercase).

## Core changes (GAS-compatible)

Update all residency/country derivation and ruleset-preload logic to use the new encoding.

- `[/Users/jhandl/FinSim/src/core/Simulator.js](src/core/Simulator.js)`
  - Update `getResidencyTimeline()` which currently collects moves by scanning `e.type` for `MV-` and doing `e.type.substring(3)`.
  - Replace “is relocation” and “dest country” logic with helpers.
- `[/Users/jhandl/FinSim/src/core/Config.js](src/core/Config.js)`
  - In `syncTaxRuleSetsWithEvents(events, startCountry)` replace the scan:
    - from: `evt.type.indexOf('MV-') === 0` and `evt.type.substring(3)`
    - to: `evt.type === 'MV'` and destination derived from `evt.name`.
  - Keep the existing linked-country scan as-is.
- `[/Users/jhandl/FinSim/src/core/Utils.js](src/core/Utils.js)`
  - Update relocation lookup helpers:
    - `getCountryForAge()`
    - `getUniqueCountries()`
  - Any other logic that treats `^MV-[A-Z]{2,}$` as special should be updated to treat `type === 'MV'` as special.

## Web UI changes

### Events table (source of truth)

- `[/Users/jhandl/FinSim/src/frontend/web/components/EventsTableManager.js](src/frontend/web/components/EventsTableManager.js)`
  - Keep the “Relocation” option value as `MV` in the event-type dropdown.
  - Update the existing selection flow that currently:
    - shows the country modal
    - then writes `typeInput.value = MV-XX`
  - New behavior:
    - write `typeInput.value = 'MV'`
    - write destination country code to the Name cell (which will become a dropdown UI for MV)
    - ensure the **event type label displayed in the UI is `Relocation**` (destination is shown via the country dropdown / summary, not by mutating the type label into an arrow form).
  - Replace the Name text input for MV rows with a **Country dropdown** that:
    - shows full country names
    - stores country code into the underlying field used by `readEvents()` (i.e., `SimEvent.name`)
    - triggers the same downstream updates as before (detector run, tax ruleset sync, currency selector refresh).
  - Remove/retire “synthesize MV-* option objects so we don’t downgrade” logic; it becomes unnecessary.
  - Update all “if type changed to/from MV- relocation, update currency selector” branches to key off `val === 'MV'`.
  - After the migration, delete any remaining MV-* display/label synthesis paths (dead code).

### Accordion view

- `[/Users/jhandl/FinSim/src/frontend/web/components/EventAccordionManager.js](src/frontend/web/components/EventAccordionManager.js)`
  - Mirror the table behavior: MV events show a Country dropdown instead of a free-text name.
  - Update any MV-* label synthesis and MV-* detection to `type === 'MV'`.

### Rendering / labels / field visibility

- `[/Users/jhandl/FinSim/src/frontend/web/components/EventSummaryRenderer.js](src/frontend/web/components/EventSummaryRenderer.js)`
  - Replace the “special-case relocation MV-* to show arrow + country name” logic.
  - For `eventType === 'MV'`, use `event.name` as the country code to find the display name.
  - Update field-visibility gates that currently hide fields for `eventType.indexOf('MV-') === 0` (e.g. employer match, toAge) to hide for `eventType === 'MV'`.
- `[/Users/jhandl/FinSim/src/frontend/web/utils/FieldLabelsManager.js](src/frontend/web/utils/FieldLabelsManager.js)`
  - Replace MV-* special casing with `eventType === 'MV'`.

### Relocation utilities + impacts

- `[/Users/jhandl/FinSim/src/frontend/web/utils/RelocationUtils.js](src/frontend/web/utils/RelocationUtils.js)`
  - Update `extractRelocationTransitions()` to build transitions from `type === 'MV'` and destination read from `event.name`.
- `[/Users/jhandl/FinSim/src/frontend/web/components/RelocationImpactDetector.js](src/frontend/web/components/RelocationImpactDetector.js)`
  - Update timeline builder (`buildRelocationTimeline`) to collect MV events with `event.type === 'MV'`.
  - Replace all `mvEvent.type.substring(3)` with destination derived from `mvEvent.name`.
  - Update “skip MV events” checks from `event.type.indexOf('MV-') === 0` to `event.type === 'MV'`.
- `[/Users/jhandl/FinSim/src/frontend/web/components/RelocationImpactAssistant.js](src/frontend/web/components/RelocationImpactAssistant.js)`
  - Update the DOM fallback that currently checks `typeInput.value.startsWith('MV-')`.
  - Replace destination derivation `mvEvent.type.substring(3)` with `mvEvent.name`.

### Scenario-country aggregation (chips, per-country panels)

Update all places that derive “scenario countries = StartCountry + MV-* destinations”.

- `[/Users/jhandl/FinSim/src/frontend/web/WebUI.js](src/frontend/web/WebUI.js)`
  - `getScenarioCountries()`
  - `hasRelocationEvents()`
  - `hasEffectiveRelocationEvents()`
- `[/Users/jhandl/FinSim/src/frontend/UIManager.js](src/frontend/UIManager.js)`
  - Fallback scenario-country derivation currently regex-matching `^MV-[A-Z]{2,}$`.
  - Event-type validation currently allows MV-* via regex; update it to allow `'MV'` and validate that MV rows have a selected destination code.
  - The special `_mvRuntimeId` mirroring currently keys off `/^MV-[A-Z]{2,}$/`; switch to `type === 'MV'`.

### CSV load flow

- `[/Users/jhandl/FinSim/src/frontend/web/components/FileManager.js](src/frontend/web/components/FileManager.js)`
  - During load, it currently scans event rows for `^MV-[A-Z]{2,}$` to build scenario countries for priorities; update to scan for `type === 'MV'` and read destination from the Name column.

### Wizard flow

- `[/Users/jhandl/FinSim/src/frontend/web/components/EventsWizard.js](src/frontend/web/components/EventsWizard.js)`
- `[/Users/jhandl/FinSim/src/frontend/web/assets/events-wizard.yml](src/frontend/web/assets/events-wizard.yml)`
  - Ensure relocation wizard consumes `destCountryCode` independently of `eventType` being `MV-XX`.
  - When the wizard writes/updates the event, it should set `type = 'MV'` and `name = destCountryCode`.

## Tests + docs

- Update all tests that construct relocation events as `MV-XX` to use `type: 'MV'` + `name: 'XX'` (destination stored in name).
  - Update both unit/core tests and e2e specs that reference MV-* strings.
  - Rerun the full suite (`./run-tests.sh -t all`) and ensure no MV-* references remain unless they are unrelated literals.
- Update docs that describe `MV-XX`:
  - `[/Users/jhandl/FinSim/docs/relocation-system.md](docs/relocation-system.md)`

## Cache busting

Any edited web JS/CSS referenced by `[/Users/jhandl/FinSim/src/frontend/web/ifs/index.html](src/frontend/web/ifs/index.html)` must have its `?v=...` cache-busting parameter updated for the changed assets.

## Rollout checklist (implementation-time)

- Confirm you can:
  - Add an MV event, choose a country, see label update, and `readEvents()` yields `{ type: 'MV', name: 'XX', ... }`.
  - Run simulation: residency timeline changes at MV ages.
  - Tax rulesets pre-load for StartCountry + MV destinations.
  - Relocation impact detection still flags boundary/simple events.
  - Per-country chips/panels reflect scenario countries.
  - CSV save/load round-trips MV events.

## Dead code removal (mandatory)

After implementation and tests pass, do a final pass to remove deprecated MV-* support:

- Delete MV-* regex validation allowances (`^MV-[A-Z]{2,}$`) and any MV-* option synthesis logic in the UI.
- Remove MV-* specific branches/comments in relocation components (table/accordion/summary/detector/assistant).
- Verify a repo-wide search for `MV-` finds no remaining relocation encoding usage.

## Progress tracking

During implementation, track completion per section:

- Core: Simulator / Config / Utils
- UI: Table / Accordion / Summary+labels
- Relocation: Utils / Detector / Assistant
- Scenario countries: WebUI / UIManager / FileManager
- Wizard: EventsWizard + YAML
- Tests: update + run `./run-tests.sh -t all`
- Cache busting update

