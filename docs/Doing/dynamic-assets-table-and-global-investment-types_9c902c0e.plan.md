---
name: dynamic-assets-table-and-global-investment-types
overview: Make the assets section of the data table dynamic across countries and hook IE/AR investment types into the global investment base types.
todos:
  - id: taxrules-global-merge
    content: Verify existing TaxRuleSet/Config support for investmentBaseTypes via baseRef (no new JS expected); focus changes on JSON configs using baseRef.
    status: pending
  - id: country-rules-reference-global
    content: Update tax-rules-ie.json and tax-rules-ar.json investmentTypes to reference global base types via baseRef while preserving local overrides.
    status: pending
  - id: dynamic-assets-section
    content: Make the assets section of the data table dynamic per country/period using DynamicSectionsConfig and TableManager.
    status: pending
  - id: bind-capital-to-dynamic-columns
    content: Wire investmentCapitalByKey into dynamic Capital__* table columns and ensure CSV export includes them.
    status: pending
  - id: union-investment-types-ui
    content: Remove/neutralize WebUI.applyDynamicColumns manual Capital__* header injection once assets are dynamic sections, to avoid dual sources of truth.
    status: pending
  - id: tests-and-demo3b-validation
    content: Add/adjust tests and manually validate demo3b for correct AR and IE asset display and export.
    status: pending
---

### Dynamic Assets Table & Global Investment Types Plan

#### 1. Understand current investment type plumbing

- **Read `TaxRuleSet` investment APIs**: Focus on how `getResolvedInvestmentTypes()`, `findInvestmentTypeByKey()`, and any existing reference mechanisms (e.g. `rateRef`, `annualExemptionRef`) are implemented in [`src/core/TaxRuleSet.js`](src/core/TaxRuleSet.js).
- **Review global tax rules**: In [`src/core/config/tax-rules-global.json`](src/core/config/tax-rules-global.json), confirm how `investmentBaseTypes` are intended to be used (e.g. common metadata for cross-country funds like `globalEquity`, `globalBonds`).
- **Confirm country rule usage**: In [`src/core/config/tax-rules-ie.json`](src/core/config/tax-rules-ie.json) and [`src/core/config/tax-rules-ar.json`](src/core/config/tax-rules-ar.json), map how `investmentTypes` are currently defined and where they should inherit/alias global base types instead of duplicating hardcoded fields.

#### 2. Introduce global-based investment type resolution

- **Confirm existing implementation**:
- `TaxRuleSet.getResolvedInvestmentTypes()` already supports inheritance via `type.baseRef`, performing a shallow merge of `{...base, ...local}`.
- `Config.getInvestmentBaseTypeByKey(baseKey)` already loads the base definitions from `src/core/config/tax-rules-global.json`.
- **Update country rule files to use `baseRef` (not `baseKey`)**:
- In IE and AR `investmentTypes`, add `baseRef: "<global baseKey>"` for any type that should inherit common metadata (e.g. global USD ETF base type).
- Keep country-specific overrides (labels, taxation blocks, deemed disposal, etc.) in the local type; rely on merge order (local overrides base).
- Validate that any `baseRef` strings correspond to an existing `investmentBaseTypes[].baseKey` entry in `tax-rules-global.json`.

#### 3. Make the assets section of the data table dynamic across countries

- **Audit current assets columns**: In `TableManager`, `DynamicSectionsConfig`, and `WebUI.applyDynamicColumns`, document how the assets group is currently rendered:
- Fixed columns for `RealEstateCapital`, `PensionFund`, `Cash`.
- Dynamic `Capital__*` columns driven by StartCountry investment types only (current behavior observed in `WebUI.applyDynamicColumns`).
- **Define a dynamic "assets" section config**:
- Extend [`src/frontend/web/components/DynamicSectionsConfig.js`](src/frontend/web/components/DynamicSectionsConfig.js) with a section definition for assets that:
- Anchors on `RealEstateCapital`.
- Includes fixed entries (`RealEstateCapital`, `PensionFund`, `Cash`).
- Appends dynamic `Capital__{key}` columns for the union of resolved investment types across cached rulesets (same approach used by the `grossIncome` section for `Income__*`).
- **Use per-period country context for dynamic assets**:
- In `TableManager._buildRowBlueprint()`, when building the assets section, pass in the country for that period (same way as gross-income dynamic sections use rulesets) so that relocation years can show AR asset keys when resident in AR.
- Ensure that `DynamicSectionsManager.getColumnsFor('assets', { countryCode })` uses rulesets that are already cached by the simulator run (post `Config.syncTaxRuleSetsWithEvents()`), so it can render AR types after relocation.

#### 4. Ensure the table rows expose dynamic asset values correctly

- **Verify nominal data source**: Confirm that `DataAggregatesCalculator` already writes `investmentCapitalByKey` for all investment types in [`src/core/DataAggregatesCalculator.js`](src/core/DataAggregatesCalculator.js).
- **Bind capital map into table rendering**:
- In `TableManager.setDataRow`, ensure dynamic keys are sourced from the correct maps:
- For keys `Income__{invKey}` use `data.investmentIncomeByKey[invKey]`.
- For keys `Capital__{invKey}` use `data.investmentCapitalByKey[invKey]`.
- Continue to use `data[key] `for fixed keys (e.g. `PensionFund`, `Cash`, `RealEstateCapital`).
- Ensure the `data-nominal-value` / `data-pv-value` attributes reflect the *pre-conversion* numeric value so that unified/PV refresh remains correct.
- Confirm that for periods where a given key has zero capital, the dynamic section either hides the column (via zero-hide config) or shows explicit zeros, matching existing UX.
- **Update export logic**:
- Check how the CSV export for the data table obtains column headers and row cells (likely via `TableManager.getTableData()` in conjunction with DOM headers).
- Make sure that dynamic `Capital__*` columns are also exported, so IE and AR holdings are visible in CSV.

#### 5. Rebuild dynamic column selection and visibility for multi-country assets

- **Remove the redundant/fragile manual header injection path**:
- `WebUI.applyDynamicColumns()` currently manually inserts `th[data-key^="Capital__"]` and tweaks header group colspans.
- Once the `assets` section is implemented as a dynamic section (like `grossIncome`), this becomes a second source of truth and can conflict with TableManager’s blueprint/dynamic rendering.
- Plan the refactor so the table headers are driven by `DynamicSectionsConfig` + `TableManager` only. Keep `WebUI.applyDynamicColumns()` either removed or limited to chart label updates (no table DOM mutations).
- **Align visibility heuristics with new assets section**:
- Update `WebUI.getIncomeColumnVisibility()` so that investment income keys and their capitals from AR (and any other country) can be auto-pinned when non-zero.
- Keep behavior consistent: dynamic assets columns should appear only when there’s meaningful data, but must not disappear mid-run when relocating.

#### 6. Testing & validation

- **Core behavior**:
- Update or add a focused core test under `tests/` that:
- Seeds both IE and AR investment holdings.
- Verifies that `investmentCapitalByKey` includes both `indexFunds_ie`, `shares_ie`, `indexFunds_ar`, `shares_ar` after savings are invested.
- Add a small unit test or snapshot-like test for `TaxRuleSet` that confirms base-type merging from `tax-rules-global.json` into IE/AR `investmentTypes`.
- **UI behavior**:
- For the `demo3b` scenario:
- Verify visually that the assets section shows AR capital columns (e.g. `Global USD ETF (AR)` or similar) with non-zero amounts after retirement.
- Export the data table and confirm that the CSV contains those columns with matching values.
- **Regression guardrails**:
- Re-run existing tests that touch investments and relocation (`TestPVMultiCountryDeflation`, `TestInvestmentAllocationStrategy`, `TestMultiCurrencySimulation`, etc.) to ensure global base type merging and dynamic assets columns don’t change core semantics.

#### 7. Implementation tracking

- **Task breakdown**:
- Verify `TaxRuleSet` + `Config` already support `investmentBaseTypes` + `baseRef` merging; avoid duplicating work.
- Modify IE and AR tax rules to reference global base types via `baseRef`, keeping local overrides.
- Make assets section dynamic in `DynamicSectionsConfig` and `TableManager` for per-country/per-period columns.
- Remove/neutralize `WebUI.applyDynamicColumns` table DOM injection once dynamic assets section is live (avoid dual sources of truth).
- Extend tests and manual checks for `demo3b` and relocation scenarios.
- **Progress updates**:
- After each of the above bullets, validate both core output (dataSheet / tests) and UI behavior (table + export) before moving to the next.