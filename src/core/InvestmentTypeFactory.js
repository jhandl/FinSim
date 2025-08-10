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
    this._taxCategory = GenericInvestmentAsset._resolveTaxCategory(investmentTypeDef);
    this._deemedDisposalYears = GenericInvestmentAsset._resolveDeemedDisposalYears(investmentTypeDef);
    this.canOffsetLosses = GenericInvestmentAsset._resolveAllowLossOffset(investmentTypeDef);
    this.eligibleForAnnualExemption = GenericInvestmentAsset._resolveAnnualExemptionEligibility(investmentTypeDef);
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
    revenue.declareInvestmentIncome(income, this.label + ' Income');
    if (gains > 0 || this.canOffsetLosses) {
      // Determine flags from type definition
      var isExit = (this._taxCategory === 'exitTax');
      var eligible = !!this.eligibleForAnnualExemption;
      var allowOffset = !!this.canOffsetLosses;
      revenue.declareInvestmentGains(gains, this.taxRate, this.label + ' Sale', {
        category: isExit ? 'exitTax' : 'cgt',
        eligibleForAnnualExemption: eligible,
        allowLossOffset: allowOffset
      });
    }
  }

  // Mirror classification in simulation path for withdraw planning
  simulateDeclareRevenue(income, gains, testRevenue) {
    testRevenue.declareInvestmentIncome(income, this.label + ' Income');
    if (gains > 0 || this.canOffsetLosses) {
      var isExit = (this._taxCategory === 'exitTax');
      testRevenue.declareInvestmentGains(gains, this.taxRate, this.label + ' Sim', {
        category: isExit ? 'exitTax' : 'cgt',
        eligibleForAnnualExemption: !!this.eligibleForAnnualExemption,
        allowLossOffset: !!this.canOffsetLosses
      });
    }
  }

  addYear() {
    super.addYear();
    // For exit tax categories, apply deemed disposal if configured
    if (this._taxCategory === 'exitTax') {
      var dd = this._deemedDisposalYears;
      if (dd && dd > 0) {
        for (var i = 0; i < this.portfolio.length; i++) {
          if (this.portfolio[i].age % dd === 0) {
            var gains = this.portfolio[i].interest;
            this.portfolio[i].amount += gains;
            this.portfolio[i].interest = 0;
            this.portfolio[i].age = 0;
            if (gains > 0 || this.canOffsetLosses) {
              revenue.declareInvestmentGains(gains, this.taxRate, 'Deemed Disposal', {
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
      assets.push({ key: key, label: (t.label || key), asset: new GenericInvestmentAsset(t, gr, sd, ruleset) });
    }
    return assets;
  }
}

// Make available in global context
this.GenericInvestmentAsset = GenericInvestmentAsset;
this.InvestmentTypeFactory = InvestmentTypeFactory;


