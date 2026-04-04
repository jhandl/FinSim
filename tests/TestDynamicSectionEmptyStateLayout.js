const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

module.exports = {
  name: 'TestDynamicSectionEmptyStateLayout',
  description: 'Ensures empty-state dynamic headers compact to visible columns and reserve label widths.',
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
          </tr>
        </thead>
        <tbody>
          <tr class="tax-header" data-country="ie">
            <th class="dynamic-section-container" data-section="grossIncome" colspan="9">
              <div class="dynamic-section-flex">
                <div class="dynamic-section-cell" data-key="IncomeSalaries"><span class="cell-content">Salaries</span></div>
                <div class="dynamic-section-cell" data-key="IncomeRentals" style="display:none"><span class="cell-content">Rentals</span></div>
                <div class="dynamic-section-cell" data-key="IncomeStatePension"><span class="cell-content">S.Pension</span></div>
                <div class="dynamic-section-cell" data-key="Income__shares_ie" style="display:none"><span class="cell-content">Shares</span></div>
                <div class="dynamic-section-cell" data-key="IncomeCash"><span class="cell-content">Cash</span></div>
              </div>
            </th>
          </tr>
          <tr class="tax-header" data-country="ie">
            <th class="dynamic-section-container" data-section="deductions" colspan="5">
              <div class="dynamic-section-flex">
                <div class="dynamic-section-cell" data-key="PensionContribution"><span class="cell-content">P.Contrib</span></div>
                <div class="dynamic-section-cell" data-key="Tax__incomeTax"><span class="cell-content">IT</span></div>
                <div class="dynamic-section-cell" data-key="Tax__prsi"><span class="cell-content">PRSI</span></div>
                <div class="dynamic-section-cell" data-key="Tax__usc"><span class="cell-content">USC</span></div>
              </div>
            </th>
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
          return [
            { id: 'grossIncome', groupKey: 'grossIncome' },
            { id: 'deductions', groupKey: 'deductions' }
          ];
        },
        getSectionConfig: function (sectionId) {
          if (sectionId === 'deductions') {
            return { emptyState: { minWidthByKey: { PensionContribution: 'label' } } };
          }
          return { emptyState: { minWidthByKey: { IncomeSalaries: 'label', IncomeStatePension: 'label', IncomeCash: 'label' } } };
        }
      };
      manager.webUI = { updateGroupBorders: function () { } };

      const widthsByKey = {
        IncomeSalaries: 74,
        IncomeStatePension: 86,
        IncomeCash: 46,
        PensionContribution: 84,
        Tax__incomeTax: 22,
        Tax__prsi: 34,
        Tax__usc: 30
      };
      const widthsByText = {
        Salaries: 74,
        'S.Pension': 86,
        Cash: 46,
        'P.Contrib': 84,
        IT: 22,
        PRSI: 34,
        USC: 30
      };
      const originalCreateElement = ctx.document.createElement.bind(ctx.document);
      ctx.document.createElement = function (tagName) {
        const el = originalCreateElement(tagName);
        if (String(tagName).toLowerCase() === 'span') {
          el.getBoundingClientRect = function () {
            return { width: widthsByText[this.textContent] || 0 };
          };
          Object.defineProperty(el, 'scrollWidth', {
            configurable: true,
            get: function () {
              return widthsByText[this.textContent] || 0;
            }
          });
        }
        return el;
      };
      const cells = Array.from(ctx.document.querySelectorAll('.dynamic-section-cell'));
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const key = cell.getAttribute('data-key');
        Object.defineProperty(cell, 'scrollWidth', {
          configurable: true,
          get: function () {
            return 12;
          }
        });
        const label = cell.querySelector('.cell-content');
        if (label) {
          Object.defineProperty(label, 'scrollWidth', {
            configurable: true,
            get: function () {
              return 12;
            }
          });
        }
      }

      const tbody = ctx.document.querySelector('#Data tbody');
      manager._syncDynamicSectionColSpansToSectionMaxVisible(tbody);

      const grossHeader = ctx.document.querySelector('.dynamic-section-container[data-section="grossIncome"]');
      const deductionsHeader = ctx.document.querySelector('.dynamic-section-container[data-section="deductions"]');
      assert.strictEqual(grossHeader.colSpan, 3, 'Gross income should compact to its three visible empty-state columns');
      assert.strictEqual(deductionsHeader.colSpan, 4, 'Deductions should compact to its four visible empty-state columns');
      assert.strictEqual(ctx.document.querySelector('th[data-group="grossIncome"]').colSpan, 3, 'Gross income group header should compact to visible columns');
      assert.strictEqual(ctx.document.querySelector('th[data-group="deductions"]').colSpan, 4, 'Deductions group header should compact to visible columns');

      const headerRows = Array.from(ctx.document.querySelectorAll('tr.tax-header'));
      for (let i = 0; i < headerRows.length; i++) {
        manager._applyEmptyStateFlexLayoutToDynamicSectionHeaderRow(headerRows[i]);
      }

      const visibleGrossCells = Array.from(grossHeader.querySelectorAll('.dynamic-section-cell')).filter((cell) => cell.style.display !== 'none');
      const visibleDeductionCells = Array.from(deductionsHeader.querySelectorAll('.dynamic-section-cell')).filter((cell) => cell.style.display !== 'none');

      visibleGrossCells.forEach((cell) => {
        const key = cell.getAttribute('data-key');
        const expected = `${widthsByKey[key]}px`;
        assert.strictEqual(cell.style.minWidth, expected, `Expected ${key} to reserve its full label width`);
        assert.strictEqual(cell.style.flexGrow, '1', `Expected ${key} to absorb extra empty-state width`);
      });

      visibleDeductionCells.forEach((cell) => {
        const key = cell.getAttribute('data-key');
        const expected = `${widthsByKey[key]}px`;
        assert.strictEqual(cell.style.minWidth, expected, `Expected ${key} to reserve its full label width`);
        assert.strictEqual(cell.style.flexGrow, '1', `Expected ${key} to absorb extra empty-state width`);
      });

      assert.strictEqual(grossHeader.style.minWidth, `${74 + 86 + 46 + 2}px`, 'Gross income section min width should match its visible header widths');
      assert.strictEqual(deductionsHeader.style.minWidth, `${84 + 22 + 34 + 30 + 3}px`, 'Deductions section min width should match its visible header widths');
    } catch (err) {
      errors.push(err.message || String(err));
    }

    return { success: errors.length === 0, errors };
  }
};
