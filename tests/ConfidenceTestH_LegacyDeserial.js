const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'C_H-LEGACY-DESERIAL',
  description: 'Verifies legacy CSV fields map to modern namespaced equivalents.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ targetAge: 31, StartCountry: 'aa' });
    const scenarioDef = {
      name: 'C_H-LEGACY-DESERIAL',
      description: 'Verifies legacy CSV fields map to modern namespaced equivalents.',
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

    framework.simulationContext.__legacyCsv = [
      '# FinSim v2.1 Save File',
      '# Parameters',
      'StartCountry,aa',
      'StartingAge,30',
      'TargetAge,31',
      'InitialETFs,5000',
      'FundsAllocation,60%',
      'PriorityFunds,2',
      '# Events',
      'Type,Name,Amount,FromAge,ToAge,Rate,Extra',
      'SI,Salary,10000,30,30,0,0'
    ].join('\n');

    const result = vm.runInContext(`(function() {
      var elements = {};
      var doc = {
        _elements: elements,
        ensureEl: function(id, className) {
          if (!elements[id]) elements[id] = { id: id, value: '', className: className || '' };
          return elements[id];
        },
        getElementById: function(id) { return elements[id] || null; },
        querySelectorAll: function(selector) {
          var m = String(selector || '').match(/^input\\[id\\^="([^"]+)"\\]$/);
          if (!m) return [];
          var prefix = m[1];
          var out = [];
          for (var key in elements) {
            if (!Object.prototype.hasOwnProperty.call(elements, key)) continue;
            if (key.indexOf(prefix) === 0) out.push(elements[key]);
          }
          return out;
        }
      };

      var ui = {
        ensureParameterInput: function(id, className) { doc.ensureEl(id, className); },
        setValue: function(id, value) {
          var el = doc.getElementById(id) || doc.ensureEl(id, '');
          var v = (value === undefined || value === null) ? '' : String(value);
          if (String(el.className || '').indexOf('percentage') >= 0) v = v.replace('%', '');
          el.value = v;
        },
        getValue: function(id) {
          var el = doc.getElementById(id);
          return el ? el.value : '';
        }
      };

      var originalDocument = typeof document !== 'undefined' ? document : null;
      document = doc;
      params = {};
      deserializeSimulation(__legacyCsv, ui);
      document = originalDocument;

      return {
        initialCapitalKey: doc.getElementById('InitialCapital_indexFunds_aa') ? doc.getElementById('InitialCapital_indexFunds_aa').value : '',
        allocationKey: doc.getElementById('InvestmentAllocation_aa_indexFunds') ? doc.getElementById('InvestmentAllocation_aa_indexFunds').value : '',
        priorityKey: doc.getElementById('Priority_indexFunds') ? doc.getElementById('Priority_indexFunds').value : ''
      };
    })()`, framework.simulationContext);

    const errors = [];
    if (result.initialCapitalKey !== '5000') {
      errors.push(`Expected InitialCapital_indexFunds_aa = 5000, got ${result.initialCapitalKey}`);
    }
    if (result.allocationKey !== '60') {
      errors.push(`Expected InvestmentAllocation_aa_indexFunds = 60, got ${result.allocationKey}`);
    }
    if (result.priorityKey !== '2') {
      errors.push(`Expected Priority_indexFunds = 2, got ${result.priorityKey}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
