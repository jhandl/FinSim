# Wizard Dynamic Step Country Fix

## Goal

Fix the help-wizard bug where dynamic per-country steps still bind to `StartCountry` instead of the country currently selected in the relevant panel.

This affects dynamic steps generated in [`Wizard.js`](/Users/jhandl/FinSim/src/frontend/web/components/Wizard.js) for:

- `InvestmentAllocation`
- `PensionContribution`
- `PensionContributionP2`
- `PensionContributionCapped`
- `LocalAssetGrowth`
- `LocalAssetVolatility`

The specific `#Inflation_currentCountry` fix is already correct. This note covers the remaining dynamic-step path.

## Root Cause

[`expandDynamicSteps()`](/Users/jhandl/FinSim/src/frontend/web/components/Wizard.js#L103) currently does this once at the top:

- reads `Config.getStartCountry()`
- loads the ruleset for that start country
- expands all dynamic selectors from that one country

That is wrong once country tabs are unsynced. The visible UI may be showing:

- `allocations = ar`
- `growthRates = uk`
- `StartCountry = ie`

but the wizard still expands selectors for `ie`.

## Required Change

### 1. Resolve the country per step, not once per expansion pass

Add a helper in [`Wizard.js`](/Users/jhandl/FinSim/src/frontend/web/components/Wizard.js) that determines the active country for the specific step being expanded.

Use the panel currently associated with the step:

- `allocations` panel for:
  - `InitialCapital`
  - `InvestmentAllocation`
  - `PensionContribution`
  - `PensionContributionP2`
  - `PensionContributionCapped`
- `growthRates` panel for:
  - `GlobalAssetGrowth`
  - `GlobalAssetVolatility`
  - `LocalAssetGrowth`
  - `LocalAssetVolatility`

Fallback to `Config.getStartCountry()` only if no panel-selected country exists yet.

Suggested shape:

```js
_getDynamicStepCountry(step, fieldType) {
  const config = Config.getInstance();
  let panelId = null;
  const card = String(step && step.card || '').toLowerCase();

  if (card === 'allocations') panelId = 'allocations';
  else if (card === 'growthrates') panelId = 'growthRates';
  else if (fieldType === 'InitialCapital' ||
           fieldType === 'InvestmentAllocation' ||
           fieldType === 'PensionContribution' ||
           fieldType === 'PensionContributionP2' ||
           fieldType === 'PensionContributionCapped') panelId = 'allocations';
  else if (fieldType === 'GlobalAssetGrowth' ||
           fieldType === 'GlobalAssetVolatility' ||
           fieldType === 'LocalAssetGrowth' ||
           fieldType === 'LocalAssetVolatility') panelId = 'growthRates';

  const webUI = (typeof WebUI !== 'undefined' && WebUI.getInstance) ? WebUI.getInstance() : null;
  const selected = panelId && webUI && webUI.countryTabSyncManager &&
    typeof webUI.countryTabSyncManager.getSelectedCountry === 'function'
      ? webUI.countryTabSyncManager.getSelectedCountry(panelId)
      : null;

  return String(selected || config.getStartCountry() || '').toLowerCase();
}
```

### 2. Stop using one top-level `activeCountry` in `expandDynamicSteps()`

In [`expandDynamicSteps()`](/Users/jhandl/FinSim/src/frontend/web/components/Wizard.js#L103):

- remove the top-level `const activeCountry = config.getStartCountry();`
- remove the top-level `const ruleset = config.getCachedTaxRuleSet(activeCountry);`
- remove the top-level `investmentTypes` derived from the start-country ruleset

Instead, inside each `step.dynamicInvestmentField` branch:

- compute `const activeCountry = this._getDynamicStepCountry(step, fieldType);`
- when wrappers are needed, load `const ruleset = config.getCachedTaxRuleSet(activeCountry);`
- derive `investmentTypes` from that country-specific ruleset

This keeps expansion aligned with the country currently shown in that panel.

### 3. Build selectors from the per-step country

Use the resolved country when generating selectors:

- `#InvestmentAllocation_${activeCountry}_${baseKey}`
- `#P1PensionContrib_${activeCountry}`
- `#P2PensionContrib_${activeCountry}`
- `#PensionCappedToggle_${activeCountry}`
- `#LocalAssetGrowth_${activeCountry}_${baseKey}`
- `#LocalAssetVolatility_${activeCountry}_${baseKey}`

For `InvestmentAllocation`, keep generating both variants if needed:

- legacy/no-relocation shape: `#InvestmentAllocation_${type.key}`
- canonical per-country shape: `#InvestmentAllocation_${activeCountry}_${baseKey}`

`filterValidSteps()` can continue filtering out whichever selector is not present.

### 4. Do not try to fix this only in `resolveDynamicStepSelector()`

[`resolveDynamicStepSelector()`](/Users/jhandl/FinSim/src/frontend/web/components/Wizard.js#L623) is the right place for fixed placeholder selectors like:

- `#Inflation_currentCountry`
- `#StatePension_currentCountry`
- `#P2StatePension_currentCountry`
- `#TaxCredit_personal_currentCountry`

It is not sufficient for dynamic investment steps because those steps already depend on the country-specific wrapper list chosen during expansion.

## Test Changes

### 1. Update the mirrored helper in the Jest test

[`tests/TestHelpWizard.test.js`](/Users/jhandl/FinSim/tests/TestHelpWizard.test.js) contains its own copied implementation of `expandDynamicSteps()`.

That mirrored test helper must be updated to match production logic, or the test file will stop validating the real behavior.

### 2. Add panel-selection regression coverage

Add focused tests in [`tests/TestHelpWizard.test.js`](/Users/jhandl/FinSim/tests/TestHelpWizard.test.js):

#### Growth-rates panel case

- `StartCountry = ie`
- `countryTabSyncManager.getSelectedCountry('growthRates') => 'ar'`
- `countryTabSyncManager.getSelectedCountry('allocations') => 'ie'`
- provide different resolved investment types for `ie` and `ar`
- verify `LocalAssetGrowth` expands to `#LocalAssetGrowth_ar_<baseKey>`
- verify `LocalAssetVolatility` expands to `#LocalAssetVolatility_ar_<baseKey>`

#### Allocations panel case

- `StartCountry = ie`
- `countryTabSyncManager.getSelectedCountry('allocations') => 'ar'`
- verify:
  - `InvestmentAllocation` expands to `#InvestmentAllocation_ar_<baseKey>` for canonical per-country selectors
  - `PensionContribution` expands to `#P1PensionContrib_ar`
  - `PensionContributionP2` expands to `#P2PensionContrib_ar`
  - `PensionContributionCapped` expands to `#PensionCappedToggle_ar`

### 3. Keep the current fixed-selector test coverage

Do not remove the current-country placeholder coverage for:

- `#Inflation_currentCountry`
- `#StatePension_currentCountry`
- `#P2StatePension_currentCountry`
- `#TaxCredit_personal_currentCountry`

That fix is separate and already correct.

## Validation

Run at least:

```bash
./run-tests.sh TestHelpWizard
./run-tests.sh TestWebUIInvestmentParams
./run-tests.sh TestUIManagerPriorityDynamicIds
```

If any help-step selector logic is touched beyond this, also re-run:

```bash
./run-tests.sh TestWizardFilterValidSteps
```

## Acceptance Criteria

- Dynamic help steps no longer assume `StartCountry`
- Allocations help follows the selected `allocations` country tab
- Growth-rates help follows the selected `growthRates` country tab
- Unsynced tabs do not cause help steps to point at another panel's country
- Existing fixed `*_currentCountry` selectors keep working
