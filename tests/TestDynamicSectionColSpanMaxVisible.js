const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

module.exports = {
  name: 'TestDynamicSectionColSpanMaxVisible',
  description: 'Ensures dynamic section colSpans compact to section-wide max visible count (not per-row counts).',
  isCustomTest: true,
  runCustomTest: async function () {
    const errors = [];
    const tableManagerPath = path.join(__dirname, '..', 'src', 'frontend', 'web', 'components', 'TableManager.js');
    const tableManagerCode = fs.readFileSync(tableManagerPath, 'utf8');

    const dom = new JSDOM(`
      <table id="Data">
        <thead>
          <tr class="header-groups">
            <th colspan="2"></th>
            <th data-group="grossIncome" colspan="9">Gross Income</th>
            <th data-group="deductions" colspan="5">Deductions</th>
            <th colspan="2"></th>
            <th data-group="assets" colspan="6">Assets</th>
            <th colspan="2"></th>
          </tr>
        </thead>
        <tbody>
          <tr class="tax-header" data-country="ie">
            <th class="dynamic-section-container" data-section="grossIncome" colspan="9">
              <div class="dynamic-section-flex">
                <div class="dynamic-section-cell" data-key="IncomeSalaries"></div>
                <div class="dynamic-section-cell" data-key="IncomePrivatePension"></div>
                <div class="dynamic-section-cell" data-key="IncomeStatePension"></div>
                <div class="dynamic-section-cell" data-key="Income__indexFunds_ie"></div>
                <div class="dynamic-section-cell" data-key="Income__shares_ie"></div>
                <div class="dynamic-section-cell" data-key="IncomeCash"></div>
                <div class="dynamic-section-cell" data-key="IncomeRSUs" style="display:none"></div>
              </div>
            </th>
          </tr>
          <tr data-age="35">
            <td class="dynamic-section-container" data-section="grossIncome" colspan="9">
              <div class="dynamic-section-flex">
                <div class="dynamic-section-cell" data-key="IncomeSalaries"></div>
                <div class="dynamic-section-cell" data-key="IncomePrivatePension"></div>
                <div class="dynamic-section-cell" data-key="IncomeStatePension"></div>
                <div class="dynamic-section-cell" data-key="Income__indexFunds_ie"></div>
                <div class="dynamic-section-cell" data-key="Income__shares_ie"></div>
                <div class="dynamic-section-cell" data-key="IncomeCash"></div>
                <div class="dynamic-section-cell" data-key="IncomeRSUs" style="display:none"></div>
              </div>
            </td>
          </tr>
          <tr class="tax-header" data-country="ar">
            <th class="dynamic-section-container" data-section="grossIncome" colspan="9">
              <div class="dynamic-section-flex">
                <div class="dynamic-section-cell" data-key="IncomeSalaries"></div>
                <div class="dynamic-section-cell" data-key="IncomePrivatePension"></div>
                <div class="dynamic-section-cell" data-key="IncomeStatePension"></div>
                <div class="dynamic-section-cell" data-key="Income__indexFunds_ie"></div>
                <div class="dynamic-section-cell" data-key="Income__shares_ie"></div>
                <div class="dynamic-section-cell" data-key="IncomeCash"></div>
                <div class="dynamic-section-cell" data-key="Income__merval_ar"></div>
              </div>
            </th>
          </tr>
          <tr data-age="45">
            <td class="dynamic-section-container" data-section="grossIncome" colspan="9">
              <div class="dynamic-section-flex">
                <div class="dynamic-section-cell" data-key="IncomeSalaries"></div>
                <div class="dynamic-section-cell" data-key="IncomePrivatePension"></div>
                <div class="dynamic-section-cell" data-key="IncomeStatePension"></div>
                <div class="dynamic-section-cell" data-key="Income__indexFunds_ie"></div>
                <div class="dynamic-section-cell" data-key="Income__shares_ie"></div>
                <div class="dynamic-section-cell" data-key="IncomeCash"></div>
                <div class="dynamic-section-cell" data-key="Income__merval_ar"></div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    `);

    const ctx = vm.createContext({
      console,
      window: dom.window,
      document: dom.window.document
    });

    try {
      vm.runInContext(tableManagerCode + '\nthis.TableManager = TableManager;', ctx, { filename: 'TableManager.js' });
      const manager = Object.create(ctx.TableManager.prototype);
      manager.dynamicSectionsManager = {
        getSections: function () {
          return [{ id: 'grossIncome', groupKey: 'grossIncome' }];
        }
      };
      manager.webUI = { updateGroupBorders: function () { } };

      const tbody = ctx.document.querySelector('#Data tbody');
      manager._syncDynamicSectionColSpansToSectionMaxVisible(tbody);

      const containers = Array.from(ctx.document.querySelectorAll('.dynamic-section-container[data-section="grossIncome"]'));
      assert(containers.length === 4, 'Expected grossIncome containers for both periods and row types');
      for (let i = 0; i < containers.length; i++) {
        assert.strictEqual(containers[i].colSpan, 7, 'All rows should use section-wide max visible colSpan');
      }

      const groupTh = ctx.document.querySelector('#Data thead tr.header-groups th[data-group="grossIncome"]');
      assert(groupTh, 'Gross income group header missing');
      assert.strictEqual(groupTh.colSpan, 7, 'Group header should match section-wide max visible colSpan');
    } catch (err) {
      errors.push(err.message || String(err));
    }

    return { success: errors.length === 0, errors };
  }
};
