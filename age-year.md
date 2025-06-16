# Plan: Age vs. Year and Couple-Mode Clarity

This document outlines the plan to address ambiguity in age-related fields in couple's mode and to introduce the flexibility of using years instead of ages for certain inputs.

## 1. Problem Statement

Currently, the simulator has two main issues related to user inputs for age and time:

1.  **Ambiguity in Couple's Mode:** In a two-person simulation, fields like `fromAge` and `toAge` in the events table are ambiguous. It's not clear whether they refer to Person 1's age or Person 2's age.
2.  **Inflexibility of Age-Only Inputs:** Many events are more naturally planned by year (e.g., buying a house in 2030) rather than by age. The current system only allows age-based inputs for most events, forcing users to do manual calculations. Fields like marriage year and children's birth years are already in years, creating an inconsistency.

## 2. Investigation & Analysis

A thorough review of the codebase, particularly `src/core/Simulator.js`, `src/core/Person.js`, and `src/frontend/web/components/EventsTableManager.js`, has revealed the following:

*   **Simulation Driver is P1's Age**: The main simulation loop is `while (person1.age < params.targetAge)`. This confirms that the simulation's timeline is exclusively driven by Person 1's age. All event triggers (`fromAge`, `toAge`) are evaluated against `person1.age`.
*   **Correct Data Model**: The parameter model correctly includes `p2StartingAge` and `p2RetirementAge`, and the `Person` objects are initialized with their own respective retirement ages. The underlying data structure is sound.
*   **Root of Ambiguity**: Because the event loop is tied to Person 1's age, any event for Person 2 must have its `fromAge`/`toAge` set relative to when Person 1 will be that age. This is the core of the usability problem.
*   **UI Constraints**: The events table UI, managed by `EventsTableManager.js`, is compact. Adding new controls to each row (e.g., a toggle for every age input) would clutter the interface significantly.

## 3. Proposed Solution

The solution introduces the core feature of allowing year-based inputs by implementing a new UI toggle and updating the help system accordingly.

*   **UI/UX Change - Section Header Toggle**:
    *   To ensure UI consistency and avoid cluttering the table, a toggle mechanism identical to the "Single/Couple" selector will be placed next to the main "Events" section header.
    *   It will look like `Events [ Age | Year ]`, allowing the user to switch the input mode for the entire table.
    *   When the mode changes, the "From" and "To" column headers will update (e.g., "From Age" to "From Year"), the from and to input fields will switch from showing the age to showing the year, and the input placeholders will change to guide the user (e.g., "YYYY").

*   **Dynamic Help Text**:
    *   The help text system will be updated to support the new toggle.
    *   In `help.yml`, the descriptions for fields like `EventFromAge` will use a placeholder (e.g., `The {{age_or_year}} at which the event starts.`).
    *   The `Wizard.js` component will be modified to dynamically substitute the `{{age_or_year}}` placeholder with the currently active mode ("age" or "year") before displaying the help popover.

*   **Logic Change - UI-Layer Conversion**:
    *   The core simulation logic in `Simulator.js` **will not be changed**.
    *   The conversion from years to ages will be handled in the front-end (`UIManager.js`) before the simulation runs.
    *   **Conversion Process:**
        1.  Determine the "birth year" for each person (`currentYear - startingAge`).
        2.  If in "Year" mode, read the event year inputs.
        3.  Based on the event type ('SI' vs 'SI2'), convert the input `year` to the correct `age` for the corresponding person.
        4.  Pass the standard events array, now containing only ages, to the simulator.

*   **Visual Plan**:

    ```mermaid
    graph TD
        subgraph "UI Interaction"
            A["User sees section header: <br/> 'Events [ <b>Age</b> | Year ]'"] -- Clicks 'Year' --> B;
            B["Header changes to: <br/> 'Events [ Age | <b>Year</b> ]' <br/> Input placeholders in table change to 'YYYY'"];
            B -- Clicks 'Age' --> A;
        end

        subgraph "Data Flow on 'Run Simulation'"
            C{Input Mode?}
            C -- "Year" --> D["JS reads Year inputs (e.g., 2030)"];
            D --> E["JS converts Year to Age <br/> (e.g., 2030 -> 40)"];
            C -- "Age" --> F["JS reads Age inputs (e.g., 40)"];
            E --> G["Clean 'events' array (with only ages) <br/> is sent to Simulator"];
            F --> G;
        end
    ```

## 4. Implementation Plan

1.  **Modify UI**: Add the `[ Age | Year ]` toggle next to the `<h2>Events</h2>` header in the HTML. Add the necessary CSS to style it like the single/couple toggle.
2.  **Implement Toggle Logic**: Write JavaScript to manage the toggle state and update the table headers and input placeholders.
3.  **Update Help System**:
    *   Modify `help.yml` to use a placeholder (e.g., `{{age_or_year}}`) in relevant help descriptions.
    *   Update `Wizard.js` to replace this placeholder with the active mode ("age" or "year") when showing help.
4.  **Implement Conversion Logic**: In `UIManager.js`'s `readEvents` function, add the pre-processing step to detect the toggle's state and perform the year-to-age conversion.
5.  **Test**: Add unit tests for both the conversion logic and the dynamic help text replacement.

## 5. Risks and Mitigations

*   **Incorrect Conversion Logic**: The primary risk lies in errors within the year-to-age calculation.
    *   **Mitigation**: Develop a robust suite of unit tests specifically for this conversion function to cover various start ages, age differences, and event years.
*   **User Confusion**: Mixing modes could be confusing.
    *   **Mitigation**: By using a single, table-wide toggle, we enforce consistency and make the current input mode clear. 