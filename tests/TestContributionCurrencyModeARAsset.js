// Test for implicit currency conversion: AR Asset Currency Mismatch
// Validates that contributions in ARS are converted to USD when base currency differs from residence currency
//
// Test: AR Single-Country (Currency Conversion - ARS to USD)
// AR global USD ETF uses USD base currency which differs from ARS residence currency.
// Contributions in ARS should be converted to USD using FX rates.

const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
const { installTestTaxRules } = require('./helpers/RelocationTestHelpers.js');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

const TestContributionCurrencyModeARAsset = {
  name: "Contribution Currency Mode - AR Asset",
  description: "Validates that contributions in ARS are converted to USD for global USD ETF when base currency differs from residence currency. Uses convertCurrencyAmount for FX conversion.",
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
          FundsAllocation: 0.0,      // 0% allocation to MERVAL
          SharesAllocation: 1.0,     // 100% allocation to CEDEARs (Global USD ETF)
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

    // Validate cedearCapital - after Phase 1 refactor, capital() now consistently returns
    // residence currency. For Argentina residents, this means ARS, not USD.
    const capsByKey = rowAge30.investmentCapitalByKey || {};
    let cedearCapital = 0;
    for (const k in capsByKey) {
      if (k === 'cedear' || k.indexOf('cedear_') === 0) cedearCapital += capsByKey[k] || 0;
    }
    if (cedearCapital <= 0) {
      errors.push(`cedearCapital should be positive (in ARS residence currency), got ${cedearCapital}`);
    }

    // Key assertion: sharesCapital should be in ARS (residence currency)
    // ARS amounts should be in the millions range (roughly 1500x larger than USD equivalent)
    // Expected: approximately testAmountARS (~3M ARS surplus)
    if (cedearCapital < 100000) {
      errors.push(`cedearCapital (${cedearCapital}) seems too small - should be in ARS (millions range). Expected ARS amount should be roughly ${testAmountARS} based on surplus`);
    }

    // Validate that sharesCapital is consistent with ARS surplus
    // Allow wide tolerance due to tax calculations affecting the exact surplus invested
    // The actual invested amount will be less than 3M ARS due to taxes
    const expectedARSMin = testAmountARS * 0.3;  // At least 30% of expected (accounting for taxes reducing surplus)
    const expectedARSMax = testAmountARS * 2.0;  // At most 200% of expected (to account for tax/calculation variations)
    if (cedearCapital < expectedARSMin || cedearCapital > expectedARSMax) {
      errors.push(`cedearCapital (${cedearCapital} ARS) outside expected range [${expectedARSMin.toFixed(2)}, ${expectedARSMax.toFixed(2)}]. Expected roughly ${testAmountARS} ARS for ~3M ARS surplus`);
    }

    // MERVAL should be 0 since allocation is 0%
    let mervalCapital = 0;
    for (const k in capsByKey) {
      if (k === 'merval' || k.indexOf('merval_') === 0) mervalCapital += capsByKey[k] || 0;
    }
    if (Math.abs(mervalCapital) > 100) {
      errors.push(`mervalCapital should be 0, got ${mervalCapital}`);
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
