const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

module.exports = {
  name: 'TestTooltipCountryQualification',
  description: 'Tooltip lines show country codes only for items outside the row residence country.',
  isCustomTest: true,
  runCustomTest: async function () {
    const errors = [];
    const tableManagerPath = path.join(__dirname, '..', 'src', 'frontend', 'web', 'components', 'TableManager.js');
    const tableManagerCode = fs.readFileSync(tableManagerPath, 'utf8');

    const dom = new JSDOM(`
      <table id="Data">
        <thead>
          <tr class="header-groups"></tr>
          <tr>
            <th data-key="Age"></th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `);

    const capturedTooltips = [];
    const ctx = vm.createContext({
      console,
      window: dom.window,
      document: dom.window.document,
      Config: {
        getInstance: function () {
          return {
            getDefaultCountry: function () { return 'ie'; },
            isRelocationEnabled: function () { return true; },
            getCachedTaxRuleSet: function () {
              return {
                getCurrencyCode: function () { return 'EUR'; },
                getPinnedIncomeTypes: function () { return []; }
              };
            }
          };
        }
      },
      RelocationUtils: {
        extractRelocationTransitions: function () { },
        getCountryForAge: function () { return 'ie'; },
        getRepresentativeCountryForCurrency: function () { return 'ie'; }
      },
      FormatUtils: {
        formatCurrency: function (value) { return String(Math.round(value * 100) / 100); }
      },
      TooltipUtils: {
        attachTooltip: function (_element, text) {
          capturedTooltips.push(text);
        }
      }
    });

    try {
      vm.runInContext(tableManagerCode + '\nthis.TableManager = TableManager;', ctx, { filename: 'TableManager.js' });
      const manager = Object.create(ctx.TableManager.prototype);
      manager.webUI = {};
      manager.currencyMode = 'natural';
      manager.presentValueMode = false;
      manager.reportingCurrency = 'EUR';
      manager.dynamicSectionsManager = {
        initialize: function () { },
        getMaxColumnCount: function () { return 1; },
        getSectionConfig: function () { return { isGroupBoundary: false }; },
        finalizeSectionWidths: function () { }
      };
      manager._cleanupTaxHeaders = function () { };
      manager._createTaxHeaderRow = function () { return ctx.document.createElement('tr'); };
      manager._registerTaxHeader = function () { };
      manager._applyVisibilityEngineToEnabledSections = function () { };
      manager._updateDynamicSectionGroupColSpans = function () { };
      manager._buildRowBlueprint = function () {
        return [{
          type: 'section',
          sectionId: 'income',
          columns: [{ key: 'IncomeSalaries' }]
        }, {
          type: 'section',
          sectionId: 'deductions',
          columns: [{ key: 'Tax__incomeTax' }]
        }];
      };
      manager._computeGroupBoundarySet = function () { return new Set(); };

      manager.setDataRow(1, {
        Age: 35,
        Year: 2031,
        IncomeSalaries: 5000,
        Tax__incomeTax: 1500,
        displayAttributions: {
          'IncomeSalaries': {
            domesticIncome: {
              label: 'Salary',
              amount: 4000,
              kind: 'income',
              sourceCountry: 'ie'
            },
            foreignIncome: {
              label: 'Consulting',
              amount: 1000,
              kind: 'income',
              sourceCountry: 'us'
            }
          },
          'Tax__incomeTax': {
            domestic: {
              label: 'Salary',
              amount: 1000,
              kind: 'tax',
              taxCountry: 'ie'
            },
            foreign: {
              label: 'Rental',
              amount: 500,
              kind: 'tax',
              taxCountry: 'ar'
            }
          }
        }
      });

      assert(capturedTooltips.length >= 2, 'Expected tooltip text to be attached for both cells');
      assert(capturedTooltips.every(function (tooltip) { return tooltip.indexOf('Salary (IE)') === -1; }), 'Domestic tooltip lines should not include residence-country suffix');
      assert(capturedTooltips.some(function (tooltip) { return tooltip.indexOf('Consulting (US)') >= 0; }), 'Foreign income line should include foreign-country suffix');
      assert(capturedTooltips.some(function (tooltip) { return tooltip.indexOf('Rental (AR)') >= 0; }), 'Foreign tax line should include foreign-country suffix');
    } catch (err) {
      errors.push(err.message || String(err));
    }

    return { success: errors.length === 0, errors };
  }
};
