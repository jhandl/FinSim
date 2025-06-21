# FinSim Project Guidelines

## Project Information
- Browser-based financial simulator that works both on web and Google Sheets
- Single Page Application (SPA) with component-based architecture
- Runs entirely in browser (no server-side code)

## Project Structure & Architecture
- **Core simulation logic**: `src/core/` - Simulator, Config, Revenue, Equities, RealEstate, Events (compatible with both web and Google Sheets)
- **Frontend UI**: `src/frontend/`
  - `gas/` - Google Apps Script version
  - `web/` - Website version with SPA router, modular components, utils, and landing page
- **Tests**: `src/tests/` - Comprehensive test suite covering simulation scenarios
- **Entry point**: `index.html` - Main application with SPA routing between landing page and simulator
- **Initialized globals**: `params`, `config`, `events`, `revenue`, `uiManager`

## Core Simulation Mechanics

### Person/Variable Naming Conventions  
- **SI** and **SInp**: Always refer to the 1st person
- **S2** and **S2np**: Always refer to the 2nd person  
- **'np' postfix**: In SInp and S2np, 'np' always means "no pension contribution"
- These conventions apply regardless of whether Monte Carlo mode is used or not

### Monte Carlo Simulation Method
The simulator uses an accumulation-then-average approach for Monte Carlo runs:
1. **Accumulation Phase**: For each simulation run, all yearly outcomes (salaries, taxes, assets, etc.) are accumulated into running totals
2. **Averaging Phase**: After all runs complete, the accumulated sums are divided by the number of runs to produce average values
3. **Result**: The final data sheet contains averaged values across all Monte Carlo iterations, not individual run results

## Testing
- All tests are in `./src/tests/`
- Run all tests: `./src/run-tests.sh` from project root
- An individual test can be run by passing its name (without the extension) to the script.

### Test File Structure
The project uses two main test patterns:

#### Standard Simulation Tests
Most tests use this structure for testing simulation scenarios:
```javascript
module.exports = {
    name: 'TestName',                    // String: Descriptive test name
    description: 'Test description',     // String: What the test validates
    category: 'optional-category',       // String: Test category (optional)
    scenario: {
        parameters: {                    // Object: Simulation parameters
            startingAge: 30,             // Required: Starting age
            targetAge: 35,               // Required: End age
            retirementAge: 65,           // Required: Retirement age
            initialSavings: 0,           // Required: Starting cash
            initialPension: 0,           // Required: Starting pension
            initialFunds: 0,             // Required: Starting index funds
            initialShares: 0,            // Required: Starting shares
            // ... include all other required parameters
            // See existing tests for complete parameter lists
        },
        events: [                        // Array: Simulation events
            {
                type: 'EventType',       // String: Event type (see Event Types below)
                id: 'unique-id',         // String: Unique identifier
                amount: 50000,           // Number: Event amount
                fromAge: 30,             // Number: Start age
                toAge: 34,               // Number: End age
                rate: 0,                 // Number: Rate/percentage (context dependent)
                match: 0                 // Number: Match amount (context dependent)
            }
            // Add multiple events as needed
        ]
    },
    assertions: [                        // Array: Test assertions
        {
            type: 'assertion_type',      // String: Assertion type (see below)
            target: 'target_type',       // String: Target type (age/final/year)
            age: 31,                     // Number: Specific age (for target: 'age')
            field: 'field_name',         // String: Field to check
            expected: 12345,             // Number/Object: Expected value
            tolerance: 50                // Number: Optional tolerance for rounding
        }
        // Add multiple assertions as needed
    ]
};
```

#### Custom Tests
For complex testing scenarios (singletons, UI interactions, error conditions, etc.):
```javascript
module.exports = {
    name: 'TestName',
    description: 'Test description',
    isCustomTest: true,                  // Boolean: Marks as custom test
    runCustomTest: async function() {    // Function: Custom test implementation
        // Custom test logic here
        // Access TestFramework, mock objects, etc.
        // Must return: { success: boolean, errors: string[] }
        return { success: true, errors: [] };
    }
};
```

### Event Types
Common event types used in simulation scenarios:
- `SI`: Salary Income
- `E`: Expense  
- `R`: Real Estate transaction
- `SM`: Stock Market override
- `RI`: Rental Income
- `UI`: RSU/Share Income
- `SInp`: Salary Income with pension contribution
- And others - see existing tests for more examples

### Test Assertion Types
- `exact_value`: Check field equals expected value (with optional tolerance)
- `range`: Check field is within min/max bounds (`expected: {min: 1000, max: 2000}`)
- `comparison`: Check field with operators (`expected: {operator: '>=', value: 1000}`)

### Target Types
- `age`: Test at specific age (`age: 31`)
- `final`: Test at end of simulation
- `year`: Test at specific year

### Common Fields to Test
- Financial: `cash`, `worth`, `netIncome`, `pensionFund`, `indexFundsCapital`, `sharesCapital`
- Tax: `it` (income tax), `prsi`, `usc`, `cgt` (capital gains tax)
- Income: `incomeSalaries`, `incomeRentals`, `incomeRSUs`
- Other: `age`, `expenses`

### Important Notes
- Always include complete parameter sets - copy from existing working tests
- Use meaningful event IDs for debugging
- When adding a new feature create failing tests first (TDD) 
- Run tests frequently during development to catch issues early

## Important Guidelines
- **File headers**: Check compatibility notes in file headers before making changes
- **Core compatibility**: All changes to `src/core/` must maintain compatibility between web and Google Sheets versions
- **Functions**: Keep mathematical functions pure and portable
- **Naming**: Use camelCase for variables/functions, PascalCase for classes
- **Error Handling**: Use early returns and validation before simulation runs
- **Formatting**: Use FormatUtils for currency and percentage values
- **Patterns**: Follow existing color coding, status patterns, and project structure
- **Testing**: Developer has a running local server available for testing
