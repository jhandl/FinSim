# Dual-Track Verification FAQ

## Common Misconceptions

### ❌ INCORRECT: "Property.getValue() should return a Money object"
Reality: During the dual-track phase, `getValue()` MUST return a number. Money objects are for verification only, not for use in calculations or return values.

### ❌ INCORRECT: "Calculations should use Money.amount instead of numeric fields"
Reality: Calculations MUST use numeric fields directly. Money fields exist in parallel for parity checking, but are NOT used in calculations.

### ❌ INCORRECT: "Parity checks are missing"
Reality: Parity checks are present but disabled by default for performance. Enable with `Money.enableParityChecks(true)` or by setting `FINSIM_MONEY_PARITY_CHECKS=true`.

### ❌ INCORRECT: "Money fields are unused"
Reality: Money fields are intentionally unused in calculations. They are populated in parallel and verified via parity checks, but do NOT participate in computation.

### ❌ INCORRECT: "getTotalValueConverted() should use Money conversion"
Reality: During dual-track, conversion uses numeric values. Money path is computed in parallel for verification only.

## What Verification Should Check

### ✅ CORRECT: "Calculations use numeric fields"
Verify that `addYear()`, `capital()`, `getValue()` operate on `portfolio[i].amount`, `this.paid`, etc.

### ✅ CORRECT: "Money fields are populated"
Verify that `portfolioMoney`, `paidMoney`, etc. exist and have correct structure.

### ✅ CORRECT: "Parity checks pass"
Enable parity checks and verify no errors are thrown during operations.

### ✅ CORRECT: "Public methods return numbers"
Verify that `sell()`, `capital()`, `getValue()` return `number` type, not Money objects.

### ✅ CORRECT: "Simulator receives numbers"
Verify that Simulator never references Money objects and only works with numeric values.

## When to Make Code Changes

ONLY make changes if:
- Tests fail with parity checks enabled (indicates calculation mismatch)
- Numeric and Money values diverge (indicates synchronization bug)
- Performance degrades significantly (indicates inefficient implementation)

DO NOT make changes if:
- Verification feedback says "Money fields unused" (this is correct)
- Verification feedback says "should return Money" (this is incorrect)
- Verification feedback says "should use Money.amount" (this is incorrect)

