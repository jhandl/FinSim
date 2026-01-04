# Currency vs Country Inference and Conversion Fallback Plan

## Context (Findings)

These are the known spots where event country context is available but currency-based inference can override it.

### Summary

- getEventCurrencyInfo() prioritizes currency -> country inference when event.currency is set. This can return a cached country for a currency even if event.linkedCountry is known.
- findCountryForCurrency() caches by currency code, so the first matching country for a currency (e.g., EUR -> ie) can be reused for later events with a different linkedCountry.
- Currency conversion paths that do not use strict mapping can fall back to current/default country when currency->country inference fails.

### Instances

1) getEventCurrencyInfo()
- File: src/core/Simulator.js
- Behavior: when event.currency is present, it calls findCountryForCurrency(currency, linkedCountry) and can return the cached currency country even if linkedCountry is set.

2) processEvents() calls getEventCurrencyInfo(event, currentCountry) for these event types that can carry linkedCountry:
- UI (RSU)
- DBI (Defined benefit income)
- FI (Tax-free income)
- E (Expense)

If event.currency is provided, the cached currency country can override linkedCountry.

3) Relocation (event types MV-*)
- File: src/core/Simulator.js
- Behavior: uses findCountryForCurrency(event.currency, prevCountry) first. linkedCountry is only used as a fallback if currency inference fails.

### Conversion Fallback Instances (Non-Strict Mapping)

These paths call convertCurrencyAmount() without strict enforcement, which means
currency->country inference can fall back to current/default country when mapping fails.

1) Pension contribution conversion (salary processing)
- File: src/core/Simulator.js:1111
- Behavior: convertCurrencyAmount(..., strict = false) when converting salary bucket currency to pension currency.

2) Pension cap conversion (salary processing)
- File: src/core/Simulator.js:1121
- Behavior: convertCurrencyAmount(..., strict = false) when converting the pension cap to pension currency.

3) Dynamic investment contributions (asset currency mode)
- File: src/core/Simulator.js:1689
- Behavior: convertCurrencyAmount(..., strict omitted) when converting residence currency to asset base currency.

4) General helper for residence conversion
- File: src/core/Simulator.js:306-307
- Behavior: convertToResidenceCurrency() calls convertCurrencyAmount(...) with strict omitted, so any future usage will allow fallback mapping.

### Implication

When event.currency is set, currency-based inference can override a known linkedCountry, which is problematic for source-country deflation and attribution in multi-country flows.
Separately, non-strict conversion paths can use fallback country mapping, which undermines the "no conversion fallbacks" intent even when FX mode remains evolution.

### Guidelines (Strict vs. Non-Strict Conversions)

- Strict should be required for any conversion that affects ledger math, taxes, balances, asset values, or simulation outcomes.
- Non-strict should only be used for display-only conversions where a warning is acceptable and no downstream math depends on the result.
- Ledger-impacting flows should throw or hard-error on unmappable currencies (no silent fallback to current/default country).
- If the currency is invalid or user-provided data is malformed (manual CSV edits, legacy fields, typos), fail fast and surface the error instead of inferring a country.

## Plan (Fixes)

Checklist:

- [ ] Enforce explicit country context whenever currency is set:
  - Require `linkedCountry` for events that carry `currency` and validate on load.
  - Persist asset base country alongside base currency for all assets and investments.
- [ ] Remove fallback inference in core ledger paths:
  - Convert all ledger-impacting conversions to `strict` and hard-fail on unmappable currencies.
  - Replace `currentCountry`/default fallbacks in currency mapping with explicit errors.
- [ ] Load rule sets deterministically:
  - Preload all countries referenced by scenario events/assets on scenario load.
  - Ensure currency->country resolution is driven by explicit country fields, not cached lookups.
  - Load rulesets for every event `linkedCountry` and for asset base country metadata; do not derive countries from currency codes.
- [ ] Gate non-strict conversions to display-only:
  - Limit non-strict to UI-only formatting helpers; add warnings and no downstream math usage.
- [ ] Add validation and tests:
  - Scenario load validation for missing/invalid currency/country pairs.
  - Tests to assert strict failures for malformed scenarios and no inference in ledger paths.
- [ ] Remove currency->country inference:
  - Delete `findCountryForCurrency()` usage once `linkedCountry`/asset country is required everywhere.
  - Remove fallback branches that select current/default country based on currency.
