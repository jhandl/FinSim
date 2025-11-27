// Custom test for getDeflationFactorForCountry helper in Utils.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');

function withinTolerance(actual, expected, tol) {
  const diff = Math.abs(actual - expected);
  if (!isFinite(diff)) return false;
  const denom = Math.abs(expected) > 1e-9 ? Math.abs(expected) : 1;
  return diff <= tol || (diff / denom) <= tol;
}

module.exports = {
  name: 'DeflationFactorHelper',
  description: 'Validates country-aware getDeflationFactorForCountry() present-value helper',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const testResults = { success: true, errors: [] };

    try {
      if (!framework.loadCoreModules()) {
        return { success: false, errors: ['Failed to load core modules'] };
      }

      // Load InflationService into the simulation VM context so the helper
      // can resolve country/year-specific inflation rates.
      const inflationPath = path.join(__dirname, '..', 'src', 'core', 'InflationService.js');
      const inflationCode = fs.readFileSync(inflationPath, 'utf8');
      vm.runInContext(inflationCode, framework.simulationContext, {
        filename: 'InflationService.js',
        displayErrors: true
      });

      const ctx = framework.simulationContext;

      // 1) IE baseline: params scalar inflation used for IE with no overrides
      vm.runInContext('params = { startingAge: 30, inflation: 0.02, StartCountry: "ie" };', ctx);
      const fIE = vm.runInContext(
        "getDeflationFactorForCountry('ie', 35, 2020, { params: params })",
        ctx
      );
      const expectedIE = 1 / Math.pow(1.02, 5); // n = 5 years at 2% inflation
      if (!withinTolerance(fIE, expectedIE, 1e-8)) {
        testResults.success = false;
        testResults.errors.push(
          'IE baseline deflation factor mismatch: expected ' + expectedIE + ', got ' + fIE
        );
      }

      // 2) AR high inflation via explicit countryInflationOverrides
      vm.runInContext('params = { startingAge: 30, inflation: 0.02, StartCountry: "ie" };', ctx);
      const fAR = vm.runInContext(
        "getDeflationFactorForCountry('ar', 35, 2020, { params: params, countryInflationOverrides: { ar: 0.50 } })",
        ctx
      );
      const expectedAR = 1 / Math.pow(1.50, 5); // n = 5 years at 50% inflation
      if (!withinTolerance(fAR, expectedAR, 1e-8)) {
        testResults.success = false;
        testResults.errors.push(
          'AR override deflation factor mismatch: expected ' + expectedAR + ', got ' + fAR
        );
      }

      // 3) Different ages (30, 35, 40) with IE inflation: strictly decreasing factors
      const f30 = vm.runInContext(
        "getDeflationFactorForCountry('ie', 30, 2020, { params: params })",
        ctx
      );
      const f35 = vm.runInContext(
        "getDeflationFactorForCountry('ie', 35, 2020, { params: params })",
        ctx
      );
      const f40 = vm.runInContext(
        "getDeflationFactorForCountry('ie', 40, 2020, { params: params })",
        ctx
      );

      if (Math.abs(f30 - 1) > 1e-12) {
        testResults.success = false;
        testResults.errors.push('Age 30 factor should be 1 when n = 0');
      }
      if (!(f30 > f35 && f35 > f40)) {
        testResults.success = false;
        testResults.errors.push('Deflation factors should decrease as age moves further into the future (30 > 35 > 40)');
      }

      // 4) Fallback country='' uses params.inflation (IE behaviour)
      const fEmptyCountry = vm.runInContext(
        "getDeflationFactorForCountry('', 35, 2020, { params: params })",
        ctx
      );
      if (!withinTolerance(fEmptyCountry, expectedIE, 1e-8)) {
        testResults.success = false;
        testResults.errors.push(
          'Empty country code should fall back to params.inflation (IE baseline)'
        );
      }

      // 5) Invalid inputs: missing age or startYear => neutral factor 1
      const fMissingAge = vm.runInContext(
        "getDeflationFactorForCountry('ie', '', 2020, { params: params })",
        ctx
      );
      const fMissingStartYear = vm.runInContext(
        "getDeflationFactorForCountry('ie', 35, '', { params: params })",
        ctx
      );
      if (Math.abs(fMissingAge - 1) > 1e-12) {
        testResults.success = false;
        testResults.errors.push('Missing age should yield factor 1');
      }
      if (Math.abs(fMissingStartYear - 1) > 1e-12) {
        testResults.success = false;
        testResults.errors.push('Missing startYear should yield factor 1');
      }

      // 6) State pension-like scenario:
      //    Simulate an IE-born person who has relocated to AR, where the state
      //    pension is effectively indexed to AR inflation. We model this by
      //    constructing EconomicData from IE/AR rules and pegging IE CPI to
      //    AR's CPI, then asking for IE's deflation factor while the base
      //    country is AR.
      const ieRules = new TaxRuleSet(require('../src/core/config/tax-rules-ie.json'));
      const arRules = new TaxRuleSet(require('../src/core/config/tax-rules-ar.json'));
      const econ = new EconomicData([
        ieRules.getEconomicProfile(),
        arRules.getEconomicProfile()
      ]);

      if (!econ || !econ.data || !econ.data.IE || !econ.data.AR || econ.data.AR.cpi == null) {
        testResults.success = false;
        testResults.errors.push('Failed to construct EconomicData for IE/AR state pension-like test');
      } else {
        // Peg IE CPI to AR CPI to emulate AR-indexed IE pension after relocation.
        econ.data.IE.cpi = econ.data.AR.cpi;

        ctx.econForPension = econ;
        vm.runInContext('params = { startingAge: 65, inflation: 0.02, StartCountry: "ar" };', ctx);

        const fPension = vm.runInContext(
          "getDeflationFactorForCountry('ie', 70, 2020, { params: params, economicData: econForPension })",
          ctx
        );

        const arCpi = econ.getInflation('AR');
        const arRate = (arCpi != null) ? Number(arCpi) / 100 : 0;
        const expectedPension = 1 / Math.pow(1 + arRate, 5); // 5 years from 65 to 70

        if (!withinTolerance(fPension, expectedPension, 1e-8)) {
          testResults.success = false;
          testResults.errors.push(
            'State pension-like AR-indexed IE factor mismatch: expected ' +
            expectedPension + ', got ' + fPension
          );
        }
      }

      return testResults;
    } catch (e) {
      return { success: false, errors: [e.message] };
    }
  }
};

