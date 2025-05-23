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
        let holdingGain = this.portfolio[0].interest; // Use original gain value
        gains += holdingGain; // Accumulate for Revenue

        // --- Taxman Declaration (Full Sale) - Minimal Add ---
        if (taxman) {
            let assetType = this instanceof IndexFunds ? 'index_fund' : (this instanceof Shares ? 'shares' : 'unknown_equity');
            if (holdingGain !== 0 || this.canOffsetLosses) {
                 taxman.declareCapitalGainOrLoss({
                    assetType: assetType,
                    amount: holdingGain, // Use original gain value
                    costBasis: this.portfolio[0].amount, // Use original cost basis
                    saleProceeds: sale, // Use original sale value (holding value)
                    holdingPeriodYears: this.portfolio[0].age, // Use original age
                    details: { description: `Sold entire ${assetType} holding` }
                });
            }
        }
        // --- End Taxman Declaration ---

        this.portfolio.shift();
      } else {
        // sell a fraction of the holding
        sale = amountToSell;
        sold += amountToSell;
        let fraction = amountToSell / (this.portfolio[0].amount + this.portfolio[0].interest);
        let partialGain = fraction * this.portfolio[0].interest; // Use original partial gain value
        gains += partialGain; // Accumulate for Revenue

        // --- Taxman Declaration (Partial Sale) - Minimal Add ---
         if (taxman) {
            let assetType = this instanceof IndexFunds ? 'index_fund' : (this instanceof Shares ? 'shares' : 'unknown_equity');
            if (partialGain !== 0 || this.canOffsetLosses) {
                 taxman.declareCapitalGainOrLoss({
                    assetType: assetType,
                    amount: partialGain, // Use original partial gain value
                    costBasis: fraction * this.portfolio[0].amount, // Use original partial cost basis
                    saleProceeds: sale, // Use original sale value (amountToSell)
                    holdingPeriodYears: this.portfolio[0].age, // Use original age
                    details: { description: `Sold partial ${assetType} holding` }
                });
            }
        }
        // --- End Taxman Declaration ---
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
        // --- Taxman Declaration (Deemed Disposal) - Minimal Add ---
        if (taxman) {
            if (gains !== 0 || this.canOffsetLosses) { // Use original 'gains' variable
                taxman.declareCapitalGainOrLoss({
                    assetType: 'index_fund',
                    amount: gains, // Use original gain value
                    costBasis: this.portfolio[i].amount, // Use original cost basis before update
                    saleProceeds: this.portfolio[i].amount + gains, // Calculate deemed proceeds from original values
                    holdingPeriodYears: this.portfolio[i].age, // Use original age before reset
                    isDeemedDisposal: true,
                    details: { description: `Deemed disposal for index fund holding after ${this.portfolio[i].age} years` }
                });
            }
        }
        // --- End Taxman Declaration ---

        // Original state update and Revenue call
        this.portfolio[i].amount += gains;
        this.portfolio[i].interest = 0;
        this.portfolio[i].age = 0;
        if (gains > 0 || this.canOffsetLosses) {
          revenue.declareInvestmentGains(gains, this.taxRate);
        }
      }
    }
  }

  /**
   * Applies the effect of unrealized gains tax (like deemed disposal) calculated by Taxman.
   * This updates the cost basis of the relevant holdings within the portfolio.
   * It mirrors the logic previously used for the legacy Revenue deemed disposal,
   * creating temporary duplication during parallel run phase.
   * @param {string} assetType - The specific asset type from Taxman's update signal (e.g., 'index_fund').
   * @param {number} newCostBasis - The new total cost basis for this asset type (Currently unused, logic relies on internal portfolio state).
   * @param {object} details - Additional details from Taxman if needed (e.g., specific holding identifier).
   */
  applyUnrealizedGainsTax(assetType, newCostBasis, details) {
      // This logic assumes the trigger condition (e.g., age % 8 === 0) is the same as the one
      // Taxman used. If Taxman's rules become more complex, this might need refinement
      // or Taxman might need to provide more specific identifiers via 'details'.
      // Also assumes this method is only called on IndexFunds instances for now.
      console.log(`%cIndexFunds: Applying cost basis update for '${assetType}' due to unrealized gains tax signal from Taxman.`, 'color: blue; font-style: italic;');
      let updated = false;
      for (let i = 0; i < this.portfolio.length; i++) {
          // Replicate the condition check used for deemed disposal / unrealized gains tax
          // TODO: Make this condition dynamic based on schema rules passed via Taxman if needed.
          if ((config.deemedDisposalYears > 0) && (this.portfolio[i].age % config.deemedDisposalYears === 0)) {
              let gain = this.portfolio[i].interest;
              if (gain > 0) { // Only update if there was a gain
                  console.log(`  - Updating holding ${i}: Basis ${this.portfolio[i].amount} + Gain ${gain} -> New Basis ${this.portfolio[i].amount + gain}`);
                  this.portfolio[i].amount += gain; // Update cost basis
                  this.portfolio[i].interest = 0;   // Reset interest
                  this.portfolio[i].age = 0;        // Reset age
                  updated = true;
              }
          }
      }
      if (!updated) {
          console.warn(`%capplyUnrealizedGainsTax called for ${assetType}, but no matching holdings found or no gains to update basis on.`, 'color: orange;');
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
  
  drawdown() {
    let ageLimits = Object.keys(config.pensionMinDrawdownBands);
    let minimumDrawdown = ageLimits.reduce(
        (acc, limit) => (age >= limit ? config.pensionMinDrawdownBands[limit] : acc), 
        config.pensionMinDrawdownBands[ageLimits[0]]
    );
    return this.sell(this.capital() * minimumDrawdown);
  }

}
