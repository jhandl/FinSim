# linkedCountry Age Change Bugs

## Overview

This document describes three related bugs where the `linkedCountry` attribute on real estate (R) and mortgage (M) events is not automatically updated when event ages or relocation ages change, potentially causing incorrect inflation calculations and currency conversions in multi-country scenarios.

## Bug 1: linkedCountry Not Updated When Event Ages Change

> [!WARNING]
> **Status: PENDING** (analyzed 2025-12-31)
> 
> `_scheduleRelocationReanalysis()` calls `analyzeEvents()` after age changes, but `analyzeEvents()` only flags boundary-crossing events — it does not validate or update existing `linkedCountry` values against the current country timeline.

### Problem

When a user changes the `fromAge` or `toAge` of a property or mortgage event, and the event moves into a different country residence period, the `linkedCountry` attribute is not automatically updated to reflect the new country context.

### Example Scenario

1. User has a property event at age 30 in Ireland (IE)
2. Relocation to Argentina (AR) occurs at age 35
3. Property has `linkedCountry: 'ie'` (correct initially)
4. User changes property `fromAge` from 30 to 40 (now starts in AR period)
5. **Bug:** `linkedCountry` remains `'ie'` (incorrect) — should be `'ar'` or cleared for user review

### Root Cause

- Age changes trigger `_scheduleRelocationReanalysis()` which re-analyzes relocation impacts
- `RelocationImpactDetector.analyzeEvents()` flags impacts but does not update `linkedCountry`
- `linkedCountry` is only set via manual "Link to Country" action, never automatically

### Suggested Fix

**Location:** `src/frontend/web/components/EventsTableManager.js` — `_scheduleRelocationReanalysis()`

After reanalysis completes (after line 456), add logic to:
1. For R/M events, check if `fromAge` places them in a different country period than their current `linkedCountry`
2. If `linkedCountry` is set and doesn't match the country at `fromAge`:
   - **Option A (Conservative):** Clear `linkedCountry` and flag event for user review
   - **Option B (Aggressive):** Auto-update `linkedCountry` to match country at `fromAge` with user notification

Use `detectPropertyCountry(event.fromAge, startCountry)` to determine the correct country.

---

## Bug 2: Mortgage and Property with Different Start Ages

> [!WARNING]
> **Status: PENDING** (analyzed 2025-12-31)
>
> `linkPropertyToCountry()` applies the same `linkedCountry` to both R and M events with matching IDs. `detectPropertyCountry()` is not called separately for each event's `fromAge`, and there is no validation warning if R and M would have different countries.

### Problem

If a mortgage (M) event has a different `fromAge` than its corresponding property (R) event, and they fall in different country residence periods, `linkedCountry` may be incorrectly set for one or both events.

### Example Scenario

1. Property (R) at age 30 in IE, `linkedCountry: 'ie'`
2. Mortgage (M) at age 32 in IE (before relocation)
3. Relocation to AR at age 35
4. If mortgage `fromAge` is changed to 36, it now starts in AR period
5. **Bug:** `linkedCountry` may still be `'ie'` if it was set based on the property's age, even though mortgage starts in AR

### Root Cause

- `linkPropertyToCountry()` applies the same `linkedCountry` to both R and M events with the same ID
- `detectPropertyCountry()` uses the property's `fromAge`, not the mortgage's
- No validation checks if R and M would have different countries at their respective `fromAge` values

### Suggested Fix

**Location:** `src/frontend/web/components/EventsTableManager.js` — `linkPropertyToCountry()` (around line 1870)

1. When applying `linkedCountry` to R/M pairs, detect the country for each event's `fromAge` separately:
   ```javascript
   const propertyCountry = this.detectPropertyCountry(propertyEvent.fromAge, startCountry);
   const mortgageCountry = this.detectPropertyCountry(mortgageEvent.fromAge, startCountry);
   ```
2. If countries differ, set `linkedCountry` individually for each event
3. Add validation warning if R and M would have different `linkedCountry` values due to age mismatch

Also update `detectPropertyCountry()` to accept an optional event type parameter to handle mortgages separately if needed.

---

## Bug 3: linkedCountry Not Updated When Relocation Age Changes

> [!WARNING]
> **Status: PENDING** (analyzed 2025-12-31)
>
> Relocation age changes trigger `_scheduleRelocationReanalysis()`, which clears and re-analyzes impacts, but does not check if existing `linkedCountry` values have become stale. The suggested `'country_mismatch'` impact category does not exist in the codebase.

### Problem

When a user changes the `fromAge` of a relocation (MV-*) event, existing property/mortgage events that move into different country residence periods do not have their `linkedCountry` updated to reflect the new timeline.

### Example Scenario

1. Property at age 30, `linkedCountry: 'ie'`
2. Relocation to AR at age 35
3. User changes relocation `fromAge` from 35 to 32
4. Property (age 30) is now in the AR period (since relocation happens earlier)
5. **Bug:** `linkedCountry` remains `'ie'` (incorrect) — should be updated to `'ar'` or cleared

### Root Cause

- Relocation age changes trigger reanalysis via `_scheduleRelocationReanalysis()`
- Reanalysis flags new impacts but doesn't update `linkedCountry` for events that move jurisdictions
- `clearResolvedImpacts()` checks if `linkedCountry` is set but doesn't validate it matches the current country timeline

### Suggested Fix

**Location:** `src/frontend/web/components/RelocationImpactDetector.js` — `analyzeEvents()` (after line 116)

Add a new validation pass after the main analysis:
1. For R/M events with existing `linkedCountry`, check if the country at their `fromAge` matches the `linkedCountry`
2. If mismatch detected:
   - **Option A:** Clear `linkedCountry` and add impact flag for user review
   - **Option B:** Auto-update `linkedCountry` with notification
3. Consider adding a new impact category `'country_mismatch'` for events where `linkedCountry` doesn't match the country at `fromAge`

This validation should run after the timeline is built but before `clearResolvedImpacts()`.

---

## Additional Considerations

### 1. Auto-Update vs. Flagging Strategy

**Conservative Approach (Recommended):**
- Clear `linkedCountry` when mismatch detected
- Flag event with impact indicator
- Require user to explicitly set `linkedCountry` via "Link to Country" action
- **Pros:** User maintains control, avoids silent data changes
- **Cons:** More user interaction required

**Aggressive Approach:**
- Auto-update `linkedCountry` to match country at `fromAge`
- Show notification toast explaining the change
- **Pros:** Less user friction, maintains data consistency
- **Cons:** May surprise users, could overwrite intentional settings

**Hybrid Approach:**
- Auto-update if `linkedCountry` was never manually set (no hidden input in DOM)
- Flag for review if `linkedCountry` was explicitly set by user
- **Pros:** Balances automation with user intent
- **Cons:** Requires tracking whether `linkedCountry` was user-set

### 2. Impact on Property Appreciation

`Property.getValue()` uses `linkedCountry` to determine inflation rate for property appreciation:

```214:228:src/core/RealEstate.js
          // Determine the asset country: linkedCountry -> params.StartCountry -> '' (let service decide).
          var assetCountry = '';
          var derivedCountry = this.getLinkedCountry();
          if (derivedCountry !== null && derivedCountry !== undefined && derivedCountry !== '') {
            assetCountry = derivedCountry;
          } else {
            try {
              if (typeof params !== 'undefined' && params && params.StartCountry) {
                assetCountry = params.StartCountry;
              }
            } catch (_) {
              assetCountry = '';
            }
          }
```

If `linkedCountry` is incorrect, property appreciation will use the wrong country's inflation rate, leading to incorrect property values over time.

### 3. Impact on Currency Conversion

During simulation, `getEventCurrencyInfo()` uses `linkedCountry` to determine currency and country for conversions:

```1514:1527:src/core/Simulator.js
        var mortgageInfo = getEventCurrencyInfo(event, event.linkedCountry || currentCountry);
        if (person1.age == event.fromAge) {
          // mortgage() receives numeric principal + currency/country metadata.
          // Asset classes track Money internally; Simulator works with numbers only.
          realEstate.mortgage(event.id, event.toAge - event.fromAge, event.rate, event.amount, mortgageInfo.currency, mortgageInfo.country);
        }
        if (inScope) {
          var payment = realEstate.getPayment(event.id);
          var mortgageCurrency = mortgageInfo.currency;
          var mortgageCountry = mortgageInfo.country;
          var storedCurrency = realEstate.getCurrency(event.id);
          if (storedCurrency) mortgageCurrency = storedCurrency;
          var storedCountry = realEstate.getLinkedCountry(event.id);
          if (storedCountry) mortgageCountry = storedCountry;
```

Incorrect `linkedCountry` can cause:
- Wrong currency assignments
- Incorrect FX rate lookups
- Misattributed expenses/income in attribution reports

### 4. Backward Compatibility

- Existing scenarios without `linkedCountry` should continue to work (fallback to `currentCountry` or `StartCountry`)
- Scenarios with manually set `linkedCountry` should be preserved unless explicitly changed
- CSV serialization/deserialization must handle `linkedCountry` correctly (already supported via meta column)

### 5. Testing Considerations

When implementing fixes, test:
- Property/mortgage events moving across single relocation boundary
- Multiple relocations with events spanning multiple boundaries
- Property and mortgage with mismatched ages in different countries
- Relocation age changes that shift entire timeline
- Edge cases: events at exact relocation age, events spanning multiple relocations
- CSV round-trip with `linkedCountry` set/unset

### 6. User Experience

- Provide clear visual indicators when `linkedCountry` needs review
- Show which country the event would be in based on current timeline
- Make it easy to set/update `linkedCountry` via resolution panels
- Consider adding bulk "Update All Property Countries" action for scenarios with many properties

---

## Related Code Locations

- `src/frontend/web/components/EventsTableManager.js` — Age change handlers, `linkPropertyToCountry()`, `detectPropertyCountry()`
- `src/frontend/web/components/RelocationImpactDetector.js` — Impact analysis, `analyzeEvents()`, `clearResolvedImpacts()`
- `src/core/Simulator.js` — `getEventCurrencyInfo()`, property/mortgage processing
- `src/core/RealEstate.js` — `Property.getValue()`, inflation rate resolution
- `src/frontend/web/components/RelocationImpactAssistant.js` — Resolution UI, "Link to Country" action

---

## Priority

**High** — These bugs can cause incorrect financial calculations in multi-country scenarios, affecting:
- Property appreciation rates (wrong inflation)
- Currency conversions (wrong FX rates)
- Attribution reports (wrong country assignments)
- Overall simulation accuracy

Fixes should be implemented before the next release that includes relocation features.



