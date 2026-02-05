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

> **Note**: For details on how investment types interact with the relocation system (currency, residence scope), see [`docs/relocation-system.md`](../relocation-system.md).

### 8.1 `investmentTypes`

Defines generic investment categories (index funds, shares, etc.) and their tax treatment. Each item in this array represents a distinct asset class available to the user.

These definitions control how `Equities` instances (index funds, shares) are taxed when sold or deemed disposed of. The Irish rules, for example, treat:

- `indexFunds` under an exit-tax regime with deemed disposals,
- `shares` under standard CGT referencing `capitalGainsTax`.

### 8.2 Investment Type Fields

Each entry in the `investmentTypes` array supports the following fields:

- **`key`**: Stable identifier used in the core engine (e.g., `"indexFunds_ie"`, `"cedear_ar"`).
- **`label`**: Human-readable name displayed in the UI.
- **`baseRef`** (optional): Reference to a global base type key (e.g., `"globalEquity"`).
  - Triggers a shallow merge: `{...baseType, ...localType}`.
  - Resolved by `TaxRuleSet.getResolvedInvestmentTypes()`.
  - Enables wrappers to inherit economic defaults while overriding taxation.
- **`baseCurrency`**: ISO currency code for the asset (e.g., `"EUR"`, `"USD"`, `"ARS"`).
  - Inherited from `baseRef` if omitted.
  - Used for FX conversion in multi-currency scenarios.
- **`assetCountry`**: Two-letter country code for the asset's economic home (e.g., `"ie"`, `"us"`, `"ar"`).
  - Inherited from `baseRef` if omitted.
  - Determines which country's CPI is used for PV deflation (when scope is global).
- **`residenceScope`**: `"local"` or `"global"`.
  - **`"local"`**: Asset tied to residency; PV uses residency CPI; flagged by relocation detector.
  - **`"global"`**: Portable asset; PV uses `assetCountry` CPI; ignored by relocation detector.
  - See section 8.4 for detailed semantics.
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

#### Examples

**Example 1: IE Index Funds (Local wrapper of global asset)**
```json
{
  "key": "indexFunds_ie",
  "label": "Index Funds",
  "baseRef": "globalEquity",
  "baseCurrency": "EUR",
  "assetCountry": "ie",
  "residenceScope": "local",
  "taxation": {
    "exitTax": {
      "rate": 0.38,
      "deemedDisposalYears": 8,
      "allowLossOffset": false,
      "eligibleForAnnualExemption": false
    }
  }
}
```
- Inherits `baseKey: "globalEquity"` from global rules
- Overrides `baseCurrency` to EUR (IE domiciled)
- Overrides `assetCountry` to `ie` (local)
- Sets `residenceScope: "local"` (tied to IE residency)
- Defines IE-specific exit tax treatment

**Example 2: AR CEDEARs (Global wrapper)**
```json
{
  "key": "cedear_ar",
  "label": "CEDEARs",
  "baseRef": "globalEquity",
  "baseCurrency": "USD",
  "assetCountry": "us",
  "residenceScope": "global",
  "taxation": {
    "capitalGains": {
      "rateRef": "capitalGainsTax.rate",
      "allowLossOffset": true
    }
  }
}
```
- Inherits from `globalEquity` but keeps USD/US domicile
- Sets `residenceScope: "global"` (portable)
- Uses AR's CGT rate via `rateRef`

**Example 3: AR MERVAL (Pure local asset)**
```json
{
  "key": "merval_ar",
  "label": "MERVAL",
  "baseCurrency": "ARS",
  "assetCountry": "ar",
  "residenceScope": "local",
  "taxation": {
    "capitalGains": {
      "rateRef": "capitalGainsTax.rate",
      "allowLossOffset": true
    }
  }
}
```
- No `baseRef` (standalone)
- ARS currency, AR domicile
- Local scope (tied to AR residency)

### 8.3 Economic Data Flows

Document how growth/volatility parameters flow through the system:

**Percentage Format Convention**:
- **UI and Parameters**: Percentages are expressed as whole numbers (10 = 10%, not 0.1)
- **Internal Calculations**: Converted to decimals (10 -> 0.1) by dividing by 100
- **Global Asset Parameters**: `GlobalAssetGrowth_globalEquity: 7` means 7% growth
- **Local Wrapper Parameters**: `investmentGrowthRatesByKey[key]: 0.1` means 10% growth (legacy decimal format)
- **Pension Parameters**: `PensionGrowth_ie: 5` means 5% growth

**Parameter Resolution** (in `InvestmentTypeFactory.createAssets()`):
- **Global asset params**: Treated as percentages (whole numbers), divided by 100 via `normalizeRate()`
- **Local wrapper params**: Treated as decimals (legacy format), used as-is
- **Flexible normalization**: `normalizeRate()` function handles both:
  - `|value| > 1` → treated as percentage, divided by 100 (e.g., `10` → `0.1`)
  - `|value| ≤ 1` → treated as decimal, used as-is (e.g., `0.1` → `0.1`)
  - This allows seamless handling of both UI percentages and legacy decimal formats

**Global Asset Parameters** (visible in economy panel):
- **Format**: `GlobalAssetGrowth_{baseKey}`, `GlobalAssetVolatility_{baseKey}`
- **Example**: `GlobalAssetGrowth_globalEquity`, `GlobalAssetVolatility_globalBonds`
- **Source**: `src/core/config/tax-rules-global.json` defines base types
- **UI**: Rendered as visible rows in growth rates table (`src/frontend/web/WebUI.js`)
- **Usage**: Read by `InvestmentTypeFactory.resolveMixConfig()` for mix assets

**Local Asset Parameters** (per-country):
- **Format**: `LocalAssetGrowth_{cc}_{baseKey}`, `LocalAssetVolatility_{cc}_{baseKey}`
- **Example**: `LocalAssetGrowth_ie_indexFunds`, `LocalAssetVolatility_ar_merval`
- **UI**: Rendered in per-country tabs when relocation is enabled
- **Usage**: For local investments without `baseRef`

**Wrapper-Level Parameters** (legacy, hidden):
- **Format**: `{key}GrowthRate`, `{key}GrowthStdDev`
- **Example**: `indexFunds_ieGrowthRate`, `shares_ieGrowthStdDev` (for local investments only)
- **UI**: Created but hidden (`src/frontend/web/WebUI.js` lines 718-745) ONLY for local investments (no `baseRef`). Non-local wrappers (with `baseRef`) do NOT have these inputs created.
- **Usage**: Backward compatibility fallback in `InvestmentTypeFactory.createAssets()` for local investments.
- **Serialization**: Preserved in CSV (`src/core/Utils.js` lines 411-416) for legacy scenario compatibility (local investments only). Non-local wrappers skip wrapper-level params entirely.
- **Status**: Deprecated for non-local wrappers; local wrappers continue to use wrapper-level params as primary source.

### 8.9 UI Parameter Key Reference

**Global Asset Parameters** (visible in growth rates table):
- **Growth**: `GlobalAssetGrowth_globalEquity`, `GlobalAssetGrowth_globalBonds`
- **Volatility**: `GlobalAssetVolatility_globalEquity`, `GlobalAssetVolatility_globalBonds`
- **Location**: `src/frontend/web/WebUI.js` lines 845-846
- **Format**: Whole number percentages (e.g., `7` = 7%)

**Per-Country Pension Parameters** (when relocation enabled):
- **Growth**: `PensionGrowth_ie`, `PensionGrowth_ar`
- **Volatility**: `PensionVolatility_ie`, `PensionVolatility_ar`
- **Inflation**: `Inflation_ie`, `Inflation_ar`
- **Location**: `src/frontend/web/WebUI.js` lines 934-936
- **Format**: Whole number percentages (e.g., `5` = 5%), normalized to decimals (`0.05`) internally

**Per-Country Local Asset Parameters** (when relocation enabled):
- **Growth**: `LocalAssetGrowth_ie_shares`, `LocalAssetGrowth_ar_merval`
- **Volatility**: `LocalAssetVolatility_ie_shares`, `LocalAssetVolatility_ar_merval`
- **Location**: `src/frontend/web/WebUI.js` lines 1012-1013
- **Condition**: Only for local investments (no `baseRef`)
- **Format**: Whole number percentages

**Allocation Parameters**:
- **Generic**: `InvestmentAllocation_indexFunds_ie`, `InvestmentAllocation_cedear_ar`
- **Per-country (chip-driven)**: `InvestmentAllocation_ie_indexFunds`, `InvestmentAllocation_ar_cedear`
- **Location**: `src/frontend/web/WebUI.js` lines 568-569, `src/core/Utils.js` lines 599-600
- **Format**: Whole number percentages

**State Pension Parameters**:
- **Per-country**: `StatePension_ie`, `P2StatePension_ar`
- **Legacy**: `StatePensionWeekly`, `P2StatePensionWeekly` (mapped to StartCountry)
- **Location**: `src/core/Utils.js` lines 619-634
- **Format**: Currency amounts

**Pension Contribution Parameters**:
- **Per-country**: `P1PensionContrib_ie`, `P2PensionContrib_ar`, `PensionCapped_ie`
- **Legacy**: `PensionContributionPercentage`, `PensionContributionPercentageP2`, `PensionContributionCapped`
- **Location**: `src/core/Utils.js` lines 639-670
- **Format**: Percentages (contrib) or string (capped)

**Parameter Resolution Order** (in `InvestmentTypeFactory.createAssets()`):

Resolution differs based on whether the wrapper inherits from a global asset:

**Non-Local Wrappers** (with `baseRef`, e.g., `indexFunds_ie` with `baseRef: "globalEquity"`):
1. **Primary**: Asset-level params `GlobalAssetGrowth_{baseRef}`, `GlobalAssetVolatility_{baseRef}` (treated as percentages, divided by 100)
2. **Fallback 1**: Wrapper-level `growthRatesByKey[key]` / `stdDevsByKey[key]` (treated as decimals)
3. **Fallback 2**: Base key `growthRatesByKey[baseKey]` / `stdDevsByKey[baseKey]` (e.g., `indexFunds` for `indexFunds_ie`)
4. **Default**: 0 if all undefined

**Local Wrappers** (no `baseRef`, e.g., pure local `shares_ie`):
1. **Primary**: Wrapper-level `growthRatesByKey[key]` / `stdDevsByKey[key]` (treated as decimals)
2. **Fallback**: Base key `growthRatesByKey[baseKey]` / `stdDevsByKey[baseKey]` (backward compat)
3. **Default**: 0 if all undefined

**Flexible Normalization**: The `normalizeRate()` function handles both formats:
- Values with `|n| > 1` are treated as percentages and divided by 100 (e.g., `10` → `0.1`)
- Values with `|n| ≤ 1` are treated as decimals and used as-is (e.g., `0.1` → `0.1`)

### 8.8 Mix Configuration Parameter Resolution

**Purpose**: Resolve growth/volatility for mixed-asset strategies (fixed mix or glide path).

**Function**: `InvestmentTypeFactory.resolveMixConfig(params, countryCode, baseKey)`

**Parameter Hierarchy**:
1. **Per-country mix config**: `MixConfig_{cc}_{baseKey}_*` (e.g., `MixConfig_ie_indexFunds_type`)
2. **Global mix config**: `GlobalMixConfig_{baseKey}_*` (e.g., `GlobalMixConfig_indexFunds_type`)
3. **Fallback**: `null` if neither exists

**Mix Config Fields**:
- `type`: `"fixed"` or `"glidePath"`
- `asset1`, `asset2`: Base keys (e.g., `"globalEquity"`, `"globalBonds"`)
- `startAge`, `targetAge`: Age range for glide path
- `targetAgeOverridden`: Boolean flag
- `startAsset1Pct`, `startAsset2Pct`, `endAsset1Pct`, `endAsset2Pct`: Allocation percentages

**Economic Data Resolution** (lines 256-259 in `InvestmentTypeFactory.js`):
- `asset1Growth`: `normalizeRate(params['GlobalAssetGrowth_' + mix.asset1])`
- `asset2Growth`: `normalizeRate(params['GlobalAssetGrowth_' + mix.asset2])`
- `asset1Vol`: `normalizeRate(params['GlobalAssetVolatility_' + mix.asset1])`
- `asset2Vol`: `normalizeRate(params['GlobalAssetVolatility_' + mix.asset2])`

**Example**:
```javascript
// Per-country IE index funds with fixed 60/40 equity/bonds mix
MixConfig_ie_indexFunds_type: "fixed"
MixConfig_ie_indexFunds_asset1: "globalEquity"
MixConfig_ie_indexFunds_asset2: "globalBonds"
MixConfig_ie_indexFunds_startAsset1Pct: 60
MixConfig_ie_indexFunds_startAsset2Pct: 40
// Economic data from global asset params
GlobalAssetGrowth_globalEquity: 7
GlobalAssetGrowth_globalBonds: 3
```

### 8.4 `residenceScope` Semantics

> **Note**: For implementation details of PV deflation, see `src/core/PresentValueCalculator.js`.

Describes the behavioral differences between local and global scope:

| Aspect | `residenceScope: "local"` | `residenceScope: "global"` |
|--------|---------------------------|----------------------------|
| **PV Deflation** | Uses **residency CPI** (where you live) | Uses **assetCountry CPI** (asset's home) |
| **Relocation Impact** | Flagged if `assetCountry === originCountry` and capital > 0 | Not flagged (portable) |
| **UI Parameters** | Per-country rows: `LocalAssetGrowth_{cc}_{baseKey}` | Global rows: `GlobalAssetGrowth_{baseKey}` |
| **Serialization** | Saves wrapper-level growth/vol for locals | No per-country params saved |
| **Use Case** | Country-specific investments (e.g., IE domiciled funds, AR MERVAL) | Portable global assets (e.g., US ETFs, CEDEARs) |

**PV Deflation Logic**:
```mermaid
graph TD
    A[Investment Capital PV] --> B{residenceScope?}
    B -->|global| C[Use assetCountry CPI]
    B -->|local| D[Use residency CPI]
    C --> E[Back-convert to asset currency]
    C --> F[Apply asset deflator]
    D --> G[No conversion needed]
    D --> H[Apply residency deflator]
    E --> F
    G --> H
    F --> I[PV in residence currency]
    H --> I
```

**Relocation Impact Detection** (`src/frontend/web/components/RelocationImpactDetector.js`):
- Local holdings with `assetCountry === originCountry` trigger "local_holdings" impact
- User prompted to keep/sell/reinvest when relocating
- Global holdings ignored (assumed portable)

**`residenceScope` Decision Tree**:
```mermaid
graph TD
    A[Investment Type] --> B{Has baseRef?}
    B -->|Yes| C[Inherit from global base]
    B -->|No| D[Standalone definition]
    C --> E{residenceScope?}
    D --> E
    E -->|local| F[Local Investment]
    E -->|global| G[Global Investment]
    F --> H[PV: residency CPI]
    F --> I[Relocation: flagged if assetCountry matches origin]
    F --> J[UI: per-country params]
    G --> K[PV: assetCountry CPI]
    G --> L[Relocation: ignored]
    G --> M[UI: global params]
```

### 8.5 Runtime: GenericInvestmentAsset and InvestmentTypeFactory

> **Implementation**: See `src/core/InvestmentTypeFactory.js` for full details.

**`GenericInvestmentAsset`** (lines 11-199):
- Extends `Equity` base class
- Configured by `investmentTypeDef` from tax rules
- Resolves tax category (exit tax vs CGT) via `_resolveTaxCategory()` (lines 63-66)
- Resolves deemed disposal via `_resolveDeemedDisposalYears()` (lines 75-78)
- Resolves loss offset via `_resolveAllowLossOffset()` (lines 68-73)
- Resolves annual exemption eligibility via `_resolveAnnualExemptionEligibility()` (lines 80-88)
- Captures `baseCurrency`, `assetCountry`, `residenceScope` for multi-currency support (lines 19-21)
- Overrides `buy()` to capture currency/country from first call if undefined (lines 40-52)

**`InvestmentTypeFactory.createAssets()`** (lines 284-378):
- Loads `investmentTypes` from `TaxRuleSet.getResolvedInvestmentTypes()` (line 297)
- Resolves growth/volatility from params with dual-path logic (lines 313-360):
  - Non-local (baseRef): asset-level → wrapper-level fallback
  - Local (no baseRef): wrapper-level → base key fallback
- Applies `normalizeRate()` for flexible percentage/decimal handling (lines 290-294)
- Resolves mix configuration via `resolveMixConfig()` if enabled (line 311)
- Returns array of `{ key, label, asset, baseCurrency, assetCountry, residenceScope }` (lines 368-375)

**`InvestmentTypeFactory.resolveMixConfig()`** (lines 209-263):
- Resolves per-country or global mix config params (lines 226-238)
- Normalizes percentages and rates (lines 216-225)
- Fetches asset-level growth/vol for mix components (lines 256-259)
- Returns mix config object or null (line 262)

**Simulator Integration** (`src/core/Simulator.js`):
- Calls `InvestmentTypeFactory.createAssets()` for each scenario country.
- Deduplicates by key across countries.
- Initializes assets with `initialCapitalByKey` (filtered to StartCountry types).
- Maintains legacy `indexFunds`/`shares` objects for backward compat.

**Investment Type Resolution Flow**:
```mermaid
sequenceDiagram
    participant UI as WebUI
    participant Sim as Simulator
    participant Factory as InvestmentTypeFactory
    participant TRS as TaxRuleSet
    participant Config as Config

    UI->>Sim: run(params)
    Sim->>Config: getCachedTaxRuleSet(country)
    Config->>TRS: new TaxRuleSet(rules)
    Sim->>Factory: createAssets(ruleset, growthByKey, volByKey, params)
    Factory->>TRS: getResolvedInvestmentTypes()
    TRS->>Config: getInvestmentBaseTypeByKey(baseRef)
    Config-->>TRS: baseType
    TRS-->>Factory: resolved types (with inheritance)
    Factory->>Factory: resolve growth/vol (wrapper fallback)
    Factory->>Factory: new GenericInvestmentAsset(type, gr, sd, ruleset)
    Factory-->>Sim: assets array
    Sim->>Sim: initialize with initialCapitalByKey

**Parameter Resolution Details**:
- Line 459: `Factory->>TRS: getResolvedInvestmentTypes()` returns types with `baseRef` inheritance
- Line 463: `Factory->>Factory: resolve growth/vol (wrapper fallback)` implements dual-path logic:
  - Non-local (baseRef): asset-level → wrapper-level fallback
  - Local (no baseRef): wrapper-level → base key fallback
- Line 464: `Factory->>Factory: new GenericInvestmentAsset(type, gr, sd, ruleset)` receives resolved params
```

### 8.6 Audit Findings: Wrapper-Level Economic Data

**Current Implementation** (as of Phase 5 completion):

**Usage**:
1. **Local Investments** (no `baseRef`):
   - Wrapper-level params (`{key}GrowthRate`, `{key}GrowthStdDev`) are PRIMARY source
   - UI creates hidden inputs for serialization (`WebUI.js` lines 718-745)
   - CSV serialization preserves wrapper-level params (`Utils.js` lines 411-416)
   - Factory uses wrapper-level params with base key fallback (`InvestmentTypeFactory.js` lines 347-360)

2. **Non-Local Investments** (with `baseRef`):
   - Asset-level params (`GlobalAssetGrowth_{baseRef}`) are PRIMARY source
   - Wrapper-level params serve as FALLBACK only (backward compat)
   - UI does NOT create wrapper-level inputs (`WebUI.js` line 727: `if (t.baseRef) continue;`)
   - CSV serialization SKIPS wrapper-level params (`Utils.js` line 412: `if (!type.baseRef)`)
   - Factory prioritizes asset-level, falls back to wrapper-level (`InvestmentTypeFactory.js` lines 313-345)

**Backward Compatibility**:
- Legacy CSV files with wrapper-level params for non-local wrappers still load (fallback path)
- New CSV files omit wrapper-level params for non-local wrappers (cleaner)
- Local wrappers continue to use wrapper-level params (no change)

**Status**: Wrapper-level parameters are DEPRECATED for non-local wrappers; ACTIVE for local wrappers.

### 8.7 Global Base Types

**Purpose**: Define reusable asset templates for multi-country scenarios.

**Location**: `src/core/config/tax-rules-global.json`.

**Schema**:
```json
{
  "investmentBaseTypes": [
    {
      "baseKey": "globalEquity",
      "label": "Global Equity",
      "shortLabel": "Eq",
      "baseCurrency": "USD",
      "assetCountry": "us",
      "residenceScope": "global"
    }
  ]
}
```

**Fields**:
- **`baseKey`**: Unique identifier referenced by `baseRef` in country rules.
- **`label`**: Full name for UI display.
- **`shortLabel`**: Abbreviated label for compact UI (e.g., mix dropdowns).
- **`baseCurrency`**, **`assetCountry`**, **`residenceScope`**: Default values inherited by wrappers.

**Usage**:
- Accessed via `Config.getInvestmentBaseTypes()`.
- Merged into country-specific types by `TaxRuleSet.getResolvedInvestmentTypes()`.
- Used in mix configuration dropdowns (`src/frontend/web/WebUI.js`).

**Current Base Types**:
1. **`globalEquity`**: USD-denominated, US-domiciled, global scope.
2. **`globalBonds`**: USD-denominated, US-domiciled, global scope.

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
