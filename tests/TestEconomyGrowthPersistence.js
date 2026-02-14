require('../src/core/LegacyScenarioAdapter.js');
require('../src/core/Utils.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const adapterSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'LegacyScenarioAdapter.js'), 'utf8');
vm.runInThisContext(adapterSource);
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
    },
    querySelector(selector) {
      const raw = String(selector || '');
      const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
      for (let i = 0; i < parts.length; i++) {
        const m = parts[i].match(/^\[id\^="([^"]+)"\]$/);
        if (!m) continue;
        const prefix = m[1];
        for (const id in elements) {
          if (!Object.prototype.hasOwnProperty.call(elements, id)) continue;
          if (id.indexOf(prefix) === 0) return elements[id];
        }
      }
      return null;
    }
  };
}

function createUiStub(doc, eventsData) {
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
      return Array.isArray(eventsData) ? eventsData : [];
    }
  };
}

module.exports = {
  name: 'EconomyGrowthPersistence',
  description: 'Ensures GlobalAsset*/LocalAsset* growth and volatility fields round-trip through CSV.',
  isCustomTest: true,
  async runCustomTest() {
    const originalConfig = global.Config;
    const originalDocument = global.document;
    const errors = [];

    try {
      const doc = createParameterDocument();
      global.document = doc;
      const ieRuleset = {
        getResolvedInvestmentTypes: () => ([
          { key: 'indexFunds_ie', label: 'Index Funds', baseRef: 'globalEquity', residenceScope: 'local' },
          { key: 'shares_ie', label: 'Shares', residenceScope: 'local' }
        ])
      };
      global.Config = {
        getInstance: () => ({
          getStartCountry: () => 'ie',
          getDefaultCountry: () => 'ie',
          getInvestmentBaseTypes: () => ([
            { baseKey: 'globalEquity', label: 'Global Equity' },
            { baseKey: 'globalBonds', label: 'Global Bonds' }
          ]),
          getCachedTaxRuleSet: (code) => {
            const cc = String(code || '').toLowerCase();
            if (cc === 'ie') return ieRuleset;
            return null;
          },
          getAvailableCountries: () => ([{ code: 'ie', name: 'Ireland' }]),
          isRelocationEnabled: () => true
        })
      };

      const ui = createUiStub(doc);
      doc.ensureEl('StartCountry', 'string').value = 'ie';

      // Phase A: per-country values should win and round-trip
      doc.ensureEl('GlobalAssetGrowth_globalEquity', 'percentage').value = '7';
      doc.ensureEl('GlobalAssetVolatility_globalEquity', 'percentage').value = '15';
      doc.ensureEl('LocalAssetGrowth_ie_shares', 'percentage').value = '5';
      doc.ensureEl('LocalAssetVolatility_ie_shares', 'percentage').value = '12';
      doc.ensureEl('Inflation_ie', 'percentage').value = '2';
      doc.ensureEl('PensionGrowthRate', 'percentage').value = '8';
      doc.ensureEl('PensionGrowthStdDev', 'percentage').value = '11';
      doc.ensureEl('Inflation', 'percentage').value = '3';

      let csv = serializeSimulation(ui);

      if (csv.indexOf('GlobalAssetGrowth_globalEquity,7') === -1) {
        errors.push('Missing GlobalAssetGrowth_globalEquity in CSV.');
      }
      if (csv.indexOf('GlobalAssetVolatility_globalEquity,15') === -1) {
        errors.push('Missing GlobalAssetVolatility_globalEquity in CSV.');
      }
      // Inheriting wrappers should NOT serialize LocalAssetGrowth
      if (csv.indexOf('LocalAssetGrowth_ie_indexFunds') !== -1) {
        errors.push('LocalAssetGrowth_ie_indexFunds should NOT be in CSV for inheriting wrapper.');
      }
      if (csv.indexOf('LocalAssetGrowth_ie_shares,5') === -1) {
        errors.push('Missing LocalAssetGrowth_ie_shares in CSV.');
      }
      if (csv.indexOf('LocalAssetVolatility_ie_shares,12') === -1) {
        errors.push('Missing LocalAssetVolatility_ie_shares in CSV.');
      }
      if (csv.indexOf('Inflation_ie,2') === -1) {
        errors.push('Missing Inflation_ie in CSV.');
      }

      let doc2 = createParameterDocument();
      let ui2 = createUiStub(doc2);
      global.document = doc2;

      ui2.ensureParameterInput('investmentStrategiesEnabled', 'string');
      ui2.ensureParameterInput('perCountryInvestmentsEnabled', 'string');
      ui2.ensureParameterInput('simulation_mode', 'string');
      ui2.ensureParameterInput('economy_mode', 'string');
      ui2.ensureParameterInput('PensionGrowthRate', 'percentage');
      ui2.ensureParameterInput('PensionGrowthStdDev', 'percentage');
      ui2.ensureParameterInput('Inflation', 'percentage');
      ui2.ensureParameterInput('shares_ieGrowthRate', 'percentage');
      ui2.ensureParameterInput('shares_ieGrowthStdDev', 'percentage');

      deserializeSimulation(csv, ui2);

      const gGrow = doc2.getElementById('GlobalAssetGrowth_globalEquity');
      if (!gGrow || gGrow.value !== '7') {
        errors.push('GlobalAssetGrowth_globalEquity did not deserialize.');
      }
      const gVol = doc2.getElementById('GlobalAssetVolatility_globalEquity');
      if (!gVol || gVol.value !== '15') {
        errors.push('GlobalAssetVolatility_globalEquity did not deserialize.');
      }
      const lGrow = doc2.getElementById('LocalAssetGrowth_ie_shares');
      if (!lGrow || lGrow.value !== '5') {
        errors.push('LocalAssetGrowth_ie_shares did not deserialize.');
      }
      const lVol = doc2.getElementById('LocalAssetVolatility_ie_shares');
      if (!lVol || lVol.value !== '12') {
        errors.push('LocalAssetVolatility_ie_shares did not deserialize.');
      }
      const inf = doc2.getElementById('Inflation_ie');
      if (!inf || inf.value !== '2') {
        errors.push('Inflation_ie did not deserialize.');
      }

      // Phase B: defaults from legacy values when per-country inputs are missing
      const doc3 = createParameterDocument();
      const ui3 = createUiStub(doc3);
      global.document = doc3;
      doc3.ensureEl('StartCountry', 'string').value = 'ie';
      doc3.ensureEl('PensionGrowthRate', 'percentage').value = '6';
      doc3.ensureEl('PensionGrowthStdDev', 'percentage').value = '12';
      doc3.ensureEl('Inflation', 'percentage').value = '2';
      doc3.ensureEl('shares_ieGrowthRate', 'percentage').value = '4';
      doc3.ensureEl('shares_ieGrowthStdDev', 'percentage').value = '9';
      doc3.ensureEl('perCountryInvestmentsEnabled', 'string').value = 'on';

      csv = serializeSimulation(ui3);

      if (csv.indexOf('Inflation_ie,2') !== -1) {
        errors.push('Legacy inflation should not backfill Inflation_ie.');
      }
      if (csv.indexOf('Inflation_ie,') === -1) {
        errors.push('Expected Inflation_ie to serialize as empty.');
      }
      if (csv.indexOf('LocalAssetGrowth_ie_shares,4') === -1) {
        errors.push('Legacy growth did not map to LocalAssetGrowth_ie_shares.');
      }
      if (csv.indexOf('LocalAssetVolatility_ie_shares,9') === -1) {
        errors.push('Legacy volatility did not map to LocalAssetVolatility_ie_shares.');
      }
      if (csv.indexOf('LocalAssetGrowth_ie_indexFunds') !== -1) {
        errors.push('Inheriting wrapper LocalAssetGrowth_ie_indexFunds should NOT be serialized even from legacy.');
      }

      const doc4 = createParameterDocument();
      const ui4 = createUiStub(doc4);
      global.document = doc4;
      ui4.ensureParameterInput('investmentStrategiesEnabled', 'string');
      ui4.ensureParameterInput('perCountryInvestmentsEnabled', 'string');
      ui4.ensureParameterInput('simulation_mode', 'string');
      ui4.ensureParameterInput('economy_mode', 'string');
      ui4.ensureParameterInput('PensionGrowthRate', 'percentage');
      ui4.ensureParameterInput('PensionGrowthStdDev', 'percentage');
      ui4.ensureParameterInput('Inflation', 'percentage');
      ui4.ensureParameterInput('shares_ieGrowthRate', 'percentage');
      ui4.ensureParameterInput('shares_ieGrowthStdDev', 'percentage');

      deserializeSimulation(csv, ui4);

      const dInf = doc4.getElementById('Inflation_ie');
      if (!dInf || dInf.value !== '') {
        errors.push('Inflation_ie should remain blank when serialized blank.');
      }
      const dlGrow = doc4.getElementById('LocalAssetGrowth_ie_shares');
      if (!dlGrow || dlGrow.value !== '4') {
        errors.push('Default LocalAssetGrowth_ie_shares did not deserialize.');
      }
      const dlVol = doc4.getElementById('LocalAssetVolatility_ie_shares');
      if (!dlVol || dlVol.value !== '9') {
        errors.push('Default LocalAssetVolatility_ie_shares did not deserialize.');
      }

      // Phase C: relocation scenario with MV event should serialize per-country locals
      const usRuleset = {
        getResolvedInvestmentTypes: () => ([
          { key: 'localIndex_us', label: 'Local Index', residenceScope: 'local' }
        ])
      };
      global.Config = {
        getInstance: () => ({
          getStartCountry: () => 'ie',
          getDefaultCountry: () => 'ie',
          getInvestmentBaseTypes: () => ([
            { baseKey: 'globalEquity', label: 'Global Equity' },
            { baseKey: 'globalBonds', label: 'Global Bonds' }
          ]),
          getCachedTaxRuleSet: (code) => {
            const cc = String(code || '').toLowerCase();
            if (cc === 'ie') return ieRuleset;
            if (cc === 'us') return usRuleset;
            return null;
          },
          getAvailableCountries: () => ([{ code: 'ie', name: 'Ireland' }, { code: 'us', name: 'United States' }]),
          isRelocationEnabled: () => true
        })
      };

      const doc5 = createParameterDocument();
      const ui5 = createUiStub(doc5, [['MV', 'US', '', '', '', '', '']]);
      global.document = doc5;
      doc5.ensureEl('StartCountry', 'string').value = 'ie';
      doc5.ensureEl('LocalAssetGrowth_us_localIndex', 'percentage').value = '6';
      doc5.ensureEl('LocalAssetVolatility_us_localIndex', 'percentage').value = '14';

      csv = serializeSimulation(ui5);
      if (csv.indexOf('LocalAssetGrowth_us_localIndex,6') === -1) {
        errors.push('Relocation locals did not serialize for US.');
      }
      if (csv.indexOf('LocalAssetVolatility_us_localIndex,14') === -1) {
        errors.push('Relocation local volatility did not serialize for US.');
      }

      const doc6 = createParameterDocument();
      const ui6 = createUiStub(doc6);
      global.document = doc6;
      ui6.ensureParameterInput('investmentStrategiesEnabled', 'string');
      ui6.ensureParameterInput('perCountryInvestmentsEnabled', 'string');
      ui6.ensureParameterInput('simulation_mode', 'string');
      ui6.ensureParameterInput('economy_mode', 'string');

      deserializeSimulation(csv, ui6);
      const usGrow = doc6.getElementById('LocalAssetGrowth_us_localIndex');
      if (!usGrow || usGrow.value !== '6') {
        errors.push('Relocation local growth did not deserialize for US.');
      }
      const usVol = doc6.getElementById('LocalAssetVolatility_us_localIndex');
      if (!usVol || usVol.value !== '14') {
        errors.push('Relocation local volatility did not deserialize for US.');
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
