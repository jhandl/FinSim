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

## Testing
- All tests are in `./src/tests/`
- Run all tests: `./src/run-tests.sh` from project root
- An individual test can be run by passing its name (without the extension) to the script.

## Important Guidelines
- **File headers**: Check compatibility notes in file headers before making changes
- **Core compatibility**: All changes to `src/core/` must maintain compatibility between web and Google Sheets versions
- **Functions**: Keep mathematical functions pure and portable
- **Naming**: Use camelCase for variables/functions, PascalCase for classes
- **Error Handling**: Use early returns and validation before simulation runs
- **Formatting**: Use FormatUtils for currency and percentage values
- **Patterns**: Follow existing color coding, status patterns, and project structure
- **Testing**: Developer has a running local server available for testing
