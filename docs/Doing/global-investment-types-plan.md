# Plan: Global Investment Base Types \+ Country-Scoped Portfolio UI (2026 refresh)

### Scope and non-negotiables

* Maintain semantic compatibility for existing scenarios via backward compatibility in deserialization.  
* Keep core (src/core/) Google Apps Script compatible (no modules/imports).  
* No defensive scaffolding: if required config/state is missing, throw.  
* Events table remains the single source of truth for events; no alternate events model.  
* Investment type keys use namespace format {typeKey}\_{countryCode} (e.g., indexFunds\_ie).  
* Legacy keys without namespace map to {key}\_{StartCountry} in deserialization.  
* Global investmentBaseTypes in src/core/config/tax-rules-global.json.  
* contributionCurrencyMode implicit: convert residence → baseCurrency if different.  
* Country chips are context switchers: visible only when relocation enabled; switch field meaning (e.g., allocations show selected country's types).  
* Tax credits generic: defined in rules with uiInput (required, section, label, tooltip); use params.taxCredits\[creditId\].  
* State pensions per-country multi-stream: UI chip switches edited country; each stream deflated by source country inflation.  
* Allocations sticky per country: getAllocationsByYear(year) uses residence country from MV-\* timeline, fallback StartCountry.  
* Initial capital seeds only StartCountry holdings.\*

### Current reality snapshot

* No global base type list (src/core/config/tax-rules-global.json to be created).  
* TaxRuleSet.getInvestmentTypes() returns raw JSON (src/core/TaxRuleSet.js).  
* Keys collide (tax-rules-ie.json/tax-rules-ar.json both use indexFunds/shares).  
* Buy uses contributionCurrencyMode (src/core/Simulator.js:1689); tests validate (tests/TestContributionCurrencyMode\*.js).  
* Sell per-holding Money (src/core/Equities.js:49).  
* PV per-type via assetCountry \+ residenceScope (src/core/PresentValueCalculator.js:230).  
* UI hardcoded investments (src/frontend/web/ifs/index.html); UIManager.readParameters() dynamic from StartCountry (src/frontend/UIManager.js:291).  
* Private pensions multi-pot; state single weekly, active ruleset age (src/core/Person.js:218, src/core/PresentValueCalculator.js:210).  
* Config.getTaxRuleSet() caches by country (src/core/Config.js).  
* serializeSimulation()/deserializeSimulation() handle legacy (src/core/Utils.js).\*

### Resolved decision gates

Gate A — Investment type key strategy: Namespaced {typeKey}\_{countryCode} (underscore); legacy → {key}\_{StartCountry}.

Gate B — Global base types location: src/core/config/tax-rules-global.json; Config.getGlobalTaxRules()/getInvestmentBaseTypes()/getInvestmentBaseTypeByKey().

Gate C — Contribution semantics: Implicit: convert if baseCurrency \!== residenceCurrency.

Gate D — Country chip semantics: Context switcher; single field per concept, meaning changes by chip (e.g., allocations show selected country's types).

Gate E — Tax credit system: Generic via uiInput in rules; params.taxCredits\[creditId\]; iterate ruleset.getIncomeTaxSpec().taxCredits.

## Implementation plan (test-gated, incremental)

Each phase atomic. Run specified tests after each; stop if fail.

### **Baseline Capture**

Run baseline tests and capture outputs before any code changes:  
Execute ./run-tests.sh TestChartValues for docs/demo.csv and docs/demo3.csv  
Execute ./run-tests.sh TestContributionCurrencyMode TestContributionCurrencyModeARResidence TestContributionCurrencyModeARAsset TestContributionCurrencyModeARMixed  
Execute ./run-tests.sh TestPensionPVRelocation TestDualStatePensions TestPVMultiCountryDeflation  
Document all outputs for comparison after implementation

Relevant Files:

* run-tests.sh  
* docs/demo.csv  
* docs/demo3.csv

### **Introduce Global Investment Base Types**

Create src/core/config/tax-rules-global.json with investmentBaseTypes array containing global base type definitions (baseKey, label, baseCurrency, assetCountry, residenceScope).  
Extend Config class in src/core/Config.js with:  
getGlobalTaxRules() method to load and cache global rules  
getInvestmentBaseTypes() accessor returning the array  
getInvestmentBaseTypeByKey(baseKey) lookup method  
Run tests: ./run-tests.sh TestConfigVersioning TestChartValues

Relevant Files:

* src/core/Config.js  
* src/core/config/finsim-2.0.json

### **Add baseRef Support in TaxRuleSet**

Extend tax rules schema to support baseRef field in investmentTypes entries.  
Implement resolution logic in TaxRuleSet.getInvestmentTypes() (or new getResolvedInvestmentTypes()):  
If baseRef present, copy economic fields (baseCurrency, assetCountry, residenceScope) from global base type  
Ensure returned entries always include required fields for downstream logic  
Fail loudly if baseRef is unknown or required fields missing  
Run tests: ./run-tests.sh TestTaxRuleSet TestChartValues

Relevant Files:

* src/core/TaxRuleSet.js  
* src/core/Config.js

### **Fix Investment Key Collisions with Namespacing**

Update investment type keys to use namespace format {typeKey}\_{countryCode}:  
Modify src/core/config/tax-rules-ie.json: indexFunds → indexFunds\_ie, shares → shares\_ie  
Modify src/core/config/tax-rules-ar.json: indexFunds → indexFunds\_ar, shares → shares\_ar  
Update labels for clarity (e.g., "Index Funds (IE)")  
Implement legacy key normalization in Utils.js or UIManager.js: keys without underscore → {key}\_{StartCountry}  
Update PV type lookup logic to use unique keys  
Run tests: ./run-tests.sh TestChartValues TestMoneyEquityIntegration TestEquitySellMixedCurrency

Relevant Files:

* src/core/config/tax-rules-ie.json  
* src/core/config/tax-rules-ar.json  
* src/core/Utils.js  
* src/core/PresentValueCalculator.js

### **Make contributionCurrencyMode Implicit**

Remove contributionCurrencyMode field from tax rules JSON files.  
Update Simulator.handleInvestments() (around line 1689\) to make conversion implicit:  
If entry.baseCurrency \!== residenceCurrency, convert contribution from residence to base currency  
If currencies match, invest directly (no conversion)  
Update or remove tests/TestContributionCurrencyMode\*.js tests to assert "always buy in base currency" behavior.  
Run tests: ./run-tests.sh TestChartValues TestMoneyEquityIntegration\*

Relevant Files:

* src/core/Simulator.js  
* src/core/config/tax-rules-ie.json  
* src/core/config/tax-rules-ar.json  
* tests/TestContributionCurrencyMode.js

### **Implement Country-Scoped Investment Allocations**

Replace params.investmentAllocationsByKey with params.investmentAllocationsByCountry\[country\]\[typeKey\].  
Update getAllocationsByKey() → getAllocationsByYear(year) in Simulator.js:  
Derive residence country from MV-\* timeline for the given year  
Return allocations for that country, fallback to StartCountry if not configured  
Implement backward compatibility in Utils.js deserializeSimulation(): map legacy flat allocations to StartCountry.  
Add test: TestAllocationScopingAcrossRelocation (invest in AR allocations while resident in AR, then relocate and stop investing into AR profile).  
Run tests: ./run-tests.sh TestChartValues\*

Relevant Files:

* src/core/Simulator.js  
* src/core/Utils.js  
* src/frontend/UIManager.js

### **Build Union Investment Catalog Across Scenario Countries**

Build scenario investment catalog as union of investmentTypes from:  
StartCountry ruleset  
Every MV-\* destination country in scenario  
Any linkedCountry references if required  
Initialize investmentAssets from union catalog using per-key growth/volatility maps.  
Implement rule: only StartCountry's initial capital inputs seed holdings (per UI requirement).  
Ensure PV metadata lookup covers every catalog key used in ledger/PV paths.  
Run tests: ./run-tests.sh TestChartValues TestRelocationCurrency TestPVMultiCountryDeflation\*

Relevant Files:

* src/core/Simulator.js  
* src/core/InvestmentTypeFactory.js  
* src/core/PresentValueCalculator.js

### **Implement Country Chip UI for Relocation-Enabled Scenarios**

Create CountryChipSelector component in src/frontend/web/components/:  
Render flag icons with tooltips  
Handle country selection and callbacks  
Only visible when Config.isRelocationEnabled() returns true  
Update UI cards in WebUI.js:  
Allocations card: Add country chip, show investment types for selected country, persist to InvestmentAllocation\_{country}\_{typeKey}  
Starting Position card: Show only StartCountry types (no chip)  
Personal Circumstances card: Add country chip, show tax credits and state pension for selected country  
Add Jest test for CountryChipSelector component.  
Run tests: npm run test \-- CountryChipSelector.test.js

Relevant Files:

* src/frontend/web/WebUI.js  
* src/frontend/web/ifs/index.html  
* src/core/Config.js

### **Update Parameters and CSV Serialization for Per-Country Fields**

Update UIManager.readParameters() to read:  
investmentAllocationsByCountry (nested map)  
taxCredits (generic map, not personalTaxCredit)  
statePensionWeeklyByCountry (per-country map)  
Update Utils.js serializeSimulation() / deserializeSimulation() to:  
Round-trip per-country allocations, state pensions, and tax credits  
Implement legacy key migration: indexFunds → indexFunds\_{StartCountry}  
Map legacy personalTaxCredit → taxCredits.personal  
Map legacy statePensionWeekly → statePensionWeeklyByCountry\[StartCountry\]  
Run tests: ./run-tests.sh TestCSVMultiCurrencyRoundTrip TestChartValues\_

Relevant Files:

* src/frontend/UIManager.js  
* src/core/Utils.js

### **Implement Generic UI-Driven Tax Credit System**

Extend tax rules schema to add uiInput configuration to tax credits (required, section, label, tooltip).  
Update Taxman.js to:  
Remove hardcoded params.personalTaxCredit references  
Iterate over ruleset.getIncomeTaxSpec().taxCredits  
Read user values from params.taxCredits\[creditId\]  
Apply min/max logic generically  
Update WebUI.js to:  
Remove hardcoded "Personal Tax Credit" field  
Dynamically generate fields from taxCredits\[\*\].uiInput  
Group by section property  
Add backward compatibility in deserializeSimulation(): map legacy personalTaxCredit → taxCredits.personal.  
Add test: TestGenericTaxCredits.  
Run tests: ./run-tests.sh TestChartValues TestTaxmanMoneyDeclares\*

Relevant Files:

* src/core/Taxman.js  
* src/core/TaxRuleSet.js  
* src/core/config/tax-rules-ie.json  
* src/frontend/web/WebUI.js  
* src/core/Utils.js

### **Implement Per-Country Multi-Stream State Pensions**

Replace statePensionWeeklyParam with statePensionWeeklyByCountry\[country\] in Person.js.  
Update Person.calculateYearlyPensionIncome() to:  
Iterate over all configured state pensions  
For each country: determine eligibility age, calculate yearly amount in country's currency, convert to residence currency for ledger  
Store base-currency amounts for PV calculations  
Extend PresentValueCalculator.js to handle multiple state pension streams:  
Each stream deflated by source country's inflation  
Converted to residence currency for display  
Update UI in WebUI.js: country chip switches which pension is being edited, persist to StatePensionWeekly\_{country}.  
Add backward compatibility: map legacy statePensionWeekly → statePensionWeeklyByCountry\[StartCountry\].  
Add test: TestMultiCountryStatePensions.  
Run tests: ./run-tests.sh TestDualStatePensions TestPensionPVRelocation TestChartValues\_

Relevant Files:

* src/core/Person.js  
* src/core/PresentValueCalculator.js  
* src/frontend/web/WebUI.js  
* src/core/Utils.js

### **Update Cache Busting for Web Assets**

Update ?v=... parameters in src/frontend/web/ifs/index.html for any JS/CSS files modified in previous phases.  
Update internal version headers in CSS files if present.  
Ensure browsers don't serve stale assets after deployment.

Relevant Files:

* src/frontend/web/ifs/index.html

### Updated "load-bearing" field map

Required on resolved investmentTypes/investmentAssets:

* baseCurrency / assetCountry: PV back-conversion, deemed disposal (src/core/PresentValueCalculator.js, src/core/InvestmentTypeFactory.js).  
* residenceScope: PV deflator selection (src/core/PresentValueCalculator.js).  
* taxation (exitTax/capitalGains, deemedDisposalYears, flags): revenue/tax (src/core/InvestmentTypeFactory.js).

### Deliverables checklist (end state)

* investmentBaseTypes in tax-rules-global.json \+ baseRef supported.  
* Namespaced keys with legacy handling.  
* Country-scoped allocations/UI, residence/year selection.  
* Union catalog; StartCountry initial capital.  
* Implicit buy conversion.  
* Country chips drive allocations/personal circumstances.  
* Generic tax credits UI-driven; state pensions multi-stream.  
* Tests updated/added; baselines compared.  
* Cache-busting updated.

