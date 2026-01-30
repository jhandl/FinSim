require('../src/core/Utils.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
  // These must exist so deserializeSimulation's legacy normalization path can run.
  ui.ensureParameterInput('InvestmentAllocation_indexFunds', 'percentage');
  ui.ensureParameterInput('InvestmentAllocation_shares', 'percentage');

  // Also seed StartCountry to match demo3b and config.
  ui.ensureParameterInput('StartCountry', 'string');

  // deserializeSimulation may set these outside try/catch blocks for older files.
  ui.ensureParameterInput('simulation_mode', 'string');
  ui.ensureParameterInput('economy_mode', 'string');
  ui.ensureParameterInput('investmentStrategiesEnabled', 'string');
  ui.ensureParameterInput('perCountryInvestmentsEnabled', 'string');
}

module.exports = {
  name: 'AllocationScenarioLoadNoOverwrite',
  description: 'Ensures namespaced allocation keys from scenario are not overwritten by empty legacy allocation fields.',
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

      const csv = fs.readFileSync(path.join(__dirname, '..', 'docs', 'demo3.csv'), 'utf8');
      deserializeSimulation(csv, ui);

      const gFunds = doc.getElementById('InvestmentAllocation_indexFunds_ie');
      const gShares = doc.getElementById('InvestmentAllocation_shares_ie');
      if (!gFunds || String(gFunds.value) !== '50') errors.push('Expected InvestmentAllocation_indexFunds_ie to remain 50, got ' + (gFunds ? gFunds.value : 'null'));
      if (!gShares || String(gShares.value) !== '50') errors.push('Expected InvestmentAllocation_shares_ie to remain 50, got ' + (gShares ? gShares.value : 'null'));

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
