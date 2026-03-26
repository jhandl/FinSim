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
      'Inflation': 'Inflation',
      'PriorityCash': 'Priority_cash',
      'PriorityPension': 'Priority_pension',
      'PriorityFunds': 'Priority_indexFunds',
      'PriorityShares': 'Priority_shares',
      'PriorityETF': 'Priority_indexFunds',
      'PriorityTrust': 'Priority_shares'
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
    let normalizedCountry = (startCountry || '').toString().trim().toLowerCase();

    if (!normalizedCountry) {
      if (allowIeFallback) {
        normalizedCountry = 'ie';
      } else {
        throw new Error(`Cannot map field "${key}" (mapped to "${mappedKey}") because startCountry is missing and no default is allowed.`);
      }
    }

    // Country-scoped legacy scalar fields always normalize to canonical per-country ids.
    if (mappedKey === 'Inflation') return 'Inflation_' + normalizedCountry;
    if (mappedKey === 'StatePensionWeekly') return 'StatePension_' + normalizedCountry;
    if (mappedKey === 'P2StatePensionWeekly') return 'P2StatePension_' + normalizedCountry;
    if (mappedKey === 'PersonalTaxCredit') return 'TaxCredit_personal_' + normalizedCountry;
    if (mappedKey === 'PensionContributionPercentage') return 'P1PensionContrib_' + normalizedCountry;
    if (mappedKey === 'PensionContributionPercentageP2') return 'P2PensionContrib_' + normalizedCountry;
    if (mappedKey === 'PensionContributionCapped') return 'PensionCapped_' + normalizedCountry;

    // Legacy index funds growth/volatility should map to global equity settings.
    if (mappedKey === 'indexFundsGrowthRate') return 'GlobalAssetGrowth_globalEquity';
    if (mappedKey === 'indexFundsGrowthStdDev') return 'GlobalAssetVolatility_globalEquity';
    if (mappedKey === 'sharesGrowthRate') return 'LocalAssetGrowth_' + normalizedCountry + '_shares';
    if (mappedKey === 'sharesGrowthStdDev') return 'LocalAssetVolatility_' + normalizedCountry + '_shares';
    
    // Check if this is an investment field that needs normalization
    const isInvestmentField = this.investmentFields.includes(mappedKey) ||
      mappedKey.indexOf('InvestmentAllocation_') === 0 ||
      mappedKey.indexOf('InitialCapital_') === 0;
    
    if (isInvestmentField) {
      return this.normalizeInvestmentKey(mappedKey, normalizedCountry);
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
   * Internal helper to normalize investment keys into canonical forms.
   * @param {string} key - The mapped field name.
   * @param {string} startCountry - The country code.
   * @returns {string} The normalized key.
   */
  normalizeInvestmentKey(key, startCountry) {
    if (!key || typeof key !== 'string') return key;
    
    const countryCode = startCountry.toLowerCase();
    const suffix = `_${countryCode}`;
    const knownCountries = {};
    if (countryCode) knownCountries[countryCode] = true;
    if (typeof Config !== 'undefined' && Config.getInstance) {
      const countries = Config.getInstance().getAvailableCountries ? (Config.getInstance().getAvailableCountries() || []) : [];
      for (let i = 0; i < countries.length; i++) {
        const code = String(countries[i] && countries[i].code ? countries[i].code : '').trim().toLowerCase();
        if (code) knownCountries[code] = true;
      }
    }

    if (key.startsWith('InitialCapital_')) {
      const baseKey = key.replace('InitialCapital_', '');
      if (baseKey.endsWith(suffix)) return key;
      // If it has another underscore, don't double-suffix if it's already a modern key for another country
      if (baseKey.indexOf('_') >= 0) return key;
      return `InitialCapital_${baseKey}${suffix}`;
    }
    
    if (key.startsWith('InvestmentAllocation_')) {
      const baseKey = key.replace('InvestmentAllocation_', '');
      const parts = baseKey.split('_');
      if (parts.length >= 2) {
        const first = String(parts[0] || '').toLowerCase();
        const last = String(parts[parts.length - 1] || '').toLowerCase();
        if (knownCountries[first]) return key;
        if (knownCountries[last]) {
          return `InvestmentAllocation_${last}_${parts.slice(0, -1).join('_')}`;
        }
      }
      return `InvestmentAllocation_${countryCode}_${baseKey}`;
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
