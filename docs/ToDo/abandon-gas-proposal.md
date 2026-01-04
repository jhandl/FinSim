# Proposal: Abandon Google Apps Script (GAS) Compatibility

Date: 2026-01-03  
Status: Proposal  
Scope: Architecture + code organization; no TypeScript, no Vite/bundler.

## Background

FinSim’s core originally targeted both the browser and Google Apps Script (GAS). As the simulator has grown (multi-currency, relocation, dynamic assets, PV semantics, richer UI), the constraints required for GAS compatibility (no modules, limited JS features, reliance on ambient globals, shims like `typeof require`, etc.) now impose more complexity than they save.

This proposal describes how to remove GAS compatibility while keeping the **core simulator separate from the UI** and simplifying the architecture.

## Goals

- Remove GAS constraints and code paths (no SpreadsheetApp/GAS UI, no GAS-specific shims).
- Keep a strict separation between:
  - **Core**: scenario → deterministic results (plus optional Monte Carlo via injected RNG).
  - **UI**: DOM rendering, localStorage, file import/export, toasts/modals, fetch.
- Reduce global/shared mutable state (especially in `src/core/Simulator.js`).
- Standardize error handling and make behavior less “surprising”.
- Preserve the static-site deployment model (GitHub Pages).
- Preserve the existing test strategy (Node-based core tests + Jest + Playwright), with minimal disruption.

## Non-Goals

- No TypeScript migration.
- No Vite (or other bundler) adoption in this phase.
- No large UI rewrite (table remains the canonical source of truth for events).
- No attempt to “perfectly functional” core; incremental improvement is preferred.

## Current Pain Points (Why GAS removal helps)

These issues exist today primarily to satisfy the “core must run in GAS” requirement:

- **Ambient globals as implicit dependencies**: core helpers often rely on `params`, `year`, `currentCountry`, `residenceCurrency`, `errors`, etc. (hard to reason about, hard to test in isolation).
- **Boundary leakage**: `src/frontend/UIManager.js` both bridges environments and touches browser DOM, while core directly drives UI lifecycle (status/progress, flushing).
- **Shims and environment detection**: `typeof require`, `module.exports`, and global exports complicate mental models and error contracts.
- **Singletons where instance wiring would be clearer**: `Config.getInstance()`, `WebUI.getInstance()`, etc.

Dropping GAS allows us to choose one runtime baseline (modern browsers + Node) and simplify accordingly.

## Target Architecture (Post-GAS)

### Core API (single entrypoint)

The UI should call core through **one exported function**:

```js
// core entrypoint (shape, not final naming)
runSimulation(scenario, { rules, economicData, rng, logger }) -> result
```

Where:
- `scenario` includes `params` and `events` (and optionally a starting state).
- `rules` is a preloaded set of tax rules/config data (no fetching inside core).
- `economicData` is a prepared EconomicData-like provider (or rules-derived structure).
- `rng` is injected (seeded) for Monte Carlo determinism.
- `logger` is optional (default no-op), used for debug-level traces.

The return value includes:
- `dataSheet` (yearly ledger rows)
- derived aggregates (for chart/table)
- `warnings[]` and `errors[]` (user-facing issues)
- optional debug traces (off by default)

### Boundary rules

**Core must not:**
- touch the DOM (`document`, `window`)
- read/write localStorage
- fetch URLs
- show toasts/modals
- mutate global module state that survives across runs

**UI must own:**
- loading config JSON and country rule JSON
- persistence of selected simulator version and UI preferences
- event table ↔ accordion synchronization (still UI-side)

## Implementation Strategy (No bundler)

To keep the static site simple without Vite:

### Option A (recommended for minimal disruption): “Single global namespace export”

- Keep browser loading via `<script>` tags (non-module), but:
  - consolidate all public core exports under one object, e.g. `globalThis.FinSimCore`
  - make core entrypoint `FinSimCore.runSimulation(...)`
- Node tests can load the same scripts the way they do today (global environment), but call `FinSimCore.runSimulation` instead of relying on simulator globals.

This avoids ESM/Jest friction while still enabling architectural cleanup.

### Option B (future): Native ESM in browser

- Convert core and UI code to ES modules and load using `<script type="module">`.
- Update Node test harness accordingly (Jest + custom framework ESM support).

This is a good long-term direction but likely increases short-term test/config churn.

This proposal assumes **Option A now**, and keeps Option B as a later step.

## Proposed Refactors (Concrete)

### 1) Replace simulator globals with an explicit `SimulationContext`

Create a single context object that contains all state currently stored in module-level globals:
- scenario inputs: `params`, `events`
- runtime state: `year`, `currentCountry`, `residenceCurrency`, `periods`, etc.
- models: `person1`, `person2`, assets, `taxman`, `realEstate`, attribution manager
- caches: FX conversion caches, lookup caches
- outputs: `dataSheet`, `warnings`, `errors`

Refactor helpers in `src/core/Simulator.js` from:
- `convertCurrencyAmount(value, ...)`
to:
- `convertCurrencyAmount(ctx, value, ...)`

This is the single biggest simplification step because it makes dependencies explicit and sharply reduces “spooky action at a distance”.

### 2) Stop core from driving UI lifecycle

Today, core calls into UI frequently (`setStatus`, `flush`, `updateDataSheet`, etc.). Post-GAS:

- Core should accumulate progress/errors and return them.
- UI should decide how/when to render progress.

Practical compromise (incremental):
- Allow core to optionally call `options.onProgress({ phase, pct, message })`, but **never** depend on it.
- Never pass the UI object itself into core.

### 3) De-singleton `Config` and remove storage/fetch from core

Refactor `src/core/Config.js` into two concepts:

- **Config data**: a plain object containing the resolved simulator config and loaded rulesets.
- **Loaders** (UI-side): code that fetches JSON and persists version selection.

Core should receive config/rules as arguments (or as fields in context), not via `Config.getInstance()`.

Immediate wins:
- Removes “initialize before use” runtime hazards.
- Eliminates `typeof require` and environment-detection scaffolding inside core.

### 4) Remove GAS UI code paths and files

Deprecate/remove:
- `src/frontend/gas/` and `GasUI`
- `SpreadsheetApp` detection branches
- “Google Sheets” IO abstractions embedded in otherwise web-oriented code

This reduces conditional logic and clarifies runtime assumptions.

### 5) Standardize error contracts

Adopt consistent patterns:

- **Programmer errors / invariant violations**: throw (e.g., currency mismatch in Money operations).
- **User/data/config errors**: collect into `result.errors[]` and return a “failed” result.
- **Recoverable user warnings**: collect into `result.warnings[]`.

Avoid mixed behavior like:
- sometimes `return null`
- sometimes “fallback to original value”
- sometimes set a global `errors = true`

This change should start at a few high-impact boundary functions:
- currency conversion helpers
- scenario validation
- config/rules loading failures

### 6) Make randomness injectable and deterministic

Replace implicit randomness usage with injected RNG:

- `rng.random()` or a simple seedable PRNG passed via options
- Monte Carlo runs should be reproducible for a given seed

This improves testability and user trust (“deterministic by default” becomes enforceable).

## Migration Plan (Incremental, Low-Risk)

### Phase 0: Declare the decision (docs + cleanup)
- Update docs to remove GAS as a supported environment.
- Add `docs/abandon-gas-proposal.md` (this document).
- Mark `src/frontend/gas/` as deprecated (or remove once Phase 2 lands).

### Phase 1: Introduce `FinSimCore.runSimulation()` wrapper
- Add a new core entrypoint file (e.g., `src/core/CoreAPI.js`) exporting `runSimulation`.
- Initially, this can delegate to the existing simulator with minimal change.
- Update tests to call `FinSimCore.runSimulation` (thin adapter).

Acceptance criteria:
- All existing tests still pass.
- Web UI still runs unchanged.

### Phase 2: Add `SimulationContext` and thread it through the core hot path
- Move globals into `ctx` (even if created inside `runSimulation`).
- Convert the most central helpers first (currency conversion, adjustment/inflation, yearly loop).
- Remove reliance on global `errors`, `dataSheet`, and other shared module state.

Acceptance criteria:
- Core can run twice in the same process without leftover state affecting results.
- Targeted core regression tests added/updated to detect state leakage.

### Phase 3: Remove UI coupling from core (no UIManager calls inside loop)
- Replace UI calls with result metadata (`warnings/errors/progress`) and/or optional callbacks.
- UI becomes responsible for rendering status/progress and for reading/writing scenario data.

Acceptance criteria:
- Core has no references to `document`, `localStorage`, or UI classes.
- `src/frontend/UIManager.js` no longer depends on core globals (or is removed).

### Phase 4: De-singleton Config and make loaders explicit
- Replace `Config.getInstance()` usage with context/config passed in.
- Move persistence/fetch to web-side loader utilities.

Acceptance criteria:
- Core can be imported/loaded without initialization order requirements.
- Config/rules are passed in; loading failures are surfaced as structured errors.

### Phase 5: Remove GAS artifacts
- Delete `GasUI` and any `SpreadsheetApp` branching.
- Delete GAS-only scripts or docs.

Acceptance criteria:
- Repository no longer contains code that claims/attempts to run under GAS.

## Risks and Mitigations

- **Risk: breaking the existing test harness**
  - Mitigation: keep Option A (global namespace export) until tests are stable; migrate tests early in Phase 1.
- **Risk: subtle numeric/currency behavior changes during context refactors**
  - Mitigation: refactor mechanically (signature changes first, behavior second), rely on existing extensive tests in `tests/`.
- **Risk: UI regressions due to core no longer “pushing” updates**
  - Mitigation: preserve current UI behavior by mapping returned progress/warnings into existing UI messaging; avoid UI rewrites.

## Success Criteria (Definition of Done)

- Core simulator can be executed as a pure library call:
  - `FinSimCore.runSimulation(scenario, deps)` produces a result without touching DOM/storage/network.
- Running multiple simulations back-to-back produces identical results to independent fresh runs (no state leakage).
- GasUI and SpreadsheetApp branches are removed.
- Error contracts are consistent and surfaced via `result.errors[]` / `result.warnings[]`.
- Existing tests continue to pass; new tests cover state leakage and core/UI boundary invariants.

## Appendix: Proposed file/module layout (illustrative)

- `src/core/CoreAPI.js` — defines `FinSimCore.runSimulation`
- `src/core/SimulationContext.js` — context creator + state container
- `src/core/sim/` — year loop, conversion helpers, event processing (pure core)
- `src/frontend/web/` — UI only (DOM, localStorage, fetch, CSV)
- `src/frontend/gas/` — removed

This keeps the current “core vs frontend” split but makes the boundary enforceable and simplifies mental models.

