const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const TRAILING_RULES = {
  ie: {
    version: 'test-1',
    country: 'IE',
    countryName: 'Ireland',
    taxBasis: 'worldwide',
    locale: { currencyCode: 'EUR', currencySymbol: '€' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
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
    capitalGainsTax: { rate: 0.2, annualExemption: 0 },
    pensionRules: { lumpSumTaxBands: { '0': 0 } },
    residencyRules: { postEmigrationTaxYears: 3, taxesForeignIncome: true },
    investmentTypes: [
      {
        key: 'indexFunds_ie',
        label: 'Index Funds',
        baseCurrency: 'EUR',
        assetCountry: 'ie',
        residenceScope: 'local',
        taxation: {
          exitTax: {
            rate: 0.4,
            deemedDisposalYears: 2,
            allowLossOffset: false,
            eligibleForAnnualExemption: false
          }
        }
      }
    ]
  },
  ar: {
    version: 'test-1',
    country: 'AR',
    countryName: 'Argentina',
    taxBasis: 'domestic',
    locale: { currencyCode: 'EUR', currencySymbol: '€' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
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
    capitalGainsTax: { rate: 0.15, annualExemption: 0 },
    pensionRules: { lumpSumTaxBands: { '0': 0 } },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    investmentTypes: []
  }
};

module.exports = {
  name: 'DeemedDisposalTrailingResidency',
  description: 'Applies deemed disposal when tax residency trails after relocation.',
  isCustomTest: true,
  runCustomTest: async function () {
    const errors = [];
    const framework = new TestFramework();

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    framework.ensureVMUIManagerMocks(null, null);
    const ctx = framework.simulationContext;
    await vm.runInContext('Config.initialize(WebUI.getInstance())', ctx);
    installTestTaxRules(framework, deepClone(TRAILING_RULES));

    const result = vm.runInContext(`
      (function () {
        params = {
          marriageYear: null,
          youngestChildBorn: null,
          oldestChildBorn: null,
          simulation_mode: 'single',
          economy_mode: 'deterministic'
        };
        currentCountry = 'ie';
        residenceCurrency = 'EUR';
        year = 2025;

        var attributionManager = new AttributionManager();
        attributionManager.reset(currentCountry, year, currentCountry);
        var person1 = { id: 'P1', age: 30 };
        revenue = new Taxman();
        revenue.reset(person1, null, attributionManager, currentCountry, year);

        var cfg = Config.getInstance();
        var ieRuleset = cfg.getCachedTaxRuleSet('ie');
        var typeDef = ieRuleset.findInvestmentTypeByKey('indexFunds_ie');
        var asset = new InvestmentAsset(typeDef, 0.1, 0, ieRuleset);
        asset.buy(10000, 'EUR', 'ie');

        asset.addYear();

        currentCountry = 'ar';
        residenceCurrency = 'EUR';

        function countDeemedDisposals() {
          var entries = [];
          for (var rate in (revenue.gains || {})) {
            var bucket = revenue.gains[rate];
            var rows = (bucket && bucket.entries) ? bucket.entries : [];
            for (var i = 0; i < rows.length; i++) {
              if (rows[i] && rows[i].description && rows[i].description.indexOf('Deemed Disposal') >= 0) {
                entries.push(rows[i]);
              }
            }
          }
          var total = 0;
          for (var j = 0; j < entries.length; j++) {
            total += entries[j].amount || 0;
          }
          return { count: entries.length, total: total };
        }

        var countsByYear = {};
        var years = [2026, 2027, 2028, 2029, 2030];
        for (var y = 0; y < years.length; y++) {
          year = years[y];
          revenue.reset(person1, null, attributionManager, currentCountry, year);
          asset.addYear();
          countsByYear[year] = countDeemedDisposals();
        }

        return { countsByYear: countsByYear };
      })()
    `, ctx);

    var inTrailing = result && result.countsByYear && result.countsByYear[2026];
    if (!inTrailing || inTrailing.count === 0) {
      errors.push('Expected deemed disposal gains during trailing residency');
    }
    if (!inTrailing || !(inTrailing.total > 0)) {
      errors.push('Expected positive deemed disposal gains during trailing residency');
    }
    var beyondTrailing = result && result.countsByYear && result.countsByYear[2030];
    if (!beyondTrailing || beyondTrailing.count !== 0) {
      errors.push('Expected no deemed disposal gains after trailing residency ends');
    }

    return { success: errors.length === 0, errors };
  }
};
