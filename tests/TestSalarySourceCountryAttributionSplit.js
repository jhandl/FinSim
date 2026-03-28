const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');
const { getDisplayAmountByMeta } = require('./helpers/DisplayAttributionTestHelpers.js');
const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

function findRowByAge(rows, age) {
  return rows.find(row => row && typeof row === 'object' && Math.round(row.age) === age);
}

function sumForeignNonIncomeTaxForLabel(row, countryCode, label) {
  if (!row || !row.displayAttributions) return 0;
  const expected = String(countryCode || '').toLowerCase();
  return Object.keys(row.displayAttributions).reduce((total, columnKey) => {
    if (columnKey.indexOf('Tax__') !== 0 || columnKey === 'Tax__incomeTax') return total;
    return total + getDisplayAmountByMeta(row, columnKey, function (item) {
      return item.label === label && String(item.taxCountry || '').toLowerCase() === expected;
    });
  }, 0);
}

module.exports = {
  name: 'SalarySourceCountryAttributionSplit',
  description: 'Source-country salary taxes retain person split attribution (You / Your Partner).',
  isCustomTest: true,
  runCustomTest: async function () {
    const errors = [];
    const framework = new TestFramework();
    const scenario = {
      name: 'SalarySourceCountryAttributionSplit',
      description: 'IE salary overlap in AR residence keeps per-person source-country tax attributions',
      scenario: {
        parameters: {
          simulation_mode: 'couple',
          startingAge: 30,
          p2StartingAge: 30,
          targetAge: 41,
          retirementAge: 65,
          p2RetirementAge: 65,
          initialSavings: 0,
          initialPension: 0,
          initialPensionP2: 0,
          initialFunds: 0,
          initialShares: 0,
          emergencyStash: 0,
          inflation: 0,
          pensionPercentage: 0,
          pensionPercentageP2: 0,
          statePensionWeekly: 0,
          p2StatePensionWeekly: 0,
          growthRateFunds: 0,
          growthDevFunds: 0,
          growthRateShares: 0,
          growthDevShares: 0,
          growthRatePension: 0,
          growthDevPension: 0,
          StartCountry: 'ie',
          economy_mode: 'deterministic',
          relocationEnabled: true
        },
        events: [
          { type: 'SI', id: 'You', amount: 50000, fromAge: 30, toAge: 40, currency: 'EUR', rate: 0, match: 0 },
          { type: 'SI2np', id: 'Your Partner', amount: 25000, fromAge: 30, toAge: 40, currency: 'EUR', rate: 0, match: 0 },
          { type: 'MV', name: 'AR', id: 'Move_AR', amount: 0, fromAge: 40, toAge: 40, currency: 'EUR', rate: 0, match: 0 },
          { type: 'SI', id: 'Salary_AR', amount: 30000, fromAge: 40, toAge: 41, currency: 'ARS', linkedCountry: 'ar', rate: 0, match: 0 },
          { type: 'SI2np', id: 'Salary_AR_P2', amount: 15000, fromAge: 40, toAge: 41, currency: 'ARS', linkedCountry: 'ar', rate: 0, match: 0 }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenario)) {
      return { success: false, errors: ['Failed to load SalarySourceCountryAttributionSplit scenario'] };
    }

    installTestTaxRules(framework, {
      ie: deepClone(IE_RULES),
      ar: deepClone(AR_RULES)
    });

    const results = await framework.runSimulation();
    if (!results || !Array.isArray(results.dataSheet)) {
      return { success: false, errors: ['Simulation failed for SalarySourceCountryAttributionSplit'] };
    }

    const row40 = findRowByAge(results.dataSheet, 40);
    if (!row40) {
      return { success: false, errors: ['Missing age 40 row in SalarySourceCountryAttributionSplit'] };
    }

    if (!(getDisplayAmountByMeta(row40, 'Tax__incomeTax', function (item) {
      return item.label === 'You' && String(item.taxCountry || '').toLowerCase() === 'ie';
    }) > 0)) {
      errors.push('Expected tax:incomeTax:ie attribution for You at age 40');
    }
    if (!(getDisplayAmountByMeta(row40, 'Tax__incomeTax', function (item) {
      return item.label === 'Your Partner' && String(item.taxCountry || '').toLowerCase() === 'ie';
    }) > 0)) {
      errors.push('Expected tax:incomeTax:ie attribution for Your Partner at age 40');
    }

    if (!(sumForeignNonIncomeTaxForLabel(row40, 'ie', 'You') > 0)) {
      errors.push('Expected source-country non-income tax attribution for You at age 40');
    }
    if (!(sumForeignNonIncomeTaxForLabel(row40, 'ie', 'Your Partner') > 0)) {
      errors.push('Expected source-country non-income tax attribution for Your Partner at age 40');
    }

    return { success: errors.length === 0, errors };
  }
};
