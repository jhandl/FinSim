/* This file has to work on both the website and Google Sheets */

/**
 * Composite investment asset that manages two underlying "legs" (InvestmentAsset instances).
 * Used for mixed portfolios (Fixed or Glide Path) where each leg has distinct economic behavior
 * (growth/volatility) and potentially distinct asset classes (equity vs bond).
 */
function MixedInvestmentAsset(leg1TypeDef, leg2TypeDef, growth1, stdev1, growth2, stdev2, ruleset) {
  // Create the two legs
  this.leg1 = new InvestmentAsset(leg1TypeDef, growth1, stdev1, ruleset);
  this.leg2 = new InvestmentAsset(leg2TypeDef, growth2, stdev2, ruleset);

  // Copy metadata from leg1 (assumed primary) for identification
  this.key = this.leg1.key;
  this.label = this.leg1.label;
  this.baseCurrency = this.leg1.baseCurrency;
  this.assetCountry = this.leg1.assetCountry;
  this.residenceScope = this.leg1.residenceScope;

  // Composite state
  this.mixConfig = null;
  this.portfolio = []; // Kept empty but present for compatibility checks

  // Define computed properties for yearly stats to ensure consistency with legs
  Object.defineProperty(this, 'yearlyBought', {
    get: function() { return this.leg1.yearlyBought + this.leg2.yearlyBought; },
    enumerable: true
  });
  Object.defineProperty(this, 'yearlySold', {
    get: function() { return this.leg1.yearlySold + this.leg2.yearlySold; },
    enumerable: true
  });
  Object.defineProperty(this, 'yearlyGrowth', {
    get: function() { return this.leg1.yearlyGrowth + this.leg2.yearlyGrowth; },
    enumerable: true
  });
}

MixedInvestmentAsset.prototype.buy = function(amount, currency, country, legNum) {
  // console.log('MixedInvestmentAsset.buy', amount, legNum);
  // Route to appropriate leg
  if (legNum === 1) {
    this.leg1.buy(amount, currency, country);
  } else {
    this.leg2.buy(amount, currency, country);
  }
};

MixedInvestmentAsset.prototype.sell = function(amount) {
  var v1 = this.leg1.capital();
  var v2 = this.leg2.capital();
  var totalCapital = v1 + v2;
  
  if (totalCapital === 0) return 0;

  var amount1 = amount * (v1 / totalCapital);
  var amount2 = amount * (v2 / totalCapital);

  var sold1 = this.leg1.sell(amount1);
  var sold2 = this.leg2.sell(amount2);
  
  if (sold1 === null || sold2 === null) return null;
  
  return sold1 + sold2;
};

MixedInvestmentAsset.prototype.capital = function() {
  return this.leg1.capital() + this.leg2.capital();
};

MixedInvestmentAsset.prototype.addYear = function() {
  this.leg1.addYear();
  this.leg2.addYear();
};

MixedInvestmentAsset.prototype.resetYearlyStats = function() {
  this.leg1.resetYearlyStats();
  this.leg2.resetYearlyStats();
};

MixedInvestmentAsset.prototype.getPortfolioStats = function() {
  var s1 = this.leg1.getPortfolioStats();
  var s2 = this.leg2.getPortfolioStats();
  
  return {
    principal: s1.principal + s2.principal,
    totalGain: s1.totalGain + s2.totalGain,
    yearlyBought: this.yearlyBought,
    yearlySold: this.yearlySold,
    yearlyGrowth: this.yearlyGrowth
  };
};

MixedInvestmentAsset.prototype.simulateSellAll = function(testRevenue) {
  var v1 = this.leg1.simulateSellAll(testRevenue);
  var v2 = this.leg2.simulateSellAll(testRevenue);
  if (v1 === null || v2 === null) return null;
  return v1 + v2;
};

this.MixedInvestmentAsset = MixedInvestmentAsset;
