const fs = require('fs');
const path = require('path');
require('../src/core/Utils.js');
const { EventsTableManager } = require('../src/frontend/web/components/EventsTableManager.js');
const { RelocationImpactDetector } = require('../src/frontend/web/components/RelocationImpactDetector.js');

function loadClass(relativePath, className) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
  return new Function(source + '\nreturn ' + className + ';')();
}

const serializeSimulation = loadClass('src/core/Utils.js', 'serializeSimulation');
const deserializeSimulation = loadClass('src/core/Utils.js', 'deserializeSimulation');
const LegacyScenarioAdapter = loadClass('src/core/LegacyScenarioAdapter.js', 'LegacyScenarioAdapter');
global.LegacyScenarioAdapter = LegacyScenarioAdapter;
global.serializeSimulation = serializeSimulation;
global.deserializeSimulation = deserializeSimulation;

const EventAccordionManager = loadClass('src/frontend/web/components/EventAccordionManager.js', 'EventAccordionManager');
const EventSummaryRenderer = loadClass('src/frontend/web/components/EventSummaryRenderer.js', 'EventSummaryRenderer');
const WizardRenderer = loadClass('src/frontend/web/components/WizardRenderer.js', 'WizardRenderer');
const UIManagerClass = loadClass('src/frontend/UIManager.js', 'UIManager');
const SimEventClass = loadClass('src/core/Events.js', 'SimEvent');
const RelocationUtils = loadClass('src/frontend/web/utils/RelocationUtils.js', 'RelocationUtils');
const FileManager = loadClass('src/frontend/web/components/FileManager.js', 'FileManager');

describe('MV relocation remediation', () => {
  const tableConstructorNoops = [
    'setupAddEventButton',
    'setupEventTableRowDelete',
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
      getLocaleSettings: () => ({ numberLocale: 'en-US', currencyCode: 'USD', currencySymbol: '$' }),
      formatCurrency: (v) => '$' + String(Math.round(Number(v) || 0)),
      formatPercentage: (v) => String(v)
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    delete global.uiManager;
    delete global.SimEvent;
    delete global.RelocationImpactDetector;
    document.body.innerHTML = '';
  });

  test('table non-MV -> MV transition clears stale destination and dropdown selection', () => {
    global.UIManager = UIManagerClass;
    global.Config = {
      getInstance: () => ({
        isRelocationEnabled: () => true,
        getStartCountry: () => 'ie',
        getAvailableCountries: () => [
          { code: 'IE', name: 'Ireland' },
          { code: 'US', name: 'United States' }
        ]
      })
    };

    tableConstructorNoops.forEach((method) => {
      jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
    });

    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-1" data-original-event-type="E">
            <td><input class="event-type" value="E"></td>
            <td>
              <input class="event-name" value="US">
              <div class="event-country-dd"><span id="EventCountryToggle_row-1" class="dd-toggle">United States</span></div>
            </td>
            <td><input class="event-amount" value=""></td>
            <td><input class="event-from-age" value="40"></td>
            <td><input class="event-to-age" value="40"></td>
            <td><div class="percentage-container"><input class="event-rate" value="2"></div></td>
            <td><div class="percentage-container"><input class="event-match" value=""></div></td>
          </tr>
        </tbody>
      </table>
    `;
    const row = document.querySelector('tr[data-row-id="row-1"]');
    const setOptionsSpy = jest.fn();
    row._eventCountryDropdown = { setOptions: setOptionsSpy };

    const webUIStub = {
      readEvents: jest.fn(() => []),
      getValue: jest.fn(() => ''),
      updateStatusForRelocationImpacts: jest.fn(),
      formatUtils: { setupCurrencyInputs: jest.fn(), setupPercentageInputs: jest.fn() }
    };
    const manager = new EventsTableManager(webUIStub);
    manager._scheduleRelocationReanalysis = jest.fn();
    manager.updateWizardIconsVisibility = jest.fn();

    manager.setupEventTypeChangeHandler();

    const typeInput = row.querySelector('.event-type');
    typeInput.value = 'MV';
    typeInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(row.querySelector('.event-name').value).toBe('');
    expect(row.querySelector('#EventCountryToggle_row-1').textContent).toBe('Select country');
    expect(row.querySelector('.event-rate').value).toBe('');
    expect(setOptionsSpy).toHaveBeenCalled();
    const optionsArg = setOptionsSpy.mock.calls[0][0] || [];
    expect(optionsArg.some((opt) => opt && opt.selected)).toBe(false);
  });

  test('UIManager marks relocation growth rate field hidden in table view', () => {
    const required = UIManagerClass.getRequiredFields('MV');
    expect(required.rate).toBe('hidden');
  });

  test('wizard selection uses wizard flow for relocation instead of direct row creation', () => {
    const manager = Object.create(EventsTableManager.prototype);
    manager.webUI = { eventsWizard: { manager: {} } };
    manager.startWizardForEventType = jest.fn();
    manager.addEventFromWizardWithSorting = jest.fn();
    manager.replaceEmptyRowWithEvent = jest.fn();
    manager.pendingEmptyRowForReplacement = document.createElement('tr');
    manager.viewMode = 'table';

    manager.createWizardSelectionModal([
      { eventType: 'MV', name: 'Relocation', category: 'relocation' }
    ], { fromAge: '45' });

    const relocationOption = document.querySelector('#wizardSelectionOverlay .wizard-selection-option[data-event-type="MV"]');
    expect(relocationOption).not.toBeNull();

    relocationOption.click();

    expect(manager.startWizardForEventType).toHaveBeenCalledWith('MV', { fromAge: '45' });
    expect(manager.replaceEmptyRowWithEvent).not.toHaveBeenCalled();
    expect(manager.addEventFromWizardWithSorting).not.toHaveBeenCalled();
    expect(document.getElementById('wizardSelectionOverlay')).toBeNull();
  });

  test('wizard country input renders select options and syncs destination code', () => {
    global.Config = {
      getInstance: () => ({
        getDefaultCountry: () => 'ie',
        getCachedTaxRuleSet: () => null,
        getAvailableCountries: () => [
          { code: 'IE', name: 'Ireland' },
          { code: 'US', name: 'United States' }
        ]
      })
    };

    const renderer = new WizardRenderer({});
    const wizardState = { data: {}, eventType: 'MV' };
    const step = {
      field: 'destCountryCode',
      content: {
        text: 'Which country are you relocating to?',
        inputType: 'country',
        placeholder: 'Select country'
      }
    };

    const content = renderer.renderInputContent(step, wizardState);
    const select = content.querySelector('#wizard-destCountryCode');

    expect(select).not.toBeNull();
    expect(select.tagName).toBe('SELECT');
    expect(select.options.length).toBe(3);

    select.value = 'US';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(wizardState.data.destCountryCode).toBe('US');
  });

  test('relocation cost currency label follows pre-move residence currency', () => {
    global.Config = {
      getInstance: () => ({
        getDefaultCountry: () => 'ie',
        getCachedTaxRuleSet: (code) => {
          const cc = String(code || '').toLowerCase();
          if (cc === 'ie') return { getCurrencyCode: () => 'EUR', getCurrencySymbol: () => 'EUR' };
          if (cc === 'us') return { getCurrencyCode: () => 'USD', getCurrencySymbol: () => '$' };
          if (cc === 'ar') return { getCurrencyCode: () => 'ARS', getCurrencySymbol: () => '$' };
          return null;
        }
      })
    };

    const renderer = new WizardRenderer({
      getValue: (key) => (key === 'StartCountry' ? 'IE' : ''),
      readEvents: () => [{ type: 'MV', name: 'US', fromAge: 45 }]
    });

    const beforeUsMove = renderer.processTextVariables(
      '{relocationCostCurrencyLabel}',
      { eventType: 'MV', data: { destCountryCode: 'AR', fromAge: 40 } }
    );
    const afterUsMove = renderer.processTextVariables(
      '{relocationCostCurrencyLabel}',
      { eventType: 'MV', data: { destCountryCode: 'AR', fromAge: 50 } }
    );

    expect(beforeUsMove).toBe('EUR (EUR)');
    expect(afterUsMove).toBe('USD ($)');
  });

  test('relocation wizard requires cost and instructs entering 0 when none', () => {
    global.WizardRenderer = WizardRenderer;
    global.WizardManager = class {};
    const EventsWizard = loadClass('src/frontend/web/components/EventsWizard.js', 'EventsWizard');

    const wizard = Object.create(EventsWizard.prototype);
    wizard.manager = {
      wizardState: {
        eventType: 'MV',
        data: {
          destCountryCode: 'US',
          amount: '',
          fromAge: '40'
        }
      }
    };

    global.ValidationUtils = {
      validateRequired: (value, fieldName) => {
        if (value === undefined || value === null || String(value).trim() === '') {
          return { isValid: false, message: fieldName + ' is required' };
        }
        return { isValid: true };
      },
      validateValue: () => 1,
      validateAgeRelationship: () => ({ isValid: true, message: '' })
    };

    const alertSpy = jest.spyOn(global, 'alert').mockImplementation(() => {});
    const isValid = wizard.validateWizardData();

    expect(isValid).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('0'));
  });

  test('accordion sync dispatches bubbling change events for type and name', () => {
    global.Config = {
      getInstance: () => ({
        getAvailableCountries: () => [
          { code: 'IE', name: 'Ireland' },
          { code: 'US', name: 'United States' }
        ]
      })
    };

    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          <tr data-row-id="row-1">
            <td>
              <input class="event-type" value="E">
              <span class="dd-toggle">Expense</span>
              <div class="visualization-dropdown">
                <div data-value="E" class="selected">Expense</div>
                <div data-value="MV">Relocation</div>
              </div>
            </td>
            <td>
              <input class="event-name" value="">
              <span id="EventCountryToggle_row-1">Select country</span>
            </td>
          </tr>
        </tbody>
      </table>
    `;
    const row = document.querySelector('tr[data-row-id="row-1"]');
    row._eventCountryDropdown = { setOptions: jest.fn() };

    const manager = Object.create(EventAccordionManager.prototype);
    manager.webUI = {
      eventsTableManager: {
        getEventTypeOptionObjects: () => [
          { value: 'E', label: 'Expense' },
          { value: 'MV', label: 'Relocation' }
        ],
        updateFieldVisibility: jest.fn(),
        applyTypeColouring: jest.fn()
      }
    };
    manager.findTableRowForEvent = () => row;

    let typeChanges = 0;
    let nameChanges = 0;
    row.querySelector('.event-type').addEventListener('change', () => { typeChanges += 1; });
    row.querySelector('.event-name').addEventListener('change', () => { nameChanges += 1; });

    manager.syncFieldToTableWithoutDefaults({ rowId: 'row-1' }, '.event-type', 'MV');
    manager.syncFieldToTableWithoutDefaults({ rowId: 'row-1' }, '.event-name', 'US');

    expect(typeChanges).toBe(1);
    expect(nameChanges).toBe(1);
    expect(row.querySelector('#EventCountryToggle_row-1').textContent).toBe('United States');
  });

  test('RelocationUtils ignores invalid MV destinations in transitions and overrides', () => {
    global.Config = {
      getInstance: () => ({
        isRelocationEnabled: () => true,
        getStartCountry: () => 'ie',
        getAvailableCountries: () => [
          { code: 'IE', name: 'Ireland' },
          { code: 'US', name: 'United States' }
        ]
      })
    };
    global.UIManager = class {
      constructor(ui) { this.ui = ui; }
      readEvents() { return this.ui._events; }
    };

    const webUI = {
      _events: [
        { type: 'MV', name: 'US', fromAge: 35, rate: 0.03 },
        { type: 'MV', name: 'ZZ', fromAge: 40, rate: 0.07 },
        { type: 'MV', name: '', fromAge: 45, rate: 0.09 }
      ]
    };
    const instance = {};

    RelocationUtils.extractRelocationTransitions(webUI, instance);

    expect(instance.relocationTransitions).toEqual([
      { age: 35, fromCountry: 'ie', toCountry: 'us' }
    ]);
    expect(instance.countryInflationOverrides).toEqual({ us: 0.03 });
  });

  test('RelocationImpactDetector timeline keeps only actionable MV rows', () => {
    global.Config = {
      getInstance: () => ({
        getAvailableCountries: () => [
          { code: 'IE', name: 'Ireland' },
          { code: 'US', name: 'United States' }
        ]
      })
    };

    const timeline = RelocationImpactDetector.buildRelocationTimeline([
      { id: 'mv-valid', type: 'MV', name: 'US', fromAge: 40 },
      { id: 'mv-invalid-country', type: 'MV', name: 'ZZ', fromAge: 45 },
      { id: 'mv-invalid-age', type: 'MV', name: 'US', fromAge: 'abc' }
    ]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0].id).toBe('mv-valid');
  });

  test('RelocationImpactDetector never assigns impact badges to relocation events', () => {
    const mvEvent = { type: 'MV', name: 'AR', fromAge: 40 };
    RelocationImpactDetector.addImpact(mvEvent, 'simple', 'Relocation impact', 'mv-id', false);
    expect(mvEvent.relocationImpact).toBeUndefined();
  });

  test('UI delete flow re-surfaces orphan sale and rental impacts after removing the relocation row', () => {
    jest.useFakeTimers();
    global.UIManager = UIManagerClass;
    global.SimEvent = SimEventClass;
    global.RelocationImpactDetector = RelocationImpactDetector;
    global.Config = {
      getInstance: () => ({
        isRelocationEnabled: () => true,
        getStartCountry: () => 'ie',
        getDefaultCountry: () => 'ie',
        getCountryNameByCode: (code) => {
          const normalized = String(code || '').toLowerCase();
          if (normalized === 'ie') return 'Ireland';
          if (normalized === 'ar') return 'Argentina';
          return normalized.toUpperCase();
        },
        getAvailableCountries: () => [
          { code: 'IE', name: 'Ireland' },
          { code: 'AR', name: 'Argentina' }
        ],
        getInvestmentBaseTypes: () => ([]),
        getCachedTaxRuleSet: (code) => {
          const normalized = String(code || '').toLowerCase();
          const currency = normalized === 'ar' ? 'ARS' : 'EUR';
          return {
            getCurrencyCode: () => currency,
            getPensionSystemType: () => 'mixed',
            getInflationRate: () => 0.02
          };
        },
        getEconomicData: () => null
      })
    };

    tableConstructorNoops
      .filter((method) => method !== 'setupEventTableRowDelete')
      .forEach((method) => {
        jest.spyOn(EventsTableManager.prototype, method).mockImplementation(() => {});
      });

    function renderRow(rowId, eventId, type, name, amount, fromAge, toAge, rate, match, extraInputs) {
      return `
        <tr data-row-id="${rowId}"${eventId ? ` data-event-id="${eventId}"` : ''}>
          <td>
            <div class="event-type-container">
              <div class="event-type-dd visualization-control"><span class="dd-toggle pseudo-select">${type}</span></div>
              <input class="event-type" value="${type}" />
              ${extraInputs || ''}
            </div>
          </td>
          <td><input class="event-name" value="${name || ''}" /></td>
          <td><input class="event-amount" value="${amount || ''}" /></td>
          <td><input class="event-from-age" value="${fromAge || ''}" /></td>
          <td><input class="event-to-age" value="${toAge || ''}" /></td>
          <td><input class="event-rate" value="${rate || ''}" /></td>
          <td><input class="event-match" value="${match || ''}" /></td>
          <td><button class="delete-event" type="button">Delete</button></td>
        </tr>
      `;
    }

    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          ${renderRow(
            'row-r1',
            '',
            'R',
            'Family House',
            '40000',
            '35',
            '65',
            '',
            '',
            '<input type="hidden" class="event-linked-country" value="ie" />' +
              '<input type="hidden" class="event-country" value="ie" />' +
              '<input type="hidden" class="event-currency" value="EUR" />' +
              '<input type="hidden" class="event-resolution-override" value="1" />' +
              '<input type="hidden" class="event-resolution-mv-id" value="mvlink_demo_ar_40" />' +
              '<input type="hidden" class="event-resolution-category" value="boundary" />'
          )}
          ${renderRow(
            'row-m1',
            '',
            'M',
            'Family House',
            '18000',
            '35',
            '39',
            '0.035',
            '',
            '<input type="hidden" class="event-relocation-sell-mv-id" value="mvlink_demo_ar_40" />' +
              '<input type="hidden" class="event-relocation-sell-anchor-age" value="40" />' +
              '<input type="hidden" class="event-mortgage-term" value="25" />'
          )}
          ${renderRow(
            'row-mp1',
            '',
            'MP',
            'Family House',
            '9999',
            '39',
            '39',
            '',
            '',
            '<input type="hidden" class="event-relocation-sell-mv-id" value="mvlink_demo_ar_40" />' +
              '<input type="hidden" class="event-relocation-sell-anchor-age" value="40" />'
          )}
          ${renderRow(
            'row-ri1',
            '',
            'RI',
            'Family House',
            '1600',
            '40',
            '65',
            '',
            '',
            '<input type="hidden" class="event-linked-country" value="ie" />' +
              '<input type="hidden" class="event-country" value="ie" />' +
              '<input type="hidden" class="event-currency" value="EUR" />' +
              '<input type="hidden" class="event-relocation-rent-mv-id" value="mvlink_demo_ar_40" />'
          )}
          ${renderRow(
            'row-mv',
            'mv-runtime-1',
            'MV',
            'AR',
            '',
            '40',
            '40',
            '',
            '',
            '<input type="hidden" class="event-relocation-link-id" value="mvlink_demo_ar_40" />'
          )}
        </tbody>
      </table>
    `;

    const uiStub = {
      clearAllWarnings: jest.fn(),
      clearElementWarning: jest.fn(),
      setWarning: jest.fn(),
      getValue: jest.fn((key) => {
        if (key === 'simulation_mode') return 'single';
        if (key === 'StartingAge') return '30';
        if (key === 'P2StartingAge') return '';
        return '';
      }),
      getTableData: jest.fn(() => {
        return Array.from(document.querySelectorAll('#Events tbody tr'))
          .filter((row) => row && row.style.display !== 'none' && !(row.classList && row.classList.contains('resolution-panel-row')))
          .map((row) => {
            const type = row.querySelector('.event-type') ? row.querySelector('.event-type').value : '';
            const name = row.querySelector('.event-name') ? row.querySelector('.event-name').value : '';
            const amount = row.querySelector('.event-amount') ? row.querySelector('.event-amount').value : '';
            const fromAge = row.querySelector('.event-from-age') ? row.querySelector('.event-from-age').value : '';
            const toAge = row.querySelector('.event-to-age') ? row.querySelector('.event-to-age').value : '';
            const rate = row.querySelector('.event-rate') ? row.querySelector('.event-rate').value : '';
            const match = row.querySelector('.event-match') ? row.querySelector('.event-match').value : '';
            return [`${type}:${name}`, amount, fromAge, toAge, rate, match];
          });
      })
    };

    const uiMgr = new UIManagerClass(uiStub);
    global.uiManager = uiMgr;

    const webUIStub = {
      uiManager: uiMgr,
      readEvents: uiMgr.readEvents.bind(uiMgr),
      clearAllWarnings: jest.fn(),
      getValue: uiStub.getValue,
      updateStatusForRelocationImpacts: jest.fn(),
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      },
      eventAccordionManager: null,
      chartManager: null,
      tableManager: null
    };

    const manager = new EventsTableManager(webUIStub);
    webUIStub.eventsTableManager = manager;
    uiStub.eventsTableManager = manager;
    jest.spyOn(manager, '_refreshValidation').mockImplementation(() => {});

    const deleteButton = document.querySelector('tr[data-row-id="row-mv"] .delete-event');
    deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    jest.advanceTimersByTime(650);

    const propertyRow = document.querySelector('tr[data-row-id="row-r1"]');
    const mortgageRow = document.querySelector('tr[data-row-id="row-m1"]');
    const payoffRow = document.querySelector('tr[data-row-id="row-mp1"]');
    const rentalRow = document.querySelector('tr[data-row-id="row-ri1"]');

    expect(document.querySelector('tr[data-row-id="row-mv"]')).toBeNull();
    expect(propertyRow.dataset.relocationImpact).toBe('1');
    expect(propertyRow.dataset.relocationImpactCategory).toBe('sale_marker_orphan');
    expect(mortgageRow.dataset.relocationImpactCategory).toBe('sale_marker_orphan');
    expect(payoffRow.dataset.relocationImpactCategory).toBe('sale_marker_orphan');
    expect(rentalRow.dataset.relocationImpactCategory).toBe('simple');
    expect(propertyRow.querySelector('.relocation-impact-badge')).not.toBeNull();
    expect(mortgageRow.querySelector('.relocation-impact-badge')).not.toBeNull();
    expect(payoffRow.querySelector('.relocation-impact-badge')).not.toBeNull();
    expect(rentalRow.querySelector('.relocation-impact-badge')).not.toBeNull();

    delete global.uiManager;
    jest.useRealTimers();
  });

  test('save/load round-trip preserves orphan sale and rental marker impacts after the relocation row is gone', async () => {
    global.UIManager = UIManagerClass;
    global.SimEvent = SimEventClass;
    global.RelocationImpactDetector = RelocationImpactDetector;
    global.Config = {
      getInstance: () => ({
        isRelocationEnabled: () => true,
        getStartCountry: () => 'ie',
        getDefaultCountry: () => 'ie',
        getCountryNameByCode: (code) => {
          const normalized = String(code || '').toLowerCase();
          if (normalized === 'ie') return 'Ireland';
          if (normalized === 'ar') return 'Argentina';
          return normalized.toUpperCase();
        },
        getAvailableCountries: () => [
          { code: 'IE', name: 'Ireland' },
          { code: 'AR', name: 'Argentina' }
        ],
        getInvestmentBaseTypes: () => ([]),
        getCachedTaxRuleSet: (code) => {
          const normalized = String(code || '').toLowerCase();
          const currency = normalized === 'ar' ? 'ARS' : 'EUR';
          return {
            getCurrencyCode: () => currency,
            getResolvedInvestmentTypes: () => [],
            hasPrivatePensions: () => true,
            getPensionSystemType: () => 'mixed',
            getInflationRate: () => 0.02
          };
        },
        getTaxRuleSet: jest.fn(async (code) => {
          return global.Config.getInstance().getCachedTaxRuleSet(code);
        }),
        listCachedRuleSets: () => ({
          ie: global.Config.getInstance().getCachedTaxRuleSet('ie'),
          ar: global.Config.getInstance().getCachedTaxRuleSet('ar')
        }),
        syncTaxRuleSetsWithEvents: jest.fn(async () => ({ failed: [] })),
        getEconomicData: () => null
      })
    };

    function renderSourceRow(rowId, type, name, amount, fromAge, toAge, rate, match, extraInputs, datasetAttrs) {
      return `
        <tr data-row-id="${rowId}"${datasetAttrs || ''}>
          <td><input class="event-type" value="${type}" /></td>
          <td><input class="event-name" value="${name || ''}" /></td>
          <td><input class="event-amount" value="${amount || ''}" /></td>
          <td><input class="event-from-age" value="${fromAge || ''}" /></td>
          <td><input class="event-to-age" value="${toAge || ''}" /></td>
          <td><input class="event-rate" value="${rate || ''}" /></td>
          <td><input class="event-match" value="${match || ''}" /></td>
          ${extraInputs || ''}
        </tr>
      `;
    }

    document.body.innerHTML = `
      <table id="Events">
        <tbody>
          ${renderSourceRow(
            'row-r1',
            'R',
            'Family House',
            '40000',
            '35',
            '65',
            '',
            '',
            '<input type="hidden" class="event-linked-country" value="ie" />' +
              '<input type="hidden" class="event-country" value="ie" />' +
              '<input type="hidden" class="event-currency" value="EUR" />' +
              '<input type="hidden" class="event-resolution-override" value="1" />' +
              '<input type="hidden" class="event-resolution-mv-id" value="mvlink_demo_ar_40" />' +
              '<input type="hidden" class="event-resolution-category" value="boundary" />',
            ' data-relocation-impact="1" data-relocation-impact-category="sale_marker_orphan"'
          )}
          ${renderSourceRow(
            'row-m1',
            'M',
            'Family House',
            '18000',
            '35',
            '39',
            '0.035',
            '',
            '<input type="hidden" class="event-relocation-sell-mv-id" value="mvlink_demo_ar_40" />' +
              '<input type="hidden" class="event-relocation-sell-anchor-age" value="40" />' +
              '<input type="hidden" class="event-mortgage-term" value="25" />',
            ' data-relocation-impact="1" data-relocation-impact-category="sale_marker_orphan"'
          )}
          ${renderSourceRow(
            'row-mp1',
            'MP',
            'Family House',
            '9999',
            '39',
            '39',
            '',
            '',
            '<input type="hidden" class="event-relocation-sell-mv-id" value="mvlink_demo_ar_40" />' +
              '<input type="hidden" class="event-relocation-sell-anchor-age" value="40" />',
            ' data-relocation-impact="1" data-relocation-impact-category="sale_marker_orphan"'
          )}
          ${renderSourceRow(
            'row-ri1',
            'RI',
            'Family House',
            '1600',
            '40',
            '65',
            '',
            '',
            '<input type="hidden" class="event-linked-country" value="ie" />' +
              '<input type="hidden" class="event-country" value="ie" />' +
              '<input type="hidden" class="event-currency" value="EUR" />' +
              '<input type="hidden" class="event-relocation-rent-mv-id" value="mvlink_demo_ar_40" />',
            ' data-relocation-impact="1" data-relocation-impact-category="simple"'
          )}
          ${renderSourceRow(
            'row-safe',
            'E',
            'Safe Expense',
            '500',
            '30',
            '31',
            '',
            '',
            '',
            ''
          )}
        </tbody>
      </table>
    `;

    const sourceUi = {
      getVersion: () => '2.1',
      getValue: (key) => {
        if (key === 'StartCountry') return 'ie';
        if (key === 'simulation_mode') return 'single';
        if (key === 'economy_mode') return 'deterministic';
        if (key === 'StartingAge') return '30';
        if (key === 'P2StartingAge') return '';
        return '';
      },
      isPercentage: () => false,
      isBoolean: () => false,
      getTableData: () => ([
        ['R:Family House', '40000', '35', '65', '', ''],
        ['M:Family House', '18000', '35', '39', '0.035', ''],
        ['MP:Family House', '9999', '39', '39', '', ''],
        ['RI:Family House', '1600', '40', '65', '', ''],
        ['E:Safe Expense', '500', '30', '31', '', '']
      ])
    };

    const csv = serializeSimulation(sourceUi);
    expect(csv).toContain('SellMvId');
    expect(csv).toContain('mvlink_demo_ar_40');

    document.body.innerHTML = `
      <div class="parameters-section">
        <input id="StartCountry" value="">
        <input id="simulation_mode" value="">
        <input id="economy_mode" value="">
        <input id="StartingAge" value="">
        <input id="P2StartingAge" value="">
      </div>
      <table id="Events"><tbody></tbody></table>
    `;

    let created = 0;
    const state = {};
    const webUIStub = {
      chartManager: {
        reportingCurrency: null,
        setupChartCurrencyControls: jest.fn(),
        clearExtraChartRows: jest.fn()
      },
      tableManager: {
        reportingCurrency: null,
        setupTableCurrencyControls: jest.fn(),
        clearContent: jest.fn(),
        clearExtraDataRows: jest.fn(),
        setDataRow: jest.fn()
      },
      eventsTableManager: {
        eventRowCounter: 0,
        handleAgeYearToggle: jest.fn(),
        createEventRow: (type, name, amount, fromAge, toAge, rate, match) => {
          const tr = document.createElement('tr');
          created += 1;
          tr.dataset.rowId = 'loaded-' + created;
          tr.innerHTML = `
            <td><input class="event-type" value="${type || ''}"></td>
            <td><input class="event-name" value="${name || ''}"></td>
            <td><input class="event-amount" value="${amount || ''}"></td>
            <td><input class="event-from-age" value="${fromAge || ''}"></td>
            <td><input class="event-to-age" value="${toAge || ''}"></td>
            <td><input class="event-rate" value="${rate || ''}"></td>
            <td><input class="event-match" value="${match || ''}"></td>
          `;
          return tr;
        },
        getOrCreateHiddenInput: (row, className, value) => {
          let el = row.querySelector('.' + className);
          if (!el) {
            el = document.createElement('input');
            el.className = className;
            row.appendChild(el);
          }
          el.value = value;
          return el;
        },
        updateEventRowsVisibilityAndTypes: jest.fn(),
        updateRelocationImpactIndicators: jest.fn((events) => {
          const rows = Array.from(document.querySelectorAll('#Events tbody tr'));
          rows.forEach((row, index) => {
            const event = events[index];
            delete row.dataset.relocationImpact;
            delete row.dataset.relocationImpactCategory;
            delete row.dataset.relocationImpactMvId;
            if (event && event.relocationImpact) {
              row.dataset.relocationImpact = '1';
              row.dataset.relocationImpactCategory = event.relocationImpact.category || '';
              row.dataset.relocationImpactMvId = event.relocationImpact.mvEventId || '';
            }
          });
        }),
        clearRelocationResolutionToastSuppression: jest.fn(),
        suppressRelocationResolutionToastOnce: jest.fn()
      },
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      },
      dragAndDrop: {
        renderPriorities: jest.fn(async () => {})
      },
      eventAccordionManager: null,
      clearAllWarnings: jest.fn(),
      setValue: jest.fn((key, value) => {
        state[key] = value;
        const el = document.getElementById(key);
        if (el) el.value = value;
      }),
      getValue: jest.fn((key) => {
        const el = document.getElementById(key);
        if (el) return el.value;
        return state[key] || '';
      }),
      getTableData: jest.fn(() => {
        return Array.from(document.querySelectorAll('#Events tbody tr'))
          .filter((row) => row && !(row.classList && row.classList.contains('resolution-panel-row')))
          .map((row) => {
            const type = row.querySelector('.event-type') ? row.querySelector('.event-type').value : '';
            const name = row.querySelector('.event-name') ? row.querySelector('.event-name').value : '';
            const amount = row.querySelector('.event-amount') ? row.querySelector('.event-amount').value : '';
            const fromAge = row.querySelector('.event-from-age') ? row.querySelector('.event-from-age').value : '';
            const toAge = row.querySelector('.event-to-age') ? row.querySelector('.event-to-age').value : '';
            const rate = row.querySelector('.event-rate') ? row.querySelector('.event-rate').value : '';
            const match = row.querySelector('.event-match') ? row.querySelector('.event-match').value : '';
            return [`${type}:${name}`, amount, fromAge, toAge, rate, match];
          });
      }),
      setStatus: jest.fn(),
      readEvents: null,
      updateStatusForRelocationImpacts: jest.fn()
    };

    const uiMgr = new UIManagerClass(webUIStub);
    webUIStub.readEvents = uiMgr.readEvents.bind(uiMgr);
    global.uiManager = uiMgr;

    const fm = new FileManager(webUIStub);
    const loaded = await fm.loadFromString(csv, 'orphan-save-load');

    expect(loaded).toBe(true);

    const rows = Array.from(document.querySelectorAll('#Events tbody tr'));
    expect(rows).toHaveLength(5);

    expect(rows[0].dataset.relocationImpactCategory).toBe('sale_marker_orphan');
    expect(rows[1].dataset.relocationImpactCategory).toBe('sale_marker_orphan');
    expect(rows[2].dataset.relocationImpactCategory).toBe('sale_marker_orphan');
    expect(rows[3].dataset.relocationImpactCategory).toBe('simple');
    expect(rows[4].dataset.relocationImpactCategory || '').toBe('');

    expect(rows[1].querySelector('.event-relocation-sell-mv-id').value).toBe('mvlink_demo_ar_40');
    expect(rows[2].querySelector('.event-relocation-sell-mv-id').value).toBe('mvlink_demo_ar_40');
    expect(rows[3].querySelector('.event-relocation-rent-mv-id').value).toBe('mvlink_demo_ar_40');

    delete global.uiManager;
  });

  test('wizard event creation reuses addEventRow flow instead of constructing rows directly', async () => {
    const manager = Object.create(EventsTableManager.prototype);
    const row = document.createElement('tr');
    row.dataset.eventId = 'event-1';
    manager.addEventRow = jest.fn(() => ({ row, id: 'event-1' }));
    manager.populateRowFromWizardData = jest.fn(async () => {});

    const result = await manager.createEventFromWizard({ eventType: 'MV', amount: 0, fromAge: '40', name: 'AR' });

    expect(manager.addEventRow).toHaveBeenCalled();
    expect(manager.populateRowFromWizardData).toHaveBeenCalledWith(row, { eventType: 'MV', amount: 0, fromAge: '40', name: 'AR' });
    expect(result).toEqual({ row, id: 'event-1' });
  });

  test('FileManager preload country derivation ignores invalid MV destination rows', async () => {
    let cachedRuleSets = {
      ie: {
        hasPrivatePensions: () => true,
        getResolvedInvestmentTypes: () => [],
        getCurrencyCode: () => 'EUR'
      }
    };
    const getTaxRuleSet = jest.fn(async (country) => {
      const code = String(country || '').toLowerCase();
      if (code === 'us') {
        cachedRuleSets.us = {
          hasPrivatePensions: () => true,
          getResolvedInvestmentTypes: () => [],
          getCurrencyCode: () => 'USD'
        };
        return cachedRuleSets.us;
      }
      if (code === 'ie') return cachedRuleSets.ie;
      throw new Error('Unexpected ruleset load: ' + code);
    });

    global.Config = {
      getInstance: () => ({
        isRelocationEnabled: () => true,
        getStartCountry: () => 'ie',
        getDefaultCountry: () => 'ie',
        getAvailableCountries: () => [
          { code: 'IE', name: 'Ireland' },
          { code: 'US', name: 'United States' }
        ],
        getCachedTaxRuleSet: (code) => cachedRuleSets[String(code || '').toLowerCase()] || null,
        getTaxRuleSet: getTaxRuleSet,
        syncTaxRuleSetsWithEvents: jest.fn(async () => ({ failed: [] })),
        listCachedRuleSets: () => cachedRuleSets
      })
    };

    global.deserializeSimulation = jest.fn(() => [
      ['MV', 'US', '', '40', '', '', '', ''],
      ['MV', 'ZZ', '', '50', '', '', '', '']
    ]);
    global.UIManager = class {
      constructor(ui) { this.ui = ui; }
      readEvents() { return []; }
    };
    global.RelocationImpactDetector = { analyzeEvents: jest.fn() };

    document.body.innerHTML = `
      <div class="parameters-section"><input id="p1"></div>
      <table id="Events"><tbody></tbody></table>
    `;

    let created = 0;
    const webUIStub = {
      chartManager: {
        reportingCurrency: null,
        setupChartCurrencyControls: jest.fn(),
        clearExtraChartRows: jest.fn(),
        refreshChartsWithCurrency: jest.fn()
      },
      tableManager: {
        reportingCurrency: null,
        setupTableCurrencyControls: jest.fn(),
        clearContent: jest.fn(),
        clearExtraDataRows: jest.fn(),
        setDataRow: jest.fn()
      },
      eventsTableManager: {
        eventRowCounter: 0,
        handleAgeYearToggle: jest.fn(),
        createEventRow: (type, name, amount, fromAge, toAge, rate, match) => {
          const tr = document.createElement('tr');
          created += 1;
          tr.dataset.rowId = 'row-' + created;
          tr.innerHTML = `
            <td><input class="event-type" value="${type || ''}"></td>
            <td><input class="event-name" value="${name || ''}"></td>
            <td><input class="event-amount" value="${amount || ''}"></td>
            <td><input class="event-from-age" value="${fromAge || ''}"></td>
            <td><input class="event-to-age" value="${toAge || ''}"></td>
            <td><input class="event-rate" value="${rate || ''}"></td>
            <td><input class="event-match" value="${match || ''}"></td>
          `;
          return tr;
        },
        getOrCreateHiddenInput: (row, className, value) => {
          let el = row.querySelector('.' + className);
          if (!el) {
            el = document.createElement('input');
            el.className = className;
            row.appendChild(el);
          }
          el.value = value;
          return el;
        },
        updateEventRowsVisibilityAndTypes: jest.fn(),
        updateRelocationImpactIndicators: jest.fn()
      },
      formatUtils: {
        setupCurrencyInputs: jest.fn(),
        setupPercentageInputs: jest.fn()
      },
      dragAndDrop: {
        renderPriorities: jest.fn(async () => {})
      },
      eventAccordionManager: null,
      clearAllWarnings: jest.fn(),
      setValue: jest.fn(),
      setStatus: jest.fn(),
      readEvents: jest.fn(() => []),
      updateStatusForRelocationImpacts: jest.fn()
    };

    const fm = new FileManager(webUIStub);
    await fm.loadFromString('csv-content', 'scenario');

    const calledCodes = getTaxRuleSet.mock.calls.map((args) => String(args[0] || '').toLowerCase());
    expect(calledCodes).toContain('us');
    expect(calledCodes).not.toContain('zz');
  });

  test('EventSummaryRenderer shows relocation country name (not raw code) in collapsed summary', () => {
    global.Config = {
      getInstance: () => ({
        getAvailableCountries: () => [
          { code: 'IE', name: 'Ireland' },
          { code: 'US', name: 'United States' }
        ]
      })
    };
    global.FieldLabelsManager = {
      getInstance: () => ({
        getFieldLabel: () => '',
        getFieldPlaceholder: () => ''
      })
    };

    const renderer = new EventSummaryRenderer({
      eventsTableManager: {
        ageYearMode: 'age',
        getEventTypeOptionObjects: () => [{ value: 'MV', label: 'Relocation' }]
      }
    });

    const html = renderer.generateSummary({
      type: 'MV',
      name: 'US',
      amount: '',
      fromAge: '40',
      toAge: '40'
    });

    expect(html).toContain('event-type-badge">United States');
    expect(html).not.toContain('event-type-badge">US<');
  });

  test('EventSummaryRenderer hides relocation growth-rate field in detailed cards view', () => {
    global.Config = {
      getInstance: () => ({
        getAvailableCountries: () => [
          { code: 'IE', name: 'Ireland' },
          { code: 'US', name: 'United States' }
        ]
      })
    };
    global.FieldLabelsManager = {
      getInstance: () => ({
        getFieldLabel: () => '',
        getFieldPlaceholder: () => ''
      })
    };

    const renderer = new EventSummaryRenderer({
      eventsTableManager: {
        ageYearMode: 'age',
        getEventTypeOptionObjects: () => [{ value: 'MV', label: 'Relocation' }]
      }
    });

    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderer.generateDetailedSummary({
      type: 'MV',
      rowId: 'row-1',
      accordionId: 'accordion-item-1',
      name: 'US',
      amount: '0',
      fromAge: '40',
      toAge: '40',
      rate: '2',
      match: ''
    });

    const rateInput = wrapper.querySelector('.accordion-edit-rate');
    expect(rateInput).not.toBeNull();
    expect(rateInput.closest('.detail-row').style.display).toBe('none');
  });
});
