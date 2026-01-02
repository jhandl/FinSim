# Currency vs Country Inference Findings

These are the known spots where event country context is available but currency-based inference can override it.

## Summary

- getEventCurrencyInfo() prioritizes currency -> country inference when event.currency is set. This can return a cached country for a currency even if event.linkedCountry is known.
- findCountryForCurrency() caches by currency code, so the first matching country for a currency (e.g., EUR -> ie) can be reused for later events with a different linkedCountry.

## Instances

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

## Implication

When event.currency is set, currency-based inference can override a known linkedCountry, which is problematic for source-country deflation and attribution in multi-country flows.
