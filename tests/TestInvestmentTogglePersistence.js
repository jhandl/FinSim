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

function createUiStub() {
  const store = {};
  return {
    _store: store,
    ensureParameterInput() { },
    setValue(id, value) {
      store[id] = value;
    },
    getValue(id) {
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
  name: 'InvestmentTogglePersistence',
  description: 'Ensures investment toggle fields serialize and default to off on legacy loads.',
  isCustomTest: true,
  async runCustomTest() {
    const originalConfig = global.Config;
    const originalDocument = global.document;
    const errors = [];

    try {
      global.Config = {
        getInstance: () => ({
          getStartCountry: () => 'ie',
          getDefaultCountry: () => 'ie',
          getAvailableCountries: () => ([{ code: 'ie', name: 'Ireland' }]),
          getInvestmentBaseTypes: () => ([]),
          getCachedTaxRuleSet: () => ({ getResolvedInvestmentTypes: () => [] }),
          isRelocationEnabled: () => false
        })
      };
      global.document = undefined;

      const uiLegacy = createUiStub();
      const legacyCsv = buildCsv([
        'StartingAge,30',
        'simulation_mode,single'
      ]);
      deserializeSimulation(legacyCsv, uiLegacy);
      if (uiLegacy.getValue('investmentStrategiesEnabled') !== 'off') {
        errors.push('Expected investmentStrategiesEnabled to default to off for legacy scenario.');
      }
      if (uiLegacy.getValue('perCountryInvestmentsEnabled') !== 'off') {
        errors.push('Expected perCountryInvestmentsEnabled to default to off for legacy scenario.');
      }

      const uiLoaded = createUiStub();
      const explicitCsv = buildCsv([
        'StartingAge,30',
        'simulation_mode,single',
        'investmentStrategiesEnabled,on',
        'perCountryInvestmentsEnabled,off'
      ]);
      deserializeSimulation(explicitCsv, uiLoaded);
      if (uiLoaded.getValue('investmentStrategiesEnabled') !== 'on') {
        errors.push('Expected investmentStrategiesEnabled to preserve on from file.');
      }
      if (uiLoaded.getValue('perCountryInvestmentsEnabled') !== 'off') {
        errors.push('Expected perCountryInvestmentsEnabled to preserve off from file.');
      }

      const uiSerialize = createUiStub();
      uiSerialize.setValue('investmentStrategiesEnabled', true);
      uiSerialize.setValue('perCountryInvestmentsEnabled', false);
      const serializedCsv = serializeSimulation(uiSerialize);
      if (serializedCsv.indexOf('investmentStrategiesEnabled,true') === -1) {
        errors.push('Expected serializeSimulation to include investmentStrategiesEnabled,true.');
      }
      if (serializedCsv.indexOf('perCountryInvestmentsEnabled,false') === -1) {
        errors.push('Expected serializeSimulation to include perCountryInvestmentsEnabled,false.');
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
