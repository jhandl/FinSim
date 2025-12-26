/**
 * DynamicSectionManager
 * 
 * Manages elastic table sections for handling dynamic column layouts when
 * relocations occur during simulation. Scans the entire dataSheet to determine
 * the maximum column count needed for each dynamic section across all countries
 * visited during the simulation.
 * 
 * The Deductions section maintains constant width based on the maximum column
 * count, with individual columns expanding to fill available space when fewer
 * columns are needed.
 */
class DynamicSectionManager {
  /**
   * @param {Object} sectionConfig - Configuration for the dynamic section
   * @param {string} sectionConfig.name - Name of the section (e.g., 'Deductions')
   * @param {Function} sectionConfig.getColumns - Function that takes countryCode and returns column definitions
   */
  constructor(sectionConfig) {
    this.config = sectionConfig;
    this.maxColumnCount = 0;
    this.countryColumnCounts = new Map();
    this.countryColumns = new Map();
    this.initialized = false;
  }

  /**
   * Scans the dataSheet to calculate the maximum column count across all countries
   * visited during the simulation.
   * 
   * @param {Object} instance - The TableManager or ChartManager instance with countryTimeline
   * @returns {number} The maximum column count needed for the section
   */
  calculateMaxWidth(instance) {
    // Get unique countries from the timeline
    const uniqueCountries = new Set();

    if (instance.countryTimeline && Array.isArray(instance.countryTimeline)) {
      for (let i = 0; i < instance.countryTimeline.length; i++) {
        const entry = instance.countryTimeline[i];
        if (entry && entry.country) {
          uniqueCountries.add(entry.country.toLowerCase());
        }
      }
    }

    // If no countries in timeline, use the default country
    if (uniqueCountries.size === 0) {
      try {
        const defaultCountry = Config.getInstance().getDefaultCountry();
        if (defaultCountry) {
          uniqueCountries.add(defaultCountry.toLowerCase());
        }
      } catch (_) {
        uniqueCountries.add('ie'); // Fallback to Ireland
      }
    }

    // Calculate column count for each country
    this.maxColumnCount = 0;
    this.countryColumnCounts.clear();
    this.countryColumns.clear();

    uniqueCountries.forEach(countryCode => {
      try {
        const columns = this.config.getColumns(countryCode);
        const count = columns ? columns.length : 0;
        this.countryColumnCounts.set(countryCode, count);
        this.countryColumns.set(countryCode, columns);
        if (count > this.maxColumnCount) {
          this.maxColumnCount = count;
        }
      } catch (err) {
        console.warn(`DynamicSectionManager: Error getting columns for ${countryCode}:`, err);
      }
    });

    this.initialized = true;
    return this.maxColumnCount;
  }

  /**
   * Gets the column definitions for a specific country
   * 
   * @param {string} countryCode - The country code (lowercase)
   * @returns {Array} Array of column definitions with key, label, and tooltip
   */
  getColumnsForCountry(countryCode) {
    const code = countryCode ? countryCode.toLowerCase() : null;
    if (this.countryColumns.has(code)) {
      return this.countryColumns.get(code);
    }
    // If country not cached, calculate on demand
    try {
      const columns = this.config.getColumns(code);
      this.countryColumns.set(code, columns);
      return columns;
    } catch (err) {
      console.warn(`DynamicSectionManager: Error getting columns for ${code}:`, err);
      return [];
    }
  }

  /**
   * Gets the column count for a specific country
   * 
   * @param {string} countryCode - The country code (lowercase)
   * @returns {number} The number of columns for that country
   */
  getColumnCountForCountry(countryCode) {
    const code = countryCode ? countryCode.toLowerCase() : null;
    if (this.countryColumnCounts.has(code)) {
      return this.countryColumnCounts.get(code);
    }
    const columns = this.getColumnsForCountry(code);
    return columns ? columns.length : 0;
  }

  /**
   * Gets the maximum column count across all countries
   * 
   * @returns {number} The maximum column count
   */
  getMaxColumnCount() {
    return this.maxColumnCount;
  }

  /**
   * Checks if the manager has been initialized with data
   * 
   * @returns {boolean} True if initialized
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Resets the manager for a new simulation run
   */
  reset() {
    this.maxColumnCount = 0;
    this.countryColumnCounts.clear();
    this.countryColumns.clear();
    this.initialized = false;
  }
}

/**
 * Configuration for the Deductions section
 * Includes PensionContribution (fixed) and tax columns (dynamic per country)
 */
const DEDUCTIONS_SECTION_CONFIG = {
  name: 'Deductions',
  getColumns: (countryCode) => {
    try {
      const taxRuleSet = Config.getInstance().getCachedTaxRuleSet(countryCode);
      if (!taxRuleSet) {
        return [{ key: 'PensionContribution', label: 'P.Contrib', tooltip: 'Amount contributed to private pensions' }];
      }

      // PensionContribution comes first in the deductions section
      const columns = [{
        key: 'PensionContribution',
        label: 'P.Contrib',
        tooltip: 'Amount contributed to private pensions'
      }];

      // Then add tax columns
      const taxOrder = taxRuleSet.getTaxOrder ? taxRuleSet.getTaxOrder() : [];
      taxOrder.forEach(taxId => {
        columns.push({
          key: `Tax__${taxId}`,
          label: taxRuleSet.getDisplayNameForTax ? taxRuleSet.getDisplayNameForTax(taxId) : taxId.toUpperCase(),
          tooltip: taxRuleSet.getTooltipForTax ? taxRuleSet.getTooltipForTax(taxId) : `${taxId} tax paid`
        });
      });

      return columns;
    } catch (err) {
      console.warn(`DEDUCTIONS_SECTION_CONFIG: Error getting columns for ${countryCode}:`, err);
      return [{ key: 'PensionContribution', label: 'P.Contrib', tooltip: 'Amount contributed to private pensions' }];
    }
  }
};


// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DynamicSectionManager, DEDUCTIONS_SECTION_CONFIG };
}
