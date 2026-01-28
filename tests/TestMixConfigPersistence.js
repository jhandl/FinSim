require('../src/core/Utils.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const utilsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'Utils.js'), 'utf8');
vm.runInThisContext(utilsSource);

const serializeSimulation = global.serializeSimulation;
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
      const raw = String(selector || '');
      const m = raw.match(/^(?:[a-zA-Z]+)?\[id\^="([^"]+)"\]$/);
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

function createUiStub(doc) {
  const store = {};
  return {
    ensureParameterInput(id, className) {
      doc.ensureEl(id, className);
    },
    setValue(id, value) {
      const el = doc.getElementById(id);
      if (!el) throw new Error('Element not found: ' + id);
      el.value = (value === undefined || value === null) ? '' : String(value);
      store[id] = el.value;
    },
    getValue(id) {
      const el = doc.getElementById(id);
      if (el) return el.value;
      return store[id];
    },
    getVersion() {
      return '5.0';
    },
    isPercentage() {
      return false;
    },
    isBoolean() {
      return false;
    },
    getTableData() {
      return [];
    }
  };
}

function buildCsv(parameterLines) {
  return [
    '# FinSim v5.0 Save File',
    '# Parameters',
    parameterLines.join('\n'),
    '',
    '# Events',
    'Type,Name,Amount,FromAge,ToAge,Rate,Extra'
  ].join('\n');
}

module.exports = {
  name: 'MixConfigPersistence',
  description: 'Ensures GlobalAllocation and mix config fields round-trip through CSV.',
  isCustomTest: true,
  async runCustomTest() {
    const originalConfig = global.Config;
    const originalDocument = global.document;
    const errors = [];

    try {
      const doc = createParameterDocument();
      global.document = doc;
      global.Config = {
        getInstance: () => ({
          getStartCountry: () => 'ie',
          getDefaultCountry: () => 'ie',
          getCachedTaxRuleSet: () => ({ getResolvedInvestmentTypes: () => [] }),
          getAvailableCountries: () => ([{ code: 'ie', name: 'Ireland' }]),
          isRelocationEnabled: () => true
        })
      };

      const ui = createUiStub(doc);
      doc.ensureEl('StartCountry', 'string').value = 'ie';
      doc.ensureEl('GlobalAllocation_indexFunds', 'percentage').value = '55';
      doc.ensureEl('MixConfig_ie_indexFunds_type', 'string').value = 'glide';
      doc.ensureEl('MixConfig_ie_indexFunds_asset1', 'string').value = 'Stocks';
      doc.ensureEl('MixConfig_ie_indexFunds_asset2', 'string').value = 'Bonds';
      doc.ensureEl('MixConfig_ie_indexFunds_startAge', 'number').value = '30';
      doc.ensureEl('MixConfig_ie_indexFunds_targetAge', 'number').value = '65';
      doc.ensureEl('MixConfig_ie_indexFunds_targetAgeOverridden', 'boolean').value = 'true';
      doc.ensureEl('MixConfig_ie_indexFunds_startAsset1Pct', 'percentage').value = '70';
      doc.ensureEl('MixConfig_ie_indexFunds_startAsset2Pct', 'percentage').value = '30';
      doc.ensureEl('MixConfig_ie_indexFunds_endAsset1Pct', 'percentage').value = '50';
      doc.ensureEl('MixConfig_ie_indexFunds_endAsset2Pct', 'percentage').value = '50';
      doc.ensureEl('InvestmentAllocation_ie_indexFunds', 'percentage').value = '25';
      doc.ensureEl('GlobalMixConfig_indexFunds_type', 'string').value = 'fixed';
      doc.ensureEl('GlobalMixConfig_indexFunds_asset1', 'string').value = 'Stocks';
      doc.ensureEl('GlobalMixConfig_indexFunds_asset2', 'string').value = 'Bonds';
      doc.ensureEl('GlobalMixConfig_indexFunds_targetAge', 'number').value = '60';
      doc.ensureEl('GlobalMixConfig_indexFunds_startAsset1Pct', 'percentage').value = '60';
      doc.ensureEl('GlobalMixConfig_indexFunds_startAsset2Pct', 'percentage').value = '40';
      doc.ensureEl('GlobalMixConfig_indexFunds_endAsset1Pct', 'percentage').value = '50';
      doc.ensureEl('GlobalMixConfig_indexFunds_endAsset2Pct', 'percentage').value = '50';
      doc._elements['MixConfig_ie_indexFunds_type'].tagName = 'SELECT';

      const serialized = serializeSimulation(ui);
      if (serialized.indexOf('GlobalAllocation_indexFunds,55') === -1) {
        errors.push('Expected GlobalAllocation_indexFunds to be serialized.');
      }
      if (serialized.indexOf('MixConfig_ie_indexFunds_type,glide') === -1) {
        errors.push('Expected MixConfig_ie_indexFunds_type to be serialized.');
      }
      if (serialized.indexOf('MixConfig_ie_indexFunds_asset1,Stocks') === -1) {
        errors.push('Expected MixConfig_ie_indexFunds_asset1 to be serialized.');
      }
      if (serialized.indexOf('MixConfig_ie_indexFunds_asset2,Bonds') === -1) {
        errors.push('Expected MixConfig_ie_indexFunds_asset2 to be serialized.');
      }
      if (serialized.indexOf('MixConfig_ie_indexFunds_startAge,30') === -1) {
        errors.push('Expected MixConfig_ie_indexFunds_startAge to be serialized.');
      }
      if (serialized.indexOf('MixConfig_ie_indexFunds_targetAge,65') === -1) {
        errors.push('Expected MixConfig_ie_indexFunds_targetAge to be serialized.');
      }
      if (serialized.indexOf('MixConfig_ie_indexFunds_targetAgeOverridden,true') === -1) {
        errors.push('Expected MixConfig_ie_indexFunds_targetAgeOverridden to be serialized.');
      }
      if (serialized.indexOf('MixConfig_ie_indexFunds_startAsset1Pct,70') === -1) {
        errors.push('Expected MixConfig_ie_indexFunds_startAsset1Pct to be serialized.');
      }
      if (serialized.indexOf('MixConfig_ie_indexFunds_startAsset2Pct,30') === -1) {
        errors.push('Expected MixConfig_ie_indexFunds_startAsset2Pct to be serialized.');
      }
      if (serialized.indexOf('MixConfig_ie_indexFunds_endAsset1Pct,50') === -1) {
        errors.push('Expected MixConfig_ie_indexFunds_endAsset1Pct to be serialized.');
      }
      if (serialized.indexOf('MixConfig_ie_indexFunds_endAsset2Pct,50') === -1) {
        errors.push('Expected MixConfig_ie_indexFunds_endAsset2Pct to be serialized.');
      }
      if (serialized.indexOf('InvestmentAllocation_indexFunds_ie,25') === -1) {
        errors.push('Expected InvestmentAllocation_indexFunds_ie to be serialized.');
      }
      if (serialized.indexOf('GlobalMixConfig_indexFunds_type,fixed') === -1) {
        errors.push('Expected GlobalMixConfig_indexFunds_type to be serialized.');
      }
      if (serialized.indexOf('GlobalMixConfig_indexFunds_asset1,Stocks') === -1) {
        errors.push('Expected GlobalMixConfig_indexFunds_asset1 to be serialized.');
      }
      if (serialized.indexOf('GlobalMixConfig_indexFunds_asset2,Bonds') === -1) {
        errors.push('Expected GlobalMixConfig_indexFunds_asset2 to be serialized.');
      }
      if (serialized.indexOf('GlobalMixConfig_indexFunds_targetAge,60') === -1) {
        errors.push('Expected GlobalMixConfig_indexFunds_targetAge to be serialized.');
      }
      if (serialized.indexOf('GlobalMixConfig_indexFunds_startAsset1Pct,60') === -1) {
        errors.push('Expected GlobalMixConfig_indexFunds_startAsset1Pct to be serialized.');
      }
      if (serialized.indexOf('GlobalMixConfig_indexFunds_startAsset2Pct,40') === -1) {
        errors.push('Expected GlobalMixConfig_indexFunds_startAsset2Pct to be serialized.');
      }
      if (serialized.indexOf('GlobalMixConfig_indexFunds_endAsset1Pct,50') === -1) {
        errors.push('Expected GlobalMixConfig_indexFunds_endAsset1Pct to be serialized.');
      }
      if (serialized.indexOf('GlobalMixConfig_indexFunds_endAsset2Pct,50') === -1) {
        errors.push('Expected GlobalMixConfig_indexFunds_endAsset2Pct to be serialized.');
      }

      const doc2 = createParameterDocument();
      const ui2 = createUiStub(doc2);
      global.document = doc2;
      ui2.ensureParameterInput('simulation_mode', 'string');
      ui2.ensureParameterInput('economy_mode', 'string');
      ui2.ensureParameterInput('investmentStrategiesEnabled', 'string');
      ui2.ensureParameterInput('perCountryInvestmentsEnabled', 'string');
      const csv = buildCsv([
        'GlobalAllocation_indexFunds,40',
        'MixConfig_ie_indexFunds_type,glide',
        'MixConfig_ie_indexFunds_asset1,Stocks',
        'MixConfig_ie_indexFunds_asset2,Bonds',
        'MixConfig_ie_indexFunds_startAge,25',
        'MixConfig_ie_indexFunds_targetAge,65',
        'MixConfig_ie_indexFunds_targetAgeOverridden,true',
        'MixConfig_ie_indexFunds_startAsset1Pct,65',
        'MixConfig_ie_indexFunds_startAsset2Pct,35',
        'MixConfig_ie_indexFunds_endAsset1Pct,45',
        'MixConfig_ie_indexFunds_endAsset2Pct,55',
        'InvestmentAllocation_indexFunds_ie,20',
        'GlobalMixConfig_indexFunds_type,fixed',
        'GlobalMixConfig_indexFunds_asset1,Stocks',
        'GlobalMixConfig_indexFunds_asset2,Bonds',
        'GlobalMixConfig_indexFunds_targetAge,62',
        'GlobalMixConfig_indexFunds_startAsset1Pct,55',
        'GlobalMixConfig_indexFunds_startAsset2Pct,45',
        'GlobalMixConfig_indexFunds_endAsset1Pct,50',
        'GlobalMixConfig_indexFunds_endAsset2Pct,50'
      ]);
      deserializeSimulation(csv, ui2);

      if (ui2.getValue('GlobalAllocation_indexFunds') !== '40') {
        errors.push('Expected GlobalAllocation_indexFunds to deserialize.');
      }
      if (ui2.getValue('MixConfig_ie_indexFunds_type') !== 'glide') {
        errors.push('Expected MixConfig_ie_indexFunds_type to deserialize.');
      }
      if (ui2.getValue('MixConfig_ie_indexFunds_asset1') !== 'Stocks') {
        errors.push('Expected MixConfig_ie_indexFunds_asset1 to deserialize.');
      }
      if (ui2.getValue('MixConfig_ie_indexFunds_asset2') !== 'Bonds') {
        errors.push('Expected MixConfig_ie_indexFunds_asset2 to deserialize.');
      }
      if (ui2.getValue('MixConfig_ie_indexFunds_startAge') !== '25') {
        errors.push('Expected MixConfig_ie_indexFunds_startAge to deserialize.');
      }
      if (ui2.getValue('MixConfig_ie_indexFunds_targetAge') !== '65') {
        errors.push('Expected MixConfig_ie_indexFunds_targetAge to deserialize.');
      }
      if (ui2.getValue('MixConfig_ie_indexFunds_targetAgeOverridden') !== 'true') {
        errors.push('Expected MixConfig_ie_indexFunds_targetAgeOverridden to deserialize.');
      }
      if (ui2.getValue('MixConfig_ie_indexFunds_startAsset1Pct') !== '65') {
        errors.push('Expected MixConfig_ie_indexFunds_startAsset1Pct to deserialize.');
      }
      if (ui2.getValue('MixConfig_ie_indexFunds_startAsset2Pct') !== '35') {
        errors.push('Expected MixConfig_ie_indexFunds_startAsset2Pct to deserialize.');
      }
      if (ui2.getValue('MixConfig_ie_indexFunds_endAsset1Pct') !== '45') {
        errors.push('Expected MixConfig_ie_indexFunds_endAsset1Pct to deserialize.');
      }
      if (ui2.getValue('MixConfig_ie_indexFunds_endAsset2Pct') !== '55') {
        errors.push('Expected MixConfig_ie_indexFunds_endAsset2Pct to deserialize.');
      }
      if (ui2.getValue('InvestmentAllocation_ie_indexFunds') !== '20') {
        errors.push('Expected InvestmentAllocation_ie_indexFunds to deserialize.');
      }
      if (ui2.getValue('GlobalMixConfig_indexFunds_type') !== 'fixed') {
        errors.push('Expected GlobalMixConfig_indexFunds_type to deserialize.');
      }
      if (ui2.getValue('GlobalMixConfig_indexFunds_asset1') !== 'Stocks') {
        errors.push('Expected GlobalMixConfig_indexFunds_asset1 to deserialize.');
      }
      if (ui2.getValue('GlobalMixConfig_indexFunds_asset2') !== 'Bonds') {
        errors.push('Expected GlobalMixConfig_indexFunds_asset2 to deserialize.');
      }
      if (ui2.getValue('GlobalMixConfig_indexFunds_targetAge') !== '62') {
        errors.push('Expected GlobalMixConfig_indexFunds_targetAge to deserialize.');
      }
      if (ui2.getValue('GlobalMixConfig_indexFunds_startAsset1Pct') !== '55') {
        errors.push('Expected GlobalMixConfig_indexFunds_startAsset1Pct to deserialize.');
      }
      if (ui2.getValue('GlobalMixConfig_indexFunds_startAsset2Pct') !== '45') {
        errors.push('Expected GlobalMixConfig_indexFunds_startAsset2Pct to deserialize.');
      }
      if (ui2.getValue('GlobalMixConfig_indexFunds_endAsset1Pct') !== '50') {
        errors.push('Expected GlobalMixConfig_indexFunds_endAsset1Pct to deserialize.');
      }
      if (ui2.getValue('GlobalMixConfig_indexFunds_endAsset2Pct') !== '50') {
        errors.push('Expected GlobalMixConfig_indexFunds_endAsset2Pct to deserialize.');
      }
    } catch (err) {
      errors.push('Unexpected error: ' + (err && err.message ? err.message : String(err)));
    } finally {
      global.Config = originalConfig;
      global.document = originalDocument;
    }

    return { success: errors.length === 0, errors };
  }
};
