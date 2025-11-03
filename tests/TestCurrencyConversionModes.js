module.exports = {
  name: 'CurrencyConversionModes',
  description: 'Validates EconomicData.convert across constant, PPP, reversion, and edge cases.',
  isCustomTest: true,
  async runCustomTest() {
    const { EconomicData } = require('../src/core/EconomicData.js');
    const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');

    const errors = [];

    function withinTolerance(actual, expected, relTol, absTol) {
      const diff = Math.abs(actual - expected);
      if (diff <= absTol) return true;
      const denom = Math.abs(expected) > 1e-12 ? Math.abs(expected) : 1;
      return (diff / denom) <= relTol;
    }

    // Minimal Config shim for CPI fallback and relocation gating.
    global.Config = (function() {
      function C() {
        this._taxRuleSets = {};
        this._defaultCountry = 'mm';
      }
      C.prototype.getCachedTaxRuleSet = function(country) {
        const code = (country || '').toString().toLowerCase();
        return this._taxRuleSets[code] || null;
      };
      C.prototype.getDefaultCountry = function() { return this._defaultCountry; };
      C.prototype.setDefaultCountry = function(code) { this._defaultCountry = (code || 'mm').toLowerCase(); };
      C.prototype.registerRule = function(code, ruleset) {
        this._taxRuleSets[code.toLowerCase()] = ruleset;
      };
      const inst = new C();
      return { getInstance: () => inst };
    })();

    try {
      const makeRules = raw => new TaxRuleSet(raw);

      const mmRules = makeRules({
        country: 'MM',
        countryName: 'Country M',
        locale: { currencyCode: 'MMM', numberFormat: { decimal: '.', thousand: ',' } },
        economicData: {
          inflation: { cpi: 3.0, year: 2025 },
          purchasingPowerParity: { value: 1.0, year: 2025 },
          exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
        },
        incomeTax: { brackets: { '0': 0.15 } }
      });

      const nnRules = makeRules({
        country: 'NN',
        countryName: 'Country N',
        locale: { currencyCode: 'NNN', numberFormat: { decimal: ',', thousand: '.' } },
        economicData: {
          inflation: { cpi: 10.0, year: 2025 },
          purchasingPowerParity: { value: 2.5, year: 2025 },
          exchangeRate: { perEur: 3.0, asOf: '2025-01-01' }
        },
        incomeTax: { brackets: { '0': 0.2 } }
      });

      const ooRules = makeRules({
        country: 'OO',
        countryName: 'Country O',
        locale: { currencyCode: 'OOO' },
        economicData: {
          inflation: { cpi: 1.5, year: 2025 },
          purchasingPowerParity: { value: 0.9, year: 2025 },
          exchangeRate: { perEur: 0.85, asOf: '2025-01-01' }
        },
        incomeTax: { brackets: { '0': 0.18 } }
      });

      const cfg = Config.getInstance();
      cfg.registerRule('mm', mmRules);
      cfg.registerRule('nn', nnRules);
      cfg.registerRule('oo', ooRules);
      cfg.setDefaultCountry('mm');

      const mmProfile = mmRules.getEconomicProfile();
      const nnProfile = nnRules.getEconomicProfile();

      const econ = new EconomicData();
      econ.refreshFromConfig(Config.getInstance());

      if (!econ.ready) {
        errors.push('EconomicData should be ready after refresh');
        return { success: false, errors };
      }

      // Test Case 1: constant mode baseline.
      {
        const amount = 100;
        const converted = econ.convert(amount, 'MM', 'NN', 2030, { fxMode: 'constant', baseYear: 2025 });
        const expected = amount * (nnProfile.fx / mmProfile.fx);
        if (!withinTolerance(converted, expected, 1e-12, 1e-9)) {
          errors.push(`Constant mode mismatch: expected ${expected}, got ${converted}`);
        }
      }

      // Test Case 2: PPP mode with inflation adjustment.
      {
        const years = 5;
        const gTo = Math.pow(1 + 0.10, years);
        const gFrom = Math.pow(1 + 0.03, years);
        const anchor = 2.5 / 1.0;
        const expectedRate = anchor * (gTo / gFrom);
        const converted = econ.convert(100, 'MM', 'NN', 2025 + years, { fxMode: 'ppp', baseYear: 2025 });
        const expected = 100 * expectedRate;
        if (!withinTolerance(converted, expected, 1e-9, 1e-6)) {
          errors.push(`PPP mode mismatch: expected ${expected}, got ${converted}`);
        }
      }

      // Test Case 3: Reversion mode towards PPP path.
      {
        const amount = 200;
        const options = { fxMode: 'reversion', baseYear: 2025, reversionSpeed: 0.5 };
        const anchor = 2.5 / 1.0;
        const pppY1 = anchor * ((1 + 0.10) / (1 + 0.03));
        const step1 = 3.0 + 0.5 * (pppY1 - 3.0);
        const pppY2 = anchor * (Math.pow(1 + 0.10, 2) / Math.pow(1 + 0.03, 2));
        const step2 = step1 + 0.5 * (pppY2 - step1);
        const expectedRate = step2;
        const converted = econ.convert(amount, 'MM', 'NN', 2027, options);
        const expected = amount * expectedRate;
        if (!withinTolerance(converted, expected, 1e-9, 1e-6)) {
          errors.push(`Reversion mode mismatch: expected ${expected}, got ${converted}`);
        }
      }

      // Test Case 4: Same currency conversion is identity.
      {
        const converted = econ.convert(12345.67, 'MM', 'MM', 2030, { fxMode: 'ppp', baseYear: 2025 });
        if (converted !== 12345.67) {
          errors.push('Same currency conversion should return the original amount');
        }
      }

      // Test Case 5: Zero amount remains zero.
      {
        const converted = econ.convert(0, 'MM', 'NN', 2030, { fxMode: 'ppp', baseYear: 2025 });
        if (converted !== 0) {
          errors.push('Zero amount should convert to zero');
        }
      }

      // Test Case 6: Negative amount retains sign.
      {
        const converted = econ.convert(-500, 'NN', 'MM', 2030, { fxMode: 'constant', baseYear: 2025 });
        if (converted >= 0) {
          errors.push('Negative amount should remain negative after conversion');
        }
      }

      // Test Case 7: Large amount avoids overflow.
      {
        const converted = econ.convert(1e9, 'MM', 'NN', 2040, { fxMode: 'ppp', baseYear: 2025 });
        if (!Number.isFinite(converted)) {
          errors.push('Large amount conversion should remain finite');
        }
      }

      // Test Case 8: CPI fallback to Config when source CPI missing.
      {
        econ.data.MM.cpi = null;
        const expected = (2.5 / 1.0) * ((1 + 0.10) / (1 + 0.03));
        const converted = econ.convert(1, 'MM', 'NN', 2026, { fxMode: 'ppp', baseYear: 2025 });
        if (!withinTolerance(converted, expected, 1e-9, 1e-6)) {
          errors.push('CPI fallback to Config failed when source CPI missing');
        }
        econ.data.MM.cpi = 3.0;
        econ.data.MM.cpi_year = 2025;
      }

      // Test Case 9: Missing economic data returns null.
      {
        const converted = econ.convert(100, 'ZZ', 'NN', 2030, { fxMode: 'constant', baseYear: 2025 });
        if (converted !== null) {
          errors.push('Conversion with unknown origin country should return null');
        }
      }

      // Test Case 10: Invalid fxMode falls back to constant behaviour.
      {
        const converted = econ.convert(100, 'MM', 'NN', 2030, { fxMode: 'invalid', baseYear: 2025 });
        if (converted !== null) {
          errors.push('Invalid fxMode should return null to signal unsupported option');
        }
      }

      // Test Case 11: Future year extrapolation uses inflation sequences.
      {
        const years = 20;
        const gTo = Math.pow(1 + 0.10, years);
        const gFrom = Math.pow(1 + 0.03, years);
        const anchor = 2.5 / 1.0;
        const expected = anchor * (gTo / gFrom);
        const converted = econ.convert(1, 'MM', 'NN', 2045, { fxMode: 'ppp', baseYear: 2025 });
        if (!withinTolerance(converted, expected, 1e-8, 1e-5)) {
          errors.push('Future year PPP extrapolation mismatch');
        }
      }

      // Test Case 12: Past year extrapolation works symmetrically.
      {
        const gTo = Math.pow(1 + 0.10, -2);
        const gFrom = Math.pow(1 + 0.03, -2);
        const anchor = 2.5 / 1.0;
        const expected = anchor * (gTo / gFrom);
        const converted = econ.convert(1, 'MM', 'NN', 2023, { fxMode: 'ppp', baseYear: 2025 });
        if (!withinTolerance(converted, expected, 1e-8, 1e-5)) {
          errors.push('Past year PPP extrapolation mismatch');
        }
      }

      // Negative test: null amount returns null.
      {
        const converted = econ.convert(null, 'MM', 'NN', 2030, { fxMode: 'constant', baseYear: 2025 });
        if (converted !== 0) {
          errors.push('Null amount should coerce to zero, matching simulator semantics');
        }
      }

      // Negative test: undefined currencies.
      {
        const converted = econ.convert(100, null, null, 2030, { fxMode: 'constant', baseYear: 2025 });
        if (converted !== null) {
          errors.push('Undefined currencies should return null');
        }
      }

      // Edge case: baseYear equals target year (no inflation adjustment).
      {
        const options = { fxMode: 'ppp', baseYear: 2028 };
        const econClone = new EconomicData();
        econClone.data = JSON.parse(JSON.stringify(econ.data));
        const converted = econClone.convert(50, 'MM', 'NN', 2028, options);
        const expected = 50 * (2.5 / 1.0);
        if (!withinTolerance(converted, expected, 1e-10, 1e-7)) {
          errors.push('When baseYear equals target year, PPP should equal anchor ratio');
        }
      }

      // Edge case: reversionSpeed extremes.
      {
        const zeroSpeed = econ.convert(100, 'MM', 'NN', 2027, { fxMode: 'reversion', baseYear: 2025, reversionSpeed: 0 });
        const constantMode = econ.convert(100, 'MM', 'NN', 2027, { fxMode: 'constant', baseYear: 2025 });
        if (!withinTolerance(zeroSpeed, constantMode, 1e-12, 1e-9)) {
          errors.push('Reversion speed 0 should behave like constant mode');
        }

        const fullSpeed = econ.convert(100, 'MM', 'NN', 2027, { fxMode: 'reversion', baseYear: 2025, reversionSpeed: 1 });
        const pppMode = econ.convert(100, 'MM', 'NN', 2027, { fxMode: 'ppp', baseYear: 2025 });
        if (!withinTolerance(fullSpeed, pppMode, 1e-9, 1e-6)) {
          errors.push('Reversion speed 1 should behave like PPP');
        }
      }

    } catch (err) {
      errors.push(err.message || String(err));
    }

    return { success: errors.length === 0, errors };
  }
};
