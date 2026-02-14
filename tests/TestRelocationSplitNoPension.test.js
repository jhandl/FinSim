
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
        type: 'MV', // Moving to No Pension country
        name: 'NP',
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
    expect(manager.createEventRow).toHaveBeenNthCalledWith(1, 'SI', 'Job', '100000', 30, 39, expect.anything(), expect.anything());
    
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
        type: 'MV',
        name: 'NP',
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
        type: 'MV',
        name: 'UK',
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

  test('joins split halves using first-half amount and currency', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      getStartCountry: () => 'us',
      getAvailableCountries: () => [],
      getCachedTaxRuleSet: () => ({
        getCurrencyCode: () => 'USD',
        hasPrivatePensions: () => true,
        getNumberLocale: () => 'en-US',
        getCurrencySymbol: () => '$'
      }),
      getInstance: () => configStub
    };
    global.Config = { getInstance: () => configStub };

    document.body.innerHTML = `
      <table id="Events">
        <thead>
          <tr><th>Type</th><th>Name</th><th>Amount</th><th>From</th><th>To</th><th>Rate</th><th>Match</th></tr>
        </thead>
        <tbody>
          <tr data-row-id="row-1">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-amount" value="100000"></td>
            <td><input class="event-from-age" value="30"></td>
            <td><input class="event-to-age" value="35"></td>
            <td><input class="event-rate" value=""></td>
            <td><input class="event-match" value=""></td>
          </tr>
          <tr data-row-id="row-2">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-amount" value="90000"></td>
            <td><input class="event-from-age" value="35"></td>
            <td><input class="event-to-age" value="40"></td>
            <td><input class="event-rate" value=""></td>
            <td><input class="event-match" value=""></td>
          </tr>
        </tbody>
      </table>
    `;

    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };

    const manager = new EventsTableManager(webUIStub);
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-1"]'), 'event-linked-event-id', 'split_123');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-2"]'), 'event-linked-event-id', 'split_123');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-1"]'), 'event-currency', 'AAA');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-2"]'), 'event-currency', 'BBB');
    jest.spyOn(manager, 'createEventRow').mockImplementation((type, name, amount, fromAge, toAge, rate, match) => {
      const tr = document.createElement('tr');
      tr.dataset.rowId = 'merged-row';
      tr.innerHTML = `
        <td><div class="event-type-container"><input class="event-type" value="${type}"></div></td>
        <td><input class="event-name" value="${name}"></td>
        <td><input class="event-amount" value="${amount}"></td>
        <td><input class="event-from-age" value="${fromAge}"></td>
        <td><input class="event-to-age" value="${toAge}"></td>
        <td><input class="event-rate" value="${rate || ''}"></td>
        <td><input class="event-match" value="${match || ''}"></td>
      `;
      return tr;
    });

    jest.spyOn(manager, '_afterResolutionAction').mockImplementation(() => {});

    manager.joinSplitEvents('row-1');

    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    expect(rows).toHaveLength(1);
    const mergedRow = rows[0];
    expect(mergedRow.querySelector('.event-type').value).toBe('SI');
    expect(mergedRow.querySelector('.event-name').value).toBe('Job');
    expect(mergedRow.querySelector('.event-amount').value).toBe('100000');
    expect(mergedRow.querySelector('.event-from-age').value).toBe('30');
    expect(mergedRow.querySelector('.event-to-age').value).toBe('40');
    expect(mergedRow.querySelector('.event-currency').value).toBe('AAA');
    expect(mergedRow.querySelector('.event-linked-event-id')).toBeNull();
  });

  test('moves split boundary when relocation age shifts within the event range', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      getStartCountry: () => 'us',
      getAvailableCountries: () => [],
      getCachedTaxRuleSet: () => ({
        getCurrencyCode: () => 'USD',
        hasPrivatePensions: () => true,
        getNumberLocale: () => 'en-US',
        getCurrencySymbol: () => '$'
      }),
      getInstance: () => configStub
    };
    global.Config = { getInstance: () => configStub };

    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-1">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-amount" value="100000"></td>
            <td><input class="event-from-age" value="30"></td>
            <td><input class="event-to-age" value="34"></td>
            <td><input class="event-rate" value=""></td>
            <td><input class="event-match" value=""></td>
          </tr>
          <tr data-row-id="row-2">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-amount" value="90000"></td>
            <td><input class="event-from-age" value="35"></td>
            <td><input class="event-to-age" value="40"></td>
            <td><input class="event-rate" value=""></td>
            <td><input class="event-match" value=""></td>
          </tr>
        </tbody>
      </table>
    `;

    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };

    const manager = new EventsTableManager(webUIStub);
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-1"]'), 'event-linked-event-id', 'split_sync_1');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-2"]'), 'event-linked-event-id', 'split_sync_1');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-1"]'), 'event-relocation-split-mv-id', 'mvlink_test');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-2"]'), 'event-relocation-split-mv-id', 'mvlink_test');

    manager._syncSplitChainsForRelocationAgeShift(2, ['mvlink_test'], 37);

    const first = document.querySelector('tr[data-row-id="row-1"]');
    const second = document.querySelector('tr[data-row-id="row-2"]');
    expect(first.querySelector('.event-to-age').value).toBe('36');
    expect(second.querySelector('.event-from-age').value).toBe('37');
    expect(first.querySelector('.event-linked-event-id').value).toBe('split_sync_1');
    expect(second.querySelector('.event-linked-event-id').value).toBe('split_sync_1');
  });

  test('collapses to origin half when relocation age moves past split range', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      getStartCountry: () => 'us',
      getAvailableCountries: () => [],
      getCachedTaxRuleSet: () => ({
        getCurrencyCode: () => 'USD',
        hasPrivatePensions: () => true,
        getNumberLocale: () => 'en-US',
        getCurrencySymbol: () => '$'
      }),
      getInstance: () => configStub
    };
    global.Config = { getInstance: () => configStub };

    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-1">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-amount" value="100000"></td>
            <td><input class="event-from-age" value="30"></td>
            <td><input class="event-to-age" value="34"></td>
            <td><input class="event-rate" value=""></td>
            <td><input class="event-match" value=""></td>
          </tr>
          <tr data-row-id="row-2">
            <td><div class="event-type-container"><input class="event-type" value="SInp"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-amount" value="90000"></td>
            <td><input class="event-from-age" value="35"></td>
            <td><input class="event-to-age" value="40"></td>
            <td><input class="event-rate" value=""></td>
            <td><input class="event-match" value=""></td>
          </tr>
        </tbody>
      </table>
    `;

    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };

    const manager = new EventsTableManager(webUIStub);
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-1"]'), 'event-linked-event-id', 'split_sync_2');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-2"]'), 'event-linked-event-id', 'split_sync_2');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-1"]'), 'event-relocation-split-mv-id', 'mvlink_test');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-2"]'), 'event-relocation-split-mv-id', 'mvlink_test');

    manager._syncSplitChainsForRelocationAgeShift(10, ['mvlink_test'], 45);

    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    expect(rows).toHaveLength(1);
    const remaining = rows[0];
    expect(remaining.querySelector('.event-type').value).toBe('SI');
    expect(remaining.querySelector('.event-to-age').value).toBe('40');
    expect(remaining.querySelector('.event-linked-event-id')).toBeNull();
  });

  test('collapses to destination half when relocation age moves before split range', () => {
    const configStub = {
      isRelocationEnabled: () => true,
      getStartCountry: () => 'us',
      getAvailableCountries: () => [],
      getCachedTaxRuleSet: () => ({
        getCurrencyCode: () => 'USD',
        hasPrivatePensions: () => true,
        getNumberLocale: () => 'en-US',
        getCurrencySymbol: () => '$'
      }),
      getInstance: () => configStub
    };
    global.Config = { getInstance: () => configStub };

    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-1">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-amount" value="100000"></td>
            <td><input class="event-from-age" value="30"></td>
            <td><input class="event-to-age" value="34"></td>
            <td><input class="event-rate" value=""></td>
            <td><input class="event-match" value=""></td>
          </tr>
          <tr data-row-id="row-2">
            <td><div class="event-type-container"><input class="event-type" value="SInp"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-amount" value="90000"></td>
            <td><input class="event-from-age" value="35"></td>
            <td><input class="event-to-age" value="40"></td>
            <td><input class="event-rate" value=""></td>
            <td><input class="event-match" value=""></td>
          </tr>
        </tbody>
      </table>
    `;

    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };

    const manager = new EventsTableManager(webUIStub);
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-1"]'), 'event-linked-event-id', 'split_sync_3');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-2"]'), 'event-linked-event-id', 'split_sync_3');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-1"]'), 'event-relocation-split-mv-id', 'mvlink_test');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-2"]'), 'event-relocation-split-mv-id', 'mvlink_test');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-2"]'), 'event-currency', 'BBB');

    manager._syncSplitChainsForRelocationAgeShift(-5, ['mvlink_test'], 30);

    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    expect(rows).toHaveLength(1);
    const remaining = rows[0];
    expect(remaining.querySelector('.event-type').value).toBe('SInp');
    expect(remaining.querySelector('.event-amount').value).toBe('90000');
    expect(remaining.querySelector('.event-from-age').value).toBe('30');
    expect(remaining.querySelector('.event-to-age').value).toBe('40');
    expect(remaining.querySelector('.event-currency').value).toBe('BBB');
    expect(remaining.querySelector('.event-linked-event-id')).toBeNull();
  });

  test('manual age edits keep split linkage for non-real-estate events', () => {
    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-1">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-from-age" value="30"></td>
            <td><input class="event-to-age" value="34"></td>
          </tr>
          <tr data-row-id="row-2">
            <td><div class="event-type-container"><input class="event-type" value="SInp"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-from-age" value="35"></td>
            <td><input class="event-to-age" value="40"></td>
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
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-1"]'), 'event-linked-event-id', 'split_manual_1');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-2"]'), 'event-linked-event-id', 'split_manual_1');

    const secondFromAge = document.querySelector('tr[data-row-id="row-2"] .event-from-age');
    secondFromAge.value = '36';
    secondFromAge.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector('tr[data-row-id="row-1"] .event-linked-event-id').value).toBe('split_manual_1');
    expect(document.querySelector('tr[data-row-id="row-2"] .event-linked-event-id').value).toBe('split_manual_1');
  });

  test('changing relocation age no longer auto-adjusts split halves', () => {
    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-mv" data-event-id="mv-runtime-1">
            <td><div class="event-type-container"><input class="event-type" value="MV"></div></td>
            <td><input class="event-name" value="US"></td>
            <td><input class="event-from-age" value="35"></td>
            <td><input class="event-to-age" value="35"></td>
          </tr>
          <tr data-row-id="row-1">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-from-age" value="30"></td>
            <td><input class="event-to-age" value="34"></td>
          </tr>
          <tr data-row-id="row-2">
            <td><div class="event-type-container"><input class="event-type" value="SInp"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-from-age" value="35"></td>
            <td><input class="event-to-age" value="40"></td>
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
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-1"]'), 'event-linked-event-id', 'split_manual_2');
    manager.getOrCreateHiddenInput(document.querySelector('tr[data-row-id="row-2"]'), 'event-linked-event-id', 'split_manual_2');
    manager._mvAgesByRowId['row-mv'] = 35;

    const mvFromAge = document.querySelector('tr[data-row-id="row-mv"] .event-from-age');
    mvFromAge.value = '37';
    mvFromAge.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector('tr[data-row-id="row-1"] .event-to-age').value).toBe('34');
    expect(document.querySelector('tr[data-row-id="row-2"] .event-from-age').value).toBe('35');
    expect(document.querySelector('tr[data-row-id="row-1"] .event-linked-event-id').value).toBe('split_manual_2');
    expect(document.querySelector('tr[data-row-id="row-2"] .event-linked-event-id').value).toBe('split_manual_2');
  });

  test('adapt split preserves post-relocation start-age delta after relocation move', () => {
    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-mv" data-event-id="mv-runtime-delta">
            <td><div class="event-type-container"><input class="event-type" value="MV"></div></td>
            <td><input class="event-name" value="US"></td>
            <td><input class="event-from-age" value="40"></td>
            <td><input class="event-to-age" value="40"></td>
            <td><input class="event-relocation-link-id" value="mvlink_delta_1"></td>
          </tr>
          <tr data-row-id="row-1">
            <td><div class="event-type-container"><input class="event-type" value="SI"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-from-age" value="30"></td>
            <td><input class="event-to-age" value="39"></td>
            <td><input class="event-linked-event-id" value="split_delta_1"></td>
            <td><input class="event-relocation-split-mv-id" value="mvlink_delta_1"></td>
          </tr>
          <tr data-row-id="row-2">
            <td><div class="event-type-container"><input class="event-type" value="SInp"></div></td>
            <td><input class="event-name" value="Job"></td>
            <td><input class="event-from-age" value="42"></td>
            <td><input class="event-to-age" value="60"></td>
            <td><input class="event-linked-event-id" value="split_delta_1"></td>
            <td><input class="event-relocation-split-mv-id" value="mvlink_delta_1"></td>
          </tr>
        </tbody>
      </table>
    `;

    constructorNoops.filter((method) => method !== 'setupEventTypeChangeHandler').forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });
    jest.spyOn(EventsTableManager.prototype, '_scheduleRelocationReanalysis').mockImplementation(() => {});

    const events = [
      { id: 'Relocation', type: 'MV', name: 'US', fromAge: 45, toAge: 45, relocationLinkId: 'mvlink_delta_1', _mvRuntimeId: 'mv-runtime-delta' },
      { id: 'Job', type: 'SI', fromAge: 30, toAge: 39, linkedEventId: 'split_delta_1', relocationSplitMvId: 'mvlink_delta_1' },
      {
        id: 'Job',
        type: 'SInp',
        fromAge: 42,
        toAge: 60,
        linkedEventId: 'split_delta_1',
        relocationSplitMvId: 'mvlink_delta_1',
        relocationImpact: { category: 'split_relocation_shift', mvEventId: 'Relocation' }
      }
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

    manager.adaptSplitToRelocationAge('row-2');

    expect(document.querySelector('tr[data-row-id="row-1"] .event-to-age').value).toBe('44');
    expect(document.querySelector('tr[data-row-id="row-2"] .event-from-age').value).toBe('47');
  });
});
