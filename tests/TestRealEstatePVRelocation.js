// Custom test to validate that real estate present-value calculations
// continue to use asset-country inflation after relocating to a
// high-inflation country. Also covers edge cases for missing linked
// country metadata, multi-country property portfolios, and scenarios
// without real estate.

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
    name: 'RealEstatePVRelocationMain',
    description: 'IE property with relocation to AR and high-inflation deflation split',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 45,
        retirementAge: 65,
        initialSavings: 500000,
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
        { type: 'R', id: 'IE_Property', amount: 400000, fromAge: 30, toAge: 80, currency: 'EUR', linkedCountry: 'ie' },
        { type: 'MV', name: 'AR', id: 'Move_AR', amount: 0, fromAge: 35, toAge: 35, currency: 'EUR', rate: 0.50 }
      ]
    },
    assertions: []
  };
}

function createNoLinkedCountryScenario() {
  return {
    name: 'RealEstateNoLinkedCountry',
    description: 'Property without linkedCountry should fall back to StartCountry for PV',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 45,
        retirementAge: 65,
        initialSavings: 400000,
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
        economyMode: 'deterministic'
      },
      events: [
        { type: 'R', id: 'Fallback_Property', amount: 300000, fromAge: 30, toAge: 70, currency: 'EUR' }
      ]
    },
    assertions: []
  };
}

function createMultiPropertyScenario() {
  return {
    name: 'MultiCountryRealEstatePV',
    description: 'Two properties in IE and AR should use their own inflation for PV',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 33,
        retirementAge: 65,
        initialSavings: 700000,
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
        { type: 'R', id: 'IE_Property', amount: 400000, fromAge: 30, toAge: 80, currency: 'EUR', linkedCountry: 'ie' },
        { type: 'R', id: 'AR_Property', amount: 200000, fromAge: 30, toAge: 80, currency: 'EUR', linkedCountry: 'ar' },
        { type: 'MV', name: 'AR', id: 'Relocate_AR', amount: 0, fromAge: 31, toAge: 31, currency: 'EUR', rate: 0.50 }
      ]
    },
    assertions: []
  };
}

function createNoRealEstateScenario() {
  return {
    name: 'NoRealEstatePV',
    description: 'Scenario without properties should keep realEstateCapitalPV at 0',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 35,
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
        economyMode: 'deterministic'
      },
      events: []
    },
    assertions: []
  };
}

module.exports = {
  name: 'RealEstatePVRelocation',
  description: 'Validates that real estate PV uses asset-country inflation across relocations and edge cases',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // Main relocation scenario (IE property, move to AR with 50% inflation)
    const mainResult = await runScenario(createMainScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildEuroARRules()
    }));
    if (!mainResult.ok) {
      return { success: false, errors: [mainResult.error] };
    }
    const mainRows = mainResult.rows;
    const row34 = findRowByAge(mainRows, 34);
    const row35 = findRowByAge(mainRows, 35);
    const row36 = findRowByAge(mainRows, 36);
    const row40 = findRowByAge(mainRows, 40);

    if (!row34 || !row35 || !row36 || !row40) {
      return { success: false, errors: ['Missing required ages (34, 35, 36, 40) in main scenario'] };
    }

    const baseValue = 400000;
    const yearsSincePurchase = 10;
    const expectedNominal = baseValue * Math.pow(1.02, yearsSincePurchase);
    if (!withinTolerance(row40.realEstateCapital, expectedNominal, 0.01)) {
      errors.push(
        `Nominal real estate capital mismatch at age 40: expected ${expectedNominal}, got ${row40.realEstateCapital}`
      );
    }

    const ieDefFactor = 1 / Math.pow(1.02, yearsSincePurchase);
    const arDefFactor = 1 / Math.pow(1.50, yearsSincePurchase);
    const expectedPV = expectedNominal * ieDefFactor;
    const actualPV = row40.realEstateCapitalPV;

    if (!withinTolerance(actualPV, expectedPV, expectedPV * 0.01)) {
      errors.push(
        `Real estate PV should use IE deflation (${expectedPV}); got ${actualPV}`
      );
    }

    const pvRatio = actualPV / row40.realEstateCapital;
    if (!withinTolerance(pvRatio, ieDefFactor, 0.001)) {
      errors.push('PV ratio at age 40 should match IE deflation factor, but it does not');
    }
    if (pvRatio <= arDefFactor * 5) {
      errors.push('PV ratio is too close to AR deflation factor, suggesting residency-country inflation was used');
    }

    if (!withinTolerance(row35.realEstateCapitalPV, row34.realEstateCapitalPV, 0.02)) {
      errors.push('PV should remain stable across relocation boundary (age 34 -> 35)');
    }
    if (!withinTolerance(row36.realEstateCapitalPV, row35.realEstateCapitalPV, 0.02)) {
      errors.push('PV should remain stable immediately after relocation (age 35 -> 36)');
    }

    const worthComponentsPV =
      (row40.realEstateCapitalPV || 0) +
      (row40.pensionFundPV || 0) +
      (function () {
        const m = row40.investmentCapitalByKeyPV || {};
        let t = 0;
        for (const k in m) { if (k === 'indexFunds' || k.indexOf('indexFunds_') === 0) t += m[k] || 0; }
        return t;
      })() +
      (function () {
        const m = row40.investmentCapitalByKeyPV || {};
        let t = 0;
        for (const k in m) { if (k === 'shares' || k.indexOf('shares_') === 0) t += m[k] || 0; }
        return t;
      })() +
      (row40.cashPV || 0);
    if (!withinTolerance(row40.worthPV || 0, worthComponentsPV, Math.max(1, Math.abs(worthComponentsPV) * 1e-6))) {
      errors.push('worthPV should equal the sum of asset PV components at age 40');
    }

    // Scenario: Missing linkedCountry should fall back to StartCountry (IE)
    const fallbackResult = await runScenario(createNoLinkedCountryScenario, () => ({
      ie: deepClone(IE_RULES)
    }));
    if (!fallbackResult.ok) {
      return { success: false, errors: [fallbackResult.error] };
    }
    const fallbackRow40 = findRowByAge(fallbackResult.rows, 40);
    if (!fallbackRow40) {
      return { success: false, errors: ['Missing age 40 row in fallback scenario'] };
    }
    const fallbackBase = 300000;
    const fallbackYears = 10;
    const fallbackNominal = fallbackBase * Math.pow(1.02, fallbackYears);
    const fallbackExpectedPV = fallbackNominal / Math.pow(1.02, fallbackYears);
    if (!withinTolerance(fallbackRow40.realEstateCapitalPV, fallbackExpectedPV, fallbackExpectedPV * 0.01)) {
      errors.push('Fallback property without linkedCountry should use StartCountry deflation for PV');
    }

    // Scenario: Multi-property portfolio with IE + AR assets
    const multiResult = await runScenario(createMultiPropertyScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildEuroARRules()
    }));
    if (!multiResult.ok) {
      return { success: false, errors: [multiResult.error] };
    }
    const multiRow32 = findRowByAge(multiResult.rows, 32);
    if (!multiRow32) {
      return { success: false, errors: ['Missing age 32 row in multi-property scenario'] };
    }
    const yearsMulti = 2;
    const valueIE = 400000 * Math.pow(1.02, yearsMulti);
    const valueAR = 200000 * Math.pow(1.50, yearsMulti);
    const expectedMultiNominal = valueIE + valueAR;
    const expectedMultiPV = valueIE / Math.pow(1.02, yearsMulti) + valueAR / Math.pow(1.50, yearsMulti);
    if (!withinTolerance(multiRow32.realEstateCapital, expectedMultiNominal, expectedMultiNominal * 0.01)) {
      errors.push('Multi-property nominal total mismatch at age 32');
    }
    if (!withinTolerance(multiRow32.realEstateCapitalPV, expectedMultiPV, expectedMultiPV * 0.01)) {
      errors.push('Multi-property PV should sum per-asset deflation contributions');
    }

    // Scenario: No real estate should keep PV aggregates at zero
    const emptyResult = await runScenario(createNoRealEstateScenario, () => ({
      ie: deepClone(IE_RULES)
    }));
    if (!emptyResult.ok) {
      return { success: false, errors: [emptyResult.error] };
    }
    const finalEmptyRow = emptyResult.rows[emptyResult.rows.length - 1];
    if (finalEmptyRow.realEstateCapitalPV !== 0) {
      errors.push('Scenario without properties should keep realEstateCapitalPV at 0');
    }

    return { success: errors.length === 0, errors };
  }
};
