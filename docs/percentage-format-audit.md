# Percentage Handling Audit

This document captures the current percentage format expectations and usage across parameters.

| Parameter / Flow | Expected format | Current usage (code) | Test usage | Mismatch |
| --- | --- | --- | --- | --- |
| Global asset params (`GlobalAssetGrowth_*`, `GlobalAssetVolatility_*`) | Whole numbers (10 = 10%) | Normalized in `InvestmentTypeFactory.createAssets()` (values > 1 treated as percent, values <= 1 treated as decimal) | Some tests previously used decimals for global assets | Tests using decimals were the main mismatch; corrected in core tests |
| Local wrapper params (`investmentGrowthRatesByKey`, `investmentVolatilitiesByKey`) | Decimals (0.1 = 10%) | Used as-is in `InvestmentTypeFactory.createAssets()` for local wrappers | Tests use decimals for local wrapper rates | No mismatch (legacy decimal format preserved) |
| Pension params (`PensionGrowth_*`, `PensionVolatility_*`) | Decimals (0.05 = 5%) | Passed through parameters and used directly in pension asset calculations | Tests use decimals for pension rates | No mismatch (legacy decimal format preserved) |
| UI percent inputs | Whole numbers | `ValidationUtils` divides by 100 when parsing percentage inputs | UI-driven tests use whole numbers where applicable | Consistent with whole-number expectation |
| CSV serialization/deserialization | Whole numbers for global asset inputs | `serializeSimulation()` and `deserializeSimulation()` pass raw values through without scaling | CSV-based tests use whole numbers for global assets | No mismatch in serialization logic |

Notes:
- Global asset parameters now accept both whole-number and decimal inputs for backward compatibility.
- Local wrapper and pension parameters remain decimal-only until explicitly migrated.
