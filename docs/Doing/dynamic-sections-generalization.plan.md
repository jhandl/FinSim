# Dynamic Sections Generalization (Beyond Deductions)

## Summary
FinSim currently uses a “dynamic section” mechanism (flexbox inside a single `colSpan` cell) to render the **Deductions** group with a country-dependent set of tax columns. Some parts of the implementation still assume the section is Deductions (e.g., key classification and empty-state sizing logic that mentions `PensionContribution`).

This plan refactors the system so **multiple table sections** (e.g., Deductions now, Income soon) can be dynamic using the same infrastructure, without hard-coded keys or Deductions-specific naming.

## Goals
- Support **N dynamic sections** simultaneously (not just Deductions).
- Eliminate **hard-coded section identity** in generic logic (no `PensionContribution`/`Tax__*` assumptions in section plumbing).
- Keep the existing Dynamic Sections behavior identical:
  - Pre-sim empty table: headers distribute nicely (no bunching, no overflow).
  - Post-sim: widths are data-driven via `DynamicSectionManager.finalizeSectionWidths(...)`.
- Add **residence-period-aware zero-column hiding** for selected dynamic columns (e.g., hide `P.Contrib` within a period when all values are zero in that period).
- Make it easy to add a new dynamic section by adding config, not new plumbing.
- **Single dynamic-path rule:** treat non-relocation scenarios as “relocation with one country.” Dynamic sections always run through the same code path, regardless of relocation being enabled. The only UI divergence remains the Natural/Unified currency toggle.

## Non-goals (for this refactor)
- Changing tax column semantics or ordering rules.
- Changing the relocation/tax timeline logic.
- Changing the table’s group header HTML structure beyond adding `data-group` hooks as needed.

## Current State (What’s Deductions-Specific Today)
- Dynamic section key identification is Deductions-shaped (`PensionContribution` + `Tax__*`).
- Column insertion and anchoring uses `PensionContribution` as the insertion pivot for taxes.
- Empty-state layout has a `PensionContribution` special-case to avoid “just-fit” tightness.
- `DynamicSectionManager` is always initialized during simulation rows and is constructed with `DEDUCTIONS_SECTION_CONFIG` (the primary source of deductions columns).
- `TableManager` still contains defensive branches that fall back to `DEDUCTIONS_SECTION_CONFIG` when the manager isn’t initialized (not relocation-gated).

## Target Architecture

### A) Section Config (Source of Truth)
Define a registry of dynamic sections, each describing:
- `id`: e.g., `deductions`, `income`
- `groupKey`: matches `thead tr.header-groups th[data-group="..."]`
- `getColumns(context)`: returns ordered `{ key, label, tooltip }[]` for the section
- `placement`:
  - **Option 1 (recommended initially):** section is a contiguous region in the table, and dynamic columns replace/augment a known static region.
  - **Option 2:** anchor-based insertion (`anchorKey`) where dynamic columns are inserted after a static column.
- `emptyStateSizing` policy:
  - default: flex-fill, weighted by label width
  - optional per-key minimums (generic, not hard-coded), e.g. `{ minLabelWidthKeys: ['PensionContribution'], minLabelPaddingPx: 4 }`
- `periodZeroHideKeys`:
  - optional list of column keys that should be **hidden per residence period** if all values are zero in that period
  - applies only to dynamic sections and only to keys listed here

### B) Managers
Keep `DynamicSectionManager` as a **single-section** manager.

Add a new `DynamicSectionsManager` that owns one `DynamicSectionManager` per registered section:
- `calculateMaxWidths(instance)` (uses events + startCountry timeline logic once, then per section computes max columns)
- `getColumnsFor(sectionId, context)`
- `getMaxColumnCount(sectionId)`
- `finalizeAllSectionWidths(tbody)` (calls each section manager)

### C) Table Rendering
Refactor `TableManager` so:
- It renders dynamic sections by **iterating the registry**, not by “deductions logic”.
- Each dynamic section gets:
  - a `.dynamic-section-container[data-section="..."]` cell with correct `colSpan`
  - a `.dynamic-section-flex` container
  - a `.dynamic-section-cell[data-key="..."]` per dynamic column
- Empty-state sizing is applied per section container based on that section’s policy.

## Implementation Plan (Incremental, Keep App Working)

### Phase 1 — Introduce Config + Multi-section Manager (No Behavior Change)
1. Add `src/frontend/web/components/DynamicSectionsConfig.js`
   - Export a `DYNAMIC_SECTIONS` registry (initially contains only Deductions).
   - Provide helpers like `getDynamicSection(id)` and `listDynamicSections()`.
2. Add `src/frontend/web/components/DynamicSectionsManager.js`
   - Holds `Map<sectionId, DynamicSectionManager>`.
   - Initializes from `DYNAMIC_SECTIONS`.
3. Wire `TableManager` to create `this.dynamicSectionsManager` (instead of a single `dynamicSectionManager`) **unconditionally**.
   - Always compute unique countries from the events table; when relocation is disabled this should resolve to a single start country.
   - Remove defensive fallback paths to `DEDUCTIONS_SECTION_CONFIG` so there is only one dynamic path.

### Phase 2 — Generic Rendering in TableManager
4. Refactor dynamic section identification and rendering:
   - Replace Deductions-specific “is this a dynamic-section key?” logic with:
     - section-aware key membership (derive from `getColumnsFor(sectionId, context)`).
   - Replace Deductions-only group header `colSpan` updates with:
     - `for each section: find group th via data-group; set colSpan = maxColumnsFor(sectionId)`
5. Generalize the header-row builder:
   - Rename/refactor `_createTaxHeaderRow(country, age)` so it builds dynamic section header cells based on the registry.
   - Keep the `tr.tax-header` class if it still represents “sticky header per country” (that’s orthogonal to section generality).
   - Do not branch on relocation enabled/disabled; the same header path applies in both cases.

### Phase 3 — Empty-state Sizing Policy (Config-driven)
6. Move the empty-state logic to be section-generic:
   - A helper like `_applyEmptyStateFlexLayout(containerEl, sectionPolicy)` that:
     - applies weighted `flex-grow` based on label width
     - optionally applies per-key min label width (from policy)
     - avoids any hard-coded key names
7. Convert the current `PensionContribution` special-case into a config rule on the Deductions section:
   - e.g., `emptyStateSizing: { minLabelWidthKeys: ['PensionContribution'], minLabelPaddingPx: 4 }`

### Phase 4 — Per-Period Zero-Column Hiding (Selected Keys Only)
8. Extend dynamic section sizing/column selection to support **per-residence-period** zero-only detection.
   - For each residence period, compute whether a `periodZeroHideKeys` column has any non-zero values.
   - If not, omit that column **only for that period** (other periods still show it if non-zero).
9. Ensure this applies **only** to keys listed in `periodZeroHideKeys` (e.g., `PensionContribution` / `P.Contrib`), not all dynamic columns.

### Phase 5 — Remove Legacy Assumptions
10. Delete/rename any remaining “deductions” variable/function names in generic code paths.
11. Ensure `DynamicSectionManager.finalizeSectionWidths(...)` continues to override empty-state flex styles (as it does now).
12. Remove defensive fallback paths that bypass the dynamic manager.

## Task List (Concrete Checklist)

### New files
- [ ] `src/frontend/web/components/DynamicSectionsConfig.js`
- [ ] `src/frontend/web/components/DynamicSectionsManager.js`

### Refactors
- [ ] `src/frontend/web/components/TableManager.js`: replace single-section plumbing with registry iteration
- [ ] `src/frontend/web/components/TableManager.js`: make empty-state sizing config-driven (no hard-coded keys)
- [ ] `src/frontend/web/components/DynamicSectionManager.js`: keep single-section focus; ensure no assumptions about “Deductions” beyond config name
- [ ] `src/frontend/web/components/TableManager.js`: compute per-period zero-only visibility for `periodZeroHideKeys`

### HTML/CSS hooks (as needed)
- [ ] If adding Income as dynamic later: add `data-group="income"` to the Gross Income group header cell in `src/frontend/web/ifs/index.html`
- [ ] Keep `.dynamic-section-*` CSS generic; add only section-specific selectors if required by policy

### Cache busting
- [ ] Update `src/frontend/web/ifs/index.html` script cache-busters for any changed JS/CSS files.

### Validation
- [ ] Manual: initial page load (pre-sim) dynamic headers distribute properly
- [ ] Manual: post-sim run dynamic headers align and are right-aligned
- [ ] Manual: relocation scenario (multi-country) still shows correct per-country dynamic headers
- [ ] Tests: `./run-tests.sh -t jest` (note any pre-existing unrelated failures)

## Follow-on: Make Income Dynamic
Once the refactor lands, adding a new dynamic section should be config-only:
- Add an `income` entry in `DYNAMIC_SECTIONS`
- Define its `groupKey`, `getColumns(...)`, and placement rule
- Verify the header group `colSpan` and ordering match expectations
