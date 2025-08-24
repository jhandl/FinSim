/* This file has to work on both the website and Google Sheets */

/**
 * TaxRuleSet is a simple data wrapper around a country-specific tax JSON file.
 * It provides safe getters with sensible defaults, without introducing
 * environment-specific features (keeps GAS compatibility).
 */
class TaxRuleSet {
  constructor(rawRules) {
    this.raw = rawRules || {};
    this._normalize();
  }

  _normalize() {
    // Ensure expected top-level objects exist
    if (!this.raw.incomeTax) this.raw.incomeTax = {};
    if (!this.raw.pensionRules) this.raw.pensionRules = {};
    if (!this.raw.capitalGainsTax) this.raw.capitalGainsTax = {};
    if (!this.raw.investmentTypes) this.raw.investmentTypes = [];

    // Normalize brackets maps to ensure numeric sort order works as strings
    const normalizeBands = function(bands) {
      if (!bands || typeof bands !== 'object') return {};
      const normalized = {};
      // Copy as-is; compute logic will parseInt keys and sort as needed
      for (var k in bands) { normalized[k] = bands[k]; }
      return normalized;
    };

    // Income tax brackets normalization
    var it = this.raw.incomeTax;
    if (it.brackets) it.brackets = normalizeBands(it.brackets);
    if (it.bracketsByStatus) {
      for (var status in it.bracketsByStatus) {
        it.bracketsByStatus[status] = normalizeBands(it.bracketsByStatus[status]);
      }
    }

    // Pension rules
    var pr = this.raw.pensionRules;
    if (pr.lumpSumTaxBands) pr.lumpSumTaxBands = normalizeBands(pr.lumpSumTaxBands);
  }

  getCountryCode() {
    return this.raw.country || 'IE';
  }

  // ----- Income Tax -----
  getIncomeTaxBracketsFor(status, hasDependentChildren) {
    var it = this.raw.incomeTax || {};
    var byStatus = it.bracketsByStatus || {};
    if (status === 'single') {
      if (hasDependentChildren && byStatus.singleWithDependents) {
        return byStatus.singleWithDependents;
      }
      if (byStatus.single) return byStatus.single;
    }
    if (status === 'married' && byStatus.married) return byStatus.married;
    // Fallback to generic brackets
    return it.brackets || {};
  }

  getIncomeTaxJointBandIncreaseMax() {
    var it = this.raw.incomeTax || {};
    return typeof it.jointBandIncreaseMax === 'number' ? it.jointBandIncreaseMax : 0;
  }

  getIncomeTaxEmployeeCredit() {
    var it = this.raw.incomeTax || {};
    var credits = it.taxCredits || {};
    return typeof credits.employee === 'number' ? credits.employee : 0;
  }

  getIncomeTaxAgeCredit() {
    var it = this.raw.incomeTax || {};
    var credits = it.taxCredits || {};
    return typeof credits.age === 'number' ? credits.age : 0;
  }

  getIncomeTaxAgeExemptionAge() {
    var it = this.raw.incomeTax || {};
    return typeof it.ageExemptionAge === 'number' ? it.ageExemptionAge : 65;
  }

  getIncomeTaxAgeExemptionLimit() {
    var it = this.raw.incomeTax || {};
    return typeof it.ageExemptionLimit === 'number' ? it.ageExemptionLimit : 0;
  }

  // ------ Generic Getters (Country-Neutral) ------
  /**
   * Return the raw income tax specification object.  Keys are optional and
   * consumers should treat missing keys as absent.
   * { brackets, bracketsByStatus, taxCredits, ageExemptionAge, ageExemptionLimit, jointBandIncreaseMax }
   */
  getIncomeTaxSpec() {
    return this.raw.incomeTax || {};
  }

  /**
   * Return array of social contribution descriptors as provided by the JSON
   * (e.g., [{name:'socialContrib', rate:0.04, ageAdjustments:{66:0}}])
   */
  getSocialContributions() {
    return Array.isArray(this.raw.socialContributions) ? this.raw.socialContributions : [];
  }

  /**
   * Return array of additional taxes (e.g., universalSocialCharge) exactly as in JSON.
   */
  getAdditionalTaxes() {
    return Array.isArray(this.raw.additionalTaxes) ? this.raw.additionalTaxes : [];
  }

  /**
   * Generic selector for additional-tax band sets.
   * Allows declarative selection based on arbitrary conditions contained in the
   * tax descriptor (age/income thresholds, selectionRules, reduced bands, etc.).
   * Returns a bands object (map of lower-limit -> rate) or an empty object.
   *
   * This method is intentionally generic and does not encode any country-specific
   * assumptions; it merely interprets fields a tax descriptor may provide to
   * express conditional band selection.
   *
   * Supported descriptor fields (non-exhaustive, fallback order shown below):
   * - selectionRules: [{ minAge, maxAge, minIncome, maxIncome, brackets }...]
   * - reducedRateAge + reducedRateMaxIncome + reducedTaxBands
   * - ageBasedBrackets: { "60": {...}, "70": {...} }
   * - incomeBasedBrackets: { "0": {...}, "30000": {...} }
   * - brackets (fallback)
   */
  getAdditionalTaxBandsFor(name, age, totalIncome) {
    const list = this.getAdditionalTaxes();
    for (let i = 0; i < list.length; i++) {
      const tax = list[i];
      if (!tax || tax.name !== name) continue;

      // 1) Declarative selection rules (highest priority)
      if (Array.isArray(tax.selectionRules)) {
        for (let r = 0; r < tax.selectionRules.length; r++) {
          const rule = tax.selectionRules[r] || {};
          const minAge = (typeof rule.minAge === 'number') ? rule.minAge : null;
          const maxAge = (typeof rule.maxAge === 'number') ? rule.maxAge : null;
          const minIncome = (typeof rule.minIncome === 'number') ? rule.minIncome : null;
          const maxIncome = (typeof rule.maxIncome === 'number') ? rule.maxIncome : null;
          let ok = true;
          if (minAge !== null && (typeof age !== 'number' || age < minAge)) ok = false;
          if (maxAge !== null && (typeof age !== 'number' || age > maxAge)) ok = false;
          if (minIncome !== null && (typeof totalIncome !== 'number' || totalIncome < minIncome)) ok = false;
          if (maxIncome !== null && (typeof totalIncome !== 'number' || totalIncome > maxIncome)) ok = false;
          if (ok) return rule.brackets || rule.bracketsRef || tax.brackets || {};
        }
      }

      // 2) Legacy reduced-rate shorthand: check age + optional max-income
      if (typeof tax.reducedRateAge === 'number') {
        const reducedMax = (typeof tax.reducedRateMaxIncome === 'number') ? tax.reducedRateMaxIncome : null;
        if ((typeof age === 'number' && age >= tax.reducedRateAge) && (reducedMax === null || (typeof totalIncome === 'number' && totalIncome <= reducedMax))) {
          // Prefer age-based bracket override for reduced-rate when provided
          if (tax.ageBasedBrackets && typeof tax.ageBasedBrackets === 'object') {
            const thresholds = Object.keys(tax.ageBasedBrackets).map(k => parseInt(k)).sort((a, b) => a - b);
            let chosen = null;
            for (let j = 0; j < thresholds.length; j++) { if (typeof age === 'number' && age >= thresholds[j]) chosen = thresholds[j]; }
            if (chosen !== null) return tax.ageBasedBrackets[String(chosen)] || (tax.reducedTaxBands || (tax.brackets && { '0': tax.brackets['0'] }) || {});
          }
          return tax.reducedTaxBands || (tax.brackets && { '0': tax.brackets['0'] }) || {};
        }
      }

      // 3) Age-based bracket sets: choose highest threshold not exceeding age.
      // If a reducedRateAge is configured, only apply age-based overrides when the
      // reduced-rate conditions are satisfied (to preserve semantics where age
      // reductions are conditional on both age and an optional income cap).
      if (tax.ageBasedBrackets && typeof tax.ageBasedBrackets === 'object') {
        const reducedAgeDefined = (typeof tax.reducedRateAge === 'number');
        let applyAgeBased = true;
        if (reducedAgeDefined) {
          const reducedMax = (typeof tax.reducedRateMaxIncome === 'number') ? tax.reducedRateMaxIncome : null;
          applyAgeBased = (typeof age === 'number' && age >= tax.reducedRateAge) && (reducedMax === null || (typeof totalIncome === 'number' && totalIncome <= reducedMax));
        }
        if (applyAgeBased) {
          const thresholds = Object.keys(tax.ageBasedBrackets).map(k => parseInt(k)).sort((a, b) => a - b);
          let chosen = null;
          for (let j = 0; j < thresholds.length; j++) { if (typeof age === 'number' && age >= thresholds[j]) chosen = thresholds[j]; }
          if (chosen !== null) return tax.ageBasedBrackets[String(chosen)] || tax.brackets || {};
        }
      }

      // 4) Income-based bracket sets: choose highest threshold not exceeding totalIncome
      if (tax.incomeBasedBrackets && typeof tax.incomeBasedBrackets === 'object') {
        const thresholds = Object.keys(tax.incomeBasedBrackets).map(k => parseFloat(k)).sort((a, b) => a - b);
        let chosen = null;
        for (let j = 0; j < thresholds.length; j++) { if (typeof totalIncome === 'number' && totalIncome >= thresholds[j]) chosen = thresholds[j]; }
        if (chosen !== null) return tax.incomeBasedBrackets[String(chosen)] || tax.brackets || {};
      }

      // 5) Fallback to declared brackets
      return tax.brackets || {};
    }
    return {};
  }

  /**
   * Return capital gains spec {annualExemption, rate} from JSON; missing values default to 0.
   */
  getCapitalGainsSpec() {
    const cgt = this.raw.capitalGainsTax || {};
    return {
      annualExemption: typeof cgt.annualExemption === 'number' ? cgt.annualExemption : 0,
      rate: typeof cgt.rate === 'number' ? cgt.rate : 0
    };
  }

  // ----- Pension Rules -----
  getPensionLumpSumTaxBands() {
    var pr = this.raw.pensionRules || {};
    return pr.lumpSumTaxBands || {};
  }

  getPensionLumpSumMaxPercent() {
    var pr = this.raw.pensionRules || {};
    return typeof pr.lumpSumMaxPercent === 'number' ? pr.lumpSumMaxPercent : 0;
  }

  getPensionContributionAgeBands() {
    var pr = this.raw.pensionRules || {};
    var contrib = pr.contributionLimits || {};
    return contrib.ageBandsPercent || {};
  }

  getPensionContributionAnnualCap() {
    var pr = this.raw.pensionRules || {};
    var contrib = pr.contributionLimits || {};
    return typeof contrib.annualCap === 'number' ? contrib.annualCap : 0;
  }

  getPensionMinDrawdownRates() {
    var pr = this.raw.pensionRules || {};
    return pr.minDrawdownRates || {};
  }

  getPensionMinRetirementAgePrivate() {
    var pr = this.raw.pensionRules || {};
    return typeof pr.minRetirementAgePrivate === 'number' ? pr.minRetirementAgePrivate : 0;
  }

  getPensionMinRetirementAgeOccupational() {
    var pr = this.raw.pensionRules || {};
    return typeof pr.minRetirementAgeOccupational === 'number' ? pr.minRetirementAgeOccupational : 0;
  }

  getPensionMinRetirementAgeState() {
    var pr = this.raw.pensionRules || {};
    return typeof pr.statePensionAge === 'number' ? pr.statePensionAge : (typeof pr.minRetirementAgeState === 'number' ? pr.minRetirementAgeState : 0);
  }

  getStatePensionIncreaseBands() {
    var pr = this.raw.pensionRules || {};
    return pr.statePensionIncreaseBands || {};
  }

  // ----- Generic helpers for tax display names -----
  /**
   * Return the display name for a tax by its ID, looking across all tax categories.
   * Searches social contributions, additional taxes, and capital gains tax.
   * Returns the tax ID if no display name is found.
   */
  getDisplayNameForTax(taxId) {
    // Defensive normalization
    const rawId = (taxId == null) ? '' : String(taxId);
    const idLower = rawId.toLowerCase();

    // Build lazy cache: map IDs and lowercase names to display names
    if (!this._taxDisplayIndex) {
      const index = Object.create(null);
      const add = function(key, value) {
        if (!key) return;
        if (index[key] === undefined) index[key] = value;
      };

      const socialContribs = this.getSocialContributions();
      for (let i = 0; i < socialContribs.length; i++) {
        const tax = socialContribs[i];
        if (!tax) continue;
        const display = (tax.displayName || tax.name || tax.id || '');
        if (typeof tax.id === 'string' && tax.id) add(tax.id, display);
        if (typeof tax.name === 'string' && tax.name) add(tax.name.toLowerCase(), display);
      }

      const additionalTaxes = this.getAdditionalTaxes();
      for (let i = 0; i < additionalTaxes.length; i++) {
        const tax = additionalTaxes[i];
        if (!tax) continue;
        const display = (tax.displayName || tax.name || tax.id || '');
        if (typeof tax.id === 'string' && tax.id) add(tax.id, display);
        if (typeof tax.name === 'string' && tax.name) add(tax.name.toLowerCase(), display);
      }

      this._taxDisplayIndex = index;
    }

    // O(1) lookups
    if (this._taxDisplayIndex[rawId] !== undefined) return this._taxDisplayIndex[rawId] || rawId;
    if (this._taxDisplayIndex[idLower] !== undefined) return this._taxDisplayIndex[idLower] || rawId;

    // 3) Special-case common aliases
    if (idLower === 'incometax' || idLower === 'it') {
      const itSpec = this.getIncomeTaxSpec();
      return (itSpec && itSpec.displayName) ? itSpec.displayName : 'Income Tax';
    }
    if (idLower === 'capitalgains' || idLower === 'cgt') {
      const cgtSpec = this.getCapitalGainsSpec();
      return (cgtSpec && cgtSpec.displayName) ? cgtSpec.displayName : 'Capital Gains Tax';
    }

    // Fallback to the provided identifier
    return rawId;
  }

  // ----- Generic helpers for additional taxes -----
  /**
   * Return the configured exempt amount for an additional tax descriptor by name.
   */
  getAdditionalTaxExemptAmount(name) {
    const list = this.getAdditionalTaxes();
    for (let i = 0; i < list.length; i++) {
      const tax = list[i];
      if (tax && tax.name === name) return typeof tax.exemptAmount === 'number' ? tax.exemptAmount : 0;
    }
    return 0;
  }

  /**
   * Return configured income exemption threshold (cliff) for an additional tax by name.
   * When total income is at or below this threshold, the tax is not applied at all;
   * when above, tax applies to the full base with no reduction.
   */
  getAdditionalTaxIncomeExemptionThreshold(name) {
    const list = this.getAdditionalTaxes();
    for (let i = 0; i < list.length; i++) {
      const tax = list[i];
      if (tax && tax.name === name) return typeof tax.incomeExemptionThreshold === 'number' ? tax.incomeExemptionThreshold : 0;
    }
    return 0;
  }

  /**
   * Return configured deductible exemption amount for an additional tax by name.
   * This amount is subtracted from the taxable base before applying brackets.
   */
  getAdditionalTaxDeductibleExemptionAmount(name) {
    const list = this.getAdditionalTaxes();
    for (let i = 0; i < list.length; i++) {
      const tax = list[i];
      if (tax && tax.name === name) return typeof tax.deductibleExemptionAmount === 'number' ? tax.deductibleExemptionAmount : 0;
    }
    return 0;
  }

  /**
   * Return configured reduced-rate age threshold for an additional tax, or null.
   */
  getAdditionalTaxReducedRateAge(name) {
    const list = this.getAdditionalTaxes();
    for (let i = 0; i < list.length; i++) {
      const tax = list[i];
      if (tax && tax.name === name) return typeof tax.reducedRateAge === 'number' ? tax.reducedRateAge : null;
    }
    return null;
  }

  /**
   * Return configured reduced-rate max-income cutoff for an additional tax, or null.
   */
  getAdditionalTaxReducedRateMaxIncome(name) {
    const list = this.getAdditionalTaxes();
    for (let i = 0; i < list.length; i++) {
      const tax = list[i];
      if (tax && tax.name === name) return typeof tax.reducedRateMaxIncome === 'number' ? tax.reducedRateMaxIncome : null;
    }
    return null;
  }

  // ----- Capital Gains -----
  getCapitalGainsAnnualExemption() {
    var cgt = this.raw.capitalGainsTax || {};
    return typeof cgt.annualExemption === 'number' ? cgt.annualExemption : 0;
  }

  getCapitalGainsRate() {
    var cgt = this.raw.capitalGainsTax || {};
    return typeof cgt.rate === 'number' ? cgt.rate : 0;
  }

  // ----- Investment Types (Generic) -----
  getInvestmentTypes() {
    return Array.isArray(this.raw.investmentTypes) ? this.raw.investmentTypes : [];
  }

  findInvestmentTypeByKey(key) {
    var list = this.getInvestmentTypes();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].key === key) return list[i];
    }
    return null;
  }
}

// Make TaxRuleSet available in the context (e.g., for tests)
this.TaxRuleSet = TaxRuleSet;


