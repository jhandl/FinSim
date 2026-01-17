# Documentation Review Report

This report consolidates status assessments for documents in `docs/`, organized by category.

## Implementation Plans

### Asset Plan Review

- **Document:** `docs/asset-plan.md`
- **Category:** Implementation Plan
- **Summary:** Specifies multi-country investment semantics driven by per-country `investmentTypes` (currency/country anchoring, contribution modes, PV rules), plus expected UI and relocation-impact behaviors for investment holdings.
- **Status Assessment:**
  - **Implemented (core + rules):**
    - `investmentTypes` exist in country tax rules (e.g., `src/core/config/tax-rules-ie.json`) and are exposed via `TaxRuleSet.getInvestmentTypes()` / `TaxRuleSet.findInvestmentTypeByKey()` (`src/core/TaxRuleSet.js`).
    - Dynamic investment asset construction is implemented via `InvestmentTypeFactory.createAssets()` and `GenericInvestmentAsset` (`src/core/InvestmentTypeFactory.js`), unifying exit-tax vs CGT behavior and supporting deemed disposal where configured.
    - Multi-currency investment lots are tracked using `Money` and converted at sell/capital time (`src/core/Equities.js`).
    - Surplus investing across dynamic types, using `contributionCurrencyMode` (`asset` vs `residence`) and per-type allocations, is implemented in `handleInvestments()` (`src/core/Simulator.js`).
    - Drawdown/liquidation iterate over the dynamic `investmentAssets` list (not just the legacy two assets) (`src/core/Simulator.js`).
    - Per-type investment PV is implemented using `residenceScope` (`global` uses `assetCountry` CPI; `local` uses residency CPI) (`src/core/PresentValueCalculator.js`).
  - **Implemented (UI/relocation support):**
    - UI parameters for per-type initial capital, allocations, growth rates, and volatilities are read/written as `params.*ByKey` maps (`src/frontend/UIManager.js`).
    - Relocation impact detection includes local investment holdings tied to the origin country (`src/frontend/web/components/RelocationImpactDetector.js`, `src/frontend/web/components/RelocationImpactAssistant.js`).
  - **Divergences / Partial vs. the plan text:**
    - The plan’s IE defaults describe `residenceScope="global"` and `contributionCurrencyMode="asset"`, but current IE rules define `residenceScope="local"` and `contributionCurrencyMode="residence"` (`src/core/config/tax-rules-ie.json`), changing both contribution and PV semantics from the document.
    - The plan expects “no defensive fallbacks” for missing infrastructure/config; the implementation contains multiple compatibility fallbacks and guarded resolution paths (e.g., legacy `indexFunds`/`shares` retention and fallback `investmentAssets` initialization) (`src/core/Simulator.js`, `src/core/Equities.js`).
    - PV back-conversion for investments uses `getCurrencyForCountry(assetCountry)` rather than the configured `baseCurrency`, which may not match the document’s “deflate in the PV anchor currency” rule if a type’s `baseCurrency` differs from its country currency (`src/core/PresentValueCalculator.js`).
- **Recommended Actions:**
  - **Update:** Revise `docs/asset-plan.md` to match the current `investmentTypes` schema/semantics (especially IE defaults), and add a short “Implemented in code” section linking to `InvestmentTypeFactory`, `Simulator.handleInvestments()`, and `PresentValueCalculator` investment PV logic.
  - **Archive (after update):** Once updated to reflect reality, mark the document as “Implemented/Superseded plan” (or move to an archive/plans folder) so future readers don’t treat it as a still-active spec.

### Multi-Country Assets PV Semantics Plan Review

- **Document:** `docs/multi-country-assets-plan.md`
- **Category:** Implementation Plan
- **Summary:** Phased plan to correct PV semantics for multi-country assets (residency deflation for flows; asset-country deflation for stocks), plus refactors extracting PV/nominal/attribution calculators and tightening error handling.
- **Status Assessment:**
  - **Implemented (core):**
    - `Simulator.updateYearlyData()` now orchestrates aggregate computation via `buildAggregateContext()` + extracted calculators (`DataAggregatesCalculator`, `PresentValueCalculator`, `AttributionPopulator`) (`src/core/Simulator.js`).
    - `PresentValueCalculator` applies asset-country PV deflation for real estate (per-property `linkedCountry`), pensions (per pot country), and investments (per-type `assetCountry` + `residenceScope`, including back-conversion from residence currency before deflating) (`src/core/PresentValueCalculator.js`).
    - `Property.getValue()` pegs implicit nominal appreciation to the property’s country via `InflationService.resolveInflationRate(...)` when no explicit `Rate` is provided (`src/core/RealEstate.js`, `src/core/InflationService.js`).
  - **Implemented (tests):**
    - Multi-country PV and relocation stability are covered by core regression tests (e.g., `tests/TestPVMultiCountryDeflation.js`, `tests/TestRealEstatePVRelocation.js`, `tests/TestPensionPVRelocation.js`).
  - **Divergences / doc drift:**
    - The document describes PV/unified conversion using nominal FX with `fxMode: 'constant'`, but the core ledger helper converts using evolved FX (`fxMode: 'evolution'`) anchored at `Config.getSimulationStartYear()` (`src/core/Simulator.js`, `src/core/EconomicData.js`).
    - The document’s “initial rules” anchor pensions/investments to `StartCountry`, but the implementation deflates pension capital by each pot’s country and investment PV by `investmentTypes` metadata (`src/core/PresentValueCalculator.js`).
    - The document’s “strict error handling / fallback elimination” goal is not consistently reflected in supporting helpers (`InflationService` and `RealEstate` retain guarded legacy fallbacks/try-catch paths) (`src/core/InflationService.js`, `src/core/RealEstate.js`).
- **Recommended Actions:**
  - **Update for accuracy:** Replace the “`constant` FX” language with the current evolved-FX behavior (or adjust code if `constant` is intended specifically for PV display), and update the pension/investment PV “initial rules” to match the current implementation.
  - **Reclassify the doc:** Mark it clearly as “Completed” (phases 1–12) and split any remaining “future enhancements” into a new forward-looking plan to avoid confusing spec vs. history.
  - **Align philosophy:** Decide whether fail-fast is required for `InflationService`/`RealEstate` (remove legacy fallbacks) or if graceful legacy support is intentional, and document that choice explicitly.

### Chat System Implementation Plan Review

- **Document:** `docs/chat-system-implementation-09fe792c.plan.md`
- **Category:** Implementation Plan
- **Summary:** Proposes an async “chat” experience backed by GitHub Issues + comments, mediated by a Cloudflare Worker; the UI starts as a feedback form and only becomes a GitHub-issue-style thread once a developer response exists, with user identity tracked via a client UUID in `localStorage`.
- **Status Assessment:**
  - **Not implemented:** No chat-specific frontend components (e.g., `ChatManager.js`), CSS, burger-menu entry (`#openChat`), or `CHAT_RELAY_URL` configuration are present under `src/frontend/`.
  - **Not implemented:** No Cloudflare Worker / relay endpoints (issue creation, conversation fetch, comment post, polling) exist in-repo.
- **Recommended Actions:**
  - **Clarify ownership:** Decide whether the Worker lives in this repo (recommended for reproducibility) or remains an external deployment; document required secrets/config either way.
  - **Implement iteratively:** Start with “feedback mode” (create issue + store `issueNumber`), then add polling + thread rendering, then unread/badge notifications.
  - **Harden integration:** Add abuse controls (rate limiting, spam filtering), CORS rules, and explicit filtering/authorization for which GitHub comments count as “developer replies”.

### Feedback Form Plan Review

- **Document:** `docs/feedback-form-plan.md`
- **Category:** Implementation Plan
- **Summary:** Specifies an in-app feedback modal that POSTs to a serverless relay (e.g., Cloudflare Worker) to create GitHub Issues, stores returned issue numbers locally, and periodically checks simplified status updates to show neutral one-time toasts (no PII collection, no GitHub links).
- **Status Assessment:**
  - **Not implemented (UI surface):** No `Feedback` burger-menu entry (`#sendFeedbackMobile`) and no feedback modal markup/styling exist in `src/frontend/web/ifs/index.html`.
  - **Not implemented (frontend logic):** No `FeedbackManager` (or equivalent) exists under `src/frontend/web/components/`, and there is no client code posting to `/feedback` or polling `/feedback/status`.
  - **Integration mismatch vs current menu plumbing:** The plan assumes `WebUI.js` binds `#sendFeedbackMobile`, but mobile-menu actions are currently wired in `src/frontend/web/ifs/index.html` (`syncMenuButtons()`) by forwarding clicks to existing desktop buttons; a menu-only action will need either a hidden desktop handler/button or a small extension to the burger-menu script to invoke the feedback flow.
- **Recommended Actions:**
  - **Add the UI entrypoint:** Add `#sendFeedbackMobile` to the burger menu and route it through the existing `syncMenuButtons()` pattern (e.g., forward to a hidden `#sendFeedback` button) to keep wiring consistent without adding a visible header button.
  - **Implement the manager:** Add `src/frontend/web/components/FeedbackManager.js` per the plan (modal, submit to `window.FEEDBACK_RELAY_URL`, persist `localStorage['finsim_feedback']`, rate-limited status polling, toasts via `NotificationUtils.showToast()`).
  - **Add configuration + hardening:** Define `window.FEEDBACK_RELAY_URL` in `src/frontend/web/ifs/index.html` and ensure the relay enforces strict CORS, payload caps, and rate limiting as described.
  - **Cache busting:** When JS/CSS changes land, update cache-busting query params in the “SYSTEM UTILITIES” section of `src/frontend/web/ifs/index.html` per project rules.

### Dynamic FX Unification Plan Review

- **Document:** `docs/dynamic-fx-plan.md`
- **Category:** Implementation Plan
- **Summary:** Specifies an “evolution FX everywhere” policy where all currency conversions (ledger, charts, relocation flows) use inflation-driven FX evolution via `EconomicData.convert(..., fxMode: 'evolution')`, with legacy modes (constant/PPP/reversion) kept only for explicit analytics/test use; also calls for deterministic behavior via a fixed `baseYear` (simulation start).
- **Status Assessment:**
  - **Implemented (core FX engine):**
    - `EconomicData.convert()` supports `fxMode: 'constant' | 'evolution' | 'ppp' | 'reversion'` and defaults to `'evolution'` (`src/core/EconomicData.js`).
    - Evolution FX is computed by evolving each country’s per-EUR rate forward year-by-year using `InflationService.resolveInflationRate()` where available, then deriving cross rates as `perEur(to) / perEur(from)` (cached per `(country, baseYear)` run) (`src/core/EconomicData.js`, `src/core/InflationService.js`).
    - Base scalar economic inputs (currency, CPI, PPP, FX) are exposed via `TaxRuleSet.getEconomicProfile()` and ingested by `EconomicData.refreshFromConfig()` (`src/core/TaxRuleSet.js`, `src/core/EconomicData.js`).
  - **Implemented (core ledger + relocation conversions):**
    - `convertNominal()` is the standard ledger helper and explicitly uses `fxMode: 'evolution'` with `baseYear = Config.getInstance().getSimulationStartYear()`; results are cached per `(from, to, year)` (`src/core/Simulator.js`).
    - `convertCurrencyAmount()` maps currency→country (via cached tax rulesets) and routes all conversions through `convertNominal()`; strict mode hard-fails on unmappable currencies (`src/core/Simulator.js`).
  - **Implemented (web unified-currency charts):**
    - `ChartManager.updateChartsRow()` converts chart series to a reporting currency using `EconomicData.convert(..., { baseYear: simStartYear })` with no `fxMode` override (so it stays on the evolution default). In PV mode it pins `yearForFX = simStartYear` (the plan’s “Option A”) and includes a special-case to treat State Pension PV as IE/EUR-sourced (`src/frontend/web/components/ChartManager.js`).
  - **Gaps / divergences vs. the plan text:**
    - `EconomicData.convert()` defaults `baseYear` to the wall-clock year when omitted, so any call sites that do not pass `baseYear` can make evolution FX scenario-dependent on the runtime date (contrary to the determinism goal) (`src/core/EconomicData.js`; see also `Money.convertTo()` in `src/core/Money.js` which does not pass `baseYear`).
    - Not all currency conversions enforce strict currency→country mapping; some non-strict call sites will fall back to the current/default country when currency mapping fails, which undermines the “no legacy fallbacks in core paths” intent (even though this is not an FX-mode fallback, it is still a conversion fallback) (`src/core/Simulator.js`).
- **Recommended Actions:**
  - **Determinism hardening:** Require `baseYear` for evolution FX in core/UI paths (or infer it from `Config.getSimulationStartYear()` inside `EconomicData.convert()`), and update any direct `EconomicData.convert()` callers (notably `Money.convertTo()`) to pass `{ baseYear: simStartYear }`.
  - **Document PV+FX policy:** Update `docs/dynamic-fx-plan.md` to explicitly record the current choice (PV uses simulation-start-year cross rates in the UI) and whether the State Pension PV special-case is expected long-term.
  - **Currency mapping strictness:** Decide where “strict” should apply (ledger vs. display-only conversions) and standardize on hard errors for unmappable currencies in ledger-impacting flows to avoid silent mis-conversions.
  - **Tests alignment:** Ensure the FX/ledger enforcement tests assert evolution FX with an explicit simulation-start `baseYear`, and add a small regression test that fails if any core conversion path uses wall-clock-derived `baseYear`.

### Multi-Country PV Deflation Fix Plan Review

- **Document:** `docs/multi-country-pv-fix-plan.md`
- **Category:** Implementation Plan
- **Summary:** Staged TDD plan to fix PV deflation for multi-country *flows* (pension contributions, private pension drawdown income, salaries, rentals) so each portion is deflated using its source-country CPI rather than the current residence CPI.
- **Status Assessment:**
  - **Implemented (core):**
    - `Simulator` tracks per-year flow breakdowns by source country (`personalPensionContributionByCountry`, `incomePrivatePensionByCountry`, `incomeSalariesByCountry`, `incomeRentalsByCountry`) and passes them into the PV context (`src/core/Simulator.js`).
    - `computePresentValueAggregates()` uses `getDeflationFactorForCountry(country, ...)` for those per-country flow maps (and does currency back-conversion for private pension drawdown PV) instead of relying on the single residency `deflationFactor` (`src/core/PresentValueCalculator.js`).
  - **Implemented (tests):**
    - A dedicated regression test exists and asserts the source-country deflation behavior for all four flow types (`tests/TestPVMultiCountryDeflation.js`).
  - **Doc drift / mismatches:**
    - The plan suggests creating `src/core/tests/TestPVMultiCountryDeflation.js`, but the project’s core tests live in `tests/` and the implemented file is `tests/TestPVMultiCountryDeflation.js`.
    - Naming differs from the plan (“pensionContributionByCountry” vs `personalPensionContributionByCountry`), which can confuse readers mapping the plan to the code.
    - `PresentValueCalculator.js` header comments still state “Flows use residency-country deflation”, which is no longer true for the four corrected columns.
- **Recommended Actions:**
  - **Update this plan doc:** Mark Stages 0–4 as completed and replace the “Ready to Start?” prompt with links to the implemented test and the exact variables used in `Simulator`/`PresentValueCalculator`.
  - **Clarify PV semantics in code/docs:** Update the PV semantics section (doc + `PresentValueCalculator.js` header) to distinguish “flows that are residency-deflated” from “flows that are source-deflated”, and list which columns fall into each bucket.

### Dynamic Sections Generalization Plan Review

- **Document:** `docs/dynamic-sections-generalization.plan.md`
- **Category:** Implementation Plan
- **Summary:** Proposes generalizing the existing “dynamic section” (flexbox-inside-colSpan) table mechanism from Deductions-only to N dynamic sections (e.g., Income next), via a section registry + multi-section manager, config-driven empty-state sizing, and optional per-residence-period zero-only hiding for selected dynamic columns.
- **Status Assessment:**
  - **Implemented (Deductions-only dynamic section):**
    - A single-section `DynamicSectionManager` exists and can compute max dynamic column count across countries visited, and can post-render measure/scale widths to keep total section width consistent across countries (`src/frontend/web/components/DynamicSectionManager.js`).
    - `TableManager` renders Deductions as a flexbox container within a single `colSpan` cell and injects per-country dynamic tax header rows (`tr.tax-header`) to support relocation timelines (`src/frontend/web/components/TableManager.js`).
    - Generic CSS for `.dynamic-section-container/.dynamic-section-flex/.dynamic-section-cell` is in place and keyed by `data-section` (`src/frontend/web/ifs/css/simulator.css`).
    - The group header for Deductions already has a robust hook (`th[data-group="deductions"]`) and `TableManager` updates its `colSpan` during render (`src/frontend/web/ifs/index.html`, `src/frontend/web/components/TableManager.js`).
  - **Partial / not yet generalized (vs. the plan text):**
    - Dynamic-section keying and placement are still Deductions-shaped (`PensionContribution` + `Tax__*`, insertion pivot at PensionContribution) in both row rendering and tax-header generation (`src/frontend/web/components/TableManager.js`).
    - Empty-state sizing includes a hard-coded `PensionContribution` special-case rather than a config-driven sizing policy (`src/frontend/web/components/TableManager.js`).
    - No section registry (`DynamicSectionsConfig.js`) or multi-section owner (`DynamicSectionsManager.js`) exists yet; `DynamicSectionManager` also currently embeds `DEDUCTIONS_SECTION_CONFIG` in-file (`src/frontend/web/components/DynamicSectionManager.js`).
    - Per-residence-period “zero-only” hiding for selected dynamic columns is not implemented.
- **Recommended Actions:**
  - **Land Phase 1–3 from the plan:** Add a `DYNAMIC_SECTIONS` registry + `DynamicSectionsManager`, refactor `TableManager` to iterate sections and derive dynamic membership from section config (eliminate `PensionContribution`/`Tax__*` assumptions), and move empty-state sizing rules into per-section config.
  - **Prepare Income as the next dynamic section:** Add a `data-group="income"` hook to the Gross Income group header and use the same rendering path once the registry exists (`src/frontend/web/ifs/index.html`).
  - **Implement Phase 4 selectively:** Add the per-residence-period zero-only detection only for explicitly configured keys (e.g., pension contribution), to avoid unexpected column disappearance.

### Economic Data V2 Plan Review

- **Document:** `docs/economic-data-v2-plan.md`
- **Category:** Implementation Plan
- **Summary:** Specifies a ledger-vs-analytics split for currency conversion: ledger math should use inflation-driven “evolution FX” anchored at the scenario’s simulation start year, while PPP/constant/reversion modes are reserved for explicit analytics (notably relocation split suggestions).
- **Status Assessment:**
  - **Implemented (in `EconomicData`):**
    - `EconomicData.convert()` supports `fxMode` values `evolution` (default), `constant`, `ppp`, and `reversion`, enabling the plan’s intended “single ledger mode + optional analytic modes” (`src/core/EconomicData.js`).
    - Evolution FX is inflation-driven and year-aware (per-EUR paths evolved by per-country inflation, then cross FX derived as `perEurTo / perEurFrom`), with per-run caching to reduce recomputation (`src/core/EconomicData.js`).
  - **Divergences / legacy behavior still present:**
    - The plan requires the evolution engine to be anchored at the **simulation start year**, but `EconomicData.convert()` defaults `baseYear` to the wall-clock year when omitted, so callers must pass `{ baseYear: config.getSimulationStartYear() }` to meet the spec (`src/core/EconomicData.js`).
    - The implementation does not distinguish “ledger” vs “analytics” at the API boundary; PPP and reversion are available via `fxMode` and rely on call-site discipline to avoid use in ledger paths (`src/core/EconomicData.js`).
    - “Legacy” scalar accessors remain non-time-series (e.g., `getInflationForYear()` ignores `year` and returns base CPI), and missing inflation can fall back to base CPI or a 2% default, which is not captured in the plan text (`src/core/EconomicData.js`).
- **Recommended Actions:**
  - **Determinism / spec alignment:** Make simulation-start anchoring the default for evolution FX in core paths (e.g., infer `baseYear` from `Config.getInstance().getSimulationStartYear()` inside `EconomicData.convert()` when `fxMode==='evolution'`), or enforce that ledger helpers always pass `baseYear`.
  - **API clarity:** Add explicit wrapper helpers (or doc conventions) for “ledger conversion” vs “analytics conversion” so PPP/reversion cannot be selected accidentally in tax/accounting flows.
  - **Doc updates:** Expand `docs/economic-data-v2-plan.md` to record current implementation details that matter operationally (years `<= baseYear` behavior, inflation-source precedence, and what happens when inflation data is missing).

### Monetization Plan Review

- **Document:** `docs/monetization-plan.md`
- **Category:** Implementation Plan
- **Summary:** Proposes a no-backend, privacy-first monetization approach using third-party licensing (offline-signed entitlements or online verification), client-side feature gating (`Entitlements`/`FeatureGate`), and optionally signed/encrypted premium content packs.
- **Status Assessment:**
  - **Not implemented:** No `Entitlements` / `FeatureGate` modules exist under `src/frontend/web/utils/`, and there are no entitlement checks, upgrade prompts, or license entry flows in the web UI.
  - **Not implemented:** No payment/licensing vendor integrations (Gumroad/Keygen/Lemon Squeezy/Paddle/Stripe/PayPal) appear in the repository code.
  - **Non-monetization stub only:** The only “Subscribe” UI is a commented-out newsletter form in `src/frontend/web/landing/index.html` (with related styles in `src/frontend/web/landing/styles.css`), and it is not connected to any backend/service.
- **Recommended Actions:**
  - **Decide MVP scope:** Pick vendor + entitlement format first (offline-signed token vs online verification), and define a concrete gating matrix (which features are free vs paid, and what limits apply).
  - **Implement the smallest vertical slice:** Add `src/frontend/web/utils/Entitlements.js` + `src/frontend/web/utils/FeatureGate.js`, wire initialization into `WebUI.js`, and add a minimal “Enter License / Upgrade” UI that soft-gates one feature (e.g., Monte Carlo) end-to-end.
  - **Document operational requirements:** Record which vendor domains must be allowed (if any), offline grace/refresh behavior, and the exact `localStorage` keys used, so the static-host constraint remains auditable.

## Bug Reports

### Pension Contribution Per-Country Bug Review

- **Document:** `docs/bug-pension-contribution-per-country.md`
- **Category:** Bug Report
- **Summary:** Tracks a multi-country relocation bug where private pension contributions (and PV deflation) were incorrectly tied to `StartCountry` via a single `Person.pension` pot, causing cross-country work histories to funnel contributions into the start-country pension and apply the wrong inflation source for PV.
- **Status Assessment: Partial**
  - **Fixed:** Core now supports per-country private pension pots via `Person.pensions` + `Person.getPensionForCountry()` (`src/core/Person.js`) and routes pensionable salary contributions to the salary origin country’s pot (`salaryPerson.getPensionForCountry(pensionCountry).buy(...)`) while skipping contributions for `pensionSystem.type='state_only'` countries (`src/core/Simulator.js`).
  - **Fixed:** `getRateForKey()` returns `0` for empty age bands, preventing accidental “100% contribution” behavior when a ruleset returns `{}` bands (`src/core/Utils.js`).
  - **Fixed:** PV deflation for pension capital now iterates pension pots and deflates each pot using its own country’s inflation (`src/core/PresentValueCalculator.js`).
  - **Still open:** Nominal aggregation and several capital-based computations still treat pension as a single pot via `person.pension`, so non-start-country pension capital is excluded from `pensionFund`, `worth`, `capitalPreWithdrawal`, withdrawal logic, and end-of-sim liquidation (`src/core/Simulator.js`, `src/core/DataAggregatesCalculator.js`).
  - **Still open:** Retirement lump-sum is taken only from the `StartCountry` pot (`this.pension.getLumpsum()`), not from all pots using per-country rules (`src/core/Person.js`).
- **Recommended Actions:**
  - **Make pension totals multi-pot everywhere:** Replace uses of `person.pension.capital()` that represent “total private pension capital” with a helper that sums across `person.pensions` (and similarly for liquidation/withdrawal paths) (`src/core/Simulator.js`, `src/core/DataAggregatesCalculator.js`).
  - **Retirement lump sum:** Decide intended semantics for multi-pot lump sums (e.g., per-pot lump sums vs one “primary” pot) and implement consistently (likely iterate all pots and apply each pot’s ruleset) (`src/core/Person.js`, `src/core/Equities.js`).
  - **Ensure ruleset availability for salary-origin countries:** Contribution logic currently falls back to `{}` bands when `getCachedTaxRuleSet(bucketCountry)` fails, silently producing zero contributions; either guarantee all required rule sets are loaded/cached before simulation or fail loudly when a salary-origin ruleset is missing (`src/core/Simulator.js`).
  - **Add a core regression test:** Create a multi-country salary scenario (mixed → mixed, and mixed → state_only) and assert that (a) contributions land in the correct pots, and (b) `pensionFund`/`worth` include total multi-pot capital after the nominal aggregation fix (`tests/`).

### linkedCountry Age Change Bugs Review

- **Document:** `docs/linkedcountry-age-change-bugs.md`
- **Category:** Bug Report
- **Summary:** Documents three relocation-related issues where `linkedCountry` on real-estate events (property `R` and mortgage `M`) can become stale or incorrectly shared after editing event ages or relocation ages, leading to wrong inflation/currency behavior in core (`Property.getValue()` and `getEventCurrencyInfo()` consume `event.linkedCountry`).
- **Status Assessment: Open**
  - **Bug 1 (Event age edits don’t update/validate `linkedCountry`):** Still present. `EventsTableManager._scheduleRelocationReanalysis()` only re-runs `RelocationImpactDetector.analyzeEvents()` and updates indicators, but neither path validates existing `event.linkedCountry` against the current relocation timeline. In `RelocationImpactDetector.clearResolvedImpacts()`, any `R/M` event with *any* `linkedCountry` is treated as resolved, so stale values won’t surface as impacts.
  - **Bug 2 (R/M pair with different `fromAge` forced to one `linkedCountry`):** Still present. `EventsTableManager.linkPropertyToCountry()` applies the selected country to *both* `R` and `M` rows sharing the same `id`, even if the two events’ `fromAge` values fall in different residency periods. The UI’s per-row detection (`detectPropertyCountry(event.fromAge, startCountry)`) can therefore be overridden by the “apply-to-both” behavior.
  - **Bug 3 (Relocation age edits don’t re-check existing `linkedCountry`):** Still present. Moving an `MV-*` event triggers reanalysis, but `RelocationImpactDetector.analyzeEvents()` only flags boundary-crossers and in-jurisdiction events; it does not add any “`linkedCountry` mismatch” impact category, and a mismatch is also currently auto-considered “resolved” due to the `linkedCountry`-present checks in `clearResolvedImpacts()`.
- **Recommended Actions:**
  - **Add mismatch detection as first-class impact:** In `src/frontend/web/components/RelocationImpactDetector.js`, after building the relocation timeline, validate each `R/M` event with a non-empty `linkedCountry` by computing the expected country at `event.fromAge` and adding a new impact category (e.g., `country_mismatch`) when they differ.
  - **Stop auto-resolving mismatches:** Update `clearResolvedImpacts()` so `linkedCountry` presence only resolves `boundary/simple` when it matches the expected country (or when an explicit “override/acknowledge” flag is set).
  - **Fix the R/M linking semantics:** In `src/frontend/web/components/EventsTableManager.js`, change `linkPropertyToCountry()` to (a) apply only to the selected row by default, and/or (b) compute and apply per-event countries separately for the `R` and `M` rows when linking a pair (and show a warning when `fromAge` implies different countries).
  - **Expose a clear UX path:** When a mismatch is detected, present a resolution panel action to “Clear linked country” (conservative) and/or “Update to detected country”, and consider a bulk “Revalidate property countries” action for scenarios with many properties.

### Currency vs Country Inference Findings Review

- **Document:** `docs/currency-country-inference-findings.md`
- **Category:** Bug Report
- **Summary:** Identifies cases where event `currency`→country inference (and currency-level caching) can override a known `linkedCountry`, causing incorrect country context for inflation/deflation and attribution in multi-country/multi-currency flows.
- **Status Assessment: Open (findings not incorporated)**
  - **Still present:** `getEventCurrencyInfo()` prefers `event.currency` and calls `findCountryForCurrency(currency, linkedCountry|fallback)`, but `findCountryForCurrency()` returns `currencyCountryCache[currency]` before considering the preferred/linked country, so a cached mapping can override `event.linkedCountry` (`src/core/Simulator.js`).
  - **Still present:** Relocation (`MV-*`) processing uses `findCountryForCurrency(event.currency, prevCountry)` first and only falls back to `event.linkedCountry` if currency inference fails, reproducing the same “currency overrides known country” pattern (`src/core/Simulator.js`).
  - **Still present:** `convertCurrencyAmount()` maps `fromCurrency`/`toCurrency` to countries via `findCountryForCurrency(currency, preferredCountry)`, so conversions for events whose `currency` differs from their inflation/tax context country can inherit the same mis-mapping (`src/core/Simulator.js`).
- **Recommended Actions:**
  - **Make `linkedCountry` authoritative for country context:** In `getEventCurrencyInfo()`, if `event.linkedCountry` is present, set `info.country = linkedCountry` regardless of `event.currency`; use `event.currency` only to set `info.currency` (and to drive FX conversion), not to infer the country context.
  - **Change caching semantics in `findCountryForCurrency()`:** When `preferredCountry` is provided, do not return a currency-level cached country; either (a) bypass cache entirely, or (b) key the cache by `(currency, preferredCountry)` / “context”, so per-event context cannot be overridden by first-seen currencies.
  - **Align `MV-*` inflation source resolution:** Prefer `event.linkedCountry` for `infCountry` when present; only infer a country from `event.currency` when no linked country is known.
  - **Add a core regression test:** Create a scenario where `linkedCountry` and `currency` intentionally differ (e.g., IE-linked salary/expense paid in USD), and assert that inflation/deflation and attribution use `linkedCountry` while FX conversion uses the provided `currency` (`tests/`).

## System Descriptions

### Events Accordion System Documentation Review

- **Document:** `docs/events-accordion-system.md`
- **Category:** System Description
- **Summary:** Describes the accordion view architecture, editing model, and UI behavior for event management; several details are now out of sync with the current `EventAccordionManager` + `EventSummaryRenderer` implementation.
- **Status Assessment: Out of date / Partially accurate**
  - **State + identifiers differ:** Doc uses `accordionId: "event_1"` and an `eventCounter`; implementation assigns `accordionId: "accordion-item-<visibleIndex>"` and relies on a per-row stable `row.dataset.eventId` for state preservation (`src/frontend/web/components/EventAccordionManager.js`).
  - **Event type codes + categories differ:** Doc uses `S` for stock market; implementation uses `SM` and includes additional types (e.g., `M` mortgage, `NOP`, `MV-*` relocation) and derives labels from `EventsTableManager.getEventTypeOptionObjects()` (`src/frontend/web/components/EventAccordionManager.js`, `src/frontend/web/components/EventSummaryRenderer.js`).
  - **Markup/examples don’t match:** Doc’s `generateSummary()` example and icon/color scheme (FontAwesome category icons, left-border RGBA colors) do not reflect the current summary grid markup (type label + name badge + amount/rate + period, plus relocation-impact badge) (`src/frontend/web/components/EventSummaryRenderer.js`).
  - **Editable field selectors differ:** Doc references `.accordion-edit-from-age` / `.accordion-edit-to-age`; implementation uses `.accordion-edit-fromage` / `.accordion-edit-toage` (and drives field visibility via `shows*Field` helpers) (`src/frontend/web/components/EventSummaryRenderer.js`, `src/frontend/web/components/EventAccordionManager.js`).
  - **Wizard behavior differs:** Doc states “type changes trigger wizard”; implementation primarily supports in-place type switching (with special handling for `MV-*` country selection) and contains a largely-unused `handleEventTypeChange()` path (`src/frontend/web/components/EventAccordionManager.js`).
  - **Deletion UX differs:** Doc claims a confirmation dialog; implementation deletes immediately (with animation) by removing the table row and refreshing (`src/frontend/web/components/EventAccordionManager.js`).
  - **Unmentioned implemented features:** Sorting header synced to table sorting, FLIP animations via `AccordionSorter`, warning mirroring from table → accordion headers/fields, and relocation impact inline resolution panel support are present but not documented (`src/frontend/web/components/EventAccordionManager.js`).
  - **Aspirational sections read as implemented:** Debounced validation, event delegation, accessibility (ARIA/keyboard model), and some error-handling claims are not reflected in the current code.
- **Recommended Actions:**
  - **Update to “as-built” description:** Replace hardcoded type maps, CSS color values, and markup examples with descriptions aligned to `EventSummaryRenderer.generateSummary()` / `generateDetailedSummary()` and table-driven event type options.
  - **Document current UX explicitly:** Clarify that (a) the “Add Event” flow is driven by the table/wizard system (not an accordion-header button here), (b) type changes are usually in-place (wizard only for specific flows like relocation), and (c) deletion is immediate (or implement confirmation if that’s the desired UX).
  - **Add missing integration notes:** Include sections for sorting integration (table sort keys → accordion), warning mirroring behavior, and relocation impact badge/resolution panels.
  - **Mark “Future Enhancements” vs reality:** Either remove the performance/accessibility “implemented” language or move it under a clearly labeled future/roadmap section to avoid misleading readers.

### Events Wizard System Documentation Review

- **Document:** `docs/events-wizard-system.md`
- **Category:** System Description
- **Summary:** Documents the event-creation wizard system (manager/renderer/config/validation/UX), but key implementation details have drifted—especially the YAML schema, component responsibilities, supported content types, and the real validation/default-value behavior.
- **Status Assessment: Out of date / Partially accurate**
  - **State model mismatch:** The doc’s “wizard state structure” embeds `currentStep`/`isActive` inside the state object; implementation stores these on `WizardManager` (`currentStep`, `isActive`) while `wizardState` contains `{ eventType, data, onComplete, onCancel }` (`src/frontend/web/components/WizardManager.js`, `src/frontend/web/components/EventsWizard.js`).
  - **Component responsibility drift:** The doc attributes complex rendering/templating to `WizardRenderer`; in code, `WizardRenderer` handles `intro/input/choice` plus Enter-key advance and comparator validation, while `EventsWizard.js`’s `EventsRenderer` implements `period/summary/mortgage` rendering, template selection, and derived variables (e.g., `{growthPart}`, `{downPaymentPct}`) (`src/frontend/web/components/WizardRenderer.js`, `src/frontend/web/components/EventsWizard.js`).
  - **YAML schema/examples don’t match reality:** Documentation examples omit the required top-level `EventWizards:` key and describe “icons/styling config”; the real config is `EventWizards: [...]` plus a `WizardConfig:` block that is currently not consumed by `WizardManager`/renderers (`src/frontend/web/assets/events-wizard.yml`, `src/frontend/web/components/WizardManager.js`).
  - **Supported content types incomplete:** Docs list `input/choice/period/summary/mortgage` but the shipped config uses `intro` and the renderer supports it (`src/frontend/web/assets/events-wizard.yml`, `src/frontend/web/components/WizardRenderer.js`).
  - **Validation behavior differs:** The doc describes debounced, warning-vs-error validation; implementation is a mix of (a) required/positive checks on Next in `WizardManager`, (b) age relationship checks for `period` on Next in `WizardManager`, (c) `lt/lte/gt/gte:<field>` checks on blur in `WizardRenderer`, and (d) final “create” validation + special-case mapping/mortgage event creation in `EventsWizard`—but warnings are effectively unused and YAML `defaultValue` is not applied anywhere (`src/frontend/web/components/WizardManager.js`, `src/frontend/web/components/WizardRenderer.js`, `src/frontend/web/components/EventsWizard.js`, `src/frontend/web/assets/events-wizard.yml`).
  - **Wizard type codes outdated:** The doc’s investment wizard references `S`, but current configuration and special-case creation logic use `SM` for market events (`src/frontend/web/assets/events-wizard.yml`, `src/frontend/web/components/EventsWizard.js`).
- **Recommended Actions:**
  - **Update “Architecture” to match code split:** Document `WizardManager` as modal lifecycle + navigation + step-level gating, `WizardRenderer` as generic input/choice/intro + blur/Enter mechanics, and `EventsWizard/EventsRenderer` as the event-domain wrapper (event-type mapping, mortgage secondary event creation, summary/mortgage rendering and templating).
  - **Fix YAML documentation to match the shipped schema:** Add a minimal schema section covering `EventWizards` root key, per-step fields (`stepId/title/contentType/field(s)/condition/showButtons/labelPosition`), and supported `contentType`s including `intro`.
  - **Document (or implement) `defaultValue` + `WizardConfig`:** Either (a) explicitly mark them as “currently unused” and remove claims about styling config and defaults, or (b) implement applying defaults and consuming `WizardConfig` (modal sizing, category colors, animation) in the runtime.
  - **Clarify validation semantics:** Replace “debounced / warning vs error” claims with the actual enforcement points and rule support (`required`, `positive`, `fromAgeRequired`, comparator rules), and call out where to add new rules safely (e.g., comparator rules belong in `WizardRenderer`; step gating belongs in `WizardManager`).

### Relocation System Documentation Review

- **Document:** `docs/relocation-system.md`
- **Category:** System Description
- **Summary:** Describes the relocation (multi-country + multi-currency) system, including impact detection and inline resolution panels, but several key details have drifted from the current `RelocationImpactDetector`/`RelocationImpactAssistant` + currency-mode implementations.
- **Status Assessment: Out of date / Partially accurate**
  - **RelocationImpactAssistant is no longer a modal:** The doc describes it as a deprecated modal interface; the implementation comment and behavior indicate the legacy modal is removed and the assistant is the inline panel renderer/action hub for both table and accordion (`src/frontend/web/components/RelocationImpactAssistant.js`).
  - **Impact categories don’t match the implementation:** The doc lists `property auto-peg` and `pension conflicts` as first-class categories; the detector currently emits `missing_ruleset`, `boundary`, `simple`, and `local_holdings`, with “pension conflict” only influencing `simple` messaging (and optional auto-convert in the “accept suggestion” action) (`src/frontend/web/components/RelocationImpactDetector.js`, `src/frontend/web/components/EventsTableManager.js`).
  - **Local holdings detection is context-dependent:** The doc reads as always-on, but `local_holdings` relies on an `investmentContext` argument; several call sites invoke `analyzeEvents(events, startCountry)` without passing this, so the warning may not surface consistently (`src/frontend/web/components/EventsTableManager.js`, `src/frontend/web/components/EventAccordionManager.js`, `src/frontend/web/components/FileManager.js`).
  - **Resolution semantics differ from the described actions:** The doc claims “peg currency” resolves an impact, but the detector’s `clearResolvedImpacts()` requires `currency && linkedCountry` (or split/override) to consider `boundary` resolved; `pegCurrencyToOriginal()` only sets `event.currency`, so the warning will typically persist unless the user splits or marks reviewed (`src/frontend/web/components/RelocationImpactDetector.js`, `src/frontend/web/components/EventsTableManager.js`).
  - **Named functions in the doc aren’t present as-written:** The doc references helpers like `getEventCurrency()` and `consolidateCurrencyFlows()`; current code uses `getEventCurrencyInfo()` in core and performs “net-by-currency then convert” inside `flushFlowState()` (not a standalone `consolidateCurrencyFlows()` function) (`src/core/Simulator.js`).
  - **EconomicData FX modes are incomplete in the doc:** The doc emphasizes `constant/ppp/reversion`, but `EconomicData.convert()` defaults to `fxMode: 'evolution'` and core ledger conversion paths call this inflation-driven mode by default (`src/core/EconomicData.js`, `src/core/Simulator.js`).
- **Recommended Actions:**
  - **Update `docs/relocation-system.md` to “as-built”:** Replace the assistant/modal description, align impact categories/method names with the shipped detector/assistant, and update the sequence diagram to match the current badge + inline panel UX.
  - **Decide: implement missing categories vs remove them from docs:** If `property auto-peg`/`pension conflicts` should be first-class impacts, implement them in `RelocationImpactDetector` (and map them to panel actions); otherwise, remove or reframe those sections as “future work”.
  - **Make “peg/accept” actually clear (or reword it):** Either loosen `clearResolvedImpacts()` to treat explicit `event.currency` as a valid resolution for `boundary/simple`, or change the docs (and panel copy) to state that peg/accept is informational and that the warning clears only via split/link/review.
  - **Standardize local-holdings analysis inputs:** Either plumb `investmentContext` into all `analyzeEvents` call sites (consistent UI behavior), or document clearly when/where the local-holdings warning can appear.
  - **Clarify FX vs PPP usage:** Document that unified-currency reporting and ledger conversions use FX (default `evolution`), while PPP is used for “cost-of-living” guidance/suggestions (e.g., the panel’s suggested amount) rather than for core accounting.

## Refactor/Completion Reports

### Money Refactor Completion Report Review

- **Document:** `docs/money-refactor-completion.md`
- **Category:** Refactor/Completion Report
- **Summary:** Declares the Money refactor “complete” and summarizes the intended performance model; the current `Money` implementation largely matches the described API shape (`Money.create(...)` struct for hot paths + `new Money(...)` instances at boundaries), but the report contains placeholders and a few statements that don’t match the codebase/testing harness.
- **Status Assessment: Partially accurate / Needs update**
  - **Placeholders/unknowns:** “All XX tests pass” is not a real status statement and the Monte Carlo timing numbers aren’t verifiable from this doc alone (`docs/money-refactor-completion.md`).
  - **Currency-check claim conflicts with `Money` API:** The report says “No currency checks in tight loops”, but `Money.add(...)`/`Money.subtract(...)` always validate both `currency` and `country` match on every call (`src/core/Money.js`), and core loops do call `Money.add(...)` in some aggregation paths (`src/core/Equities.js`).
  - **Perf harness availability:** The report suggests running `MoneyPerfTest()` “in the browser console”, but `MoneyPerfTest` is defined in the Node test harness (`tests/TestMoneyPerformance.js`) and does not appear to be shipped in the runtime web bundle (`src/` has no references).
- **Recommended Actions:**
  - **Replace placeholders with reproducible results:** Record the exact commands + outcomes (e.g., `./run-tests.sh -t core`, `./run-tests.sh TestMoneyPerformance TestMonteCarloValidation`) and replace “XX”/hand-copied timing figures with current numbers + environment.
  - **Fix the “MoneyPerfTest in browser” instruction:** Either (a) document `./run-tests.sh TestMoneyPerformance` as the supported entrypoint, or (b) intentionally expose the benchmark harness in the web build and document where it’s loaded.
  - **Clarify hot-path guidance:** If the intent is to avoid repeated checks, document the actual pattern used (direct `.amount` math on homogeneous holdings) and when it is safe, vs when `Money.add`/`subtract` should be used for invariant enforcement (`src/core/Money.js`).
  - **Align performance claims to guardrails:** Update the “<5% overhead” statement (or justify it) against the current performance thresholds enforced by `tests/TestMoneyPerformance.js`.

## Reference/Info

### Money Architecture Review

- **Document:** `docs/money-architecture.md`
- **Category:** Reference/Info
- **Summary:** Describes using `Money` as a currency-tagged wrapper for state-pension calculations, with conversion via `EconomicData` while keeping numeric fields for legacy consumers.
- **Status Assessment: Out of date / Partially accurate**
  - The document treats `Money.create(...)` as returning a “Money object”; in code it returns a plain struct (`{ amount, currency, country }`) without prototype methods, while `new Money(...)` / `Money.from(...)` returns an instance (`src/core/Money.js`).
  - The sequence diagram’s conversion flow doesn’t match the implementation: `Money.convertTo(...)` requires `economicData`, forces `{ fxMode: 'evolution' }`, and throws on failure; the doc implies a simpler `EconomicData.convert(...)` call and “graceful” handling (`docs/money-architecture.md`, `src/core/Money.js`).
  - The “Risk Mitigation” table claims “fallback to null Money objects” and “errors logged and handled gracefully”; `Money.js` provides no null-return path (and `Money.fromNullable(...)` returns a zero `Money`, not `null`) and uses exceptions for validation/conversion failures (`src/core/Money.js`).
  - The doc omits key invariants that matter for consumers: arithmetic (`add`/`subtract`) requires both `currency` and `country` to match, so “same-currency different-country” aggregation is a hard error unless explicitly converted first (`src/core/Money.js`).
  - Determinism risk: `Money.convertTo(...)` does not pass `baseYear` into `economicData.convert(...)`, so any defaulting behavior in `EconomicData.convert()` can make FX evolution depend on wall-clock year (`src/core/Money.js`).
- **Recommended Actions:**
  - **Update doc to match the real `Money` API:** Explicitly distinguish “struct Money” (`Money.create`) vs “instance Money” (`new Money`/`Money.from`), and update the sequence diagram to reflect `Money.convertTo(money, targetCurrency, targetCountry, year, economicData)` + `fxMode: 'evolution'` + throw-on-failure behavior.
  - **Fix/clarify the error model in the doc:** Either remove the “null fallback / logged errors” claims, or add an explicit helper (e.g., `Money.tryConvertTo(...)`) and adopt it where the architecture expects non-fatal behavior.
  - **Tighten conversion determinism:** Consider extending `Money.convertTo(...)` (and its call sites) to require/pass a `baseYear` (and optionally `fxMode`) rather than relying on `EconomicData.convert()` defaults, then reflect that requirement in the architecture doc.

### Economic Data V1 Info Review

- **Document:** `docs/economic-data-v1-info.md`
- **Category:** Reference/Info
- **Summary:** Describes intended year-by-year CPI/PPP/FX time-series usage, plus conversion-mode semantics for multi-currency and relocation scenarios.
- **Status Assessment: Out of date / Mixed v1-v2 content (partially accurate)**
  - **Time-series behavior is not implemented in core:** `EconomicData` ingests a scalar-only profile (CPI/PPP/FX) and does not normalize or query per-year series values; `TaxRuleSet.getEconomicProfile()` explicitly returns a “Scalar-only profile; timeSeries omitted” object (`src/core/TaxRuleSet.js`, `src/core/EconomicData.js`).
  - **Year-specific CPI lookup is not implemented:** `EconomicData.getInflationForYear(country, year)` ignores `year` and returns the base CPI, so inflation is constant-by-country unless driven by overrides via `InflationService.resolveInflationRate(...)` (`src/core/EconomicData.js`, `src/core/InflationService.js`).
  - **Base-year anchoring is caller-dependent:** The doc states conversion is anchored to the simulation start year; `EconomicData.convert()` defaults `baseYear` to the wall-clock year when omitted, so determinism relies on call sites passing `{ baseYear: config.getSimulationStartYear() }` (`src/core/EconomicData.js`, `src/core/Simulator.js`).
  - **Default mode is inconsistently described:** The doc claims evolution FX is default but later labels PPP as default; in code, the default is `fxMode: 'evolution'` and PPP/reversion/constant are opt-in via `options.fxMode` (`src/core/EconomicData.js`).
  - **Failure semantics differ:** The doc describes “pass-through unchanged + warning” behavior; `EconomicData.convert()` returns `null` on invalid conversion and performs strict FX validation/logging (callers may treat `null` as a hard failure) (`src/core/EconomicData.js`).
- **Recommended Actions:**
  - **Supersede or rewrite:** Either mark `docs/economic-data-v1-info.md` as superseded by `docs/economic-data-v2-plan.md` + `docs/dynamic-fx-plan.md` (and point readers to `docs/econ_data_refactor.md` for test invariants), or rewrite/rename it as the “as-built” economic data overview.
  - **Align to implementation:** Remove or move the time-series lookup/projection/step-function sections to a future plan, and document the current scalar profile shape and the supported `EconomicData.convert()` modes (`evolution|constant|ppp|reversion`) with explicit “must pass `baseYear`” guidance for deterministic results.
  - **Reference the real inflation precedence:** Where the doc describes “which inflation rate is used”, link to `InflationService.resolveInflationRate(...)` rather than maintaining a separate precedence list that can drift.

### Tax Rules JSON Reference Review

- **Document:** `docs/tax-rules-reference.md`
- **Category:** Reference/Info
- **Summary:** Describes the structure/meaning of `src/core/config/tax-rules-<country>.json` files (metadata, locale/economic anchors, income tax, social/additional taxes, capital taxes, pensions, residency rules, and investment type definitions).
- **Status Assessment: Mostly accurate, but outdated in key areas**
  - **`investmentTypes` schema drift:** The doc says investment economic semantics (currency/country anchoring, contribution currency mode, residency scope) “will be added”, but `baseCurrency`, `assetCountry`, `contributionCurrencyMode`, and `residenceScope` already exist in the rules and are consumed by core logic (`src/core/config/tax-rules-ie.json`, `src/core/config/tax-rules-ar.json`, `src/core/config/tax-rules-us.json`, `src/core/InvestmentTypeFactory.js`, `src/core/Simulator.js`, `src/core/PresentValueCalculator.js`).
  - **Missing `tax-rules-us.json` coverage:** The document positions IE/AR as “authoritative examples”, but the repo now ships US rules with different shapes (e.g., `additionalTaxes: []`, `investmentTypes` keys like `usIndexFunds`, and some per-type fields omitted like `contributionCurrencyMode`) (`src/core/config/tax-rules-us.json`).
  - **Inflation semantics are ambiguous:** `economicData.inflation.cpi` is described as a “CPI level or rate”; the current rule files treat it as a scalar annual inflation rate (percent) rather than a CPI index level or time-series data (`src/core/config/tax-rules-*.json`, `src/core/EconomicData.js`).
  - **Versioning examples are stale:** Example `version` strings like `"26.4"`/`"1.0"` don’t match the current `"YYYY.MM"` pattern used in shipped rules (e.g., `"2025.12"`) (`src/core/config/tax-rules-*.json`).
- **Recommended Actions:**
  - **Update the `investmentTypes` section:** Document the currently-shipped per-type fields (`baseCurrency`, `assetCountry`, `contributionCurrencyMode`, `residenceScope`) and their effect on contribution currency and PV/deflation behavior (and point readers to the consuming code paths listed above).
  - **Add an explicit “field optionality” note:** Call out which blocks/fields are optional or can be empty across countries (e.g., `additionalTaxes`, `taxCredits`, `ageAdjustments`, per-type `contributionCurrencyMode`) to avoid readers treating the IE shape as mandatory.
  - **Clarify `economicData.inflation.cpi`:** Define it as “annual CPI inflation rate (percent)” if that’s intended, and note that profiles are scalar-only today (no time-series lookup in core).
  - **Refresh metadata guidance:** Update `version` examples to match the repo’s convention and state whether an empty `updateMessage` is acceptable.

### Economic Data V1 Feedback Review

- **Document:** `docs/economic-data-v1-feedback.txt`
- **Category:** Reference/Info
- **Summary:** External technical review recommending (a) nominal-FX “ledger” conversions (PPP only for optional real-value analytics), (b) chained year-by-year CPI indexing from time-series (not a single long-horizon compound rate), (c) convert-then-net for taxable flows, (d) more realistic CPI/FX projection assumptions, and (e) deterministic “base year” handling for reproducible runs.
- **Status Assessment: Partially addressed; several core modelling recommendations not adopted**
  - **PPP as default conversion:** **Mostly addressed at the API level.** `EconomicData.convert()` defaults to `fxMode: 'evolution'` (PPP is opt-in via `fxMode: 'ppp'|'reversion'`) (`src/core/EconomicData.js`). However, evolution FX is itself inflation-differential driven (PPP-implied drift), so the “ledger should be nominal FX” recommendation is **not implemented** in the current default ledger path (`convertNominal(..., fxMode: 'evolution')` in `src/core/Simulator.js`).
  - **Chained CPI from published CPI tables:** **Not implemented as specified.** `EconomicData` ingests only scalar CPI/PPP/FX and `getInflationForYear(country, year)` still ignores `year` (`src/core/EconomicData.js`), so CPI time-series chaining against official tables is not possible yet. Some “year-by-year” chaining exists mechanically via `InflationService.getCumulativeIndex(...)`, but it resolves the same scalar CPI each year unless driven by overrides (`src/core/InflationService.js`).
  - **Convert-then-net (per-flow conversion):** **Largely addressed in core flows.** The simulator converts monetary amounts event-by-event via `convertCurrencyAmount(...)` (which routes through `convertNominal(...)`) rather than only converting a final netted figure (`src/core/Simulator.js`).
  - **Projection methodology:** **Not addressed.** V2 no longer uses a trailing-average projection in `EconomicData`, but the default “evolution” approach deterministically drifts FX based on inflation differentials (PPP reversion behavior), rather than a nominal-FX random-walk/no-drift baseline with uncertainty bands as recommended (`src/core/EconomicData.js`).
  - **Base year determinism / reproducibility:** **Partially addressed but still fragile.** Many call sites pass `baseYear = Config.getInstance().getSimulationStartYear()` (e.g., charts and `convertNominal`), but `EconomicData.convert()` defaults `baseYear` to the wall-clock year when omitted and at least one core call site (`Money.convertTo(...)`) does not pass `baseYear` (`src/core/EconomicData.js`, `src/core/Money.js`).
  - **Metadata/clarifications (PPP base year, FX frequency, interpolation, dataset provenance):** **Not implemented in code.** Economic profiles carry `ppp_year`/`fx_date`, but they are not used for conversions and there is no first-class metadata/provenance surface yet (`src/core/EconomicData.js`).
  - **Testing strategy:** **Partially addressed.** Core tests exist for conversion modes/invariants and regression coverage (e.g., `tests/TestEconomicData.js`, `tests/TestFXConversions.js`, `tests/TestCurrencyConversionModes.js`), but there are no “official CPI table reconciliation” fixtures because CPI time-series are not present.
- **Recommended Actions:**
  - **Decide (and document) the intended accounting model:** If the goal is industry-aligned nominal FX for taxes/ledger, introduce an explicit nominal mode (historical FX when available; otherwise a no-drift baseline) and stop using inflation-differential drift as the default “nominal ledger” path (`src/core/Simulator.js`, `src/core/EconomicData.js`).
  - **Implement CPI/FX time-series in the economic profile:** Extend `TaxRuleSet.getEconomicProfile()` / `EconomicData` ingestion to include per-year CPI (and optionally FX) series, and make `getInflationForYear(...)` actually year-aware so chained CPI indices match published tables (`src/core/TaxRuleSet.js`, `src/core/EconomicData.js`).
  - **Harden determinism at the boundary:** Require/pin `baseYear` for evolution FX (or infer `Config.getInstance().getSimulationStartYear()` inside `EconomicData.convert()` when `fxMode==='evolution'`) and update `Money.convertTo(...)` to pass it (`src/core/EconomicData.js`, `src/core/Money.js`).
  - **Add doc-level clarifications:** Record FX data frequency (avg vs year-end), interpolation behavior, and PPP base year/currency in the economic-data docs so users understand what is “tax-real” vs “analytics” (`docs/economic-data-v1-info.md`, `docs/relocation-system.md`).

## Test Documentation

### Test Evaluation Overview Review

- **Document:** `docs/test-evaluation/README.md`
- **Category:** Test Documentation
- **Summary:** Describes an AI-assisted, three-tier evaluation pipeline (quality scoring, metadata extraction, and battery-level analysis) plus a resumable automation script (`docs/test-evaluation/run-evaluation.js`) that runs the prompts via Codex CLI and writes aggregated artifacts under `docs/test-evaluation/results/`.
- **Status Assessment: Mostly accurate, but partially out of date vs. the current test taxonomy**
  - **Test suite shape has evolved:** `tests/` now contains three distinct test types—custom core Node scenario tests (`tests/Test*.js`), Jest unit/UI tests (`tests/*.test.js`), and Playwright e2e specs (`tests/*.spec.js`)—as reflected by `run-tests.sh`. The evaluation runner currently includes `Test*.js` and `*.test.js` but explicitly excludes `*.spec.js`, so “test suite evaluation” does not cover Playwright e2e tests today (`docs/test-evaluation/run-evaluation.js`, `run-tests.sh`, `tests/`).
  - **Prompt assumptions don’t cleanly fit Jest UI tests:** Tier 1/2 prompts assume scenario-style tests with parameters/events/assertions; this maps well to the custom core tests but can produce low-signal or misleading metadata for Jest UI tests (e.g., “eventTypes”, “countries”, “ageRange” often aren’t meaningfully inferable) (`docs/test-evaluation/tier1-individual-quality.md`, `docs/test-evaluation/tier2-metadata-extraction.md`).
  - **“Parallel” language doesn’t match implementation:** The README frames Tier 1 & 2 as parallelizable across tests, but the current runner processes tests sequentially and does not actually use the `--concurrency` setting (`docs/test-evaluation/README.md`, `docs/test-evaluation/run-evaluation.js`).
  - **Manual aggregation example is stale:** The README’s `jq` aggregation example references `tests/evaluation/*-metadata.json`, but the automated pipeline writes tier outputs under `docs/test-evaluation/results/tier2/` and already emits `docs/test-evaluation/results/all-metadata.json` (`docs/test-evaluation/README.md`, `docs/test-evaluation/run-evaluation.js`).
- **Recommended Actions:**
  - **Make scope explicit:** Update the README to clearly state which test types are evaluated (core `Test*.js`, optionally Jest `*.test.js`, and whether Playwright `*.spec.js` is excluded by design); ideally add flags like `--include-jest` / `--include-playwright` or a `--type core|jest|e2e` switch to match `run-tests.sh`.
  - **Align the usage examples with current outputs:** Replace the `jq` example with the correct `docs/test-evaluation/results/…` paths (or remove it and point readers at the automatically generated `all-metadata.json` / `all-quality-scores.json`).
  - **Fix the parallelism story:** Either (a) update the README to describe the current sequential behavior (and why), or (b) implement real concurrency in `run-evaluation.js` and document the tradeoffs (quota/rate limiting, max safe concurrency).
  - **Consider per-test-type prompts:** If Jest UI tests remain in scope, add separate Tier 1/2 prompts (or adjust metadata schema) so UI-focused tests aren’t forced into scenario-oriented fields.

### Tier 1 Individual Test Quality Criteria Review

- **Document:** `docs/test-evaluation/tier1-individual-quality.md`
- **Category:** Test Documentation
- **Summary:** Defines a 7-dimension (1–5) rubric for evaluating the quality of a single test file (specificity, isolation, oracle quality, boundary/temporal coverage, mutation resistance, maintainability) and a JSON output schema for collecting results.
- **Status Assessment: Partially aligned with the current `tests/` mix (rubric is sound, but the suite spans multiple test archetypes)**
  - **Strong alignment (many files scoreable as-written):** A large portion of the core suite consists of single-topic scenario tests (e.g., targeted tax behavior, FX/deflation, relocation, pension edge cases) where the rubric maps cleanly to intent and expected failure localization (`tests/TestCGTAnnualExemptionSharesOnly.js`, `tests/TestLossOffsetSharesOnly.js`, `tests/TestFXConversions.js`).
  - **Weak alignment for “multi-behavior” suites:** Several files intentionally bundle many behaviors into one long-horizon scenario, which will reliably score low on specificity/isolation even when they are valuable integration guards (`tests/TestBoundaryConditions.js`, `tests/TestRegression*.js`, `tests/TestLifeScenarios.js`).
  - **Oracle quality is uneven across the suite:** Some tests compute expectations from first principles or rule/config sources (higher oracle quality / maintainability), but others explicitly embed “matches simulator output” golden values and/or wide ranges that primarily detect drift and can miss subtle regressions (`tests/TestIrishTaxSystem.js` vs. `tests/TestBasicTaxCalculation.js`, many `range`-based assertions in regression tests).
  - **Doesn’t explicitly cover non-deterministic/performance test quality:** The rubric doesn’t call out flakiness control, statistical validity, or environment sensitivity, which are central for Monte Carlo and performance tests in this repo (`tests/TestMonteCarloValidation.js`, `tests/TestMonteCarloHighVolatility*.js`, `tests/TestMoneyUnitOps.js`, `tests/TestMoneyMCPerformance.js`).
  - **Doesn’t distinguish UI unit vs e2e expectations:** The same rubric can be applied to Jest UI/unit tests and Playwright e2e specs, but it provides no guidance on what “good oracle” and “mutation resistance” look like for DOM-flow tests vs scenario-calculation tests (`tests/*.test.js`, `tests/*.spec.js`).
- **Recommended Actions:**
  - **Add “test archetype” guidance to Tier 1:** Explicitly describe how to score (and what to expect from) (a) single-behavior unit/scenario tests, (b) integration/regression baselines, (c) stochastic/statistical tests, and (d) perf/benchmark tests; optionally add an `archetype` field in the Tier 1 JSON output.
  - **Make tolerance/range philosophy explicit:** Add rubric notes on when ranges are appropriate (stochastic output, coarse integration checks) vs when they materially reduce mutation resistance, and recommend documenting the rationale for each tolerance/range.
  - **Recommend suite hygiene to improve rubric scores where intended:** Split broad “kitchen sink” files into smaller focused tests where practical (especially boundary suites), and replace “matches simulator output” magic numbers with expectations derived from rules/config or documented external sources; at minimum, keep comments consistent with asserted numbers (`tests/TestBasicTaxCalculation.js` is a clear candidate).

### Tier 2 Metadata Extraction Review

- **Document:** `docs/test-evaluation/tier2-metadata-extraction.md`
- **Category:** Test Documentation
- **Summary:** Defines a JSON schema for extracting per-test metadata (coverage, assertions, boundaries, regression info) intended to be aggregated across the suite for Tier 3 “battery analysis”.
- **Status Assessment: Relevant (used by the evaluation runner), but schema/prompt needs tightening to match the current test mix**
  - **Actively referenced by tooling:** The evaluation pipeline reads this prompt and uses it to generate `docs/test-evaluation/results/tier2/*-metadata.json` artifacts (`docs/test-evaluation/run-evaluation.js`).
  - **Core-test alignment is good:** Most custom core tests export `module.exports = { name, description, category, scenario, assertions, isCustomTest }`, which maps cleanly to the prompt’s requested fields (e.g., `testName` derived from `module.exports.name`) (`tests/TestBasicTaxCalculation.js`, `tests/TestFXConversions.js`).
  - **Jest/Playwright mismatch remains:** Jest `*.test.js` (and excluded Playwright `*.spec.js`) do not export the scenario-style structure the prompt assumes, so Tier 2 output for those files will be mostly `null`/`[]` or speculative (the runner currently includes Jest tests but excludes Playwright) (`docs/test-evaluation/run-evaluation.js`, `tests/Wizard.test.js`).
  - **JSON typing is ambiguous:** The schema example quotes booleans/numbers (e.g., `"hasRelocation": "<true/false>"`, `"eventCount": "<n>"`), which encourages invalid JSON types and makes aggregation harder downstream.
  - **Coverage examples are slightly stale:** Examples emphasize `ie/ar` and legacy asset labels (`index_funds`, `shares`) but the repo now includes US rules and increasingly uses dynamic `investmentTypes`, plus relocation currency fields (`currency`, `linkedCountry`) that would be valuable to capture explicitly (`src/core/config/tax-rules-us.json`, `src/core/Events.js`).
- **Recommended Actions:**
  - **Make types real JSON:** Update the prompt schema to use proper JSON booleans/numbers (no quotes) and explicitly state which fields must be `boolean`/`number`/`string|null` to make aggregation reliable.
  - **Add a `testType` discriminator:** Include a field like `"testType": "core|jest|e2e"` and document expected nullability/meaning for non-scenario tests; alternatively, scope Tier 2 to core scenario tests only and exclude `*.test.js` in the runner.
  - **Refresh examples to match today’s suite:** Extend country examples to include `us`, and add explicit capture guidance for relocation currency metadata (`currency`, `linkedCountry`, `linkedEventId`) and dynamic investment types where present.

### Tier 3 Battery Analysis Prompt Review

- **Document:** `docs/test-evaluation/tier3-battery-analysis.md`
- **Category:** Test Documentation
- **Summary:** Provides the Tier 3 prompt/template for producing a suite-level “battery analysis” report (coverage matrices, pyramid/boundary analysis, gaps/risks, recommendations, and an overall health score) from aggregated Tier 2 metadata.
- **Status Assessment: Mostly relevant, but needs scope/inputs updated to match the current test suite organization**
  - **Matches the intended workflow:** The Tier 3 prompt’s expected input (array of per-test metadata) aligns with the artifacts produced by the evaluation runner (`docs/test-evaluation/results/all-metadata.json`) and with the “aggregate then analyze” pipeline described in `docs/test-evaluation/README.md` (`docs/test-evaluation/run-evaluation.js`).
  - **“Complete test suite” is currently not accurate:** `tests/` contains three test types—core Node scenario tests (`tests/Test*.js`), Jest tests (`tests/*.test.js`), and Playwright specs (`tests/*.spec.js`)—but the evaluation runner explicitly excludes `*.spec.js`, so a Tier 3 report is only “complete” if you define scope as “core + (optionally) Jest, excluding e2e” (`docs/test-evaluation/run-evaluation.js`, `run-tests.sh`, `tests/`).
  - **Context assumptions are slightly stale:** The prompt’s country list mentions IE/AR; the repo also ships US tax rules and many tests now cover multi-currency/FX/PV/relocation semantics beyond the older IE/AR framing (`src/core/config/tax-rules-us.json`, `tests/`).
- **Recommended Actions:**
  - **Make scope explicit in the prompt:** Add a short “Scope” stanza instructing Tier 3 to state which test types were included (core/Jest/e2e) and to call out any exclusions (notably Playwright if `*.spec.js` aren’t part of the metadata set).
  - **Update the “Context” feature list:** Include items that are now first-class in the suite (e.g., `Money` multi-currency enforcement, `EconomicData`/PV/deflation, CSV round-trip persistence, relocation-linked currency metadata, dynamic `investmentTypes`/generic assets).
  - **Account for non-scenario tests:** If Jest tests remain in-scope, instruct Tier 3 how to interpret missing scenario-centric metadata (e.g., treat them as “UI unit” tests in the pyramid and exclude them from country/lifecycle matrices unless metadata is reliable).

### Economic Data Refactor Test Context Review

- **Document:** `docs/econ_data_refactor.md`
- **Category:** Test Documentation
- **Summary:** Explains the invariant-focused core test suite guarding `EconomicData.convert()` behavior and relocation/chart regressions during the EconomicData FX/CPI pipeline refactor.
- **Status Assessment: Mostly accurate, but status is stale**
  - The described intent (invariant-first tests covering conversion directionality, relocation continuity, and chart sanity) aligns with the current `EconomicData` implementation (`src/core/EconomicData.js`) and the simulator’s base-year anchored ledger conversion path (`convertNominal(..., baseYear: config.getSimulationStartYear())` in `src/core/Simulator.js`).
  - The “Current Status” section is out of date: `TestChartValues` now passes alongside `TestFXConversions` and `TestRelocationCurrency` (verified via `./run-tests.sh TestFXConversions TestRelocationCurrency TestChartValues`).
- **Recommended Actions:**
  - **Update status notes:** Mark `TestChartValues.js` as passing and record the baseline/tolerance choice that made it stable.
  - **Call out determinism requirements:** Add a note that `EconomicData.convert()` defaults `baseYear` to the wall-clock year, so call sites that need deterministic output should always pass an explicit `baseYear` (and consider tightening `Money.convertTo(...)` to pass it consistently).
  - **Clarify what “refactor complete” means:** If future phases include consuming rule-file time series (FX/CPI) rather than constant CPI evolution, state that explicitly as a next-phase goal so readers know what remains.

### Money Refactor Test Report Review

- **Document:** `docs/money-refactor-test-report.md`
- **Category:** Test Documentation
- **Summary:** Brief report claiming the Money refactor test suite is passing, listing stabilized tests and a Monte Carlo performance datapoint.
- **Status Assessment: Incomplete / Not reproducible**
  - The report contains placeholders (“XX”) for total/passed counts and does not record which `./run-tests.sh` commands were executed to produce the results.
  - The “Fixed Tests” list corresponds to real tests under `tests/` and the described changes match what’s in those files (timing stabilization/warmups in `TestMoneyUnitOps`, added null/type checks and tolerance relaxations in the others).
  - The Monte Carlo timing is provided without environment details or an explicit pass/fail threshold, so it’s not currently actionable as a regression guardrail.
- **Recommended Actions:**
  - **Replace placeholders with reproducible results:** Record the exact `./run-tests.sh` commands and paste actual totals (at minimum `./run-tests.sh -t core`, plus any targeted Money/perf tests) with date + Node version + machine.
  - **Document stability guardrails:** Note the jitter strategy used in `tests/TestMoneyUnitOps.js` (multi-trial median + CV threshold) and the explicit tolerances used in the currency/ledger assertions (`tests/TestMultiCurrencyCashFlows.js`, `tests/TestPropertyCurrencyPersistence.js`).
  - **Make performance a real contract:** If `TestMonteCarloValidation` is intended as a perf guard, record the threshold and where it’s enforced (test file + assertion), and update the report to explicitly state pass/fail against that threshold.

### Money Performance Baseline Review

- **Document:** `docs/money-performance-baseline.md`
- **Category:** Test Documentation
- **Summary:** Captures microbench + Monte Carlo timing figures from the Money refactor work and claims performance thresholds are met.
- **Status Assessment: Partially tracked (tests exist, but doc numbers drift)**
  - **Tracked via tests:** The repo contains explicit performance guardrails in `tests/TestMoneyPerformance.js` (overhead-based microbench/integration thresholds), `tests/TestMoneyUnitOps.js` (adaptive microbench with jitter CV check + catastrophic slowdown guards), and `tests/TestMoneyMCPerformance.js` (hard gate: avg ms/sim must be within +5% of a baseline constant referenced from this doc).
  - **Doc/test mismatch:** The doc labels `TestMoneyMCPerformance` as “100 MC runs × 5 years”, but the test currently runs `monteCarloRuns: 2500` and gates on average time per simulation (so totals in the doc won’t match what the test now executes).
  - **Not actually enforced:** The doc cites `TestMonteCarloValidation` timings as a benchmark, but `tests/TestMonteCarloValidation.js` is a statistical sanity test and does not enforce a performance threshold; those timing figures are therefore informational only.
  - **No persisted baseline artifacts:** `docs/baselines/` is empty, and there’s no automated workflow updating `docs/money-performance-baseline.md`, so the specific ms figures are not reliably “tracked” over time (only the test thresholds are).
- **Recommended Actions:**
  - **Clarify contract vs snapshot:** Update `docs/money-performance-baseline.md` to explicitly distinguish “enforced by tests” thresholds (and name the specific assertions/files) from machine-dependent timing snapshots.
  - **Make baseline reproducible:** Record capture metadata (date, commit, Node version, machine/CPU) and the command(s) used (e.g., `./run-tests.sh TestMoneyPerformance TestMoneyUnitOps TestMoneyMCPerformance`), and optionally persist results under `docs/baselines/<date>-money-perf.json` for diffing.
  - **Align doc with current harness:** Either (a) remove `TestMonteCarloValidation` from the “benchmarks” section, or (b) add an explicit perf assertion there if you want it to be part of the contract.

### Front-End UI Testing Guide Review

- **Document:** `docs/frontend-testing.md`
- **Category:** Test Documentation
- **Summary:** Playwright-focused guide for writing UI acceptance tests using `smartClick`, plus helpers for dismissing the welcome modal and opening the Events Wizard inside the `#app-frame` iframe.
- **Status Assessment: Mostly accurate, but outdated in runner details and current patterns**
  - The helper API described (`smartClick`, `waitForOverlayGone`, `openWizard`, `dismissWelcomeModal`) matches the current implementation in `src/frontend/web/utils/FrontendTestUtils.js`.
  - The “Running the Playwright suite” section is stale relative to `run-tests.sh`: the wrapper prints a per-spec summary line (e.g., `✅ PASSED: TestExpenseWizardNavigation`), not a single `✅ PASSED: PlaywrightTests` aggregate label, and it supports `--type e2e` filtering.
  - The boilerplate hard-codes `http://localhost:8080/#ifs` even though Playwright has a configured `baseURL` (`playwright.config.js`), and many specs now centralize setup via `tests/helpers/PlaywrightFinsim.js` (`loadSimulator`, `seedEvents`).
  - The doc recommends fixed `waitForTimeout(...)` sleeps for wizard blur/animation timing; the existing suite still uses sleeps, but this is a known source of flaky tests and should be positioned as a last resort.
  - The document implies Playwright specs live in `tests/`, but the repo also contains `src/frontend/web/utils/repro_currency_reset.spec.js` which is not executed by `run-tests.sh` (it only discovers `tests/*.spec.js`).
- **Recommended Actions:**
  - **Update runner instructions:** Align output examples and commands with `run-tests.sh` behavior, and document `./run-tests.sh --type e2e` (and `--runAll` if relevant to e2e skipping behavior).
  - **Prefer `baseURL` or shared helpers:** Update examples to use `await page.goto('/#ifs')` (leveraging `playwright.config.js`) or import `BASE_URL`/`loadSimulator` from `tests/helpers/PlaywrightFinsim.js` to avoid hard-coded hosts and duplicated init steps.
  - **Clarify spec discovery scope:** Note that `run-tests.sh` only runs `tests/*.spec.js`; keep repro specs out of `src/` or document that they must be run directly with `npx playwright test <path>`.
  - **Reduce fixed sleeps where possible:** Recommend waiting on state transitions (`expect(...).toBeVisible()`, `toHaveText()`, `toBeEnabled()`, `waitFor({ state: ... })`) and keeping `waitForTimeout` only where DOM/animation timing cannot be observed reliably.
  - **Tighten the boilerplate snippet:** Remove unused imports in the example and show the preferred welcome-modal handling path (`waitForOverlayGone(page)` or `dismissWelcomeModal(page, frame)`) consistent with current helpers.

## External Tool Notes

### AI Studio Notes Review

- **Document:** `docs/AIStudio.md`
- **Category:** External Tool Notes
- **Summary:** Currently contains a “podcast-style” narrated script prompt/outline describing FinSim for potential users; it does not describe any AI Studio tooling integration, setup steps, or a development workflow.
- **Status Assessment: Not applicable as “integration notes”; content appears misnamed/misfiled**
  - No repository workflow references AI Studio usage (tests are driven by `./run-tests.sh`, and agent/dev guidance is captured in `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`).
  - The document reads like a one-off content-generation prompt (similar in spirit to `docs/NotebookLM.md`), not actionable integration documentation.
- **Recommended Actions:**
  - **Rename/re-scope:** Rename to reflect its purpose (e.g., `docs/AIStudio-podcast-prompt.md`) and add a short header stating where/how to use it (paste into AI Studio, expected output format).
  - **Consolidate prompts:** Consider grouping prompt-only docs under a `docs/prompts/` folder (including `docs/NotebookLM.md`) to avoid implying they are part of the engineering toolchain.
  - **If AI Studio integration is desired:** Create a separate doc that covers the actual workflow (account/setup, model/features used, prompt templates, input artifacts, output storage location, and when/why to use it).

### NotebookLM Notes Review

- **Document:** `docs/NotebookLM.md`
- **Category:** External Tool Notes
- **Summary:** A set of “custom instructions” for generating a user-facing overview of the “Ireland Financial Simulator” in NotebookLM, with specific messaging constraints (tone, privacy/free/not affiliated, mortgages, deemed disposal, volatility-based success likelihood, scenario save/load).
- **Status Assessment: Applicable as a content prompt; not part of the development workflow**
  - The repo’s development workflow is driven by `./run-tests.sh` plus local static serving (`npx serve -s . -l 8080`) and agent guidance in `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`; there is no tooling integration or build step involving NotebookLM.
  - NotebookLM is referenced in the product surface: the landing page includes a “Listen” button titled “created with NotebookLM” and plays a bundled `assets/podcast.wav` (`src/frontend/web/landing/index.html`, `src/frontend/web/landing/script.js`), so the prompt remains relevant for marketing/audio-script generation.
  - The instructions still align with current product claims (scenario planning, mortgages, Irish tax context, deemed disposal/exit-tax concept, privacy), but they lack usage context (what inputs to feed NotebookLM, where outputs should live, and how to update the landing-page podcast/copy).
- **Recommended Actions:**
  - **Add minimal “how to use” header:** State intended use (e.g., generate a short landing-page/podcast script), expected output structure/length, and where to store outputs (e.g., transcript in `docs/` and audio asset under `src/frontend/web/assets/` if maintained).
  - **Align naming and scope:** Decide whether “Ireland Financial Simulator” is still the canonical public name (it is currently used in `src/frontend/web/landing/index.html`) or switch to “FinSim”; update the prompt wording accordingly.
  - **Refile for discoverability:** Move to a dedicated prompts area (e.g., `docs/prompts/NotebookLM.md`) or add an index so readers don’t assume it’s an engineering/tooling doc.

## Lessons & Retrospectives

### Multi-Country Assets – Lessons Learned Review

- **Document:** `docs/lessons-learned.md`
- **Category:** Lessons & Retrospective
- **Summary:** Postmortem on an early multi-country PV/FX attempt; emphasizes keeping PV “exact by construction” in core, keeping UI as a thin consumer of `*PV` fields, using `demo3.csv` + `TestChartValues.js` as guardrails, avoiding loader/index.html mistakes, and maintaining a tight feedback loop (tests + browser console) including Money hot-path performance discipline.
- **Status Assessment: Mostly applied**
  - **Core/UI separation is now enforced in code paths:** `PresentValueCalculator` + extracted aggregate calculators exist in core, and the web UI (charts and data table) prefers core-provided `*PV` fields rather than recomputing deflation in the UI (`src/core/PresentValueCalculator.js`, `src/core/DataAggregatesCalculator.js`, `src/frontend/web/components/ChartManager.js`, `src/frontend/web/components/TableManager.js`).
  - **Baselines-as-contract is reflected in tests:** demo scenarios and explicit baselines/tolerances exist (notably `docs/demo3.csv` + `tests/TestChartValues.js`), plus targeted PV/relocation regression coverage (`tests/TestCorePresentValueLayer.js`, `tests/TestPVMultiCountryDeflation.js`, `tests/TestRealEstatePVRelocation.js`, `tests/TestPensionPVRelocation.js`, `tests/TestInvestmentPVRelocation.js`).
  - **“Don’t break the loader” hygiene appears stable:** `src/frontend/web/ifs/index.html` has a single, ordered script list (no obvious duplicate core scripts) and uses cache-busting query params.
  - **Performance lesson is partially institutionalized:** microbench/perf regression tests exist (`tests/TestMoneyUnitOps.js`, `tests/TestMoneyPerformance.js`, `tests/TestMoneyMCPerformance.js`), but the doc’s “hot path” guidance is still a manual discipline rather than a lint/enforced style rule.
  - **Remaining gaps vs the document’s process intent:** UI paths still contain defensive fallbacks/try-catches and “log-and-continue” behavior (e.g., chart/table conversion guards) which can hide structural regressions that the lessons recommend surfacing early.
- **Recommended Actions:**
  - **Add a “change checklist” pointer:** In `docs/lessons-learned.md`, add a short, explicit checklist section pointing at the current canonical tests to run for PV/FX/UI work (e.g., `TestChartValues`, PV relocation tests, chart/table currency mode specs) and the specific `demo3.csv` manual sanity views to confirm.
  - **Make UI failures louder in debug mode:** Replace silent catches / “console.log and continue” with a consistent surfaced indicator (e.g., ErrorModal + “Charts disabled due to conversion error”) gated behind a debug flag so structural wiring problems aren’t masked.
  - **Keep chart/table currency-year semantics aligned:** Ensure both ChartManager and TableManager derive the FX year from the same source (`data.Year` when present; simulation-start-year in PV mode) to prevent drift between the “diagnostic table” and charts.
