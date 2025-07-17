# Design Document

## Overview

The one-off expense event type will be implemented as a proper event type within the existing financial simulation system. This involves creating a new event type "E1" (One-off Expense) to distinguish it from recurring expenses ("E"), integrating it into all UI components, and ensuring proper simulation behavior.

## Pre-Implementation Analysis
Before implementation, analyze existing E event field visibility logic in EventSummaryRenderer.showsGrowthRateField() and EventsTableManager to understand how one-off detection currently works.

Based on the codebase analysis, the system currently has:
- Event types defined in the wizard configuration (events-wizard.yml)
- Event type dropdowns managed by EventsTableManager
- Event summaries handled by EventSummaryRenderer
- Accordion view managed by EventAccordionManager
- Wizard flows managed by EventWizardManager

## Architecture

### Event Type System
The system uses string-based event type identifiers:
- Income types: 'SI', 'SInp', 'SI2', 'SI2np', 'UI', 'RI', 'DBI', 'FI'
- Expense types: 'E' (recurring expenses), 'E1' (one-off expenses)
- Real estate: 'R', 'M'
- Stock market: 'SM'

The one-off expense will use a new 'E1' event type to clearly distinguish it from recurring expenses ('E').

### Data Model
Events are represented by the SimEvent class with properties:
- type: 'E1' for one-off expenses
- id: unique identifier
- amount: expense amount
- fromAge: age when expense occurs
- toAge: age when expense ends (equals fromAge for one-off)
- rate: growth rate (empty for one-off, uses inflation)
- match: not used for expenses

## Components and Interfaces

### 1. Event Type Dropdown Integration
**Location**: EventsTableManager.js
- Add "One-off Expense" option to event type dropdown
- Ensure proper labeling and categorization as outflow event
- Handle field visibility when one-off expense is selected

### 2. Wizard Configuration
**Location**: events-wizard.yml
- Modify existing expense wizard to handle one-off vs ongoing expenses
- Add conditional steps based on expense type selection
- Ensure proper field mapping for one-off expenses

### 3. Event Summary Rendering
**Location**: EventSummaryRenderer.js
- Update period formatting to use "at age X" for one-off expenses
- Ensure proper summary text generation for single-occurrence events
- Handle display logic for one-off vs recurring expenses

### 4. Accordion View Integration
**Location**: EventAccordionManager.js
- Ensure one-off expenses display correctly in accordion
- Handle "Add Event" button to create one-off expenses by default
- Proper field visibility and editing for one-off expenses

### 5. Table View Integration
**Location**: EventsTableManager.js
- Ensure proper field visibility for one-off expenses
- Handle default values when creating new expense events
- Proper validation and formatting

## Data Models

### One-off Expense Event Structure
```javascript
{
  type: 'E1',
  name: 'User-defined name',
  amount: 'Expense amount',
  fromAge: 'Age when expense occurs',
  toAge: 'Same as fromAge for one-off',
  rate: '', // Empty string uses inflation rate
  match: '' // Not used for expenses
}
```

### Event Type Configuration
```yaml
# In events-wizard.yml - New wizard for one-off expenses
- eventType: "E1"
  name: "One-off Expense"
  category: "expense"
  steps:
    - stepId: "name"
      title: "Name Your Expense"
      contentType: "input"
      field: "name"
      content:
        text: "Give this one-off expense a descriptive name."
        validation: "required"
    
    - stepId: "amount"
      title: "Expense Amount"
      contentType: "input"
      field: "amount"
      content:
        text: "What's the total cost of this one-off expense?"
        inputType: "currency"
        validation: "required|positive"
    
    - stepId: "timing"
      title: "When will this expense occur?"
      contentType: "input"
      field: "fromAge"
      content:
        text: "At what age will you have this expense?"
        inputType: "age"
        validation: "required|positive"
```

## Error Handling

### Validation Rules
1. **Amount Validation**: Must be positive number
2. **Age Validation**: Must be valid age/year within simulation range
3. **One-off Consistency**: For one-off expenses, toAge must equal fromAge
4. **Name Validation**: Must not be empty

### Error Messages
- "Please enter a valid expense amount"
- "One-off expenses must have the same start and end age"
- "Please provide a name for this expense"

## Testing Strategy

### Unit Tests
1. **Event Creation**: Test one-off expense creation through wizard
2. **Field Validation**: Test all validation rules
3. **Summary Generation**: Test correct summary text for one-off vs ongoing
4. **Type Classification**: Test event type detection and categorization

### Integration Tests
1. **Wizard Flow**: Complete wizard flow for one-off expenses
2. **Table Integration**: Create, edit, delete one-off expenses in table view
3. **Accordion Integration**: Create, edit, delete one-off expenses in accordion view
4. **Simulation Integration**: Verify one-off expenses affect simulation correctly

### UI Tests
1. **Dropdown Display**: Verify "One-off Expense" appears in dropdown
2. **Field Visibility**: Verify correct fields shown/hidden for one-off expenses
3. **Summary Display**: Verify "at age X" vs "from age X to Y" display
4. **Add Event Button**: Verify accordion "Add Event" creates one-off expense

## Implementation Approach

### Phase 1: Core Event Type Support
1. Update event type dropdown options
2. Implement one-off expense detection logic
3. Update field visibility rules

### Phase 2: Wizard Integration
1. Modify expense wizard configuration
2. Add conditional steps for one-off vs ongoing
3. Implement proper field mapping

### Phase 3: UI Integration
1. Update summary rendering for one-off expenses
2. Ensure accordion view handles one-off expenses
3. Update "Add Event" button behavior

### Phase 4: Simulation Integration
1. Ensure simulation engine processes one-off expenses correctly
2. Verify one-time application of expense
3. Test with various simulation scenarios

## Technical Considerations

### Backward Compatibility
- Existing expense events should continue to work
- No breaking changes to SimEvent structure
- Graceful handling of legacy data in saved scenario files
- The /core classes are kept compatible with Google Apps Scripts
- When deserializing, "E" events with fromAge == toAge should be converted to "E1" events

### Serialization and Deserialization
- Serialization: No changes needed as event types are stored as strings
- Deserialization: Add logic to detect and convert "E" events with fromAge == toAge to "E1" events
- Ensure proper handling of legacy data in saved scenario files
- Validate converted events to ensure they meet E1 requirements

### Performance
- No significant performance impact expected
- Event type detection is simple comparison
- Summary generation remains efficient

### Browser Support
- Compatible with existing browser support matrix
- No new browser-specific features required
- Progressive enhancement approach