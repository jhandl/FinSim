/* Test Framework for FinSim - Compatible with existing core modules
 * 
 * This file provides a comprehensive testing framework for the FinSim financial simulator.
 * It supports loading test scenarios, running simulations, and validating assertions, and generating reports.
 * Designed to work with the existing core files that must be compatible with browser and Google Apps Script.
 */

// Import necessary Node.js modules for file operations
const fs = require('fs');
const path = require('path');
const vm = require('vm');


// Test assertion types
const AssertionTypes = {
  EXACT_VALUE: 'exact_value',
  RANGE: 'range',
  COMPARISON: 'comparison',
  TREND: 'trend'
};

// Test target types
const TargetTypes = {
  AGE: 'age',
  ROW: 'row',
  FINAL: 'final'
};

class TestFramework {

  constructor() {
    this.testResults = [];
    this.currentTest = null;
    this.verbose = false;
    this.coreModulesLoaded = false;
    this.simulationContext = null;
  }

  /**
   * Convenience: load a scenario JSON file and execute the core simulation
   * @param {string} filePath - Path to the scenario JSON file
   * @returns {Object|null} - Simulation results or null on failure
   */
  async executeCoreSimulationFromFile(filePath) {
    try {
      // Ensure core modules are loaded and VM is initialized
      if (!this.loadCoreModules()) {
        console.error('Failed to load core modules');
        return null;
      }

      // Ensure VM has the same mock UI setup as the inline-run path
      this.ensureVMUIManagerMocks(null, null);

      // Call the VM-side UIManager.loadFromFile to populate testParams/testEvents
      // Resolve path relative to project root if needed
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, '..', filePath);
      vm.runInContext(`UIManager.prototype.loadFromFile && UIManager.prototype.loadFromFile(${JSON.stringify(absolutePath)})`, this.simulationContext);

      // Initialize Config inside the VM using the mocked WebUI and await completion
      const p = vm.runInContext('Config.initialize(WebUI.getInstance())', this.simulationContext);
      await p;

      // Now execute the simulation using the VM's run() function
      vm.runInContext('var start = Date.now();', this.simulationContext);
      vm.runInContext('run(); simulationResults = { dataSheet, success, failedAt, executionTime: (Date.now()-start) }', this.simulationContext);
      const results = vm.runInContext('simulationResults', this.simulationContext);
      return results;
    } catch (error) {
      console.error(`Error executing simulation from file: ${error.message}`);
      return null;
    }
  }

  /**
   * Reset the framework to a clean state for isolated tests
   */
  reset() {
    if (this.verbose) {
      console.log('🔄 Starting comprehensive TestFramework reset...');
    }

    // Reset test state
    this.testResults = [];
    this.currentTest = null;
    this.coreModulesLoaded = false;

    // Comprehensive singleton reset within VM context
    let singletonsReset = 0;
    if (this.simulationContext) {
      const singletonNames = [
        'Config_instance',
        'WebUI_instance',
        'GasUI_instance',
        'wizard_instance'
      ];

      for (const singletonName of singletonNames) {
        if (this.simulationContext[singletonName]) {
          this.simulationContext[singletonName] = null;
          singletonsReset++;
          if (this.verbose) {
            console.log(`  ✓ Reset singleton: ${singletonName}`);
          }
        }
      }

      // Reset FieldLabelsManager._instance if it exists
      if (this.simulationContext.FieldLabelsManager && this.simulationContext.FieldLabelsManager._instance) {
        this.simulationContext.FieldLabelsManager._instance = null;
        singletonsReset++;
        if (this.verbose) {
          console.log('  ✓ Reset singleton: FieldLabelsManager._instance');
        }
      }

      // VM Context cleanup - reset all global variables and state
      const contextVarsToReset = [
        'uiManager', 'params', 'events', 'config', 'dataSheet', 'row', 'errors',
        'age', 'year', 'phase', 'periods', 'failedAt', 'success', 'montecarlo',
        'revenue', 'realEstate', 'stockGrowthOverride', 'netIncome', 'expenses',
        'savings', 'targetCash', 'cashWithdraw', 'cashDeficit', 'incomeStatePension',
        'incomePrivatePension', 'withdrawalRate',
        'cash', 'incomeSalaries', 'incomeShares', 'incomeRentals',
        'incomeDefinedBenefit', 'incomeTaxFree', 'pensionContribution', 'person1', 'person2'
      ];

      let contextVarsReset = 0;
      for (const varName of contextVarsToReset) {
        if (this.simulationContext.hasOwnProperty(varName)) {
          this.simulationContext[varName] = null;
          contextVarsReset++;
        }
      }

      if (this.verbose && contextVarsReset > 0) {
        console.log(`  ✓ Reset ${contextVarsReset} VM context variables`);
      }
    }

    // Clear simulation context
    this.simulationContext = null;

    // Comprehensive module cache clearing for core directory
    let modulesClearedCount = 0;
    const coreModulePath = path.join(__dirname);

    for (const modulePath in require.cache) {
      // Clear all modules from the core directory
      if (modulePath.startsWith(coreModulePath)) {
        delete require.cache[modulePath];
        modulesClearedCount++;
      }
    }

    if (this.verbose) {
      console.log(`  ✓ Cleared ${modulesClearedCount} modules from require cache`);
      console.log(`  ✓ Reset ${singletonsReset} singleton instances`);
      console.log('🔄 TestFramework reset complete - ready for isolated test execution');
    }
  }

  /**
   * Load and execute the core simulation files in a sandbox context
   * @returns {boolean} - True if core modules loaded successfully
   */
  loadCoreModules() {
    if (this.coreModulesLoaded) {
      return true;
    }

    try {
      // Create a sandbox context for running the simulation
      this.simulationContext = vm.createContext({
        // Mock browser/Google Apps Script globals
        SpreadsheetApp: undefined,
        console: console,
        Date: Date,
        Math: Object.create(Math),
        JSON: JSON,
        Promise: Promise,
        require: require,
        __dirname: __dirname,
        // Minimal fetch polyfill for VM context
        fetch: function (url, opts) {
          return new Promise(function (resolve) {
            try {
              var http = require('http');
              var method = (opts && opts.method) ? opts.method : 'GET';
              var headers = (opts && opts.headers) ? opts.headers : {};
              var body = (opts && opts.body) ? String(opts.body) : '';
              var req = http.request(url, { method: method, headers: headers }, function (res) {
                try { res.on('data', function () { }); } catch (_) { }
                try {
                  res.on('end', function () {
                    resolve({ ok: true, status: res.statusCode || 200, json: function () { return Promise.resolve({}); } });
                  });
                } catch (_) {
                  resolve({ ok: true, status: res.statusCode || 200, json: function () { return Promise.resolve({}); } });
                }
              });
              req.on('error', function () { resolve({ ok: false, status: 0, json: function () { return Promise.resolve({}); } }); });
              if (body) req.write(body);
              req.end();
            } catch (_) {
              resolve({ ok: false, status: 0, json: function () { return Promise.resolve({}); } });
            }
          });
        },

        // Simple localStorage polyfill for Config.getTaxRuleSet() persistence
        localStorage: {
          _storage: {},
          getItem: function (key) { return this._storage[key] || null; },
          setItem: function (key, value) { this._storage[key] = String(value); }
        },

        // Variables that will be populated by the core files
        SimEvent: null,
        adjust: null,
        gaussian: null,
        getRateForKey: null,
        Config_instance: null,

        // Simulation state variables
        uiManager: null,
        params: null,
        events: null,
        config: null,
        dataSheet: null,
        row: 0,
        errors: false,

        // Core simulation variables
        age: 0,
        year: 0,
        phase: null,
        periods: 0,
        failedAt: 0,
        success: true,
        montecarlo: false,
        revenue: null,
        realEstate: null,
        stockGrowthOverride: undefined,

        // Financial variables
        netIncome: 0,
        expenses: 0,
        savings: 0,
        targetCash: 0,
        cashWithdraw: 0,
        cashDeficit: 0,
        incomeStatePension: 0,
        incomePrivatePension: 0,
        withdrawalRate: 0,
        cash: 0,
        indexFunds: null,
        shares: null,

        // More income variables
        incomeSalaries: 0,
        incomeShares: 0,
        incomeRentals: 0,
        incomeDefinedBenefit: 0,
        incomeTaxFree: 0,
        pensionContribution: 0,

        // Person objects for two-person simulation
        person1: null,
        person2: null,

        // Phases enum needed by Person class
        Phases: {
          growth: 'growth',
          retired: 'retired'
        }
      });

      // Read and execute core files in the sandbox
      const coreFiles = [
        'Events.js',
        'LegacyScenarioAdapter.js',
        'Utils.js',
        'EconomicData.js',
        'Config.js',
        'TaxRuleSet.js',
        'Money.js',
        'Attribution.js',
        'AttributionManager.js',
        'Taxman.js',
        'InvestmentAsset.js',
        'GlidePathCalculator.js',
        'InvestmentTypeFactory.js',
        'Pension.js',
        'RealEstate.js',
        'Person.js',
        'InflationService.js',
        'PresentValueCalculator.js',
        'AttributionPopulator.js',
        'DataAggregatesCalculator.js',
        'Simulator.js'
      ];

      for (const filename of coreFiles) {
        const filepath = path.join(__dirname, filename);
        if (!fs.existsSync(filepath)) {
          console.error(`Core file not found: ${filepath}`);
          return false;
        }

        const code = fs.readFileSync(filepath, 'utf8');

        try {
          vm.runInContext(code, this.simulationContext, {
            filename: filename,
            displayErrors: true
          });

          if (this.verbose) {
            console.log(`✓ Loaded core module: ${filename}`);
          }
        } catch (error) {
          console.error(`Error loading ${filename}: ${error.message}`);
          return false;
        }
      }

      this.coreModulesLoaded = true;

      if (this.verbose) {
        console.log('✓ All core modules loaded successfully');
      }

      return true;
    } catch (error) {
      console.error(`Error loading core modules: ${error.message}`);
      return false;
    }
  }

  /**
   * Load a test scenario from a scenario definition object
   * @param {Object} scenarioDefinition - The test scenario object
   * @returns {boolean} - True if scenario loaded successfully
   */
  loadScenario(scenarioDefinition) {
    try {
      // Validate scenario structure
      if (!this.validateScenarioStructure(scenarioDefinition)) {
        return false;
      }

      // Ensure core modules are loaded
      if (!this.loadCoreModules()) {
        console.error('Failed to load core modules');
        return false;
      }

      this.currentTest = {
        name: scenarioDefinition.name,
        description: scenarioDefinition.description,
        scenario: scenarioDefinition.scenario,
        assertions: scenarioDefinition.assertions,
        startTime: null,
        endTime: null,
        success: false,
        results: null,
        errors: []
      };

      if (this.verbose) {
        console.log(`✓ Loaded scenario: ${scenarioDefinition.name}`);
      }

      return true;
    } catch (error) {
      console.error(`Error loading scenario: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate the structure of a scenario definition
   * @param {Object} scenario - The scenario to validate
   * @returns {boolean} - True if valid
   */
  validateScenarioStructure(scenario) {
    if (!scenario.name || typeof scenario.name !== 'string') {
      console.error('Scenario must have a valid name');
      return false;
    }

    if (!scenario.scenario || !scenario.scenario.parameters) {
      console.error('Scenario must have scenario.parameters');
      return false;
    }

    if (!scenario.scenario.events || !Array.isArray(scenario.scenario.events)) {
      console.error('Scenario must have scenario.events array');
      return false;
    }

    if (!scenario.assertions || !Array.isArray(scenario.assertions)) {
      console.error('Scenario must have assertions array');
      return false;
    }

    return true;
  }

  /**
   * Run the simulation using the loaded scenario
   * @returns {Object|null} - Simulation results or null if failed
   */
  async runSimulation() {
    if (!this.currentTest) {
      console.error('No scenario loaded. Call loadScenario() first.');
      return null;
    }

    if (!this.coreModulesLoaded) {
      console.error('Core modules not loaded. Call loadCoreModules() first.');
      return null;
    }

    try {
      this.currentTest.startTime = Date.now();

      if (this.verbose) {
        console.log(`Running simulation: ${this.currentTest.name}`);
      }

      // Execute the simulation in the sandbox context
      const results = await this.executeCoreSimulation(
        this.currentTest.scenario.parameters,
        this.currentTest.scenario.events
      );

      this.currentTest.endTime = Date.now();
      this.currentTest.results = results;

      if (this.verbose) {
        console.log(`✓ Simulation completed in ${this.currentTest.endTime - this.currentTest.startTime}ms`);
      }

      return results;
    } catch (error) {
      this.currentTest.errors.push(`Simulation error: ${error.message}`);
      console.error(`Simulation failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute the core simulation in a sandbox context
   * @param {Object} params - Simulation parameters
   * @param {Array} events - Array of simulation events
   * @returns {Object} - Simulation results
   */
  async executeCoreSimulation(params, events) {
    try {
      // Ensure VM has the mock UI setup and helpers in place
      this.ensureVMUIManagerMocks(params, events);

      // Debug logging: Show when Config.initialize() is called and what version is being loaded
      if (this.verbose) {
        console.log('🔧 DEBUG: Calling Config.initialize() in VM context...');
        const initialVersion = vm.runInContext('localStorage.getItem("finsim-version") || "1.27"', this.simulationContext);
        console.log(`🔧 DEBUG: Initial version from localStorage: ${initialVersion}`);
      }

      // Initialize Config inside the VM using the mocked WebUI and await completion
      const p = vm.runInContext('Config.initialize(WebUI.getInstance())', this.simulationContext);
      await p;

      // After Config is initialized, enforce relocation enablement from test params (opt-in).
      // Only override when the test explicitly provides relocationEnabled (true/false).
      vm.runInContext(`
        (function(){
          try {
            var cfg = Config.getInstance();
            var hasParam = (typeof testParams !== 'undefined' && testParams && Object.prototype.hasOwnProperty.call(testParams, 'relocationEnabled'));
            if (hasParam) {
              cfg.relocationEnabled = (testParams.relocationEnabled === true);
            }
          } catch (_) {}
        })();
      `, this.simulationContext);

      // Hydrate test tax rules into the Config cache if provided by tests
      vm.runInContext(`
        (function(){
          try {
            if (typeof __testTaxRules !== 'undefined' && __testTaxRules && typeof Config_instance !== 'undefined' && Config_instance) {
              if (!Config_instance._taxRuleSets) Config_instance._taxRuleSets = {};
              for (var key in __testTaxRules) {
                if (!Object.prototype.hasOwnProperty.call(__testTaxRules, key)) continue;
                Config_instance._taxRuleSets[key] = new TaxRuleSet(__testTaxRules[key]);
              }
              if (Config_instance._economicData && typeof Config_instance._economicData.refreshFromConfig === 'function') {
                Config_instance._economicData.refreshFromConfig(Config_instance);
              }
            }
          } catch (_) {}
        })();
      `, this.simulationContext);

      // Debug logging: Show config object properties after initialization
      if (this.verbose) {
        try {
          const config = vm.runInContext('Config.getInstance()', this.simulationContext);
          const configVersion = vm.runInContext('Config.getInstance().thisVersion', this.simulationContext);
          const configDefaultCountry = vm.runInContext('Config.getInstance().getDefaultCountry()', this.simulationContext);
          const configAppName = vm.runInContext('Config.getInstance().getApplicationName()', this.simulationContext);
          console.log(`🔧 DEBUG: Config initialized successfully`);
          console.log(`🔧 DEBUG: Final config version loaded: ${configVersion}`);
          console.log(`🔧 DEBUG: Config default country: ${configDefaultCountry}`);
          console.log(`🔧 DEBUG: Config application name: ${configAppName}`);

          // Show some key config properties if they exist
          const simulationRuns = vm.runInContext('Config.getInstance().simulationRuns || "not set"', this.simulationContext);
          console.log(`🔧 DEBUG: Config simulation runs: ${simulationRuns}`);
        } catch (e) {
          console.log(`🔧 DEBUG: Error accessing config properties: ${e.message}`);
        }
      }

      // Debug logging: Show parameters and events being used before calling run()
      if (this.verbose) {
        console.log('🔧 DEBUG: About to call run() function...');
        try {
          const vmParams = vm.runInContext('testParams', this.simulationContext);
          const vmEvents = vm.runInContext('testEvents', this.simulationContext);
          console.log(`🔧 DEBUG: Parameters loaded: ${vmParams ? Object.keys(vmParams).length + ' keys' : 'null'}`);
          console.log(`🔧 DEBUG: Events loaded: ${vmEvents ? vmEvents.length + ' events' : 'null'}`);

          if (vmParams) {
            console.log(`🔧 DEBUG: Key parameters - startingAge: ${vmParams.startingAge}, targetAge: ${vmParams.targetAge}, initialSavings: ${vmParams.initialSavings}`);
          }

          // Verify we're using the real Simulator.js run() function
          const runFunctionExists = vm.runInContext('typeof run === "function"', this.simulationContext);
          const runFunctionSource = vm.runInContext('run.toString().substring(0, 100)', this.simulationContext);
          console.log(`🔧 DEBUG: run() function exists: ${runFunctionExists}`);
          console.log(`🔧 DEBUG: run() function source preview: ${runFunctionSource}...`);
        } catch (e) {
          console.log(`🔧 DEBUG: Error accessing VM parameters/events: ${e.message}`);
        }
      }

      // Record start time inside VM and run the simulation, awaiting completion if async
      if (TestFramework._seedCounter === undefined) TestFramework._seedCounter = 0;
      var seedValue = 123456789 + (TestFramework._seedCounter++);
      vm.runInContext('Math.__seed = ' + seedValue + '; Math.random = function(){ Math.__seed = (Math.__seed * 1664525 + 1013904223) % 4294967296; return Math.__seed / 4294967296; };', this.simulationContext);
      vm.runInContext('var start = Date.now();', this.simulationContext);
      const runPromise = vm.runInContext('run()', this.simulationContext);
      if (runPromise && typeof runPromise.then === 'function') {
        await runPromise;
      }

      // Collect results after run() has completed
      vm.runInContext('simulationResults = { dataSheet: dataSheet, success: success, failedAt: failedAt, executionTime: (Date.now()-start) }', this.simulationContext);
      const results = vm.runInContext('simulationResults', this.simulationContext);

      // Debug logging: Show simulation results including dataSheet info, final year, and final net worth
      if (this.verbose) {
        console.log('🔧 DEBUG: Simulation completed, analyzing results...');
        console.log(`🔧 DEBUG: Simulation success: ${results.success}`);
        console.log(`🔧 DEBUG: Simulation failed at age: ${results.failedAt || 'N/A'}`);
        console.log(`🔧 DEBUG: Execution time: ${results.executionTime}ms`);

        if (results.dataSheet && Array.isArray(results.dataSheet)) {
          const validRows = results.dataSheet.filter(r => r && typeof r === 'object');
          console.log(`🔧 DEBUG: DataSheet total rows: ${results.dataSheet.length}`);
          console.log(`🔧 DEBUG: DataSheet valid rows: ${validRows.length}`);

          if (validRows.length > 0) {
            const firstRow = validRows[0];
            const lastRow = validRows[validRows.length - 1];
            console.log(`🔧 DEBUG: First row age: ${firstRow.age}, year: ${firstRow.year}`);
            console.log(`🔧 DEBUG: Final row age: ${lastRow.age}, year: ${lastRow.year}`);
            console.log(`🔧 DEBUG: Final net worth: €${lastRow.worth ? lastRow.worth.toLocaleString() : 'N/A'}`);
            console.log(`🔧 DEBUG: Final cash: €${lastRow.cash ? lastRow.cash.toLocaleString() : 'N/A'}`);
            console.log(`🔧 DEBUG: Final pension fund: €${lastRow.pensionFund ? lastRow.pensionFund.toLocaleString() : 'N/A'}`);

            // Dump first few and last few rows for debugging
            this.dumpDataSheetRows(validRows, 'DEBUG');
          } else {
            console.log('🔧 DEBUG: No valid data rows found in dataSheet');
          }
        } else {
          console.log('🔧 DEBUG: DataSheet is not a valid array');
        }
      }

      // If Config exposed its resolved version inside the VM, attach it to results for reporting
      try {
        const config = vm.runInContext('config', this.simulationContext);
        if (config && config.thisVersion !== undefined && results && typeof results === 'object') {
          results.configVersion = config.thisVersion;
        }
      } catch (e) {
        // ignore if VM variable isn't present
      }

      // Check if Monte Carlo was used and apply averaging
      const montecarlo = vm.runInContext('montecarlo', this.simulationContext);
      if (montecarlo) {
        const config = vm.runInContext('config', this.simulationContext);
        const runs = config.simulationRuns;

        // Add Monte Carlo metadata to results (median conversion already done in Simulator)
        results.montecarlo = true;
        results.runs = runs;
      }

      return results;

    } catch (error) {
      console.error(`Error executing simulation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Dump the first few and last few rows of the dataSheet for debugging purposes
   * @param {Array} dataSheet - Array of data rows
   * @param {string} prefix - Prefix for log messages (default: 'DEBUG')
   */
  dumpDataSheetRows(dataSheet, prefix = 'DEBUG') {
    if (!dataSheet || !Array.isArray(dataSheet) || dataSheet.length === 0) {
      console.log(`🔧 ${prefix}: No dataSheet rows to dump`);
      return;
    }

    const validRows = dataSheet.filter(r => r && typeof r === 'object');
    if (validRows.length === 0) {
      console.log(`🔧 ${prefix}: No valid dataSheet rows to dump`);
      return;
    }

    console.log(`🔧 ${prefix}: Dumping dataSheet rows (${validRows.length} total valid rows)`);

    // Show first 3 rows
    const firstRowsCount = Math.min(3, validRows.length);
    console.log(`🔧 ${prefix}: First ${firstRowsCount} rows:`);
    for (let i = 0; i < firstRowsCount; i++) {
      const row = validRows[i];
      console.log(`🔧 ${prefix}:   Row ${i}: age=${row.age}, year=${row.year}, worth=${row.worth ? '€' + row.worth.toLocaleString() : 'N/A'}, cash=${row.cash ? '€' + row.cash.toLocaleString() : 'N/A'}`);
    }

    // Show last 3 rows if we have more than 3 total rows
    if (validRows.length > 3) {
      const lastRowsCount = Math.min(3, validRows.length);
      const startIndex = validRows.length - lastRowsCount;
      console.log(`🔧 ${prefix}: Last ${lastRowsCount} rows:`);
      for (let i = startIndex; i < validRows.length; i++) {
        const row = validRows[i];
        console.log(`🔧 ${prefix}:   Row ${i}: age=${row.age}, year=${row.year}, worth=${row.worth ? '€' + row.worth.toLocaleString() : 'N/A'}, cash=${row.cash ? '€' + row.cash.toLocaleString() : 'N/A'}`);
      }
    }

    // Show a sample of key fields from the final row
    if (validRows.length > 0) {
      const finalRow = validRows[validRows.length - 1];
        const caps = finalRow.investmentCapitalByKey || {};
        let invCapTotal = 0;
        for (const k in caps) invCapTotal += (caps[k] || 0);
      console.log(`🔧 ${prefix}: Final row detailed breakdown:`);
      console.log(`🔧 ${prefix}:   Age: ${finalRow.age}, Year: ${finalRow.year}`);
      console.log(`🔧 ${prefix}:   Net Worth: €${finalRow.worth ? finalRow.worth.toLocaleString() : 'N/A'}`);
      console.log(`🔧 ${prefix}:   Cash: €${finalRow.cash ? finalRow.cash.toLocaleString() : 'N/A'}`);
      console.log(`🔧 ${prefix}:   Pension Fund: €${finalRow.pensionFund ? finalRow.pensionFund.toLocaleString() : 'N/A'}`);
        console.log(`🔧 ${prefix}:   Investments: €${invCapTotal ? invCapTotal.toLocaleString() : 'N/A'}`);
      console.log(`🔧 ${prefix}:   Net Income: €${finalRow.netIncome ? finalRow.netIncome.toLocaleString() : 'N/A'}`);
      console.log(`🔧 ${prefix}:   Expenses: €${finalRow.expenses ? finalRow.expenses.toLocaleString() : 'N/A'}`);
    }
  }

  /**
   * Ensure the VM context has the same Mock UIManager/WebUI/STATUS_COLORS
   * and readParameters/readEvents helpers as used by the inline-run path.
   * If params/events are provided they will be seeded into VM-level
   * testParams/testEvents; if null they are left to be populated by
   * UIManager.prototype.loadFromFile inside the VM.
   */
  ensureVMUIManagerMocks(params, events) {
    if (!this.simulationContext) return;

    const paramsJson = params ? JSON.stringify(params) : 'null';
    const eventsJson = events ? JSON.stringify(events) : 'null';
    // Median computation disabled in mock.

    vm.runInContext(`
      // Optionally seed testParams/testEvents when provided by host
      var __seededParams = ${paramsJson};
      var __seededEvents = ${eventsJson};
      var testParams = null; var testEvents = [];
      // Note: median computation intentionally omitted in VM mock
      if (__seededParams) {
        testParams = __seededParams;
      }
      if (__seededEvents) {
        testEvents = __seededEvents.map(function(e) { return new SimEvent(e.type, e.id, e.amount, e.fromAge, e.toAge, e.rate, e.match, e.currency, e.linkedEventId, e.linkedCountry); });
      }

      // Create a proper UIManager mock that matches the real UIManager interface
      function MockUIManager(mockUI) { this.ui = mockUI; }
      MockUIManager.prototype.updateProgress = function(status) {};
      MockUIManager.prototype.updateDataSheet = function(runs, perRunResults) {
        try {
          if (!Array.isArray(dataSheet) || !runs || runs <= 1) { return; }
          // Average accumulated numeric fields across Monte Carlo runs so tests read normalized values
          for (var i = 1; i <= row; i++) {
            var r = dataSheet[i];
            if (!r || typeof r !== 'object') { continue; }
            // Age and year are state values, not accumulated - don't divide by runs
            var numericFields = [
              'incomeSalaries','incomeRSUs','incomeRentals','incomePrivatePension','incomeStatePension',
              'incomeCash','incomeDefinedBenefit','incomeTaxFree','realEstateCapital','netIncome','expenses',
              'pensionFund','cash','pensionContribution','withdrawalRate','worth',
              'incomeSalariesPV','incomeRSUsPV','incomeRentalsPV','incomePrivatePensionPV','incomeStatePensionPV',
              'incomeCashPV','incomeDefinedBenefitPV','incomeTaxFreePV','realEstateCapitalPV','netIncomePV','expensesPV',
              'pensionFundPV','cashPV','pensionContributionPV','worthPV'
            ];
            for (var fi = 0; fi < numericFields.length; fi++) {
              var key = numericFields[fi];
              if (typeof r[key] === 'number') { r[key] = r[key] / runs; }
            }
            // Average dynamic maps if present
            if (r.investmentIncomeByKey) {
              for (var k in r.investmentIncomeByKey) { if (r.investmentIncomeByKey.hasOwnProperty(k)) { r.investmentIncomeByKey[k] = r.investmentIncomeByKey[k] / runs; } }
            }
            if (r.investmentIncomeByKeyPV) {
              for (var kp in r.investmentIncomeByKeyPV) { if (r.investmentIncomeByKeyPV.hasOwnProperty(kp)) { r.investmentIncomeByKeyPV[kp] = r.investmentIncomeByKeyPV[kp] / runs; } }
            }
            if (r.investmentCapitalByKey) {
              for (var ck in r.investmentCapitalByKey) { if (r.investmentCapitalByKey.hasOwnProperty(ck)) { r.investmentCapitalByKey[ck] = r.investmentCapitalByKey[ck] / runs; } }
            }
            if (r.investmentCapitalByKeyPV) {
              for (var ckp in r.investmentCapitalByKeyPV) { if (r.investmentCapitalByKeyPV.hasOwnProperty(ckp)) { r.investmentCapitalByKeyPV[ckp] = r.investmentCapitalByKeyPV[ckp] / runs; } }
            }
            if (r.taxByKey) {
              for (var t in r.taxByKey) { if (r.taxByKey.hasOwnProperty(t)) { r.taxByKey[t] = r.taxByKey[t] / runs; } }
            }
            // Also average any dynamic Tax__ columns that may exist directly on the row
            for (var prop in r) {
              if (!r.hasOwnProperty(prop)) continue;
              if (prop && prop.indexOf('Tax__') === 0 && typeof r[prop] === 'number') {
                r[prop] = r[prop] / runs;
              }
            }
          }
        } catch (_) { /* noop in tests */ }
      };
      MockUIManager.prototype.updateStatusCell = function(successes, runs) {};
      MockUIManager.prototype.clearWarnings = function() {};
      MockUIManager.prototype.setStatus = function(status, color) {};
      MockUIManager.prototype.saveToFile = function() {};
      MockUIManager.prototype.loadFromFile = function(file) {
        try {
          var fs = require('fs'); var path = require('path'); var filePath = file;
          if (!path.isAbsolute(filePath)) { filePath = path.resolve(__dirname, filePath); }
          var content = fs.readFileSync(filePath, 'utf8'); var parsed = JSON.parse(content);
          var params = (parsed && parsed.scenario && parsed.scenario.parameters) ? parsed.scenario.parameters : (parsed.params || parsed.testParams || {});
          var eventsArr = (parsed && parsed.scenario && parsed.scenario.events) ? parsed.scenario.events : (parsed.events || parsed.testEvents || []);
          testParams = params;
          testEvents = eventsArr.map(function(e) { return new SimEvent(e.type, e.id, e.amount, e.fromAge, e.toAge, e.rate, e.match, e.currency, e.linkedEventId, e.linkedCountry); });
        } catch (e) { throw new Error('Failed to load scenario file: ' + (e && e.message ? e.message : e)); }
      };
      MockUIManager.prototype.updateDataRow = function(row, progress) {};
      MockUIManager.prototype.readParameters = function(validate) {
        if (!testParams) return testParams;

        var sc = String(testParams.StartCountry || Config.getInstance().getStartCountry()).trim().toLowerCase();
        var scenarioCountries = {};
        scenarioCountries[sc] = true;
        try {
          var evs = Array.isArray(testEvents) ? testEvents : [];
          for (var ei = 0; ei < evs.length; ei++) {
            var evt = evs[ei];
            var t = evt && evt.type ? String(evt.type) : '';
            if (t && t.indexOf('MV-') === 0) {
              scenarioCountries[t.substring(3).toLowerCase()] = true;
            }
          }
        } catch (_) { }

        var parsePercent = function(v) {
          if (v === null || v === undefined || v === '') return null;
          if (typeof v === 'number' && isFinite(v)) return v;
          var s = String(v).trim();
          if (!s) return null;
          var isPct = s.indexOf('%') >= 0;
          var n = parseFloat(s.replace('%', ''));
          if (!isFinite(n)) return null;
          return isPct ? (n / 100) : n;
        };

        // Normalize modes (tests provide canonical values; older tests may omit).
        if (!testParams.simulation_mode) {
          testParams.simulation_mode = (testParams.p2StartingAge || testParams.P2StartingAge) ? 'couple' : 'single';
        }
        if (!testParams.economyMode) {
          if (testParams.economy_mode) {
            testParams.economyMode = testParams.economy_mode;
          } else {
            var hasVol = false;
            if (parseFloat(testParams.growthDevPension || 0) > 0) hasVol = true;
            if (parseFloat(testParams.growthDevFunds || 0) > 0) hasVol = true;
            if (parseFloat(testParams.growthDevShares || 0) > 0) hasVol = true;
            testParams.economyMode = hasVol ? 'montecarlo' : 'deterministic';
          }
        }

        // Canonical investment maps (namespaced keys, e.g. indexFunds_ie)
        if (!testParams.investmentGrowthRatesByKey) testParams.investmentGrowthRatesByKey = {};
        if (!testParams.investmentVolatilitiesByKey) testParams.investmentVolatilitiesByKey = {};
        if (!testParams.initialCapitalByKey) testParams.initialCapitalByKey = {};
        if (!testParams.investmentAllocationsByCountry) testParams.investmentAllocationsByCountry = {};
        if (!testParams.investmentAllocationsByCountry[sc]) testParams.investmentAllocationsByCountry[sc] = {};

        var legacyFundsFieldsPresent = (
          testParams.growthRateFunds !== undefined ||
          testParams.growthDevFunds !== undefined ||
          testParams.initialFunds !== undefined ||
          testParams.FundsAllocation !== undefined ||
          testParams.InitialCapital_indexFunds !== undefined ||
          testParams.InvestmentAllocation_indexFunds !== undefined ||
          testParams.indexFundsGrowthRate !== undefined ||
          testParams.indexFundsGrowthStdDev !== undefined ||
          testParams.priorityFunds !== undefined
        );
        var legacySharesFieldsPresent = (
          testParams.growthRateShares !== undefined ||
          testParams.growthDevShares !== undefined ||
          testParams.initialShares !== undefined ||
          testParams.SharesAllocation !== undefined ||
          testParams.InitialCapital_shares !== undefined ||
          testParams.InvestmentAllocation_shares !== undefined ||
          testParams.sharesGrowthRate !== undefined ||
          testParams.sharesGrowthStdDev !== undefined ||
          testParams.priorityShares !== undefined
        );
        var hasLegacyFundsOrShares = legacyFundsFieldsPresent || legacySharesFieldsPresent;
        var setIfUndefined = function(map, key, value) {
          if (!map) return;
          if (map[key] === undefined) map[key] = value;
        };

        var _legacyTypeCache = {};
        var _resolveRuleset = function(cc) {
          var cfg = null;
          try {
            cfg = (typeof Config_instance !== 'undefined' && Config_instance) ? Config_instance : Config.getInstance();
          } catch (e) {
            throw new Error('Config not initialized for legacy investment mapping');
          }
          var rs = (cfg && typeof cfg.getCachedTaxRuleSet === 'function') ? cfg.getCachedTaxRuleSet(cc) : null;
          if (!rs) {
            var fs = require('fs');
            var path = require('path');
            var filePath = path.join(__dirname, 'config', 'tax-rules-' + cc + '.json');
            var raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            rs = new TaxRuleSet(raw);
          }
          return rs;
        };
        var _getAllocatableTypes = function(cc) {
          var rs = _resolveRuleset(cc);
          var types = (rs && typeof rs.getResolvedInvestmentTypes === 'function') ? (rs.getResolvedInvestmentTypes() || []) : [];
          var out = [];
          for (var ti = 0; ti < types.length; ti++) {
            var t = types[ti] || {};
            if (!t.key) continue;
            if (t.excludeFromAllocations) continue;
            if (t.sellWhenReceived) continue;
            out.push(t.key);
          }
          return out;
        };
        var _getLegacyKeys = function(cc) {
          if (_legacyTypeCache[cc]) return _legacyTypeCache[cc];
          var types = _getAllocatableTypes(cc);
          _legacyTypeCache[cc] = {
            fundsKey: types[0] || null,
            sharesKey: types[1] || null,
            allocTypes: types
          };
          return _legacyTypeCache[cc];
        };
        var _requireLegacyKey = function(keys, which, cc) {
          if (!keys || !keys[which]) throw new Error('Missing investment type for legacy mapping (' + which + ') in ' + cc);
          return keys[which];
        };
        var _resolveTypeKey = function(cc, baseNorm) {
          var keys = _getLegacyKeys(cc);
          if (baseNorm === 'indexFunds') return _requireLegacyKey(keys, 'fundsKey', cc);
          if (baseNorm === 'shares') return _requireLegacyKey(keys, 'sharesKey', cc);
          if (keys && keys.allocTypes) {
            for (var i = 0; i < keys.allocTypes.length; i++) {
              if (keys.allocTypes[i] === baseNorm) return baseNorm;
            }
          }
          return baseNorm + '_' + cc;
        };

        // Legacy shorthand -> canonical namespaced keys for StartCountry (via tax rules)
        var scKeys = hasLegacyFundsOrShares ? _getLegacyKeys(sc) : null;
        if (testParams.growthRateFunds !== undefined) setIfUndefined(testParams.investmentGrowthRatesByKey, _requireLegacyKey(scKeys, 'fundsKey', sc), testParams.growthRateFunds);
        if (testParams.growthRateShares !== undefined) setIfUndefined(testParams.investmentGrowthRatesByKey, _requireLegacyKey(scKeys, 'sharesKey', sc), testParams.growthRateShares);
        if (testParams.growthDevFunds !== undefined) setIfUndefined(testParams.investmentVolatilitiesByKey, _requireLegacyKey(scKeys, 'fundsKey', sc), testParams.growthDevFunds);
        if (testParams.growthDevShares !== undefined) setIfUndefined(testParams.investmentVolatilitiesByKey, _requireLegacyKey(scKeys, 'sharesKey', sc), testParams.growthDevShares);
        if (testParams.initialFunds !== undefined) setIfUndefined(testParams.initialCapitalByKey, _requireLegacyKey(scKeys, 'fundsKey', sc), testParams.initialFunds);
        if (testParams.initialShares !== undefined) setIfUndefined(testParams.initialCapitalByKey, _requireLegacyKey(scKeys, 'sharesKey', sc), testParams.initialShares);
        if (testParams.FundsAllocation !== undefined) setIfUndefined(testParams.investmentAllocationsByCountry[sc], _requireLegacyKey(scKeys, 'fundsKey', sc), testParams.FundsAllocation);
        if (testParams.SharesAllocation !== undefined) setIfUndefined(testParams.investmentAllocationsByCountry[sc], _requireLegacyKey(scKeys, 'sharesKey', sc), testParams.SharesAllocation);

        // When relocations exist, project legacy scalar allocations/growth onto each scenario country
        if (hasLegacyFundsOrShares) {
          for (var cc in scenarioCountries) {
            if (!Object.prototype.hasOwnProperty.call(scenarioCountries, cc)) continue;
            if (!testParams.investmentAllocationsByCountry[cc]) testParams.investmentAllocationsByCountry[cc] = {};
            var ccKeys = _getLegacyKeys(cc);
            if (testParams.FundsAllocation !== undefined) setIfUndefined(testParams.investmentAllocationsByCountry[cc], _requireLegacyKey(ccKeys, 'fundsKey', cc), testParams.FundsAllocation);
            if (testParams.SharesAllocation !== undefined) setIfUndefined(testParams.investmentAllocationsByCountry[cc], _requireLegacyKey(ccKeys, 'sharesKey', cc), testParams.SharesAllocation);

            if (testParams.growthRateFunds !== undefined) setIfUndefined(testParams.investmentGrowthRatesByKey, _requireLegacyKey(ccKeys, 'fundsKey', cc), testParams.growthRateFunds);
            if (testParams.growthRateShares !== undefined) setIfUndefined(testParams.investmentGrowthRatesByKey, _requireLegacyKey(ccKeys, 'sharesKey', cc), testParams.growthRateShares);
            if (testParams.growthDevFunds !== undefined) setIfUndefined(testParams.investmentVolatilitiesByKey, _requireLegacyKey(ccKeys, 'fundsKey', cc), testParams.growthDevFunds);
            if (testParams.growthDevShares !== undefined) setIfUndefined(testParams.investmentVolatilitiesByKey, _requireLegacyKey(ccKeys, 'sharesKey', cc), testParams.growthDevShares);
          }
        }

        // Also support v2.0 save-file dynamic parameter naming (demo3.csv-like).
        if (testParams.InitialCapital_indexFunds !== undefined) {
          var ic = Number(testParams.InitialCapital_indexFunds);
          if (isFinite(ic)) setIfUndefined(testParams.initialCapitalByKey, _requireLegacyKey(scKeys, 'fundsKey', sc), ic);
        }
        if (testParams.InitialCapital_shares !== undefined) {
          var ic2 = Number(testParams.InitialCapital_shares);
          if (isFinite(ic2)) setIfUndefined(testParams.initialCapitalByKey, _requireLegacyKey(scKeys, 'sharesKey', sc), ic2);
        }
        if (testParams.InvestmentAllocation_indexFunds !== undefined) {
          var a = parsePercent(testParams.InvestmentAllocation_indexFunds);
          if (a !== null) setIfUndefined(testParams.investmentAllocationsByCountry[sc], _requireLegacyKey(scKeys, 'fundsKey', sc), a);
        }
        if (testParams.InvestmentAllocation_shares !== undefined) {
          var a2 = parsePercent(testParams.InvestmentAllocation_shares);
          if (a2 !== null) setIfUndefined(testParams.investmentAllocationsByCountry[sc], _requireLegacyKey(scKeys, 'sharesKey', sc), a2);
        }
        if (testParams.indexFundsGrowthRate !== undefined) {
          var gr = parsePercent(testParams.indexFundsGrowthRate);
          if (gr !== null) setIfUndefined(testParams.investmentGrowthRatesByKey, _requireLegacyKey(scKeys, 'fundsKey', sc), gr);
        }
        if (testParams.sharesGrowthRate !== undefined) {
          var gr2 = parsePercent(testParams.sharesGrowthRate);
          if (gr2 !== null) setIfUndefined(testParams.investmentGrowthRatesByKey, _requireLegacyKey(scKeys, 'sharesKey', sc), gr2);
        }
        if (testParams.indexFundsGrowthStdDev !== undefined) {
          var sd = parsePercent(testParams.indexFundsGrowthStdDev);
          if (sd !== null) setIfUndefined(testParams.investmentVolatilitiesByKey, _requireLegacyKey(scKeys, 'fundsKey', sc), sd);
        }
        if (testParams.sharesGrowthStdDev !== undefined) {
          var sd2 = parsePercent(testParams.sharesGrowthStdDev);
          if (sd2 !== null) setIfUndefined(testParams.investmentVolatilitiesByKey, _requireLegacyKey(scKeys, 'sharesKey', sc), sd2);
        }

        // Propagate demo3.csv-like allocation/growth fields to each scenario country
        for (var cc2 in scenarioCountries) {
          if (!Object.prototype.hasOwnProperty.call(scenarioCountries, cc2)) continue;
          if (!testParams.investmentAllocationsByCountry[cc2]) testParams.investmentAllocationsByCountry[cc2] = {};
          var cc2Keys = hasLegacyFundsOrShares ? _getLegacyKeys(cc2) : null;
          if (testParams.InvestmentAllocation_indexFunds !== undefined) {
            var aa = parsePercent(testParams.InvestmentAllocation_indexFunds);
            if (aa !== null) setIfUndefined(testParams.investmentAllocationsByCountry[cc2], _requireLegacyKey(cc2Keys, 'fundsKey', cc2), aa);
          }
          if (testParams.InvestmentAllocation_shares !== undefined) {
            var bb = parsePercent(testParams.InvestmentAllocation_shares);
            if (bb !== null) setIfUndefined(testParams.investmentAllocationsByCountry[cc2], _requireLegacyKey(cc2Keys, 'sharesKey', cc2), bb);
          }
          if (testParams.indexFundsGrowthRate !== undefined) {
            var gg = parsePercent(testParams.indexFundsGrowthRate);
            if (gg !== null) setIfUndefined(testParams.investmentGrowthRatesByKey, _requireLegacyKey(cc2Keys, 'fundsKey', cc2), gg);
          }
          if (testParams.sharesGrowthRate !== undefined) {
            var gg2 = parsePercent(testParams.sharesGrowthRate);
            if (gg2 !== null) setIfUndefined(testParams.investmentGrowthRatesByKey, _requireLegacyKey(cc2Keys, 'sharesKey', cc2), gg2);
          }
          if (testParams.indexFundsGrowthStdDev !== undefined) {
            var ss = parsePercent(testParams.indexFundsGrowthStdDev);
            if (ss !== null) setIfUndefined(testParams.investmentVolatilitiesByKey, _requireLegacyKey(cc2Keys, 'fundsKey', cc2), ss);
          }
          if (testParams.sharesGrowthStdDev !== undefined) {
            var ss2 = parsePercent(testParams.sharesGrowthStdDev);
            if (ss2 !== null) setIfUndefined(testParams.investmentVolatilitiesByKey, _requireLegacyKey(cc2Keys, 'sharesKey', cc2), ss2);
          }
        }

        // Support generic v2.0 "typeKey-suffixed" fields (e.g. demo3.csv):
        // - InvestmentAllocation_indexFunds_ie, InvestmentAllocation_ie_indexfunds (variants)
        // - InitialCapital_indexFunds_ie
        // - indexFunds_ieGrowthRate / shares_ieGrowthStdDev
        try {
          var normalizeBaseKey = function (base) {
            var s = String(base || '').trim();
            var l = s.toLowerCase();
            if (l === 'indexfunds' || l === 'funds' || l === 'etf' || l === 'etfs') return 'indexFunds';
            if (l === 'shares' || l === 'trust' || l === 'trusts') return 'shares';
            return s;
          };
          var ensureCountryAlloc = function (cc) {
            if (!testParams.investmentAllocationsByCountry[cc]) testParams.investmentAllocationsByCountry[cc] = {};
          };
          var setAlloc = function (cc, invKey, pct) {
            if (pct === null) return;
            ensureCountryAlloc(cc);
            if (testParams.investmentAllocationsByCountry[cc][invKey] === undefined) {
              testParams.investmentAllocationsByCountry[cc][invKey] = pct;
            }
          };

          for (var pkey in testParams) {
            if (!Object.prototype.hasOwnProperty.call(testParams, pkey)) continue;
            var sval = testParams[pkey];

            // Investment allocations: InvestmentAllocation_{base}_{cc} OR InvestmentAllocation_{cc}_{base}
            if (pkey && String(pkey).indexOf('InvestmentAllocation_') === 0) {
              var suf = String(pkey).substring('InvestmentAllocation_'.length);
              // Prefer cc_base when the first segment looks like a real country code (e.g. ie_indexfunds).
              // Fallback to base_cc (e.g. indexFunds_ie).
              var m2 = suf.match(/^([a-z]{2,})_(.+)$/i);     // cc_base
              var m1 = suf.match(/^(.+)_([a-z]{2,})$/i);     // base_cc
              var base = null;
              var ccAlloc = null;
              if (m2) {
                var cc2 = String(m2[1]).toLowerCase();
                // Only treat as cc_base when cc is already known (StartCountry/MV-*) or is 2-letter.
                if (scenarioCountries[cc2] || cc2.length === 2) {
                  base = m2[2]; ccAlloc = cc2;
                }
              }
              if (!ccAlloc && m1) { base = m1[1]; ccAlloc = String(m1[2]).toLowerCase(); }
              if (base && ccAlloc) {
                scenarioCountries[ccAlloc] = true;
                var baseNorm = normalizeBaseKey(base);
                var invKey = _resolveTypeKey(ccAlloc, baseNorm);
                setAlloc(ccAlloc, invKey, parsePercent(sval));
              }
              continue;
            }

            // Initial capital: InitialCapital_{base}_{cc}
            if (pkey && String(pkey).indexOf('InitialCapital_') === 0) {
              var sufC = String(pkey).substring('InitialCapital_'.length);
              var mC = sufC.match(/^(.+)_([a-z]{2,})$/i);
              if (mC) {
                var baseC = normalizeBaseKey(mC[1]);
                var ccC = String(mC[2]).toLowerCase();
                scenarioCountries[ccC] = true;
                var invKeyC = _resolveTypeKey(ccC, baseC);
                var cap = Number(sval);
                if (isFinite(cap) && testParams.initialCapitalByKey[invKeyC] === undefined) {
                  testParams.initialCapitalByKey[invKeyC] = cap;
                }
              }
              continue;
            }

            // Growth/vol: {base}_{cc}GrowthRate / GrowthStdDev
            if (pkey && (String(pkey).endsWith('GrowthRate') || String(pkey).endsWith('GrowthStdDev'))) {
              var isStd = String(pkey).endsWith('GrowthStdDev');
              var suffixLen = isStd ? 'GrowthStdDev'.length : 'GrowthRate'.length;
              var typePart = String(pkey).slice(0, -suffixLen);
              var mG = typePart.match(/^(.+)_([a-z]{2,})$/i);
              if (mG) {
                var baseG = normalizeBaseKey(mG[1]);
                var ccG = String(mG[2]).toLowerCase();
                scenarioCountries[ccG] = true;
                var invKeyG = _resolveTypeKey(ccG, baseG);
                var rateVal = parsePercent(sval);
                if (rateVal !== null) {
                  if (isStd) {
                    if (testParams.investmentVolatilitiesByKey[invKeyG] === undefined) testParams.investmentVolatilitiesByKey[invKeyG] = rateVal;
                  } else {
                    if (testParams.investmentGrowthRatesByKey[invKeyG] === undefined) testParams.investmentGrowthRatesByKey[invKeyG] = rateVal;
                  }
                }
              }
              continue;
            }
          }
        } catch (_) { }

        // Canonical per-country pension contributions
        if (!testParams.pensionContributionsByCountry) testParams.pensionContributionsByCountry = {};
        if (!testParams.pensionContributionsByCountry[sc]) {
          testParams.pensionContributionsByCountry[sc] = {
            p1Pct: testParams.pensionPercentage || 0,
            p2Pct: testParams.pensionPercentageP2 || 0,
            capped: testParams.pensionCapped || 'No'
          };
        }

        // Canonical per-country state pensions
        if (!testParams.statePensionByCountry) testParams.statePensionByCountry = {};
        if (testParams.statePensionByCountry[sc] === undefined) testParams.statePensionByCountry[sc] = testParams.statePensionWeekly || 0;
        if (!testParams.p2StatePensionByCountry) testParams.p2StatePensionByCountry = {};
        if (testParams.p2StatePensionByCountry[sc] === undefined) testParams.p2StatePensionByCountry[sc] = testParams.p2StatePensionWeekly || 0;

        // Canonical drawdown priorities by investment key
        if (!testParams.drawdownPrioritiesByKey) testParams.drawdownPrioritiesByKey = {};
        // Apply base priorities across all scenario countries (StartCountry + any MV-*).
        try {
          var evs = Array.isArray(testEvents) ? testEvents : [];
          for (var ei = 0; ei < evs.length; ei++) {
            var evt = evs[ei];
            var t = evt && evt.type ? String(evt.type) : '';
            if (t && t.indexOf('MV-') === 0) {
              scenarioCountries[t.substring(3).toLowerCase()] = true;
            }
          }
        } catch (_) { }
        if (testParams.priorityFunds !== undefined || testParams.priorityShares !== undefined) {
          for (var cc in scenarioCountries) {
            if (!Object.prototype.hasOwnProperty.call(scenarioCountries, cc)) continue;
            var pKeys = _getLegacyKeys(cc);
            if (testParams.priorityFunds !== undefined) testParams.drawdownPrioritiesByKey[_requireLegacyKey(pKeys, 'fundsKey', cc)] = testParams.priorityFunds;
            if (testParams.priorityShares !== undefined) testParams.drawdownPrioritiesByKey[_requireLegacyKey(pKeys, 'sharesKey', cc)] = testParams.priorityShares;
          }
        }

        return testParams;
      };
      MockUIManager.prototype.readEvents = function(validate) { return testEvents; };
      MockUIManager.prototype.flush = function() {};

      var mockUI = {
        getVersion: function() { var storedVersion = localStorage.getItem('finsim-version'); return storedVersion || '1.27'; },
        setVersion: function(version) { localStorage.setItem('finsim-version', version); },
        getStartCountryRaw: function() { return testParams ? testParams.StartCountry : null; },
        fetchUrl: function(url) { var fs = require('fs'); var path = require('path'); if (url.startsWith('/src/core/config/')) { var filename = path.basename(url); var configPath = path.join(__dirname, 'config', filename); return fs.readFileSync(configPath, 'utf8'); } throw new Error('Unsupported URL pattern: ' + url); },
        showAlert: function(msg) { console.warn(msg); return true; },
        setError: function(err) { console.warn(err && err.message ? err.message : err); return true; },
        showToast: function(message, title, timeout) {},
        clearVersionNote: function() {}, setVersionHighlight: function() {},
        newDataVersion: function(version, message) { if (this.showAlert(message)) { this.setVersion(version); } },
        newCodeVersion: function() {}, flush: function() {}
      };

      STATUS_COLORS = { ERROR: "#ff8080", WARNING: "#ffe066", SUCCESS: "#9fdf9f", INFO: "#E0E0E0", WHITE: "#FFFFFF" };
      UIManager = MockUIManager;
      WebUI = { getInstance: function() { return mockUI; } };
    `, this.simulationContext);
  }

  /**
   * Validate assertions against simulation results
   * @param {Array} assertions - Array of assertion objects
   * @param {Object} results - Simulation results
   * @returns {Object} - Validation results
   */
  validateAssertions(assertions = null, results = null) {
    if (!assertions) {
      assertions = this.currentTest?.assertions;
    }
    if (!results) {
      results = this.currentTest?.results;
    }

    if (!assertions || !results) {
      console.error('Missing assertions or results for validation');
      return { success: false, errors: ['Missing assertions or results'] };
    }

    const validationResults = {
      success: true,
      passedAssertions: 0,
      totalAssertions: assertions.length,
      failures: [],
      details: []
    };

    for (const assertion of assertions) {
      try {
        const assertionResult = this.validateSingleAssertion(assertion, results);

        if (assertionResult.success) {
          validationResults.passedAssertions++;
          validationResults.details.push({
            assertion: assertion,
            success: true,
            message: assertionResult.message
          });
        } else {
          validationResults.success = false;
          validationResults.failures.push({
            assertion: assertion,
            error: assertionResult.error,
            actual: assertionResult.actual,
            expected: assertionResult.expected
          });
          validationResults.details.push({
            assertion: assertion,
            success: false,
            error: assertionResult.error
          });
        }
      } catch (error) {
        validationResults.success = false;
        validationResults.failures.push({
          assertion: assertion,
          error: `Assertion validation error: ${error.message}`
        });
      }
    }

    if (this.currentTest) {
      this.currentTest.success = validationResults.success;
    }

    return validationResults;
  }

  /**
   * Validate a single assertion
   * @param {Object} assertion - The assertion to validate
   * @param {Object} results - Simulation results
   * @returns {Object} - Validation result for this assertion
   */
  validateSingleAssertion(assertion, results) {
    const { type, target, field, expected, tolerance = 0.01 } = assertion;

    // Get the actual value based on target type
    let actualValue;

    switch (target) {
      case TargetTypes.FINAL:
        actualValue = this.getFinalValue(results.dataSheet, field);
        break;
      case TargetTypes.AGE:
        actualValue = this.getValueAtAge(results.dataSheet, assertion.age, field);
        break;
      case TargetTypes.ROW:
        actualValue = this.getValueAtRow(results.dataSheet, assertion.row, field);
        break;
      default:
        throw new Error(`Unknown target type: ${target}`);
    }

    // Validate based on assertion type
    switch (type) {
      case AssertionTypes.EXACT_VALUE:
        return this.validateExactValue(actualValue, expected, tolerance);
      case AssertionTypes.RANGE:
        return this.validateRange(actualValue, expected.min, expected.max);
      case AssertionTypes.COMPARISON:
        return this.validateComparison(actualValue, expected.operator, expected.value);
      case AssertionTypes.TREND:
        return this.validateTrend(results.dataSheet, field, expected);
      default:
        throw new Error(`Unknown assertion type: ${type}`);
    }
  }

  /** Helper to map legacy tax field aliases to dynamic Tax__ keys */
  _resolveFieldAlias(rowObj, field) {
    if (!rowObj) return field;

    // If the field exists directly, use it
    if (rowObj.hasOwnProperty(field)) return field;

    // Normalize incoming field for case-insensitive comparison
    const lname = String(field || '').toLowerCase();

    // Basic fallback mapping to ensure core aliases resolve even if dynamic lookup fails
    const basicLegacyMap = { it: 'Tax__incomeTax', prsi: 'Tax__prsi', usc: 'Tax__usc', cgt: 'Tax__capitalGains' };
    if (basicLegacyMap[lname] && rowObj.hasOwnProperty(basicLegacyMap[lname])) return basicLegacyMap[lname];

    // Try to resolve legacy field names dynamically using the tax ruleset
    try {
      const config = this.simulationContext?.Config_instance || vm.runInContext('Config_instance', this.simulationContext);
      if (config) {
        const taxRuleSet = config.getCachedTaxRuleSet();
        if (taxRuleSet) {
          // Gather candidate tax lists
          const groups = [
            taxRuleSet.getSocialContributions && taxRuleSet.getSocialContributions(),
            taxRuleSet.getAdditionalTaxes && taxRuleSet.getAdditionalTaxes()
          ];

          for (const group of groups) {
            if (!Array.isArray(group)) continue;
            for (const tax of group) {
              const tid = String(tax.id || '').toLowerCase();
              const tname = String(tax.name || '').toLowerCase();
              const tdisplay = String(tax.displayName || '').toLowerCase().replace(/\s+/g, '');

              if (lname === tid || lname === tname || (tdisplay && lname === tdisplay)) {
                const altKey = `Tax__${tax.id}`;
                if (rowObj.hasOwnProperty(altKey)) return altKey;
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore and fall through to final return
    }

    return field;
  }

  /**
   * Resolve a field to a value (supports dynamic per-key maps).
   *
   * Canonical dynamic syntax:
   * - investmentCapitalByKey:<baseKey>   (sums <baseKey> + <baseKey>_* keys)
   * - investmentIncomeByKey:<baseKey>    (sums <baseKey> + <baseKey>_* keys)
   * - investmentCapitalByKeyPV:<baseKey>
   * - investmentIncomeByKeyPV:<baseKey>
   *
   * Legacy aliases (kept for test compatibility):
   * - indexFundsCapital / sharesCapital
   * - incomeFundsRent / incomeSharesRent
   * - PV variants: *PV
   */
  _getFieldValue(rowObj, field) {
    if (!rowObj) return undefined;
    const f = String(field || '');

    const sumByPrefix = (map, baseKey) => {
      const m = map || {};
      let total = 0;
      for (const k in m) {
        if (k === baseKey || (baseKey && k.indexOf(baseKey + '_') === 0)) {
          total += m[k] || 0;
        }
      }
      return total;
    };

    if (f.indexOf('investmentCapitalByKeyPV:') === 0) {
      const baseKey = f.split(':')[1] || '';
      return sumByPrefix(rowObj.investmentCapitalByKeyPV, baseKey);
    }
    if (f.indexOf('investmentIncomeByKeyPV:') === 0) {
      const baseKey = f.split(':')[1] || '';
      return sumByPrefix(rowObj.investmentIncomeByKeyPV, baseKey);
    }
    if (f.indexOf('investmentCapitalByKey:') === 0) {
      const baseKey = f.split(':')[1] || '';
      return sumByPrefix(rowObj.investmentCapitalByKey, baseKey);
    }
    if (f.indexOf('investmentIncomeByKey:') === 0) {
      const baseKey = f.split(':')[1] || '';
      return sumByPrefix(rowObj.investmentIncomeByKey, baseKey);
    }

    // Legacy test aliases
    if (f === 'indexFundsCapital') return sumByPrefix(rowObj.investmentCapitalByKey, 'indexFunds');
    if (f === 'sharesCapital') return sumByPrefix(rowObj.investmentCapitalByKey, 'shares');
    if (f === 'incomeFundsRent') return sumByPrefix(rowObj.investmentIncomeByKey, 'indexFunds');
    if (f === 'incomeSharesRent') return sumByPrefix(rowObj.investmentIncomeByKey, 'shares');
    if (f === 'indexFundsCapitalPV') return sumByPrefix(rowObj.investmentCapitalByKeyPV, 'indexFunds');
    if (f === 'sharesCapitalPV') return sumByPrefix(rowObj.investmentCapitalByKeyPV, 'shares');
    if (f === 'incomeFundsRentPV') return sumByPrefix(rowObj.investmentIncomeByKeyPV, 'indexFunds');
    if (f === 'incomeSharesRentPV') return sumByPrefix(rowObj.investmentIncomeByKeyPV, 'shares');

    const key = this._resolveFieldAlias(rowObj, field);
    return rowObj[key];
  }

  /**
   * Get the final value of a field from the data sheet
   */
  getFinalValue(dataSheet, field) {
    if (!dataSheet || dataSheet.length === 0) {
      throw new Error('Empty data sheet');
    }
    // Filter out empty/undefined items and get the last valid row
    const validRows = dataSheet.filter(r => r && typeof r === 'object');
    if (validRows.length === 0) {
      throw new Error('No valid data rows found');
    }
    const lastRow = validRows[validRows.length - 1];
    return this._getFieldValue(lastRow, field);
  }

  /**
   * Get the value of a field at a specific age
   */
  getValueAtAge(dataSheet, age, field) {
    // Filter out empty/undefined items and find the row with the matching age
    const row = dataSheet.filter(r => r && typeof r === 'object').find(r => r.age === age);
    if (!row) {
      throw new Error(`No data found for age ${age}`);
    }
    return this._getFieldValue(row, field);
  }

  /**
   * Get the value of a field at a specific row index
   */
  getValueAtRow(dataSheet, rowIndex, field) {
    // Filter out empty/undefined items to get valid rows
    const validRows = dataSheet.filter(r => r && typeof r === 'object');
    if (rowIndex >= validRows.length) {
      throw new Error(`Row index ${rowIndex} out of bounds (valid rows: ${validRows.length})`);
    }
    const row = validRows[rowIndex];
    return this._getFieldValue(row, field);
  }

  /**
   * Validate exact value with tolerance
   */
  validateExactValue(actual, expected, tolerance) {
    const diff = Math.abs(actual - expected);
    const success = diff <= tolerance;

    return {
      success: success,
      actual: actual,
      expected: expected,
      message: success ? `Value ${actual} matches expected ${expected} within tolerance ${tolerance}` : `Value ${actual} does not match expected ${expected} (diff: ${diff}, tolerance: ${tolerance})`,
      error: success ? null : `Expected ${expected} ± ${tolerance}, got ${actual}`
    };
  }

  /**
   * Validate value is within range
   */
  validateRange(actual, min, max) {
    const success = actual >= min && actual <= max;

    return {
      success: success,
      actual: actual,
      expected: { min, max },
      message: success ? `Value ${actual} is within range [${min}, ${max}]` : `Value ${actual} is outside range [${min}, ${max}]`,
      error: success ? null : `Expected value between ${min} and ${max}, got ${actual}`
    };
  }

  /**
   * Validate comparison operation
   */
  validateComparison(actual, operator, value) {
    let success = false;

    switch (operator) {
      case '>':
        success = actual > value;
        break;
      case '>=':
        success = actual >= value;
        break;
      case '<':
        success = actual < value;
        break;
      case '<=':
        success = actual <= value;
        break;
      case '==':
        success = actual === value;
        break;
      case '!=':
        success = actual !== value;
        break;
      default:
        throw new Error(`Unknown comparison operator: ${operator}`);
    }

    return {
      success: success,
      actual: actual,
      expected: { operator, value },
      message: success ? `${actual} ${operator} ${value} is true` : `${actual} ${operator} ${value} is false`,
      error: success ? null : `Expected ${actual} ${operator} ${value} to be true`
    };
  }

  /**
   * Validate trend over time
   */
  validateTrend(dataSheet, field, expected) {
    // Use alias resolution so legacy names (e.g., 'it', 'prsi', 'usc') work
    const values = dataSheet.map(row => {
      const key = this._resolveFieldAlias(row, field);
      return row ? row[key] : undefined;
    });

    let success = false;
    let message = '';

    switch (expected.direction) {
      case 'increasing':
        success = this.isIncreasing(values);
        message = success ? `${field} trend is increasing` : `${field} trend is not consistently increasing`;
        break;
      case 'decreasing':
        success = this.isDecreasing(values);
        message = success ? `${field} trend is decreasing` : `${field} trend is not consistently decreasing`;
        break;
      case 'stable':
        success = this.isStable(values, expected.tolerance || 0.1);
        message = success ? `${field} trend is stable` : `${field} trend is not stable`;
        break;
      default:
        throw new Error(`Unknown trend direction: ${expected.direction}`);
    }

    return {
      success: success,
      actual: values,
      expected: expected,
      message: message,
      error: success ? null : message
    };
  }

  /**
   * Check if values are generally increasing
   */
  isIncreasing(values) {
    let increasing = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[i - 1]) increasing++;
    }
    return increasing > values.length * 0.7; // 70% should be increasing
  }

  /**
   * Check if values are generally decreasing
   */
  isDecreasing(values) {
    let decreasing = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] < values[i - 1]) decreasing++;
    }
    return decreasing > values.length * 0.7; // 70% should be decreasing
  }

  /**
   * Check if values are stable within tolerance
   */
  isStable(values, tolerance) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.every(val => Math.abs(val - mean) / mean <= tolerance);
  }

  /**
   * Generate a comprehensive test report
   * @param {string} format - Report format ('console', 'json', 'csv')
   * @returns {string|Object} - Formatted report
   */
  generateReport(format = 'console') {
    if (!this.currentTest) {
      return 'No test results available';
    }

    const test = this.currentTest;
    const reportData = {
      testName: test.name,
      description: test.description,
      success: test.success,
      executionTime: test.endTime - test.startTime,
      errors: test.errors,
      assertionResults: null
    };

    // If we have results, include assertion validation
    if (test.results) {
      const validationResults = this.validateAssertions();
      reportData.assertionResults = validationResults;
    }

    switch (format) {
      case 'json':
        return JSON.stringify(reportData, null, 2);
      case 'csv':
        return this.generateCSVReport(reportData);
      case 'console':
      default:
        return this.generateConsoleReport(reportData);
    }
  }

  /**
   * Generate console-formatted report
   */
  generateConsoleReport(reportData) {
    let report = '\n';
    report += '='.repeat(80) + '\n';
    report += `TEST REPORT: ${reportData.testName}\n`;
    report += '='.repeat(80) + '\n';
    report += `Description: ${reportData.description}\n`;
    report += `Execution Time: ${reportData.executionTime}ms\n`;
    report += `Overall Success: ${reportData.success ? '✓ PASS' : '✗ FAIL'}\n`;

    if (reportData.errors && reportData.errors.length > 0) {
      report += '\nERRORS:\n';
      reportData.errors.forEach(error => {
        report += `  ✗ ${error}\n`;
      });
    }

    if (reportData.assertionResults) {
      const ar = reportData.assertionResults;
      report += `\nASSERTIONS: ${ar.passedAssertions}/${ar.totalAssertions} passed\n`;

      if (ar.failures.length > 0) {
        report += '\nFAILED ASSERTIONS:\n';
        ar.failures.forEach((failure, index) => {
          report += `  ${index + 1}. ${failure.assertion.field} (${failure.assertion.type})\n`;
          report += `     Error: ${failure.error}\n`;
          if (failure.actual !== undefined) {
            report += `     Actual: ${failure.actual}\n`;
            report += `     Expected: ${JSON.stringify(failure.expected)}\n`;
          }
        });
      }
    }

    report += '\n' + '='.repeat(80) + '\n';
    return report;
  }

  /**
   * Generate CSV-formatted report
   */
  generateCSVReport(reportData) {
    let csv = 'TestName,Description,Success,ExecutionTime,Errors\n';
    csv += `"${reportData.testName}","${reportData.description}",${reportData.success},${reportData.executionTime},"${reportData.errors.join('; ')}"\n`;
    return csv;
  }

  /**
   * Set verbose mode for detailed logging
   */
  setVerbose(verbose) {
    this.verbose = verbose;
  }

  /**
   * Run a complete test (load scenario, run simulation, validate assertions, generate report)
   * @param {Object} scenarioDefinition - Complete test scenario
   * @param {string} reportFormat - Report format
   * @returns {Object} - Test results with report
   */
  async runCompleteTest(scenarioDefinition, reportFormat = 'console') {
    const success = this.loadScenario(scenarioDefinition);
    if (!success) {
      return { success: false, error: 'Failed to load scenario', report: null };
    }

    const results = await this.runSimulation();
    if (!results) {
      return { success: false, error: 'Simulation failed', report: this.generateReport(reportFormat) };
    }

    // Call debug output function if it exists in the scenario definition
    if (scenarioDefinition.debugOutput && typeof scenarioDefinition.debugOutput === 'function') {
      scenarioDefinition.debugOutput(results.dataSheet);
    }

    const validationResults = this.validateAssertions();
    const report = this.generateReport(reportFormat);

    return {
      success: validationResults.success,
      results: results,
      validationResults: validationResults,
      report: report,
      executionTime: this.currentTest.endTime - this.currentTest.startTime
    };
  }
}

// Export for Node.js
module.exports = { TestFramework, AssertionTypes, TargetTypes }; 
