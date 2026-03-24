const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const RULES = {
  ie: {
    version: 'test-1',
    country: 'IE',
    countryName: 'Ireland',
    taxBasis: 'worldwide',
    locale: { currencyCode: 'EUR', currencySymbol: '€' },
    economicData: {
      inflation: 0.0,
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: {
      bracketsByStatus: { single: { '0': 0.2 }, singleWithDependents: { '0': 0.2 }, married: { '0': 0.2 } },
      taxCredits: {},
      jointBandIncreaseMax: 0,
      ageExemptionAge: 999,
      ageExemptionLimit: 0
    },
    capitalGainsTax: { rate: 0.2, annualExemption: 0, deemedDisposalYears: 8 },
    pensionRules: { lumpSumTaxBands: { '0': 0 } },
    residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
    investmentTypes: [
      {
        key: 'test_exit_tax',
        label: 'Test Exit Tax',
        baseCurrency: 'EUR',
        assetCountry: 'ie',
        residenceScope: 'local',
        taxation: {
          exitTax: {
            rate: 0.4
            // no deemedDisposalYears here, should fallback to 8 (ruleset default)
          }
        }
      }
    ]
  }
};

module.exports = {
  name: 'DeemedDisposalRulesetDefault',
  description: 'Verifies deemed disposal uses ruleset default when asset type omits it.',
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
    installTestTaxRules(framework, deepClone(RULES));

    const result = vm.runInContext(`
      (function () {
        params = {
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
        var typeDef = ieRuleset.findInvestmentTypeByKey('test_exit_tax');
        var asset = new InvestmentAsset(typeDef, 0.1, 0, ieRuleset);
        asset.buy(10000, 'EUR', 'ie');

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

        var resultsByYear = {};
        for (var i = 1; i <= 8; i++) {
            year++;
            // Reset revenue for each year to simulate a fresh year of gains/tax calculation
            revenue.reset(person1, null, attributionManager, currentCountry, year);
            asset.addYear();
            resultsByYear[i] = countDeemedDisposals();
        }

        return { resultsByYear: resultsByYear };
      })()
    `, ctx);

    const year7 = result.resultsByYear[7];
    const year8 = result.resultsByYear[8];

    if (!year7 || year7.count !== 0) {
        errors.push('Expected no deemed disposal after 7 years (interval is 8)');
    }
    if (!year8 || year8.count === 0) {
        errors.push('Expected deemed disposal after 8 years from ruleset default');
    }
    if (!year8 || year8.total <= 0) {
        errors.push('Expected positive deemed disposal amount after 8 years');
    }

    return { success: errors.length === 0, errors };
  }
};
