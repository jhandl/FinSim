## Tax Rules JSON Reference

This document explains the structure and meaning of the `tax-rules-<country>.json` files under `src/core/config/`.  
Each file describes one country’s tax system, locale settings, and investment definitions. Fields are designed to be:

- **Country-specific** but structurally similar across countries,
- **Data only** (no logic) so that `TaxRuleSet` and the simulator can consume them uniformly,
- **Extensible** for future rules without breaking existing scenarios.

The examples below reference the current IE (`tax-rules-ie.json`) and AR (`tax-rules-ar.json`) files.

---

## 1. Top-Level Metadata

- **`country`**: Two-letter country code (upper case), e.g. `"IE"`, `"AR"`.
- **`countryName`**: Human-readable country name, e.g. `"Ireland"`, `"Argentina"`.
- **`version`**: Ruleset version string, e.g. `"26.4"`, `"1.0"`.
- **`updateMessage`**: Short description of what changed in this ruleset version.

---

## 2. Locale and Economic Data

### 2.1 `locale`

Controls how numbers and currencies are formatted for this country:

- **`numberLocale`**: BCP-47 locale string used for number formatting in the UI, e.g. `"en-IE"`, `"es-AR"`.
- **`currencyCode`**: ISO currency code for the country’s primary currency, e.g. `"EUR"`, `"ARS"`.
- **`currencySymbol`**: Display symbol for the primary currency, e.g. `"€"`, `"$"`.

### 2.2 `economicData`

Provides scalar economic parameters used by `EconomicData` as base anchors:

- **`inflation`**:
  - `cpi`: Long-run CPI level or rate (percentage, not decimal), e.g. `1.0499` for IE, `25.7` for AR.
  - `year`: Reference year for the CPI data.
- **`purchasingPowerParity`**:
  - `value`: PPP cross-rate vs EUR (units of local currency per 1 EUR in PPP terms).
  - `year`: Reference year for PPP data.
- **`exchangeRate`**:
  - `perEur`: Nominal FX rate (units of local currency per 1 EUR).
  - `asOf`: Date of the FX observation.

These values are used to construct per-country economic profiles consumed by `EconomicData` and, indirectly, `InflationService` and FX conversion helpers.

---

## 3. Income Tax

### 3.1 `incomeTax`

Defines the core income tax structure:

- **`name`**: Display name or abbreviation, e.g. `"IT"` or `"Impuesto a las Ganancias"`.
- **`tooltip`** (optional): Short explanation for UI tooltips.
- **`personalAllowance`**: Universal tax-free allowance (if any), in local currency.
- **`taxCredits`** (optional):
  - Structured object defining named credits, e.g.:
    - `employee.min.amount` and `employee.min.rate` (credit tied to PAYE income).
    - `age` bands like `"65": 245` (additional credits by age).
- **`ageExemptionAge` / `ageExemptionLimit`** (optional, IE):
  - Age and income threshold for age-based income tax exemption.
- **`jointFilingAllowed`** (optional, IE): Whether couples can file jointly.
- **`jointBandIncreaseMax`** (optional, IE): Max extra standard rate band for the secondary earner.
- **`bracketsByStatus`**:
  - Maps filing status → bracket map:
    - Keys: income thresholds as strings, e.g. `"0"`, `"44000"`.
    - Values: marginal tax rates as decimals, e.g. `0.2`, `0.4`.
  - Example statuses:
    - `"single"`,
    - `"singleWithDependents"`,
    - `"married"`.

The simulator and `Taxman` use these brackets to compute income tax on taxable income, respecting filing status and joint rules when available.

---

## 4. Social Contributions and Additional Taxes

### 4.1 `socialContributions`

Array of social contribution definitions (PRSI, ANSES, health insurance, etc.):

Each entry may include:

- **`name`**: Name of the contribution (e.g. `"PRSI"`, `"ANSES"`, `"Obra Social"`).
- **`tooltip`** (optional): UI description.
- **`rate`**: Contribution rate as a decimal (e.g. `0.042`, `0.11`).
- **`incomeCap`** (optional): Maximum income subject to this contribution (null for no cap).
- **`ageAdjustments`** (optional, IE PRSI):
  - Map from age threshold to adjusted rate, e.g. `{ "70": 0 }` to turn off PRSI after 70.
- **`applicableIncomeTypes`**:
  - Array of income buckets this contribution applies to, e.g. `["employment"]`, `["employment", "self"]`.

### 4.2 `additionalTaxes`

Array of additional tax definitions, such as USC in IE:

- **`name`**: Name, e.g. `"USC"`.
- **`tooltip`** (optional): UI description.
- **`brackets`**: Map threshold → rate (decimal), similar to income tax.
- **`incomeExemptionThreshold`** (optional): Income level below which this tax is not charged.
- **`reducedRateAge` / `reducedRateMaxIncome`** (optional): Age/income triggers for reduced USC schedules.
- **`ageBasedBrackets`** (optional): Alternate brackets by age (e.g. `"70": { ... }`).
- **`base`**: Base measure, currently `"income"` (used to decide what flows this tax applies to).

---

## 5. Capital and Investment Taxes

### 5.1 `capitalGainsTax`

Defines the generic CGT regime for the country:

- **`name`** / **`tooltip`** (optional, IE): Used in UI labels.
- **`rate`**: Capital gains tax rate as a decimal, e.g. `0.33`, `0.15`.
- **`annualExemption`**: Annual CGT exemption (local currency).
- **`allowLossOffset`**: Whether capital losses can offset gains.
- **`deemedDisposalYears`** (optional, IE): Generic deemed disposal interval (years) for exit-tax-like regimes.

This is the default CGT profile; specific investment types may override or reference it.

### 5.2 `dividendTax` (optional, IE)

Defines how dividends are taxed when separated from capital gains:

- **`rate`**: Tax rate on dividends as a decimal.
- **`annualExemption`**: Exemption amount (if any).
- **`withholding`**: Whether withholding tax is assumed to have already been applied.

### 5.3 `interestTax` (optional, IE)

Defines how interest income is taxed:

- **`rate`**: Tax rate on interest.
- **`withholding`**: Whether withholding tax is assumed.

### 5.4 `wealthTax` and `inheritanceTax` (optional)

Placeholders for future wealth/inheritance taxes:

- **`wealthTax`**:
  - `brackets`: Threshold → rate map (currently empty in IE).
  - `exemptions`: List of exemptions (currently empty).
- **`inheritanceTax`**:
  - `threshold`: Tax-free inheritance threshold.
  - `rate`: Inheritance tax rate as a decimal.

These fields are reserved for possible future features.

---

## 6. Pension Rules

### 6.1 `pensionRules`

Configures both state and private pension behaviour:

- **Retirement ages**:
  - `minRetirementAgePrivate`: Min age for private pension drawdown.
  - `minRetirementAgeOccupational`: Min age for occupational schemes.
  - `minRetirementAgeState`: Min age for state pension eligibility.
  - `statePensionAge`: The age at which state pension begins (duplicated for convenience).
- **Contribution limits**:
  - `contributionLimits.ageBandsPercent`:
    - Map from age to maximum contribution fraction (decimal), e.g. `{ "0": 0.15, "30": 0.2, ... }`.
  - `contributionLimits.annualCap`:
    - Maximum pensionable earnings for contribution calculations.
- **Lump sum rules**:
  - `lumpSumTaxBands`: Threshold → tax rate map for lump sums.
  - `lumpSumMaxPercent`: Max share of pension that can be taken as lump sum (decimal).
- **Drawdown rules**:
  - `minDrawdownRates`: Map age → minimum drawdown fraction for ARF/AMRF-like regimes.
- **State pension specifics**:
  - `statePensionIncreaseBands`:
    - Map from age to weekly increase amount (e.g. extra after age 80).
- **System type**:
  - `pensionSystem.type`:
    - `"state_only"`: Only state pension exists (no private pillar).
    - `"mixed"`: Both state and private pillars exist.
- **Defined benefit treatment** (optional, IE):
  - `definedBenefit.treatment`:
    - How DB income is treated for tax (e.g. `"privatePension"`, `"salary"`).

The simulator uses these rules to:

- Cap pension contributions from salaries,
- Determine drawdown and lump sums,
- Drive state pension age and escalators,
- Decide how DBI events are classified for tax.

---

## 7. Residency Rules

### 7.1 `residencyRules`

Configures cross-border tax behaviour:

- **`postEmigrationTaxYears`**:
  - Number of years after emigration during which the country may still tax certain income (e.g. 3 years for IE).
- **`taxesForeignIncome`**:
  - Boolean indicating whether, during those trailing years, foreign income is still within scope.

`Taxman` uses these rules alongside relocation events to determine which countries have active taxing rights in a given simulation year.

---

## 8. Investment Types

### 8.1 `investmentTypes`

Defines generic investment categories (index funds, shares, etc.) and their tax treatment. Each item typically includes:

- **`key`**: Stable identifier used in the core engine, e.g. `"indexFunds"`, `"shares"`.
- **`label`**: Human-readable name displayed in the UI.
- **`taxation`**: Object describing how this type is taxed:
  - **Exit tax-style regimes**:
    - `exitTax.rate`: Exit tax rate as a decimal.
    - `exitTax.deemedDisposalYears`: Deemed disposal interval (years).
    - `exitTax.allowLossOffset`: Whether losses can offset gains.
    - `exitTax.eligibleForAnnualExemption`: Whether CGT annual exemption applies.
  - **Capital gains regimes**:
    - `capitalGains.rate` or `capitalGains.rateRef`:
      - Fixed rate, or reference into `capitalGainsTax.rate`.
    - `capitalGains.annualExemption` or `annualExemptionRef` (optional):
      - Either a literal exemption or reference into `capitalGainsTax.annualExemption`.
    - `capitalGains.allowLossOffset`:
      - Whether losses can offset gains.

These definitions control how `Equities` instances (index funds, shares) are taxed when sold or deemed disposed of. The Irish rules, for example, treat:

- `indexFunds` under an exit-tax regime with deemed disposals,
- `shares` under standard CGT referencing `capitalGainsTax`.

Additional economic semantics for investment types (such as currency and domicile) are specified in `docs/asset-plan.md` and will be added to the JSON files as part of the multi-country investment work.

---

## 9. Pinned Income Types

### 9.1 `pinnedIncomeTypes`

Specifies which income series should always be visible and emphasised in the UI:

- Array of income metric keys, e.g.:
  - `["incomeSalaries", "incomeStatePension", "incomeCash"]`.

The frontend uses this list to:

- Ensure important income types are always present in the table/legend,
- Maintain a consistent visual ordering for key flows.

---

## 10. Extensibility

The tax rules schema is intentionally extensible:

- New fields can be added under existing sections without breaking older scenarios, provided defaults are sensible.
- Future features (e.g. wealth tax, more detailed social contributions, investment currency semantics) should:
  - Declare their fields in a dedicated doc section,
  - Keep behaviour data-driven via `TaxRuleSet`,
  - Avoid mixing logic into the JSON.

The current files (`tax-rules-ie.json`, `tax-rules-ar.json`) should be considered the authoritative examples for field usage until further countries are added.







