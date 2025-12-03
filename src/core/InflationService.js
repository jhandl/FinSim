/* This file has to work on both the website and Google Sheets */

/**
 * InflationService: central, country-aware inflation helpers.
 *
 * Design goals:
 * - Single source of truth for resolving inflation rates across countries/years.
 * - Backwards compatible with existing behaviour in environments where no
 *   additional context is available (tests, legacy single‑country runs).
 * - GAS/browser friendly (no modules, simple global exposure).
 *
 * IMPORTANT:
 * - The service prefers explicit options when provided, but will gracefully
 *   fall back to global `params`, `Config`, `countryInflationOverrides`, and
 *   `EconomicData` when running inside the simulator.
 */
(function (root) {
  function normalizeCountry(code) {
    if (code === null || code === undefined) return '';
    return String(code).trim().toLowerCase();
  }

  function InflationService() { }

  // Expose shared country normalisation helper so other modules
  // (e.g. Utils.getDeflationFactorForCountry) can reuse the same
  // logic instead of duplicating it.
  InflationService.normalizeCountry = normalizeCountry;

  /**
   * Resolve the inflation rate (decimal, e.g. 0.02 for 2%) for a given
   * country/year using the same priority order as the simulator:
   *
   * 1. Explicit overrides (MV events) in countryInflationOverrides[country]
   * 2. Scenario base-country inflation (params.inflation) when applicable
   * 3. EconomicData.getInflationForYear(country, year) or getInflation(country)
   * 4. TaxRuleSet.getInflationRate() for the country
   * 5. Fallback to params.inflation or defaultRate (0.02)
   *
   * @param {string|null} countryCode - ISO-2 country code (case-insensitive)
   * @param {number|null} year        - Calendar year for CPI lookup
   * @param {Object=} options         - Optional context overrides:
   *   - params
   *   - config
   *   - economicData
   *   - countryInflationOverrides
   *   - baseCountry
   *   - defaultRate
   * @returns {number} inflation rate as decimal
   */
  InflationService.resolveInflationRate = function (countryCode, year, options) {
    var opts = options || {};

    // Resolve config / params / overrides / economicData from options or globals
    // Resolve config / params / overrides / economicData from options or globals
    // Prefer explicit options, fall back to globals only if necessary for legacy support
    var cfg = opts.config;
    if (!cfg && typeof Config !== 'undefined' && Config && typeof Config.getInstance === 'function') {
      try { cfg = Config.getInstance(); } catch (_) { }
    }

    var paramsObj = opts.params;
    if (!paramsObj && typeof params !== 'undefined') {
      paramsObj = params;
    }

    var overrides = opts.countryInflationOverrides;
    if (!overrides && typeof countryInflationOverrides !== 'undefined') {
      overrides = countryInflationOverrides;
    }

    var economicData = opts.economicData || null;
    if (!economicData && cfg && typeof cfg.getEconomicData === 'function') {
      try {
        economicData = cfg.getEconomicData();
      } catch (_) { }
    }

    var defaultRate = (typeof opts.defaultRate === 'number') ? opts.defaultRate : 0.02;

    // Base country used when no country is provided
    var baseCountryCode = opts.baseCountry || null;
    if (!baseCountryCode && paramsObj && paramsObj.StartCountry) {
      baseCountryCode = paramsObj.StartCountry;
    }
    if (!baseCountryCode && cfg && typeof cfg.getDefaultCountry === 'function') {
      try { baseCountryCode = cfg.getDefaultCountry(); } catch (_) { }
    }
    var baseCountryNorm = normalizeCountry(baseCountryCode);

    var key = normalizeCountry(countryCode);
    if (!key) key = baseCountryNorm;

    // 1) Explicit per-country overrides (typically set by MV relocation events)
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
      var override = overrides[key];
      if (override !== null && override !== undefined && override !== '') {
        return Number(override);
      }
    }

    // 2) Scenario base-country inflation (single scalar) when key is base
    if (key === baseCountryNorm && paramsObj && typeof paramsObj.inflation === 'number') {
      return paramsObj.inflation;
    }

    // 3) EconomicData CPI per year or base CPI
    if (economicData && economicData.ready) {
      try {
        var effectiveYear = (typeof year === 'number') ? year : null;
        if (effectiveYear === null && cfg && typeof cfg.getSimulationStartYear === 'function') {
          try {
            var startYear = cfg.getSimulationStartYear();
            if (typeof startYear === 'number') {
              effectiveYear = startYear;
            }
          } catch (_) { }
        }
        if (effectiveYear !== null && typeof economicData.getInflationForYear === 'function') {
          var cpiYear = economicData.getInflationForYear(key, effectiveYear);
          if (cpiYear != null) {
            return Number(cpiYear) / 100;
          }
        }
        if (typeof economicData.getInflation === 'function') {
          var cpi = economicData.getInflation(key);
          if (cpi != null) {
            return Number(cpi) / 100;
          }
        }
      } catch (_) { }
    }

    // 4) TaxRuleSet inflationRate (already a decimal)
    if (cfg && typeof cfg.getCachedTaxRuleSet === 'function') {
      try {
        var rs = cfg.getCachedTaxRuleSet(key);
        if (rs && typeof rs.getInflationRate === 'function') {
          var rate = rs.getInflationRate();
          if (rate !== null && rate !== undefined) {
            return Number(rate);
          }
        }
      } catch (_) { }
    }

    // 5) Fallback to scenario scalar or default
    if (paramsObj && typeof paramsObj.inflation === 'number') {
      return paramsObj.inflation;
    }

    return defaultRate;
  };

  /**
   * Compute a cumulative inflation index between two calendar years:
   *   index = Π (1 + π_y)  for y in [fromYear, toYear-1]
   *
   * When fromYear or toYear are missing/invalid, returns 1.
   */
  InflationService.getCumulativeIndex = function (countryCode, fromYear, toYear, options) {
    var start = Number(fromYear);
    var end = Number(toYear);
    if (!isFinite(start) || !isFinite(end) || end <= start) {
      return 1;
    }
    var idx = 1;
    for (var y = start; y < end; y++) {
      var rate = InflationService.resolveInflationRate(countryCode, y, options);
      if (typeof rate !== 'number' || !isFinite(rate)) {
        rate = 0;
      }
      idx *= (1 + rate);
    }
    return idx;
  };

  /**
   * Convert a nominal rate into a real rate for a given country/year:
   *   real = (1 + nominal) / (1 + inflation) - 1
   *
   * Returns nominalRate when inflation cannot be resolved.
   */
  InflationService.getRealRate = function (nominalRate, countryCode, year, options) {
    if (typeof nominalRate !== 'number' || !isFinite(nominalRate)) {
      return nominalRate;
    }
    var pi = InflationService.resolveInflationRate(countryCode, year, options);
    if (typeof pi !== 'number' || !isFinite(pi)) {
      return nominalRate;
    }
    var base = 1 + pi;
    if (base <= 0) {
      return nominalRate;
    }
    return (1 + nominalRate) / base - 1;
  };

  // UMD-lite style exposure
  if (root) {
    root.InflationService = InflationService;
  }
})(typeof this !== 'undefined' ? this : (typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : null)));

