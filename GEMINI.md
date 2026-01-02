# FinSim Agent Onboarding Guide

## 1. Project Overview

FinSim is a personal finance simulator and educational sandbox for running "what‑if" scenarios.

The core philosophy is to provide a private, powerful, and transparent tool for financial planning. Due to its origins, the core logic must maintain compatibility with the Google Apps Script (GAS) environment.

A generic tax engine powers calculations via country rule files (Ireland provided by default).

The system is entirely hosted in GitHub Pages as a static website.

## 2. Key Features

*   **Detailed Financial Simulation:** Models income, expenses, investments, and taxes over a lifetime.
*   **Generic Tax Engine:** Country‑specific rule files (default: IE) loaded via `TaxRuleSet` for PAYE/PRSI/USC, CGT vs Exit Tax, pension rules, and investment type definitions.
*   **Scenario Planning:** Users can define custom life events (e.g., salary changes, property purchases, market crashes) to see their impact.
*   **Dual Event Management Interface:** Users can choose between table and accordion views for event management, with seamless switching and real-time synchronization. Both views support direct editing, wizard-based creation, and comprehensive event lifecycle management.
*   **Monte Carlo Analysis:** In addition to deterministic projections, the simulator can run thousands of simulations with market volatility to assess the probability of success.
*   **Data Persistence:** Scenarios can be saved to and loaded from local CSV files.

## 3. Project Architecture

### 3.1. General Design

FinSim employs a modular architecture that separates the core simulation logic from the user interface. This is a critical design feature, as the core engine must run in different environments: the modern web browser and the legacy Google Apps Script environment.

The simulation is event-driven and proceeds chronologically, year by year. At the start of each year, the simulator processes all relevant financial events, calculates income and taxes, and updates the state of all financial assets.

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
        N[EventWizardManager.js]
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

*   **[`Simulator.js`](src/core/Simulator.js:1):** The main orchestrator of the simulation.
*   **[`Person.js`](src/core/Person.js:1):** Represents an individual in the simulation.
*   **[`Config.js`](src/core/Config.js:1):** Loads and holds all configuration parameters.
*   **[`Events.js`](src/core/Events.js:1):** Defines the `SimEvent` class.
*   **[`Taxman.js`](src/core/Taxman.js:1):** Responsible for all tax calculations (formerly `Revenue.js`).
*   **[`TaxRuleSet.js`](src/core/TaxRuleSet.js:1):** Wraps country tax JSON and exposes getters consumed by `Taxman`.
*   **[`Equities.js`](src/core/Equities.js:1):** The base class for core investment assets (`IndexFunds`, `Shares`, `Pension`).
*   **[`RealEstate.js`](src/core/RealEstate.js:1):** Manages real estate properties and mortgages.
*   **[`Money.js`](src/core/Money.js:1):** Currency-aware value wrapper enforcing explicit currency tracking throughout calculations.
*   **[`EconomicData.js`](src/core/EconomicData.js:1):** Exposes CPI, FX rates, and PPP profiles from tax rules for inflation and currency conversions.
*   **[`PresentValueCalculator.js`](src/core/PresentValueCalculator.js:1):** Computes present values using country-specific inflation rates.
*   **[`InflationService.js`](src/core/InflationService.js:1):** Provides inflation data and deflation factor calculations for multi-currency scenarios.
*   **[`DataAggregatesCalculator.js`](src/core/DataAggregatesCalculator.js:1):** Calculates aggregate statistics from simulation data for charts and summaries.
*   **[`Attribution.js`](src/core/Attribution.js:1):** Primitive used to capture and aggregate per‑source contributions (income, taxes, gains).
*   **[`AttributionManager.js`](src/core/AttributionManager.js:1):** Orchestrates yearly attribution tracking used across `Taxman` and the simulator.
*   **[`InvestmentTypeFactory.js`](src/core/InvestmentTypeFactory.js:1):** Builds generic investment assets from tax‑rule `investmentTypes`, enabling dynamic per‑type assets beyond the legacy two (Funds/Shares).

#### Frontend

*   **[`UIManager.js`](src/frontend/UIManager.js:1):** An abstraction layer that sits between the core simulator and the UI, allowing the core to remain UI-agnostic.
*   **[`WebUI.js`](src/frontend/web/WebUI.js:1):** The web-based implementation of the UI. It manages all the DOM elements and orchestrates the various frontend components.
*   **Event Management:** The web UI provides a sophisticated dual-view event management system with integrated components:
    *   **[`EventsTableManager.js`](src/frontend/web/components/EventsTableManager.js:1):** Manages the traditional table view for events and serves as the primary data source. Provides view toggle functionality, sorting, validation, and direct table editing capabilities.
    *   **[`EventAccordionManager.js`](src/frontend/web/components/EventAccordionManager.js:1):** Provides a mobile-friendly collapsible accordion view with in-situ editing capabilities. Features include real-time field validation, event type changes that trigger wizards with pre-populated data, automatic expansion of new events, and bidirectional synchronization with the table view.
    *   **[`EventsWizard.js`](src/frontend/web/components/EventsWizard.js:1):** Event-specific wizard logic for creating and editing events with step-by-step guidance.
    *   **[`WizardManager.js`](src/frontend/web/components/WizardManager.js:1):** Orchestrates wizard lifecycle, handles pre-population of existing event data, complex event types (like property purchases with mortgages), and integration with both table and accordion views.
*   **Relocation Components:**
    *   **[`RelocationImpactDetector.js`](src/frontend/web/components/RelocationImpactDetector.js:1):** Flags relocation-sensitive events that may need user attention after country changes.
    *   **[`RelocationImpactAssistant.js`](src/frontend/web/components/RelocationImpactAssistant.js:1):** Provides inline resolution panels for guided fixes (split, peg, link, convert) for affected events.

#### Utils & Help Systems

*   **[`src/core/Utils.js`](src/core/Utils.js:1):** Core utility functions, including `serializeSimulation()` and `deserializeSimulation()`.
*   **[`src/frontend/web/utils/`](src/frontend/web/utils/):** Various utility classes for the web UI.
*   **[`ValidationUtils.js`](src/frontend/web/utils/ValidationUtils.js:1):** Handles validation of user inputs across the application.
*   **[`Wizard.js`](src/frontend/web/components/Wizard.js:1):** Provides a guided tour of the application's features.

### 3.3. Generic Tax System

- **Rule files:** `src/core/config/tax-rules-<country>.json` (IE included).
- **Initialization:** `Config.initialize(ui)` must be called at app start. It follows `latestVersion` pointers in `finsim-X.XX.json`, persists the selected version, and preloads the IE tax ruleset.
- **Loader:** `Config.getTaxRuleSet(code)` asynchronously loads and caches a `TaxRuleSet`; the preloaded IE ruleset is available synchronously via `Config.getCachedTaxRuleSet('ie')`.
- **API:** `TaxRuleSet` exposes income tax bands/credits and age exemptions, PRSI by age, USC brackets (including reduced age/income bands), CGT annual exemption and rate, pension rules (lump‑sum bands, contribution limits, drawdown), and investment types.
- **Usage:** `Taxman` consumes the active ruleset to compute income, social contributions, additional taxes, and capital gains/exit taxes with full attribution. Investment types in the rules control whether assets are taxed under Exit Tax or CGT. `InvestmentTypeFactory` converts `investmentTypes` into generic assets for simulation and UI (including dynamic per‑type income/capital columns in the data table when more than two types exist).

### 3.4. Event Management (Table + Accordion + Wizard)

The event management system is a core feature that provides users with flexible ways to create, edit, and manage financial events:

#### Dual View Architecture
*   **Table View:** Traditional spreadsheet-like interface for power users who prefer direct data entry and bulk editing
*   **Accordion View:** Mobile-friendly collapsible interface optimized for touch interaction and smaller screens
*   **Seamless Switching:** Users can toggle between views instantly with automatic data synchronization

#### In-Situ Editing Capabilities
*   **Real-time Validation:** Field validation occurs as users type, with immediate feedback for errors and warnings
*   **Event Type Changes:** Changing an event type in accordion view triggers a wizard pre-populated with existing data
*   **Bidirectional Sync:** Changes in either view immediately reflect in the other view
*   **Field Visibility Logic:** Context-aware field display based on event type (e.g., hiding irrelevant fields)

#### Wizard Integration
*   **Event Creation:** Step-by-step guided creation of complex events with validation at each step
*   **Event Editing:** Existing events can be modified through wizards that preserve current values
*   **Complex Event Types:** Handles sophisticated scenarios like property purchases with automatic mortgage creation
*   **Pre-population:** Wizards can be launched with existing event data for modification workflows

#### Advanced Features
*   **Automatic Sorting:** Events are automatically sorted by age/year with smooth animations
*   **Event Highlighting:** New events are highlighted with pulse animations for better user feedback
*   **Responsive Design:** Both views adapt to different screen sizes and orientations
*   **Keyboard Navigation:** Full keyboard support for accessibility and power user workflows

### 3.5. Data Management and Persistence

User scenarios are persisted as CSV files, handled by the `serializeSimulation()` and `deserializeSimulation()` functions in [`src/core/Utils.js`](src/core/Utils.js:1) and managed on the frontend by [`FileManager.js`](src/frontend/web/components/FileManager.js:1). Deserialization supports legacy field names (e.g., ETF/Trust) and infers modes when missing.

Tax rules and application configuration are loaded at startup by `Config.initialize(ui)`, which preloads the IE ruleset for synchronous access.

### 3.6. Relocation System

The premium relocation system (see [`docs/relocation-system.md`](docs/relocation-system.md)) lets users model multi-country lives with runtime residency changes, natural currency handling, and cross-border tax rules while staying invisible when disabled. Core logic extends `SimEvent` with optional `currency`, `linkedCountry`, and `linkedEventId` fields so the simulator can peg amounts, link inflation sources, and track split events without breaking backward compatibility.

- **Economic data pipeline:** `EconomicData.js` exposes CPI/FX/PPP profiles embedded in tax rules to convert and inflate values across currencies and years.
- **Impact detection + resolution:** `RelocationImpactDetector.js` flags relocation-sensitive events, driving inline resolution panels in both table and accordion views for guided fixes (split, peg, link, convert) instead of a modal-first workflow.
- **Cross-border taxation:** `Taxman` derives the active country from relocation events, handles trailing residency rules (e.g., IE’s three-year tail), and loads the matching `TaxRuleSet` on demand.
- **UI affordances:** Currency selectors appear inline across editors and charts, warning badges surface outstanding issues, and the starting country picker is required only when the feature is enabled.
- **Persistence:** A CSV meta column records currency/country metadata so relocation-enhanced scenarios round-trip cleanly while older files remain compatible.

## 4. Test Framework

The project uses a custom Node.js testing framework for core simulation logic, plus Jest for UI/unit tests and Playwright e2e tests. All are orchestrated by the top‑level `run-tests.sh` script.

To run the tests all you need to do is run './run-tests.sh <params>' <list-of-test-names>. No need to call a shell to run it. Just run the command directly. The <params> are optional and can be any of the following:

- -h --help: show help
- -t --type <type>: run all tests of type <type>. <type> can be core, jest, e2e or all.
- --list: list all tests

### 4.1. Kinds of Tests

1.  **Core Regression/Validation (Node):** Define a scenario and assert outputs or implement custom validation (see files in [`tests/`](tests/)).
2.  **Jest UI/Unit Tests:** Browser‑like tests using JSDOM (e.g., [`Wizard.test.js`](tests/Wizard.test.js)).
3.  **Playwright E2E:** Headed/headless browser tests under [`tests/`](tests/) with `*.spec.js`.

### 4.2. How to Add a Test

All tests are run using the top‑level [`run-tests.sh`](run-tests.sh) script.
1.  Create a new test file in [`tests/`](tests/).
2.  For core Node tests, you can use existing custom tests as a template (e.g., `tests/TestTaxRuleSet.js`). For UI tests, add `*.test.js` for Jest or `*.spec.js` for Playwright.
3.  Run a specific test (by base name) with `./run-tests.sh <TestName>`.

### 4.3. UI Testing

If there is no UI jest tests in the tests directory for the feature you want to test, ask the user to test them manually and offer to write a test as well. For manual testing, no server needs to be run. The server is always running and available for testing in the user's browser.

**Do not** attempt to start a server, open a browser, or interact with the UI programmatically. When a UI change is ready, you should ask the user to test it.

## 5. Important Guidelines

*   **JavaScript Compatibility:** Core files (in [`src/core/`](src/core/)) **must** remain compatible with the Google Apps Script JavaScript environment. This means **no modern JS features like `import`/`export` modules or classes in some contexts**. All core code should be written in a way that can be copy-pasted into a `.gs` file and run.
*   **Event View Compatibility:** Any changes to the event structure or how events are handled must be tested against both event views (table and accordion) and the wizard system. The table view serves as the single source of truth, with the accordion view providing a synchronized alternative interface. Changes must maintain bidirectional synchronization and preserve all editing capabilities across views.
*   **Configuration over Hardcoding:** Any constants, especially those related to tax rules, should be placed in the `tax-rules-<country code>.json` file, or if they're not tax-related and are general simulation settings, in the 'finsim-X.XX.json' file.
*   **Write Tests:** Any new feature or bug fix for the core logic should be accompanied by a corresponding test. 
*   **UI Testing:** If you rely on the user for UI testing and validation, remember that the user is always running a local server. Don't start a new server and don't open browser windows.
*   **Cache busting:** If you make any change to a javascript or css file, you must update the cache-busting parameter at the end of that file's url in the 'SYSTEM UTILITIES' section in ./src/frontend/web/ifs/index.html (or at the beginning of that file if it's a css change) and set it to the current date (plus a version number if the date is the same), so users always get the updated version. This is VERY IMPORTANT.
*   **Code Semantics Strictness:** The code must assume required configuration and helper functions exist. Avoid defensive checks or default fallbacks for missing infrastructure—treat missing configuration as a hard error.

## 6. Local Setup

Follow these steps on a fresh machine right after cloning the repository to get the FinSim web app running locally:

```bash
npm install
npx serve -s . -l 8080
```

Open http://localhost:8080 in your browser. The root `index.html` loads the SPA and you should see the FinSim interface. For testing, `npx playwright install` once before running e2e tests, and `./run-tests.sh` to run all tests, `./run-tests.sh <test-name>` to run a specific test, or `./run-tests.sh -t code` to run all core tests. 
