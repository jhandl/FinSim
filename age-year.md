# Plan: Age vs. Year and Couple-Mode Clarity

This document outlines the plan to address ambiguity in age-related fields in couple's mode and to introduce the flexibility of using years instead of ages for certain inputs.

## 1. Problem Statement

Currently, the simulator has two main issues related to user inputs for age and time:

1.  **Ambiguity in Couple's Mode:** In a two-person simulation, fields like `fromAge` and `toAge` in the events table are ambiguous. It's not clear whether they refer to Person 1's age or Person 2's age.
2.  **Inflexibility of Age-Only Inputs:** Many events are more naturally planned by year (e.g., buying a house in 2030) rather than by age. The current system only allows age-based inputs for most events, forcing users to do manual calculations. Fields like marriage year and children's birth years are already in years, creating an inconsistency.

## 2. Investigation & Analysis

A thorough review of the codebase, particularly `src/core/Simulator.js` and `src/core/Person.js`, has revealed a critical distinction in how ages are used:

*   **Person-Specific Lifecycle Calculations (Handled Correctly):** The simulation correctly uses `person2.age` for individual lifecycle calculations. This includes triggering their personal retirement, determining their eligibility for the state pension, and calculating their age-based pension contribution rates. The underlying data model is sound.

*   **General Event Timeline (The Usability Issue):** The main event processing loop is driven exclusively by `person1.age`. The `fromAge` and `toAge` values for *all* events in the events table (including those for Person 2 like salary or expenses) are checked against Person 1's age. This is the root of the ambiguity and the specific problem this plan solves.

*   **UI Constraints**: The events table UI, managed by `EventsTableManager.js`, is compact. Adding new controls to each row would clutter the interface significantly, which is why the proposed toggle is placed on the section header.

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

### Phase 1: UI Infrastructure
1. **Update HTML Structure** (`src/frontend/web/ifs/index.html`)
   - Add the `[ Age | Year ]` toggle next to the `<h2>Events</h2>` header
   - Structure: `<h2>Events <span class="age-year-toggle">[ <span class="toggle-option active">Age</span> | <span class="toggle-option">Year</span> ]</span></h2>`
   - Assign IDs to the "From Age" and "To Age" table headers for easy manipulation

2. **Add CSS Styling** (`src/frontend/web/ifs/css/simulator.css`)
   - Style the `.age-year-toggle` to match the existing single/couple toggle design
   - Ensure proper spacing and visual consistency with existing UI patterns

3. **Initialize Toggle State** (`src/frontend/web/components/EventsTableManager.js`)
   - Add a property to track current mode: `this.ageYearMode = 'age'`
   - Create method `setupAgeYearToggle()` to handle click events on toggle elements

### Phase 2: Toggle Functionality
4. **Implement Toggle Click Handler** (`src/frontend/web/components/EventsTableManager.js`)
   - Create method `handleAgeYearToggle(newMode)` that:
     - Updates `this.ageYearMode` property
     - Updates visual state of toggle (active/inactive classes)
     - Calls `updateTableHeaders()` and `updateInputPlaceholders()`

5. **Update Table Headers Dynamically**
   - Create method `updateTableHeaders()` that changes:
     - "From Age" ↔ "From Year" 
     - "To Age" ↔ "To Year"

6. **Update Input Placeholders**
   - Create method `updateInputPlaceholders()` that changes all age input placeholders to "YYYY" in year mode

### Phase 3: Help System Integration
7. **Modify Help Configuration** (`src/frontend/web/assets/help.yml`)
   - Replace static "age" references with `{{age_or_year}}` placeholder in relevant help entries
   - Target fields: `EventFromAge`, `EventToAge`, and related descriptions

8. **Update Wizard Component** (`src/frontend/web/components/Wizard.js`)
   - Modify help text processing to replace `{{age_or_year}}` with current mode
   - Add method `replaceAgeYearPlaceholders(helpText)` 
   - Integrate with existing link replacement logic

### Phase 4: Data Conversion Logic
9. **Implement Year-to-Age Conversion** (`src/frontend/UIManager.js`)
   - Modify `readEvents()` method to detect current toggle state
   - Add conversion logic that:
     - Calculates birth years for both persons
     - Converts year inputs to ages based on event type ('SI' vs 'SI2')
     - Returns standard age-based events array to simulator

10. **Add Conversion Helper Functions**
    - `calculateBirthYear(startingAge, currentYear)`
    - `convertEventYearToAge(eventYear, birthYear)`
    - `determineEventPerson(eventType)` - returns 'P1' or 'P2'

### Phase 5: Testing & Validation
11. **Create Unit Tests**
    - Test year-to-age conversion logic with various scenarios
    - Test help text placeholder replacement
    - Test toggle state management

12. **Integration Testing**
    - Verify complete workflow: toggle → input → conversion → simulation
    - Test edge cases (invalid years, missing data)
    - Validate that existing age-based workflows remain unchanged

### Phase 6: Enhanced User Experience
13. **Implement Hover Tooltips** (`src/frontend/web/components/EventsTableManager.js` and `src/frontend/web/WebUI.js`)
    - Add event listeners for `mouseenter` and `mouseleave` on age/year input fields in events table
    - Extend to parameter age fields: `StartingAge`, `P2StartingAge`, `RetirementAge`, `P2RetirementAge`, `TargetAge`
    - Create method `showAlternativeTooltip(inputElement, currentValue, fieldType)` that:
      - Calculates the alternative value (age ↔ year)
      - For events: determines which person the event applies to based on event type
      - For parameters: uses field-specific person assignment (P1, P2, or global)
      - Shows a semi-transparent tooltip with the conversion

14. **Create Tooltip Styling** (`src/frontend/web/ifs/css/simulator.css`)
    - Add CSS for `.conversion-tooltip` class
    - Style: semi-transparent background, small font, positioned near cursor
    - Ensure tooltip doesn't interfere with input interaction
    - Works consistently across both events table and parameter sections

15. **Add Conversion Helper Methods**
    - `getAlternativeValue(inputValue, fieldType, personId)` - returns the converted value
    - `getPersonForField(fieldId)` - determines person for parameter fields (P1/P2/global)
    - `getPersonForEvent(eventType)` - determines if event applies to P1 or P2
    - `formatTooltipText(alternativeValue, alternativeMode, personId)` - formats display text
    - `getCurrentYear()` - gets reference year for conversions

16. **Handle Dynamic Updates**
    - Update tooltips when toggle mode changes (events table only)
    - Ensure tooltips work for both existing and newly added event rows
    - Handle parameter field tooltips independently (always show year equivalent)
    - Clear tooltips when input loses focus

## 5. Risks and Mitigations

*   **Incorrect Conversion Logic**: The primary risk lies in errors within the year-to-age calculation.
    *   **Mitigation**: Develop a robust suite of unit tests specifically for this conversion function to cover various start ages, age differences, and event years.
*   **User Confusion**: Mixing modes could be confusing.
    *   **Mitigation**: By using a single, table-wide toggle, we enforce consistency and make the current input mode clear.
*   **Tooltip Performance**: Hover tooltips could impact performance if not optimized.
    *   **Mitigation**: Use efficient event delegation and avoid unnecessary DOM queries.

## 6. Progress Tracking

### Completed Tasks
- [x] 1. Update HTML Structure
- [x] 2. Add CSS Styling  
- [x] 3. Initialize Toggle State
- [x] 4. Implement Toggle Click Handler
- [x] 5. Update Table Headers Dynamically
- [x] 6. Update Input Placeholders
- [ ] 7. Modify Help Configuration
- [ ] 8. Update Wizard Component
- [ ] 9. Implement Year-to-Age Conversion
- [ ] 10. Add Conversion Helper Functions
- [ ] 11. Create Unit Tests
- [ ] 12. Integration Testing
- [ ] 13. Implement Hover Tooltips
- [ ] 14. Create Tooltip Styling
- [ ] 15. Add Conversion Helper Methods
- [ ] 16. Handle Dynamic Updates

### Current Status
**In Progress** - Step 6 completed: Input placeholders now show "YYYY" in year mode for clear user guidance

### Notes
- Implementation should follow the existing code patterns and style
- Each step should be tested individually before proceeding to the next
- Maintain backward compatibility with existing age-based inputs
- Hover tooltips should be subtle and non-intrusive to maintain clean UX 