# Split Suggestion Drift Tracking

## Summary

Track when a split Part 2 value is stale because the **last reviewed suggested value** has changed, while still suppressing all derived-value impacts for `splitValueMode=custom`.

The key rule is:

- `custom` means the user owns Part 2. No Part 1 / economy / formula suggestion-drift impacts should be raised.
- `suggested` means Part 2 is still in the suggestion system. We should raise an impact only when the **current suggestion value** differs from the **last reviewed suggested value**, the current suggestion no longer matches the stored Part 2 value, and the current suggestion has moved **farther away** from the retained Part 2 value than the last reviewed suggestion.

This supports all practical drift sources:

- Part 1 amount changed
- Economic data changed
- Suggestion formula changed in a way that changes the suggested value

It also avoids repeated badges after the user clicks `Leave as is`, because that action will update the **reviewed suggested value** without changing the Part 2 amount. A later badge should only reappear if the new suggestion drifted farther away again.

## Desired Behavior

- [ ] Keep the existing `splitValueMode` contract:
  - [ ] `suggested`
  - [ ] `custom`
- [ ] Raise split suggestion impacts only for Part 2 rows with `splitValueMode=suggested`.
- [ ] Continue to suppress all derived-value impacts for Part 2 rows with `splitValueMode=custom`.
- [ ] `Update value` should:
  - [ ] update Part 2 amount to the current suggestion
  - [ ] refresh the reviewed suggestion baseline
  - [ ] keep `splitValueMode=suggested`
- [ ] `Leave as is` should:
  - [ ] leave Part 2 amount unchanged
  - [ ] refresh the reviewed suggestion baseline
  - [ ] keep `splitValueMode=suggested`
- [ ] Direct user edits to Part 2 should:
  - [ ] set `splitValueMode=custom`
  - [ ] stop future suggestion-drift impacts for that row
- [ ] There is no automatic path back from `custom` in this pass.
- [ ] For non-Part-1 suggestion drift, the impact details should distinguish:
  - [ ] `economic`
  - [ ] `model`
- [ ] For repeated `Leave as is` flows, only re-raise an impact if the newly computed suggestion moved farther away from the retained Part 2 value than the last reviewed suggestion.
- [ ] If the newly computed suggestion moved closer to the retained Part 2 value, or stayed roughly the same distance away, suppress the repeat impact.

## Data Model

### Existing Fields To Keep Using

- [ ] `splitAnchorAmount`
  - [ ] Continue to store the acknowledged Part 1 amount for the split.
  - [ ] This remains the baseline for `amount` drift detection.
- [ ] `splitValueMode`
  - [ ] Continue to persist `suggested|custom`.

### New Persisted Fields

Add these relocation-meta fields for split Part 2 rows:

- [ ] `splitReviewedSuggestedAmount`
  - [ ] Store the last reviewed suggested Part 2 amount.
  - [ ] This is the baseline for all non-Part-1 suggestion drift.
- [ ] `splitSuggestionModelVersion`
  - [ ] Store the suggestion-model version tied to the last reviewed suggested amount.
  - [ ] Bump this only when the formula / calculation logic changes, not when economic inputs change.

### Model Versioning

`splitSuggestionModelVersion` should be a small manually bumped version owned by the split-suggestion code path itself, not by app config, CSV schema version, or country economic-data version.

- [ ] Define one current split-suggestion model constant, for example `SPLIT_SUGGESTION_MODEL_VERSION = 1`.
- [ ] Keep that constant next to the shared split-suggestion helper so the calculation logic and its version live in one place.
- [ ] Include a comment that explains the versioning policy, so future agents working on this code know when to bump the version.
- [ ] Persist that exact constant into `splitSuggestionModelVersion` whenever a split Part 2 row is created, updated to the current suggestion, or reviewed via `Leave as is`.
- [ ] Compare the stored value to the current constant during impact detection.
- [ ] Bump the constant only when the suggestion behavior itself changes in a way that could change the computed suggested amount, for example:
  - [ ] PPP vs FX fallback order
  - [ ] which country pair is used
  - [ ] rounding / normalization rules
  - [ ] any new rule that changes the final suggested amount
- [ ] Do not bump it for economic-data updates. Those should remain `economic` drift, not `model` drift.
- [ ] Do not tie it to `finsim-X.XX` or tax-rule `version`, because those versions can change for unrelated reasons and would create false `model` classifications.
- [ ] If the model version changed but the newly computed suggested amount still matches the reviewed/current value within tolerance, do not raise an impact.

### Baseline Semantics

The stored suggested amount is the **last reviewed suggested value**, not necessarily the value currently stored in Part 2.

That distinction matters for `Leave as is`:

- [ ] After `Leave as is`, Part 2 may still contain an older suggested amount.
- [ ] The row remains `suggested`.
- [ ] The stored `splitReviewedSuggestedAmount` must update so the same drift does not re-trigger every analysis.
- [ ] A future change to the computed suggestion must re-trigger the badge only if it is farther from the retained Part 2 value than the last reviewed suggestion.

## Shared Suggestion Helper

The current suggestion logic is duplicated across UI paths. Before adding drift tracking, centralize the split suggestion calculation in one helper.

- [ ] Create a single helper only to avoid formula drift between detector / assistant / table actions.
- [ ] Keep it minimal. Do not introduce a large abstraction or explanation model.
- [ ] The helper should return:
  - [ ] `suggestedAmount`
- [ ] The helper module should also expose the current `SPLIT_SUGGESTION_MODEL_VERSION` constant.
- [ ] Use that helper everywhere split suggestions are calculated.

Target files:

- [ ] `/Users/jhandl/FinSim/src/frontend/web/components/RelocationImpactDetector.js`
- [ ] `/Users/jhandl/FinSim/src/frontend/web/components/RelocationImpactAssistant.js`
- [ ] `/Users/jhandl/FinSim/src/frontend/web/components/EventsTableManager.js`

## Drift Tolerance

Use the same tolerance rule in all amount comparisons for this feature.

- [ ] Treat differences smaller than 1% as equal.
- [ ] Apply that tolerance to:
  - [ ] current Part 1 vs `splitAnchorAmount`
  - [ ] current suggestion vs current Part 2
  - [ ] current suggestion vs `splitReviewedSuggestedAmount`
  - [ ] reviewed suggestion distance vs current suggestion distance when deciding whether a repeat impact should reappear
- [ ] Implement the tolerance as a relative comparison with a safe denominator, for example `max(abs(a), abs(b), 1)`, so zero and near-zero values do not break the logic.

## Repeat-Impact Gate

Use the retained Part 2 value as the reference point for deciding whether a repeat drift has become materially worse.

- [ ] Compute `reviewedDistance = abs(splitReviewedSuggestedAmount - currentPart2Amount)`.
- [ ] Compute `currentDistance = abs(currentSuggestedAmount - currentPart2Amount)`.
- [ ] If `currentDistance` does not exceed `reviewedDistance` by at least the 1% tolerance, suppress the repeat impact.
- [ ] This same gate should work for both:
  - [ ] first drift after a previously accepted suggestion (`reviewedDistance` is near zero)
  - [ ] later drift after `Leave as is` (`reviewedDistance` may already be non-zero)

## Detection Rules

### Amount Drift

Keep the existing behavior shape, but route it through the new reviewed-suggestion detector.

- [ ] If `splitValueMode=custom`, skip.
- [ ] If current Part 1 amount differs from `splitAnchorAmount` by at least the 1% tolerance, treat this as Part 1 drift.
- [ ] If the current suggested amount still matches Part 2 within the same tolerance, do not raise an impact.
- [ ] If the current suggested amount is not farther from Part 2 than the last reviewed suggestion, do not raise a repeat impact.
- [ ] Otherwise raise an impact.

### Suggestion Drift

- [ ] If `splitValueMode=custom`, skip.
- [ ] If `splitAnchorAmount` still matches the current Part 1 amount within tolerance, but the current suggested amount differs from stored `splitReviewedSuggestedAmount` by at least the 1% tolerance, treat this as non-Part-1 suggestion drift.
- [ ] If the current suggested amount still matches Part 2 within the same tolerance, do not raise an impact.
- [ ] If the current suggested amount is not farther from Part 2 than the last reviewed suggestion, do not raise a repeat impact.
- [ ] Classify the drift reason as:
  - [ ] `model` when the current model version differs from stored `splitSuggestionModelVersion`
  - [ ] `economic` otherwise
- [ ] Otherwise raise an impact.

### Impact Category Shape

Use one new general category for non-Part-1 drift while keeping the current amount-specific category.

- [ ] Keep `split_amount_shift` for Part 1 amount changes.
- [ ] Add `split_suggestion_shift` for economy/formula changes that alter the suggested value.
- [ ] Store the specific reason in impact details:
  - [ ] `reason: 'economic'`
  - [ ] `reason: 'model'`
- [ ] For drift impacts, also store comparison details:
  - [ ] previous distance from current Part 2
  - [ ] current distance from current Part 2

This keeps the UX simple: Part 1 changed vs. suggestion changed for some other reason, while still allowing the tooltip/message to distinguish `economic` vs `model`.

## Resolution Actions

### Update Value

When the user accepts the new suggestion:

- [ ] Update Part 2 amount to the current suggested amount.
- [ ] Update `splitAnchorAmount` to the current Part 1 amount.
- [ ] Update `splitReviewedSuggestedAmount`.
- [ ] Update `splitSuggestionModelVersion`.
- [ ] Keep `splitValueMode=suggested`.

### Leave As Is

When the user intentionally keeps the current Part 2 amount:

- [ ] Leave the Part 2 amount unchanged.
- [ ] Update `splitAnchorAmount` to the current Part 1 amount.
- [ ] Update `splitReviewedSuggestedAmount`.
- [ ] Update `splitSuggestionModelVersion`.
- [ ] Keep `splitValueMode=suggested`.

This is the critical rule that suppresses repeated alerts for the same reviewed drift while still allowing materially worse future drifts to re-trigger.

### Manual Edit

When the user types a Part 2 amount directly:

- [ ] Set `splitValueMode=custom`.
- [ ] Do not auto-clear the stored basis fields in this pass.
- [ ] The detector should simply ignore suggested-value drift for that row.

## Serialization / Persistence

Update relocation event meta serialization and deserialization to persist the new fields.

- [ ] Add new EventMeta columns / inline-meta keys:
  - [ ] `SplitReviewedSuggestedAmount`
  - [ ] `SplitSuggestionModelVersion`
- [ ] Preserve backward compatibility for both:
  - [ ] `# EventMeta` section
  - [ ] inline `Meta` column
- [ ] Keep new columns appended at the end of headerless positional meta definitions to avoid shifting legacy row parsing.

Target files:

- [ ] `/Users/jhandl/FinSim/src/core/Utils.js`
- [ ] `/Users/jhandl/FinSim/src/frontend/UIManager.js`
- [ ] `/Users/jhandl/FinSim/src/frontend/web/components/FileManager.js`

## UI / Panel Changes

Reuse the current split value remediation UI.

- [ ] Extend the existing split-value panel branch to support both:
  - [ ] `split_amount_shift`
  - [ ] `split_suggestion_shift`
- [ ] Update the impact message/details so the user can tell whether:
  - [ ] Part 1 amount changed
  - [ ] the suggested value changed because the economy data changed
  - [ ] the suggested value changed because the formula changed
- [ ] For `split_suggestion_shift`, if the row was previously reviewed with `Leave as is`, and the new suggestion is further away from the current Part 2 value than the last reviewed suggestion, prefer wording like:
  - [ ] "you decided to leave the original value last time, but the suggested value has drifted further now"
- [ ] Because closer / sideways repeat drifts are suppressed, this message path only appears for materially worse repeat drift.
- [ ] Do not add new controls in this pass.

Target file:

- [ ] `/Users/jhandl/FinSim/src/frontend/web/components/RelocationImpactAssistant.js`

## Implementation Plan

- [ ] Step 1: Centralize split suggestion calculation into one minimal helper that returns the normalized suggested amount.
- [ ] Step 2: Add persisted fields for the reviewed suggested amount and the reviewed model version, and wire them through CSV/meta load-save.
- [ ] Step 3: Update split creation and `Update value` / `Leave as is` flows to write the reviewed suggested amount and model version.
- [ ] Step 4: Update the detector to:
  - [ ] keep existing `amount` drift behavior
  - [ ] add generic `split_suggestion_shift` detection for `suggested` rows with reviewed suggestion metadata
  - [ ] classify `split_suggestion_shift` as `economic` vs `model`
  - [ ] apply the 1% tolerance consistently
  - [ ] suppress repeat impacts unless the current suggestion moved farther away from the retained Part 2 value than the reviewed suggestion
  - [ ] suppress all such impacts for `custom` rows
- [ ] Step 5: Extend the resolution panel to reuse the same actions for both split-drift categories and add the "drifted further" repeat-impact wording for materially worse repeat drift.
- [ ] Step 6: Add focused regression coverage and CSV/meta round-trip coverage.
- [ ] Step 7: Update JS cache-busting in `index.html`.

## Tests

- [ ] Suggested row: Part 1 amount changes, Part 2 stale -> `split_amount_shift`.
- [ ] Suggested row: Part 1 amount changes, user clicks `Leave as is` -> no repeat badge unless a later suggestion moves farther away from the retained Part 2 value.
- [ ] Suggested row: after `Leave as is`, a new Part 1 change that moves the suggestion farther away from the retained Part 2 value -> `split_amount_shift`.
- [ ] Suggested row: after `Leave as is`, a new Part 1 change that moves the suggestion closer to the retained Part 2 value -> no repeat badge.
- [ ] Suggested row: economic data changes, Part 2 stale -> `split_suggestion_shift` with `reason='economic'`.
- [ ] Suggested row: formula changes the suggested value, Part 2 stale -> `split_suggestion_shift` with `reason='model'`.
- [ ] Suggested row: current suggestion changes, but current Part 2 already equals the new suggestion -> no impact.
- [ ] Suggested row: current suggestion changes by less than 1% -> no impact.
- [ ] Suggested row: after `Leave as is`, a later non-Part-1 suggestion change that moves the suggestion farther away from the retained Part 2 value -> `split_suggestion_shift`.
- [ ] Suggested row: after `Leave as is`, a later non-Part-1 suggestion change that moves the suggestion closer to the retained Part 2 value -> no repeat badge.
- [ ] Custom row: no amount/suggestion drift impacts.
- [ ] `Update value` refreshes amount plus reviewed suggested value and reviewed model version.
- [ ] `Leave as is` refreshes reviewed suggested value and reviewed model version without changing Part 2 amount.
- [ ] Drift-impact details correctly capture previous vs current distance for the remaining raised cases.
- [ ] New reviewed-suggestion fields survive CSV save/load and inline meta round-trip.

Suggested target tests:

- [ ] `/Users/jhandl/FinSim/tests/TestRelocationImpactDetection.js`
- [ ] `/Users/jhandl/FinSim/tests/TestRelocationCutShort.test.js`
- [ ] `/Users/jhandl/FinSim/tests/RelocationMvRemediation.test.js`
- [ ] `/Users/jhandl/FinSim/tests/ConfidenceTestH_CSVRoundtrip.js`

## Assumptions

- [ ] `splitValueMode=custom` remains one-way in this pass.
- [ ] No new user-facing toggle or “resume suggestions” control will be added.
- [ ] We only care about notifying when the **rounded suggested value changes** by at least 1%.
