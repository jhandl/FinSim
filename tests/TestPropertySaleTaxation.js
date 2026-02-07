const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const US_RULES = require('../src/core/config/tax-rules-us.json');

module.exports = {
  name: 'TestPropertySaleTaxation',
  description: 'Validates property sale taxation gates, primary residence relief, and source-country behavior.',
  isCustomTest: true,
  runCustomTest: async function () {
    const framework = new TestFramework();

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    framework.ensureVMUIManagerMocks(null, null);
    await vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);

    const ieRules = deepClone(IE_RULES);
    ieRules.capitalGainsTax = ieRules.capitalGainsTax || {};
    ieRules.capitalGainsTax.annualExemption = 0;

    const usRules = deepClone(US_RULES);
    usRules.capitalGainsTax = usRules.capitalGainsTax || {};
    usRules.capitalGainsTax.rate = 0.2;
    usRules.capitalGainsTax.annualExemption = 0;
    usRules.propertyGainsTax = {
      taxRef: 'capitalGains',
      primaryResidenceExemption: {
        enabled: true,
        proportional: true
      },
      holdingPeriodExemptionYears: null,
      residentsOnly: false,
      capitalGainsOptions: {
        rateRef: 'capitalGainsTax.rate',
        eligibleForAnnualExemption: true,
        allowLossOffset: true
      }
    };

    installTestTaxRules(framework, {
      ie: deepClone(ieRules),
      us: deepClone(usRules)
    });

    const testJson = vm.runInContext(`
      (function () {
        var errors = [];

        function approxEqual(actual, expected, tolerance) {
          return Math.abs(actual - expected) <= tolerance;
        }

        function makeTaxman(rawRules, countryCode, currencyCode, age) {
          params = {
            startingAge: 30,
            retirementAge: 65,
            marriageYear: null,
            youngestChildBorn: null,
            oldestChildBorn: null,
            personalTaxCredit: 0,
            taxCreditsByCountry: {},
            StartCountry: countryCode,
            inflation: 0
          };
          currentCountry = countryCode;
          residenceCurrency = currencyCode;
          year = 2026;

          var attr = new AttributionManager();
          attr.reset(currentCountry, year, currentCountry);

          var p1 = { id: 'P1', age: age || 40, yearlyIncomeStatePensionByCountry: {} };
          var tm = new Taxman();
          tm.reset(p1, null, attr, currentCountry, year);
          tm.ruleset = new TaxRuleSet(rawRules);
          tm.residenceCurrency = currencyCode;

          return tm;
        }

        var ieRules = ${JSON.stringify(ieRules)};
        var usRules = ${JSON.stringify(usRules)};

        // 1) IE resident sells IE primary residence after 10 years -> full exemption
        var re1 = new RealEstate();
        re1.buy('home1', 300000, 0, 'EUR', 'ie');
        var timeline1 = [{ fromAge: 30, toAge: 39, country: 'ie' }];
        var proportion1 = re1.getPrimaryResidenceProportion('home1', 30, 40, timeline1, []);
        if (!approxEqual(proportion1, 1, 1e-9)) {
          errors.push('Scenario 1: expected full primary residence proportion (1.0), got ' + proportion1);
        }
        var tm1 = makeTaxman(ieRules, 'ie', 'EUR', 40);
        tm1.declarePropertyGain(Money.create(100000, 'EUR', 'ie'), 10, 'ie', proportion1, 'ie', 'S1');
        tm1.computeTaxes();
        if (!approxEqual(tm1.getTaxByType('capitalGains'), 0, 1e-6)) {
          errors.push('Scenario 1: expected zero capital gains tax for full primary residence exemption');
        }

        // 2) IE resident sells IE property with 5/10 rental years -> 50% exemption
        var re2 = new RealEstate();
        re2.buy('home2', 300000, 0, 'EUR', 'ie');
        var timeline2 = [{ fromAge: 30, toAge: 39, country: 'ie' }];
        var rentals2 = [{ type: 'RI', id: 'home2', fromAge: 35, toAge: 39 }];
        var proportion2 = re2.getPrimaryResidenceProportion('home2', 30, 40, timeline2, rentals2);
        if (!approxEqual(proportion2, 0.5, 1e-9)) {
          errors.push('Scenario 2: expected 0.5 primary residence proportion, got ' + proportion2);
        }
        var tm2 = makeTaxman(ieRules, 'ie', 'EUR', 40);
        tm2.declarePropertyGain(Money.create(100000, 'EUR', 'ie'), 10, 'ie', proportion2, 'ie', 'S2');
        tm2.computeTaxes();
        var expectedTax2 = 100000 * (1 - 0.5) * ieRules.capitalGainsTax.rate;
        if (!approxEqual(tm2.getTaxByType('capitalGains'), expectedTax2, 1e-6)) {
          errors.push('Scenario 2: expected partial-tax amount ' + expectedTax2 + ', got ' + tm2.getTaxByType('capitalGains'));
        }

        // 3) IE resident sells US property -> source-country taxation (US rules)
        var re3 = new RealEstate();
        re3.buy('home3', 300000, 0, 'EUR', 'us');
        var timeline3 = [{ fromAge: 30, toAge: 39, country: 'ie' }];
        var proportion3 = re3.getPrimaryResidenceProportion('home3', 30, 40, timeline3, []);
        var tm3 = makeTaxman(usRules, 'us', 'EUR', 40);
        tm3.declarePropertyGain(Money.create(100000, 'EUR', 'us'), 10, 'ie', proportion3, 'us', 'S3');
        tm3.computeTaxes();
        var expectedTax3 = 100000 * usRules.capitalGainsTax.rate;
        if (!approxEqual(tm3.getTaxByType('capitalGains'), expectedTax3, 1e-6)) {
          errors.push('Scenario 3: expected source-country capital gains tax ' + expectedTax3 + ', got ' + tm3.getTaxByType('capitalGains'));
        }

        // 4) US resident sells IE property when residentsOnly=true -> no taxation
        var ieResidentsOnlyRules = JSON.parse(JSON.stringify(ieRules));
        ieResidentsOnlyRules.propertyGainsTax.residentsOnly = true;
        var tm4 = makeTaxman(ieResidentsOnlyRules, 'ie', 'EUR', 40);
        tm4.declarePropertyGain(Money.create(100000, 'EUR', 'ie'), 10, 'us', 0, 'ie', 'S4');
        tm4.computeTaxes();
        if (!approxEqual(tm4.getTaxByType('capitalGains'), 0, 1e-6)) {
          errors.push('Scenario 4: expected residents-only gate to exempt tax when resident country differs');
        }

        // 5) Held 5+ years with holding period cliff exemption -> no taxation
        var ieHoldingExemptRules = JSON.parse(JSON.stringify(ieRules));
        ieHoldingExemptRules.propertyGainsTax.holdingPeriodExemptionYears = 5;
        var tm5 = makeTaxman(ieHoldingExemptRules, 'ie', 'EUR', 40);
        tm5.declarePropertyGain(Money.create(100000, 'EUR', 'ie'), 5, 'ie', 0, 'ie', 'S5');
        tm5.computeTaxes();
        if (!approxEqual(tm5.getTaxByType('capitalGains'), 0, 1e-6)) {
          errors.push('Scenario 5: expected holding-period exemption to remove tax');
        }

        // 6) No purchase basis -> no taxation path (backward compatibility)
        var re6 = new RealEstate();
        var basis6 = re6.getPurchaseBasis('missing-home');
        if (!approxEqual(basis6, 0, 1e-9)) {
          errors.push('Scenario 6: expected missing property purchase basis to be 0, got ' + basis6);
        }
        var tm6 = makeTaxman(ieRules, 'ie', 'EUR', 40);
        var saleProceeds6 = 150000;
        if (basis6 > 0 && saleProceeds6 > basis6) {
          tm6.declarePropertyGain(Money.create(saleProceeds6 - basis6, 'EUR', 'ie'), 10, 'ie', 0, 'ie', 'S6');
        }
        tm6.computeTaxes();
        if (!approxEqual(tm6.getTaxByType('capitalGains'), 0, 1e-6)) {
          errors.push('Scenario 6: expected no taxation when purchase basis is missing');
        }

        return JSON.stringify({ success: errors.length === 0, errors: errors });
      })();
    `, framework.simulationContext);

    const testResult = JSON.parse(testJson);
    return testResult;
  }
};
