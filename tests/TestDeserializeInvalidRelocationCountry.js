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

function createUiStub() {
  const store = {};
  return {
    ensureParameterInput() { },
    setValue(id, value) {
      store[id] = (value === undefined || value === null) ? '' : String(value);
    },
    getValue(id) {
      return Object.prototype.hasOwnProperty.call(store, id) ? store[id] : '';
    }
  };
}

function buildCsv(destinationCode) {
  return [
    '# FinSim v5.0 Save File',
    '# Parameters',
    'StartCountry,IE',
    'simulation_mode,single',
    'economy_mode,deterministic',
    '',
    '# Events',
    'Type,Name,Amount,FromAge,ToAge,Rate,Extra',
    'MV,' + destinationCode + ',0,40,40,,'
  ].join('\n');
}

module.exports = {
  name: 'DeserializeInvalidRelocationCountry',
  description: 'Ensures deserialization rejects relocation events pointing to unsupported countries.',
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
          getAvailableCountries: () => ([
            { code: 'ie', name: 'Ireland' },
            { code: 'us', name: 'United States' }
          ]),
          getCachedTaxRuleSet: () => ({ getResolvedInvestmentTypes: () => [] })
        })
      };
      global.document = undefined;

      const ui = createUiStub();

      let validRows = null;
      try {
        validRows = deserializeSimulation(buildCsv('US'), ui);
      } catch (err) {
        errors.push('Expected valid relocation destination to load, but got: ' + (err && err.message ? err.message : String(err)));
      }
      if (!Array.isArray(validRows) || validRows.length !== 1) {
        errors.push('Expected one event row for valid destination scenario.');
      }

      let threw = false;
      try {
        deserializeSimulation(buildCsv('ZZ'), ui);
      } catch (err) {
        threw = true;
        const msg = String((err && err.message) ? err.message : err);
        if (msg.indexOf('Invalid scenario file') === -1 || msg.indexOf('unsupported destination') === -1) {
          errors.push('Unexpected error message for invalid destination: ' + msg);
        }
      }
      if (!threw) {
        errors.push('Expected deserializeSimulation to throw for unsupported relocation destination.');
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
