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

  // ----- Social Contributions (PRSI) -----
  getPRSIRateForAge(age) {
    var list = this.raw.socialContributions || [];
    for (var i = 0; i < list.length; i++) {
      var sc = list[i];
      if (sc && sc.name === 'PRSI') {
        var rate = typeof sc.rate === 'number' ? sc.rate : 0;
        var ageAdj = sc.ageAdjustments || {};
        var thresholds = Object.keys(ageAdj).map(function(k){return parseInt(k);}).sort(function(a,b){return a-b;});
        for (var j = 0; j < thresholds.length; j++) {
          if (age >= thresholds[j]) {
            rate = ageAdj[String(thresholds[j])];
          }
        }
        return rate || 0;
      }
    }
    return 0;
  }

  // ----- Additional Taxes (USC) -----
  _getUSCEntry() {
    var list = this.raw.additionalTaxes || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].name === 'USC') return list[i];
    }
    return {};
  }

  getUSCExemptAmount() {
    var usc = this._getUSCEntry();
    return typeof usc.exemptAmount === 'number' ? usc.exemptAmount : 0;
  }

  getUSCReducedRateMaxIncome() {
    var usc = this._getUSCEntry();
    return typeof usc.reducedRateMaxIncome === 'number' ? usc.reducedRateMaxIncome : null;
  }

  getUSCReducedRateAge() {
    var usc = this._getUSCEntry();
    return typeof usc.reducedRateAge === 'number' ? usc.reducedRateAge : null;
  }

  getUSCBandsFor(age, totalIncome) {
    var usc = this._getUSCEntry();
    var baseBands = usc.brackets || {};
    var ageBandsMap = usc.ageBasedBrackets || {};
    var reducedAge = this.getUSCReducedRateAge();
    var reducedMaxIncome = this.getUSCReducedRateMaxIncome();

    if (reducedAge !== null && age >= reducedAge) {
      if (reducedMaxIncome === null || (typeof totalIncome === 'number' && totalIncome <= reducedMaxIncome)) {
        // Choose the highest age threshold not exceeding current age
        var thresholds = Object.keys(ageBandsMap).map(function(k){return parseInt(k);}).sort(function(a,b){return a-b;});
        var chosen = null;
        for (var i = 0; i < thresholds.length; i++) {
          if (age >= thresholds[i]) chosen = thresholds[i];
        }
        if (chosen !== null) {
          return ageBandsMap[String(chosen)] || baseBands;
        }
      }
    }
    return baseBands;
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


