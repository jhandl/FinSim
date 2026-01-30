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
eval(webUISource);

describe('WebUI._sortInvestmentTypes', () => {
  let webUI;
  
  beforeEach(() => {
    // Basic DOM structure required by WebUI constructor
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
    
    // Instantiate WebUI
    webUI = new WebUI();
  });

  test('returns empty array for invalid input', () => {
    expect(webUI._sortInvestmentTypes(null)).toEqual([]);
    expect(webUI._sortInvestmentTypes(undefined)).toEqual([]);
    expect(webUI._sortInvestmentTypes('string')).toEqual([]);
  });

  test('sorts local types (no baseRef/baseKey) before global types', () => {
    const input = [
      { key: 'global1', baseRef: 'equity' },
      { key: 'local1' },
      { key: 'global2', baseKey: 'equity' },
      { key: 'local2' }
    ];
    
    const sorted = webUI._sortInvestmentTypes(input);
    
    // Check that first two elements are local types
    expect(sorted[0].key).toMatch(/^local/);
    expect(sorted[1].key).toMatch(/^local/);
    
    // Check that last two elements are global types
    expect(sorted[2].key).toMatch(/^global/);
    expect(sorted[3].key).toMatch(/^global/);
  });

  test('preserves relative order within groups', () => {
    const input = [
      { key: 'global1', baseRef: 'a' },
      { key: 'local1' },
      { key: 'global2', baseRef: 'b' },
      { key: 'local2' }
    ];
    
    const sorted = webUI._sortInvestmentTypes(input);
    
    expect(sorted).toEqual([
      { key: 'local1' },
      { key: 'local2' },
      { key: 'global1', baseRef: 'a' },
      { key: 'global2', baseRef: 'b' }
    ]);
  });

  test('handles already sorted arrays', () => {
    const input = [
      { key: 'local1' },
      { key: 'global1', baseRef: 'a' }
    ];
    
    const sorted = webUI._sortInvestmentTypes(input);
    expect(sorted).toEqual(input);
  });

  test('handles arrays with only one type group', () => {
    const onlyLocal = [{ key: 'local1' }, { key: 'local2' }];
    expect(webUI._sortInvestmentTypes(onlyLocal)).toEqual(onlyLocal);
    
    const onlyGlobal = [{ key: 'global1', baseRef: 'a' }, { key: 'global2', baseRef: 'b' }];
    expect(webUI._sortInvestmentTypes(onlyGlobal)).toEqual(onlyGlobal);
  });
});
