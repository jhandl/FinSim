const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');

function withinTolerance(actual, expected, tolerance) {
  return Math.abs((actual || 0) - expected) <= tolerance;
}

module.exports = {
  name: 'TestCapitalGainsDisplayAttributions',
  description: 'Ensures realized gains and pre-relief CGT display attributions are populated from the core tax path.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    try {
      const framework = new TestFramework();
      framework.loadCoreModules();
      framework.ensureVMUIManagerMocks();
      await vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);

      const result = vm.runInContext(`
        (function () {
          params = { marriageYear: null, oldestChildBorn: null, youngestChildBorn: null };
          var taxman = new Taxman();
          var person = new Person(1, 30);
          var attributionManager = new AttributionManager();
          taxman.reset(person, null, attributionManager, 'ie', 2031);

          taxman.declareInvestmentGains(
            Money.create(9050.143699927663, 'EUR', 'ie'),
            0.38,
            'Index Funds Sale',
            { category: 'exitTax', eligibleForAnnualExemption: false, allowLossOffset: false },
            'ie'
          );
          taxman.declareInvestmentGains(
            Money.create(2565.030918146188, 'EUR', 'ie'),
            0.33,
            'Shares Sale',
            { category: 'cgt', eligibleForAnnualExemption: true, allowLossOffset: true, annualExemptionAmount: 1270 },
            'ie'
          );

          taxman.computeCGT();

          return {
            gains: attributionManager.getAttribution('capitalgains').getBreakdown(),
            preReliefTax: attributionManager.getAttribution('tax:capitalGainsPreRelief').getBreakdown(),
            tax: attributionManager.getAttribution('tax:capitalGains').getBreakdown()
          };
        })()
      `, framework.simulationContext);

      if (!withinTolerance(result.gains['Index Funds Sale'], 9050.143699927663, 1e-9)) {
        errors.push('Expected capitalgains attribution for Index Funds Sale to match the realized gain');
      }
      if (!withinTolerance(result.gains['Shares Sale'], 2565.030918146188, 1e-9)) {
        errors.push('Expected capitalgains attribution for Shares Sale to match the realized gain');
      }
      if (!withinTolerance(result.preReliefTax['Index Funds Sale'], 3439.054605972512, 1e-9)) {
        errors.push('Expected pre-relief CGT attribution for Index Funds Sale to match the exit-tax amount');
      }
      if (!withinTolerance(result.preReliefTax['Shares Sale'], 846.4602029882421, 1e-9)) {
        errors.push('Expected pre-relief CGT attribution for Shares Sale to match the gross CGT amount');
      }
      if (!(typeof result.tax['CGT Relief'] === 'number' && result.tax['CGT Relief'] < 0)) {
        errors.push('Expected tax:capitalGains to retain a negative CGT Relief display line');
      }
    } catch (err) {
      errors.push(err && err.message ? err.message : String(err));
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
