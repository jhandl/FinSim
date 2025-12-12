// Test for contributionCurrencyMode functionality: AR Mixed Portfolio
// Validates that both residence and asset modes can operate simultaneously
//
// Test: AR Single-Country (Mixed Portfolio - Residence + Asset Modes)
// AR scenario with both local ARS fund (residence mode) and global USD ETF (asset mode).
// Ensures both modes work correctly in the same portfolio.

const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
const { installTestTaxRules } = require('./helpers/RelocationTestHelpers.js');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

const TestContributionCurrencyModeARMixed = {
  name: "Contribution Currency Mode - AR Mixed Portfolio",
  description: "Validates that both residence mode (ARS fund) and asset mode (USD ETF) can operate simultaneously in an AR portfolio.",
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

    // Define scenario with 50/50 split
    const scenarioDefinition = {
      name: 'AR Mixed Portfolio Test',
      description: 'AR StartCountry with 50% local ARS fund and 50% global USD ETF',
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
          FundsAllocation: 0.5,      // 50% allocation to indexFunds (Local AR Equity Fund - residence mode)
          SharesAllocation: 0.5,      // 50% allocation to shares (Global USD ETF - asset mode)
          pensionPercentage: 0,
          pensionCapped: "No",
          growthRateFunds: 0,        // Zero growth to simplify validation
          growthDevFunds: 0,
          growthRateShares: 0,
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

    // Get simulation context
    const ctx = framework.simulationContext;
    function evalInSim(expr) {
      return vm.runInContext(expr, ctx);
    }

    // Calculate expected amounts
    // Net income after tax: ~5M ARS - 3M ARS - taxes = ~2M ARS (roughly)
    // Surplus to invest: 2M (initial) + ~2M (surplus) - 1M (emergency) = ~3M ARS
    // Split 50/50: 1.5M ARS to funds (residence mode, stays ARS), 1.5M ARS to shares (asset mode, converts to USD)
    const baseYear = rowAge30.year;
    const conversionOptions = { fxMode: 'evolution', baseYear: baseYear };
    
    const testAmountARS = 1500000; // 1.5M ARS (half of surplus)
    const convertedToUSD = econ.convert(testAmountARS, 'AR', 'US', baseYear, conversionOptions);
    
    if (!Number.isFinite(convertedToUSD) || convertedToUSD <= 0) {
      errors.push(`Currency conversion failed: ARS ${testAmountARS} -> USD`);
    }

    // Validate cash is at emergency stash level
    const cashTolerance = 10000;
    if (Math.abs(rowAge30.cash - 1000000) > cashTolerance) {
      errors.push(`Cash expected ~1M ARS, got ${rowAge30.cash}`);
    }

    // Validate indexFundsCapital is in ARS (residence mode - no conversion)
    const indexFundsCapital = rowAge30.indexFundsCapital || 0;
    if (indexFundsCapital <= 0) {
      errors.push(`indexFundsCapital should be positive (in ARS), got ${indexFundsCapital}`);
    }

    // Index funds capital should be in ARS (same order of magnitude as ARS amounts)
    // Expected: approximately 1.5M ARS (half of surplus), but actual depends on tax calculations
    const expectedARSMin = testAmountARS * 0.3;  // At least 30% of expected (accounting for taxes)
    const expectedARSMax = testAmountARS * 2.0;  // At most 200% of expected
    if (indexFundsCapital < expectedARSMin || indexFundsCapital > expectedARSMax) {
      errors.push(`indexFundsCapital (${indexFundsCapital} ARS) outside expected range [${expectedARSMin}, ${expectedARSMax}]`);
    }

    // Validate sharesCapital is in USD (asset mode - converted from ARS)
    const sharesCapital = rowAge30.sharesCapital || 0;
    if (sharesCapital <= 0) {
      errors.push(`sharesCapital should be positive (in USD), got ${sharesCapital}`);
    }

    // Shares capital should be in USD (much smaller than ARS amounts)
    if (sharesCapital > 100000) {
      errors.push(`sharesCapital (${sharesCapital}) seems too large - might be in ARS instead of USD. Expected USD amount should be roughly ${convertedToUSD}`);
    }

    // Validate that sharesCapital is consistent with USD conversion
    const expectedUSDMin = convertedToUSD * 0.3;  // At least 30% of expected
    const expectedUSDMax = convertedToUSD * 2.0;   // At most 200% of expected
    if (sharesCapital < expectedUSDMin || sharesCapital > expectedUSDMax) {
      errors.push(`sharesCapital (${sharesCapital} USD) outside expected range [${expectedUSDMin}, ${expectedUSDMax}] based on FX conversion`);
    }

    // Key assertion: indexFundsCapital should be much larger than sharesCapital
    // (because ARS amounts are much larger than USD amounts)
    // Roughly: 1 ARS ≈ 0.00067 USD, so 1M ARS ≈ 670 USD
    // Therefore indexFundsCapital (in ARS) should be roughly 1500x larger than sharesCapital (in USD)
    const ratio = indexFundsCapital / sharesCapital;
    if (ratio < 100) {
      errors.push(`indexFundsCapital (${indexFundsCapital} ARS) / sharesCapital (${sharesCapital} USD) ratio (${ratio}) too low - suggests currency mismatch`);
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};

// Export the test scenario
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestContributionCurrencyModeARMixed;
}
