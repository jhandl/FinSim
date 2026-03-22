const { EventsTableManager } = require('../src/frontend/web/components/EventsTableManager.js');
const { RelocationImpactAssistant } = require('../src/frontend/web/components/RelocationImpactAssistant.js');

describe('Mortgage plan sync regressions', () => {
  const constructorNoops = [
    'setupAddEventButton',
    'setupEventTableRowDelete',
    'setupEventTypeChangeHandler',
    'setupSimulationModeChangeHandler',
    'setupViewToggle',
    'setupAgeYearToggle',
    'setupTooltipHandlers',
    'setupColumnSortHandlers',
    'setupAutoSortOnBlur',
    'restoreSavedSort',
    'applySort',
    'initializeCarets',
    'checkEmptyState',
    '_applySavedPreferences'
  ];

  function parseNumeric(input) {
    if (!input) return NaN;
    const n = Number(String(input.value || '').replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? NaN : n;
  }

  function createRow(rowId, type, id, amount, fromAge, toAge, rate) {
    const tr = document.createElement('tr');
    tr.dataset.rowId = rowId;
    tr.dataset.eventId = rowId + '-event';
    tr.innerHTML = `
      <td>
        <div class="event-type-container">
          <input class="event-type event-type-dd" value="${type}">
        </div>
      </td>
      <td><input class="event-name" value="${id}"></td>
      <td><input class="event-amount" value="${amount == null ? '' : amount}"></td>
      <td><input class="event-from-age" value="${fromAge == null ? '' : fromAge}"></td>
      <td><input class="event-to-age" value="${toAge == null ? '' : toAge}"></td>
      <td><input class="event-rate" value="${rate == null ? '' : rate}"></td>
      <td><input class="event-match" value=""></td>
    `;
    return tr;
  }

  function addHidden(row, className, value) {
    const el = document.createElement('input');
    el.type = 'hidden';
    el.className = className;
    el.value = String(value);
    row.appendChild(el);
  }

  function setupTable(rows) {
    document.body.innerHTML = `
      <table id="Events">
        <thead>
          <tr>
            <th>Type</th><th>Name</th><th>Amount</th><th>From</th><th>To</th><th>Rate</th><th>Match</th><th>Delete</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    const tbody = document.querySelector('#Events tbody');
    rows.forEach((r) => tbody.appendChild(r));
    return tbody;
  }

  function createManager() {
    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(() => 'single'),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      },
      clearAllWarnings: jest.fn()
    };
    const manager = new EventsTableManager(webUIStub);
    manager._scheduleMortgagePlanReanalysis = jest.fn();
    manager._refreshValidation = jest.fn();
    manager._afterResolutionAction = jest.fn();
    manager._afterMortgageResolutionAction = jest.fn();

    manager.addEventFromWizardWithSorting = jest.fn(async (eventData) => {
      const tbody = document.querySelector('#Events tbody');
      const row = createRow(
        `row-${eventData.eventType.toLowerCase()}-${Date.now()}`,
        eventData.eventType,
        eventData.name,
        eventData.amount,
        eventData.fromAge,
        eventData.toAge,
        ''
      );
      tbody.appendChild(row);
      return { row, id: row.dataset.eventId };
    });
    return manager;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    global.requestAnimationFrame = (cb) => { if (typeof cb === 'function') cb(); };
    global.TooltipUtils = { attachTooltip: jest.fn() };
    global.FormatUtils = {
      formatCurrency: (value) => '$' + String(Math.round(Number(value) || 0)),
      getLocaleSettings: () => ({ numberLocale: 'en-US', currencyCode: 'USD', currencySymbol: '$' }),
      parseCurrency: (value) => Number(String(value).replace(/[^0-9.\-]/g, ''))
    };
    global.Config = {
      getInstance: () => ({
        isRelocationEnabled: () => true,
        getStartCountry: () => 'ie',
        getAvailableCountries: () => [{ code: 'IE', name: 'Ireland' }, { code: 'US', name: 'United States' }],
        getCachedTaxRuleSet: () => ({
          getCurrencyCode: () => 'USD',
          getCurrencySymbol: () => '$',
          getNumberLocale: () => 'en-US',
          getEconomicData: () => ({ typicalRentalYield: 4 })
        }),
        getCountryNameByCode: (code) => String(code || '').toUpperCase()
      })
    };

    constructorNoops.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  async function flushAsync() {
    await Promise.resolve();
    await Promise.resolve();
  }

  test('ensureMortgagePayoffEvent creates non-zero MP for shortened mortgage end age', async () => {
    const mRow = createRow('row-m', 'M', 'home', '4000', '35', '39', '4');
    addHidden(mRow, 'event-mortgage-term', '25');
    setupTable([mRow]);
    const manager = createManager();

    manager.ensureMortgagePayoffEvent('row-m', mRow.dataset.eventId);
    await flushAsync();

    const rows = manager._collectMortgageRowsById('home');
    expect(rows.mpRow).not.toBeNull();
    const mpAmount = parseNumeric(rows.mpRow.querySelector('.event-amount'));
    expect(mpAmount).toBeGreaterThan(0);
    expect(rows.mpRow.querySelector('.event-from-age').value).toBe('39');
  });

  test('ensureMortgagePayoffEvent skips MP creation when calculated payoff is zero', async () => {
    const mRow = createRow('row-m', 'M', 'home', '4000', '35', '60', '4');
    addHidden(mRow, 'event-mortgage-term', '25');
    setupTable([mRow]);
    const manager = createManager();

    manager.ensureMortgagePayoffEvent('row-m', mRow.dataset.eventId);
    await flushAsync();

    const rows = manager._collectMortgageRowsById('home');
    expect(rows.mpRow).toBeNull();
  });

  test('changing M.toAge updates linked MP age and recalculated amount', () => {
    const mRow = createRow('row-m', 'M', 'home', '4000', '35', '60', '4');
    const mpRow = createRow('row-mp', 'MP', 'home', '1', '60', '60', '');
    addHidden(mRow, 'event-mortgage-term', '25');
    setupTable([mRow, mpRow]);
    const manager = createManager();

    mRow.querySelector('.event-to-age').value = '50';
    manager._syncMortgagePlanById('home', { sourceType: 'M', sourceField: 'toAge' });

    expect(mpRow.querySelector('.event-from-age').value).toBe('50');
    expect(mpRow.querySelector('.event-to-age').value).toBe('50');
    expect(parseNumeric(mpRow.querySelector('.event-amount'))).toBeGreaterThan(1);
  });

  test('setting MO.toAge to current M.toAge keeps M.toAge unchanged', () => {
    const mRow = createRow('row-m', 'M', 'home', '4000', '35', '60', '0');
    const moRow = createRow('row-mo', 'MO', 'home', '1000', '36', '', '');
    addHidden(mRow, 'event-mortgage-term', '25');
    setupTable([mRow, moRow]);
    const manager = createManager();

    manager._syncMortgagePlanById('home', { sourceType: 'MO', sourceField: 'amount' });
    const afterOpenEnded = mRow.querySelector('.event-to-age').value;
    expect(Number(afterOpenEnded)).toBeLessThan(60);

    moRow.querySelector('.event-to-age').value = afterOpenEnded;
    manager._syncMortgagePlanById('home', { sourceType: 'MO', sourceField: 'toAge' });
    expect(mRow.querySelector('.event-to-age').value).toBe(afterOpenEnded);
  });

  test('deleting MP or MO recalculates M.toAge back to exact baseline', () => {
    const mRow = createRow('row-m', 'M', 'home', '4000', '35', '39', '4');
    const mpRow = createRow('row-mp', 'MP', 'home', '1000', '39', '39', '');
    addHidden(mRow, 'event-mortgage-term', '25');
    setupTable([mRow, mpRow]);
    const manager = createManager();

    mpRow.remove();
    manager._syncMortgagePlanById('home', { sourceType: 'MP', sourceField: 'delete', forceAutoAlign: true });
    expect(mRow.querySelector('.event-to-age').value).toBe('60');

    const moRow = createRow('row-mo', 'MO', 'home', '1200', '36', '50', '');
    document.querySelector('#Events tbody').appendChild(moRow);
    manager._syncMortgagePlanById('home', { sourceType: 'MO', sourceField: 'amount' });
    expect(Number(mRow.querySelector('.event-to-age').value)).toBeLessThan(60);

    moRow.remove();
    manager._syncMortgagePlanById('home', { sourceType: 'MO', sourceField: 'delete', forceAutoAlign: true });
    expect(mRow.querySelector('.event-to-age').value).toBe('60');
  });

  test('changing R.toAge propagates to M and creates/recalculates MP', async () => {
    const rRow = createRow('row-r', 'R', 'home', '300000', '35', '60', '0');
    const mRow = createRow('row-m', 'M', 'home', '4000', '35', '60', '4');
    addHidden(mRow, 'event-mortgage-term', '25');
    setupTable([rRow, mRow]);
    const manager = createManager();

    const rToInput = rRow.querySelector('.event-to-age');
    rToInput.value = '45';
    manager._handleMortgagePlanFieldChange(rRow, rToInput);
    await flushAsync();

    let rows = manager._collectMortgageRowsById('home');
    expect(rows.mRow.querySelector('.event-to-age').value).toBe('45');
    expect(rows.mpRow).not.toBeNull();
    const initialMpAmount = parseNumeric(rows.mpRow.querySelector('.event-amount'));
    expect(initialMpAmount).toBeGreaterThan(0);

    rToInput.value = '48';
    manager._handleMortgagePlanFieldChange(rRow, rToInput);
    await flushAsync();

    rows = manager._collectMortgageRowsById('home');
    expect(rows.mRow.querySelector('.event-to-age').value).toBe('48');
    expect(rows.mpRow.querySelector('.event-from-age').value).toBe('48');
    expect(parseNumeric(rows.mpRow.querySelector('.event-amount'))).not.toBe(initialMpAmount);
  });

  test('relocation Pay Off action uses cutoff age and triggers MP creation path', async () => {
    const mRow = createRow('row-m', 'M', 'home', '4000', '35', '60', '4');
    const mvRow = createRow('row-mv', 'MV', 'US', '0', '40', '40', '');
    addHidden(mRow, 'event-mortgage-term', '25');
    setupTable([mRow, mvRow]);
    const manager = createManager();

    const event = {
      id: 'home',
      type: 'M',
      fromAge: 35,
      toAge: 60,
      relocationImpact: { category: 'boundary', mvEventId: 'mv-runtime' }
    };
    const mvEvent = { id: 'move-us', _mvRuntimeId: 'mv-runtime', type: 'MV', name: 'US', fromAge: 40, toAge: 40 };
    const env = {
      webUI: {
        readEvents: jest.fn(() => [event, mvEvent])
      },
      eventsTableManager: manager
    };

    jest.spyOn(manager, '_getRelocationLinkIdByImpactId').mockReturnValue('mvlink_test');
    RelocationImpactAssistant._sellProperty(event, { rowId: 'row-m', eventId: mRow.dataset.eventId }, env);
    await flushAsync();

    const rows = manager._collectMortgageRowsById('home');
    expect(rows.mRow.querySelector('.event-to-age').value).toBe('39');
    expect(rows.mpRow).not.toBeNull();
    expect(parseNumeric(rows.mpRow.querySelector('.event-amount'))).toBeGreaterThan(0);
  });

  test('R.toAge propagation keeps manual MP amount without relocation-impact metadata', async () => {
    const rRow = createRow('row-r', 'R', 'home', '300000', '35', '60', '0');
    const mRow = createRow('row-m', 'M', 'home', '4000', '35', '60', '4');
    const mpRow = createRow('row-mp', 'MP', 'home', '1', '60', '60', '');
    addHidden(mRow, 'event-mortgage-term', '25');
    setupTable([rRow, mRow, mpRow]);
    const manager = createManager();

    const rToInput = rRow.querySelector('.event-to-age');
    rToInput.value = '50';
    manager._handleMortgagePlanFieldChange(rRow, rToInput);
    await flushAsync();

    const expectedInput = mpRow.querySelector('.event-payoff-expected-amount');
    expect(expectedInput).not.toBeNull();
    expect(Number(expectedInput.value)).toBeGreaterThan(0);
    expect(parseNumeric(mpRow.querySelector('.event-amount'))).toBe(1);

    const events = Array.from(document.querySelectorAll('#Events tbody tr')).map((row) => {
      return {
        type: row.querySelector('.event-type').value,
        id: row.querySelector('.event-name').value,
        amount: parseNumeric(row.querySelector('.event-amount')),
        fromAge: Number(row.querySelector('.event-from-age').value),
        toAge: Number(row.querySelector('.event-to-age').value),
        mortgageTerm: row.querySelector('.event-mortgage-term') ? Number(row.querySelector('.event-mortgage-term').value) : undefined
      };
    });
    const mpEvent = events.find((e) => e.type === 'MP' && e.id === 'home');
    mpEvent.relocationImpact = { category: 'mortgage_amount_conflict', message: 'legacy-mortgage-impact' };

    manager.updateRelocationImpactIndicators(events);
    expect(mpEvent.relocationImpact).toBeUndefined();
  });
});
