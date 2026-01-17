// Test for implicit currency conversion: AR Mixed Portfolio
// Validates that both currency match and currency mismatch scenarios can operate simultaneously
//
// Test: AR Single-Country (Mixed Portfolio - Matching + Mismatching Currencies)
// AR scenario with both local ARS fund (ARS base = ARS residence, no conversion) and global USD ETF (USD base ≠ ARS residence, conversion).
// Ensures both implicit conversion behaviors work correctly in the same portfolio.

const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
const { installTestTaxRules } = require('./helpers/RelocationTestHelpers.js');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

const TestContributionCurrencyModeARMixed = {
  name: "Contribution Currency Mode - AR Mixed Portfolio",
  description: "Validates that both currency match (ARS fund) and currency mismatch (USD ETF) scenarios can operate simultaneously in an AR portfolio using implicit conversion logic.",
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
    // Split 50/50: 1.5M ARS to funds (ARS base = ARS residence, stays ARS), 1.5M ARS to shares (USD base ≠ ARS residence, converts to USD)
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

    // Validate indexFundsCapital is in ARS (base currency matches residence - no conversion)
    const capsByKey = rowAge30.investmentCapitalByKey || {};
    const sumByPrefix = (baseKey) => {
      let total = 0;
      for (const k in capsByKey) {
        if (k === baseKey || (baseKey && k.indexOf(baseKey + '_') === 0)) total += capsByKey[k] || 0;
      }
      return total;
    };
    const indexFundsCapital = sumByPrefix('indexFunds');
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

    // Validate sharesCapital - after Phase 1 refactor, capital() now consistently returns
    // residence currency. For Argentina residents, this means ARS, not USD.
    const sharesCapital = sumByPrefix('shares');
    if (sharesCapital <= 0) {
      errors.push(`sharesCapital should be positive (in ARS residence currency), got ${sharesCapital}`);
    }

    // Shares capital should be in ARS (similar magnitude to indexFundsCapital)
    if (sharesCapital < 100000) {
      errors.push(`sharesCapital (${sharesCapital}) seems too small - should be in ARS (hundreds of thousands range). Expected ARS amount should be roughly ${testAmountARS}`);
    }

    // Validate that sharesCapital is consistent with ARS surplus (half of total, ~1.5M ARS)
    const expectedSharesARSMin = testAmountARS * 0.3;  // At least 30% of expected
    const expectedSharesARSMax = testAmountARS * 2.0;   // At most 200% of expected
    if (sharesCapital < expectedSharesARSMin || sharesCapital > expectedSharesARSMax) {
      errors.push(`sharesCapital (${sharesCapital} ARS) outside expected range [${expectedSharesARSMin}, ${expectedSharesARSMax}]`);
    }

    // Key assertion: Both capitals should be in ARS (residence currency)
    // With 50/50 allocation, they should be in similar magnitude (accounting for tax effects)
    // Expect ratio between 0.2 and 5.0 to allow for allocation differences and tax effects
    const ratio = indexFundsCapital / sharesCapital;
    if (ratio < 0.2 || ratio > 5.0) {
      errors.push(`indexFundsCapital (${indexFundsCapital} ARS) / sharesCapital (${sharesCapital} ARS) ratio (${ratio.toFixed(2)}) outside expected range [0.2, 5.0] - both should be in ARS with similar magnitudes`);
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
