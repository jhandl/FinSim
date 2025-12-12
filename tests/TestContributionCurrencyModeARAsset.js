// Test for contributionCurrencyMode functionality: AR Asset Mode
// Validates that contributions in ARS are converted to USD when contributionCurrencyMode is 'asset'
//
// Test: AR Single-Country (Asset Mode - ARS to USD Conversion)
// AR global USD ETF uses asset mode with USD base currency.
// Contributions in ARS should be converted to USD using FX rates.

const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
const { installTestTaxRules } = require('./helpers/RelocationTestHelpers.js');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

const TestContributionCurrencyModeARAsset = {
  name: "Contribution Currency Mode - AR Asset",
  description: "Validates that contributions in ARS are converted to USD for global USD ETF with contributionCurrencyMode 'asset'. Uses convertCurrencyAmount for FX conversion.",
  isCustomTest: true,

  async runCustomTest() {
    const errors = [];
    const framework = new TestFramework();
    framework.setVerbose(false);

    // Initialize simulation context by loading core modules
    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    // Load AR and US tax rulesets to get economic data
    const arRules = new TaxRuleSet(AR_RULES);
    const usRulesRaw = {
      country: 'US',
      countryName: 'United States',
      locale: { currencyCode: 'USD', currencySymbol: '$' },
      economicData: {
        inflation: { cpi: 2.0, year: 2025 },
        purchasingPowerParity: { value: 1.0, year: 2025 },
        exchangeRate: { perEur: 1.1, asOf: '2025-11-22' }
      },
      incomeTax: { brackets: { '0': 0.1 } },
      capitalGainsTax: { rate: 0.15, annualExemption: 0 },
      residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
      pensionRules: { systemType: 'state_only' }
    };
    const usRules = new TaxRuleSet(usRulesRaw);

    // Install AR and US tax rulesets into Config for the simulation
    installTestTaxRules(framework, { ar: AR_RULES, us: usRulesRaw });

    // Build EconomicData with both profiles
    const econ = new EconomicData([arRules.getEconomicProfile(), usRules.getEconomicProfile()]);
    if (!econ.ready) {
      return { success: false, errors: ['EconomicData not ready'] };
    }

    // Define scenario
    const scenarioDefinition = {
      name: 'AR Asset Mode Test',
      description: 'AR StartCountry with 100% allocation to USD global ETF',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 31,
          emergencyStash: 1000000,  // 1M ARS emergency fund
          initialSavings: 2000000,   // 2M ARS initial savings
          initialPension: 0,
          initialFunds: 0,
          initialShares: 0,
          retirementAge: 65,
          FundsAllocation: 0.0,      // 0% allocation to indexFunds
          SharesAllocation: 1.0,     // 100% allocation to shares (Global USD ETF)
          pensionPercentage: 0,
          pensionCapped: "No",
          growthRateFunds: 0,
          growthDevFunds: 0,
          growthRateShares: 0,       // Zero growth to simplify validation
          growthDevShares: 0,
          inflation: 0,               // Zero inflation to simplify
          priorityCash: 1,
          priorityPension: 4,
          priorityFunds: 2,
          priorityShares: 3,
          personalTaxCredit: 0,
          StartCountry: 'ar'
        },
        events: [
          {
            type: "SI",
            id: "salary",
            amount: 5000000,           // 5M ARS annual salary
            fromAge: 30,
            toAge: 30,
            rate: 0,
            match: 0
          },
          {
            type: "E",
            id: "expenses",
            amount: 3000000,           // 3M ARS annual expenses
            fromAge: 30,
            toAge: 30,
            rate: 0,
            match: 0
          }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenarioDefinition)) {
      return { success: false, errors: ['Failed to load scenario'] };
    }

    const results = await framework.runSimulation();
    if (!results || !results.dataSheet) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const rows = Array.isArray(results.dataSheet) ? results.dataSheet.filter(r => r && typeof r === 'object') : [];
    if (rows.length === 0) {
      return { success: false, errors: ['Simulation produced no data rows'] };
    }

    const rowAge30 = rows.find(r => r && typeof r === 'object' && r.age === 30);
    if (!rowAge30) {
      return { success: false, errors: ['Age 30 row not found'] };
    }

    // Get simulation context to access convertCurrencyAmount logic
    const ctx = framework.simulationContext;
    function evalInSim(expr) {
      return vm.runInContext(expr, ctx);
    }

    // Calculate expected USD amount
    // Net income after tax: ~5M ARS - 3M ARS - taxes = ~2M ARS (roughly)
    // Surplus to invest: 2M (initial) + ~2M (surplus) - 1M (emergency) = ~3M ARS
    // Convert 3M ARS to USD using FX
    const baseYear = rowAge30.year;
    const conversionOptions = { fxMode: 'evolution', baseYear: baseYear };
    
    // ARS to USD conversion: AR -> US
    // First get ARS to EUR, then EUR to USD
    // AR perEur = 1631.72, so 1 EUR = 1631.72 ARS
    // US perEur = 1.1, so 1 EUR = 1.1 USD
    // Therefore: 1 USD = 1631.72 / 1.1 = 1483.38 ARS (approximately)
    const testAmountARS = 3000000; // 3M ARS
    const convertedToUSD = econ.convert(testAmountARS, 'AR', 'US', baseYear, conversionOptions);
    
    if (!Number.isFinite(convertedToUSD) || convertedToUSD <= 0) {
      errors.push(`Currency conversion failed: ARS ${testAmountARS} -> USD`);
    }

    // Validate cash is at emergency stash level
    const cashTolerance = 10000;
    if (Math.abs(rowAge30.cash - 1000000) > cashTolerance) {
      errors.push(`Cash expected ~1M ARS, got ${rowAge30.cash}`);
    }

    // Validate sharesCapital - according to asset-plan.md section 3.2, capital should be 
    // tracked in the asset's baseCurrency (USD) for asset mode with contributionCurrencyMode 'asset'.
    // The capital is obtained via capsByKey['shares'] = shares.capital(), which should return USD.
    const sharesCapital = rowAge30.sharesCapital || 0;
    if (sharesCapital <= 0) {
      errors.push(`sharesCapital should be positive (in USD for asset mode), got ${sharesCapital}`);
    }

    // Key assertion: sharesCapital should be in USD (asset's baseCurrency), not ARS
    // USD amounts should be much smaller than ARS amounts (roughly 1/1500th)
    // Expected: approximately convertedToUSD (~2022 USD for ~3M ARS surplus)
    // If sharesCapital is in the millions, it's likely incorrectly in ARS instead of USD
    if (sharesCapital > 100000) {
      errors.push(`sharesCapital (${sharesCapital}) seems too large - might be in ARS instead of USD. Expected USD amount should be roughly ${convertedToUSD} based on FX conversion of ARS surplus`);
    }

    // Validate that sharesCapital is consistent with USD conversion
    // Allow wide tolerance due to tax calculations affecting the exact surplus invested
    // The actual invested amount will be less than 3M ARS due to taxes
    const expectedUSDMin = convertedToUSD * 0.3;  // At least 30% of expected (accounting for taxes reducing surplus)
    const expectedUSDMax = convertedToUSD * 2.0;  // At most 200% of expected (to account for tax/calculation variations)
    if (sharesCapital < expectedUSDMin || sharesCapital > expectedUSDMax) {
      errors.push(`sharesCapital (${sharesCapital} USD) outside expected range [${expectedUSDMin.toFixed(2)}, ${expectedUSDMax.toFixed(2)}] based on FX conversion. Expected roughly ${convertedToUSD.toFixed(2)} USD for ~3M ARS surplus`);
    }

    // Index funds should be 0 since allocation is 0%
    if (Math.abs((rowAge30.indexFundsCapital || 0)) > 100) {
      errors.push(`indexFundsCapital should be 0, got ${rowAge30.indexFundsCapital}`);
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};

// Export the test scenario
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestContributionCurrencyModeARAsset;
}
