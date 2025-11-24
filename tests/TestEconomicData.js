// Custom test for EconomicData convert() across modes and CPI fallback

module.exports = {
  name: 'EconomicData',
  description: 'Validates EconomicData.convert for constant/ppp/reversion and CPI fallback to Config',
  isCustomTest: true,
  runCustomTest: async function() {
    // Load module under test
    const { EconomicData } = require('../src/core/EconomicData.js');
    const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');

    // Shim minimal Config used by _getCPI fallback and EconomicData refresh
    global.Config = (function() {
      function C() {
        this._taxRuleSets = {};
      }
      C.prototype.getCachedTaxRuleSet = function(country) {
        var code = (country || '').toString().toLowerCase();
        return (this._taxRuleSets && this._taxRuleSets[code]) ? this._taxRuleSets[code] : null;
      };
      C.prototype.getDefaultCountry = function() { return 'ie'; };
      var inst = new C();
      return { getInstance: function(){ return inst; } };
    })();

    const testResults = { success: true, errors: [] };

    try {
      // Prepare in-memory tax rulesets with embedded economicData blocks
      const makeRuleset = (raw) => new TaxRuleSet(raw);
      const ieRules = makeRuleset({
        country: 'IE',
        countryName: 'Ireland',
        locale: { currencyCode: 'EUR' },
        economicData: {
          inflation: { cpi: 2.0, year: 2025 },
          purchasingPowerParity: { value: 0.80, year: 2025 },
          exchangeRate: { perEur: 1.0, asOf: '2025-10-15' },
          timeSeries: {
            fx: { series: { '2023': 1.0, '2030': 1.0 } }
          }
        },
        incomeTax: { brackets: { '0': 0.2 } }
      });
      const arRules = makeRuleset({
        country: 'AR',
        countryName: 'Argentina',
        locale: { currencyCode: 'ARS' },
        economicData: {
          inflation: { cpi: 50.0, year: 2025 },
          purchasingPowerParity: { value: 1200.0, year: 2025 },
          exchangeRate: { perEur: 1500.0, asOf: '2025-10-15' },
          timeSeries: {
            fx: { series: { '2023': 1200.0, '2030': 2000.0 } }
          }
        },
        incomeTax: { brackets: { '0': 0.05 } }
      });

      // Provide these rulesets through the Config shim
      const cfg = Config.getInstance();
      cfg._taxRuleSets = {
        'ie': ieRules,
        'ar': arRules
      };

      const econ = new EconomicData();
      econ.refreshFromConfig(cfg);
      if (!econ.ready) {
        testResults.success = false; testResults.errors.push('EconomicData not ready');
        return testResults;
      }

      // Baselines
      const fxIEtoAR_base = econ.getFX('IE', 'AR'); // 1500 / 1 = 1500 ARS per EUR; cross IE->AR = 1500
      if (fxIEtoAR_base !== 1500) {
        testResults.success = false; testResults.errors.push('Base FX IE->AR mismatch');
      }

      // 1) constant mode uses base FX cross-rate (no time-series)
      {
        const amount = 100; // 100 IE units
        const out = econ.convert(amount, 'IE', 'AR', 2028, { fxMode: 'constant', baseYear: 2025 });
        const exp = amount * 1500;
        if (Math.abs(out - exp) > 1e-6) {
          testResults.success = false; testResults.errors.push('constant mode base FX incorrect for 2028');
        }
      }

      // 1b) constant mode uses the same base FX for 2030
      {
        const amount = 100;
        const out = econ.convert(amount, 'IE', 'AR', 2030, { fxMode: 'constant', baseYear: 2025 });
        const exp = amount * 1500;
        if (Math.abs(out - exp) > 1e-6) {
          testResults.success = false; testResults.errors.push('constant mode year-specific FX incorrect');
        }
      }

      // 1c) constant mode behaviour prior to any future data point (2027 uses base FX 1500)
      {
        const amount = 50;
        const out = econ.convert(amount, 'IE', 'AR', 2027, { fxMode: 'constant', baseYear: 2025 });
        const exp = amount * 1500;
        if (Math.abs(out - exp) > 1e-6) {
          testResults.success = false; testResults.errors.push('constant mode step behaviour (pre-2030) incorrect');
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

      // 5) Ledger vs analytics comparison: constant vs PPP diverge in future year (2030)
      {
        const amount = 100;
        const outConst = econ.convert(amount, 'IE', 'AR', 2030, { fxMode: 'constant', baseYear: 2025 });
        const gTo = Math.pow(1 + 0.50, 5);
        const gFrom = Math.pow(1 + 0.02, 5);
        const anchor = 1500.0; // relative PPP at base
        const pppRate = anchor * (gTo / gFrom);
        const outPPP = econ.convert(amount, 'IE', 'AR', 2030, { fxMode: 'ppp', baseYear: 2025 });
        if (Math.abs(outConst - (amount * 1500)) > 1e-6) {
          testResults.success = false; testResults.errors.push('ledger constant mode expected 1500 cross-rate in 2030');
        }
        if (Math.abs(outPPP - (amount * pppRate)) / (amount * pppRate) > 1e-10) {
          testResults.success = false; testResults.errors.push('PPP mode expected divergence not observed');
        }
        if (Math.abs(outConst - outPPP) < 1e-6) {
          testResults.success = false; testResults.errors.push('Constant and PPP should differ for 2030');
        }
      }

      // 6) Multi-year consistency across constant values
      {
        const out2023 = econ.convert(1, 'IE', 'AR', 2023, { fxMode: 'constant', baseYear: 2025 });
        const out2030 = econ.convert(1, 'IE', 'AR', 2030, { fxMode: 'constant', baseYear: 2025 });
        if (Math.abs(out2023 - 1500) > 1e-9) {
          testResults.success = false; testResults.errors.push('Year-specific FX (2023) incorrect');
        }
        if (Math.abs(out2030 - 1500) > 1e-9) {
          testResults.success = false; testResults.errors.push('Year-specific FX (2030) incorrect');
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
