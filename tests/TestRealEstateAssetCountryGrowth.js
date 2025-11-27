// Custom test to validate that real estate nominal growth
// uses asset-country inflation rather than residency-country
// inflation when no explicit appreciation rate is set.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');

function withinTolerance(actual, expected, tol) {
  const diff = Math.abs(actual - expected);
  if (!isFinite(diff)) return false;
  const denom = Math.abs(expected) > 1e-9 ? Math.abs(expected) : 1;
  return diff <= tol || (diff / denom) <= tol;
}

module.exports = {
  name: 'RealEstateAssetCountryGrowth',
  description: 'Validates that real estate uses asset-country inflation for nominal growth after relocation (no PV assertions).',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const testResults = { success: true, errors: [] };

    try {
      if (!framework.loadCoreModules()) {
        return { success: false, errors: ['Failed to load core modules'] };
      }

      // Load InflationService into the simulation VM so Property.getValue()
      // can resolve asset-country inflation rates.
      const inflationPath = path.join(__dirname, '..', 'src', 'core', 'InflationService.js');
      const inflationCode = fs.readFileSync(inflationPath, 'utf8');
      vm.runInContext(inflationCode, framework.simulationContext, {
        filename: 'InflationService.js',
        displayErrors: true
      });

      const ctx = framework.simulationContext;

      // Scenario 1: Irish property with relocation to AR, no explicit Rate.
      // The property should grow at IE CPI (2%) before and after relocation,
      // even though AR inflation is overridden to 50% via countryInflationOverrides.
      vm.runInContext(
        `
        params = { startingAge: 30, inflation: 0.02, StartCountry: "ie" };
        countryInflationOverrides = { ar: 0.50 };
        currentCountry = "ie";
        year = 30;
        periods = 0;

        realEstate = new RealEstate();
        realEstate.buy("home_ie", 400000, null, "EUR", "ie");
        `,
        ctx
      );

      const ieTimeline = vm.runInContext(
        `
        (function () {
          var out = {};
          var id = "home_ie";

          // Age 30 (purchase year) - no growth applied yet.
          age = 30;
          year = 30;
          out[30] = realEstate.getValue(id);

          // Ages 31-40: property grows one year at a time.
          for (var a = 31; a <= 40; a++) {
            age = a;
            year = 30 + (a - 30);

            // Relocate to AR at age 35: currentCountry switches to 'ar'
            // and AR inflation override is 50%, but the property should
            // continue using IE CPI because of its asset country.
            if (a === 35) {
              currentCountry = "ar";
            }

            realEstate.addYear();
            out[a] = realEstate.getValue(id);
          }

          return out;
        })();
        `,
        ctx
      );

      const baseValue = 400000;
      const years = 10; // From age 30 to 40 inclusive -> 10 years of growth
      const expectedIE = baseValue * Math.pow(1.02, years);

      if (!withinTolerance(ieTimeline[40], expectedIE, 0.001)) {
        testResults.success = false;
        testResults.errors.push(
          'IE asset-country growth mismatch at age 40: expected ' +
          expectedIE + ', got ' + ieTimeline[40]
        );
      }

      // Ensure pre- and post-relocation yearly growth stays near 2%.
      const growthPreRelocation = ieTimeline[31] / ieTimeline[30];
      const growthPostRelocation = ieTimeline[36] / ieTimeline[35];

      if (!withinTolerance(growthPreRelocation, 1.02, 1e-6)) {
        testResults.success = false;
        testResults.errors.push(
          'Pre-relocation growth (age 30->31) should be ~2% IE CPI'
        );
      }

      if (!withinTolerance(growthPostRelocation, 1.02, 1e-6)) {
        testResults.success = false;
        testResults.errors.push(
          'Post-relocation growth (age 35->36) should remain ~2% IE CPI, not AR 50% CPI'
        );
      }

      // Sanity check: no sudden jump at relocation boundary around age 35.
      const ratioBefore = ieTimeline[35] / ieTimeline[34];
      const ratioAfter = ieTimeline[36] / ieTimeline[35];
      if (!withinTolerance(ratioBefore, ratioAfter, 1e-6)) {
        testResults.success = false;
        testResults.errors.push(
          'Nominal property values should be continuous across relocation (no sudden jump at age 35)'
        );
      }

      // Scenario 2: Explicit Rate on R event should remain unchanged.
      vm.runInContext(
        `
        params = { startingAge: 30, inflation: 0.02, StartCountry: "ie" };
        countryInflationOverrides = { ar: 0.50 };
        currentCountry = "ar";
        year = 30;
        periods = 0;

        realEstateExplicit = new RealEstate();
        realEstateExplicit.buy("home_explicit", 400000, 0.03, "EUR", "ie");
        `,
        ctx
      );

      const explicitTimeline = vm.runInContext(
        `
        (function () {
          var out = {};
          var id = "home_explicit";

          age = 30;
          year = 30;
          out[30] = realEstateExplicit.getValue(id);

          for (var a = 31; a <= 40; a++) {
            age = a;
            year = 30 + (a - 30);
            realEstateExplicit.addYear();
            out[a] = realEstateExplicit.getValue(id);
          }

          return out;
        })();
        `,
        ctx
      );

      const expectedExplicit = baseValue * Math.pow(1.03, years);
      if (!withinTolerance(explicitTimeline[40], expectedExplicit, 0.001)) {
        testResults.success = false;
        testResults.errors.push(
          'Explicit Rate path should use 3% fixed appreciation: expected ' +
          expectedExplicit + ', got ' + explicitTimeline[40]
        );
      }

      // Scenario 3: Missing linkedCountry should fall back to StartCountry.
      vm.runInContext(
        `
        params = { startingAge: 30, inflation: 0.02, StartCountry: "ie" };
        countryInflationOverrides = { ar: 0.50 };
        currentCountry = "ie";
        year = 30;
        periods = 0;

        realEstateNoCountry = new RealEstate();
        // No linkedCountry passed here; Property.linkedCountry remains null.
        realEstateNoCountry.buy("home_start_country", 400000, null, "EUR");
        `,
        ctx
      );

      const noCountryTimeline = vm.runInContext(
        `
        (function () {
          var out = {};
          var id = "home_start_country";

          age = 30;
          year = 30;
          out[30] = realEstateNoCountry.getValue(id);

          for (var a = 31; a <= 40; a++) {
            age = a;
            year = 30 + (a - 30);
            if (a === 35) {
              currentCountry = "ar";
            }
            realEstateNoCountry.addYear();
            out[a] = realEstateNoCountry.getValue(id);
          }

          return out;
        })();
        `,
        ctx
      );

      const expectedNoCountry = expectedIE;
      if (!withinTolerance(noCountryTimeline[40], expectedNoCountry, 0.001)) {
        testResults.success = false;
        testResults.errors.push(
          'StartCountry fallback growth mismatch at age 40: expected ' +
          expectedNoCountry + ', got ' + noCountryTimeline[40]
        );
      }

      return testResults;
    } catch (e) {
      return { success: false, errors: [e.message] };
    }
  }
};

