const fs = require('fs');
const path = require('path');

// Mocks
global.AbstractUI = class {};
global.FormatUtils = class { setupPercentageInputs() {} };
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
const mockConfig = {
  getInvestmentBaseTypes: jest.fn(() => []),
  isRelocationEnabled: jest.fn(() => false),
  getStartCountry: jest.fn(() => 'IE'),
  getCountryNameByCode: jest.fn(() => 'Ireland'),
  getCachedTaxRuleSet: jest.fn(() => ({
    getResolvedInvestmentTypes: () => [],
    findInvestmentTypeByKey: () => null
  })),
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
    document.body.innerHTML = `
      <div id="hidden-parameter-stash"></div>
      <div id="startingPosition"><div class="input-group"></div></div>
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
    webUI._takeOrCreateInput = jest.fn((id, type) => {
      const el = document.createElement('input');
      el.id = id;
      return el;
    });
    webUI._stashInputElement = jest.fn((el) => {
      stash.appendChild(el);
    });
    webUI.refreshCountryChipsFromScenario = jest.fn();
    webUI.hasRelocationEvents = jest.fn(() => false);
    webUI.getScenarioCountries = jest.fn(() => ['ie']);
  });

  test('skips wrapper-level inputs for investment types with baseRef', () => {
    const types = [
      { key: 'localInv', label: 'Local' }, // Should create inputs
      { key: 'wrapperInv', label: 'Wrapper', baseRef: 'globalEquity' } // Should SKIP inputs
    ];
    
    webUI.renderInvestmentParameterFields(types);
    
    // Verify localInv inputs created
    expect(webUI._takeOrCreateInput).toHaveBeenCalledWith('localInvGrowthRate', 'percentage');
    expect(webUI._takeOrCreateInput).toHaveBeenCalledWith('localInvGrowthStdDev', 'percentage');
    
    // Verify wrapperInv inputs NOT created
    expect(webUI._takeOrCreateInput).not.toHaveBeenCalledWith('wrapperInvGrowthRate', 'percentage');
    expect(webUI._takeOrCreateInput).not.toHaveBeenCalledWith('wrapperInvGrowthStdDev', 'percentage');
  });

  test('creates wrapper-level inputs for local investments', () => {
     const types = [
      { key: 'shares_ar', label: 'MERVAL', assetCountry: 'ar', residenceScope: 'local' } 
    ];
    
    webUI.renderInvestmentParameterFields(types);

    expect(webUI._takeOrCreateInput).toHaveBeenCalledWith('shares_arGrowthRate', 'percentage');
    expect(webUI._takeOrCreateInput).toHaveBeenCalledWith('shares_arGrowthStdDev', 'percentage');
  });

  test('handles mixed list of types correctly', () => {
     const types = [
      { key: 'shares_ar', label: 'MERVAL', assetCountry: 'ar', residenceScope: 'local' },
      { key: 'indexFunds_ie', label: 'Index Funds', baseRef: 'globalEquity', assetCountry: 'ie' }
    ];
    
    webUI.renderInvestmentParameterFields(types);

    // Local: Yes
    expect(webUI._takeOrCreateInput).toHaveBeenCalledWith('shares_arGrowthRate', 'percentage');
    expect(webUI._takeOrCreateInput).toHaveBeenCalledWith('shares_arGrowthStdDev', 'percentage');

    // Wrapper: No
    expect(webUI._takeOrCreateInput).not.toHaveBeenCalledWith('indexFunds_ieGrowthRate', 'percentage');
    expect(webUI._takeOrCreateInput).not.toHaveBeenCalledWith('indexFunds_ieGrowthStdDev', 'percentage');
  });

  test('filters out inheriting wrappers from per-country growth rates table', () => {
    // Setup scenario with multiple countries and mixed investment types
    webUI.perCountryInvestmentsEnabled = true;
    mockConfig.isRelocationEnabled.mockReturnValue(true);
    webUI.hasRelocationEvents.mockReturnValue(true);
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
});
