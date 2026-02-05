const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const BASE_RULES = {
  aa: {
    version: 'test-1',
    country: 'AA',
    countryName: 'Country A',
    locale: { currencyCode: 'AAA', currencySymbol: '¤A' },
    economicData: {
      inflation: { cpi: 2.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: {
      brackets: { '0': 0.2 },
      taxCredits: { employee: 0 }
    },
    residencyRules: {
      postEmigrationTaxYears: 3,
      taxesForeignIncome: true
    },
    pensionRules: {
      systemType: 'mixed',
      lumpSumTaxBands: { '0': 0, '150000': 0.2 }
    },
    capitalGainsTax: {
      rate: 0.2,
      annualExemption: 1200
    },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'AAA', assetCountry: 'aa', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'AAA', assetCountry: 'aa', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  },
  bb: {
    version: 'test-1',
    country: 'BB',
    countryName: 'Country B',
    locale: { currencyCode: 'BBB', currencySymbol: '¤B' },
    economicData: {
      inflation: { cpi: 5.0, year: 2025 },
      purchasingPowerParity: { value: 1.6, year: 2025 },
      exchangeRate: { perEur: 1.4, asOf: '2025-01-01' }
    },
    incomeTax: {
      brackets: { '0': 0.1 },
      taxCredits: { employee: 0 }
    },
    residencyRules: {
      postEmigrationTaxYears: 0,
      taxesForeignIncome: false
    },
    pensionRules: {
      systemType: 'state_only',
      lumpSumTaxBands: { '0': 0 }
    },
    capitalGainsTax: {
      rate: 0.1,
      annualExemption: 500
    },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'BBB', assetCountry: 'bb', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'BBB', assetCountry: 'bb', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  },
  cc: {
    version: 'test-1',
    country: 'CC',
    countryName: 'Country C',
    locale: { currencyCode: 'CCC', currencySymbol: '¤C' },
    economicData: {
      inflation: { cpi: 3.0, year: 2025 },
      purchasingPowerParity: { value: 1.2, year: 2025 },
      exchangeRate: { perEur: 1.1, asOf: '2025-01-01' }
    },
    incomeTax: {
      brackets: { '0': 0.15 },
      taxCredits: { employee: 0 }
    },
    residencyRules: {
      postEmigrationTaxYears: 0,
      taxesForeignIncome: false
    },
    pensionRules: {
      systemType: 'mixed',
      lumpSumTaxBands: { '0': 0 }
    },
    capitalGainsTax: {
      rate: 0.15,
      annualExemption: 700
    },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'CCC', assetCountry: 'cc', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'CCC', assetCountry: 'cc', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  }
};

function buildEconomicData(rulesMap) {
  const profiles = Object.keys(rulesMap).map(code => {
    const rs = new TaxRuleSet(rulesMap[code]);
    return rs.getEconomicProfile();
  });
  return new EconomicData(profiles);
}

function findRowByAge(rows, age) {
  return rows.find(r => r && typeof r === 'object' && r.age === age);
}

function validateFiniteFields(row, fields, errors, label) {
  fields.forEach(field => {
    const value = row[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${label}: field ${field} is not finite (value=${value})`);
    }
  });
}

module.exports = {
  name: 'RelocationResidencyDerivation',
  description: 'Validates residency timeline, currency handling, and relocation edge cases.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // --- Positive Scenario -------------------------------------------------
    const framework = new TestFramework();
    const scenarioDefinition = {
      name: 'RelocationResidencyTimeline',
      description: 'Baseline residency derivation with two moves.',
      scenario: {
        parameters: {
          startingAge: 25,
          targetAge: 50,
          retirementAge: 70,
          initialSavings: 10000,
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
          relocationEnabled: true,
          StartCountry: 'aa',
          simulation_mode: 'single',
          economy_mode: 'deterministic'
        },
        events: [
          { type: 'SI', id: 'salary-aa', amount: 50000, fromAge: 25, toAge: 34, currency: 'AAA' },
          { type: 'MV-bb', id: 'move-bb', amount: 0, fromAge: 35, toAge: 35 },
          { type: 'SI', id: 'salary-bb', amount: 100000, fromAge: 35, toAge: 44, currency: 'BBB' },
          { type: 'MV-cc', id: 'move-cc', amount: 0, fromAge: 45, toAge: 45 },
          { type: 'SI', id: 'salary-cc', amount: 75000, fromAge: 45, toAge: 49, currency: 'CCC' }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenarioDefinition)) {
      return { success: false, errors: ['Failed to load baseline scenario'] };
    }

    installTestTaxRules(framework, deepClone(BASE_RULES));
    const baselineResults = await framework.runSimulation();
    if (!baselineResults || !baselineResults.success) {
      errors.push('Baseline scenario did not complete successfully');
    } else {
      const rows = Array.isArray(baselineResults.dataSheet)
        ? baselineResults.dataSheet.filter(r => r && typeof r === 'object')
        : [];

      if (rows.length === 0) {
        errors.push('Baseline scenario produced no data rows');
      } else {
        const age30 = findRowByAge(rows, 30);
        const age36 = findRowByAge(rows, 36);
        const age46 = findRowByAge(rows, 46);

        if (!age30 || !age36 || !age46) {
          errors.push('Missing expected ages (30, 36, 46) in data sheet');
        } else {
          validateFiniteFields(age30, ['incomeSalaries'], errors, 'Age 30');
          validateFiniteFields(age36, ['incomeSalaries'], errors, 'Age 36');
          validateFiniteFields(age46, ['incomeSalaries'], errors, 'Age 46');

          if (Math.abs(age30.incomeSalaries - 50000) > 1e-4) {
            errors.push(`Age 30 salary expected 50000 AAA, got ${age30.incomeSalaries}`);
          }

          if (age36.incomeSalaries <= 100000) {
            errors.push('Age 36 salary should reflect higher BBB earnings after relocation');
          }

          if (age46.incomeSalaries <= 70000) {
            errors.push('Age 46 salary should reflect CCC earnings after second relocation');
          }
        }

        const historyJson = vm.runInContext(
          'JSON.stringify(revenue && revenue.countryHistory ? revenue.countryHistory : [])',
          framework.simulationContext
        );
        const history = JSON.parse(historyJson);

        if (history.length !== 3) {
          errors.push(`Expected 3 country history entries, got ${history.length}`);
        } else {
          const countries = history.map(entry => entry.country);
          if (countries[0] !== 'aa' || countries[1] !== 'bb' || countries[2] !== 'cc') {
            errors.push(`Country history mismatch: ${countries.join(' -> ')}`);
          }
        }

        const cfgCountries = vm.runInContext(
          'JSON.stringify(Object.keys(Config.getInstance().listCachedRuleSets()))',
          framework.simulationContext
        );
        const cachedCodes = JSON.parse(cfgCountries);
        ['aa', 'bb', 'cc'].forEach(code => {
          if (cachedCodes.indexOf(code) === -1) {
            errors.push(`Tax ruleset for ${code} was not cached`);
          }
        });

        buildEconomicData(BASE_RULES); // ensures economic profiles do not throw (smoke test)
      }
    }

    // --- Negative Scenario: Missing StartCountry should fail when relocation is enabled -------
    const missingStartFramework = new TestFramework();
    const missingStartScenario = {
      name: 'MissingStartCountry',
      description: 'StartCountry omitted (should fail)',
      scenario: {
        parameters: {
          startingAge: 25,
          targetAge: 30,
          retirementAge: 65,
          initialSavings: 1000,
          inflation: 0,
          relocationEnabled: true,
          simulation_mode: 'single',
          economy_mode: 'deterministic'
        },
        events: [
          { type: 'SI', id: 'salary-aa', amount: 20000, fromAge: 25, toAge: 26, currency: 'AAA' }
        ]
      },
      assertions: []
    };

    if (missingStartFramework.loadScenario(missingStartScenario)) {
      installTestTaxRules(missingStartFramework, deepClone(BASE_RULES));
      // Suppress expected console errors for this negative test case.
      const originalConsoleErrorMissingStart = console.error;
      console.error = () => {};
      try {
        const missingStartResults = await missingStartFramework.runSimulation();
        if (!missingStartResults || missingStartResults.success !== false) {
          errors.push('Scenario without explicit StartCountry should fail when relocation is enabled');
        }
      } finally {
        console.error = originalConsoleErrorMissingStart;
      }
    } else {
      errors.push('Failed to load missing StartCountry scenario');
    }

    // --- Edge Case: Invalid MV country code ---------------------------------
    // Suppress expected console errors for this test case since the failure is intentional
    const originalConsoleError = console.error;
    console.error = () => {}; // Suppress expected errors during invalid relocation test
    
    try {
      const invalidMoveFramework = new TestFramework();
      const invalidMoveScenario = {
        name: 'InvalidRelocationCode',
        description: 'Relocation to unknown country should abort simulation',
        scenario: {
          parameters: {
            startingAge: 30,
            targetAge: 35,
            retirementAge: 65,
            initialSavings: 5000,
            inflation: 0,
          relocationEnabled: true,
            StartCountry: 'aa',
            simulation_mode: 'single',
            economy_mode: 'deterministic'
          },
          events: [
            { type: 'SI', id: 'salary-aa', amount: 40000, fromAge: 30, toAge: 31, currency: 'AAA' },
            { type: 'MV-zz', id: 'move-unknown', amount: 0, fromAge: 32, toAge: 32 }
          ]
        },
        assertions: []
      };

      if (invalidMoveFramework.loadScenario(invalidMoveScenario)) {
        const customRules = deepClone(BASE_RULES);
        installTestTaxRules(invalidMoveFramework, customRules);
        const invalidMoveResults = await invalidMoveFramework.runSimulation();
        if (!invalidMoveResults || invalidMoveResults.success !== false) {
          errors.push('Simulator should refuse to run with unknown relocation country code (MV-zz)');
        }
      } else {
        errors.push('Failed to load invalid relocation scenario');
      }
    } finally {
      // Always restore console.error
      console.error = originalConsoleError;
    }

    return { success: errors.length === 0, errors };
  }
};
