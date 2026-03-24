
const { RelocationImpactAssistant } = require('../src/frontend/web/components/RelocationImpactAssistant.js');
const { EventsTableManager } = require('../src/frontend/web/components/EventsTableManager.js');

global.RelocationImpactAssistant = RelocationImpactAssistant;

describe('Relocation Rent Option', () => {
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
      formatCurrency: (value) => {
        const num = Number(value);
        if (isNaN(num)) return '$0';
        return '$' + Math.round(num).toString();
      }
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function buildTableDom() {
    document.body.innerHTML = `
      <table id="Events">
        <thead>
          <tr><th>Type</th><th>Details</th></tr>
        </thead>
        <tbody>
          <tr data-row-id="row-1">
            <td>
              <div class="event-type-container">
                <input class="event-type" value="R" />
              </div>
            </td>
            <td>
              <input class="event-name" value="MyHouse" />
              <input class="event-from-age" value="30" />
              <input class="event-to-age" value="80" />
              <input class="event-amount" value="500000" />
            </td>
          </tr>
          <tr data-row-id="row-2">
            <td>
              <div class="event-type-container">
                <input class="event-type" value="MV" />
              </div>
            </td>
            <td>
              <input class="event-name" value="US" />
              <input class="event-from-age" value="40" />
              <input class="event-to-age" value="40" />
              <input class="event-amount" value="0" />
            </td>
          </tr>
        </tbody>
      </table>
    `;
  }

  test('Render "Rent Out" option and trigger action', () => {
    const economicData = {
      ready: true,
      getFX: jest.fn(() => 1.0),
      getPPP: jest.fn(() => 1.0)
    };
    const configStub = {
      isRelocationEnabled: () => true,
      getDefaultCountry: () => 'ar',
      getStartCountry: () => 'ar',
      getSimulationStartYear: () => 2026,
      getCountryNameByCode: (code) => (code === 'us' ? 'United States' : 'Argentina'),
      getCachedTaxRuleSet: (code) => ({
        getCurrencySymbol: () => (code === 'us' ? '$' : '$'),
        getNumberLocale: () => 'en-US',
        getCurrencyCode: () => (code || 'usd').toUpperCase(),
        getEconomicData: () => ({ typicalRentalYield: 4.0 })
      }),
      getEconomicData: () => economicData,
      getAvailableCountries: () => [
        { code: 'ar', name: 'Argentina' },
        { code: 'us', name: 'United States' }
      ]
    };
    global.Config = { getInstance: () => configStub };

    buildTableDom();
    const eventRow = document.querySelector('tr[data-row-id="row-1"]');
    
    const event = {
        id: 'MyHouse',
        type: 'R',
        fromAge: 30,
        toAge: 80,
        amount: 500000,
        relocationImpact: {
            category: 'boundary',
            mvEventId: 'Relocation',
            boundaryAge: 40
        }
    };

    const relocationEvent = {
        id: 'Relocation',
        type: 'MV',
        name: 'US',
        fromAge: 40
    };

    // Spy on _rentOutProperty
    const rentOutSpy = jest.spyOn(RelocationImpactAssistant, '_rentOutProperty');
    
    // Call renderPanelForTableRow
    const env = {
        webUI: {
            readEvents: jest.fn(() => [event, relocationEvent]),
            updateStatusForRelocationImpacts: jest.fn(),
            eventAccordionManager: { refresh: jest.fn() }
        },
        eventsTableManager: {
            getOriginCountry: jest.fn(() => 'ar'),
            addEventFromWizardWithSorting: jest.fn(),
            recomputeRelocationImpacts: jest.fn(),
            getOrCreateHiddenInput: jest.fn(), // for _keepProperty
            _applyToRealEstatePair: jest.fn(), // for _keepProperty
            _getRelocationLinkIdByImpactId: jest.fn(() => 'mvlink_rent_1')
        }
    };
    
    RelocationImpactAssistant.renderPanelForTableRow(eventRow, event, env);
    
    // Check if "Rent Out" button exists
    const panel = document.querySelector('.resolution-panel-row');
    expect(panel).toBeTruthy();
    
    const buttons = panel.querySelectorAll('button[data-action="rent_out"]');
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons[0].textContent).toBe('Rent out');

    const applyButton = panel.querySelector('.resolution-instant-btn[data-action="rent_out"]');
    expect(applyButton).toBeTruthy();

    applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    
    expect(rentOutSpy).toHaveBeenCalled();
    
    // Check if addEventFromWizardWithSorting was called with estimated amount
    // property value 500,000 * 4% yield = 20,000. Origin currency '$' (ARS in mock). PPP is NOT applied.
    expect(env.eventsTableManager.addEventFromWizardWithSorting).toHaveBeenCalledWith({
        eventType: 'RI',
        name: 'MyHouse',
        amount: '$20000',
        fromAge: 40,
        toAge: 80,
        relocationReviewed: true,
        relocationImpact: event.relocationImpact,
        relocationRentMvId: 'mvlink_rent_1',
        linkedCountry: 'ar',
        currency: 'AR'
    });
  });

  test('orphan rent-out panel shows Keep Renting and Remove actions', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      getDefaultCountry: () => 'ar',
      getStartCountry: () => 'ar',
      getSimulationStartYear: () => 2026,
      getCountryNameByCode: (code) => (code === 'us' ? 'United States' : 'Argentina'),
      getCachedTaxRuleSet: () => ({
        getCurrencySymbol: () => '$',
        getNumberLocale: () => 'en-US',
        getCurrencyCode: () => 'AR'
      }),
      getEconomicData: () => ({ ready: false, getFX: jest.fn(() => null), getPPP: jest.fn(() => null) }),
      getAvailableCountries: () => [
        { code: 'ar', name: 'Argentina' },
        { code: 'us', name: 'United States' }
      ]
    };
    global.Config = { getInstance: () => configStub };

    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-ri" data-event-id="event-ri">
            <td>
              <div class="event-type-container">
                <input class="event-type" value="RI" />
                <input class="event-relocation-rent-mv-id" value="mvlink_rent_removed" />
              </div>
            </td>
            <td>
              <input class="event-name" value="MyHouse" />
              <input class="event-from-age" value="40" />
              <input class="event-to-age" value="80" />
              <input class="event-amount" value="20000" />
            </td>
          </tr>
        </tbody>
      </table>
    `;

    const row = document.querySelector('tr[data-row-id="row-ri"]');
    const event = {
      id: 'rent_orphan',
      type: 'RI',
      fromAge: 40,
      toAge: 80,
      amount: 20000,
      relocationRentMvId: 'mvlink_rent_removed',
      relocationImpact: {
        category: 'simple',
        mvEventId: '',
        details: { relocationRentalOrphan: true }
      }
    };
    const env = {
      webUI: {
        readEvents: jest.fn(() => [event]),
        updateStatusForRelocationImpacts: jest.fn(),
        eventAccordionManager: { refresh: jest.fn() }
      },
      eventsTableManager: {
        _findEventRow: jest.fn(() => row),
        _removeHiddenInput: jest.fn(),
        _afterResolutionAction: jest.fn()
      }
    };

    RelocationImpactAssistant.renderPanelForTableRow(row, event, env);
    const panel = document.querySelector('.resolution-panel-row');
    expect(panel).toBeTruthy();
    expect(panel.querySelector('.resolution-instant-btn[data-action="keep_renting"]')).toBeTruthy();
    expect(panel.querySelector('.resolution-instant-btn[data-action="delete"]')).toBeTruthy();
    expect(panel.querySelector('.resolution-instant-btn[data-action="keep_renting"]').textContent).toBe('Keep renting');
    expect(panel.querySelector('.resolution-instant-btn[data-action="delete"]').textContent).toBe('Remove');

    panel.querySelector('.resolution-instant-btn[data-action="keep_renting"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(env.eventsTableManager._removeHiddenInput).toHaveBeenCalledWith(row, 'event-relocation-rent-mv-id');
    expect(env.eventsTableManager._afterResolutionAction).toHaveBeenCalledWith('row-ri', { pulse: true });
  });

  test('sell property cuts property and mortgage to the last age before relocation', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      getDefaultCountry: () => 'ar',
      getStartCountry: () => 'ar',
      getCountryNameByCode: (code) => (code === 'us' ? 'United States' : 'Argentina'),
      getCachedTaxRuleSet: () => ({
        getCurrencySymbol: () => '$',
        getNumberLocale: () => 'en-US',
        getCurrencyCode: () => 'USD'
      }),
      getEconomicData: () => ({ ready: false, getFX: jest.fn(() => 1.0), getPPP: jest.fn(() => 1.0) }),
      getAvailableCountries: () => [
        { code: 'ar', name: 'Argentina' },
        { code: 'us', name: 'United States' }
      ]
    };
    global.Config = { getInstance: () => configStub };

    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-1">
            <td><input class="event-type" value="R" /></td>
            <td><input class="event-name" value="MyHouse" /></td>
            <td><input class="event-to-age" value="80" /></td>
          </tr>
          <tr data-row-id="row-2">
            <td><input class="event-type" value="M" /></td>
            <td><input class="event-name" value="MyHouse" /></td>
            <td><input class="event-to-age" value="75" /></td>
          </tr>
        </tbody>
      </table>
    `;

    const event = {
      id: 'MyHouse',
      type: 'R',
      fromAge: 30,
      toAge: 80,
      relocationImpact: {
        category: 'boundary',
        mvEventId: 'Relocation'
      }
    };
    const relocationEvent = { id: 'Relocation', type: 'MV', name: 'US', fromAge: 40, toAge: 40 };
    const webUIStub = {
      readEvents: jest.fn(() => [event, relocationEvent]),
      updateStatusForRelocationImpacts: jest.fn(),
      eventAccordionManager: { refresh: jest.fn() }
    };
    const eventsTableManagerStub = {
      _findEventRow: jest.fn((rowId) => document.querySelector(`tr[data-row-id="${rowId}"]`)),
      _applyToRealEstatePair: jest.fn((row, fn) => {
        const idVal = row.querySelector('.event-name').value;
        const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter((r) => {
          const type = r.querySelector('.event-type')?.value;
          const name = r.querySelector('.event-name')?.value;
          return (type === 'R' || type === 'M') && name === idVal;
        });
        rows.forEach(fn);
      }),
      getOrCreateHiddenInput: jest.fn((row, className, value) => {
        let input = row.querySelector('.' + className);
        if (!input) {
          input = document.createElement('input');
          input.type = 'hidden';
          input.className = className;
          row.appendChild(input);
        }
        input.value = value;
        return input;
      }),
      _getRelocationLinkIdByImpactId: jest.fn(() => 'mvlink_1700000000_test')
    };

    RelocationImpactAssistant._sellProperty(event, { rowId: 'row-1' }, {
      webUI: webUIStub,
      eventsTableManager: eventsTableManagerStub
    });

    const propertyToAge = document.querySelector('tr[data-row-id="row-1"] .event-to-age').value;
    const mortgageToAge = document.querySelector('tr[data-row-id="row-2"] .event-to-age').value;
    const propertySellMv = document.querySelector('tr[data-row-id="row-1"] .event-relocation-sell-mv-id').value;
    const mortgageSellMv = document.querySelector('tr[data-row-id="row-2"] .event-relocation-sell-mv-id').value;
    expect(propertyToAge).toBe('39');
    expect(mortgageToAge).toBe('39');
    expect(propertySellMv).toBe('mvlink_1700000000_test');
    expect(mortgageSellMv).toBe('mvlink_1700000000_test');
  });

  test('marked sold real-estate rows keep timing when relocation age changes', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      getDefaultCountry: () => 'ar',
      getStartCountry: () => 'ar',
      getCountryNameByCode: () => 'Argentina',
      getCachedTaxRuleSet: () => ({
        getCurrencySymbol: () => '$',
        getNumberLocale: () => 'en-US',
        getCurrencyCode: () => 'USD'
      }),
      getEconomicData: () => ({ ready: false, getFX: jest.fn(() => 1.0), getPPP: jest.fn(() => 1.0) }),
      getAvailableCountries: () => [
        { code: 'ar', name: 'Argentina' },
        { code: 'us', name: 'United States' }
      ]
    };
    global.Config = { getInstance: () => configStub };

    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-mv" data-event-id="mv-runtime-1">
            <td><div class="event-type-container"><input class="event-type" value="MV" /></div></td>
            <td><input class="event-name" value="US" /></td>
            <td><input class="event-from-age" value="40" /></td>
            <td><input class="event-to-age" value="40" /></td>
            <td><input class="event-relocation-link-id" value="mvlink_test_1" /></td>
          </tr>
          <tr data-row-id="row-r1">
            <td><div class="event-type-container"><input class="event-type" value="R" /></div></td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="30" /></td>
            <td><input class="event-to-age" value="39" /></td>
            <td><input class="event-relocation-sell-mv-id" value="mvlink_test_1" /></td>
          </tr>
          <tr data-row-id="row-m1">
            <td><div class="event-type-container"><input class="event-type" value="M" /></div></td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="30" /></td>
            <td><input class="event-to-age" value="39" /></td>
            <td><input class="event-relocation-sell-mv-id" value="mvlink_test_1" /></td>
          </tr>
          <tr data-row-id="row-r2">
            <td><div class="event-type-container"><input class="event-type" value="R" /></div></td>
            <td><input class="event-name" value="HomeB" /></td>
            <td><input class="event-from-age" value="30" /></td>
            <td><input class="event-to-age" value="39" /></td>
          </tr>
        </tbody>
      </table>
    `;

    constructorNoops.filter((method) => method !== 'setupEventTypeChangeHandler').forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });
    jest.spyOn(EventsTableManager.prototype, '_scheduleRelocationReanalysis').mockImplementation(() => {});

    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(() => 'single'),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };
    const manager = new EventsTableManager(webUIStub);

    const mvFromAge = document.querySelector('tr[data-row-id="row-mv"] .event-from-age');
    mvFromAge.value = '45';
    mvFromAge.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector('tr[data-row-id="row-r1"] .event-to-age').value).toBe('39');
    expect(document.querySelector('tr[data-row-id="row-m1"] .event-to-age').value).toBe('39');
    expect(document.querySelector('tr[data-row-id="row-r1"] .event-relocation-sell-mv-id').value).toBe('mvlink_test_1');
    expect(document.querySelector('tr[data-row-id="row-m1"] .event-relocation-sell-mv-id').value).toBe('mvlink_test_1');
    expect(document.querySelector('tr[data-row-id="row-r2"] .event-to-age').value).toBe('39');
  });

  test('manual sale-age edits clear relocation sell linkage for the full real-estate pair', () => {
    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-r1">
            <td><div class="event-type-container"><input class="event-type" value="R" /></div></td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="30" /></td>
            <td><input class="event-to-age" value="39" /></td>
            <td><input class="event-relocation-sell-mv-id" value="mvlink_test_2" /></td>
          </tr>
          <tr data-row-id="row-m1">
            <td><div class="event-type-container"><input class="event-type" value="M" /></div></td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="30" /></td>
            <td><input class="event-to-age" value="39" /></td>
            <td><input class="event-relocation-sell-mv-id" value="mvlink_test_2" /></td>
          </tr>
        </tbody>
      </table>
    `;

    constructorNoops.filter((method) => method !== 'setupEventTypeChangeHandler').forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });
    jest.spyOn(EventsTableManager.prototype, '_scheduleRelocationReanalysis').mockImplementation(() => {});

    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(() => 'single'),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };
    const manager = new EventsTableManager(webUIStub);

    const propertyToAge = document.querySelector('tr[data-row-id="row-r1"] .event-to-age');
    propertyToAge.value = '38';
    propertyToAge.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector('tr[data-row-id="row-r1"] .event-relocation-sell-mv-id')).toBeNull();
    expect(document.querySelector('tr[data-row-id="row-m1"] .event-relocation-sell-mv-id')).toBeNull();
  });

  test('relocation age change keeps sold property timing even without cached previous MV age', () => {
    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-mv" data-event-id="mv-runtime-3">
            <td><div class="event-type-container"><input class="event-type" value="MV" /></div></td>
            <td><input class="event-name" value="US" /></td>
            <td><input class="event-from-age" value="40" /></td>
            <td><input class="event-to-age" value="40" /></td>
            <td><input class="event-relocation-link-id" value="mvlink_test_3" /></td>
          </tr>
          <tr data-row-id="row-r1">
            <td><div class="event-type-container"><input class="event-type" value="R" /></div></td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="30" /></td>
            <td><input class="event-to-age" value="39" /></td>
            <td><input class="event-relocation-sell-mv-id" value="mvlink_test_3" /></td>
          </tr>
          <tr data-row-id="row-m1">
            <td><div class="event-type-container"><input class="event-type" value="M" /></div></td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="30" /></td>
            <td><input class="event-to-age" value="39" /></td>
            <td><input class="event-relocation-sell-mv-id" value="mvlink_test_3" /></td>
          </tr>
        </tbody>
      </table>
    `;

    constructorNoops.filter((method) => method !== 'setupEventTypeChangeHandler').forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });
    jest.spyOn(EventsTableManager.prototype, '_scheduleRelocationReanalysis').mockImplementation(() => {});

    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(() => 'single'),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };

    const manager = new EventsTableManager(webUIStub);
    manager._mvAgesByRowId = {};

    const mvFromAge = document.querySelector('tr[data-row-id="row-mv"] .event-from-age');
    delete mvFromAge.dataset.mvPrevAge;
    mvFromAge.value = '45';
    mvFromAge.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector('tr[data-row-id="row-r1"] .event-to-age').value).toBe('39');
    expect(document.querySelector('tr[data-row-id="row-m1"] .event-to-age').value).toBe('39');
    expect(document.querySelector('tr[data-row-id="row-r1"] .event-relocation-sell-mv-id').value).toBe('mvlink_test_3');
    expect(document.querySelector('tr[data-row-id="row-m1"] .event-relocation-sell-mv-id').value).toBe('mvlink_test_3');
  });

  test('adapt sale preserves manual sale-age delta after relocation move', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      getDefaultCountry: () => 'ar',
      getStartCountry: () => 'ar',
      getCountryNameByCode: () => 'Argentina',
      getCachedTaxRuleSet: () => ({
        getCurrencySymbol: () => '$',
        getNumberLocale: () => 'en-US',
        getCurrencyCode: () => 'USD'
      }),
      getEconomicData: () => ({ ready: false, getFX: jest.fn(() => 1.0), getPPP: jest.fn(() => 1.0) }),
      getAvailableCountries: () => [
        { code: 'ar', name: 'Argentina' },
        { code: 'us', name: 'United States' }
      ]
    };
    global.Config = { getInstance: () => configStub };

    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-mv" data-event-id="mv-runtime-delta">
            <td><div class="event-type-container"><input class="event-type" value="MV" /></div></td>
            <td><input class="event-name" value="US" /></td>
            <td><input class="event-from-age" value="40" /></td>
            <td><input class="event-to-age" value="40" /></td>
            <td><input class="event-relocation-link-id" value="mvlink_sale_delta_1" /></td>
          </tr>
          <tr data-row-id="row-r1">
            <td><div class="event-type-container"><input class="event-type" value="R" /></div></td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="30" /></td>
            <td><input class="event-to-age" value="37" /></td>
            <td><input class="event-relocation-sell-mv-id" value="mvlink_sale_delta_1" /></td>
          </tr>
          <tr data-row-id="row-m1">
            <td><div class="event-type-container"><input class="event-type" value="M" /></div></td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="30" /></td>
            <td><input class="event-to-age" value="37" /></td>
            <td><input class="event-relocation-sell-mv-id" value="mvlink_sale_delta_1" /></td>
          </tr>
        </tbody>
      </table>
    `;

    constructorNoops.filter((method) => method !== 'setupEventTypeChangeHandler').forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });
    jest.spyOn(EventsTableManager.prototype, '_scheduleRelocationReanalysis').mockImplementation(() => {});

    const events = [
      { id: 'Relocation', type: 'MV', name: 'US', fromAge: 45, toAge: 45, relocationLinkId: 'mvlink_sale_delta_1', _mvRuntimeId: 'mv-runtime-delta' },
      {
        id: 'HomeA',
        type: 'R',
        fromAge: 30,
        toAge: 37,
        relocationSellMvId: 'mvlink_sale_delta_1',
        relocationImpact: { category: 'sale_relocation_shift', mvEventId: 'Relocation' }
      },
      { id: 'HomeA', type: 'M', fromAge: 30, toAge: 37, relocationSellMvId: 'mvlink_sale_delta_1' }
    ];
    const webUIStub = {
      readEvents: jest.fn(() => events),
      getValue: jest.fn(() => 'single'),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };

    const manager = new EventsTableManager(webUIStub);
    manager._mvAgesByRowId['row-mv'] = 40;
    jest.spyOn(manager, '_afterResolutionAction').mockImplementation(() => {});

    const mvFromAge = document.querySelector('tr[data-row-id="row-mv"] .event-from-age');
    mvFromAge.value = '45';
    mvFromAge.dispatchEvent(new Event('change', { bubbles: true }));

    manager.adaptSaleToRelocationAge('row-r1');

    expect(document.querySelector('tr[data-row-id="row-r1"] .event-to-age').value).toBe('42');
    expect(document.querySelector('tr[data-row-id="row-m1"] .event-to-age').value).toBe('42');
  });

  test('relocation rows get a stable generated MV link id', () => {
    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-mv" data-event-id="mv-runtime-99">
            <td><div class="event-type-container"><input class="event-type" value="MV" /></div></td>
            <td><input class="event-name" value="US" /></td>
            <td><input class="event-from-age" value="40" /></td>
            <td><input class="event-to-age" value="40" /></td>
          </tr>
        </tbody>
      </table>
    `;

    constructorNoops.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });

    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(() => 'single'),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };
    const manager = new EventsTableManager(webUIStub);

    const id1 = manager._getRelocationLinkIdByImpactId('mv-runtime-99');
    const id2 = manager._getRelocationLinkIdByImpactId('mv-runtime-99');
    expect(id1).toMatch(/^mvlink_/);
    expect(id2).toBe(id1);
    expect(document.querySelector('tr[data-row-id="row-mv"] .event-relocation-link-id').value).toBe(id1);
  });

  test('runtime impact ids resolve MV rows even when relocation names are duplicated', () => {
    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-mv-1" data-event-id="mv-runtime-1">
            <td><div class="event-type-container"><input class="event-type" value="MV" /></div></td>
            <td><input class="event-name" value="US" /></td>
            <td><input class="event-from-age" value="40" /></td>
            <td><input class="event-to-age" value="40" /></td>
          </tr>
          <tr data-row-id="row-mv-2" data-event-id="mv-runtime-2">
            <td><div class="event-type-container"><input class="event-type" value="MV" /></div></td>
            <td><input class="event-name" value="CA" /></td>
            <td><input class="event-from-age" value="50" /></td>
            <td><input class="event-to-age" value="50" /></td>
          </tr>
        </tbody>
      </table>
    `;

    constructorNoops.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });

    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(() => 'single'),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };
    const manager = new EventsTableManager(webUIStub);

    const runtimeLink = manager._getRelocationLinkIdByImpactId('mv-runtime-2');
    const ambiguousNameLink = manager._getRelocationLinkIdByImpactId('Relocation');

    expect(runtimeLink).toMatch(/^mvlink_/);
    expect(document.querySelector('tr[data-row-id="row-mv-2"] .event-relocation-link-id').value).toBe(runtimeLink);
    expect(document.querySelector('tr[data-row-id="row-mv-1"] .event-relocation-link-id')).toBeNull();
    expect(ambiguousNameLink).toBe('');
  });

  test('orphan sale-marker panel exposes keep-timing and restore-mortgage actions without an MV row', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      getDefaultCountry: () => 'ar',
      getStartCountry: () => 'ar',
      getCountryNameByCode: () => 'Argentina',
      getCachedTaxRuleSet: () => ({
        getCurrencySymbol: () => '$',
        getNumberLocale: () => 'en-US',
        getCurrencyCode: () => 'USD'
      }),
      getEconomicData: () => ({ ready: false, getFX: jest.fn(() => 1.0), getPPP: jest.fn(() => 1.0) }),
      getAvailableCountries: () => []
    };
    global.Config = { getInstance: () => configStub };

    const event = {
      id: 'HomeA',
      type: 'R',
      fromAge: 30,
      toAge: 65,
      relocationImpact: {
        category: 'sale_marker_orphan',
        message: 'Sale marker orphan',
        details: {
          sellMvId: 'mvlink_orphan_sale',
          canRestoreMortgagePlan: true
        }
      }
    };
    const env = {
      webUI: { readEvents: jest.fn(() => [event]) },
      eventsTableManager: {
        getStartCountry: () => 'ar',
        getOriginCountry: () => 'ar'
      }
    };

    const html = RelocationImpactAssistant.createPanelHtml(event, 'row-sale-orphan', env);
    expect(html).toContain('data-action="keep_sale_timing"');
    expect(html).toContain('data-action="restore_mortgage_plan"');
  });

  test('keep current timing after deleted relocation clears sale markers and stale review metadata across the workflow', () => {
    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-r1" data-relocation-impact-details='{"sellMvId":"mvlink_orphan_sale"}'>
            <td>
              <div class="event-type-container">
                <input class="event-type" value="R" />
                <input type="hidden" class="event-resolution-override" value="1" />
                <input type="hidden" class="event-resolution-mv-id" value="mv-runtime-old" />
                <input type="hidden" class="event-resolution-category" value="boundary" />
              </div>
            </td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="30" /></td>
            <td><input class="event-to-age" value="65" /></td>
          </tr>
          <tr data-row-id="row-m1">
            <td>
              <div class="event-type-container">
                <input class="event-type" value="M" />
                <input type="hidden" class="event-relocation-sell-mv-id" value="mvlink_orphan_sale" />
                <input type="hidden" class="event-relocation-sell-anchor-age" value="40" />
              </div>
            </td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="30" /></td>
            <td><input class="event-to-age" value="39" /></td>
          </tr>
          <tr data-row-id="row-mp1">
            <td>
              <div class="event-type-container">
                <input class="event-type" value="MP" />
                <input type="hidden" class="event-relocation-sell-mv-id" value="mvlink_orphan_sale" />
                <input type="hidden" class="event-relocation-sell-anchor-age" value="40" />
              </div>
            </td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="39" /></td>
            <td><input class="event-to-age" value="39" /></td>
          </tr>
        </tbody>
      </table>
    `;

    constructorNoops.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });

    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(() => 'single'),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };
    const manager = new EventsTableManager(webUIStub);
    jest.spyOn(manager, '_afterResolutionAction').mockImplementation(() => {});

    manager.keepSaleTimingAfterDeletedRelocation('row-r1');

    expect(document.querySelector('tr[data-row-id="row-r1"] .event-resolution-override')).toBeNull();
    expect(document.querySelector('tr[data-row-id="row-r1"] .event-resolution-mv-id')).toBeNull();
    expect(document.querySelector('tr[data-row-id="row-m1"] .event-relocation-sell-mv-id')).toBeNull();
    expect(document.querySelector('tr[data-row-id="row-mp1"] .event-relocation-sell-mv-id')).toBeNull();
  });

  test('restore mortgage plan after deleted relocation reopens the mortgage term and removes relocation payoff rows', () => {
    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-r1" data-relocation-impact-details='{"sellMvId":"mvlink_orphan_sale"}'>
            <td>
              <div class="event-type-container">
                <input class="event-type" value="R" />
              </div>
            </td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="30" /></td>
            <td><input class="event-to-age" value="65" /></td>
          </tr>
          <tr data-row-id="row-m1">
            <td>
              <div class="event-type-container">
                <input class="event-type" value="M" />
                <input type="hidden" class="event-mortgage-term" value="25" />
                <input type="hidden" class="event-relocation-sell-mv-id" value="mvlink_orphan_sale" />
                <input type="hidden" class="event-relocation-sell-anchor-age" value="40" />
              </div>
            </td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="35" /></td>
            <td><input class="event-to-age" value="39" /></td>
          </tr>
          <tr data-row-id="row-mp1">
            <td>
              <div class="event-type-container">
                <input class="event-type" value="MP" />
                <input type="hidden" class="event-relocation-sell-mv-id" value="mvlink_orphan_sale" />
                <input type="hidden" class="event-relocation-sell-anchor-age" value="40" />
                <input type="hidden" class="event-auto-payoff" value="1" />
              </div>
            </td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-from-age" value="39" /></td>
            <td><input class="event-to-age" value="39" /></td>
          </tr>
        </tbody>
      </table>
    `;

    constructorNoops.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });

    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(() => 'single'),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };
    const manager = new EventsTableManager(webUIStub);
    jest.spyOn(manager, '_afterResolutionAction').mockImplementation(() => {});
    jest.spyOn(manager, '_scheduleMortgagePlanReanalysis').mockImplementation(() => {});

    manager.restoreMortgagePlanAfterDeletedRelocation('row-r1');

    expect(document.querySelector('tr[data-row-id="row-m1"] .event-to-age').value).toBe('60');
    expect(document.querySelector('tr[data-row-id="row-m1"] .event-relocation-sell-mv-id')).toBeNull();
    expect(document.querySelector('tr[data-row-id="row-mp1"]')).toBeNull();
  });

  test('mortgage pay-off action is decoupled from property row', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      getDefaultCountry: () => 'ar',
      getStartCountry: () => 'ar',
      getCountryNameByCode: () => 'Argentina',
      getCachedTaxRuleSet: () => ({
        getCurrencySymbol: () => '$',
        getNumberLocale: () => 'en-US',
        getCurrencyCode: () => 'USD'
      }),
      getEconomicData: () => ({ ready: false, getFX: jest.fn(() => 1.0), getPPP: jest.fn(() => 1.0) }),
      getAvailableCountries: () => []
    };
    global.Config = { getInstance: () => configStub };

    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-r1">
            <td><input class="event-type" value="R" /></td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-to-age" value="80" /></td>
          </tr>
          <tr data-row-id="row-m1">
            <td><input class="event-type" value="M" /></td>
            <td><input class="event-name" value="HomeA" /></td>
            <td><input class="event-to-age" value="80" /></td>
          </tr>
        </tbody>
      </table>
    `;

    const event = {
      id: 'HomeA',
      type: 'M',
      fromAge: 30,
      toAge: 80,
      relocationImpact: { category: 'boundary', mvEventId: 'Relocation' }
    };
    const relocationEvent = { id: 'Relocation', type: 'MV', name: 'US', fromAge: 40, toAge: 40 };
    const webUIStub = {
      readEvents: jest.fn(() => [event, relocationEvent]),
      updateStatusForRelocationImpacts: jest.fn(),
      eventAccordionManager: { refresh: jest.fn() }
    };
    const eventsTableManagerStub = {
      _findEventRow: jest.fn((rowId) => document.querySelector(`tr[data-row-id="${rowId}"]`)),
      _applyToRealEstatePair: jest.fn(),
      getOrCreateHiddenInput: jest.fn((row, className, value) => {
        let input = row.querySelector('.' + className);
        if (!input) {
          input = document.createElement('input');
          input.type = 'hidden';
          input.className = className;
          row.appendChild(input);
        }
        input.value = value;
        return input;
      }),
      _getRelocationLinkIdByImpactId: jest.fn(() => 'mvlink_payoff')
    };

    RelocationImpactAssistant._sellProperty(event, { rowId: 'row-m1' }, {
      webUI: webUIStub,
      eventsTableManager: eventsTableManagerStub
    });

    const propertyToAge = document.querySelector('tr[data-row-id="row-r1"] .event-to-age').value;
    const mortgageToAge = document.querySelector('tr[data-row-id="row-m1"] .event-to-age').value;
    const mortgageSellMv = document.querySelector('tr[data-row-id="row-m1"] .event-relocation-sell-mv-id').value;
    
    expect(mortgageToAge).toBe('39');
    expect(mortgageSellMv).toBe('mvlink_payoff');
    // Property row should NOT be affected
    expect(propertyToAge).toBe('80');
  });
});
