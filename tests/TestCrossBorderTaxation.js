const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const TRAILING_RULES = {
  xx: {
    version: 'test-1',
    country: 'XX',
    countryName: 'Country X',
    locale: { currencyCode: 'XXX', currencySymbol: '¤X' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: {
      brackets: { '0': 0.2 },
      taxCredits: { employee: 0, personal: 0 }
    },
    residencyRules: {
      postEmigrationTaxYears: 3,
      taxesForeignIncome: true
    },
    capitalGainsTax: {
      rate: 0.2,
      annualExemption: 0
    },
    pensionRules: {
      systemType: 'mixed',
      lumpSumTaxBands: { '0': 0 }
    },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'XXX', assetCountry: 'xx', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'XXX', assetCountry: 'xx', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  },
  yy: {
    version: 'test-1',
    country: 'YY',
    countryName: 'Country Y',
    locale: { currencyCode: 'YYY', currencySymbol: '¤Y' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: {
      brackets: { '0': 0.1 },
      taxCredits: { employee: 0, personal: 0 }
    },
    residencyRules: {
      postEmigrationTaxYears: 0,
      taxesForeignIncome: false
    },
    capitalGainsTax: {
      rate: 0.1,
      annualExemption: 0
    },
    pensionRules: {
      systemType: 'mixed',
      lumpSumTaxBands: { '0': 0 }
    },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'YYY', assetCountry: 'yy', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'YYY', assetCountry: 'yy', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  },
  zz: {
    version: 'test-1',
    country: 'ZZ',
    countryName: 'Country Z',
    locale: { currencyCode: 'ZZZ', currencySymbol: '¤Z' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: {
      brackets: { '0': 0.25 },
      taxCredits: { employee: 0, personal: 0 }
    },
    residencyRules: {
      postEmigrationTaxYears: 2,
      taxesForeignIncome: true
    },
    capitalGainsTax: {
      rate: 0.25,
      annualExemption: 0
    },
    pensionRules: {
      systemType: 'mixed',
      lumpSumTaxBands: { '0': 0 }
    },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'ZZZ', assetCountry: 'zz', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'ZZZ', assetCountry: 'zz', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  }
};

function findRowByAge(rows, age) {
  return rows.find(r => r && typeof r === 'object' && r.age === age);
}

module.exports = {
  name: 'CrossBorderTaxation',
  description: 'Validates trailing cross-border taxation timelines across relocations.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    const framework = new TestFramework();
    const scenarioDefinition = {
      name: 'TwoStageRelocation',
      description: 'Relocate from X to Y then to Z with trailing rules.',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 40,
          retirementAge: 65,
          initialSavings: 10000,
          initialPension: 0,
          initialFunds: 0,
          initialShares: 0,
          emergencyStash: 0,
          inflation: 0,
          simulation_mode: 'single',
          economy_mode: 'deterministic',
          StartCountry: 'xx'
        },
        events: [
          { type: 'SI', id: 'salary-xx', amount: 60000, fromAge: 30, toAge: 34, currency: 'XXX' },
          { type: 'UI', id: 'bonus-xx', amount: 10000, fromAge: 32, toAge: 32, currency: 'XXX' },
          { type: 'MV-yy', id: 'move-to-yy', amount: 0, fromAge: 35, toAge: 35 },
          { type: 'SI', id: 'salary-yy', amount: 80000, fromAge: 35, toAge: 38, currency: 'YYY', linkedCountry: 'xx' },
          { type: 'RI', id: 'rental-yy', amount: 5000, fromAge: 35, toAge: 37, currency: 'YYY' },
          { type: 'MV-zz', id: 'move-to-zz', amount: 0, fromAge: 39, toAge: 39 },
          { type: 'SI', id: 'salary-zz', amount: 70000, fromAge: 39, toAge: 40, currency: 'ZZZ' }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenarioDefinition)) {
      return { success: false, errors: ['Unable to load cross-border scenario'] };
    }

    installTestTaxRules(framework, deepClone(TRAILING_RULES));

    vm.runInContext(`
      (function(){
        __crossBorderYearLog = [];
        var originalComputeIT = Taxman.prototype.computeIT;
        Taxman.prototype.computeIT = function() {
          var result = originalComputeIT.apply(this, arguments);
          try {
            var trailing = this.getActiveCrossBorderTaxCountries ? this.getActiveCrossBorderTaxCountries() : [];
            __crossBorderYearLog.push({
              year: this.currentYear,
              currentCountry: (this.countryHistory && this.countryHistory.length > 0) ? this.countryHistory[this.countryHistory.length - 1].country : null,
              trailingCountries: trailing.map(function(entry){ return entry.country; }),
              salaryCountryMetrics: Object.keys((this.attributionManager && this.attributionManager.yearlyAttributions) || {})
                .filter(function(key){ return key.indexOf('incomesalaries:') === 0; }),
              pensionCountryMetrics: Object.keys((this.attributionManager && this.attributionManager.yearlyAttributions) || {})
                .filter(function(key){ return key.indexOf('incomeprivatepension:') === 0; }),
              sourceIncomeTaxKeys: Object.keys(this.taxTotals || {})
                .filter(function(key){ return key.indexOf('incomeTax:') === 0; })
            });
          } catch (err) {
            __crossBorderYearLog.push({ year: this.currentYear, error: String(err && err.message ? err.message : err) });
          }
          return result;
        };
      })();
    `, framework.simulationContext);

    const results = await framework.runSimulation();
    if (!results || !results.success) {
      errors.push('Cross-border simulation failed to run');
      return { success: errors.length === 0, errors };
    }

    const rows = Array.isArray(results.dataSheet)
      ? results.dataSheet.filter(r => r && typeof r === 'object')
      : [];
    if (rows.length === 0) {
      errors.push('Simulation produced no data rows');
      return { success: false, errors };
    }

    const moveToYRow = findRowByAge(rows, 35);
    const afterMoveRow = findRowByAge(rows, 36);
    const moveToZRow = findRowByAge(rows, 39);
    if (!moveToYRow || !afterMoveRow || !moveToZRow) {
      errors.push('Missing expected age rows (35, 36, 39)');
    } else {
      if (afterMoveRow.incomeSalaries <= 0 || moveToZRow.incomeSalaries <= 0) {
        errors.push('Salary amounts post-relocation should be positive');
      }
    }

    const historyJson = vm.runInContext(
      'JSON.stringify(revenue && revenue.countryHistory ? revenue.countryHistory : [])',
      framework.simulationContext
    );
    const history = JSON.parse(historyJson);
    const historyOrder = history.map(entry => entry.country);
    const expectedHistory = ['xx', 'yy', 'zz'];
    expectedHistory.forEach(country => {
      if (historyOrder.indexOf(country) === -1) {
        errors.push(`Country history missing ${country}`);
      }
    });

    const logJson = vm.runInContext('JSON.stringify(__crossBorderYearLog || [])', framework.simulationContext);
    const logEntries = JSON.parse(logJson);
    const targetYears = {};
    logEntries.forEach(entry => {
      if (entry && typeof entry.year === 'number') {
        targetYears[entry.year] = entry;
      }
    });

    const startYearRow = findRowByAge(rows, 30);
    const baseYear = startYearRow ? startYearRow.year : (rows[0] && rows[0].year);

    const yearDuringTrailing = baseYear + (36 - 30); // Age 36 year (1 year post move)
    const yearNearExpiry = baseYear + (38 - 30);     // Age 38 year (final trailing year)
    const yearBeyondTrailing = baseYear + (39 - 30); // Age 39 year (trailing expired)

    const trailingEntry = targetYears[yearDuringTrailing];
    if (!trailingEntry || trailingEntry.trailingCountries.indexOf('xx') === -1) {
      errors.push('Trailing tax countries should include origin XX in first 3 years post-move');
    }
    if (!trailingEntry || !Array.isArray(trailingEntry.sourceIncomeTaxKeys) || trailingEntry.sourceIncomeTaxKeys.indexOf('incomeTax:xx') === -1) {
      errors.push('Expected source-country income tax bucket incomeTax:xx when salary is linked to XX');
    }

    const nearExpiryEntry = targetYears[yearNearExpiry];
    if (!nearExpiryEntry || nearExpiryEntry.trailingCountries.indexOf('xx') === -1) {
      errors.push('Trailing tax should still include XX during configured period');
    }

    const futureTrailingJson = vm.runInContext(`
      (function(){
        var taxman = revenue;
        if (!taxman) return [];
        taxman.currentYear = ${yearBeyondTrailing};
        var list = taxman.getActiveCrossBorderTaxCountries();
        return JSON.stringify(list ? list.map(function(e){ return e.country; }) : []);
      })();
    `, framework.simulationContext);
    const futureTrailing = JSON.parse(futureTrailingJson);
    if (futureTrailing && futureTrailing.indexOf('xx') !== -1) {
      errors.push('Trailing tax for XX should expire after configured period');
    }

    const trailingZJson = vm.runInContext(`
      (function(){
        var taxman = revenue;
        if (!taxman) return [];
        taxman.currentYear = ${yearBeyondTrailing};
        var list = taxman.getActiveCrossBorderTaxCountries();
        return JSON.stringify(list ? list.map(function(e){ return e.country; }) : []);
      })();
    `, framework.simulationContext);
    const trailingZ = JSON.parse(trailingZJson);
    if (Array.isArray(trailingZ) && trailingZ.indexOf('zz') !== -1) {
      errors.push('Trailing list should not include current country ZZ');
    }

    return { success: errors.length === 0, errors };
  }
};
