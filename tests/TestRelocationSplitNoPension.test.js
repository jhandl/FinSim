
const { EventsTableManager } = require('../src/frontend/web/components/EventsTableManager.js');

describe('Relocation Split No Pension', () => {
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
    global.RelocationImpactAssistant = {
      collapsePanelForTableRow: jest.fn()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function buildTableDom(eventType = 'SI') {
    document.body.innerHTML = `
      <table id="Events">
        <thead>
          <tr><th>Type</th><th>Details</th></tr>
        </thead>
        <tbody>
          <tr data-row-id="row-1">
            <td>
              <div class="event-type-container">
                <input class="event-type" value="${eventType}" />
              </div>
            </td>
            <td>
              <input class="event-name" value="Job" />
              <input class="event-from-age" value="30" />
              <input class="event-to-age" value="60" />
              <input class="event-amount" value="100000" />
            </td>
          </tr>
        </tbody>
      </table>
    `;
  }

  test('splits SI to SInp when destination has no private pension', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      getStartCountry: () => 'us',
      getCachedTaxRuleSet: (code) => {
        if (code === 'np') { // 'np' = No Pension country
            return {
                getCurrencyCode: () => 'EUR',
                hasPrivatePensions: () => false, // KEY: No private pension
                getNumberLocale: () => 'en-US',
                getCurrencySymbol: () => '€'
            };
        }
        return {
            getCurrencyCode: () => 'USD',
            hasPrivatePensions: () => true,
            getNumberLocale: () => 'en-US',
            getCurrencySymbol: () => '$'
        };
      },
      getInstance: () => configStub
    };
    global.Config = { getInstance: () => configStub };

    buildTableDom('SI');
    
    // Mock webUI and events
    const event = {
        id: 'Job',
        type: 'SI',
        fromAge: 30,
        toAge: 60,
        amount: 100000,
        relocationImpact: {
            mvEventId: 'Relocation'
        }
    };
    
    const relocationEvent = {
        id: 'Relocation',
        type: 'MV-np', // Moving to No Pension country
        fromAge: 40
    };

    const webUIStub = {
        readEvents: jest.fn(() => [event, relocationEvent]),
        getValue: jest.fn(),
        formatUtils: {
             setupCurrencyInputs: jest.fn(),
             setupPercentageInputs: jest.fn()
        }
    };

    constructorNoops.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });

    const manager = new EventsTableManager(webUIStub);
    
    // Spy on createEventRow to verify arguments
    // We need to implement createEventRow just enough to return a dummy element so splitEventAtRelocation continues
    jest.spyOn(manager, 'createEventRow').mockImplementation((type, id, amount, from, to) => {
        const tr = document.createElement('tr');
        tr.className = 'mock-row';
        tr.dataset.type = type; // Store type for verification
        return tr;
    });
    
    jest.spyOn(manager, 'getOrCreateHiddenInput').mockImplementation(() => {});
    
    // Trigger split
    manager.splitEventAtRelocation('row-1', '90000');
    
    // Verify createEventRow calls
    expect(manager.createEventRow).toHaveBeenCalledTimes(2);
    
    // First call (Part 1): Should remain SI (from origin)
    expect(manager.createEventRow).toHaveBeenNthCalledWith(1, 'SI', 'Job', '100000', 30, 40, expect.anything(), expect.anything());
    
    // Second call (Part 2): Should change to SInp (destination has no pension)
    expect(manager.createEventRow).toHaveBeenNthCalledWith(2, 'SInp', 'Job', '90000', 40, 60, expect.anything(), expect.anything());
  });

  test('splits SI2 to SI2np when destination has no private pension', () => {
     const configStub = {
      isRelocationEnabled: () => true,
      getStartCountry: () => 'us',
      getCachedTaxRuleSet: (code) => {
        if (code === 'np') { // 'np' = No Pension country
            return {
                getCurrencyCode: () => 'EUR',
                hasPrivatePensions: () => false, // KEY: No private pension
                getNumberLocale: () => 'en-US',
                getCurrencySymbol: () => '€'
            };
        }
        return {
            getCurrencyCode: () => 'USD',
            hasPrivatePensions: () => true,
            getNumberLocale: () => 'en-US',
            getCurrencySymbol: () => '$'
        };
      },
      getInstance: () => configStub
    };
    global.Config = { getInstance: () => configStub };

    buildTableDom('SI2');
    
    const event = {
        id: 'Job',
        type: 'SI2',
        fromAge: 30,
        toAge: 60,
        amount: 100000,
        relocationImpact: {
            mvEventId: 'Relocation'
        }
    };
    
    const relocationEvent = {
        id: 'Relocation',
        type: 'MV-np', 
        fromAge: 40
    };

    const webUIStub = {
        readEvents: jest.fn(() => [event, relocationEvent]),
        getValue: jest.fn(),
        formatUtils: {
             setupCurrencyInputs: jest.fn(),
             setupPercentageInputs: jest.fn()
        }
    };
    
    const manager = new EventsTableManager(webUIStub);
    jest.spyOn(manager, 'createEventRow').mockImplementation((type) => {
        const tr = document.createElement('tr');
        tr.dataset.type = type;
        return tr;
    });
    jest.spyOn(manager, 'getOrCreateHiddenInput').mockImplementation(() => {});

    manager.splitEventAtRelocation('row-1', '90000');

    expect(manager.createEventRow).toHaveBeenNthCalledWith(2, 'SI2np', 'Job', '90000', 40, 60, expect.anything(), expect.anything());
  });

   test('keeps SI as SI when destination HAS private pension', () => {
     const configStub = {
      isRelocationEnabled: () => true,
      getStartCountry: () => 'us',
      getCachedTaxRuleSet: (code) => {
        return {
            getCurrencyCode: () => 'GBP',
            hasPrivatePensions: () => true, // KEY: HAS private pension
            getNumberLocale: () => 'en-US',
            getCurrencySymbol: () => '£'
        };
      },
      getInstance: () => configStub
    };
    global.Config = { getInstance: () => configStub };

    buildTableDom('SI');
    
    const event = {
        id: 'Job',
        type: 'SI',
        fromAge: 30,
        toAge: 60,
        amount: 100000,
        relocationImpact: {
            mvEventId: 'Relocation'
        }
    };
    
    const relocationEvent = {
        id: 'Relocation',
        type: 'MV-uk', 
        fromAge: 40
    };

    const webUIStub = {
        readEvents: jest.fn(() => [event, relocationEvent]),
        getValue: jest.fn(),
        formatUtils: {
             setupCurrencyInputs: jest.fn(),
             setupPercentageInputs: jest.fn()
        }
    };
    
    const manager = new EventsTableManager(webUIStub);
    jest.spyOn(manager, 'createEventRow').mockImplementation((type) => {
        const tr = document.createElement('tr');
        tr.dataset.type = type;
        return tr;
    });
    jest.spyOn(manager, 'getOrCreateHiddenInput').mockImplementation(() => {});

    manager.splitEventAtRelocation('row-1', '90000');

    expect(manager.createEventRow).toHaveBeenNthCalledWith(2, 'SI', 'Job', '90000', 40, 60, expect.anything(), expect.anything());
  });
});
