const fs = require('fs');
const path = require('path');
require('../src/core/Utils.js');
const { EventsTableManager } = require('../src/frontend/web/components/EventsTableManager.js');
const { RelocationImpactDetector } = require('../src/frontend/web/components/RelocationImpactDetector.js');

function loadClass(relativePath, className) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
  return new Function(source + '\nreturn ' + className + ';')();
}

const EventAccordionManager = loadClass('src/frontend/web/components/EventAccordionManager.js', 'EventAccordionManager');
const EventSummaryRenderer = loadClass('src/frontend/web/components/EventSummaryRenderer.js', 'EventSummaryRenderer');
const WizardRenderer = loadClass('src/frontend/web/components/WizardRenderer.js', 'WizardRenderer');
const UIManagerClass = loadClass('src/frontend/UIManager.js', 'UIManager');
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
    RelocationImpactDetector.addImpact(mvEvent, 'missing_ruleset', 'Missing tax rules', 'mv-id', false);
    expect(mvEvent.relocationImpact).toBeUndefined();
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
