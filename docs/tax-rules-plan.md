## Tax rules neutrality plan and rename `Revenue` → `Taxman`

### Goals
- **Rename** `src/core/Revenue.js` → `src/core/Taxman.js`, class `Revenue` → `Taxman`.
- **Remove all country-specific logic** from the engine. No hardcoded references like PRSI, USC, CGT, Exit Tax, IE defaults, or Ireland-specific credits.
- **Drive all tax behavior from rules files** via a country-neutral spec parsed by `TaxRuleSet`.
- **Keep engine responsibilities**: compute per-tax liabilities with full attribution; expose totals; support multiple people and household attributes.

### Out of scope for this change
- UI/Tests will be updated as part of the refactor, but this plan focuses on the engine classes: `Revenue.js`, `Config.js`, `TaxRuleSet.js`. Steps to find/adapt dependencies are included below.

---

## 1) Rename and file moves
- **File rename**: `src/core/Revenue.js` → `src/core/Taxman.js`.
- **Class rename**: `class Revenue` → `class Taxman`.
- **Constructor signature**: keep minimal; all contextual inputs enter via `reset(householdContext, attributionManager)` and declarative `declare*` methods.
- **Exports/globals**: where the old class was exposed on `this.Revenue`, expose `this.Taxman` instead.

Search/replace to kick off migration (non-exhaustive):

```bash
rg -n "\bRevenue\b" src tests
rg -n "new Revenue\(" src tests
```

---

## 2) Neutral tax rules spec (v2)

Replace the special-purpose getters in `TaxRuleSet` with a generic, declarative spec. The engine should be able to compute all taxes by iterating over rules; no tax names are special.

### High-level structure
- **taxes**: array of tax definitions (income, payroll/social, supplemental surcharges, capital gains, lump sums, etc.)
- **credits**: array of credit/relief definitions scoped to specific taxes
- **deductions/adjustments**: array of deductions applied to defined income bases or to taxes
- **filing/household**: rules for brackets by filing status, band-shifts for joint filing, and attribute gating (e.g., dependents, age)
- **investmentPolicies**: capital gains policies by asset category or type key (e.g., shares, funds, bonds) with exemption/offset rules

### Example neutral JSON (illustrative)
```json
{
  "version": "2.0",
  "countryName": "Generic",
  "filing": {
    "statuses": ["single", "married"],
    "attributes": ["hasDependentChildren", "ageP1", "ageP2"],
    "jointBandShift": {
      "appliesTo": "income.primary",
      "maxIncrease": 30000,
      "formula": "min(earner1Salary, earner2Salary, maxIncrease)"
    }
  },
  "incomeBases": {
    "employment": {},
    "privatePension": {},
    "statePension": {},
    "investmentIncome": {},
    "other": {}
  },
  "taxes": [
    {
      "id": "income.primary",
      "displayName": "Income Tax",
      "kind": "progressive",
      "base": ["employment", "privatePension", "statePension", "investmentIncome", "other"],
      "bracketsByStatus": {
        "single": { "0": 0.2, "40000": 0.4 },
        "married": { "0": 0.2, "49000": 0.4 }
      },
      "exemptions": [
        { "when": "ageP1>=65 || ageP2>=65", "ifTotalBaseLte": 20000 }
      ]
    },
    {
      "id": "payroll.social",
      "displayName": "Social Contribution",
      "kind": "flat",
      "rateByAge": { "0": 0.041, "66": 0.0 },
      "base": ["employment", "investmentIncome", "other"],
      "split": "evenBetweenAdults"
    },
    {
      "id": "income.supplemental",
      "displayName": "Supplemental Surcharge",
      "kind": "progressive",
      "base": ["employment", "privatePension", "investmentIncome", "other"],
      "brackets": { "0": 0.01, "15000": 0.02, "30000": 0.045 },
      "exemptAmount": 13000,
      "ageReducedBrackets": { "70": { "0": 0.005, "15000": 0.01, "30000": 0.03 } }
    },
    {
      "id": "capital.gains",
      "displayName": "Capital Gains",
      "kind": "capitalGains",
      "annualExemption": 1270
    },
    {
      "id": "retirement.lumpSum",
      "displayName": "Retirement Lump Sum",
      "kind": "progressive",
      "base": ["lumpSum.privatePension"],
      "brackets": { "0": 0.0, "200000": 0.2, "500000": 0.4 }
    }
  ],
  "credits": [
    { "id": "personal", "amount": 1775, "appliesTo": ["income.primary"] },
    { "id": "employee", "amount": 1775, "appliesTo": ["income.primary"], "eligibility": "hasEmploymentIncome" },
    { "id": "ageCredit", "amount": 245, "appliesTo": ["income.primary"], "eligibility": "ageP1>=65 || ageP2>=65" }
  ],
  "deductions": [
    {
      "id": "pension.contribution.relief",
      "base": "employment",
      "kind": "capPercentOfBase",
      "percentByAge": { "0": 0.20, "40": 0.25, "50": 0.30 },
      "annualCap": 115000,
      "appliesAs": "negativeIncome"
    }
  ],
  "investmentPolicies": [
    {
      "key": "shares",
      "policy": {
        "name": "Capital Gains",
        "rate": 0.33,
        "lossOffset": true,
        "eligibleForAnnualExemption": true
      }
    },
    {
      "key": "funds",
      "policy": {
        "name": "Fund Gains",
        "rate": 0.41,
        "deemedDisposalYears": 8,
        "lossOffset": false,
        "eligibleForAnnualExemption": false
      }
    }
  ]
}
```

Notes:
- Tax IDs and display names are data; the engine never special-cases them.
- Social contributions, surcharges, and primary income tax are all modeled as taxes with either flat or progressive rates.
- Capital gains behavior (loss offset, annual exemptions, deemed disposal) is declared per policy and attached to investment types.

---

## 2.5) Adapt existing `tax-rules-ie.json` to neutral v2

Transform `src/core/config/tax-rules-ie.json` in-place to the v2 neutral schema. Mapping guide:

- **filing**
  - `incomeTax.jointBandIncreaseMax` → `filing.jointBandShift.maxIncrease`.
  - Married band-shift formula (currently hardcoded in engine) → `filing.jointBandShift.formula: "min(earner1Salary, earner2Salary, maxIncrease)"`.
  - Provide `filing.statuses: ["single", "married"]`.
  - If `incomeTax.bracketsByStatus.singleWithDependents` exists, create a conditional override, e.g. `income.primary.bracketsOverrides` with `when: "status=='single' && hasDependentChildren==true"`.

- **incomeBases**
  - Declare: `employment`, `privatePension`, `statePension`, `investmentIncome`, `other`.

- **taxes**
  - Primary income tax:
    - `incomeTax.brackets` or `incomeTax.bracketsByStatus.*` → tax `{ id: "income.primary", kind: "progressive", base: [ all income bases ] }` with `bracketsByStatus` copied over.
    - Age-based total income exemption: `incomeTax.ageExemptionAge`, `incomeTax.ageExemptionLimit` → `tax.exemptions: [{ when: "ageP1>=AGE || ageP2>=AGE", ifTotalBaseLte: LIMIT }]`.
  - Social contribution (PRSI):
    - From `socialContributions[]` entry where `name == 'PRSI'` → tax `{ id: "payroll.social", kind: "flat", rateByAge: { ... }, base: ["employment", "investmentIncome", "other"], split: "evenBetweenAdults" }`.
    - Map `ageAdjustments` thresholds to `rateByAge` with numeric string keys.
  - Supplemental surcharge (USC):
    - From `additionalTaxes[]` entry where `name == 'USC'` → tax `{ id: "income.supplemental", kind: "progressive" }`.
    - Map `exemptAmount` → `exemptAmount`.
    - Map base `brackets` → `brackets`.
    - Map reduced age brackets: `ageBasedBrackets` and thresholds (with any `reducedRateAge`/`reducedRateMaxIncome`) → `ageReducedBrackets` and guard those with `exemptAmount`/income check as needed in engine.
  - Capital gains:
    - `capitalGainsTax.annualExemption` → include a tax `{ id: "capital.gains", kind: "capitalGains", annualExemption }`.

- **credits**
  - `incomeTax.taxCredits.employee` → credit `{ id: "employee", amount, appliesTo: ["income.primary"], eligibility: "hasEmploymentIncome" }`.
  - `incomeTax.taxCredits.age` → credit `{ id: "ageCredit", amount, appliesTo: ["income.primary"], eligibility: "ageP1>=AGE || ageP2>=AGE" }`.
  - App-level `params.personalTaxCredit` should be moved into rules as `{ id: "personal", amount, appliesTo: ["income.primary"] }` if not already in JSON.

- **deductions**
  - `pensionRules.contributionLimits.ageBandsPercent` and `annualCap` → deduction `{ id: "pension.contribution.relief", base: "employment", kind: "capPercentOfBase", percentByAge, annualCap, appliesAs: "negativeIncome" }`.

- **investmentPolicies**
  - From `investmentTypes`:
    - For shares-like assets taxed under CGT: map to policy `{ key, policy: { name: "Capital Gains", rate: capitalGainsTax.rate, lossOffset: true, eligibleForAnnualExemption: true } }`.
    - For fund-like assets with exit tax: map existing `exitTax` object to policy `{ key, policy: { name: "Fund Gains", rate, deemedDisposalYears, lossOffset, eligibleForAnnualExemption } }`.

Validation checklist after migration:
- JSON validates and `version` is updated to `"2.0"`.
- All bracket keys are strings of non-negative integers; rates are numbers.
- Every credit `appliesTo` references an existing `tax.id`.
- At least one capital gains policy exists and matches existing investment type keys.

---

## 2.6) Author `docs/tax-rules-spec.md` (schema and compliance)

Create a normative specification for the neutral v2 rules that future country rule sets must follow. Contents:

- **Scope & versioning**: Declare spec versioning, backward-compat promises, and how engines/readers should validate `version` fields.
- **Top-level schema**: `version`, `countryName`, `filing`, `incomeBases`, `taxes`, `credits`, `deductions`, `investmentPolicies`.
- **Filing rules**: statuses, household attributes, `jointBandShift` (fields: `appliesTo`, `maxIncrease`, `formula` DSL with `min`, `max`, numeric ops; available vars: `earner1Salary`, `earner2Salary`, household attributes).
- **Income bases**: reserved keys and guidance for adding new bases; bases are referenced by taxes and deductions.
- **Taxes**:
  - `kind`: `progressive` | `flat` | `capitalGains`.
  - Brackets maps: numeric-string keys sorted asc; rates in [0,1].
  - Optional `bracketsByStatus`, `ageReducedBrackets`, `exemptAmount`, `exemptions` with `when` expressions and `ifTotalBaseLte`.
  - `base`: array of income base keys; `split`: optional strategy (e.g., `evenBetweenAdults`).
- **Credits**: fields `id`, `amount` (currency), `appliesTo` (array of `tax.id`), optional `eligibility` expression; no hardcoded credit names.
- **Deductions**: fields `id`, `base`, `kind` (`capPercentOfBase` | `fixedAmount` | `formula`), `percentByAge` thresholds, `annualCap`, `appliesAs` (`negativeIncome` | `taxCredit`).
- **Investment policies**: fields `key`, `policy.rate`, optional `deemedDisposalYears`, `lossOffset`, `eligibleForAnnualExemption`; policies referenced by asset types.
- **Expressions**: allow a small safe subset (comparison, boolean ops, `min`/`max`), with defined variable context; forbid arbitrary code.
- **Validation rules**: uniqueness constraints, referential integrity (`appliesTo` and `base` keys exist), numeric ranges, bracket key format, monotonic thresholds.
- **Examples**: a minimal valid file and a full-featured file; reference test vectors.

Deliverable: `docs/tax-rules-spec.md` with the above sections and at least one fully-valid JSON example aligned with §2.

---

## 3) `TaxRuleSet.js` refactor (neutral API)

Replace specific getters with generic accessors. Keep normalization and defensive defaults.

### Remove
- `getIncomeTaxBracketsFor`, `getIncomeTaxJointBandIncreaseMax`, `getIncomeTaxEmployeeCredit`, `getIncomeTaxAgeCredit`, `getIncomeTaxAgeExemptionAge`, `getIncomeTaxAgeExemptionLimit`
- `getPRSIRateForAge`
- `getUSC*` methods
- `getCapitalGainsAnnualExemption`, `getCapitalGainsRate`

### Add
- `getTaxes(): TaxDefinition[]` – returns fully normalized `taxes` array.
- `getCredits(): CreditDefinition[]`
- `getDeductions(): DeductionDefinition[]`
- `getFilingRules(): FilingRules` – statuses, attributes, joint band shift rules.
- `getInvestmentPolicies(): Policy[]` and `findInvestmentPolicyByKey(key)`.

### Normalization tasks
- Ensure brackets maps have numeric-sortable string keys.
- Expand age-threshold maps into sorted arrays for efficient lookups.
- Validate references (e.g., credits.appliesTo refers to existing tax IDs).

---

## 4) `Config.js` changes
- Remove built-in default `'ie'`. The country code must be provided by the app config in attribute `default.country`.
- `getTaxRuleSet(countryCode)`: keep async loading; no default to `'ie'`.
- `getCachedTaxRuleSet(countryCode)`: keep behavior; returns null if not loaded.
- Provide a tiny utility on the UI layer to choose country and then call `getTaxRuleSet(country)` before starting the simulation.

---

## 5) `Taxman.js` design (replacement for `Revenue.js`)

### State
- `people`: { person1, person2|null }
- `household`: { status: 'single'|'married'|..., attributes: { hasDependentChildren, ageP1, ageP2, ... } }
- `ruleset`: cached `TaxRuleSet`
- `incomesByBase`: map of base → amount (employment, privatePension, statePension, investmentIncome, other)
- `capitalEvents`: array of { amount, description, assetPolicyKey, allowLossOffset?, eligibleForAnnualExemption? }
- `lumpSums`: array of { amount, personId, baseKey: 'lumpSum.privatePension' }
- `totals`: map of taxId → amount (plus `netIncome`)
- `attributionManager`: unchanged contract, but keys become `tax:<taxId>`

### Methods (neutral)
- `reset(householdContext, attributionManager)` – initialize state, attach ruleset via `Config.getInstance().getCachedTaxRuleSet(selectedCountry)`.
- `declareIncome({ amount, base, personId, description })` – replaces `declareSalaryIncome`, `declareOtherIncome`, `declareInvestmentIncome`, `declareNonEuSharesIncome`, `declarePrivatePensionIncome`.
- `declareRetirementLumpSum({ amount, personId, description })` – replaces `declarePrivatePensionLumpSum`.
- `declareCapitalEvent({ amount, description, assetPolicyKey, overrides })` – replaces `declareInvestmentGains` and implicit exit-tax/CGT logic.
- `computeTaxes()` – orchestrates:
  - Build taxable bases (apply deductions like pension contribution relief from `ruleset.getDeductions()`).
  - For each tax in `ruleset.getTaxes()` call `computeTax(taxDef, bases, household)`.
  - Compute capital gains by policy (loss offsets, annual exemption), attributing to `tax.id` defined for capital gains.
  - Apply credits from `ruleset.getCredits()` to the taxes they target.
  - Record per-source attributions as `tax:<id>`.
- `netIncome()` – new formula: sum(income bases) − sum(positive taxes) + sum(negative adjustments), independent of country.

### Internal helpers
- `computeProgressiveTax(def, amount, options)` – generic bracket engine with optional band shift formula from `filing.jointBandShift`.
- `applyCredits(credits, taxTotals, eligibilityContext)` – centralize credits application.
- `applyDeductions(deductions, bases, household)` – normalize negative income adjustments (e.g., pension relief caps by age and cap).

---

## 6) Remove hardcoded Irish concepts from the engine
- Delete `computePRSI`, `computeUSC`, `computeIT`, `computeCGT` from the old class. Supersede with the generic loop described above.
- Remove uses of hardcoded attribution keys: replace `'it'|'prsi'|'usc'|'cgt'` with `'tax:<taxId>'`.
- Remove special handling of `nonEuShares`. Income bases are configured in rules and declared via `declareIncome`.
- Replace exit-tax vs CGT branching with policy-driven capital gains computation.

---

## 7) Cross-cutting migration steps (engine consumers)

While not part of these three files, plan the following repo-wide adaptations.

### Replace class name and constructor
```bash
rg -n "\bRevenue\b" src tests | sed 's/^/# /'
```
- Change to `Taxman` and update any references to instance fields (`it`, `prsi`, `usc`, `cgt`) to use `taxTotals['tax:<id>']` or `getTotalTax()` if you add such a helper.

### Remove default IE ruleset usages
```bash
rg -n "get(Cached)?TaxRuleSet\('\w\w'\)" src tests
```
- Replace with a selected country code from UI or configuration. Avoid literals; thread country choice through the app start sequence.

### Replace hardcoded table/field names (UI/data sheet)
```bash
rg -n "\b(PRSI|USC|CGT|Exit\s*Tax|nonEuShares)\b" src frontend tests
```
- UI tables should render taxes dynamically from `ruleset.getTaxes()` rather than fixed columns. For example, replace `dataSheet[row].prsi` with a dynamic aggregation over `tax:<id>`.
- Update formatting helpers that assume specific keys.

### Adapt tests
- Replace assertions on `prsi`, `usc`, `cgt`, `it` with tax IDs defined in the test ruleset or with totals.
- Tests referencing IE semantics (age credits, specific rates) should be moved to country-specific rule fixtures rather than code.

---

## 8) Implementation order
 - **Step 0**: Convert `src/core/config/tax-rules-ie.json` to the neutral v2 schema in-place using the mapping in §2.5. Commit this as the authoritative IE rules file for v2.
 - **Step 1**: Write `docs/tax-rules-spec.md` (see §2.6) as the formal spec for country rule authors.
 - **Step 2**: Introduce new neutral spec in `src/core/config/tax-rules-<country>.json` for any additional countries.
 - **Step 3**: Refactor `TaxRuleSet.js` to parse the neutral spec and expose the new generic getters. Add thorough unit tests for parsing/normalization.
 - **Step 4**: Create `src/core/Taxman.js` by copying `Revenue.js`, then:
   - Rename class and file.
   - Remove PRSI/USC/CGT/IT methods and replace with generic tax loop.
   - Replace `nonEuShares` with generic income bases.
   - Replace `ruleset` calls with generic getters.
 - **Step 5**: Update `Config.js` to drop the `'ie'` default; add selected-country path.
 - **Step 6**: Update simulator/UI to construct `Taxman` and to bind dynamic tax columns.
 - **Step 7**: Update tests to the new spec and dynamic taxes.

---

## 9) Acceptance criteria
- No string literals like "PRSI", "USC", "CGT", "Exit Tax", or country codes appear in engine code (`Taxman.js`, `TaxRuleSet.js`, `Config.js`).
- All tax computations are derived solely from the JSON rules (progressive, flat, exemptions, credits, capital gains policies).
- The engine supports 1–N taxes without code changes; adding a new tax only modifies the rules file.
- Attribution works with `tax:<id>` keys; UI and tests consume them dynamically.
 - A formal schema/spec exists at `docs/tax-rules-spec.md` and is referenced by all rules files.

---

## 10) Risk/mitigation
- **Risk**: Hidden dependencies on fixed tax keys in UI/tests.
  - **Mitigation**: Repo-wide search and dynamic rendering of taxes. Add a helper to list taxes and totals from `Taxman` to simplify consumers.
- **Risk**: Joint band-shift and age-related behaviors are currently hardcoded.
  - **Mitigation**: Encode formulas/thresholds in `filing` rules and evaluate in the engine.
- **Risk**: Capital gains interplay (loss offsets, exemptions) differs by policy.
  - **Mitigation**: Centralize CG computation with explicit per-policy flags (lossOffset, annualExemption eligibility, deemed disposal).

---

## 11) Quick checklist
- **Rename** file/class to `Taxman`.
- **Neutralize** rules API in `TaxRuleSet`.
- **Generalize** `Config` country loading.
- **Generic taxes loop** in `Taxman` (no hardcoded names).
- **Dynamic taxes** in consumers (UI/tests).

