/* This file has to work on both the website and Google Sheets */

class Equity {

  constructor(taxRate, growth, stdev=0) {
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
    this.portfolio.push({amount: amountToBuy, interest: 0, age: 0});
    this.yearlyBought += amountToBuy;
  }
  
  declareRevenue(income, gains) {
    revenue.declareInvestmentIncome(income);
    if (gains > 0 || this.canOffsetLosses) {
      revenue.declareInvestmentGains(gains, this.taxRate, this.constructor.name + " Sale");
    }
  }
  
  sell(amountToSell) {
    let sold = 0;
    let gains = 0;
    while ((amountToSell > 0) && (this.portfolio.length > 0)) {
      let sale = 0;
      // Sell the oldest holding (index 0) following the FIFO rule.
      if (amountToSell >= this.portfolio[0].amount + this.portfolio[0].interest) {
        // sell the whole holding
        sale = this.portfolio[0].amount + this.portfolio[0].interest;
        sold += sale;
        gains += this.portfolio[0].interest;
        this.portfolio.shift();
      } else {
        // sell a fraction of the holding
        sale = amountToSell;
        sold += amountToSell;
        let fraction = amountToSell / (this.portfolio[0].amount + this.portfolio[0].interest);
        gains += fraction * this.portfolio[0].interest;
        this.portfolio[0].amount = (1 - fraction) * this.portfolio[0].amount;
        this.portfolio[0].interest = (1 - fraction) * this.portfolio[0].interest;
      }
      amountToSell -= sale;
    }
    this.yearlySold += sold;
    this.declareRevenue(sold, gains);
    return sold;
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
    
    // Use simulation method instead of real one
    this.simulateDeclareRevenue(totalCapital, totalGains, testRevenue);
    return totalCapital;
  }

  simulateDeclareRevenue(income, gains, testRevenue) {
    testRevenue.declareInvestmentIncome(income);
    if (gains > 0 || this.canOffsetLosses) {
      testRevenue.declareInvestmentGains(gains, this.taxRate, this.constructor.name+" Sim");
    }
  }

}


class IndexFunds extends Equity {
  
  constructor(growth, stdev=0) {
    // Prefer ruleset when available to source exit tax settings
    var ruleset = null;
    try {
      var cfg = Config.getInstance();
      ruleset = cfg && cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet('ie') : null;
    } catch (e) { ruleset = null; }

    // Cache the investment type definition, if present
    var indexFundsTypeDef = null;
    try {
      if (ruleset && typeof ruleset.findInvestmentTypeByKey === 'function') {
        indexFundsTypeDef = ruleset.findInvestmentTypeByKey('indexFunds');
      }
    } catch (_) { indexFundsTypeDef = null; }

    const resolveExitTaxRate = function() {
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
    this.canOffsetLosses = (function(){
      if (ruleset && typeof ruleset.findInvestmentTypeByKey === 'function') {
        var t = indexFundsTypeDef || ruleset.findInvestmentTypeByKey('indexFunds');
        if (t && t.taxation && t.taxation.exitTax && typeof t.taxation.exitTax.allowLossOffset === 'boolean') {
          return t.taxation.exitTax.allowLossOffset;
        }
      }
      return false;
    })();

    // Annual exemption eligibility for exit tax (IE legacy behavior allowed it for ETF disposals)
    this._exitTaxEligibleForAnnualExemption = (function(){
      if (indexFundsTypeDef && indexFundsTypeDef.taxation && indexFundsTypeDef.taxation.exitTax && typeof indexFundsTypeDef.taxation.exitTax.eligibleForAnnualExemption === 'boolean') {
        return indexFundsTypeDef.taxation.exitTax.eligibleForAnnualExemption;
      }
      return true; // legacy IE behavior: treat as eligible for the annual exemption
    })();

    // Deemed disposal years
    this._deemedDisposalYears = (function(){
      if (ruleset && typeof ruleset.findInvestmentTypeByKey === 'function') {
        var t = indexFundsTypeDef || ruleset.findInvestmentTypeByKey('indexFunds');
        if (t && t.taxation && t.taxation.exitTax && typeof t.taxation.exitTax.deemedDisposalYears === 'number') {
          return t.taxation.exitTax.deemedDisposalYears;
        }
      }
      return 0;
    })();
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
      testRevenue.declareInvestmentGains(gains, this.taxRate, this.constructor.name+" Sim", {
        category: 'exitTax',
        eligibleForAnnualExemption: !!this._exitTaxEligibleForAnnualExemption,
        allowLossOffset: !!this.canOffsetLosses
      });
    }
  }
  
  addYear() {
    super.addYear();
    // pay deemed disposal taxes for Index Funds aged multiple of 8 years
    for (let i = 0; i < this.portfolio.length; i++) {
      const dd = this._deemedDisposalYears;
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

  constructor(growth, stdev=0) {
    var ruleset = null;
    try {
      var cfg = Config.getInstance();
      ruleset = cfg && cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet('ie') : null;
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
      testRevenue.declareInvestmentGains(gains, this.taxRate, this.constructor.name+" Sim", {
        category: 'cgt',
        eligibleForAnnualExemption: true,
        allowLossOffset: true
      });
    }
  }

}


class Pension extends Equity {

  constructor(growth, stdev=0, person) {
    super(0, growth, stdev);
    this.lumpSum = false;
    this.person = person;
    try {
      var cfg = Config.getInstance();
      this._ruleset = cfg && cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet('ie') : null;
    } catch (e) { this._ruleset = null; }
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
        function(acc, limit){ return (currentAge >= limit ? bands[limit] : acc); }, 
        bands[ageLimits[0]]
    );
    return this.sell(this.capital() * minimumDrawdown);
  }

}
