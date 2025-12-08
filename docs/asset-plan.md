## Multi‑Country Investment Semantics for Investments

This document specifies how investments (index funds, shares, bonds, etc.) should behave in a multi‑country, multi‑currency world, in a way that is:

- **Independent of residence** when appropriate (global assets),
- **Configurable per country** via `investmentTypes` in the tax rules,
- **Consistent** with existing real estate and pension semantics,
- **Simple to understand** in the UI.

The design is expressed in terms of:

- Configuration changes (tax rules),
- Core engine behaviour (nominal + PV),
- UI behaviour (parameters, charts, relocation).

---

## 1. Configuration: `investmentTypes` Semantics

Each country’s tax rules file (`src/core/config/tax-rules-<country>.json`) defines an `investmentTypes` array. Each entry must describe not only taxation, but also how the asset behaves economically and across relocations.

For each `investmentType` the following fields are used:

- **`key`**: Stable identifier (e.g. `"indexFunds"`, `"shares"`, `"arLocalEquityFund"`).
- **`label`**: User-facing name (e.g. `"Index Funds"`, `"Local AR Equity Fund"`).
- **`baseCurrency`**: ISO currency code the asset is actually priced in:
  - Examples: `"EUR"`, `"USD"`, `"ARS"`.
  - This is the currency of the price series, not necessarily the residence currency.
- **`assetCountry`**: Country that defines the asset’s economic home:
  - Used as the natural country for CPI and FX profile (via `TaxRuleSet` → `EconomicData`).
  - Examples:
    - IE UCITS ETF in EUR → `assetCountry = "ie"`.
    - US ETF in USD → `assetCountry = "us"`.
    - AR local equity fund → `assetCountry = "ar"`.
- **`contributionCurrencyMode`**: How contributions are handled:
  - `"asset"`:
    - Contributions are converted from the current `residenceCurrency` to `baseCurrency` at buy time.
    - Capital is tracked in `baseCurrency` internally.
  - `"residence"`:
    - Contributions stay in the current residence currency.
    - Capital is truly local and follows the residence currency.
- **`residenceScope`**: How the asset relates to relocation:
  - `"global"`:
    - Asset is conceptually portable across countries (e.g. global ETF in EUR or USD).
    - It can be held before and after relocations without changing its nature.
  - `"local"`:
    - Asset is naturally tied to a specific country (e.g. AR‑only brokerage fund).
    - It may be kept or sold on relocation, but defaults and warnings treat it as local.

Tax treatment (`taxation`) remains in the rule file as today (exit tax vs CGT, deemed disposal, loss offset, etc.). Taxation depends on **residence and active ruleset**, not on `assetCountry`.

### 1.1 IE Defaults

The Irish rules (`tax-rules-ie.json`) define at least:

- An `"indexFunds"` type representing the current ETF/UCITS behaviour:
  - `baseCurrency = "EUR"`,
  - `assetCountry = "ie"`,
  - `contributionCurrencyMode = "asset"`,
  - `residenceScope = "global"`.
- A `"shares"` type representing direct share holdings:
  - `baseCurrency = "EUR"`,
  - `assetCountry = "ie"`,
  - `contributionCurrencyMode = "asset"`,
  - `residenceScope = "global"`.

These types are wired to existing `FundsAllocation` / `SharesAllocation` parameters so that single‑country IE behaviour is preserved.

### 1.2 AR Example

The Argentine rules (`tax-rules-ar.json`) can define, for example:

- `"arLocalEquityFund"`:
  - `baseCurrency = "ARS"`,
  - `assetCountry = "ar"`,
  - `contributionCurrencyMode = "residence"`,
  - `residenceScope = "local"`.
- `"globalUsdEtf"`:
  - `baseCurrency = "USD"`,
  - `assetCountry = "us"`,
  - `contributionCurrencyMode = "asset"`,
  - `residenceScope = "global"`.

This lets AR users choose between “pure AR local” investing and “global USD investing”.

---

## 2. Core Representation: Dynamic Investment Assets

The core engine represents investments via an array:

```js
investmentAssets = [
  { key, label, asset, baseCurrency, assetCountry, contributionCurrencyMode, residenceScope },
  ...
];
```

This array is built by `InvestmentTypeFactory.createAssets(...)` using the `investmentTypes` definitions from the active ruleset.

### 2.1 Replacing Legacy `indexFunds` / `shares`

- The global variables `indexFunds` and `shares` are replaced by references into `investmentAssets`:
  - IE tax rules define `investmentTypes` with keys `"indexFunds"` and `"shares"`.
  - The simulator locates these entries in `investmentAssets` and uses them where legacy code expects “funds” and “shares” columns.
- All capital and flow logic operates on `investmentAssets[i].asset` and aggregates by key:
  - `capsByKey[key]` is the canonical source of nominal capital per type.
  - `investmentIncomeByKey[key]` is the canonical source of nominal income/withdrawals per type.
- Legacy nominal columns (`indexFundsCapital`, `sharesCapital`, `incomeFundsRent`, `incomeSharesRent`) read from these maps for compatibility.

This removes duplicated capital tracking while preserving column names and user‑visible outputs.

---

## 3. Nominal Behaviour: Contributions and Capital

### 3.1 Contributions (Surplus Investing)

In `handleInvestments()`:

- At the end of each year, compute a surplus `surplus = cash - targetCash` when positive.
- Derive per‑type allocations from parameters:
  - For IE: map `FundsAllocation` → `"indexFunds"`, `SharesAllocation` → `"shares"`.
  - For other countries: allocation parameters per `investmentType` can be added later.
- For each `investmentAssets` entry:
  - Let `alloc` be the fraction for this type.
  - Compute `amountResidence = surplus * alloc`.

Apply `contributionCurrencyMode`:

- **Mode `"asset"`**:
  - Convert `amountResidence` from `residenceCurrency` to `baseCurrency` using `convertCurrencyAmount`.
  - Call `asset.buy(amountInAssetCurrency)`.
- **Mode `"residence"`**:
  - Call `asset.buy(amountResidence)` directly.

This defines, per type, whether nominal capital lives in the residence currency or the asset’s natural currency.

### 3.2 Nominal Capital Aggregation

Capital per type is obtained with:

- `capsByKey[key]` aggregating `asset.capital()` across all assets of that type.

Nominal ledger fields:

- `indexFundsCap`, `sharesCap` are read from `capsByKey['indexFunds']` / `capsByKey['shares']`.
- `investmentCapitalByKey[key]` stores the same numbers for dynamic UI columns.
- `worth` is computed as:
  - Real estate (already converted to residence currency),
  - Pensions (StartCountry currency, combined),
  - Sum of capitals from `capsByKey`,
  - Cash.

This keeps nominal behaviour explicit and per‑type, without changing core formulas for `worth`.

### 3.3 Initial Balances
The existing `initialFunds` and `initialShares` parameters are interpreted as amounts in the asset type's `baseCurrency`:
- For IE defaults (`baseCurrency = "EUR"`), initial amounts are in EUR.
- If a scenario defines alternative types, their initial balances would require new per-type initial balance parameters (future work).

---

## 4. Present‑Value Semantics

PV semantics are defined per investment type using `assetCountry` and `residenceScope`. No extra PV flags are needed.

### 4.1 PV Deflators Per Investment Type

For each simulation row (age):

- Let:
  - `ageNum` be the current age,
  - `startYear` be the simulation start year,
  - `currentCountry` be the active residency country,
  - `capsByKey[key]` be nominal capital for this type.

For each `key` in `capsByKey`:

1. Look up its `assetCountry` and `residenceScope` from `investmentAssets` / ruleset.
2. Compute a PV deflator:
   - If `residenceScope === "global"`:
     - Use `getDeflationFactorForCountry(assetCountry, ageNum, startYear, {...})`.
   - If `residenceScope === "local"`:
     - Use the same residency deflator as flows (the existing `deflationFactor` for `currentCountry`).
3. Set:

   ```js
   investmentCapitalByKeyPV[key] = capsByKey[key] * factorForThisType;
   ```

The IE legacy columns `indexFundsCapitalPV` and `sharesCapitalPV` are read from:

- `investmentCapitalByKeyPV['indexFunds']`,
- `investmentCapitalByKeyPV['shares']`.

### 4.2 Alignment with Real Estate and Pensions

Real estate:

- Nominal capital is calculated in property currency and converted to residence currency,
- PV is computed using the property’s country CPI (asset‑country PV),
- PV is then expressed in residence currency at a base‑year FX rate in PV mode.

Pensions:

- Contributions are converted to StartCountry currency,
- Nominal capital is tracked in that currency,
- PV uses StartCountry inflation and is expressed in the reporting currency at base‑year FX.

Investments follow the same pattern:

- **Global investments** (e.g. IE UCITS ETF) behave like pensions/real estate anchored to `assetCountry`.
- **Local investments** behave like residence‑currency assets; their PV uses the residency deflator.

### 4.3 Ordering: Deflate Then Convert

For all assets, PV is computed using the following ordering:

1. **Deflate in the PV anchor country and currency**:
   - Global investments: deflate nominal capital using `assetCountry` inflation, in the asset’s tracking currency.
   - Local investments: deflate nominal capital using residency inflation, in the residence currency.
2. **Convert PV via FX when needed for display**:
   - Charts and unified-currency views convert PV amounts to the chosen reporting currency using FX anchored at the simulation start year.

This matches the behaviour already used for real estate and pensions: deflation always happens first in the asset’s PV anchor country; FX conversion is applied afterwards for reporting.

---

## 5. Single‑Country Behaviour

In a single‑country scenario (no relocation events, one ruleset):

- For default IE types:
  - `assetCountry = StartCountry`,
  - `baseCurrency` equals the StartCountry currency,
  - `contributionCurrencyMode` reduces cross‑currency conversions to no‑ops.
- PV deflators for:
  - Flows,
  - Real estate,
  - Pensions,
  - Investments,
  all coincide with the same inflation source.

This reproduces current behaviour and keeps existing test baselines intact, without special “relocation on/off” branches in the core investment logic.

---

## 6. Growth Rates and Cost Basis

### 6.1 Growth Rates

Scenario parameters such as `growthRateFunds`, `growthRateShares`, and `growthRatePension` represent **expected nominal annual returns** in the asset’s tracking currency:

- For types with `contributionCurrencyMode = "asset"`, growth is applied in `baseCurrency`.
- For types with `contributionCurrencyMode = "residence"`, growth is applied in the residence currency.

Inflation and PV are handled separately by the PV layer. Growth rates are not adjusted for inflation in the core; real returns are implicit once PV deflation is applied.

The UI describes these fields as “expected nominal annual return (before inflation) in the asset’s currency”.

### 6.2 Cost Basis and Gains

Within each investment asset:

- Lots track principal (`amount`) and accumulated gains (`interest`) in the asset’s tracking currency.
- Cost basis and realised gains are therefore computed in the same currency the asset uses for its capital.

When a sale occurs:

- Sale proceeds and realised gains are converted once to the current residence currency using the evolution FX engine for that year.
- Converted gains are then passed to `Taxman` under the active residency country (plus any trailing rules from `residencyRules`).

Historic residence-currency cost basis per lot is not separately tracked; gains are instead computed in the asset’s own currency and converted at sale time for tax and ledger purposes.

---

## 7. UI Behaviour

The UI should expose investments in a way that is simple and country‑aware, without surfacing internal details like `assetCountry` or `contributionCurrencyMode`.

### 7.1 Investment Mix in Parameters

The parameters area gains an “Investment Mix” section:

- Lists available investment types for the active StartCountry:
  - Uses `label` from the ruleset.
  - Shows short descriptions derived from the config (e.g. “Global ETF in EUR (IE)”, “Local AR fund in ARS”).
- Lets the user specify allocation percentages:
  - Allocations sum to 100%.
  - For IE:
    - Existing `FundsAllocation` and `SharesAllocation` map to the `"indexFunds"` and `"shares"` types.
  - For additional types:
    - New parameters can be added when needed, but the concept remains “how you split your surplus across types”.

No extra PV options are exposed in the parameters UI; PV is controlled by the type definitions.

### 7.2 Help and Onboarding

The in‑app help and wizard content explains:

- The difference between **local** and **global** investments:
  - Local: tied to one country/currency; often used before relocation or for purely domestic portfolios.
  - Global: stay economically anchored to their own country/currency even if you move.
- How the investment mix interacts with relocation:
  - Moving country does not automatically change what you own.
  - You decide whether to keep local assets or sell and reinvest in global ones.

This explanation stays at a narrative level; no internal field names are mentioned.

### 7.3 Charts and Dynamic Columns

Charts and tables already consume:

- `Income__<key>` and `Capital__<key>` for dynamic per‑investment columns,
- Their PV counterparts (`Income__<key>PV`, `Capital__<key>PV`) when PV mode is enabled.

With the new semantics:

- `ChartManager` uses the `label` from each investment type for legend entries.
- In PV+unified mode:
  - Charts use `*PV` fields from the core,
  - FX conversion uses base‑year FX for all series,
  - No extra deflation is applied in the UI.

The result is that charts show:

- Flows in residency PV terms,
- Assets in a mix of:
  - Asset‑country PV (for global assets, real estate, pensions),
  - Residency PV (for purely local investments and cash),
  all converted coherently to the chosen reporting currency.

---

## 8. Taxation and Relocation Impacts for Investments

### 8.1 Taxation Country and Sale Proceeds

For any investment sale:

- Proceeds and gains are computed in the asset’s internal currency.
- Before they hit the ledger (`cash`, investment income buckets), both proceeds and gains are converted to the **current residence currency** using FX for that year.
- Tax is computed under the active residency country in that year, taking into account `residencyRules.postEmigrationTaxYears` and `taxesForeignIncome`.

For sales explicitly modelled “at relocation”:

- The sale is treated as occurring **just before** the relocation event changes `currentCountry`.
- Origin-country rules and trailing residency rules therefore apply to that sale.

For sales in later years, destination-country rules apply according to the same residency logic. Bilateral tax treaties are not modelled; there is always one effective taxing country per year for investments.

### 8.2 Relocation Impacts for Holdings

Relocation impact detection is extended to consider investment holdings, but all actions remain user‑driven.

When an `MV-*` relocation event is introduced:

- The detector identifies holdings in investment types with:
  - `residenceScope = "local"`, and
  - `assetCountry` equal to the country being left.
- It adds a relocation impact entry summarising:
  - Which local investment types are affected,
  - Their labels and currencies,
  - The upcoming move (e.g. “from AR to IE”).

Inline resolution panels in the events table/accordion present options such as:

- Keep existing local investments as they are,
- Model a sale at the relocation age and, optionally, reinvest proceeds into one or more global types.

No automatic liquidation or reallocation occurs; the user remains in control, with the engine providing structured guidance.

---

## 9. Backward Compatibility and Strictness

For the investment semantics defined in this document:

- Backward compatibility with older tax-rule schemas, legacy behaviours, or missing fields is not a requirement. Code may assume that the new fields and semantics are present and correctly configured.
- Any code that implements a default behaviour when required fields, functions, classes, or configuration entries are missing must not be added. Missing infrastructure or configuration is an error and should fail fast.
- Runtime checks of the presence or type of infrastructure symbols (functions, classes, methods, config fields), such as `typeof SomeClass === "function"`, `|| {}`, or defensive existence guards, are considered offences under this plan.
- Each such offence will be grounds for removal of the offending code, and your budget will be reduced by 50% per offence.
- User data validation remains allowed and required; this strictness applies to infrastructure and configuration, not to validating user-entered scenario data.

---

## 10. Testing Expectations

The following behaviours should be validated by tests:

- **Single‑country IE**:
  - Nominal and PV outputs match existing baselines (within tolerances).
  - Index funds and shares behave as before in all charts and tables.
- **AR → IE relocation** with both local and global investments:
  - AR local funds grow and deflate according to AR inflation and follow residence currency semantics as configured.
  - IE UCITS or USD global ETFs:
    - Grow in their own `baseCurrency`,
    - Have PV anchored to their `assetCountry` CPI,
    - Show stable PV paths across relocation when viewed in asset‑country PV terms.
- **Unified‑currency PV charts**:
  - All series remain finite and smooth (no artificial explosions).
  - Global asset PV paths reflect genuine investment returns and FX, not residency inflation artefacts.
- **Sale of global asset while residing in a different country than `assetCountry`**:
  - Nominal gains are computed in the asset’s tracking currency and converted to residence currency at the sale year’s FX.
  - Tax is applied using the active residency country’s rules (and trailing rules where configured).
  - PV deflation continues to use `assetCountry` CPI regardless of residence.
- **Multi‑type portfolio during drawdown phase (priority ordering)**:
  - Withdrawals respect per‑type drawdown priorities across all investment types, pensions, and cash.
  - Realised gains and income are attributed to the correct investment types and tax categories (CGT vs exit tax).
  - Withdrawal rates and capital trajectories remain smooth and consistent with the configured priorities.
- **Edge case: asset sale in the same year as relocation**:
  - Sales modelled “at relocation” are taxed under the origin country’s rules (before `currentCountry` flips).
  - Sales after relocation in the same calendar year are taxed under the destination country’s rules.
  - Charts and PV outputs remain continuous across the relocation boundary, with no double‑taxing or missing flows.

These tests, together with the configuration and core semantics described above, ensure investments behave consistently and transparently across countries and relocations, while remaining as simple as possible to explain to users.

