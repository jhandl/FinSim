const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const INFLATION_RULES = {
  aa: {
    version: 'blank-rate-test',
    country: 'AA',
    countryName: 'Country A',
    locale: { currencyCode: 'AAA', currencySymbol: '¤A' },
    economicData: {
      inflation: 2.0,
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: { brackets: { '0': 0.1 }, taxCredits: { employee: 0, personal: 0 } },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    capitalGainsTax: { rate: 0.2, annualExemption: 0 },
    pensionRules: { systemType: 'mixed', lumpSumTaxBands: { '0': 0 } },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'AAA', assetCountry: 'aa', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'AAA', assetCountry: 'aa', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  },
  bb: {
    version: 'blank-rate-test',
    country: 'BB',
    countryName: 'Country B',
    // Intentionally keep same currency as AA to isolate inflation behavior.
    locale: { currencyCode: 'AAA', currencySymbol: '¤A' },
    economicData: {
      inflation: 10.0,
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: { brackets: { '0': 0.1 }, taxCredits: { employee: 0, personal: 0 } },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    capitalGainsTax: { rate: 0.2, annualExemption: 0 },
    pensionRules: { systemType: 'mixed', lumpSumTaxBands: { '0': 0 } },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'AAA', assetCountry: 'bb', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'AAA', assetCountry: 'bb', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  },
  cc: {
    version: 'blank-rate-test',
    country: 'CC',
    countryName: 'Country C',
    locale: { currencyCode: 'AAA', currencySymbol: '¤A' },
    economicData: {
      inflation: 1.0,
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: { brackets: { '0': 0.1 }, taxCredits: { employee: 0, personal: 0 } },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    capitalGainsTax: { rate: 0.2, annualExemption: 0 },
    pensionRules: { systemType: 'mixed', lumpSumTaxBands: { '0': 0 } },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'AAA', assetCountry: 'cc', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'AAA', assetCountry: 'cc', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  }
};

function findRowByAge(rows, age) {
  return rows.find(r => r && typeof r === 'object' && r.age === age);
}

function closeEnough(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}

module.exports = {
  name: 'BlankRateCountryInflationFallback',
  description: 'Verifies blank event rate uses residence-country inflation by default and linked-country inflation when linkedCountry is set.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];
    const framework = new TestFramework();

    const scenarioDefinition = {
      name: 'BlankRateCountryInflationFallback',
      description: 'Blank rate inflation fallback for default and linked-country events.',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 41,
          retirementAge: 65,
          initialSavings: 1000000,
          inflation: 0,
          StartCountry: 'cc',
          relocationEnabled: true,
          simulation_mode: 'single',
          economy_mode: 'deterministic'
        },
        events: [
          { type: 'MV', id: 'move-bb', name: 'BB', amount: 0, fromAge: 35, toAge: 35, rate: 0 },
          // Blank rate + no linkedCountry -> should use BB inflation (10%) in ages 35-37.
          { type: 'E', id: 'default-bb', amount: 1000, fromAge: 35, toAge: 37 },
          // Blank rate + explicit linkedCountry=AA -> should use AA inflation (2%) in ages 38-40.
          { type: 'E', id: 'linked-aa', amount: 1000, fromAge: 38, toAge: 40, linkedCountry: 'aa' }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenarioDefinition)) {
      return { success: false, errors: ['Failed to load blank-rate scenario'] };
    }

    installTestTaxRules(framework, deepClone(INFLATION_RULES));
    const results = await framework.runSimulation();
    if (!results || !results.success) {
      return { success: false, errors: ['Simulation failed for blank-rate fallback scenario'] };
    }

    const rows = Array.isArray(results.dataSheet)
      ? results.dataSheet.filter(r => r && typeof r === 'object')
      : [];

    const row35 = findRowByAge(rows, 35);
    const row36 = findRowByAge(rows, 36);
    const row37 = findRowByAge(rows, 37);
    const row38 = findRowByAge(rows, 38);
    const row39 = findRowByAge(rows, 39);
    const row40 = findRowByAge(rows, 40);

    if (!row35 || !row36 || !row37 || !row38 || !row39 || !row40) {
      return { success: false, errors: ['Missing expected ages (35-40) in data sheet'] };
    }

    // Each range has a single active expense event, so expense ratios isolate that event growth.
    const defaultRatio1 = row36.expenses / row35.expenses;
    const defaultRatio2 = row37.expenses / row36.expenses;
    const linkedRatio1 = row39.expenses / row38.expenses;
    const linkedRatio2 = row40.expenses / row39.expenses;

    if (!closeEnough(defaultRatio1, 1.10, 1e-9) || !closeEnough(defaultRatio2, 1.10, 1e-9)) {
      errors.push(
        'Blank rate without linkedCountry should follow residence-country inflation (BB 10%): ratios=' +
        defaultRatio1 + ', ' + defaultRatio2
      );
    }

    if (!closeEnough(linkedRatio1, 1.02, 1e-9) || !closeEnough(linkedRatio2, 1.02, 1e-9)) {
      errors.push(
        'Blank rate with linkedCountry=AA should follow AA inflation (2%): ratios=' +
        linkedRatio1 + ', ' + linkedRatio2
      );
    }

    // Guard against accidentally using BB inflation for the linked-country event.
    if (closeEnough(linkedRatio1, 1.10, 1e-6) || closeEnough(linkedRatio2, 1.10, 1e-6)) {
      errors.push('Linked-country blank-rate event incorrectly followed BB residence inflation');
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};
