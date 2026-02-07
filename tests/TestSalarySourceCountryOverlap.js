const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');
const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

function findRowByAge(rows, age) {
  return rows.find(row => row && typeof row === 'object' && Math.round(row.age) === age);
}

function buildEuroARRules() {
  const clone = deepClone(AR_RULES);
  if (!clone.locale) clone.locale = {};
  clone.locale.currencyCode = 'EUR';
  clone.locale.currencySymbol = '€';
  return clone;
}

function sumBreakdown(breakdown) {
  if (!breakdown || typeof breakdown !== 'object') return 0;
  let total = 0;
  const keys = Object.keys(breakdown);
  for (let i = 0; i < keys.length; i++) {
    const value = breakdown[keys[i]];
    if (typeof value === 'number') total += value;
  }
  return total;
}

module.exports = {
  name: 'SalarySourceCountryOverlap',
  description: 'Boundary-year salary without explicit linkedCountry still records source-country salary tax.',
  isCustomTest: true,
  runCustomTest: async function () {
    const errors = [];
    const framework = new TestFramework();
    const scenario = {
      name: 'SalarySourceCountryOverlap',
      description: 'IE salary overlap year after relocation should still create incomeTax:ie',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 41,
          retirementAge: 65,
          initialSavings: 0,
          initialPension: 0,
          initialFunds: 0,
          initialShares: 0,
          emergencyStash: 0,
          FundsAllocation: 0,
          SharesAllocation: 0,
          pensionPercentage: 0,
          statePensionWeekly: 0,
          inflation: 0,
          growthRateFunds: 0,
          growthDevFunds: 0,
          growthRateShares: 0,
          growthDevShares: 0,
          growthRatePension: 0,
          growthDevPension: 0,
          StartCountry: 'ie',
          simulation_mode: 'single',
          economyMode: 'deterministic',
          relocationEnabled: true
        },
        events: [
          { type: 'SI', id: 'Salary_IE', amount: 40000, fromAge: 30, toAge: 40, currency: 'EUR', rate: 0 },
          { type: 'MV-ar', id: 'Move_AR', amount: 0, fromAge: 40, toAge: 40, currency: 'EUR', rate: 0 },
          { type: 'SI', id: 'Salary_AR', amount: 30000, fromAge: 40, toAge: 41, currency: 'EUR', linkedCountry: 'ar', rate: 0 }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenario)) {
      return { success: false, errors: ['Failed to load SalarySourceCountryOverlap scenario'] };
    }

    installTestTaxRules(framework, {
      ie: deepClone(IE_RULES),
      ar: buildEuroARRules()
    });

    const results = await framework.runSimulation();
    if (!results || !results.success || !Array.isArray(results.dataSheet)) {
      return { success: false, errors: ['Simulation failed for SalarySourceCountryOverlap'] };
    }

    const row40 = findRowByAge(results.dataSheet, 40);
    if (!row40) {
      return { success: false, errors: ['Missing age 40 row in SalarySourceCountryOverlap'] };
    }

    const attrs = row40.attributions || {};
    const ieIncomeTaxBreakdown = attrs['tax:incomeTax:ie'];
    const ieIncomeTaxTotal = sumBreakdown(ieIncomeTaxBreakdown);
    if (!(ieIncomeTaxTotal > 0)) {
      errors.push('Expected positive age-40 tax:incomeTax:ie from overlap IE salary source');
    }

    return { success: errors.length === 0, errors };
  }
};
