const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');
const { getDisplayAmountByMeta } = require('./helpers/DisplayAttributionTestHelpers.js');
const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

function findRowByAge(rows, age) {
  return rows.find(row => row && typeof row === 'object' && Math.round(row.age) === age);
}

function sumForeignNonIncomeTax(row, countryCode) {
  if (!row || !row.displayAttributions) return 0;
  const expected = String(countryCode || '').toLowerCase();
  return Object.keys(row.displayAttributions).reduce((total, columnKey) => {
    if (columnKey.indexOf('Tax__') !== 0 || columnKey === 'Tax__incomeTax') return total;
    return total + getDisplayAmountByMeta(row, columnKey, (item) => {
      return String(item.taxCountry || '').toLowerCase() === expected;
    });
  }, 0);
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
          { type: 'MV', name: 'AR', id: 'Move_AR', amount: 0, fromAge: 40, toAge: 40, currency: 'EUR', rate: 0 },
          { type: 'SI', id: 'Salary_AR', amount: 30000, fromAge: 40, toAge: 41, currency: 'ARS', linkedCountry: 'ar', rate: 0 }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenario)) {
      return { success: false, errors: ['Failed to load SalarySourceCountryOverlap scenario'] };
    }

    installTestTaxRules(framework, {
      ie: deepClone(IE_RULES),
      ar: deepClone(AR_RULES)
    });

    const results = await framework.runSimulation();
    if (!results || !results.success || !Array.isArray(results.dataSheet)) {
      return { success: false, errors: ['Simulation failed for SalarySourceCountryOverlap'] };
    }

    const row40 = findRowByAge(results.dataSheet, 40);
    if (!row40) {
      return { success: false, errors: ['Missing age 40 row in SalarySourceCountryOverlap'] };
    }

    const ieIncomeTaxTotal = getDisplayAmountByMeta(row40, 'Tax__incomeTax', (item) => {
      return String(item.taxCountry || '').toLowerCase() === 'ie';
    });
    if (!(ieIncomeTaxTotal > 0)) {
      errors.push('Expected positive age-40 tax:incomeTax:ie from overlap IE salary source');
    }

    const ieNonIncomeTaxTotal = sumForeignNonIncomeTax(row40, 'ie');
    if (!(ieNonIncomeTaxTotal > 0)) {
      errors.push('Expected positive age-40 non-income tax display attribution from overlap IE salary source');
    }

    return { success: errors.length === 0, errors };
  }
};
