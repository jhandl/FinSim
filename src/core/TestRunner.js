#!/usr/bin/env node

/* Test Runner for FinSim - Command line test execution with discovery and reporting
 * 
 * This file provides a command line interface for running FinSim tests with features including:
 * - Test discovery from files and directories
 * - Progress reporting with real-time updates
 * - Failure summarization and detailed logging
 * - CSV/JSON output options for automated analysis
 * - Command line arguments for filtering tests by name or category
 */

const fs = require('fs');
const path = require('path');
const { TestFramework, AssertionTypes, TargetTypes } = require('./TestFramework.js');
const { FormatUtils } = require('./TestUtils.js');

// =============================================================================
// COMMAND LINE ARGUMENT PARSING
// =============================================================================

class ArgParser {
  static parse(args) {
    const options = {
      // Test execution options
      pattern: null,           // Test name pattern to match
      category: null,          // Test category filter
      suite: null,             // Specific test suite to run
      directory: '../tests',   // Directory to search for tests
      
      // Output options
      format: 'console',       // Output format: console, json, csv
      output: null,            // Output file path
      verbose: false,          // Detailed logging
      quiet: false,            // Minimal output
      
      // Execution options
      failFast: false,         // Stop on first failure
      timeout: 30000,          // Test timeout in milliseconds
      
      // Reporting options
      summary: true,           // Show summary table
      details: true,           // Show detailed results
      progressBar: true,       // Show progress during execution
      
      // Help and version
      help: false,
      version: false,
      list: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const nextArg = args[i + 1];

      // Handle --key=value format
      if (arg.includes('=')) {
        const [key, value] = arg.split('=', 2);
        switch (key) {
          case '--pattern':
          case '-p':
            options.pattern = value;
            break;
          case '--category':
          case '-c':
            options.category = value;
            break;
          case '--suite':
          case '-s':
            options.suite = value;
            break;
          case '--directory':
          case '-d':
            options.directory = value;
            break;
          case '--format':
          case '-f':
            options.format = value;
            break;
          case '--output':
          case '-o':
            options.output = value;
            break;
          case '--timeout':
          case '-t':
            options.timeout = parseInt(value) || 30000;
            break;
          default:
            console.error(`Unknown option: ${key}`);
            process.exit(1);
        }
        continue;
      }

      switch (arg) {
        case '--pattern':
        case '-p':
          options.pattern = nextArg;
          i++;
          break;
        case '--category':
        case '-c':
          options.category = nextArg;
          i++;
          break;
        case '--suite':
        case '-s':
          options.suite = nextArg;
          i++;
          break;
        case '--directory':
        case '-d':
          options.directory = nextArg;
          i++;
          break;
        case '--format':
        case '-f':
          options.format = nextArg;
          i++;
          break;
        case '--output':
        case '-o':
          options.output = nextArg;
          i++;
          break;
        case '--verbose':
        case '-v':
          options.verbose = true;
          break;
        case '--quiet':
        case '-q':
          options.quiet = true;
          break;
        case '--fail-fast':
          options.failFast = true;
          break;
        case '--no-summary':
          options.summary = false;
          break;
        case '--no-details':
          options.details = false;
          break;
        case '--no-progress':
          options.progressBar = false;
          break;
        case '--timeout':
        case '-t':
          options.timeout = parseInt(nextArg) || 30000;
          i++;
          break;
        case '--help':
        case '-h':
          options.help = true;
          break;
        case '--version':
          options.version = true;
          break;
        case '--list':
          options.list = true;
          break;
        default:
          if (arg.startsWith('-')) {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
          }
          // Treat as test name pattern if no pattern specified
          if (!options.pattern) {
            options.pattern = arg;
          }
          break;
      }
    }

    return options;
  }

  static showHelp() {
    console.log(`
FinSim Test Runner - Execute financial simulation tests

USAGE:
  node TestRunner.js [OPTIONS] [PATTERN]

TEST SELECTION:
  -p, --pattern <pattern>    Run tests matching name pattern
  -c, --category <category>  Run tests in specific category (tax, pension, etc.)
  -s, --suite <suite>        Run specific test suite file
  -d, --directory <dir>      Directory to search for tests (default: ../tests)

OUTPUT OPTIONS:
  -f, --format <format>      Output format: console, json, csv (default: console)
  -o, --output <file>        Write results to file instead of stdout
  -v, --verbose              Show detailed logging
  -q, --quiet                Minimal output (errors only)

EXECUTION OPTIONS:
  --fail-fast                Stop execution on first test failure
  -t, --timeout <ms>         Test timeout in milliseconds (default: 30000)
  --no-progress              Disable progress bar
  --no-summary               Skip summary table
  --no-details               Skip detailed results

INFORMATION:
  -h, --help                 Show this help message
  --version                  Show version information
  --list                     List available tests without running them

EXAMPLES:
  node TestRunner.js                           # Run all tests
  node TestRunner.js --list                    # List all available tests
  node TestRunner.js --pattern="tax"           # Run tests with 'tax' in name
  node TestRunner.js --category=pension        # Run pension-related tests
  node TestRunner.js --format=json -o results.json  # Export to JSON
  node TestRunner.js --verbose --fail-fast     # Detailed output, stop on failure
  node TestRunner.js BasicTaxCalculation       # Run specific test

CATEGORIES:
  tax       - Irish tax system validation tests
  pension   - Pension contribution and drawdown tests
  real-estate - Property purchase, sale, and mortgage tests
  investment - Index funds and shares investment tests
  life-scenario - Complex multi-event life scenarios
  integration - End-to-end integration tests
  edge-case - Boundary condition and error handling tests
`);
  }

  static showVersion() {
    console.log('FinSim Test Runner v1.0.0');
    console.log('Compatible with FinSim Financial Simulator');
  }
}

// =============================================================================
// TEST DISCOVERY AND LOADING
// =============================================================================

class TestDiscovery {
  
  static async discoverTests(options) {
    const tests = [];
    
    // If specific suite specified, load only that file
    if (options.suite) {
      const suitePath = this.resolveSuitePath(options.suite, options.directory);
      if (suitePath) {
        const suiteTests = await this.loadTestSuite(suitePath);
        tests.push(...suiteTests);
      }
      return this.filterTests(tests, options);
    }

    // Otherwise, discover all test files
    const testFiles = await this.findTestFiles(options.directory);
    
    for (const testFile of testFiles) {
      try {
        const suiteTests = await this.loadTestSuite(testFile);
        tests.push(...suiteTests);
      } catch (error) {
        console.warn(`Warning: Failed to load test suite ${testFile}: ${error.message}`);
      }
    }

    return this.filterTests(tests, options);
  }

  static async findTestFiles(directory) {
    const testFiles = [];
    
    if (!fs.existsSync(directory)) {
      console.warn(`Directory does not exist: ${directory}`);
      return testFiles;
    }

    const files = fs.readdirSync(directory);
    console.log(`Found files in ${directory}:`, files);
    
    for (const file of files) {
      const filePath = path.join(directory, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        // Recursively search subdirectories
        const subTests = await this.findTestFiles(filePath);
        testFiles.push(...subTests);
      } else if (this.isTestFile(file)) {
        console.log(`Found test file: ${file}`);
        testFiles.push(filePath);
      } else {
        console.log(`Skipping non-test file: ${file}`);
      }
    }
    
    return testFiles;
  }

  static isTestFile(filename) {
    const testPatterns = [
      /^Test.*\.js$/,           // TestSomething.js
      /.*Test\.js$/,            // SomethingTest.js  
      /.*\.test\.js$/,          // something.test.js
      /^test-.*\.js$/           // test-something.js
    ];
    
    return testPatterns.some(pattern => pattern.test(filename));
  }

  static async loadTestSuite(filePath) {
    try {
      // Resolve the absolute path for require
      const absolutePath = path.resolve(filePath);
      
      // Clear require cache to ensure fresh load
      delete require.cache[absolutePath];
      
      // Require the test file
      const testModule = require(absolutePath);
      
      // Handle both module.exports and named exports
      const testDefinition = testModule.default || testModule;
      
      // Ensure it's a valid test definition
      if (!testDefinition || !testDefinition.name || !testDefinition.scenario) {
        throw new Error(`Invalid test definition in ${filePath}: missing name or scenario`);
      }
      
      // Return as array for consistency with discovery API
      return [{
        name: testDefinition.name,
        category: testDefinition.category || 'other',
        filePath: filePath,
        scenario: testDefinition
      }];
      
    } catch (error) {
      throw new Error(`Failed to load test suite from ${filePath}: ${error.message}`);
    }
  }

  static createMockTestSuite(filePath) {
    const filename = path.basename(filePath, '.js');
    const category = this.inferCategoryFromFilename(filename);
    
    // Create mock tests based on filename
    const tests = [];
    
    if (filename.includes('Tax') || category === 'tax') {
      tests.push({
        name: 'Basic Tax Calculation',
        category: 'tax',
        filePath: filePath,
        scenario: this.createMockTaxScenario()
      });
    }
    
    if (filename.includes('Pension') || category === 'pension') {
      tests.push({
        name: 'Pension Contribution Validation',
        category: 'pension', 
        filePath: filePath,
        scenario: this.createMockPensionScenario()
      });
    }

    return tests;
  }

  static createMockTaxScenario() {
    return {
      name: "Basic Tax Calculation",
      description: "Validates Irish income tax, PRSI, and USC calculations",
      scenario: {
        parameters: { startingAge: 30, targetAge: 35, initialSavings: 10000 },
        events: [
          { type: 'SI', id: 'salary', amount: 60000, fromAge: 30, toAge: 34, rate: 0.03, match: 0.06 }
        ]
      },
      assertions: [
        { type: 'exact_value', target: 'final', field: 'it', expected: 8250, tolerance: 50 },
        { type: 'exact_value', target: 'final', field: 'prsi', expected: 2400, tolerance: 10 },
        { type: 'comparison', target: 'final', field: 'netIncome', expected: { operator: '>', value: 40000 } }
      ]
    };
  }

  static createMockPensionScenario() {
    return {
      name: "Pension Contribution Validation", 
      description: "Validates pension contributions and employer matching",
      scenario: {
        parameters: { startingAge: 35, targetAge: 40, initialSavings: 20000 },
        events: [
          { type: 'SI', id: 'job', amount: 80000, fromAge: 35, toAge: 39, rate: 0.04, match: 0.08 }
        ]
      },
      assertions: [
        { type: 'comparison', target: 'final', field: 'pensionFund', expected: { operator: '>', value: 50000 } },
        { type: 'exact_value', target: 'age', age: 36, field: 'pensionContribution', expected: 16000, tolerance: 100 }
      ]
    };
  }

  static inferCategoryFromFilename(filename) {
    const categoryMap = {
      'tax': ['tax', 'income', 'prsi', 'usc', 'cgt'],
      'pension': ['pension', 'retirement', 'contribution'],
      'real-estate': ['real', 'estate', 'property', 'mortgage', 'house'],
      'investment': ['investment', 'funds', 'shares', 'equity'],
      'life-scenario': ['life', 'scenario', 'complete'],
      'integration': ['integration', 'end-to-end', 'e2e'],
      'edge-case': ['edge', 'boundary', 'error', 'exception']
    };

    const lowerFilename = filename.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categoryMap)) {
      if (keywords.some(keyword => lowerFilename.includes(keyword))) {
        return category;
      }
    }
    
    return 'other';
  }

  static resolveSuitePath(suite, directory) {
    // Try different combinations to find the test suite file
    const possiblePaths = [
      suite,
      path.join(directory, suite),
      path.join(directory, `${suite}.js`),
      path.join(directory, `Test${suite}.js`),
      path.join(directory, `${suite}Test.js`),
      path.join(directory, `test-${suite}.js`)
    ];

    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        return testPath;
      }
    }

    console.error(`Test suite not found: ${suite}`);
    return null;
  }

  static filterTests(tests, options) {
    let filtered = tests;

    // Filter by pattern
    if (options.pattern) {
      const pattern = new RegExp(options.pattern, 'i');
      filtered = filtered.filter(test => pattern.test(test.name));
    }

    // Filter by category
    if (options.category) {
      filtered = filtered.filter(test => test.category === options.category);
    }

    return filtered;
  }
}

// =============================================================================
// PROGRESS REPORTING
// =============================================================================

class ProgressReporter {
  
  constructor(options) {
    this.options = options;
    this.totalTests = 0;
    this.completedTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.startTime = null;
    this.showProgress = options.progressBar && !options.quiet;
  }

  start(totalTests) {
    this.totalTests = totalTests;
    this.startTime = Date.now();
    
    if (!this.options.quiet) {
      console.log(`\n🧪 Running ${totalTests} test${totalTests === 1 ? '' : 's'}...\n`);
    }
    
    if (this.showProgress) {
      this.updateProgress();
    }
  }

  testStarted(testName) {
    if (this.options.verbose) {
      console.log(`\n▶️  Starting: ${testName}`);
    }
  }

  testCompleted(testName, success, executionTime) {
    this.completedTests++;
    
    if (success) {
      this.passedTests++;
    } else {
      this.failedTests++;
    }

    if (this.options.verbose) {
      const status = success ? '✅ PASSED' : '❌ FAILED';
      console.log(`   ${status}: ${testName} (${FormatUtils.formatExecutionTime(executionTime)})`);
    } else if (!this.options.quiet) {
      process.stdout.write(success ? '.' : 'F');
    }

    if (this.showProgress) {
      this.updateProgress();
    }
  }

  updateProgress() {
    if (this.options.quiet || !this.showProgress) return;

    const percentage = Math.round((this.completedTests / this.totalTests) * 100);
    const elapsed = Date.now() - this.startTime;
    const estimated = this.completedTests > 0 ? (elapsed / this.completedTests) * this.totalTests : 0;
    const remaining = Math.max(0, estimated - elapsed);

    const progressBar = this.createProgressBar(percentage);
    const status = `${this.completedTests}/${this.totalTests} (${percentage}%) - ` +
                   `${this.passedTests} passed, ${this.failedTests} failed - ` +
                   `ETA: ${FormatUtils.formatExecutionTime(remaining)}`;

    if (!this.options.verbose) {
      process.stdout.write(`\r${progressBar} ${status}`);
    }
  }

  createProgressBar(percentage, width = 30) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}]`;
  }

  finish() {
    const totalTime = Date.now() - this.startTime;
    
    if (!this.options.quiet) {
      if (this.showProgress && !this.options.verbose) {
        console.log(); // New line after progress bar
      }
      
      console.log(`\n⏱️  Completed in ${FormatUtils.formatExecutionTime(totalTime)}`);
      console.log(`📊 Results: ${this.passedTests} passed, ${this.failedTests} failed, ${this.totalTests} total`);
    }

    return {
      totalTests: this.totalTests,
      passedTests: this.passedTests,
      failedTests: this.failedTests,
      executionTime: totalTime
    };
  }
}

// =============================================================================
// MAIN TEST RUNNER CLASS
// =============================================================================

class TestRunner {
  
  constructor(options) {
    this.options = options;
    this.testFramework = new TestFramework();
    this.progressReporter = new ProgressReporter(options);
    this.results = [];
    this.failureDetails = [];
  }

  async run() {
    try {
      // Configure test framework
      this.testFramework.setVerbose(this.options.verbose);

      // Discover tests
      const tests = await TestDiscovery.discoverTests(this.options);
      
      if (tests.length === 0) {
        console.log('No tests found matching the specified criteria.');
        return this.generateSummary();
      }

      // Start progress reporting
      this.progressReporter.start(tests.length);

      // Execute tests
      for (const test of tests) {
        if (this.options.failFast && this.progressReporter.failedTests > 0) {
          if (!this.options.quiet) {
            console.log('\n🛑 Stopping execution due to --fail-fast option');
          }
          break;
        }

        await this.runSingleTest(test);
      }

      // Generate and output results
      return this.generateSummary();

    } catch (error) {
      console.error(`❌ Test runner error: ${error.message}`);
      if (this.options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  async runSingleTest(test) {
    this.progressReporter.testStarted(test.name);

    try {
      // Set up timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Test timeout after ${this.options.timeout}ms`)), this.options.timeout);
      });

      // Run test with timeout
      const testPromise = this.testFramework.runCompleteTest(test.scenario);
      const result = await Promise.race([testPromise, timeoutPromise]);

      // Store results
      this.results.push({
        name: test.name,
        category: test.category,
        filePath: test.filePath,
        success: result.success,
        executionTime: result.executionTime,
        assertionResults: result.validationResults,
        errors: result.error ? [result.error] : []
      });

      // Track failures for detailed reporting
      if (!result.success) {
        this.failureDetails.push({
          name: test.name,
          category: test.category,
          error: result.error,
          validationResults: result.validationResults,
          report: result.report
        });
      }

      this.progressReporter.testCompleted(test.name, result.success, result.executionTime);

    } catch (error) {
      // Handle test execution errors
      this.results.push({
        name: test.name,
        category: test.category,
        filePath: test.filePath,
        success: false,
        executionTime: 0,
        assertionResults: null,
        errors: [error.message]
      });

      this.failureDetails.push({
        name: test.name,
        category: test.category,
        error: error.message,
        validationResults: null,
        report: null
      });

      this.progressReporter.testCompleted(test.name, false, 0);
    }
  }

  generateSummary() {
    const summary = this.progressReporter.finish();
    
    // Generate detailed output based on format
    let output = '';
    
    switch (this.options.format) {
      case 'json':
        output = this.generateJSONOutput(summary);
        break;
      case 'csv':
        output = this.generateCSVOutput(summary);
        break;
      case 'console':
      default:
        output = this.generateConsoleOutput(summary);
        break;
    }

    // Write output
    if (this.options.output) {
      fs.writeFileSync(this.options.output, output);
      if (!this.options.quiet) {
        console.log(`📄 Results written to ${this.options.output}`);
      }
    } else if (this.options.format !== 'console') {
      console.log(output);
    }

    // Return exit code
    return summary.failedTests > 0 ? 1 : 0;
  }

  generateConsoleOutput(summary) {
    let output = '';

    if (!this.options.quiet) {
      // Summary table
      if (this.options.summary && this.results.length > 0) {
        output += '\n📋 Test Summary:\n';
        output += FormatUtils.createSummaryTable(this.results);
      }

      // Failure details
      if (this.options.details && this.failureDetails.length > 0) {
        output += '\n❌ Failed Tests:\n';
        output += '='.repeat(80) + '\n';
        
        this.failureDetails.forEach((failure, index) => {
          output += `\n${index + 1}. ${failure.name} (${failure.category})\n`;
          output += '-'.repeat(50) + '\n';
          
          if (failure.error) {
            output += `Error: ${failure.error}\n`;
          }
          
          if (failure.validationResults && failure.validationResults.failures) {
            output += 'Failed Assertions:\n';
            failure.validationResults.failures.forEach((assertionFailure, idx) => {
              output += `  ${idx + 1}. ${assertionFailure.assertion.field}: ${assertionFailure.error}\n`;
            });
          }
        });
      }

      // Final status
      const status = summary.failedTests === 0 ? '🎉 All tests passed!' : `💥 ${summary.failedTests} test(s) failed`;
      output += `\n${status}\n`;
    }

    return output;
  }

  generateJSONOutput(summary) {
    return JSON.stringify({
      summary: summary,
      results: this.results,
      failures: this.failureDetails,
      timestamp: new Date().toISOString(),
      options: this.options
    }, null, 2);
  }

  generateCSVOutput(summary) {
    let csv = 'Name,Category,Success,ExecutionTime,Assertions,Errors\n';
    
    for (const result of this.results) {
      const assertions = result.assertionResults 
        ? `${result.assertionResults.passedAssertions}/${result.assertionResults.totalAssertions}`
        : 'N/A';
      const errors = result.errors.join('; ').replace(/"/g, '""');
      
      csv += `"${result.name}","${result.category}",${result.success},${result.executionTime},"${assertions}","${errors}"\n`;
    }
    
    return csv;
  }
}

// =============================================================================
// CLI HELPER FUNCTIONS
// =============================================================================

async function listAvailableTests(options) {
  console.log('🔍 Discovering available tests...\n');
  console.log('Working directory:', process.cwd());
  console.log('Search directory:', options.directory);
  console.log('Resolved path:', path.resolve(options.directory));
  
  try {
    const tests = await TestDiscovery.discoverTests(options);
    
    if (tests.length === 0) {
      console.log('❌ No tests found.');
      console.log(`   Directory searched: ${options.directory}`);
      console.log('   Patterns searched for: Test*.js, *Test.js, *.test.js, test-*.js');
      return;
    }

    console.log(`📋 Found ${tests.length} test(s):\n`);
    
    // Group tests by category
    const testsByCategory = {};
    tests.forEach(test => {
      if (!testsByCategory[test.category]) {
        testsByCategory[test.category] = [];
      }
      testsByCategory[test.category].push(test);
    });

    // Display tests grouped by category
    for (const [category, categoryTests] of Object.entries(testsByCategory)) {
      console.log(`📂 ${category.toUpperCase()} (${categoryTests.length} test${categoryTests.length === 1 ? '' : 's'})`);
      categoryTests.forEach(test => {
        const fileName = path.basename(test.filePath);
        console.log(`   ✓ ${test.name} (${fileName})`);
      });
      console.log('');
    }

    console.log(`💡 Run specific tests with: ./run-tests.sh <pattern>`);
    console.log(`💡 Run by category with: ./run-tests.sh --category=<category>`);
    
  } catch (error) {
    console.error(`❌ Error discovering tests: ${error.message}`);
  }
}

// =============================================================================
// CLI ENTRY POINT
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options = ArgParser.parse(args);

  if (options.help) {
    ArgParser.showHelp();
    process.exit(0);
  }

  if (options.version) {
    ArgParser.showVersion();
    process.exit(0);
  }

  if (options.list) {
    await listAvailableTests(options);
    process.exit(0);
  }

  // Validate options
  if (!['console', 'json', 'csv'].includes(options.format)) {
    console.error(`Invalid format: ${options.format}. Must be one of: console, json, csv`);
    process.exit(1);
  }

  if (options.quiet && options.verbose) {
    console.error('Cannot use both --quiet and --verbose options');
    process.exit(1);
  }

  // Run tests
  const runner = new TestRunner(options);
  const exitCode = await runner.run();
  process.exit(exitCode);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

// Export for testing
module.exports = { TestRunner, TestDiscovery, ProgressReporter, ArgParser }; 