const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const PENSION_RULES = {
  uu: {
    version: 'pension-test',
    country: 'UU',
    countryName: 'Country U',
    locale: { currencyCode: 'UUU', currencySymbol: '¤U' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: { brackets: { '0': 0.2 }, taxCredits: { employee: 0, personal: 0 } },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    pensionRules: {
      systemType: 'mixed',
      contributionLimits: {
        annualCap: 100000,
        ageBandsPercent: { '0': 1 }
      }
    },
    capitalGainsTax: { rate: 0.2, annualExemption: 0 }
  },
  vv: {
    version: 'pension-test',
    country: 'VV',
    countryName: 'Country V',
    locale: { currencyCode: 'VVV', currencySymbol: '¤V' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: { brackets: { '0': 0.15 }, taxCredits: { employee: 0, personal: 0 } },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    pensionRules: { systemType: 'state_only' },
    capitalGainsTax: { rate: 0.15, annualExemption: 0 }
  }
};

function findRowByAge(rows, age) {
  return rows.find(r => r && typeof r === 'object' && r.age === age);
}

module.exports = {
  name: 'PensionSystemConflicts',
  description: 'Validates pension contributions across mixed/state-only systems.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const scenarioDefinition = {
      name: 'PensionRelocation',
      description: 'Relocate between mixed and state-only pension systems.',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 42,
          retirementAge: 65,
          initialSavings: 0,
          inflation: 0,
          StartCountry: 'uu',
          simulation_mode: 'single',
          economy_mode: 'deterministic',
          relocationEnabled: true,
          growthRatePension: 0,
          growthDevPension: 0,
          pensionPercentage: 0.05,
          pensionPercentageP2: 0
        },
        events: [
          { type: 'SI', id: 'salary-uu', amount: 60000, fromAge: 30, toAge: 34, currency: 'UUU', match: 0.05 },
          { type: 'MV-vv', id: 'move-vv', amount: 0, fromAge: 35, toAge: 35 },
          { type: 'SInp', id: 'salary-vv', amount: 70000, fromAge: 35, toAge: 38, currency: 'VVV' },
          { type: 'MV-uu', id: 'return-uu', amount: 0, fromAge: 39, toAge: 39 },
          { type: 'SI', id: 'salary-uu-return', amount: 65000, fromAge: 40, toAge: 42, currency: 'UUU', match: 0.05 }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenarioDefinition)) {
      return { success: false, errors: ['Failed to load pension scenario'] };
    }

    installTestTaxRules(framework, deepClone(PENSION_RULES));

    vm.runInContext(`
      (function(){
        __pensionContributionLog = [];
        var original = Taxman.prototype.declareSalaryIncome;
        Taxman.prototype.declareSalaryIncome = function(money, contribRate, person, description) {
          var before = this.pensionContribAmountP1;
          var result = original.apply(this, arguments);
          var after = this.pensionContribAmountP1;
          __pensionContributionLog.push({
            year: this.currentYear,
            description: description,
            contributionDelta: (after - before)
          });
          return result;
        };
      })();
    `, framework.simulationContext);
    const results = await framework.runSimulation();
    if (!results || !results.success) {
      return { success: false, errors: ['Pension scenario failed to run'] };
    }

    const rows = results.dataSheet.filter(r => r && typeof r === 'object');
    const logJson = vm.runInContext('JSON.stringify(__pensionContributionLog || [])', framework.simulationContext);
    const entries = JSON.parse(logJson);
    const preContribution = entries.filter(e => e.description === 'salary-uu').reduce((sum, e) => sum + e.contributionDelta, 0);
    const stateContribution = entries.filter(e => e.description === 'salary-vv').reduce((sum, e) => sum + e.contributionDelta, 0);
    const returnContribution = entries.filter(e => e.description === 'salary-uu-return').reduce((sum, e) => sum + e.contributionDelta, 0);

    if (!(preContribution > 0)) {
      return { success: false, errors: ['Pre-relocation salary should create pension contributions'] };
    }
    if (Math.abs(stateContribution) > 1e-6) {
      return { success: false, errors: ['State-only salary should not create pension contributions'] };
    }
    if (!(returnContribution > 0)) {
      return { success: false, errors: ['Post-relocation salary should resume contributions'] };
    }

    const historyJson = vm.runInContext(
      'JSON.stringify(revenue && revenue.countryHistory ? revenue.countryHistory : [])',
      framework.simulationContext
    );
    const history = JSON.parse(historyJson);
    const order = history.map(entry => entry.country);
    if (!(order.indexOf('uu') !== -1 && order.indexOf('vv') !== -1)) {
      return { success: false, errors: ['Country history missing expected entries'] };
    }

    return { success: true, errors: [] };
  }
};
