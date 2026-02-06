const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');
const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const US_RULES = require('../src/core/config/tax-rules-us.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

function approxEqual(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

module.exports = {
  name: 'CrossBorderInvestmentTaxation',
  description: 'Validates cross-border investment withholding, residence taxation, foreign tax credits, and attribution.',
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
    installTestTaxRules(framework, {
      ie: deepClone(IE_RULES),
      us: deepClone(US_RULES),
      ar: deepClone(AR_RULES)
    });

    const treatyCase = vm.runInContext(`
      (function () {
        params = {
          startingAge: 40,
          retirementAge: 65,
          marriageYear: null,
          youngestChildBorn: null,
          oldestChildBorn: null,
          personalTaxCredit: 0,
          taxCreditsByCountry: { ie: { personal: 0 } },
          StartCountry: 'ie'
        };
        currentCountry = 'ie';
        residenceCurrency = 'EUR';
        year = 2026;

        var attributionManager = new AttributionManager();
        attributionManager.reset(currentCountry, year, currentCountry);

        var person1 = { id: 'P1', age: 40 };
        var taxman = new Taxman();
        taxman.reset(person1, null, attributionManager, currentCountry, year);

        taxman.ruleset = new TaxRuleSet({
          country: 'IE',
          locale: { currencyCode: 'EUR' },
          taxBasis: 'worldwide',
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
          pensionRules: { lumpSumTaxBands: { '0': 0 } },
          capitalGainsTax: { rate: 0.2, annualExemption: 0 },
          investmentTypes: []
        });
        taxman.countryHistory = [{ country: 'ie', fromYear: year }];

        taxman.declareOtherIncome(Money.from(4000, 'EUR', 'ie'), 'Baseline Income');
        taxman.declareInvestmentIncome(Money.from(1000, 'EUR', 'ie'), 'US Dividend', 'us');
        taxman.declareInvestmentGains(Money.from(500, 'EUR', 'ie'), 0.2, 'US Gain', {
          category: 'cgt',
          eligibleForAnnualExemption: true,
          allowLossOffset: true
        }, 'us');

        taxman.computeTaxes();
        var beforeIncomeTax = taxman.taxTotals && taxman.taxTotals.incomeTax ? taxman.taxTotals.incomeTax : 0;
        var beforeCapitalGains = taxman.taxTotals && taxman.taxTotals.capitalGains ? taxman.taxTotals.capitalGains : 0;
        var withholding = taxman.taxTotals && taxman.taxTotals.withholding ? taxman.taxTotals.withholding : 0;

        taxman.computeTaxes({
          income: withholding,
          capitalGains: 0,
          treatyExists: true,
          byCountry: { income: { us: withholding } }
        });

        var afterIncomeTax = taxman.taxTotals && taxman.taxTotals.incomeTax ? taxman.taxTotals.incomeTax : 0;
        var creditApplied = beforeIncomeTax - afterIncomeTax;

        var withholdingAttr = taxman.attributionManager.getAttribution('tax:withholding');
        var withholdingUsAttr = taxman.attributionManager.getAttribution('tax:withholding:us');
        var incomeTaxAttr = taxman.attributionManager.getAttribution('tax:incomeTax');
        var incomeTaxUsAttr = taxman.attributionManager.getAttribution('tax:incomeTax:us');

        var hasWithholdingSource = false;
        var hasCreditSlice = false;
        var hasCountryCreditSlice = false;

        if (withholdingAttr) {
          var wb = withholdingAttr.getBreakdown();
          for (var wk in wb) {
            if (wk.indexOf('US Dividend Withholding') >= 0) {
              hasWithholdingSource = true;
            }
          }
        }

        if (incomeTaxAttr) {
          var ib = incomeTaxAttr.getBreakdown();
          for (var ik in ib) {
            if (ik === 'Foreign Tax Credit' && ib[ik] < 0) {
              hasCreditSlice = true;
            }
          }
        }
        if (incomeTaxUsAttr) {
          var iub = incomeTaxUsAttr.getBreakdown();
          for (var iuk in iub) {
            if (iuk === 'Foreign Tax Credit (US)' && iub[iuk] < 0) {
              hasCountryCreditSlice = true;
            }
          }
        }

        return {
          beforeIncomeTax: beforeIncomeTax,
          afterIncomeTax: afterIncomeTax,
          beforeCapitalGains: beforeCapitalGains,
          withholding: withholding,
          creditApplied: creditApplied,
          hasWithholdingSource: hasWithholdingSource,
          hasWithholdingCountryMetric: !!withholdingUsAttr,
          hasCreditSlice: hasCreditSlice,
          hasCountryCreditSlice: hasCountryCreditSlice
        };
      })()
    `, ctx);

    if (!approxEqual(treatyCase.withholding, 300, 0.01)) {
      errors.push('Treaty case: expected US withholding of 300, got ' + treatyCase.withholding);
    }
    if (!approxEqual(treatyCase.beforeCapitalGains, 100, 0.01)) {
      errors.push('Treaty case: expected residence capital gains tax of 100, got ' + treatyCase.beforeCapitalGains);
    }
    if (!approxEqual(treatyCase.creditApplied, Math.min(300, treatyCase.beforeIncomeTax), 0.01)) {
      errors.push('Treaty case: foreign tax credit should be min(withholding, residence income tax)');
    }
    if (!treatyCase.hasWithholdingSource) {
      errors.push('Treaty case: withholding attribution missing US source label');
    }
    if (!treatyCase.hasWithholdingCountryMetric) {
      errors.push('Treaty case: expected tax:withholding:us attribution metric');
    }
    if (!treatyCase.hasCreditSlice) {
      errors.push('Treaty case: expected negative Foreign Tax Credit attribution slice');
    }
    if (!treatyCase.hasCountryCreditSlice) {
      errors.push('Treaty case: expected negative Foreign Tax Credit (US) slice under tax:incomeTax:us');
    }

    const noTreatyCase = vm.runInContext(`
      (function () {
        params = {
          startingAge: 40,
          retirementAge: 65,
          marriageYear: null,
          youngestChildBorn: null,
          oldestChildBorn: null,
          personalTaxCredit: 0,
          taxCreditsByCountry: { ie: { personal: 0 } },
          StartCountry: 'ie'
        };
        currentCountry = 'ie';
        residenceCurrency = 'EUR';
        year = 2026;

        var attributionManager = new AttributionManager();
        attributionManager.reset(currentCountry, year, currentCountry);

        var person1 = { id: 'P1', age: 40 };
        var taxman = new Taxman();
        taxman.reset(person1, null, attributionManager, currentCountry, year);

        taxman.ruleset = new TaxRuleSet({
          country: 'IE',
          locale: { currencyCode: 'EUR' },
          taxBasis: 'worldwide',
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
          pensionRules: { lumpSumTaxBands: { '0': 0 } },
          capitalGainsTax: { rate: 0.2, annualExemption: 0 },
          investmentTypes: []
        });
        taxman.countryHistory = [{ country: 'ie', fromYear: year }];

        var hasTreaty = taxman.ruleset.hasTreatyWith('ar');

        taxman.declareOtherIncome(Money.from(4000, 'EUR', 'ie'), 'Baseline Income');
        taxman.declareInvestmentIncome(Money.from(1000, 'EUR', 'ie'), 'AR Dividend', 'ar');
        taxman.declareInvestmentGains(Money.from(500, 'EUR', 'ie'), 0.2, 'AR Gain', {
          category: 'cgt',
          eligibleForAnnualExemption: true,
          allowLossOffset: true
        }, 'ar');

        taxman.computeTaxes();
        var beforeIncomeTax = taxman.taxTotals && taxman.taxTotals.incomeTax ? taxman.taxTotals.incomeTax : 0;
        var withholding = taxman.taxTotals && taxman.taxTotals.withholding ? taxman.taxTotals.withholding : 0;

        taxman.computeTaxes({ income: 250, treatyExists: false, byCountry: { income: { ar: 250 } } });
        var afterIncomeTax = taxman.taxTotals && taxman.taxTotals.incomeTax ? taxman.taxTotals.incomeTax : 0;

        var incomeTaxAttr = taxman.attributionManager.getAttribution('tax:incomeTax');
        var incomeTaxArAttr = taxman.attributionManager.getAttribution('tax:incomeTax:ar');
        var hasCreditSlice = false;
        var hasCountryCreditSlice = false;
        if (incomeTaxAttr) {
          var bd = incomeTaxAttr.getBreakdown();
          for (var k in bd) {
            if (k === 'Foreign Tax Credit' && bd[k] < 0) {
              hasCreditSlice = true;
            }
          }
        }
        if (incomeTaxArAttr) {
          var adb = incomeTaxArAttr.getBreakdown();
          for (var ak in adb) {
            if (ak.indexOf('Foreign Tax Credit') === 0 && adb[ak] < 0) {
              hasCountryCreditSlice = true;
            }
          }
        }

        return {
          hasTreaty: hasTreaty,
          withholding: withholding,
          beforeIncomeTax: beforeIncomeTax,
          afterIncomeTax: afterIncomeTax,
          hasCreditSlice: hasCreditSlice,
          hasCountryCreditSlice: hasCountryCreditSlice
        };
      })()
    `, ctx);

    if (noTreatyCase.hasTreaty) {
      errors.push('No-treaty case: IE should not have treaty with AR');
    }
    if (!approxEqual(noTreatyCase.beforeIncomeTax, noTreatyCase.afterIncomeTax, 0.01)) {
      errors.push('No-treaty case: foreign tax credit should not reduce residence income tax');
    }
    if (noTreatyCase.hasCreditSlice) {
      errors.push('No-treaty case: attribution should not include Foreign Tax Credit slice');
    }
    if (noTreatyCase.hasCountryCreditSlice) {
      errors.push('No-treaty case: country-suffixed attribution should not include foreign tax credit slice');
    }

    const domesticCase = vm.runInContext(`
      (function () {
        params = {
          startingAge: 40,
          retirementAge: 65,
          marriageYear: null,
          youngestChildBorn: null,
          oldestChildBorn: null,
          personalTaxCredit: 0,
          taxCreditsByCountry: { ie: { personal: 0 } },
          StartCountry: 'ie'
        };
        currentCountry = 'ie';
        residenceCurrency = 'EUR';
        year = 2026;

        var attributionManager = new AttributionManager();
        attributionManager.reset(currentCountry, year, currentCountry);

        var person1 = { id: 'P1', age: 40 };
        var taxman = new Taxman();
        taxman.reset(person1, null, attributionManager, currentCountry, year);

        taxman.ruleset = new TaxRuleSet({
          country: 'IE',
          locale: { currencyCode: 'EUR' },
          taxBasis: 'worldwide',
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
          pensionRules: { lumpSumTaxBands: { '0': 0 } },
          capitalGainsTax: { rate: 0.2, annualExemption: 0 },
          investmentTypes: []
        });
        taxman.countryHistory = [{ country: 'ie', fromYear: year }];

        taxman.declareOtherIncome(Money.from(4000, 'EUR', 'ie'), 'Baseline Income');
        taxman.declareInvestmentIncome(Money.from(1000, 'EUR', 'ie'), 'IE Dividend', 'ie');
        taxman.declareInvestmentGains(Money.from(500, 'EUR', 'ie'), 0.2, 'IE Gain', {
          category: 'cgt',
          eligibleForAnnualExemption: true,
          allowLossOffset: true
        }, 'ie');

        taxman.computeTaxes();

        var withholding = taxman.taxTotals && taxman.taxTotals.withholding ? taxman.taxTotals.withholding : 0;
        var capitalGains = taxman.taxTotals && taxman.taxTotals.capitalGains ? taxman.taxTotals.capitalGains : 0;
        var incomeTaxBefore = taxman.taxTotals && taxman.taxTotals.incomeTax ? taxman.taxTotals.incomeTax : 0;

        taxman.computeTaxes({ income: 500, treatyExists: false });
        var incomeTaxAfter = taxman.taxTotals && taxman.taxTotals.incomeTax ? taxman.taxTotals.incomeTax : 0;
        var withholdingIeAttr = taxman.attributionManager.getAttribution('tax:withholding:ie');

        return {
          withholding: withholding,
          capitalGains: capitalGains,
          incomeTaxBefore: incomeTaxBefore,
          incomeTaxAfter: incomeTaxAfter,
          hasIeWithholdingMetric: !!withholdingIeAttr
        };
      })()
    `, ctx);

    if (!approxEqual(domesticCase.withholding, 0, 0.01)) {
      errors.push('Domestic case: expected no withholding for IE resident holding IE asset');
    }
    if (!approxEqual(domesticCase.capitalGains, 100, 0.01)) {
      errors.push('Domestic case: expected normal CGT of 100');
    }
    if (!approxEqual(domesticCase.incomeTaxBefore, domesticCase.incomeTaxAfter, 0.01)) {
      errors.push('Domestic case: no foreign tax credit should be applied');
    }
    if (domesticCase.hasIeWithholdingMetric) {
      errors.push('Domestic case: should not create tax:withholding:ie metric');
    }

    const mixedCase = vm.runInContext(`
      (function () {
        params = {
          startingAge: 40,
          retirementAge: 65,
          marriageYear: null,
          youngestChildBorn: null,
          oldestChildBorn: null,
          personalTaxCredit: 0,
          taxCreditsByCountry: { ie: { personal: 0 } },
          StartCountry: 'ie'
        };
        currentCountry = 'ie';
        residenceCurrency = 'EUR';
        year = 2026;

        var attributionManager = new AttributionManager();
        attributionManager.reset(currentCountry, year, currentCountry);

        var person1 = { id: 'P1', age: 40 };
        var taxman = new Taxman();
        taxman.reset(person1, null, attributionManager, currentCountry, year);

        taxman.ruleset = new TaxRuleSet({
          country: 'IE',
          locale: { currencyCode: 'EUR' },
          taxBasis: 'worldwide',
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
          pensionRules: { lumpSumTaxBands: { '0': 0 } },
          capitalGainsTax: { rate: 0.2, annualExemption: 0 },
          investmentTypes: []
        });
        taxman.countryHistory = [{ country: 'ie', fromYear: year }];

        taxman.declareOtherIncome(Money.from(5000, 'EUR', 'ie'), 'Baseline Income');

        taxman.declareInvestmentIncome(Money.from(1000, 'EUR', 'ie'), 'US Dividend', 'us');
        taxman.declareInvestmentIncome(Money.from(1000, 'EUR', 'ie'), 'IE Dividend', 'ie');
        taxman.declareInvestmentIncome(Money.from(1000, 'EUR', 'ie'), 'AR Dividend', 'ar');

        taxman.declareInvestmentGains(Money.from(500, 'EUR', 'ie'), 0.2, 'US Gain', { category: 'cgt', eligibleForAnnualExemption: true, allowLossOffset: true }, 'us');
        taxman.declareInvestmentGains(Money.from(500, 'EUR', 'ie'), 0.2, 'IE Gain', { category: 'cgt', eligibleForAnnualExemption: true, allowLossOffset: true }, 'ie');
        taxman.declareInvestmentGains(Money.from(500, 'EUR', 'ie'), 0.2, 'AR Gain', { category: 'cgt', eligibleForAnnualExemption: true, allowLossOffset: true }, 'ar');

        taxman.computeTaxes();
        var beforeIncomeTax = taxman.taxTotals && taxman.taxTotals.incomeTax ? taxman.taxTotals.incomeTax : 0;
        var withholding = taxman.taxTotals && taxman.taxTotals.withholding ? taxman.taxTotals.withholding : 0;
        var capitalGains = taxman.taxTotals && taxman.taxTotals.capitalGains ? taxman.taxTotals.capitalGains : 0;

        taxman.computeTaxes({ income: withholding, treatyExists: true });
        var afterIncomeTax = taxman.taxTotals && taxman.taxTotals.incomeTax ? taxman.taxTotals.incomeTax : 0;

        var usMetric = taxman.attributionManager.getAttribution('tax:withholding:us');
        var ieMetric = taxman.attributionManager.getAttribution('tax:withholding:ie');
        var arMetric = taxman.attributionManager.getAttribution('tax:withholding:ar');

        return {
          withholding: withholding,
          capitalGains: capitalGains,
          beforeIncomeTax: beforeIncomeTax,
          afterIncomeTax: afterIncomeTax,
          hasUsMetric: !!usMetric,
          hasIeMetric: !!ieMetric,
          hasArMetric: !!arMetric
        };
      })()
    `, ctx);

    if (!approxEqual(mixedCase.withholding, 300, 0.01)) {
      errors.push('Mixed portfolio: expected withholding only from US component (300), got ' + mixedCase.withholding);
    }
    if (!approxEqual(mixedCase.capitalGains, 300, 0.01)) {
      errors.push('Mixed portfolio: expected capital gains tax of 300, got ' + mixedCase.capitalGains);
    }
    if (!approxEqual(mixedCase.beforeIncomeTax - mixedCase.afterIncomeTax, Math.min(300, mixedCase.beforeIncomeTax), 0.01)) {
      errors.push('Mixed portfolio: expected foreign tax credit to reduce income tax by min(300, residence income tax)');
    }
    if (!mixedCase.hasUsMetric) {
      errors.push('Mixed portfolio: expected tax:withholding:us attribution metric');
    }
    if (mixedCase.hasIeMetric || mixedCase.hasArMetric) {
      errors.push('Mixed portfolio: unexpected withholding attribution metrics for IE/AR');
    }

    const domesticBasisCase = vm.runInContext(`
      (function () {
        params = {
          startingAge: 40,
          retirementAge: 65,
          marriageYear: null,
          youngestChildBorn: null,
          oldestChildBorn: null,
          personalTaxCredit: 0,
          taxCreditsByCountry: { ar: { personal: 0 } },
          StartCountry: 'ar'
        };
        currentCountry = 'ar';
        residenceCurrency = 'ARS';
        year = 2026;

        var attributionManager = new AttributionManager();
        attributionManager.reset(currentCountry, year, currentCountry);

        var person1 = { id: 'P1', age: 40 };
        var taxman = new Taxman();
        taxman.reset(person1, null, attributionManager, currentCountry, year);

        taxman.ruleset = new TaxRuleSet({
          country: 'AR',
          locale: { currencyCode: 'ARS' },
          taxBasis: 'domestic',
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
          pensionRules: { lumpSumTaxBands: { '0': 0 } },
          capitalGainsTax: { rate: 0.2, annualExemption: 0 },
          investmentTypes: []
        });
        taxman.countryHistory = [{ country: 'ar', fromYear: year }];

        taxman.declareInvestmentIncome(Money.from(1000, 'ARS', 'ar'), 'US Dividend', 'us');
        taxman.declareInvestmentGains(Money.from(1000, 'ARS', 'ar'), 0.2, 'US Gain', { category: 'cgt', eligibleForAnnualExemption: true, allowLossOffset: true }, 'us');
        taxman.declareInvestmentGains(Money.from(1000, 'ARS', 'ar'), 0.2, 'AR Gain', { category: 'cgt', eligibleForAnnualExemption: true, allowLossOffset: true }, 'ar');

        taxman.computeTaxes();

        return {
          withholding: taxman.taxTotals && taxman.taxTotals.withholding ? taxman.taxTotals.withholding : 0,
          capitalGains: taxman.taxTotals && taxman.taxTotals.capitalGains ? taxman.taxTotals.capitalGains : 0
        };
      })()
    `, ctx);

    if (!approxEqual(domesticBasisCase.withholding, 300, 0.01)) {
      errors.push('Domestic tax-basis case: expected foreign US withholding of 300');
    }
    if (!approxEqual(domesticBasisCase.capitalGains, 200, 0.01)) {
      errors.push('Domestic tax-basis case: expected only domestic AR gains taxed (200), got ' + domesticBasisCase.capitalGains);
    }

    const assetIntegrationCase = vm.runInContext(`
      (function () {
        currentCountry = 'ie';
        residenceCurrency = 'EUR';
        year = 2026;

        var captured = {
          incomeCountry: null,
          gainsCountry: null,
          incomeLabel: null,
          gainsLabel: null
        };

        revenue = {
          declareInvestmentIncome: function (money, description, assetCountry) {
            captured.incomeCountry = assetCountry;
            captured.incomeLabel = description;
          },
          declareInvestmentGains: function (money, taxRate, description, options, assetCountry) {
            captured.gainsCountry = assetCountry;
            captured.gainsLabel = description;
          }
        };

        var asset = new InvestmentAsset({
          key: 'test_us_asset',
          label: 'Test US Asset',
          baseCurrency: 'EUR',
          assetCountry: 'us',
          taxation: {
            capitalGains: {
              rate: 0.2,
              allowLossOffset: true,
              eligibleForAnnualExemption: true
            }
          }
        }, 0, 0, null);

        asset.declareRevenue(1000, 500);

        return captured;
      })()
    `, ctx);

    if (assetIntegrationCase.incomeCountry !== 'us') {
      errors.push('InvestmentAsset integration: declareInvestmentIncome should receive assetCountry=us');
    }
    if (assetIntegrationCase.gainsCountry !== 'us') {
      errors.push('InvestmentAsset integration: declareInvestmentGains should receive assetCountry=us');
    }

    const relocationAndTimelineCase = vm.runInContext(`
      (function () {
        function createRules(countryCode, currencyCode, basis) {
          return new TaxRuleSet({
            country: countryCode.toUpperCase(),
            locale: { currencyCode: currencyCode },
            taxBasis: basis,
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
            pensionRules: { lumpSumTaxBands: { '0': 0 } },
            capitalGainsTax: { rate: 0.2, annualExemption: 0 },
            investmentTypes: []
          });
        }

        function runYear(residenceCountry, currencyCode, basis, treatyExistsForUS) {
          params = {
            startingAge: 40,
            retirementAge: 65,
            marriageYear: null,
            youngestChildBorn: null,
            oldestChildBorn: null,
            personalTaxCredit: 0,
            StartCountry: residenceCountry
          };
          currentCountry = residenceCountry;
          residenceCurrency = currencyCode;
          year = 2026;

          var attributionManager = new AttributionManager();
          attributionManager.reset(currentCountry, year, currentCountry);

          var person1 = { id: 'P1', age: 40 };
          var taxman = new Taxman();
          taxman.reset(person1, null, attributionManager, currentCountry, year);
          taxman.ruleset = createRules(residenceCountry, currencyCode, basis);
          taxman.countryHistory = [{ country: residenceCountry, fromYear: year }];

          taxman.declareOtherIncome(Money.from(4000, currencyCode, residenceCountry), 'Baseline Income');

          taxman.declareInvestmentIncome(Money.from(1000, currencyCode, residenceCountry), 'US Dividend', 'us');
          taxman.declareInvestmentIncome(Money.from(1000, currencyCode, residenceCountry), 'IE Dividend', 'ie');
          taxman.declareInvestmentIncome(Money.from(1000, currencyCode, residenceCountry), 'AR Dividend', 'ar');

          taxman.declareInvestmentGains(Money.from(500, currencyCode, residenceCountry), 0.2, 'US Gain', { category: 'cgt', eligibleForAnnualExemption: true, allowLossOffset: true }, 'us');
          taxman.declareInvestmentGains(Money.from(500, currencyCode, residenceCountry), 0.2, 'IE Gain', { category: 'cgt', eligibleForAnnualExemption: true, allowLossOffset: true }, 'ie');
          taxman.declareInvestmentGains(Money.from(500, currencyCode, residenceCountry), 0.2, 'AR Gain', { category: 'cgt', eligibleForAnnualExemption: true, allowLossOffset: true }, 'ar');

          taxman.computeTaxes();

          var baseIncomeTax = taxman.taxTotals && taxman.taxTotals.incomeTax ? taxman.taxTotals.incomeTax : 0;
          var baseCapitalGains = taxman.taxTotals && taxman.taxTotals.capitalGains ? taxman.taxTotals.capitalGains : 0;
          var withholding = taxman.taxTotals && taxman.taxTotals.withholding ? taxman.taxTotals.withholding : 0;

          taxman.computeTaxes({ income: withholding, treatyExists: treatyExistsForUS });

          var creditedIncomeTax = taxman.taxTotals && taxman.taxTotals.incomeTax ? taxman.taxTotals.incomeTax : 0;

          return {
            residenceCountry: residenceCountry,
            basis: basis,
            withholding: withholding,
            baseIncomeTax: baseIncomeTax,
            creditedIncomeTax: creditedIncomeTax,
            capitalGains: baseCapitalGains
          };
        }

        return {
          ieYear: runYear('ie', 'EUR', 'worldwide', true),
          usYear: runYear('us', 'USD', 'worldwide', true),
          arYear: runYear('ar', 'ARS', 'domestic', false)
        };
      })()
    `, ctx);

    if (!approxEqual(relocationAndTimelineCase.ieYear.withholding, 300, 0.01)) {
      errors.push('Timeline case (IE residence): expected US withholding 300');
    }
    if (!approxEqual(relocationAndTimelineCase.ieYear.capitalGains, 300, 0.01)) {
      errors.push('Timeline case (IE residence): expected worldwide gains taxation of 300');
    }
    if (!approxEqual(relocationAndTimelineCase.ieYear.baseIncomeTax - relocationAndTimelineCase.ieYear.creditedIncomeTax, 300, 0.01)) {
      errors.push('Timeline case (IE residence): expected treaty credit of 300');
    }

    if (!approxEqual(relocationAndTimelineCase.usYear.withholding, 0, 0.01)) {
      errors.push('Timeline case (US residence): US assets are domestic and should not incur withholding');
    }
    if (!approxEqual(relocationAndTimelineCase.usYear.capitalGains, 300, 0.01)) {
      errors.push('Timeline case (US residence): expected worldwide gains taxation of 300');
    }

    if (!approxEqual(relocationAndTimelineCase.arYear.withholding, 300, 0.01)) {
      errors.push('Timeline case (AR residence): expected US withholding 300 on foreign US asset');
    }
    if (!approxEqual(relocationAndTimelineCase.arYear.capitalGains, 100, 0.01)) {
      errors.push('Timeline case (AR residence): expected domestic-basis gains taxation of 100');
    }
    if (!approxEqual(relocationAndTimelineCase.arYear.baseIncomeTax, relocationAndTimelineCase.arYear.creditedIncomeTax, 0.01)) {
      errors.push('Timeline case (AR residence): no treaty credit should be applied');
    }

    const relocationActivationCase = vm.runInContext(`
      (function () {
        params = {
          startingAge: 40,
          retirementAge: 65,
          marriageYear: null,
          youngestChildBorn: null,
          oldestChildBorn: null,
          personalTaxCredit: 0,
          taxCreditsByCountry: { ie: { personal: 0 } },
          StartCountry: 'ie'
        };
        currentCountry = 'ie';
        residenceCurrency = 'EUR';
        year = 2026;

        var attributionManager = new AttributionManager();
        attributionManager.reset(currentCountry, year, currentCountry);

        var person1 = { id: 'P1', age: 40 };
        var taxman = new Taxman();
        taxman.reset(person1, null, attributionManager, currentCountry, year);

        taxman.ruleset = new TaxRuleSet({
          country: 'IE',
          locale: { currencyCode: 'EUR' },
          taxBasis: 'worldwide',
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
          pensionRules: { lumpSumTaxBands: { '0': 0 } },
          capitalGainsTax: { rate: 0.2, annualExemption: 0 },
          investmentTypes: []
        });

        // Single-country setup (no relocation timeline)
        taxman.countryHistory = [{ country: 'ie', fromYear: year }];

        taxman.declareOtherIncome(Money.from(4000, 'EUR', 'ie'), 'Baseline Income');
        taxman.declareInvestmentIncome(Money.from(1000, 'EUR', 'ie'), 'US Dividend', 'us');

        taxman.computeTaxes();
        var beforeIncomeTax = taxman.taxTotals && taxman.taxTotals.incomeTax ? taxman.taxTotals.incomeTax : 0;
        var withholding = taxman.taxTotals && taxman.taxTotals.withholding ? taxman.taxTotals.withholding : 0;

        taxman.computeTaxes({ income: withholding, treatyExists: true });

        var afterIncomeTax = taxman.taxTotals && taxman.taxTotals.incomeTax ? taxman.taxTotals.incomeTax : 0;

        return {
          historyLength: taxman.countryHistory ? taxman.countryHistory.length : 0,
          withholding: withholding,
          creditApplied: beforeIncomeTax - afterIncomeTax
        };
      })()
    `, ctx);

    if (relocationActivationCase.historyLength !== 1) {
      errors.push('Relocation activation case: expected single-country history');
    }
    if (!approxEqual(relocationActivationCase.withholding, 300, 0.01)) {
      errors.push('Relocation activation case: withholding should apply without relocation events');
    }
    if (!approxEqual(relocationActivationCase.creditApplied, 300, 0.01)) {
      errors.push('Relocation activation case: treaty credit should still apply without relocation events');
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};
