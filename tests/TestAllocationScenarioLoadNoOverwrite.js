require('../src/core/LegacyScenarioAdapter.js');
require('../src/core/Utils.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const adapterSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'LegacyScenarioAdapter.js'), 'utf8');
vm.runInThisContext(adapterSource);
const utilsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'Utils.js'), 'utf8');
vm.runInThisContext(utilsSource);

const deserializeSimulation = global.deserializeSimulation;

function createParameterDocument() {
  const elements = {};

  function ensureEl(id, className) {
    if (elements[id]) return elements[id];
    elements[id] = { id: id, value: '', className: className || '' };
    return elements[id];
  }

  return {
    _elements: elements,
    ensureEl,
    getElementById(id) {
      return elements[id] || null;
    },
    querySelectorAll(selector) {
      const m = String(selector || '').match(/^input\[id\^="([^"]+)"\]$/);
      if (!m) return [];
      const prefix = m[1];
      const out = [];
      for (const id in elements) {
        if (!Object.prototype.hasOwnProperty.call(elements, id)) continue;
        if (id.indexOf(prefix) === 0) out.push(elements[id]);
      }
      return out;
    }
  };
}

function createUiSimulatingDomUtils(doc) {
  function normalizePercentageForStorage(v) {
    if (v === undefined || v === null) return '';
    let s = String(v).trim();
    if (!s) return '';
    if (s.indexOf('%') >= 0) s = s.replace('%', '');
    return s;
  }

  return {
    ensureParameterInput(id, className) {
      doc.ensureEl(id, className);
    },
    setValue(id, value) {
      const el = doc.getElementById(id);
      if (!el) throw new Error('Element not found: ' + id);
      if (String(el.className || '').indexOf('percentage') >= 0) {
        el.value = normalizePercentageForStorage(value);
      } else {
        el.value = (value === undefined || value === null) ? '' : String(value);
      }
    },
    getValue(id) {
      const el = doc.getElementById(id);
      if (!el) throw new Error('Element not found: ' + id);

      // Simulate DOMUtils.getValue behavior: empty percentage/currency inputs in parameter section read as 0.
      // This is the behavior that caused the overwrite regression.
      const v = (el.value === undefined || el.value === null) ? '' : String(el.value);
      const isPercentage = String(el.className || '').indexOf('percentage') >= 0;
      const isCurrency = String(el.className || '').indexOf('currency') >= 0;
      if (v === '' && (isPercentage || isCurrency)) return 0;

      return el.value;
    }
  };
}

function seedParameterIds(ui) {
  // Seed the legacy allocation fields (present in static HTML but empty on load).
  ui.ensureParameterInput('InvestmentAllocation_indexFunds', 'percentage');
  ui.ensureParameterInput('InvestmentAllocation_shares', 'percentage');
  ui.ensureParameterInput('InvestmentAllocation_ie_indexFunds', 'percentage');
  ui.ensureParameterInput('InvestmentAllocation_ie_shares', 'percentage');
  ui.ensureParameterInput('StartCountry', 'string');

  // deserializeSimulation may set these outside try/catch blocks for older files.
  ui.ensureParameterInput('simulation_mode', 'string');
  ui.ensureParameterInput('economy_mode', 'string');
}

module.exports = {
  name: 'AllocationScenarioLoadNoOverwrite',
  description: 'Ensures canonical allocation keys from scenario are not overwritten by empty legacy allocation fields.',
  isCustomTest: true,
  async runCustomTest() {
    const originalDocument = global.document;
    const originalConfig = global.Config;
    const errors = [];

    try {
      const doc = createParameterDocument();
      global.document = doc;

      global.Config = {
        getInstance: () => ({
          getStartCountry: () => 'ie',
          getDefaultCountry: () => 'ie',
          getAvailableCountries: () => ([{ code: 'ie', name: 'Ireland' }, { code: 'ar', name: 'Argentina' }])
        })
      };

      const ui = createUiSimulatingDomUtils(doc);
      seedParameterIds(ui);

      const csv = [
        '# FinSim v2.1 Save File',
        '# Parameters',
        'StartCountry,ie',
        'simulation_mode,single',
        'economy_mode,deterministic',
        'InvestmentAllocation_ie_indexFunds,50',
        'InvestmentAllocation_ie_shares,50',
        '',
        '# Events',
        'Type,Name,Amount,FromAge,ToAge,Rate,Extra,Meta',
        'NOP,,,,,,,'
      ].join('\n');
      deserializeSimulation(csv, ui);

      const gFunds = doc.getElementById('InvestmentAllocation_indexFunds_ie');
      const gShares = doc.getElementById('InvestmentAllocation_shares_ie');
      if (gFunds && String(gFunds.value) !== '') errors.push('Expected legacy InvestmentAllocation_indexFunds_ie to remain empty, got ' + gFunds.value);
      if (gShares && String(gShares.value) !== '') errors.push('Expected legacy InvestmentAllocation_shares_ie to remain empty, got ' + gShares.value);

      const pFunds = doc.getElementById('InvestmentAllocation_ie_indexFunds');
      const pShares = doc.getElementById('InvestmentAllocation_ie_shares');
      if (!pFunds || String(pFunds.value) !== '50') errors.push('Expected InvestmentAllocation_ie_indexFunds to be 50, got ' + (pFunds ? pFunds.value : 'null'));
      if (!pShares || String(pShares.value) !== '50') errors.push('Expected InvestmentAllocation_ie_shares to be 50, got ' + (pShares ? pShares.value : 'null'));
    } catch (err) {
      errors.push('Unexpected error: ' + (err && err.message ? err.message : String(err)));
    } finally {
      global.document = originalDocument;
      global.Config = originalConfig;
    }

    return { success: errors.length === 0, errors };
  }
};
