/*
 * EconomicData: synchronous accessor for the CPI / FX / PPP metadata embedded
 * inside each country's tax ruleset. The class consumes the normalized
 * profiles returned by TaxRuleSet#getEconomicProfile(), keeping the legacy
 * public API that the simulator, relocation tools, and tests expect.
 *
 * Typical usage:
 *   const econ = new EconomicData();
 *   econ.refreshFromConfig(Config.getInstance());
 *   const cpi = econ.getInflation('ie'); // -> yearly CPI percentage
 */

class EconomicData {
  constructor(initialData) {
    this.data = {};
    this.ready = false;
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
    this.data[code] = {
      country: code,
      currency: entry.currency || null,
      cpi: entry.cpi != null ? Number(entry.cpi) : null,
      cpi_year: entry.cpi_year != null ? entry.cpi_year : null,
      ppp: entry.ppp != null ? Number(entry.ppp) : null,
      ppp_year: entry.ppp_year != null ? entry.ppp_year : null,
      fx: entry.fx != null ? Number(entry.fx) : null,
      fx_date: entry.fx_date != null ? entry.fx_date : null
    };
  }

  // ===== Public API (synchronous) =====

  getInflation(countryCode) {
    const entry = this.data[this._key(countryCode)];
    return entry && entry.cpi != null ? entry.cpi : null;
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

  convert(value, fromCountry, toCountry, year, options) {
    var opts = options || {};
    var fxMode = opts.fxMode || 'ppp'; // 'constant' | 'ppp' | 'reversion'
    var baseYear = (opts.baseYear != null) ? opts.baseYear : this._currentYear();
    var reversionSpeed = (opts.reversionSpeed != null) ? opts.reversionSpeed : 0.33;
    var fallback = opts.fallback || 'nearest'; // 'nearest' | 'error'

    var cpiFrom = this._getCPI(fromCountry);
    var cpiTo = this._getCPI(toCountry);
    if ((cpiFrom == null || cpiTo == null) && fallback === 'error') return null;

    var nYears = year - baseYear;
    var baseFx = this.getFX(fromCountry, toCountry);
    var basePPP = this.getPPP(fromCountry, toCountry);

    function selectAnchor(pppVal, fxVal) {
      if (pppVal != null) return pppVal;
      return fxVal != null ? fxVal : null;
    }

    var fxY = null;

    if (fxMode === 'constant') {
      fxY = baseFx;
    } else if (fxMode === 'ppp') {
      var anchor = selectAnchor(basePPP, baseFx);
      if (anchor == null) return null;
      var gFrom = (cpiFrom != null) ? this._growthFactor(cpiFrom, nYears) : null;
      var gTo = (cpiTo != null) ? this._growthFactor(cpiTo, nYears) : null;
      if (gFrom == null || gTo == null) return null;
      fxY = anchor * (gTo / gFrom);
    } else if (fxMode === 'reversion') {
      var anchorReversion = selectAnchor(basePPP, baseFx);
      if (anchorReversion == null) return null;
      if (nYears <= 0) {
        fxY = (baseFx != null) ? baseFx : anchorReversion;
      } else {
        var fxLevel = (baseFx != null) ? baseFx : anchorReversion;
        for (var t = 1; t <= nYears; t++) {
          var gFrom = (cpiFrom != null) ? this._growthFactor(cpiFrom, t) : null;
          var gTo = (cpiTo != null) ? this._growthFactor(cpiTo, t) : null;
          if (gFrom == null || gTo == null) return null;
          var pppTarget = anchorReversion * (gTo / gFrom);
          fxLevel = fxLevel + reversionSpeed * (pppTarget - fxLevel);
        }
        fxY = fxLevel;
      }
    } else {
      return null;
    }

    if (fxY == null) return null;
    return value * fxY;
  }

  // ===== Internals =====

  _currentYear() {
    return new Date().getFullYear();
  }

  _getCPI(countryCode) {
    var entry = this.data[this._key(countryCode)];
    if (entry && entry.cpi != null) return Number(entry.cpi);
    // Fallback to Config tax rules inflation if available
    var cfg = Config.getInstance();
    var rs = cfg.getCachedTaxRuleSet(String(countryCode).toLowerCase());
    if (!rs || typeof rs.getInflationRate !== 'function') return null;
    var v = rs.getInflationRate();
    if (v != null) return Number(v) * 100;
    return null;
  }

  _growthFactor(cpi, nYears) {
    return Math.pow(1 + Number(cpi) / 100, Number(nYears));
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
