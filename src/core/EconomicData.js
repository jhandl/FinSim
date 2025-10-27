/*
 * EconomicData: sync API usable in Google Apps Script and browsers.
 * - Constructor performs a synchronous fetch and parses JSON from getFinData.py
 * - Expects an array of entries like:
 *   [ { country: "IE", curr: "EUR", cpi: 2.34, cpi_year: 2024, ppp: 0.80, ppp_year: 2024, fx: 1.0, fx_date: "2025-10-15" }, ... ]
 * - Internally indexes by ISO2 country for fast lookups.
 * - Public methods are synchronous and assume data is ready.
 * - Caller can check instance.ready (boolean) before using methods.
 * - All FX rates are expressed as local currency units per one EUR.
 */

class EconomicData {
    constructor(url) {
      this.data = {};
      this.ready = false;
      try {
        const text = this._fetchSync(url);
        const parsed = JSON.parse(text) || [];

        // Accept array from getFinData.py and index by country code.
        if (parsed && typeof parsed === 'object' && typeof parsed.length === 'number') {
          const map = {};
          for (var i = 0; i < parsed.length; i++) {
            var row = parsed[i] || {};
            var code = row.country;
            if (!code) continue;
            code = String(code).toUpperCase();
            map[code] = {
              country: code,
              currency: (row.curr != null ? row.curr : row.currency) || null,
              cpi: (row.cpi != null ? Number(row.cpi) : (row.infl != null ? Number(row.infl) : null)),
              cpi_year: (row.cpi_year != null ? row.cpi_year : row.infl_year) || null,
              ppp: row.ppp != null ? Number(row.ppp) : null,
              ppp_year: row.ppp_year != null ? row.ppp_year : null,
              fx: row.fx != null ? Number(row.fx) : null,
              fx_date: row.fx_date != null ? row.fx_date : null
            };
          }
          this.data = map;
        } else {
          // If already an object map (keyed by country), normalize keys to uppercase
          const src = parsed || {};
          const norm = {};
          for (var k in src) {
            if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
            norm[String(k).toUpperCase()] = src[k];
          }
          this.data = norm;
        }
        this.ready = this.data && typeof this.data === 'object' && Object.keys(this.data).length > 0;
      } catch (err) {
        console.log('Initialization failed: ' + (err && err.message ? err.message : err));
      }
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
      // fx is local units per 1 EUR.
      // Cross fx (1 unit of countryCode1 in countryCode2 units): fx2 / fx1
      return fx2 / fx1;
    }
  
    getPPP(countryCode1, countryCode2) {
      const k1 = this._key(countryCode1);
      const k2 = this._key(countryCode2);
      const ppp1 = this.data[k1] && this.data[k1].ppp;
      const ppp2 = this.data[k2] && this.data[k2].ppp;
      if (ppp1 == null || ppp2 == null) return null;
      // Return relative PPP cross-rate: units of countryCode2 per 1 unit of countryCode1
      // Given ppp values are local units per 1 international euro,
      // cross rate A->B at PPP is (ppp_B / ppp_A).
      return ppp2 / ppp1;
    }
  
    convert(value, fromCountry, toCountry, year, options) {
      var opts = options || {};
      var fxMode = opts.fxMode || 'ppp'; // 'constant' | 'ppp' | 'reversion'
      var baseYear = (opts.baseYear != null) ? opts.baseYear : this._currentYear();
      var reversionSpeed = (opts.reversionSpeed != null) ? opts.reversionSpeed : 0.33;
      var fallback = opts.fallback || 'nearest'; // 'nearest' | 'error'

      // Resolve CPI values with fallback to Config tax rules when absent
      var cpiFrom = this._getCPI(fromCountry);
      var cpiTo = this._getCPI(toCountry);
      if ((cpiFrom == null || cpiTo == null) && fallback === 'error') return null;

      // Growth factors from baseYear to target year
      var nYears = year - baseYear;

      // Base anchors
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

    _fetchSync(url) {
      // Google Apps Script environment
      if (typeof UrlFetchApp !== 'undefined' && UrlFetchApp && typeof UrlFetchApp.fetch === 'function') {
        const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        const code = resp.getResponseCode();
        if (code >= 200 && code < 300) return resp.getContentText();
        throw new Error('HTTP ' + code + ' from ' + url);
      }
  
      // Browser environment: use synchronous XHR (deprecated but functional for blocking init)
      if (typeof XMLHttpRequest !== 'undefined') {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, false); // synchronous
        try {
          xhr.send(null);
        } catch (e) {
          throw e;
        }
        if (xhr.status >= 200 && xhr.status < 300) return xhr.responseText;
        throw new Error('HTTP ' + xhr.status + ' from ' + url);
      }
  
      throw new Error('No synchronous HTTP mechanism available in this environment.');
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
  