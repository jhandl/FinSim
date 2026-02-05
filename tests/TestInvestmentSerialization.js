/**
 * TestInvestmentSerialization.js
 * Verifies CSV round-trip behavior for investment parameters: IE namespaced keys,
 * legacy field mapping (InitialETFs/InitialFunds → InitialCapital_indexFunds_ie),
 * per-country allocation format (generic vs chip-driven IDs), and idempotence.
 *
 * Legacy field mapping: InitialETFs and InitialFunds both map to InitialCapital_indexFunds;
 * InitialShares → InitialCapital_shares; FundsAllocation/EtfAllocation →
 * InvestmentAllocation_indexFunds; SharesAllocation/TrustAllocation →
 * InvestmentAllocation_shares. Deserializer then normalizes unscoped keys using
 * StartCountry (e.g. InitialCapital_indexFunds → InitialCapital_indexFunds_ie) and
 * clears the legacy keys.
 *
 * Per-country allocation format: CSV stores generic keys (InvestmentAllocation_indexFunds_ie);
 * when relocation is enabled the UI may use chip-driven IDs (InvestmentAllocation_ie_indexFunds).
 * Serialization prefers chip-driven when present and writes generic; deserialization sets
 * generic then maps to chip-driven via document.querySelectorAll.
 *
 * Idempotence: we verify csv1 === csv2 after serialize → deserialize → serialize.
 * Seeding must include all params that serializeSimulation writes (e.g. economy toggles,
 * per-country economy fields) so the first CSV is full and the second matches.
 *
 * Raw DOM value checks: we use doc.getElementById(id).value (raw) in assertions so empty
 * percentage inputs stay ''; DOMUtils.getValue returns 0 for empty numeric/percentage inputs.
 */
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

// IE investment type definitions from tax-rules-ie.json (indexFunds_ie, shares_ie)
const IE_INVESTMENT_TYPES = [
  { key: 'indexFunds_ie', label: 'Index Funds', baseRef: 'globalEquity', baseCurrency: 'EUR', assetCountry: 'ie', residenceScope: 'local', taxation: { exitTax: { rate: 0.38, deemedDisposalYears: 8, allowLossOffset: false, eligibleForAnnualExemption: false } } },
  { key: 'shares_ie', label: 'Shares', baseCurrency: 'EUR', assetCountry: 'ie', residenceScope: 'local', taxation: { capitalGains: { rateRef: 'capitalGainsTax.rate', annualExemptionRef: 'capitalGainsTax.annualExemption', allowLossOffset: true } } }
];

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
      // Support input[id^="InvestmentAllocation_"] and input[id^="InitialCapital_"]
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

function createUiStub(doc) {
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
      // Raw DOM value: empty percentage fields return '' (tests distinguish empty vs 0)
      const v = (el.value === undefined || el.value === null) ? '' : String(el.value);
      const isPercentage = String(el.className || '').indexOf('percentage') >= 0;
      if (v === '' && isPercentage) return 0;
      return el.value;
    },
    getVersion: () => '2.0',
    isPercentage: () => false,
    isBoolean: () => false,
    getTableData: () => []
  };
}

function createConfigStub(opts) {
  const relocation = (opts && opts.relocationEnabled) === true;
  const fakeRuleset = createFakeRuleset();

  return {
    isRelocationEnabled: () => relocation,
    getStartCountry: () => 'ie',
    getDefaultCountry: () => 'ie',
    getCountryNameByCode: (code) => (code || '').toUpperCase(),
    getInvestmentBaseTypes: () => [],
    listCachedRuleSets: () => ({ ie: fakeRuleset }),
    getCachedTaxRuleSet: (code) => fakeRuleset,
    getAvailableCountries: () => [{ code: 'ie', name: 'Ireland' }]
  };
}

function createFakeRuleset() {
  return {
    getCurrencyCode: () => 'EUR',
    getCurrencySymbol: () => '€',
    getInvestmentTypes: () => IE_INVESTMENT_TYPES,
    getResolvedInvestmentTypes: () => IE_INVESTMENT_TYPES
  };
}

function seedParameterIds(ui, extraIds) {
  const ids = [
    'StartingAge', 'TargetAge', 'InitialSavings', 'StartCountry',
    'InitialPension', 'RetirementAge', 'EmergencyStash',
    'PensionContributionPercentage', 'PensionContributionCapped',
    'PensionGrowthRate', 'PensionGrowthStdDev', 'Inflation',
    'MarriageYear', 'YoungestChildBorn', 'OldestChildBorn',
    'PersonalTaxCredit', 'StatePensionWeekly',
    'Priority_cash', 'Priority_pension', 'Priority_indexFunds', 'Priority_shares',
    'P2StartingAge', 'P2RetirementAge', 'P2StatePensionWeekly',
    'InitialPensionP2', 'PensionContributionPercentageP2',
    'simulation_mode', 'economy_mode',
    'investmentStrategiesEnabled', 'perCountryInvestmentsEnabled',
    'InitialCapital_indexFunds_ie', 'InitialCapital_shares_ie',
    'InvestmentAllocation_indexFunds_ie', 'InvestmentAllocation_shares_ie',
    'InitialCapital_indexFunds', 'InitialCapital_shares',
    'InvestmentAllocation_indexFunds', 'InvestmentAllocation_shares',
    'InitialFunds', 'InitialShares', 'FundsAllocation', 'SharesAllocation',
    'InitialETFs',
    'shares_ieGrowthRate', 'shares_ieGrowthStdDev',
    'PensionGrowth_ie', 'PensionVolatility_ie', 'Inflation_ie'
  ];
  const all = extraIds ? [...ids, ...extraIds] : ids;
  all.forEach((id) => {
    const isAlloc = id.indexOf('InvestmentAllocation_') === 0;
    const isPct = id.indexOf('Percentage') >= 0 || id.indexOf('Allocation') >= 0 || id.indexOf('Rate') >= 0 || id.indexOf('StdDev') >= 0 || id.indexOf('Inflation_') === 0;
    ui.ensureParameterInput(id, isAlloc || isPct ? 'percentage' : 'string');
  });
}

function seedLegacyDemoBaseParameterIds(ui) {
  const ids = [
    'StartCountry', 'StartingAge', 'TargetAge', 'InitialSavings', 'InitialPension',
    'InitialFunds', 'InitialShares', 'RetirementAge', 'EmergencyStash',
    'PensionContributionPercentage', 'PensionContributionCapped', 'PensionGrowthRate',
    'PensionGrowthStdDev', 'indexFundsGrowthRate', 'indexFundsGrowthStdDev',
    'sharesGrowthRate', 'sharesGrowthStdDev', 'Inflation', 'MarriageYear',
    'YoungestChildBorn', 'OldestChildBorn', 'PersonalTaxCredit', 'StatePensionWeekly',
    'Priority_cash', 'Priority_pension', 'Priority_indexFunds', 'Priority_shares',
    'P2StartingAge', 'P2RetirementAge', 'P2StatePensionWeekly', 'InitialPensionP2',
    'PensionContributionPercentageP2', 'simulation_mode', 'economy_mode',
    'investmentStrategiesEnabled', 'perCountryInvestmentsEnabled',
    'InvestmentAllocation_indexFunds', 'InvestmentAllocation_shares',
    'InitialCapital_indexFunds', 'InitialCapital_shares',
    'InvestmentAllocation_indexFunds_ie', 'InvestmentAllocation_shares_ie',
    'InitialCapital_indexFunds_ie', 'InitialCapital_shares_ie'
  ];
  ids.forEach((id) => {
    const isAlloc = id.indexOf('InvestmentAllocation_') === 0;
    const isPct = id.indexOf('Percentage') >= 0 || id.indexOf('Allocation') >= 0 || id.indexOf('Rate') >= 0 || id.indexOf('StdDev') >= 0;
    ui.ensureParameterInput(id, isAlloc || isPct ? 'percentage' : 'string');
  });
}

function fail(errors, message) {
  errors.push(message);
}

module.exports = {
  name: 'InvestmentSerialization',
  description: 'Ensures CSV round-trip for investment params, legacy mapping, per-country allocations, and idempotence.',
  isCustomTest: true,
  async runCustomTest() {
    const originalDocument = global.document;
    const originalConfig = global.Config;
    const errors = [];

    try {
      // --- Save IE scenario includes InitialCapital_indexFunds_ie ---
      try {
        const doc = createParameterDocument();
        global.document = doc;
        global.Config = { getInstance: () => createConfigStub({ relocationEnabled: false }) };
        const ui = createUiStub(doc);
        seedParameterIds(ui);

        ui.setValue('StartCountry', 'ie');
        ui.setValue('InitialCapital_indexFunds_ie', '10000');
        ui.setValue('InitialCapital_shares_ie', '5000');
        ui.setValue('InvestmentAllocation_indexFunds_ie', '60');
        ui.setValue('InvestmentAllocation_shares_ie', '40');
        ui.setValue('StartingAge', '30');
        ui.setValue('TargetAge', '90');
        ui.setValue('InitialSavings', '5000');
        ui.setValue('simulation_mode', 'single');
        ui.setValue('economy_mode', 'deterministic');

        const csv = serializeSimulation(ui);

        if (csv.indexOf('InitialCapital_indexFunds_ie,10000') === -1) fail(errors, 'CSV missing InitialCapital_indexFunds_ie,10000');
        if (csv.indexOf('InitialCapital_shares_ie,5000') === -1) fail(errors, 'CSV missing InitialCapital_shares_ie,5000');
        if (csv.indexOf('InvestmentAllocation_indexFunds_ie,60') === -1) fail(errors, 'CSV missing InvestmentAllocation_indexFunds_ie,60');
        if (csv.indexOf('InvestmentAllocation_shares_ie,40') === -1) fail(errors, 'CSV missing InvestmentAllocation_shares_ie,40');
        if (csv.indexOf('InitialFunds,') >= 0 || csv.indexOf('InitialShares,') >= 0) fail(errors, 'CSV must not contain legacy InitialFunds/InitialShares');
        if (csv.indexOf('FundsAllocation,') >= 0 || csv.indexOf('SharesAllocation,') >= 0) fail(errors, 'CSV must not contain legacy FundsAllocation/SharesAllocation');
      } catch (e) {
        fail(errors, 'Save IE scenario: ' + (e.message || String(e)));
      }

      // --- Load IE scenario restores params correctly ---
      try {
        const csv = [
          '# FinSim v2.0',
          '# Parameters',
          'StartCountry,ie',
          'InitialCapital_indexFunds_ie,10000',
          'InitialCapital_shares_ie,5000',
          'InvestmentAllocation_indexFunds_ie,60',
          'InvestmentAllocation_shares_ie,40',
          '',
          '# Events',
          'Type,Name,Amount,FromAge,ToAge,Rate,Extra,Meta',
          'NOP,,,,,,,'
        ].join('\n');

        const doc = createParameterDocument();
        global.document = doc;
        global.Config = { getInstance: () => createConfigStub({ relocationEnabled: false }) };
        const ui = createUiStub(doc);
        seedParameterIds(ui);

        deserializeSimulation(csv, ui);

        const raw = (id) => { const el = doc.getElementById(id); return el ? String(el.value || '') : ''; };
        if (raw('InitialCapital_indexFunds_ie') !== '10000') fail(errors, 'Load: InitialCapital_indexFunds_ie expected 10000, got ' + raw('InitialCapital_indexFunds_ie'));
        if (raw('InitialCapital_shares_ie') !== '5000') fail(errors, 'Load: InitialCapital_shares_ie expected 5000, got ' + raw('InitialCapital_shares_ie'));
        if (raw('InvestmentAllocation_indexFunds_ie') !== '60') fail(errors, 'Load: InvestmentAllocation_indexFunds_ie expected 60, got ' + raw('InvestmentAllocation_indexFunds_ie'));
        if (raw('InvestmentAllocation_shares_ie') !== '40') fail(errors, 'Load: InvestmentAllocation_shares_ie expected 40, got ' + raw('InvestmentAllocation_shares_ie'));
      } catch (e) {
        fail(errors, 'Load IE scenario: ' + (e.message || String(e)));
      }

      // --- Legacy InitialETFs/InitialFunds map to InitialCapital_indexFunds_ie ---
      try {
        const legacyCsv = [
          '# FinSim v1.27',
          '# Parameters',
          'StartCountry,ie',
          'InitialETFs,15000',
          'InitialFunds,15000',
          'InitialShares,8000',
          'FundsAllocation,70',
          'SharesAllocation,30',
          '',
          '# Events',
          'Type,Name,Amount,FromAge,ToAge,Rate,Extra,Meta',
          'NOP,,,,,,,'
        ].join('\n');

        const doc = createParameterDocument();
        global.document = doc;
        global.Config = { getInstance: () => createConfigStub({ relocationEnabled: false }) };
        const ui = createUiStub(doc);
        seedParameterIds(ui);

        deserializeSimulation(legacyCsv, ui);

        const raw = (id) => { const el = doc.getElementById(id); return el ? String(el.value || '') : ''; };
        if (raw('InitialCapital_indexFunds_ie') !== '15000') fail(errors, 'Legacy: InitialCapital_indexFunds_ie expected 15000, got ' + raw('InitialCapital_indexFunds_ie'));
        if (raw('InitialCapital_shares_ie') !== '8000') fail(errors, 'Legacy: InitialCapital_shares_ie expected 8000, got ' + raw('InitialCapital_shares_ie'));
        if (raw('InvestmentAllocation_indexFunds_ie') !== '70') fail(errors, 'Legacy: InvestmentAllocation_indexFunds_ie expected 70, got ' + raw('InvestmentAllocation_indexFunds_ie'));
        if (raw('InvestmentAllocation_shares_ie') !== '30') fail(errors, 'Legacy: InvestmentAllocation_shares_ie expected 30, got ' + raw('InvestmentAllocation_shares_ie'));
        const legacyFunds = raw('InitialETFs');
        const legacyFundsAlt = raw('InitialFunds');
        if (legacyFunds !== '' && legacyFunds !== undefined) fail(errors, 'Legacy: InitialETFs should be cleared, got ' + legacyFunds);
        if (legacyFundsAlt !== '' && legacyFundsAlt !== undefined) fail(errors, 'Legacy: InitialFunds should be cleared, got ' + legacyFundsAlt);
      } catch (e) {
        fail(errors, 'Legacy mapping: ' + (e.message || String(e)));
      }

      // --- Per-country allocations persist with relocation enabled ---
      try {
        const doc = createParameterDocument();
        global.document = doc;
        global.Config = { getInstance: () => createConfigStub({ relocationEnabled: true }) };
        const ui = createUiStub(doc);
        seedParameterIds(ui, ['InvestmentAllocation_ie_indexFunds', 'InvestmentAllocation_ie_shares']);

        ui.setValue('InvestmentAllocation_ie_indexFunds', '60');
        ui.setValue('InvestmentAllocation_ie_shares', '40');
        ui.setValue('StartCountry', 'ie');
        ui.setValue('StartingAge', '30');
        ui.setValue('TargetAge', '90');
        ui.setValue('InitialSavings', '5000');
        ui.setValue('simulation_mode', 'single');
        ui.setValue('economy_mode', 'deterministic');

        const csv = serializeSimulation(ui);
        if (csv.indexOf('InvestmentAllocation_indexFunds_ie,60') === -1) fail(errors, 'Per-country serialize: missing InvestmentAllocation_indexFunds_ie,60');
        if (csv.indexOf('InvestmentAllocation_shares_ie,40') === -1) fail(errors, 'Per-country serialize: missing InvestmentAllocation_shares_ie,40');

        const doc2 = createParameterDocument();
        global.document = doc2;
        const ui2 = createUiStub(doc2);
        seedParameterIds(ui2, ['InvestmentAllocation_ie_indexFunds', 'InvestmentAllocation_ie_shares']);

        deserializeSimulation(csv, ui2);
        const raw2 = (id) => { const el = doc2.getElementById(id); return el ? String(el.value || '') : ''; };
        if (raw2('InvestmentAllocation_ie_indexFunds') !== '60') fail(errors, 'Per-country deserialize: InvestmentAllocation_ie_indexFunds expected 60, got ' + raw2('InvestmentAllocation_ie_indexFunds'));
        if (raw2('InvestmentAllocation_ie_shares') !== '40') fail(errors, 'Per-country deserialize: InvestmentAllocation_ie_shares expected 40, got ' + raw2('InvestmentAllocation_ie_shares'));
      } catch (e) {
        fail(errors, 'Per-country allocations: ' + (e.message || String(e)));
      }

      // --- demo.csv deserializes correctly ---
      try {
        const demoPath = path.join(__dirname, '..', 'src', 'frontend', 'web', 'assets', 'demo.csv');
        const demoCsv = fs.readFileSync(demoPath, 'utf8');

        const doc = createParameterDocument();
        global.document = doc;
        global.Config = { getInstance: () => createConfigStub({ relocationEnabled: false }) };
        const ui = createUiStub(doc);
        seedLegacyDemoBaseParameterIds(ui);

        deserializeSimulation(demoCsv, ui);

        const raw = (id) => { const el = doc.getElementById(id); return el ? String(el.value || '') : ''; };
        if (raw('StartCountry') !== 'IE') fail(errors, 'demo.csv: StartCountry expected IE, got ' + raw('StartCountry'));
        if (raw('simulation_mode') !== 'couple') fail(errors, 'demo.csv: simulation_mode expected couple, got ' + raw('simulation_mode'));
        if (!raw('InitialCapital_indexFunds_ie') && !raw('InitialCapital_indexFunds')) fail(errors, 'demo.csv: InitialCapital_indexFunds_ie or InitialCapital_indexFunds should have value');
        if (!raw('InitialCapital_shares_ie') && !raw('InitialCapital_shares')) fail(errors, 'demo.csv: InitialCapital_shares_ie or InitialCapital_shares should have value');
        if (!raw('InvestmentAllocation_indexFunds_ie') && !raw('InvestmentAllocation_indexFunds')) fail(errors, 'demo.csv: InvestmentAllocation_indexFunds_ie or _indexFunds should have value');
        if (!raw('InvestmentAllocation_shares_ie') && !raw('InvestmentAllocation_shares')) fail(errors, 'demo.csv: InvestmentAllocation_shares_ie or _shares should have value');
      } catch (e) {
        fail(errors, 'demo.csv deserialize: ' + (e.message || String(e)));
      }

      // --- CSV round-trip is idempotent ---
      try {
        const doc1 = createParameterDocument();
        global.document = doc1;
        global.Config = { getInstance: () => createConfigStub({ relocationEnabled: false }) };
        const ui1 = createUiStub(doc1);
        seedParameterIds(ui1);
        ui1.setValue('StartCountry', 'ie');
        ui1.setValue('InitialCapital_indexFunds_ie', '10000');
        ui1.setValue('InitialCapital_shares_ie', '5000');
        ui1.setValue('InvestmentAllocation_indexFunds_ie', '60');
        ui1.setValue('InvestmentAllocation_shares_ie', '40');
        ui1.setValue('StartingAge', '30');
        ui1.setValue('TargetAge', '90');
        ui1.setValue('InitialSavings', '5000');
        ui1.setValue('simulation_mode', 'single');
        ui1.setValue('economy_mode', 'deterministic');
        ui1.setValue('investmentStrategiesEnabled', 'off');
        ui1.setValue('perCountryInvestmentsEnabled', 'off');

        const csv1 = serializeSimulation(ui1);

        const doc2 = createParameterDocument();
        global.document = doc2;
        const ui2 = createUiStub(doc2);
        seedParameterIds(ui2);
        deserializeSimulation(csv1, ui2);
        const csv2 = serializeSimulation(ui2);

        if (csv1 !== csv2) {
          fail(errors, 'CSV round-trip is not idempotent');
          const lines1 = csv1.split('\n');
          const lines2 = csv2.split('\n');
          const minLen = Math.min(lines1.length, lines2.length);
          for (let i = 0; i < minLen; i++) {
            if (lines1[i] !== lines2[i]) {
              fail(errors, 'First differing line ' + (i + 1) + ': expected "' + lines1[i] + '", got "' + lines2[i] + '"');
              break;
            }
          }
          if (lines1.length !== lines2.length) {
            fail(errors, 'Line count mismatch: original ' + lines1.length + ', re-serialized ' + lines2.length);
          }
        }
      } catch (e) {
        fail(errors, 'Idempotence: ' + (e.message || String(e)));
      }

      // --- Empty investment allocations remain empty ---
      try {
        const csv = [
          '# FinSim v2.0',
          '# Parameters',
          'StartCountry,ie',
          'simulation_mode,single',
          'economy_mode,deterministic',
          'InvestmentAllocation_indexFunds_ie,',
          'InvestmentAllocation_shares_ie,',
          '',
          '# Events',
          'Type,Name,Amount,FromAge,ToAge,Rate,Extra,Meta',
          'NOP,,,,,,,'
        ].join('\n');

        const doc = createParameterDocument();
        global.document = doc;
        global.Config = { getInstance: () => createConfigStub({ relocationEnabled: false }) };
        const ui = createUiStub(doc);
        seedParameterIds(ui);

        deserializeSimulation(csv, ui);

        const raw = (id) => { const el = doc.getElementById(id); return el ? String(el.value || '') : ''; };
        const ieFunds = raw('InvestmentAllocation_ie_indexFunds');
        const ieShares = raw('InvestmentAllocation_ie_shares');
        if (ieFunds !== '') fail(errors, 'Empty allocations: InvestmentAllocation_ie_indexFunds should stay empty, got "' + ieFunds + '"');
        if (ieShares !== '') fail(errors, 'Empty allocations: InvestmentAllocation_ie_shares should stay empty, got "' + ieShares + '"');

        const csv2 = serializeSimulation(ui);
        if (csv2.indexOf('InvestmentAllocation_indexFunds_ie,') === -1 || csv2.indexOf('InvestmentAllocation_shares_ie,') === -1) {
          fail(errors, 'Empty allocations: re-serialized CSV should contain empty allocation values');
        }
      } catch (e) {
        fail(errors, 'Empty preservation: ' + (e.message || String(e)));
      }

      // --- Missing StartCountry uses default ---
      try {
        const csv = [
          '# FinSim v2.0',
          '# Parameters',
          'InitialFunds,12000',
          'InitialShares,6000',
          'FundsAllocation,60',
          'SharesAllocation,40',
          '',
          '# Events',
          'Type,Name,Amount,FromAge,ToAge,Rate,Extra,Meta',
          'NOP,,,,,,,'
        ].join('\n');

        const doc = createParameterDocument();
        global.document = doc;
        global.Config = { getInstance: () => createConfigStub({ relocationEnabled: false }) };
        const ui = createUiStub(doc);
        seedParameterIds(ui);

        deserializeSimulation(csv, ui);

        const raw = (id) => { const el = doc.getElementById(id); return el ? String(el.value || '') : ''; };
        if (!raw('InitialCapital_indexFunds_ie') && !raw('InitialCapital_indexFunds')) fail(errors, 'Missing StartCountry: legacy InitialFunds should map (via default ie)');
        if (!raw('InvestmentAllocation_indexFunds_ie') && !raw('InvestmentAllocation_indexFunds')) fail(errors, 'Missing StartCountry: legacy FundsAllocation should map');
      } catch (e) {
        fail(errors, 'Missing StartCountry: ' + (e.message || String(e)));
      }

      // --- Invalid investment keys ignored gracefully ---
      try {
        const csv = [
          '# FinSim v2.0',
          '# Parameters',
          'StartCountry,ie',
          'InitialCapital_unknown_ie,999',
          'InvestmentAllocation_indexFunds_ie,50',
          'InvestmentAllocation_shares_ie,50',
          '',
          '# Events',
          'Type,Name,Amount,FromAge,ToAge,Rate,Extra,Meta',
          'NOP,,,,,,,'
        ].join('\n');

        const doc = createParameterDocument();
        global.document = doc;
        global.Config = { getInstance: () => createConfigStub({ relocationEnabled: false }) };
        const ui = createUiStub(doc);
        seedParameterIds(ui);

        deserializeSimulation(csv, ui);

        const raw = (id) => { const el = doc.getElementById(id); return el ? String(el.value || '') : ''; };
        if (raw('InvestmentAllocation_indexFunds_ie') !== '50') fail(errors, 'Invalid keys: known InvestmentAllocation_indexFunds_ie should be 50');
        if (raw('InvestmentAllocation_shares_ie') !== '50') fail(errors, 'Invalid keys: known InvestmentAllocation_shares_ie should be 50');
      } catch (e) {
        fail(errors, 'Invalid keys: ' + (e.message || String(e)));
      }
    } catch (e) {
      errors.push('Unexpected: ' + (e.message || String(e)));
    } finally {
      global.document = originalDocument;
      global.Config = originalConfig;
    }

    return { success: errors.length === 0, errors };
  }
};
