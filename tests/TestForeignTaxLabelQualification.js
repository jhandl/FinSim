const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');

module.exports = {
  name: 'TestForeignTaxLabelQualification',
  description: 'Foreign tax source labels stay country-neutral so tooltip country qualification is applied exactly once.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];
    const framework = new TestFramework();

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    framework.ensureVMUIManagerMocks();
    await vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);
    await vm.runInContext('Config.getInstance().getTaxRuleSet("ar")', framework.simulationContext);

    try {
      const result = vm.runInContext(`
        (function () {
          params = {
            marriageYear: null,
            oldestChildBorn: null,
            youngestChildBorn: null,
            simulation_mode: 'single',
            economy_mode: 'deterministic'
          };

          var person = { id: 'P1', age: 40 };
          var cfg = Config.getInstance();

          var rentalAttributionManager = new AttributionManager();
          currentCountry = 'ar';
          residenceCurrency = cfg.getCachedTaxRuleSet('ar').getCurrencyCode();
          year = 2030;
          rentalAttributionManager.reset(currentCountry, year, currentCountry);
          var rentalTaxman = new Taxman();
          rentalTaxman.reset(person, null, rentalAttributionManager, currentCountry, year);
          rentalTaxman.declareRentalIncome(Money.create(10000, residenceCurrency, currentCountry), 'ie', 'IE Rental');
          rentalTaxman.computeTaxes();
          var rentalAttr = rentalAttributionManager.getAttribution('tax:incomeTax:ie');
          var rentalLabels = rentalAttr ? Object.keys(rentalAttr.getBreakdown()) : [];

          var gainsAttributionManager = new AttributionManager();
          currentCountry = 'ie';
          residenceCurrency = cfg.getCachedTaxRuleSet('ie').getCurrencyCode();
          year = 2020;
          gainsAttributionManager.reset(currentCountry, year, currentCountry);
          var gainsTaxman = new Taxman();
          gainsTaxman.reset(person, null, gainsAttributionManager, currentCountry, year);

          currentCountry = 'ar';
          residenceCurrency = cfg.getCachedTaxRuleSet('ar').getCurrencyCode();
          year = 2025;
          gainsAttributionManager.reset(currentCountry, year, currentCountry);
          gainsTaxman.reset(person, null, gainsAttributionManager, currentCountry, year);
          gainsTaxman.declareInvestmentGains(
            Money.create(5000, residenceCurrency, currentCountry),
            0.33,
            'IE Shares Sale',
            { category: 'cgt', eligibleForAnnualExemption: true, allowLossOffset: true, annualExemptionAmount: 0 },
            'ie'
          );
          gainsTaxman.computeCGT();
          var gainsAttr = gainsAttributionManager.getAttribution('tax:capitalGains:ie');
          var gainsLabels = gainsAttr ? Object.keys(gainsAttr.getBreakdown()) : [];

          return {
            rentalLabels: rentalLabels,
            gainsLabels: gainsLabels
          };
        })()
      `, framework.simulationContext);

      if (result.rentalLabels.indexOf('Rental Income Tax') === -1) {
        errors.push('Expected tax:incomeTax:ie to contain a plain "Rental Income Tax" source label');
      }
      if (result.rentalLabels.some((label) => /\(IE\)/.test(label))) {
        errors.push('Rental source-tax labels should not embed "(IE)"; tooltip qualification must come from metadata');
      }
      if (result.gainsLabels.indexOf('Capital Gains Tax') === -1) {
        errors.push('Expected tax:capitalGains:ie to contain a plain "Capital Gains Tax" source label');
      }
      if (result.gainsLabels.some((label) => /\(IE\)/.test(label))) {
        errors.push('Trailing capital-gains labels should not embed "(IE)"; tooltip qualification must come from metadata');
      }
    } catch (err) {
      errors.push(err && err.message ? err.message : String(err));
    }

    return { success: errors.length === 0, errors };
  }
};
