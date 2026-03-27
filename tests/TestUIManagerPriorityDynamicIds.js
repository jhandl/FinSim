const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = {
  name: 'UIManagerPriorityDynamicIds',
  description: 'Ensures readParameters reads dynamic Priority_* inputs without requiring legacy PriorityCash IDs.',
  isCustomTest: true,
  runCustomTest: async function() {
    const errors = [];
    const uiManagerPath = path.join(__dirname, '..', 'src', 'frontend', 'UIManager.js');
    const uiManagerCode = fs.readFileSync(uiManagerPath, 'utf8');
    const ctx = vm.createContext({ console: console });

    try {
      vm.runInContext(uiManagerCode, ctx, { filename: 'UIManager.js' });
    } catch (err) {
      return { success: false, errors: ['Failed to load UIManager.js: ' + (err.message || String(err))] };
    }

    try {
      const result = vm.runInContext(`
        var existingElements = {
          GlobalAllocation_indexFunds: true,
          GlobalAllocation_shares: true,
          indexFunds_ieGrowthRate: true,
          shares_ieGrowthRate: true,
          Priority_cash: true,
          Priority_pension: true,
          Priority_indexFunds: true,
          Priority_shares: true
        };
        document = {
          getElementById: function(id) {
            if (existingElements[id]) return { id: id, value: '1' };
            return null;
          }
        };
        Config = {
          getInstance: function() {
            return {
              getStartCountry: function() { return 'ie'; },
              getDefaultCountry: function() { return 'ie'; },
              isRelocationEnabled: function() { return false; },
              getCachedTaxRuleSet: function() {
                return {
                  getResolvedInvestmentTypes: function() {
                    return [
                      { key: 'indexFunds_ie' },
                      { key: 'shares_ie' }
                    ];
                  },
                  getUIConfigurableCredits: function() { return []; }
                };
              }
            };
          }
        };

        var calls = [];
        var values = {
          StartingAge: 30,
          TargetAge: 90,
          InitialSavings: 10000,
          InitialPension: 0,
          RetirementAge: 65,
          EmergencyStash: 0,
          PensionContributionPercentage: 10,
          PensionContributionCapped: 'No',
          StatePensionWeekly: 0,
          PensionGrowthRate: 5,
          PensionGrowthStdDev: 0,
          Inflation: 2,
          MarriageYear: '',
          YoungestChildBorn: '',
          OldestChildBorn: '',
          PersonalTaxCredit: '',
          P2StartingAge: '',
          P2RetirementAge: '',
          P2StatePensionWeekly: '',
          InitialPensionP2: '',
          PensionContributionPercentageP2: '',
          simulation_mode: 'single',
          economy_mode: 'montecarlo',
          InitialCapital_indexFunds_ie: 1000,
          InitialCapital_shares_ie: 500,
          GlobalAllocation_indexFunds: 60,
          GlobalAllocation_shares: 40,
          indexFunds_ieGrowthRate: 5,
          indexFunds_ieGrowthStdDev: 10,
          shares_ieGrowthRate: 4,
          shares_ieGrowthStdDev: 8,
          Priority_cash: 1,
          Priority_pension: 2,
          Priority_indexFunds: 3,
          Priority_shares: 4
        };
        var ui = {
          getValue: function(id) {
            calls.push(id);
            if (Object.prototype.hasOwnProperty.call(values, id)) return values[id];
            return '';
          }
        };

        var manager = new UIManager(ui);
        var params = manager.readParameters(false);
        ({ params: params, calls: calls });
      `, ctx);

      assert.strictEqual(result.params.priorityCash, 1, 'priorityCash should come from Priority_cash');
      assert.strictEqual(result.params.priorityPension, 2, 'priorityPension should come from Priority_pension');
      assert.strictEqual(result.params.priorityFunds, 3, 'priorityFunds should come from Priority_indexFunds');
      assert.strictEqual(result.params.priorityShares, 4, 'priorityShares should come from Priority_shares');

      const legacyIds = ['PriorityCash', 'PriorityPension', 'PriorityFunds', 'PriorityShares'];
      legacyIds.forEach((legacyId) => {
        assert.strictEqual(result.calls.indexOf(legacyId), -1, 'readParameters should not read legacy id ' + legacyId);
      });
    } catch (err) {
      errors.push(err.message || String(err));
    }

    try {
      const result = vm.runInContext(`
        var existingElements = {
          // Allocation and local economy inputs
          InvestmentAllocation_ie_shares: true,
          InvestmentAllocation_ar_merval: true,
          LocalAssetGrowth_ie_shares: true,
          LocalAssetVolatility_ie_shares: true,
          LocalAssetGrowth_ar_merval: true,
          LocalAssetVolatility_ar_merval: true,
          // Dynamic priorities
          Priority_cash: true,
          Priority_pension: true,
          Priority_shares: true,
          Priority_merval: true
        };
        document = {
          getElementById: function(id) {
            if (existingElements[id]) return { id: id, value: '1' };
            return null;
          }
        };
        Config = {
          getInstance: function() {
            return {
              getStartCountry: function() { return 'ie'; },
              getDefaultCountry: function() { return 'ie'; },
              isRelocationEnabled: function() { return true; },
              getCachedTaxRuleSet: function(code) {
                if (code === 'ie') {
                  return {
                    getResolvedInvestmentTypes: function() {
                      return [
                        { key: 'shares_ie', baseRef: null, sellWhenReceived: false }
                      ];
                    },
                    getUIConfigurableCredits: function() { return []; },
                    hasPrivatePensions: function() { return true; }
                  };
                }
                if (code === 'ar') {
                  return {
                    getResolvedInvestmentTypes: function() {
                      return [
                        { key: 'merval_ar', baseRef: null, sellWhenReceived: false }
                      ];
                    },
                    getUIConfigurableCredits: function() { return []; },
                    hasPrivatePensions: function() { return true; }
                  };
                }
                return {
                  getResolvedInvestmentTypes: function() { return []; },
                  getUIConfigurableCredits: function() { return []; },
                  hasPrivatePensions: function() { return true; }
                };
              }
            };
          }
        };

        var values = {
          StartingAge: 30,
          TargetAge: 90,
          InitialSavings: 10000,
          InitialPension: 0,
          RetirementAge: 65,
          EmergencyStash: 0,
          PensionContributionPercentage: 10,
          PensionContributionCapped: 'No',
          StatePensionWeekly: 0,
          PensionGrowthRate: 5,
          PensionGrowthStdDev: 0,
          Inflation: 2,
          MarriageYear: '',
          YoungestChildBorn: '',
          OldestChildBorn: '',
          PersonalTaxCredit: '',
          P2StartingAge: '',
          P2RetirementAge: '',
          P2StatePensionWeekly: '',
          InitialPensionP2: '',
          PensionContributionPercentageP2: '',
          simulation_mode: 'single',
          economy_mode: 'montecarlo',
          InitialCapital_shares_ie: 0,
          InvestmentAllocation_ie_shares: 1,
          InvestmentAllocation_ar_merval: 1,
          LocalAssetGrowth_ie_shares: 0.06,
          LocalAssetVolatility_ie_shares: 0.15,
          LocalAssetGrowth_ar_merval: 0.04,
          LocalAssetVolatility_ar_merval: 0.20,
          Priority_cash: 1,
          Priority_pension: 2,
          Priority_shares: 3,
          Priority_merval: 4
        };
        var ui = {
          getValue: function(id) {
            if (Object.prototype.hasOwnProperty.call(values, id)) return values[id];
            return '';
          },
          getScenarioCountries: function() { return ['ie', 'ar']; }
        };

        var manager = new UIManager(ui);
        manager.readEvents = function() { return []; };
        var params = manager.readParameters(false);
        ({ params: params });
      `, ctx);

      assert.strictEqual(result.params.investmentGrowthRatesByKey.shares_ie, 0.06, 'Expected IE local growth rate to be read from LocalAssetGrowth_ie_shares');
      assert.strictEqual(result.params.investmentVolatilitiesByKey.shares_ie, 0.15, 'Expected IE local volatility to be read from LocalAssetVolatility_ie_shares');
      assert.strictEqual(result.params.investmentGrowthRatesByKey.merval_ar, 0.04, 'Expected AR local growth rate to be read from LocalAssetGrowth_ar_merval');
      assert.strictEqual(result.params.investmentVolatilitiesByKey.merval_ar, 0.20, 'Expected AR local volatility to be read from LocalAssetVolatility_ar_merval');
    } catch (err) {
      errors.push(err.message || String(err));
    }

    try {
      const result = vm.runInContext(`
        var elementValues = {
          shares_ieGrowthRate: '10',
          shares_ieGrowthStdDev: '16',
          LocalAssetGrowth_ie_shares: '',
          LocalAssetVolatility_ie_shares: '',
          InvestmentAllocation_ie_shares: '100'
        };
        document = {
          getElementById: function(id) {
            if (!Object.prototype.hasOwnProperty.call(elementValues, id)) return null;
            return { id: id, value: elementValues[id] };
          }
        };
        Config = {
          getInstance: function() {
            return {
              getStartCountry: function() { return 'ie'; },
              getDefaultCountry: function() { return 'ie'; },
              isRelocationEnabled: function() { return true; },
              getCachedTaxRuleSet: function(code) {
                if (String(code || '').toLowerCase() === 'ie') {
                  return {
                    getResolvedInvestmentTypes: function() {
                      return [
                        { key: 'shares_ie', baseRef: null, sellWhenReceived: false }
                      ];
                    },
                    getUIConfigurableCredits: function() { return []; },
                    hasPrivatePensions: function() { return true; }
                  };
                }
                return {
                  getResolvedInvestmentTypes: function() { return []; },
                  getUIConfigurableCredits: function() { return []; },
                  hasPrivatePensions: function() { return true; }
                };
              }
            };
          }
        };

        var values = {
          StartingAge: 30,
          TargetAge: 90,
          InitialSavings: 10000,
          InitialPension: 0,
          RetirementAge: 65,
          EmergencyStash: 0,
          PensionContributionPercentage: 10,
          PensionContributionCapped: 'No',
          StatePensionWeekly: 0,
          PensionGrowthRate: 5,
          PensionGrowthStdDev: 0,
          Inflation: 2,
          MarriageYear: '',
          YoungestChildBorn: '',
          OldestChildBorn: '',
          PersonalTaxCredit: '',
          P2StartingAge: '',
          P2RetirementAge: '',
          P2StatePensionWeekly: '',
          InitialPensionP2: '',
          PensionContributionPercentageP2: '',
          simulation_mode: 'single',
          economy_mode: 'montecarlo',
          InitialCapital_shares_ie: 0,
          InvestmentAllocation_ie_shares: 1,
          shares_ieGrowthRate: 0.10,
          shares_ieGrowthStdDev: 0.16,
          // Simulate DOMUtils: empty numeric parameter inputs read back as 0.
          LocalAssetGrowth_ie_shares: 0,
          LocalAssetVolatility_ie_shares: 0
        };
        var ui = {
          getValue: function(id) {
            if (Object.prototype.hasOwnProperty.call(values, id)) return values[id];
            return '';
          },
          getScenarioCountries: function() { return ['ie']; }
        };

        var manager = new UIManager(ui);
        manager.readEvents = function() { return []; };
        var params = manager.readParameters(false);
        ({ params: params });
      `, ctx);

      assert.strictEqual(result.params.investmentGrowthRatesByKey.shares_ie, undefined, 'Expected canonical-only read: blank LocalAssetGrowth_ie_shares should stay unset');
      assert.strictEqual(result.params.investmentVolatilitiesByKey.shares_ie, undefined, 'Expected canonical-only read: blank LocalAssetVolatility_ie_shares should stay unset');
    } catch (err) {
      errors.push(err.message || String(err));
    }

    try {
      const result = vm.runInContext(`
        var elementValues = {
          Inflation: '7',
          Inflation_ie: '',
          TaxCredit_personal_ie: ''
        };
        document = {
          getElementById: function(id) {
            if (!Object.prototype.hasOwnProperty.call(elementValues, id)) return null;
            return { id: id, value: elementValues[id] };
          }
        };
        Config = {
          getInstance: function() {
            return {
              getStartCountry: function() { return 'ie'; },
              getDefaultCountry: function() { return 'ie'; },
              isRelocationEnabled: function() { return false; },
              getCachedTaxRuleSet: function() {
                return {
                  getResolvedInvestmentTypes: function() { return []; },
                  getUIConfigurableCredits: function() { return [{ id: 'personal' }]; },
                  hasPrivatePensions: function() { return true; }
                };
              }
            };
          }
        };
        var values = {
          StartingAge: 30,
          TargetAge: 90,
          InitialSavings: 10000,
          InitialPension: 0,
          RetirementAge: 65,
          EmergencyStash: 0,
          PensionGrowthRate: 5,
          PensionGrowthStdDev: 0,
          Inflation: 0.07,
          Inflation_ie: 0,
          PersonalTaxCredit: 5000,
          P2StartingAge: '',
          P2RetirementAge: '',
          InitialPensionP2: '',
          simulation_mode: 'single',
          economy_mode: 'deterministic'
        };
        var ui = {
          getValue: function(id) {
            if (Object.prototype.hasOwnProperty.call(values, id)) return values[id];
            return '';
          },
          getScenarioCountries: function() { return ['ie']; }
        };
        var manager = new UIManager(ui);
        manager.readEvents = function() { return []; };
        var params = manager.readParameters(false);
        ({ params: params });
      `, ctx);

      assert.strictEqual(result.params.inflation, undefined, 'Legacy Inflation must not override canonical Inflation_ie');
      assert.strictEqual(result.params.personalTaxCredit, undefined, 'Legacy PersonalTaxCredit must not override canonical TaxCredit_personal_ie');
    } catch (err) {
      errors.push(err.message || String(err));
    }

    try {
      const result = vm.runInContext(`
        document = {
          getElementById: function() {
            return null;
          }
        };
        Config = {
          getInstance: function() {
            return {
              getStartCountry: function() { return 'ar'; },
              getDefaultCountry: function() { return 'ie'; },
              isRelocationEnabled: function() { return true; },
              getCachedTaxRuleSet: function() {
                return {
                  getResolvedInvestmentTypes: function() { return []; },
                  getUIConfigurableCredits: function() { return []; },
                  hasPrivatePensions: function() { return false; }
                };
              }
            };
          }
        };
        var values = {
          StartingAge: 30,
          TargetAge: 90,
          InitialSavings: 10000,
          InitialPension: 25000,
          RetirementAge: 65,
          EmergencyStash: 0,
          PensionGrowthRate: 5,
          PensionGrowthStdDev: 0,
          MarriageYear: '',
          YoungestChildBorn: '',
          OldestChildBorn: '',
          P2StartingAge: 30,
          P2RetirementAge: 65,
          InitialPensionP2: 12000,
          simulation_mode: 'couple',
          economy_mode: 'deterministic'
        };
        var ui = {
          getValue: function(id) {
            if (Object.prototype.hasOwnProperty.call(values, id)) return values[id];
            return '';
          },
          getScenarioCountries: function() { return ['ar']; }
        };
        var manager = new UIManager(ui);
        manager.readEvents = function() { return []; };
        var params = manager.readParameters(false);
        ({ params: params });
      `, ctx);

      assert.strictEqual(result.params.initialPension, 0, 'State-only start country must ignore InitialPension');
      assert.strictEqual(result.params.initialPensionP2, 0, 'State-only start country must ignore InitialPensionP2');
    } catch (err) {
      errors.push(err.message || String(err));
    }

    return { success: errors.length === 0, errors: errors };
  }
};
