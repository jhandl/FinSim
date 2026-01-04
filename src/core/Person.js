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
    this.statePensionWeeklyParam = personSpecificUIParams.statePensionWeekly;
    this.pensionContributionPercentageParam = personSpecificUIParams.pensionContributionPercentage;
    this.statePensionCurrencyParam = personSpecificUIParams.statePensionCurrency || null;
    this.statePensionCountryParam = personSpecificUIParams.statePensionCountry || null;
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
    this.yearlyIncomeStatePensionBaseCurrency = null; // Money
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
    this.yearlyIncomeStatePensionBaseCurrency = null;

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

    // State Pension: Check if age qualifies for state pension
    var _cfg = null, _rs = null;
    var activeCountry = null;
    try {
      _cfg = Config.getInstance();
      activeCountry = (currentCountry || (_cfg && typeof _cfg.getDefaultCountry === 'function' && _cfg.getDefaultCountry())) || null;
      if (_cfg && typeof _cfg.getCachedTaxRuleSet === 'function') {
        _rs = _cfg.getCachedTaxRuleSet((activeCountry || '').toLowerCase());
      }
    } catch (_) { _rs = null; }
    var statePensionAge = (_rs && typeof _rs.getPensionMinRetirementAgeState === 'function') ? _rs.getPensionMinRetirementAgeState() : 0;
    var spIncreases = (_rs && typeof _rs.getStatePensionIncreaseBands === 'function') ? _rs.getStatePensionIncreaseBands() : null;
    var yearlyStatePensionBase = 0;
    var spCountry = this.statePensionCountryParam || activeCountry;
    if (this.statePensionWeeklyParam && this.statePensionWeeklyParam > 0 &&
      this.age >= statePensionAge) {

      // Resolve inflation rate for the State Pension country (not necessarily residence country)
      var spInflationRate = null;
      if (typeof InflationService !== 'undefined' && InflationService && typeof InflationService.resolveInflationRate === 'function') {
        try {
          spInflationRate = InflationService.resolveInflationRate(spCountry, currentYear, {
            params: this.params || config.params || config,
            config: config,
            countryInflationOverrides: null // Do not apply residence overrides to source country pension
          });
        } catch (_) { }
      }
      // Fallback to params.inflation if resolution failed
      if (spInflationRate === null || spInflationRate === undefined) {
        spInflationRate = (this.params && typeof this.params.inflation === 'number') ? this.params.inflation :
          ((config.params && typeof config.params.inflation === 'number') ? config.params.inflation :
            (config.inflation !== undefined ? config.inflation : 0.02));
      }

      // Calculate yearly state pension (52 weeks) using the specific inflation rate
      yearlyStatePensionBase = 52 * adjust(this.statePensionWeeklyParam, spInflationRate);

      // Add increase(s) if age qualifies for state pension increase
      if (spIncreases && typeof spIncreases === 'object') {
        var thresholds = Object.keys(spIncreases).map(function (k) { return parseInt(k); }).sort(function (a, b) { return a - b; });
        for (var i = 0; i < thresholds.length; i++) {
          var t = thresholds[i];
          if (this.age >= t) {
            yearlyStatePensionBase += 52 * adjust(spIncreases[String(t)], spInflationRate);
          }
        }
      }
    }

    // Create base-currency Money object (pre-conversion) for PV calculations
    var spCurrency = this.statePensionCurrencyParam || null;
    if (!spCurrency && typeof getCurrencyForCountry === 'function') {
      spCurrency = getCurrencyForCountry(spCountry);
    }
    if (typeof normalizeCurrency === 'function') {
      spCurrency = spCurrency ? normalizeCurrency(spCurrency) : spCurrency;
    }
    var spCountryNormalized = spCountry ? String(spCountry).toLowerCase() : null;

    if (yearlyStatePensionBase > 0 && spCurrency && spCountryNormalized) {
      this.yearlyIncomeStatePensionBaseCurrency = Money.create(
        yearlyStatePensionBase,
        spCurrency,
        spCountryNormalized
      );
    } else {
      this.yearlyIncomeStatePensionBaseCurrency = null;
    }

    // Default to base-currency value unless we successfully convert to the target currency.
    this.yearlyIncomeStatePension = this.yearlyIncomeStatePensionBaseCurrency;

    if (yearlyStatePensionBase > 0 && typeof convertCurrencyAmount === 'function') {
      var baseCurrency = this.statePensionCurrencyParam || null;
      if (typeof normalizeCurrency === 'function') {
        baseCurrency = baseCurrency ? normalizeCurrency(baseCurrency) : baseCurrency;
      }
      if (!baseCurrency && typeof getCurrencyForCountry === 'function') {
        baseCurrency = getCurrencyForCountry(this.statePensionCountryParam || currentCountry);
        if (typeof normalizeCurrency === 'function') {
          baseCurrency = baseCurrency ? normalizeCurrency(baseCurrency) : baseCurrency;
        }
      }
      var targetCurrency = targetCurrencyParam || null;
      if (typeof normalizeCurrency === 'function') {
        targetCurrency = targetCurrency ? normalizeCurrency(targetCurrency) : targetCurrency;
      }
      if (baseCurrency && targetCurrency && baseCurrency !== targetCurrency) {
        var baseCountry = this.statePensionCountryParam ? String(this.statePensionCountryParam).toLowerCase() : null;
        if (!baseCountry && typeof findCountryForCurrency === 'function') {
          baseCountry = findCountryForCurrency(baseCurrency, currentCountry);
        }
        var convertedStatePension = convertCurrencyAmount(yearlyStatePensionBase, baseCurrency, baseCountry, targetCurrency, currentCountry, currentYear, true);
        if (convertedStatePension === null) {
          // Strict mode failure: set to 0 and let errors flag abort simulation
          this.yearlyIncomeStatePension = Money.create(0, targetCurrency, String(currentCountry).toLowerCase());
        } else if (typeof convertedStatePension === 'number' && !isNaN(convertedStatePension)) {
          this.yearlyIncomeStatePension = Money.create(convertedStatePension, targetCurrency, String(currentCountry).toLowerCase());
        }
      }
    }

    return { lumpSumAmount: lumpSumAmount, privatePensionByCountry: privatePensionByCountry };
  }
}
