const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
const { Taxman } = require('../src/core/Taxman.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const US_RULES = require('../src/core/config/tax-rules-us.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

function loadRuleset(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return new TaxRuleSet(raw);
}

module.exports = {
  name: 'CrossBorderTaxInfrastructure',
  description: 'Validates residency timeline caching, treaty metadata, and foreign tax credits.',
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
    await vm.runInContext('Promise.all([Config.getInstance().getTaxRuleSet("us"), Config.getInstance().getTaxRuleSet("ar")])', ctx);

    // Test 1: Residency timeline derivation + caching
    const timelineParams = { StartCountry: 'ie', startingAge: 30, targetAge: 60 };
    const timelineEvents = [
      { type: 'MV-US', id: 'move-us', fromAge: 35, toAge: 35 },
      { type: 'MV-AR', id: 'move-ar', fromAge: 45, toAge: 45 }
    ];
    const timeline = vm.runInContext(
      'residencyTimeline = null; getResidencyTimeline('
      + JSON.stringify(timelineParams) + ', '
      + JSON.stringify(timelineEvents) + ')',
      ctx
    );

    if (!Array.isArray(timeline) || timeline.length !== 3) {
      errors.push('Residency timeline should have 3 entries');
    } else {
      const first = timeline[0];
      const second = timeline[1];
      const third = timeline[2];
      if (!(first.fromAge === 30 && first.toAge === 34 && first.country === 'ie')) {
        errors.push('Residency timeline entry 1 mismatch');
      }
      if (!(second.fromAge === 35 && second.toAge === 44 && second.country === 'us')) {
        errors.push('Residency timeline entry 2 mismatch');
      }
      if (!(third.fromAge === 45 && third.toAge === 59 && third.country === 'ar')) {
        errors.push('Residency timeline entry 3 mismatch');
      }
    }

    const cachedSame = vm.runInContext(
      'residencyTimeline = null;'
      + 'var p = ' + JSON.stringify(timelineParams) + ';'
      + 'var e = ' + JSON.stringify(timelineEvents) + ';'
      + 'var first = getResidencyTimeline(p, e);'
      + 'var second = getResidencyTimeline(p, e);'
      + '(first === second);',
      ctx
    );
    if (cachedSame !== true) {
      errors.push('Residency timeline should be cached within a run');
    }

    // Test 2: Tax basis configuration
    const ieRules = loadRuleset(path.join(__dirname, '..', 'src', 'core', 'config', 'tax-rules-ie.json'));
    const usRules = loadRuleset(path.join(__dirname, '..', 'src', 'core', 'config', 'tax-rules-us.json'));
    const arRules = loadRuleset(path.join(__dirname, '..', 'src', 'core', 'config', 'tax-rules-ar.json'));
    const missingBasis = new TaxRuleSet({ country: 'ZZ', locale: { currencyCode: 'ZZZ' } });

    if (ieRules.getTaxBasis() !== 'worldwide') errors.push('IE taxBasis should be worldwide');
    if (usRules.getTaxBasis() !== 'worldwide') errors.push('US taxBasis should be worldwide');
    if (arRules.getTaxBasis() !== 'domestic') errors.push('AR taxBasis should be domestic');
    if (missingBasis.getTaxBasis() !== 'worldwide') errors.push('Missing taxBasis should default to worldwide');

    // Test 3: Treaty existence checks
    const treatyChecks = vm.runInContext(
      'var ieRaw = ' + JSON.stringify(IE_RULES) + ';'
      + 'var usRaw = ' + JSON.stringify(US_RULES) + ';'
      + 'var arRaw = ' + JSON.stringify(AR_RULES) + ';'
      + 'var ieSet = new TaxRuleSet(ieRaw);'
      + 'var usSet = new TaxRuleSet(usRaw);'
      + 'var arSet = new TaxRuleSet(arRaw);'
      + '({'
      + ' ieUs: ieSet.hasTreatyWith("us"),'
      + ' ieAr: ieSet.hasTreatyWith("ar"),'
      + ' usIe: usSet.hasTreatyWith("ie"),'
      + ' arIe: arSet.hasTreatyWith("ie")'
      + '});',
      ctx
    );

    if (!treatyChecks.ieUs) errors.push('IE should have treaty with US');
    if (treatyChecks.ieAr) errors.push('IE should not have treaty with AR');
    if (!treatyChecks.usIe) errors.push('US should have treaty with IE');
    if (treatyChecks.arIe) errors.push('AR should not have treaty with IE');

    // Test 4: Foreign tax credit computation
    const taxman = new Taxman();
    if (taxman.applyForeignTaxCredit(1000, 1500, true) !== 1000) {
      errors.push('Foreign tax credit should be min(1000, 1500) when treaty exists');
    }
    if (taxman.applyForeignTaxCredit(2000, 1500, true) !== 1500) {
      errors.push('Foreign tax credit should be min(2000, 1500) when treaty exists');
    }
    if (taxman.applyForeignTaxCredit(1000, 1500, false) !== 0) {
      errors.push('Foreign tax credit should be 0 when no treaty exists');
    }

    // Test 5: Treaty bucket aggregation
    const buckets = taxman.aggregateTreatyBuckets(
      { incomeTax: 500, socialContrib: 200 },
      { incomeTax: 'income', socialContrib: 'income' }
    );
    if (!buckets || buckets.income !== 700) {
      errors.push('Treaty bucket aggregation should sum mapped taxes into income bucket');
    }

    // Test 6: Domestic vs worldwide tax basis filtering
    const basisResults = vm.runInContext(
      '(function () {'
      + 'var makeTaxman = function (basis) {'
      + '  var rs = new TaxRuleSet({'
      + '    country: "IE",'
      + '    locale: { currencyCode: "EUR" },'
      + '    taxBasis: basis,'
      + '    incomeTax: {'
      + '      bracketsByStatus: {'
      + '        single: { "0": 0.1 },'
      + '        singleWithDependents: { "0": 0.1 },'
      + '        married: { "0": 0.1 }'
      + '      },'
      + '      taxCredits: {},'
      + '      jointBandIncreaseMax: 0,'
      + '      ageExemptionAge: 999,'
      + '      ageExemptionLimit: 0'
      + '    },'
      + '    pensionRules: { lumpSumTaxBands: { "0": 0 } },'
      + '    capitalGainsTax: { rate: 0.1, annualExemption: 0 },'
      + '    investmentTypes: []'
      + '  });'
      + '  var tm = new Taxman();'
      + '  tm.ruleset = rs;'
      + '  tm.attributionManager = new AttributionManager();'
      + '  tm.attributionManager.currentCountry = "ie";'
      + '  tm.attributionManager.year = 2025;'
      + '  tm.attributionManager.yearlyAttributions = {};'
      + '  var localSalary = new Attribution("incomesalaries", "ie", 2025);'
      + '  localSalary.add("Local", 1000);'
      + '  var foreignSalary = new Attribution("incomesalaries:us", "ie", 2025);'
      + '  foreignSalary.add("Foreign", 2000);'
      + '  var incomeAll = new Attribution("income", "ie", 2025);'
      + '  incomeAll.add("Local", 1000);'
      + '  incomeAll.add("Foreign", 2000);'
      + '  tm.attributionManager.yearlyAttributions["incomesalaries"] = localSalary;'
      + '  tm.attributionManager.yearlyAttributions["incomesalaries:us"] = foreignSalary;'
      + '  tm.attributionManager.yearlyAttributions["income"] = incomeAll;'
      + '  tm.countryHistory = [{ country: "ie", fromYear: 2025 }];'
      + '  tm.married = false;'
      + '  tm.dependentChildren = false;'
      + '  tm.privatePensionP1 = 0;'
      + '  tm.privatePensionP2 = 0;'
      + '  tm.privatePensionLumpSumCountP1 = 0;'
      + '  tm.privatePensionLumpSumCountP2 = 0;'
      + '  tm.pensionContribReliefP1 = 0;'
      + '  tm.pensionContribReliefP2 = 0;'
      + '  tm.investmentTypeIncome = {};'
      + '  tm.salariesP1 = [];'
      + '  tm.salariesP2 = [];'
      + '  tm.person1Ref = { age: 40 };'
      + '  tm.taxTotals = {};'
      + '  tm.computeIT();'
      + '  return tm.taxTotals["incomeTax"];'
      + '};'
      + 'return {'
      + '  domesticTax: makeTaxman("domestic"),'
      + '  worldwideTax: makeTaxman("worldwide")'
      + '};'
      + '})()',
      ctx
    );
    if (basisResults.domesticTax !== 100) {
      errors.push('Domestic tax basis should only tax residence income');
    }
    if (basisResults.worldwideTax !== 300) {
      errors.push('Worldwide tax basis should tax all income');
    }

    // Test 7: Foreign tax credits applied through computeTaxes
    const ftcResults = vm.runInContext(
      '(function () {'
      + 'var rs = new TaxRuleSet({'
      + '  country: "IE",'
      + '  locale: { currencyCode: "EUR" },'
      + '  taxBasis: "worldwide",'
      + '  incomeTax: {'
      + '    bracketsByStatus: {'
      + '      single: { "0": 0.1 },'
      + '      singleWithDependents: { "0": 0.1 },'
      + '      married: { "0": 0.1 }'
      + '    },'
      + '    taxCredits: {},'
      + '    jointBandIncreaseMax: 0,'
      + '    ageExemptionAge: 999,'
      + '    ageExemptionLimit: 0'
      + '  },'
      + '  pensionRules: { lumpSumTaxBands: { "0": 0 } },'
      + '  capitalGainsTax: { rate: 0.1, annualExemption: 0 },'
      + '  investmentTypes: []'
      + '});'
      + 'var tm = new Taxman();'
      + 'tm.ruleset = rs;'
      + 'tm.attributionManager = new AttributionManager();'
      + 'tm.attributionManager.currentCountry = "ie";'
      + 'tm.attributionManager.year = 2025;'
      + 'tm.attributionManager.yearlyAttributions = {};'
      + 'var incomeAll = new Attribution("income", "ie", 2025);'
      + 'incomeAll.add("Local", 1000);'
      + 'tm.attributionManager.yearlyAttributions["income"] = incomeAll;'
      + 'tm.countryHistory = [{ country: "ie", fromYear: 2025 }];'
      + 'tm.married = false;'
      + 'tm.dependentChildren = false;'
      + 'tm.privatePensionP1 = 0;'
      + 'tm.privatePensionP2 = 0;'
      + 'tm.privatePensionLumpSumCountP1 = 0;'
      + 'tm.privatePensionLumpSumCountP2 = 0;'
      + 'tm.pensionContribReliefP1 = 0;'
      + 'tm.pensionContribReliefP2 = 0;'
      + 'tm.investmentTypeIncome = {};'
      + 'tm.salariesP1 = [];'
      + 'tm.salariesP2 = [];'
      + 'tm.person1Ref = { age: 40 };'
      + 'tm.gains = {};'
      + 'tm.computeTaxes({ income: 50, treatyExists: true, byCountry: { income: { us: 50 } } });'
      + 'var countryAttr = tm.attributionManager.getAttribution("tax:incomeTax:us");'
      + 'var countryCredit = 0;'
      + 'var hasCountryLabel = false;'
      + 'if (countryAttr) {'
      + '  var bd = countryAttr.getBreakdown();'
      + '  for (var key in bd) {'
      + '    if (key === "Foreign Tax Credit (US)") {'
      + '      countryCredit += bd[key];'
      + '      hasCountryLabel = true;'
      + '    }'
      + '  }'
      + '}'
      + 'return { incomeTax: tm.taxTotals["incomeTax"], countryCredit: countryCredit, hasCountryLabel: hasCountryLabel };'
      + '})()',
      ctx
    );
    if (ftcResults.incomeTax !== 50) {
      errors.push('Foreign tax credit should reduce income tax totals');
    }
    if (Math.abs(ftcResults.countryCredit + 50) > 1e-6) {
      errors.push('Foreign tax credit should be attributed under tax:incomeTax:us as -50');
    }
    if (!ftcResults.hasCountryLabel) {
      errors.push('Foreign tax credit country attribution should include label "Foreign Tax Credit (US)"');
    }

    // Test 8: Backward compatibility (single-country scenario sanity)
    const singleCountryScenario = {
      name: 'CrossBorderInfraSingleCountry',
      description: 'Sanity check for single-country scenarios with new infrastructure.',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 40,
          retirementAge: 65,
          initialSavings: 0,
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
          StartCountry: 'ie',
          simulation_mode: 'single',
          economy_mode: 'deterministic',
          economyMode: 'deterministic'
        },
        events: []
      },
      assertions: []
    };

    const loaded = framework.loadScenario(singleCountryScenario);
    if (!loaded) {
      errors.push('Failed to load single-country scenario');
    } else {
      installTestTaxRules(framework, { ie: deepClone(IE_RULES) });
      const results = await framework.runSimulation();
      if (!results || !results.success) {
        errors.push('Single-country scenario failed after infrastructure changes');
      }
    }

    return { success: errors.length === 0, errors: errors };
  }
};
