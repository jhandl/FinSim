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
    this.contributionCurrencyMode = this._typeDef.contributionCurrencyMode;
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
  buy(amountToBuy, currency, country) {
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
    super.buy(amountToBuy, currency, country);
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
    revenue.declareInvestmentIncome(incomeMoney, this.label + ' Income');
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
      });
    }
  }

  // Mirror classification in simulation path for withdraw planning
  simulateDeclareRevenue(income, gains, testRevenue) {
    var incomeMoney = Money.from(income, residenceCurrency, currentCountry);
    testRevenue.declareInvestmentIncome(incomeMoney, this.label + ' Income');
    if (gains > 0 || this.canOffsetLosses) {
      var isExit = (this._taxCategory === 'exitTax');
      var gainsMoney = Money.from(gains, residenceCurrency, currentCountry);
      testRevenue.declareInvestmentGains(gainsMoney, this.taxRate, this.label + ' Sim', {
        category: isExit ? 'exitTax' : 'cgt',
        eligibleForAnnualExemption: !!this.eligibleForAnnualExemption,
        allowLossOffset: !!this.canOffsetLosses
      });
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
              });
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
  static createAssets(ruleset, growthRatesByKey, stdDevsByKey) {
    var assets = [];
    if (!ruleset || typeof ruleset.getInvestmentTypes !== 'function') return assets;
    var types = ruleset.getInvestmentTypes();
    for (var i = 0; i < types.length; i++) {
      var t = types[i];
      var key = t && t.key ? t.key : 'asset' + i;
      var gr = growthRatesByKey && growthRatesByKey[key] !== undefined ? growthRatesByKey[key] : 0;
      var sd = stdDevsByKey && stdDevsByKey[key] !== undefined ? stdDevsByKey[key] : 0;
      var baseCurrency = t.baseCurrency;
      var assetCountry = t.assetCountry;
      var contributionCurrencyMode = t.contributionCurrencyMode;
      var residenceScope = t.residenceScope;
      assets.push({
        key: key,
        label: (t.label || key),
        asset: new GenericInvestmentAsset(t, gr, sd, ruleset),
        baseCurrency: baseCurrency,
        assetCountry: assetCountry,
        contributionCurrencyMode: contributionCurrencyMode,
        residenceScope: residenceScope
      });
    }
    return assets;
  }
}

// Make available in global context
this.GenericInvestmentAsset = GenericInvestmentAsset;
this.InvestmentTypeFactory = InvestmentTypeFactory;
