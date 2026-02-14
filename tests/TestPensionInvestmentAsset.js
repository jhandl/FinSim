const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');

// Helper for floating point comparisons
function approxEqual(a, b, tolerance = 0.0001) {
  return Math.abs(a - b) <= tolerance;
}

// Helper to build default parameters
function buildParams(overrides) {
  const base = {
    startingAge: 30,
    targetAge: 31,
    retirementAge: 65,
    initialSavings: 100000, // Safe default to prevent bankruptcy
    initialPension: 0,
    emergencyStash: 0,
    inflation: 0,
    growthRatePension: 0,
    growthDevPension: 0,
    StartCountry: 'ie',
    simulation_mode: 'single',
    economy_mode: 'deterministic',
    priorityCash: 1,
    priorityPension: 4,
    priorityFunds: 2,
    priorityShares: 3,
    // Ensure no automatic investments by default
    investmentAllocationsByCountry: { ie: { indexFunds_ie: 0, shares_ie: 0 } },
    pensionContributionsByCountry: { ie: { p1Pct: 0, capped: 'No' } }
  };
  return Object.assign(base, overrides || {});
}

// Helper to run a simulation
async function runScenario(parameters, events, extraRules = {}) {
  const framework = new TestFramework();
  const scenarioDefinition = {
    name: 'PensionAssetTest',
    description: 'Pension asset behavior validation',
    scenario: {
      parameters: parameters,
      events: events || []
    },
    assertions: []
  };

  if (!framework.loadScenario(scenarioDefinition)) {
    return { framework, results: null, error: 'Failed to load scenario', internalErrors: [] };
  }

  // Install IE rules plus any extras
  const rules = { ie: deepClone(IE_RULES) };
  Object.assign(rules, extraRules);
  
  installTestTaxRules(framework, rules);

  const results = await framework.runSimulation();
  
  // Capture any errors from the framework execution
  const internalErrors = (framework.currentTest && framework.currentTest.errors) ? framework.currentTest.errors : [];
  
  return { framework, results, error: null, internalErrors };
}

module.exports = {
  name: 'TestPensionInvestmentAsset',
  description: 'Validates pension asset behaviors including lump sums, drawdowns, rebalancing, and multi-country pots.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // -------------------------------------------------------------------------
    // Test 1: Lump Sum Withdrawal
    // -------------------------------------------------------------------------
    try {
      // Case 1A: Before retirement (Age 59)
      {
        const params = buildParams({
          startingAge: 58,
          targetAge: 59,
          retirementAge: 60,
          initialPension: 100000,
          growthRatePension: 0
        });
        
        const { framework, results, internalErrors } = await runScenario(params, []);
        if (!results || !results.success) {
          errors.push(`Test 1A: Simulation failed. Errors: ${internalErrors.join('; ')}`);
        } else {
          const state = vm.runInContext(`(function() {
            return {
              taken: person1.pensions.ie.lumpSumTaken,
              capital: person1.pensions.ie.capital()
            };
          })()`, framework.simulationContext);
          
          if (state.taken !== false) errors.push('Test 1A: Lump sum taken before retirement age');
          if (!approxEqual(state.capital, 100000)) errors.push(`Test 1A: Capital unexpected ${state.capital}`);
        }
      }

      // Case 1B: After retirement (Age 61)
      {
        const params = buildParams({
          startingAge: 59,
          targetAge: 61,
          retirementAge: 60,
          initialPension: 100000,
          growthRatePension: 0
        });

        const { framework, results, internalErrors } = await runScenario(params, []);
        if (!results || !results.success) {
           errors.push(`Test 1B: Simulation failed. Errors: ${internalErrors.join('; ')}`);
        } else {
          const state = vm.runInContext(`(function() {
            return {
              taken: person1.pensions.ie.lumpSumTaken,
              capital: person1.pensions.ie.capital()
            };
          })()`, framework.simulationContext);

          if (state.taken !== true) errors.push('Test 1B: Lump sum NOT taken after retirement');
          
          // Age 60: 100k -> 75k. Drawdown 4% (3000) -> 72000.
          // Age 61: Drawdown 4% (2880) -> 69120.
          if (!approxEqual(state.capital, 69120, 1.0)) {
             errors.push(`Test 1B: Capital unexpected ${state.capital} (expected ~69120)`);
          }
        }
      }

    } catch (e) {
      errors.push(`Test 1 Exception: ${e.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 2: Minimum Drawdown Rates by Age
    // -------------------------------------------------------------------------
    try {
      const params = buildParams({
        startingAge: 60, // Start retired
        targetAge: 75,
        retirementAge: 60,
        initialPension: 100000, 
        growthRatePension: 0
      });

      const { framework, results, internalErrors } = await runScenario(params, []);
      if (!results || !results.success) {
         errors.push(`Test 2: Simulation failed. Errors: ${internalErrors.join('; ')}`);
      } else {
        const getRow = (age) => results.dataSheet ? results.dataSheet.find(r => r && r.age === age) : null;

        // Age 62 check (Band 61+: 4%)
        const row62 = getRow(62);
        if (row62) {
            const income62 = row62.incomePrivatePension || 0;
            const cap62 = row62.pensionFund || 0; // Use pensionFund (total capital)
            // Rate = Income / (EndCap + Income).
            const impliedRate62 = income62 / (cap62 + income62);
            
            if (!approxEqual(impliedRate62, 0.04, 0.001)) {
               errors.push(`Test 2: Drawdown rate at 62 expected 0.04, got ${impliedRate62.toFixed(4)} (Inc: ${income62}, Cap: ${cap62})`);
            }
        } else {
            errors.push('Test 2: Row 62 missing');
        }

        // Age 72 check (Band 71+: 5%)
        const row72 = getRow(72);
        if (row72) {
            const income72 = row72.incomePrivatePension || 0;
            const cap72 = row72.pensionFund || 0;
            const impliedRate72 = income72 / (cap72 + income72);

            if (!approxEqual(impliedRate72, 0.05, 0.001)) {
               errors.push(`Test 2: Drawdown rate at 72 expected 0.05, got ${impliedRate72.toFixed(4)} (Inc: ${income72}, Cap: ${cap72})`);
            }
        } else {
            errors.push('Test 2: Row 72 missing');
        }
      }

    } catch (e) {
      errors.push(`Test 2 Exception: ${e.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 3: Tax-Advantaged Rebalancing
    // -------------------------------------------------------------------------
    try {
      const params = buildParams({
        startingAge: 30,
        targetAge: 31,
        initialPension: 0,
        MixConfig_ie_pensionP1_type: 'fixed',
        MixConfig_ie_pensionP1_asset1: 'globalEquity',
        MixConfig_ie_pensionP1_asset2: 'globalBonds',
        MixConfig_ie_pensionP1_startAsset1Pct: 60,
        MixConfig_ie_pensionP1_endAsset1Pct: 60,
        pensionContributionsByCountry: { ie: { p1Pct: 0.1, capped: 'No' } }
      });
      
      const events = [
         { type: 'SI', id: 'Salary', amount: 100000, fromAge: 30, toAge: 30 }
      ];

      const { framework, results, internalErrors } = await runScenario(params, events);
      if (!results || !results.success) {
         errors.push(`Test 3: Simulation failed. Success=${results?.success}, FailedAt=${results?.failedAt}, Rows=${results?.dataSheet?.length}, Errors: ${internalErrors.join('; ')}`);
      } else {
        const check = vm.runInContext(`(function() {
          const pot = person1.pensions.ie;
          return {
             yearlySold: pot.yearlySold,
             revenuePrivatePension: revenue.privatePensionP1
          };
        })()`, framework.simulationContext);

        // Just sanity check simulation ran
        if (typeof check.yearlySold !== 'number') errors.push('Test 3: Could not inspect yearlySold');
        if (check.revenuePrivatePension !== 0) errors.push(`Test 3: Expected 0 taxable pension revenue during growth rebalancing, got ${check.revenuePrivatePension}`);
      }
      
      // Retry Test 3 with Drift
      {
         const paramsDrift = buildParams({
            startingAge: 30,
            targetAge: 32,
            initialPension: 100000, 
            MixConfig_ie_pensionP1_type: 'fixed',
            MixConfig_ie_pensionP1_asset1: 'globalEquity',
            MixConfig_ie_pensionP1_asset2: 'globalBonds',
            MixConfig_ie_pensionP1_startAsset1Pct: 50,
            MixConfig_ie_pensionP1_endAsset1Pct: 50,
            // Extreme drift: 100% growth vs 0% (GlobalAsset params are PERCENTAGES)
            GlobalAssetGrowth_globalEquity: 100,
            GlobalAssetGrowth_globalBonds: 0,
            GlobalAssetVolatility_globalEquity: 0,
            GlobalAssetVolatility_globalBonds: 0,
            pensionContributionsByCountry: { ie: { p1Pct: 0.1, capped: 'No' } }
         });
         
         const eventsDrift = [
            { type: 'SI', id: 'DummySal', amount: 10000, fromAge: 30, toAge: 32 }
         ];
         
         const { framework: frameworkDrift, results: resultsDrift, internalErrors: internalErrorsDrift } = await runScenario(paramsDrift, eventsDrift);
         if (!resultsDrift || !resultsDrift.success) {
            errors.push(`Test 3 Drift: Simulation failed. Success=${resultsDrift?.success}, FailedAt=${resultsDrift?.failedAt}, Errors: ${internalErrorsDrift.join('; ')}`);
         } else {
            const check = vm.runInContext(`(function() {
               return {
                  yearlySold: person1.pensions.ie.yearlySold,
                  incomeDetected: person1.yearlyIncomePrivatePension,
                  revenuePrivatePension: revenue.privatePensionP1
               };
            })()`, frameworkDrift.simulationContext);
            
            if (check.yearlySold <= 0) errors.push('Test 3: Expected rebalancing sales due to drift');
            if (check.incomeDetected > 0) errors.push('Test 3: Taxable income detected during rebalancing (leak)');
            if (check.revenuePrivatePension !== 0) errors.push(`Test 3 Drift: Expected 0 taxable pension revenue during growth rebalancing, got ${check.revenuePrivatePension}`);
         }
      }

    } catch (e) {
      errors.push(`Test 3 Exception: ${e.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 4: Per-Country Pension Pots & Currency/Country Tracking
    // -------------------------------------------------------------------------
    try {
       const extraRules = {
          us: {
             country: 'US',
             countryName: 'United States',
             currencyCode: 'USD',
             locale: { numberLocale: 'en-US', currencyCode: 'USD', currencySymbol: '$' },
             incomeTax: { name: 'FIT', personalAllowance: 0, taxCredits: {}, bracketsByStatus: { single: { '0': 0.1 } } },
             socialContributions: [],
             additionalTaxes: [],
             capitalGainsTax: { rate: 0.15, annualExemption: 0 },
             pensionRules: { 
                minRetirementAgePrivate: 60,
                contributionLimits: { ageBandsPercent: { '0': 1.0 }, annualCap: 999999 },
                lumpSumMaxPercent: 0,
                minDrawdownRates: { '0': 0 }
             },
             residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
             investmentTypes: [
                {
                   key: 'indexFunds_us',
                   label: 'Index Funds',
                   baseRef: 'globalEquity',
                   baseCurrency: 'USD',
                   assetCountry: 'us',
                   residenceScope: 'local',
                   taxation: { exitTax: { rate: 0.15, deemedDisposalYears: 8, allowLossOffset: false, eligibleForAnnualExemption: false } }
                },
                {
                   key: 'shares_us',
                   label: 'Shares',
                   baseCurrency: 'USD',
                   assetCountry: 'us',
                   residenceScope: 'local',
                   taxation: { capitalGains: { rateRef: 'capitalGainsTax.rate', annualExemptionRef: 'capitalGainsTax.annualExemption', allowLossOffset: true } }
                }
             ],
             pinnedIncomeTypes: [],
             economicData: {
                inflation: { cpi: 1.02, year: 2025 },
                purchasingPowerParity: { value: 1.0, year: 2025 },
                exchangeRate: { perEur: 1.1, asOf: '2025-01-01' }
             }
          }
       };
       
       const params = buildParams({
          startingAge: 30,
          targetAge: 35,
          StartCountry: 'ie',
          fxMode: 'constant' // Simplify FX for test
       });
       
       const events = [
          { type: 'SI', id: 'SalIE', amount: 50000, fromAge: 30, toAge: 30, country: 'ie' },
         { type: 'MV', name: 'US', id: 'MoveUS', fromAge: 31, country: 'us' },
          { type: 'SI', id: 'SalUS', amount: 50000, fromAge: 32, toAge: 32, country: 'us', linkedCountry: 'us', currency: 'USD' }
       ];
       
       params.pensionContributionsByCountry = {
          ie: { p1Pct: 0.1, capped: 'No' },
          us: { p1Pct: 0.1, capped: 'No' }
       };
       
       const { framework, results, internalErrors } = await runScenario(params, events, extraRules);
       if (!results || !results.success) {
          errors.push(`Test 4: Simulation failed. Success=${results?.success}, FailedAt=${results?.failedAt}, Rows=${results?.dataSheet?.length}, Errors: ${internalErrors.join('; ')}`);
       } else {
          const state = vm.runInContext(`(function() {
             const pie = person1.pensions.ie;
             const pus = person1.pensions.us;
             return {
                ieExists: !!pie,
                usExists: !!pus,
                ieCap: pie ? pie.capital() : 0,
                usCap: pus ? pus.capital() : 0,
                ieCurrency: pie ? pie._getBaseCurrency() : null,
                ieCountry: pie ? pie._getAssetCountry() : null,
                usCurrency: pus ? pus._getBaseCurrency() : null,
                usCountry: pus ? pus._getAssetCountry() : null
             };
          })()`, framework.simulationContext);
          
          if (!state.ieExists) errors.push('Test 4: IE pension pot missing');
          if (!state.usExists) errors.push('Test 4: US pension pot missing');
          if (state.ieCap <= 0) errors.push('Test 4: IE pension capital should be > 0');
          if (state.usCap <= 0) errors.push('Test 4: US pension capital should be > 0');
          
          if (state.ieCurrency !== 'EUR') errors.push(`Test 4: IE Currency wrong: ${state.ieCurrency}`);
          if (state.ieCountry !== 'ie') errors.push(`Test 4: IE Country wrong: ${state.ieCountry}`);
          if (state.usCurrency !== 'USD') errors.push(`Test 4: US Currency wrong: ${state.usCurrency}`);
          if (state.usCountry !== 'us') errors.push(`Test 4: US Country wrong: ${state.usCountry}`);
       }

    } catch (e) {
      errors.push(`Test 4 Exception: ${e.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 5: Withdrawal Age Eligibility & Mix Config Resolution
    // -------------------------------------------------------------------------
    try {
       // Scenario: Mix config application + canWithdrawAtAge check
       const params = buildParams({
          startingAge: 50,
          targetAge: 51,
          retirementAge: 65,
          initialPension: 50000,
          // Mix config
          MixConfig_ie_pensionP1_type: 'fixed',
          MixConfig_ie_pensionP1_asset1: 'globalEquity',
          MixConfig_ie_pensionP1_asset2: 'globalBonds',
          MixConfig_ie_pensionP1_startAsset1Pct: 70
       });
       
       const { framework, results, internalErrors } = await runScenario(params, []);
       if (!results || !results.success) {
          errors.push(`Test 5: Simulation failed. Errors: ${internalErrors.join('; ')}`);
       } else {
          const check = vm.runInContext(`(function() {
             const pot = person1.pensions.ie;
             return {
                canWithdraw59: pot.canWithdrawAtAge(59),
                canWithdraw60: pot.canWithdrawAtAge(60), // IE min is 60
                canWithdraw65: pot.canWithdrawAtAge(65),
                mixType: pot.mixConfig ? pot.mixConfig.type : null,
                mixAsset1: pot.mixConfig ? pot.mixConfig.asset1 : null
             };
          })()`, framework.simulationContext);
          
          // Check Eligibility (IE default minRetirementAgePrivate is 60)
          if (check.canWithdraw59 !== false) errors.push('Test 5: Should not withdraw at 59');
          if (check.canWithdraw60 !== true) errors.push('Test 5: Should withdraw at 60');
          if (check.canWithdraw65 !== true) errors.push('Test 5: Should withdraw at 65');
          
          // Check Mix Config
          if (check.mixType !== 'fixed') errors.push('Test 5: Mix config type mismatch');
          if (check.mixAsset1 !== 'globalEquity') errors.push('Test 5: Mix config asset mismatch');
       }

    } catch (e) {
      errors.push(`Test 5 Exception: ${e.message}`);
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};