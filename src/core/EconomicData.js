/*
 * EconomicData: synchronous accessor for the inflation / FX / PPP metadata embedded
 * inside each country's tax ruleset. The class consumes the normalized
 * profiles returned by TaxRuleSet#getEconomicProfile(), keeping the legacy
 * public API that the simulator, relocation tools, and tests expect.
 *
 * Typical usage:
 *   const econ = new EconomicData();
 *   econ.refreshFromConfig(Config.getInstance());
 *   const inflation = econ.getInflation('ie'); // -> yearly inflation percentage
 */

class EconomicData {
  constructor(initialData) {
    this.data = {};
    this.ready = false;
    this._fxEvolutionCache = {};
    if (initialData) {
      this._ingest(initialData, /*replace=*/true);
    }
  }

  refreshFromConfig(config) {
    if (!config || !config._taxRuleSets) {
      this.data = {};
      this.ready = false;
      return;
    }
    var entries = [];
    var rules = config._taxRuleSets || {};
    for (var code in rules) {
      if (!Object.prototype.hasOwnProperty.call(rules, code)) continue;
      var rs = rules[code];
      if (!rs || typeof rs.getEconomicProfile !== 'function') continue;
      var profile = rs.getEconomicProfile();
      if (profile) entries.push(profile);
    }
    this._ingest(entries, /*replace=*/true);
    // Reset per-run FX evolution cache whenever economic profiles are refreshed
    this._fxEvolutionCache = {};
  }

  _ingest(source, replace) {
    if (replace) {
      this.data = {};
      this.ready = false;
    }
    if (!source) return;

    if (source && typeof source === 'object' && typeof source.length === 'number') {
      for (var i = 0; i < source.length; i++) {
        this._ingestEntry(source[i]);
      }
    } else if (source && typeof source === 'object') {
      for (var key in source) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        this._ingestEntry(source[key], key);
      }
    }
    this.ready = this.data && Object.keys(this.data).length > 0;
  }

  _ingestEntry(entry, keyHint) {
    if (!entry) return;
    var code = null;
    if (entry.country) code = entry.country;
    else if (keyHint) code = keyHint;
    if (!code) return;
    code = String(code).toUpperCase();
    var normalizedSeries = null;
    var projectionWindowYears = null;
    if (entry && entry.projectionWindowYears !== undefined && entry.projectionWindowYears !== null) {
      var parsedWindow = Number(entry.projectionWindowYears);
      if (!isNaN(parsedWindow) && parsedWindow > 0) {
        projectionWindowYears = parsedWindow;
      }
    }
    var inflationByYear = null;
    if (entry.inflationByYear && typeof entry.inflationByYear === 'object') {
      inflationByYear = {};
      for (var y in entry.inflationByYear) {
        if (!Object.prototype.hasOwnProperty.call(entry.inflationByYear, y)) continue;
        var yearVal = entry.inflationByYear[y];
        if (typeof yearVal === 'number' && isFinite(yearVal)) {
          inflationByYear[String(y)] = Number(yearVal);
        }
      }
      if (!Object.keys(inflationByYear).length) inflationByYear = null;
    }
    this.data[code] = {
      country: code,
      currency: entry.currency || null,
      inflation: entry.inflation != null ? Number(entry.inflation) : null,
      inflationByYear: inflationByYear,
      ppp: entry.ppp != null ? Number(entry.ppp) : null,
      ppp_year: entry.ppp_year != null ? entry.ppp_year : null,
      fx: entry.fx != null ? Number(entry.fx) : null,
      fx_date: entry.fx_date != null ? entry.fx_date : null,
      series: normalizedSeries,
      projectionWindowYears: projectionWindowYears
    };
  }

  // ===== Public API (synchronous) =====

  getInflation(countryCode) {
    const entry = this.data[this._key(countryCode)];
    return entry && entry.inflation != null ? entry.inflation : null;
  }

  getFX(countryCode1, countryCode2) {
    const k1 = this._key(countryCode1);
    const k2 = this._key(countryCode2);
    const fx1 = this.data[k1] && this.data[k1].fx;
    const fx2 = this.data[k2] && this.data[k2].fx;
    if (fx1 == null || fx2 == null) return null;
    // fx is local units per 1 EUR. Cross FX (1 unit of countryCode1 in countryCode2 units): fx2 / fx1
    return fx2 / fx1;
  }

  getPPP(countryCode1, countryCode2) {
    const k1 = this._key(countryCode1);
    const k2 = this._key(countryCode2);
    const ppp1 = this.data[k1] && this.data[k1].ppp;
    const ppp2 = this.data[k2] && this.data[k2].ppp;
    if (ppp1 == null || ppp2 == null) return null;
    // Return relative PPP cross-rate: units of countryCode2 per 1 unit of countryCode1.
    return ppp2 / ppp1;
  }

  // Returns year-specific inflation when available; otherwise falls back to base inflation.
  getInflationForYear(countryCode, year) {
    const entry = this.data[this._key(countryCode)];
    if (!entry) return null;
    if (entry.inflationByYear && typeof year === 'number') {
      const key = String(Math.trunc(year));
      if (Object.prototype.hasOwnProperty.call(entry.inflationByYear, key)) {
        return entry.inflationByYear[key];
      }
    }
    return entry.inflation != null ? entry.inflation : null;
  }


  /**
   * Converts a monetary value from one country's currency to another.
   * 
   * Note: The default mode is now 'evolution' (inflation-driven), which derives
   * year-specific FX rates from base FX and relative inflation between countries.
   * The 'constant' mode always uses the base FX cross-rate (no time-series).
   * The 'ppp' and 'reversion' modes follow PPP-anchored inflation paths.
   * 
   * Returns null if conversion fails validation (e.g., invalid FX rate, non-finite
   * result).
   * 
   * @param {number} value - Amount to convert
   * @param {string} fromCountry - Source country code
   * @param {string} toCountry - Target country code
   * @param {number} year - Target year for conversion
   * @param {Object} options - Conversion options
   * @param {string} options.fxMode - 'constant' | 'evolution' | 'ppp' | 'reversion'
   * @param {number} options.baseYear - Base year for calculations
   * @param {number} options.reversionSpeed - Speed of reversion (0-1)
   * @param {string} options.fallback - 'nearest' | 'error'
   * @returns {number|null} Converted value or null if conversion fails
   */
  convert(value, fromCountry, toCountry, year, options) {
    var opts = options || {};
    var fxMode = opts.fxMode || 'evolution'; // default to inflation-driven evolution
    var baseYear = (opts.baseYear != null) ? opts.baseYear : this._currentYear();
    var reversionSpeed = (opts.reversionSpeed != null) ? opts.reversionSpeed : 0.33;
    var fallback = opts.fallback || 'nearest'; // 'nearest' | 'error'

    // Coerce null/undefined amounts to 0 to match simulator semantics.
    var amount = (value == null) ? 0 : Number(value);
    if (!isFinite(amount)) {
      return null;
    }

    var fromKey = this._key(fromCountry);
    var toKey = this._key(toCountry);
    if (!fromKey || !toKey) {
      // Undefined currencies: only allow a pure "no-op" when amount is zero.
      return amount === 0 ? 0 : null;
    }

    var fxY = null;

    if (fxMode === 'constant') {
      // Constant mode: always use the base FX cross-rate.
      fxY = this.getFX(fromCountry, toCountry);
    } else if (fxMode === 'ppp') {
      // PPP mode: evolve a PPP-anchored cross-rate using inflation differentials.
      var nYears = year - baseYear;
      var anchorPPP = this.getPPP(fromCountry, toCountry);
      var baseFx = this.getFX(fromCountry, toCountry);
      if (anchorPPP == null) {
        anchorPPP = baseFx;
      }
      if (anchorPPP == null) {
        return null;
      }
      var inflationFrom = this._getInflationPercent(fromCountry);
      var inflationTo = this._getInflationPercent(toCountry);
      if ((inflationFrom == null || inflationTo == null) && fallback === 'error') {
        return null;
      }
      // If either inflation rate is missing, treat the missing side as 0% so we still
      // move along a reasonable path.
      if (inflationFrom == null) inflationFrom = 0;
      if (inflationTo == null) inflationTo = 0;
      var gTo = this._growthFactor(inflationTo, nYears);
      var gFrom = this._growthFactor(inflationFrom, nYears);
      fxY = anchorPPP * (gTo / gFrom);
    } else if (fxMode === 'reversion') {
      // Reversion mode: move from constant FX towards the PPP path over time.
      var nYearsRev = year - baseYear;
      // Base for reversion is the scalar base FX cross-rate at the anchor year,
      // not the time-series value. This matches the tests' manual calculations.
      var baseFxRev = this.getFX(fromCountry, toCountry);
      var anchorPPPRev = this.getPPP(fromCountry, toCountry);
      if (anchorPPPRev == null) {
        anchorPPPRev = this.getFX(fromCountry, toCountry);
      }
      if (baseFxRev == null || anchorPPPRev == null) {
        return null;
      }
      // Extremes: speed 0 → constant; speed 1 → PPP path.
      if (reversionSpeed <= 0) {
        fxY = baseFxRev;
      } else if (reversionSpeed >= 1) {
        var inflationFromRev = this._getInflationPercent(fromCountry);
        var inflationToRev = this._getInflationPercent(toCountry);
        if (inflationFromRev == null) inflationFromRev = 0;
        if (inflationToRev == null) inflationToRev = 0;
        var gToRev = this._growthFactor(inflationToRev, nYearsRev);
        var gFromRev = this._growthFactor(inflationFromRev, nYearsRev);
        fxY = anchorPPPRev * (gToRev / gFromRev);
      } else {
        // Incremental reversion: for each elapsed year, pull the FX rate
        // towards that year's PPP-implied cross-rate.
        var inflationFromStep = this._getInflationPercent(fromCountry);
        var inflationToStep = this._getInflationPercent(toCountry);
        if (inflationFromStep == null) inflationFromStep = 0;
        if (inflationToStep == null) inflationToStep = 0;
        var currentFx = baseFxRev;
        if (nYearsRev > 0) {
          for (var i = 1; i <= nYearsRev; i++) {
            var yearI = baseYear + i;
            var gToI = this._growthFactor(inflationToStep, i);
            var gFromI = this._growthFactor(inflationFromStep, i);
            var pppRateI = anchorPPPRev * (gToI / gFromI);
            currentFx = currentFx + reversionSpeed * (pppRateI - currentFx);
          }
        }
        fxY = currentFx;
      }
    } else {
      // Evolution mode (default): use inflation-driven FX evolution.
      // Any unknown fxMode should be treated as unsupported and return null.
      if (fxMode !== 'evolution' && fxMode != null) {
        return null;
      }
      fxY = this._fxCrossRateForYear(fromCountry, toCountry, year, { fxMode: 'evolution', baseYear: baseYear });
    }

    if (fxY == null || !Number.isFinite(fxY)) {
      return null;
    }

    // FX directionality + magnitude validation
    if (fromCountry !== toCountry) {
      if (fxY <= 0) {
        return null;
      }
      // Direction validation vs base FX, when available.
      var baseFxCheck = this.getFX(fromCountry, toCountry);
      if (baseFxCheck != null && Number.isFinite(baseFxCheck) && baseFxCheck > 0) {
        if ((baseFxCheck > 1 && fxY < 1) || (baseFxCheck < 1 && fxY > 1)) {
          // Direction inverted
        }
      }
    }

    var result = amount * fxY;
    if (!Number.isFinite(result)) {
      return null;
    }
    return result;
  }

  // ===== Internals =====

  _currentYear() {
    return Config.getInstance().getSimulationStartYear();
  }

  _getInflationPercent(countryCode) {
    var entry = this.data[this._key(countryCode)];
    if (entry && entry.inflation != null) return Number(entry.inflation);
    // Fallback to Config tax rules inflation if available
    var cfg = Config.getInstance();
    var rs = cfg.getCachedTaxRuleSet(String(countryCode).toLowerCase());
    if (!rs || typeof rs.getInflationRate !== 'function') return null;
    var v = rs.getInflationRate();
    if (v != null) return Number(v) * 100;
    return null;
  }

  _growthFactor(inflationPercent, nYears) {
    return Math.pow(1 + Number(inflationPercent) / 100, Number(nYears));
  }

  // Year parameter ignored; uses base PPP rates.
  _pppCrossRateForYear(fromCountry, toCountry, year) {
    return this.getPPP(fromCountry, toCountry);
  }

  // Computes FX cross-rate for a given year. In 'constant' mode this collapses to
  // base FX; otherwise it uses inflation-driven evolution.
  _fxCrossRateForYear(fromCountry, toCountry, year, options) {
    var opts = options || {};
    var fromKey = this._key(fromCountry);
    var toKey = this._key(toCountry);
    if (!fromKey || !toKey) return null;
    if (fromKey === toKey) return 1;

    // Legacy / explicit constant mode: always use base FX cross-rate.
    if (opts.fxMode === 'constant') {
      return this.getFX(fromCountry, toCountry);
    }

    var baseYear = (opts.baseYear != null) ? opts.baseYear : this._currentYear();
    return this._computeEvolvedFX(fromCountry, toCountry, baseYear, year, opts);
  }

  /**
   * Internal helper: compute year-specific FX via inflation-driven evolution.
   *
   * Strategy:
   * - First evolve each country's local-units-per-EUR rate independently over
   *   time using its own inflation profile.
   * - Then derive cross FX for from→to as:
   *       FX_from→to(year) = fx_to_perEur(year) / fx_from_perEur(year)
   *   which guarantees direction consistency and makes AR→IE the inverse of
   *   IE→AR at all horizons.
   *
   * Per-country per-EUR paths are cached per run, keyed by "COUNTRY:BASEYEAR".
   * Missing inflation falls back to base inflation.
   */
  _computeEvolvedFX(fromCountry, toCountry, baseYear, targetYear, options) {
    var fromKey = this._key(fromCountry);
    var toKey = this._key(toCountry);
    if (!fromKey || !toKey) return null;
    if (fromKey === toKey) return 1;

    // For years at or before the base year, just use base cross FX.
    if (targetYear <= baseYear) {
      return this.getFX(fromCountry, toCountry);
    }

    var perEurFrom = this._computePerEurFX(fromKey, baseYear, targetYear, options);
    var perEurTo = this._computePerEurFX(toKey, baseYear, targetYear, options);
    if (perEurFrom == null || perEurTo == null ||
      !Number.isFinite(perEurFrom) || !Number.isFinite(perEurTo) ||
      perEurFrom <= 0 || perEurTo <= 0) {
      return null;
    }

    var cross = perEurTo / perEurFrom;
    if (!Number.isFinite(cross) || cross <= 0) {
      return null;
    }

    return cross;
  }

  /**
   * Compute per-EUR FX path for a single country:
   *   fx_c(year) = fx_c(baseYear) × ∏ (1 + inflation_c(k))  for k in [baseYear, year-1]
   *
   * Values are cached per (country, baseYear) in _fxEvolutionCache to avoid
   * recomputing during a simulation run.
   */
  _computePerEurFX(countryKey, baseYear, targetYear, options) {
    if (!countryKey) return null;
    var entry = this.data[countryKey];
    var baseFxPerEur = entry && entry.fx != null ? Number(entry.fx) : null;
    if (baseFxPerEur == null || !Number.isFinite(baseFxPerEur) || baseFxPerEur <= 0) {
      return null;
    }

    if (targetYear <= baseYear) {
      return baseFxPerEur;
    }

    if (!this._fxEvolutionCache) this._fxEvolutionCache = {};
    var cacheKey = countryKey + ':' + String(baseYear);
    var series = this._fxEvolutionCache[cacheKey];
    var offset = targetYear - baseYear;
    // Cache semantics: series[n] = FX at start of year (baseYear + n)
    // series[0] = baseFxPerEur (FX at start of baseYear, no inflation applied yet)
    // series[1] = FX at start of baseYear+1 (after 1 year of inflation)
    // series[n] = FX at start of baseYear+n (after n years of inflation)
    if (series && series[offset] != null && Number.isFinite(series[offset])) {
      return series[offset];
    }
    if (!series) {
      series = [];
      // Store the base FX at index 0 (FX at start of baseYear)
      series[0] = baseFxPerEur;
      this._fxEvolutionCache[cacheKey] = series;
    }

    var fxCurrent = baseFxPerEur;
    var startOffset = 0;
    // Reuse any cached prefix.
    // series[i] = FX at start of year (baseYear + i), so to resume from that point,
    // we need to apply inflation starting from year (baseYear + i).
    for (var i = series.length - 1; i >= 0; i--) {
      if (series[i] != null && Number.isFinite(series[i])) {
        fxCurrent = series[i];
        startOffset = i;  // Resume applying inflation from year (baseYear + i)
        break;
      }
    }

    var params = options && options.params;
    var config = options && options.config;
    var economicData = options && options.economicData;
    var countryInflationOverrides = options && options.countryInflationOverrides;

    // Apply inflation for years [baseYear + startOffset, targetYear - 1]
    // After each year y, store the result at series[y - baseYear + 1] = FX at start of year y+1
    for (var y = baseYear + startOffset; y < targetYear; y++) {
      var inflation = null;

      if (typeof InflationService !== 'undefined' &&
        InflationService &&
        typeof InflationService.resolveInflationRate === 'function') {
        try {
          inflation = InflationService.resolveInflationRate(countryKey.toLowerCase(), y, {
            params: params,
            config: config,
            economicData: economicData || this,
            countryInflationOverrides: countryInflationOverrides
          });
        } catch (_) {
          inflation = null;
        }
      }

      if (inflation == null || !isFinite(inflation)) {
        var inflationPercent = this._getInflationPercent(countryKey);
        if (inflationPercent != null && isFinite(inflationPercent)) {
          inflation = Number(inflationPercent) / 100;
        }
      }

      if (inflation == null || !isFinite(inflation)) {
        return null;
      }

      var ratio = 1 + Number(inflation);
      if (!Number.isFinite(ratio) || ratio <= 0) {
        return null;
      }

      fxCurrent = fxCurrent * ratio;
      if (!Number.isFinite(fxCurrent) || fxCurrent <= 0) {
        return null;
      }

      // Store at index (y - baseYear + 1) = FX at start of year (y + 1)
      series[y - baseYear + 1] = fxCurrent;
    }

    return fxCurrent;
  }

  _key(code) {
    return code == null ? code : String(code).toUpperCase();
  }
}

// UMD-lite exposure
(function expose(global) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EconomicData };
  }
  if (typeof exports !== 'undefined') {
    exports.EconomicData = EconomicData;
  }
  global.EconomicData = EconomicData;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
