### Relocation (Residency, Currency, FX, CPI, Pensions) — Final Plan

This document integrates the strongest ideas from relocation-roocode.md, relocation-traycer.md, and relocation-openai.md into a single, implementation-ready plan that respects FinSim’s constraints:
- Events table is the single source of truth (MV events drive residency changes).
- Core remains GAS-compatible; heavy UI/logic is in the web layer.
- Visual timeline is derived from events (not authoritative) but can be edited via the relocation flow.

## Objectives
- Model multi-country relocations without disrupting single-country UX.
- Switch tax rules, CPI, and “Local” currency by year from MV events + Start Country.
- Provide a delta-only Relocation Impact Assistant to resolve affected events safely.
- Keep assets in their native currencies unless explicitly rebased; report in a user-chosen display currency.
- Respect country pension policy differences and guide users through transitions.

## Authoritative Model
- Start Country (Starting Position) sets initial residency.
- MV events (type `MV-XX`) indicate relocation to country `XX` at `fromAge/fromYear` and carry one-off moving cost in the destination Local currency by default.
- Residency timeline is derived at runtime from Start Country + sorted MV events (piecewise constant function). No separate persisted structure is required; a derived view and in-memory manager can be used for UX.

## Core Data and Services (lightweight, GAS-compatible)
- Tax Rule Preload (roocode 1.1): When reading events, collect all countries referenced by Start Country + MV events and preload those `tax-rules-*.json` through `Config` so they are synchronously available during runs (Monte Carlo safe).
- Rule Schema Extension (roocode 1.4): `tax-rules-XX.json` should include `currency` (ISO) and CPI series metadata (default inflation rate or series id). Keep additions backward compatible.
- Yearly Residency Context (roocode 1.3): In the per-year loop, determine `currentCountry` from the derived residency function and pass it to taxation. Inflation/CPI for that year is resolved as: (1) MV event `rate` override for the active residency segment if provided; otherwise (2) the country rules’ default CPI/inflation. This preserves user control while keeping sensible defaults.
- Currency Conversion Service (openai 1.20): Frontend service with a simple core shim that provides:
  - `convert(amount, fromCurrency, toCurrency, year)` using year-average FX
  - CPI helpers if we apply CPI-first-then-FX in certain displays (configurable)
  - Cache/memoization per (year, pair) to keep UI fast

Note on SimEvent fields (roocode 1.2): We keep the core constructor unchanged for compatibility. Optional extensions like `currency` and `linkedEventId` are tracked in the web layer (DOM row dataset/localStorage). If later needed in core, add them as optional properties without breaking callers.

## Event Types and UI Mapping
- `MV-XX` (Relocation → Country):
  - `name`: destination (store display name with ISO, e.g., “Argentina (AR)”; parser extracts `AR`)
  - `fromAge/fromYear`: effective date
  - `amount`: one-off relocation cost (defaults to destination Local currency; no indexation)
  - `toAge`, `match`: hidden
  - `rate`: optional. Interpreted as CPI/inflation override (%/yr) for the destination residency starting at the move date. The input is pre-filled with the destination country’s default CPI from its tax rules (placeholder), but users may change it per move.
- EventsTable dropdown: add “Relocation” category with submenu of supported countries (from available `tax-rules-*.json`).
- Wizard: where (country) → when (date) → cost (amount) → create.

Code references
- `src/frontend/web/components/EventsTableManager.js`: add Relocation submenu; hide fields for `MV-*`; trigger Impact Assistant on create/date change.
- `src/frontend/web/components/EventAccordionManager.js`: ensure details view hides irrelevant fields; reflect badges.
- `src/frontend/web/components/EventWizardManager.js`: add wizard entry for Relocation.

## Residency Derivation and Simulation Hook
- Derived Residency Function: From Start Country + sorted MV events at `fromAge/fromYear`.
- Web layer prepares a year→country map before `run()`.
- `WebUI.handleRunSimulation()` gates execution (Impact Assistant) and then calls `run()`; during simulation the active `TaxRuleSet`, CPI, and Local currency are looked up for the current year.

Code references
- `src/frontend/web/WebUI.js` → `setupRunSimulationButton()`; insert a call to `relocationAssistant.ensureResolvedOrPrompt()` before triggering `run()`.
- `src/frontend/UIManager.js` → `readEvents(validate)` remains unchanged for core fields; MV validation added (see Validation section).

## Currency / FX / CPI Defaults (from roocode + traycer)
- Reporting display currency (roocode base currency): scenario has a display currency selector (default to first residency’s currency). Reporting converts values per year.
- Defaults on move (can be overridden by assistant):
  - Rebase to Local: salaries, generic living costs.
  - Retain asset currency: mortgages, property-linked rent, investment payouts.
  - Relocation cost: destination Local, no indexation.
- Tooltips show original amounts and conversion details; table supports natural-currency vs unified-currency viewing (traycer Data Visualization Strategy).

Country CPI control
- MV `rate` field acts as a CPI/inflation override for the destination residency from the move date onward. If blank, use the tax rules’ default CPI. Subsequent MV events can define different CPI overrides for subsequent residencies.

Implementation
- Add a lightweight “currency badge” next to monetary inputs in table/accordion showing natural currency. For phase 1, badges are read-only defaults; overrides are applied via the Impact Assistant.
- FX/CPI source: `Config` caches year-average FX (and CPI if needed). Allow manual override per year in a small settings panel (later phase).
 - For MV, show the `rate` input with placeholder set to the destination country’s CPI default; label it “Inflation (CPI) override”.

## Relocation Impact Assistant (delta-only, from traycer + earlier plan)
Triggers
- On MV create or when its date changes, and when pressing Run if unresolved items exist.

Detection and Classification
- For boundary B: classify each event as pre/post/crosses; on date change from B_old to B_new, an event is newly impacted if relation changes.
- Classify issues (traycer): validation failures (implausible salaries), ambiguous cases (cross-border income), cross-border complexities (EUR mortgage from ARS salary).

Actions Offered
- Split at move (create pre/post rows); Rebase without split; Retain asset currency; Rejoin split pairs if no longer needed.
- For pensions post-move: if destination system disallows private payroll, convert `SI` to `SInp` (no match), or model foreign private contribution as an expense (advanced).
- Smart suggestions (traycer): PPP-guided ranges and warnings (phase 2+); start with plausibility thresholds from tax rules.
 - If MV `rate` is changed, prompt to confirm applying the new CPI to destination segment; allow revert to default.

Delta-Only UX
- Persist decisions per MV in `localStorage` keyed by scenario fingerprint + mvEventId; store event fingerprints (type, name, amount, from/to, rate, match) to skip unchanged.
- On date changes, only newly impacted items are shown; previously resolved items remain silent; rejoin proposals appear when both sides fall on one side.

Gating
- “Needs Review” badges on unresolved rows; attempting Run opens the assistant focused on unresolved; after resolving, simulation proceeds.

Code references
- New file: `src/frontend/web/components/RelocationImpactAssistant.js` with:
  - `ensureResolvedOrPrompt()`, `showForMove(mvRow)`, `computeDeltaImpacts(mvId, oldB, newB)`, `persistDecisions`, `loadDecisions`.
- `src/frontend/web/WebUI.js` → instantiate assistant and gate Run.
- `src/frontend/web/components/EventsTableManager.js` → split/rejoin helpers that manipulate table/accordion rows and refresh.

## Pension Systems Across Countries (from earlier + openai)
- Extend `tax-rules-*.json` with a `pensionSystem` node:
```json
{
  "pensionSystem": {
    "type": "state_only | private_only | mixed",
    "supportsPrivatePayroll": true,
    "employerMatch": { "supported": true, "matchPercentOfSalary": 0.05, "employeeCapPct": 0.05 },
    "annualContributionCaps": { "employeePctOfSalary": 0.4 },
    "taxTreatment": { "employeeDeductible": true }
  }
}
```
- `TaxRuleSet` additions (web-accessed; core-safe): `getPensionSystemType()`, `supportsPrivatePayroll()`, `getPensionEmployerMatchConfig()`.
- Assistant applies policy on post-move salaries (e.g., switch `SI`→`SInp`, clear `match`, clamp caps) and warns when unsupported patterns persist.

## Data Presentation (from traycer)
- Charts: display-currency selector; vertical markers at relocation years; tooltips show original currency; optional dual-axis overlays later.
- Data table: natural currency mode by default; unified-currency toggle converts using year-average FX; currency indicators in headers.
- CSV export: include both original (native) and converted values with metadata (later phase).

## Validation
- MV rules: one MV per effective year; Start Country must exist; first segment must cover simulation start.
- Plausibility checks use the amount’s interpreted currency context post-move (salary floors, etc.); warnings link to assistant.
- Before Run: block if any unresolved items remain.
 - MV `rate` (if provided) must be a valid percentage (e.g., 2 means 2%). If blank, treat as “use default CPI”. The `rate` field should carry an “inflation” placeholder sourced from the tax rules for the destination.

## Workstreams (merged and adapted)
1) Residency & Currency (openai Workstream 1, adapted)
   - Derived `ResidencyTimeline` manager in web layer (not persisted) provides year→country; preload needed `TaxRuleSet`s via `Config`.
   - CurrencyConversionService with CPI/FX caches.
2) Wizard & Impact Workflow (openai Workstream 2 + traycer)
   - Add Start Country selector (IP geo default). Implement Relocation wizard and Impact Assistant (delta-only).
3) Simulation Pipeline (openai Workstream 3 + roocode 1.3)
   - Per-year country context for `Taxman` and inflation; conversions at reporting time.
4) Event Table & UI (openai Workstream 4 + roocode 2.2/2.3)
   - Relocation submenu; currency badges; timeline bands (visual only); inline warnings; badges for unresolved.
5) Charts & Reporting (openai Workstream 5 + traycer)
   - Display-currency toggle; markers; consistent formatting; later dual-axis.
6) Persistence & Back-compat (openai Workstream 6)
   - No CSV schema change in phase 1. Decisions and linkages stored in `localStorage`. Future phases may add optional per-event currency/link in CSV.
7) Validation, Tests, Monitoring (openai Workstream 7)
   - Jest UI tests for assistant gating and delta detection; E2E for premium relocation flow; core tests only if tax logic changes.

## Phased Rollout
Phase 1 (MVP)
- Relocation MV type and wizard; derived residency; display-currency selector; gating Run with assistant; basic defaults (rebase vs retain) and split/rejoin; preload rules; simple FX table.

Phase 2
- Smart suggestions (PPP), manual FX overrides, richer currency badges (override per amount), CSV export with native+converted, timeline bands.

Phase 3
- Pension policy integration and caps enforcement across moves; advanced cross-border asset manager (wizards for refinance, rent-out, etc.).

## Premium Gating (from traycer/openai)
- Free tier: single-country; relocation UI disabled with tooltip; engine ignores MV gracefully.
- Premium: relocation menu, assistant, display-currency toggle enabled.

## Concrete Hooks and Edits
- `src/frontend/web/components/EventsTableManager.js`
  - Add Relocation submenu in `getEventTypeOptionObjects()`; for `MV-*` in `updateFieldVisibility()` hide To/Match but show Rate as optional with label “Inflation (CPI) override”; prefill its placeholder from the destination tax rules’ CPI.
  - Trigger assistant on MV insertion/date change; implement `splitRowAtAge(age)` and `rejoinRows(a,b)` helpers and refresh accordion.
- `src/frontend/web/components/EventWizardManager.js`
  - Add relocation wizard entry; include a step for “Inflation (CPI) override” prefilled from rules (can be skipped). Optional `contentType: 'impactAnalysis'` for assistant’s final summary view.
- `src/frontend/web/WebUI.js`
  - Instantiate `RelocationImpactAssistant`; gate Run in `handleRunSimulation()`; expose settings for display currency (charts/table).
- `src/frontend/UIManager.js`
  - Accept `MV`/`MV-*` in `readEvents()` and enforce MV validations; update `getRequiredFields()` so types starting with `MV` map to: name required, amount required, fromAge required, toAge hidden, rate optional, match hidden (pattern `rrro-o`). Ensure the `rate` placeholder is set to “inflation”.

## Risks and Mitigations (openai)
- Performance: memoize conversions per (year, pair); batch DOM edits when splitting/rejoining.
- User confusion: progressive disclosure; natural currency by default; badges and tooltips.
- Data currency drift: allow FX overrides; centralize data in `Config`.

---

This plan preserves the events table as the single source of truth, adds a robust, delta-only impact workflow, aligns reporting and visualization via a shared conversion service, and respects country-specific pension systems. It integrates the best elements from the three design docs while staying within FinSim’s architecture and compatibility constraints.


