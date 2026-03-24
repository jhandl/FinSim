# Relocation Decision Re-Review Plan

## Goal

Add missing checks to the relocation impact system so rows affected by a deleted/missing relocation (`MV`) are re-surfaced through `RelocationImpactDetector` and the existing resolution-panel flow.

## Context

- When an `MV` event disappears, relocation-driven edits previously chosen by the user may no longer be justified.
- The correct behavior is to mark the affected rows as impacted again and let the user decide what to do now.
- The missing piece is detector coverage plus resolution actions for stale relocation-linked sale/payoff decisions.
- Current relocation-linked references in play:
  - `relocationSellMvId`: sale/payoff link for real-estate rows, including `R`, `M`, `MO`, `MP`, and `MR`
  - `relocationRentMvId`: relocation-created rental link for `RI`
  - `relocationSplitMvId`: split-chain link for relocation-created split events
  - `resolutionOverrideMvId`: review metadata, not user-authored business data

## Current Behavior

- Already implemented:
  - Orphan rental marker detection for `relocationRentMvId`
  - Resolution options for orphan rental rows (`Keep renting` / `Remove`)
  - Split-chain handling via `linkedEventId` + `relocationSplitMvId`
  - `split_orphan`, `split_relocation_shift`, and `split_amount_shift` flows

- Missing:
  - Orphan sale marker detection for `relocationSellMvId`
  - Resolution options for stale sale-marker rows when the referenced `MV` no longer exists
  - Coverage for mortgage-linked sale-marker rows (`MO`, `MP`, `MR`) that can inherit the same relocation-driven sale decision

- Important nuance:
  - Do **not** change split-chain semantics in this pass.
  - A split with a missing `relocationSplitMvId` is currently allowed to remain clean if it still matches a current relocation boundary.
  - That behavior should stay unless explicitly changed in a separate task.

## Scope

- In scope:
  - `relocationSellMvId` orphan detection
  - `relocationSellMvId` coverage for `R`, `M`, `MO`, `MP`, and `MR`
  - Resolution-panel actions for orphan sale markers
  - Regression coverage for mixed property workflows where rental orphan handling already works and mortgage-side re-review is still missing
  - Regression coverage for existing split behavior

- Out of scope:
  - Any `event.currency` cleanup or redesign
  - Changing split equivalence logic
  - Turning `resolutionOverrideMvId` into a user-facing impact category

## Files To Touch

- `src/frontend/web/components/RelocationImpactDetector.js`
- `src/frontend/web/components/RelocationImpactAssistant.js`
- `src/frontend/web/components/EventsTableManager.js`
- `tests/` for focused regression coverage

## Mandatory Pre-Fix Verification Gate

This gate is mandatory. No change is allowed until every item below is completed.

- [ ] Reproduce the exact failure flow from a clean baseline (no local speculative patch):
- [ ] Load `demo.csv`.
- [ ] Add relocation (`MV`) to Argentina at age 40.
- [ ] Resolve property (`R`) with `Rent out`.
- [ ] Resolve mortgage/payoff path (`M`/`MP`) with `Pay off`.
- [ ] Delete the relocation (`MV`).
- [ ] Record the observed impacted rows.
- [ ] The R, M, MP and RI rows should be impacted by the MV deletion.

## Plan

- [ ] Add detector logic for stale `relocationSellMvId` on all rows that can carry sell markers: `R`, `M`, `MO`, `MP`, and `MR`.
- [ ] Emit a dedicated relocation impact category for the missing-sale-marker case rather than routing it through standard validation.
- [ ] Include enough impact details to let the user re-evaluate the earlier relocation-driven choice even though the original `MV` row is gone.
- [ ] Add resolution-panel actions for the orphan sale-marker case.
- [ ] Provide at least one "keep current timing but detach it from the deleted relocation" action.
- [ ] Provide at least one action that reverts the relocation-driven sale decision when appropriate.
- [ ] Ensure the resolution actions clear or preserve marker fields in a way that matches the user’s chosen outcome, rather than blindly deleting them.
- [ ] Apply the sale-marker cleanup consistently across the affected real-estate and mortgage-linked rows when appropriate.
- [ ] Make sure mortgage-linked sale-marker rows that are not just the base mortgage row (`MO`, `MP`, `MR`) are also re-surfaced for review.
- [ ] Re-run the standard relocation recompute path after resolution so the impact disappears naturally.
- [ ] Keep existing orphan rental behavior unchanged.
- [ ] Keep existing split-chain behavior unchanged except for regression tests.

## Mandatory Post-Fix Verification Gate

- [ ] Reproduce the exact failure flow from the pre-fix verification gate.
- [ ] Record the observed impacted rows.
- [ ] The R, M, MP and RI rows should all be impacted by the MV deletion.
- [ ] If that is not the case, investigate the root cause following the @finsim-debugging rules and fix it.

## Test Checklist

- [ ] Deleting an `MV` row leaves a property/mortgage row with `relocationSellMvId`; detector marks it as impacted.
- [ ] Deleting an `MV` row also re-surfaces any sell-marked `MO`, `MP`, and `MR` rows for review.
- [ ] Resolving the orphan sale-marker impact requires an explicit user choice and then clears or preserves the stale marker fields according to that choice.
- [ ] In a mixed case where the property is rented out and the mortgage is paid off on relocation, deleting the `MV` still re-surfaces the mortgage-side review and still marks the `RI` row through the existing orphan-rental flow.
- [ ] Existing split behavior still works:
- [ ] `split_orphan` still appears when no relocation boundary matches.
- [ ] No orphan split impact appears when the split still matches a current relocation boundary even if the original marker is gone.

## Guardrails

- Do not add this as a standard validation warning in `UIManager`.
- Do not redesign relocation identity in this pass.
- Prefer the smallest change set that plugs the missing stale-marker path and reuses existing resolution infrastructure.
- No speculative fixes: any code change without pre-fix reproduction evidence and marker-lifecycle proof is invalid.
