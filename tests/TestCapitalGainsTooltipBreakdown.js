const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

module.exports = {
  name: 'TestCapitalGainsTooltipBreakdown',
  description: 'Ensures the capital gains tooltip shows realized gains, pre-relief tax, and CGT relief in order.',
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

    let capturedTooltip = null;
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
        formatCurrency: function (value) { return String(Math.round(value * 100) / 100); }
      },
      TooltipUtils: {
        attachTooltip: function (_element, text) {
          capturedTooltip = text;
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
        Tax__capitalGains: 3799.6630444216244,
        attributions: {
          capitalgains: {
            'Index Funds Sale': 9050.143699927663,
            'Shares Sale': 2565.030918146188
          },
          'tax:capitalGainsPreRelief': {
            'Index Funds Sale': 3439.054605972512,
            'Shares Sale': 846.4602029882421
          },
          'tax:capitalGains': {
            'Index Funds Sale': 3439.054605972512,
            'Shares Sale': 360.60843844911216,
            'CGT Relief': -485.85176453913004
          }
        }
      });

      assert(capturedTooltip, 'Expected tooltip text to be attached');
      assert(capturedTooltip.indexOf('Index Funds Gains') >= 0, 'Tooltip should include the realized index-funds gain line');
      assert(capturedTooltip.indexOf('Index Funds Tax') >= 0, 'Tooltip should include the index-funds tax line');
      assert(capturedTooltip.indexOf('Shares Gains') >= 0, 'Tooltip should include the realized shares gain line');
      assert(capturedTooltip.indexOf('Shares Tax') >= 0, 'Tooltip should include the shares tax line before relief');
      assert(capturedTooltip.indexOf('Shares Sale') === -1, 'Tooltip should not fall back to raw shares-sale attribution');
      assert(capturedTooltip.indexOf('CGT Relief') >= 0, 'Tooltip should include the relief line');
    } catch (err) {
      errors.push(err.message || String(err));
    }

    return { success: errors.length === 0, errors };
  }
};
