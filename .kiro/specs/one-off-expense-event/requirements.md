# Requirements Document

## Introduction

The financial simulator currently has an inconsistency where the accordion view's "add event" button assumes a "one-off expense" event type exists, but this event type is not actually implemented in the system. This feature will create a proper one-off expense event type that integrates seamlessly with all existing UI components including the dropdown menu, wizard, table view, accordion view, and event creation workflows.

## Requirements

### Requirement 1

**User Story:** As a user, I want to create one-off expense events so that I can model single, non-recurring expenses in my financial simulation.

#### Acceptance Criteria

1. WHEN a user accesses the event type dropdown THEN the system SHALL display "One-off Expense" as an available option
2. WHEN a user selects "One-off Expense" from the dropdown THEN the system SHALL present appropriate fields for one-off expense configuration
3. WHEN a user creates a one-off expense event THEN the system SHALL store it with the correct event type identifier

### Requirement 2

**User Story:** As a user, I want one-off expense events to display correctly in all views so that I can review and manage them consistently across the interface.

#### Acceptance Criteria

1. WHEN a one-off expense event exists THEN the table view SHALL display it with appropriate columns and formatting
2. WHEN a one-off expense event exists THEN the accordion view SHALL display it with correct summary phrasing using "at age" instead of "from age"
3. WHEN a user views event summaries THEN one-off expense events SHALL use singular phrasing appropriate for single occurrences

### Requirement 3

**User Story:** As a user, I want to create one-off expense events through the wizard so that I can configure them with guided assistance.

#### Acceptance Criteria

1. WHEN a user selects "One-off Expense" in the wizard THEN the system SHALL present relevant configuration fields
2. WHEN a user completes the one-off expense wizard THEN the system SHALL create the event with correct field values
3. WHEN a user uses the wizard for one-off expenses THEN irrelevant fields SHALL be hidden or disabled

### Requirement 4

**User Story:** As a user, I want to create one-off expense events through the accordion "Add Event" button so that I can quickly add expenses without using the full wizard.

#### Acceptance Criteria

1. WHEN a one-off expense is created via "Add Event" THEN it SHALL be immediately editable in the accordion

### Requirement 5

**User Story:** As a user, I want one-off expense events to integrate with the simulation engine so that they affect my financial projections accurately.

#### Acceptance Criteria

1. WHEN a simulation runs with one-off expense events THEN the system SHALL apply the expense at the specified age/year
2. WHEN a one-off expense occurs in simulation THEN it SHALL reduce available funds appropriately, exactly as if it was a multi-year expense that has the same start age and end age.

### Requirement 6

**User Story:** As a user, I want one-off expense events to support all standard event operations so that I can manage them like other event types.

#### Acceptance Criteria

1. WHEN a user edits a one-off expense event THEN all relevant fields SHALL be modifiable
2. WHEN a user deletes a one-off expense event THEN it SHALL be removed from the simulation
