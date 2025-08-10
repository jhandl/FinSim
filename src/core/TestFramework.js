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

// Configuration constants
const CONFIG_FILE_NAME = 'finsim-1.27.json';
const CONFIG_PATH = path.join(__dirname, 'config', CONFIG_FILE_NAME);

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
   * Reset the framework to a clean state for isolated tests
   */
  reset() {
    this.testResults = [];
    this.currentTest = null;
    this.coreModulesLoaded = false;
    // Important: Also reset the singleton instance in the VM context
    if (this.simulationContext && this.simulationContext.Config_instance) {
      this.simulationContext.Config_instance = null;
    }
    this.simulationContext = null;
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
        Math: Math,
        JSON: JSON,
        require: require,
        __dirname: __dirname,
        
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
        incomeFundsRent: 0,
        incomeSharesRent: 0,
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
        'Utils.js',
        'Config.js',
        'TaxRuleSet.js',
        'Attribution.js',
        'AttributionManager.js',
        'Revenue.js',
        'Equities.js', 
        'RealEstate.js',
        'Person.js',
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
      return null;
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
      // Set up the simulation parameters in the context
      vm.runInContext(`
        // Create a proper UIManager mock that matches the real UIManager interface
        function MockUIManager(mockUI) {
          this.ui = mockUI;
        }
        
        MockUIManager.prototype.updateProgress = function(status) {};
        MockUIManager.prototype.updateDataSheet = function(runs) {
          // Apply Monte Carlo averaging if we did multiple runs
          if (montecarlo && runs > 1) {
            for (let i = 1; i <= row; i++) {
              if (dataSheet[i]) {
                // Average all accumulated values by dividing by the number of runs
                dataSheet[i].age = dataSheet[i].age / runs;
                dataSheet[i].year = dataSheet[i].year / runs;
                dataSheet[i].incomeSalaries = dataSheet[i].incomeSalaries / runs;
                dataSheet[i].incomeRSUs = dataSheet[i].incomeRSUs / runs;
                dataSheet[i].incomeRentals = dataSheet[i].incomeRentals / runs;
                dataSheet[i].incomePrivatePension = dataSheet[i].incomePrivatePension / runs;
                dataSheet[i].incomeStatePension = dataSheet[i].incomeStatePension / runs;
                dataSheet[i].incomeFundsRent = dataSheet[i].incomeFundsRent / runs;
                dataSheet[i].incomeSharesRent = dataSheet[i].incomeSharesRent / runs;
                dataSheet[i].incomeCash = dataSheet[i].incomeCash / runs;
                dataSheet[i].realEstateCapital = dataSheet[i].realEstateCapital / runs;
                dataSheet[i].netIncome = dataSheet[i].netIncome / runs;
                dataSheet[i].expenses = dataSheet[i].expenses / runs;
          
                dataSheet[i].pensionFund = dataSheet[i].pensionFund / runs;
                dataSheet[i].cash = dataSheet[i].cash / runs;
                dataSheet[i].indexFundsCapital = dataSheet[i].indexFundsCapital / runs;
                dataSheet[i].sharesCapital = dataSheet[i].sharesCapital / runs;
                dataSheet[i].pensionContribution = dataSheet[i].pensionContribution / runs;
                dataSheet[i].withdrawalRate = dataSheet[i].withdrawalRate / runs;
                dataSheet[i].it = dataSheet[i].it / runs;
                dataSheet[i].prsi = dataSheet[i].prsi / runs;
                dataSheet[i].usc = dataSheet[i].usc / runs;
                dataSheet[i].cgt = dataSheet[i].cgt / runs;
                dataSheet[i].worth = dataSheet[i].worth / runs;
              }
            }
          }
        };
        MockUIManager.prototype.updateStatusCell = function(successes, runs) {};
        MockUIManager.prototype.clearWarnings = function() {};
        MockUIManager.prototype.setStatus = function(status, color) {};
        MockUIManager.prototype.saveToFile = function() {};
        MockUIManager.prototype.loadFromFile = function(file) {};
        MockUIManager.prototype.updateDataRow = function(row, progress) {};
        MockUIManager.prototype.readParameters = function(validate) { return params; };
        MockUIManager.prototype.readEvents = function(validate) { return events; };
        
        // Create mock UI object that loads the actual config
        var mockUI = {
          getVersion: function() { return '1.27'; },
          fetchUrl: function(url) {
            // Load the actual config file
            var fs = require('fs');
            var path = require('path');
            // Use the global CONFIG_PATH defined in TestFramework.js
            // We need to pass it into this scope or reconstruct it.
            // Simpler to reconstruct here if __dirname is the TestFramework.js dir
            var configPath = path.join(__dirname, 'config', 'finsim-1.27.json');
            return fs.readFileSync(configPath, 'utf8');
          },
          showAlert: function(msg) { console.warn(msg); },
          newCodeVersion: function() {},
          newDataVersion: function() {},
          clearVersionNote: function() {},
          setVersionHighlight: function() {}
        };
        
        // Set up STATUS_COLORS constant
        STATUS_COLORS = {
          ERROR: "#ff8080",
          WARNING: "#ffe066",
          SUCCESS: "#9fdf9f",
          INFO: "#E0E0E0",
          WHITE: "#FFFFFF"
        };
        
        // Set up UIManager and WebUI for the simulator
        UIManager = MockUIManager;
        WebUI = {
          getInstance: function() { return mockUI; }
        };
        
        uiManager = new UIManager(mockUI);

        // Set up parameters
        params = ${JSON.stringify(params)};
        
        // Convert event objects to SimEvent instances
        events = ${JSON.stringify(events)}.map(function(e) {
          return new SimEvent(e.type, e.id, e.amount, e.fromAge, e.toAge, e.rate, e.match);
        });

        // Initialize config
        config = {};
        Object.assign(config, JSON.parse(uiManager.ui.fetchUrl('')));
        
        // Initialize other required objects
        dataSheet = [];
        errors = false;
        
      `, this.simulationContext);

        // Set up Config instance with actual config data
        vm.runInContext(`
          // Set up Config instance with actual data
          Config_instance = Object.assign(new Config(mockUI), ${fs.readFileSync(CONFIG_PATH, 'utf8')});
          // Backward-compat: ensure simulationRuns exists for Monte Carlo tests when using older config files
          if (!Config_instance.simulationRuns || typeof Config_instance.simulationRuns !== 'number' || Config_instance.simulationRuns <= 0) {
            Config_instance.simulationRuns = 2000;
          }
          // Preload Irish tax ruleset into the Config cache for synchronous use
          try {
            const fs = require('fs');
            const path = require('path');
            const taxPath = path.join(__dirname, 'config', 'tax-rules-ie.json');
            const rawRules = JSON.parse(fs.readFileSync(taxPath, 'utf8'));
            const preloaded = new TaxRuleSet(rawRules);
            Config_instance._taxRuleSets = Config_instance._taxRuleSets || {};
            Config_instance._taxRuleSets['ie'] = preloaded;
          } catch (e) {
            // If preloading fails in tests, leave empty; some tests may not need it
          }
          
          // Override Config.getInstance to return our config
          Config.getInstance = function() {
            return Config_instance;
          };
        `, this.simulationContext);
        
        // Use the simulator - call run() just like the web UI does
        vm.runInContext(`
          function runTestSimulation() {
            var startTime = Date.now();
            
            try {
              run();
              
              return {
                dataSheet: dataSheet,
                success: success,
                failedAt: failedAt,
                executionTime: Date.now() - startTime
              };
            } catch (error) {
              console.error('Error in simulation:', error.message);
              console.error('Error stack:', error.stack);
              throw error;
            }
          }
          
          // Execute the simulation
          var simulationResults = runTestSimulation();
        `, this.simulationContext);

      // Extract results from context
      const results = vm.runInContext('simulationResults', this.simulationContext);
      
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
    return validRows[validRows.length - 1][field];
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
    return row[field];
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
    return validRows[rowIndex][field];
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
    // This is a simplified trend validation - could be enhanced
    const values = dataSheet.map(row => row[field]);
    
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
      if (values[i] > values[i-1]) increasing++;
    }
    return increasing > values.length * 0.7; // 70% should be increasing
  }

  /**
   * Check if values are generally decreasing
   */
  isDecreasing(values) {
    let decreasing = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] < values[i-1]) decreasing++;
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