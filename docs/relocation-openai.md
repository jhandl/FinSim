# Relocation Feature Plan

## Objectives
- Enable premium users to model one or more cross-border relocations without disrupting the existing single-country user experience.
- Maintain tax, currency, inflation, and validation accuracy before and after a move, while guiding users through required adjustments.
- Provide consistent reporting and visualization across mixed-currency timelines with clear controls over display currency.

## Final Decisions
- Introduce a dedicated `ResidencyTimeline` comprised of ordered `ResidencySegment` records (start year, country profile, base currency, CPI series, FX references, validation ranges). The timeline lives alongside the event table and is editable only through a guided relocation wizard.
- Keep the relocation event type as a lightweight row that references a residency segment and captures one-off moving costs; the segment handles all ongoing context changes.
- Store monetary amounts internally in the scenario's original base currency while retaining the native currency and conversion policy per event/asset. Perform conversions through a shared currency service that handles CPI-first then FX conversions.
- Default the event table to show each row in its native currency with inline badges; add a scenario-level display-currency toggle that renders converted values on demand without mutating stored data.
- Extend charts with the same display-currency selector (defaulting to the scenario base currency) and provide optional dual-axis overlays so large magnitude differences remain interpretable.
- Gate all relocation tooling (timeline editor, impact panel, display-currency toggle) behind the premium flag, ensuring the non-premium flow remains unchanged.

## Workstream 1 — Residency & Currency Data Model
- Define `ResidencySegment` schema in core config: `{ id, startYear, countryCode, currencyCode, inflationSeriesId, fxProfileId, validationProfileId }`.
- Add `ResidencyTimeline` manager in core (GAS-compatible) providing segment lookup by year, serialization hooks, and default generation for legacy scenarios (single segment from start year).
- Extend country configuration bundles to include CPI series, FX tables against all supported currencies, PPP hints, and validation thresholds (salary floors, tax bands, etc.).
- Build a `CurrencyConversionService` (frontend + core shim) that caches year-indexed CPI and FX data for fast conversions and exposes `convert(value, fromCurrency, toCurrency, year)` plus helpers for PPP suggestions.

## Workstream 2 — Relocation Wizard & Impact Workflow
- Enhance the Starting Position panel with a country selector (populated via IP geolocation for new scenarios, overridable by user).
- Implement the premium relocation wizard: select move year, target country, review segment defaults, optionally attach moving cost event, and choose asset rebasing policies (e.g., keep mortgage in EUR vs refinance).
- Create an `Impacted Items` panel triggered whenever a relocation segment is added, removed, or moved. Use dependency tracking to flag:
  - Events spanning the segment boundary (jobs, pensions, recurring expenses).
  - Assets originating in another currency but influenced by new tax rules.
  - Derived calculations (e.g., employer pension contributions) needing re-validation.
- Provide guided fixes per item: split event into two rows, adjust end dates, adopt new currency with PPP-informed defaults, or accept FX conversion only.

## Workstream 3 — Simulation & Calculation Pipeline
- Update `Simulator` to consult `ResidencyTimeline` at the start of each simulation year, switching active tax rules, CPI, and default currency accordingly.
- Modify `Taxman` and related classes to accept a country profile parameter per year instead of assuming a single scenario-wide ruleset.
- Ensure long-lived assets (mortgages, pensions, investments) track their originating currency and tax treatment. Introduce policies like `currencyLock`, `autoConvert`, and `rebaseOnRelocation` to control behavior.
- Adjust attribution reporting so yearly summaries note the active residency and currency conversions applied, maintaining transparency for audit purposes.

## Workstream 4 — Event Table & UI Integration
- Add currency badges to monetary cells, with tooltips summarizing native vs view currency and conversion details.
- Inject residency timeline bands into the table background to visually delineate country changes.
- Implement the scenario-level display-currency toggle in the toolbar; maintain a memoized view model for converted values to keep scrolling performant.
- Surface inline warnings when an event's value breaches the validation profile for the active residency (e.g., salary below minimum range) and link those warnings to the impact panel guidance.
- Keep non-premium UI unchanged: hide relocation controls and default to a single residency segment derived from scenario starting country.

## Workstream 5 — Charts & Reporting
- Extend chart configuration to accept a `displayCurrency` parameter and reuse the `CurrencyConversionService` for conversions.
- Provide a "natural currency" mode (per-series native currency) and a unified currency mode with smoothed FX conversions. Highlight series breaks when residency changes to maintain context.
- Add annotations for flagged events (e.g., mortgage continuing in EUR while income switches to ARS) so users can quickly correlate chart anomalies with table warnings.
- Update export/download logic (CSV, charts as images) to respect the user's chosen display currency while embedding metadata about native amounts for downstream analysis.

## Workstream 6 — Persistence & Backwards Compatibility
- Extend scenario serialization (`serializeSimulation` / `deserializeSimulation`) to include residency segments and per-event currency metadata while keeping backward compatibility with old CSVs (default single segment if none present).
- Version bump the schema and store upgrade logic that infers the initial residency from existing config, ensuring legacy scenarios load without prompting premium-only features.
- Ensure premium entitlements persist in saved scenarios but gracefully degrade (ignore extra segments) when opened without premium access.

## Workstream 7 — Validation, Testing & Monitoring
- Core tests: add suites covering residency switching, mixed-currency assets, and tax calculations across segments.
- UI tests: expand Jest coverage for the relocation wizard, impact panel, and currency toggle; coordinate manual verification across table/accordion views as required.
- E2E smoke (Playwright) for premium journeys: create relocation, adjust date, resolve impacted items, and confirm charts/table display consistent totals.
- Add runtime logging/telemetry hooks (if allowed) to capture relocation usage patterns and warning acknowledgements for future UX tuning.

## Risks & Mitigations
- **Performance**: Conversion caching needed to avoid slow table rendering. → Memoize conversions per year and currency, invalidate only on FX/CPI updates.
- **User confusion**: Multi-currency views can overwhelm. → Provide onboarding coach marks and keep natural-currency mode as default.
- **Data quality**: PPP/FX assumptions may date quickly. → Centralize data sourcing and allow yearly overrides through country profile updates without code changes.

