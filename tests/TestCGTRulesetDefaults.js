// Custom test for InvestmentAsset CGT ruleset defaults fallback

module.exports = {
  name: 'CGTRulesetDefaults',
  description: 'Verifies allowLossOffset and deemedDisposalYears fallback to ruleset level',
  isCustomTest: true,
  runCustomTest: async function() {
    const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
    const { InvestmentAsset } = require('../src/core/InvestmentAsset.js');

    const testResults = { success: true, errors: [] };

    try {
      // 1. allowLossOffset fallback test
      const raw1 = {
        capitalGainsTax: { allowLossOffset: false },
        investmentTypes: [
          { key: 'test_cgt', taxation: { capitalGains: { rate: 0.33 } } }
        ]
      };
      const ruleset1 = new TaxRuleSet(raw1);
      const asset1 = new InvestmentAsset(raw1.investmentTypes[0], 0.05, 0.1, ruleset1);
      
      if (asset1.canOffsetLosses !== false) {
        testResults.success = false;
        testResults.errors.push('allowLossOffset did not fall back to ruleset (expected false)');
      }

      // 2. deemedDisposalYears fallback test
      const raw2 = {
        capitalGainsTax: { deemedDisposalYears: 12 },
        investmentTypes: [
          { key: 'test_exit', taxation: { exitTax: { rate: 0.41 } } }
        ]
      };
      const ruleset2 = new TaxRuleSet(raw2);
      const asset2 = new InvestmentAsset(raw2.investmentTypes[0], 0.05, 0.1, ruleset2);

      if (asset2._deemedDisposalYears !== 12) {
        testResults.success = false;
        testResults.errors.push('deemedDisposalYears did not fall back to ruleset (expected 12, got ' + asset2._deemedDisposalYears + ')');
      }

      // 3. Explicit per-type override still wins
      const raw3 = {
        capitalGainsTax: { allowLossOffset: false },
        investmentTypes: [
          { key: 'test_override', taxation: { capitalGains: { rate: 0.33, allowLossOffset: true } } }
        ]
      };
      const ruleset3 = new TaxRuleSet(raw3);
      const asset3 = new InvestmentAsset(raw3.investmentTypes[0], 0.05, 0.1, ruleset3);

      if (asset3.canOffsetLosses !== true) {
        testResults.success = false;
        testResults.errors.push('per-type allowLossOffset override did not win over ruleset');
      }

      // 4. Default behavior (last resort)
      const raw4 = {
        capitalGainsTax: {}, // no fields
        investmentTypes: [
          { key: 'test_default', taxation: { capitalGains: { rate: 0.33 } } }
        ]
      };
      const ruleset4 = new TaxRuleSet(raw4);
      const asset4 = new InvestmentAsset(raw4.investmentTypes[0], 0.05, 0.1, ruleset4);
      
      if (asset4.canOffsetLosses !== true) {
        testResults.success = false;
        testResults.errors.push('last-resort allowLossOffset default should be true');
      }
      if (asset4._deemedDisposalYears !== 0) {
        testResults.success = false;
        testResults.errors.push('last-resort deemedDisposalYears default should be 0');
      }

      return testResults;
    } catch (e) {
      return { success: false, errors: [e.message, e.stack] };
    }
  }
};
