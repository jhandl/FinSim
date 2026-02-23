# Canonical MV Identity (`relocationLinkId`)

## Summary
Make `relocationLinkId` the single canonical identifier for relocation (MV) events and use it consistently across impacts, split/sale/rent markers, and resolution overrides. Remove `_mvRuntimeId` and `event.id` as relocation cross‑reference fallbacks. Update relocation documentation to formalize this identity rule and explicitly state that **property name is the identity** for property/mortgage linking. No legacy normalization and no UI warning changes.

## Public API / Contract Changes
- `event.relocationImpact.mvEventId` will always store the MV’s `relocationLinkId`.
- `event.relocationSplitMvId`, `event.relocationSellMvId`, `event.relocationRentMvId`, and `event.resolutionOverrideMvId` will store the MV’s `relocationLinkId`.
- MV lookup helpers will only resolve by `relocationLinkId`.

## Implementation Plan

1. **Ensure every MV row has a `relocationLinkId`**
   - In `EventsTableManager.createEventRow`, if the initial type is `MV`, call `_getOrCreateRelocationLinkId(row)` after row creation so the hidden `event-relocation-link-id` is present immediately.
   - Keep the existing `setupEventTypeChangeHandler` call that creates a link id when a row is switched to `MV`.
   - Target file: `/Users/jhandl/FinSim/src/frontend/web/components/EventsTableManager.js`

2. **Make relocation impacts use the canonical ID**
   - Change `RelocationImpactDetector.getMvImpactId` to return only `mvEvent.relocationLinkId`.
   - Change `getImpactReferenceCandidates` to return only the `relocationLinkId`.
   - Change `getMvEventByImpactRef` to match only `relocationLinkId`.
   - Target file: `/Users/jhandl/FinSim/src/frontend/web/components/RelocationImpactDetector.js`

3. **Remove runtime/name fallbacks in MV resolution**
   - Update all `events.find(...)` lookups that use `id` or `_mvRuntimeId` to use `relocationLinkId` only.
   - Update any DOM fallbacks (in `RelocationImpactAssistant`) to locate MV rows by `event-relocation-link-id`, not row dataset IDs.
   - Target files:
     - `/Users/jhandl/FinSim/src/frontend/web/components/RelocationImpactAssistant.js`
     - `/Users/jhandl/FinSim/src/frontend/web/components/EventsTableManager.js`

4. **Use `relocationLinkId` for marker and resolution IDs**
   - Replace uses of `_getRelocationLinkIdByImpactId(mvImpactId)` with `mvImpactId` directly, since `mvImpactId` is now the link id.
   - Update `_getRelocationMarkerIdsForRow` and `_getRelocationMarkerIdsForDeletedRow` to return only the `relocationLinkId` (drop runtime row IDs from marker tracking).
   - Target file: `/Users/jhandl/FinSim/src/frontend/web/components/EventsTableManager.js`

5. **Docs update (no warning changes)**
   - Update `docs/relocation-system.md` to add a short “MV Identity” section:
     - MV canonical identity is `relocationLinkId` (persisted via Meta `mvLinkId`).
     - All relocation cross‑refs store `relocationLinkId`.
   - Add a short note that **property name is the identity** for mortgage linkage and must remain unique, aligning with current UI behavior.
   - Target file: `/Users/jhandl/FinSim/docs/relocation-system.md`

6. **Update tests to expect `relocationLinkId`**
   - Replace expectations that use MV name or `_mvRuntimeId` as `relocationImpact.mvEventId`.
   - Update fixtures where MV events lack a `relocationLinkId` by assigning one in the test data.
   - Target files with required updates:
     - `/Users/jhandl/FinSim/tests/TestRelocationImpactDetection.js`
     - `/Users/jhandl/FinSim/tests/TestRelocationSplitNoPension.test.js`
     - `/Users/jhandl/FinSim/tests/TestRelocationRentOption.test.js`
     - `/Users/jhandl/FinSim/tests/TestMortgagePlanSyncRegressions.test.js`

## Test Cases and Scenarios
1. Add an MV event and a boundary‑crossing expense; confirm impact is created and resolved without relying on MV name edits.
2. Split an event at relocation; edit MV age; confirm split‑shift impacts still resolve using `relocationLinkId`.
3. Tie a property sale to relocation; edit MV age; confirm sale‑shift impacts resolve correctly.
4. Save and reload a scenario with MV events and splits; confirm impacts and resolution actions still work (IDs persist via `mvLinkId`).
5. Run updated relocation tests to confirm `mvEventId` expectations match `relocationLinkId`.

## Assumptions
- There are no legacy scenarios with relocation events, so no legacy normalization is required.
- No new UI warnings will be added; documentation is the only clarification for property/mortgage identity rules.
