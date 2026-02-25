# Tax Rules Schema Audit (Docs vs Engine)

Date: 2026-02-24

This document audits `docs/tax-rules-reference.md` against the current implementation in:
- `src/core/TaxRuleSet.js`
- `src/core/Taxman.js`
- `src/core/Simulator.js`
- frontend helpers that consume tax rules (notably `src/frontend/web/utils/FormatUtils.js`)

Goals:
- Identify fields that are documented but not implemented (or only partially implemented), and define the resolution for each (implement vs remove vs reserve).
- Identify fields that are implemented but missing from `docs/tax-rules-reference.md` so agents can author correct country files.

Non-goal:
- A full redesign into a completely generic tax engine (tracked in Section 4 as future work).

---

## 1. Documented Fields That Need Resolution

### 1.1 `incomeTax.personalAllowance` (Remove) (Done)

Status: (Done)

---

### 1.2 `incomeTax.jointFilingAllowed` (Move + Implement) + Credit Scope (Done)

Status:
- Documented in `docs/tax-rules-reference.md`.
- Implementation: `TaxRuleSet.isJointFilingAllowed()`, `Taxman.computeIT()` (non-joint branch), `Taxman._applyTaxCredits()` (personContext + scope).

---

### 1.3 `applicableIncomeTypes` (Implement For All Taxes; Backward-Compatible Defaults) (Done)

Status:
- Implementation: Supported in `Taxman.computeIT()`, `Taxman.computeSocialContributionsGeneric()`, and `Taxman.computeAdditionalTaxesGeneric()`.

Suggested income-type vocabulary (engine-internal mapping):
- `employment` (salary)
- `privatePension`
- `statePension`
- `rental`
- `otherIncome`
- `investmentTypeIncome` (RSU-like income buckets declared via `declareInvestmentTypeIncome`)
- `investmentIncome` (dividend/interest distributions declared via `declareInvestmentIncome`; currently only withholding exists, not domestic dividend/interest tax)

Tests:
- Add focused tests per tax kind proving:
  - default (no `applicableIncomeTypes`) matches current behavior
  - explicit selection changes the base as intended

---

### 1.4 `socialContributions[].incomeCap` (Implement For Residence-Country Calculations) (Done)

Status: (Done)

---

### 1.5 `capitalGainsTax.allowLossOffset` (Ruleset Default + Wrapper Cleanup) (Done)

Status: (Done)

---

### 1.6 `capitalGainsTax.deemedDisposalYears` (Ruleset Default Fallback For Exit-Tax Assets) (Done)

Status: (Done)

---

### 1.7 `dividendTax` and `interestTax` (Reserved; Not Yet Implemented) (Done)

Status: (Done — marked reserved in docs)

---

### 1.8 `wealthTax` and `inheritanceTax` (Remove) (Done)

Status: (Done)

---

### 1.9 `investmentTypes[].taxation.capitalGains.annualExemption` / `annualExemptionRef` (Implement Per-Type Exemptions) (Done)

Status: (Done)

---

## 2. Implemented But Missing From `docs/tax-rules-reference.md` (Done)

Status: (Done — all fields documented in tax-rules-reference.md)

---

## 3. Suggested Implementation Order (Minimize Breakage)

1. (Done) Implement ruleset-level `jointFilingAllowed` + credit `scope` + non-joint filing income tax path.
2. (Done) Implement `applicableIncomeTypes` for social contributions, then extend to additional taxes + income tax (default behaviors must preserve current results).
3. (Done) Remove `incomeTax.personalAllowance` from schema/docs/rulesets.
4. (Done) Remove `wealthTax` / `inheritanceTax` from schema/docs/rulesets.
5. (Done) Implement `capitalGainsTax.allowLossOffset` default + wrapper cleanup.
6. (Done) Implement `capitalGainsTax.deemedDisposalYears` fallback for exit-tax assets.
7. (Done) Implement `socialContributions[].incomeCap` in residence-country computation.
8. (Done) Implement per-type annual exemption pools (Section 1.9) with backward-compatible default.
9. (Done) Docs: mark `dividendTax` / `interestTax` as reserved / not yet implemented.

---

## 4. Future Work: Toward A Fully Generic Tax Engine

Do not start this refactor as part of the above gap-fix work.

Idea:
- Continue expanding the “base selection” mechanism (`applicableIncomeTypes`) across tax computations, and converge on a generic “tax definition” model:
  - tax base selection (income types)
  - rate model (flat vs progressive brackets)
  - credits/allowances semantics
  - per-person vs per-household aggregation rules

Constraints:
- Preserve GAS compatibility (`src/core/*`).
- Default behaviors must reproduce existing results for existing rulesets/scenarios unless a ruleset opts into new fields.
