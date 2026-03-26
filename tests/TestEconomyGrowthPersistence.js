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
    ensureEl: ensureEl,
    getElementById(id) {
      return elements[id] || null;
    },
    querySelectorAll(selector) {
      const m = String(selector || '').match(/^(?:[a-zA-Z]+)?\[id\^="([^"]+)"\]$/);
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

function createUiStub(doc, eventRows) {
  return {
    ensureParameterInput(id, className) {
      doc.ensureEl(id, className);
    },
    setValue(id, value) {
      const el = doc.ensureEl(id, '');
      el.value = (value === undefined || value === null) ? '' : String(value);
    },
    getValue(id) {
      const el = doc.getElementById(id);
      return el ? el.value : '';
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
      return Array.isArray(eventRows) ? eventRows : [];
    }
  };
}

function createRuleSet(currencyCode, investmentTypes) {
  const types = investmentTypes || [];
  return {
    getCurrencyCode: () => currencyCode,
    getCurrencySymbol: () => '¤',
    getInvestmentTypes: () => types,
    getResolvedInvestmentTypes: () => types
  };
}

function createConfigStub() {
  const ieRuleSet = createRuleSet('EUR', [
    { key: 'indexFunds_ie', residenceScope: 'local', baseRef: 'globalEquity' },
    { key: 'shares_ie', residenceScope: 'local' }
  ]);
  const usRuleSet = createRuleSet('USD', [
    { key: 'localIndex_us', residenceScope: 'local' }
  ]);

  return {
    getInstance: () => ({
      getStartCountry: () => 'ie',
      getDefaultCountry: () => 'ie',
      getCountryNameByCode: code => String(code || '').toUpperCase(),
      getInvestmentBaseTypes: () => ([
        { baseKey: 'globalEquity', label: 'Global Equity' },
        { baseKey: 'globalBonds', label: 'Global Bonds' }
      ]),
      listCachedRuleSets: () => ({ ie: ieRuleSet, us: usRuleSet }),
      getCachedTaxRuleSet: code => {
        const cc = String(code || '').trim().toLowerCase();
        if (cc === 'ie') return ieRuleSet;
        if (cc === 'us') return usRuleSet;
        return null;
      },
      getAvailableCountries: () => ([
        { code: 'ie', name: 'Ireland' },
        { code: 'us', name: 'United States' }
      ]),
      isRelocationEnabled: () => true
    })
  };
}

function assertEqual(actual, expected, label, errors) {
  if (actual !== expected) {
    errors.push(label + ': expected "' + expected + '", got "' + actual + '"');
  }
}

function assertContains(text, fragment, label, errors) {
  if (String(text || '').indexOf(fragment) === -1) {
    errors.push(label + ': missing "' + fragment + '"');
  }
}

function assertNotContains(text, fragment, label, errors) {
  if (String(text || '').indexOf(fragment) !== -1) {
    errors.push(label + ': should not contain "' + fragment + '"');
  }
}

function runCase(caseName, errors, fn) {
  const caseErrors = [];
  try {
    fn(caseErrors);
  } catch (err) {
    caseErrors.push(err && err.message ? err.message : String(err));
  }
  for (let i = 0; i < caseErrors.length; i++) {
    errors.push('[' + caseName + '] ' + caseErrors[i]);
  }
}

function runCanonicalEconomyRoundTripCase(errors) {
  global.Config = createConfigStub();

  const doc = createParameterDocument();
  global.document = doc;
  const ui = createUiStub(doc, []);

  ui.setValue('StartCountry', 'ie');
  ui.setValue('simulation_mode', 'single');
  ui.setValue('economy_mode', 'deterministic');
  ui.setValue('investmentStrategiesEnabled', 'off');

  ui.setValue('GlobalAssetGrowth_globalEquity', '7');
  ui.setValue('GlobalAssetVolatility_globalEquity', '15');
  ui.setValue('GlobalAssetGrowth_globalBonds', '3');
  ui.setValue('GlobalAssetVolatility_globalBonds', '6');
  ui.setValue('Inflation_ie', '2');
  ui.setValue('LocalAssetGrowth_ie_shares', '5');
  ui.setValue('LocalAssetVolatility_ie_shares', '12');

  // indexFunds_ie inherits from globalEquity, so local wrapper economy keys must not persist.
  ui.setValue('LocalAssetGrowth_ie_indexFunds', '99');
  ui.setValue('LocalAssetVolatility_ie_indexFunds', '88');

  const csv = serializeSimulation(ui);
  assertContains(csv, 'GlobalAssetGrowth_globalEquity,7', 'Serialize global growth', errors);
  assertContains(csv, 'GlobalAssetVolatility_globalEquity,15', 'Serialize global volatility', errors);
  assertContains(csv, 'GlobalAssetGrowth_globalBonds,3', 'Serialize second global growth', errors);
  assertContains(csv, 'GlobalAssetVolatility_globalBonds,6', 'Serialize second global volatility', errors);
  assertContains(csv, 'Inflation_ie,2', 'Serialize start-country inflation', errors);
  assertContains(csv, 'LocalAssetGrowth_ie_shares,5', 'Serialize local wrapper growth', errors);
  assertContains(csv, 'LocalAssetVolatility_ie_shares,12', 'Serialize local wrapper volatility', errors);
  assertNotContains(csv, 'LocalAssetGrowth_ie_indexFunds', 'Skip inherited local growth', errors);
  assertNotContains(csv, 'LocalAssetVolatility_ie_indexFunds', 'Skip inherited local volatility', errors);

  const doc2 = createParameterDocument();
  global.document = doc2;
  const ui2 = createUiStub(doc2, []);
  deserializeSimulation(csv, ui2);

  assertEqual(ui2.getValue('GlobalAssetGrowth_globalEquity'), '7', 'Deserialize global growth', errors);
  assertEqual(ui2.getValue('GlobalAssetVolatility_globalEquity'), '15', 'Deserialize global volatility', errors);
  assertEqual(ui2.getValue('GlobalAssetGrowth_globalBonds'), '3', 'Deserialize second global growth', errors);
  assertEqual(ui2.getValue('GlobalAssetVolatility_globalBonds'), '6', 'Deserialize second global volatility', errors);
  assertEqual(ui2.getValue('Inflation_ie'), '2', 'Deserialize start-country inflation', errors);
  assertEqual(ui2.getValue('LocalAssetGrowth_ie_shares'), '5', 'Deserialize local wrapper growth', errors);
  assertEqual(ui2.getValue('LocalAssetVolatility_ie_shares'), '12', 'Deserialize local wrapper volatility', errors);

  const csv2 = serializeSimulation(ui2);
  assertEqual(csv2, csv, 'Canonical economy idempotent re-serialize', errors);
}

function runRelocationEconomyRoundTripCase(errors) {
  global.Config = createConfigStub();

  const relocationEvents = [
    ['MV:US', '', '35', '35', '', '']
  ];

  const doc = createParameterDocument();
  global.document = doc;
  const ui = createUiStub(doc, relocationEvents);

  ui.setValue('StartCountry', 'ie');
  ui.setValue('simulation_mode', 'single');
  ui.setValue('economy_mode', 'deterministic');
  ui.setValue('investmentStrategiesEnabled', 'off');
  ui.setValue('Inflation_ie', '2');
  ui.setValue('Inflation_us', '3');
  ui.setValue('LocalAssetGrowth_us_localIndex', '6');
  ui.setValue('LocalAssetVolatility_us_localIndex', '14');

  const csv = serializeSimulation(ui);
  assertContains(csv, 'Inflation_us,3', 'Serialize relocation-country inflation', errors);
  assertContains(csv, 'LocalAssetGrowth_us_localIndex,6', 'Serialize relocation-country local growth', errors);
  assertContains(csv, 'LocalAssetVolatility_us_localIndex,14', 'Serialize relocation-country local volatility', errors);

  const doc2 = createParameterDocument();
  global.document = doc2;
  const ui2 = createUiStub(doc2, relocationEvents);
  deserializeSimulation(csv, ui2);

  assertEqual(ui2.getValue('Inflation_us'), '3', 'Deserialize relocation-country inflation', errors);
  assertEqual(ui2.getValue('LocalAssetGrowth_us_localIndex'), '6', 'Deserialize relocation-country local growth', errors);
  assertEqual(ui2.getValue('LocalAssetVolatility_us_localIndex'), '14', 'Deserialize relocation-country local volatility', errors);

  const csv2 = serializeSimulation(ui2);
  assertEqual(csv2, csv, 'Relocation economy idempotent re-serialize', errors);
}

function runLegacyNoBackfillCase(errors) {
  global.Config = createConfigStub();

  const doc = createParameterDocument();
  global.document = doc;
  const ui = createUiStub(doc, []);

  ui.setValue('StartCountry', 'ie');
  ui.setValue('simulation_mode', 'single');
  ui.setValue('economy_mode', 'deterministic');
  ui.setValue('investmentStrategiesEnabled', 'off');

  // Legacy scalar ids should not backfill canonical per-country economy ids on save.
  ui.setValue('Inflation', '3');
  ui.setValue('shares_ieGrowthRate', '4');
  ui.setValue('shares_ieGrowthStdDev', '9');

  const csv = serializeSimulation(ui);
  assertNotContains(csv, 'Inflation_ie,3', 'Legacy Inflation should not backfill Inflation_ie', errors);
  assertNotContains(csv, 'LocalAssetGrowth_ie_shares,4', 'Legacy growth should not backfill local growth', errors);
  assertNotContains(csv, 'LocalAssetVolatility_ie_shares,9', 'Legacy volatility should not backfill local volatility', errors);

  const csvAgain = serializeSimulation(ui);
  assertEqual(csvAgain, csv, 'Stable serialize without canonical economy values', errors);

  const doc2 = createParameterDocument();
  global.document = doc2;
  const ui2 = createUiStub(doc2, []);
  deserializeSimulation(csv, ui2);

  assertEqual(ui2.getValue('Inflation_ie'), '', 'Deserialize should not synthesize Inflation_ie from legacy scalar', errors);
  assertEqual(ui2.getValue('LocalAssetGrowth_ie_shares'), '', 'Deserialize should not synthesize local growth from legacy scalar', errors);
  assertEqual(ui2.getValue('LocalAssetVolatility_ie_shares'), '', 'Deserialize should not synthesize local volatility from legacy scalar', errors);
}

module.exports = {
  name: 'EconomyGrowthPersistence',
  description: 'Owns current economy-field persistence contracts (canonical keys, baseRef behavior, relocation-country locals).',
  isCustomTest: true,
  async runCustomTest() {
    const originalConfig = global.Config;
    const originalDocument = global.document;
    const errors = [];

    try {
      runCase('Canonical economy round-trip', errors, runCanonicalEconomyRoundTripCase);
      runCase('Relocation-country local economy round-trip', errors, runRelocationEconomyRoundTripCase);
      runCase('Legacy scalar no-backfill', errors, runLegacyNoBackfillCase);
    } finally {
      global.Config = originalConfig;
      global.document = originalDocument;
    }

    return { success: errors.length === 0, errors };
  }
};
