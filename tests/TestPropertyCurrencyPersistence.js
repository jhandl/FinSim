const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const PROPERTY_RULES = {
  ss: {
    version: 'prop-test',
    country: 'SS',
    countryName: 'Country S',
    locale: { currencyCode: 'SSS', currencySymbol: '¤S' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: { brackets: { '0': 0.2 }, taxCredits: { employee: 0, personal: 0 } },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    capitalGainsTax: { rate: 0.2, annualExemption: 0 },
    pensionRules: { systemType: 'mixed', lumpSumTaxBands: { '0': 0 } }
  },
  tt: {
    version: 'prop-test',
    country: 'TT',
    countryName: 'Country T',
    locale: { currencyCode: 'TTT', currencySymbol: '¤T' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 50.0, year: 2025 },
      exchangeRate: { perEur: 50.0, asOf: '2025-01-01' }
    },
    incomeTax: { brackets: { '0': 0.15 }, taxCredits: { employee: 0, personal: 0 } },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    capitalGainsTax: { rate: 0.15, annualExemption: 0 },
    pensionRules: { systemType: 'mixed', lumpSumTaxBands: { '0': 0 } }
  }
};

function buildEconomicData() {
  const profiles = Object.keys(PROPERTY_RULES).map(code => {
    const rs = new TaxRuleSet(PROPERTY_RULES[code]);
    return rs.getEconomicProfile();
  });
  return new EconomicData(profiles);
}

function findRowByAge(rows, age) {
  return rows.find(r => r && typeof r === 'object' && r.age === age);
}

function withinTolerance(actual, expected, tol = 1e-6) {
  return Math.abs(actual - expected) <= tol;
}

module.exports = {
  name: 'PropertyCurrencyPersistence',
  description: 'Ensures property income/expenses retain original currency after relocation.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const economicData = buildEconomicData();

    const scenarioDefinition = {
      name: 'PropertyPersistence',
      description: 'Relocate while keeping foreign property.',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 36,
          retirementAge: 65,
          initialSavings: 0,
          inflation: 0,
          StartCountry: 'ss',
          simulation_mode: 'single',
          economy_mode: 'deterministic'
	        },
	        events: [
	          { type: 'R', id: 'prop-ss', amount: 300000, rate: 0, fromAge: 31, toAge: 60, currency: 'SSS', linkedCountry: 'ss' },
	          { type: 'M', id: 'mort-ss', amount: 20000, rate: 0.03, fromAge: 31, toAge: 60, currency: 'SSS', linkedCountry: 'ss' },
	          { type: 'RI', id: 'rent-ss', amount: 25000, fromAge: 32, toAge: 60, currency: 'SSS', linkedCountry: 'ss' },
	          { type: 'MV-tt', id: 'move-tt', amount: 0, fromAge: 35, toAge: 35 },
	          { type: 'SI', id: 'salary-tt', amount: 1000000, fromAge: 35, toAge: 36, currency: 'TTT' },
	          { type: 'SA', id: 'sale-ss', amount: 0, fromAge: 36, toAge: 36, currency: 'SSS', linkedCountry: 'ss' }
	        ]
	      },
      assertions: []
    };

    if (!framework.loadScenario(scenarioDefinition)) {
      return { success: false, errors: ['Failed to load property scenario'] };
    }

    installTestTaxRules(framework, deepClone(PROPERTY_RULES));
    const results = await framework.runSimulation();
    if (!results || !results.success) {
      return { success: false, errors: ['Property scenario failed to run'] };
    }

    const rows = results.dataSheet.filter(r => r && typeof r === 'object');
    const row34 = findRowByAge(rows, 34);
	    const row36 = findRowByAge(rows, 36);
	    if (!row34 || !row36) {
	      return { success: false, errors: ['Missing required rows (34, 36)'] };
	    }

	    if (typeof row34.incomeRentals !== 'number' || typeof row34.expenses !== 'number') {
	      return { success: false, errors: ['Pre-relocation values not numbers'] };
	    }
	    if (typeof row36.incomeRentals !== 'number' || typeof row36.expenses !== 'number') {
	      return { success: false, errors: ['Post-relocation values not numbers'] };
	    }

	    const baseRow = findRowByAge(rows, 30) || rows[0];
	    const baseYear = baseRow ? baseRow.year : row34.year;

    // Use nominal FX (constant mode) for ledger value expectations
    const expectedRentalPre = economicData.convert(25000, 'SS', 'SS', row34.year, { fxMode: 'constant', baseYear });
    const expectedMortgagePre = economicData.convert(20000, 'SS', 'SS', row34.year, { fxMode: 'constant', baseYear });

	    if (!withinTolerance(row34.incomeRentals, expectedRentalPre, 0.01)) {
	      return { success: false, errors: ['Pre-relocation rental conversion mismatch: ' + row34.incomeRentals + ' vs ' + expectedRentalPre + ' (type: ' + typeof row34.incomeRentals + ')'] };
	    }
	    if (!withinTolerance(row34.expenses, expectedMortgagePre, 0.01)) {
	      return { success: false, errors: ['Pre-relocation mortgage conversion mismatch: ' + row34.expenses + ' vs ' + expectedMortgagePre + ' (type: ' + typeof row34.expenses + ')'] };
	    }

    // Use nominal FX (constant mode) for ledger value expectations
    const expectedRentalPost = economicData.convert(25000, 'SS', 'TT', row36.year, { fxMode: 'constant', baseYear });
    const expectedMortgagePost = economicData.convert(20000, 'SS', 'TT', row36.year, { fxMode: 'constant', baseYear });
	    if (!withinTolerance(row36.incomeRentals, expectedRentalPost, 0.01)) {
	      return { success: false, errors: ['Post-relocation rental conversion mismatch: ' + row36.incomeRentals + ' vs ' + expectedRentalPost + ' (type: ' + typeof row36.incomeRentals + ')'] };
	    }
	    if (!withinTolerance(row36.expenses, expectedMortgagePost, 0.01)) {
	      return { success: false, errors: ['Post-relocation mortgage conversion mismatch: ' + row36.expenses + ' vs ' + expectedMortgagePost + ' (type: ' + typeof row36.expenses + ')'] };
	    }

    const historyJson = framework.simulationContext
      ? vm.runInContext('JSON.stringify(revenue && revenue.countryHistory ? revenue.countryHistory : [])', framework.simulationContext)
      : '[]';
    const historyOrder = JSON.parse(historyJson);
    const hasTT = Array.isArray(historyOrder) ? historyOrder.some(entry => entry.country === 'tt') : false;
    if (!hasTT) {
      return { success: false, errors: ['Country history missing relocation to TT'] };
    }

    return { success: true, errors: [] };
  }
};
