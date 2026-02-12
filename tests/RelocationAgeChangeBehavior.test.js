const { EventsTableManager } = require('../src/frontend/web/components/EventsTableManager.js');

describe('Relocation age-change behavior toggle', () => {
  const constructorNoops = [
    'setupAddEventButton',
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

  beforeEach(() => {
    document.body.innerHTML = '';
    global.requestAnimationFrame = (cb) => { if (typeof cb === 'function') cb(); };
    global.TooltipUtils = { attachTooltip: jest.fn() };
    global.FormatUtils = {
      getLocaleSettings: () => ({ numberLocale: 'en-US', currencySymbol: '$' }),
      parseCurrency: (val) => Number(val)
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function buildTableWithMvAndSplit(linkId) {
    document.body.innerHTML = `
      <table id="Events">
        <thead><tr><th>Type</th><th>Details</th></tr></thead>
        <tbody>
          <tr data-row-id="row-mv" data-event-id="event-mv">
            <td><div class="event-type-container"><input class="event-type" value="MV-ar"></div></td>
            <td><input class="event-name" value="Move" /><input class="event-from-age" value="35" /></td>
          </tr>
          <tr data-row-id="row-p1" data-event-id="event-p1">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-name" value="Salary" /><input class="event-from-age" value="30" /><input class="event-to-age" value="34" /></td>
          </tr>
          <tr data-row-id="row-p2" data-event-id="event-p2">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-name" value="Salary" /><input class="event-from-age" value="35" /><input class="event-to-age" value="40" /></td>
          </tr>
        </tbody>
      </table>
    `;
    const mvRow = document.querySelector('tr[data-row-id="row-mv"]');
    const p1Row = document.querySelector('tr[data-row-id="row-p1"]');
    const p2Row = document.querySelector('tr[data-row-id="row-p2"]');
    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(),
      formatUtils: { setupCurrencyInputs: jest.fn(), setupPercentageInputs: jest.fn() }
    };
    const manager = new EventsTableManager(webUIStub);
    manager.getOrCreateHiddenInput(mvRow, 'event-relocation-link-id', linkId);
    manager.getOrCreateHiddenInput(p1Row, 'event-linked-event-id', 'split_1');
    manager.getOrCreateHiddenInput(p2Row, 'event-linked-event-id', 'split_1');
    manager.getOrCreateHiddenInput(p1Row, 'event-relocation-split-mv-id', linkId);
    manager.getOrCreateHiddenInput(p2Row, 'event-relocation-split-mv-id', linkId);
    manager.getOrCreateHiddenInput(p1Row, 'event-relocation-split-anchor-age', '35');
    manager.getOrCreateHiddenInput(p2Row, 'event-relocation-split-anchor-age', '35');
    return { manager, manager, webUIStub, linkId };
  }

  test('autoShift: split boundary ages shift by delta when MV fromAge changes', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      shouldAutoShiftOnRelocationAgeChange: () => true,
      getStartCountry: () => 'ie',
      getAvailableCountries: () => [],
      getCachedTaxRuleSet: () => ({ getCurrencyCode: () => 'EUR' })
    };
    global.Config = { getInstance: () => configStub };

    const { manager } = buildTableWithMvAndSplit('mvlink_123');
    const noopsWithoutChangeHandler = constructorNoops.filter((m) => m !== 'setupEventTypeChangeHandler');
    noopsWithoutChangeHandler.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });
    manager._scheduleRelocationReanalysis = jest.fn();

    const mvRow = document.querySelector('tr[data-row-id="row-mv"]');
    const fromAgeInput = mvRow.querySelector('.event-from-age');
    fromAgeInput.value = '40';
    fromAgeInput.dataset.mvPrevAge = '35';
    manager._mvAgesByRowId = { 'row-mv': 35 };

    manager.setupEventTypeChangeHandler();
    fromAgeInput.dispatchEvent(new Event('change', { bubbles: true }));

    const p1 = document.querySelector('tr[data-row-id="row-p1"]');
    const p2 = document.querySelector('tr[data-row-id="row-p2"]');
    expect(p1.querySelector('.event-to-age').value).toBe('39');
    expect(p2.querySelector('.event-from-age').value).toBe('40');
    const anchorInput = p1.querySelector('.event-relocation-split-anchor-age');
    expect(anchorInput && anchorInput.value).toBe('40');
  });

  test('markImpacted: split boundary ages do NOT change when MV fromAge changes', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      shouldAutoShiftOnRelocationAgeChange: () => false,
      getStartCountry: () => 'ie',
      getAvailableCountries: () => [],
      getCachedTaxRuleSet: () => ({ getCurrencyCode: () => 'EUR' })
    };
    global.Config = { getInstance: () => configStub };

    const { manager } = buildTableWithMvAndSplit('mvlink_456');
    const noopsWithoutChangeHandler = constructorNoops.filter((m) => m !== 'setupEventTypeChangeHandler');
    noopsWithoutChangeHandler.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });
    manager._scheduleRelocationReanalysis = jest.fn();

    const mvRow = document.querySelector('tr[data-row-id="row-mv"]');
    const fromAgeInput = mvRow.querySelector('.event-from-age');
    fromAgeInput.value = '45';
    fromAgeInput.dataset.mvPrevAge = '35';
    manager._mvAgesByRowId = { 'row-mv': 35 };

    manager.setupEventTypeChangeHandler();
    fromAgeInput.dispatchEvent(new Event('change', { bubbles: true }));

    const p1 = document.querySelector('tr[data-row-id="row-p1"]');
    const p2 = document.querySelector('tr[data-row-id="row-p2"]');
    expect(p1.querySelector('.event-to-age').value).toBe('34');
    expect(p2.querySelector('.event-from-age').value).toBe('35');
  });

  test('autoShift: gap between split halves is preserved when MV age shifts', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      getStartCountry: () => 'ie',
      getAvailableCountries: () => [],
      getCachedTaxRuleSet: () => ({ getCurrencyCode: () => 'EUR' })
    };
    global.Config = { getInstance: () => configStub };

    document.body.innerHTML = `
      <table id="Events">
        <thead><tr><th>Type</th><th>Details</th></tr></thead>
        <tbody>
          <tr data-row-id="row-p1" data-event-id="event-p1">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-from-age" value="30" /><input class="event-to-age" value="34" /></td>
          </tr>
          <tr data-row-id="row-p2" data-event-id="event-p2">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-from-age" value="36" /><input class="event-to-age" value="40" /></td>
          </tr>
        </tbody>
      </table>
    `;
    const webUIStub = { readEvents: jest.fn(() => []), getValue: jest.fn(), formatUtils: { setupCurrencyInputs: jest.fn(), setupPercentageInputs: jest.fn() } };
    const manager = new EventsTableManager(webUIStub);
    const p1Row = document.querySelector('tr[data-row-id="row-p1"]');
    const p2Row = document.querySelector('tr[data-row-id="row-p2"]');
    const linkId = 'mvlink_gap';
    manager.getOrCreateHiddenInput(p1Row, 'event-linked-event-id', 'split_gap');
    manager.getOrCreateHiddenInput(p2Row, 'event-linked-event-id', 'split_gap');
    manager.getOrCreateHiddenInput(p1Row, 'event-relocation-split-mv-id', linkId);
    manager.getOrCreateHiddenInput(p2Row, 'event-relocation-split-mv-id', linkId);

    const delta = 2;
    manager._syncSplitChainsForRelocationAgeShift(delta, [linkId], 37);

    const p1 = document.querySelector('tr[data-row-id="row-p1"]');
    const p2 = document.querySelector('tr[data-row-id="row-p2"]');
    expect(p1.querySelector('.event-to-age').value).toBe('36');
    expect(p2.querySelector('.event-from-age').value).toBe('38');
    expect(Number(p2.querySelector('.event-from-age').value) - Number(p1.querySelector('.event-to-age').value)).toBe(2);
  });
});
