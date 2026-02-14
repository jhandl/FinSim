// Custom test to validate that pension present-value calculations
// use origin-country (StartCountry) deflation across relocations,
// not the current residency country's deflation. This ensures pension
// PV remains stable when relocating from low-inflation to high-inflation
// countries, as pensions should be deflated using the country where
// contributions were made.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');
const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

const INFLATION_SERVICE_CODE = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'core', 'InflationService.js'),
  'utf8'
);

function withinTolerance(actual, expected, tol) {
  if (!isFinite(actual) || !isFinite(expected)) return false;
  const diff = Math.abs(actual - expected);
  if (diff <= tol) return true;
  const denom = Math.abs(expected) > 1e-9 ? Math.abs(expected) : 1;
  return diff / denom <= tol;
}

function ensureInflationServiceLoaded(framework) {
  const ctx = framework.simulationContext;
  if (!ctx || ctx.__inflationServiceLoaded) return;
  vm.runInContext(INFLATION_SERVICE_CODE, ctx, {
    filename: 'InflationService.js',
    displayErrors: true
  });
  ctx.__inflationServiceLoaded = true;
}

function buildEuroARRules() {
  const clone = deepClone(AR_RULES);
  if (!clone.locale) clone.locale = {};
  clone.locale.currencyCode = 'EUR';
  clone.locale.currencySymbol = '€';
  return clone;
}

function findRowByAge(rows, age) {
  return rows.find(row => Math.round(row.age) === age);
}

async function runScenario(scenarioFactory, rulesFactory) {
  const framework = new TestFramework();
  const scenarioDefinition = scenarioFactory();

  if (!framework.loadScenario(scenarioDefinition)) {
    return { ok: false, error: 'Failed to load scenario: ' + scenarioDefinition.name };
  }

  ensureInflationServiceLoaded(framework);
  const ruleMap = typeof rulesFactory === 'function' ? rulesFactory() : null;
  if (ruleMap) {
    installTestTaxRules(framework, ruleMap);
  }

  const results = await framework.runSimulation();
  if (!results || !results.success) {
    return { ok: false, error: 'Simulation failed for scenario: ' + scenarioDefinition.name };
  }

  const rows = Array.isArray(results.dataSheet)
    ? results.dataSheet.filter(row => row && typeof row === 'object')
    : [];

  if (!rows.length) {
    return { ok: false, error: 'Simulation produced no rows for scenario: ' + scenarioDefinition.name };
  }

  return { ok: true, rows, results };
}

function createMainScenario() {
  return {
    name: 'PensionPVRelocationMain',
    description: 'IE pension with relocation to AR and high-inflation deflation split',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 50,
        retirementAge: 65,
        initialSavings: 100000,
        initialPension: 100000,
        initialFunds: 0,
        initialShares: 0,
        emergencyStash: 0,
        FundsAllocation: 0,
        SharesAllocation: 0,
        pensionPercentage: 0.10,
        statePensionWeekly: 0,
        inflation: 0.02,
        growthRateFunds: 0,
        growthDevFunds: 0,
        growthRateShares: 0,
        growthDevShares: 0,
        growthRatePension: 0.05,
        growthDevPension: 0,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economyMode: 'deterministic',
        relocationEnabled: true
      },
      events: [
        { type: 'SI', id: 'Salary_IE', amount: 50000, fromAge: 30, toAge: 64, currency: 'EUR' },
        { type: 'MV', name: 'AR', id: 'Move_AR', amount: 0, fromAge: 40, toAge: 40, currency: 'EUR', rate: 0.50 }
      ]
    },
    assertions: []
  };
}

function createContinuityScenario() {
  return {
    name: 'PensionPVContinuity',
    description: 'Pension PV should remain stable across relocation boundary',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 42,
        retirementAge: 65,
        initialSavings: 100000,
        initialPension: 100000,
        initialFunds: 0,
        initialShares: 0,
        emergencyStash: 0,
        FundsAllocation: 0,
        SharesAllocation: 0,
        pensionPercentage: 0.10,
        statePensionWeekly: 0,
        inflation: 0.02,
        growthRateFunds: 0,
        growthDevFunds: 0,
        growthRateShares: 0,
        growthDevShares: 0,
        growthRatePension: 0.05,
        growthDevPension: 0,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economyMode: 'deterministic',
        relocationEnabled: true
      },
      events: [
        { type: 'SI', id: 'Salary_IE', amount: 50000, fromAge: 30, toAge: 64, currency: 'EUR' },
        { type: 'MV', name: 'AR', id: 'Move_AR', amount: 0, fromAge: 40, toAge: 40, currency: 'EUR', rate: 0.50 }
      ]
    },
    assertions: []
  };
}

function createNoPensionScenario() {
  return {
    name: 'PensionPVNoPension',
    description: 'Scenario without pension should keep pensionFundPV at 0',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 50,
        retirementAge: 65,
        initialSavings: 100000,
        initialPension: 0,
        initialFunds: 0,
        initialShares: 0,
        emergencyStash: 0,
        FundsAllocation: 0,
        SharesAllocation: 0,
        pensionPercentage: 0,
        statePensionWeekly: 0,
        inflation: 0.02,
        growthRateFunds: 0,
        growthDevFunds: 0,
        growthRateShares: 0,
        growthDevShares: 0,
        growthRatePension: 0,
        growthDevPension: 0,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economyMode: 'deterministic',
        relocationEnabled: true
      },
      events: [
        { type: 'SI', id: 'Salary_IE', amount: 50000, fromAge: 30, toAge: 64, currency: 'EUR' },
        { type: 'MV', name: 'AR', id: 'Move_AR', amount: 0, fromAge: 40, toAge: 40, currency: 'EUR', rate: 0.50 }
      ]
    },
    assertions: []
  };
}

function createCoupleScenario() {
  return {
    name: 'PensionPVCouple',
    description: 'Couple with dual pensions should sum both using origin deflator',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 50,
        retirementAge: 65,
        initialSavings: 200000,
        initialPension: 100000,
        initialFunds: 0,
        initialShares: 0,
        emergencyStash: 0,
        FundsAllocation: 0,
        SharesAllocation: 0,
        pensionPercentage: 0.10,
        statePensionWeekly: 0,
        inflation: 0.02,
        growthRateFunds: 0,
        growthDevFunds: 0,
        growthRateShares: 0,
        growthDevShares: 0,
        growthRatePension: 0.05,
        growthDevPension: 0,
        StartCountry: 'ie',
        simulation_mode: 'couple',
        economyMode: 'deterministic',
        relocationEnabled: true
      },
      events: [
        { type: 'SI', id: 'Salary_IE', amount: 50000, fromAge: 30, toAge: 64, currency: 'EUR' },
        { type: 'MV', name: 'AR', id: 'Move_AR', amount: 0, fromAge: 40, toAge: 40, currency: 'EUR', rate: 0.50 }
      ]
    },
    assertions: []
  };
}

module.exports = {
  name: 'PensionPVRelocation',
  description: 'Validates that pension PV uses origin-country (StartCountry) deflation across relocations and edge cases',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // Scenario 1: Main IE→AR relocation with pension contributions
    const mainResult = await runScenario(createMainScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildEuroARRules()
    }));
    if (!mainResult.ok) {
      return { success: false, errors: [mainResult.error] };
    }
    const mainRows = mainResult.rows;
    const row49 = findRowByAge(mainRows, 49);

    if (!row49) {
      return { success: false, errors: ['Missing required age 49 in main scenario'] };
    }

    // At age 49, 9 years post-relocation, pension should use IE deflation (19 years total at 2%)
    // NOT AR deflation (9 years at 50%)
    const yearsSinceStart = 19; // Age 49 - starting age 30
    const yearsPostRelocation = 9; // Age 49 - relocation age 40
    const ieDefFactor = 1 / Math.pow(1.02, yearsSinceStart);
    const arDefFactor = 1 / Math.pow(1.50, yearsPostRelocation);

    // Nominal pension should be unchanged by relocation (contributions + growth)
    // We can't predict exact nominal without running the full simulation, but we can check
    // that it's reasonable (should be > initialPension due to contributions and growth)
    if (row49.pensionFund <= 100000) {
      errors.push(
        `Nominal pension fund at age 49 should exceed initial (100k) due to contributions and growth; got ${row49.pensionFund}`
      );
    }

    // PV should use IE deflation factor, not AR
    const expectedPV = row49.pensionFund * ieDefFactor;
    const actualPV = row49.pensionFundPV;

    if (!withinTolerance(actualPV, expectedPV, expectedPV * 0.001)) {
      errors.push(
        `Pension PV at age 49 should use IE deflation (expected ~${expectedPV.toFixed(2)}); got ${actualPV.toFixed(2)}`
      );
    }

    const pvRatio = actualPV / row49.pensionFund;
    if (!withinTolerance(pvRatio, ieDefFactor, 0.001)) {
      errors.push(
        `PV ratio at age 49 should match IE deflation factor (${ieDefFactor.toFixed(6)}), got ${pvRatio.toFixed(6)}`
      );
    }
    // PV ratio should be much larger than AR deflation factor (IE deflation ~26x larger than AR)
    // Use a smaller multiplier (20) since IE deflation is 0.686 vs AR deflation 0.026
    if (pvRatio <= arDefFactor * 20) {
      errors.push(
        `PV ratio (${pvRatio.toFixed(6)}) is too close to AR deflation factor (${arDefFactor.toFixed(6)}), suggesting residency-country inflation was used`
      );
    }

    // worthPV should equal explicit sum of components
    const worthComponentsPV =
      (row49.realEstateCapitalPV || 0) +
      (row49.pensionFundPV || 0) +
      (function () {
        const m = row49.investmentCapitalByKeyPV || {};
        let t = 0;
        for (const k in m) { if (k === 'indexFunds' || k.indexOf('indexFunds_') === 0) t += m[k] || 0; }
        return t;
      })() +
      (function () {
        const m = row49.investmentCapitalByKeyPV || {};
        let t = 0;
        for (const k in m) { if (k === 'shares' || k.indexOf('shares_') === 0) t += m[k] || 0; }
        return t;
      })() +
      (row49.cashPV || 0);
    if (!withinTolerance(row49.worthPV || 0, worthComponentsPV, Math.max(1, Math.abs(worthComponentsPV) * 1e-6))) {
      errors.push(
        `worthPV should equal the sum of asset PV components at age 49: expected ${worthComponentsPV}, got ${row49.worthPV}`
      );
    }

    // Scenario 2: Continuity across relocation boundary
    const continuityResult = await runScenario(createContinuityScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildEuroARRules()
    }));
    if (!continuityResult.ok) {
      return { success: false, errors: [continuityResult.error] };
    }
    const continuityRows = continuityResult.rows;
    const row39 = findRowByAge(continuityRows, 39);
    const row40 = findRowByAge(continuityRows, 40);
    const row41 = findRowByAge(continuityRows, 41);

    if (!row39 || !row40 || !row41) {
      return { success: false, errors: ['Missing required ages (39, 40, 41) in continuity scenario'] };
    }

    if (!withinTolerance(row40.pensionFundPV, row39.pensionFundPV, row39.pensionFundPV * 0.02)) {
      errors.push(
        `Pension PV should remain stable across relocation boundary (age 39 -> 40): ${row39.pensionFundPV} -> ${row40.pensionFundPV}`
      );
    }
    if (!withinTolerance(row41.pensionFundPV, row40.pensionFundPV, row40.pensionFundPV * 0.02)) {
      errors.push(
        `Pension PV should remain stable immediately after relocation (age 40 -> 41): ${row40.pensionFundPV} -> ${row41.pensionFundPV}`
      );
    }

    // Scenario 3: No pension scenario
    const noPensionResult = await runScenario(createNoPensionScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildEuroARRules()
    }));
    if (!noPensionResult.ok) {
      return { success: false, errors: [noPensionResult.error] };
    }
    const finalNoPensionRow = noPensionResult.rows[noPensionResult.rows.length - 1];
    if (finalNoPensionRow.pensionFundPV !== 0) {
      errors.push(
        `Scenario without pension should keep pensionFundPV at 0; got ${finalNoPensionRow.pensionFundPV}`
      );
    }

    // Scenario 4: Couple with dual pensions
    const coupleResult = await runScenario(createCoupleScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildEuroARRules()
    }));
    if (!coupleResult.ok) {
      return { success: false, errors: [coupleResult.error] };
    }
    const coupleRow49 = findRowByAge(coupleResult.rows, 49);
    if (!coupleRow49) {
      return { success: false, errors: ['Missing age 49 row in couple scenario'] };
    }

    // Both persons' pensions should be summed and use origin deflator
    const coupleYearsSinceStart = 19;
    const coupleIeDefFactor = 1 / Math.pow(1.02, coupleYearsSinceStart);
    const coupleExpectedPV = coupleRow49.pensionFund * coupleIeDefFactor;
    const coupleActualPV = coupleRow49.pensionFundPV;

    if (!withinTolerance(coupleActualPV, coupleExpectedPV, coupleExpectedPV * 0.001)) {
      errors.push(
        `Couple pension PV at age 49 should use IE deflation (expected ~${coupleExpectedPV.toFixed(2)}); got ${coupleActualPV.toFixed(2)}`
      );
    }

    // worthPV should equal explicit sum for couple scenario too
    const coupleWorthComponentsPV =
      (coupleRow49.realEstateCapitalPV || 0) +
      (coupleRow49.pensionFundPV || 0) +
      (function () {
        const m = coupleRow49.investmentCapitalByKeyPV || {};
        let t = 0;
        for (const k in m) { if (k === 'indexFunds' || k.indexOf('indexFunds_') === 0) t += m[k] || 0; }
        return t;
      })() +
      (function () {
        const m = coupleRow49.investmentCapitalByKeyPV || {};
        let t = 0;
        for (const k in m) { if (k === 'shares' || k.indexOf('shares_') === 0) t += m[k] || 0; }
        return t;
      })() +
      (coupleRow49.cashPV || 0);
    if (!withinTolerance(coupleRow49.worthPV || 0, coupleWorthComponentsPV, Math.max(1, Math.abs(coupleWorthComponentsPV) * 1e-6))) {
      errors.push(
        `Couple worthPV should equal the sum of asset PV components at age 49: expected ${coupleWorthComponentsPV}, got ${coupleRow49.worthPV}`
      );
    }

    return { success: errors.length === 0, errors };
  }
};

