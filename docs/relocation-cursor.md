### Relocation, Residency, Currency, and Pension Systems

This document specifies the design and implementation plan for relocation (country change) in FinSim. It aligns with the app’s constraints: events table as the single source of truth, GAS‑compatible core, and a modern web UI with a dual table/accordion system.

### Goals

- Make residency changes explicit as events users can create and edit.
- Keep the events table the source of truth; show timelines as a visual layer derived from events.
- Handle currency, FX, inflation, and tax switching correctly when moving.
- Provide a relocation impact assistant that proposes safe defaults, supports delta‑only review, and blocks the simulation until conflicts are resolved.
- Respect country‑specific pension systems when users move.

### Scope

- Event model and UX for relocation moves.
- Residency derivation from events plus Starting Position.
- Currency/indexation/default behavior and the relocation impact assistant.
- Simulation gating until impacted items are resolved.
- Country pension system differences and auto‑adjustments.

Does not introduce new CSV columns initially; decisions are stored locally and reproducible from the events + MV events.

## 1) Event model

- Event type: `MV-XX` where `XX` is ISO‑3166 country code (e.g., `MV-IE`, `MV-AR`). A generic `MV` is allowed for unsupported countries.
- Columns mapping (fits current schema):
  - `name` (aka ID): destination country. Should contain a recognizable value (e.g., `Argentina (AR)`); parser extracts `AR`.
  - `amount`: one‑off relocation cost (currency defaults to destination Local; no indexation by default).
  - `fromAge`/`fromYear`: effective relocation time (single point).
  - `toAge`, `rate`, `match`: hidden for `MV-*`.

Field visibility is driven by `UIManager.getRequiredFields(eventType)` and dynamic checks for `eventType.startsWith('MV')`.

### UI: Event type dropdown and wizard

- Dropdown: add a top‑level “Relocation” category with a submenu of supported countries (those with `tax-rules-*.json`). Selecting a country creates an event type `MV-XX`.
- Wizard flow: “Where?” (country picker) → “When?” (from age/year) → “Total cost?”

Code integration points:
- `src/frontend/web/components/EventsTableManager.js`
  - `getEventTypeOptionObjects()` → add a Relocation category. Options use values like `MV-IE`, labels like “Relocation → Ireland”.
  - `updateFieldVisibility()` already uses `UIManager.getRequiredFields` and will honor `MV-*` rules.
- `src/frontend/web/components/EventWizardManager.js` → add a simple three‑step wizard definition in `assets/events-wizard.yml` and map it to `MV`.

## 2) Residency derivation

Residency is derived at runtime from:
1) Starting Position’s start country (new parameter: `StartCountry`, populated via IP geo default, user‑overridable).
2) Sorted `MV-*` events by effective time.

Rules:
- If no `MV-*` exists, residency remains the Starting Position country throughout.
- If one or more `MV-*` exist, residency switches at each `from` point accordingly.
- Multiple `MV-*` in the same year/age → validation error.
- Residency is a piecewise constant function over time. It sets active tax rules, default Local currency, and default Local CPI.

Implementation:
- Core: continue to keep country rules in `TaxRuleSet` (core file). Residency derivation can live on the frontend before calling the core simulator, mapping years to country codes and providing a `defaultCountry` to `Config` for each simulated year.
- UIManager `readEvents(validate=true)` builds `SimEvent` for core. Add a residency pre‑pass in WebUI just before `run()` to determine active `TaxRuleSet` per year.

References:
- `src/frontend/web/WebUI.js` → `setupRunSimulationButton()` / `handleRunSimulation()` is the place to gate and precompute.
- `src/core/Config.js` and `src/core/TaxRuleSet.js` remain unchanged in API but may receive a lightweight helper call to select per‑year rules (frontend supplies the active country per year).

## 3) Currencies, FX, inflation defaults

Interpretation defaults per category on move:
- Rebase to destination Local currency (no split by default): salaries, generic living expenses.
- Retain original asset currency: mortgages, property‑linked rent, security payouts.
- One‑off relocation costs: destination Local; no indexation by default.

Reporting:
- Scenario has a base reporting currency (default = first residency currency). Convert for reporting only via year‑average FX.

Future enhancement (optional, not required for initial rollout): per‑amount currency “chips” to override default modes (Local/Asset/Explicit) and indexation sources.

FX and CPI data:
- FX: a small helper (web only) supplying year‑average FX rates, cached in `Config`. Allows manual overrides in Settings.
- CPI: use the destination country’s CPI for “Local” amounts, otherwise follow amount’s currency country if overridden.

## 4) Relocation Impact Assistant (delta‑only)

Purpose:
- When an `MV-*` is created or its date changes, identify newly impacted events and propose safe actions. Only show deltas since the prior resolution.
- Block simulation while unresolved items remain.

Triggers:
- On inserting an `MV-*` or changing its `fromAge`/`fromYear`.
- On pressing Run, if unresolved impacts exist.

Detection:
- For a given move boundary `B`, classify each event with span `[from..to]` into `pre`, `post`, or `crosses`.
- On date change from `B_old` to `B_new`, an event is newly impacted if its relation to the boundary changed: `pre↔post`, `pre→crosses`, `post→crosses`, `crosses→(pre|post)`.
- Previously split events: if both pieces now fall entirely on one side, propose rejoin.

Actions per event:
- Split at move (create two rows), with category defaults applied per post‑move segment.
- Rebase without split (single row, post‑move interpretation changes).
- Retain currency (assets, mortgages, property‑linked items).
- Rejoin (if split becomes unnecessary).
- Defer (mark as Needs Review and block Run until resolved later).

Persistence and delta logic:
- Store resolution decisions in `localStorage` keyed by `relocationResolutions:<scenarioHash>:<mvEventId>`.
- For each impacted event: `{ status: resolved|deferred, action: split|rebase|retain|rejoin, details, fingerprint }`.
- Fingerprint captures structural fields (type, name, amount, fromAge, toAge, rate, match). If a fingerprint changes (user edits), the stored decision is invalidated and item is shown again.

Blocking Run:
- Before `run()` in `WebUI.handleRunSimulation`, call the assistant’s `ensureResolvedOrPrompt()`.
- If unresolved items exist, open the assistant scoped to those items; on completion, proceed to `run()` automatically.

UI affordances:
- Badge “Needs Review” on impacted rows (table and accordion) until resolved.
- Quick filter: “Show unresolved only.”
- Summary banner in assistant: “X new items require decisions; Y previously resolved.”

Implementation references and hooks:
- New component: `src/frontend/web/components/RelocationImpactAssistant.js` (web only).
- Hook creation/date‑change:
  - `src/frontend/web/components/EventsTableManager.js`
    - When a row’s type becomes `MV-*` (in `getEventTypeOptionObjects`/selection callback) or its `.event-from-age` changes → notify assistant with the MV row context.
- Gating Run:
```12:755:src/frontend/web/WebUI.js
runButton.addEventListener('click', this.handleRunSimulation);
```
  - Inside `handleRunSimulation`, before setting `isSimulationRunning = true`, call something like:
  - `if (!this.relocationAssistant.ensureResolvedOrPrompt()) return;`

## 5) Pension systems across countries

Represent pension policy in `tax-rules-XX.json` with a new `pensionSystem` node consumed by `TaxRuleSet`:

Suggested shape (extensible):
```json
{
  "pensionSystem": {
    "type": "state_only | private_only | mixed",
    "supportsPrivatePayroll": true,
    "employeeContributionModes": ["percent_gross", "percent_net", "fixed_amount"],
    "defaultEmployeeContributionPct": 0.05,
    "employerMatch": {
      "supported": true,
      "scheme": "matching | none",
      "matchPercentOfSalary": 0.05,
      "employeeCapPct": 0.05,
      "employerCapPct": 0.05
    },
    "annualContributionCaps": {
      "employeePctOfSalary": 0.4,
      "employeeAmount": 0,
      "employerPct": 0.1,
      "employerAmount": 0
    },
    "taxTreatment": {
      "employeeDeductible": true,
      "employerTaxableBenefit": false
    },
    "portability": {
      "allowForeignPrivate": false
    }
  }
}
```

`TaxRuleSet` API additions:
- `getPensionSystemType()` → enum
- `supportsPrivatePayroll()` → boolean
- `getPensionEmployerMatchConfig()` → object
- `getPensionContributionAgeBands()` (already in IE rules)

Impact assistant behavior for pensions:
- If destination is `state_only` or `supportsPrivatePayroll = false`:
  - Propose converting post‑move salary events from `SI` to `SInp` (no payroll pension fields shown), and clear `match`.
  - Optionally offer an advanced choice to keep a foreign private contribution as a plain expense (no relief/match) in original currency.
- If destination supports private payroll with different caps/schemes:
  - Clamp contribution `rate`/`match` to destination maxima and show the new allowed values.

UI references:
- Salary wizard (via `EventWizardManager` and `events-wizard.yml`): hide pension inputs when current residency disallows.
- `UIManager.validateParameterPercentageFields()` and tooltips can leverage `TaxRuleSet` to provide dynamic guidance.

## 6) Validation and errors

- `MV-*` same year conflict → error on the `fromAge` cell.
- First simulation period must have a residency: either Starting Position’s country or an `MV-*` at the start.
- On Run, if unresolved impacts exist → open assistant and prevent run.
- Plausibility checks (warnings) after move in the amount’s interpreted currency (e.g., implausibly low salary in destination currency).

## 7) Data, storage, and reproducibility

- CSV remains unchanged (no schema migration in phase 1).
- Start country persists as a standard parameter (e.g., `StartCountry` hidden input, serialized by `FileManager`).
- Relocation decisions persist in `localStorage` per scenario fingerprint and MV event id.
  - Scenario fingerprint: hash of CSV contents (use `FileManager`’s last saved state string as input to a fast hash). If not saved yet, hash current events table state string.
  - Key format: `relocationResolutions:<fingerprint>:<mvEventId>`.
- Reproducibility: Decisions are deterministic when recomputed from events + MV and destination pension rules. Local decisions only affect UX (which rows to split/merge and how UI presents currency mode) but not the serialized CSV.

## 8) Implementation plan (incremental)

Phase 1 (minimal viable):
- Add `MV-*` types to the event type dropdown (Relocation submenu).
- Update validation to allow `MV`/`MV-*` in `UIManager.readEvents()`.
- Extend `UIManager.getRequiredFields(eventType)` to treat any type starting with `MV` as `{ name:r, amount:r, fromAge:r, toAge:-, rate:-, match:- }`.
- Add a stub `RelocationImpactAssistant` that can be invoked and shows a list of impacted items (no automation yet). Gate Run if any unresolved.

Phase 2:
- Implement delta detection, fingerprinting, persist decisions, and auto‑split/rejoin helpers in `EventsTableManager`.
- Add “Needs Review” badges and quick filter.
- Apply default currency/rebase/retain policies per event category.

Phase 3:
- Pension system integration via `tax-rules-*.json` and `TaxRuleSet` API; assistant modifies salary events accordingly.
- FX helper and optional CPI overrides UI.

## 9) Code edit guide (precise hooks)

- `src/frontend/web/components/EventsTableManager.js`
  - In `getEventTypeOptionObjects()` add a group for Relocation. Build options from available rulesets (readable via `Config` or a small country list). Set `value: 'MV-XX'`, `label: 'Relocation → Country'`.
  - On selection callback, set `typeInput.value = 'MV-XX'` and call `updateFieldVisibility(typeInput)`; also call assistant trigger with the new MV row id.
  - Watch `.event-from-age` changes on rows whose type starts with `MV` and call assistant trigger with both old and new move ages.
  - Utilities to split/rejoin rows: `splitRowAtAge(row, age)` and `mergeRows(rowA, rowB)` (operate on DOM, then refresh accordion via `eventAccordionManager.refresh()`).

- `src/frontend/UIManager.js`
  - `readEvents(validate=true)`
    - After parsing `type` from `name`, accept `MV`/`MV-*` via `/^MV(-[A-Z]{2})?$/` in the valid types map logic (avoid hardcoding all `MV-XX`).
  - `getRequiredFields(eventType)`
    - If `eventType` starts with `MV`, return pattern `rrr---` (name, amount, fromAge required; others hidden). Keep existing patterns for all other types.

- `src/frontend/web/WebUI.js`
  - Add `this.relocationAssistant = new RelocationImpactAssistant(this);` during construction.
  - In `handleRunSimulation(e)`: before any state toggles, call `if (!this.relocationAssistant.ensureResolvedOrPrompt()) return;`.
  - After assistant completes and all unresolved are cleared, proceed to `run()`.

- New: `src/frontend/web/components/RelocationImpactAssistant.js`
  - API:
    - `showForMove(mvRow)`
    - `ensureResolvedOrPrompt()` → returns true if safe to run, else opens dialog and returns false.
    - `computeDeltaImpacts(mvId, oldB, newB)`
    - `persistDecisions(mvId, decisions)` / `loadDecisions(mvId)`
  - Maintains in‑memory cache of last move boundary per MV event.

## 10) Timeline visualization (optional)

- A thin “Residency & Currency” track is derived from Starting Position + `MV-*` events and rendered above the events table (non‑authoritative). Clicking a segment scrolls to the underlying MV row for editing.

## 11) Testing

- Add Jest UI tests for the assistant and gating behavior:
  - `tests/TestRelocationImpactAssistant.spec.js`
    - Insert events A (salary), B (mortgage), then `MV-AR` → expect assistant lists salary with default rebase and mortgage with retain; Run should block until resolved.
    - Change `MV-AR` date; assistant shows delta only; verify rejoin proposal after shifting back.
- Add a Node core test only if core tax logic changes (none needed for phase 1).

## 12) Open questions and future work

- Person‑level residency vs scenario‑level: future extension for mixed‑residency couples (would require duplicating MV per person and mapping per‑person events).
- Asset location and taxation for cross‑border assets: later enhancement; default assumption is taxation by residency, with source‑tax relief handled by `Taxman` if rules exist.
- Rich currency “chips” per amount: optional usability enhancement once the assistant and defaults are stable.

## 13) Summary of benefits

- Events remain the single source of truth; users edit what they understand.
- Assistant provides safe, explainable defaults and blocks ambiguous runs.
- Pension behavior becomes country‑accurate without complicating the CSV.
- Visual timeline improves discoverability without becoming an authority.


