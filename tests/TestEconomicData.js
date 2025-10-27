// Custom test for EconomicData convert() across modes and CPI fallback

module.exports = {
  name: 'EconomicData',
  description: 'Validates EconomicData.convert for constant/ppp/reversion and CPI fallback to Config',
  isCustomTest: true,
  runCustomTest: async function() {
    const path = require('path');
    const fs = require('fs');

    // Load module under test
    const { EconomicData } = require('../src/core/EconomicData.js');
    const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');

    // Shim minimal Config used by _getCPI fallback
    global.Config = (function() {
      function C() {}
      C.prototype.getCachedTaxRuleSet = function(country) {
        // Provide simple defaults: IE 2% CPI, AR 50% CPI
        const rules = (country === 'IE')
          ? { inflationRate: 0.02 }
          : (country === 'AR') ? { inflationRate: 0.5 } : { inflationRate: 0.03 };
        return new TaxRuleSet({ inflationRate: rules.inflationRate, country: country });
      };
      var inst = new C();
      return { getInstance: function(){ return inst; } };
    })();

    const testResults = { success: true, errors: [] };

    try {
      // Prepare inline economic data JSON (EUR anchor semantics via fx per 1 EUR)
      const tmpFile = path.join(__dirname, 'tmp-economic.json');
      const payload = [
        { country: 'IE', curr: 'EUR', cpi: 2.0, cpi_year: 2025, ppp: 0.80, ppp_year: 2025, fx: 1.0, fx_date: '2025-10-15' },
        { country: 'AR', curr: 'ARS', cpi: 50.0, cpi_year: 2025, ppp: 1200.0, ppp_year: 2025, fx: 1500.0, fx_date: '2025-10-15' }
      ];
      fs.writeFileSync(tmpFile, JSON.stringify(payload), 'utf8');

      // Polyfill synchronous XMLHttpRequest for Node to let EconomicData load from filesystem
      global.XMLHttpRequest = function() {
        this.status = 0;
        this.responseText = '';
        this._url = null;
        this.open = function(method, url, sync) { this._url = url; };
        this.send = function() {
          try {
            this.responseText = fs.readFileSync(this._url, 'utf8');
            this.status = 200;
          } catch (e) {
            this.status = 404;
            this.responseText = '';
          }
        };
      };

      const econ = new EconomicData(tmpFile);
      if (!econ.ready) {
        testResults.success = false; testResults.errors.push('EconomicData not ready');
        return testResults;
      }

      // Baselines
      const fxIEtoAR_base = econ.getFX('IE', 'AR'); // 1500 / 1 = 1500 ARS per EUR; cross IE->AR = 1500
      if (fxIEtoAR_base !== 1500) {
        testResults.success = false; testResults.errors.push('Base FX IE->AR mismatch');
      }

      // 1) constant mode (should equal base FX)
      {
        const amount = 100; // 100 IE units
        const out = econ.convert(amount, 'IE', 'AR', 2030, { fxMode: 'constant', baseYear: 2025 });
        const exp = amount * 1500;
        if (Math.abs(out - exp) > 1e-6) {
          testResults.success = false; testResults.errors.push('constant mode conversion incorrect');
        }
      }

      // 2) ppp mode with PPP anchor
      // Anchor = relative PPP = ppp_to / ppp_from = 1200 / 0.8 = 1500
      // Growth factors from 2025->2030: gTo=(1+0.5)^5, gFrom=(1+0.02)^5
      {
        const gTo = Math.pow(1 + 0.50, 5);
        const gFrom = Math.pow(1 + 0.02, 5);
        const anchor = 1500.0;
        const expectedRate = anchor * (gTo / gFrom);
        const amount = 1;
        const out = econ.convert(amount, 'IE', 'AR', 2030, { fxMode: 'ppp', baseYear: 2025 });
        if (Math.abs(out - expectedRate) / expectedRate > 1e-10) {
          testResults.success = false; testResults.errors.push('ppp mode with PPP anchor incorrect');
        }
      }

      // 3) reversion mode should move from baseFx (1500) toward PPP path
      {
        const amount = 1;
        const out = econ.convert(amount, 'IE', 'AR', 2027, { fxMode: 'reversion', baseYear: 2025, reversionSpeed: 0.5 });
        // Compute expected manually for two steps
        const anchor = 1500.0; // PPP anchor (relative PPP)
        const gTo1 = Math.pow(1+0.50, 1), gFrom1 = Math.pow(1+0.02, 1);
        const ppp1 = anchor * (gTo1 / gFrom1);
        const step1 = 1500 + 0.5 * (ppp1 - 1500);
        const gTo2 = Math.pow(1+0.50, 2), gFrom2 = Math.pow(1+0.02, 2);
        const ppp2 = anchor * (gTo2 / gFrom2);
        const step2 = step1 + 0.5 * (ppp2 - step1);
        const expected = step2;
        if (Math.abs(out - expected) / expected > 1e-10) {
          testResults.success = false; testResults.errors.push('reversion mode incorrect');
        }
      }

      // 4) CPI fallback path: remove IE CPI to force fallback to Config (0.02)
      {
        econ.data['IE'].cpi = null;
        const out = econ.convert(1, 'IE', 'AR', 2026, { fxMode: 'ppp', baseYear: 2025 });
        // Use cpiFrom=0.02 via Config, cpiTo=0.50 from data, n=1; PPP anchor = 1500
        const expected = (1500) * ((1+0.50)/(1+0.02));
        if (Math.abs(out - expected) / expected > 1e-10) {
          testResults.success = false; testResults.errors.push('CPI fallback to Config failed');
        }
      }

      return testResults;
    } catch (e) {
      return { success: false, errors: [e.message] };
    }
  }
};


