/* This file has to work on both the website and Google Sheets */

/**
 * Manages all attribution data for a given year in a simulation run.
 * This provides a single point of access for recording and retrieving attribution data.
 */
class AttributionManager {
  constructor() {
    this.yearlyAttributions = {}; // { metric_name: Attribution }
  }

  /**
   * Records a financial value with its source attribution.
   * @param {string} metric The name of the metric (e.g., "tax:incomeTax", "tax:socialContrib").
   * @param {string} source The description of the source.
   * @param {number} amount The amount from this source.
   */
  record(metric, source, amount) {
    if (!this.yearlyAttributions[metric]) {
      this.yearlyAttributions[metric] = new Attribution(metric);
    }
    this.yearlyAttributions[metric].add(source, amount);
  }

  /**
   * Retrieves the Attribution object for a given metric.
   * @param {string} metric The name of the metric.
   * @returns {Attribution|null} The Attribution object, or null if not found.
   */
  getAttribution(metric) {
    return this.yearlyAttributions[metric] || null;
  }

  /**
   * Resets all yearly attribution data.
   */
  reset() {
    this.yearlyAttributions = {};
  }

  /**
   * Returns all attribution data for the year.
   * @returns {Object.<string, Attribution>} A map of metric names to Attribution objects.
   */
  getAllAttributions() {
    return this.yearlyAttributions;
  }
}
