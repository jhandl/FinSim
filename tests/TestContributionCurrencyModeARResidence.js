// Test for implicit currency conversion: AR Residence Currency Match
// Validates that contributions in ARS stay in ARS when base currency matches residence currency
//
// Test: AR Single-Country (No Conversion - ARS to ARS)
// AR local equity fund uses ARS base currency matching ARS residence currency.
// Contributions in ARS should be reflected directly in the fund's capital without conversion.

const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules } = require('./helpers/RelocationTestHelpers.js');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

const TestContributionCurrencyModeARResidence = {
  name: "Contribution Currency Mode - AR Residence",
  description: "Validates that contributions in ARS stay in ARS for local AR equity fund when base currency matches residence currency. No cross-currency conversion should occur.",
  isCustomTest: true,

  async runCustomTest() {
    const errors = [];
    const framework = new TestFramework();
    framework.setVerbose(false);

    // Initialize simulation context by loading core modules
    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    // Install AR tax ruleset
    installTestTaxRules(framework, { ar: AR_RULES });

    const scenarioDefinition = {
      name: 'AR Residence Mode Test',
      description: 'AR StartCountry with 100% allocation to local ARS fund',
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
          FundsAllocation: 1.0,      // 100% allocation to indexFunds (Local AR Equity Fund)
          SharesAllocation: 0.0,      // 0% allocation to shares
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
          personalTaxCredit: 0,       // AR has no personal tax credit in test config
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

    // Validate cash is at emergency stash level (1M ARS)
    const cashTolerance = 10000;
    if (Math.abs(rowAge30.cash - 1000000) > cashTolerance) {
      errors.push(`Cash expected ~1M ARS, got ${rowAge30.cash}`);
    }

    // Local AR equity fund (merval) should have capital in ARS
    // Initial savings 2M + net income surplus invested (less emergency stash 1M)
    // Net income after tax: ~5M - 3M - taxes = ~2M (roughly)
    // Surplus to invest: 2M (initial) + ~2M (surplus) - 1M (emergency) = ~3M ARS
    // Since base currency (ARS) matches residence currency (ARS), this should stay as ARS without conversion
    const capsByKey = rowAge30.investmentCapitalByKey || {};
    let mervalCapital = 0;
    for (const k in capsByKey) {
      if (k === 'merval' || k.indexOf('merval_') === 0) mervalCapital += capsByKey[k] || 0;
    }
    if (mervalCapital <= 0) {
      errors.push(`mervalCapital should be positive (in ARS), got ${mervalCapital}`);
    }

    // Expected: approximately 3M ARS, but actual depends on tax calculations
    const expectedARSMin = 1000000;  // At least 1M ARS
    const expectedARSMax = 5000000;   // At most 5M ARS (accounting for variations)
    if (mervalCapital < expectedARSMin || mervalCapital > expectedARSMax) {
      errors.push(`mervalCapital (${mervalCapital} ARS) outside expected range [${expectedARSMin}, ${expectedARSMax}]`);
    }

    // CEDEARs should remain at 0 since allocation is 0%
    let cedearCapital = 0;
    for (const k in capsByKey) {
      if (k === 'cedear' || k.indexOf('cedear_') === 0) cedearCapital += capsByKey[k] || 0;
    }
    if (Math.abs(cedearCapital) > 100) {
      errors.push(`cedearCapital should be 0, got ${cedearCapital}`);
    }

    // Key assertion: indexFundsCapital should be in ARS (same order of magnitude as ARS amounts)
    // If it were incorrectly converted to USD, it would be much smaller (roughly 1/1500th)
    if (mervalCapital < 100000) {
      errors.push(`mervalCapital (${mervalCapital}) seems too small - might be incorrectly converted to USD instead of staying in ARS`);
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};

// Export the test scenario
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestContributionCurrencyModeARResidence;
}











