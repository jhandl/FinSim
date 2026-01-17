## Data Table Model (as-built) — Header Keys, Countries, and Lifecycles

This document is a **system map**. It describes how the data table currently works, and what “dynamic” means in this codebase.

---

### 1) One “dynamic” table system: Dynamic Sections (flexbox inside a single anchor cell)

Dynamic table columns (income, deductions/tax, and assets) are rendered via **dynamic sections**.

- Owner chain:
  - `TableManager.dynamicSectionsManager` → `DynamicSectionsManager` → `DynamicSectionManager`
  - Schema source: `DYNAMIC_SECTIONS` in `DynamicSectionsConfig.js`
- How it works:
  - `TableManager._buildRowBlueprint(countryCode)` reads the current **visible** main header row (`#Data thead tr:last-child th[data-key]`).
  - If any header key matches `anchorKey` of a configured dynamic section (e.g. `GrossIncome`, `PensionContribution`), that header slot becomes a **section slot**:
    - In tax header rows: a single `<th class="dynamic-section-container" data-section="...">` with `colspan=maxCols`, containing a flexbox of virtual header cells (`.dynamic-section-cell[data-key]`).
    - In data rows: a single `<td class="dynamic-section-container" data-section="...">` with `colspan=maxCols`, containing a flexbox of value cells (`.dynamic-section-cell[data-key]`), each carrying `data-nominal-value` (and optionally `data-pv-value`).
  - `DynamicSectionManager.finalizeSectionWidths()` later normalizes widths across “periods” (between tax headers).

There is **no** main-header `<th>` injection for dynamic investment columns. Dynamic “columns” exist as flex items inside the section container cells.

Configured dynamic sections (as-built):
- `grossIncome` (anchor: `GrossIncome`)
- `deductions` (anchor: `PensionContribution`)
- `assets` (anchor: `RealEstateCapital`)

---

### 2) Key schema (what kinds of keys exist)

The concrete key set is country-dependent, but the key *classes* are stable:

- **Fixed base keys (static HTML `<th>` keys)**
  - Example: `Age`, `Year`, `GrossIncome`, `PensionContribution`, `NetIncome`, `Expenses`, `Cash`, `Worth`, etc.
  - Note: `GrossIncome` and `PensionContribution` are **anchor keys** (placeholders) in `src/frontend/web/ifs/index.html`. They are replaced at render time by dynamic sections.

- **Dynamic investment income keys (resolved investment types) — rendered inside the Gross Income dynamic section**
  - Form: `Income__${resolvedInvestmentType.key}`
  - Source of keys:
    - `DynamicSectionsConfig` builds Gross Income columns from fixed income keys plus `Income__*`.
    - `Income__*` is built from the **union of investment types across cached rulesets** (so relocated periods can still display income for asset keys originating in a different ruleset).

- **Dynamic investment capital keys — rendered inside the Assets dynamic section**
  - Form: `Capital__${resolvedInvestmentType.key}`
  - Source of keys: `DynamicSectionsConfig` builds Assets columns from fixed asset keys plus `Capital__*` from the **union of investment types across cached rulesets**.
  - Visibility: the assets section pins `PensionFund`, `Cash`, and `RealEstateCapital`; `Capital__*` keys are shown only when non-zero within the residence period.

- **Dynamic tax keys — rendered inside the Deductions dynamic section**
  - Form: `Tax__${taxId}`
  - Source of keys: `taxRuleSet.getTaxOrder()` for the relevant country.

---

### 3) Country set: where “which countries are involved” comes from

There are two separate country sets used in the table lifecycle:

#### A) “Initialization/empty-state” country set
- Derived from the default cached ruleset:
  - `Config.getInstance().getCachedTaxRuleSet()` (no explicit countryCode)
- Used by:
  - Initial visibility: pinned-only map is built from `taxRuleSet.getPinnedIncomeTypes()` and stored on `TableManager` as `_lastColumnVisibilityMap`.

#### B) “Simulation/relocation” country set
- Derived from the scenario’s event set:
  - `DynamicSectionsManager.initialize(instance)` calls `UIManager.readEvents(false)` and `getUniqueCountries(events, startCountry)`
- Used by:
  - dynamic section caches: per-country column definitions and max column counts for flexbox section rendering.

Separately, per-row rendering chooses the “current country” based on age:
- `RelocationUtils.getCountryForAge(data.Age, webUI)` (or default country)

---

### 4) Lifecycle: what runs when

#### Empty state / initial render
- The main header row is static HTML and includes **anchor keys** for dynamic sections (`GrossIncome`, `PensionContribution`, `RealEstateCapital`).
- An empty (pre-run) tax-header row is created via a minimal `TableManager.setDataRow(0,{})` trigger so dynamic section headers exist before a simulation run.
- The “pinned-only” visibility state is initialized in `TableManager.setDataRow()` by reading `taxRuleSet.getPinnedIncomeTypes()` and storing a lowercase visibility map (`_lastColumnVisibilityMap`).
- Pre-run header label distribution is handled by `TableManager._applyEmptyStateFlexLayoutToDynamicSectionHeaderRow(...)`.
- Width finalization is intentionally skipped pre-run (no data rows) so empty-state header flex distribution is not overridden.

#### After running a simulation
- `TableManager.setDataRow()` inserts tax header rows as country changes:
  - `_createTaxHeaderRow(country, age)` uses `_buildRowBlueprint(country)` to decide where dynamic sections appear.
- End-of-run visibility is applied via `TableManager.applyIncomeVisibilityAfterSimulation()` (back-compat entrypoint):
  - uses `WebUI.getIncomeColumnVisibility()` (scans `dataSheet` keys and also `investmentIncomeByKey`)
  - stores the result on `TableManager` (`_lastColumnVisibilityMap`) and applies it to the chart
  - applies per-period visibility inside dynamic sections via `DynamicSectionVisibilityEngine` (for sections with `enableVisibilityEngine=true`, currently `grossIncome` and `assets`)
  - applies additional “hide-if-all-zero-in-period” rules for sections without the visibility engine (e.g. `deductions` hides `PensionContribution` when all-zero for a period)
  - finalizes widths via `DynamicSectionManager.finalizeSectionWidths()`

---

### 5) Worked examples (key generation, not fixed lists)

#### Example 1 — IE-only scenario
- Default cached ruleset: `ie`
- Investment types: `taxRuleSet('ie').getResolvedInvestmentTypes()` returns keys like:
  - `indexFunds_ie`, `shares_ie` (and potentially others)
- Gross Income tax-header row (via dynamic sections):
  - Renders fixed income keys plus `Income__*` inside the `grossIncome` section (anchor `GrossIncome`)
- Assets tax-header row (via dynamic sections):
  - Renders `PensionFund`, `Cash`, `RealEstateCapital`, plus `Capital__*` inside the `assets` section (anchor `RealEstateCapital`)

#### Example 2 — IE → AR relocation scenario
- During simulation:
  - `DynamicSectionsManager.initialize()` precomputes section column sets for countries in the scenario (`ie`, `ar`).
  - As `RelocationUtils.getCountryForAge(...)` flips at MV age, tax header rows (and any dynamic sections) switch per-country definitions.
- Gross Income dynamic section uses the union of investment types across cached rulesets so that income keys originating in a previous ruleset can still appear (and be hidden/shown by the visibility engine).
 - Assets dynamic section uses the union of investment types across cached rulesets so that capital keys originating in a previous ruleset can still appear (and be hidden/shown by the visibility engine).

---

### 6) Implication for “Phase 3”

Phase 3 must be defined in terms of the **current ownership model**:
- Income, deductions/taxes, and assets are all driven by dynamic sections anchored at `GrossIncome`, `PensionContribution`, and `RealEstateCapital`.
- Any Phase 3 change that removes or bypasses either system must fully replace its responsibilities (header mutation for assets; section rendering/visibility/width normalization for income+tax).

Therefore, before implementing Phase 3, we must decide:
- How to evolve the dynamic section model while preserving its key invariants:
  - per-residence-period visibility (pinned keys + “hide if all-zero in period”)
  - width stability within a residence period
  - empty-state header distribution without forcing all potential columns visible

