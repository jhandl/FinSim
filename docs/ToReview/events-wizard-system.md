# Events Wizard System Documentation

## Overview

The Events Wizard System provides a guided, step-by-step interface for creating financial events in the FinSim application. It offers an intuitive alternative to direct table editing, walking users through the process of defining income, expenses, property purchases, and investments with contextual help and validation.

## Architecture

### Core Components

#### 1. WizardManager (`src/frontend/web/components/WizardManager.js`)
- **Purpose**: Central orchestrator for wizard functionality
- **Responsibilities**:
  - Loading wizard configuration from YAML
  - Managing wizard state and flow
  - Handling step navigation and validation
  - Coordinating with other UI components

#### 2. WizardRenderer (`src/frontend/web/components/WizardRenderer.js`)
- **Purpose**: Specialized rendering for complex wizard content types
- **Responsibilities**:
  - Rendering period selection interfaces (fromAge/toAge)
  - Creating summary previews
  - Handling mortgage calculation displays
  - Template processing for dynamic content

#### 3. Configuration System (`src/frontend/web/assets/events-wizard.yml`)
- **Purpose**: Declarative wizard definitions
- **Structure**:
  - Event wizard definitions with steps
  - UI configuration and styling
  - Category definitions and icons
  - Validation rules

### State Management

```javascript
// Wizard State Structure
{
  eventType: "SI",           // Event type code
  data: {                    // Collected form data
    name: "Salary",
    amount: "50000",
    fromAge: "25",
    toAge: "65",
    // ... other fields
  },
  onComplete: function,      // Completion callback
  currentStep: 0,           // Current step index
  isActive: true            // Wizard active state
}
```

## Wizard Flow

### 1. Initialization
```javascript
// Start wizard for specific event type
webUI.eventsWizard.startWizard('SI', prePopulatedData, onComplete);
```

### 2. Step Processing
- **Condition Evaluation**: Each step can have conditions that determine visibility
- **Content Rendering**: Different content types (input, choice, period, summary, mortgage)
- **Validation**: Real-time field validation with error/warning display
- **Navigation**: Back/Next buttons with step skipping logic

### 3. Completion
- **Data Validation**: Final validation before event creation
- **Event Creation**: Calls completion callback with collected data
- **Special Handling**: Property purchases with mortgages create additional events

## Content Types

### Input Fields
```yaml
contentType: "input"
field: "name"
content:
  text: "Enter event name"
  validation: "required"
```

### Choice Selection
```yaml
contentType: "choice"
content:
  text: "Select option"
  choices:
    - value: "option1"
      title: "Option 1"
      description: "Description"
```

### Period Selection
```yaml
contentType: "period"
content:
  text: "Select time period"
  help: "Choose start and end ages"
```

### Summary Preview
```yaml
contentType: "summary"
content:
  text: "Review your event"
  template: "Creating {name} for {amount} from age {fromAge} to {toAge}"
```

### Mortgage Calculator
```yaml
contentType: "mortgage"
content:
  text: "Configure mortgage details"
  help: "Enter rate and term for calculation"
```

## Validation System

### Real-time Validation
- **Field-level**: Validates individual inputs as user types
- **Cross-field**: Validates relationships between fields (e.g., toAge > fromAge)
- **Warning vs Error**: Distinguishes between blocking errors and warnings

### Validation Types
- **Currency**: Amount validation with reasonable limits
- **Age**: Age range validation (0-120)
- **Percentage**: Rate validation for growth/interest rates
- **Required**: Ensures mandatory fields are filled

### Validation Display
```css
.wizard-validation-message.error {
  color: #721c24;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
}

.wizard-validation-message.warning {
  color: #856404;
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
}
```

## Integration Points

### With Table Manager
- **Event Creation**: Wizard completion triggers table row creation
- **Pre-population**: Existing events can be edited via wizard with pre-filled data
- **Synchronization**: Changes reflect immediately in table view

### With Accordion Manager
- **Type Changes**: Changing event type in accordion triggers wizard
- **Data Transfer**: Wizard preserves existing event data when changing types

### With UI Components
- **Modal System**: Uses application modal infrastructure
- **Formatting**: Integrates with currency and percentage formatters
- **Responsive**: Adapts to mobile and desktop layouts

## Styling and UX

### Modal Design
- **Overlay**: Semi-transparent background with modal centering
- **Responsive**: Adapts to screen size (95% width on mobile)
- **Animation**: Smooth slide-in animation for modal appearance

### Step Navigation
- **Progress**: Visual indication of current step
- **Buttons**: Context-aware Back/Next/Complete buttons
- **Keyboard**: Enter key advances single-input steps

### Visual Feedback
- **Icons**: Category-specific icons with color coding
- **Validation**: Immediate visual feedback for field errors
- **Loading**: Smooth transitions between steps

## Configuration Examples

### Simple Income Wizard
```yaml
- eventType: "SI"
  name: "Salary Income"
  category: "income"
  steps:
    - stepId: "name"
      title: "Name Your Income"
      contentType: "input"
      field: "name"
    - stepId: "amount"
      title: "Annual Amount"
      contentType: "input"
      field: "amount"
    - stepId: "period"
      title: "Time Period"
      contentType: "period"
```

### Conditional Steps
```yaml
- stepId: "pension"
  title: "Pension Contribution"
  contentType: "choice"
  condition: "type === 'salary'"
  content:
    text: "Do you contribute to a pension?"
    choices:
      - value: "yes"
        title: "Yes"
      - value: "no"
        title: "No"
```

## Error Handling

### Configuration Errors
- **Missing YAML**: Graceful fallback when configuration fails to load
- **Invalid Steps**: Validation of step definitions
- **Missing Fields**: Default values for optional configuration

### Runtime Errors
- **Validation Failures**: User-friendly error messages
- **Navigation Issues**: Prevents invalid step transitions
- **Data Corruption**: Validates data integrity before submission

## Performance Considerations

### Lazy Loading
- **Configuration**: YAML loaded asynchronously on first use
- **Rendering**: Step content rendered on-demand
- **Validation**: Debounced input validation to prevent excessive calls

### Memory Management
- **State Cleanup**: Wizard state cleared on completion/cancellation
- **Event Listeners**: Proper cleanup of modal event listeners
- **DOM Management**: Efficient creation/destruction of modal elements

## Wizard Types and Flows

### Income Wizards
- **Simple Income (SI)**: Basic salary/income setup
- **Two-Person Income (SI2)**: Dual-person household income
- **Pension Income (SInp)**: Retirement income without employer match
- **Two-Person Pension (SI2np)**: Dual-person pension income

### Expense Wizards
- **General Expenses (E)**: One-off or ongoing expenses
- **Type Selection**: Automatic field visibility based on expense type
- **Growth Rates**: Optional inflation-adjusted growth

### Property Wizards
- **Real Estate (R)**: Property purchase with optional mortgage
- **Financing Options**: Cash purchase vs. mortgage financing
- **Mortgage Calculator**: Integrated payment calculation
- **Down Payment**: Configurable down payment percentage

### Investment Wizards
- **Stock Market (S)**: Investment portfolio setup
- **Growth Projections**: Expected return rate configuration
- **Risk Assessment**: Investment risk level selection

## Advanced Features

### Conditional Logic
```yaml
# Example: Show employer match only for salary events
- stepId: "match"
  title: "Employer Match"
  condition: "type === 'salary' && contributes === 'yes'"
  contentType: "input"
  field: "match"
```

### Dynamic Field Visibility
- **Event Type Dependent**: Fields shown/hidden based on event type
- **Previous Choices**: Field visibility based on earlier wizard selections
- **Simulation Mode**: Different fields for different simulation modes

### Special Case Handling
```javascript
handleSpecialCases() {
  // One-off expenses: set toAge = fromAge
  if (this.wizardState.data.type === 'oneoff') {
    this.wizardState.data.toAge = this.wizardState.data.fromAge;
  }

  // Property with mortgage: prepare mortgage event data
  if (this.wizardState.eventType === 'R' &&
      this.wizardState.data.financing === 'mortgage') {
    this.prepareMortgageEvent();
  }
}
```

### Mortgage Integration
- **Dual Event Creation**: Property purchase + mortgage payment events
- **Real-time Calculation**: Monthly/annual payment calculation
- **Rate Validation**: Interest rate reasonableness checks
- **Term Options**: Standard mortgage term selections

## Testing and Quality Assurance

### Validation Testing
- **Field Validation**: Unit tests for all validation rules
- **Cross-field Validation**: Tests for field relationship rules
- **Edge Cases**: Boundary value testing for numeric fields

### Integration Testing
- **Wizard-Table Integration**: End-to-end event creation testing
- **Modal Behavior**: Modal lifecycle and event handling tests
- **Responsive Testing**: Cross-device and screen size testing

### User Experience Testing
- **Accessibility**: Screen reader and keyboard navigation testing
- **Performance**: Load time and interaction responsiveness testing
- **Error Handling**: User-friendly error message testing

## Future Enhancements

### Planned Features
- **Multi-step Validation**: Cross-step validation rules
- **Dynamic Steps**: Steps that adapt based on previous choices
- **Templates**: Pre-defined event templates for common scenarios
- **Import/Export**: Save and load wizard configurations
- **Wizard History**: Track and replay wizard sessions
- **Advanced Calculations**: More sophisticated financial calculations

### Technical Improvements
- **TypeScript**: Type safety for wizard configuration
- **Testing**: Comprehensive unit and integration tests
- **Accessibility**: Enhanced screen reader support
- **Internationalization**: Multi-language support for wizard content
- **Performance**: Virtual scrolling for large wizard lists
- **Offline Support**: Local storage for wizard progress
