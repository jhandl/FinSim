# FinSim - Tax System Architecture (v2.0)

## 1. Introduction

This document outlines the architecture for a new, flexible, and extensible tax configuration system for FinSim. The goal is to replace the current hardcoded, Ireland-specific tax logic with a data-driven engine that can model the tax system of any country by reading a JSON configuration file.

## 2. Core Concepts

*   **Data-Driven Logic:** All tax calculations will be driven by parameters from a JSON configuration file. The core `Revenue.js` engine will contain the logic framework, but the specific rates, brackets, and rules will be externalized.
*   **Country-Specific Configurations:** Each country will have its own standalone JSON configuration file (e.g., `tax-config-ie-2.0.json`).
*   **Tax Context:** The `Person` object will manage their history of tax residencies. For any given year, the `Simulator` can retrieve a `TaxContext` object that describes the tax rules to be applied, including handling for complex transition years between countries.
*   **Configuration Hub:** The `Config.js` component will act as a central hub for loading, caching, and providing access to `TaxRuleSet` objects for any country.

## 3. Component Design

### 3.1. `TaxRuleSet.js` (New Component)

*   A new class, `TaxRuleSet`, will be created in `src/core/TaxRuleSet.js`.
*   **Responsibility:** This class is a data object that parses and validates a specific country's tax JSON. It provides safe getter methods to access tax parameters (e.g., `getIncomeTaxBrackets()`, `getCapitalGainsExemption()`), handling defaults for optional fields. It has no dependencies on the simulator.

### 3.2. `Config.js` (Refactored)

*   **Responsibility:** `Config.js` will be refactored to manage the loading of the new tax configuration files. It will handle versioning and cache loaded `TaxRuleSet` objects to avoid redundant parsing.
*   It will expose a new method, `getTaxRuleSet(countryCode)`, which the `Revenue` engine will use.
*   The old, hardcoded configuration values will be removed incrementally as the `Revenue` engine is refactored.

### 3.3. `Revenue.js` (Heavily Refactored)

*   `Revenue.js` will be transformed into a generic tax calculation engine.
*   **Configuration:** Its `reset()` method will be updated to accept a `TaxContext` object for the year. Inside `reset()`, it will use the context to fetch the appropriate `TaxRuleSet` from `Config.js` and store it as an instance property (e.g., `this.ruleset`).
*   **Calculation Functions:** The calculation functions (`computeIT`, `computeUSC`, etc.) will be refactored to use the `this.ruleset` property. They will no longer require a tax configuration object to be passed to them directly.
*   **Couple & Joint Calculations:** The refactoring will carefully preserve the existing logic for handling married couples. The methods will continue to access `this.person1Ref` and `this.person2Ref` and apply joint rules (e.g., `jointFilingAllowed`, `jointBracketMultiplier`) as defined in the active `TaxRuleSet`.

### 3.4. `Person.js` (Refactored)

*   The simple `taxResidency` property will be replaced by a more robust system for managing residency history.
*   A new method, `getTaxContext(year)`, will be added. This method will analyze the person's residency events and return a `TaxContext` object for the given year. This object will specify the primary country of residence and any special rules for transition years (e.g., `{ primary: "IE", secondary: "UK", rule: "proportional" }`).

### 3.5. `Simulator.js` (Refactored)

*   The main simulation loop will be updated. Before processing each year's finances, it will:
    1.  Call `person.getTaxContext(year)` for each person to determine the tax situation.
    2.  Pass this `TaxContext` to the `revenue.reset()` method.
*   The `Simulator` will handle a new `ChangeTaxResidency` event, which will update the residency history within the `Person` object.

## 4. Data Flow (Revised)

```mermaid
graph TD
    subgraph "Setup Phase"
        A[tax-config-ie-2.0.json] --> B(Config.js);
        B -- Loads & Caches --> C{TaxRuleSet Cache};
    end

    subgraph "Yearly Simulation Loop"
        D[Simulator.js] -- "What's the tax situation for this year?" --> E[Person.js];
        E -- "Here is the TaxContext" --> D;
        D -- "Reset with this TaxContext" --> F[Revenue.js];
        F -- "I need the rules for 'IE'" --> B;
        B -- "Here is the 'IE' TaxRuleSet" --> F;
        F -- "Calculate taxes for Person(s)" --> F;
        F -- Returns Tax Owed --> D;
        D -- Updates Financial State --> E;
    end