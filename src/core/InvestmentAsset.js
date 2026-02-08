/* This file has to work on both the website and Google Sheets */

class InvestmentAsset {

  constructor(investmentTypeDef, growth, stdev, ruleset) {
    // Initialize standard Equity properties
    this.portfolio = [];
    this.yearlyBought = 0;
    this.yearlySold = 0;
    this.yearlyGrowth = 0;
    this.growth = growth;
    this.stdev = stdev || 0;

    // Initialize GenericInvestmentAsset properties
    this._typeDef = investmentTypeDef || {};
    this._ruleset = ruleset || null;
    this.key = this._typeDef.key || 'asset';
    this.label = this._typeDef.label || this.key;
    this.baseCurrency = this._typeDef.baseCurrency;
    this.assetCountry = this._typeDef.assetCountry;
    this.residenceScope = this._typeDef.residenceScope;
    
    // Resolve tax properties using static helpers
    this.taxRate = InvestmentAsset._resolveTaxRate(this._typeDef, this._ruleset);
    this._taxCategory = InvestmentAsset._resolveTaxCategory(this._typeDef);
    this._deemedDisposalYears = InvestmentAsset._resolveDeemedDisposalYears(this._typeDef);
    this.canOffsetLosses = InvestmentAsset._resolveAllowLossOffset(this._typeDef);
    this.eligibleForAnnualExemption = InvestmentAsset._resolveAnnualExemptionEligibility(this._typeDef);

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

  // --- Static Helper Methods from GenericInvestmentAsset ---

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

  // --- Core Methods ---

  buy(amountToBuy, currency, country, growthOverride, stdevOverride) {
    if (!currency || !country) {
      throw new Error('InvestmentAsset.buy() requires currency and country parameters');
    }
    // Capture currency/country from first buy() call if not yet resolved
    if (this.baseCurrency === undefined) {
      this.baseCurrency = currency;
    }
    if (this.assetCountry === undefined) {
      this.assetCountry = country;
    }

    var holding = {
      principal: Money.create(amountToBuy, currency, country),
      interest: Money.create(0, currency, country),
      age: 0
    };
    if (typeof growthOverride === 'number') holding.growth = growthOverride;
    if (typeof stdevOverride === 'number') holding.stdev = stdevOverride;
    this.portfolio.push(holding);
    this.yearlyBought += amountToBuy;
  }

  declareRevenue(income, gains) {
    var incomeMoney = Money.from(income, residenceCurrency, currentCountry);
    // Use configured label and assetCountry
    revenue.declareInvestmentIncome(incomeMoney, this.label + ' Income', this.assetCountry);
    if (gains > 0 || this.canOffsetLosses) {
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

  // Protected helper methods for currency conversion
  _getBaseCurrency() {
    return this.baseCurrency;
  }

  _getAssetCountry() {
    return this.assetCountry;
  }

  sell(amountToSell) {
    // Early return for empty portfolio
    if (this.portfolio.length === 0) {
      return 0;
    }

    let sold = 0;
    let gains = 0;
    let remaining = (typeof amountToSell === 'number') ? amountToSell : 0;
    let fullySoldHoldings = 0;
    let partialFraction = null;

    // Convert each holding to residence currency before accumulation.
    // Partial-sale scaling happens in the holding's own currency before conversion.
    var soldConverted = 0;
    var gainsConverted = 0;

    for (let i = 0; i < this.portfolio.length && remaining > 0; i++) {
      const holding = this.portfolio[i];
      const holdingCurrency = holding.principal.currency;
      const holdingCountry = holding.principal.country;
      const holdingCapital = holding.principal.amount + holding.interest.amount;
      let holdingCapitalConverted = holdingCapital;
      if (holdingCurrency !== residenceCurrency || holdingCountry !== currentCountry) {
        holdingCapitalConverted = convertCurrencyAmount(holdingCapital, holdingCurrency, holdingCountry, residenceCurrency, currentCountry, year, true);
        if (holdingCapitalConverted === null) {
          return null;
        }
      }

      if (remaining >= holdingCapitalConverted) {
        sold += holdingCapital;
        gains += holding.interest.amount;
        soldConverted += holdingCapitalConverted;

        let holdingGainsConverted = holding.interest.amount;
        if (holding.interest.currency !== residenceCurrency || holding.interest.country !== currentCountry) {
          holdingGainsConverted = convertCurrencyAmount(holding.interest.amount, holding.interest.currency, holding.interest.country, residenceCurrency, currentCountry, year, true);
          if (holdingGainsConverted === null) {
            return null;
          }
        }
        gainsConverted += holdingGainsConverted;

        remaining -= holdingCapitalConverted;
        fullySoldHoldings++;
      } else {
        const fraction = holdingCapitalConverted > 0 ? (remaining / holdingCapitalConverted) : 0;
        const soldHolding = fraction * holdingCapital;
        const gainsHolding = fraction * holding.interest.amount;

        sold += soldHolding;
        gains += gainsHolding;

        let soldHoldingConverted = soldHolding;
        let gainsHoldingConverted = gainsHolding;
        if (holdingCurrency !== residenceCurrency || holdingCountry !== currentCountry) {
          soldHoldingConverted = convertCurrencyAmount(soldHolding, holdingCurrency, holdingCountry, residenceCurrency, currentCountry, year, true);
          gainsHoldingConverted = convertCurrencyAmount(gainsHolding, holding.interest.currency, holding.interest.country, residenceCurrency, currentCountry, year, true);
          if (soldHoldingConverted === null || gainsHoldingConverted === null) {
            return null;
          }
        }
        soldConverted += soldHoldingConverted;
        gainsConverted += gainsHoldingConverted;

        partialFraction = fraction;
        remaining = 0;
      }
    }

    // Apply planned mutations only after conversions succeed
    if (fullySoldHoldings > 0) {
      this.portfolio.splice(0, fullySoldHoldings);
    }
    if (partialFraction !== null && this.portfolio.length > 0) {
      const remainingHolding = this.portfolio[0];
      const keepRatio = 1 - partialFraction;
      remainingHolding.principal.amount = keepRatio * remainingHolding.principal.amount;
      remainingHolding.interest.amount = keepRatio * remainingHolding.interest.amount;
    }

    this.yearlySold += soldConverted;
    this.declareRevenue(soldConverted, gainsConverted);
    return soldConverted;
  }

  /**
   * Calculate total capital (principal + interest) across all holdings.
   * Converts each holding to residence currency before summing.
   * 
   * @returns {number} Total capital in residence currency
   * @performance Iterates through all holdings with per-holding FX conversion when needed.
   */
  capital() {
    if (this.portfolio.length === 0) {
      return 0;
    }

    const portfolio = this.portfolio;

    // Convert each holding to residence currency before summing
    let moneyTotal = Money.zero(residenceCurrency, currentCountry);
    for (let j = 0; j < portfolio.length; j++) {
      const hj = portfolio[j];
      const holdingCapital = hj.principal.amount + hj.interest.amount;
      let holdingConverted = holdingCapital;
      if (hj.principal.currency !== residenceCurrency || hj.principal.country !== currentCountry) {
        holdingConverted = convertCurrencyAmount(holdingCapital, hj.principal.currency, hj.principal.country, residenceCurrency, currentCountry, year, true);
        if (holdingConverted === null) {
          throw new Error('InvestmentAsset.capital() FX conversion failed');
        }
      }
      const holdingMoney = Money.create(holdingConverted, residenceCurrency, currentCountry);
      Money.add(moneyTotal, holdingMoney);
    }
    return moneyTotal.amount;
  }

  /**
   * Get portfolio statistics for attribution tracking.
   * Converts each holding to residence currency before aggregation.
   * 
   * @returns {Object} Statistics including principal, totalGain, yearly bought/sold/growth
   * @performance Iterates through all holdings with per-holding FX conversion when needed.
   */
  getPortfolioStats() {
    if (this.portfolio.length === 0) {
      return {
        principal: 0,
        totalGain: 0,
        yearlyBought: this.yearlyBought,
        yearlySold: this.yearlySold,
        yearlyGrowth: this.yearlyGrowth
      };
    }

    // Convert each holding to residence currency before aggregation
    let principalMoney = Money.zero(residenceCurrency, currentCountry);
    let totalGainMoney = Money.zero(residenceCurrency, currentCountry);

    for (let i = 0; i < this.portfolio.length; i++) {
      const holding = this.portfolio[i];

      // Convert principal
      let principalConverted = holding.principal.amount;
      if (holding.principal.currency !== residenceCurrency || holding.principal.country !== currentCountry) {
        principalConverted = convertCurrencyAmount(
          holding.principal.amount,
          holding.principal.currency,
          holding.principal.country,
          residenceCurrency,
          currentCountry,
          year,
          true
        );
        if (principalConverted === null) {
          throw new Error('InvestmentAsset.getPortfolioStats() principal FX conversion failed');
        }
      }

      // Convert interest/gains
      let gainConverted = holding.interest.amount;
      if (holding.interest.currency !== residenceCurrency || holding.interest.country !== currentCountry) {
        gainConverted = convertCurrencyAmount(
          holding.interest.amount,
          holding.interest.currency,
          holding.interest.country,
          residenceCurrency,
          currentCountry,
          year,
          true
        );
        if (gainConverted === null) {
          throw new Error('InvestmentAsset.getPortfolioStats() gain FX conversion failed');
        }
      }

      const principalHoldingMoney = Money.create(principalConverted, residenceCurrency, currentCountry);
      const gainHoldingMoney = Money.create(gainConverted, residenceCurrency, currentCountry);
      Money.add(principalMoney, principalHoldingMoney);
      Money.add(totalGainMoney, gainHoldingMoney);
    }

    return {
      principal: principalMoney.amount,
      totalGain: totalGainMoney.amount,
      yearlyBought: this.yearlyBought,
      yearlySold: this.yearlySold,
      yearlyGrowth: this.yearlyGrowth
    };
  }

  // Reset yearly statistics
  resetYearlyStats() {
    this.yearlyBought = 0;
    this.yearlySold = 0;
    this.yearlyGrowth = 0;
  }

  /**
   * Accumulate yearly growth for all holdings.
   * 
   * @performance Hot path - uses direct .amount access for zero overhead.
   *              Mixed portfolios work correctly since growth is applied per-holding.
   */
  addYear() {
    // Accumulate interests
    for (let i = 0; i < this.portfolio.length; i++) {
      const holding = this.portfolio[i];
      // Maintain legacy behavior: always use gaussian(mean, stdev) for growth sampling
      const growthRate = gaussian(
        (holding.growth !== undefined ? holding.growth : this.growth),
        (holding.stdev !== undefined ? holding.stdev : this.stdev)
      );
      const holdingTotal = holding.principal.amount + holding.interest.amount;
      const growthAmount = holdingTotal * growthRate;
      holding.interest.amount += growthAmount;
      this.yearlyGrowth += growthAmount;
      holding.age++;
      // Floor holding at zero if it goes negative
      if (holding.principal.amount + holding.interest.amount < 0) {
        holding.principal.amount = 0;
        holding.interest.amount = 0;
      }
    }

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
        if ((!activeDeemedDisposalYears || activeDeemedDisposalYears <= 0) && revenue && typeof revenue.getActiveCrossBorderTaxCountries === 'function') {
          var trailingCountries = revenue.getActiveCrossBorderTaxCountries();
          for (var ti = 0; ti < trailingCountries.length; ti++) {
            var trailing = trailingCountries[ti];
            var trailingRuleset = trailing ? trailing.ruleset : null;
            if (!trailingRuleset || typeof trailingRuleset.findInvestmentTypeByKey !== 'function') continue;
            var trailingType = trailingRuleset.findInvestmentTypeByKey(this.key);
            if (trailingType && trailingType.taxation && trailingType.taxation.exitTax && typeof trailingType.taxation.exitTax.deemedDisposalYears === 'number') {
              activeDeemedDisposalYears = trailingType.taxation.exitTax.deemedDisposalYears;
              break;
            }
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

  simulateSellAll(testRevenue) {
    let totalCapital = this.capital();
    let totalGains = 0;

    // Calculate total gains without modifying portfolio
    for (let holding of this.portfolio) {
      totalGains += holding.interest.amount;
    }

    // Convert sale proceeds and gains from asset's tracking currency to residence currency
    // at sale time (asset-plan.md §6.2). Cost basis remains in asset currency.
    // Strict: no truthiness fallback; falsy config → conversion fail → null return (asset-plan.md §9)
    var baseCurrency = this._getBaseCurrency();
    var assetCountry = this._getAssetCountry();
    var totalCapitalConverted = totalCapital;
    var totalGainsConverted = totalGains;
    if (baseCurrency !== residenceCurrency) {
      totalCapitalConverted = convertCurrencyAmount(totalCapital, baseCurrency, assetCountry, residenceCurrency, currentCountry, year, true);
      totalGainsConverted = convertCurrencyAmount(totalGains, baseCurrency, assetCountry, residenceCurrency, currentCountry, year, true);
      // In strict mode, conversion failures return null - avoid incorrect nominal values in withdraw planning
      if (totalCapitalConverted === null || totalGainsConverted === null) {
        return null;
      }
    }

    // Use simulation method instead of real one
    this.simulateDeclareRevenue(totalCapitalConverted, totalGainsConverted, testRevenue);
    return totalCapitalConverted;
  }

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

}

this.InvestmentAsset = InvestmentAsset;
