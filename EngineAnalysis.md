# Taxman Engine Analysis: Calculation Method Generality (Phase 5, Step 5.1 - Revised)

**Objective:** Analyze `SchemaEvaluator.js`, its usage in calculators, and the `Design.md` schema definition to identify assumptions and limitations regarding the universal application of `CalculationRule` methods (e.g., `brackets`, `lookup`) across different tax components (taxes, limits, allowances, deductions, credits). This includes identifying fixed numeric values in the schema that cannot currently be represented by dynamic calculations.

**Analyzed Files:**
*   `src/core/tax/SchemaEvaluator.js`
*   `src/core/tax/IncomeTaxCalculator.js`
*   `Design.md` (Schema Definition)
*   (Considered patterns likely repeated in other calculators)

**Key Findings & Identified Assumptions/Limitations:**

1.  **Engine Limitation: `SchemaEvaluator.calculateValue` Lacks `brackets`:**
    *   The core `calculateValue` method successfully handles several calculation methods (`fixedAmount`, `percentage`, `perDependent`, `formula`, `lookup`, `custom`) based purely on the provided `CalculationRule` object and context data. This provides a degree of generality.
    *   **Major Limitation:** It crucially lacks a case for `method: 'brackets'`. This prevents using the standard bracket structure (defined with `lowerBound`, `upperBound`, `rate`) for calculating anything *other* than the main tax liability via the specialized `calculateBracketTax` method. This is the most significant engine-side barrier to universal bracket application.

2.  **Schema Limitation: Widespread Use of Fixed Numbers:**
    *   While `CalculationRule` is used in several key places (income adjustments, itemized deduction base, credits, pension limits), the `Design.md` schema frequently defines attributes using **fixed numeric types** where dynamic calculation might be desirable or necessary for some tax systems.
    *   **Impact:** Even if the engine supported more methods universally, the schema itself often mandates a fixed number, preventing dynamic calculation. Examples of fixed numeric attributes that *cannot* currently be made dynamic via `CalculationRule` include:
        *   Thresholds, taper rates, floors in `PhaseOutRule`.
        *   Parts, max benefit in `familyQuotient`.
        *   Percentage/absolute limits for `itemizedDeductions`.
        *   Flat rates, thresholds, factors in `socialContributions`.
        *   Annual exemptions, flat rates, periods, limits in `capitalGainsTax`.
        *   Allowances (fixed amounts), flat rates in `investmentIncomeTax`.
        *   Exemption thresholds, flat rates, caps in `wealthTax`.
        *   Assessment ratios, rates, exemption amounts in `propertyTax`.
        *   Exemptions, thresholds, flat rates, periods in `transferTax`.
        *   Credit rates, withdrawal ages, penalty rates, portions in `pensionRules`.
        *   Non-resident rates, special regime durations/charges in `residencyRules`.

3.  **Engine Limitation: Specialized Calculation Logic:**
    *   **Bracket Calculations:** Tax calculation using brackets is handled exclusively by the separate `SchemaEvaluator.calculateBracketTax` method, invoked specifically within `IncomeTaxCalculator.calculateIncomeTax`. This assumes brackets are only for final tax liability.
    *   **Allowances:** `SchemaEvaluator._calculateAllowance` contains specific logic for `allowanceRule.amountByIncomeBracket` (using labels), a pattern not supported by the generic `calculateValue`. The schema example for interest allowance (`Design.md`, Section 9) uses this structure, though the implementation *might* fallback to `CalculationRule` if provided.
    *   **Itemized Deductions:** `IncomeTaxCalculator` applies specific limits (AGI floors/ceilings, absolute ceilings) *after* the initial `calculateValue` call, rather than these limits being part of the `CalculationRule` itself or a more generic limiting mechanism.
    *   **Family Quotient:** `IncomeTaxCalculator._calculateFamilyQuotientParts` directly uses fixed `parts` from the schema.

4.  **`lookup` Method Potential:**
    *   `calculateValue` supports `method: 'lookup'`. This *could* potentially handle some scenarios currently using fixed numbers (e.g., age-based limits) if the schema used a `CalculationRule` with `method: 'lookup'` and the appropriate `lookupKey` and `lookupTable`. However, this pattern isn't explicitly used or encouraged for these cases in the current schema design.

5.  **`getBasisValue` Hardcoding:**
    *   The `getBasisValue` helper contains hardcoded logic to aggregate specific income types (`investmentIncomeTotal`, `pensionIncomeTotal`), suggesting the basis for calculation isn't always a simple property lookup.

6.  **Reliance on Custom Rules:**
    *   The use of `method: 'custom'` and direct calls to `utils.executeCustomRule` (e.g., `qbiDeduction`, `overallItemizedLimit`) highlights calculations currently considered too complex or specific for the declarative schema rules.

**Conclusion & Path Forward:**

The analysis confirms that achieving universal application of calculation methods requires addressing limitations in **both the engine and the schema definition**:

*   **Engine:** The most critical enhancement is adding `method: 'brackets'` support to `SchemaEvaluator.calculateValue`. Generalizing logic currently hardcoded in specific calculators (e.g., itemized limits, allowance lookups) would also increase flexibility.
*   **Schema:** `Design.md` needs review to identify where fixed numeric attributes could be replaced by `CalculationRule` objects to enable dynamic calculations, assuming the engine is enhanced to support them.

The current state prevents dynamic calculation (using formulas, lookups, or brackets) for many thresholds, rates, limits, and amounts throughout the tax system because the schema specifies fixed numbers and/or the engine lacks the necessary generic implementation (especially for brackets).