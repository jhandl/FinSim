# FinSim Agent Onboarding Guide

This is a consolidated agent guide for FinSim.

## 1. Project Overview

FinSim is a personal finance simulator and educational sandbox for running "what‑if" scenarios.

The core philosophy is to provide a private, powerful, and transparent tool for financial planning. Due to its origins, the core logic must maintain compatibility with the Google Apps Script (GAS) environment.

A generic tax engine powers calculations via country rule files (Ireland provided by default).

The system is entirely hosted in GitHub Pages as a static website, with scenarios loading/saving as local CSV.

Core goals and constraints:

*   **Private + transparent:** runs as a static site; scenarios persist locally via CSV.
*   **Config-driven:** country behavior should live in JSON rule files, not hardcoded branches.
*   **Cross-environment core:** core logic must stay Google Apps Script compatible.
*   **Deterministic by default:** only Monte Carlo introduces randomness.

## 2. Key Features

*   **Detailed Financial Simulation:** Models income, expenses, investments, and taxes over a lifetime.
*   **Single or Couple Mode:** Toggle between individual and couple scenarios with separate ages, pensions, and state pension settings (P1/P2) while sharing household cashflow.
*   **Generic Tax Engine:** Country‑specific rule files (default: IE) loaded via `TaxRuleSet` for PAYE/PRSI/USC, CGT vs Exit Tax, pension rules, and investment type definitions.
*   **Scenario Planning:** Users can define custom life events (e.g., salary changes, property purchases, market crashes) to see their impact.
*   **Dual Event Management Interface:** Users can choose between table and accordion views for event management, with seamless switching and real-time synchronization. Both views support direct editing, wizard-based creation, and comprehensive event lifecycle management.
*   **Monte Carlo Analysis:** In addition to deterministic projections, the simulator can run thousands of simulations with market volatility to assess the probability of success.
*   **Economy Mode Toggle:** UI control switches deterministic vs Monte Carlo, showing volatility fields and enabling Monte Carlo only when volatility values are present.
*   **Present Value Display:** A UI toggle deflates chart and data table values into today's terms using the core PV layer.
*   **Data Table Visualization Presets:** Pinch-point highlighting overlays cashflow health/failure/survival color maps on the data table using per-run results.
*   **Data Persistence:** Scenarios can be saved to and loaded from local CSV files (including legacy compatibility).

## 3. Project Architecture

### 3.1. General Design

FinSim employs a modular architecture that separates the core simulation logic from the user interface. This is a critical design feature, as the core engine must run in different environments: the modern web browser and the legacy Google Apps Script environment.

The simulation is event-driven and proceeds chronologically, year by year. At the start of each year, the simulator processes all relevant financial events, calculates income and taxes, and updates the state of all financial assets.

Initialization & configuration:

*   `Config.initialize(ui)` must be called at startup. It loads the newest simulator config by following `latestVersion` pointers (in `finsim-X.XX.json`) and persists the selected version.
*   Country tax rules are loaded and cached as `TaxRuleSet` objects.
*   `EconomicData` aggregates CPI/FX/PPP anchors from loaded rulesets and provides synchronous conversion utilities used by both core and UI.

Scenario model:

*   A scenario consists of **parameters** (ages, inflation, growth rates, priorities, etc.) and a timeline of typed **events** (`SimEvent`).
*   Events include basic fields like `type/id/name/amount/fromAge/toAge/rate/match`, plus relocation-aware fields like `currency`, `linkedCountry`, and `linkedEventId`.
*   Scenarios round-trip via `serializeSimulation()` / `deserializeSimulation()` in `src/core/Utils.js` (including legacy field names and inferred modes when missing).
*   Core parameters also include `simulation_mode` (`single|couple`) and `economy_mode` (`deterministic|montecarlo`), which drive P2 support and volatility runs.

```mermaid
graph TD
    subgraph "UI Environments"
        direction LR
        A[WebUI]
        B[Google Apps Script UI (Legacy)]
    end

    subgraph "Frontend Abstraction"
        C[UIManager.js]
    end

    subgraph "Core Engine (GAS Compatible)"
        direction TB
        D[Simulator.js] --> E{Core Components};
        E --> F[Taxman.js];
        E --> G[Person.js];
        E --> H[Equities.js];
        E --> I[RealEstate.js];
        E --> J[Config.js];
        D -- Populates --> K[Data Sheet];
    end
    
    subgraph "Web Frontend Components"
        L[EventsTableManager.js]
        M[EventAccordionManager.js]
        N[WizardManager.js + EventsWizard.js]
        O[ChartManager.js]
    end

    A --> C;
    B --> C;
    C --> D;
    K --> O;
    A --> L;
    A --> M;
    A --> N;
```

### 3.2. Components

#### Core

*   **[`Simulator.js`](src/core/Simulator.js:1):** The main orchestrator of the simulation (year loop + currency consolidation).
*   **[`Person.js`](src/core/Person.js:1):** Represents an individual in the simulation (including per-country pension pots via `getPensionForCountry()` and `getPensionPortfolio()`).
*   **[`Config.js`](src/core/Config.js:1):** Loads and holds all configuration parameters, version chaining, and tax ruleset loading/caching.
*   **[`Events.js`](src/core/Events.js:1):** Defines the `SimEvent` class.
*   **[`Taxman.js`](src/core/Taxman.js:1):** Responsible for all tax calculations (formerly `Revenue.js`).
*   **[`TaxRuleSet.js`](src/core/TaxRuleSet.js:1):** Wraps country tax JSON and exposes getters consumed by `Taxman`.
*   **[`Equities.js`](src/core/Equities.js:1):** The base class for core investment assets (`IndexFunds`, `Shares`, `Pension`).
*   **[`RealEstate.js`](src/core/RealEstate.js:1):** Manages real estate properties and mortgages.
*   **[`Money.js`](src/core/Money.js:1):** Currency-aware value wrapper enforcing explicit currency tracking throughout calculations; both `Money.create()` (struct) and `new Money()` (instance) exist, and hot paths should stay lightweight.
*   **[`EconomicData.js`](src/core/EconomicData.js:1):** Exposes CPI, FX rates, and PPP profiles from tax rules for inflation and currency conversions (including `fxMode: 'constant' | 'evolution' | 'ppp' | 'reversion'`; default is evolution for coherent ledger math, PPP is typically used for analytics/suggestions).
*   **[`PresentValueCalculator.js`](src/core/PresentValueCalculator.js:1):** Computes present values using country-specific inflation rates (PV semantics can be subtle under relocation/multi-currency).
*   **[`InflationService.js`](src/core/InflationService.js:1):** Provides inflation data and deflation factor calculations for multi-currency scenarios.
*   **[`DataAggregatesCalculator.js`](src/core/DataAggregatesCalculator.js:1):** Calculates aggregate statistics from simulation data for charts and summaries.
*   **[`Attribution.js`](src/core/Attribution.js:1):** Primitive used to capture and aggregate per‑source contributions (income, taxes, gains).
*   **[`AttributionManager.js`](src/core/AttributionManager.js:1):** Orchestrates yearly attribution tracking used across `Taxman` and the simulator.
*   **[`InvestmentTypeFactory.js`](src/core/InvestmentTypeFactory.js:1):** Builds generic investment assets from tax‑rule `investmentTypes`, enabling dynamic per‑type assets beyond the legacy two (Funds/Shares).

#### Investment Management

*   **Hybrid rebalancing:** Mix-enabled assets (fixed or glide path) rebalance annually after surplus allocation. Surplus cash is used first (tax-free), then minimal selling corrects remaining drift (taxable via `Taxman.declareInvestmentGains()`), with a 0.1% tolerance.

#### Frontend

*   **[`UIManager.js`](src/frontend/UIManager.js:1):** An abstraction layer that sits between the core simulator and the UI, allowing the core to remain UI-agnostic.
*   **[`WebUI.js`](src/frontend/web/WebUI.js:1):** The web-based implementation of the UI. It manages all the DOM elements and orchestrates the various frontend components.
*   **Event Management (Table + Accordion):**
    *   **[`EventsTableManager.js`](src/frontend/web/components/EventsTableManager.js:1):** Manages the table view for events and serves as the canonical data source. Provides view toggles, sorting, validation, and direct editing.
    *   **[`EventAccordionManager.js`](src/frontend/web/components/EventAccordionManager.js:1):** Provides a collapsible accordion view with in-situ editing and bidirectional sync with the table view.
    *   **[`EventSummaryRenderer.js`](src/frontend/web/components/EventSummaryRenderer.js:1):** Defines accordion summaries, detail markup, and selectors used by the accordion editor.
*   **Data + Visualization:**
    *   **[`TableManager.js`](src/frontend/web/components/TableManager.js:1):** Builds the data table, handles natural/unified currency conversion, and applies present-value mode from the UI toggle.
    *   **[`ChartManager.js`](src/frontend/web/components/ChartManager.js:1):** Renders charts and respects present-value mode without mutating cached nominal data.
    *   **[`PinchPointVisualizer.js`](src/frontend/web/components/PinchPointVisualizer.js:1):** Computes per-row colors from Monte Carlo per-run results for cashflow/failure/survival presets.
*   **Events Wizard (guided event creation/editing):**
    *   **[`EventsWizard.js`](src/frontend/web/components/EventsWizard.js:1):** Event-domain wrapper for wizard-driven create/edit flows (including special cases like mortgages creating a second event).
    *   **[`WizardManager.js`](src/frontend/web/components/WizardManager.js:1):** Modal lifecycle, navigation, and condition gating for wizards.
    *   **[`WizardRenderer.js`](src/frontend/web/components/WizardRenderer.js:1):** Generic rendering for wizard step types and validation mechanics.
    *   **Configuration:** `src/frontend/web/assets/events-wizard.yml` (root key `EventWizards`).
*   **Help/Tour Wizard (not event creation):**
    *   **[`Wizard.js`](src/frontend/web/components/Wizard.js:1):** The guided tour / contextual field help system.
    *   **Configuration:** `src/frontend/web/assets/help.yml` (`WelcomeTabs` + `WizardSteps`), rendered via `ContentRenderer.js`.

#### Utils & Supporting Systems

*   **[`src/core/Utils.js`](src/core/Utils.js:1):** Core utility functions, including `serializeSimulation()` and `deserializeSimulation()`.
*   **[`src/frontend/web/components/FileManager.js`](src/frontend/web/components/FileManager.js:1):** Web-side CSV import/export (including legacy compatibility).
*   **Dynamic table sections:** Table columns can include ruleset-driven dynamic sections (see `DynamicSectionsConfig.js`, `DynamicSectionsManager.js`, `DynamicSectionManager.js`, and `TableManager.js`) and should be verified both pre-simulation (empty table layout) and post-simulation (alignment).
*   **Pinch-point rendering:** The web UI stores per-run results from the core and uses `PinchPointVisualizer` to color data table rows for visualization presets.

### 3.3. Generic Tax System

*   **Rule files:** `src/core/config/tax-rules-<country>.json` (IE included).
*   **Initialization:** `Config.initialize(ui)` follows `latestVersion` pointers in `finsim-X.XX.json`, persists the selected version, and preloads the IE tax ruleset.
*   **Loading/caching:** `Config.getTaxRuleSet(code)` loads and caches a `TaxRuleSet`; the preloaded IE ruleset is available synchronously via `Config.getCachedTaxRuleSet('ie')`.
*   **API:** `TaxRuleSet` exposes income tax bands/credits and age exemptions, PRSI by age, USC brackets (including reduced age/income bands), CGT annual exemption and rate, pension rules (lump‑sum bands, contribution limits, drawdown), and investment type definitions.
*   **Usage:** `Taxman` consumes the active ruleset to compute income tax, social contributions, additional taxes, and capital gains/exit taxes with attribution. Investment types determine whether assets are taxed under Exit Tax or CGT, and can drive dynamic per-type assets/columns.

### 3.4. Event Management (Table + Accordion + Wizard)

The event management system is a core feature that provides users with flexible ways to create, edit, and manage financial events.

**Key rule:** the table view is the single source of truth. Accordion and wizards must round-trip through it (no second “events model” should be introduced elsewhere).

#### Dual View Architecture

*   **Table View:** Traditional spreadsheet-like interface for bulk editing and power workflows.
*   **Accordion View:** Mobile-friendly collapsible interface optimized for touch and smaller screens.
*   **Seamless Switching:** Users can toggle between views instantly with automatic data synchronization.

#### In-Situ Editing Capabilities

*   **Real-time Validation:** Field validation occurs as users type, with immediate feedback for errors and warnings.
*   **Event Type Changes:** Changing an event type in accordion view can trigger a wizard pre-populated with existing data.
*   **Bidirectional Sync:** Changes in either view immediately reflect in the other view.
*   **Field Visibility Logic:** Context-aware field display based on event type (e.g., hiding irrelevant fields).

#### Wizard Integration

*   **Event Creation:** Step-by-step guided creation of complex events with validation at each step.
*   **Event Editing:** Existing events can be modified through wizards that preserve current values.
*   **Complex Event Types:** Handles scenarios like property purchases with automatic mortgage creation.
*   **Pre-population:** Wizards can be launched with existing event data for modification workflows.

### 3.5. Data Management and Persistence

User scenarios are persisted as CSV files, handled by the `serializeSimulation()` and `deserializeSimulation()` functions in [`src/core/Utils.js`](src/core/Utils.js:1) and managed on the frontend by [`FileManager.js`](src/frontend/web/components/FileManager.js:1). Deserialization supports legacy field names and infers modes when missing.

Tax rules and application configuration are loaded at startup by `Config.initialize(ui)`, which preloads the IE ruleset for synchronous access.

### 3.6. Relocation System

The relocation system (see [`docs/relocation-system.md`](docs/relocation-system.md)) lets users model multi-country lives with runtime residency changes, natural currency handling, and cross-border tax rules, while staying effectively invisible when disabled (no “premium teaser” affordances).

Relocation is feature-gated by `Config.getInstance().isRelocationEnabled()`.

Core logic extends `SimEvent` with optional `currency`, `linkedCountry`, and `linkedEventId` fields so the simulator can peg amounts, link inflation sources, and track split events without breaking backward compatibility.

Key traits:

*   **Country timeline:** Derived from `MV-*` events.
*   **Economic context:** `linkedCountry` can drive the inflation/currency basis for an event.
*   **Split chains:** `linkedEventId` supports traceable event splits and guided resolution flows.
*   **Cross-border taxation:** `Taxman` derives the active country from relocation events, can apply trailing residency rules (e.g., IE’s three-year tail), and loads the matching `TaxRuleSet` on demand.

Relocation UI support:

*   Relocation-affected events are annotated with `event.relocationImpact` for display and resolution flows.
*   **Impact detection:** [`RelocationImpactDetector.js`](src/frontend/web/components/RelocationImpactDetector.js:1) flags relocation-sensitive events.
*   **Inline resolution:** [`RelocationImpactAssistant.js`](src/frontend/web/components/RelocationImpactAssistant.js:1) provides guided fixes (split, peg, link, convert) in both table and accordion flows.

## 4. Test Framework

The project uses a custom Node.js testing framework for core simulation logic, plus Jest for UI/unit tests and Playwright e2e tests. All are orchestrated by the top‑level `run-tests.sh` script.

To run tests, use `./run-tests.sh` directly. Useful options:

*   `./run-tests.sh --list`
*   `./run-tests.sh -t core|jest|e2e|all`
*   `./run-tests.sh TestBasicSalaryTax`

### 4.1. Kinds of Tests

1.  **Core Regression/Validation (Node):** Define a scenario and assert outputs or implement custom validation (see files in [`tests/`](tests/)).
2.  **Jest UI/Unit Tests:** Browser‑like tests using JSDOM (e.g., [`Wizard.test.js`](tests/Wizard.test.js)).
3.  **Playwright E2E:** Headed/headless browser tests under [`tests/`](tests/) with `*.spec.js`.

### 4.2. How to Add a Test

All tests are run using the top‑level [`run-tests.sh`](run-tests.sh) script.

1.  Create a new test file in [`tests/`](tests/).
2.  Conventions:
    *   Core tests: `tests/Test*.js`
    *   Jest tests: `tests/*.test.js`
    *   Playwright tests: `tests/*.spec.js`
3.  Run a specific test (by base name) with `./run-tests.sh <TestName>`.

Helpful utilities:

*   `src/core/TestUtils.js`
*   `src/frontend/web/utils/FrontendTestUtils.js`

### 4.3. UI Testing

If there is no UI test for the feature you are changing, ask the user to test manually and offer to add a test as well.

**Do not** attempt to start a server, open a browser, or interact with the UI programmatically. When a UI change is ready, ask the user to test it in their already-running local server/browser.

## 5. Important Guidelines

*   **JavaScript Compatibility (Core):** Files under [`src/core/`](src/core/) must remain compatible with the Google Apps Script JavaScript environment:
    *   No `import` / `export`.
    *   Avoid language features that won’t run in GAS.
    *   Code should work when copy-pasted into `.gs` files.
*   **Code simplicity (golden rule):** Use the absolute minimum amount of code possible:
    *   Trigger existing code paths rather than duplicating logic.
    *   Prefer 1–3 line shims over new helper layers.
    *   Avoid speculative abstractions; only extract after two or more concrete uses.
    *   Avoid defensive fallbacks for missing infrastructure—missing config should throw.
    *   Avoid unnecessary `try/catch`; never use empty catch blocks.
*   **Configuration over hardcoding:** Put constants in the right config files:
    *   Tax/country constants → `src/core/config/tax-rules-<country>.json`
    *   General simulator settings/versioning → `src/core/config/finsim-X.XX.json`
*   **Hard rule: no defensive scaffolding.** You must not add guard clauses, optional checks, or fallback logic to paper over missing config/state. Assume required globals (e.g., `Config`) are initialized; if not, let it throw. Do not add "safe defaults," "just in case" checks, or protective `try/catch` unless the user explicitly asks for it. This is mandatory, not a suggestion.
*   **Events table is the source of truth:** Table is canonical; accordion/wizards must round-trip through it.
*   **Write tests for core changes:** Any core logic change should include a focused test under `tests/` and be run via `./run-tests.sh`.
*   **Cache busting (web assets):** If you change any JS or CSS used by the web app, update cache-busting so browsers don’t serve stale assets:
    *   **JS changes:** update the `?v=...` parameter in `src/frontend/web/ifs/index.html` (SYSTEM UTILITIES script tags), typically to the current date (and add a suffix if updating more than once per day).
    *   **CSS changes:** update the version parameter at the beginning of that CSS file (when present) and/or the corresponding `?v=...` in `src/frontend/web/ifs/index.html` if the CSS is linked with a cache-buster.

### 5.1. Debugging Protocol (when fixing a bug)

Use this strict sequence to avoid “fixing the wrong thing” unless the user explicitly tells you to fix the issue directly (remember he's the boss, not you):

1.  Read and understand the relevant code path(s).
2.  Formulate 5–7 root-cause hypotheses.
3.  Ask which hypotheses to pursue (wait for confirmation when collaborating interactively).
4.  Add minimal temporary logging with a `[DBG]` prefix (single-line logs).
5.  Prove the root cause via logs.
6.  Fix, then validate with logs/tests.
7.  If the fix didn't work, remove the logs and start over.
8.  If more logging is needed, first clean up no-longer-needed logs.
9.  Remove all debug logging only after confirmation from the user.

UI-specific debugging:

*   Prefer temporary CSS visual cues (borders/overlays) over timing hacks.
*   Avoid delay-based fixes; use explicit hooks/observers.
*   Mobile: `phonitor.js` debug overlay exists for on-device visibility.

### 5.2. Planning & Documentation Etiquette

When asked to produce a plan (vs implement):

*   Write the plan to a `.md` file.
*   Don’t start implementing until explicitly told to implement.
*   Keep the plan checklisted and easy to review.

After significant changes:

*   Update the canonical `AGENTS.md` if architecture/assumptions changed.
*   Keep the docs focused on “current state” rather than historical narrative. I can't stress this enough: NEVER include any commentary on the past of any document. Whoever will use these documents does not care that they evolved over time. All these documents exist solely to guide an implementation, not to record history! You're not a historian, you're not a story teller. You're a coding agent.

## 6. Local Setup

Follow these steps on a fresh machine right after cloning the repository to get the FinSim web app running locally:

```bash
npm install
npx serve -s . -l 8080
```

The root `index.html` loads the SPA and you should see the FinSim interface.

Helpful development commands:

*   One-time e2e dependency: `npx playwright install`
*   Lint a file: `npx eslint <file>`
*   Test helpers: `npm run test:watch`, `npm run test:coverage`

## 7. Quick Reference

### 7.1. Repository Layout (what lives where)

*   Core engine (browser globals, GAS-oriented): `src/core/`
*   Frontend abstraction + UIs: `src/frontend/`
*   Web UI components: `src/frontend/web/components/`
*   Tests (core + Jest + Playwright via wrapper): `tests/`

### 7.2. “Where do I change X?” Map

*   New/changed country tax logic: `src/core/config/tax-rules-*.json` + `src/core/TaxRuleSet.js` + `src/core/Taxman.js` (+ tests)
*   FX/PPP/conversion behavior: `src/core/EconomicData.js` + call sites (`src/core/Simulator.js`, unified-currency chart/table paths)
*   Event fields / editing UX: `src/frontend/web/components/EventsTableManager.js` (truth) + accordion/wizard adapters
*   Scenario load/save: `src/core/Utils.js` + `src/frontend/web/components/FileManager.js`
*   PV semantics: `src/core/PresentValueCalculator.js` (+ tests)

### 7.3. Suggested “Important Files” Reading Order

If you’re new to the repo, these give fast, accurate context:

*   `src/core/Simulator.js` (year loop + currency consolidation)
*   `src/core/Config.js` (versioning + tax rules loading)
*   `src/core/Taxman.js` and `src/core/TaxRuleSet.js` (tax engine interface)
*   `src/frontend/web/components/EventsTableManager.js` (events are the core UX surface)
*   `src/frontend/web/components/EventAccordionManager.js` + `src/frontend/web/components/EventSummaryRenderer.js` (alternate view + editing)
*   `src/frontend/web/components/Wizard.js` + `src/frontend/web/assets/help.yml` (help/tours/field help)
*   `src/frontend/web/components/WizardManager.js` + `src/frontend/web/components/WizardRenderer.js` + `src/frontend/web/components/EventsWizard.js` + `src/frontend/web/assets/events-wizard.yml` (events wizard)
*   `src/frontend/web/components/ChartManager.js` and `src/frontend/web/components/TableManager.js` (rendering + unified-currency modes)
