# Dual-Track Money Pattern Contract

## Asset Class Responsibilities
- Store both numeric and Money fields in parallel
- Perform all calculations using numeric fields only
- After each operation, assert `Math.abs(numeric - money.amount) < 1e-6`
- Return numeric values from all public methods (`buy`/`sell`/`capital`/`getValue`)

## Simulator Responsibilities
- Pass currency/country metadata to `buy()` calls
- Receive numeric values from `sell()`/`capital()`/`getValue()` calls
- Never reference Money objects directly
- Aggregate using numeric values only

## Verification Points
- `Equity.capital()`: returns sum of `portfolio[i].amount + interest`
- `RealEstate.getValue()`: returns numeric value after inflation
- `Person.pension.capital()`: returns numeric sum
- All `sell()` methods: return numeric amount in residence currency
