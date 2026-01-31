/**
 * LegacyScenarioAdapter.js
 * 
 * Consolidates all legacy CSV field mapping logic into a single standalone module.
 * This adapter ensures backward compatibility with older FinSim scenario files
 * while maintaining strict rules for modern namespacing.
 */

class LegacyScenarioAdapter {
  constructor() {
    this.legacyFieldMap = {
      'InitialETFs': 'InitialCapital_indexFunds',
      'InitialFunds': 'InitialCapital_indexFunds',
      'InitialTrusts': 'InitialCapital_shares',
      'InitialShares': 'InitialCapital_shares',
      'EtfAllocation': 'InvestmentAllocation_indexFunds',
      'FundsAllocation': 'InvestmentAllocation_indexFunds',
      'TrustAllocation': 'InvestmentAllocation_shares',
      'SharesAllocation': 'InvestmentAllocation_shares',
      'EtfGrowthRate': 'indexFundsGrowthRate',
      'FundsGrowthRate': 'indexFundsGrowthRate',
      'EtfGrowthStdDev': 'indexFundsGrowthStdDev',
      'FundsGrowthStdDev': 'indexFundsGrowthStdDev',
      'TrustGrowthRate': 'sharesGrowthRate',
      'SharesGrowthRate': 'sharesGrowthRate',
      'TrustGrowthStdDev': 'sharesGrowthStdDev',
      'SharesGrowthStdDev': 'sharesGrowthStdDev',
      'PriorityETF': 'PriorityFunds',
      'PriorityTrust': 'PriorityShares'
    };

    // Fields that require a country for proper normalization
    this.investmentFields = [
      'InitialCapital_indexFunds',
      'InitialCapital_shares',
      'InvestmentAllocation_indexFunds',
      'InvestmentAllocation_shares',
      'indexFundsGrowthRate',
      'indexFundsGrowthStdDev',
      'sharesGrowthRate',
      'sharesGrowthStdDev'
    ];
  }

  /**
   * Map a legacy field name to its modern equivalent and normalize it if needed.
   * @param {string} key - The field name from the CSV.
   * @param {string} startCountry - The country code for normalization.
   * @param {boolean} [allowIeFallback=false] - Whether to allow 'ie' as a fallback for truly legacy files.
   * @returns {string} The mapped and normalized field name.
   * @throws {Error} If startCountry is missing for investment-related fields and no fallback is allowed.
   */
  mapFieldName(key, startCountry, allowIeFallback = false) {
    const mappedKey = this.legacyFieldMap[key] || key;
    
    // Check if this is an investment field that needs normalization
    const isInvestmentField = this.investmentFields.includes(mappedKey);
    
    if (isInvestmentField) {
      if (!startCountry) {
        if (allowIeFallback) {
          startCountry = 'ie';
        } else {
          throw new Error(`Cannot map investment field "${key}" (mapped to "${mappedKey}") because startCountry is missing and no default is allowed.`);
        }
      }
      
      return this.normalizeInvestmentKey(mappedKey, startCountry);
    }
    
    return mappedKey;
  }

  /**
   * Check if a field name is a known legacy field.
   * @param {string} key - The field name to check.
   * @returns {boolean} True if it's a legacy field.
   */
  isLegacyField(key) {
    return Object.prototype.hasOwnProperty.call(this.legacyFieldMap, key);
  }

  /**
   * Internal helper to normalize investment keys with country suffix.
   * @param {string} key - The mapped field name.
   * @param {string} startCountry - The country code.
   * @returns {string} The normalized key with suffix.
   */
  normalizeInvestmentKey(key, startCountry) {
    if (!key || typeof key !== 'string') return key;
    
    const countryCode = startCountry.toLowerCase();
    const suffix = `_${countryCode}`;

    if (key.startsWith('InitialCapital_')) {
      const baseKey = key.replace('InitialCapital_', '');
      if (baseKey.endsWith(suffix)) return key;
      // If it has another underscore, don't double-suffix if it's already a modern key for another country
      if (baseKey.indexOf('_') >= 0) return key;
      return `InitialCapital_${baseKey}${suffix}`;
    }
    
    if (key.startsWith('InvestmentAllocation_')) {
      const baseKey = key.replace('InvestmentAllocation_', '');
      if (baseKey.endsWith(suffix)) return key;
      if (baseKey.indexOf('_') >= 0) return key;
      return `InvestmentAllocation_${baseKey}${suffix}`;
    }
    
    if (key.endsWith('GrowthRate')) {
      const baseKey = key.replace('GrowthRate', '');
      if (baseKey.endsWith(suffix)) return key;
      if (baseKey.indexOf('_') >= 0) return key;
      return `${baseKey}${suffix}GrowthRate`;
    }
    
    if (key.endsWith('GrowthStdDev')) {
      const baseKey = key.replace('GrowthStdDev', '');
      if (baseKey.endsWith(suffix)) return key;
      if (baseKey.indexOf('_') >= 0) return key;
      return `${baseKey}${suffix}GrowthStdDev`;
    }
    
    if (key.endsWith(suffix)) return key;
    if (key.indexOf('_') >= 0) return key;
    return `${key}${suffix}`;
  }
}

// Support both browser/GAS globals and Node.js exports for tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LegacyScenarioAdapter };
}
