const fs = require('fs');
const path = require('path');
const vm = require('vm');

const adapterSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'LegacyScenarioAdapter.js'), 'utf8');
vm.runInThisContext(adapterSource);
const utilsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'Utils.js'), 'utf8');

function createParameterDocument() {
  const elements = {};

  function ensureEl(id, className) {
    if (elements[id]) return elements[id];
    elements[id] = {
      id: id,
      value: '',
      className: className || '',
      closest: () => null
    };
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

function createUiSimulatingDomUtils(doc, options) {
  const values = (options && options.values) ? options.values : {};
  const events = (options && options.events) ? options.events : [];

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
      const el = doc.ensureEl(id);
      if (String(el.className || '').indexOf('percentage') >= 0) {
        el.value = normalizePercentageForStorage(value);
      } else {
        el.value = (value === undefined || value === null) ? '' : String(value);
      }
    },
    getValue(id) {
      if (Object.prototype.hasOwnProperty.call(values, id)) return values[id];
      const el = doc.ensureEl(id);
      const v = (el.value === undefined || el.value === null) ? '' : String(el.value);
      const isPercentage = String(el.className || '').indexOf('percentage') >= 0;
      const isCurrency = String(el.className || '').indexOf('currency') >= 0;
      if (v === '' && (isPercentage || isCurrency)) return 0;
      return v;
    },
    getTableData() {
      return events;
    },
    isPercentage(id) {
      const el = doc.getElementById(id);
      return !!(el && String(el.className || '').indexOf('percentage') >= 0);
    },
    isBoolean(id) {
      const el = doc.getElementById(id);
      return !!(el && String(el.className || '').indexOf('boolean') >= 0);
    },
    getVersion() {
      return '2.0';
    }
  };
}

function seedParameterIds(ui) {
  ui.ensureParameterInput('StartCountry', 'string');
  ui.ensureParameterInput('simulation_mode', 'string');
  ui.ensureParameterInput('economy_mode', 'string');
  ui.ensureParameterInput('PensionGrowthRate', 'percentage');
  ui.ensureParameterInput('PensionGrowthStdDev', 'percentage');
  ui.ensureParameterInput('Inflation', 'percentage');
}

module.exports = {
  name: 'PensionVolatilityPerCountry',
  description: 'Ensures legacy pension volatility defaults apply only to StartCountry and do not overwrite other countries.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    try {
      const stubConfig = {
        getInstance: () => ({
          getStartCountry: () => 'ie',
          getDefaultCountry: () => 'ie',
          getCachedTaxRuleSet: () => ({ getResolvedInvestmentTypes: () => [] }),
          getInvestmentBaseTypes: () => [],
          isRelocationEnabled: () => false
        })
      };

      const makeContext = (doc) => {
        const context = {
          console,
          document: doc,
          Config: stubConfig,
          LegacyScenarioAdapter: LegacyScenarioAdapter,
          FormatUtils: {
            formatPercentage(value) {
              const numValue = parseFloat(value);
              if (isNaN(numValue)) return value;
              const displayValue = numValue <= 1 ? (numValue * 100) : numValue;
              return `${parseFloat(displayValue.toFixed(1)).toString()}%`;
            },
            formatBoolean(value) {
              if (value === true || value === 'true') return 'Yes';
              if (value === false || value === 'false') return 'No';
              return value;
            }
          }
        };
        vm.createContext(context);
        vm.runInContext(utilsSource, context);
        return context;
      };

      // Deserialize: legacy values should populate IE only.
      const doc = createParameterDocument();
      const ctx = makeContext(doc);
      const ui = createUiSimulatingDomUtils(doc);
      seedParameterIds(ui);

      const legacyCsv = [
        '# FinSim v2.0 Save File',
        '# Parameters',
        'StartingAge,30',
        'TargetAge,90',
        'PensionGrowthRate,5%',
        'PensionGrowthStdDev,10%',
        'Inflation,3%',
        'simulation_mode,single',
        'economy_mode,deterministic',
        'StartCountry,ie',
        '',
        '# Events',
        'Type,Name,Amount,FromAge,ToAge,Rate,Extra',
        'MV-AR,Move,0,40,,,'
      ].join('\n');
      ctx.deserializeSimulation(legacyCsv, ui);

      const ieVol = doc.getElementById('PensionVolatility_ie');
      const arVol = doc.getElementById('PensionVolatility_ar');
      const legacyVol = doc.getElementById('PensionGrowthStdDev');
      if (!ieVol || ieVol.value !== '10') {
        errors.push('Expected PensionVolatility_ie to be 10 after legacy migration, got ' + (ieVol ? ieVol.value : 'null') + ' (legacy PensionGrowthStdDev=' + (legacyVol ? legacyVol.value : 'null') + ').');
      }
      if (!arVol || arVol.value !== '') {
        errors.push('Expected PensionVolatility_ar to remain blank after legacy migration, got ' + (arVol ? arVol.value : 'null') + '.');
      }

      // Serialize: blank AR should not default to legacy volatility.
      const doc2 = createParameterDocument();
      const ctx2 = makeContext(doc2);
      const ui2 = createUiSimulatingDomUtils(doc2, {
        events: [['MV-AR', '', '', '', '', '']]
      });
      seedParameterIds(ui2);

      ui2.ensureParameterInput('PensionGrowthStdDev', 'percentage');
      ui2.setValue('PensionGrowthStdDev', '10%');
      ui2.ensureParameterInput('PensionVolatility_ie', 'percentage');
      ui2.setValue('PensionVolatility_ie', '12%');
      ui2.ensureParameterInput('PensionVolatility_ar', 'percentage');
      ui2.setValue('PensionVolatility_ar', '');

      const serialized = ctx2.serializeSimulation(ui2);
      const lines = serialized.split('\n');
      const lineIe = lines.find(l => l.indexOf('PensionVolatility_ie,') === 0);
      const lineAr = lines.find(l => l.indexOf('PensionVolatility_ar,') === 0);

      if (!lineIe || lineIe.split(',')[1] !== '12%') {
        errors.push('Expected PensionVolatility_ie to serialize as 12%.');
      }
      if (!lineAr) {
        errors.push('Missing PensionVolatility_ar in serialized output.');
      } else {
        const arVal = lineAr.split(',')[1];
        if (arVal !== '') {
          errors.push('Expected PensionVolatility_ar to serialize as blank.');
        }
        if (arVal === '10' || arVal === '10%') {
          errors.push('PensionVolatility_ar incorrectly defaulted to legacy value.');
        }
      }

    } catch (err) {
      errors.push('Unexpected error: ' + (err && err.message ? err.message : String(err)));
    }

    return { success: errors.length === 0, errors };
  }
};
