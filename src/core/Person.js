/* This file has to work on both the website and Google Sheets */

/**
 * Facade over a person's per-country pension pots.
 * Exposes the same methods as a single Pension, but operates across all pots.
 */
class PensionPortfolio {
  constructor(person) {
    this.person = person;
  }

  _getPotKeys() {
    var pensions = (this.person && this.person.pensions) ? this.person.pensions : null;
    if (!pensions) return [];
    // Deterministic order
    return Object.keys(pensions).sort();
  }

  capital() {
    var pensions = (this.person && this.person.pensions) ? this.person.pensions : null;
    if (!pensions) return 0;
    var keys = this._getPotKeys();
    var total = 0;
    for (var i = 0; i < keys.length; i++) {
      var pot = pensions[keys[i]];
      if (!pot || typeof pot.capital !== 'function') continue;
      total += pot.capital();
    }
    return total;
  }

  buy(amountToBuy, currency, country) {
    if (!this.person || typeof this.person.getPensionForCountry !== 'function') {
      throw new Error('PensionPortfolio.buy: invalid person');
    }
    return this.person.getPensionForCountry(country).buy(amountToBuy, currency, country);
  }

  sell(amountToSell) {
    var pensions = (this.person && this.person.pensions) ? this.person.pensions : null;
    if (!pensions) return 0;
    var remaining = (typeof amountToSell === 'number') ? amountToSell : 0;
    if (remaining <= 0) return 0;

    var keys = this._getPotKeys();
    var totalSold = 0;
    var currentAge = (this.person && typeof this.person.age === 'number') ? this.person.age : null;
    for (var i = 0; i < keys.length && remaining > 0; i++) {
      var pot = pensions[keys[i]];
      if (!pot || typeof pot.capital !== 'function' || typeof pot.sell !== 'function') continue;
      if (typeof pot.canWithdrawAtAge === 'function' && !pot.canWithdrawAtAge(currentAge)) continue;
      var cap = pot.capital();
      if (cap <= 0) continue;
      var w = Math.min(cap, remaining);
      var sold = pot.sell(w);
      if (sold === null) return null;
      totalSold += sold;
      remaining -= sold;
    }
    return totalSold;
  }

  getLumpsum(currentAge) {
    var pensions = (this.person && this.person.pensions) ? this.person.pensions : null;
    if (!pensions) return 0;
    var keys = this._getPotKeys();
    var total = 0;
    for (var i = 0; i < keys.length; i++) {
      var pot = pensions[keys[i]];
      if (!pot || typeof pot.takeLumpSumIfEligible !== 'function') continue;
      var amt = pot.takeLumpSumIfEligible(currentAge);
      if (amt === null) return null;
      total += amt;
    }
    return total;
  }
}

/**
 * Convert state pension period to annual multiplier.
 * @param {string} period - Period string from ruleset ('weekly', 'monthly', 'yearly')
 * @returns {number} Annual multiplier (52 for weekly, 12 for monthly, 1 for yearly)
 */
function getStatePensionMultiplier(period) {
  var p = (period || '').toString().trim().toLowerCase();
  if (p === 'weekly') return 52;
  if (p === 'monthly') return 12;
  if (p === 'yearly' || p === 'annual') return 1;
  throw new Error('Unknown state pension period: ' + period);
}

/**
 * Person class to encapsulate person-specific data and logic for the financial simulator.
 * This class handles individual pension management, age tracking, and income calculations.
 */
class Person {

  /**
   * Create a Person instance
   * @param {string} id - Unique identifier for the person (e.g., 'P1', 'P2')
   * @param {Object} personSpecificUIParams - Person-specific parameters from UI
   * @param {Object} commonSimParams - Common simulation parameters
   * @param {Object} commonPensionConfig - Pension configuration (growthRatePension, growthDevPension)
   */
  constructor(id, personSpecificUIParams, commonSimParams, commonPensionConfig) {
    this.id = id;

    // Initialize age (will be incremented at the start of the first simulation year)
    this.age = personSpecificUIParams.startingAge - 1;

    // Initialize phase to growth phase
    this.phase = Phases.growth;

    // Per-country pension pots map (countryCode → Pension instance)
    // Pensions are created lazily via getPensionForCountry()
    this.pensions = {};
    this._pensionConfig = commonPensionConfig;  // Store for lazy creation
    this._pensionPortfolio = new PensionPortfolio(this);

    // Store essential person-specific parameters
    this.retirementAgeParam = personSpecificUIParams.retirementAge;
    this.statePensionByCountry = personSpecificUIParams.statePensionByCountry;
    this.params = commonSimParams;

    // Reset yearly variables
    this.resetYearlyVariables();
  }

  /**
   * Get or create a pension pot for a specific country.
   * Each country with a private pension system can have its own pension pot.
   * @param {string} countryCode - Country code (e.g., 'ie', 'us')
   * @returns {Pension|null} Pension instance for the country, or null if invalid
   */
  getPensionForCountry(countryCode) {
    var key = countryCode ? String(countryCode).toLowerCase() : null;
    if (!key) return null;
    if (!this.pensions[key]) {
      this.pensions[key] = new Pension(
        this._pensionConfig.growthRatePension,
        this._pensionConfig.growthDevPension,
        this,
        key  // Country code for this pension pot
      );
    }
    return this.pensions[key];
  }

  /**
   * Return a facade exposing Pension-like methods (capital/sell/buy/getLumpsum)
   * across all per-country pension pots.
   * @returns {PensionPortfolio}
   */
  getPensionPortfolio() {
    return this._pensionPortfolio;
  }

  getTotalPensionCapital() {
    return this._pensionPortfolio.capital();
  }

  sellPension(amountToSell) {
    return this._pensionPortfolio.sell(amountToSell);
  }

  /**
   * Initialize/reset person-specific yearly income accumulators
   */
  resetYearlyVariables() {
    this.yearlyIncomePrivatePension = 0;
    this.yearlyIncomeStatePension = null; // Money
    this.yearlyIncomeStatePensionByCountry = {};
  }

  /**
   * Add one year to the person's age and all pension pots
   */
  addYear() {
    this.age++;
    // Iterate over all pension pots for multi-country support
    for (var countryCode in this.pensions) {
      if (Object.prototype.hasOwnProperty.call(this.pensions, countryCode)) {
        this.pensions[countryCode].addYear();
      }
    }
  }

  /**
   * Calculate yearly pension income (both private and state)
   * @param {Object} config - Global configuration object
   * @returns {Object} Object with lumpSumAmount property
   */
  calculateYearlyPensionIncome(config, currentCountry, targetCurrencyParam, currentYear) {
    let lumpSumAmount = 0;

    // Reset yearly income accumulators
    this.yearlyIncomePrivatePension = 0;
    this.yearlyIncomeStatePension = null;
    this.yearlyIncomeStatePensionByCountry = {};

    // Retirement: when the retirement age is reached, switch to retired phase.
    // Lump sum is applied per-pot when (and only when) each pot is eligible.
    if (this.phase === Phases.growth && this.age >= this.retirementAgeParam) {
      this.phase = Phases.retired;
    }
    if (this.phase === Phases.retired) {
      lumpSumAmount = this._pensionPortfolio.getLumpsum(this.age);
      if (lumpSumAmount === null) return { lumpSumAmount: null, privatePensionByCountry: {} };
    }

    // Private Pension Drawdown: If retired, draw from all pension pots
    var privatePensionByCountry = {};
    if (this.phase === Phases.retired) {
      for (var potCountry in this.pensions) {
        if (!Object.prototype.hasOwnProperty.call(this.pensions, potCountry)) continue;
        var pot = this.pensions[potCountry];
        if (pot && typeof pot.canWithdrawAtAge === 'function' && !pot.canWithdrawAtAge(this.age)) continue;
        if (pot.capital() > 0) {
          var drawdownAmount = pot.drawdown(this.age);
          if (drawdownAmount > 0) {
            privatePensionByCountry[potCountry] = drawdownAmount;
            this.yearlyIncomePrivatePension += drawdownAmount;
          }
        }
      }
    }

    // State Pension: iterate per-country sources (rules-driven periods)
    var statePensionByCountry = this.statePensionByCountry;

    var totalStatePensionResidenceCurrency = 0;
    var targetCurrency = targetCurrencyParam || null;
    if (typeof normalizeCurrency === 'function') {
      targetCurrency = targetCurrency ? normalizeCurrency(targetCurrency) : targetCurrency;
    }
    for (var spCountry in statePensionByCountry) {
      if (!Object.prototype.hasOwnProperty.call(statePensionByCountry, spCountry)) continue;
      var amount = statePensionByCountry[spCountry];
      if (!amount || amount <= 0) continue;

      var spCountryNormalized = String(spCountry).toLowerCase();
      var rs = Config.getInstance().getCachedTaxRuleSet(spCountryNormalized);
      var statePensionAge = rs.getPensionMinRetirementAgeState();
      if (this.age < statePensionAge) continue;

      var spInflationRate = InflationService.resolveInflationRate(spCountryNormalized, currentYear, {
        params: this.params,
        config: config,
        countryInflationOverrides: null // Do not apply residence overrides to source country pension
      });

      var period = rs.getStatePensionPeriod();
      var multiplier = getStatePensionMultiplier(period);
      var yearlyStatePensionBase = multiplier * adjust(amount, spInflationRate);

      var spIncreases = rs.getStatePensionIncreaseBands();
      if (spIncreases && typeof spIncreases === 'object') {
        var thresholds = Object.keys(spIncreases).map(function (k) { return parseInt(k); }).sort(function (a, b) { return a - b; });
        for (var i = 0; i < thresholds.length; i++) {
          var t = thresholds[i];
          if (this.age >= t) {
            yearlyStatePensionBase += multiplier * adjust(spIncreases[String(t)], spInflationRate);
          }
        }
      }

      var spCurrency = getCurrencyForCountry(spCountryNormalized);
      if (typeof normalizeCurrency === 'function') {
        spCurrency = spCurrency ? normalizeCurrency(spCurrency) : spCurrency;
      }
      this.yearlyIncomeStatePensionByCountry[spCountryNormalized] = Money.create(
        yearlyStatePensionBase,
        spCurrency,
        spCountryNormalized
      );

      if (spCurrency && targetCurrency && spCurrency !== targetCurrency) {
        var convertedStatePension = convertCurrencyAmount(yearlyStatePensionBase, spCurrency, spCountryNormalized, targetCurrency, currentCountry, currentYear, true);
        if (convertedStatePension === null) {
          return { lumpSumAmount: null, privatePensionByCountry: {} };
        }
        totalStatePensionResidenceCurrency += convertedStatePension;
      } else {
        totalStatePensionResidenceCurrency += yearlyStatePensionBase;
      }
    }

    if (totalStatePensionResidenceCurrency > 0) {
      this.yearlyIncomeStatePension = Money.create(totalStatePensionResidenceCurrency, targetCurrency, String(currentCountry).toLowerCase());
    }

    return { lumpSumAmount: lumpSumAmount, privatePensionByCountry: privatePensionByCountry };
  }
}
