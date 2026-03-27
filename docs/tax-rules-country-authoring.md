# FinSim Tax Rules Country Authoring Guide

This document is a step-by-step, high-detail workflow for researching a country's personal tax system and encoding it as a FinSim tax rules file: `src/core/config/tax-rules-<cc>.json`.

It is written to be usable by both humans and AI agents. It is intentionally explicit about:
- What to research (and where to find it).
- How each researched concept maps (or does not map) to the current FinSim schema and engine behavior.
- What extra deliverables to produce so changes remain auditable and maintainable over time.

This guide targets the current FinSim implementation (core + UI), not an idealized future engine.

---

## 0. How FinSim Uses Tax Rules (Mental Model)

Before you author a new rules file, internalize these constraints. They drive what is possible.

### 0.1 What FinSim currently taxes (engine reality)

Tax rules are a contract between:
- the schema reference (`docs/tax-rules-reference.md`),
- the country JSON files (`src/core/config/tax-rules-<cc>.json`),
- and the core engine (`TaxRuleSet`, `Taxman`, and call sites).

Every field documented in the schema reference must be consumed by the engine. If you discover a documented field is ignored (or only partially applied), treat that as a bug: fix the engine + tests, or remove the field from the schema reference and from all rulesets.

Implemented today:
- **Income tax**: `Taxman.computeIT()` uses `incomeTax.bracketsByStatus`, a small set of tax credit semantics, and pension contribution relief.
- **Additional taxes** (progressive): `Taxman.computeAdditionalTaxesGeneric()` uses `additionalTaxes[]`.
- **Social contributions** (flat-rate): `Taxman.computeSocialContributionsGeneric()` uses `socialContributions[]`.
- **Capital gains / exit tax**: `Taxman.computeCGT()` + `InvestmentAsset` taxation and deemed disposal rules.
- **Property gains tax** (optional): `Taxman.declarePropertyGain()` uses `propertyGainsTax`.
- **Reverse mortgage payout treatment** (optional): `TaxRuleSet.getReverseMortgagePayoutTaxTreatment()` uses `realEstate.reverseMortgage.payoutTaxTreatment`.
- **Cross-border** (limited): source-country salary/pension tax approximation, trailing post-emigration taxation, and treaty-based foreign tax credits (simple min(source, residence)).

Important taxable-base limitations (engine reality):
- **State pension** income is currently not included in the income-tax base.
- **Dividend/interest investment income** is currently not taxed by income tax (only cross-border withholding may apply via global `assetTaxes`).

If a real-world tax feature falls into "not implemented" or "not representable", you must document it in a country-specific gap report (Section 8).

### 0.2 Multi-country invariants that affect authoring

FinSim can load multiple rulesets in a single simulation run when relocation is enabled. This creates hard requirements:

1. **Country code**:
   - File name uses lowercase: `tax-rules-de.json`.
   - `country` field is uppercase: `"DE"`.

2. **Investment type keys must be globally unique**:
   - The simulator builds a single `investmentAssets[]` list by loading investment types from every country referenced in the scenario and deduplicating by `investmentTypes[].key`.
   - If two countries define the same key, one definition silently wins and the other is ignored.
   - Therefore: ALWAYS namespace type keys (recommended: suffix with `_<cc>`).

3. **Tax thresholds are inflation-adjusted in the simulation**:
   - The core `adjust()` helper inflates thresholds each year using country inflation (via `InflationService` / `EconomicData`).
   - So the numeric thresholds you encode should be for a specific base year (typically the simulation start year).
   - If a country indexes brackets to something other than inflation (or not at all), that mismatch must be recorded in the gap report.

---

## 1. Required Deliverables For Each Country

When adding a new country, produce these artifacts as a bundle:

1. `src/core/config/tax-rules-<cc>.json`
2. `docs/tax-rules-sources-<cc>.md`
   - A "research dossier" listing sources (URLs, titles, publisher), the tax year(s), and which JSON fields each source supports.
   - Include a retrieval date for each source.
3. `docs/tax-rules-gap-report-<cc>.md`
   - A structured report of what you could not encode accurately in the current schema/engine (Section 8 template).
4. A focused test under `tests/` (recommended)
   - At minimum: validate `TaxRuleSet` parsing + one or two "golden" tax computations for that country.

Optional but often required:
- Update `src/core/config/tax-rules-global.json`:
  - Add treaty pairs if you want foreign tax credits to apply (`treaties` list).
  - Add/adjust asset withholding rates if the country is an asset domicile relevant to your investment types (`assetTaxes`).
- Update the active `src/core/config/finsim-*.json`:
  - Add the country to `availableCountries` so the UI can select it (especially when relocation is enabled).

---

## 2. Research Workflow (What To Collect, In What Order)

### 2.1 Pick the target "rules year"

Decide and record (in `docs/tax-rules-sources-<cc>.md`):
- Tax year your rules represent (e.g., "Tax year 2026").
- Whether the system is calendar-year or fiscal-year and what you are approximating to (annualized amounts).
- Whether rates/thresholds are for residents, non-residents, or both (FinSim is primarily resident-focused).

Rule of thumb:
- Use the FinSim simulation start year (see `Config.getSimulationStartYear()`) as the base year for thresholds.

### 2.2 Identify the minimum "FinSim scope" for that country

FinSim needs a simplified personal-tax model that matches its income and asset flows. The minimum coverage you should research:

Income tax:
- Employment (salary) taxation (marginal schedule).
- Basic credits/allowances you can encode.

Social contributions / payroll taxes:
- Employee-side contributions at minimum.
- Caps/thresholds if present (even if not representable today, you must capture them in the gap report).

Additional progressive taxes:
- Any extra progressive surtaxes applied on income (USC-style, solidarity surcharges, etc.).

Capital:
- Capital gains taxation (rates, exemptions, loss offset, holding-period distinctions).
- Any deemed disposal / mark-to-market / exit-tax regimes for funds/ETFs (critical for EU countries).

Pensions:
- State pension eligibility age and payment period assumptions (weekly/monthly/annual).
- Private/occupational pension contribution limits and drawdown/lump-sum rules (as much as schema supports).

Property:
- Whether property gains are taxed and whether there is a main-home exemption.

Residency / cross-border:
- Worldwide vs territorial tax basis.
- Any post-emigration trailing taxation rules.
- Existence of treaties with other countries you plan to support (for foreign tax credits).

Economic anchors:
- Long-run inflation number (percent).
- PPP conversion factor (for analytics/PPP FX modes).
- Nominal FX (LCU per EUR) at a specific date.
- Typical rental yield (percent) if you want relocation assistants to make decent default suggestions.

### 2.3 Preferred source hierarchy (for agents)

For each parameter, prefer sources in this order:

1. The country's tax authority (official guides, rate tables, legislation summaries).
2. Primary legislation / official gazette publications (if readable and clearly mapped to parameters).
3. Government portals (finance ministry, social security agency).
4. Reputable tax guides (Big4, major banks, widely used expatriate guides) ONLY to clarify, not as the sole source.

For every numeric value:
- Record the unit (annual / monthly / weekly) and convert to annual if needed.
- Record whether thresholds are nominal for that year or automatically indexed.
- Record whether the amount is per-person or per-household.

### 2.4 Build a "parameter map" before writing JSON

Create a table in `docs/tax-rules-sources-<cc>.md`:

| FinSim Field | Real-World Concept | Value | Unit | Tax year | Who applies (resident/non-resident) | Source | Notes |
|---|---|---:|---|---:|---|---|---|

Do not start writing JSON until you can fill most rows for the required fields.

---

## 3. JSON Authoring Workflow (Field-by-Field)

This section is about how to encode the research into `tax-rules-<cc>.json` that the current engine will interpret correctly.

### 3.1 Recommended key order (diff stability)

Keep key order consistent across countries:

1. Metadata: `country`, `countryName`, `version`, `taxBasis`, `treatyEquivalents`, `updateMessage`
2. `locale`
3. `economicData`
4. `incomeTax`
5. `socialContributions`
6. `additionalTaxes`
7. `capitalGainsTax`
8. `propertyGainsTax` (optional)
9. `realEstate` (optional)
10. Future placeholders: `dividendTax`, `interestTax`, `wealthTax`, `inheritanceTax` (optional; not currently used)
11. `pensionRules`
12. `residencyRules`
13. `investmentTypes`
14. `pinnedIncomeTypes` (optional but recommended)

### 3.2 Metadata

Fields:
- `country` (string, uppercase): `"DE"`
- `countryName` (string): `"Germany"`
- `version` (string): recommend `YYYY.MM` (e.g., `"2026.01"`)
- `updateMessage` (string): short, user-visible description for "tax rules updated" toast

Cross-border:
- `taxBasis`: `"worldwide"` or `"domestic"`
  - Used by `Taxman` to decide whether to exclude foreign-sourced income/gains from taxation.
  - This is a blunt approximation of worldwide vs territorial systems.
- `treatyEquivalents`: map of tax IDs to treaty buckets
  - Used to aggregate foreign taxes into credit buckets for treaty-based foreign tax credits.
  - Typical mapping:
    - `"incomeTax": "income"`
    - `"capitalGains": "capitalGains"`
    - `"dividends": "dividends"`
  - Note: today the engine mostly uses income and capital gains buckets.

### 3.3 `locale`

Fields:
- `numberLocale`: BCP-47 locale for UI formatting (e.g., `en-US`, `de-DE`)
- `currencyCode`: ISO code, uppercase (e.g., `EUR`, `USD`)
- `currencySymbol`: display symbol (e.g., `\\u20AC`, `$`)

### 3.4 `economicData`

Fields used today:
- `typicalRentalYield` (number): percent, not decimal (e.g., `6.5` means 6.5%)
  - Used by relocation assistant heuristics for rental defaults.
- `inflation` (number): percent, not decimal (e.g., `2.25` means 2.25%).
  - This is used as a country inflation profile input and indirectly affects `adjust()` behavior.
- `purchasingPowerParity.value` (number): PPP conversion factor (LCU per international dollar).
  - Current rules use values consistent with World Bank style PPP conversion factors where US is ~1.0.
- `purchasingPowerParity.year` (number)
- `exchangeRate.perEur` (number): nominal FX (LCU per 1 EUR) at the stated date.
- `asOf` (string): ISO-like date string (e.g., `2026-02-16`) for the FX observation date.

If you cannot produce good economic anchors, write something plausible but mark it as low-confidence in the sources doc and the gap report. Economic anchors matter for relocation FX/PPP modes and PV.

### 3.5 `incomeTax`

Primary fields:
- `name` (string): label for UI
- `tooltip` (string, optional): short UI explanation
- `bracketsByStatus` (object): filing status -> bracket map
  - The bracket map is `{ "lowerLimit": rateDecimal }`.
  - Lower limits MUST be strings (JSON object keys), even though they are numeric.
  - Rates are decimals (0.2 not 20).
  - Always include `"0": <rate>` (or `"0": 0` if you embed an allowance as a 0% bracket).

Statuses supported by current engine:
- `single`
- `singleWithDependents` (only used when the scenario indicates dependent children)
- `married` (used when `params.marriageYear` has passed)

Married band shifting:
- `jointBandIncreaseMax` (number)
  - Used by the engine to shift lower limits for married households based on the smaller earner up to this max.
  - This currently approximates Ireland's "standard-rate band increase".
  - If your country does not have a similar mechanism, set to 0.

Dependent-child status:
- `dependentChildMaxAge` (number)
  - Maximum child age still treated as dependent for `singleWithDependents` bracket selection.
  - The help system uses the same field for child-dependency copy, so keep it aligned with the engine rule.

Tax credits:
- `taxCredits` is a free-form object, but only some IDs have special semantics today:
  - `employee`: special handling supports a base amount and optional min/max specifications.
  - `age`: supports threshold maps, applied per eligible person (P1/P2).
  - `personal`: can be made UI-configurable via `uiInput` (used in IE).
  - Any other credit IDs are applied as a constant numeric amount (no phase-outs).

Taxable base composition (current engine):
- Included in income tax base: salary, rental income, and other "income" flows declared via `Taxman.declareSalaryIncome()`, `Taxman.declareRentalIncome()`, and `Taxman.declareOtherIncome()`, plus private pension income and `investmentTypeIncome` (e.g., RSUs treated as income).
- Excluded from income tax base: state pension income and `Taxman.declareInvestmentIncome()` (dividend/interest-style investment income).

Important limitations to note in gap report (if applicable):
- Standard deductions / personal allowances are not implemented as a separate subtraction from income; you must approximate via brackets (e.g., 0% bracket up to the allowance).
- Itemized deductions are not representable.
- Credits that phase out with income are not representable.
- Per-person taxation vs household taxation is not faithfully represented in couple mode (the engine builds a household taxable base).
- State pension and dividend/interest investment income are not currently in the income-tax base.

### 3.6 `socialContributions`

Schema allows:
- `name`, `tooltip`
- `rate` (decimal)
- `incomeCap` (number or null)
- `ageAdjustments` (map of age threshold -> rate)
- `applicableIncomeTypes` (array)

Current engine behavior to design around:
- Residence-country social contributions are applied as a flat percentage to:
  - salaries for each person, and
  - all other "non-PAYE income" the engine can see (income attribution + investment-type income),
  - with no `incomeCap` handling and no `applicableIncomeTypes` filtering.

So:
- Only use `socialContributions` for taxes that are reasonably approximated as "flat % of broad income".
- If a contribution only applies to wages, has caps, or has complex brackets, you must call that out in the gap report and consider representing it as an `additionalTaxes` schedule (if the base mismatch is acceptable).

### 3.7 `additionalTaxes`

Use `additionalTaxes` for USC-style progressive surtaxes and for any contribution/tax that needs:
- progressive bands,
- cliff exemption thresholds, or
- deductible exemption amounts.

Supported fields (current engine):
- `name`, `tooltip`
- `brackets`: `{ "lowerLimit": rateDecimal }`
- `incomeExemptionThreshold` (number): cliff; if income <= threshold then zero tax.
- `deductibleExemptionAmount` (number): deduction from base before applying brackets.
- `exemptAmount` (legacy synonym; treated like deductible exemption).
- Band selection helpers:
  - `selectionRules`: array of objects containing `{minAge,maxAge,minIncome,maxIncome,brackets}`
  - `reducedRateAge`, `reducedRateMaxIncome`, `reducedTaxBands`
  - `ageBasedBrackets`
  - `incomeBasedBrackets`
- `base`: currently only meaningfully supports `"income"` vs "not income":
  - The engine always includes salaries + private pension in the base.
  - If `base === "income"`, it additionally includes `investmentTypeIncome` (RSUs etc.).
  - Rental income, state pension, and other income buckets are NOT currently included here.

Because the base is incomplete, treat `additionalTaxes` as an approximation and document mismatches per country.

### 3.8 `capitalGainsTax`

Fields used by `Taxman.computeCGT()` and investment types:
- `rate` (decimal): default CGT rate
- `annualExemption` (number)

Important:
- Investment types can override behavior via their own `taxation` object.
- Exit-tax regimes (funds/ETFs) should be encoded in `investmentTypes[].taxation.exitTax`, not only in `capitalGainsTax`.

Domestic vs worldwide interaction:
- If `taxBasis` is `"domestic"`, `Taxman.computeCGT()` will skip gains entries whose `assetCountry` differs from the residence country.
  - This is a rough territorial model. Document if inaccurate.

### 3.9 `propertyGainsTax` (optional)

This is the only supported way to apply tax to property sale gains today.

Fields:
- `taxRef`: `"capitalGains"` or `"incomeTax"`
- `primaryResidenceExemption.enabled` (boolean)
- `primaryResidenceExemption.proportional` (boolean)
- `holdingPeriodExemptionYears` (number or null): cliff full exemption
- `residentsOnly` (boolean)
- `capitalGainsOptions` (only used when `taxRef === "capitalGains"`):
  - `rateRef` (string; currently only `"capitalGainsTax.rate"` is recognized)
  - `eligibleForAnnualExemption` (boolean)
  - `allowLossOffset` (boolean)

If the country has reinvestment relief, partial exemptions, indexing, or complex calculations, document them in the gap report.

### 3.10 `realEstate` (optional)

Currently used field:
- `realEstate.reverseMortgage.payoutTaxTreatment`: `"taxFree"` or `"otherIncome"`

### 3.11 `pensionRules`

Minimum fields to set for a usable experience:
- `pensionSystem.type`: `"state_only"` or `"mixed"`
- `statePensionAge` and/or `minRetirementAgeState`
- `statePensionPeriod`: `"weekly"`, `"monthly"`, or `"annual"` (defaults to weekly if missing)
- `minRetirementAgePrivate`, `minRetirementAgeOccupational` (if private pensions exist)
- `contributionLimits.ageBandsPercent`: map of age threshold -> max contribution fraction
- `contributionLimits.annualCap`: pensionable earnings cap (if meaningful)
- `lumpSumMaxPercent` and `lumpSumTaxBands` (if the system allows lump sums and you want to model their taxation)
- `minDrawdownRates` (if there is a minimum withdrawal regime)
- `definedBenefit.treatment`: REQUIRED by current engine for DBI classification (must be provided even if simple)
- `helpText`: the UI help object referenced by the help/wizard system (use this key, not `wizardHelp`)
  - Include `statePensionDescriptionP1` and `statePensionDescriptionP2` for country-specific state pension field help.

If the country's pension system has multiple account types (401k/IRA/ISA, etc.) with different rules, FinSim cannot represent that today. Document in the gap report.

### 3.12 `residencyRules`

Fields:
- `postEmigrationTaxYears` (number)
- `taxesForeignIncome` (boolean)
- `minResidencyYearsBeforePostEmigrationTax` (optional number, default `0`)

Used by `Taxman.getActiveCrossBorderTaxCountries()` to apply trailing taxation on emigration.
When `minResidencyYearsBeforePostEmigrationTax` is set, trailing taxation only applies if the person spent at least that many years resident in the just-ended residency period before exit.

---

## 4. Investment Types (The Most Important Part To Get Right)

Investment types determine:
- What assets are available to buy/allocate in the UI.
- How they grow/volatilize (via global base types or local per-wrapper parameters).
- How they are taxed (CGT vs exit tax, deemed disposal, annual exemption eligibility).
- How PV deflation works under relocation (local vs global residence scope).

### 4.1 Decide what "investment menu" the country should expose

At minimum, most countries need:
- Domestic shares / equities wrapper
- A funds/ETF wrapper (often the tricky one)
- RSU wrapper (if you want to model RSU flows)

You may also want:
- Bonds / savings products
- Government-backed accounts
- Real-estate funds

If you cannot support a product's tax treatment accurately, do not guess. Either omit the type or include it with a clear disclaimer and gap report entry.

### 4.2 Key naming convention (avoid collisions)

Recommended:
- `indexFunds_<cc>` (domestic/EU funds regime wrapper)
- `shares_<cc>`
- `rsu_<cc>`
- Any other: `<product>_<cc>`

The `_cc` suffix MUST be the ruleset's country code in lowercase, not the currency and not the asset domicile.

If you want to model a foreign-domiciled asset as purchasable while resident in this country:
- Still suffix the key with the residence country to keep global uniqueness.
- Use `assetCountry` to indicate the asset's domicile for FX/PV/withholding behavior.

Example:
- Germany resident can buy US ETFs:
  - key: `usEtf_de`
  - assetCountry: `us`
  - baseCurrency: `USD`
  - residenceScope: `global`

### 4.3 `baseRef` vs standalone types (economic data rules)

Use `baseRef` when the investment is economically equivalent to a global base asset (e.g., global equities), but taxed differently in this country.

Use standalone types (no `baseRef`) when the investment's economic behavior should be controlled by per-country local inputs.

Important engine behavior:
- Types WITH `baseRef` use `GlobalAssetGrowth_<baseRef>` and `GlobalAssetVolatility_<baseRef>` as primary growth/vol inputs.
- Types WITHOUT `baseRef` use wrapper-level parameters (`investmentGrowthRatesByKey[typeKey]`) as primary growth/vol inputs.

### 4.4 `residenceScope` decision

Choose one:
- `local`: investment is tied to residency context; relocation assistant may flag it; PV uses residency inflation.
- `global`: portable asset; PV uses `assetCountry` inflation; relocation assistant ignores it.

Rule of thumb:
- Domestic tax-advantaged wrappers, domestic-domiciled funds, and things likely to be sold/re-wrapped on emigration: `local`.
- Truly portable global instruments (US ETFs, broadly held global funds): `global`.

### 4.5 Taxation encoding

Each type must declare either:

1. Exit-tax regime:
```json
"taxation": {
  "exitTax": {
    "rate": 0.38,
    "deemedDisposalYears": 8,
    "allowLossOffset": false,
    "eligibleForAnnualExemption": false
  }
}
```

2. Capital gains regime:
```json
"taxation": {
  "capitalGains": {
    "rateRef": "capitalGainsTax.rate",
    "allowLossOffset": true,
    "eligibleForAnnualExemption": true
  }
}
```

Notes:
- `rateRef` currently effectively means "use the ruleset CGT rate". Do not invent new ref paths unless code supports them.
- Annual exemption amount is configured at the ruleset level (`capitalGainsTax.annualExemption`) and is applied across eligible gains.
- Per-type `capitalGains.annualExemption` / `capitalGains.annualExemptionRef` is currently not honored by the engine (treat as a bug; see `docs/tax-rules-schema-audit.md`).
- Loss offset is per-entry; if a regime disallows it, set `allowLossOffset: false`.

### 4.6 RSUs

If you use RSUs:
- Set `sellWhenReceived: true` so they do not appear in allocations and are treated as "auto-sell" income events in the engine/UI.
- Set `excludeFromAllocations: true`.
- Use a CGT taxation rule for post-vesting appreciation (usually normal CGT).

Also document in the gap report whether the country taxes RSUs at vesting as employment income and whether withholding is assumed.

### 4.7 Help text and transparency

Each investment type should include:
- `helpText`: a concise explanation of the tax treatment and any major assumptions.

FinSim supports interpolation tokens in some UI contexts (see existing IE rules for examples). Keep help text short, factual, and explicit about approximations.

---

## 5. Cross-Border Research + Encoding

### 5.1 Tax basis: worldwide vs domestic

Decide:
- Worldwide: residents are taxed on worldwide income/gains (most European countries).
- Domestic/territorial: residents are taxed mainly on domestic-source income (some systems approximate this).

Encoding:
- `taxBasis: "worldwide" | "domestic"`

If the actual system is hybrid (territorial with anti-abuse, remittance basis, partial inclusion), document the mismatch.

### 5.2 Trailing taxation after emigration

Research:
- Whether the country taxes certain income for N years after leaving (ordinary residence, exit taxes, etc.).

Encoding:
- `residencyRules.postEmigrationTaxYears`
- `residencyRules.taxesForeignIncome`

Current engine applies trailing taxation only when `taxesForeignIncome` is true, and it is still an approximation (document it).

### 5.3 Treaties and foreign tax credits

FinSim uses a simplified treaty model:
- If a treaty exists between residence and source countries, a foreign tax credit may apply.
- Credit amount is `min(sourceTaxPaid, residenceTaxOnThatBucket)`.
- No carryovers, per-category limitation rules, or ordering rules.

To enable this:
1. Add the treaty pair to `src/core/config/tax-rules-global.json` under `treaties`.
2. Ensure the residence ruleset has a meaningful `treatyEquivalents` map so foreign taxes can be bucketed.

If a country has foreign tax credits even without a treaty (some do), or has complex limitation rules, document it as a gap.

### 5.4 Withholding on cross-border assets

FinSim supports a simple "asset withholding" model via `tax-rules-global.json`:
- `assetTaxes.dividend.<assetCountry> = rate`
- `assetTaxes.interest.<assetCountry> = rate`
- `assetTaxes.capitalGains.<assetCountry> = rate`

This is applied when the asset domicile differs from the residence country.

If your new country is a common asset domicile (e.g., US, UK, CH), consider adding/adjusting these rates and documenting assumptions (treaties can reduce withholding in real life, which is not modeled here).

---

## 6. Validation Workflow (Do Not Skip)

### 6.1 Static validation (JSON correctness)

Before any behavioral tests:
- Ensure the JSON parses.
- Ensure required objects exist (`incomeTax`, `pensionRules`, `capitalGainsTax`, `investmentTypes`).
- Ensure all bracket keys are strings and all rates are decimals.
- Ensure all investment type keys are unique across the project.

### 6.2 Behavioral "golden" checks (minimum recommended)

For the country, create 2-5 reference scenarios (in tests or as documented manual checks) that cover:

Income tax:
- One income below first threshold.
- One income across multiple thresholds.
- Married vs single if relevant.
- Age-based credit/exemption if relevant.

Additional taxes:
- Below exemption threshold (should be zero).
- Above threshold (progressive computation).

Social contributions:
- Age adjustments if relevant.

Capital gains:
- A sale that uses annual exemption.
- An exit-tax style deemed disposal year for a fund wrapper (if applicable).

Cross-border (if you care):
- Salary in source country while resident elsewhere.
- Capital gains taxed at source + foreign tax credit with treaty.

Use official calculators or published examples where possible; otherwise document your computations in `docs/tax-rules-sources-<cc>.md`.

---

## 7. Adding A New Country To The UI

Adding `tax-rules-<cc>.json` alone is not enough for a good user experience:

1. Add the country to the active app config `availableCountries` list (in `src/core/config/finsim-*.json` referenced by the current `latestVersion` chain).
2. Ensure `locale` and `economicData` are set so currency selection and FX conversions work.
3. Ensure `investmentTypes` exist; otherwise the simulator will throw "No investment assets created."

---

## 8. Country Gap Report Template (Required)

Create `docs/tax-rules-gap-report-<cc>.md` with the following structure.

### 8.1 Summary
- Country: <NAME> (<CC>)
- Rules base year: <YEAR>
- Confidence level: high/medium/low (and why)

### 8.2 Not Representable In Current JSON Schema

List each feature with:
- Real-world rule summary (1-3 sentences).
- Why it cannot be expressed in the current schema (missing fields, missing dimension, etc.).
- What a schema extension might look like (field sketch), if you think it is worth supporting.

Common examples:
- Standard deduction that phases out with income.
- Multiple rate schedules for different income categories.
- Regional/state/province taxes.
- Separate payroll tax caps/thresholds per contribution type.
- Capital gains rate depends on holding period or income bracket.
- Inflation-indexed cost basis, indexation relief.
- Tax credits with phase-outs or refundability.

### 8.3 Engine/Schema Bugs (Fix Required)

There should be no "documented but ignored" fields. If, while authoring a country, you discover:
- a field documented in `docs/tax-rules-reference.md` is ignored by the engine, or
- the engine behavior contradicts the documented semantics,

record it here as a bug and treat it as a blocker:
- What you observed (include a minimal reproduction scenario if possible).
- Why it violates the schema contract.
- The smallest engine change that would fix it (and what test should be added).

### 8.4 Implemented But Approximated (Behavioral Mismatches)

For each mismatch:
- What the engine does today (specific, referencing the relevant bucket if possible).
- What the real system does.
- Why the mismatch matters (direction and size of error).
- Any safe approximation you chose (and where encoded).

Examples:
- Household-level taxation vs individual taxation in couples.
- Additional taxes base excludes rental income or state pension.
- Territorial vs worldwide simplification.
- Foreign tax credit limitation rules not modeled.

### 8.5 Out Of Scope (Explicitly)

Call out things you intentionally did not model:
- Corporate taxes
- VAT/sales taxes
- Wealth/inheritance if engine does not use it
- Estate administration details

---

## 9. Minimal JSON Skeleton (Copy/Fill)

Use this as a starting point (fill values; do not leave placeholders in committed rules):

```json
{
  "country": "XX",
  "countryName": "Country Name",
  "version": "2026.01",
  "taxBasis": "worldwide",
  "treatyEquivalents": {
    "incomeTax": "income",
    "capitalGains": "capitalGains",
    "dividends": "dividends"
  },
  "updateMessage": "Describe what changed.",
  "locale": { "numberLocale": "en-XX", "currencyCode": "XXX", "currencySymbol": "$" },
  "economicData": {
    "typicalRentalYield": 0,
    "inflation": 2.0,
    "purchasingPowerParity": { "value": 1.0, "year": 2024 },
    "exchangeRate": { "perEur": 1.0 },
    "asOf": "2026-01-01"
  },
  "incomeTax": {
    "name": "Income Tax",
    "tooltip": "",
    "taxCredits": {},
    "dependentChildMaxAge": 18,
    "jointBandIncreaseMax": 0,
    "bracketsByStatus": {
      "single": { "0": 0.0 },
      "singleWithDependents": { "0": 0.0 },
      "married": { "0": 0.0 }
    }
  },
  "socialContributions": [],
  "additionalTaxes": [],
  "capitalGainsTax": { "name": "CGT", "tooltip": "", "rate": 0.0, "annualExemption": 0 },
  "pensionRules": {
    "minRetirementAgePrivate": 0,
    "minRetirementAgeOccupational": 0,
    "minRetirementAgeState": 0,
    "statePensionAge": 0,
    "statePensionPeriod": "annual",
    "contributionLimits": { "ageBandsPercent": { "0": 0 }, "annualCap": 0 },
    "lumpSumTaxBands": { "0": 0 },
    "lumpSumMaxPercent": 0,
    "minDrawdownRates": { "0": 0 },
    "statePensionIncreaseBands": {},
    "pensionSystem": { "type": "mixed" },
    "taxAdvantaged": true,
    "helpText": { "label": "Private Pension", "contributionDescriptionP1": "", "contributionDescriptionP2": "", "statePensionDescriptionP1": "", "statePensionDescriptionP2": "" },
    "definedBenefit": { "treatment": "privatePension" }
  },
  "residencyRules": { "postEmigrationTaxYears": 0, "taxesForeignIncome": false },
  "investmentTypes": [],
  "pinnedIncomeTypes": [ "incomeSalaries", "incomeStatePension", "incomeCash" ]
}
```

---

## 10. Agent Instructions (If You Use AI Agents)

When delegating a new country to an AI agent, require the agent to output:

1. A filled parameter map table (Section 2.4) with citations.
2. `tax-rules-<cc>.json` that strictly conforms to current engine expectations.
3. `tax-rules-gap-report-<cc>.md` using the template (Section 8).
4. A short "sanity calculation" section:
   - Pick 2-3 incomes and compute expected income tax using the authored brackets and credits.
   - Explain assumptions about deductions/allowances.

Require citations and ban "best guesses" for numeric thresholds. If something cannot be sourced, it must be marked and pushed into the gap report.

---

## 11. Updating An Existing Country Ruleset (When The Tax System Changes)

This is the maintenance workflow for updating an existing `tax-rules-<cc>.json` when the law changes (e.g., annual budget changes).

### 11.1 Inputs You Must Capture

1. Effective date / tax year:
   - If changes apply mid-year, decide whether you will model the year as:
     - "new law for the whole year" (common simplification), or
     - "pro-rated" (not currently supported cleanly; document as a gap).
2. Which parts changed:
   - Income tax brackets/credits
   - Social contributions and caps
   - Additional taxes / surtaxes
   - Capital gains / fund exit-tax rules
   - Pension contribution limits / ages / lump-sum rules
   - Property gains rules
3. Whether indexing rules changed:
   - If the country indexes thresholds to inflation/wages but FinSim uses inflation, record the mismatch in the gap report.

### 11.2 Update Steps (In Order)

1. Update research docs first:
   - Append new sources to `docs/tax-rules-sources-<cc>.md` with retrieval dates.
   - Update or regenerate the parameter map table (Section 2.4).
2. Update `src/core/config/tax-rules-<cc>.json`:
   - Update `version` (recommend `YYYY.MM`).
   - Update `updateMessage` with a user-facing summary (this is shown via a toast when the version changes).
   - Apply the new numeric values (thresholds/rates/credits) for the simulation base year.
   - Update `economicData` anchors if you maintain them regularly (FX date and PPP year).
3. Keep keys stable unless you are intentionally breaking scenarios:
   - Do not rename `investmentTypes[].key` once published; scenario CSVs and allocations reference these keys.
   - Prefer changing labels/help text/taxation rules in-place while keeping the key stable.
4. Re-run the gap analysis:
   - Update `docs/tax-rules-gap-report-<cc>.md` to reflect any new non-representable rules and remove gaps that are no longer relevant.
5. Update tests:
   - Add or update at least 1-2 "golden" assertions that cover the changed rules (income tax + one other changed area).
   - Keep tests explicit about the tax year and assumptions (e.g., deductions approximated via a 0% bracket).
6. Check cross-border dependencies:
   - If a change affects withholding or treaty-driven credits, update `src/core/config/tax-rules-global.json` accordingly.

### 11.3 Versioning And User Impact

FinSim caches per-country ruleset versions in `localStorage` and shows `updateMessage` when the version changes. Use this mechanism intentionally:
- `version` changes should be meaningful (not "format-only" tweaks).
- `updateMessage` should explain the practical impact (e.g., "Budget 2026: brackets updated; PRSI +0.2pp").

### 11.4 When A Change Requires A Schema/Engine Change

If the new tax rules require a concept that cannot be expressed in the current schema:
1. Document the gap in `docs/tax-rules-gap-report-<cc>.md`.
2. Propose a schema extension in the gap report (field sketch).
3. Implement the engine support and add tests BEFORE relying on the new fields in a ruleset.
