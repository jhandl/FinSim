/**
 * Test suite for ChartManager present-value toggle stability
 * Ensures that toggling PV mode on/off preserves nominal values in cache
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Setup mocks before loading ChartManager
beforeAll(() => {
  // Mock Chart.js
  global.Chart = jest.fn(function(ctx, config) {
    this.ctx = ctx;
    this.data = config.data || { labels: [], datasets: [] };
    this.options = config.options || {};
    this.update = jest.fn();
    return this;
  });

  // Mock getDeflationFactor
  global.getDeflationFactor = jest.fn((age, startYear, inflationRate) => {
    const n = age - 30; // Assuming startingAge = 30
    if (n < 0) return 1;
    return 1 / Math.pow(1 + inflationRate, n);
  });

  // Mock Config
  global.Config = {
    getInstance: jest.fn(() => ({
      getSimulationStartYear: jest.fn(() => 2020),
      getDefaultCountry: jest.fn(() => 'ie'),
      isRelocationEnabled: jest.fn(() => false),
      getEconomicData: jest.fn(() => ({
        ready: true,
        getInflation: jest.fn(() => 2.0), // 2% inflation
        convert: jest.fn((val) => val) // Identity conversion for simplicity
      })),
      getCachedTaxRuleSet: jest.fn(() => ({
        getCurrencyCode: jest.fn(() => 'EUR'),
        getNumberLocale: jest.fn(() => 'en-IE')
      }))
    }))
  };

  // Mock FormatUtils
  global.FormatUtils = {
    formatCurrency: jest.fn((val) => `€${val.toFixed(2)}`)
  };

  // Mock RelocationUtils
  global.RelocationUtils = {
    getCountryForAge: jest.fn(() => 'ie'),
    getRepresentativeCountryForCurrency: jest.fn((code) => 'ie'),
    createCurrencyControls: jest.fn(),
    extractRelocationTransitions: jest.fn()
  };
});

describe('ChartManager Present-Value Toggle Stability', () => {
  let ChartManager;
  let chartManager;

  beforeAll(() => {
    // Load ChartManager - wrap code to explicitly expose ChartManager
    const chartManagerCode = fs.readFileSync(
      path.join(__dirname, '../src/frontend/web/components/ChartManager.js'),
      'utf8'
    );
    
    // Wrap the code to ensure ChartManager is available
    const wrappedCode = `
      ${chartManagerCode}
      if (typeof ChartManager !== 'undefined') {
        global.ChartManager = ChartManager;
      }
    `;
    
    // Execute in Node's global scope
    eval(wrappedCode);
    
    // Get ChartManager from global
    ChartManager = global.ChartManager;
    
    if (!ChartManager) {
      throw new Error('Failed to load ChartManager class - check that class ChartManager is defined');
    }
  });

  beforeEach(() => {
    // Setup DOM elements
    document.body.innerHTML = `
      <canvas id="cashflowGraph"></canvas>
      <canvas id="assetsGraph"></canvas>
    `;
    
    // Mock getContext
    const mockContext = {
      fillRect: jest.fn(),
      clearRect: jest.fn(),
      getImageData: jest.fn(() => ({ data: new Array(4) })),
      putImageData: jest.fn(),
      createImageData: jest.fn(() => []),
      setTransform: jest.fn(),
      drawImage: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      closePath: jest.fn(),
      stroke: jest.fn(),
      translate: jest.fn(),
      scale: jest.fn(),
      rotate: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      measureText: jest.fn(() => ({ width: 0 })),
      transform: jest.fn(),
      rect: jest.fn(),
      clip: jest.fn()
    };
    
    document.getElementById('cashflowGraph').getContext = jest.fn(() => mockContext);
    document.getElementById('assetsGraph').getContext = jest.fn(() => mockContext);

    chartManager = new ChartManager();
    chartManager.chartsInitialized = true;
  });

  test('should preserve nominal values in cache when PV mode is toggled', () => {
    // Initial state: PV mode is off
    expect(chartManager.getPresentValueMode()).toBe(false);
    
    // Add some test data (nominal values)
    const testData1 = {
      Age: 30,
      NetIncome: 50000,
      Expenses: 20000,
      IncomeSalaries: 50000,
      Cash: 10000,
      RealEstateCapital: 200000,
      PensionFund: 50000
    };
    
    const testData2 = {
      Age: 35,
      NetIncome: 60000,
      Expenses: 25000,
      IncomeSalaries: 60000,
      Cash: 15000,
      RealEstateCapital: 250000,
      PensionFund: 75000
    };

    // Store initial data
    chartManager.updateChartsRow(1, Object.assign({}, testData1));
    chartManager.updateChartsRow(2, Object.assign({}, testData2));

    // Verify cached data contains nominal values
    expect(chartManager.cachedRowData[1].NetIncome).toBe(50000);
    expect(chartManager.cachedRowData[2].NetIncome).toBe(60000);

    // Toggle PV mode ON
    chartManager.setPresentValueMode(true);
    expect(chartManager.getPresentValueMode()).toBe(true);
    
    // Verify cache still contains nominal values (not deflated)
    expect(chartManager.cachedRowData[1].NetIncome).toBe(50000);
    expect(chartManager.cachedRowData[2].NetIncome).toBe(60000);

    // Toggle PV mode OFF
    chartManager.setPresentValueMode(false);
    expect(chartManager.getPresentValueMode()).toBe(false);
    
    // Verify cache still contains nominal values
    expect(chartManager.cachedRowData[1].NetIncome).toBe(50000);
    expect(chartManager.cachedRowData[2].NetIncome).toBe(60000);

    // Toggle PV mode ON again
    chartManager.setPresentValueMode(true);
    expect(chartManager.getPresentValueMode()).toBe(true);
    
    // Verify cache still contains nominal values after second toggle
    expect(chartManager.cachedRowData[1].NetIncome).toBe(50000);
    expect(chartManager.cachedRowData[2].NetIncome).toBe(60000);

    // Toggle PV mode OFF again
    chartManager.setPresentValueMode(false);
    expect(chartManager.getPresentValueMode()).toBe(false);
    
    // Verify cache still contains nominal values after third toggle
    expect(chartManager.cachedRowData[1].NetIncome).toBe(50000);
    expect(chartManager.cachedRowData[2].NetIncome).toBe(60000);
  });

  test('should apply PV transformation when reading from cache if PV mode is enabled', () => {
    // Add test data
    const testData = {
      Age: 35,
      NetIncome: 60000,
      Expenses: 25000,
      IncomeSalaries: 60000,
      Cash: 15000,
      RealEstateCapital: 250000,
      PensionFund: 75000
    };

    chartManager.updateChartsRow(1, Object.assign({}, testData));
    
    // Verify cache contains nominal value
    expect(chartManager.cachedRowData[1].NetIncome).toBe(60000);

    // Enable PV mode
    chartManager.setPresentValueMode(true);
    
    // Repopulate from cache - should apply PV transformation
    chartManager._repopulateFromCache();
    
    // Verify that getDeflationFactor was called (indicating PV transformation was applied)
    expect(global.getDeflationFactor).toHaveBeenCalled();
    
    // Verify cache still contains nominal value
    expect(chartManager.cachedRowData[1].NetIncome).toBe(60000);
  });

  test('should not mutate cached data when skipCacheStore is true', () => {
    const testData = {
      Age: 30,
      NetIncome: 50000,
      Expenses: 20000
    };

    // Store initial data
    chartManager.updateChartsRow(1, Object.assign({}, testData));
    const cachedValue = chartManager.cachedRowData[1].NetIncome;

    // Enable PV mode and repopulate with skipCacheStore
    chartManager.setPresentValueMode(true);
    const clone = Object.assign({}, chartManager.cachedRowData[1]);
    chartManager.updateChartsRow(1, clone, { skipCacheStore: true });

    // Verify cached data was not mutated
    expect(chartManager.cachedRowData[1].NetIncome).toBe(cachedValue);
  });

  test('should handle multiple toggles without data corruption', () => {
    const testData = {
      Age: 30,
      NetIncome: 50000,
      Expenses: 20000,
      IncomeSalaries: 50000,
      Cash: 10000
    };

    chartManager.updateChartsRow(1, Object.assign({}, testData));
    const originalNetIncome = chartManager.cachedRowData[1].NetIncome;
    const originalExpenses = chartManager.cachedRowData[1].Expenses;
    const originalCash = chartManager.cachedRowData[1].Cash;

    // Toggle PV mode multiple times
    for (let i = 0; i < 5; i++) {
      chartManager.setPresentValueMode(i % 2 === 0);
    }

    // Verify all cached values remain unchanged
    expect(chartManager.cachedRowData[1].NetIncome).toBe(originalNetIncome);
    expect(chartManager.cachedRowData[1].Expenses).toBe(originalExpenses);
    expect(chartManager.cachedRowData[1].Cash).toBe(originalCash);
  });
});

