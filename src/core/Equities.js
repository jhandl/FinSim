/* This file has to work on both the website and Google Sheets */

class Equity {

  constructor(taxRate, growth, stdev = 0) {
    this.taxRate = taxRate;
    this.growth = growth;
    this.stdev = stdev;
    this.portfolio = [];
    this.canOffsetLosses = true;
    // Track yearly statistics for attribution
    this.yearlyBought = 0;
    this.yearlySold = 0;
    this.yearlyGrowth = 0;
  }

  buy(amountToBuy) {
    this.portfolio.push({ amount: amountToBuy, interest: 0, age: 0 });
    this.yearlyBought += amountToBuy;
  }

  declareRevenue(income, gains) {
    revenue.declareInvestmentIncome(income);
    if (gains > 0 || this.canOffsetLosses) {
      revenue.declareInvestmentGains(gains, this.taxRate, this.constructor.name + " Sale");
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

    for (let i = 0; i < this.portfolio.length && remaining > 0; i++) {
      const holding = this.portfolio[i];
      const holdingCapital = holding.amount + holding.interest;
      if (remaining >= holdingCapital) {
        sold += holdingCapital;
        gains += holding.interest;
        remaining -= holdingCapital;
        fullySoldHoldings++;
      } else {
        const fraction = holdingCapital > 0 ? (remaining / holdingCapital) : 0;
        sold += remaining;
        gains += fraction * holding.interest;
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
      for (let removed = 0; removed < fullySoldHoldings && this.portfolio.length > 0; removed++) {
        this.portfolio.shift();
      }
    }
    if (partialFraction !== null && this.portfolio.length > 0) {
      const remainingHolding = this.portfolio[0];
      const keepRatio = 1 - partialFraction;
      remainingHolding.amount = keepRatio * remainingHolding.amount;
      remainingHolding.interest = keepRatio * remainingHolding.interest;
    }

    this.yearlySold += sold;
    this.declareRevenue(soldConverted, gainsConverted);
    return soldConverted;
  }

  capital() {
    let sum = 0;
    for (let i = 0; i < this.portfolio.length; i++) {
      sum += this.portfolio[i].amount + this.portfolio[i].interest;
    }
    return sum;
  }

  // Get portfolio statistics for attribution
  getPortfolioStats() {
    let principal = 0;
    let totalGain = 0;

    for (let holding of this.portfolio) {
      principal += holding.amount;
      totalGain += holding.interest;
    }

    return {
      principal: principal,
      totalGain: totalGain,
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

  addYear() {
    // Accumulate interests
    for (let i = 0; i < this.portfolio.length; i++) {
      const holding = this.portfolio[i];
      // Maintain legacy behavior: always use gaussian(mean, stdev) for growth sampling
      const growthRate = gaussian(this.growth, this.stdev);
      const growthAmount = (holding.amount + holding.interest) * growthRate;
      holding.interest += growthAmount;
      this.yearlyGrowth += growthAmount;
      holding.age++;
      // Floor holding at zero if it goes negative
      if (holding.amount + holding.interest < 0) {
        holding.amount = 0;
        holding.interest = 0;
      }
    }
  }

  simulateSellAll(testRevenue) {
    let totalCapital = this.capital();
    let totalGains = 0;

    // Calculate total gains without modifying portfolio
    for (let holding of this.portfolio) {
      totalGains += holding.interest;
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
    testRevenue.declareInvestmentIncome(income);
    if (gains > 0 || this.canOffsetLosses) {
      testRevenue.declareInvestmentGains(gains, this.taxRate, this.constructor.name + " Sim");
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
    revenue.declareInvestmentIncome(income);
    if (gains > 0 || this.canOffsetLosses) {
      revenue.declareInvestmentGains(gains, this.taxRate, this.constructor.name + " Sale", {
        category: 'exitTax',
        eligibleForAnnualExemption: !!this._exitTaxEligibleForAnnualExemption,
        allowLossOffset: !!this.canOffsetLosses
      });
    }
  }

  simulateDeclareRevenue(income, gains, testRevenue) {
    testRevenue.declareInvestmentIncome(income);
    if (gains > 0 || this.canOffsetLosses) {
      testRevenue.declareInvestmentGains(gains, this.taxRate, this.constructor.name + " Sim", {
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
        let gains = this.portfolio[i].interest;
        this.portfolio[i].amount += gains;
        this.portfolio[i].interest = 0;
        this.portfolio[i].age = 0;
        if (gains > 0 || this.canOffsetLosses) {
          revenue.declareInvestmentGains(gains, this.taxRate, 'Deemed Disposal', {
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
    revenue.declareInvestmentIncome(income);
    if (gains > 0 || this.canOffsetLosses) {
      revenue.declareInvestmentGains(gains, this.taxRate, this.constructor.name + " Sale", {
        category: 'cgt',
        eligibleForAnnualExemption: true,
        allowLossOffset: true
      });
    }
  }

  simulateDeclareRevenue(income, gains, testRevenue) {
    testRevenue.declareInvestmentIncome(income);
    if (gains > 0 || this.canOffsetLosses) {
      testRevenue.declareInvestmentGains(gains, this.taxRate, this.constructor.name + " Sim", {
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

  // Override currency methods: pension tracks residence currency (domestic semantics)
  _getBaseCurrency() {
    return residenceCurrency;
  }

  _getAssetCountry() {
    return currentCountry;
  }

  declareRevenue(income, gains) {
    if (this.lumpSum) {
      revenue.declarePrivatePensionLumpSum(income, this.person);
    } else {
      revenue.declarePrivatePensionIncome(income, this.person);
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
