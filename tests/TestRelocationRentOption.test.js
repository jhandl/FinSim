
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
                <input class="event-type" value="MV-us" />
              </div>
            </td>
            <td>
              <input class="event-name" value="Relocation" />
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
      ready: false,
      getFX: jest.fn(() => 1.0),
      getPPP: jest.fn(() => 1.0)
    };
    const configStub = {
      isRelocationEnabled: () => true,
      getDefaultCountry: () => 'ar',
      getStartCountry: () => 'ar',
      getCountryNameByCode: (code) => (code === 'us' ? 'United States' : 'Argentina'),
      getCachedTaxRuleSet: (code) => ({
        getCurrencySymbol: () => (code === 'us' ? '$' : '$'),
        getNumberLocale: () => 'en-US',
        getCurrencyCode: () => (code || 'usd').toUpperCase()
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
        type: 'MV-us',
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
            getOrCreateHiddenInput: jest.fn(), // for _keepProperty
            _applyToRealEstatePair: jest.fn(), // for _keepProperty
        }
    };
    
    RelocationImpactAssistant.renderPanelForTableRow(eventRow, event, env);
    
    // Check if "Rent Out" button exists
    const panel = document.querySelector('.resolution-panel-row');
    expect(panel).toBeTruthy();
    
    const buttons = panel.querySelectorAll('button[data-action="rent_out"]');
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons[0].textContent).toBe('Rent Out');
    
    // Click the button (we need to trigger the click on the "Apply" button within the detail view)
    // First, find the detail section for rent_out
    const detail = panel.querySelector('.resolution-detail[data-action="rent_out"]');
    expect(detail).toBeTruthy();
    
    const applyButton = detail.querySelector('button.resolution-apply');
    expect(applyButton).toBeTruthy();
    
    applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    
    expect(rentOutSpy).toHaveBeenCalled();
    
    // Check if addEventFromWizardWithSorting was called
    expect(env.eventsTableManager.addEventFromWizardWithSorting).toHaveBeenCalledWith({
        eventType: 'RI',
        name: 'MyHouse',
        amount: '',
        fromAge: 40,
        toAge: 80
    });
  });
});
