const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'C_H-RELOC-META',
  description: 'Verifies relocation meta fields round-trip through serialize/deserialize (H-RELOC-META).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ targetAge: 31, StartCountry: 'aa' });
    const scenarioDef = {
      name: 'C_H-RELOC-META',
      description: 'Verifies relocation meta fields round-trip through serialize/deserialize (H-RELOC-META).',
      scenario: {
        parameters: params,
        events: []
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA });
    framework.ensureVMUIManagerMocks(params, []);

    const initPromise = vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);
    if (initPromise && typeof initPromise.then === 'function') {
      await initPromise;
    }

    framework.simulationContext.__uiValues = {
      StartCountry: 'aa',
      StartingAge: '30',
      TargetAge: '31',
      InitialSavings: '0',
      InitialPension: '0',
      RetirementAge: '65',
      EmergencyStash: '0',
      PensionContributionPercentage: '0',
      PensionContributionCapped: 'No',
      PensionGrowthRate: '0',
      PensionGrowthStdDev: '0',
      Inflation: '0',
      MarriageYear: '',
      YoungestChildBorn: '',
      OldestChildBorn: '',
      PersonalTaxCredit: '',
      StatePensionWeekly: '0',
      PriorityCash: '1',
      PriorityPension: '2',
      PriorityFunds: '3',
      PriorityShares: '4',
      P2StartingAge: '',
      P2RetirementAge: '',
      P2StatePensionWeekly: '',
      InitialPensionP2: '',
      PensionContributionPercentageP2: '',
      simulation_mode: 'single',
      economy_mode: 'deterministic',
      investmentStrategiesEnabled: 'off',
      perCountryInvestmentsEnabled: 'off'
    };

    framework.simulationContext.__eventRows = [
      ['SI:Salary', '10000', '30', '30', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
    ];

    framework.simulationContext.__metaRows = [
      { currency: 'AAA', linkedCountry: 'aa', linkedEventId: 'ev1', resolved: '' }
    ];

    const roundTrip = vm.runInContext(`(function() {
      var originalDocument = typeof document !== 'undefined' ? document : null;
      var ui = {
        getVersion: function() { return '1.0'; },
        getValue: function(key) { return (__uiValues && __uiValues[key]) ? __uiValues[key] : ''; },
        isPercentage: function() { return false; },
        isBoolean: function() { return false; },
        ensureParameterInput: function() {},
        getTableData: function() { return __eventRows || []; }
      };
      document = {
        getElementById: function(id) {
          if (id !== 'Events') return null;
          var rows = (__metaRows || []).map(function(meta) {
            return {
              dataset: meta.resolved === '0' ? { relocationImpact: '1' } : {},
              classList: { contains: function() { return false; } },
              getElementsByTagName: function() { return [{}, {}]; },
              querySelector: function(selector) {
                if (selector === '.event-currency' && meta.currency) return { value: meta.currency };
                if (selector === '.event-linked-country' && meta.linkedCountry) return { value: meta.linkedCountry };
                if (selector === '.event-linked-event-id' && meta.linkedEventId) return { value: meta.linkedEventId };
                if (selector === '.event-resolution-override' && meta.resolved === '1') return { value: '1' };
                return null;
              }
            };
          });
          return {
            getElementsByTagName: function(tag) { return tag === 'tr' ? rows : []; }
          };
        },
        querySelectorAll: function() { return []; }
      };
      var csv = serializeSimulation(ui);
      var sinkValues = {};
      var uiSink = {
        setValue: function(key, value) { sinkValues[key] = value; },
        getValue: function(key) { return sinkValues[key] || ''; }
      };
      params = {};
      var rows = deserializeSimulation(csv, uiSink);
      document = originalDocument;
      return { csv: csv, rows: rows };
    })()`, framework.simulationContext);

    const errors = [];
    const rows = roundTrip && roundTrip.rows ? roundTrip.rows : null;
    const metaColumn = rows && rows[0] ? rows[0][rows[0].length - 1] : '';
    if (!metaColumn || metaColumn.indexOf('currency=AAA') === -1) errors.push('Meta column missing currency=AAA');
    if (!metaColumn || metaColumn.indexOf('linkedCountry=aa') === -1) errors.push('Meta column missing linkedCountry=aa');
    if (!metaColumn || metaColumn.indexOf('linkedEventId=ev1') === -1) errors.push('Meta column missing linkedEventId=ev1');

    return {
      success: errors.length === 0,
      errors
    };
  }
};
