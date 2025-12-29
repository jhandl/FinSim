require('../src/core/Utils.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const utilsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'Utils.js'), 'utf8');
vm.runInThisContext(utilsSource);

const serializeSimulation = global.serializeSimulation;
const deserializeSimulation = global.deserializeSimulation;

function createFakeDocument(metaRows) {
  return {
    getElementById(id) {
      if (id !== 'Events') return null;
      const rows = metaRows.map(meta => ({
        classList: { contains: () => false },
        getElementsByTagName: () => ([{}, {}]),
        querySelector(selector) {
          switch (selector) {
            case '.event-currency':
              return meta.currency ? { value: meta.currency } : null;
            case '.event-linked-country':
              return meta.linkedCountry ? { value: meta.linkedCountry } : null;
            case '.event-linked-event-id':
              return meta.linkedEventId ? { value: meta.linkedEventId } : null;
            case '.event-resolution-override':
              return meta.resolutionOverride ? { value: meta.resolutionOverride } : null;
            default:
              return null;
          }
        }
      }));

      return {
        getElementsByTagName(tag) {
          if (tag === 'tr') return rows;
          return [];
        }
      };
    }
  };
}

module.exports = {
  name: 'CSVMultiCurrencyRoundTrip',
  description: 'Ensures serialize/deserialize preserve multi-currency metadata and comments.',
  isCustomTest: true,
  async runCustomTest() {
    const originalDocument = global.document;
    const originalConfig = global.Config;
    const errors = [];

    try {
      const parameterMap = {
        StartingAge: '30',
        TargetAge: '60',
        StartCountry: 'aa',
        InitialSavings: '10000',
        P2StartingAge: '',
        simulation_mode: 'single',
        economy_mode: 'deterministic'
      };

      const fakeUI = {
        getVersion: () => '1.0',
        getValue: key => parameterMap[key],
        isPercentage: () => false,
        isBoolean: () => false,
        getTableData: () => [
          ['SI:Salary', '50000', '30', '30', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
          ['RI:Rent', '12000', '35', '40', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
          ['MV-bb:Move', '0', '35', '35', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
        ]
      };

      const fakeRuleSet = {
        getCurrencyCode: () => 'AAA',
        getCurrencySymbol: () => '¤A',
        getInvestmentTypes: () => []
      };

      const fakeConfigInstance = {
        isRelocationEnabled: () => true,
        getCountryNameByCode: code => (code || '').toUpperCase(),
        listCachedRuleSets: () => ({ aa: fakeRuleSet, bb: fakeRuleSet }),
        getCachedTaxRuleSet: () => fakeRuleSet,
        getDefaultCountry: () => 'aa',
        getStartCountry: () => 'aa'
      };

      global.Config = {
        getInstance: () => fakeConfigInstance
      };

      const metaRows = [
        { currency: 'AAA', linkedCountry: '', linkedEventId: '', resolutionOverride: '' },
        { currency: 'BBB', linkedCountry: 'bb', linkedEventId: 'split_1', resolutionOverride: '' },
        { currency: '', linkedCountry: '', linkedEventId: '', resolutionOverride: '1' }
      ];

      global.document = createFakeDocument(metaRows);

      const csv = serializeSimulation(fakeUI);
      if (typeof csv !== 'string' || csv.indexOf('# Multi-Currency Context') === -1) {
        errors.push('Serialized CSV missing relocation metadata comments');
      }

      const sinkValues = {};
      const uiSink = {
        setValue(key, value) { sinkValues[key] = value; }
      };

      const eventRows = deserializeSimulation(csv, uiSink);
      if (!Array.isArray(eventRows) || eventRows.length !== 3) {
        errors.push('Deserialized event rows count mismatch');
      } else {
        const metaColumn = eventRows[1] && eventRows[1][eventRows[1].length - 1];
        if (!metaColumn || metaColumn.indexOf('cur=BBB') === -1 || metaColumn.indexOf('lc=bb') === -1 || metaColumn.indexOf('lei=split_1') === -1) {
          errors.push('Meta column did not preserve currency/country/linkage data');
        }
        const overrideMeta = eventRows[2][eventRows[2].length - 1] || '';
        if (overrideMeta.indexOf('ro=1') === -1) {
          errors.push('Resolution override flag not preserved in Meta column');
        }
      }

      if (sinkValues.StartCountry !== 'aa') {
        errors.push('StartCountry parameter not restored during deserialization');
      }

      // Test idempotence: re-serialize the deserialized scenario and compare CSVs
      function parseMetaColumn(metaStr) {
        const meta = { currency: '', linkedCountry: '', linkedEventId: '', resolutionOverride: '' };
        if (!metaStr || metaStr.trim() === '') return meta;
        const pairs = metaStr.split(';');
        for (const pair of pairs) {
          const [key, value] = pair.split('=');
          if (key === 'cur') meta.currency = decodeURIComponent(value || '');
          if (key === 'lc') meta.linkedCountry = decodeURIComponent(value || '');
          if (key === 'lei') meta.linkedEventId = decodeURIComponent(value || '');
          if (key === 'ro') meta.resolutionOverride = decodeURIComponent(value || '');
        }
        return meta;
      }

      const deserializedMetaRows = eventRows.map(row => {
        const metaStr = row[row.length - 1] || '';
        return parseMetaColumn(metaStr);
      });

      const reSerializedFakeUI = {
        getVersion: () => '1.0',
        getValue: key => sinkValues[key] || parameterMap[key] || '',
        isPercentage: () => false,
        isBoolean: () => false,
        getTableData: () => {
          return eventRows.map(row => {
            const [type, name, ...rest] = row;
            const metaIndex = rest.length - 1;
            const eventFields = rest.slice(0, metaIndex);
            return [`${type}:${name}`, ...eventFields];
          });
        }
      };

      global.document = createFakeDocument(deserializedMetaRows);
      const csv2 = serializeSimulation(reSerializedFakeUI);

      if (csv !== csv2) {
        errors.push('CSV round-trip failed: re-serialized CSV does not match original');
        const lines1 = csv.split('\n');
        const lines2 = csv2.split('\n');
        const minLen = Math.min(lines1.length, lines2.length);
        for (let i = 0; i < minLen; i++) {
          if (lines1[i] !== lines2[i]) {
            errors.push(`Line ${i + 1} mismatch: expected "${lines1[i]}", got "${lines2[i]}"`);
            break;
          }
        }
        if (lines1.length !== lines2.length) {
          errors.push(`Line count mismatch: original has ${lines1.length}, re-serialized has ${lines2.length}`);
        }
      }

      return { success: errors.length === 0, errors };
    } catch (err) {
      errors.push(err.message || String(err));
      return { success: false, errors };
    } finally {
      global.document = originalDocument;
      global.Config = originalConfig;
    }
  }
};
