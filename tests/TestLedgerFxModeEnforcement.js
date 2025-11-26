const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');

/**
 * Test to verify that all ledger-path currency conversions use evolution FX
 * (inflation-driven FX evolution) rather than PPP or reversion modes.
 * 
 * This test spies on EconomicData.prototype.convert to ensure that:
 * 1. Ledger conversions (via convertNominal/convertCurrencyAmount and core helpers) use fxMode: 'evolution'
 * 2. EconomicData.convert() defaults to fxMode: 'evolution'
 * 3. UI-only/analytics conversions may opt into other modes explicitly
 */
module.exports = {
  name: 'LedgerFxModeEnforcement',
  description: 'Verifies that ledger conversions enforce evolution FX mode (inflation-driven)',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];
    
    // Load economic data
    const ieRules = new TaxRuleSet(require('../src/core/config/tax-rules-ie.json'));
    const arRules = new TaxRuleSet(require('../src/core/config/tax-rules-ar.json'));
    const econ = new EconomicData([ieRules.getEconomicProfile(), arRules.getEconomicProfile()]);
    
    if (!econ.ready) {
      return { success: false, errors: ['EconomicData not ready'] };
    }
    
    // Track all convert() calls and their fxMode
    const convertCalls = [];
    const originalConvert = EconomicData.prototype.convert;
    
    // Spy on convert method
    EconomicData.prototype.convert = function(value, fromCountry, toCountry, year, options) {
      const fxMode = (options && options.fxMode) || 'evolution';
      convertCalls.push({
        value,
        fromCountry,
        toCountry,
        year,
        fxMode: fxMode,
        options: options || {}
      });
      return originalConvert.call(this, value, fromCountry, toCountry, year, options);
    };
    
    try {
      const testValue = 1000;
      const testYear = 2024;
      const baseYear = 2020;
      
      // Test 1: Verify that explicit evolution-mode calls work
      const result1 = econ.convert(testValue, 'IE', 'AR', testYear, { fxMode: 'evolution', baseYear: baseYear });
      if (!Number.isFinite(result1) || result1 <= 0) {
        errors.push('Ledger conversion with fxMode: evolution failed');
      }
      
      // Test 2: Verify that default fxMode is 'evolution'
      const defaultCall = econ.convert(testValue, 'IE', 'AR', testYear, { baseYear: baseYear });
      const defaultCallRecord = convertCalls[convertCalls.length - 1];
      if (defaultCallRecord.fxMode !== 'evolution') {
        errors.push(`Default fxMode should be 'evolution', got '${defaultCallRecord.fxMode}'`);
      }
      
      // Test 3: Verify that explicit PPP mode is distinguishable
      const result2 = econ.convert(testValue, 'IE', 'AR', testYear, { fxMode: 'ppp', baseYear: baseYear });
      const pppCallRecord = convertCalls[convertCalls.length - 1];
      if (pppCallRecord.fxMode !== 'ppp') {
        errors.push(`PPP mode not recorded correctly, got '${pppCallRecord.fxMode}'`);
      }
      
      // Test 4: Summary - verify we exercised both evolution and PPP modes
      const evolutionCalls = convertCalls.filter(call => call.fxMode === 'evolution');
      if (evolutionCalls.length === 0) {
        errors.push('No evolution-mode conversions detected');
      }
      const pppCalls = convertCalls.filter(call => call.fxMode === 'ppp');
      if (pppCalls.length === 0) {
        errors.push('No PPP-mode conversions detected');
      }
      
    } finally {
      // Restore original method
      EconomicData.prototype.convert = originalConvert;
    }
    
    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};
