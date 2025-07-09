/* This file has to work on both the website and Google Sheets */

/**
 * A class to represent a value that is composed of several "slices" from different sources.
 * This is used to track the origin of financial data, such as taxes or income.
 */
class Attribution {
  /**
   * @param {string} name The name of the metric this attribution object represents (e.g., "Income Tax").
   */
  constructor(name) {
    this.name = name;
    this.slices = {}; // { source_description: amount }
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
   * Returns the total value of all slices.
   * @returns {number} The total value.
   */
  getTotal() {
    return Object.values(this.slices).reduce((sum, amount) => sum + amount, 0);
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
    const newAttribution = new Attribution(this.name);
    newAttribution.slices = { ...this.slices };
    return newAttribution;
  }
}