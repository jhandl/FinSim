# Design Document: Unified Help Wizard (Test-Driven Refactoring)

## 1. Introduction

This document outlines a revised, test-driven plan to refactor the help wizard. The core goal remains to unify the `start()` and `startTour()` methods in `src/frontend/web/components/Wizard.js` into a single `start(options)` entry point.

Crucially, this plan now begins with establishing a modern frontend testing environment to create a safety net. This ensures that the refactoring process is verifiable at every stage and introduces no regressions, addressing the need for true UI and integration testing.

## 2. The Test-Driven Refactoring Plan

### Step 1: Establish a Jest & JSDOM Test Environment

Before modifying any application code, we will set up a professional testing framework.

1.  **Install Dependencies:** We will add `jest` and `jsdom` as development dependencies to `package.json`.
2.  **Configure Jest:** A `jest.config.js` file will be created in the root directory to configure Jest to use the JSDOM test environment. This will provide a virtual browser environment (with `window`, `document`, etc.) for our tests to run in Node.js.
3.  **Create Test File:** A new test file, `src/frontend/web/components/Wizard.test.js`, will be created. This file will contain all the tests for the `Wizard` component.

### Step 2: Build the Test Scaffolding (`Wizard.test.js`)

We will populate the new test file with a comprehensive suite of unit and integration tests that cover the wizard's current functionality. This suite will serve as our regression shield.

**Testing Strategy:**

*   **Mocking Dependencies:** We will use `jest.mock()` and `jest.spyOn()` to isolate the `Wizard` component.
    *   The `bubbles.js` library will be mocked so we can assert that it's being called with the correct steps and configuration, without actually rendering a tour.
    *   Dependencies like `WebUI.getInstance()` and its sub-managers (`eventAccordionManager`, `fileManager`) will be stubbed to provide controlled responses.
*   **DOM Simulation:** In each test, we will use JSDOM to create a mock HTML structure that includes the necessary elements the wizard interacts with (e.g., `#Events tbody`, accordion containers, header buttons).
*   **Unit Tests:**
    *   Test the `_getFilteredSteps(tourId, card)` method in isolation to ensure it correctly filters steps from a mock configuration based on tour type and card.
*   **Integration Tests:**
    *   **Full Tour:** Verify that calling the original `start()` method results in the mocked `bubbles.js` being initialized with the complete set of valid steps.
    *   **Quick/Mini Tours:** Verify that `startTour('quick')` and `startTour('mini', 'card-id')` result in the driver being called with the correctly filtered steps.
    *   **Accordion Logic:**
        *   Simulate a wizard step that targets an element inside a collapsed accordion.
        *   Assert that the `eventAccordionManager.toggleAccordionItem()` stub is called to open the accordion.
        *   Assert that it's called again to close the accordion when the tour moves to a step outside of it.
    *   **Backward Compatibility:** This entire suite, written against the *current* codebase, defines the required behavior and ensures backward compatibility.

### Step 3: Implement the Unified `start(options)` Method

With the test suite in place, we will create the new `async start(options = {})` method in `src/frontend/web/components/Wizard.js`.

### Step 4: Unify the `_runTour()` Helper

The `_runTour()` method will be refactored to become the single, unified engine for executing all tours, consolidating the logic from the original `start()` method.

### Step 5: Deprecate Old Methods via Wrappers

The original `start()` and `startTour()` methods will be refactored into thin wrappers that delegate to the new `start(options)` method.

### Step 6: Verify the Refactoring

The entire test suite from Step 2 will be run against the refactored code. **All tests must pass.** This provides strong, automated verification that the new implementation is functionally identical to the old one and meets all requirements.

### Step 7: Replace Internal Calls

A codebase search will be performed to find all internal calls to the old `start()` and `startTour()` methods, and they will be updated to use the new `start(options)` syntax.

### Step 8: Final Verification and Cleanup

The test suite will be run a final time. Upon success, the deprecated wrapper functions will be removed, leaving the `Wizard.js` component with a clean, single, public entry point for all tours.

## 3. Implementation Phases

### Phase 1: Test Environment Setup
*   **Task 1.1:** Add `jest` and `jsdom` as development dependencies to `package.json`.
*   **Task 1.2:** Run `npm install` to install the new dependencies.
*   **Task 1.3:** Create and configure `jest.config.js` for the JSDOM environment.
*   **Task 1.4:** Create the initial test file `src/frontend/web/components/Wizard.test.js`.

### Phase 2: Regression Test Suite Development
*   **Task 2.1:** Implement mocks for `bubbles.js` and stub dependencies like `WebUI`.
*   **Task 2.2:** Write unit tests for the `_getFilteredSteps()` method.
*   **Task 2.3:** Write integration tests for the existing `start()` and `startTour()` methods, covering all tour types and accordion interactions.
*   **Task 2.4:** Run the test suite against the current codebase to confirm it passes and establishes a valid baseline.

### Phase 3: Core Refactoring (Detailed)
*   **Task 3.1: Implement New `start(options)` Method Signature:**
    *   In `Wizard.js`, define the new public method `async start(options = {})`.
    *   Destructure the `options` object to extract `type`, `card`, and `startAtStep` with appropriate defaults.
    *   Add parameter validation logic (e.g., ensure `mini` tours have a `card`).

*   **Task 3.2: Consolidate Step Filtering and Preparation Logic:**
    *   Move the step-filtering logic from `startTour` (the call to `_getFilteredSteps`) into the new `start` method.
    *   Move the welcome modal replacement logic from the old `start` method into the new one, guarded by an `if (type === 'full')` check.
    *   Move the starting step calculation logic (based on `lastFocusedField`) from the old `start` method, guarded by an `if (type === 'help')` check.

*   **Task 3.3: Unify `driver.js` Configuration in `_runTour`:**
    *   Copy the entire `this.driver({...})` configuration object from the old `start` method.
    *   Merge it with the configuration in `_runTour`, creating a single, comprehensive configuration that handles all tour variations.
    *   Ensure all callbacks (`onNextClick`, `onPrevClick`, `onHighlighted`, `onDestroyStarted`) and settings (`showProgress`, `allowKeyboardControl`) are present and handled consistently.

*   **Task 3.4: Centralize Pre-Tour and Post-Tour Hooks:**
    *   Move all setup logic (e.g., `disableMobileKeyboard`, `freezeScroll`, `exposeHiddenElement`) from the old `start` method into the `_runTour` helper, so it runs for every tour.
    *   Ensure all cleanup logic in `finishTour` (e.g., `enableMobileKeyboard`, `unfreezeScroll`, `collapseAutoExpandedAccordion`) is robust enough to handle all tour types.

*   **Task 3.5: Implement Wrapper Methods for Backward Compatibility:**
    *   Temporarily rename the new, unified method to `startUnified(options)`.
    *   Empty the existing `start(fromStep)` method and replace its contents with a single call: `await this.startUnified({ type: 'help', startAtStep: fromStep });`.
    *   Empty the existing `startTour(tourId, card)` method and replace its contents with a single call: `await this.startUnified({ type: tourId, card: card });`.

*   **Task 3.6: Finalize Method Signature:**
    *   After verifying the wrappers work with the test suite, rename `startUnified` to `start`.

### Phase 4: Verification
*   **Task 4.1:** Run the complete test suite from Phase 2 against the refactored code.
*   **Task 4.2:** Debug and fix any regressions until all tests pass.

### Phase 5: Codebase Cleanup
*   **Task 5.1:** Search the codebase for all calls to the old `start()` and `startTour()` methods.
*   **Task 5.2:** Replace each legacy call with the new `start(options)` syntax.
*   **Task 5.3:** Run the test suite again to ensure the replacement was successful.
*   **Task 5.4:** Remove the now-unused wrapper methods from `Wizard.js`.