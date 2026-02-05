// Custom test for RSU and Drawdown Priorities configuration

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');

module.exports = {
  name: 'RSUAndPriorities',
  description: 'Validates dynamic priority system: RSU filtering, multi-country baseType union, Priority_${baseType} fields',
  isCustomTest: true,
  runCustomTest: async function() {
    const testResults = { success: true, errors: [] };

    const countries = ['ie', 'us', 'ar'];
    const rulesets = {};

    try {
      // ---------------------------------------------------------
      // Section 1 & 2: Config Validation (Existing) + Section 3 Prep
      // ---------------------------------------------------------
      for (const code of countries) {
        const filePath = path.join(__dirname, '..', 'src', 'core', 'config', 'tax-rules-' + code + '.json');
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const ruleset = new TaxRuleSet(raw);
        rulesets[code] = ruleset;

        // Verify Drawdown Priorities (should be empty)
        const priorities = ruleset.getDrawdownPriorities();
        if (!Array.isArray(priorities) || priorities.length !== 0) {
          testResults.success = false;
          testResults.errors.push(code.toUpperCase() + ': Expected 0 drawdown priorities, found ' + (priorities ? priorities.length : 0));
        }

        // Verify RSU Investment Type
        const rsuKey = 'rsu_' + code;
        const types = ruleset.getInvestmentTypes();
        const rsuType = types.find(t => t.key === rsuKey);
        if (!rsuType) {
          // It's okay if AR doesn't have RSU if not configured, but IE/US should
          if (code !== 'ar') {
             testResults.success = false;
             testResults.errors.push(code.toUpperCase() + ': RSU investment type ' + rsuKey + ' not found');
          }
        } else {
          if (rsuType.sellWhenReceived !== true) {
            testResults.success = false;
            testResults.errors.push(code.toUpperCase() + ': RSU sellWhenReceived should be true');
          }
          if (rsuType.baseRef !== 'globalEquity') {
            testResults.success = false;
            testResults.errors.push(code.toUpperCase() + ': RSU baseRef should be globalEquity');
          }
        }
      }

      // ---------------------------------------------------------
      // Section 3: Multi-country baseType union
      // ---------------------------------------------------------
      const allResolvedTypes = [];
      countries.forEach(c => {
        if (rulesets[c]) {
          // Mock Config for getResolvedInvestmentTypes to work if it relies on Config.getInstance()
          // TaxRuleSet.getResolvedInvestmentTypes uses Config.getInstance().getInvestmentBaseTypeByKey
          // We need to mock Config if we want to call getResolvedInvestmentTypes directly on the object
          // Or we can manually resolve or just use getInvestmentTypes since we just check keys/sellWhenReceived
          
          // Actually TaxRuleSet.js uses Config.getInstance().
          // We can't easily mock the global Config inside the node process for the TaxRuleSet class loaded via require
          // unless we modify the global object.
          // However, for this check, getInvestmentTypes() (raw) is sufficient to check 'key' and 'sellWhenReceived'.
          
          const types = rulesets[c].getInvestmentTypes();
          types.forEach(t => allResolvedTypes.push(t));
        }
      });

      const baseTypes = new Set();
      allResolvedTypes.forEach(t => {
        if (t.sellWhenReceived === true) return;
        const base = t.key.split('_')[0];
        baseTypes.add(base);
      });

      // Assert RSU is not in baseTypes
      if (baseTypes.has('rsu')) {
        testResults.success = false;
        testResults.errors.push('RSU (rsu) should be excluded from baseTypes due to sellWhenReceived: true');
      }

      // Assert expected types are present
      const expected = ['indexFunds', 'shares'];
      expected.forEach(e => {
        if (!baseTypes.has(e)) {
          testResults.success = false;
          testResults.errors.push(`Expected baseType '${e}' not found in union`);
        }
      });
      
      // cash and pension are handled separately in code, checking if they are NOT in investment types is good
      // but usually they are not there.


      // ---------------------------------------------------------
      // Section 4, 5, 6: UIManager Priority Logic via VM
      // ---------------------------------------------------------
      const uiManagerPath = path.join(__dirname, '..', 'src', 'frontend', 'UIManager.js');
      const uiManagerCode = fs.readFileSync(uiManagerPath, 'utf8');
      const dragAndDropPath = path.join(__dirname, '..', 'src', 'frontend', 'web', 'components', 'DragAndDrop.js');
      const dragAndDropCode = fs.readFileSync(dragAndDropPath, 'utf8');
      
      // Helper to run VM test
      const runVmTest = (scenarioName, contextCode, assertionCode) => {
        const ctx = vm.createContext({ console: console });
        try {
          vm.runInContext(uiManagerCode, ctx, { filename: 'UIManager.js' });
          vm.runInContext(dragAndDropCode, ctx, { filename: 'DragAndDrop.js' }); // Load DragAndDrop
          vm.runInContext(contextCode, ctx);
          const result = vm.runInContext(assertionCode, ctx);
          return result;
        } catch (err) {
          return { success: false, error: err.message };
        }
      };

      // Test Case A: Priority Field ID Generation & Reading (Section 4 & 5)
      const testA = runVmTest('DynamicPriorities', `
        // Mock Dependencies
        var mockInvestmentTypes = [
          { key: 'indexFunds_ie', label: 'Index Funds (IE)' },
          { key: 'shares_ie', label: 'Shares (IE)' },
          { key: 'rsu_ie', label: 'RSU (IE)', sellWhenReceived: true },
          // Simulate relocation types (though UIManager reads from rulesets)
        ];

        Config = {
          getInstance: function() {
            return {
              getStartCountry: function() { return 'ie'; },
              getDefaultCountry: function() { return 'ie'; },
              isRelocationEnabled: function() { return true; },
              getCachedTaxRuleSet: function(cc) {
                if (cc === 'ie') {
                  return {
                    getResolvedInvestmentTypes: function() { return mockInvestmentTypes; },
                    getUIConfigurableCredits: function() { return []; }
                  };
                }
                if (cc === 'us') {
                   return {
                    getResolvedInvestmentTypes: function() { 
                      return [
                         { key: 'indexFunds_us' }, // duplicates baseType indexFunds
                         { key: 'bonds_us' }       // new baseType bonds
                      ]; 
                    },
                    getUIConfigurableCredits: function() { return []; }
                   }
                }
                return { getResolvedInvestmentTypes: function() { return []; } };
              }
            };
          }
        };

        // Mock UI Inputs
        var values = {
          StartingAge: 30, TargetAge: 90, RetirementAge: 65,
          InitialSavings: 0, InitialPension: 0, EmergencyStash: 0,
          PensionContributionPercentage: 0, StatePensionWeekly: 0,
          PensionGrowthRate: 0, PensionGrowthStdDev: 0, Inflation: 0,
          StartCountry: 'ie',
          
          // Priorities
          Priority_cash: 1,
          Priority_pension: 2,
          Priority_indexFunds: 3,
          Priority_shares: 4,
          Priority_bonds: 5
          // Priority_rsu should not be read
        };
        
        var ui = {
          getValue: function(id) {
            return (values[id] !== undefined) ? values[id] : '';
          },
          getScenarioCountries: function() { return ['ie', 'us']; }
        };
        
        // Mock document for existence checks
        document = {
          getElementById: function(id) {
            return values[id] !== undefined;
          },
          querySelector: function() { return null; }, // for DragAndDrop safety
          querySelectorAll: function() { return []; }
        };

        var manager = new UIManager(ui);
        var params = manager.readParameters(false);
      `, `
        (function() {
          var errs = [];
          if (params.priorityCash !== 1) errs.push('priorityCash incorrect');
          if (params.priorityPension !== 2) errs.push('priorityPension incorrect');
          if (params.priorityFunds !== 3) errs.push('priorityFunds incorrect');
          if (params.priorityShares !== 4) errs.push('priorityShares incorrect');
          
          // Check drawdownPrioritiesByKey
          if (params.drawdownPrioritiesByKey['indexFunds_ie'] !== 3) errs.push('indexFunds_ie priority incorrect');
          if (params.drawdownPrioritiesByKey['shares_ie'] !== 4) errs.push('shares_ie priority incorrect');
          if (params.drawdownPrioritiesByKey['bonds_us'] !== 5) errs.push('bonds_us priority incorrect');
          if (params.drawdownPrioritiesByKey['indexFunds_us'] !== 3) errs.push('indexFunds_us priority incorrect (should match baseType)');
          
          if (params.drawdownPrioritiesByKey['rsu_ie']) errs.push('rsu_ie should not be in priorities');
          
          return { success: errs.length === 0, errors: errs };
        })()
      `);

      if (!testA.success) {
        testResults.success = false;
        testResults.errors.push('DynamicPriorities VM Test Failed: ' + (testA.errors ? testA.errors.join(', ') : testA.error));
      }

      // Test Case A.2: RSU sellWhenReceived=false (Comment 1 Validation)
      const testRSUFalse = runVmTest('RSUSellWhenReceivedFalse', `
        var mockInvestmentTypes = [
          { key: 'rsu_ie', label: 'RSU (IE)', sellWhenReceived: false },
        ];
        Config = {
          getInstance: function() {
            return {
              getStartCountry: function() { return 'ie'; },
              getDefaultCountry: function() { return 'ie'; },
              isRelocationEnabled: function() { return false; },
              getCachedTaxRuleSet: function() {
                 return {
                    getResolvedInvestmentTypes: function() { return mockInvestmentTypes; },
                    getUIConfigurableCredits: function() { return []; }
                 };
              }
            };
          }
        };
        var values = { StartingAge: 30, TargetAge: 90, RetirementAge: 65, StartCountry: 'ie', Priority_rsu: 4 };
        var ui = { getValue: function(id) { return (values[id] !== undefined) ? values[id] : ''; } };
        document = { getElementById: function(id) { return values[id] !== undefined; }, querySelector: function() { return null; }, querySelectorAll: function() { return []; } };
        var manager = new UIManager(ui);
        var params = manager.readParameters(false);
      `, `
        (function() {
          var errs = [];
          if (params.drawdownPrioritiesByKey['rsu_ie'] !== 4) errs.push('rsu_ie should be read when sellWhenReceived=false');
          return { success: errs.length === 0, errors: errs };
        })()
      `);
      if (!testRSUFalse.success) {
        testResults.success = false;
        testResults.errors.push('RSUSellWhenReceivedFalse VM Test Failed: ' + (testRSUFalse.errors ? testRSUFalse.errors.join(', ') : testRSUFalse.error));
      }

      // Test Case A.3: DragAndDrop.getPriorityConfigs (Comment 2 Validation)
      const testDragDrop = runVmTest('DragAndDropConfig', `
        var mockTypesIE = [
           { key: 'indexFunds_ie', label: 'Index Funds (IE)' },
           { key: 'shares_ie', label: 'Shares (IE)' },
           { key: 'rsu_ie', label: 'RSU (IE)', sellWhenReceived: true }
        ];
        var mockTypesUS = [
           { key: 'bonds_us', label: 'Bonds (US)' },
           { key: 'indexFunds_us', label: 'Index Funds (US)' }
        ];
        
        Config = {
          getInstance: function() {
             return {
               getStartCountry: function() { return 'ie'; },
               getStartCountryRaw: function() { return 'ie'; },
               getDefaultCountry: function() { return 'ie'; },
               isRelocationEnabled: function() { return true; },
               getCachedTaxRuleSet: function(cc) {
                 if (cc === 'ie') return { getResolvedInvestmentTypes: function() { return mockTypesIE; } };
                 if (cc === 'us') return { getResolvedInvestmentTypes: function() { return mockTypesUS; } };
                 return { getResolvedInvestmentTypes: function() { return []; } };
               },
               getTaxRuleSet: async function(cc) { return this.getCachedTaxRuleSet(cc); }
             };
          }
        };
        
        var webUI = {
           getScenarioCountries: function() { return ['ie', 'us']; }
        };
        
        document = {
           querySelector: function() { return null; }, // No DOM container needed for this test
           querySelectorAll: function() { return []; }
        };
        
        var dnd = new DragAndDrop(webUI);
        var configs = dnd.getPriorityConfigs();
      `, `
        (function() {
          var errs = [];
          // Expected: cash, pension, bonds, indexFunds, shares (alphabetical after cash/pension)
          // RSU excluded
          var ids = configs.map(c => c.fieldId);
          var expectedIds = ['Priority_cash', 'Priority_pension', 'Priority_bonds', 'Priority_indexFunds', 'Priority_shares'];
          
          if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
             errs.push('Field IDs mismatch. Expected ' + JSON.stringify(expectedIds) + ', got ' + JSON.stringify(ids));
          }
          
          var indexFunds = configs.find(c => c.fieldId === 'Priority_indexFunds');
          if (indexFunds && indexFunds.label !== 'Index Funds (IE)') {
             errs.push('Label mismatch for indexFunds. Expected "Index Funds (IE)", got "' + (indexFunds ? indexFunds.label : 'null') + '"');
          }
          
          return { success: errs.length === 0, errors: errs };
        })()
      `);
      if (!testDragDrop.success) {
        testResults.success = false;
        testResults.errors.push('DragAndDropConfig VM Test Failed: ' + (testDragDrop.errors ? testDragDrop.errors.join(', ') : testDragDrop.error));
      }

      // Test Case B: Legacy Fallback (Section 6)
      const testB = runVmTest('LegacyFallback', `
        var mockInvestmentTypes = [
          { key: 'indexFunds_ie' },
          { key: 'shares_ie' }
        ];

        Config = {
          getInstance: function() {
            return {
              getStartCountry: function() { return 'ie'; },
              getDefaultCountry: function() { return 'ie'; },
              isRelocationEnabled: function() { return false; },
              getCachedTaxRuleSet: function() {
                 return {
                    getResolvedInvestmentTypes: function() { return mockInvestmentTypes; },
                    getUIConfigurableCredits: function() { return []; }
                 };
              }
            };
          }
        };

        // ONLY Legacy inputs
        var values = {
          StartingAge: 30, TargetAge: 90, RetirementAge: 65,
          StartCountry: 'ie',
          
          PriorityCash: 10,
          PriorityPension: 20,
          PriorityFunds: 30,
          PriorityShares: 40
        };
        
        var ui = {
          getValue: function(id) {
            return (values[id] !== undefined) ? values[id] : '';
          }
        };
        
        document = {
          getElementById: function(id) {
            return values[id] !== undefined;
          }
        };

        var manager = new UIManager(ui);
        var params = manager.readParameters(false);
      `, `
        (function() {
          var errs = [];
          if (params.priorityCash !== 10) errs.push('Legacy PriorityCash not read');
          if (params.priorityPension !== 20) errs.push('Legacy PriorityPension not read');
          if (params.priorityFunds !== 30) errs.push('Legacy PriorityFunds not read');
          if (params.priorityShares !== 40) errs.push('Legacy PriorityShares not read');
          
          if (params.drawdownPrioritiesByKey['indexFunds_ie'] !== 30) errs.push('indexFunds_ie legacy priority incorrect');
          
          return { success: errs.length === 0, errors: errs };
        })()
      `);
      
      if (!testB.success) {
        testResults.success = false;
        testResults.errors.push('LegacyFallback VM Test Failed: ' + (testB.errors ? testB.errors.join(', ') : testB.error));
      }
      
      // Default value check (when no field exists)
       const testC = runVmTest('DefaultValue', `
        var mockInvestmentTypes = [{ key: 'newType_ie' }];
        Config = {
          getInstance: function() {
            return {
              getStartCountry: function() { return 'ie'; },
              getDefaultCountry: function() { return 'ie'; },
              getCachedTaxRuleSet: function() {
                 return {
                    getResolvedInvestmentTypes: function() { return mockInvestmentTypes; },
                    getUIConfigurableCredits: function() { return []; }
                 };
              }
            };
          }
        };
        var values = { StartingAge: 30, TargetAge: 90, RetirementAge: 65, StartCountry: 'ie' };
        var ui = { getValue: function(id) { return (values[id] !== undefined) ? values[id] : ''; } };
        document = { getElementById: function(id) { return false; } }; // No elements exist
        var manager = new UIManager(ui);
        var params = manager.readParameters(false);
      `, `
        (function() {
          var errs = [];
          // Default for custom types is 4
          if (params.drawdownPrioritiesByKey['newType_ie'] !== 4) errs.push('Default priority should be 4, got ' + params.drawdownPrioritiesByKey['newType_ie']);
          return { success: errs.length === 0, errors: errs };
        })()
      `);
      
      if (!testC.success) {
        testResults.success = false;
        testResults.errors.push('DefaultValue VM Test Failed: ' + (testC.errors ? testC.errors.join(', ') : testC.error));
      }


      // ---------------------------------------------------------
      // Section 7: Grep validation (No config usage)
      // ---------------------------------------------------------
      try {
        const grepCmd = 'grep -r "drawdownPriorities" src/core/config/tax-rules-*.json';
        // We expect grep to fail (exit code 1) if no matches found.
        try {
          execSync(grepCmd, { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
          // If it succeeds, it found matches!
          testResults.success = false;
          testResults.errors.push('Found "drawdownPriorities" in tax-rules json files (grep succeeded)');
        } catch (e) {
          // Exit code 1 means no lines selected, which is what we want.
          if (e.status !== 1) {
             testResults.success = false;
             testResults.errors.push('Grep failed with unexpected error: ' + e.message);
          }
        }
      } catch (e) {
         testResults.success = false;
         testResults.errors.push('Grep check failed: ' + e.message);
      }
      
      // Also verify backward compatibility empty ruleset
      const emptyRuleset = new TaxRuleSet({});
      if (!Array.isArray(emptyRuleset.getDrawdownPriorities()) || emptyRuleset.getDrawdownPriorities().length !== 0) {
        testResults.success = false;
        testResults.errors.push('Backward compatibility: Expected empty array for drawdown priorities');
      }

      return testResults;
    } catch (e) {
      return { success: false, errors: [e.message + '\n' + e.stack] };
    }
  }
};