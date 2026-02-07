const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const RENTAL_RULES = {
  ie: {
    version: 'test-rental-1',
    country: 'IE',
    countryName: 'Ireland',
    taxBasis: 'worldwide',
    treatyEquivalents: {
      incomeTax: 'income',
      capitalGains: 'capitalGains',
      dividends: 'dividends'
    },
    locale: { currencyCode: 'EUR', currencySymbol: '€' },
    economicData: {
      inflation: { cpi: 0, year: 2025 },
      purchasingPowerParity: { value: 1, year: 2025 },
      exchangeRate: { perEur: 1, asOf: '2025-01-01' }
    },
    incomeTax: {
      bracketsByStatus: {
        single: { '0': 0.2 },
        singleWithDependents: { '0': 0.2 },
        married: { '0': 0.2 }
      },
      taxCredits: {},
      jointBandIncreaseMax: 0,
      ageExemptionAge: 999,
      ageExemptionLimit: 0
    },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    capitalGainsTax: { rate: 0.1, annualExemption: 0 },
    pensionRules: { systemType: 'mixed', lumpSumTaxBands: { '0': 0 } },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'EUR', assetCountry: 'ie', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'EUR', assetCountry: 'ie', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  },
  us: {
    version: 'test-rental-1',
    country: 'US',
    countryName: 'United States',
    taxBasis: 'worldwide',
    treatyEquivalents: {
      incomeTax: 'income',
      capitalGains: 'capitalGains',
      dividends: 'dividends'
    },
    locale: { currencyCode: 'USD', currencySymbol: '$' },
    economicData: {
      inflation: { cpi: 0, year: 2025 },
      purchasingPowerParity: { value: 1, year: 2025 },
      exchangeRate: { perEur: 1, asOf: '2025-01-01' }
    },
    incomeTax: {
      bracketsByStatus: {
        single: { '0': 0.1 },
        singleWithDependents: { '0': 0.1 },
        married: { '0': 0.1 }
      },
      taxCredits: {},
      jointBandIncreaseMax: 0,
      ageExemptionAge: 999,
      ageExemptionLimit: 0
    },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    capitalGainsTax: { rate: 0.1, annualExemption: 0 },
    pensionRules: { systemType: 'mixed', lumpSumTaxBands: { '0': 0 } },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'USD', assetCountry: 'us', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'USD', assetCountry: 'us', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  },
  ar: {
    version: 'test-rental-1',
    country: 'AR',
    countryName: 'Argentina',
    taxBasis: 'worldwide',
    treatyEquivalents: {
      incomeTax: 'income',
      capitalGains: 'capitalGains',
      dividends: 'dividends'
    },
    locale: { currencyCode: 'ARS', currencySymbol: '$' },
    economicData: {
      inflation: { cpi: 0, year: 2025 },
      purchasingPowerParity: { value: 1, year: 2025 },
      exchangeRate: { perEur: 1, asOf: '2025-01-01' }
    },
    incomeTax: {
      bracketsByStatus: {
        single: { '0': 0.15 },
        singleWithDependents: { '0': 0.15 },
        married: { '0': 0.15 }
      },
      taxCredits: {},
      jointBandIncreaseMax: 0,
      ageExemptionAge: 999,
      ageExemptionLimit: 0
    },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    capitalGainsTax: { rate: 0.1, annualExemption: 0 },
    pensionRules: { systemType: 'mixed', lumpSumTaxBands: { '0': 0 } },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'ARS', assetCountry: 'ar', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'ARS', assetCountry: 'ar', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  }
};

function buildScenario(name, events) {
  return {
    name: name,
    description: name,
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 30,
        retirementAge: 65,
        initialSavings: 0,
        initialPension: 0,
        initialFunds: 0,
        initialShares: 0,
        emergencyStash: 0,
        growthRateFunds: 0,
        growthRateShares: 0,
        growthRatePension: 0,
        growthDevFunds: 0,
        growthDevShares: 0,
        growthDevPension: 0,
        inflation: 0,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economy_mode: 'deterministic',
        economyMode: 'deterministic'
      },
      events: events
    },
    assertions: []
  };
}

async function runScenario(definition) {
  const framework = new TestFramework();
  if (!framework.loadScenario(definition)) {
    return { error: 'Failed to load scenario: ' + definition.name };
  }

  installTestTaxRules(framework, deepClone(RENTAL_RULES));
  const results = await framework.runSimulation();
  if (!results || !results.success) {
    return { error: 'Simulation failed for scenario: ' + definition.name };
  }

  const diagnostics = vm.runInContext(`
    (function() {
      var tax = (typeof revenue !== 'undefined' && revenue && revenue.taxTotals) ? revenue.taxTotals : {};
      var am = (typeof revenue !== 'undefined' && revenue && revenue.attributionManager) ? revenue.attributionManager : null;
      var getTotal = function(metricKey) {
        if (!am || typeof am.getAttribution !== 'function') return 0;
        var attr = am.getAttribution(metricKey);
        return attr ? attr.getTotal() : 0;
      };
      return {
        incomeTax: tax.incomeTax || 0,
        incomeTaxUs: tax['incomeTax:us'] || 0,
        incomeTaxAr: tax['incomeTax:ar'] || 0,
        incomeTaxIe: tax['incomeTax:ie'] || 0,
        totalTax: (revenue && typeof revenue.getAllTaxesTotal === 'function') ? revenue.getAllTaxesTotal() : 0,
        rentalDomestic: getTotal('incomerentals'),
        rentalUs: getTotal('incomerentals:us'),
        rentalAr: getTotal('incomerentals:ar')
      };
    })();
  `, framework.simulationContext);

  return { diagnostics: diagnostics };
}

module.exports = {
  name: 'RentalIncomeCrossBorder',
  description: 'Validates domestic and foreign rental taxation with source-country rules and treaty credits.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    const domestic = await runScenario(buildScenario('RentalDomestic', [
      { type: 'R', id: 'prop-ie', amount: 0, fromAge: 30, toAge: 60, currency: 'EUR', linkedCountry: 'ie' },
      { type: 'RI', id: 'prop-ie', amount: 10000, fromAge: 30, toAge: 30, currency: 'EUR' }
    ]));
    if (domestic.error) {
      errors.push(domestic.error);
    } else {
      if (domestic.diagnostics.rentalDomestic <= 0) {
        errors.push('Domestic rental income should be attributed under incomerentals');
      }
      if (domestic.diagnostics.incomeTaxIe !== 0) {
        errors.push('Domestic rental income should not create incomeTax:ie source bucket');
      }
      if (Math.abs(domestic.diagnostics.incomeTax - 2000) > 1e-6) {
        errors.push('Domestic rental income should apply residence tax of 2000');
      }
    }

    const treaty = await runScenario(buildScenario('RentalForeignTreaty', [
      { type: 'R', id: 'prop-us', amount: 0, fromAge: 30, toAge: 60, currency: 'USD', linkedCountry: 'us' },
      { type: 'RI', id: 'prop-us', amount: 10000, fromAge: 30, toAge: 30, currency: 'USD' }
    ]));
    if (treaty.error) {
      errors.push(treaty.error);
    } else {
      if (treaty.diagnostics.rentalUs <= 0) {
        errors.push('Foreign rental should be attributed under incomerentals:us via property linkedCountry lookup');
      }
      if (Math.abs(treaty.diagnostics.incomeTaxUs - 1000) > 1e-6) {
        errors.push('Treaty case should compute source rental tax incomeTax:us = 1000');
      }
      if (Math.abs(treaty.diagnostics.incomeTax - 1000) > 1e-6) {
        errors.push('Treaty case should reduce residence incomeTax to 1000 after foreign tax credit');
      }
      if (Math.abs(treaty.diagnostics.totalTax - 2000) > 1e-6) {
        errors.push('Treaty case total tax should equal 2000 (source + residence net)');
      }
    }

    const noTreaty = await runScenario(buildScenario('RentalForeignNoTreaty', [
      { type: 'R', id: 'prop-ar', amount: 0, fromAge: 30, toAge: 60, currency: 'ARS', linkedCountry: 'ar' },
      { type: 'RI', id: 'prop-ar', amount: 10000, fromAge: 30, toAge: 30, currency: 'ARS' }
    ]));
    if (noTreaty.error) {
      errors.push(noTreaty.error);
    } else {
      if (noTreaty.diagnostics.rentalAr <= 0) {
        errors.push('Foreign rental should be attributed under incomerentals:ar via property linkedCountry lookup');
      }
      if (Math.abs(noTreaty.diagnostics.incomeTaxAr - 1500) > 1e-6) {
        errors.push('No-treaty case should compute source rental tax incomeTax:ar = 1500');
      }
      if (Math.abs(noTreaty.diagnostics.incomeTax - 2000) > 1e-6) {
        errors.push('No-treaty case should keep full residence incomeTax = 2000');
      }
      if (Math.abs(noTreaty.diagnostics.totalTax - 3500) > 1e-6) {
        errors.push('No-treaty case total tax should equal 3500 (double taxation)');
      }
      if (!treaty.error && noTreaty.diagnostics.totalTax <= treaty.diagnostics.totalTax) {
        errors.push('No-treaty total tax should be greater than treaty total tax for equal rental income');
      }
    }

    return { success: errors.length === 0, errors: errors };
  }
};
