// Custom test for RSU and Drawdown Priorities configuration

module.exports = {
  name: 'RSUAndPriorities',
  description: 'Validates RSU investment types and drawdown priorities configuration in IE and US rulesets',
  isCustomTest: true,
  runCustomTest: async function() {
    const fs = require('fs');
    const path = require('path');
    const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');

    const testResults = { success: true, errors: [] };

    const countries = ['ie', 'us', 'ar'];
    
    try {
      for (const code of countries) {
        const filePath = path.join(__dirname, '..', 'src', 'core', 'config', 'tax-rules-' + code + '.json');
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const ruleset = new TaxRuleSet(raw);

        // Verify Drawdown Priorities (config-driven list removed; should be empty)
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
          testResults.success = false;
          testResults.errors.push(code.toUpperCase() + ': RSU investment type ' + rsuKey + ' not found');
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

      // Verify Backward Compatibility
      const emptyRuleset = new TaxRuleSet({});
      if (!Array.isArray(emptyRuleset.getDrawdownPriorities()) || emptyRuleset.getDrawdownPriorities().length !== 0) {
        testResults.success = false;
        testResults.errors.push('Backward compatibility: Expected empty array for drawdown priorities');
      }
      if (emptyRuleset.getInvestmentType('any_key') !== null) {
        testResults.success = false;
        testResults.errors.push('Backward compatibility: Expected null for missing investment type');
      }

      return testResults;
    } catch (e) {
      return { success: false, errors: [e.message] };
    }
  }
};
