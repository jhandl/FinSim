# Iterative Multi-MV Split Remediation Plan

## Goal

Support the intended UX for scenarios with multiple `MV` events:

- a long event may cross more than one relocation
- each crossed relocation is resolved separately and iteratively
- previously resolved split segments can later be re-reviewed if their referenced relocation changes or disappears
- suggested amount drift and model drift are tracked per split segment, not per whole split chain

## Non-Goals

- Do not change the detector into a multi-impact-per-event system
- Do not surface multiple relocation panels for one row at the same time
- Do not replace the iterative UX with an all-at-once wizard

## Current Problems

- Split-chain remediation is keyed only by `linkedEventId`, which conflates all iterative splits of the same logical event.
- Split orphan detection is chain-wide, not relocation-segment-specific.
- Split age adaptation only updates the first two rows of a chain.
- Split suggestion drift only compares the first and second rows of a chain.
- Review overrides for split remediation are effectively chain-wide when `keepSplitAsIs()` applies them to all rows sharing one `linkedEventId`.
- `joinSplitEvents()` rejoins the whole chain, not just the segment affected by one relocation.

## Target Model

Treat each iterative split as an explicit split segment tied to one relocation marker.

Each row that participates in a split segment should keep:

- `linkedEventId`: still identifies the broader family of derived rows
- `relocationSplitMvId`: identifies which `MV` created or governs this split segment
- `relocationSplitAnchorAge`: remembers the relocation age used when that segment was last aligned
- `relocationSplitAnchorAmount`: remembers the source-side amount baseline for that segment
- `relocationSplitValueMode`: remembers whether the destination-side amount is suggested or custom

Add one more segment identifier:

- `relocationSplitSegmentId`: identifies the local pair created for one specific relocation split

This separates:

- family-level ancestry: `linkedEventId`
- segment-level remediation: `relocationSplitSegmentId`
- relocation reference: `relocationSplitMvId`

## Plan

### Phase 1. Define split segment identity

- [ ] Add `relocationSplitSegmentId` as a first-class hidden field and persisted meta field.
- [ ] Document the distinction between `linkedEventId` and `relocationSplitSegmentId`.
- [ ] Keep `linkedEventId` for ancestry and round-trip compatibility.
- [ ] Use `relocationSplitSegmentId` for adaptation, orphan review, and join actions.

### Phase 2. Create segment IDs during iterative splitting

- [ ] Update `splitEventAtRelocation()` so the new pair receives:
- [ ] a fresh `relocationSplitSegmentId`
- [ ] the same `linkedEventId` family marker as the source row when extending an already-split chain, or a fresh family marker when splitting an unsplit row
- [ ] the current `relocationSplitMvId`
- [ ] the current anchor age and amount fields
- [ ] Preserve existing earlier segments when splitting a row that was already part of a family.

### Phase 3. Make split detection segment-aware

- [ ] Refactor split grouping helpers in `RelocationImpactDetector` to operate on segment pairs first, not whole families first.
- [ ] Detect `split_relocation_shift` per `relocationSplitSegmentId`.
- [ ] Detect missing/deleted relocation markers per `relocationSplitSegmentId`.
- [ ] Only fall back to family-wide `split_orphan` when segment metadata is genuinely missing or legacy.
- [ ] Keep legacy scenarios working by deriving a temporary segment pair from a 2-row `linkedEventId` chain with no `relocationSplitSegmentId`.

### Phase 4. Make split amount drift segment-aware

- [ ] Refactor `addSplitAmountShiftImpacts()` to inspect each split segment independently.
- [ ] Compare the source-side row and destination-side row for that segment only.
- [ ] Recompute PPP suggestion using that segment’s `relocationSplitMvId`.
- [ ] Store reviewed suggested amount and model version on the destination-side row of that segment only.
- [ ] Do not let one segment’s amount drift create impacts on unrelated later segments in the same family.

### Phase 5. Make resolution actions segment-aware

- [ ] Refactor `adaptSplitToRelocationAge()` to find the two rows for the impacted `relocationSplitSegmentId`, not the first two rows in the family.
- [ ] Refactor `keepSplitAsIs()` to stamp review override only on the rows in the impacted segment.
- [ ] Refactor `keepSplitValueAsIs()` and `updateSplitValue()` to operate only on the impacted segment pair.
- [ ] Replace family-wide `joinSplitEvents()` behavior with segment-local join behavior for `split_orphan`.
- [ ] Ensure joining one orphaned segment preserves other valid segments in the same family.

### Phase 6. Keep iterative UX stable after edits

- [ ] When a segment is joined away, clear only that segment’s split metadata.
- [ ] When a segment is adapted to a moved relocation, update only that segment’s anchor age and review state.
- [ ] When a later segment remains valid, leave its metadata untouched.
- [ ] Ensure re-analysis still surfaces the next unresolved relocation boundary on the resulting row after each action.

### Phase 7. Persistence and migration

- [ ] Extend CSV meta serialization/deserialization to round-trip `relocationSplitSegmentId`.
- [ ] Add legacy upgrade logic:
- [ ] if exactly two rows share a `linkedEventId` and both point to the same `relocationSplitMvId`, synthesize one segment ID on load
- [ ] if a larger family lacks segment IDs, leave it loadable but mark it for conservative review rather than guessing wrong
- [ ] Update any docs that describe split persistence so they reflect current-state semantics only.

### Phase 8. Tests

- [ ] Add detector tests for one event crossing two relocations and being resolved in two passes.
- [ ] Add detector tests for a 3-part family with two valid split segments, then moving only the first `MV`.
- [ ] Add detector tests for a 3-part family with two valid split segments, then deleting only the second `MV`.
- [ ] Add detector tests for amount drift affecting only one segment in a multi-segment family.
- [ ] Add detector tests for suggestion-model drift affecting only one segment in a multi-segment family.
- [ ] Add UI/unit tests for:
- [ ] splitting an already split later segment
- [ ] adapting only the impacted segment
- [ ] joining only the orphaned segment
- [ ] preserving untouched later segments
- [ ] Add CSV round-trip tests for `relocationSplitSegmentId`.

## Implementation Order

1. Add segment identity and persistence.
2. Update split creation so new iterative splits produce correct metadata.
3. Refactor detector helpers to operate per segment.
4. Refactor table-manager remediation actions to target a segment instead of a family.
5. Add and run focused tests after each step.

## Acceptance Criteria

- A `30-70` event with moves at `40` and `60` can be split at `40`, then later split at `60`, with both resolutions tracked independently.
- Moving or deleting the first `MV` only re-surfaces review for the first split segment.
- Moving or deleting the second `MV` only re-surfaces review for the second split segment.
- Updating the source-side amount for segment 2 only re-surfaces amount drift for segment 2.
- Reviewing segment 1 does not suppress future impacts for segment 2.
- Joining an orphaned segment restores only the affected interval and keeps other valid intervals intact.

## Risks

- Legacy split chains without segment metadata may be ambiguous.
- Family/segment identity bugs could silently suppress or overproduce impacts.
- Joining one segment in the middle of a family requires careful age-range reconstruction to avoid overlap or gaps.

## Notes

- Preserve the current single-impact-per-row detector model.
- Preserve the current iterative UX.
- Prefer narrow helper refactors over introducing a second relocation-impact model.
