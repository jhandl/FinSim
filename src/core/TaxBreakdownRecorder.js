class TaxBreakdownRecorder {
  constructor() {
    this.reset();
  }

  /**
   * Reset internal accumulators for a new simulation year.
   */
  reset() {
    // For each tax type we keep a map: { sourceKey: taxableAmount }
    this.taxable = {
      it: {},   // Income Tax
      prsi: {}, // PRSI
      usc: {},  // USC
      cgt: {}   // Capital Gains Tax
    };
  }

  /**
   * Record taxable income originating from a specific source.
   * @param {string} sourceKey  – A stable, user-visible identifier (e.g. "Salary:Google").
   * @param {number} amount     – Taxable amount (EUR) for this source.
   * @param {Object} profile    – Which taxes apply (e.g. {it:1, prsi:1, usc:1}).
   */
  recordIncome(sourceKey, amount, profile = {}) {
    if (!sourceKey || !Number.isFinite(amount) || amount === 0) return;

    for (const tax of Object.keys(this.taxable)) {
      if (!profile[tax]) continue; // Skip taxes that don't apply
      if (!this.taxable[tax][sourceKey]) {
        this.taxable[tax][sourceKey] = 0;
      }
      this.taxable[tax][sourceKey] += amount;
    }
  }

  /**
   * Allocate realised tax amounts proportionally to recorded incomes/gains.
   * @param {Object} taxes – { it:number, prsi:number, usc:number, cgt:number }
   * @returns {Object} per-tax breakdown maps in the same structure as this.taxable
   */
  allocateTaxes(taxes) {
    const result = { it: {}, prsi: {}, usc: {}, cgt: {} };

    // If we already have explicit paid breakdown recorded, prefer returning that.
    if (this.paid && Object.keys(this.paid).length) {
      return JSON.parse(JSON.stringify(this.paid)); // deep copy to avoid mutations
    }

    for (const tax of Object.keys(result)) {
      const totalTaxable = Object.values(this.taxable[tax]).reduce((s, v) => s + v, 0);
      const totalTax = taxes[tax] || 0;
      if (totalTaxable <= 0 || totalTax === 0) continue;

      for (const [sourceKey, amount] of Object.entries(this.taxable[tax])) {
        result[tax][sourceKey] = (totalTax * amount) / totalTaxable;
      }
    }

    return result;
  }

  /**
   * Record the actual euro tax paid for a source (after credits).
   * @param {string} taxHead  – 'it' | 'prsi' | 'usc' | 'cgt'
   * @param {string} sourceKey
   * @param {number} euroAmount
   */
  logPaid(taxHead, sourceKey, euroAmount) {
    if (!taxHead || !sourceKey || !Number.isFinite(euroAmount) || euroAmount === 0) return;
    if (!this.paid) {
      this.paid = { it: {}, prsi: {}, usc: {}, cgt: {} };
    }
    if (!this.paid[taxHead][sourceKey]) {
      this.paid[taxHead][sourceKey] = 0;
    }
    this.paid[taxHead][sourceKey] += euroAmount;
  }
} 