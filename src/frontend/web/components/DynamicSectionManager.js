/**
 * DynamicSectionManager
 * 
 * Manages elastic table sections for handling dynamic column layouts when
 * relocations occur during simulation. Scans the entire dataSheet to determine
 * the maximum column count needed for each dynamic section across all countries
 * visited during the simulation.
 * 
 * The dynamic section maintains constant width based on the maximum column
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
   * @param {Object} instance - The TableManager or ChartManager instance with webUI
   * @returns {number} The maximum column count needed for the section
   */
  calculateMaxWidth(instance) {
    // Get unique countries using core utility
    let uniqueCountries = new Set();

    if (instance.webUI) {
      const uiManager = new UIManager(instance.webUI);
      const events = uiManager.readEvents(false);
      const startCountry = Config.getInstance().getStartCountry();
      uniqueCountries = getUniqueCountries(events, startCountry);
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
   * Gets the section name from the config
   * 
   * @returns {string} The section name (lowercase, suitable for data attributes)
   */
  getSectionName() {
    return this.config.name ? this.config.name.toLowerCase() : 'unknown';
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
   * Measures all dynamic section cells and applies proportional scaling so that:
   * 1. All countries' sections have the same total width
   * 2. Within each country, relative column proportions are preserved
   * 
   * Uses generic CSS classes: .dynamic-section-container and .dynamic-section-cell
   * with data-section attribute to identify which section the cells belong to.
   * 
   * @param {Element} tbody - The tbody element to search within
   */
  finalizeSectionWidths(tbody) {
    if (!tbody || !this.initialized) return;

    const sectionName = this.getSectionName();
    const containerSelector = `.dynamic-section-container[data-section="${sectionName}"]`;
    const cellSelector = '.dynamic-section-cell';

    // Ensure re-running this method (e.g. after currency display changes) measures
    // intrinsic content widths rather than previously-fixed pixel widths.
    try {
      const allCells = tbody.querySelectorAll(`${containerSelector} ${cellSelector}`);
      allCells.forEach(cell => {
        cell.style.width = '';
        cell.style.minWidth = '';
        cell.style.flexBasis = '';
        cell.style.flexShrink = '';
        cell.style.flexGrow = '';
        cell.style.flex = '';
        // Clear empty-state truncation styles if present
        cell.style.overflow = '';
        cell.style.textOverflow = '';
      });
    } catch (_) { }

    // Group all containers by country
    const countryMeasurements = new Map(); // country -> { maxPerColumn: [], cells: [] }

    // Helper to measure cells and update country measurements
    const measureCells = (cells, country) => {
      if (!countryMeasurements.has(country)) {
        countryMeasurements.set(country, { maxPerColumn: [], cells: [] });
      }
      const m = countryMeasurements.get(country);
      cells.forEach((cell, i) => {
        const naturalWidth = cell.scrollWidth;
        if (!m.maxPerColumn[i] || naturalWidth > m.maxPerColumn[i]) {
          m.maxPerColumn[i] = naturalWidth;
        }
        m.cells.push(cell);
      });
    };

    // Measure tax header rows (have data-country attribute)
    const taxHeaders = tbody.querySelectorAll('tr.tax-header');
    taxHeaders.forEach(headerRow => {
      const country = headerRow.getAttribute('data-country');
      if (!country) return;

      const container = headerRow.querySelector(containerSelector);
      if (!container) return;

      const cells = container.querySelectorAll(cellSelector);
      if (cells.length === 0) return;

      measureCells(cells, country);
    });

    // Measure data rows - determine country by finding which tax header precedes them
    let currentCountry = null;
    const allRows = tbody.querySelectorAll('tr');
    allRows.forEach(row => {
      if (row.classList.contains('tax-header')) {
        currentCountry = row.getAttribute('data-country');
      } else if (currentCountry) {
        const container = row.querySelector(containerSelector);
        if (!container) return;

        const cells = container.querySelectorAll(cellSelector);
        if (cells.length === 0) return;

        if (!countryMeasurements.has(currentCountry)) return;
        measureCells(cells, currentCountry);
      }
    });

    // Calculate total natural width per country
    countryMeasurements.forEach((m) => {
      m.totalNaturalWidth = m.maxPerColumn.reduce((sum, w) => sum + (w || 0), 0);
    });

    // Find max total width across all countries
    let maxTotalWidth = 0;
    countryMeasurements.forEach(m => {
      if (m.totalNaturalWidth > maxTotalWidth) {
        maxTotalWidth = m.totalNaturalWidth;
      }
    });

    if (maxTotalWidth === 0) return;

    // Apply proportional scaling to each country
    countryMeasurements.forEach((m) => {
      if (m.totalNaturalWidth === 0) return;

      const scaleFactor = maxTotalWidth / m.totalNaturalWidth;
      const scaledWidths = m.maxPerColumn.map(w => Math.round((w || 0) * scaleFactor));

      // Apply scaled widths to all cells for this country
      let cellIndex = 0;
      const numColumns = m.maxPerColumn.length;
      m.cells.forEach(cell => {
        const colIdx = cellIndex % numColumns;
        cell.style.width = `${scaledWidths[colIdx]}px`;
        // Override any empty-state flex-fill styles so fixed pixel widths apply.
        cell.style.minWidth = '';
        cell.style.flexBasis = 'auto';
        cell.style.flexShrink = '0';
        cell.style.flexGrow = '0';
        cell.style.flex = '0 0 auto';
        cellIndex++;
      });
    });
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
const PENSION_CONTRIBUTION_COLUMN = {
  key: 'PensionContribution',
  label: 'P.Contrib',
  tooltip: 'Amount contributed to private pensions (excluding employer match)'
};

const DEDUCTIONS_SECTION_CONFIG = {
  name: 'Deductions',
  getColumns: (countryCode) => {
    try {
      const taxRuleSet = Config.getInstance().getCachedTaxRuleSet(countryCode);
      if (!taxRuleSet) {
        return [PENSION_CONTRIBUTION_COLUMN];
      }

      // PensionContribution comes first in the deductions section
      const columns = [PENSION_CONTRIBUTION_COLUMN];

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
      return [PENSION_CONTRIBUTION_COLUMN];
    }
  }
};


// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DynamicSectionManager, DEDUCTIONS_SECTION_CONFIG };
}
