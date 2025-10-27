<!-- 6cbc6cea-d463-467f-b112-0ae5ca7c70ce dcfa94a5-7c87-4843-b562-cc6f3ae3f37b -->
# Refactor: Generic Wizard + Consolidated EventsWizard.js

### Goals

- Create `WizardManager.js` (generic) and a minimal `WizardRenderer.js` base.
- Replace `EventWizardManager.js` + `EventWizardRenderer.js` with a single `EventsWizard.js` that composes the generic manager/renderer and contains all event-specific logic.
- Keep DOM ids/classes and behavior identical; do not change YAML.

### Scope and Non‑Goals

- In scope: frontend web wizard infrastructure; no changes to core `src/core/*` GAS‑compatible code; no schema changes to `events-wizard.yml`.
- Out of scope: implementing the relocation impact wizard UI/flow; only prepare the generic manager to support it later.

### Target Architecture

- `WizardManager` (new): generic flow engine (config loading, modal lifecycle, navigation, validation, action dispatch). No event‑specific logic.
- `WizardRenderer` (new): base renderers for `intro`/`input`/`choice`; text utils; extensible.
- `EventsWizard.js` (new):
  - Defines `EventsRenderer extends WizardRenderer` (port all logic from `EventWizardRenderer.js`: period, summary, mortgage, derived variables).
  - Defines `EventsWizard` that composes `WizardManager` with `EventsRenderer`, wires event hooks (`createEvent`, `createMortgageEvent`, `handleSpecialCases`, `validateWizardData`), delegates API methods (`startWizard`, `nextStep`, etc.).
  - Keeps overlay/modal ids and classes (`eventWizardOverlay`, `eventWizardModal`, `event-wizard-*`).

### Public API Contracts (for implementation reference)

- WizardManager (non‑module global class):
  - constructor(context, renderer, options)
    - context: typically the `webUI` instance (must expose `getValue(id)` etc.)
    - renderer: object with content renderers (see WizardRenderer)
    - options: `{ overlayId, modalId, cssPrefix }`
  - loadConfig(url, parser = window.jsyaml)
  - startWizard(idOrConfig, initialData = {}, onComplete = null, onCancel = null)
  - nextStep(origin = 'unknown')
  - previousStep()
  - cancelWizard()
  - closeWizard()
  - shouldShowStep(step)
  - evaluateCondition(conditionString)
  - validateWizardField(inputEl, fieldName, fieldType)
  - showWizardFieldValidation(inputEl, message, isWarningOnly = false)
  - clearWizardFieldValidation(inputEl)
  - State properties: `currentWizard`, `currentStep`, `wizardState`, `isActive`, `_stepHistory`
  - Hooks to be set by the feature wrapper (EventsWizard):
    - `onCompleteAction(eventData)` – invoked when a step uses `create`/`apply` action

- WizardRenderer (non‑module global class):
  - constructor(context)
  - render(step, wizardState) – dispatches to content methods by `step.contentType`
  - Default methods to provide or override: `renderIntroContent`, `renderInputContent`, `renderChoiceContent`, `renderPeriodContent`, `renderSummaryContent`, `renderMortgageContent`
  - Utilities: `processTextVariables(text, wizardState)` and any helpers required by templates

- EventsWizard (non‑module global class):
  - constructor(webUI)
    - Creates `this.manager = new WizardManager(webUI, new EventsRenderer(webUI), { overlayId: 'eventWizardOverlay', modalId: 'eventWizardModal', cssPrefix: 'event-wizard' })`
    - Loads `/src/frontend/web/assets/events-wizard.yml` via `this.manager.loadConfig(...)`
    - Wires hooks: `this.manager.onCompleteAction = (eventData) => this.createEvent(eventData)`
  - Delegated API for outside callers: `startWizard`, `nextStep`, `previousStep`, `cancelWizard`, `closeWizard`, `validateWizardField`, `clearWizardFieldValidation` – forward to `this.manager`
  - Event‑specific methods (ported 1:1 from old manager): `createEvent`, `createMortgageEvent`, `handleSpecialCases`, `validateWizardData`, `getCurrentAge`
  - Renderer: define `class EventsRenderer extends WizardRenderer` inside the same file and port all renderer logic there (period, summary, mortgage, derived variables)

### DOM and Styling Contracts (must remain unchanged)

- Overlay id: `eventWizardOverlay`
- Modal id: `eventWizardModal`
- Modal classes: `wizard-modal event-wizard-modal`
- Content classes: reuse existing `.event-wizard-*` class names so CSS and tests keep passing.

### Code Changes

1) Add `src/frontend/web/components/WizardManager.js` (generic core).
2) Add `src/frontend/web/components/WizardRenderer.js` (base).
3) Add `src/frontend/web/components/EventsWizard.js` (renderer + facade + wiring).
4) Update all call sites to use `webUI.eventsWizard`:
   - `src/frontend/web/WebUI.js` (instantiate only `this.eventsWizard = new EventsWizard(this)`; remove old property).
   - `src/frontend/web/components/EventsTableManager.js`.
   - `src/frontend/web/components/EventAccordionManager.js`.
   - Any other references to `eventWizardManager` (search/replace).
5) Delete obsolete files:
   - `src/frontend/web/components/EventWizardManager.js`.
   - `src/frontend/web/components/EventWizardRenderer.js`.

### Reference Update Checklist (search/replace hot‑spots)

- Replace property access `webUI.eventWizardManager` with `webUI.eventsWizard` in:
  - `src/frontend/web/components/EventsTableManager.js` (e.g., near lines ~2507, ~2670, ~2700)
  - `src/frontend/web/components/EventAccordionManager.js` (e.g., near line ~1410)
  - `src/frontend/web/WebUI.js` (constructor instantiation)
  - Any docs mentioning the old name (e.g., `docs/events-wizard-system.md`)
- Remove script includes in `src/frontend/web/ifs/index.html`:
  - `EventWizardRenderer.js`, `EventWizardManager.js`
- Add script includes (order after utils, before `WebUI.js`):
  - `WizardManager.js`
  - `WizardRenderer.js`
  - `EventsWizard.js`
- Update cache‑busting query strings to the current date, e.g. `?v=2025-10-23-1`.

### Tests and Docs

- Update tests that reference `eventWizardManager` to `eventsWizard`.
- Run wizard UI tests: `TestBasicWizardNavigation.spec.js`, `TestExpenseWizardNavigation.spec.js`, `TestSalaryWizardNavigation.spec.js`, `TestWizardFilterValidStepsUI.spec.js`.
- No change to YAML (`events-wizard.yml`).

### Acceptance Criteria

- Events wizard flows (salary, expense, property purchase w/ mortgage, stock market) behave identically to before (UI and validation).
- No occurrences of `eventWizardManager` remain in the codebase after migration.
- `index.html` loads only the three new files and no longer loads the old manager/renderer.
- All wizard tests pass as before; no style or DOM regressions (overlay/modal ids/classes unchanged).

### Implementation Hints and Risks

- Keep everything browser‑global (no ES modules) to match the current architecture.
- `WizardManager` holds all generic navigation and validation already present in `EventWizardManager.js` – move, don’t rewrite.
- `EventsWizard.js` should expose the same delegate methods so external code doesn’t need to learn new method names.
- Renderer code reads `webUI.eventsWizard` for validation helpers previously accessed via `webUI.eventWizardManager`.
- Keyboard/viewport handling and duplicate‑advance guards are subtle – port as‑is.
- After file deletions, re‑run the UI to confirm there are no 404s from stale script tags.

### Future Work (not in this change)

- Add `src/frontend/web/assets/relocation-wizard.yml` and implement a `RelocationWizard.js` using the same generic manager.

### To-dos

- [x] Create WizardManager.js and WizardRenderer.js (generic core)
- [x] Implement EventsWizard.js (renderer + facade + wiring)
- [x] Replace all references of `eventWizardManager` with `eventsWizard` in code and tests
- [x] Remove EventWizardManager.js and EventWizardRenderer.js
- [x] Bump cache-busting date in `src/frontend/web/ifs/index.html`
- [x] Run wizard tests and fix any regressions
- [x] Create WizardManager.js and WizardRenderer.js with generic APIs
- [x] Make EventWizardRenderer logic available via `EventsRenderer` (no functional changes)
- [x] Make EventWizardManager responsibilities available via `EventsWizard` + `WizardManager`
- [x] Ensure overlay/modal IDs and CSS classnames remain unchanged
- [x] Map create/apply actions and keep button behaviors identical
- [x] Run existing wizard UI tests and fix any regressions
- [x] Bump cache-busting date in ifs/index.html after JS edits

### Progress & Context

- Wizard core created: `src/frontend/web/components/WizardManager.js` and `WizardRenderer.js` now contain generic flow, validation, modal lifecycle, and content rendering primitives (browser‑global, non‑module).
- Events wizard implemented: `src/frontend/web/components/EventsWizard.js` composes the generic manager and inlines the event‑specific renderer logic to preserve DOM structure, ids/classes, and behavior (period, summary, mortgage, derived variables).
- Wiring updates:
  - `src/frontend/web/WebUI.js`: instantiate `this.eventsWizard = new EventsWizard(this)` (replaces `eventWizardManager`).
  - `EventsTableManager.js`, `EventAccordionManager.js`: all call‑sites updated to use `webUI.eventsWizard` (or its `manager`) APIs.
  - Old globals removed: `EventWizardManager.js`, `EventWizardRenderer.js` deleted. Index scripts switched to new files with cache‑busting.
- Cache busting: Updated `src/frontend/web/ifs/index.html` to load `WizardManager.js`, `WizardRenderer.js`, `EventsWizard.js` and bumped query strings for all modified assets.
- Test readiness tweaks (to satisfy UI specs and flakiness):
  - Added `_ignoreNextOverlayClick` guard on mobile Back to prevent immediate dismissal of the selection overlay.
  - Ensured rows get stable `data-row-id` (e.g., `row_1`) on add/replace so wizard/mini‑tour tests can target them deterministically.
  - Hardened welcome modal dismissal/wait in `FrontendTestUtils.js` to avoid Firefox headless flakiness.
  - Created the initial empty event row immediately after `Config.initialize()` to guarantee `row_1` is present early for tests.
  - Added accordion auto‑expand and robust rowId/accordion index scoping in the wizard to stabilize mini‑tour field targets on mobile.

### Test Status (current)

- Passing: `TestBasicWizardNavigation.spec.js`, `TestExpenseWizardNavigation.spec.js`, `TestSalaryWizardNavigation.spec.js`, `TestWizardFilterValidStepsUI.spec.js`.
- `TestWizardFilterValidStepsUI.spec.js`: all 65 tests pass across Chrome, Firefox, Safari, Pixel 5, and iPhone 13 following the stability tweaks above.

### Quick Start Checklist (next session)

1) Create `WizardManager.js` and move generic logic from `EventWizardManager.js` (modal lifecycle, navigation, validation, condition eval, keyboard/viewport, duplicate guards).
2) Create `WizardRenderer.js` and move generic intro/input/choice rendering blocks.
3) Create `EventsWizard.js`:
   - Inline `class EventsRenderer extends WizardRenderer` and paste all event‑specific renderers from `EventWizardRenderer.js`.
   - Inline `class EventsWizard` and paste event‑specific manager hooks from `EventWizardManager.js`.
   - Delegate public methods to the internal generic manager instance.
4) Update `WebUI.js` to instantiate `this.eventsWizard = new EventsWizard(this)`.
5) Update references in `EventsTableManager.js` and `EventAccordionManager.js` to use `eventsWizard`.
6) Update `ifs/index.html` script tags (remove old, add new) and bump cache‑busting.
7) Delete old files and run wizard tests.
8) Manual sanity through core flows.


