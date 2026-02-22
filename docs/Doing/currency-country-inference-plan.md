# Currency vs Country Anchors (Strict Conversion) Plan

## Context (Findings)

This document tracks the remaining work needed to:
1) Deprecate and remove `findCountryForCurrency()` (and therefore `preferredCountry`) entirely.
2) Make **all** currency conversions strict (no fallbacks, no silent “return original amount”).

Key constraint: legacy scenarios (including `src/frontend/web/assets/demo.csv`) must continue to load and run.

### Summary

- Events already carry an explicit country context (`StartCountry`, MV destination, `event.linkedCountry`), and the simulator now completes missing `linkedCountry`/`currency` in-memory before running.
- `findCountryForCurrency()` is now only a conversion convenience / validation helper, not a “core data source”.
- Some existing tests/scenarios currently model **linked-country/currency mismatches** (e.g. `linkedCountry='ar'` with `currency='EUR'`).
  These should be removed/rewritten: for normal flows, the currency must match the ruleset currency for the flow’s country.
- Non-strict conversions still exist (explicitly or by omission), and a couple of “strict” conversions are ignored via `|| amount`.

### Instances

`findCountryForCurrency()` call sites (all in `src/core/Simulator.js`):
- `getEventCurrencyInfo()` fallback when `event.currency` is set but `event.linkedCountry` is missing
- `convertCurrencyAmount()` source/target mapping
- `processEvents()` flow bucketing fallback (`getEffectiveCurrency()`)
- `processEvents()` conversion-factor strict validation
- MV relocation inflation country selection (relocation cost deflation/inflation)

### Implication

To fully remove `findCountryForCurrency()` without breaking multi-currency support, conversions must stop trying to
infer a country from a currency by scanning cached rulesets. Instead we must:
- Always have an explicit economic/tax country (already true in practice via `linkedCountry` + in-memory completion).
- Always have an explicit country context for every currency-denominated amount (i.e., every `Money` has a valid `country`)
  that was determined from scenario facts, not via currency→country inference.

Additionally, to keep the model coherent and eliminate the last “currency-only” ambiguity:
- For normal event flows (salary/expense/income/property/etc.), **currency must match the flow country** (the country that defines that flow).
  This does **not** mean “currency must match current residence”:
  - A resident in AR can have an IE-linked salary (job in Ireland): `linkedCountry='ie'`, `currency='EUR'`, converted to ARS for residence cashflow.
  - A resident in AR can purchase/own an IE property: `linkedCountry='ie'`, `currency='EUR'`, with inflation/deflation based on IE, and converted to ARS when consolidating.

### Rules (Target State)

- There is **no** non-strict conversion mode.
- Any conversion failure is a hard error (returns `null` and aborts the run).
- Currency→country inference is removed. `preferredCountry` is removed.
- Legacy scenarios continue to load; missing fields are completed in-memory as today.

## Plan (Fixes)

### Phase 0 — Safety Net (tests + invariants)

- [ ] Ensure we have regression coverage for legacy and demo scenarios:
  - Confirm `tests/TestRegression.js` continues to exercise `src/frontend/web/assets/demo.csv`.
- [ ] Identify and rewrite tests that rely on “country/currency mismatch”:
- [ ] Identify and rewrite tests that rely on **linked-country/currency mismatch** (currency does not match the ruleset currency of `linkedCountry`):
  - If the job/property is in AR (`linkedCountry='ar'`), it should be denominated in ARS.
  - If the job/property is in IE (`linkedCountry='ie'`), it should be denominated in EUR.
  - Cross-border cases are still valid when `linkedCountry !== current residence`; they should remain covered.
  - If we need shared-currency regression coverage (e.g., multiple countries with EUR), add a dedicated test ruleset for a second EUR country (instead of mutating AR to use EUR).
- [ ] Inventory and pin all non-strict conversion call sites:
  - `convertCurrencyAmount(..., false)`
  - `convertCurrencyAmount(...)` where `strict` is omitted
  - `convertCurrencyAmount(..., true) || amount` fallthroughs

### Phase 1 — Remove non-strict conversions (without changing results)

Goal: no call site requests/depends on “best effort”.

- [ ] Convert all `strict=false` call sites to strict, and propagate `null` as a hard failure (abort run / fail test).
- [ ] Remove `|| originalAmount` fallbacks on strict conversions (these currently mask errors).
- [ ] Make `strict` default to strict-at-callers:
  - Keep the parameter temporarily, but update every call site to pass `true` explicitly so behavior is stable during refactors.
- [ ] Run core tests (`./run-tests.sh -t core`) after each cluster of changes.

### Phase 2 — Ensure country is always explicit (no currency→country)

Goal: **country is always known** for every monetary amount, and it comes only from scenario facts:
`StartCountry`, current residence country, or an explicit `linkedCountry` (plus investment `assetCountry`, which is
already explicit in rules and preloaded by scenario).

Rules:
- Never derive a country from a currency code.
- If code currently “knows the currency but not the country”, that’s a modeling/propagation bug to fix upstream,
  not something to patch with inference or a mapping table.

Work:
- [ ] Identify and eliminate any code path that constructs/handles a monetary amount with a currency but without a
  definitive country context.
- [ ] Enforce and validate the invariant: for normal event flows, the event’s currency must match the event’s known country
  (i.e. if `linkedCountry` is present, `event.currency === getCurrencyForCountry(linkedCountry)`; otherwise currency matches the residence country at that age / StartCountry).
  Any mismatch becomes a validation error (hard fail) rather than something we “support”.
- [ ] Update conversion call sites to use the explicitly-carried countries, so no conversion helper ever needs to
  “look up” a country from a currency.

### Phase 3 — Remove `findCountryForCurrency()` and `preferredCountry`

Goal: delete the function and all references.

- [ ] Refactor `convertCurrencyAmount()` to stop calling `findCountryForCurrency()`:
  - Use only the explicit `fromCountry` / `toCountry` provided by callers.
  - Validate `fromCurrency === getCurrencyForCountry(fromCountry)` and `toCurrency === getCurrencyForCountry(toCountry)`
    (or equivalently: validate that the currency/country pair is consistent with scenario-known facts).
- [ ] Refactor `getEventCurrencyInfo()` and `processEvents()` fallbacks so they never need currency→country inference.
- [ ] Remove MV relocation inflation selection’s dependency on currency→country mapping (use explicit countries only).
- [ ] Delete `findCountryForCurrency()` and remove the `preferredCountry` concept everywhere.

### Phase 4 — Simplify API: conversions are always strict

Goal: eliminate the `strict` parameter entirely.

- [ ] Remove the `strict` parameter from `convertCurrencyAmount()` and enforce strict behavior unconditionally.
- [ ] Update all call sites and tests.

### Phase 5 — Validate end-to-end

- [ ] `./run-tests.sh -t core` (and any higher-level suites you rely on before shipping).
- [ ] Manually load + run the web demo (`Demo` button → `src/frontend/web/assets/demo.csv`) to confirm no UX regressions.

- [x] Persist asset base currency + base country for investments:
  - `investmentTypes` carry `baseCurrency` and `assetCountry`, and `InvestmentTypeFactory.createAssets()` propagates them.
- [x] Load rule sets deterministically:
  - `Config.syncTaxRuleSetsWithEvents()` preloads default/start + MV + `linkedCountry` + investment `assetCountry` dependencies.
- [x] A strict conversion mode exists and is tested for unknown currencies.
