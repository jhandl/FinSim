const fs = require('fs');
const path = require('path');

// Mocks
global.AbstractUI = class {};
global.FormatUtils = class { 
  setupPercentageInputs() {} 
  setupCurrencyInputs() {}
};
global.NotificationUtils = class { setStatus() {} setErrorModalUtils() {} };
global.ErrorModalUtils = class {};
global.FieldLabelsManager = class { static getInstance() { return {}; } };
global.ChartManager = class {};
global.TableManager = class {};
global.FileManager = class {};
global.EventsTableManager = class { updateEventRowsVisibilityAndTypes() {} };
global.EventAccordionManager = class {};
global.EventsWizard = class {};
global.DragAndDrop = class {};
global.WelcomeModal = class {};
global.CountryTabSyncManager = class { static getInstance() { return { addSyncStateListener: () => {}, getSelectedCountry: () => 'ie', setSelectedCountry: () => {} }; } };
global.DOMUtils = { getValue: () => {}, setValue: () => {} };
global.STATUS_COLORS = { INFO: 'info' };
global.runs = 1000;
global.RelocationUtils = { extractRelocationTransitions: () => {} };
global.Wizard = class { static getInstance() {} };
global.DropdownUtils = { create: () => {} };
global.TooltipUtils = { attachTooltip: () => {} };
global.CountryChipSelector = class { render() {} };
global.RelocationImpactDetector = class {};
global.RelocationImpactAssistant = class {};
global.IntroJs = class {};

// Mock Config
const defaultRuleset = () => ({
  getResolvedInvestmentTypes: () => [],
  findInvestmentTypeByKey: () => null,
  hasPrivatePensions: () => true
});

const mockConfig = {
  getInvestmentBaseTypes: jest.fn(() => []),
  isRelocationEnabled: jest.fn(() => false),
  getStartCountry: jest.fn(() => 'IE'),
  getCountryNameByCode: jest.fn(() => 'Ireland'),
  getCachedTaxRuleSet: jest.fn(() => defaultRuleset()),
  getTaxRuleSet: jest.fn(async () => defaultRuleset()),
  getDefaultCountry: jest.fn(() => 'IE')
};
global.Config = {
  getInstance: () => mockConfig
};

// Load WebUI source
const webUIPath = path.resolve(__dirname, '../src/frontend/web/WebUI.js');
const webUISource = fs.readFileSync(webUIPath, 'utf8');

// Evaluate WebUI source in global context
// We wrap it in a function to avoid variable collisions but WebUI needs to land in global
eval(webUISource);

describe('WebUI.renderInvestmentParameterFields', () => {
  let webUI;
  let stash;
  
  beforeEach(() => {
    mockConfig.getInvestmentBaseTypes.mockReturnValue([]);
    mockConfig.isRelocationEnabled.mockReturnValue(false);
    mockConfig.getStartCountry.mockReturnValue('IE');
    mockConfig.getCountryNameByCode.mockReturnValue('Ireland');
    mockConfig.getCachedTaxRuleSet.mockImplementation(() => defaultRuleset());
    mockConfig.getTaxRuleSet.mockImplementation(async () => defaultRuleset());
    mockConfig.getDefaultCountry.mockReturnValue('IE');

    document.body.innerHTML = `
      <div id="hidden-parameter-stash"></div>
      <div id="startingPosition">
        <div class="input-group">
          <div class="input-wrapper">
            <label for="InitialPension">Your Pension Fund</label>
            <input id="InitialPension" class="currency">
          </div>
          <div class="input-wrapper">
            <label for="InitialPensionP2">Their Pension Fund</label>
            <input id="InitialPensionP2" class="currency">
          </div>
        </div>
      </div>
      <div id="growthRates"><table class="growth-rates-table"><tbody></tbody></table></div>
      <div id="Allocations"><div class="input-group"></div></div>
      <button id="runSimulation"></button>
      <button id="runSimulationMobile"></button>
      <button id="loadDemoScenarioHeader"></button>
      <button id="exportDataCSV"></button>
      <div id="progress"></div>
      <div id="progressMobile"></div>
      <span class="version"></span>
    `;
    stash = document.getElementById('hidden-parameter-stash');
    
    // Instantiate WebUI (WebUI class should be available globally after eval)
    webUI = new WebUI();
    
    // Spy on internal methods
    const inputs = {};
    webUI._takeOrCreateInput = jest.fn((id, type) => {
      if (inputs[id]) return inputs[id];
      const existing = document.getElementById(id);
      if (existing) {
        inputs[id] = existing;
        return existing;
      }
      const el = document.createElement('input');
      el.id = id;
      inputs[id] = el;
      return el;
    });
    webUI._stashInputElement = jest.fn((el) => {
      stash.appendChild(el);
    });
    webUI.dragAndDrop = { renderPriorities: jest.fn(async () => {}) };
    webUI.refreshCountryChipsFromScenario = jest.fn();
    webUI.hasRelocationEvents = jest.fn(() => false);
    webUI.hasEffectiveRelocationEvents = jest.fn(() => false);
    webUI.getScenarioCountries = jest.fn(() => ['ie']);
  });

  test('skips wrapper-level inputs for investment types with baseRef', () => {
    const types = [
      { key: 'localInv_ie', label: 'Local', residenceScope: 'local' }, // Should create inputs
      { key: 'wrapperInv_ie', label: 'Wrapper', baseRef: 'globalEquity', residenceScope: 'local' } // Should SKIP inputs
    ];
    
    webUI.renderInvestmentParameterFields(types);
    
    // Verify localInv inputs created
    expect(webUI._takeOrCreateInput).toHaveBeenCalledWith('LocalAssetGrowth_ie_localInv', 'percentage');
    expect(webUI._takeOrCreateInput).toHaveBeenCalledWith('LocalAssetVolatility_ie_localInv', 'percentage');
    
    // Verify wrapperInv inputs NOT created
    expect(webUI._takeOrCreateInput).not.toHaveBeenCalledWith('LocalAssetGrowth_ie_wrapperInv', 'percentage');
    expect(webUI._takeOrCreateInput).not.toHaveBeenCalledWith('LocalAssetVolatility_ie_wrapperInv', 'percentage');
  });

  test('creates wrapper-level inputs for local investments', () => {
     const types = [
      { key: 'cedear_ie', label: 'CEDEARs', assetCountry: 'ie', residenceScope: 'local' } 
    ];
    
    webUI.renderInvestmentParameterFields(types);

    expect(webUI._takeOrCreateInput).toHaveBeenCalledWith('LocalAssetGrowth_ie_cedear', 'percentage');
    expect(webUI._takeOrCreateInput).toHaveBeenCalledWith('LocalAssetVolatility_ie_cedear', 'percentage');
  });

  test('handles mixed list of types correctly', () => {
     const types = [
      { key: 'cedear_ie', label: 'CEDEARs', assetCountry: 'ie', residenceScope: 'local' },
      { key: 'indexFunds_ie', label: 'Index Funds', baseRef: 'globalEquity', assetCountry: 'ie', residenceScope: 'local' }
    ];
    
    webUI.renderInvestmentParameterFields(types);

    // Local: Yes
    expect(webUI._takeOrCreateInput).toHaveBeenCalledWith('LocalAssetGrowth_ie_cedear', 'percentage');
    expect(webUI._takeOrCreateInput).toHaveBeenCalledWith('LocalAssetVolatility_ie_cedear', 'percentage');

    // Wrapper: No
    expect(webUI._takeOrCreateInput).not.toHaveBeenCalledWith('LocalAssetGrowth_ie_indexFunds', 'percentage');
    expect(webUI._takeOrCreateInput).not.toHaveBeenCalledWith('LocalAssetVolatility_ie_indexFunds', 'percentage');
  });

  test('filters out inheriting wrappers from per-country growth rates table', () => {
    // Setup scenario with multiple countries and mixed investment types
    mockConfig.isRelocationEnabled.mockReturnValue(true);
    webUI.hasEffectiveRelocationEvents.mockReturnValue(true);
    webUI.getScenarioCountries = jest.fn(() => ['ie', 'ar']);
    
    const ieTypes = [
      { key: 'localInv_ie', label: 'Local IE', residenceScope: 'local' },
      { key: 'wrapper_ie', label: 'Wrapper IE', residenceScope: 'local', baseRef: 'globalEquity' }
    ];
    
    const arTypes = [
      { key: 'localInv_ar', label: 'Local AR', residenceScope: 'local' }
    ];
    
    mockConfig.getCachedTaxRuleSet.mockImplementation((code) => {
      if (code === 'ie') return { getResolvedInvestmentTypes: () => ieTypes };
      if (code === 'ar') return { getResolvedInvestmentTypes: () => arTypes };
      return { getResolvedInvestmentTypes: () => [] };
    });

    webUI.renderInvestmentParameterFields([]); // Pass empty array for top-level types to focus on per-country table
    
    const tbody = document.querySelector('.growth-rates-table tbody');
    const rows = Array.from(tbody.querySelectorAll('tr[data-country-growth-row="true"]'));
    
    const rowIds = rows.map(r => r.querySelector('input').id);
    
    // Should include pure local types
    expect(rowIds).toContain('LocalAssetGrowth_ie_localInv');
    expect(rowIds).toContain('LocalAssetGrowth_ar_localInv');
    
    // Should NOT include inheriting wrapper
    expect(rowIds).not.toContain('LocalAssetGrowth_ie_wrapper');
  });

  test('renders local investment types in economy table when relocation disabled', () => {
    // Setup
    mockConfig.isRelocationEnabled.mockReturnValue(false);
    webUI.hasEffectiveRelocationEvents.mockReturnValue(false);

    const types = [
      { key: 'localInv_ie', label: 'Local', residenceScope: 'local' }
    ];

    webUI.renderInvestmentParameterFields(types);

    const tbody = document.querySelector('.growth-rates-table tbody');
    // Check for row containing canonical LocalAssetGrowth id
    const input = document.getElementById('LocalAssetGrowth_ie_localInv');
    expect(input).not.toBeNull();
    // Verify it is inside the table
    const tr = input.closest('tr');
    expect(tr).not.toBeNull();
    expect(tbody.contains(tr)).toBe(true);
    // Verify it is visible (not display: none)
    expect(tr.style.display).not.toBe('none');
  });

  test('renders inflation row as last row in single-country mode', () => {
    mockConfig.isRelocationEnabled.mockReturnValue(false);
    webUI.hasEffectiveRelocationEvents.mockReturnValue(false);

    const types = [
      { key: 'localInv_ie', label: 'Local', residenceScope: 'local' }
    ];

    webUI.renderInvestmentParameterFields(types);

    const tbody = document.querySelector('.growth-rates-table tbody');
    const lastRow = tbody.querySelector('tr:last-child');
    expect(lastRow.getAttribute('data-dynamic-inflation-row')).toBe('true');
  });

  test('renders inflation row as last row in multi-country mode', () => {
    mockConfig.isRelocationEnabled.mockReturnValue(true);
    webUI.hasEffectiveRelocationEvents.mockReturnValue(true);
    webUI.getScenarioCountries = jest.fn(() => ['ie', 'ar']);

    const ieTypes = [
      { key: 'localInv_ie', label: 'Local IE', residenceScope: 'local' }
    ];
    const arTypes = [
      { key: 'localInv_ar', label: 'Local AR', residenceScope: 'local' }
    ];
    mockConfig.getCachedTaxRuleSet.mockImplementation((code) => {
      if (String(code || '').toLowerCase() === 'ie') return { getResolvedInvestmentTypes: () => ieTypes };
      if (String(code || '').toLowerCase() === 'ar') return { getResolvedInvestmentTypes: () => arTypes };
      return { getResolvedInvestmentTypes: () => [] };
    });

    webUI.renderInvestmentParameterFields([]);

    const tbody = document.querySelector('.growth-rates-table tbody');
    const lastRow = tbody.querySelector('tr:last-child');
    expect(lastRow.getAttribute('data-dynamic-inflation-row')).toBe('true');
  });

  test('keeps canonical StartCountry inflation when switching chip visibility', () => {
    webUI.ensureParameterInput('Inflation_ie', 'percentage');
    document.getElementById('Inflation_ie').value = '10';

    mockConfig.isRelocationEnabled.mockReturnValue(false);
    webUI.hasEffectiveRelocationEvents.mockReturnValue(false);
    webUI.getScenarioCountries = jest.fn(() => ['ie']);

    webUI.renderInvestmentParameterFields([]);
    expect(document.getElementById('Inflation_ie').value).toBe('10');

    mockConfig.isRelocationEnabled.mockReturnValue(true);
    webUI.hasEffectiveRelocationEvents.mockReturnValue(true);
    webUI.getScenarioCountries = jest.fn(() => ['ie', 'ar']);

    webUI.renderInvestmentParameterFields([]);

    expect(document.getElementById('Inflation_ie').value).toBe('10');
  });

  test('keeps canonical StartCountry local growth/volatility when switching chip visibility', () => {
    webUI.ensureParameterInput('LocalAssetGrowth_ie_localInv', 'percentage');
    webUI.ensureParameterInput('LocalAssetVolatility_ie_localInv', 'percentage');
    document.getElementById('LocalAssetGrowth_ie_localInv').value = '5';
    document.getElementById('LocalAssetVolatility_ie_localInv').value = '12';

    const ieTypes = [
      { key: 'localInv_ie', label: 'Local IE', residenceScope: 'local' }
    ];
    const arTypes = [
      { key: 'localInv_ar', label: 'Local AR', residenceScope: 'local' }
    ];
    mockConfig.getCachedTaxRuleSet.mockImplementation((code) => {
      if (String(code || '').toLowerCase() === 'ie') return { getResolvedInvestmentTypes: () => ieTypes };
      if (String(code || '').toLowerCase() === 'ar') return { getResolvedInvestmentTypes: () => arTypes };
      return { getResolvedInvestmentTypes: () => [] };
    });

    mockConfig.isRelocationEnabled.mockReturnValue(false);
    webUI.hasEffectiveRelocationEvents.mockReturnValue(false);
    webUI.getScenarioCountries = jest.fn(() => ['ie']);
    webUI.renderInvestmentParameterFields(ieTypes);

    mockConfig.isRelocationEnabled.mockReturnValue(true);
    webUI.hasEffectiveRelocationEvents.mockReturnValue(true);
    webUI.getScenarioCountries = jest.fn(() => ['ie', 'ar']);
    webUI.renderInvestmentParameterFields(ieTypes);

    expect(document.getElementById('LocalAssetGrowth_ie_localInv').value).toBe('5');
    expect(document.getElementById('LocalAssetVolatility_ie_localInv').value).toBe('12');
  });

  test('hides starting-position pension funds when start country has no private pensions', async () => {
    const noPensionRuleset = {
      getResolvedInvestmentTypes: () => [],
      findInvestmentTypeByKey: () => null,
      hasPrivatePensions: () => false
    };
    mockConfig.getCachedTaxRuleSet.mockImplementation(() => noPensionRuleset);
    mockConfig.getTaxRuleSet.mockImplementation(async () => noPensionRuleset);

    webUI.currentSimMode = 'couple';
    webUI.updateUIForSimMode();

    expect(document.getElementById('InitialPension').closest('.input-wrapper').style.display).toBe('flex');
    expect(document.getElementById('InitialPensionP2').closest('.input-wrapper').style.display).toBe('flex');

    await webUI.ensureInvestmentParameterFields();

    expect(document.getElementById('InitialPension').closest('.input-wrapper').style.display).toBe('none');
    expect(document.getElementById('InitialPensionP2').closest('.input-wrapper').style.display).toBe('none');
  });
});

describe('WebUI.refreshCountryChipsFromScenario', () => {
  let webUI;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="hidden-parameter-stash"></div>
      <div id="Allocations"><div class="input-group"></div></div>
    `;

    webUI = new WebUI();
    webUI.dragAndDrop = { renderPriorities: jest.fn(async () => {}) };
    webUI._setupAllocationsCountryChips = jest.fn();
    webUI.setupPersonalCircumstancesCountryChips = jest.fn();
    webUI.formatUtils = { setupCurrencyInputs: jest.fn() };
    webUI.hasEffectiveRelocationEvents = jest.fn(() => true);
  });

  test('rerenders priorities when scenario-country UI refreshes', () => {
    webUI.refreshCountryChipsFromScenario([]);

    expect(webUI.dragAndDrop.renderPriorities).toHaveBeenCalledTimes(1);
  });
});
