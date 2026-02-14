const { RelocationImpactAssistant } = require('../src/frontend/web/components/RelocationImpactAssistant.js');
const { EventsTableManager } = require('../src/frontend/web/components/EventsTableManager.js');

global.RelocationImpactAssistant = RelocationImpactAssistant;

describe('Relocation cut-short resolution', () => {
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

  function buildTableDom(eventType) {
    document.body.innerHTML = `
      <table id="Events">
        <thead>
          <tr><th>Type</th><th>Details</th></tr>
        </thead>
        <tbody>
          <tr data-row-id="row-1" data-event-id="event-1">
            <td>
              <div class="event-type-container">
                <input class="event-type" value="${eventType}" />
              </div>
            </td>
            <td>
              <input class="event-name" value="Salary" />
              <input class="event-from-age" value="30" />
              <input class="event-to-age" value="60" />
              <input class="event-amount" value="100000" />
            </td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function buildRealEstateTableDom() {
    document.body.innerHTML = `
      <table id="Events">
        <thead>
          <tr><th>Type</th><th>Details</th></tr>
        </thead>
        <tbody>
          <tr data-row-id="row-r" data-event-id="event-r">
            <td>
              <div class="event-type-container">
                <input class="event-type" value="R" />
              </div>
            </td>
            <td>
              <input class="event-name" value="House" />
              <input class="event-from-age" value="30" />
              <input class="event-to-age" value="60" />
              <input class="event-amount" value="300000" />
            </td>
          </tr>
          <tr data-row-id="row-m" data-event-id="event-m">
            <td>
              <div class="event-type-container">
                <input class="event-type" value="M" />
              </div>
            </td>
            <td>
              <input class="event-name" value="House" />
              <input class="event-from-age" value="30" />
              <input class="event-to-age" value="60" />
              <input class="event-amount" value="1200" />
            </td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function setupConfigStub() {
    const economicData = {
      ready: false,
      getFX: jest.fn(() => null),
      getPPP: jest.fn(() => null)
    };
    const configStub = {
      isRelocationEnabled: () => true,
      getStartCountry: () => 'ar',
      getDefaultCountry: () => 'ar',
      getCountryNameByCode: (code) => (code === 'us' ? 'United States' : 'Argentina'),
      getCachedTaxRuleSet: (code) => ({
        getCurrencySymbol: () => (code === 'us' ? '$' : '$'),
        getNumberLocale: () => 'en-US',
        getCurrencyCode: () => (code || 'usd').toUpperCase()
      }),
      getEconomicData: () => economicData
    };
    global.Config = { getInstance: () => configStub };
  }

  test.each(['SI', 'E'])('renders cut-short action and dispatches it for boundary %s events', (eventType) => {
    setupConfigStub();
    buildTableDom(eventType);

    const eventRow = document.querySelector('tr[data-row-id="row-1"]');
    const event = {
      id: 'Salary',
      type: eventType,
      fromAge: 30,
      toAge: 60,
      amount: 100000,
      relocationImpact: {
        category: 'boundary',
        mvEventId: 'Move_US'
      }
    };
    const relocationEvent = {
      id: 'Move_US',
      type: 'MV',
      name: 'US',
      fromAge: 40,
      toAge: 40
    };
    const env = {
      webUI: {
        readEvents: jest.fn(() => [event, relocationEvent]),
        updateStatusForRelocationImpacts: jest.fn(),
        eventAccordionManager: { refresh: jest.fn() }
      },
      eventsTableManager: {
        getOriginCountry: jest.fn(() => 'ar'),
        cutShortEventAtRelocation: jest.fn(),
        updateRelocationImpactIndicators: jest.fn()
      }
    };

    RelocationImpactAssistant.renderPanelForTableRow(eventRow, event, env);

    const panel = document.querySelector('.resolution-panel-row');
    expect(panel).toBeTruthy();
    expect(panel.querySelector('.resolution-tab[data-action="cut_short"]')).toBeTruthy();

    const applyButton = panel.querySelector('.resolution-instant-btn[data-action="cut_short"]');
    expect(applyButton).toBeTruthy();
    applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(env.eventsTableManager.cutShortEventAtRelocation).toHaveBeenCalledWith('row-1', 'event-1');
  });

  test('cutShortEventAtRelocation sets toAge to relocationAge - 1', () => {
    setupConfigStub();
    buildTableDom('SI');

    constructorNoops.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });

    const boundaryEvent = {
      id: 'Salary',
      type: 'SI',
      fromAge: 30,
      toAge: 60,
      amount: 100000,
      relocationImpact: {
        category: 'boundary',
        mvEventId: 'Move_US'
      }
    };
    const relocationEvent = {
      id: 'Move_US',
      type: 'MV',
      name: 'US',
      fromAge: 40,
      toAge: 40
    };
    const webUIStub = {
      readEvents: jest.fn(() => [boundaryEvent, relocationEvent]),
      getValue: jest.fn(() => 'single')
    };
    const manager = new EventsTableManager(webUIStub);
    const afterSpy = jest.spyOn(manager, '_afterResolutionAction').mockImplementation(() => {});

    manager.cutShortEventAtRelocation('row-1', 'event-1');

    const row = document.querySelector('tr[data-row-id="row-1"]');
    expect(row.querySelector('.event-to-age').value).toBe('39');
    expect(afterSpy).toHaveBeenCalledWith('row-1');
  });

  test('sell_property keeps both real-estate rows linked so relocation age shifts update both', () => {
    setupConfigStub();
    buildRealEstateTableDom();

    const noopsWithoutChangeHandler = constructorNoops.filter((method) => method !== 'setupEventTypeChangeHandler');
    noopsWithoutChangeHandler.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });

    const impactedPropertyEvent = {
      id: 'House',
      type: 'R',
      fromAge: 30,
      toAge: 60,
      amount: 300000,
      relocationImpact: {
        category: 'boundary',
        mvEventId: 'Move_US'
      }
    };
    const mortgageEvent = {
      id: 'House',
      type: 'M',
      fromAge: 30,
      toAge: 60,
      amount: 1200
    };
    const relocationEvent = {
      id: 'Move_US',
      type: 'MV',
      name: 'US',
      fromAge: 40,
      toAge: 40
    };

    const webUIStub = {
      readEvents: jest.fn(() => [impactedPropertyEvent, mortgageEvent, relocationEvent]),
      updateStatusForRelocationImpacts: jest.fn(),
      eventAccordionManager: { refresh: jest.fn() },
      getValue: jest.fn(() => 'single')
    };

    const manager = new EventsTableManager(webUIStub);
    manager._scheduleRelocationReanalysis = jest.fn();
    manager.recomputeRelocationImpacts = jest.fn();

    RelocationImpactAssistant._sellProperty(impactedPropertyEvent, { rowId: 'row-r', eventId: 'event-r' }, { webUI: webUIStub, eventsTableManager: manager });

    const propertyRow = document.querySelector('tr[data-row-id="row-r"]');
    const mortgageRow = document.querySelector('tr[data-row-id="row-m"]');

    expect(propertyRow.querySelector('.event-to-age').value).toBe('39');
    expect(mortgageRow.querySelector('.event-to-age').value).toBe('39');

    manager._syncSoldRealEstateForRelocationAgeShift(10, ['Move_US'], 50);

    expect(propertyRow.querySelector('.event-to-age').value).toBe('49');
    expect(mortgageRow.querySelector('.event-to-age').value).toBe('49');
  });

  test('split relocation age-shift panel exposes adapt/leave actions', () => {
    setupConfigStub();
    buildTableDom('SI');

    const eventRow = document.querySelector('tr[data-row-id="row-1"]');
    const event = {
      id: 'Salary',
      type: 'SI',
      fromAge: 30,
      toAge: 60,
      amount: 100000,
      relocationImpact: {
        category: 'split_relocation_shift',
        mvEventId: 'Move_US',
        details: { relocationAge: 45, part1ToAge: 34, part2FromAge: 35 }
      }
    };
    const relocationEvent = {
      id: 'Move_US',
      type: 'MV',
      name: 'US',
      fromAge: 45,
      toAge: 45
    };
    const env = {
      webUI: {
        readEvents: jest.fn(() => [event, relocationEvent]),
        updateStatusForRelocationImpacts: jest.fn(),
        eventAccordionManager: { refresh: jest.fn() }
      },
      eventsTableManager: {
        getOriginCountry: jest.fn(() => 'ar'),
        adaptSplitToRelocationAge: jest.fn(),
        keepSplitAsIs: jest.fn(),
        updateRelocationImpactIndicators: jest.fn()
      }
    };

    RelocationImpactAssistant.renderPanelForTableRow(eventRow, event, env);

    const panel = document.querySelector('.resolution-panel-row');
    expect(panel).toBeTruthy();
    expect(panel.querySelector('.resolution-tab[data-action="adapt_split_to_move"]')).toBeTruthy();
    expect(panel.querySelector('.resolution-tab[data-action="keep_split_as_is"]')).toBeTruthy();

    const adaptButton = panel.querySelector('.resolution-instant-btn[data-action="adapt_split_to_move"]');
    expect(adaptButton).toBeTruthy();
    adaptButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(env.eventsTableManager.adaptSplitToRelocationAge).toHaveBeenCalledWith('row-1', 'event-1');
  });

  test('split value-shift panel exposes leave/update actions', () => {
    setupConfigStub();
    buildTableDom('SInp');

    const eventRow = document.querySelector('tr[data-row-id="row-1"]');
    const event = {
      id: 'Salary',
      type: 'SInp',
      fromAge: 35,
      toAge: 60,
      amount: 200000,
      relocationImpact: {
        category: 'split_amount_shift',
        mvEventId: 'Move_US',
        details: { suggestedAmount: 240000, destinationCountry: 'us' }
      }
    };
    const relocationEvent = {
      id: 'Move_US',
      type: 'MV',
      name: 'US',
      fromAge: 45,
      toAge: 45
    };
    const env = {
      webUI: {
        readEvents: jest.fn(() => [event, relocationEvent]),
        updateStatusForRelocationImpacts: jest.fn(),
        eventAccordionManager: { refresh: jest.fn() }
      },
      eventsTableManager: {
        getOriginCountry: jest.fn(() => 'ar'),
        keepSplitValueAsIs: jest.fn(),
        updateSplitValue: jest.fn(),
        updateRelocationImpactIndicators: jest.fn()
      }
    };

    RelocationImpactAssistant.renderPanelForTableRow(eventRow, event, env);

    const panel = document.querySelector('.resolution-panel-row');
    expect(panel).toBeTruthy();
    expect(panel.querySelector('.resolution-tab[data-action="keep_split_value_as_is"]')).toBeTruthy();
    expect(panel.querySelector('.resolution-tab[data-action="update_split_value"]')).toBeTruthy();

    const updateTab = panel.querySelector('.resolution-tab[data-action="update_split_value"]');
    expect(updateTab).toBeTruthy();
    updateTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const amountInput = panel.querySelector('.split-value-amount-input');
    expect(amountInput).toBeTruthy();
    amountInput.value = '241500';

    const confirmButton = panel.querySelector('.resolution-apply[data-action="update_split_value"]');
    expect(confirmButton).toBeTruthy();
    confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(env.eventsTableManager.updateSplitValue).toHaveBeenCalledWith('row-1', '241500', 'event-1');
  });

  test('sale relocation age-shift panel exposes adapt/leave actions', () => {
    setupConfigStub();
    buildRealEstateTableDom();

    const eventRow = document.querySelector('tr[data-row-id="row-r"]');
    const event = {
      id: 'House',
      type: 'R',
      fromAge: 30,
      toAge: 39,
      amount: 300000,
      relocationImpact: {
        category: 'sale_relocation_shift',
        mvEventId: 'Move_US',
        details: { relocationAge: 45, currentToAge: 39, expectedToAge: 44 }
      }
    };
    const relocationEvent = {
      id: 'Move_US',
      type: 'MV',
      name: 'US',
      fromAge: 45,
      toAge: 45
    };
    const env = {
      webUI: {
        readEvents: jest.fn(() => [event, relocationEvent]),
        updateStatusForRelocationImpacts: jest.fn(),
        eventAccordionManager: { refresh: jest.fn() }
      },
      eventsTableManager: {
        getOriginCountry: jest.fn(() => 'ar'),
        adaptSaleToRelocationAge: jest.fn(),
        keepSaleAsIs: jest.fn(),
        updateRelocationImpactIndicators: jest.fn()
      }
    };

    RelocationImpactAssistant.renderPanelForTableRow(eventRow, event, env);

    const panel = document.querySelector('.resolution-panel-row');
    expect(panel).toBeTruthy();
    expect(panel.querySelector('.resolution-tab[data-action="adapt_sale_to_move"]')).toBeTruthy();
    expect(panel.querySelector('.resolution-tab[data-action="keep_sale_as_is"]')).toBeTruthy();

    const adaptButton = panel.querySelector('.resolution-instant-btn[data-action="adapt_sale_to_move"]');
    expect(adaptButton).toBeTruthy();
    adaptButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(env.eventsTableManager.adaptSaleToRelocationAge).toHaveBeenCalledWith('row-r', 'event-r');
  });

  test('applyEventTypeSelection updates toggle label even when data-row-id does not match internal element ids', async () => {
    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row_mismatch">
            <td>
              <input type="hidden" class="event-type" value="NOP" />
              <div class="event-type-dd visualization-control">
                <span id="EventTypeToggle_row_999" class="dd-toggle pseudo-select">No Operation</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    const row = document.querySelector('tr[data-row-id="row_mismatch"]');
    const manager = Object.create(EventsTableManager.prototype);
    manager.updateFieldVisibility = jest.fn();
    manager.applyTypeColouring = jest.fn();
    manager.syncTaxRuleSetsForCurrentEvents = jest.fn(() => Promise.resolve());
    manager._scheduleRelocationReanalysis = jest.fn();

    await manager.applyEventTypeSelection(row, 'MV', 'Relocation');

    expect(row.querySelector('.event-type').value).toBe('MV');
    expect(row.querySelector('.event-type-dd .dd-toggle').textContent).toBe('Relocation');
  });
});
