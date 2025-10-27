# Relocation Feature Implementation Plan

This document outlines the architectural plan for implementing the multi-country relocation feature in the FinSim application.

## Core Concepts

The implementation is based on a dynamic, event-driven approach. The simulation loop will track the user's country of residence on a year-by-year basis, determined by "Relocation" events in the timeline. A sophisticated "Relocation Impact Wizard" will manage all user-facing complexity when relocations are added, modified, or removed, ensuring the event timeline remains consistent.

All financial reporting will be normalized to a single "base currency" (determined by the home country) for clarity, with tooltips providing details on original currency values. Country-specific inflation rates will be applied to all calculations.

---

## Phase 1: Core Logic Enhancements

### 1.1. `Config.js`
-   **a.** Implement a mechanism to find all "Relocation" events in the scenario and pre-load the required `TaxRuleSet` JSON files for all involved countries before the simulation begins. This makes them available synchronously, which is critical for Monte Carlo runs.
-   **b.** Add a static exchange rate table to the configuration to handle currency conversions during the simulation's aggregation steps.

### 1.2. `Events.js`
-   **a.** Add a `currency` field to the `SimEvent` class. This field will be optional.
    -   If `null`, the event's currency is inferred from the country of residence for that year.
    -   If set (e.g., "EUR"), the event's value is "pegged" to that currency, regardless of the user's residence.
-   **b.** Add a `linkedEventId` field. This will be used by the Relocation Wizard to manage the relationship between events that have been split across a relocation boundary.

### 1.3. `Simulator.js`
-   **a.** In the main simulation loop, the simulator will track a `currentCountry` variable. This will be initialized with the "Home Country" parameter and updated dynamically as it encounters "Relocation" events in the timeline.
-   **b.** The `currentCountry` will be passed to `Taxman.js` at the start of each simulated year.
-   **c.** When processing monetary events, the simulator will use the event's pegged `currency` if it exists. Otherwise, it will default to the currency associated with the `currentCountry`.
-   **d.** The inflation logic will be modified to use the specific inflation rate of the relevant country for each event.
-   **e.** During the yearly data aggregation for the results table, all monetary values will be converted to the home country's base currency for consistent reporting.

### 1.4. `tax-rules-*.json` Schema
-   **a.** The schema for the tax rule files will be extended to include `currency` (e.g., "EUR") and a default `inflationRate` (e.g., 0.025).

---

## Phase 2: UI & Relocation Wizard Implementation

### 2.1. `index.html` (Initial Setup)
-   **a.** Add a "Home Country" dropdown to the "Starting Position" card. This will be populated from the available tax rule files. The default selection will be based on user IP geolocation. If no match is found, it will default to a "Select a country" placeholder.
-   **b.** The "Economy" card will be updated to dynamically add country-specific inflation rate inputs when a relocation event is present in the scenario.

### 2.2. `EventsTableManager.js`
-   **a.** Modify `createEventRow()` to add a currency badge next to the amount input.
-   **b.** The currency badge will display the inferred or pegged currency. It will include a dropdown menu allowing the user to select a specific currency from a list of all countries present in the scenario, which will "peg" the event by setting its `currency` property.

### 2.3. `EventAccordionManager.js`
-   **a.** The `renderItemDetails()` method will be updated as necessary to include the same currency badge and dropdown functionality in the expanded accordion view.

### 2.4. `EventWizardManager.js` & `events-wizard.yml`
-   **a.** A new "Relocation" event type will be added to the event creation dropdowns.
-   **b.** A new, multi-step "Relocation Impact Wizard" will be defined in `events-wizard.yml`.
-   **c.** This wizard will be triggered whenever a "Relocation" event is added, modified, or deleted. It will be a modal, all-or-nothing operation.
-   **d.** The wizard will feature a new `contentType: 'impactAnalysis'`, which the `EventWizardManager` will render as a special summary screen. This screen will present clear, actionable choices for each impacted event:
    -   **Split Event**: For events that straddle the relocation date.
    -   **Update Event**: For events that are displaced into a new currency zone.
    -   **Keep Event As-Is**: To peg the event to its original currency.
    -   **Delete Half**: To remove one part of a split event.
    -   **Re-join Events**: To merge previously split events if a relocation is moved or deleted.

### 2.5. Premium Feature Integration
-   **a.** The "Relocation" event type will be visually disabled in the UI for non-premium users, with a tooltip explaining the feature. The core logic will be present for all users to ensure a single codebase.

---

## Phase 3: Data Presentation

### 3.1. Data Table
-   **a.** The final simulation data table will be updated to display all monetary values in the home country's base currency for consistency.

### 3.2. Tooltips
-   **a.** Tooltips will be implemented on the data table cells. When a user hovers over a value that was converted from a different currency, the tooltip will show the original amount in its local currency (e.g., "Original: 50,000,000 ARS").