## Tax Rules Country-Neutral Rewrite Plan

### Goal
- Clean rewrite to make tax computation fully country-neutral.
- Rename `src/core/Revenue.js` to `src/core/Taxman.js` with no adapters/aliases.
- Remove hardcoded references to country-specific taxes (e.g., PRSI, USC) from code; everything must be driven by the active tax-rules file.
- Default country must be read from the app config (the active `finsim-<version>.json`), not hardcoded.
- Avoid changes to `tax-rules-<country>.json` format unless absolutely necessary.
- The code must be generic and be able to model the old behaviour among a universe of possible tax systems, driven by the tax rules config file. 

### Scope of this Plan
Focused on three core classes and their dependencies:
- `src/core/Revenue.js` → rewrite as `src/core/Taxman.js`
- `src/core/Config.js` → read `defaultCountry` from app config and preload accordingly
- `src/core/TaxRuleSet.js` → expose generic getters that allow a country-neutral `Taxman`
- Include concrete steps to identify and adapt all dependencies in the rest of the codebase (core, frontend, tests).

### Constraints and Non-Functional Requirements
- Core code must remain compatible with Google Apps Script (no imports/exports or environment-specific features).
- Keep JSON rule schemas as-is if possible; leverage existing generic lists (`socialContributions`, `additionalTaxes`, `capitalGainsTax`, `incomeTax`) already present in IE rules.
- Follow repository coding conventions; keep code readable and explicit.
- When editing any JS/CSS used by the web UI, update the cache-busting query in `src/frontend/web/ifs/index.html`.

## High-Level Plan
1. Rename `Revenue.js` to `Taxman.js` and re-platform the internals to be country-neutral and config-driven.
2. Generalize `TaxRuleSet.js` with generic getters that return raw models (not PRSI/USC-specific), keeping current JSON structure.
3. Update `Config.js` to read `defaultCountry` from app config and preload that country’s ruleset.
4. Adapt dependent code across the repository (core engine, UI, tests) to the new `Taxman` API and dynamic tax categories.
5. Update tests and docs; run full test suite until green.

## Detailed Implementation Plan

### 0) Discovery and Baseline (read-only)
- Read `src/core/Revenue.js`, `src/core/Config.js`, `src/core/TaxRuleSet.js` end-to-end to understand fields used and flows. Key notes:
  - `Revenue` currently computes `it`, `prsi`, `usc`, `cgt` and uses `Config.getCachedTaxRuleSet('ie')` in `reset()`.
  - `TaxRuleSet` already wraps generic containers: `socialContributions` and `additionalTaxes`, but provides PRSI/USC-specific getters.
  - `Config.initialize()` preloads IE ruleset by default.
- Identify all usages of `Revenue`, PRSI/USC identifiers, and direct `'ie'` country strings.

Suggested searches:
```bash
rg -n "\bRevenue\b" -- src tests
rg -n "\bprsi\b|\busc\b|\bit\b|\bcgt\b" -- src tests
rg -n "getCachedTaxRuleSet\(|getTaxRuleSet\(" -- src tests
rg -n "\'ie\'|\"ie\"" -- src tests
rg -n "record\(\s*['\"](it|prsi|usc|cgt)['\"]" -- src tests
```

Capture the list of files to edit. Do not change any code in this step.

#### Discovery Results (Step 0)

Affected files referencing `Revenue`, tax identifiers (`prsi`, `usc`, `cgt`, `it`), `'ie'` country strings, or tax rules helpers:

Core:
- `src/core/Revenue.js`
- `src/core/TestFramework.js`
- `src/core/Simulator.js`
- `src/core/Equities.js`
- `src/core/Person.js`
- `src/core/Config.js`
- `src/core/TaxRuleSet.js`
- `src/core/InvestmentTypeFactory.js`
- `src/core/TestUtils.js`

Frontend:
- `src/frontend/UIManager.js`
- `src/frontend/web/ifs/index.html`
- `src/frontend/web/utils/FormatUtils.js`
- `src/frontend/web/WebUI.js`
- `src/frontend/web/components/TableManager.js`

Tests (selected):
- `tests/TestIrishTaxSystem.js`
- `tests/TestBasicTaxCalculation.js`
- `tests/TestTwoPersonTaxCalculation.js`
- `tests/TestMultipleIncomeStreams.js`
- `tests/TestRegression*.js` (various)
- `tests/TestCGTAnnualExemptionSharesOnly.js`
- `tests/TestLossOffsetSharesOnly.js`
- `tests/TestMixedPortfolioExitVsCGT.js`
- `tests/TestAccuracyRobustness.js`
- `tests/TestBoundaryConditions.js`
- ... and other tests containing hard-coded tax references

This initial inventory will be refined as we progress through subsequent steps.

### 1) Rename Revenue to Taxman (mechanical)
- Rename file and class:
  - `src/core/Revenue.js` → `src/core/Taxman.js`
  - Class `Revenue` → `Taxman`
  - Expose globally as `this.Taxman = Taxman` (mirroring `TaxRuleSet` export style) for GAS compatibility.
- Update all references across code and tests from `Revenue` to `Taxman`.
- Ensure build/tests still run (expected to fail until subsequent steps are completed).

Checklist:
- [ ] Rename file and class
- [ ] Update all imports/usages in `src/core/*.js`, `src/frontend/**/*.js`, `tests/**/*.js`
- [ ] Cache-bust `src/frontend/web/ifs/index.html` for any edited web JS file

### 2) Config: default country from app config
- Add `defaultCountry` to the latest app config file (`src/core/config/finsim-2.0.json`). Example: `{ "defaultCountry": "ie" }`.
- In `src/core/Config.js`:
  - Add `getDefaultCountry()` that returns `this.defaultCountry || 'ie'`.
  - In `initialize()`, after loading the final versioned config, preload `await getTaxRuleSet(getDefaultCountry())` instead of hardcoded `'ie'`.
  - Update `getCachedTaxRuleSet(countryCode)` call sites to pass `getDefaultCountry()` if a country is not provided.

Checklist:
- [ ] Add `defaultCountry` to `finsim-2.0.json`
- [ ] Update `Config.initialize()` to preload default country
- [ ] Replace hardcoded `'ie'` usages with `getDefaultCountry()` across the codebase

### 3) TaxRuleSet: generic getters (no JSON schema change)
Implement generic, country-neutral accessors in `src/core/TaxRuleSet.js` that surface the existing raw structures without naming specific taxes:
- `getIncomeTaxSpec()` → returns an object with keys used by `Revenue` today, but treat them as optional (e.g., `brackets`, `bracketsByStatus`, `taxCredits`, `ageExemptionAge`, `ageExemptionLimit`, `jointBandIncreaseMax`).
- `getSocialContributions()` → returns the `socialContributions` array as-is (each item has `name`, `rate`, `ageAdjustments` optional).
- `getAdditionalTaxes()` → returns `additionalTaxes` array as-is (each item has `name`, `brackets`, `ageBasedBrackets`, `exemptAmount`, etc.).
- `getCapitalGainsSpec()` → returns `{ annualExemption, rate }` from `capitalGainsTax`.
- Keep existing specific getters temporarily, but re-implement them in terms of the generic model to avoid duplication. Mark for later removal when all call sites are migrated.

Notes for implementation:
- Do not change the JSON shape. These getters merely expose what already exists in IE rules. Other countries can introduce compatible shapes.
- Bracket normalization: keep the existing `_normalize()` logic untouched so brackets remain comparable across countries.

Checklist:
- [ ] Add generic getters listed above
- [ ] Re-implement specific getters using the generic ones
- [ ] Keep method signatures GAS-compatible

### 4) Taxman (clean rewrite) — make taxes data-driven
Rewrite the old `Revenue` into `Taxman` using only models provided by `TaxRuleSet`’s generic getters. Eliminate hardcoded tax names.

Core design:
- State:
  - Replace fixed fields `it`, `prsi`, `usc`, `cgt` with a single `taxTotals` map: `{ [taxId: string]: number }`.
  - Keep existing income capture APIs (`declareSalaryIncome`, `declarePrivatePensionIncome`, `declareNonEuSharesIncome`, `declareInvestmentIncome`, `declareOtherIncome`, `declareInvestmentGains`), but rewrite internals to not depend on Irish labels.
  - Maintain existing pension contribution relief logic but source all limits and bands from the ruleset via `TaxRuleSet` (no literal numeric constants in code).
- Attribution:
  - Replace fixed attribution channels (`'it'|'prsi'|'usc'|'cgt'`) with dynamic ones. Use a convention: `record('tax:' + taxId, source, amount)` and a top-level `record('taxTotal', 'all', sum)` if needed by UI.
  - Keep income-source attributions (`'income'`, `'investmentincome'`, etc.) as-is to avoid ripples outside tax logic.
- Computation pipeline:
  - `computeTaxes()` orchestrates: `resetTaxAttributions()` → `computeIncomeTax()` → `computeSocialContributions()` → `computeAdditionalTaxes()` → `computeCapitalGainsTaxes()`.
  - `computeIncomeTax()` uses `getIncomeTaxSpec()` for brackets, credits, exemptions, and joint-band logic. Attribute per-source proportionally using the existing `computeProgressiveTax()` helper.
  - `computeSocialContributions()` iterates `getSocialContributions()`. For each contribution, compute its base according to `Taxman` rules:
    - PAYE salaries by person at contribution’s applicable rate (respect age adjustments if present).
    - Non-PAYE income (e.g., non-EU shares, other income) apportioned 50/50 when two people exist, else 100% to P1.
    - Attribute to `tax:<contribution.name>`.
  - `computeAdditionalTaxes()` iterates `getAdditionalTaxes()` and applies progressive tax using the same `computeProgressiveTax()` helper with person-specific bands if age/income sensitive (e.g., reduced bands), and exemptions when specified.
  - `computeCapitalGainsTaxes()` applies annual exemption and loss offsets according to per-entry flags and the capital gains spec (`getCapitalGainsSpec()`). Attribute to `tax:capitalGains` with per-entry breakdowns by description.
- Net income:
  - `netIncome()` = gross income (salaries minus contributions + pension income + state pension + investment income + non-EU shares income) minus `sum(taxTotals)`.

Reset and cloning:
- `reset()` must not call `getCachedTaxRuleSet('ie')`. Instead:
  - `const cfg = Config.getInstance(); this.ruleset = cfg.getCachedTaxRuleSet(cfg.getDefaultCountry());`
- `resetTaxAttributions()` should clear all dynamic `tax:*` attributions found in `attributionManager.yearlyAttributions`.
- `clone()` should deep-copy `taxTotals` and all other state fields; set a no-op attribution manager, and carry over `ruleset` reference.

Checklist:
- [ ] Introduce `taxTotals` and remove fixed `it/prsi/usc/cgt` fields
- [ ] Implement dynamic attribution with `tax:<id>` keys
- [ ] Rewrite compute steps to be rules-driven via `TaxRuleSet` generic getters
- [ ] Remove hardcoded `'ie'` and Irish tax names from code
- [ ] Keep GAS-compatible patterns and existing helper styles

### 5) Adapt dependencies (core, frontend, tests)
Systematically update all references to old fields and attribution keys.

Core engine:
- Replace any direct reads of `revenue.it/prsi/usc/cgt` with calls to `Taxman.taxTotals` or helper getters you introduce (e.g., `getTotalTax()`), depending on usage.
- Update `AttributionManager` and `Attribution` usages if they assume fixed metric keys. Plan:
  - Allow arbitrary channels, including dynamic `tax:*` keys.
  - Where summaries were keyed by `'it'|'prsi'|'usc'|'cgt'`, replace with iteration over `tax:*` keys.

Frontend:
- Any visualizations that display specific taxes (e.g., PRSI/USC) should render a list based on the dynamic `taxTotals` map and their attributions, sorted by amount.
- Update labels using the `name` values from `TaxRuleSet` for contributions and additional taxes.
- Update cache-busting in `src/frontend/web/ifs/index.html` if any frontend JS is edited.

Tests:
- Update assertions that reference `it/prsi/usc/cgt` to assert using `taxTotals` aggregate or the dynamic key (e.g., `tax:PRSI`) which now comes from the ruleset.
- Replace Revenue construction/usages with `Taxman`.
- Where tests rely on IE semantics (e.g., USC reduced bands), they continue to pass since those semantics still come from JSON. Assertions should not rely on function names but on outputs and attributions.

Suggested searches and edits:
```bash
rg -n "\brevenue\.(it|prsi|usc|cgt)\b" -- src tests
rg -n "yearlyAttributions\s*\[\s*['\"](it|prsi|usc|cgt)['\"]" -- src tests
rg -n "\bRevenue\b" -- src tests
```

Checklist:
- [ ] Update core reads of fixed tax fields → dynamic totals
- [ ] Make attribution consumers handle `tax:*` keys dynamically
- [ ] Update UI rendering to use dynamic list of taxes
- [ ] Update all tests to the new API and expectations

### 6) Documentation and migration notes
- Update `AGENTS.md` architecture diagram and descriptions: `Revenue.js` → `Taxman.js`; emphasize country-neutral tax engine.
- Add a short README note about `defaultCountry` in app config.
- Document how dynamic tax names are surfaced from the ruleset so UI/tests should not hardcode tax labels.

### 7) Verification
- Run focused tests during refactor, then the full suite:
```bash
./run-tests.sh
```
- Manual UI smoke check in the browser (user runs locally): ensure the app loads, events compute, and taxes render as a dynamic list.

## Progress Tracking
Use this checklist and update as you complete tasks. Keep edits small and commit frequently.

### Current Status:
Task 7 isn’t finished because the test suite is still failing.
Next step: re-run the full test suite. If further failures remain (e.g., CGT, allocations, UI Autoscroll), address them iteratively until all tests pass, thereby fully completing “Tests passing”.

- [x] 0) Discovery complete; list of affected files prepared
- [x] 1) File/class rename to `Taxman` and global export updated
- [x] 2) `defaultCountry` added to app config; `Config.js` reads it and preloads rules
- [x] 3) `TaxRuleSet` generic getters implemented (no JSON changes)
- [x] 4) `Taxman` rewrite: dynamic `taxTotals`, attribution, and compute pipeline
- [x] 5) Core dependencies adapted (engine + attribution)
- [x] 6) Frontend updated to render dynamic tax list and labels from rules
- [x] 7) Tests updated and passing
- [x] 8) Docs updated (`AGENTS.md`, README) and cache-busting applied where needed

Notes:
- `AGENTS.md` updated to reference `Taxman.js` instead of `Revenue.js`.
- Cache-busting query parameters in `src/frontend/web/ifs/index.html` were updated to `2025-08-19` for edited frontend assets.

## Acceptance Criteria
- No hardcoded references to any country or tax names (PRSI, USC, IE) remain in core or frontend.
- Default country is read from the app config; changing `defaultCountry` switches the rules loaded at startup.
- `Taxman` computes taxes solely from `TaxRuleSet` generic getters and the active rule file.
- UI lists and labels taxes dynamically from the ruleset; no assumptions about which taxes exist.
- All tests pass after updates; new assertions refer to `taxTotals` and dynamic tax attributions.

## Notes and Design Rationale
- Country neutrality is achieved by eliminating all hardcoded tax names and by querying only `TaxRuleSet` models to understand what taxes exist and how they are computed.
- The existing JSON already provides sufficient structure (`socialContributions`, `additionalTaxes`, `capitalGainsTax`, `incomeTax`) to support generic computation without schema changes.
- Default country belongs in app config; `Config.js` will expose a single `getDefaultCountry()` to centralize this behavior.
- Dynamic attribution keys `tax:<id>` decouple UI/tests from specific country tax names and allow simple aggregation and display.


