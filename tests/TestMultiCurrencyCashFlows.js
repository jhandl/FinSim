const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const CURRENCY_RULES = {
  qq: {
    version: 'fx-test',
    country: 'QQ',
    countryName: 'Country Q',
    locale: { currencyCode: 'QQQ', currencySymbol: '¤Q' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: { brackets: { '0': 0.1 }, taxCredits: { employee: 0, personal: 0 } },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    capitalGainsTax: { rate: 0.1, annualExemption: 0 },
    pensionRules: { systemType: 'mixed', lumpSumTaxBands: { '0': 0 } }
  },
  pp: {
    version: 'fx-test',
    country: 'PP',
    countryName: 'Country P',
    locale: { currencyCode: 'PPP', currencySymbol: '¤P' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 2.0, year: 2025 },
      exchangeRate: { perEur: 2.0, asOf: '2025-01-01' }
    },
    incomeTax: { brackets: { '0': 0.2 }, taxCredits: { employee: 0, personal: 0 } },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    capitalGainsTax: { rate: 0.2, annualExemption: 0 },
    pensionRules: { systemType: 'mixed', lumpSumTaxBands: { '0': 0 } }
  },
  rr: {
    version: 'fx-test',
    country: 'RR',
    countryName: 'Country R',
    locale: { currencyCode: 'RRR', currencySymbol: '¤R' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 0.5, year: 2025 },
      exchangeRate: { perEur: 0.5, asOf: '2025-01-01' }
    },
    incomeTax: { brackets: { '0': 0.15 }, taxCredits: { employee: 0, personal: 0 } },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    capitalGainsTax: { rate: 0.15, annualExemption: 0 },
    pensionRules: { systemType: 'mixed', lumpSumTaxBands: { '0': 0 } }
  }
};

function buildEconomicData() {
  const profiles = Object.keys(CURRENCY_RULES).map(code => {
    const rs = new TaxRuleSet(CURRENCY_RULES[code]);
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
  name: 'MultiCurrencyCashFlows',
  description: 'Validates per-currency netting and conversion across scenarios.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];
    const econ = buildEconomicData();

    // Scenario 1: Matching foreign income/expense in same currency
    {
      const framework = new TestFramework();
      const scenarioDefinition = {
        name: 'NetMatching',
        description: 'Foreign rental income with matching mortgage.',
        scenario: {
          parameters: {
            startingAge: 30,
            targetAge: 31,
            retirementAge: 60,
            initialSavings: 0,
            inflation: 0,
            StartCountry: 'qq',
            simulation_mode: 'single',
            economy_mode: 'deterministic'
          },
          events: [
            { type: 'RI', id: 'rent-pp', amount: 12000, fromAge: 30, toAge: 30, currency: 'PPP', linkedCountry: 'pp' },
            { type: 'M', id: 'mort-pp', amount: 10000, fromAge: 30, toAge: 30, currency: 'PPP', linkedCountry: 'pp' }
          ]
        },
        assertions: []
      };

      if (!framework.loadScenario(scenarioDefinition)) {
        return { success: false, errors: ['Failed to load Scenario 1'] };
      }
      installTestTaxRules(framework, deepClone(CURRENCY_RULES));
      const results = await framework.runSimulation();
      if (!results || !results.success) {
        return { success: false, errors: ['Scenario 1 failed to run'] };
      }
      const rows = results.dataSheet.filter(r => r && typeof r === 'object');
      const row = findRowByAge(rows, 30);
      if (!row) {
        return { success: false, errors: ['Scenario 1 missing age 30 row'] };
      }

      // Compute expected net in foreign currency (PPP) before conversion
      const netInPPP = 12000 - 10000; // rental income - mortgage expense
      // Convert the net to residence currency (QQQ) using nominal FX (constant mode) for ledger values
      const expectedNet = econ.convert(netInPPP, 'PP', 'QQ', row.year, { fxMode: 'constant', baseYear: row.year });
      // Assert that the post-consolidation net impact matches the converted net
      const actualNet = row.incomeRentals - row.expenses;
      if (!withinTolerance(actualNet, expectedNet)) {
        errors.push(`Scenario 1: net flow mismatch (${actualNet} vs ${expectedNet}). Expected net of ${netInPPP} PPP converted to ${expectedNet} QQQ.`);
      }
    }

    // Scenario 2: Different foreign currencies with independent conversion
    {
      const framework = new TestFramework();
      const scenarioDefinition = {
        name: 'MultiCurrencyFlows',
        description: 'Income in PPP and expenses in RRR while resident in QQQ.',
        scenario: {
          parameters: {
            startingAge: 30,
            targetAge: 31,
            retirementAge: 60,
            initialSavings: 0,
            inflation: 0,
            StartCountry: 'qq',
            simulation_mode: 'single',
            economy_mode: 'deterministic'
          },
          events: [
            { type: 'RI', id: 'rent-pp', amount: 15000, fromAge: 30, toAge: 30, currency: 'PPP', linkedCountry: 'pp' },
            { type: 'E', id: 'expense-rr', amount: 8000, fromAge: 30, toAge: 30, currency: 'RRR', linkedCountry: 'rr' }
          ]
        },
        assertions: []
      };

      if (!framework.loadScenario(scenarioDefinition)) {
        return { success: false, errors: ['Failed to load Scenario 2'] };
      }
      installTestTaxRules(framework, deepClone(CURRENCY_RULES));
      const results = await framework.runSimulation();
      if (!results || !results.success) {
        return { success: false, errors: ['Scenario 2 failed to run'] };
      }
      const rows = results.dataSheet.filter(r => r && typeof r === 'object');
      const row = findRowByAge(rows, 30);
      if (!row) {
        return { success: false, errors: ['Scenario 2 missing age 30 row'] };
      }

      // Use nominal FX (constant mode) for ledger value expectations
      const expectedIncome = econ.convert(15000, 'PP', 'QQ', row.year, { fxMode: 'constant', baseYear: row.year });
      const expectedExpense = econ.convert(8000, 'RR', 'QQ', row.year, { fxMode: 'constant', baseYear: row.year });

      if (!withinTolerance(row.incomeRentals, expectedIncome)) {
        errors.push(`Scenario 2: incomeRentals mismatch (${row.incomeRentals} vs ${expectedIncome})`);
      }
      if (!withinTolerance(row.expenses, expectedExpense)) {
        errors.push(`Scenario 2: expenses mismatch (${row.expenses} vs ${expectedExpense})`);
      }
    }

    // Scenario 3: Multiple currencies with relocation (net buckets persisted)
    {
      const framework = new TestFramework();
      const scenarioDefinition = {
        name: 'RelocationMultiCurrency',
        description: 'Relocation with pre/post foreign assets.',
        scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 33,
          retirementAge: 65,
          initialSavings: 0,
          inflation: 0,
          StartCountry: 'qq',
          simulation_mode: 'single',
          economy_mode: 'deterministic'
        },
        events: [
          { type: 'RI', id: 'rent-pp', amount: 10000, fromAge: 30, toAge: 31, currency: 'PPP', linkedCountry: 'pp' },
          { type: 'M', id: 'mort-pp', amount: 7000, fromAge: 30, toAge: 31, currency: 'PPP', linkedCountry: 'pp' },
          { type: 'MV-rr', id: 'move-rr', amount: 0, fromAge: 32, toAge: 32 },
          { type: 'SI', id: 'salary-rr', amount: 40000, fromAge: 33, toAge: 33, currency: 'RRR' }
        ]
        },
        assertions: []
      };

      if (!framework.loadScenario(scenarioDefinition)) {
        return { success: false, errors: ['Failed to load Scenario 3'] };
      }
      installTestTaxRules(framework, deepClone(CURRENCY_RULES));
      const results = await framework.runSimulation();
      if (!results || !results.success) {
        return { success: false, errors: ['Scenario 3 failed to run'] };
      }

      const rows = results.dataSheet.filter(r => r && typeof r === 'object');
      const row30 = findRowByAge(rows, 30);
      const row31 = findRowByAge(rows, 31);
      const row32 = findRowByAge(rows, 32);
      const row33 = findRowByAge(rows, 33);
      if (!row30 || !row31 || !row32 || !row33) {
        return { success: false, errors: ['Scenario 3 missing required ages (30-33)'] };
      }

      // Use nominal FX (constant mode) for ledger value expectations
      const incomePYear30 = econ.convert(10000, 'PP', 'QQ', row30.year, { fxMode: 'constant', baseYear: row30.year });
      const expensePYear30 = econ.convert(7000, 'PP', 'QQ', row30.year, { fxMode: 'constant', baseYear: row30.year });
      if (!withinTolerance(row30.incomeRentals, incomePYear30)) {
        errors.push('Scenario 3: Year 30 rental conversion mismatch');
      }
      if (!withinTolerance(row30.expenses, expensePYear30)) {
        errors.push('Scenario 3: Year 30 expense conversion mismatch');
      }

      // Use nominal FX (constant mode) for ledger value expectations
      const incomeRYear33 = econ.convert(40000, 'RR', 'RR', row33.year, { fxMode: 'constant', baseYear: row33.year });
      if (!withinTolerance(row33.incomeSalaries, incomeRYear33)) {
        errors.push('Scenario 3: Year 33 salary should remain in residence currency');
      }

      const countryHistoryJson = vm.runInContext(
        'JSON.stringify(revenue && revenue.countryHistory ? revenue.countryHistory : [])',
        framework.simulationContext
      );
      const history = JSON.parse(countryHistoryJson);
      if (history.map(entry => entry.country).indexOf('rr') === -1) {
        errors.push('Scenario 3: country history missing relocation to RR');
      }
    }

    return { success: errors.length === 0, errors };
  }
};
