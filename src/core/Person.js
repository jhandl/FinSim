/* This file has to work on both the website and Google Sheets */

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

    // Create and store pension instance, passing the Person instance itself
    this.pension = new Pension(commonPensionConfig.growthRatePension, commonPensionConfig.growthDevPension, this);

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
   * Initialize/reset person-specific yearly income accumulators
   */
  resetYearlyVariables() {
    this.yearlyIncomeStatePension = 0;
    this.yearlyIncomePrivatePension = 0;
  }

  /**
   * Add one year to the person's age and pension
   */
  addYear() {
    this.age++;
    this.pension.addYear();
  }

  /**
   * Calculate yearly pension income (both private and state)
   * @param {Object} config - Global configuration object
   * @returns {Object} Object with lumpSumAmount property
   */
  calculateYearlyPensionIncome(config, currentCountry, targetCurrencyParam, currentYear) {
    let lumpSumAmount = 0;

    // Reset yearly income accumulators
    this.yearlyIncomeStatePension = 0;
    this.yearlyIncomePrivatePension = 0;

    // Lump Sum: Check if retirement age is reached and still in growth phase
    if (this.age === this.retirementAgeParam && this.phase === Phases.growth) {
      lumpSumAmount = this.pension.getLumpsum();
      this.phase = Phases.retired;
    }

    // Private Pension Drawdown: If retired, calculate drawdown
    if (this.phase === Phases.retired) {
      this.yearlyIncomePrivatePension = this.pension.drawdown(this.age);
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
    if (this.statePensionWeeklyParam && this.statePensionWeeklyParam > 0 &&
      this.age >= statePensionAge) {

      // Resolve inflation rate for the State Pension country (not necessarily residence country)
      var spCountry = this.statePensionCountryParam || activeCountry;
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
      this.yearlyIncomeStatePension = 52 * adjust(this.statePensionWeeklyParam, spInflationRate);

      // Add increase(s) if age qualifies for state pension increase
      if (spIncreases && typeof spIncreases === 'object') {
        var thresholds = Object.keys(spIncreases).map(function (k) { return parseInt(k); }).sort(function (a, b) { return a - b; });
        for (var i = 0; i < thresholds.length; i++) {
          var t = thresholds[i];
          if (this.age >= t) {
            this.yearlyIncomeStatePension += 52 * adjust(spIncreases[String(t)], spInflationRate);
          }
        }
      }
    }

    // Track the base currency amount (before conversion) for PV calculations
    this.yearlyIncomeStatePensionBaseCurrency = this.yearlyIncomeStatePension;

    if (this.yearlyIncomeStatePension > 0 && typeof convertCurrencyAmount === 'function') {
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
        var convertedStatePension = convertCurrencyAmount(this.yearlyIncomeStatePension, baseCurrency, baseCountry, targetCurrency, currentCountry, currentYear, true);
        if (convertedStatePension === null) {
          // Strict mode failure: set to 0 and let errors flag abort simulation
          this.yearlyIncomeStatePension = 0;
        } else if (typeof convertedStatePension === 'number' && !isNaN(convertedStatePension)) {
          this.yearlyIncomeStatePension = convertedStatePension;
        }
      }
    }

    return { lumpSumAmount: lumpSumAmount };
  }
} 
