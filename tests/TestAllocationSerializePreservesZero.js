require('../src/core/Utils.js');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const utilsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'Utils.js'), 'utf8');
vm.runInThisContext(utilsSource);

const serializeSimulation = global.serializeSimulation;

function createParameterDocument() {
  const elements = {};

  function ensureEl(id, className) {
    if (elements[id]) return elements[id];
    elements[id] = {
      id: id,
      value: '',
      className: className || '',
      closest() { return { }; },
      type: 'text'
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

function createUi(doc) {
  return {
    getVersion() { return '2.0'; },
    getTableData() { return []; },
    isPercentage(id) {
      const el = doc.getElementById(id);
      return !!(el && String(el.className || '').indexOf('percentage') >= 0);
    },
    isBoolean(id) {
      const el = doc.getElementById(id);
      return !!(el && String(el.className || '').indexOf('boolean') >= 0);
    },
    getValue(id) {
      const el = doc.getElementById(id);
      if (!el) return '';
      return el.value;
    }
  };
}

module.exports = {
  name: 'AllocationSerializePreservesZero',
  description: 'Ensures allocation 0 values are preserved when serializing with empty generic inputs present.',
  isCustomTest: true,
  async runCustomTest() {
    const originalDocument = global.document;
    const originalConfig = global.Config;
    const originalFormatUtils = global.FormatUtils;
    const errors = [];

    try {
      const doc = createParameterDocument();
      global.document = doc;

      global.FormatUtils = {
        formatPercentage(value) {
          const numValue = parseFloat(value);
          if (isNaN(numValue)) return value;
          const displayValue = numValue <= 1 ? (numValue * 100) : numValue;
          return `${parseFloat(displayValue.toFixed(1)).toString()}%`;
        },
        formatBoolean(value) {
          if (typeof value === 'string') {
            value = value.toLowerCase();
            return (value === 'true' || value === 'yes') ? 'Yes' : 'No';
          }
          return value ? 'Yes' : 'No';
        }
      };

      global.Config = {
        getInstance: () => ({
          getStartCountry: () => 'ie',
          getDefaultCountry: () => 'ie',
          getCachedTaxRuleSet: () => ({
            getResolvedInvestmentTypes: () => ([{ key: 'indexFunds_ie' }, { key: 'shares_ie' }])
          }),
          isRelocationEnabled: () => true,
          getInvestmentBaseTypes: () => ([])
        })
      };

      doc.ensureEl('InvestmentAllocation_ie_indexFunds', 'percentage').value = '0';
      doc.ensureEl('InvestmentAllocation_ie_shares', 'percentage').value = '';
      doc.ensureEl('InvestmentAllocation_indexFunds_ie', 'percentage').value = '';
      doc.ensureEl('InvestmentAllocation_shares_ie', 'percentage').value = '';
      doc.ensureEl('StartingAge', 'number').value = '';
      doc.ensureEl('TargetAge', 'number').value = '';
      doc.ensureEl('InitialSavings', 'currency').value = '';
      doc.ensureEl('InitialPension', 'currency').value = '';
      doc.ensureEl('RetirementAge', 'number').value = '';
      doc.ensureEl('EmergencyStash', 'currency').value = '';
      doc.ensureEl('PensionContributionPercentage', 'percentage').value = '';
      doc.ensureEl('PensionContributionCapped', 'string').value = '';
      doc.ensureEl('PensionGrowthRate', 'percentage').value = '';
      doc.ensureEl('PensionGrowthStdDev', 'percentage').value = '';
      doc.ensureEl('Inflation', 'percentage').value = '';
      doc.ensureEl('MarriageYear', 'number').value = '';
      doc.ensureEl('YoungestChildBorn', 'number').value = '';
      doc.ensureEl('OldestChildBorn', 'number').value = '';
      doc.ensureEl('PersonalTaxCredit', 'currency').value = '';
      doc.ensureEl('StatePensionWeekly', 'currency').value = '';
      doc.ensureEl('PriorityCash', 'number').value = '1';
      doc.ensureEl('PriorityPension', 'number').value = '2';
      doc.ensureEl('PriorityFunds', 'number').value = '3';
      doc.ensureEl('PriorityShares', 'number').value = '4';
      doc.ensureEl('P2StartingAge', 'number').value = '';
      doc.ensureEl('P2RetirementAge', 'number').value = '';
      doc.ensureEl('P2StatePensionWeekly', 'currency').value = '';
      doc.ensureEl('InitialPensionP2', 'currency').value = '';
      doc.ensureEl('PensionContributionPercentageP2', 'percentage').value = '';
      doc.ensureEl('InitialCapital_indexFunds_ie', 'currency').value = '';
      doc.ensureEl('InitialCapital_shares_ie', 'currency').value = '';
      doc.ensureEl('indexFunds_ieGrowthRate', 'percentage').value = '';
      doc.ensureEl('indexFunds_ieGrowthStdDev', 'percentage').value = '';
      doc.ensureEl('shares_ieGrowthRate', 'percentage').value = '';
      doc.ensureEl('shares_ieGrowthStdDev', 'percentage').value = '';
      doc.ensureEl('investmentStrategiesEnabled', 'string').value = 'off';
      doc.ensureEl('perCountryInvestmentsEnabled', 'string').value = 'off';
      doc.ensureEl('StartCountry', 'string').value = 'ie';
      doc.ensureEl('simulation_mode', 'string').value = 'single';
      doc.ensureEl('economy_mode', 'string').value = 'deterministic';

      const ui = createUi(doc);
      const csv = serializeSimulation(ui);

      if (csv.indexOf('InvestmentAllocation_indexFunds_ie,0') === -1) {
        errors.push('Expected InvestmentAllocation_indexFunds_ie to serialize as 0.');
      }
      if (csv.indexOf('InvestmentAllocation_shares_ie,') === -1) {
        errors.push('Expected InvestmentAllocation_shares_ie to serialize as empty.');
      }
    } catch (err) {
      errors.push('Unexpected error: ' + (err && err.message ? err.message : String(err)));
    } finally {
      global.document = originalDocument;
      global.Config = originalConfig;
      global.FormatUtils = originalFormatUtils;
    }

    return { success: errors.length === 0, errors };
  }
};
