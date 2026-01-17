## Phase 3 — Gross Income as a Dynamic Section (Contract + Implementation Guide)

This document exists to prevent repeated Phase 3 failures (broken empty-state header layout, broken post-run alignment, missing dynamic `Income__*` columns).

It captures the *actual* table architecture and the non‑negotiable invariants Phase 3 must preserve.

---

### 1) Critical as-built facts (why Phase 3 is hard today)

- `TableManager._buildRowBlueprint(countryCode)` only creates dynamic sections for anchors that **still exist** in the (visible) main header row (`#Data thead tr:last-child th[data-key]`).
- `WebUI.applyDynamicColumns()` is called during the first `TableManager.setDataRow()` and removes the legacy investment income anchors:
  - `IncomeFundsRent`
  - `IncomeSharesRent`
- Therefore, with the current as-built code, the `investmentIncome` dynamic section (anchored to `IncomeFundsRent`) does **not** render in:
  - tax header rows (`_createTaxHeaderRow`)
  - data rows (row blueprint)

Implication: Phase 3 cannot be “swap an anchor for just investment income” without fighting the existing header-mutation system.

**Phase 3 is redefined as an architectural migration:** the entire **Gross Income** group becomes a dynamic section, so:
- investment income is no longer a special case,
- “hide all-zero within a residence span” becomes a generic dynamic-section feature,
- we can remove the income `<th>` injection / row rebuild logic as legacy.

---

### 2) Non‑Negotiable Invariants (must hold before and after simulation)

#### Empty state (no scenario loaded / not run)
- The main header row’s Gross Income section is *pinned/minimal* and matches the intended screenshot:
  - Age, Year
  - Gross Income visually spans from Salaries → … → Cash (no extra group headers)
  - Pinned/minimal visibility rules remain intact (ruleset + pinned-types dependent)
  - deductions anchor(s) (P.Contrib only, no dynamic Tax__ columns yet)
  - NetIncome/Expenses + Assets etc remain aligned under their group headers

#### Post-run (after a simulation run)
- Gross Income renders via dynamic section columns, including:
  - fixed income columns (Salaries/Rentals/RSUs/P.Pension/S.Pension/DBI/Tax Free)
  - investment income columns as dynamic `Income__${resolvedKey}` columns
  - IncomeCash
- Within each residence span (“period” between tax headers), investment income types that are zero for **every year in that span** are **hidden** (not rendered/visible in that span).
- “Gross Income” / “Deductions” / “Net Cashflow” / “Assets” groups remain aligned:
  - group headers’ `colspan` matches the number of visible columns they span
  - group boundaries are correct (no “Cash” under Deductions)
- Visibility toggles hide/show:
  - fixed income `<th>` using the existing mechanisms (as-built)
  - investment income visibility works via dynamic section cells (`.dynamic-section-cell[data-key="Income__..."]`)

---

### 3) Current Ownership Map (where each responsibility lives)

- **Main header row topology**: `src/frontend/web/ifs/index.html` + `WebUI.applyDynamicColumns()`
  - HTML defines the starting skeleton.
  - `applyDynamicColumns()` mutates it based on ruleset types + visibility.

- **Dynamic section column virtualization**: `DynamicSectionsConfig.js` + `DynamicSectionsManager` + `TableManager._buildRowBlueprint()`
  - Dynamic columns do **not** exist as `<th>`.
  - A dynamic section only renders when its `anchorKey` exists in the main header row.

- **Empty-state “pinned income” behavior**: `TableManager.setDataRow()` (first time only)
  - As-built: calls `WebUI.applyDynamicColumns(types, initialVisibility)` with the default cached ruleset.

- **Post-run visibility**:
  - `WebUI.getIncomeColumnVisibility()` computes which `income__...` keys are visible.
  - `TableManager.applyIncomeVisibilityAfterSimulation()` applies it:
    - calls `WebUI.applyDynamicColumns(investmentTypes, incomeVisibility)` (as-built)
    - may also hide/show dynamic-section cells for `Income__...` if investment income is rendered via dynamic section.

- **Group colspans are managed by two systems**:
  - `WebUI.applyDynamicColumns()` recomputes at least “Gross Income” and “Assets”.
  - `TableManager._updateDynamicSectionGroupColSpans()` updates group colspans for dynamic sections (e.g. Deductions), and can therefore affect alignment outside of `applyDynamicColumns()`.

---

### 4) Phase 3 Implementation Steps (redefined)

Goal: **Gross Income** is rendered inside an anchor cell by dynamic sections (not via `<th>` injection), eliminating the income header-mutation path.

#### Safe rollout sequence (no big-bang)
1. Add dynamic-section config flags (border policy + selective hide) with defaults that preserve current behavior.
2. Add the `grossIncome` dynamic section config without wiring it to the header yet.
3. Make border/colspan computation blueprint-aware while still supporting the current `<th>` layout.
4. Add the Gross Income anchor in HTML **alongside** existing income headers; verify no UI change.
5. Flip the blueprint to use the anchor and render Gross Income as a dynamic section, then remove the old `<th>` income columns and stop income `<th>` injection.

#### Step 4.1 — Add required generic dynamic-section capabilities (no UI behavior change yet)
- **Per-section “thick border” policy**
  - Some dynamic sections are internal to a top-level group (e.g. Gross Income) and must **not** force a thick right border.
  - Others are true group boundaries (e.g. Deductions) and should keep the thick border.
  - This must be expressible in `DYNAMIC_SECTIONS` config (e.g. `isGroupBoundary: true|false`), and honored by the tax-header row builder.

- **Per-period “hide all-zero columns” for dynamic sections**
  - Replace key-specific `periodZeroHideKeys` with an option that can hide **any** column where every value in that period is zero.
  - This must be **selective** (e.g. a predicate or `hideZeroKeysPrefix: ['Income__']`) so fixed income columns are never hidden.
  - Investment income requires this (hide `Income__*` types with no income in that residence span).

#### Step 4.2 — Introduce a Gross Income dynamic section
- In `DynamicSectionsConfig.js`, create a new section (suggested id): `grossIncome`
  - `groupKey`: the existing Gross Income group (or introduce one if needed)
  - `anchorKey`: a stable key in the main header row (e.g. `GrossIncome` or reuse an existing placeholder key)
  - `getColumns(countryCode)` returns the ordered list of income columns:
    - fixed income keys (`IncomeSalaries`, `IncomeRentals`, …, `IncomeTaxFree`)
    - dynamic investment income keys (`Income__${resolvedKey}` from `getResolvedInvestmentTypes()`)
    - `IncomeCash`
  - Enable “hide all-zero columns per period” for *investment income keys* at least (preferably the entire section, but must not hide pinned fixed columns).

#### Step 4.3 — Move Gross Income out of the main header row and into the dynamic section anchor
- In `index.html`, replace the multiple Gross Income `<th data-key="Income...">` columns with a **single** anchor `<th data-key="<grossIncomeAnchor>">...`.
- Ensure the grey “Gross Income” group header still visually spans Salaries → … → Cash via correct `colspan` math (do not add a new group header).
- If Gross Income needs dynamic colspans, add a `data-group="grossIncome"` marker to the group header so `_updateDynamicSectionGroupColSpans()` can target it.

#### Step 4.4 — Remove legacy income `<th>` injection
- In `WebUI.applyDynamicColumns()`:
  - Stop inserting/removing `<th data-key="Income__...">` for income.
  - Stop rebuilding body rows as a consequence of income header mutation.
  - Keep capital column mutation logic intact (Assets may remain in header-mutation until later).

#### Step 4.5 — Align group `colspan` + boundary/borders with dynamic sections
- Ensure Gross Income group `colspan` includes the grossIncome dynamic section width (max cols).
- Ensure thick borders are placed only at true top-level group boundaries:
  - Dynamic sections inside Gross Income must not force a boundary border.
  - Boundary placement must consider dynamic section containers in the blueprint and not rely solely on `th[data-key]` in the main header row.
 - Decide which system is authoritative for borders/colspans:
   - Either upgrade `WebUI.updateGroupBorders()` to be blueprint-aware, or
   - Move boundary placement into `TableManager` and treat `updateGroupBorders()` as legacy.

---

### 5) “Do Not Do This” List (regression triggers)

- Do not change table behavior outside the chosen path.
- Do not remove the active anchor key from the main header row if relying on dynamic sections for that region.
- Do not introduce two competing owners for the same region (income via dynamic section + income via `<th>` injection).
- Do not modify group boundary/colspan logic without accounting for both:
  - `applyDynamicColumns()` and
  - `_updateDynamicSectionGroupColSpans()`

---

### 6) Verification Checklist (manual; must match screenshots)

#### Empty state
- Gross Income columns appear in the expected order and stay within the Gross Income group.
- Empty-state header is ruleset- and pinned-types dependent, but must remain aligned and visually identical to the current working version.
- No alignment drift between groups.

#### After running `docs/demo3.csv`
- Gross Income renders via dynamic section and investment income appears as `Income__*` columns (dynamic section cells).
- Age 35 row shows non-zero in at least one investment income column.
- Group boundaries remain stable; no columns drift under the wrong group.

---

### 7) Progress Tracking (Phase 3 only)
- [ ] Implementation completed per guide
- [ ] Manual empty-state header matches the current working version
- [ ] Manual post-run header/columns match the current working version (plus dynamic investment incomes)

---

### 8) Implementation Checklist (by file)

- `src/frontend/web/ifs/index.html`
  - Replace Gross Income’s multiple `<th data-key="Income...">` columns with a single dynamic section anchor key for the new `grossIncome` section.

- `src/frontend/web/components/DynamicSectionsConfig.js`
  - Add the new `grossIncome` dynamic section and its anchor key.
  - Add config support for:
    - per-section thick-border policy
    - per-period “hide all-zero columns” policy

- `src/frontend/web/WebUI.js`
  - In `applyDynamicColumns()`, stop injecting `Income__*` `<th>` columns and stop removing the Gross Income anchor. Keep the capital column mutation intact.
  - Update Gross Income group `colspan` calculation to include the new grossIncome dynamic section width.
  - Update boundary/border placement so it uses the blueprint (dynamic sections included) and does not force borders for non-boundary sections.

- `src/frontend/web/components/TableManager.js`
  - Ensure `_buildRowBlueprint()` sees the new Gross Income anchor in the main header row so it emits a `section` for `grossIncome`.
  - Extend period-based hiding so investment income columns that are all-zero within a period are hidden, without hiding fixed income columns.
  - Verify empty-state flex layout works for `grossIncome` dynamic section headers.
  - Define pre-run visibility behavior for Gross Income (e.g. pinned-only vs full list), since `applyIncomeVisibilityAfterSimulation()` only runs post-simulation.

- `src/frontend/web/components/ChartManager.js`
  - Ensure chart visibility logic still respects `Income__*` (it currently mirrors the table visibility). If it relied on `<th>` presence, adjust to use the visibility map directly.
