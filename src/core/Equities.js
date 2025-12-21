/* This file has to work on both the website and Google Sheets */

class Equity {

  constructor(taxRate, growth, stdev = 0) {
    this.taxRate = taxRate;
    this.growth = growth;
    this.stdev = stdev;
    this.portfolio = [];
    this._portfolioCurrency = null;
    this._portfolioCountry = null;
    this._portfolioMixed = false;
    this.canOffsetLosses = true;
    // Track yearly statistics for attribution
    this.yearlyBought = 0;
    this.yearlySold = 0;
    this.yearlyGrowth = 0;
  }

  _refreshPortfolioCurrencyState() {
    if (this.portfolio.length === 0) {
      this._portfolioCurrency = null;
      this._portfolioCountry = null;
      this._portfolioMixed = false;
      return;
    }
    const first = this.portfolio[0];
    this._portfolioCurrency = first.principal.currency;
    this._portfolioCountry = first.principal.country;
    this._portfolioMixed = false;
    for (let i = 0; i < this.portfolio.length; i++) {
      const holding = this.portfolio[i];
      if (holding.principal.currency !== this._portfolioCurrency ||
        holding.principal.country !== this._portfolioCountry ||
        holding.interest.currency !== this._portfolioCurrency ||
        holding.interest.country !== this._portfolioCountry) {
        this._portfolioMixed = true;
        break;
      }
    }
  }

  buy(amountToBuy, currency, country) {
    if (!currency || !country) {
      throw new Error('Equity.buy() requires currency and country parameters');
    }
    if (this.portfolio.length === 0) {
      this._portfolioCurrency = currency;
      this._portfolioCountry = country;
      this._portfolioMixed = false;
    } else if (!this._portfolioMixed && (currency !== this._portfolioCurrency || country !== this._portfolioCountry)) {
      this._portfolioMixed = true;
    }
    this.portfolio.push({
      principal: Money.create(amountToBuy, currency, country),
      interest: Money.create(0, currency, country),
      age: 0
    });
    this.yearlyBought += amountToBuy;
  }

  declareRevenue(income, gains) {
    var incomeMoney = Money.from(income, residenceCurrency, currentCountry);
    revenue.declareInvestmentIncome(incomeMoney);
    if (gains > 0 || this.canOffsetLosses) {
      var gainsMoney = Money.from(gains, residenceCurrency, currentCountry);
      revenue.declareInvestmentGains(gainsMoney, this.taxRate, this.constructor.name + " Sale");
    }
  }

  // Protected helper methods for currency conversion - override in subclasses
  _getBaseCurrency() {
    return null; // Base class returns null; subclasses override with asset currency
  }

  _getAssetCountry() {
    return null; // Base class returns null; subclasses override with asset country
  }

  sell(amountToSell) {
    let sold = 0;
    let gains = 0;
    let remaining = (typeof amountToSell === 'number') ? amountToSell : 0;
    let fullySoldHoldings = 0;
    let partialFraction = null;

    // Mixed-currency/country portfolios: convert per holding to residence currency before accumulation.
    // Partial-sale scaling must happen in the holding's own currency before conversion.
    if (this._portfolioMixed) {
      var soldConvertedMixed = 0;
      var gainsConvertedMixed = 0;
      var remainingResidence = remaining;
      var mixedFullySoldHoldings = 0;
      var mixedPartialFraction = null;

      for (let i = 0; i < this.portfolio.length && remainingResidence > 0; i++) {
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

        if (remainingResidence >= holdingCapitalConverted) {
          sold += holdingCapital;
          gains += holding.interest.amount;
          soldConvertedMixed += holdingCapitalConverted;

          let holdingGainsConverted = holding.interest.amount;
          if (holding.interest.currency !== residenceCurrency || holding.interest.country !== currentCountry) {
            holdingGainsConverted = convertCurrencyAmount(holding.interest.amount, holding.interest.currency, holding.interest.country, residenceCurrency, currentCountry, year, true);
            if (holdingGainsConverted === null) {
              return null;
            }
          }
          gainsConvertedMixed += holdingGainsConverted;

          remainingResidence -= holdingCapitalConverted;
          mixedFullySoldHoldings++;
        } else {
          const fraction = holdingCapitalConverted > 0 ? (remainingResidence / holdingCapitalConverted) : 0;
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
          soldConvertedMixed += soldHoldingConverted;
          gainsConvertedMixed += gainsHoldingConverted;

          mixedPartialFraction = fraction;
          remainingResidence = 0;
        }
      }

      // Apply planned mutations only after conversions succeed
      if (mixedFullySoldHoldings > 0) {
        this.portfolio.splice(0, mixedFullySoldHoldings);
      }
      if (mixedPartialFraction !== null && this.portfolio.length > 0) {
        const remainingHolding = this.portfolio[0];
        const keepRatio = 1 - mixedPartialFraction;
        remainingHolding.principal.amount = keepRatio * remainingHolding.principal.amount;
        remainingHolding.interest.amount = keepRatio * remainingHolding.interest.amount;
      }

      this._refreshPortfolioCurrencyState();
      this.yearlySold += soldConvertedMixed;
      this.declareRevenue(soldConvertedMixed, gainsConvertedMixed);
      return soldConvertedMixed;
    }

    for (let i = 0; i < this.portfolio.length && remaining > 0; i++) {
      const holding = this.portfolio[i];
      const holdingCapital = holding.principal.amount + holding.interest.amount;
      const isFullSale = remaining >= holdingCapital;
      if (remaining >= holdingCapital) {
        sold += holdingCapital;
        gains += holding.interest.amount;
        remaining -= holdingCapital;
        fullySoldHoldings++;
      } else {
        const fraction = holdingCapital > 0 ? (remaining / holdingCapital) : 0;
        sold += remaining;
        gains += fraction * holding.interest.amount;
        partialFraction = fraction;
        remaining = 0;
      }
    }

    // Convert sale proceeds and gains from asset's tracking currency to residence currency
    // at sale time (asset-plan.md §6.2). Cost basis remains in asset currency.
    // Strict: no truthiness fallback; falsy config → conversion fail → null return (asset-plan.md §9)
    var baseCurrency = this._getBaseCurrency();
    var assetCountry = this._getAssetCountry();
    var soldConverted = sold;
    var gainsConverted = gains;
    if (baseCurrency !== residenceCurrency) {
      soldConverted = convertCurrencyAmount(sold, baseCurrency, assetCountry, residenceCurrency, currentCountry, year, true);
      gainsConverted = convertCurrencyAmount(gains, baseCurrency, assetCountry, residenceCurrency, currentCountry, year, true);
      // In strict mode, conversion failures return null - propagate to caller
      if (soldConverted === null || gainsConverted === null) {
        return null;
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

    this._refreshPortfolioCurrencyState();
    this.yearlySold += sold;
    this.declareRevenue(soldConverted, gainsConverted);
    return soldConverted;
  }

  /**
   * Calculate total capital (principal + interest) across all holdings.
   * 
   * @returns {number} Total capital in residence currency
   * @assumes Homogeneous portfolio (fast path) - all holdings share currency/country.
   *          Mixed portfolios are handled separately with per-holding conversion.
   * @performance Hot path - direct .amount summation for homogeneous portfolios (<1% overhead).
   *              Mixed portfolios use Money.add() with conversion (acceptable overhead, rare).
   */
  capital() {
    if (this.portfolio.length === 0) {
      return 0;
    }

    const portfolio = this.portfolio;

    // Mixed-currency/country portfolios: convert each holding to residence currency before summing.
    if (this._portfolioMixed) {
      let moneyTotal = Money.zero(residenceCurrency, currentCountry);
      for (let j = 0; j < portfolio.length; j++) {
        const hj = portfolio[j];
        const holdingCapital = hj.principal.amount + hj.interest.amount;
        let holdingConverted = holdingCapital;
        if (hj.principal.currency !== residenceCurrency || hj.principal.country !== currentCountry) {
          holdingConverted = convertCurrencyAmount(holdingCapital, hj.principal.currency, hj.principal.country, residenceCurrency, currentCountry, year, true);
          if (holdingConverted === null) {
            throw new Error('Equities.capital() FX conversion failed');
          }
        }
        const holdingMoney = Money.create(holdingConverted, residenceCurrency, currentCountry);
        Money.add(moneyTotal, holdingMoney);
      }

      return moneyTotal.amount;
    }

    const first = portfolio[0];
    let moneyTotal = Money.zero(first.principal.currency, first.principal.country);
    for (let i = 0; i < portfolio.length; i++) {
      const holding = portfolio[i];
      moneyTotal.amount += holding.principal.amount + holding.interest.amount;
    }

    return moneyTotal.amount;
  }

  /**
   * Get portfolio statistics for attribution tracking.
   * 
   * @returns {Object} Statistics including principal, totalGain, yearly bought/sold/growth
   * @performance Homogeneous portfolios use fast numeric summation.
   *              Mixed portfolios convert each holding to residence currency.
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

    // Mixed-currency portfolios: convert each holding to residence currency
    if (this._portfolioMixed) {
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
            throw new Error('Equities.getPortfolioStats() principal FX conversion failed');
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
            throw new Error('Equities.getPortfolioStats() gain FX conversion failed');
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

    // Fast path: homogeneous portfolio (same currency/country)
    const first = this.portfolio[0];
    let principalSum = 0;
    let totalGainSum = 0;

    for (let i = 0; i < this.portfolio.length; i++) {
      const holding = this.portfolio[i];
      principalSum += holding.principal.amount;
      totalGainSum += holding.interest.amount;
    }

    // Check if homogeneous portfolio needs conversion to residence currency
    const needsConversion = first.principal.currency !== residenceCurrency || first.principal.country !== currentCountry;

    if (needsConversion) {
      // Convert sums from portfolio currency to residence currency
      let principalConverted = convertCurrencyAmount(
        principalSum,
        first.principal.currency,
        first.principal.country,
        residenceCurrency,
        currentCountry,
        year,
        true
      );
      if (principalConverted === null) {
        throw new Error('Equities.getPortfolioStats() principal FX conversion failed');
      }

      let gainConverted = convertCurrencyAmount(
        totalGainSum,
        first.interest.currency,
        first.interest.country,
        residenceCurrency,
        currentCountry,
        year,
        true
      );
      if (gainConverted === null) {
        throw new Error('Equities.getPortfolioStats() gain FX conversion failed');
      }

      return {
        principal: principalConverted,
        totalGain: gainConverted,
        yearlyBought: this.yearlyBought,
        yearlySold: this.yearlySold,
        yearlyGrowth: this.yearlyGrowth
      };
    }

    // No conversion needed - portfolio already in residence currency
    return {
      principal: principalSum,
      totalGain: totalGainSum,
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
      const growthRate = gaussian(this.growth, this.stdev);
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
    testRevenue.declareInvestmentIncome(incomeMoney);
    if (gains > 0 || this.canOffsetLosses) {
      var gainsMoney = Money.from(gains, residenceCurrency, currentCountry);
      testRevenue.declareInvestmentGains(gainsMoney, this.taxRate, this.constructor.name + " Sim");
    }
  }

}


class IndexFunds extends Equity {

  constructor(growth, stdev = 0) {
    // Prefer ruleset when available to source exit tax settings
    var ruleset = null;
    try {
      var cfg = Config.getInstance();
      ruleset = cfg && cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet(cfg.getDefaultCountry()) : null;
    } catch (e) { ruleset = null; }

    // Cache the investment type definition, if present
    var indexFundsTypeDef = null;
    try {
      if (ruleset && typeof ruleset.findInvestmentTypeByKey === 'function') {
        indexFundsTypeDef = ruleset.findInvestmentTypeByKey('indexFunds');
      }
    } catch (_) { indexFundsTypeDef = null; }

    const resolveExitTaxRate = function () {
      if (ruleset && typeof ruleset.findInvestmentTypeByKey === 'function') {
        var t = indexFundsTypeDef || ruleset.findInvestmentTypeByKey('indexFunds');
        if (t && t.taxation && t.taxation.exitTax && typeof t.taxation.exitTax.rate === 'number') {
          return t.taxation.exitTax.rate;
        }
      }
      return 0; // default to 0 if ruleset is unavailable
    };

    super(resolveExitTaxRate(), growth, stdev);

    // Loss offset
    this.canOffsetLosses = (function () {
      if (ruleset && typeof ruleset.findInvestmentTypeByKey === 'function') {
        var t = indexFundsTypeDef || ruleset.findInvestmentTypeByKey('indexFunds');
        if (t && t.taxation && t.taxation.exitTax && typeof t.taxation.exitTax.allowLossOffset === 'boolean') {
          return t.taxation.exitTax.allowLossOffset;
        }
      }
      return false;
    })();

    // Annual exemption eligibility for exit tax (IE legacy behavior allowed it for ETF disposals)
    this._exitTaxEligibleForAnnualExemption = (function () {
      if (indexFundsTypeDef && indexFundsTypeDef.taxation && indexFundsTypeDef.taxation.exitTax && typeof indexFundsTypeDef.taxation.exitTax.eligibleForAnnualExemption === 'boolean') {
        return indexFundsTypeDef.taxation.exitTax.eligibleForAnnualExemption;
      }
      return true; // legacy IE behavior: treat as eligible for the annual exemption
    })();

    // Deemed disposal years - INITIAL value (from default country)
    this._deemedDisposalYears = (function () {
      if (ruleset && typeof ruleset.findInvestmentTypeByKey === 'function') {
        var t = indexFundsTypeDef || ruleset.findInvestmentTypeByKey('indexFunds');
        if (t && t.taxation && t.taxation.exitTax && typeof t.taxation.exitTax.deemedDisposalYears === 'number') {
          return t.taxation.exitTax.deemedDisposalYears;
        }
      }
      return 0;
    })();
  }

  // Override currency methods for IE defaults
  _getBaseCurrency() {
    return 'EUR'; // IE legacy default
  }

  _getAssetCountry() {
    return 'ie'; // IE legacy default
  }

  // Ensure exit-tax classification for gains from Index Funds
  declareRevenue(income, gains) {
    var incomeMoney = Money.from(income, residenceCurrency, currentCountry);
    revenue.declareInvestmentIncome(incomeMoney);
    if (gains > 0 || this.canOffsetLosses) {
      var gainsMoney = Money.from(gains, residenceCurrency, currentCountry);
      revenue.declareInvestmentGains(gainsMoney, this.taxRate, this.constructor.name + " Sale", {
        category: 'exitTax',
        eligibleForAnnualExemption: !!this._exitTaxEligibleForAnnualExemption,
        allowLossOffset: !!this.canOffsetLosses
      });
    }
  }

  simulateDeclareRevenue(income, gains, testRevenue) {
    var incomeMoney = Money.from(income, residenceCurrency, currentCountry);
    testRevenue.declareInvestmentIncome(incomeMoney);
    if (gains > 0 || this.canOffsetLosses) {
      var gainsMoney = Money.from(gains, residenceCurrency, currentCountry);
      testRevenue.declareInvestmentGains(gainsMoney, this.taxRate, this.constructor.name + " Sim", {
        category: 'exitTax',
        eligibleForAnnualExemption: !!this._exitTaxEligibleForAnnualExemption,
        allowLossOffset: !!this.canOffsetLosses
      });
    }
  }

  addYear() {
    super.addYear();

    // Resolve Deemed Disposal rules for the CURRENT country
    // Access currentCountry from global scope (set by Simulator.js)
    var activeDeemedDisposalYears = 0;
    try {
      var cfg = Config.getInstance();
      // Use global currentCountry variable if available, otherwise fall back to default
      var targetCountry = (typeof currentCountry !== 'undefined') ? currentCountry : cfg.getDefaultCountry();
      var ruleset = cfg && cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet(targetCountry) : null;

      if (ruleset && typeof ruleset.findInvestmentTypeByKey === 'function') {
        var t = ruleset.findInvestmentTypeByKey('indexFunds');
        if (t && t.taxation && t.taxation.exitTax && typeof t.taxation.exitTax.deemedDisposalYears === 'number') {
          activeDeemedDisposalYears = t.taxation.exitTax.deemedDisposalYears;
        }
      }
    } catch (_) {
      // Fallback to initial value if resolution fails (e.g. in simple tests)
      activeDeemedDisposalYears = this._deemedDisposalYears;
    }

    // pay deemed disposal taxes for Index Funds aged multiple of N years
    for (let i = 0; i < this.portfolio.length; i++) {
      const dd = activeDeemedDisposalYears;
      if ((dd > 0) && (this.portfolio[i].age % dd === 0)) {
        let gains = this.portfolio[i].interest.amount;
        this.portfolio[i].principal.amount += gains;
        this.portfolio[i].interest.amount = 0;
        this.portfolio[i].age = 0;
        if (gains > 0 || this.canOffsetLosses) {
          var gainsConverted = gains;
          var baseCurrency = this._getBaseCurrency();
          var assetCountry = this._getAssetCountry();
          if (baseCurrency !== residenceCurrency) {
            gainsConverted = convertCurrencyAmount(gains, baseCurrency, assetCountry, residenceCurrency, currentCountry, year, true);
            if (gainsConverted === null) {
              throw new Error('IndexFunds deemed disposal FX conversion failed');
            }
          }
          var gainsMoney = Money.from(gainsConverted, residenceCurrency, currentCountry);
          revenue.declareInvestmentGains(gainsMoney, this.taxRate, 'Deemed Disposal', {
            category: 'exitTax',
            eligibleForAnnualExemption: !!this._exitTaxEligibleForAnnualExemption,
            allowLossOffset: !!this.canOffsetLosses
          });
        }
      }
    }
  }

}


class Shares extends Equity {

  constructor(growth, stdev = 0) {
    var ruleset = null;
    try {
      var cfg = Config.getInstance();
      ruleset = cfg && cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet(cfg.getDefaultCountry()) : null;
    } catch (e) { ruleset = null; }
    const cgtRate = (ruleset && typeof ruleset.getCapitalGainsRate === 'function') ? ruleset.getCapitalGainsRate() : 0;
    super(cgtRate, growth, stdev);
  }

  // Explicitly mark CGT classification for shares
  declareRevenue(income, gains) {
    var incomeMoney = Money.from(income, residenceCurrency, currentCountry);
    revenue.declareInvestmentIncome(incomeMoney);
    if (gains > 0 || this.canOffsetLosses) {
      var gainsMoney = Money.from(gains, residenceCurrency, currentCountry);
      revenue.declareInvestmentGains(gainsMoney, this.taxRate, this.constructor.name + " Sale", {
        category: 'cgt',
        eligibleForAnnualExemption: true,
        allowLossOffset: true
      });
    }
  }

  simulateDeclareRevenue(income, gains, testRevenue) {
    var incomeMoney = Money.from(income, residenceCurrency, currentCountry);
    testRevenue.declareInvestmentIncome(incomeMoney);
    if (gains > 0 || this.canOffsetLosses) {
      var gainsMoney = Money.from(gains, residenceCurrency, currentCountry);
      testRevenue.declareInvestmentGains(gainsMoney, this.taxRate, this.constructor.name + " Sim", {
        category: 'cgt',
        eligibleForAnnualExemption: true,
        allowLossOffset: true
      });
    }
  }

  // Override currency methods for IE defaults
  _getBaseCurrency() {
    return 'EUR'; // IE legacy default
  }

  _getAssetCountry() {
    return 'ie'; // IE legacy default
  }

}


class Pension extends Equity {

  constructor(growth, stdev = 0, person) {
    super(0, growth, stdev);
    this.lumpSum = false;
    this.person = person;
    try {
      var cfg = Config.getInstance();
      this._ruleset = cfg && cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet(cfg.getDefaultCountry()) : null;
    } catch (e) { this._ruleset = null; }
  }

  // Override currency methods: pension tracks StartCountry currency (domestic semantics)
  _getBaseCurrency() {
    var startCountry = normalizeCountry(params.StartCountry || config.getDefaultCountry());
    return getCurrencyForCountry(startCountry);
  }

  _getAssetCountry() {
    return normalizeCountry(params.StartCountry || config.getDefaultCountry());
  }

  declareRevenue(income, gains) {
    var pensionIncomeMoney = Money.from(income, residenceCurrency, currentCountry);
    if (this.lumpSum) {
      revenue.declarePrivatePensionLumpSum(pensionIncomeMoney, this.person);
    } else {
      revenue.declarePrivatePensionIncome(pensionIncomeMoney, this.person);
    }
  }

  getLumpsum() {
    this.lumpSum = true;
    var rsValue = (this._ruleset && typeof this._ruleset.getPensionLumpSumMaxPercent === 'function') ? this._ruleset.getPensionLumpSumMaxPercent() : null;
    var maxPct = (typeof rsValue === 'number' && rsValue > 0) ? rsValue : 0;
    let amount = this.sell(this.capital() * maxPct);
    this.lumpSum = false;
    return amount;
  }

  drawdown(currentAge) {
    var bands = (this._ruleset && typeof this._ruleset.getPensionMinDrawdownRates === 'function') ? this._ruleset.getPensionMinDrawdownRates() : { '0': 0 };
    let ageLimits = Object.keys(bands);
    let minimumDrawdown = ageLimits.reduce(
      function (acc, limit) { return (currentAge >= limit ? bands[limit] : acc); },
      bands[ageLimits[0]]
    );
    return this.sell(this.capital() * minimumDrawdown);
  }

}
