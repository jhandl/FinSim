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
      const gaussianValue = gaussian(this.growth, this.stdev);
      const growthAmount = (holding.amount + holding.interest) * gaussianValue;
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
    super(config.FundsExitTax, growth, stdev);
    this.canOffsetLosses = config.FundsCanOffsetLosses;
  }
  
  addYear() {
    super.addYear();
    // pay deemed disposal taxes for Index Funds aged multiple of 8 years
    for (let i = 0; i < this.portfolio.length; i++) {
      if ((config.deemedDisposalYears > 0) && (this.portfolio[i].age % config.deemedDisposalYears === 0)) {
        let gains = this.portfolio[i].interest;
        this.portfolio[i].amount += gains;
        this.portfolio[i].interest = 0;
        this.portfolio[i].age = 0;
        if (gains > 0 || this.canOffsetLosses) {
          revenue.declareInvestmentGains(gains, this.taxRate, 'Deemed Disposal');
        }
      }
    }
  }

}


class Shares extends Equity {

  constructor(growth, stdev=0) {
    super(config.cgtRate, growth, stdev);
  }

}


class Pension extends Equity {

  constructor(growth, stdev=0, person) {
    super(0, growth, stdev);
    this.lumpSum = false;
    this.person = person;
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
    let amount = this.sell(this.capital() * config.pensionLumpSumLimit);
    this.lumpSum = false;
    return amount;
  }
  
  drawdown(currentAge) {
    let ageLimits = Object.keys(config.pensionMinDrawdownBands);
    let minimumDrawdown = ageLimits.reduce(
        (acc, limit) => (currentAge >= limit ? config.pensionMinDrawdownBands[limit] : acc), 
        config.pensionMinDrawdownBands[ageLimits[0]]
    );
    return this.sell(this.capital() * minimumDrawdown);
  }

}
