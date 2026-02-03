## Cross-Border Tax System (Incremental, UX-Aware)

## Goals

- Add cross-border tax behavior.
- Keep tax logic data-driven via country rules files.
- Support common treaty outcomes with a minimal model.
- Cover foreign investment income, rental income, and property gains.
- Keep the UI simple.

## Hard Assumptions

- P1 and P2 always share the same residency timeline.
- No citizenship-based taxation.
- One residence country per year.
- All tax computation uses residence currency.
- Treaties are modeled as typical credit-style treaties with a simple "exists" flag.

## Existing Primitives We Build On

- `residencyRules` in tax rules already capture trailing taxation.
- `assetCountry` and `residenceScope` exist on investment types.
- `Taxman` already computes income tax, social contributions, additional taxes, CGT, and exit tax.
- Withholding tax exists as a global source-tax model via `tax-rules-global.json`.

## Scope of Taxable Flows

These flows should be taxable in a cross-border context:

- Salary and pension income.
- Investment income and gains using `assetCountry` as source country.
- Rental income using property country as source country.
- Property sale gains using property country as source country.

## Minimal Treaty Model

We do not model treaty-specific rates. We only model whether a treaty exists and apply a standard foreign tax credit rule.

- If no treaty exists, no foreign tax credit is applied.
- If a treaty exists, apply a credit up to the residence-country tax for equivalent taxes.

## Tax Equivalency Model

We need a way to map foreign taxes to the appropriate local tax buckets for credits. Keep it small and standardized.

### Standard Treaty Buckets

- `income`
- `capitalGains`
- `rentalIncome`
- `propertyGains`

Each country ruleset maps its local taxes to these buckets. This avoids pairwise treaty matrices and lets us apply foreign tax credits consistently.

This mapping is used only for foreign tax credits and attribution. It does not change native tax computation.

## New Data Fields in Tax Rules

These fields live in `src/core/config/tax-rules-<country>.json`.

### Tax Basis

```json
"taxBasis": "worldwide"
```

Allowed values:

- `worldwide` (default, taxes worldwide income)
- `domestic` (taxes only domestic-source income)

### Tax Equivalency Mapping

```json
"treatyEquivalents": {
  "incomeTax": "income",
  "usc": "income",
  "prsi": "income",
  "capitalGains": "capitalGains",
  "rentalTax": "rentalIncome",
  "propertyGainsTax": "propertyGains"
}
```

## Minimal Changes to Global Rules

Keep the global `assetTaxes` table. It is the default source-country withholding model.

If needed later, allow per-country overrides for withholding caps, but do not add them now.

### Treaties (Global)

Define treaty existence once in the global rules file to avoid mismatches.

```json
"treaties": [
  ["ie", "us"],
  ["ie", "uk"]
]
```

The treaty list is symmetric by definition.

## Foreign Tax Credit Behavior

Credit behavior is fully derived:

- If a treaty exists, apply a credit.
- If no treaty exists, do not apply a credit.

Credits are applied by treaty bucket using `treatyEquivalents`. This keeps the model simple and keeps attribution transparent.

## Computation Flow (High Level)

1. Determine residence country for the year from the relocation timeline.
2. For each taxable flow, determine source country.
3. Apply source-country withholding where applicable.
4. Compute residence-country taxes as today.
5. If treaty exists between residence and source, apply foreign tax credits by treaty bucket.

## How to Determine Source Country

- Investment income or gains use `assetCountry`.
- Rental income uses property `linkedCountry`.
- Property gains use property `linkedCountry`.
- Salaries and private pensions use the event’s `linkedCountry` when provided; otherwise fall back to current residence country.
- Each country can have its own State pension (or none). State pensions are always sourced from the country they belong to.

## Foreign Property and Rental Income

We need to model these explicitly.

### Rental Income

- Source country is the property country.
- Residence country taxes it based on `taxBasis`.
- Treat as ordinary income by default unless specified otherwise in the ruleset mapping.

### Property Gains

- Source country is the property country.
- Residence country taxes it based on `taxBasis`.
- Property gains can map to `capitalGains` if the ruleset omits a dedicated mapping.

## UX Implications

The main UX pressure points are drawdown priorities and cross-border tax visibility.

### Drawdown Priorities

Keep a single global list. Add a small origin flag next to each wrapper label if relocation is enabled and there are relocation events in the scenario:

- Use `assetCountry` for the flag when present.

### Tax Visibility

Keep existing `Tax__*` columns and add cross-border tax entries as separate IDs, such as:

- `Tax__incomeTax:ie`
- `Tax__incomeTax:us` (source tax)

This keeps the output consistent and debuggable without adding new UI controls.

## UX Defaults

- If the user never touches per-country drawdown priorities, the global order applies everywhere.
- If no treaty exists, no credit is applied.
- If treaty exists, credit applies automatically using the standard rule.

## Implementation Touchpoints

Core:

- `src/core/Taxman.js` for credit logic and treaty bucket aggregation.
- `src/core/TaxRuleSet.js` for new ruleset fields.
- `src/core/Simulator.js` to include source-country tax on rental income, property gains, and foreign-source salaries/pensions.
- `src/core/RealEstate.js` to expose data needed for gains (purchase basis and country).

Frontend:

- `src/frontend/web/WebUI.js` and `src/frontend/web/components/EventsTableManager.js` for origin flags in drawdown priorities.
- `src/frontend/web/components/TableManager.js` for tooltip breakdowns that show foreign tax credits.

## Attribution Requirements

Attribution must remain the source of truth for tax visibility:

- Record source-country tax in the appropriate bucket with country context (for example `tax:incomeTax:us` or `tax:capitalGains:us`).
- Record residence taxes as normal (`tax:incomeTax`, `tax:capitalGains`, etc.).
- Record foreign tax credits as negative entries in the credited tax bucket, labeled clearly (for example `Foreign Tax Credit (US)`).
- Preserve cross-border taxes under separate IDs when applicable (for example `tax:incomeTax:ie`).

## Out of Scope for Now

- Citizenship-based taxation.
- Treaty rate tables or pairwise treaty rules.
- Per-person residency divergence.
- Detailed property tax systems beyond rental income and gains.

## Summary

This design keeps the model flexible and comprehensive without overloading the user. It stays close to existing architecture, introduces a minimal treaty concept, and makes cross-border taxes visible through attribution.
