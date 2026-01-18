# Plan: Help Content + Allocation Fallback

## Objective
Align user-facing help content with the new local/global investment semantics, and make allocation fallback behavior consistently use StartCountry allocations when per-country allocations are missing or empty.

## Context Summary
- Help content in `src/frontend/web/assets/help.yml` still describes legacy index-fund/share semantics without mentioning local vs global investments or relocation handling.
- Core `getAllocationsByYear()` currently returns `{}` when a residence country does not have an allocation map, which contradicts the intended StartCountry fallback.

## Implementation Plan

### 1. Help Content Updates
- Identify the specific help sections that describe investment allocations and investment holdings.
- Update those sections to:
  - Explain local vs global investments in plain language.
  - Clarify that relocation does not auto-liquidate holdings; the user decides whether to keep or sell.
  - Keep references to index funds/shares but add the new semantics so legacy labels remain familiar.
- Make all changes in `src/frontend/web/assets/help.yml` only (no wizard content changes).

### 2. Allocation Fallback Behavior
- Update `getAllocationsByYear()` in `src/core/Simulator.js` to treat both missing and empty per-country allocations as equivalent.
  - If the residence country allocation map is missing or empty, use StartCountry allocations instead.
  - Preserve the ability to explicitly set all allocations to 0% for a country when the map is present and populated with zero values.
- Confirm logic aligns with per-country validation in `validatePerCountryInputs()` so it does not reintroduce unintended validation failures.

### 3. Tests
- Extend or adjust tests to cover the fallback behavior:
  - Prefer `tests/TestAllocationScopingAcrossRelocation.js` or `tests/TestLegacyAllocationFallback.js`.
  - Add coverage for both “missing map” and “empty map” cases.
- Run targeted tests:
  - `./run-tests.sh TestAllocationScopingAcrossRelocation`
  - `./run-tests.sh TestLegacyAllocationFallback`

### 4. Cache Busting
- If `help.yml` changes, update the relevant cache-busting parameter in `src/frontend/web/ifs/index.html`.

## Acceptance Criteria
- Help content clearly describes local vs global investments and relocation handling in `src/frontend/web/assets/help.yml`.
- Allocation fallback uses StartCountry allocations when the current residence country map is missing or empty.
- Tests covering the fallback pass.
- Cache-busting updated if assets changed.

