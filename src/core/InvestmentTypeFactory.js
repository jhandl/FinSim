/* This file has to work on both the website and Google Sheets */

/**
 * GenericInvestmentAsset is a generic equity-like asset whose taxation behavior
 * is fully defined by the provided investment type definition from the tax rules.
 *
 * It unifies the logic currently split between IndexFunds (exit tax + deemed disposal)
 * and Shares (capital gains). It uses the Equity portfolio mechanics for buys/sells/growth
 * and augments year progression with optional deemed disposal based on the rules.
 */
class GenericInvestmentAsset extends Equity {
  constructor(investmentTypeDef, growth, stdev, ruleset) {
    const taxRate = GenericInvestmentAsset._resolveTaxRate(investmentTypeDef, ruleset);
    super(taxRate, growth, stdev);
    this._typeDef = investmentTypeDef || {};
    this._ruleset = ruleset || null;
    this.key = this._typeDef.key || 'asset';
    this.label = this._typeDef.label || this.key;
    this.baseCurrency = this._typeDef.baseCurrency;
    this.assetCountry = this._typeDef.assetCountry;
    this.residenceScope = this._typeDef.residenceScope;
    this._taxCategory = GenericInvestmentAsset._resolveTaxCategory(investmentTypeDef);
    this._deemedDisposalYears = GenericInvestmentAsset._resolveDeemedDisposalYears(investmentTypeDef);
    this.canOffsetLosses = GenericInvestmentAsset._resolveAllowLossOffset(investmentTypeDef);
    this.eligibleForAnnualExemption = GenericInvestmentAsset._resolveAnnualExemptionEligibility(investmentTypeDef);

    // Resolve currency/country defaults from ruleset if type definition omits them
    if (this.baseCurrency === undefined && this._ruleset && typeof this._ruleset.getCurrencyCode === 'function') {
      this.baseCurrency = this._ruleset.getCurrencyCode();
    }
    if (this.assetCountry === undefined && this._ruleset && typeof this._ruleset.getCountryCode === 'function') {
      var countryCode = this._ruleset.getCountryCode();
      if (countryCode) {
        this.assetCountry = countryCode.toLowerCase();
      }
    }
  }

  // Override buy() to capture currency/country from first call if still undefined
  buy(amountToBuy, currency, country, growthOverride, stdevOverride) {
    if (!currency || !country) {
      throw new Error('Equity.buy() requires currency and country parameters');
    }
    // Capture currency/country from first buy() call if not yet resolved
    if (this.baseCurrency === undefined) {
      this.baseCurrency = currency;
    }
    if (this.assetCountry === undefined) {
      this.assetCountry = country;
    }
    super.buy(amountToBuy, currency, country, growthOverride, stdevOverride);
  }

  // Override currency methods for multi-country assets
  _getBaseCurrency() {
    return this.baseCurrency;
  }

  _getAssetCountry() {
    return this.assetCountry;
  }

  static _resolveTaxCategory(typeDef) {
    if (typeDef && typeDef.taxation && typeDef.taxation.exitTax) return 'exitTax';
    return 'capitalGains';
  }

  static _resolveAllowLossOffset(typeDef) {
    var t = (typeDef && typeDef.taxation) || {};
    if (t.exitTax && typeof t.exitTax.allowLossOffset === 'boolean') return t.exitTax.allowLossOffset;
    if (t.capitalGains && typeof t.capitalGains.allowLossOffset === 'boolean') return t.capitalGains.allowLossOffset;
    return true; // default platform behavior
  }

  static _resolveDeemedDisposalYears(typeDef) {
    var t = (typeDef && typeDef.taxation && typeDef.taxation.exitTax) || {};
    return typeof t.deemedDisposalYears === 'number' ? t.deemedDisposalYears : 0;
  }

  static _resolveAnnualExemptionEligibility(typeDef) {
    var t = (typeDef && typeDef.taxation) || {};
    if (t.exitTax && typeof t.exitTax.eligibleForAnnualExemption === 'boolean') return t.exitTax.eligibleForAnnualExemption;
    if (t.capitalGains && typeof t.capitalGains.eligibleForAnnualExemption === 'boolean') return t.capitalGains.eligibleForAnnualExemption;
    // Defaults: exit tax false unless overridden; CGT true
    if (t.exitTax) return false;
    if (t.capitalGains) return true;
    return false;
  }

  static _resolveTaxRate(typeDef, ruleset) {
    if (!typeDef || !typeDef.taxation) return 0;
    var tx = typeDef.taxation;
    if (tx.exitTax && typeof tx.exitTax.rate === 'number') return tx.exitTax.rate;
    if (tx.capitalGains) {
      if (typeof tx.capitalGains.rate === 'number') return tx.capitalGains.rate;
      if (tx.capitalGains.rateRef && ruleset && typeof ruleset.getCapitalGainsRate === 'function') {
        // Current IE mapping: "capitalGainsTax.rate" → ruleset.getCapitalGainsRate()
        return ruleset.getCapitalGainsRate();
      }
    }
    return 0;
  }

  // Override to attribute sales using the configured label instead of class name
  declareRevenue(income, gains) {
    var incomeMoney = Money.from(income, residenceCurrency, currentCountry);
    revenue.declareInvestmentIncome(incomeMoney, this.label + ' Income', this.assetCountry);
    if (gains > 0 || this.canOffsetLosses) {
      // Determine flags from type definition
      var isExit = (this._taxCategory === 'exitTax');
      var eligible = !!this.eligibleForAnnualExemption;
      var allowOffset = !!this.canOffsetLosses;
      var gainsMoney = Money.from(gains, residenceCurrency, currentCountry);
      revenue.declareInvestmentGains(gainsMoney, this.taxRate, this.label + ' Sale', {
        category: isExit ? 'exitTax' : 'cgt',
        eligibleForAnnualExemption: eligible,
        allowLossOffset: allowOffset
      }, this.assetCountry);
    }
  }

  // Mirror classification in simulation path for withdraw planning
  simulateDeclareRevenue(income, gains, testRevenue) {
    var incomeMoney = Money.from(income, residenceCurrency, currentCountry);
    testRevenue.declareInvestmentIncome(incomeMoney, this.label + ' Income', this.assetCountry);
    if (gains > 0 || this.canOffsetLosses) {
      var isExit = (this._taxCategory === 'exitTax');
      var gainsMoney = Money.from(gains, residenceCurrency, currentCountry);
      testRevenue.declareInvestmentGains(gainsMoney, this.taxRate, this.label + ' Sim', {
        category: isExit ? 'exitTax' : 'cgt',
        eligibleForAnnualExemption: !!this.eligibleForAnnualExemption,
        allowLossOffset: !!this.canOffsetLosses
      }, this.assetCountry);
    }
  }

  addYear() {
    super.addYear();
    // For exit tax categories, apply deemed disposal if configured
    // Resolve deemed disposal rules for CURRENT country (matches legacy IndexFunds behavior)
    if (this._taxCategory === 'exitTax') {
      var activeDeemedDisposalYears = 0;
      try {
        var cfg = Config.getInstance();
        // Use global currentCountry variable if available, otherwise fall back to default
        var targetCountry = (typeof currentCountry !== 'undefined') ? currentCountry : cfg.getDefaultCountry();
        var ruleset = cfg && cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet(targetCountry) : null;
        if (ruleset && typeof ruleset.findInvestmentTypeByKey === 'function') {
          var t = ruleset.findInvestmentTypeByKey(this.key);
          if (t && t.taxation && t.taxation.exitTax && typeof t.taxation.exitTax.deemedDisposalYears === 'number') {
            activeDeemedDisposalYears = t.taxation.exitTax.deemedDisposalYears;
          }
        }
      } catch (_) {
        // Fallback to initial value if resolution fails
        activeDeemedDisposalYears = this._deemedDisposalYears;
      }
      /**
       * Apply deemed disposal for exit tax assets.
       * 
       * @assumes Homogeneous holding currency - gains are in the same currency as holding.principal.
       *          Money.add() enforces currency match; direct .amount = 0 is safe for zeroing.
       * @performance Rare operation (every N years per holding), Money methods acceptable overhead.
       */
      var dd = activeDeemedDisposalYears;
      if (dd && dd > 0) {
        for (var i = 0; i < this.portfolio.length; i++) {
          if (this.portfolio[i].age % dd === 0) {
            var gains = this.portfolio[i].interest.amount;

            // Money path: safe currency-aware addition
            var gainsMoney = Money.create(gains, this.portfolio[i].principal.currency, this.portfolio[i].principal.country);
            Money.add(this.portfolio[i].principal, gainsMoney);

            this.portfolio[i].interest.amount = 0;
            this.portfolio[i].age = 0;
            if (gains > 0 || this.canOffsetLosses) {
              var gainsConverted = gains;
              var baseCurrency = this._getBaseCurrency();
              var assetCountry = this._getAssetCountry();
              if (baseCurrency !== residenceCurrency) {
                gainsConverted = convertCurrencyAmount(gains, baseCurrency, assetCountry, residenceCurrency, currentCountry, year, true);
                if (gainsConverted === null) {
                  throw new Error('Deemed disposal FX conversion failed');
                }
              }
              var gainsMoney = Money.from(gainsConverted, residenceCurrency, currentCountry);
              revenue.declareInvestmentGains(gainsMoney, this.taxRate, 'Deemed Disposal', {
                category: 'exitTax',
                eligibleForAnnualExemption: !!this.eligibleForAnnualExemption,
                allowLossOffset: !!this.canOffsetLosses
              }, this.assetCountry);
            }
          }
        }
      }
    }
  }
}


/**
 * InvestmentTypeFactory
 * Builds a list of GenericInvestmentAsset instances from the ruleset investmentTypes array.
 *
 * growthRatesByKey/stdDevsByKey are optional maps to supply UI parameterized growth settings.
 */
class InvestmentTypeFactory {
  static resolveMixConfig(params, countryCode, baseKey) {
    if (!params) return null;
    var toNumber = function (value) {
      if (value === null || value === undefined || value === '') return null;
      var n = Number(value);
      return (typeof n === 'number' && !isNaN(n)) ? n : null;
    };
    var normalizeRate = function (value) {
      var n = toNumber(value);
      if (n === null) return null;
      return (Math.abs(n) > 1) ? (n / 100) : n;
    };
    var normalizePct = function (value) {
      var n = toNumber(value);
      if (n === null) return null;
      return (Math.abs(n) <= 1) ? (n * 100) : n;
    };
    var mixPrefix = countryCode ? ('MixConfig_' + countryCode + '_' + baseKey) : null;
    var globalPrefix = 'GlobalMixConfig_' + baseKey;
    var typeValue = null;
    var prefix = null;
    if (mixPrefix && params[mixPrefix + '_type'] !== undefined && params[mixPrefix + '_type'] !== null && params[mixPrefix + '_type'] !== '') {
      typeValue = params[mixPrefix + '_type'];
      prefix = mixPrefix;
    } else if (params[globalPrefix + '_type'] !== undefined && params[globalPrefix + '_type'] !== null && params[globalPrefix + '_type'] !== '') {
      typeValue = params[globalPrefix + '_type'];
      prefix = globalPrefix;
    } else {
      return null;
    }
    var typeNorm = String(typeValue).trim().toLowerCase();
    if (typeNorm === 'glide' || typeNorm === 'glidepath') typeNorm = 'glidePath';
    if (typeNorm !== 'fixed' && typeNorm !== 'glidePath') return null;
    var mix = {
      type: typeNorm,
      asset1: params[prefix + '_asset1'],
      asset2: params[prefix + '_asset2'],
      startAge: toNumber(params[prefix + '_startAge']),
      targetAge: toNumber(params[prefix + '_targetAge']),
      targetAgeOverridden: params[prefix + '_targetAgeOverridden'],
      startAsset1Pct: normalizePct(params[prefix + '_startAsset1Pct']),
      startAsset2Pct: normalizePct(params[prefix + '_startAsset2Pct']),
      endAsset1Pct: normalizePct(params[prefix + '_endAsset1Pct']),
      endAsset2Pct: normalizePct(params[prefix + '_endAsset2Pct'])
    };
    if (mix.startAsset1Pct === null && mix.startAsset2Pct !== null) mix.startAsset1Pct = 100 - mix.startAsset2Pct;
    if (mix.endAsset1Pct === null && mix.endAsset2Pct !== null) mix.endAsset1Pct = 100 - mix.endAsset2Pct;
    mix.asset1Growth = normalizeRate(params['GlobalAssetGrowth_' + mix.asset1]);
    mix.asset2Growth = normalizeRate(params['GlobalAssetGrowth_' + mix.asset2]);
    mix.asset1Vol = normalizeRate(params['GlobalAssetVolatility_' + mix.asset1]);
    mix.asset2Vol = normalizeRate(params['GlobalAssetVolatility_' + mix.asset2]);
    mix.country = countryCode;
    mix.baseKey = baseKey;
    return mix;
  }

  /**
   * Creates GenericInvestmentAsset instances from ruleset investment types.
   * 
   * Parameter resolution:
   * - Wrappers WITH baseRef (e.g., indexFunds_ie with baseRef: "globalEquity"):
   *   Use asset-level params: GlobalAssetGrowth_globalEquity, GlobalAssetVolatility_globalEquity.
   *   Asset-level params are treated as PERCENTAGES (e.g., 10 => 10%).
   *   If asset-level params are undefined, falls back to wrapper-level params (decimals) for compatibility.
   *   Fallback order: wrapperKey -> baseKeyCompat (e.g., indexFunds_ie -> indexFunds).
   * - Wrappers WITHOUT baseRef (pure local investments):
   *   Use wrapper-level params: investmentGrowthRatesByKey[key], investmentVolatilitiesByKey[key].
   *   Wrapper-level params are treated as DECIMALS (e.g., 0.1 => 10%).
   * 
   * @param {TaxRuleSet} ruleset - Country tax ruleset with investment type definitions
   * @param {Object} growthRatesByKey - Map of wrapper-level growth rates (for local wrappers or fallback)
   * @param {Object} stdDevsByKey - Map of wrapper-level volatilities (for local wrappers or fallback)
   * @param {Object} params - Full simulation params (contains asset-level params)
   * @returns {Array} Array of {key, label, asset, baseCurrency, assetCountry, residenceScope}
   */
  static createAssets(ruleset, growthRatesByKey, stdDevsByKey, params) {
    var toNumber = function (value) {
      if (value === null || value === undefined || value === '') return null;
      var n = Number(value);
      return (typeof n === 'number' && !isNaN(n)) ? n : null;
    };
    var normalizeRate = function (value) {
      var n = toNumber(value);
      if (n === null) return null;
      return (Math.abs(n) > 1) ? (n / 100) : n;
    };
    var assets = [];
    if (!ruleset || typeof ruleset.getInvestmentTypes !== 'function') return assets;
    var types = ruleset.getResolvedInvestmentTypes();
    var countryCode = null;
    if (ruleset && typeof ruleset.getCountryCode === 'function') {
      var cc = ruleset.getCountryCode();
      if (cc) countryCode = String(cc).toLowerCase();
    }
    for (var i = 0; i < types.length; i++) {
      var t = types[i];
      var key = t && t.key ? t.key : 'asset' + i;
      var baseKey = key;
      var suffix = (countryCode ? ('_' + countryCode) : '');
      if (suffix && String(key).toLowerCase().lastIndexOf(suffix) === String(key).toLowerCase().length - suffix.length) {
        baseKey = String(key).slice(0, String(key).length - suffix.length);
      }
      var mixConfig = InvestmentTypeFactory.resolveMixConfig(params, countryCode, baseKey);
      var gr, sd;
      if (t.baseRef) {
        // Non-local wrapper: use asset-level parameters (treated as percentages)
        var rawGr = params['GlobalAssetGrowth_' + t.baseRef];
        var valGr = normalizeRate(rawGr);
        if (valGr !== null) {
          gr = valGr;
        } else {
          // Fallback 1: Wrapper-level params (treated as decimals/legacy)
          if (growthRatesByKey && growthRatesByKey[key] !== undefined) {
            gr = growthRatesByKey[key];
          }
          // Fallback 2: Base-key wrapper-level params (treated as decimals/legacy)
          if (gr === undefined && growthRatesByKey && key && String(key).indexOf('_') > 0) {
            var baseKeyCompat = String(key).split('_')[0];
            if (growthRatesByKey[baseKeyCompat] !== undefined) gr = growthRatesByKey[baseKeyCompat];
          }
        }

        var rawSd = params['GlobalAssetVolatility_' + t.baseRef];
        var valSd = normalizeRate(rawSd);
        if (valSd !== null) {
          sd = valSd;
        } else {
           // Fallback 1: Wrapper-level params
           if (stdDevsByKey && stdDevsByKey[key] !== undefined) {
             sd = stdDevsByKey[key];
           }
           // Fallback 2: Base-key wrapper-level params
           if (sd === undefined && stdDevsByKey && key && String(key).indexOf('_') > 0) {
             var baseKeyCompat2 = String(key).split('_')[0];
             if (stdDevsByKey[baseKeyCompat2] !== undefined) sd = stdDevsByKey[baseKeyCompat2];
           }
        }
      } else {
        // Local wrapper: use wrapper-level parameters (existing logic)
        gr = (growthRatesByKey && growthRatesByKey[key] !== undefined) ? growthRatesByKey[key] : undefined;
        sd = (stdDevsByKey && stdDevsByKey[key] !== undefined) ? stdDevsByKey[key] : undefined;
        // Backward compat: if caller provided base keys (e.g. indexFunds/shares),
        // project them onto namespaced keys (e.g. indexFunds_ie/shares_ie).
        if (gr === undefined && growthRatesByKey && key && String(key).indexOf('_') > 0) {
          var baseKeyCompat = String(key).split('_')[0];
          if (growthRatesByKey[baseKeyCompat] !== undefined) gr = growthRatesByKey[baseKeyCompat];
        }
        if (sd === undefined && stdDevsByKey && key && String(key).indexOf('_') > 0) {
          var baseKey2 = String(key).split('_')[0];
          if (stdDevsByKey[baseKey2] !== undefined) sd = stdDevsByKey[baseKey2];
        }
      }
      if (gr === undefined) gr = 0;
      if (sd === undefined) sd = 0;
      var baseCurrency = t.baseCurrency;
      var assetCountry = t.assetCountry;
      var residenceScope = t.residenceScope;
      var assetInstance = new GenericInvestmentAsset(t, gr, sd, ruleset);
      if (mixConfig) assetInstance.mixConfig = mixConfig;
      assets.push({
        key: key,
        label: (t.label || key),
        asset: assetInstance,
        baseCurrency: baseCurrency,
        assetCountry: assetCountry,
        residenceScope: residenceScope
      });
    }
    return assets;
  }
}

// Make available in global context
this.GenericInvestmentAsset = GenericInvestmentAsset;
this.InvestmentTypeFactory = InvestmentTypeFactory;
