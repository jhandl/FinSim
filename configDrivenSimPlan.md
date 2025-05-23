# Plan: Transition to Fully Config-Driven Tax Simulation

## 1. Agreed-Upon Model

The goal is a tax simulation system where the tax treatment of assets is entirely driven by the loaded configuration file, with the tax engine acting as an interpreter of that configuration.

*   **Configuration is Sole Authority:** The tax JSON configuration file defines blocks of tax rules. Each block is associated with an arbitrary string identifier (`configAssetTypeKey`, e.g., `"share"`, `"irishDomiciledEtf"`). This key's purpose is to group a set of tax rules within that specific configuration.
*   **Simulation Provides Data + Key:** The core simulation manages assets. When requesting tax calculation, it provides the asset's data (value, cost basis, etc.) *and* the specific `configAssetTypeKey` string (e.g., `"irishDomiciledEtf"`) that corresponds to how this asset should be treated according to the *currently loaded configuration*.
*   **Tax Engine is Config Interpreter:** The tax engine receives the asset data and the `configAssetTypeKey`. It looks *only* within the loaded configuration for the rule block associated with that *exact* key. It applies those rules to the provided asset data. The engine has *no* built-in knowledge of asset types beyond executing the rules found under the provided key in the config.

## 2. Assessment of Current State

The current system is significantly aligned with this model, especially for Capital Gains, Wealth, and Property taxes, where asset type strings from the simulation are used to find corresponding rules or filters in the configuration.

## 3. Identified Gaps & Areas for Generalization

While largely aligned, the following areas represent potential deviations from the purely config-driven ideal or contain hardcoded elements requiring review for future generalization:

*   **Investment Income Tax Structure:** The `investmentIncomeTax` section in the schema (`Design.md`) and its calculator (`InvestmentIncomeTaxCalculator.js`) are primarily structured by income category (dividend, interest) rather than having rule blocks explicitly keyed by the underlying asset's `configAssetTypeKey`. This limits the ability to define different dividend/interest treatments based purely on the source asset type via the config.
*   **Pension Rule Matching:** `pensionRules` uses `planTypeRegex` for matching rules rather than exact string key matching. While flexible, it's a different pattern than the direct key lookup used elsewhere.
*   **Wealth/Property Tax Structure:** These sections use filtering lists (`includedAssetTypes`, `appliesToPropertyType`) based on the type string, rather than distinct rule blocks keyed by `configAssetTypeKey`. This is functionally similar but structurally different.
*   **Hardcoded Type Checks/Defaults:**
    *   **`PropertyTaxCalculator.js:38`**: Contains a hardcoded list `['realEstate', 'residential', 'commercial', 'land', 'primaryResidence']` to identify property assets. In a purely config-driven model, this check might be unnecessary if the simulation only passes relevant assets, or the config itself could define which keys represent taxable properties.
    *   **`CapitalGainsTaxCalculator.js:377` & `:392`**: Explicitly uses `'general'` when getting overall Short-Term and Long-Term rates, potentially overriding specific asset type rules if gains came from multiple types. A more granular calculation might be needed.
    *   **Defaults to `'general'`**: `WealthTaxCalculator.js:46` and `CapitalGainsTaxCalculator.js:40` use `'general'` as a fallback if the simulation doesn't provide a type. This is acceptable fallback behavior but relies on the config having rules for the `"general"` key.
    *   **Fallback to `'general'`**: `CapitalGainsTaxCalculator.js:500` explicitly looks for rules under the `"general"` key if rules for the specific asset type are not found. This is a valid config-driven fallback pattern.

## 4. Deferred Work Plan

The following steps outline the work needed to fully realize the config-driven model at a future time:

1.  **Schema Refinement:**
    *   Review and potentially restructure `investmentIncomeTax` to allow rules to be keyed by `configAssetTypeKey` if needed.
    *   Consider standardizing the structure for Wealth/Property/Pension rules to use explicitly keyed blocks per `configAssetTypeKey` for consistency, replacing filtering lists or regex matching where appropriate.
2.  **Code Generalization:**
    *   Refactor `PropertyTaxCalculator.js` to remove the hardcoded list of property types, relying instead on the simulation providing appropriate assets or a config-defined list.
    *   Refactor `CapitalGainsTaxCalculator.js`'s main tax calculation logic (lines ~373-406) to potentially calculate tax contributions per asset type based on *their* specific rates before summing, rather than applying a single rate derived from the `'general'` type.
    *   Review `InvestmentIncomeTaxCalculator.js` and `PensionWithdrawalCalculator.js` to align with any schema changes made in Step 1.
3.  **Simulation Engine Adaptation:** Ensure the core simulation engine consistently assigns the correct `configAssetTypeKey` (matching the intended rules in the loaded config) to all assets it manages.
4.  **UI Adaptation:** Update any UI components that display or allow configuration of asset types to reflect this config-driven approach.
5.  **Documentation Update:** Update `Design.md` and other relevant documentation to reflect the finalized schema and mechanism.