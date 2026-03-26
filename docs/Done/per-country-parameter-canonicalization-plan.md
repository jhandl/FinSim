# Per-Country Parameter Canonicalization Plan

## Goal

- [ ] Make country-scoped parameters single-source-of-truth per country.
- [ ] Restrict legacy field translation to [`LegacyScenarioAdapter.js`](/Users/jhandl/FinSim/src/core/LegacyScenarioAdapter.js).
- [ ] Remove runtime mode-switch syncing between legacy scalar inputs and per-country inputs.
- [ ] Keep save/load compatibility for old CSV files by translating them into canonical keys during deserialization.

## CSV Contract

- [ ] Write forward: serialization emits only canonical keys for country-scoped parameters.
- [ ] Read legacy: deserialization continues to accept legacy keys through [`LegacyScenarioAdapter.js`](/Users/jhandl/FinSim/src/core/LegacyScenarioAdapter.js).
- [ ] Do not dual-write legacy and canonical country-scoped keys in modern saves.

## Strict Compatibility Rules

- [ ] Treat scenarios as belonging to exactly one of two formats:
- [ ] legacy scenarios are read-only compatibility inputs
- [ ] modern scenarios are canonical-only outputs and runtime state
- [ ] Do not support intermediate or mixed legacy-canonical scenario formats.
- [ ] Do not add fallback reads from legacy field names anywhere outside [`LegacyScenarioAdapter.js`](/Users/jhandl/FinSim/src/core/LegacyScenarioAdapter.js).
- [ ] Do not add fallback writes of legacy field names anywhere in the app.
- [ ] Keep legacy compatibility as tightly constrained as possible to one place:
- [ ] legacy key recognition and translation lives in [`LegacyScenarioAdapter.js`](/Users/jhandl/FinSim/src/core/LegacyScenarioAdapter.js)
- [ ] non-adapter code may invoke the adapter, but must not contain its own knowledge of individual legacy country-scoped field names
- [ ] help, wizard, and tour selector config must not encode legacy country-scoped field IDs once canonical selectors exist
- [ ] If canonical fields are required at runtime, materialize those canonical fields deterministically instead of falling back to legacy fields.
- [ ] Prefer deleting compatibility branches over preserving “just in case” fallbacks once canonical materialization exists.

## Canonical Contract

- [ ] Treat these as the only runtime source of truth for country-scoped values:
- [ ] `Inflation_<country>`
- [ ] `LocalAssetGrowth_<country>_<baseKey>`
- [ ] `LocalAssetVolatility_<country>_<baseKey>`
- [ ] `StatePension_<country>`
- [ ] `P2StatePension_<country>`
- [ ] `P1PensionContrib_<country>`
- [ ] `P2PensionContrib_<country>`
- [ ] `PensionCapped_<country>`
- [ ] `TaxCredit_<creditId>_<country>`
- [ ] `InvestmentAllocation_<country>_<baseKey>`
- [ ] Keep non-country global economy fields unchanged:
- [ ] `GlobalAssetGrowth_<baseRef>`
- [ ] `GlobalAssetVolatility_<baseRef>`
- [ ] When the UI is showing a single-country view, render the `StartCountry` canonical inputs directly instead of separate legacy inputs.
- [ ] When `StartCountry` changes, do not migrate values across countries. Different country means different parameter bucket.
- [ ] Ensure canonical StartCountry inputs always exist before any load/read path touches them, including:
- [ ] relocation-disabled mode
- [ ] chips-hidden single-country mode
- [ ] ruleset-conditional UI sections such as configurable tax credits

## Scope

- [ ] `src/frontend/web/WebUI.js`
- [ ] `src/frontend/UIManager.js`
- [ ] `src/core/Utils.js`
- [ ] `src/core/LegacyScenarioAdapter.js`
- [ ] `src/frontend/web/components/Wizard.js`
- [ ] `src/frontend/web/assets/help.yml`
- [ ] Tests covering CSV load/save, parameter reads, and UI mode switches

## Work Plan

### 1. Canonicalize Legacy CSV Mapping

- [ ] Add a deterministic StartCountry lock in `deserializeSimulation()` before any country-key mapping runs.
- [ ] Resolve `startCountryForNormalization` from a full parameters pre-scan of the file, not from encounter order during the main load loop.
- [ ] If `StartCountry` is absent from the file, lock to the existing deterministic fallback path once, then use that locked value for all legacy country-key normalization.
- [ ] Add coverage for files where `StartCountry` appears after legacy country-scoped fields, proving mapping still binds to the correct country.
- [ ] Update `LegacyScenarioAdapter.mapFieldName()` so legacy country-scoped CSV fields map directly to canonical per-country keys.
- [ ] Map legacy `Inflation` to `Inflation_<startCountry>` instead of preserving a runtime scalar field.
- [ ] Map legacy local investment economy fields to `LocalAssetGrowth_<startCountry>_<baseKey>` and `LocalAssetVolatility_<startCountry>_<baseKey>`.
- [ ] Keep baseRef-backed legacy growth/volatility mapping pointed at `GlobalAssetGrowth_*` and `GlobalAssetVolatility_*`.
- [ ] Keep old allocation aliases and other CSV-era names supported only through the adapter.
- [ ] Remove individual legacy country-scoped key handling from non-adapter code paths once adapter coverage is complete.

### 2. Remove Legacy Runtime Economy Inputs

- [ ] In `WebUI.renderInvestmentParameterFields()`, stop treating `Inflation`, `{key}GrowthRate`, and `{key}GrowthStdDev` as live editable runtime fields.
- [ ] Render `Inflation_<startCountry>` when chips are hidden, matching the allocations-panel pattern where the visible single-country row already uses the canonical per-country ID.
- [ ] Render `LocalAssetGrowth_<startCountry>_<baseKey>` and `LocalAssetVolatility_<startCountry>_<baseKey>` when chips are hidden.
- [ ] Keep chip-driven economy mode as a pure show/hide switch over canonical per-country inputs, not a switch between different IDs.
- [ ] Remove legacy-to-canonical oninput mirroring in the growth panel.
- [ ] Remove hidden legacy economy row dependencies once no runtime code reads them.

### 3. Simplify Parameter Reads

- [ ] In `UIManager.readParameters()`, read country-scoped values only from canonical per-country IDs.
- [ ] Build `investmentGrowthRatesByKey` only from `LocalAssetGrowth_*_*` and `GlobalAssetGrowth_*`.
- [ ] Build `investmentVolatilitiesByKey` only from `LocalAssetVolatility_*_*` and `GlobalAssetVolatility_*`.
- [ ] Derive any remaining compatibility scalar values from canonical fields in one place if the core still expects them.
- [ ] Specifically, if `params.inflation` must remain for older core paths, derive it from `Inflation_<StartCountry>` rather than from a legacy DOM field.
- [ ] If `params.personalTaxCredit` must remain for older core paths, derive it from `TaxCredit_personal_<StartCountry>` rather than from a legacy DOM field.

### 4. Core Scalar Compatibility Cleanup

- [ ] Audit core consumers that still rely on legacy scalar fallbacks for country-scoped behavior.
- [ ] Cover at minimum:
- [ ] `params.inflation` fallback paths
- [ ] `params.personalTaxCredit` fallback paths
- [ ] Do not remove runtime bridges for these values until one of these is true:
- [ ] the core consumer has been updated to read canonical per-country structures directly
- [ ] or the scalar is explicitly derived from the canonical StartCountry field in one agreed normalization step
- [ ] Document the chosen temporary compatibility rule so behavior cannot drift during the transition.

### 5. Simplify Serialization and Deserialization

- [ ] In `serializeSimulation()` and related `Utils.js` helpers, stop consulting legacy scalar economy inputs as fallback sources.
- [ ] Persist canonical per-country economy fields directly.
- [ ] Remove post-load migration branches that copy legacy runtime economy fields into canonical fields.
- [ ] After adapter normalization, `deserializeSimulation()` should set canonical fields directly and stop special-casing legacy inflation/local-growth UI behavior.
- [ ] Keep legacy CSV compatibility at file-ingest time only.
- [ ] Ensure deserialization materializes canonical target inputs before `setValue()` runs, even when the visible UI for that field family has not yet been rendered.
- [ ] Ensure `Utils.js` handles legacy scenarios only by calling [`LegacyScenarioAdapter.js`](/Users/jhandl/FinSim/src/core/LegacyScenarioAdapter.js) and then proceeding with canonical keys.
- [ ] Do not leave behind serializer or deserializer branches for hypothetical mixed-format scenarios.

### 6. Finish the Country-Scoped Cleanup

- [ ] Review country-scoped fields that already mostly use canonical IDs but still have legacy runtime bridges.
- [ ] Remove non-adapter legacy bridges for state pension, pension contribution, and personal tax credit wherever the canonical per-country field already exists.
- [ ] Define the materialization rule for each field family before removing its bridge:
- [ ] canonical StartCountry field exists even with chips hidden
- [ ] non-StartCountry canonical fields can be ensured on demand during load
- [ ] ruleset-conditional fields can be `ensureParameterInput()`-materialized without requiring the visible UI section
- [ ] Keep any remaining scalar fields only if they are truly non-country-scoped or required by production-branch compatibility.
- [ ] Reject “fallback for safety” additions during this cleanup unless they are strictly part of read-only legacy ingest via [`LegacyScenarioAdapter.js`](/Users/jhandl/FinSim/src/core/LegacyScenarioAdapter.js).

### 7. Wizard and Help Selector Cleanup

- [ ] Replace legacy guided-help selectors for country-scoped fields with canonical selector targets or semantic current-country selector tokens.
- [ ] Remove hardcoded legacy selector remapping for `#StatePensionWeekly`, `#P2StatePensionWeekly`, and `#PersonalTaxCredit` from `Wizard.js`.
- [ ] Update `help.yml` so tours target canonical current-country fields rather than legacy IDs.
- [ ] If a dynamic selector abstraction is still needed, make it canonical-first and country-aware without referencing legacy field names.

### 8. Tests

- [ ] Update `tests/ConfidenceTestH_LegacyDeserial.js` so legacy CSV expectations target canonical per-country fields instead of legacy runtime fields.
- [ ] Update `tests/TestEconomyGrowthPersistence.js` so its single-country and MV-switch scenarios assert canonical IDs throughout.
- [ ] Add a focused regression test for the exact bug class:
- [ ] Edit StartCountry local growth/volatility in single-country mode.
- [ ] Add an effective `MV` event.
- [ ] Assert the visible per-country inputs keep the edited values.
- [ ] Add the same regression for inflation using `Inflation_<startCountry>`.
- [ ] Add a read-parameters test proving `UIManager.readParameters()` no longer gives precedence to legacy economy IDs.
- [ ] Add a serialization test proving modern saves emit canonical economy fields without requiring legacy DOM inputs.
- [ ] Add a deserialization test where `StartCountry` appears after legacy country-scoped fields in CSV and confirm those fields still normalize to the correct canonical country.
- [ ] Update wizard/help tests so guided steps resolve to canonical current-country selectors and never rely on legacy field IDs.

## Acceptance Criteria

- [ ] Adding or removing an `MV` event never changes the stored value for StartCountry inflation or local investment growth/volatility.
- [ ] Country chips only change which canonical country bucket is visible.
- [ ] Changing `StartCountry` changes which country bucket is shown, without copying previous-country values into the new country.
- [ ] Legacy CSV files still load correctly, but they land in canonical per-country fields immediately.
- [ ] Modern saves no longer depend on legacy runtime field IDs for country-scoped parameters.
- [ ] Modern saves emit canonical country-scoped keys only.
- [ ] Legacy country-scoped CSV keys are accepted on load regardless of their ordering relative to `StartCountry`.
- [ ] Runtime bridge removal does not change core behavior for StartCountry inflation or personal tax credit during the transition.
- [ ] No app code outside `LegacyScenarioAdapter.js` treats legacy economy field names as authoritative input sources.
- [ ] No app code outside [`LegacyScenarioAdapter.js`](/Users/jhandl/FinSim/src/core/LegacyScenarioAdapter.js) recognizes individual legacy country-scoped CSV keys.
- [ ] No modern save path emits a mixed legacy-canonical scenario.
- [ ] Wizard logic and help/tour config do not reference legacy country-scoped field IDs.

## Non-Goals

- [ ] Do not include blank-versus-zero parsing cleanup in this change set.
- [ ] Do not refactor unrelated non-country-scoped parameters.
