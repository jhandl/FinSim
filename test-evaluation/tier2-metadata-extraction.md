# Test Metadata Extraction

You are extracting structured metadata from a test file for a financial simulation test suite. This metadata will be aggregated across all tests for battery-level analysis.

## Context

This test suite validates a personal finance simulator. Tests define:
- **Parameters**: Simulation configuration (ages, rates, allocations, country)
- **Events**: Financial events (income, expenses, property, relocation)
- **Assertions**: Expected outcomes at specific ages or simulation end

## Input

You will receive the contents of one test file.

## Task

Extract metadata in the following structure. Be precise and complete.

## Output Format

```json
{
  "testFile": "<filename>",
  "testName": "<name from module.exports>",
  "description": "<description from module.exports>",
  "category": "<category if specified>",
  "isCustomTest": "<true if isCustomTest flag present, else false>",
  
  "coverage": {
    "countries": ["ie", "ar"],
    "currencies": ["EUR", "ARS", "USD"],
    "hasRelocation": "<true/false>",
    "ageRange": { "start": "<n>", "end": "<n>" },
    "simulationYears": "<end - start>",
    
    "eventTypes": ["SI", "E", "R", "M", "SM", "FI"],
    "eventCount": "<n>",
    
    "componentsExercised": [
      "// Infer from events and assertions which simulator components are tested",
      "// Examples: income_tax, prsi, usc, pension, state_pension,",
      "// index_funds, shares, real_estate, mortgage, fx_conversion,",
      "// present_value, monte_carlo, market_crash, cgt, exit_tax"
    ],
    
    "lifecyclePhases": [
      "// Which life phases does this test cover?",
      "// Examples: early_career, mid_career, pre_retirement,", 
      "// retirement, late_retirement"
    ]
  },
  
  "assertions": {
    "count": "<n>",
    "types": {
      "exact_value": "<count>",
      "range": "<count>",
      "comparison": "<count>",
      "custom": "<count>"
    },
    "fieldsAsserted": ["cash", "worth", "it", "usc", "prsi"],
    "agesAsserted": [30, 45, 65]
  },
  
  "boundaries": {
    "taxThresholds": [44000, 44001],
    "ageThresholds": [60, 65, 66, 70],
    "zeroValues": ["income", "pension"],
    "maxValues": ["pensionable_earnings"]
  },
  
  "regressionInfo": {
    "baselineDate": "<date or null>",
    "simulatorVersion": "<version or null>",
    "hasUpdateNotes": "<true/false>"
  }
}
```

Extract only what is explicitly present or clearly inferable. Use `null` for missing fields, empty arrays `[]` for empty lists. Provide ONLY the JSON output.
