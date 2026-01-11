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
   * @param {string} sectionConfig.id - Stable section id (e.g., 'deductions')
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
   * Initialize caches for a known set of countries.
   *
   * @param {Set<string>|Array<string>} countryCodes
   * @returns {number} The maximum column count needed for the section
   */
  initialize(countryCodes) {
    this.maxColumnCount = 0;
    this.countryColumnCounts.clear();
    this.countryColumns.clear();

    countryCodes.forEach((rawCode) => {
      const countryCode = String(rawCode || '').toLowerCase();
      const columns = this.config.getColumns(countryCode);
      const count = columns.length;
      this.countryColumnCounts.set(countryCode, count);
      this.countryColumns.set(countryCode, columns);
      if (count > this.maxColumnCount) this.maxColumnCount = count;
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
    const columns = this.config.getColumns(code);
    this.countryColumns.set(code, columns);
    return columns;
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
    return this.config.id;
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

    const getVisibleCells = (container) => {
      const all = Array.from(container.querySelectorAll(cellSelector));
      return all.filter((cell) => {
        const disp = (cell && cell.style) ? cell.style.display : '';
        return disp !== 'none';
      });
    };

    // "Period" = a tax-header row and the contiguous data rows until the next tax-header.
    const periods = [];
    let current = null;
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    allRows.forEach((row) => {
      if (row.classList && row.classList.contains('tax-header')) {
        current = { rows: [] };
        periods.push(current);
      }
      if (current) current.rows.push(row);
    });

    const periodMeasurements = [];
    for (let p = 0; p < periods.length; p++) {
      const period = periods[p];
      const m = { maxPerColumn: [], cellsByColumn: [] };

      for (let r = 0; r < period.rows.length; r++) {
        const row = period.rows[r];
        const container = row.querySelector(containerSelector);
        if (!container) continue;

        const cells = getVisibleCells(container);
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          const naturalWidth = cell.scrollWidth;
          if (!m.maxPerColumn[i] || naturalWidth > m.maxPerColumn[i]) {
            m.maxPerColumn[i] = naturalWidth;
          }
          if (!m.cellsByColumn[i]) m.cellsByColumn[i] = [];
          m.cellsByColumn[i].push(cell);
        }
      }

      m.totalNaturalWidth = m.maxPerColumn.reduce((sum, w) => sum + (w || 0), 0);
      periodMeasurements.push(m);
    }

    let maxTotalWidth = 0;
    for (let i = 0; i < periodMeasurements.length; i++) {
      const m = periodMeasurements[i];
      if (m.totalNaturalWidth > maxTotalWidth) maxTotalWidth = m.totalNaturalWidth;
    }
    if (maxTotalWidth === 0) return;

    for (let i = 0; i < periodMeasurements.length; i++) {
      const m = periodMeasurements[i];
      if (m.totalNaturalWidth === 0) continue;

      const scaleFactor = maxTotalWidth / m.totalNaturalWidth;
      const scaledWidths = m.maxPerColumn.map(w => Math.round((w || 0) * scaleFactor));

      for (let colIdx = 0; colIdx < m.cellsByColumn.length; colIdx++) {
        const width = scaledWidths[colIdx] || 0;
        const cells = m.cellsByColumn[colIdx] || [];
        for (let c = 0; c < cells.length; c++) {
          const cell = cells[c];
          cell.style.width = `${width}px`;
          cell.style.minWidth = '';
          cell.style.flexBasis = 'auto';
          cell.style.flexShrink = '0';
          cell.style.flexGrow = '0';
          cell.style.flex = '0 0 auto';
        }
      }
    }
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DynamicSectionManager };
}
