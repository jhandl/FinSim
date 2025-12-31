# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Reading

Before making changes, read `AGENTS.md` to understand the project architecture and design philosophy. Never assume how the code works—always read relevant source files first.

## Development Commands

### Testing
```bash
# Run all tests
./run-tests.sh

# Run specific test by name (without .js extension)
./run-tests.sh TestBasicSalaryTax

# Run tests by type
./run-tests.sh -t core     # Core simulation tests
./run-tests.sh -t jest     # Jest UI/unit tests
./run-tests.sh -t e2e      # Playwright end-to-end tests
./run-tests.sh -t all      # All tests

# List all available tests
./run-tests.sh --list

# Run with Jest watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Local Development
```bash
# Install dependencies
npm install

# Start local server (port 8080)
npx serve -s . -l 8080

# Install Playwright browsers (one-time, for e2e tests)
npx playwright install

# Lint code
npx eslint <file>
```

The local server is always running during development—never start a new server or open browser windows when testing UI changes. The user will test UI changes in their already-open browser.

## Critical Development Rules

### Cache Busting (MANDATORY)
When editing any JavaScript or CSS file, you **must** update the cache-busting date parameter in `./src/frontend/web/ifs/index.html`:
- For JS files: Update the `?v=YYYYMMDD` parameter in the SYSTEM UTILITIES section
- For CSS files: Update the parameter at the beginning of the file
- Use current date plus version number if date is the same
- This ensures users always get the latest version

### Code Simplicity (Golden Rule)
Use the **absolute minimum amount of code possible**:
- Trigger existing code paths rather than duplicating logic
- Prefer 1-3 line shims over new functions
- Never create a second source of truth for existing behavior
- No new initializers that replicate existing logic
- No speculative abstractions—only extract after two concrete uses
- New code must be shorter than the combined diff it replaces
- No defensive try/catch blocks unless truly necessary
- No empty catch blocks—if you're about to write one, the try/catch is unnecessary
- No over-defensive checks. Always assume all modules, functions, attributes and variables are defined. If they aren't, we'll throw.

### Google Apps Script Compatibility
Core files in `src/core/` **must** remain compatible with Google Apps Script:
- No ES6 modules (`import`/`export`)
- No modern JS features unsupported by GAS
- Code must work when copy-pasted into `.gs` files
- Frontend files can use modern features

### Configuration Over Hardcoding
- Tax- or country-related constants → `src/core/config/tax-rules-<country>.json`
- General simulation settings → `src/core/config/finsim-X.XX.json`
- Never hardcode values that belong in configuration

### Testing Requirements
- All core logic changes require corresponding tests
- Use existing test files as templates:
  - Core tests: `tests/TestBasicSalaryTax.js`
  - Jest tests: `tests/Wizard.test.js`
  - E2E tests: `tests/TestExpenseWizardNavigation.spec.js`
- Test utilities: `src/core/TestUtils.js`, `src/frontend/web/utils/FrontendTestUtils.js`

### Debugging Protocol
When fixing issues, follow this strict process:
1. Read relevant code and understand how it works
2. Formulate 5-7 hypotheses about the root cause
3. Ask user which hypotheses to pursue (**WAIT FOR CONFIRMATION**)
4. Add minimal logging with `[DBG]` prefix (one-line console.log statements)
5. Only fix after root cause is proven through logs
6. Test the fix using logs
7. Clean up logs only after confirming the fix works

For UI issues, use CSS visual cues (colored borders) or temporary overlays. For mobile, use `phonitor.js` debug overlay. Never use delays to fix timing issues—use hooks or observers instead.

## Architecture Overview

### High-Level Structure
FinSim is a financial simulation engine with a modular architecture separating core logic from UI. The core must run in both modern browsers and Google Apps Script environments.

```
src/
├── core/                      # GAS-compatible calculation engine
│   ├── config/               # Tax rules and app configuration
│   ├── Simulator.js          # Main orchestrator
│   ├── Person.js             # Individual lifecycle management
│   ├── Taxman.js             # Tax calculation engine
│   ├── Money.js              # Currency-aware value objects
│   ├── EconomicData.js       # CPI/FX/PPP data access
│   ├── InflationService.js   # Multi-country inflation resolution
│   ├── Equities.js           # Investment portfolio management
│   ├── RealEstate.js         # Property and mortgage tracking
│   ├── TaxRuleSet.js         # Country tax rule wrapper
│   ├── Config.js             # Configuration singleton
│   ├── Attribution.js        # Financial flow tracing
│   └── PresentValueCalculator.js  # Time-value calculations
│
└── frontend/
    ├── UIManager.js          # Core-to-UI abstraction layer
    ├── web/
    │   ├── WebUI.js          # Web UI singleton
    │   ├── components/       # Modular UI managers
    │   │   ├── EventsTableManager.js      # Table view (source of truth)
    │   │   ├── EventAccordionManager.js   # Mobile accordion view
    │   │   ├── EventsWizard.js            # Event creation wizard
    │   │   ├── WizardManager.js           # Wizard orchestration
    │   │   ├── ChartManager.js            # Financial charts
    │   │   ├── TableManager.js            # Data table rendering
    │   │   └── RelocationImpactAssistant.js  # Multi-country support
    │   └── utils/            # UI utilities
    └── gas/
        └── GasUI.js          # Google Sheets integration

tests/                        # Test suite (97+ tests)
docs/                         # Architecture documentation
```

### Data Flow: Simulation Run
1. **Initialization**: Load config, create Person/asset objects, normalize parameters
2. **Year Loop** (for each year from current age to death):
   - Calculate pension income (lump sums + drawdowns)
   - Apply events (salary, property purchases, etc.)
   - Declare income to Taxman (handles multi-person scenarios)
   - Calculate taxes using country-specific TaxRuleSet
   - Update asset values (growth, inflation, FX conversion)
   - Generate data row with nominal and present-value aggregates
3. **Post-Processing**: Aggregate attribution, calculate visualization data

### Key Architectural Patterns

**Money & Currency System**
- `Money.js`: Lightweight value object with `{amount, currency, country}`
- Mutable for performance in hot paths
- All calculations use Money objects at boundaries
- FX conversion cached per simulation run

**Generic Tax Engine**
- Country-specific rules in `src/core/config/tax-rules-<country>.json`
- `TaxRuleSet.js` wraps JSON and exposes getters
- `Taxman.js` applies rules to compute income tax, social contributions, CGT
- Dynamic tax categories tracked via `taxTotals` map
- Full attribution tracking for all tax calculations

**Multi-Country Support**
- `InflationService.js` resolves inflation by priority: overrides → base country → economic data → tax rules → fallback
- `EconomicData.js` provides CPI/FX/PPP from tax rules
- `PresentValueCalculator.js` applies country-specific deflation
- Person has per-country pension pots
- Real estate linked to specific countries

**Attribution Tracking**
- `Attribution.js` captures financial flow origins
- `AttributionManager.js` orchestrates yearly tracking
- Every income, expense, and tax traceable to source events
- Enables detailed breakdowns in UI

**Event Management**
- Dual view system: table (power users) + accordion (mobile)
- Table view is source of truth
- Bidirectional synchronization between views
- Wizard system for guided event creation
- Real-time validation and field visibility logic

### Configuration System
- `Config.initialize(ui)` must be called at app start
- Follows `latestVersion` chain in `finsim-X.XX.json` files
- Preloads Ireland tax ruleset for synchronous access
- Additional countries loaded on-demand via `Config.getTaxRuleSet(code)`
- Tax rules include: income tax brackets, social contributions, CGT rates, pension rules, investment types

### Code Philosophy
- **Minimize code**: Reuse over refactor, modify over add
- **No defensive coding excess**: Trust infrastructure exists
- **Configuration over code**: Constants belong in JSON
- **GAS compatibility**: Core must work without modules/modern JS
- **Test everything**: Core changes require tests
- **Cache busting**: Always update index.html timestamps

### Important Files to Read
- `AGENTS.md`: Comprehensive architecture guide
- `docs/money-architecture.md`: Money object design
- `docs/relocation-system.md`: Multi-country feature details
- `src/core/TestUtils.js`: Test scenario builders
- `tests/TestBasicSalaryTax.js`: Example core test
- `tests/Wizard.test.js`: Example Jest test
- `tests/TestExpenseWizardNavigation.spec.js`: Example Playwright test

### Planning & Documentation
When asked to plan:
- Write plan to a `.md` file
- Don't touch code until explicitly told to implement
- Plan should be clear guide for both user review and AI implementation
- Include progress tracking mechanism
- DO NOT START IMPLEMENTING until explicitly instructed

After completing significant changes:
- Consider updating `AGENTS.md` if architecture changed
- Keep documentation consistent with code
- No commentary on evolution—just current state
