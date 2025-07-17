# Implementation Plan

- [ ] 1. Analyze complete E event lifecycle
  - Analyze complete E event lifecycle from UI creation through simulation processing, documenting field visibility patterns and toAge handling for one-off expenses

- [ ] 2. Create integration test for field visibility
  - Create integration test that verifies E shows rate/toAge fields while E1 hides them in both table and accordion views before making any code changes

- [ ] 3. Add E1 event type to event type dropdown system
  - Update EventsTableManager.js to include "One-off Expense" option in event type dropdown
  - Add E1 to the outflow event classification in isOutflow() method
  - Ensure proper color coding and categorization for E1 events
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 4. Create one-off expense wizard configuration
  - Add new E1 wizard configuration to events-wizard.yml
  - Define wizard steps for name, amount, and timing input
  - Configure proper field validation and input types
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Implement field visibility and validation for E1 events
  - Update EventsTableManager field visibility logic to handle E1 event type
  - Set toAge equal to fromAge automatically for E1 events
  - Set rate field to empty (uses inflation) for E1 events
  - Hide match field for E1 events as it's not applicable
  - _Requirements: 1.2, 5.1, 5.2_

- [ ] 4. Update event summary rendering for one-off expenses
  - Modify EventSummaryRenderer.formatPeriod() to detect one-off expenses (fromAge === toAge)
  - Change period display from "from age X" to "at age X" for one-off expenses
  - Update generateSummary() method to handle E1 event type properly
  - _Requirements: 2.2, 2.3_

- [ ] 5. Configure accordion "Add Event" button for one-off expenses
  - Verify E1 events display correctly in accordion view
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 6. Update table view integration for E1 events
  - Ensure E1 events display correctly in table view with proper field visibility
  - Implement proper validation for E1 event fields
  - Add E1 to event type classification methods in EventsTableManager
  - _Requirements: 2.1, 6.1, 6.2, 6.3_

- [ ] 7. Implement simulation engine support for E1 events
  - Update Events.js or simulation logic to handle E1 event type
  - Ensure E1 events are applied only once at the specified age
  - Verify E1 events reduce available funds appropriately in simulation
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 8. Update serialization and deserialization for E1 events
  - Modify deserializeSimulation in Utils.js to convert "E" events with fromAge == toAge to "E1" events
  - Ensure backward compatibility with existing saved scenarios
  - Add validation to confirm proper conversion during loading
  - _Requirements: 7.1, 7.2_

- [ ] 9. Add comprehensive validation for one-off expenses
  - Implement amount validation (positive numbers only)
  - Implement age validation (within simulation range)
  - Ensure toAge equals fromAge for E1 events
  - Add proper error messages for validation failures
  - _Requirements: 1.1, 1.2, 4.2, 6.1_

- [ ] 10. Create unit tests for one-off expense functionality
  - Write tests for E1 event creation through wizard
  - Write tests for field validation and error handling
  - Write tests for summary generation with "at age X" format
  - Write tests for event type classification and dropdown display
  - _Requirements: 1.1, 2.2, 3.1, 6.1_

- [ ] 11. Integration testing and UI verification
  - Test complete wizard flow for creating one-off expenses
  - Test editing and deleting E1 events in both table and accordion views
  - Verify E1 events appear correctly in event type dropdown
  - _Requirements: 2.1, 2.2, 3.1, 4.1, 6.2, 6.3_