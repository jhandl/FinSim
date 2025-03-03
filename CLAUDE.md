# FinSim Project Guidelines

## Project Information
- Browser-based financial simulator that works both on web and Google Sheets
- Contains web UI and core simulation classes
- Runs entirely in browser (no server-side code)

## Testing
- Run tests by opening the test files in browser
- Individual tests: `new Test[Component]().runTests([specificTestMethod])`
- All tests: `runTests()` from browser console

## Code Style Guidelines
- **Comments**: Note the comment at the top of each file regarding compatibility
- **Functions**: Keep mathematical functions pure and portable
- **Naming**: Use camelCase for variables/functions, PascalCase for classes
- **Structure**: Core simulation logic in `src/core/`, UI in `src/frontend/`. Within `src/frontend`, `gas/` is for Google Apps Script, `web/` is for the website version. The website's landing page is in `src/landing` and the main simulator UI website 
- **Error Handling**: Use early returns and validation before simulation runs
- **Compatibility**: All code in `src/core/` must work on both website and Google Sheets

## Important Patterns
- Check file headers for compatibility notes
- Initialized globals: `params`, `config`, `events`, `revenue`, `uiManager`
- Format values using FormatUtils (currency, percentage)
- Follow existing color coding and status patterns

_Important: Pay special attention to file headers before making changes_
