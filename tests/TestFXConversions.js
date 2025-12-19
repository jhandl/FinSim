const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');

const BASE_YEAR = 2025;

function withinTolerance(actual, expected, relTol, absTol) {
  if (expected === 0) {
    return Math.abs(actual) <= absTol;
  }
  const diff = Math.abs(actual - expected);
  if (diff <= absTol) return true;
  const denom = Math.max(Math.abs(expected), 1e-9);
  return (diff / denom) <= relTol;
}

function percentDelta(a, b) {
  if (a === 0 && b === 0) return 0;
  const denom = Math.max(Math.abs(b), 1);
  return Math.abs(a - b) / denom;
}

function createConfigShim() {
  function ConfigShim() {
    this._taxRuleSets = {};
    this._defaultCountry = 'ie';
  }
  ConfigShim.prototype.getCachedTaxRuleSet = function(country) {
    const code = (country || '').toString().toLowerCase();
    return this._taxRuleSets[code] || null;
  };
  ConfigShim.prototype.getDefaultCountry = function() {
    return this._defaultCountry;
  };
  ConfigShim.prototype.setDefaultCountry = function(code) {
    this._defaultCountry = (code || 'ie').toLowerCase();
  };
  ConfigShim.prototype.registerRule = function(code, rule) {
    const normalized = (code || '').toString().toLowerCase();
    this._taxRuleSets[normalized] = rule;
  };
  return {
    getInstance: (function() {
      let instance = null;
      return function() {
        if (!instance) {
          instance = new ConfigShim();
        }
        return instance;
      };
    })()
  };
}

function makeRuleSet(def) {
  return new TaxRuleSet({
    version: 'fx-invariants',
    country: def.country,
    countryName: def.countryName,
    locale: { currencyCode: def.currency, numberFormat: { decimal: '.', thousand: ',' } },
    economicData: {
      inflation: { cpi: def.cpi, year: BASE_YEAR },
      purchasingPowerParity: { value: def.ppp, year: BASE_YEAR },
      exchangeRate: { perEur: def.fx, asOf: BASE_YEAR + '-01-01' },
      timeSeries: def.timeSeries
    },
    incomeTax: { brackets: { '0': 0.2 } }
  });
}

function assertFiniteValue(value, label, limit, errors) {
  if (!Number.isFinite(value)) {
    errors.push(`${label} must be finite, got ${value}`);
    return;
  }
  if (Math.abs(value) > limit) {
    errors.push(`${label} exceeds limit ${limit}: ${value}`);
  }
}

module.exports = {
  name: 'FXConversions',
  description: 'Invariant regression suite for EconomicData.convert directionality, ranges, and round-trips.',
  isCustomTest: true,
  async runCustomTest() {
    // NOTE: These tests now validate both legacy 'constant' FX mode and the
    // default inflation-driven 'evolution' mode exposed by EconomicData.convert().
    const errors = [];
    const originalConfig = global.Config;

    try {
      global.Config = createConfigShim();
      const cfg = global.Config.getInstance();

      const ieRules = makeRuleSet({
        country: 'IE',
        countryName: 'Ireland',
        currency: 'EUR',
        cpi: 3.0,
        ppp: 1.0,
        fx: 1.0,
        timeSeries: {
          fx: { series: { '2025': 1.0, '2030': 1.02, '2035': 1.05 } },
          inflation: { series: { '2025': 3.0, '2035': 2.8 } },
          ppp: { series: { '2025': 1.0, '2030': 1.02 } }
        }
      });

      const arRules = makeRuleSet({
        country: 'AR',
        countryName: 'Argentina',
        currency: 'ARS',
        cpi: 42.0,
        ppp: 1100,
        fx: 1500,
        timeSeries: {
          fx: { series: { '2025': 1500, '2030': 2200, '2035': 3000 } },
          inflation: { series: { '2025': 42.0, '2035': 35.0 } },
          ppp: { series: { '2025': 1100, '2032': 1500, '2035': 1800 } }
        }
      });

      cfg.registerRule('ie', ieRules);
      cfg.registerRule('ar', arRules);
      cfg.setDefaultCountry('ie');

      const econ = new EconomicData();
      econ.refreshFromConfig(cfg);

      if (!econ.ready) {
        return { success: false, errors: ['EconomicData failed to ingest tax rule profiles'] };
      }

      const constantOptions = { fxMode: 'constant', baseYear: BASE_YEAR };
      const pppOptions = { fxMode: 'ppp', baseYear: BASE_YEAR };
      const reversionOptions = { fxMode: 'reversion', baseYear: BASE_YEAR, reversionSpeed: 0.45 };
      const evolutionOptions = { fxMode: 'evolution', baseYear: BASE_YEAR };

      // 1. Directional sanity: IE (strong) -> AR (weak) should amplify amounts; reverse should shrink.
      {
        const sample = 100;
        const toAR = econ.convert(sample, 'IE', 'AR', BASE_YEAR, constantOptions);
        const expectedRate = arRules.getEconomicProfile().fx / ieRules.getEconomicProfile().fx;
        if (!withinTolerance(toAR, sample * expectedRate, 1e-9, 1e-6)) {
          errors.push(`Constant IE->AR mismatch: expected ${sample * expectedRate}, got ${toAR}`);
        }
        if (!(Number.isFinite(toAR) && toAR > sample)) {
          errors.push('CRITICAL: Backwards FX - IE->AR did not increase value');
        }

        const inverse = econ.convert(sample * expectedRate, 'AR', 'IE', BASE_YEAR, constantOptions);
        if (!(Number.isFinite(inverse) && inverse < sample * expectedRate)) {
          errors.push('CRITICAL: Backwards FX - AR->IE exceeded origin amount');
        }
        if (!withinTolerance(inverse, sample, 1e-9, 1e-6)) {
          errors.push(`AR->IE conversion drift: expected ${sample}, got ${inverse}`);
        }
      }

      // 2. Round-trip idempotency within 1%.
      function assertRoundTrip(amount, from, to, year, options, label) {
        const forward = econ.convert(amount, from, to, year, options);
        const back = econ.convert(forward, to, from, year, options);
        if (!withinTolerance(back, amount, 0.01, 0.5)) {
          errors.push(`Round-trip drift (${label}): expected ${amount}, got ${back}`);
        }
      }

      // 6. Money portfolio integration sanity check
      try {
        const framework = new TestFramework();
        if (!framework.loadCoreModules()) {
          errors.push('Money portfolio test failed: core modules did not load');
        } else {
          framework.ensureVMUIManagerMocks(null, null);
          await vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);
          const moneyError = vm.runInContext(`
            (function() {
              var asset = new IndexFunds(0.04, 0);
              asset.buy(1000, 'EUR', 'ie');
              if (!asset.portfolio || asset.portfolio.length !== 1) return 'portfolio missing after buy';
              var holding = asset.portfolio[0];
              if (holding.principal.currency !== 'EUR' || holding.principal.country !== 'ie') return 'Money holding currency mismatch';
              return null;
            })()
          `, framework.simulationContext);
          if (moneyError) {
            errors.push('Money portfolio test failed: ' + moneyError);
          }
        }
      } catch (err) {
        errors.push('Money portfolio test failed: ' + err.message);
      }

      assertRoundTrip(100000, 'IE', 'AR', BASE_YEAR, constantOptions, 'constant/base');
      assertRoundTrip(150000000, 'AR', 'IE', BASE_YEAR + 3, constantOptions, 'constant/forward');
      assertRoundTrip(75000, 'IE', 'AR', BASE_YEAR + 5, pppOptions, 'ppp/multi-year');
      assertRoundTrip(220000000, 'AR', 'IE', BASE_YEAR + 5, pppOptions, 'ppp/multi-year inverse');

      // 3. Same-country identity
      if (econ.convert(12345.67, 'IE', 'IE', BASE_YEAR + 2, pppOptions) !== 12345.67) {
        errors.push('Identity conversion IE->IE must return the original amount');
      }
      if (econ.convert(-9876.5, 'AR', 'AR', BASE_YEAR + 4, reversionOptions) !== -9876.5) {
        errors.push('Identity conversion AR->AR must preserve negative amounts exactly');
      }

      // 4. Sign and zero preservation
      const negative = econ.convert(-50000, 'IE', 'AR', BASE_YEAR + 1, constantOptions);
      if (!(negative < 0)) {
        errors.push('Negative IE amount lost its sign during conversion');
      }
      const zeroAmount = econ.convert(0, 'AR', 'IE', BASE_YEAR, pppOptions);
      if (zeroAmount !== 0) {
        errors.push('Zero amount should remain exactly zero');
      }
      const nullAmount = econ.convert(null, 'AR', 'IE', BASE_YEAR + 2, constantOptions);
      if (nullAmount !== 0) {
        errors.push('Null value should coerce to zero to match simulator semantics');
      }

      // 5. Finite and bounded outputs
      const moderate = econ.convert(250000, 'AR', 'IE', BASE_YEAR + 2, pppOptions);
      assertFiniteValue(moderate, 'Moderate conversion', 1e12, errors);

      // Constant mode is allowed to drift when FX time-series are provided by
      // the tax rules (step function semantics). Here we only assert finiteness
      // and reasonable magnitudes rather than enforcing a flat path over time.
      const futureConstant = econ.convert(500000, 'IE', 'AR', BASE_YEAR + 10, constantOptions);
      const baseConstant = econ.convert(500000, 'IE', 'AR', BASE_YEAR, constantOptions);
      assertFiniteValue(futureConstant, 'Future constant IE->AR', 1e12, errors);
      assertFiniteValue(baseConstant, 'Base constant IE->AR', 1e12, errors);

      const largeInput = econ.convert(1e9, 'IE', 'AR', BASE_YEAR + 8, pppOptions);
      assertFiniteValue(largeInput, 'Large input conversion', 1e15, errors);
      if (largeInput >= 1e15) {
        errors.push('CRITICAL: 10e15 detected for large IE->AR conversion');
      }

      // 5b. Evolution mode validation: smoothness, divergence from constant, and round-trip behaviour.
      (function validateEvolutionMode() {
        const evolved5 = econ.convert(1000, 'IE', 'AR', BASE_YEAR + 5, evolutionOptions);
        const constant5 = econ.convert(1000, 'IE', 'AR', BASE_YEAR + 5, constantOptions);
        if (!(Number.isFinite(evolved5) && Number.isFinite(constant5) && evolved5 > 0 && constant5 > 0)) {
          errors.push('Evolution mode IE->AR conversion produced non-finite or non-positive values');
        } else {
          // Require evolution to diverge meaningfully from constant over 5 years.
          if (percentDelta(evolved5, constant5) < 0.01) {
            errors.push('Evolution IE->AR FX should diverge from constant by >1% over 5 years');
          }
        }

        const evolvedInv = econ.convert(1000000, 'AR', 'IE', BASE_YEAR + 5, evolutionOptions);
        const constantInv = econ.convert(1000000, 'AR', 'IE', BASE_YEAR + 5, constantOptions);
        if (!(Number.isFinite(evolvedInv) && Number.isFinite(constantInv))) {
          errors.push('Evolution mode AR->IE conversion produced non-finite values');
        } else {
          if (percentDelta(evolvedInv, constantInv) < 0.01) {
            errors.push('Evolution AR->IE FX should diverge from constant by >1% over 5 years');
          }
        }

        // Gradual evolution: guard against extreme year-over-year jumps (>20x multiplier),
        // while allowing large, realistic drifts driven by high inflation.
        let prev = null;
        for (let yr = BASE_YEAR + 1; yr <= BASE_YEAR + 5; yr++) {
          const converted = econ.convert(1000, 'IE', 'AR', yr, evolutionOptions);
          if (!Number.isFinite(converted) || converted === 0) {
            errors.push('Evolution produced non-finite/zero conversion at year ' + yr);
            continue;
          }
          if (prev !== null && prev !== 0) {
            const ratio = Math.abs(converted / prev);
            const invRatio = Math.abs(prev / converted);
            const maxRatio = Math.max(ratio, invRatio);
            if (maxRatio > 20) {
              errors.push('Evolution produced >20x year-over-year jump at year ' + yr +
                ' (prev=' + prev.toFixed(2) + ', curr=' + converted.toFixed(2) + ', ratio=' + maxRatio.toFixed(2) + 'x)');
            }
          }
          prev = converted;
        }

        // Evolution round-trip should stay within 1% over a 5-year horizon.
        assertRoundTrip(100000, 'IE', 'AR', BASE_YEAR + 5, evolutionOptions, 'evolution/5yr');

        // Finite/bounded evolution outputs for a large AR->IE conversion.
        const moderateEvolution = econ.convert(250000, 'AR', 'IE', BASE_YEAR + 2, evolutionOptions);
        assertFiniteValue(moderateEvolution, 'Moderate evolution conversion', 1e12, errors);
      })();

      // 6. Mode divergence expectations
      // PPP and constant modes should diverge in distant future years (once evolution is implemented in T8)
      const const2035 = econ.convert(1000, 'IE', 'AR', 2035, constantOptions);
      const ppp2035 = econ.convert(1000, 'IE', 'AR', 2035, pppOptions);
      if (withinTolerance(const2035, ppp2035, 1e-6, 1e-3)) {
        errors.push('PPP and constant modes should diverge in distant future years');
      }

      const checkYear = BASE_YEAR + 3; // nearer-term year avoids overshoot artifacts
      const constNear = econ.convert(1000, 'IE', 'AR', checkYear, constantOptions);
      const pppNear = econ.convert(1000, 'IE', 'AR', checkYear, pppOptions);
      const reversionNear = econ.convert(1000, 'IE', 'AR', checkYear, reversionOptions);
      const minRate = Math.min(constNear, pppNear);
      const maxRate = Math.max(constNear, pppNear);
      if (reversionNear < minRate - 1 || reversionNear > maxRate + 1) {
        errors.push('Reversion mode should stay between constant and PPP trajectories in nearby years');
      }

      // Anti-blowup guard threshold: detect catastrophic year-over-year jumps (exceeding 5x multiplier)
      // This threshold is used in sections 7 and 8 as an invariant check to catch implementation bugs,
      // not an expectation about FX/PPP formula smoothness
      const CATASTROPHIC_JUMP_MULTIPLIER = 5.0; // Flag if year-over-year change exceeds 5x

      // 7. Anti-blowup guard: detect catastrophic year-over-year jumps (exceeding 5x multiplier)
      // This is an invariant check to catch implementation bugs, not an expectation about FX formula smoothness
      const sampleYears = [2026, 2027, 2028, 2029, 2030, 2031];
      let prevValue = null;
      for (let i = 0; i < sampleYears.length; i++) {
        const yr = sampleYears[i];
        const converted = econ.convert(1000, 'IE', 'AR', yr, constantOptions);
        if (prevValue !== null && prevValue !== 0) {
          const ratio = Math.abs(converted / prevValue);
          const inverseRatio = Math.abs(prevValue / converted);
          const maxRatio = Math.max(ratio, inverseRatio);
          if (maxRatio > CATASTROPHIC_JUMP_MULTIPLIER) {
            errors.push(`CRITICAL: Catastrophic FX jump detected at ${yr}: ${maxRatio.toFixed(2)}x change (prev=${prevValue.toFixed(2)}, curr=${converted.toFixed(2)})`);
          }
        }
        prevValue = converted;
      }

      // 8. Anti-blowup guard: detect extremely large PPP year-over-year increases (exceeding 5x multiplier)
      // This is an invariant check to catch implementation bugs, not an expectation about PPP formula smoothness
      prevValue = null;
      for (let i = 0; i < sampleYears.length; i++) {
        const yr = sampleYears[i];
        const converted = econ.convert(1000, 'IE', 'AR', yr, pppOptions);
        if (prevValue !== null && prevValue !== 0) {
          const ratio = Math.abs(converted / prevValue);
          const inverseRatio = Math.abs(prevValue / converted);
          const maxRatio = Math.max(ratio, inverseRatio);
          if (maxRatio > CATASTROPHIC_JUMP_MULTIPLIER) {
            errors.push(`CRITICAL: Catastrophic PPP jump detected between ${sampleYears[i - 1]} and ${yr}: ${maxRatio.toFixed(2)}x change (prev=${prevValue.toFixed(2)}, curr=${converted.toFixed(2)})`);
          }
        }
        prevValue = converted;
      }

      // 8b. Anti-blowup guard for evolution mode using the same 5x threshold.
      prevValue = null;
      for (let i = 0; i < sampleYears.length; i++) {
        const yr = sampleYears[i];
        const converted = econ.convert(1000, 'IE', 'AR', yr, evolutionOptions);
        if (prevValue !== null && prevValue !== 0) {
          const ratio = Math.abs(converted / prevValue);
          const inverseRatio = Math.abs(prevValue / converted);
          const maxRatio = Math.max(ratio, inverseRatio);
          if (maxRatio > CATASTROPHIC_JUMP_MULTIPLIER) {
            errors.push(`CRITICAL: Catastrophic EVOLUTION FX jump detected at ${yr}: ${maxRatio.toFixed(2)}x change (prev=${prevValue.toFixed(2)}, curr=${converted.toFixed(2)})`);
          }
        }
        prevValue = converted;
      }

      // 9. Reversion extremes
      const zeroSpeed = econ.convert(100, 'IE', 'AR', BASE_YEAR + 2, { fxMode: 'reversion', baseYear: BASE_YEAR, reversionSpeed: 0 });
      const constRef = econ.convert(100, 'IE', 'AR', BASE_YEAR + 2, constantOptions);
      const fullSpeed = econ.convert(100, 'IE', 'AR', BASE_YEAR + 2, { fxMode: 'reversion', baseYear: BASE_YEAR, reversionSpeed: 1 });
      const pppRef = econ.convert(100, 'IE', 'AR', BASE_YEAR + 2, pppOptions);
      if (Number.isFinite(zeroSpeed) && Number.isFinite(constRef) && Number.isFinite(pppRef)) {
        const minRate = Math.min(constRef, pppRef);
        const maxRate = Math.max(constRef, pppRef);
        if (zeroSpeed < minRate - 1e-6 || zeroSpeed > maxRate + 1e-6) {
          errors.push('Reversion speed 0 should stay between constant and PPP anchors');
        }
      }
      if (!withinTolerance(fullSpeed, pppRef, 1e-9, 1e-6)) {
        errors.push('Reversion speed 1 should match PPP mode');
      }

      // 10. EUR mode chart display: Ensure ARS events convert to reasonable EUR values
      const arsOutflow = 30000000; // 30M ARS (typical AR expense)
      const eurEquivalent = econ.convert(arsOutflow, 'AR', 'IE', BASE_YEAR, constantOptions);
      if (eurEquivalent === null || !Number.isFinite(eurEquivalent)) {
        errors.push('CRITICAL: ARS->EUR conversion failed for chart display');
      } else if (eurEquivalent > 1e8) {
        errors.push('CRITICAL: ARS->EUR conversion produced huge EUR value (>1e8): ' + eurEquivalent);
      } else if (eurEquivalent < 1e3) {
        errors.push('CRITICAL: ARS->EUR conversion produced tiny EUR value (<1e3): ' + eurEquivalent);
      }
      // Expected: 30M ARS / 1500 ≈ 20K EUR (reasonable)
      const expectedEur = arsOutflow / 1500;
      if (!withinTolerance(eurEquivalent, expectedEur, 0.01, 100)) {
        errors.push('ARS->EUR conversion mismatch: expected ~' + expectedEur + ', got ' + eurEquivalent);
      }

      // Evolution-mode ARS->EUR for chart display (future unified-currency behaviour).
      const eurEvolution = econ.convert(arsOutflow, 'AR', 'IE', BASE_YEAR + 5, evolutionOptions);
      if (eurEvolution === null || !Number.isFinite(eurEvolution)) {
        errors.push('CRITICAL: ARS->EUR evolution conversion failed for chart display');
      } else {
        if (eurEvolution > 1e8) {
          errors.push('CRITICAL: ARS->EUR evolution conversion produced huge EUR value (>1e8): ' + eurEvolution);
        }
        if (eurEvolution < 1e3) {
          errors.push('CRITICAL: ARS->EUR evolution conversion produced tiny EUR value (<1e3): ' + eurEvolution);
        }
        // Evolution and constant modes should diverge meaningfully.
        if (Number.isFinite(eurEquivalent) && percentDelta(eurEvolution, eurEquivalent) < 0.01) {
          errors.push('Evolution ARS->EUR should diverge from constant mode by >1% over 5 years');
        }
      }

      // 11. Evolution vs constant divergence over a long horizon.
      const evolved10 = econ.convert(1000, 'IE', 'AR', BASE_YEAR + 10, evolutionOptions);
      const constant10 = econ.convert(1000, 'IE', 'AR', BASE_YEAR + 10, constantOptions);
      if (Number.isFinite(evolved10) && Number.isFinite(constant10)) {
        if (percentDelta(evolved10, constant10) < 0.05) {
          errors.push('Evolution and constant FX modes should diverge by >5% over 10 years');
        }
      }
    } catch (err) {
      errors.push(err && err.message ? err.message : String(err));
    } finally {
      global.Config = originalConfig;
    }

    return { success: errors.length === 0, errors };
  }
};
