# Relocation Identity Canonicalization Plan

## Goal

Make relocation identity simple, explicit, and boring:

- `relocationLinkId` is the only business identifier for an `MV` event.
- `event.id` remains the user/business field for the event itself and is not used for relocation cross-references.
- DOM row IDs (`data-row-id`, `data-event-id`) remain UI-local identities only and are never used as relocation references.
- CSV/meta persists relocation references by canonical ID, not by row number.

The current code mixes all three identity systems. This plan removes that ambiguity.

## Desired Identity Model

There should be exactly two identity layers with a hard boundary between them.

### 1. Business identity

Used by detector logic, resolution actions, persistence, and tests.

- MV event identity: `event.relocationLinkId`
- Split marker: `event.relocationSplitMvId`
- Sale marker: `event.relocationSellMvId`
- Rent marker: `event.relocationRentMvId`
- Resolution override scope: `event.resolutionOverrideMvId`
- Relocation impact reference: `event.relocationImpact.mvEventId`

All of the above store the same thing: the referenced MV's `relocationLinkId`.

### 2. UI identity

Used only for locating DOM rows and animating/re-rendering UI.

- Table row identity: `data-row-id`
- UI event row identity: `data-event-id`

These must never be used as relocation references or serialized as relocation metadata.

## Current State

The code has evolved into a hybrid model:

- `RelocationImpactDetector` still emits and resolves impacts via `_mvRuntimeId` / `event.id` / `relocationLinkId`.
- `EventsTableManager` still has runtime-ID fallback paths for resolution, split/sale adaptation, and origin-country lookup.
- `RelocationImpactAssistant` still resolves MV rows via `id`, `_mvRuntimeId`, and DOM `data-event-id`.
- `UIManager.readEvents()` still creates `_mvRuntimeId` for MV events.
- CSV/meta still supports row-based relocation references (`SplitMvRow`, `SellMvRow`, `RentMvRow`, `ResolvedMvRow`) and converts between row numbers and marker IDs.
- Tests still assert a mix of `event.id`, `_mvRuntimeId`, and `relocationLinkId`.

That is why the older plan is still directionally correct but incomplete.

## Design Decision

Adopt a strict rule:

- `relocationLinkId` is the only valid relocation reference in runtime state and persisted scenario data written by current code.

Everything else becomes either:

- ordinary event data (`event.id`), or
- UI-only bookkeeping (`data-row-id`, `data-event-id`), or
- load-time compatibility input accepted only when reading older scenario files.

## Compatibility Policy

To keep the runtime model clean while accounting for existing saved files and tests:

- Load compatibility: keep support for old row-based relocation metadata when deserializing CSV/meta.
- Write format: save only canonical relocation IDs.
- Runtime model after load: normalize all relocation references to canonical `relocationLinkId` immediately.

This gives a simple steady-state model without forcing the app to reject older scenario files.

## In Scope

- Canonicalize all relocation runtime references to `relocationLinkId`.
- Remove `_mvRuntimeId` from relocation logic.
- Remove `event.id` as a relocation cross-reference.
- Keep DOM row IDs for UI only.
- Make CSV/meta write canonical IDs only.
- Treat row-based relocation metadata as load-only compatibility.
- Update docs to describe the actual contract.
- Update tests to assert canonical IDs only.

## Out Of Scope

- Redesign of non-relocation event identity in general.
- Redesign of `linkedEventId` split-chain semantics.
- Any broader CSV format cleanup unrelated to relocation IDs.
- UI wording or warning redesign.

## Canonical Rules

### MV events

- Every MV row must have a `relocationLinkId` as soon as it exists.
- This must be true for:
  - direct row creation
  - wizard-created MV rows
  - rows switched to `MV`
  - rows loaded from CSV/meta

### Relocation references

- `relocationImpact.mvEventId` always stores `relocationLinkId`
- `relocationSplitMvId` always stores `relocationLinkId`
- `relocationSellMvId` always stores `relocationLinkId`
- `relocationRentMvId` always stores `relocationLinkId`
- `resolutionOverrideMvId` always stores `relocationLinkId`

### Lookup helpers

- All MV lookup helpers resolve only by `relocationLinkId`
- If a caller has anything else, that is a bug in the caller

## Implementation Plan

### Phase 1. Establish the contract in code

- Add a short identity comment near the relocation helpers in `EventsTableManager.js`
- Add a short identity comment near MV impact/reference helpers in `RelocationImpactDetector.js`
- Add a short identity note in `docs/relocation-system.md`

The point of this phase is to make the intended model explicit before changing behavior.

### Phase 2. Guarantee `relocationLinkId` exists for every MV row

- In `EventsTableManager.createEventRow(...)`, if the initial type is `MV`, create `event-relocation-link-id` immediately
- Keep the existing type-change path that creates the ID when a row is switched to `MV`
- Ensure wizard/population flows preserve or create the ID rather than relying on later re-analysis

Primary file:

- `/Users/jhandl/FinSim/src/frontend/web/components/EventsTableManager.js`

### Phase 3. Canonicalize runtime detector identity

- Change `RelocationImpactDetector.getMvImpactId(...)` to return only `mvEvent.relocationLinkId`
- Change `getImpactReferenceCandidates(...)` to return only canonical IDs
- Change `getMvEventByImpactRef(...)` to match only `relocationLinkId`
- Remove detector logic that treats `_mvRuntimeId` or `event.id` as equivalent relocation references

Primary file:

- `/Users/jhandl/FinSim/src/frontend/web/components/RelocationImpactDetector.js`

### Phase 4. Canonicalize resolution/action code

- Update all relocation-driven `events.find(...)` lookups in `EventsTableManager.js` to resolve MV events by `relocationLinkId` only
- Remove `_getRelocationLinkIdByImpactId(...)` or reduce it to a narrow compatibility shim during transition, then remove it
- Change marker-set logic to track only canonical MV IDs
- Update relocation age-shift tracking to use only canonical MV IDs
- Update `getOriginCountry(...)` to locate the current MV by `relocationLinkId`

Primary file:

- `/Users/jhandl/FinSim/src/frontend/web/components/EventsTableManager.js`

### Phase 5. Canonicalize panel rendering and fallback behavior

- Update `RelocationImpactAssistant` to resolve `event.relocationImpact.mvEventId` by `relocationLinkId` only
- If DOM fallback is still needed, match MV rows by `.event-relocation-link-id`, never by `data-event-id`
- Remove `_mvRuntimeId` and row-dataset fallback logic from relocation panel rendering

Primary file:

- `/Users/jhandl/FinSim/src/frontend/web/components/RelocationImpactAssistant.js`

### Phase 6. Remove runtime relocation use of `_mvRuntimeId`

- Stop creating `_mvRuntimeId` in `UIManager.readEvents()` for relocation purposes
- Remove any remaining relocation logic that depends on `_mvRuntimeId`
- If `_mvRuntimeId` still exists temporarily for unrelated UI reasons, keep it isolated from relocation code

Primary file:

- `/Users/jhandl/FinSim/src/frontend/UIManager.js`

### Phase 7. Simplify persistence around canonical IDs

Change the persistence contract so current saves write canonical relocation IDs only.

#### Write path

- Serialize `mvLinkId` for MV rows
- Serialize `splitMvId`, `sellMvId`, `rentMvId`, and `resolvedMvId` as canonical IDs
- Stop emitting row-based relocation reference fields in newly written EventMeta
- Remove write-time conversion from canonical IDs to row numbers

#### Read path

- Continue accepting old row-based relocation fields when loading
- Resolve row-based relocation references to canonical `relocationLinkId` during load
- After load, the DOM/runtime state should contain canonical IDs only

Primary files:

- `/Users/jhandl/FinSim/src/core/Utils.js`
- `/Users/jhandl/FinSim/src/frontend/web/components/FileManager.js`

## Persistence Contract After This Change

### EventMeta / inline meta written by current code

- MV rows persist `mvLinkId`
- Non-MV relocation references persist `splitMvId`, `sellMvId`, `rentMvId`, `resolvedMvId`
- Row-based relocation fields are no longer written by current code

### Compatibility input still accepted on load

- `SplitMvRow`
- `SellMvRow`
- `RentMvRow`
- `ResolvedMvRow`

Those fields are compatibility inputs only, not part of the canonical write contract.

## Documentation Updates

Update `docs/relocation-system.md` to explicitly document:

- MV identity is `relocationLinkId`
- all relocation cross-references store `relocationLinkId`
- `mvLinkId` is the persisted MV identity
- row-based relocation meta is legacy/load compatibility only, if that compatibility is retained
- property name is the identity used for property/mortgage linkage and must remain unique within that workflow

The current relocation doc does not describe the actual persistence and identity model, so this part is required.

## Test Plan

### Update existing tests to canonical expectations

At minimum:

- `/Users/jhandl/FinSim/tests/TestRelocationImpactDetection.js`
- `/Users/jhandl/FinSim/tests/TestRelocationSplitNoPension.test.js`
- `/Users/jhandl/FinSim/tests/TestRelocationRentOption.test.js`
- `/Users/jhandl/FinSim/tests/TestMortgagePlanSyncRegressions.test.js`
- `/Users/jhandl/FinSim/tests/ConfidenceTestH_CSVRoundtrip.js`

### New/updated assertions

- `relocationImpact.mvEventId` equals the referenced MV's `relocationLinkId`
- split/sale/rent/resolution references are canonical IDs only in runtime state
- changing MV age still re-surfaces split/sale review flows using canonical IDs only
- deleting an MV still re-surfaces orphan marker impacts using canonical IDs only
- saving and reloading preserves canonical IDs
- legacy row-based meta still loads, but normalizes to canonical IDs in runtime state
- re-saving a legacy-loaded scenario writes canonical IDs only

## Verification Scenarios

### Runtime identity

1. Create an MV row directly in the table.
2. Confirm it immediately has `event-relocation-link-id`.
3. Add a boundary-crossing salary/expense.
4. Confirm `relocationImpact.mvEventId` equals the MV's `relocationLinkId`.

### Split flow

1. Split an event at relocation.
2. Confirm both halves store `relocationSplitMvId = relocationLinkId`.
3. Move the MV age.
4. Confirm split-shift review still resolves correctly.

### Sale/rent flow

1. Tie property sale/payoff/rent decisions to a relocation.
2. Confirm sale/rent markers store canonical IDs.
3. Move or delete the MV.
4. Confirm re-review/orphan flows still resolve correctly.

### Persistence

1. Save a scenario with MV events and relocation-driven markers.
2. Confirm serialized data writes canonical IDs.
3. Reload the file.
4. Confirm runtime state still uses canonical IDs.

### Compatibility

1. Load a scenario containing row-based relocation meta.
2. Confirm it is normalized to canonical IDs during load.
3. Save it again.
4. Confirm the new save uses canonical IDs only.

## Files Expected To Change

- `/Users/jhandl/FinSim/src/frontend/web/components/EventsTableManager.js`
- `/Users/jhandl/FinSim/src/frontend/web/components/RelocationImpactDetector.js`
- `/Users/jhandl/FinSim/src/frontend/web/components/RelocationImpactAssistant.js`
- `/Users/jhandl/FinSim/src/frontend/UIManager.js`
- `/Users/jhandl/FinSim/src/core/Utils.js`
- `/Users/jhandl/FinSim/src/frontend/web/components/FileManager.js`
- `/Users/jhandl/FinSim/docs/relocation-system.md`
- `/Users/jhandl/FinSim/tests/TestRelocationImpactDetection.js`
- `/Users/jhandl/FinSim/tests/TestRelocationSplitNoPension.test.js`
- `/Users/jhandl/FinSim/tests/TestRelocationRentOption.test.js`
- `/Users/jhandl/FinSim/tests/TestMortgagePlanSyncRegressions.test.js`
- `/Users/jhandl/FinSim/tests/ConfidenceTestH_CSVRoundtrip.js`

## Success Criteria

- There is exactly one relocation reference format in runtime state: `relocationLinkId`
- There is exactly one relocation reference format written by current saves: canonical ID fields
- UI row identities are no longer treated as relocation identities
- Detector, assistant, table manager, and persistence all agree on the same contract
- Tests assert that contract directly

## Non-Goals / Guardrails

- Do not introduce a new abstraction layer for IDs
- Do not keep multi-key fallback logic once canonicalization is complete
- Do not let DOM row IDs leak back into business logic
- Do not silently keep mixed identity modes alive “just in case”

The elegant end state is not “support every form everywhere.” The elegant end state is:

- one canonical relocation ID in runtime logic
- one canonical relocation ID in current saves
- one narrow compatibility bridge at load time only
