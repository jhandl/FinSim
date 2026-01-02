# Multi-Country PV Deflation Fix - Staged Implementation Plan

## Problem Statement

When income/contributions originate from one country but residence is in another, PV calculations incorrectly use the **residence country's inflation** instead of the **source country's inflation**.

### Affected Columns (by priority):
1. **`pensionContributionPV`** - Confirmed bug: Irish contribution deflated by Argentina's 25.7%
2. **`incomePrivatePensionPV`** - Pension drawdown from foreign pots
3. **`incomeSalariesPV`** - Salaries from multiple countries in relocation year
4. **`incomeRentalsPV`** - Rental income from foreign properties

---

## Stage 0: Add Targeted Tests (TDD)

**Purpose:** Create failing tests that prove each bug exists, then verify they pass after fixes.

### Test File: `TestPVMultiCountryDeflation.js`

Create a dedicated test file in `src/core/tests/` with the following test cases:

#### Test 0.1: `testPensionContributionPV_ForeignContributionUsesSourceCountryInflation`
```javascript
// Setup: Irish salary (€40k) with pension contribution, then relocate to Argentina
// Expected: pensionContributionPV at age 40 should be ~€3,244 (Ireland deflation)
// Bug behavior: pensionContributionPV is ~€430 (Argentina deflation)
// Assertion: ratio pensionContributionPV/pensionContribution should be ~0.77, not ~0.10
```

#### Test 0.2: `testIncomePrivatePensionPV_ForeignPotUsesSourceCountryInflation`
```javascript
// Setup: Build Irish pension pot, relocate to Argentina, draw pension at age 65
// Expected: incomePrivatePensionPV should use Ireland's ~3% inflation
// Bug behavior: uses Argentina's ~25.7% inflation
// Assertion: ratio incomePrivatePensionPV/incomePrivatePension should be ~0.35 (25yr), not tiny
```

#### Test 0.3: `testIncomeSalariesPV_RelocationYearUsesPerCountryInflation`
```javascript
// Setup: Irish salary ending at age 40, Argentina salary starting at age 40
// Expected: Irish portion deflated by Ireland inflation, Argentine by Argentina
// Assertion: Combined PV should be weighted correctly by source country
```

#### Test 0.4: `testIncomeRentalsPV_ForeignPropertyUsesPropertyCountryInflation`
```javascript
// Setup: Irish rental property while living in Argentina
// Expected: incomeRentalsPV should use Ireland's ~3% inflation
// Assertion: ratio incomeRentalsPV/incomeRentals should reflect Ireland's deflation
```

### Validation Protocol:
1. **Run tests before any fix** → All 4 tests should **FAIL** (confirming bugs exist)
2. **Run tests after each stage fix** → Corresponding test should **PASS**
3. **Run all tests after Stage 4** → All 4 tests should **PASS**

---

## Stage 1: Pension Contributions (Confirmed Bug)
**Scope:** `pensionContributionPV` only  
**Prerequisite:** Test 0.1 fails  
**Success:** Test 0.1 passes

#### Changes:
1. Track `pensionContributionByCountry` in Simulator.js
2. Use per-country deflation in PresentValueCalculator.js

---

## Stage 2: Private Pension Income
**Scope:** `incomePrivatePensionPV`  
**Prerequisite:** Test 0.2 fails  
**Success:** Test 0.2 passes

#### Changes:
1. Track `incomePrivatePensionByCountry` in Simulator.js (from Person.pension drawdown)
2. Use per-country deflation in PresentValueCalculator.js

---

## Stage 3: Salaries
**Scope:** `incomeSalariesPV`  
**Prerequisite:** Test 0.3 fails  
**Success:** Test 0.3 passes

#### Changes:
1. Track `incomeSalariesByCountry` in Simulator.js
2. Use per-country deflation in PresentValueCalculator.js

---

## Stage 4: Rental Income
**Scope:** `incomeRentalsPV`  
**Prerequisite:** Test 0.4 fails  
**Success:** Test 0.4 passes

#### Changes:
1. Track `incomeRentalsByCountry` in Simulator.js (use event `linkedCountry`)
2. Use per-country deflation in PresentValueCalculator.js

---

## Implementation Order

```
┌─────────────────────────────────────────────────────────┐
│ Stage 0: Create Test File                               │
│ ├─ Create TestPVMultiCountryDeflation.js               │
│ ├─ Implement all 4 test cases                          │
│ ├─ Run tests → verify all 4 FAIL                       │
│ └─ Commit test file                                     │
├─────────────────────────────────────────────────────────┤
│ Stage 1: pensionContributionPV                          │
│ ├─ Implement fix in Simulator.js + PresentValueCalc    │
│ ├─ Run test 0.1 → verify PASS                          │
│ ├─ Run tests 0.2-0.4 → verify still FAIL (no scope creep)│
│ └─ Clean up debug logs, commit                          │
├─────────────────────────────────────────────────────────┤
│ Stage 2: incomePrivatePensionPV                         │
│ ├─ Implement fix                                        │
│ ├─ Run tests 0.1-0.2 → verify PASS                     │
│ ├─ Run tests 0.3-0.4 → verify still FAIL               │
│ └─ Commit                                               │
├─────────────────────────────────────────────────────────┤
│ Stage 3: incomeSalariesPV                               │
│ ├─ Implement fix                                        │
│ ├─ Run tests 0.1-0.3 → verify PASS                     │
│ ├─ Run test 0.4 → verify still FAIL                    │
│ └─ Commit                                               │
├─────────────────────────────────────────────────────────┤
│ Stage 4: incomeRentalsPV                                │
│ ├─ Implement fix                                        │
│ ├─ Run ALL tests → verify ALL PASS                     │
│ └─ Final commit                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Files Changed

| File | Stage 0 | Stage 1 | Stage 2 | Stage 3 | Stage 4 |
|------|---------|---------|---------|---------|---------|
| tests/TestPVMultiCountryDeflation.js | ✓ (new) | - | - | - | - |
| Simulator.js | - | ✓ | ✓ | ✓ | ✓ |
| PresentValueCalculator.js | - | ✓ | ✓ | ✓ | ✓ |

---

## Ready to Start?

Should I proceed with **Stage 0** (creating the test file)?
