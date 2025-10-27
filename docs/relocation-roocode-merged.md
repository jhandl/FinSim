# Relocation Feature: Final Implementation Plan

This document outlines the final, synthesized architectural plan for implementing the multi-country relocation feature. It incorporates the best ideas from multiple design documents while adhering to the core constraint that the events table remains the single source of truth.

## Core Architecture

The implementation is founded on a dynamic, event-driven model. A special "Relocation" event type (`MV-*`) will signal a change in the user's country of residence. The simulation loop will derive the active country for any given year by finding the most recent `MV-*` event. There is no separate, explicit residency timeline data structure.

All user-facing complexity is managed by a sophisticated **Relocation Impact Wizard**. This wizard is a modal, all-or-nothing operation that triggers whenever a relocation event is changed. It uses a "delta-only" approach to identify newly impacted events, proposes intelligent resolutions (including re-joining previously split events), and blocks the simulation until all conflicts are resolved by the user.

---

## Phase 1: Core Logic & Services

### 1.1. `Config.js` & Services
-   **a.** Implement a mechanism to find all relocation events (`MV-*`) at the start of a simulation and pre-load all required `TaxRuleSet` files into memory. This ensures they are available synchronously for performance-critical operations like Monte Carlo runs.
-   **b.** Create a `CurrencyConversionService`. This central service will manage a static exchange rate table, handle country-specific inflation data, and provide Purchasing Power Parity (PPP) hints for the wizard's smart suggestions.

### 1.2. `Events.js`
-   **a.** Add an optional `currency` field to the `SimEvent` class. If this field is set (e.g., "EUR"), the event's monetary value is "pegged" to that currency. If it is `null`, the currency is inferred from the active country of residence for that year.
-   **b.** Add a `linkedEventId` field. This will be used by the Impact Wizard to track the relationship between events that have been split or re-joined across relocation boundaries.

### 1.3. `Simulator.js`
-   **a.** The main simulation loop will track a `currentCountry` variable, which is updated dynamically as it processes `MV-*` events chronologically.
-   **b.** The active `currentCountry` will be passed to `Taxman.js` at the start of each simulated year.
-   **c.** The simulator will leverage the `CurrencyConversionService` to apply the correct country-specific inflation rate to each event and to convert all monetary values to a single base currency for reporting purposes.

### 1.4. `tax-rules-*.json` Schema
-   **a.** The schema for tax rule files will be extended to include `currency` (e.g., "EUR"), a default `inflationRate`, and a `pensionSystem` object detailing the country's pension rules (e.g., support for private payroll, contribution limits).

---

## Phase 2: UI & The Relocation Impact Wizard

### 2.1. Initial Setup & UI Elements
-   **a.** A "Home Country" selector will be added to the "Starting Position" card, with its default value suggested by IP geolocation.
-   **b.** The "Economy" card will dynamically display separate inflation rate inputs for each country involved in the simulation.
-   **c.** Amount fields in the event table and accordion will feature a currency badge. This badge will display the event's currency and contain a dropdown to allow the user to peg the event to a specific currency.

### 2.2. Relocation Impact Wizard (Trigger & Logic)
-   **a.** A new "Relocation" (`MV-*`) event type will be created.
-   **b.** The wizard will be triggered whenever a relocation event is added, modified, or deleted.
-   **c.** The wizard will perform a **delta-only analysis**, identifying only the events newly impacted by the change and proposing to re-join previously split events if they are no longer separated by a relocation.

### 2.3. Relocation Wizard (User Workflow - Progressive Disclosure)
-   **a.** **Level 1 (Impact Overview):** The wizard will first present a simple summary of the impacts (e.g., "Your move to Argentina affects 3 events").
-   **b.** **Level 2 (Guided Resolution):** For each impacted event, it will explain the specific issue and present clear resolution options (Split, Update, Keep As-Is, etc.).
-   **c.** **Level 3 (Smart Suggestions):** The wizard will provide intelligent defaults. For example, when splitting a salary, it will use PPP hints from the `CurrencyConversionService` to suggest a realistic salary in the new country. It will also adjust pension-related events based on the destination country's `pensionSystem` rules.

### 2.4. Premium Feature Integration
-   **a.** The "Relocation" event type and the associated Impact Wizard will be gated as a premium feature. The UI elements will be disabled for non-premium users.

---

## Phase 3: Data Presentation & Visualization

### 3.1. Data Table
-   **a.** The data table will default to a **"Natural Currency Mode"**, where each monetary value is displayed in its original (pegged or inferred) currency.
-   **b.** A scenario-level **display-currency toggle** will be added, allowing the user to convert the entire table to a single, unified reporting currency on demand.
-   **c.** **Visual residency bands** will be rendered in the background of the table to clearly delineate the time periods spent in different countries.

### 3.2. Charts
-   **a.** The charts will also feature the **display-currency selector**, allowing for consistent data visualization.
-   **b.** Vertical lines or annotations will be added to charts to mark the points in time where relocations occur.

### 3.3. Persistence
-   **a.** User decisions from the Impact Wizard (e.g., how an event was split) will be stored in `localStorage`, keyed by a fingerprint of the scenario. This enables the "delta-only" review functionality.