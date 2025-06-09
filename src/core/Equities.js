/* This file has to work on both the website and Google Sheets */

class Equity {

  constructor(taxRate, growth, stdev=0) {
    this.taxRate = taxRate;
    this.growth = growth;
    this.stdev = stdev;
    this.portfolio = [];
    this.canOffsetLosses = true;
  }

  buy(amountToBuy) {
    this.portfolio.push({amount: amountToBuy, interest: 0, age: 0});
  }
  
  declareRevenue(income, gains) {
    revenue.declareInvestmentIncome(income);
    if (gains > 0 || this.canOffsetLosses) {
      revenue.declareInvestmentGains(gains, this.taxRate);
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
    
  addYear() {
    // Accumulate interests
    for (let i = 0; i < this.portfolio.length; i++) {
      this.portfolio[i].interest += (this.portfolio[i].amount + this.portfolio[i].interest) * gaussian(this.growth,this.stdev);
      this.portfolio[i].age++;
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
      testRevenue.declareInvestmentGains(gains, this.taxRate);
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
          revenue.declareInvestmentGains(gains, this.taxRate);
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

  constructor(growth, stdev=0) {
    super(0, growth, stdev);
    this.lumpSum = false;
  }

  declareRevenue(income, gains) {
    if (this.lumpSum) {
      revenue.declarePrivatePensionLumpSum(income);
    } else {
      revenue.declarePrivatePensionIncome(income);
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
