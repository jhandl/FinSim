const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

module.exports = {
  name: 'TestTooltipHidesRoundedZeroAttributions',
  description: 'Tooltip omits attribution lines whose formatted display rounds to zero.',
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
            isRelocationEnabled: function () { return false; },
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
        formatCurrency: function (value) { return String(Math.round(value)); }
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
          sectionId: 'deductions',
          columns: [{ key: 'Tax__capitalGains' }]
        }];
      };
      manager._computeGroupBoundarySet = function () { return new Set(); };

      manager.setDataRow(1, {
        Age: 35,
        Year: 2031,
        Tax__capitalGains: 10,
        displayAttributions: {
          'Tax__capitalGains': {
            tiny: { label: 'Tiny Tax', amount: 0.4, kind: 'tax' },
            visible: { label: 'Visible Tax', amount: 1.6, kind: 'tax' }
          }
        }
      });

      manager.setDataRow(2, {
        Age: 36,
        Year: 2032,
        Tax__capitalGains: 10,
        displayAttributions: {
          'Tax__capitalGains': {
            tinyOnly: { label: 'Tiny Only', amount: 0.4, kind: 'tax' }
          }
        }
      });

      assert(capturedTooltips.length === 1, 'Expected tooltip only for row with at least one non-zero displayed line');
      const tooltip = capturedTooltips[0];
      assert(tooltip.indexOf('Visible Tax') >= 0, 'Expected non-zero displayed attribution line to remain visible');
      assert(tooltip.indexOf('Tiny Tax') === -1, 'Expected rounded-to-zero attribution line to be omitted');
      assert(tooltip.indexOf('Tiny Only') === -1, 'Expected row with only rounded-zero lines to have no tooltip');
    } catch (err) {
      errors.push(err.message || String(err));
    }

    return { success: errors.length === 0, errors };
  }
};
