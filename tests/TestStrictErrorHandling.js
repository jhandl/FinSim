// Custom test for strict error handling - validates fail-fast behavior
// Ensures missing infrastructure throws exceptions (not silent failures)

const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'StrictErrorHandling',
  description: 'Validates fail-fast behavior for missing infrastructure',
  isCustomTest: true,
  runCustomTest: async function() {
    const testResults = { success: true, errors: [] };
    const framework = new TestFramework();

    try {
      // Load core modules to get access to Simulator functions
      if (!framework.loadCoreModules()) {
        testResults.success = false;
        testResults.errors.push('Failed to load core modules');
        return testResults;
      }

      const ctx = framework.simulationContext;

      // Test 1: normalizeCountry throws on null/undefined
      try {
        vm.runInContext('normalizeCountry(null)', ctx);
        testResults.success = false;
        testResults.errors.push('normalizeCountry(null) should throw but did not');
      } catch (e) {
        if (!e.message || !e.message.includes('normalizeCountry')) {
          testResults.success = false;
          testResults.errors.push(`normalizeCountry(null) threw unexpected error: ${e.message}`);
        }
      }

      try {
        vm.runInContext('normalizeCountry(undefined)', ctx);
        testResults.success = false;
        testResults.errors.push('normalizeCountry(undefined) should throw but did not');
      } catch (e) {
        if (!e.message || !e.message.includes('normalizeCountry')) {
          testResults.success = false;
          testResults.errors.push(`normalizeCountry(undefined) threw unexpected error: ${e.message}`);
        }
      }

      // Test 2: normalizeCurrency throws on null/undefined
      try {
        vm.runInContext('normalizeCurrency(null)', ctx);
        testResults.success = false;
        testResults.errors.push('normalizeCurrency(null) should throw but did not');
      } catch (e) {
        if (!e.message || !e.message.includes('normalizeCurrency')) {
          testResults.success = false;
          testResults.errors.push(`normalizeCurrency(null) threw unexpected error: ${e.message}`);
        }
      }

      try {
        vm.runInContext('normalizeCurrency(undefined)', ctx);
        testResults.success = false;
        testResults.errors.push('normalizeCurrency(undefined) should throw but did not');
      } catch (e) {
        if (!e.message || !e.message.includes('normalizeCurrency')) {
          testResults.success = false;
          testResults.errors.push(`normalizeCurrency(undefined) threw unexpected error: ${e.message}`);
        }
      }

      // Test 3: getCurrencyForCountry throws on empty country code
      // First, ensure Config is initialized and set up with a minimal tax ruleset
      framework.ensureVMUIManagerMocks(null, null);
      await vm.runInContext('Config.initialize(WebUI.getInstance())', ctx);
      
      const rulesPath = path.join(__dirname, '..', 'src', 'core', 'config', 'tax-rules-ie.json');
      const rulesRaw = fs.readFileSync(rulesPath, 'utf8');
      
      vm.runInContext(`
        if (!Config_instance._taxRuleSets) {
          Config_instance._taxRuleSets = {};
        }
        if (!Config_instance._taxRuleSets['ie']) {
          var rulesRaw = ${JSON.stringify(rulesRaw)};
          Config_instance._taxRuleSets['ie'] = new TaxRuleSet(JSON.parse(rulesRaw));
        }
      `, ctx);

      // Test with empty string (which normalizes to empty after trim)
      try {
        vm.runInContext('getCurrencyForCountry("")', ctx);
        testResults.success = false;
        testResults.errors.push('getCurrencyForCountry("") should throw but did not');
      } catch (e) {
        if (!e.message || !e.message.includes('getCurrencyForCountry')) {
          testResults.success = false;
          testResults.errors.push(`getCurrencyForCountry("") threw unexpected error: ${e.message}`);
        }
      }

      // Test 4: convertNominal throws if EconomicData not ready
      // Override getEconomicData to return an EconomicData instance that's explicitly not ready
      vm.runInContext(`
        // convertNominal uses the global 'config' variable - set it to Config_instance
        config = Config_instance;
        // Store original getEconomicData
        var originalGetEconomicData = Config_instance.getEconomicData;
        // Override getEconomicData to return an EconomicData that's not ready
        Config_instance.getEconomicData = function() {
          var EconomicDataClass = (typeof EconomicData !== 'undefined') ? EconomicData : null;
          if (!EconomicDataClass) {
            // If EconomicData class is not available, return an object that will cause the check to fail
            return { ready: false };
          }
          var emptyEcon = new EconomicDataClass();
          emptyEcon.data = {};
          emptyEcon.ready = false;
          return emptyEcon;
        };
      `, ctx);

      try {
        const result = vm.runInContext('convertNominal(1000, "ie", "ie", 2020)', ctx);
        // If it didn't throw, the test failed
        testResults.success = false;
        testResults.errors.push(`convertNominal should throw when EconomicData not ready but returned: ${result}`);
      } catch (e) {
        // Expected: should throw an error about EconomicData not ready
        // Accept either the specific error message or a TypeError (if econ is null)
        if (!e.message) {
          testResults.success = false;
          testResults.errors.push(`convertNominal threw error without message: ${e}`);
        } else if (!e.message.includes('convertNominal') && !e.message.includes('EconomicData not ready') && !e.message.includes('Cannot read properties of null')) {
          testResults.success = false;
          testResults.errors.push(`convertNominal threw unexpected error: ${e.message}`);
        }
        // If it threw any error (including TypeError for null), that's acceptable - the important thing is it didn't return null silently
      } finally {
        // Restore original getEconomicData
        vm.runInContext(`
          if (typeof originalGetEconomicData !== 'undefined') {
            Config_instance.getEconomicData = originalGetEconomicData;
          }
        `, ctx);
      }

      // Test 5: Verify that normalizeCountry/normalizeCurrency work with valid inputs
      const validCountry = vm.runInContext('normalizeCountry("IE")', ctx);
      if (validCountry !== 'ie') {
        testResults.success = false;
        testResults.errors.push(`normalizeCountry("IE") should return "ie" but returned "${validCountry}"`);
      }

      const validCurrency = vm.runInContext('normalizeCurrency("eur")', ctx);
      if (validCurrency !== 'EUR') {
        testResults.success = false;
        testResults.errors.push(`normalizeCurrency("eur") should return "EUR" but returned "${validCurrency}"`);
      }

    } catch (error) {
      testResults.success = false;
      testResults.errors.push(`Test setup error: ${error.message}`);
      if (error.stack) {
        testResults.errors.push(`Stack: ${error.stack}`);
      }
    }

    return testResults;
  }
};

