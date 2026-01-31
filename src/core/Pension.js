/* This file has to work on both the website and Google Sheets */

class Pension extends InvestmentAsset {

  /**
   * Create a Pension instance for a specific country
   * @param {number} growth - Expected growth rate
   * @param {number} stdev - Standard deviation for Monte Carlo
   * @param {Object} person - Person instance this pension belongs to
   * @param {string} countryCode - Country code for this pension pot (e.g., 'ie', 'us')
   */
  constructor(growth, stdev = 0, person, countryCode) {
    // Pass minimal typeDef and null ruleset (loaded internally)
    super({}, growth, stdev, null);
    
    this.lumpSum = false;
    this.lumpSumTaken = false;
    this.person = person;
    this.countryCode = countryCode ? String(countryCode).toLowerCase() : null;
    this._isPension = true;
    this._internalRebalance = false;
    try {
      var cfg = Config.getInstance();
      // Load ruleset for THIS pension's country, not the default country
      var rulesetCountry = this.countryCode || cfg.getDefaultCountry();
      this._ruleset = cfg && cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet(rulesetCountry) : null;
    } catch (e) { this._ruleset = null; }
    this.taxAdvantaged = (this._ruleset && typeof this._ruleset.isPrivatePensionTaxAdvantaged === 'function')
      ? this._ruleset.isPrivatePensionTaxAdvantaged()
      : true;
  }

  // Override currency methods: pension tracks its own country's currency
  _getBaseCurrency() {
    var country = this.countryCode || normalizeCountry(params.StartCountry || config.getDefaultCountry());
    return getCurrencyForCountry(country);
  }

  _getAssetCountry() {
    return this.countryCode || normalizeCountry(params.StartCountry || config.getDefaultCountry());
  }

  declareRevenue(income, gains) {
    if (this._internalRebalance && this.taxAdvantaged) return;
    var pensionIncomeMoney = Money.from(income, residenceCurrency, currentCountry);
    if (this.lumpSum) {
      revenue.declarePrivatePensionLumpSum(pensionIncomeMoney, this.person);
    } else {
      revenue.declarePrivatePensionIncome(pensionIncomeMoney, this.person);
    }
  }

  _getMinRetirementAgePrivate() {
    var rs = this._ruleset;
    if (rs && typeof rs.getPensionMinRetirementAgePrivate === 'function') {
      return rs.getPensionMinRetirementAgePrivate() || 0;
    }
    return 0;
  }

  canWithdrawAtAge(currentAge) {
    var minAge = this._getMinRetirementAgePrivate();
    if (!minAge) return true;
    return (typeof currentAge === 'number') ? (currentAge >= minAge) : false;
  }

  takeLumpSumIfEligible(currentAge) {
    if (this.lumpSumTaken) return 0;
    if (!this.canWithdrawAtAge(currentAge)) return 0;
    this.lumpSum = true;
    var rsValue = (this._ruleset && typeof this._ruleset.getPensionLumpSumMaxPercent === 'function') ? this._ruleset.getPensionLumpSumMaxPercent() : null;
    var maxPct = (typeof rsValue === 'number' && rsValue > 0) ? rsValue : 0;
    if (maxPct <= 0) {
      this.lumpSum = false;
      return 0;
    }
    let amount = this.sell(this.capital() * maxPct);
    this.lumpSum = false;
    if (amount === null) return null;
    this.lumpSumTaken = true;
    return amount;
  }

  drawdown(currentAge) {
    if (!this.canWithdrawAtAge(currentAge)) return 0;
    var bands = (this._ruleset && typeof this._ruleset.getPensionMinDrawdownRates === 'function') ? this._ruleset.getPensionMinDrawdownRates() : { '0': 0 };
    let ageLimits = Object.keys(bands);
    let minimumDrawdown = ageLimits.reduce(
      function (acc, limit) { return (currentAge >= limit ? bands[limit] : acc); },
      bands[ageLimits[0]]
    );
    return this.sell(this.capital() * minimumDrawdown);
  }

}

this.Pension = Pension;
