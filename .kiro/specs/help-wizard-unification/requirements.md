# Requirements Document

## Introduction

The help wizard currently has two separate entry points: `start()` for full/help tours and `startTour()` for quick/mini tours. This duplication creates inconsistencies in behavior and makes the codebase harder to maintain. The goal is to replace these with a single unified `start(type, card)` method that can handle all tour types through a shared, parameter-based engine while maintaining current functionality with one behavioral correction.

## Requirements

### Requirement 1

**User Story:** As a developer maintaining the wizard code, I want a single entry point for all tour types, so that I can reduce code duplication and ensure consistent behavior across all tour variations.

#### Acceptance Criteria

1. WHEN the unified `start(type, card)` method is called THEN the system SHALL determine the appropriate tour configuration based on the type parameter
2. WHEN type is 'full' THEN the system SHALL execute the complete help tour with all available steps
3. WHEN type is 'quick' THEN the system SHALL execute a condensed tour with only essential steps
4. WHEN type is 'mini' THEN the system SHALL execute a focused tour for the specified card parameter
5. WHEN type is 'help' THEN the system SHALL execute a context-sensitive tour starting from the last focused field

### Requirement 2

**User Story:** As a user interacting with the help system, I want all tour types to behave consistently, so that I have a predictable experience regardless of which tour I start.

#### Acceptance Criteria

1. WHEN any tour type is started THEN the system SHALL use the same underlying tour engine
2. WHEN a tour is active THEN the system SHALL apply consistent keyboard handling, mobile optimizations, and UI state management
3. WHEN a tour finishes THEN the system SHALL perform the same cleanup operations regardless of tour type
4. WHEN accordion events are involved THEN the system SHALL handle expansion and collapse consistently across all tour types
5. WHEN the tour opens an accordion event to highlight an element within, THEN the system SHALL close the event as the tour leaves the last field of that event.

### Requirement 3

**User Story:** As a developer integrating with the wizard, I want the new unified entry point to maintain backward compatibility, so that existing code continues to work without modification.

#### Acceptance Criteria

1. WHEN existing code calls the old `start()` method THEN the system SHALL continue to work as before
2. WHEN existing code calls the old `startTour()` method THEN the system SHALL continue to work as before
3. WHEN the unified entry point is used THEN the system SHALL provide the same external API and behavior as the original methods
4. WHEN parameters are passed to the unified method THEN the system SHALL validate and handle them appropriately

### Requirement 4

**User Story:** As a user of the help system, I want all tour functionality to work exactly as it does now, so that the unification doesn't break any existing features.

#### Acceptance Criteria

1. WHEN a full tour is started THEN the system SHALL show all appropriate steps based on current UI state and configuration
2. WHEN a quick tour is started THEN the system SHALL show only the steps tagged for quick tours
3. WHEN a mini tour is started THEN the system SHALL show only the steps for the specified card
4. WHEN a help tour is started THEN the system SHALL begin from the last focused field or appropriate starting point
5. WHEN any tour processes steps THEN the system SHALL apply all existing filtering logic for element visibility, event types, and UI modes
6. WHEN a tour needs to highlight an element that is hidden in the burger menu or a collapsed accordion event THEN the system SHALL open the menu or expand the event to make the highlighted element visible, and close the menu or collapse the event after leaving the last element of the menu or event. 