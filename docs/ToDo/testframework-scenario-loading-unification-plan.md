# TestFramework and Simulator Scenario Loading Unification Plan

## Objective

Eliminate duplicated scenario normalization/parsing paths so that:

1. Web app simulation runs and TestFramework runs use the same normalization logic.
2. CSV loading behavior is consistent across UI and test harnesses.
3. Tooling scripts (like Monte Carlo analysis) can rely on one canonical loader path.

## Problem Summary

Current behavior is split:

1. Web path:
- `deserializeSimulation()` in `src/core/Utils.js` loads CSV into UI keys.
- `UIManager.readParameters()` in `src/frontend/UIManager.js` performs extensive normalization into runtime params.

2. Test path:
- `TestFramework.ensureVMUIManagerMocks()` in `src/core/TestFramework.js` defines a separate mocked `readParameters()` implementation.
- That logic duplicates and partially diverges from web behavior.

3. Tooling impact:
- Any script that wants “real demo scenario behavior” must recreate bridging logic.
- Subtle key-shape mismatches can produce false failures (for example NaN paths, wrong success rates).

## Design Principles

1. Single source of truth for runtime parameter normalization.
2. Core-compatible implementation (`src/core`, GAS-compatible JS style, no imports/exports).
3. UI-specific concerns stay in UI layer; data normalization moves to core helper.
4. Fail fast on invalid state, no defensive scaffolding/fallback defaults beyond existing intended behavior.

## Target End State

Add a shared core normalizer module and make both UI and TestFramework call it.

Planned module:

1. `src/core/ScenarioNormalization.js`
- Pure transformation utilities.
- No DOM access.
- Accepts raw parameter bag and optional event list/context.
- Returns canonical runtime parameter object used by simulator.

Planned consumers:

1. `src/frontend/UIManager.js`
- `readParameters()` will call shared normalizer after collecting raw values.

2. `src/core/TestFramework.js`
- Mock `readParameters()` will call shared normalizer instead of local duplicated conversion logic.

3. New optional TestFramework helper:
- `loadScenarioCsv(filePath)` (or equivalent) to load CSV through `deserializeSimulation()` and shared normalizer directly.

## Scope

In scope:

1. Parameter normalization parity.
2. CSV load parity across UI and TestFramework.
3. Removal of duplicated normalization branches from TestFramework mock path.
4. Update analysis scripts to use canonical TestFramework CSV path.

Out of scope:

1. Full event-table DOM emulation in tests.
2. Major UI workflow redesign.
3. Tax engine behavior changes.

## Detailed Work Plan

## Phase 0: Baseline and Safety Nets

- [ ] Capture baseline behavior before refactor:
- [ ] `./run-tests.sh TestRegression`
- [ ] `./run-tests.sh TestInvestmentSerialization`
- [ ] `./run-tests.sh TestMonteCarloValidation`
- [ ] Record current demo Monte Carlo benchmark using the analysis script (`X=1000`, small repeat count) for comparison window.

Acceptance criteria:

1. Baseline tests pass.
2. Baseline success-rate range for demo scenario is documented for parity checks after refactor.

## Phase 1: Extract Shared Normalization Core

- [ ] Create `src/core/ScenarioNormalization.js`.
- [ ] Move normalization logic into explicit pure functions:
- [ ] Mode normalization (`simulation_mode`, `economyMode`).
- [ ] Legacy-to-canonical investment mapping.
- [ ] Canonical maps (`investmentGrowthRatesByKey`, `investmentVolatilitiesByKey`, `investmentAllocationsByCountry`, `pensionContributionsByCountry`, `statePensionByCountry`, `p2StatePensionByCountry`, `drawdownPrioritiesByKey`).
- [ ] Per-country propagation for relocation countries present in events.
- [ ] Dynamic investment key handling used by current mock logic.
- [ ] Return normalized params only; no warnings/DOM writes.

Acceptance criteria:

1. Function is deterministic and side-effect free.
2. No references to `document` or UI classes.
3. Works in VM context used by TestFramework and in browser/GAS environments.

## Phase 2: Wire UIManager to Shared Core

- [ ] Update `src/frontend/UIManager.js`:
- [ ] Keep existing UI value extraction/validation path.
- [ ] Replace in-method normalization transformations with a call to shared normalizer.
- [ ] Preserve current validation outcomes and warnings.

Acceptance criteria:

1. No behavior regressions in UI parameter processing.
2. Existing UI tests that depend on `readParameters()` remain green.

## Phase 3: Wire TestFramework Mock to Shared Core

- [ ] Update `src/core/TestFramework.js`:
- [ ] Load `ScenarioNormalization.js` in VM core file list.
- [ ] In `ensureVMUIManagerMocks()`, simplify `MockUIManager.prototype.readParameters` to call shared normalizer.
- [ ] Remove duplicated conversion branches now covered by shared module.
- [ ] Add `TestFramework.loadScenarioCsv(filePath)` helper:
- [ ] Initialize config.
- [ ] Call `deserializeSimulation()` with a minimal UI sink.
- [ ] Normalize via shared core helper.
- [ ] Parse event rows into `SimEvent`-compatible objects.

Acceptance criteria:

1. TestFramework CSV loading and object scenario loading produce equivalent runtime params.
2. Demo Monte Carlo success rate in TestFramework aligns with expected web range.

## Phase 4: Migrate Tooling Scripts to Canonical Loader

- [ ] Update `scripts/find-montecarlo-min-runs.js`:
- [ ] Remove custom parameter-bridging code.
- [ ] Use TestFramework CSV loader/helper directly.
- [ ] Remove temporary `[DBG]` instrumentation added during diagnosis.

- [ ] Optional follow-up:
- [ ] Update `compare.js` CSV loading path to use canonical TestFramework CSV loader instead of local mapper.

Acceptance criteria:

1. Script no longer duplicates scenario normalization.
2. Script output on demo scenario is stable and near expected success rate.

## Phase 5: Add Parity Tests

- [ ] Add a new focused test file, for example `tests/TestScenarioNormalizationParity.js`:
- [ ] Load `demo.csv` through CSV path and direct scenario definition path.
- [ ] Compare normalized keys required by simulator.
- [ ] Ensure no missing/NaN growth or pension fields.

- [ ] Add a Monte Carlo parity guard test, for example:
- [ ] Run demo scenario at fixed `monteCarloRuns` with deterministic seed sequence.
- [ ] Assert success-rate is inside a broad expected interval (for example 70% to 85%) to detect broken normalization.

Acceptance criteria:

1. Refactor is guarded against regressions by explicit parity tests.
2. CI catches reintroduction of split loading logic.

## Implementation Notes

1. Keep canonicalization logic compact and explicit.
2. Avoid hidden fallback behavior not already present in current system.
3. Prefer explicit conversion helpers over scattered inline key rewrites.
4. Keep event parsing and parameter normalization as separate concerns.

## Risks and Mitigations

Risk:
1. Subtle regressions in existing test scenarios that relied on old mock behavior.

Mitigation:
1. Add parity tests and run confidence subsets before and after each phase.

Risk:
1. UI validation side-effects accidentally moved into core normalizer.

Mitigation:
1. Keep warnings/DOM interactions in UIManager only.
2. Core helper should only transform data.

Risk:
1. Migration churn across scripts and tests.

Mitigation:
1. Introduce shared helper first.
2. Migrate one consumer at a time.
3. Keep temporary adapters only during transition, then remove.

## Verification Checklist

- [ ] `./run-tests.sh TestRegression`
- [ ] `./run-tests.sh TestInvestmentSerialization`
- [ ] `./run-tests.sh TestMonteCarloValidation`
- [ ] `./run-tests.sh TestMonteCarloAdaptiveRuns`
- [ ] `./run-tests.sh TestMonteCarloAdaptiveTargetTiming`
- [ ] New parity test passes.
- [ ] `node scripts/find-montecarlo-min-runs.js --repetitions 5 --start-runs 1000 --max-runs 1000 --target-std 2` reports expected mean success-rate range.

## Deliverables

1. New core shared normalization module.
2. Refactored UIManager and TestFramework to consume shared module.
3. Canonical TestFramework CSV loading helper.
4. Simplified Monte Carlo analysis script with no duplicated normalization.
5. New parity tests and updated documentation notes in `AGENTS.md` if architecture guidance needs explicit mention.
