# FinSim Tax Configuration Specification (v2.0)

## Purpose

This document specifies a comprehensive and extensible JSON-based configuration format for representing personal tax systems across any country. The configuration is designed for use with the FinSim financial simulator engine and allows simulation of:

- Income tax structures (individual and joint)
- Social security and other contributions
- Supplementary taxes (e.g. USC, solidarity surcharges)
- Capital gains, dividends, and interest income taxation
- Wealth and inheritance taxes
- Pension rules and retirement taxation
- Filing status, age-based rules, dependent benefits
- Cross-country tax residency transitions

Each country has a standalone configuration file. Residency transitions are handled through an optional overlay system that defines when and how a user becomes subject to a new tax regime.

---

## 1. Global Configuration Structure

Each configuration file must conform to the following top-level structure:

```json
{
  "country": "CountryName",
  "latestVersion": "2.0",
  "simulationRuns": 2500,
  "incomeTax": { ... },
  "socialContributions": [ ... ],
  "additionalTaxes": [ ... ],
  "capitalGainsTax": { ... },
  "dividendTax": { ... },
  "interestTax": { ... },
  "wealthTax": { ... },
  "inheritanceTax": { ... },
  "pensionRules": { ... },
  "residencyRules": [ ... ]
}
```

Each section below defines the full structure and allowable fields for each object.

---

## 2. `incomeTax`

### Required Fields:

- `brackets`: `{ [threshold: string]: number }` – marginal tax rates.
- `personalAllowance`: `number` – base amount of income exempt from tax.

### Optional Fields:

- `allowancePhaseOutThreshold`: `number`
- `allowancePhaseOutRate`: `number`
- `taxCredits`: `{ [creditName: string]: number }`
- `jointFilingAllowed`: `boolean`
- `jointBracketMultiplier`: `number`
- `bracketsByStatus`: `{ single: {}, married: {} }`
- `dependentAllowancePerChild`: `number`
- `dependentTaxCredit`: `number`
- `ageBasedExemptions`: `{ [ageThreshold: string]: { incomeLimit?: number, adjustedRate?: number } }` — Optional exemptions or adjusted tax logic for taxpayers above a certain age.

---

## 3. `socialContributions`

List of social contributions applicable to individual income.

### Each Entry:

- `name`: `string`
- `rate`: `number`
- `incomeCap`: `number | null`
- `ageAdjustments`: `{ [ageThreshold: string]: number }` (optional) — Alternate rates above given ages.
- `incomeThresholdExemptions`: `{ [threshold: string]: number }` (optional) — Sets reduced rates for lower income levels.
- `applicableIncomeTypes`: `string[]` (optional, e.g., `["employment"]`)
- `additionalRateAbove`: `{ threshold: number, rate: number }` (optional)

---

## 4. `additionalTaxes`

Used for supplementary charges such as USC, solidarity levies, or municipal tax.

### Each Entry:

- `name`: `string`
- `brackets`: `{ [threshold: string]: number }`
- `ageBasedBrackets`: `{ [ageThreshold: string]: { [threshold: string]: number } }` (optional) — Replaces main brackets for taxpayers above a given age.
- `base`: `"income" | "incomeTax"` (optional)

---

## 5. `capitalGainsTax`

### Fields:

- `rate`: `number` or `brackets`: `{ [threshold: string]: number }`
- `annualExemption`: `number`
- `allowLossOffset`: `boolean`
- `deemedDisposalYears`: `number` (optional)

---

## 6. `dividendTax`

### Fields:

- `rate`: `number`
- `annualExemption`: `number`
- `withholding`: `boolean` (optional)

---

## 7. `interestTax`

### Fields:

- `rate`: `number`
- `withholding`: `boolean` (optional)

---

## 8. `wealthTax`

### Fields:

- `brackets`: `{ [threshold: string]: number }`
- `exemptions`: `string[]` (optional, e.g., `["primaryResidence", "retirementAccounts"]`)

---

## 9. `inheritanceTax`

### Fields:

- `threshold`: `number`
- `rate`: `number`

---

## 10. `pensionRules`

### Fields:

- `minRetirementAgePrivate`: `number`
- `minRetirementAgeState`: `number`
- `contributionLimits`:
  - `ageBandsPercent`: `{ [ageThreshold: string]: number }` — Maximum tax-deductible contribution as % of income, based on taxpayer age.
  - `annualCap`: `number`
- `lumpSumTaxBands`: `{ [threshold: string]: number }`
- `minDrawdownRates`: `{ [ageThreshold: string]: number }` — Minimum withdrawal rates that apply at or above specified ages.
- `statePensionAge`: `number`
- `statePensionIncreaseBands`: `{ [threshold: string]: number }`

---

## 11. `residencyRules`

Used to handle simulation scenarios where an individual changes tax residency to another country.

### Each Entry:

```json
{
  "partialYearTaxation": "proportional" | "split" | "full",
  "carryForwardLosses": true,
  "applyExitTax": false,
  "extendedTaxationDuration": 0,
  "extendedTaxationRules": {
    "appliesIfDestinationNotInTreaty": true,
    "additionalYears": 5,
    "taxOn": ["capitalGains", "passiveIncome"]
  },
  "treatyCountries": ["CountryC", "CountryD"]
}
```

### Field Descriptions:

- `partialYearTaxation`: Strategy for handling the transition year:
  - `proportional`: Pro-rate income between jurisdictions.
  - `split`: Apply each country's full tax regime to part of the year.
  - `full`: Apply only the destination country's tax regime to the full year.
- `carryForwardLosses`: Whether capital losses from the origin country carry into the destination country.
- `applyExitTax`: Whether the origin country applies exit tax on unrealized gains.
- `extendedTaxationDuration`: Number of years after leaving the country that the origin country may continue to tax certain income.
- `extendedTaxationRules`:
  - `appliesIfDestinationNotInTreaty`: If true, extended taxation only applies if the destination country has no treaty.
  - `additionalYears`: Alternative to `extendedTaxationDuration`, to specify targeted extensions.
  - `taxOn`: List of income types subject to extended taxation (e.g., `["capitalGains", "dividends"]`).
- `treatyCountries`: List of countries that have an active double taxation treaty with the origin country, used to disable or modify extended taxation behavior.

---

## 12. Versioning and Updates

Include the following meta fields for update handling:

- `latestVersion`: string (e.g., "2.0")
- `codeUpdateMessage`: string (optional)
- `dataUpdateMessage`: string (optional)

---

## 13. Example File Names and Loading Strategy

- Each country’s config should be stored in its own file: `tax-config-<countryCode>-<version>.json`
- The simulator must support switching config files at runtime to simulate moving between countries.
- The UI should guide users through entering multiple residency periods if needed.
- The new config format does not need to be backward-compatible with the existing Ireland-specific implementation. 
- The new code must load the new config files and use the same configuration versioning system that is currently in use. That is, the latestVersion attribute and local storage must be used to determine if an update is available.

---

## 14. Extensibility

To support future tax changes or country-specific features:

- Use object keys as flexible namespaces (e.g., `bracketsByStatus`, `ageBasedExemptions`, `conditions`)
- Optional fields must be ignored if not present
- Use `null` or omit fields where no data applies

---

## Conclusion

This specification enables FinSim to represent and simulate any personal taxation system in a structured and modular way. By combining readable configuration with flexible structures, it supports a wide range of real-world tax systems, as well as transitions between them over time. The system can be extended as new scenarios and jurisdictions are added.

