# Relocation Feature Plan

## Objectives
- Deliver a premium-only, multi-country relocation capability without disrupting the existing single-country experience.
- Keep the events table as the single source of truth while deriving residency, currency, and inflation context from user-entered data.
- Provide strong user guidance (progressive impact analysis, assisted fixes, display controls) so relocations remain transparent and auditable.

## Final Decisions
- **Event-first model:** Introduce relocation events (`MV-XX`) that encode destination country, move timing, and moving costs; all residency state is derived from Starting Position + sorted `MV-*` events.
- **Derived residency timeline:** Build an in-memory `ResidencyTimeline` from events for simulation and UI overlays; no separate authoring surface, but wizard tooling edits the underlying `MV` row.
- **Context-aware currencies:** Monetary values store native currency/currency policy alongside base-currency canonical values; conversions use CPI-first then FX rules with tooltips exposing originals.
- **Relocation Impact Assistant:** A delta-based assistant gates simulation runs until conflicting items are resolved, persisting user decisions per scenario fingerprint and relocation event.
- **Consistent reporting:** Aggregated outputs normalize to the scenario base currency, while table/charts offer toggles for natural vs unified currency views.
- **Premium gating:** Relocation controls, impact assistant, and multi-currency display tools surface only for premium users; free users see upgrade cues.

## Workstream 1 — Data & Configuration Foundations
- Extend country configuration bundles (`tax-rules-*.json`) with `currency`, default inflation profile, pension parameters, and references to CPI/FX datasets.
- Update `Config.initialize` to preload all tax rule sets referenced by `MV-*` events, ensuring synchronous availability for deterministic and Monte Carlo runs.
- Add a lightweight `CurrencyConversionService` (GAS-compatible) that caches CPI and FX matrices per country-year and exposes `convert(value, fromCurrency, toCurrency, year)` plus PPP-based suggestion helpers.
- Extend `SimEvent` with optional `currency` (pegged value) and `linkedEventId` for split/merge tracking; default currency inferred from residency segment.

## Workstream 2 — Residency Derivation & Timeline Layer
- Implement a `ResidencyTimeline` builder that consumes Starting Position `StartCountry` + ordered `MV-*` events, producing year-indexed segments `{countryCode, currencyCode, inflationSeriesId, validationProfileId}`.
- Enforce single move per year validation and surface conflicts through the assistant before simulation.
- Expose timeline metadata to frontend components for overlays (table highlighting, chart markers) without persisting separate structures to CSV.

## Workstream 3 — Relocation Wizard & Impact Assistant
- Add a relocation submenu to the event type picker (EventsTable + Accordion + Wizard) that emits `MV-XX` events via a three-step wizard (destination, timing, moving cost).
- Build the `RelocationImpactAssistant` module:
  - Detect temporal, logical, and currency impacts when an `MV` is added, edited, or deleted (delta detection using cached boundaries).
  - Classify issues (validation failure, ambiguity, cross-border complexity) and present a progressive disclosure UI (overview → per-event guidance → assisted resolution tools).
  - Provide automated helpers: event splitting/merging, currency policy suggestions (local/rebase/retain), PPP-informed salary benchmarks, mortgage FX strategies.
  - Gate simulation (`Run`) until unresolved impacts are cleared; allow explicit acknowledgement for acceptable exceptions with logging.
  - Persist user choices in `localStorage` keyed by scenario fingerprint (`FileManager` snapshot hash) + `mvEventId`, so repeated edits reuse decisions where valid.

## Workstream 4 — Simulation & Tax Pipeline Updates
- Modify `Simulator` to query the active residency segment each year, switching tax rules, CPI, and default currencies accordingly; maintain asset-level currency policies (e.g., mortgages remain EUR unless rebased).
- Pass per-year country context into `Taxman`, `AttributionManager`, and pension calculators, ensuring age-based rules and contributions respect the active jurisdiction.
- Normalize yearly aggregates to base currency while retaining attribution metadata about original currencies and applied FX rates for transparency.

## Workstream 5 — Event Table & UI Enhancements
- Render currency badges on monetary cells indicating native currency; clicking opens conversion details and override options (peg, rebase, retain).
- Inject residency bands behind the event timeline and display inline warnings (e.g., "Salary spans relocation — split recommended").
- Implement a table-level display currency toggle (natural vs unified currency, selectable target currency among involved countries) with memoized conversions for performance; retain edit mode in native currency to prevent accidental mutations.
- Ensure accordion view mirrors badges, warnings, and assistant entry points; wizard definitions (`events-wizard.yml`) include the new relocation flow and impact analysis screens (`contentType: impactAnalysis`).

## Workstream 6 — Charts, Reports & Exports
- Add a chart toolbar selector for display currency (default to original home country), with visual indicators (vertical lines/shaded regions) marking relocation years.
- Support dual-axis or overlay mode to show native vs converted series where helpful (e.g., EUR mortgage vs ARS income) and annotate data points tied to assistant warnings.
- Update CSV/exports to contain both base-currency totals and columns with original currency values + metadata describing FX/CPI assumptions used during conversion.

## Workstream 7 — Premium Integration & Feature Gating
- Detect premium entitlement before enabling relocation options; non-premium users see disabled controls with inline upgrade messaging.
- Ensure imported scenarios containing `MV-*` events gracefully downgrade by ignoring relocation behavior (single residency) unless premium is active.
- Centralize gating checks so backend/core paths remain unified while UI differences stay declarative.

## Workstream 8 — Persistence & Backwards Compatibility
- Extend `serializeSimulation` / `deserializeSimulation` to capture `MV-*` events without introducing new CSV columns (reuse existing schema fields per `MV` conventions).
- Persist new Starting Position `StartCountry` parameter and ensure legacy scenarios default to existing IE rules.
- Store assistant resolutions outside the CSV (local storage) so shared scenarios remain portable; include soft warnings when resolutions are missing on load.

## Workstream 9 — Validation, Testing & Monitoring
- Core regression tests covering residency transitions, mixed-currency assets, and tax calculations using multiple `TaxRuleSet`s.
- Jest UI tests for relocation wizard flows, impact assistant gating, currency toggle rendering, and accordion sync.
- Playwright premium journey tests: add relocation, resolve impacts, adjust relocation date, verify charts/table conversions.
- Telemetry (if allowed) capturing relocation usage, unresolved warning acknowledgements, and frequent manual overrides to inform future tuning.

## Incremental Delivery Roadmap
1. **Phase 1:** Enable `MV-*` event type, Starting Position country selector, baseline residency derivation, and a stub assistant that blocks simulation when unresolved impacts exist.
2. **Phase 2:** Implement impact classification, automated split/rejoin utilities, currency policy defaults, and decision persistence.
3. **Phase 3:** Integrate pension-country rules, advanced suggestion engine (PPP benchmarks), chart/table display toggles, and export enhancements.
4. **Phase 4:** Performance polish (conversion caching), UX refinements (tooltips, overlays), and premium telemetry rollout.

## Risks & Mitigations
- **Complex UX:** Progressive disclosure and guided wizards prevent overwhelming users; coach marks support onboarding.
- **Performance:** Cache CPI/FX lookups per year/currency and memoize table conversions.
- **Data drift:** Centralize CPI/FX sources and support config-driven updates to keep assumptions current.
- **User confusion in free tier:** Keep relocation UI hidden/disabled with clear upgrade messaging to avoid mixed expectations.

