# Events Accordion System Documentation

## Overview

The Events Accordion System provides an alternative view for managing financial events in the FinSim application. It presents events as expandable cards with summary information, detailed editing capabilities, and visual categorization. This system offers a more visual and organized approach compared to the traditional table view.

## Architecture

### Core Components

#### 1. EventAccordionManager (`src/frontend/web/components/EventAccordionManager.js`)
- **Purpose**: Main controller for accordion functionality
- **Responsibilities**:
  - Managing accordion state and expansion
  - Coordinating with table data for synchronization
  - Handling in-situ editing and validation
  - Managing event lifecycle (create, update, delete)

#### 2. EventSummaryRenderer (`src/frontend/web/components/EventSummaryRenderer.js`)
- **Purpose**: Specialized rendering for event summaries and details
- **Responsibilities**:
  - Generating compact event summaries
  - Creating detailed editable views
  - Formatting currency, dates, and percentages
  - Handling event type categorization and icons

### Data Flow

```
Table Data (Source of Truth)
    ↓
EventAccordionManager.refresh()
    ↓
Extract events from table rows
    ↓
EventSummaryRenderer.generateSummary()
    ↓
Render accordion items with summaries
    ↓
User interaction (expand/edit)
    ↓
EventSummaryRenderer.generateDetailedSummary()
    ↓
In-situ editing with real-time validation
    ↓
Sync changes back to table
```

## State Management

### Accordion State
```javascript
{
  events: [],                    // Cached event data from table
  expandedItems: new Set(),      // Track which items are expanded
  ageYearMode: 'age',           // Current display mode
  accordionContainer: null,      // DOM reference
  eventCounter: 0               // Unique ID counter
}
```

### Event Data Structure
```javascript
{
  accordionId: "event_1",       // Unique accordion identifier
  tableRowIndex: 2,             // Corresponding table row
  type: "SI",                   // Event type code
  name: "Salary",               // Event name
  amount: "50000",              // Amount value
  fromAge: "25",                // Start age
  toAge: "65",                  // End age
  rate: "3",                    // Growth rate
  match: "50"                   // Employer match (if applicable)
}
```

## Visual Design

### Accordion Structure
```
┌─ Accordion Container ─────────────────────────┐
│ ┌─ Header ─────────────────────────────────┐   │
│ │ Events (Accordion View)    [+ Add Event] │   │
│ └─────────────────────────────────────────┘   │
│ ┌─ Item 1 ─────────────────────────────────┐   │
│ │ [Icon] Event Summary           [+/-]     │   │
│ │ ┌─ Expanded Content ─────────────────┐   │   │
│ │ │ Detailed editable fields        │   │   │
│ │ │ [Delete] button                 │   │   │
│ │ └─────────────────────────────────┘   │   │
│ └─────────────────────────────────────────┘   │
│ ┌─ Item 2 ─────────────────────────────────┐   │
│ │ [Icon] Event Summary           [+]       │   │
│ └─────────────────────────────────────────┘   │
└───────────────────────────────────────────────┘
```

### Color Coding
- **Income Events**: Green left border (`rgba(76, 175, 80, 0.6)`)
- **Expense Events**: Red left border (`rgba(239, 83, 80, 0.6)`)
- **Real Estate**: Blue left border (`rgba(66, 165, 245, 0.6)`)
- **Stock Market**: Yellow left border (`rgba(255, 193, 7, 0.6)`)

## Event Summary Generation

### Compact Summary
```javascript
generateSummary(event) {
  return `
    <div class="event-summary">
      <div class="event-summary-header">
        <div class="event-summary-icon ${category}">
          <i class="fas fa-${icon}"></i>
        </div>
        <div class="event-summary-main">
          <div class="event-summary-title">
            <span class="event-name">${event.name}</span>
            <span class="event-type-badge">${eventType}</span>
          </div>
          <div class="event-summary-details">
            ${detailsText}
          </div>
        </div>
      </div>
    </div>
  `;
}
```

### Detailed Summary (Editable)
- **Event Type Dropdown**: Triggers wizard when changed
- **Editable Fields**: Direct editing with real-time validation
- **Field Visibility**: Context-aware field display based on event type
- **Action Buttons**: Delete functionality

## In-Situ Editing System

### Editable Field Types
```javascript
const editableFields = [
  { selector: '.accordion-edit-name', tableClass: 'event-name', type: 'text' },
  { selector: '.accordion-edit-amount', tableClass: 'event-amount', type: 'currency' },
  { selector: '.accordion-edit-from-age', tableClass: 'event-from-age', type: 'age' },
  { selector: '.accordion-edit-to-age', tableClass: 'event-to-age', type: 'age' },
  { selector: '.accordion-edit-rate', tableClass: 'event-rate', type: 'percentage' },
  { selector: '.accordion-edit-match', tableClass: 'event-match', type: 'percentage' }
];
```

### Real-time Validation
- **Input Events**: Validation triggered on every keystroke
- **Visual Feedback**: Immediate error/warning display
- **Table Sync**: Valid changes immediately reflected in table
- **Error Handling**: Invalid changes blocked from table sync

### Validation Rules
```javascript
validateField(value, fieldType, event) {
  switch (fieldType) {
    case 'currency':
      return this.validateCurrencyField(value);
    case 'age':
      return this.validateAgeField(value, event);
    case 'percentage':
      return this.validatePercentageField(value, event);
    case 'text':
      return this.validateTextField(value);
  }
}
```

## Integration with Other Systems

### Table Synchronization
- **Bidirectional Sync**: Changes in accordion reflect in table and vice versa
- **Data Source**: Table remains the single source of truth
- **Refresh Mechanism**: Accordion refreshes when table data changes

### Wizard Integration
- **Type Changes**: Changing event type triggers wizard with pre-populated data
- **Event Creation**: "Add Event" button opens wizard selection modal
- **Data Transfer**: Wizard completion adds new events to accordion

### Field Visibility Logic
- **Reused Logic**: Uses existing table field visibility rules
- **Event Type Specific**: Different fields shown based on event type
- **Dynamic Updates**: Field visibility updates when event type changes

## Animation and UX

### Expansion Animation
```css
.accordion-item-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out, opacity 0.2s ease-out;
  opacity: 0;
}

.accordion-item-content.expanded {
  max-height: 1000px;
  opacity: 1;
  transition: max-height 0.3s ease-in, opacity 0.2s ease-in;
}
```

### Icon Transformation
```css
.accordion-expand-btn i {
  transition: transform 0.2s ease;
}

.accordion-expand-btn.expanded i {
  transform: rotate(45deg); /* Plus becomes X */
}
```

### New Event Highlighting
```css
@keyframes singlePulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
}

.events-accordion-item.new-event-highlight {
  animation: singlePulse 0.8s ease-out;
}
```

## Event Lifecycle Management

### Event Creation
1. User clicks "Add Event" button
2. Wizard selection modal appears
3. User completes wizard
4. Event added to table
5. Accordion refreshes and highlights new event

### Event Editing
1. User expands accordion item
2. Detailed view renders with editable fields
3. User modifies fields with real-time validation
4. Changes sync to table immediately
5. Summary updates to reflect changes

### Event Deletion
1. User clicks delete button in expanded view
2. Confirmation dialog appears
3. Event removed from table
4. Accordion refreshes to remove item

### Event Type Changes
1. User selects new type from dropdown
2. Wizard opens with current event data pre-populated
3. User completes wizard with new type
4. Original event replaced with new event data
5. Accordion refreshes with updated event

## Responsive Design

### Mobile Adaptations
```css
@media (max-width: 768px) {
  .events-accordion-header {
    padding: 1rem;
  }
  
  .accordion-header-content {
    flex-direction: column;
    gap: 1rem;
    align-items: stretch;
  }
  
  .event-summary-icon {
    width: 36px;
    height: 36px;
    font-size: 1rem;
  }
}
```

### Touch Interactions
- **Tap to Expand**: Touch-friendly expansion controls
- **Swipe Prevention**: Prevents accidental swipes during editing
- **Focus Management**: Proper focus handling for mobile keyboards

## Performance Optimizations

### Lazy Rendering
- **Summary Only**: Initially renders only summary views
- **On-Demand Details**: Detailed views rendered only when expanded
- **DOM Cleanup**: Collapsed items have minimal DOM footprint

### Event Handling
- **Event Delegation**: Efficient event handling for dynamic content
- **Debounced Validation**: Prevents excessive validation calls
- **Throttled Sync**: Limits table synchronization frequency

### Memory Management
- **State Cleanup**: Proper cleanup of event listeners
- **Cache Management**: Efficient caching of event data
- **DOM Recycling**: Reuses DOM elements where possible

## Error Handling

### Data Consistency
- **Sync Failures**: Graceful handling of table sync errors
- **Validation Errors**: Clear error messaging for invalid data
- **State Recovery**: Ability to recover from inconsistent states

### User Experience
- **Progressive Enhancement**: Graceful degradation when features fail
- **Error Boundaries**: Isolated error handling prevents system crashes
- **User Feedback**: Clear communication of error states

## Field Visibility and Event Types

### Event Type Mapping
```javascript
const eventTypeInfo = {
  'SI': { label: 'Salary Income', category: 'income', fields: ['name', 'amount', 'fromAge', 'toAge', 'match'] },
  'SI2': { label: 'Two-Person Salary', category: 'income', fields: ['name', 'amount', 'fromAge', 'toAge', 'match'] },
  'SInp': { label: 'Pension Income', category: 'income', fields: ['name', 'amount', 'fromAge', 'toAge'] },
  'SI2np': { label: 'Two-Person Pension', category: 'income', fields: ['name', 'amount', 'fromAge', 'toAge'] },
  'E': { label: 'Expense', category: 'expense', fields: ['name', 'amount', 'fromAge', 'toAge', 'rate'] },
  'R': { label: 'Real Estate', category: 'property', fields: ['name', 'amount', 'fromAge', 'toAge'] },
  'S': { label: 'Stock Market', category: 'investment', fields: ['name', 'amount', 'fromAge', 'rate'] }
};
```

### Dynamic Field Display
- **Context-Aware**: Only relevant fields shown for each event type
- **Validation Integration**: Field visibility tied to validation rules
- **User Experience**: Reduces cognitive load by hiding irrelevant fields

## Advanced Validation System

### Multi-level Validation
```javascript
validateField(value, fieldType, event) {
  // Level 1: Basic type validation
  const basicValidation = this.validateBasicType(value, fieldType);
  if (!basicValidation.isValid) return basicValidation;

  // Level 2: Business rule validation
  const businessValidation = this.validateBusinessRules(value, fieldType, event);
  if (!businessValidation.isValid) return businessValidation;

  // Level 3: Cross-field validation
  return this.validateCrossField(value, fieldType, event);
}
```

### Validation Categories
- **Syntax Validation**: Correct data format and type
- **Range Validation**: Values within acceptable bounds
- **Business Logic**: Financial reasonableness checks
- **Cross-field**: Relationships between multiple fields

### Error Recovery
- **Auto-correction**: Automatic fixing of common input errors
- **Suggestion System**: Helpful suggestions for invalid inputs
- **Graceful Degradation**: Partial functionality when validation fails

## Data Synchronization

### Bidirectional Sync Architecture
```
Accordion Edit → Validation → Table Update → Accordion Refresh
     ↑                                              ↓
Table Edit → Table Change Event → Accordion Refresh
```

### Sync Mechanisms
- **Real-time Updates**: Changes reflected immediately
- **Conflict Resolution**: Handling simultaneous edits
- **Data Integrity**: Ensuring consistency across views

### Performance Optimization
- **Debounced Updates**: Prevents excessive sync operations
- **Selective Refresh**: Only updates changed elements
- **Batch Operations**: Groups multiple changes for efficiency

## Accessibility Features

### Screen Reader Support
- **ARIA Labels**: Comprehensive labeling for all interactive elements
- **Role Definitions**: Proper semantic roles for accordion structure
- **State Announcements**: Clear communication of expand/collapse states

### Keyboard Navigation
- **Tab Order**: Logical tab sequence through accordion items
- **Keyboard Shortcuts**: Space/Enter for expansion, Escape for collapse
- **Focus Management**: Proper focus handling during state changes

### Visual Accessibility
- **High Contrast**: Sufficient color contrast for all text
- **Focus Indicators**: Clear visual focus indicators
- **Reduced Motion**: Respects user motion preferences

## Event Categories and Icons

### Category System
```javascript
const categoryConfig = {
  income: {
    color: '#28a745',
    icon: 'plus-circle',
    description: 'Money coming in'
  },
  expense: {
    color: '#dc3545',
    icon: 'minus-circle',
    description: 'Money going out'
  },
  property: {
    color: '#6f42c1',
    icon: 'home',
    description: 'Real estate transactions'
  },
  investment: {
    color: '#007bff',
    icon: 'chart-line',
    description: 'Investment activities'
  }
};
```

### Visual Hierarchy
- **Color Coding**: Consistent color scheme across categories
- **Icon System**: FontAwesome icons for visual recognition
- **Border Indicators**: Left border color coding for quick identification

## State Management Details

### Expansion State Tracking
```javascript
// Set-based tracking for efficient lookups
expandedItems: new Set(['event_1', 'event_3'])

// Methods for state management
toggleExpansion(accordionId) {
  if (this.expandedItems.has(accordionId)) {
    this.expandedItems.delete(accordionId);
  } else {
    this.expandedItems.add(accordionId);
  }
}
```

### Event Data Caching
- **Fresh Data Retrieval**: Always gets latest data from table before rendering
- **Cache Invalidation**: Clears cache when table data changes
- **Memory Efficiency**: Minimal memory footprint for cached data

## Future Enhancements

### Planned Features
- **Drag and Drop**: Reorder events within accordion
- **Bulk Operations**: Select multiple events for batch operations
- **Advanced Filtering**: Filter events by type, amount, or date range
- **Export Options**: Export accordion view as PDF or image
- **Search Functionality**: Quick search through event names and details
- **Grouping Options**: Group events by category, time period, or amount
- **Comparison Mode**: Side-by-side comparison of similar events

### Technical Improvements
- **Virtual Scrolling**: Handle large numbers of events efficiently
- **Accessibility**: Enhanced screen reader support
- **Keyboard Navigation**: Full keyboard navigation support
- **Undo/Redo**: Action history for event modifications
- **Offline Editing**: Local storage for offline editing capabilities
- **Real-time Collaboration**: Multi-user editing with conflict resolution
