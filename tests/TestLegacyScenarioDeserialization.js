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
      // Only support the selectors used by deserializeSimulation():
      // - input[id^="InvestmentAllocation_"]
      // - input[id^="StatePension_"]
      // - input[id^="P2StatePension_"]
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

function createStrictUi(doc) {
  function normalizePercentageForStorage(v) {
    if (v === undefined || v === null) return '';
    let s = String(v).trim();
    if (!s) return '';
    // Store "50%" as "50" like DOMUtils.setValue does for percentage fields.
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
      return el.value;
    }
  };
}

function seedLegacyDemoBaseParameterIds(ui) {
  // These are the parameter IDs present in src/frontend/web/assets/demo.csv (legacy save).
  // In the real web UI they exist; the test must seed them so setValue/getValue can behave strictly.
  const ids = [
    'StartCountry',
    'StartingAge',
    'TargetAge',
    'InitialSavings',
    'InitialPension',
    'InitialFunds',
    'InitialShares',
    'RetirementAge',
    'EmergencyStash',
    'PensionContributionPercentage',
    'PensionContributionCapped',
    'PensionGrowthRate',
    'PensionGrowthStdDev',
    'indexFundsGrowthRate',
    'indexFundsGrowthStdDev',
    'sharesGrowthRate',
    'sharesGrowthStdDev',
    'Inflation',
    'MarriageYear',
    'YoungestChildBorn',
    'OldestChildBorn',
    'PersonalTaxCredit',
    'StatePensionWeekly',
    'PriorityCash',
    'PriorityPension',
    'PriorityFunds',
    'PriorityShares',
    'P2StartingAge',
    'P2RetirementAge',
    'P2StatePensionWeekly',
    'InitialPensionP2',
    'PensionContributionPercentageP2',
    'simulation_mode',
    'economy_mode',

    // Legacy allocation + capital keys that are later normalized/migrated
    'InvestmentAllocation_indexFunds',
    'InvestmentAllocation_shares',
    'InitialCapital_indexFunds',
    'InitialCapital_shares',
  ];

  ids.forEach(id => ui.ensureParameterInput(id, 'string'));
}

module.exports = {
  name: 'LegacyScenarioDeserialization',
  description: 'Ensures legacy CSV scenarios populate per-country fields (state pension, allocations, pension capped).',
  isCustomTest: true,
  async runCustomTest() {
    const originalDocument = global.document;
    const originalConfig = global.Config;
    const errors = [];

    try {
      const doc = createParameterDocument();
      global.document = doc;

      // Minimal config stub used by deserializeSimulation() mapping logic.
      global.Config = {
        getInstance: () => ({
          getStartCountry: () => 'ie',
          getDefaultCountry: () => 'ie',
          getAvailableCountries: () => ([{ code: 'ie', name: 'Ireland' }])
        })
      };

      const ui = createStrictUi(doc);

      seedLegacyDemoBaseParameterIds(ui);

      const legacyCsv = fs.readFileSync(path.join(__dirname, '..', 'src', 'frontend', 'web', 'assets', 'demo.csv'), 'utf8');
      deserializeSimulation(legacyCsv, ui);

      // Per-country state pensions should be populated for StartCountry.
      const sp = doc.getElementById('StatePension_ie');
      if (!sp || !sp.value || sp.value.trim() === '') {
        errors.push('StatePension_ie was not populated from legacy StatePensionWeekly');
      }
      const sp2 = doc.getElementById('P2StatePension_ie');
      if (!sp2 || !sp2.value || sp2.value.trim() === '') {
        errors.push('P2StatePension_ie was not populated from legacy P2StatePensionWeekly');
      }

      // Per-country allocations should be populated for StartCountry.
      const allocFunds = doc.getElementById('InvestmentAllocation_ie_indexFunds');
      if (!allocFunds || !allocFunds.value || allocFunds.value.trim() === '') {
        const keys = Object.keys(doc._elements).filter(k => k.indexOf('InvestmentAllocation_') === 0).sort();
        const sample = keys.slice(0, 12).map(k => `${k}=${(doc._elements[k] && doc._elements[k].value) || ''}`).join(', ');
        errors.push('InvestmentAllocation_ie_indexFunds was not populated from legacy FundsAllocation/EtfAllocation (seen: ' + sample + ')');
      }
      const allocShares = doc.getElementById('InvestmentAllocation_ie_shares');
      if (!allocShares || !allocShares.value || allocShares.value.trim() === '') {
        const keys = Object.keys(doc._elements).filter(k => k.indexOf('InvestmentAllocation_') === 0).sort();
        const sample = keys.slice(0, 12).map(k => `${k}=${(doc._elements[k] && doc._elements[k].value) || ''}`).join(', ');
        errors.push('InvestmentAllocation_ie_shares was not populated from legacy SharesAllocation/TrustAllocation (seen: ' + sample + ')');
      }

      // Per-country pension capped should reflect legacy scalar, including non-Yes values.
      const cap = doc.getElementById('PensionCapped_ie');
      if (!cap || !cap.value || cap.value.trim() === '') {
        errors.push('PensionCapped_ie was not populated from legacy PensionContributionCapped');
      }

      // Also validate lower/odd casing normalization.
      const legacyCsvNo = legacyCsv.replace('\nPensionContributionCapped,Yes\n', '\nPensionContributionCapped,no\n');
      // Reset doc for a second pass
      const doc2 = createParameterDocument();
      global.document = doc2;
      const ui2 = createStrictUi(doc2);
      seedLegacyDemoBaseParameterIds(ui2);
      deserializeSimulation(legacyCsvNo, ui2);
      const cap2 = doc2.getElementById('PensionCapped_ie');
      if (!cap2 || cap2.value !== 'No') {
        errors.push('PensionCapped_ie did not normalize legacy "no" to "No"');
      }
    } catch (err) {
      errors.push('Unexpected error: ' + (err && err.message ? err.message : String(err)));
    } finally {
      global.document = originalDocument;
      global.Config = originalConfig;
    }

    return { success: errors.length === 0, errors };
  }
};

