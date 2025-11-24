/* This file has to work on both the website and Google Sheets */

/**
 * A class to represent a value that is composed of several "slices" from different sources.
 * This is used to track the origin of financial data, such as taxes or income.
 */
class Attribution {
  /**
   * @param {string} name The name of the metric this attribution object represents (e.g., "Income Tax").
   * @param {string} [country] Optional country code (ISO-2 like "ie", "ar") where amounts were recorded.
   * @param {number} [year] Optional simulation year when amounts were recorded.
   */
  constructor(name, country, year) {
    this.name = name;
    this.slices = {}; // { source_description: amount }
    this.country = country || null;
    this.year = year || null;
  }

  /**
   * Adds a slice to the attribution.
   * @param {string} source The description of the source (e.g., "Salary 'My Google salary'").
   * @param {number} amount The amount from this source.
   */
  add(source, amount) {
    if (amount === 0) return;
    if (!this.slices[source]) {
      this.slices[source] = 0;
    }
    this.slices[source] += amount;
  }

  /**
   * Sets the country context if not already set.
   * @param {string} country The country code (ISO-2 like "ie", "ar").
   * @param {number} year The simulation year.
   */
  setCountryContext(country, year) {
    if (!this.country && country) this.country = country;
    if (!this.year && year) this.year = year;
  }

  /**
   * Returns the total value of all slices.
   * @returns {number} The total value.
   */
  getTotal() {
    return Object.values(this.slices).reduce((sum, amount) => sum + amount, 0);
  }

  /**
   * Returns the currency-normalized total.
   * @param {string} baseCountry The base country code for normalization.
   * @returns {Object} { amount, currency, fxRate, originalAmount, originalCurrency }
   */
  getNormalizedTotal(baseCountry) {
    var total = this.getTotal();
    
    // Early exit if no conversion context
    if (!baseCountry || !this.country || !this.year) {
      return { amount: total, currency: null, fxRate: 1 };
    }
    
    // Get currency codes for display purposes
    var cfg = Config.getInstance();
    var fromRuleset = cfg.getCachedTaxRuleSet(this.country);
    var baseRuleset = cfg.getCachedTaxRuleSet(baseCountry);
    if (!fromRuleset || !baseRuleset) {
      return { amount: total, currency: null, fxRate: 1 };
    }
    
    var fromCurrency = fromRuleset.getCurrencyCode();
    var baseCurrency = baseRuleset.getCurrencyCode();
    
    // If same country, no conversion needed
    if (this.country === baseCountry) {
      return { amount: total, currency: baseCurrency, fxRate: 1 };
    }
    
    // Convert using nominal FX rates (ledger conversion helper)
    // Prefer convertNominal() from Simulator.js when available for consistency
    var converted = null;
    if (typeof convertNominal === 'function') {
      converted = convertNominal(total, this.country, baseCountry, this.year);
    } else {
      // Fallback: EconomicData.convert now defaults to 'evolution' (inflation-driven FX)
      var economicData = cfg.getEconomicData ? cfg.getEconomicData() : null;
      if (economicData && economicData.ready) {
        converted = economicData.convert(total, this.country, baseCountry, this.year, {
          baseYear: cfg.getSimulationStartYear ? cfg.getSimulationStartYear() : null,
          fallback: 'nearest'
        });
      }
    }
    
    if (converted == null) {
      return { amount: total, currency: fromCurrency, fxRate: 1 };
    }
    
    var fxRate = total !== 0 ? converted / total : 1;
    return {
      amount: converted,
      currency: baseCurrency,
      fxRate: fxRate,
      originalAmount: total,
      originalCurrency: fromCurrency
    };
  }

  /**
   * Returns the breakdown of the attribution as a map of sources to amounts.
   * @returns {Object.<string, number>} The breakdown of slices.
   */
  getBreakdown() {
    return this.slices;
  }

  /**
   * Creates a new Attribution object with the same slices.
   * @returns {Attribution} A new Attribution object.
   */
  clone() {
    const newAttribution = new Attribution(this.name, this.country, this.year);
    newAttribution.slices = { ...this.slices };
    return newAttribution;
  }
}
