const { EventsTableManager } = require('../src/frontend/web/components/EventsTableManager.js');

describe('Relocation panel blur auto-sort guard', () => {
  const constructorNoops = [
    'setupAddEventButton',
    'setupEventTableRowDelete',
    'setupEventTypeChangeHandler',
    'setupSimulationModeChangeHandler',
    'setupViewToggle',
    'setupAgeYearToggle',
    'setupTooltipHandlers',
    'setupColumnSortHandlers',
    'restoreSavedSort',
    'applySort',
    'initializeCarets',
    'checkEmptyState',
    '_applySavedPreferences'
  ];

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row_1">
            <td>
              <div class="event-type-container">
                <input class="event-rate" value="5" />
              </div>
            </td>
          </tr>
          <tr class="resolution-panel-row">
            <td>
              <button type="button" class="resolution-apply">Apply</button>
            </td>
          </tr>
        </tbody>
      </table>
    `;
    global.RelocationImpactAssistant = { collapseAllPanels: jest.fn() };
    global.RowSorter = { sortRows: jest.fn() };
    constructorNoops.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  test('does not auto-sort when blur originates from resolution panel click with missing relatedTarget', () => {
    const webUIStub = { getValue: jest.fn(() => 'single') };
    const manager = new EventsTableManager(webUIStub);
    manager.sortKeys = [{ col: 'from-age', dir: 'asc' }];
    jest.runOnlyPendingTimers();
    const applySpy = jest.spyOn(manager, 'applySort');
    applySpy.mockClear();

    const button = document.querySelector('.resolution-apply');
    const input = document.querySelector('.event-rate');

    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true, relatedTarget: null }));
    expect(applySpy).not.toHaveBeenCalled();

    manager._suppressAutoSortUntil = 0;
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true, relatedTarget: null }));
    expect(applySpy).toHaveBeenCalledTimes(1);
  });

  test('peg resolution stores currency linkage and marks row reviewed', () => {
    const webUIStub = { getValue: jest.fn(() => 'single') };
    const manager = new EventsTableManager(webUIStub);
    jest.runOnlyPendingTimers();
    const afterSpy = jest.spyOn(manager, '_afterResolutionAction').mockImplementation(() => {});

    manager.pegCurrencyToOriginal('row_1', 'EUR', 'ie', 'event-1');

    const row = document.querySelector('tr[data-row-id="row_1"]');
    expect(row.querySelector('.event-currency').value).toBe('EUR');
    expect(row.querySelector('.event-linked-country').value).toBe('ie');
    expect(row.querySelector('.event-resolution-override').value).toBe('1');
    expect(afterSpy).toHaveBeenCalledWith('row_1');
  });
});
