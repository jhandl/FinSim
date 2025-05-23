
## Proposed Generic Tax System JSON Schema Specification

### 1. Introduction

This document specifies the structure and components of a generic JSON schema designed to represent individual tax systems from various countries and jurisdictions. The schema aims to be comprehensive, flexible, clear, and extensible, enabling a financial scenario simulator to accurately calculate tax liabilities based on configurable rules.

It synthesizes findings from comparative analyses of global tax systems, accommodating diverse structures like progressive/flat rates, different filing statuses, various deductions/credits, territorial/residence rules, and specific tax types (income, social, capital gains, wealth, property, transfer, investment).

### 2. Design Principles

*   **Modularity:** Tax rules are organized into logical, self-contained sections based on major tax categories. Sections can be omitted if not applicable to a specific jurisdiction.
*   **Flexibility:** Common variations (brackets, conditions, phase-outs, filing statuses) are handled through structured data types.
*   **Clarity:** Uses descriptive field names (camelCase) and includes optional `description` fields for documentation within the schema instance.
*   **Extensibility:** Designed with future additions in mind. New tax types or rule complexities can be added without breaking the core structure.
*   **Data-Driven:** Encodes tax rules as data, allowing the simulation engine to remain generic. Complex logic may be flagged for potential custom implementation if needed.

### 3. Top-Level Schema Structure

The root of the JSON configuration is an object with the following properties:

```json
{
  "schemaName": "GenericTaxSystem",
  "schemaVersion": "1.0",
  "countryCode": "ISO 3166-1 alpha-2 code (e.g., 'IE', 'US', 'DE')",
  "jurisdictionName": "Full name (e.g., 'Ireland', 'United States Federal', 'Germany')",
  "currency": "ISO 4217 code (e.g., 'EUR', 'USD')",
  "taxYear": "YYYY or YYYY-YYYY format (e.g., 2023, '2023-2024')",
  "description": "Optional description of this configuration.",
  "systemSettings": { ... }, // See Section 4
  "incomeTax": { ... }, // See Section 5
  "socialContributions": [ ... ], // See Section 6
  "capitalGainsTax": { ... }, // See Section 7
  "investmentIncomeTax": { ... }, // See Section 8
  "wealthTax": { ... }, // See Section 9
  "propertyTax": [ ... ], // See Section 10
  "transferTax": [ ... ], // See Section 11
  "pensionRules": { ... }, // See Section 12
  "residencyRules": { ... }, // See Section 13
  "complexRulePlaceholders": [ ... ] // See Section 14
}
```

### 4. Common Data Structures

These structures are used throughout the schema:

*   **`TaxBracket`**: Represents a single tier in a progressive tax system. Primarily used for calculating final tax liability (e.g., in `incomeTax.taxCalculationMethod`), but also applicable within `CalculationRule` (see below) for defining bracket-based limits, allowances, contribution amounts, etc., based on inputs like age or income (see `pensionRules` example).
    ```json
    {
      "description": "Optional description.",
      "lowerBound": "Number (inclusive, 0 for the first bracket)",
      "upperBound": "Number (exclusive, null or omit for the top bracket)",
      "rate": "Decimal (e.g., 0.20 for 20%)"
    }
    ```
*   **`ConditionalRule`**: Defines conditions under which a rule applies.
    ```json
    {
       "description": "Optional explanation of the condition.",
       "conditionType": "enum ('age', 'income', 'residencyStatus', 'filingStatus', 'familySize', 'assetType', 'holdingPeriodMonths', 'relationship', 'custom')",
       "operator": "enum ('==', '!=', '>', '>=', '<', '<=', 'in', 'notIn')",
       "value": "Value or array of values to compare against (e.g., 65, ['resident'], 'child')",
       // Optional: Use 'custom' conditionType and provide a 'customRuleIdentifier' if logic is complex
       "customRuleIdentifier": "string"
    }
    ```
*   **`PhaseOutRule`**: Defines how a benefit (deduction, credit, allowance) is reduced based on income or other factors.
    ```json
    {
      "description": "Optional explanation.",
      "basedOn": "string (e.g., 'adjustedGrossIncome', 'netWealth')",
      "thresholdRule": { /* CalculationRule object defining the threshold */ },
      "taperRateRule": { /* CalculationRule object defining the taper rate */ },
      "floorRule": { /* CalculationRule object defining the minimum benefit floor, often { method: 'fixedAmount', value: 0 } */ }
    }
    ```
*   **`CalculationRule`**: Describes how *any* numeric value within the tax system (e.g., a limit, allowance, deduction, credit, threshold, rate, exemption amount, or even a component of tax itself) can be determined dynamically. Methods like `brackets`, `lookup`, and `formula` are designed to be generally applicable across different components, allowing configuration to define the calculation logic rather than requiring hardcoded engine behavior. This promotes flexibility and reduces the need for custom code. See examples in `investmentIncomeTax.interest.allowance` (using `lookup`) and `pensionRules.contributionTaxTreatment.limitRule` (using `brackets`).
    ```json
    {
        "method": "enum ('fixedAmount', 'percentage', 'perDependent', 'formula', 'lookup', 'brackets', 'custom')",
        "value": "Number or String (e.g., 1000 for fixedAmount, 0.15 for percentage)",
        "basis": "string (e.g., 'grossIncome', 'adjustedGrossIncome', 'age', 'expenseAmount', 'assetValue')", // Relevant for 'percentage', 'brackets', and potentially 'lookup' (if `lookupKey` is omitted). Defines the primary input variable against which percentages, bracket bounds, or lookups (if no `lookupKey`) are evaluated.
        "amountPerDependent": "Number", // Relevant for 'perDependent'
        "dependentTypeFilter": { /* Optional filter for 'perDependent', e.g., { type: 'child', maxAge: 18 } */ },
        "formula": "string", // Mathematical formula string using defined variables from context
        "lookupKey": "string (e.g., 'age', 'filingStatus', 'incomeBracketLabel')", // Explicit context variable to use as the key for 'lookup'. If omitted, 'basis' might be used.
        "lookupTable": [ { "key": "...", "value": "..." } ], // Relevant for 'lookup'
        "brackets": [ /* Array of TaxBracket objects */ ], // Relevant for 'brackets'. Bounds apply to the 'basis' value.
        "customRuleIdentifier": "string", // Reference for complex external logic ('custom' method), such as stateful calculations, per-entity processing (e.g., per-person USC), or rules not easily expressible declaratively.
        "maxValue": "Number", // Optional cap applied after calculation
        "minValue": "Number" // Optional floor applied after calculation
    }
    ```

### 5. `systemSettings` Object

Defines fundamental system-wide parameters.

```json
{
  "taxationBasis": {
    "type": "enum ('residence', 'territorial', 'citizenship', 'hybrid')",
    "description": "Primary principle for determining tax scope (worldwide vs. local income)."
  },
  "defaultFilingStatus": "string (e.g., 'single')",
  "filingStatuses": [
      { "id": "string (e.g., 'single', 'marriedJointly', 'headOfHousehold')", "description": "string" }
      // List all recognized filing statuses for validation/UI purposes
  ],
  "incomeSplitting": { // Example for systems like Germany
      "appliesToStatus": ["marriedJointly"],
      "method": "enum ('fullSplitting', 'limitedSplitting', 'none')",
      "description": "Optional description of income splitting rules."
  },
  "familyQuotient": { // Example for systems like France
      "appliesToStatus": ["marriedJointly", "singleParent"],
      "partsDefinition": [
          { "person": "firstAdult", "parts": 1.0 },
          { "person": "secondAdult", "parts": 1.0 },
          { "person": "child", "index": [0, 1], "parts": 0.5 }, // First two children
          { "person": "child", "index": [2, null], "parts": 1.0 } // Subsequent children
      ],
      "maxBenefitPerHalfPartRule": { /* CalculationRule object defining the max benefit */ },
      "description": "Optional description of family quotient calculation."
    }
}
```

### 6. `incomeTax` Object

Defines rules for taxing ordinary income. Uses a structure keyed by filing status for flexibility.

```json
{
  "description": "Rules for calculating income tax.",
  "filingStatusRules": {
    "single": { /* FilingStatusSpecificRules */ },
    "marriedJointly": { /* FilingStatusSpecificRules */ },
    // ... other statuses defined in systemSettings.filingStatuses
  },
  "incomeAdjustments": [ // Applied to Gross Income to get Adjusted Gross Income (AGI) or equivalent
    {
      "name": "string (e.g., 'Retirement Contribution Deduction', 'Student Loan Interest')",
      "description": "Optional.",
      "type": "enum ('deduction', 'exclusion')",
      "calculationRule": { /* CalculationRule object */ },
      "conditions": [ /* Optional array of ConditionalRule objects */ ],
      "applicableIncomeTypes": ["employment", "selfEmployment", "all"] // Optional filter
    }
  ],
  "allowChoiceBetweenStandardAndItemizedDeduction": "boolean"
}
```

**`FilingStatusSpecificRules` Object (used within `incomeTax.filingStatusRules`)**

```json
{
  "description": "Rules specific to this filing status.",
  "taxableIncomeDefinitionNotes": "Optional string describing how taxable income is determined after AGI (e.g., AGI - Standard/Itemized Deductions - Personal Exemptions).",
  "personalAllowances": [ // Tax-free amounts (e.g., UK personal allowance)
      {
          "name": "string",
          "description": "Optional.",
          "calculationRule": { /* CalculationRule object defining the allowance amount */ },
          "conditions": [ /* Optional array of ConditionalRule objects (e.g., for age) */ ],
          "phaseOutRule": { /* Optional PhaseOutRule object */ }
      }
  ],
  "standardDeductions": [ // Standard amounts deducted from AGI
      {
          "name": "string",
          "description": "Optional.",
          "calculationRule": { /* CalculationRule object defining the deduction amount */ },
          "conditions": [ /* Optional array of ConditionalRule objects (e.g., age, blindness) */ ]
      }
  ],
  "itemizedDeductions": [ // Specific deductible expenses
      {
          "name": "string (e.g., 'Medical Expenses', 'Mortgage Interest', 'Charitable Donations')",
          "description": "Optional.",
          "calculationRule": { /* CalculationRule object (often % of AGI or expense amount) */ },
          "limits": { // Optional limits
              "percentageAGIFloorRule": { /* CalculationRule object defining the floor (e.g., { method: 'percentage', basis: 'adjustedGrossIncome', value: 0.075 }) */ },
              "percentageAGICeilingRule": { /* CalculationRule object defining the ceiling */ },
              "absoluteAmountCeilingRule": { /* CalculationRule object defining the ceiling */ },
              "overallLimitApplies": "boolean (e.g., Pease limitation)" // May need custom logic
          },
          "conditions": [ /* Optional array of ConditionalRule objects */ ]
      }
  ],
  "taxCalculationMethod": {
      "method": "enum ('brackets', 'formula')",
      "brackets": [ /* Array of TaxBracket objects */ ], // Used if method is 'brackets'
      "formula": "string", // Used if method is 'formula'
      "taxBase": "string (e.g., 'taxableIncome', 'adjustedGrossIncome')" // What the rates/formula apply to
  },
  "taxCredits": [
      {
          "name": "string (e.g., 'Child Tax Credit', 'Earned Income Tax Credit')",
          "description": "Optional.",
          "type": "enum ('refundable', 'nonRefundable')",
          "calculationRule": { /* CalculationRule object */ },
          "conditions": [ /* Optional array of ConditionalRule objects */ ],
          "phaseOutRule": { /* Optional PhaseOutRule object */ }
      }
  ]
}
```

### 7. `socialContributions` Array

List of mandatory social insurance contributions (e.g., pensions, healthcare, unemployment).

```json
[
  {
    "name": "string (e.g., 'PRSI', 'USC', 'Social Security', 'Medicare', 'CPP')",
    "description": "Optional.",
    "contributionType": "enum ('pension', 'health', 'unemployment', 'disability', 'generalSocialCharge', 'other')",
    "appliesToIncomeType": ["employment", "selfEmployment", "investment", "all"], // Which income is subject
    "calculationMethod": { // Can be progressive or flat
        "method": "enum ('brackets', 'flatRate', 'custom')",
        "brackets": [ /* Array of TaxBracket objects, bounds refer to relevant income */ ],
        "flatRateRule": { /* CalculationRule object defining the flat rate (e.g., { method: 'fixedAmount', value: 0.04 }) */ }, // Use if not progressive
        "customRuleIdentifier": "string"
    },
    "rates": {
      "employeeRateFactor": "Decimal (Factor applied to the calculationMethod rate/brackets, e.g., 1.0)",
      "employerRateFactor": "Decimal (Factor applied, e.g., 1.0)"
      // Allows splitting defined rates/brackets, or use 0 if one party doesn't contribute
    },
    "incomeThresholds": { // On the relevant income base
        "lowerBoundRule": { /* CalculationRule object defining the lower threshold (e.g., { method: 'fixedAmount', value: 12000 }) */ },
        "upperBoundCeilingRule": { /* CalculationRule object defining the upper ceiling (e.g., { method: 'fixedAmount', value: 50000 }) */ }
    },
    "exemptions": [ /* Array of ConditionalRule objects (e.g., age exemption) */ ]
  }
  // ... more contribution types
  // Note: While the engine supports various calculation methods (brackets, flatRate, etc.) via CalculationRule,
  // applying these *per person* within a single household/filing unit (e.g., Irish USC) typically requires
  // using method: 'custom' with a specific 'customRuleIdentifier'. This is because the generic calculator
  // processes aggregated income by default, and the necessary per-individual income breakdown might not be
  // readily available in the standard context for purely schema-driven iteration. The custom rule can be
  // designed to access and process this detailed data if provided by the simulator in the context object.
]
```

### 8. `capitalGainsTax` Object

Rules for taxing profits from selling capital assets.

```json
{
  "description": "Rules for Capital Gains Tax.",
  "annualExemption": {
      "calculationRule": { /* CalculationRule object defining the exemption amount */ },
      "appliesPer": "enum ('individual', 'couple')", // If different for filing status
      "conditions": [ /* Optional ConditionalRule */ ]
  },
  "holdingPeriods": [ // Defines different periods and their labels
      { "label": "shortTerm", "maxMonths": 12 },
      { "label": "longTerm", "minMonths": 12.01 }
      // Add more if needed (e.g., superLongTerm)
  ],
  "taxationMethod": {
      "method": "enum ('separateBrackets', 'integratedWithIncome', 'dualSystemRate', 'flatRate')",
      "description": "How CGT rates are determined.",
      // Details based on method:
      "separateBrackets": [ /* Array of TaxBracket objects, apply to capital gains */ ],
      "integratedIncomeThresholds": [ /* Array defining which income tax bracket determines the CGT rate */ ],
      "dualSystemRateRule": { /* CalculationRule object defining the rate */ }, // If a flat rate applies separately (Nordic style)
      "flatRateRule": { /* CalculationRule object defining the rate */ } // Simple flat rate regardless of income
  },
  "ratesByAssetAndHolding": [
      {
          "assetType": "string (e.g., 'general', 'realEstate', 'collectibles', 'qualifiedSmallBusinessStock', 'crypto', 'indexFundIreland')", // Define categories
          "holdingPeriodLabel": "string (maps to holdingPeriods.label, e.g., 'shortTerm', 'longTerm')",
          "applicableRateRule": { /* CalculationRule object defining the rate (Overrides taxationMethod rate if specified) */ },
          "rateCalculationNote": "Optional string for complex interactions (e.g., 'Uses income tax bracket rate')",
          "deemedDisposalRule": { // For specific cases like Irish funds
              "applies": "boolean",
              "periodYearsRule": { /* CalculationRule object defining the period (e.g., { method: 'fixedAmount', value: 8 }) */ },
              "taxRateRule": { /* CalculationRule object defining the tax rate */ },
              "description": "Exit tax on unrealized gains."
          }
      }
      // Add entries for all relevant combinations
  ],
  "lossTreatment": {
      "offsetGains": {
          "allowWithinSameAssetType": "boolean",
          "allowAcrossAssetTypes": "boolean",
          "allowAgainstHoldingPeriod": "enum ('sameOnly', 'shortAgainstLong', 'longAgainstShort', 'any')"
      },
      "offsetOrdinaryIncomeLimit": {
          "calculationRule": { /* CalculationRule object defining the limit amount (e.g., { method: 'fixedAmount', value: 3000 }) */ },
          "appliesPer": "enum ('individual', 'couple')"
      },
      "carryforward": {
          "allowed": "boolean",
          "durationYearsRule": { /* CalculationRule object defining the duration (e.g., { method: 'fixedAmount', value: null }) */ },
          "type": "enum ('shortTerm', 'longTerm', 'combined')"
      }
  }
}
```

### 9. `investmentIncomeTax` Object

Rules for taxing dividends, interest, royalties etc. (distinct from capital gains where applicable).

```json
{
  "description": "Rules for taxing investment income (dividends, interest, etc.).",
  "dividends": {
      "taxationMethod": "enum ('asOrdinaryIncome', 'asCapitalGains', 'preferentialRates', 'flatRate', 'exempt')",
      "qualifiedDefinition": [ /* Optional array of ConditionalRule to define 'qualified' dividends */ ],
      "rates": { // Specific rates if not taxed as ordinary income or CGT
          "qualified": "Decimal or Array of TaxBracket", // Could depend on income level
          "nonQualified": "Decimal or Array of TaxBracket" // Often taxed as ordinary income
      },
      "allowance": { // e.g., UK dividend allowance
          "calculationRule": { /* CalculationRule object defining the allowance amount */ },
          "conditions": [ /* Optional ConditionalRule */ ]
      }
  },
  "interest": {
      "taxationMethod": "enum ('asOrdinaryIncome', 'preferentialRates', 'flatRate', 'exempt')",
      "rates": { /* Similar structure to dividends if needed */ },
      "allowance": { /* e.g., UK Personal Savings Allowance */
          "description": "Example using lookup based on income bracket label.",
          "calculationRule": {
              "method": "lookup",
              "lookupKey": "incomeBracketLabel", // Assumes engine can determine this label
              "lookupTable": [
                  { "key": "basic", "value": 1000 },
                  { "key": "higher", "value": 500 },
                  { "key": "additional", "value": 0 }
              ],
              "minValue": 0
          },
          "conditions": [ /* Optional ConditionalRule */ ]
      }
  },
  // Add sections for 'royalties', 'otherInvestmentIncome' if needed
  "withholdingTax": { // Default rates applicable, especially for non-residents (can be overridden by residency rules/treaties)
      "dividendsRateRule": { /* CalculationRule object defining the rate */ },
      "interestRateRule": { /* CalculationRule object defining the rate */ },
      "royaltiesRateRule": { /* CalculationRule object defining the rate */ }
  }
}
```

### 10. `wealthTax` Object

Rules for annual taxes on net worth. Omit if not applicable.

```json
{
  "applies": "boolean",
  "description": "Rules for net wealth tax.",
  "baseDefinition": {
      "type": "enum ('netWorth', 'grossAssets', 'specificAssets')",
      "includedAssetTypes": ["all"] or ["realEstate", "financialAssets", "luxuryGoods"],
      "excludedAssetTypes": ["pensions", "primaryResidence", "businessAssets"],
      "liabilityInclusion": "enum ('include', 'exclude')" // Are liabilities deducted?
  },
  "exemptionThreshold": {
      "calculationRule": { /* CalculationRule object defining the threshold amount */ },
      "appliesPer": "enum ('individual', 'couple')",
      "conditions": [ /* Optional ConditionalRule */ ]
  },
  "taxCalculationMethod": {
      "method": "enum ('brackets', 'flatRate')",
      "brackets": [ /* Array of TaxBracket objects, bounds are net wealth */ ],
      "flatRateRule": { /* CalculationRule object defining the rate */ }
  },
  "liabilityCapRule": { // If total tax (income + wealth) is capped
      "applies": "boolean",
      "maxPercentageOfIncomeRule": { /* CalculationRule object defining the percentage cap */ },
      "description": "Optional details on the cap."
  }
}
```

### 11. `propertyTax` Array

Rules for taxes on real estate ownership. Can have multiple entries for different levels (national, regional, local).

```json
[
  {
    "level": "enum ('national', 'regional', 'local', 'schoolDistrict')",
    "description": "e.g., 'County Real Estate Tax'",
    "appliesToPropertyType": ["all", "residential", "commercial", "land"],
    "taxBasis": {
        "type": "enum ('assessedValue', 'marketValue', 'cadastralValue', 'fixedAmountPerProperty')",
        "assessmentFrequencyYears": "Number",
        "assessmentRatioRule": { /* CalculationRule object defining the ratio (e.g., { method: 'fixedAmount', value: 0.6 }) */ }
    },
    "rateDefinition": {
        "method": "enum ('millRate', 'percentage', 'fixedAmount')", // Mill rate = per 1000 of assessed value
        "rateRule": { /* CalculationRule object defining the rate (mill rate, percentage, or fixed amount) */ }
    },
    "exemptions": [ // E.g., primary residence, homestead exemptions
        {
            "name": "string",
            "type": "enum ('valueReduction', 'rateReduction', 'fullExemption')",
            "amountRule": { /* CalculationRule object defining the value reduction amount */ },
            "conditions": [ /* ConditionalRule objects (e.g., owner age, disability) */ ]
        }
    ],
    "paymentFrequency": "enum ('annual', 'semiAnnual', 'quarterly')"
  }
  // ... more property tax rules if layered
]
```

### 12. `transferTax` Array

Rules for taxes on wealth transfers (Inheritance, Estate, Gift). Use multiple entries if a country has distinct taxes.

```json
[
  {
    "taxType": "enum ('inheritance', 'estate', 'gift')",
    "description": "Optional.",
    "taxPayer": "enum ('donor', 'recipient', 'estate')",
    "lifetimeExemption": { // Primarily for Estate/Gift Tax
        "calculationRule": { /* CalculationRule object defining the exemption amount */ },
        "appliesPer": "enum ('individual', 'couple')",
        "unifiedWithOtherTaxes": "boolean" // e.g., US unified credit
    },
    "annualExclusionPerRecipient": { // Primarily for Gift Tax
        "calculationRule": { /* CalculationRule object defining the exclusion amount */ }
    },
    "exemptionsAndRatesByRelationship": [
        {
            "relationshipCategory": "string ('spouse', 'childDescendant', 'parentAscendant', 'sibling', 'other', 'charity')", // Define categories relevant to the jurisdiction
            "taxFreeThresholdRule": { /* CalculationRule object defining the threshold amount */ },
            "taxCalculationMethod": {
                "method": "enum ('brackets', 'flatRate', 'exempt')",
                "brackets": [ /* TaxBracket objects, bounds are value received/transferred */ ],
                "flatRateRule": { /* CalculationRule object defining the rate */ }
            }
        }
        // Add entries for each relevant relationship category
    ],
    "accumulationPeriodYearsRule": { /* CalculationRule object defining the period (e.g., { method: 'fixedAmount', value: 10 }) */ }
  }
  // ... Add another object for Gift Tax if Inheritance/Estate Tax is also defined
]
```

### 13. `pensionRules` Object

Specific tax rules related to retirement accounts/pensions.

```json
{
  "description": "Tax rules governing pension contributions, growth, and withdrawals.",
  "contributionTaxTreatment": [
      {
          "planTypeRegex": "string (e.g., 'Occupational.*', 'PrivatePension', '401k', 'RRSP')", // Identifier for plan types
          "treatmentType": "enum ('deduction', 'credit', 'postTax')", // How contributions are treated
          "limitRule": { /* CalculationRule defining max contribution limits. Example using brackets based on age: */
              "method": "brackets",
              "basis": "age", // Use the individual's age as the input for the brackets
              "brackets": [
                { "lowerBound": 0, "upperBound": 30, "rate": 15000 }, // Example: Max contribution of 15000 up to age 30
                { "lowerBound": 30, "upperBound": 40, "rate": 20000 }, // Example: Max contribution of 20000 from age 30 to 40
                { "lowerBound": 40, "upperBound": 50, "rate": 25000 },
                { "lowerBound": 50, "upperBound": 55, "rate": 30000 },
                { "lowerBound": 55, "upperBound": 60, "rate": 35000 },
                { "lowerBound": 60, "upperBound": null, "rate": 40000 }
              ],
              "description": "Example: Age-related maximum contribution limit using brackets."
              // Alternatively, could use method: 'percentage', basis: 'grossIncome', value: 0.20, maxValue: 40000 etc.
          },
          "creditDetails": { // If treatmentType is 'credit'
              "rateRule": { /* CalculationRule object defining the credit rate */ },
              "calculationBasis": "string ('contributionAmount')"
          },
          "conditions": [ /* Optional ConditionalRule for eligibility */ ]
      }
  ],
  "growthTaxTreatment": {
      "default": "enum ('taxDeferred', 'taxExempt', 'taxable')", // Common case
      "exceptions": [ // For specific plan types (e.g., Roth-style)
          { "planTypeRegex": "string", "treatment": "enum (...)" }
      ]
  },
  "withdrawalTaxTreatment": [
      {
          "planTypeRegex": "string",
          "withdrawalAge": {
              "normalMinAgeRule": { /* CalculationRule object defining the age */ },
              "earlyMinAgeRule": { /* CalculationRule object defining the age (optional) */ }
          },
          "taxationMethod": {
              "normalWithdrawal": "enum ('asOrdinaryIncome', 'specialRate', 'taxFree')",
              "earlyWithdrawal": "enum ('asOrdinaryIncomePlusPenalty', 'specialRate', 'taxFree')",
              "lumpSum": "enum ('asOrdinaryIncome', 'specialRate', 'taxFree', 'partialTaxFree')"
          },
          "ratesAndPenalties": {
              "earlyWithdrawalPenaltyRateRule": { /* CalculationRule object defining the rate */ },
              "specialTaxRateRule": { /* CalculationRule object defining the rate */ },
              "lumpSumTaxFreePortionRule": { /* CalculationRule object defining the portion (e.g., { method: 'fixedAmount', value: 0.25 }) */ }
          },
          "conditions": [ /* Optional ConditionalRule */ ]
      }
  ]
}
```

### 14. `residencyRules` Object

Rules related to tax residency and foreign income.

```json
{
  "description": "Rules based on residency status and foreign income.",
  "residencyDefinitionNotes": "Optional string describing criteria for tax residency.",
  "nonResidentTaxation": {
      "incomeTypesSubjectToTax": ["employment", "business", "rental", "capitalGains", "dividends", "interest"], // List sourced locally
      "taxationMethod": "enum ('withholding', 'flatRateOnFile', 'progressiveOnFile')",
      "rates": [ // Define rates for different income types for non-residents
          { "incomeType": "dividends", "rateRule": { /* CalculationRule object defining the rate (e.g., { method: 'fixedAmount', value: 0.15 }) */ } },
          { "incomeType": "interest", "rateRule": { /* CalculationRule object defining the rate (e.g., { method: 'fixedAmount', value: 0.10 }) */ } },
          { "incomeType": "employment", "rateRule": { /* CalculationRule object defining the rate (e.g., { method: 'fixedAmount', value: 0.24 }) */ } }
          // ...
      ],
      "allowancesDeductions": "enum ('none', 'limited', 'sameAsResident')" // Availability for non-residents
  },
  "foreignTaxRelief": { // For residents taxed on worldwide income
      "applies": "boolean",
      "method": "enum ('credit', 'exemption', 'deduction')",
      "creditLimitRule": "enum ('foreignTaxPaid', 'domesticTaxLiability', 'lesserOfBoth')", // Common limit for credit method
      "exemptionDetails": "Optional string describing types of income exempt (e.g., 'employment income from treaty countries').",
      "treatyOverrideNotes": "Optional string mentioning impact of tax treaties."
  },
  "specialRegimes": [ // Optional regimes like non-dom, expat rules, lump-sum tax
      {
          "name": "string (e.g., 'UK Remittance Basis', 'NL 30% Ruling', 'CH Lump Sum Taxation', 'PT Non-Habitual Resident')",
          "description": "Brief explanation.",
          "eligibilityCriteria": [ /* Array of ConditionalRule objects */ ],
          "durationYearsRule": { /* CalculationRule object defining the duration (If applicable) */ },
          "rulesSummary": "string (How it modifies standard rules, e.g., 'Foreign income/gains taxed only if remitted', '30% of salary tax-free')",
          "annualChargeRule": { /* CalculationRule object defining the charge (e.g., for UK non-dom) */ },
          "lossOfAllowances": "boolean (e.g., UK non-dom loses personal allowance)",
          "customRuleIdentifier": "string" // Link to complex logic if needed
      }
  ]
}
```

### 15. `complexRulePlaceholders` Array

An optional section to flag rules too complex for the current schema structure, requiring custom code in the simulator engine.

```json
[
    {
        "ruleIdentifier": "string (Unique ID)",
        "description": "Detailed description of the complex rule or calculation.",
        "affectedSections": ["incomeTax.itemizedDeductions", "..."], // Which parts of the standard calc it affects
        "requiredInputs": ["variableName1", "variableName2"], // Inputs needed from the simulator state
        "expectedOutput": "string (Description of what the custom logic should return)"
    }
]
```

---

**Implementation Notes for the Engineer:**

1.  **Validation:** Implement robust validation against this schema using a JSON Schema validator.
2.  **Engine Logic:** The simulation engine should parse this JSON configuration for a given country/year. It will need to:
    *   Determine the applicable filing status.
    *   Calculate income components (Gross
    , Adjusted Gross, Taxable) by applying adjustments, deductions (standard or itemized based on choice flag and calculations), and allowances, respecting conditions and phase-outs.
    *   Apply tax rates (brackets or formula) to the relevant income base.
    *   Calculate and apply tax credits, respecting refundability and phase-outs.
    *   Calculate social contributions based on relevant income, rates, thresholds, and exemptions.
    *   Calculate Capital Gains Tax, considering holding periods, asset types, exemptions, rates (potentially linked to income), and loss treatments.
    *   Calculate Investment Income Tax based on its specific rules.
    *   Calculate Wealth and Property taxes if applicable.
    *   Handle Transfer Taxes (triggered by specific simulation events like death or gifting).
    *   Apply Pension rules for contributions and withdrawals based on simulation events.
    *   Factor in Residency rules for non-resident scenarios or foreign income of residents (including tax relief).
    *   Check for and potentially invoke logic associated with `specialRegimes` or `complexRulePlaceholders`.
3.  **Condition Evaluation:** The engine needs a robust way to evaluate the `ConditionalRule` objects against the individual's current state (age, income, residency, etc.).
4.  **Extensibility:** Design the engine's calculation steps to be data-driven by the schema sections, making it easier to add new tax types later by adding new sections to the schema and corresponding calculation modules to the engine.
5.  **Custom Logic:** Implement a mechanism (e.g., strategy pattern, plugins, external script calls) to handle rules identified in `complexRulePlaceholders` or marked with `customRuleIdentifier`.

