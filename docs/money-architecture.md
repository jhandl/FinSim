# Money Architecture

## State Pension Currency Tracking

### Money Object Implementation

State pension income uses Money objects for currency safety:
- **Numeric Path**: `yearlyIncomeStatePension` (number, converted to residence currency)
- **Money Path**: `yearlyIncomeStatePensionMoney` (Money object with explicit currency/country)

### Calculation Flow

1. Compute base pension amount (52 weeks × weekly rate, inflated)
2. Create `Money` object with `statePensionCurrency` and `statePensionCountry`
3. Convert to residence currency if needed (both numeric and Money paths)
4. Return numeric values to Simulator (Money objects remain internal)

## Verification Checklist

- [ ] All existing tests pass without modification (`./run-tests.sh`)
- [ ] `TestMoneyPersonIntegration.js` test passes
- [ ] Performance overhead <1% for state pension calculation
- [ ] Multi-currency relocation scenarios work correctly
- [ ] No changes to Simulator or other consuming code needed

## Performance Validation

Baseline results are tracked in `docs/money-performance-baseline.md`.

## Architecture Diagram

```mermaid
sequenceDiagram
    participant S as Simulator
    participant P as Person
    participant M as Money
    participant E as EconomicData

    S->>P: calculateYearlyPensionIncome(config, country, currency, year)
    
    Note over P: Calculate base pension (numeric)
    P->>P: yearlyIncomeStatePension = 52 × weekly × inflation
    
    Note over P: Create Money object
    P->>M: Money.create(amount, currency, country)
    M-->>P: yearlyIncomeStatePensionBaseCurrencyMoney
    
    alt Currency conversion needed
        P->>E: convert(amount, fromCountry, toCountry, year)
        E-->>P: convertedAmount
        P->>M: Money.create(convertedAmount, targetCurrency, targetCountry)
        M-->>P: yearlyIncomeStatePensionMoney
    else Same currency
        P->>P: yearlyIncomeStatePensionMoney = baseMoney
    end
    
    P-->>S: { lumpSumAmount: number }
    
    Note over S: Consumes numeric values
    S->>P: person.yearlyIncomeStatePension (number)
    S->>P: person.yearlyIncomeStatePensionBaseCurrency (number)
```

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Performance degradation | Benchmark shows <1% overhead; Money creation only when pension > 0 |
| Breaking existing tests | No API changes; all methods return numbers; tests pass without modification |
| Currency resolution failures | Fallback to null Money objects; legacy numeric path continues working |
| Conversion errors | Currency validation at boundaries; errors logged and handled gracefully |
