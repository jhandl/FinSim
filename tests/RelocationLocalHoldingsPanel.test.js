const { RelocationImpactDetector } = require('../src/frontend/web/components/RelocationImpactDetector.js');
const { RelocationImpactAssistant } = require('../src/frontend/web/components/RelocationImpactAssistant.js');
const { EventsTableManager } = require('../src/frontend/web/components/EventsTableManager.js');

global.RelocationImpactAssistant = RelocationImpactAssistant;

describe('Relocation local holdings panels', () => {
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
                <select class="event-type event-type-dd">
                  <option value="MV-us" selected>MV-us</option>
                </select>
              </div>
            </td>
            <td>
              <input class="event-name" value="mv-local" />
              <input class="event-from-age" value="35" />
              <input class="event-to-age" value="35" />
              <input class="event-amount" value="0" />
            </td>
          </tr>
        </tbody>
      </table>
    `;
  }

  test('badge renders holdings list and resolves through Mark as Reviewed', () => {
    const economicData = {
      ready: false,
      getFX: jest.fn(() => null),
      getPPP: jest.fn(() => null)
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
    expect(eventRow).toBeTruthy();
    expect(eventRow.dataset.rowId).toBe('row-1');
    const events = [
      { id: 'mv-local', type: 'MV-us', fromAge: 35, toAge: 35, amount: 0 }
    ];
    const investmentContext = {
      investmentAssets: [
        { key: 'localArFund', label: 'Argentina Equity Fund', baseCurrency: 'ARS', assetCountry: 'ar', residenceScope: 'local' }
      ],
      capsByKey: { localArFund: 45000 }
    };
    RelocationImpactDetector.analyzeEvents(events, 'ar', investmentContext);
    expect(events[0].relocationImpact).toBeDefined();
    expect(events[0].relocationImpact.category).toBe('local_holdings');
    expect(events[0].relocationImpact.details).toBeDefined();

    constructorNoops.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });

    const webUIStub = {
      readEvents: jest.fn(() => events),
      updateStatusForRelocationImpacts: jest.fn(),
      eventAccordionManager: { refresh: jest.fn() },
      getValue: jest.fn(() => 'ar'),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      }
    };

    const manager = new EventsTableManager(webUIStub);
    manager.eventsTableBody = document.querySelector('#Events tbody');
    jest.spyOn(manager, '_afterResolutionAction').mockImplementation(() => {});

    manager.updateRelocationImpactIndicators(events);
    const badge = document.querySelector('.relocation-impact-badge');
    expect(badge).toBeTruthy();

    const panelSpy = jest.spyOn(RelocationImpactAssistant, 'createPanelHtml');
    manager.expandResolutionPanel('row-1');
    expect(panelSpy).toHaveBeenCalled();
    expect(panelSpy.mock.calls[0][1]).toBe('row-1');
    const panelMarkup = document.querySelector('.resolution-panel-row').innerHTML;
    expect(panelMarkup).toContain('data-row-id');
    const holdingsItems = document.querySelectorAll('.local-holdings-list li');
    expect(holdingsItems.length).toBeGreaterThan(0);
    expect(holdingsItems[0].textContent).toContain('Argentina Equity Fund');
    expect(holdingsItems[0].textContent).toContain('ARS');

    const actionSpy = jest.spyOn(RelocationImpactAssistant, 'handlePanelAction');
    const markSpy = jest.spyOn(manager, 'markAsReviewed').mockImplementation(() => {});
    const reviewButton = document.querySelector('.resolution-detail button[data-action="keep_holdings"]');
    expect(reviewButton).toBeTruthy();
    expect(reviewButton.getAttribute('data-row-id')).toBe('row-1');
    reviewButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(actionSpy).toHaveBeenCalled();
    expect(markSpy).toHaveBeenCalledWith('row-1');
  });
});









