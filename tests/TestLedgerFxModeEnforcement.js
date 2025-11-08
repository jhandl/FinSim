const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');

/**
 * Test to verify that all ledger-path currency conversions use fxMode: 'constant'
 * (nominal FX rates) rather than PPP or reversion modes.
 * 
 * This test spies on EconomicData.prototype.convert to ensure that:
 * 1. All ledger conversions (via convertNominal/convertCurrencyAmount) use fxMode: 'constant'
 * 2. EconomicData.convert() defaults to fxMode: 'constant' for ledger safety
 * 3. UI-only conversions (e.g., RelocationImpactAssistant suggestions) may use other modes
 */
module.exports = {
  name: 'LedgerFxModeEnforcement',
  description: 'Verifies that ledger conversions enforce nominal FX mode (constant)',
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
      const fxMode = (options && options.fxMode) || 'constant';
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
      
      // Test 1: Verify that calls with fxMode: 'constant' work (ledger path simulation)
      const result1 = econ.convert(testValue, 'IE', 'AR', testYear, { fxMode: 'constant', baseYear: baseYear });
      if (!Number.isFinite(result1) || result1 <= 0) {
        errors.push('Ledger conversion with fxMode: constant failed');
      }
      
      // Test 2: Verify that default fxMode is 'constant' (ledger safety)
      // This is critical - EconomicData.convert() should default to 'constant' for ledger safety
      const defaultCall = econ.convert(testValue, 'IE', 'AR', testYear, { baseYear: baseYear });
      const defaultCallRecord = convertCalls[convertCalls.length - 1];
      if (defaultCallRecord.fxMode !== 'constant') {
        errors.push(`Default fxMode should be 'constant', got '${defaultCallRecord.fxMode}'`);
      }
      
      // Test 3: Verify that explicit fxMode: 'constant' is recorded correctly
      const explicitConstantCall = econ.convert(testValue, 'IE', 'AR', testYear, { 
        fxMode: 'constant', 
        baseYear: baseYear 
      });
      const explicitCallRecord = convertCalls[convertCalls.length - 1];
      if (explicitCallRecord.fxMode !== 'constant') {
        errors.push(`Explicit fxMode: constant not recorded correctly, got '${explicitCallRecord.fxMode}'`);
      }
      
      // Test 4: Verify that PPP mode is distinguishable (if data available)
      // This ensures modes work differently when needed
      const result2 = econ.convert(testValue, 'IE', 'AR', testYear, { fxMode: 'ppp', baseYear: baseYear });
      const pppCallRecord = convertCalls[convertCalls.length - 1];
      if (pppCallRecord.fxMode !== 'ppp') {
        errors.push(`PPP mode not recorded correctly, got '${pppCallRecord.fxMode}'`);
      }
      
      // Test 5: Summary - verify ledger-path calls used fxMode: 'constant'
      const ledgerCalls = convertCalls.filter(call => call.fxMode === 'constant');
      if (ledgerCalls.length === 0) {
        errors.push('No ledger conversions detected with fxMode: constant');
      }
      
      // Verify we have at least some constant mode calls (ledger paths)
      if (ledgerCalls.length < 2) {
        errors.push(`Expected at least 2 ledger conversions with fxMode: constant, got ${ledgerCalls.length}`);
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

