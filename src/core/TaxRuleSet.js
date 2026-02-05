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
    var code = null;
    try {
      if (typeof this.raw.country === 'string') code = this.raw.country.trim();
    } catch (_) {}
    if (!code && typeof this.raw.countryName === 'string') code = this.raw.countryName.trim();
    if (!code && this.raw.locale) {
      if (typeof this.raw.locale.countryCode === 'string') code = this.raw.locale.countryCode.trim();
      if (!code && typeof this.raw.locale.currencyCode === 'string') code = this.raw.locale.currencyCode.trim();
    }
    if (!code) return null;
    return code.toUpperCase();
  }

  getNumberLocale() {
    var locale = this.raw.locale || {};
    return typeof locale.numberLocale === 'string' ? locale.numberLocale : 'en-IE';
  }

  getCurrencyCode() {
    var locale = this.raw.locale || {};
    return typeof locale.currencyCode === 'string' ? locale.currencyCode : 'EUR';
  }

  getCurrencySymbol() {
    var locale = this.raw.locale || {};
    return typeof locale.currencySymbol === 'string' ? locale.currencySymbol : '€';
  }

  getEconomicData() {
    return this.raw.economicData || {};
  }

  getEconomicProfile() {
    var code = this.getCountryCode();
    if (!code) return null;
    var locale = this.raw.locale || {};
    var economic = this.getEconomicData();
    var inflation = economic.inflation || economic.cpi || {};
    var ppp = economic.purchasingPowerParity || economic.ppp || {};
    var fx = economic.exchangeRate || economic.fx || {};

    var cpiValue = null;
    if (typeof inflation === 'number') cpiValue = inflation;
    else if (inflation && typeof inflation.cpi === 'number') cpiValue = inflation.cpi;
    else if (inflation && typeof inflation.value === 'number') cpiValue = inflation.value;

    var cpiYear = (inflation && typeof inflation.year === 'number') ? inflation.year : null;

    var pppValue = null;
    if (typeof ppp === 'number') pppValue = ppp;
    else if (ppp && typeof ppp.value === 'number') pppValue = ppp.value;

    var pppYear = (ppp && typeof ppp.year === 'number') ? ppp.year : null;

    var fxValue = null;
    if (typeof fx === 'number') fxValue = fx;
    else if (fx && typeof fx.perEur === 'number') fxValue = fx.perEur;
    else if (fx && typeof fx.value === 'number') fxValue = fx.value;
    
    // Fallback: extract FX from timeSeries if exchangeRate.perEur is missing
    if (fxValue == null && economic && economic.timeSeries && economic.timeSeries.fx && economic.timeSeries.fx.series) {
      var fxSeries = economic.timeSeries.fx.series;
      var years = Object.keys(fxSeries).map(function(y) { return parseInt(y, 10); }).filter(function(y) { return !isNaN(y); });
      if (years.length > 0) {
        var latestYear = Math.max.apply(Math, years);
        var lcuPerUsd = fxSeries[latestYear];
        if (lcuPerUsd != null && typeof lcuPerUsd === 'number' && lcuPerUsd > 0) {
          // Convert from LCU/USD to LCU/EUR using the configured default country's FX series (EUR/USD).
          try {
            var cfg = Config.getInstance();
            var anchorRules = cfg && cfg.getCachedTaxRuleSet && cfg.getCachedTaxRuleSet(cfg.getDefaultCountry());
            if (anchorRules) {
              var anchorEconomic = anchorRules.getEconomicData();
              var anchorFxSeries = anchorEconomic && anchorEconomic.timeSeries && anchorEconomic.timeSeries.fx && anchorEconomic.timeSeries.fx.series;
              if (anchorFxSeries) {
                var anchorYears = Object.keys(anchorFxSeries).map(function(y) { return parseInt(y, 10); }).filter(function(y) { return !isNaN(y); });
                if (anchorYears.length > 0) {
                  var anchorLatestYear = Math.max.apply(Math, anchorYears);
                  var eurPerUsd = anchorFxSeries[anchorLatestYear]; // expected EUR per USD
                  if (eurPerUsd != null && typeof eurPerUsd === 'number' && eurPerUsd > 0) {
                    // Convert: LCU/EUR = (LCU/USD) * (USD/EUR) = (LCU/USD) / (EUR/USD)
                    fxValue = lcuPerUsd / eurPerUsd;
                  }
                }
              }
            }
          } catch (_) {
            // Fallback failed, keep fxValue as null
          }
        }
      }
    }

    var fxDate = (fx && typeof fx.asOf === 'string') ? fx.asOf : null;

    var projectionWindowYears = null;
    if (economic && economic.projectionWindowYears !== undefined && economic.projectionWindowYears !== null) {
      var windowRaw = economic.projectionWindowYears;
      var parsed = Number(windowRaw);
      if (!isNaN(parsed) && parsed > 0) {
        projectionWindowYears = parsed;
      }
    }

    var codeUpper = code;
    var currency = null;
    if (typeof locale.currencyCode === 'string' && locale.currencyCode.trim()) {
      currency = locale.currencyCode.trim();
    } else if (typeof locale.countryCode === 'string' && locale.countryCode.trim()) {
      currency = locale.countryCode.trim();
    }

    // Scalar-only profile; timeSeries omitted (processed upstream by getFinData.py).
    var profile = {
      country: codeUpper,
      currency: currency,
      cpi: cpiValue != null ? Number(cpiValue) : null,
      cpi_year: cpiYear,
      ppp: pppValue != null ? Number(pppValue) : null,
      ppp_year: pppYear,
      fx: fxValue != null ? Number(fxValue) : null,
      fx_date: fxDate,
      projectionWindowYears: projectionWindowYears
    };

    return profile;
  }

  getInflationRate() {
    if (typeof this.raw.inflationRate === 'number') {
      return this.raw.inflationRate;
    }
    var economic = this.getEconomicData();
    var inflation = economic.inflation || economic.cpi || {};
    var cpiValue = null;
    if (typeof inflation === 'number') cpiValue = inflation;
    else if (inflation && typeof inflation.cpi === 'number') cpiValue = inflation.cpi;
    else if (inflation && typeof inflation.value === 'number') cpiValue = inflation.value;
    if (cpiValue != null) {
      return Number(cpiValue) / 100;
    }
    return 0.02;
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
    // Backwards-compatible: allow numeric or object forms
    if (typeof credits.employee === 'number') return credits.employee;
    if (credits.employee && typeof credits.employee === 'object') {
      // Prefer explicit amount if provided
      if (typeof credits.employee.amount === 'number') return credits.employee.amount;
      // Support declarative forms: min.amount or max.amount
      if (credits.employee.min && typeof credits.employee.min === 'object' && typeof credits.employee.min.amount === 'number') return credits.employee.min.amount;
      if (credits.employee.max && typeof credits.employee.max === 'object' && typeof credits.employee.max.amount === 'number') return credits.employee.max.amount;
    }
    return 0;
  }

  /**
   * Return a normalized employee credit specification supporting declarative
   * functions like `min`/`max`. Backwards-compatibly accepts a numeric value.
   * Returns { amount, min: { amount, rate } | null, max: { amount, rate } | null }
   */
  getIncomeTaxEmployeeCreditSpec() {
    var it = this.raw.incomeTax || {};
    var credits = it.taxCredits || {};
    var e = credits.employee;
    var spec = { amount: 0, min: null, max: null };
    if (typeof e === 'number') {
      spec.amount = e;
      return spec;
    }
    if (e && typeof e === 'object') {
      // Prefer explicit amount, otherwise fall back to min.amount or max.amount when present
      if (typeof e.amount === 'number') spec.amount = e.amount;
      else if (e.min && typeof e.min === 'object' && typeof e.min.amount === 'number') spec.amount = e.min.amount;
      else if (e.max && typeof e.max === 'object' && typeof e.max.amount === 'number') spec.amount = e.max.amount;
      if (e.min && typeof e.min === 'object') {
        spec.min = { amount: (typeof e.min.amount === 'number') ? e.min.amount : null,
                     rate: (typeof e.min.rate === 'number') ? e.min.rate : null };
      }
      if (e.max && typeof e.max === 'object') {
        spec.max = { amount: (typeof e.max.amount === 'number') ? e.max.amount : null,
                     rate: (typeof e.max.rate === 'number') ? e.max.rate : null };
      }
    }
    return spec;
  }

  getIncomeTaxAgeCredit() {
    var it = this.raw.incomeTax || {};
    var credits = it.taxCredits || {};
    // Support numeric age credit or an object keyed by age thresholds
    if (typeof credits.age === 'number') return credits.age;
    if (credits.age && typeof credits.age === 'object') {
      // Choose the highest age threshold value if present (e.g., {"0":0, "65":245})
      try {
        var keys = Object.keys(credits.age).map(function(k){ return parseInt(k); }).filter(function(n){ return !isNaN(n); }).sort(function(a,b){ return a-b; });
        if (keys.length > 0) {
          var highest = keys[keys.length - 1];
          var val = credits.age[String(highest)];
          if (typeof val === 'number') return val;
        }
      } catch (_) {}
    }
    return 0;
  }

  getIncomeTaxAgeExemptionAge() {
    var it = this.raw.incomeTax || {};
    return typeof it.ageExemptionAge === 'number' ? it.ageExemptionAge : 65;
  }

  getIncomeTaxAgeExemptionLimit() {
    var it = this.raw.incomeTax || {};
    return typeof it.ageExemptionLimit === 'number' ? it.ageExemptionLimit : 0;
  }

  getResidencyRules() {
    var rules = this.raw.residencyRules;
    if (rules && typeof rules === 'object' && !Array.isArray(rules)) return rules;
    return {};
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
   * Return array of tax credit descriptors that require UI input.
   * Each descriptor includes: { id, spec, uiInput }
   * @returns {Array}
   */
  getUIConfigurableCredits() {
    var spec = this.getIncomeTaxSpec();
    var credits = spec.taxCredits || {};
    var result = [];
    for (var creditId in credits) {
      if (!credits.hasOwnProperty(creditId)) continue;
      var credit = credits[creditId];
      if (!credit || typeof credit !== 'object') continue;
      if (!credit.uiInput || typeof credit.uiInput !== 'object') continue;
      result.push({
        id: creditId,
        spec: credit,
        uiInput: credit.uiInput
      });
    }
    return result;
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

  // Return the declared Defined Benefit specification from the ruleset.
  // This MUST be provided by the rules file to define how DBI is treated.
  getDefinedBenefitSpec() {
    var pr = this.raw.pensionRules || {};
    return pr.definedBenefit || null;
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

  // State pension payment period (weekly/monthly/annual).
  // Backwards-compatible: default to "weekly" when missing.
  getStatePensionPeriod() {
    var pr = this.raw.pensionRules || {};
    var v = pr.statePensionPeriod;
    if (typeof v === 'string' && v.trim()) return v.trim().toLowerCase();
    return 'weekly';
  }

  getPensionSystemType() {
    var pr = this.raw.pensionRules || {};
    var ps = pr.pensionSystem || {};
    var type = ps.type;
    if (type === 'state_only' || type === 'mixed') return type;
    return 'mixed';
  }

  isPrivatePensionTaxAdvantaged() {
    var pr = this.raw.pensionRules || {};
    if (typeof pr.taxAdvantaged === 'boolean') return pr.taxAdvantaged;
    return true;
  }

  /**
   * Return true if this country has a private pension system (not state-only).
   * @returns {boolean}
   */
  hasPrivatePensions() {
    return this.getPensionSystemType() !== 'state_only';
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
      const dn = (itSpec && (itSpec.displayName || itSpec.name));
      return dn ? dn : 'Income Tax';
    }
    if (idLower === 'capitalgains' || idLower === 'cgt') {
      const cgtRaw = this.raw.capitalGainsTax || {};
      const dn = cgtRaw.displayName || cgtRaw.name;
      return dn ? dn : 'Capital Gains Tax';
    }

    // Fallback to the provided identifier
    return rawId;
  }

  getTooltipForTax(taxId) {
    const raw=String(taxId||''),low=raw.toLowerCase();
    if(!this._taxTipIndex){const idx=Object.create(null),add=(k,v)=>{if(k&&v)idx[k]=v;};const it=this.raw.incomeTax||{},cgt=this.raw.capitalGainsTax||{};add('incomeTax',it.tooltip);add('capitalGains',cgt.tooltip);this.getSocialContributions().forEach(t=>{if(t){add(t.id,t.tooltip);add((t.name||'').toLowerCase(),t.tooltip);}});this.getAdditionalTaxes().forEach(t=>{if(t){add(t.id,t.tooltip);add((t.name||'').toLowerCase(),t.tooltip);}});this._taxTipIndex=idx;}
    return this._taxTipIndex[raw]||this._taxTipIndex[low]||null;
  }

  /**
   * Return tax IDs in the exact order they are defined in the rules file.
   * Respects top-level key order and array element order.
   */
  getTaxOrder() {
    var order = [];
    try {
      var topKeys = Object.keys(this.raw || {});
      for (var i = 0; i < topKeys.length; i++) {
        var k = topKeys[i];
        if (k === 'incomeTax') {
          order.push('incomeTax');
        } else if (k === 'socialContributions') {
          var sc = this.getSocialContributions();
          for (var si = 0; si < sc.length; si++) {
            var s = sc[si];
            var sid = (s && (s.id || s.name)) ? String(s.id || s.name).toLowerCase() : null;
            if (sid) order.push(sid);
          }
        } else if (k === 'additionalTaxes') {
          var ad = this.getAdditionalTaxes();
          for (var ai = 0; ai < ad.length; ai++) {
            var a = ad[ai];
            var aid = (a && (a.id || a.name)) ? String(a.id || a.name).toLowerCase() : null;
            if (aid) order.push(aid);
          }
        } else if (k === 'capitalGainsTax') {
          order.push('capitalGains');
        }
      }
    } catch (_) {}
    if (order.length === 0) order = ['incomeTax', 'capitalGains'];
    return order;
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

  /**
   * Return investment types with baseRef inheritance resolved.
   * Performs shallow merge: {...base, ...local} when baseRef is present.
   * Throws if baseRef references an unknown base type.
   * @returns {Array} Array of resolved investment type objects
   */
  getResolvedInvestmentTypes() {
    var types = this.getInvestmentTypes();
    var resolved = [];
    for (var i = 0; i < types.length; i++) {
      var type = types[i];
      if (type && type.baseRef) {
        var config = null;
        try {
          config = Config.getInstance();
        } catch (_) {
          throw new Error('Config not initialized. Cannot resolve baseRef: ' + type.baseRef);
        }
        var base = config.getInvestmentBaseTypeByKey(type.baseRef);
        if (!base) {
          throw new Error('Unknown baseRef: ' + type.baseRef + ' in investment type: ' + (type.key || 'unknown'));
        }
        // Shallow merge: local fields override base fields
        var merged = {};
        for (var k in base) {
          if (base.hasOwnProperty(k)) merged[k] = base[k];
        }
        for (var k in type) {
          if (type.hasOwnProperty(k)) merged[k] = type[k];
        }
        resolved.push(merged);
      } else {
        resolved.push(type);
      }
    }
    return resolved;
  }

  findInvestmentTypeByKey(key) {
    var list = this.getResolvedInvestmentTypes();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].key === key) return list[i];
    }
    return null;
  }

  getPinnedIncomeTypes() {
    return Array.isArray(this.raw.pinnedIncomeTypes) ? this.raw.pinnedIncomeTypes : [];
  }

  /**
   * Return the drawdown priorities configuration array from the tax rules.
   * Each entry defines a priority type with its canonical identifier, label, and UI field ID.
   * Returns an empty array if not configured (backward compatibility).
   * @returns {Array} Array of priority configuration objects
   */
  getDrawdownPriorities() {
    return Array.isArray(this.raw.drawdownPriorities) ? this.raw.drawdownPriorities : [];
  }

  /**
   * Find an investment type by its key.
   * Wrapper around findInvestmentTypeByKey for naming consistency with other getters.
   * @param {string} key - The investment type key to look up
   * @returns {Object|null} The investment type object, or null if not found
   */
  getInvestmentType(key) {
    return this.findInvestmentTypeByKey(key);
  }
}

// Make TaxRuleSet available in the context (e.g., for tests)
this.TaxRuleSet = TaxRuleSet;
