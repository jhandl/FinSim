# Dual-Track Verification Checklist

Use this checklist to manually verify the dual-track Money implementation follows the contract.

## Equity Classes (IndexFunds, Shares, Pension)

- [ ] `portfolio` array exists and contains `{amount, interest, age}` objects
- [ ] `portfolioMoney` array exists and contains `{principal: Money, interest: Money, age}` objects
- [ ] `buy(amount, currency, country)` creates entries in BOTH arrays
- [ ] `addYear()` performs growth calculations on `portfolio[i].amount` and `portfolio[i].interest`
- [ ] `addYear()` updates `portfolioMoney[i].principal.amount` and `portfolioMoney[i].interest.amount` to match
- [ ] `capital()` sums `portfolio[i].amount + portfolio[i].interest` and returns a number
- [ ] `sell()` performs calculations on numeric fields and returns a number
- [ ] `sell()` converts using `_getBaseCurrency()` and `_getAssetCountry()`
- [ ] Parity checks compare numeric and Money values when enabled

## RealEstate/Property Classes

- [ ] `paid`, `borrowed`, `payment` are numeric fields
- [ ] `paidMoney`, `borrowedMoney`, `paymentMoney` are Money objects
- [ ] `buy()` sets both numeric and Money fields
- [ ] `mortgage()` sets both numeric and Money fields
- [ ] `getValue()` calculates using numeric fields and returns a number
- [ ] `getPayment()` returns `this.payment` (numeric)
- [ ] `getTotalValue()` sums numeric values
- [ ] `getTotalValueConverted()` converts numeric values
- [ ] Parity checks verify Money.amount matches numeric values

## Simulator

- [ ] All `buy()` calls pass currency and country parameters
- [ ] All `sell()`, `capital()`, `getValue()` results are stored in numeric variables
- [ ] No references to `portfolioMoney`, `paidMoney`, `borrowedMoney`, `paymentMoney`
- [ ] No Money object operations in event processing
- [ ] No Money objects in data aggregation
- [ ] No Money objects in dataSheet rows

## Tests

- [ ] `TestMultiCurrencySimulation.js` passes with parity checks enabled
- [ ] `TestRelocationCurrency.js` passes with parity checks enabled
- [ ] `TestMoneyEquityIntegration.js` passes with parity checks enabled
- [ ] `TestFXConversions.js` passes with parity checks enabled
- [ ] New `TestDualTrackVerification.js` passes
- [ ] No parity check errors thrown during test runs

## Performance

- [ ] Parity checks add <20% overhead when enabled
- [ ] Parity checks are disabled by default
- [ ] Hot paths (`addYear`, `capital`) use direct `.amount` access
- [ ] No Money object creation in loops

## Documentation

- [ ] `dual-track-contract.md` accurately describes implementation
- [ ] Verification report documents test results
- [ ] Checklist completed and all items checked

