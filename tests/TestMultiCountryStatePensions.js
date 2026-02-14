// Multi-country state pension test: period multipliers + PV deflation per country.

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

function findRowByAge(rows, age) {
  return rows.find(row => Math.round(row.age) === age);
}

function buildARRules(statePensionPeriod) {
  const clone = deepClone(AR_RULES);
  if (!clone.locale) clone.locale = {};
  clone.locale.currencyCode = 'ARS';
  clone.locale.currencySymbol = '$';
  if (!clone.economicData) clone.economicData = {};
  if (!clone.economicData.inflation) clone.economicData.inflation = {};
  clone.economicData.inflation.cpi = 10;
  clone.economicData.inflation.year = 2025;
  if (!clone.economicData.exchangeRate) clone.economicData.exchangeRate = {};
  clone.economicData.exchangeRate.perEur = 1;
  clone.economicData.exchangeRate.asOf = '2025-01-01';
  if (!clone.pensionRules) clone.pensionRules = {};
  clone.pensionRules.statePensionPeriod = statePensionPeriod;
  return clone;
}

function createScenario() {
  return {
    name: 'MultiCountryStatePensions',
    description: 'IE weekly + AR monthly state pensions with per-country PV deflation',
    scenario: {
      parameters: {
        startingAge: 60,
        targetAge: 67,
        retirementAge: 70,
        initialSavings: 0,
        initialPension: 0,
        initialFunds: 0,
        initialShares: 0,
        emergencyStash: 0,
        pensionPercentage: 0,
        statePensionWeekly: 300,
        inflation: 0.02,
        growthRateFunds: 0,
        growthDevFunds: 0,
        growthRateShares: 0,
        growthDevShares: 0,
        growthRatePension: 0,
        growthDevPension: 0,
        FundsAllocation: 0,
        SharesAllocation: 0,
        priorityCash: 1,
        priorityFunds: 2,
        priorityShares: 3,
        priorityPension: 4,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economyMode: 'deterministic',
        relocationEnabled: true,
        statePensionByCountry: {
          ie: 300,
          ar: 50000
        }
      },
      events: [
        { type: 'MV', name: 'AR', id: 'Move_AR', amount: 0, fromAge: 60, toAge: 60, currency: 'EUR', rate: 0 }
      ]
    },
    assertions: []
  };
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

module.exports = {
  name: 'MultiCountryStatePensions',
  description: 'Validates period multipliers and per-country PV deflation for multi-state pensions',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];
    const startingAge = 60;
    const ageToCheck = 66;
    const periods = ageToCheck - startingAge;
    const ieInflation = 0.02;
    const arInflation = 0.10;

    const ieAnnual = 52 * 300 * Math.pow(1 + ieInflation, periods);
    const arAnnualMonthly = 12 * 50000 * Math.pow(1 + arInflation, periods);
    const arAnnualYearly = 1 * 50000 * Math.pow(1 + arInflation, periods);

    // Scenario 1: AR monthly period
    const monthlyResult = await runScenario(createScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildARRules('monthly')
    }));
    if (!monthlyResult.ok) {
      return { success: false, errors: [monthlyResult.error] };
    }
    const monthlyRow = findRowByAge(monthlyResult.rows, ageToCheck);
    if (!monthlyRow) {
      return { success: false, errors: ['Missing required age ' + ageToCheck + ' in monthly scenario'] };
    }
    const expectedMonthlyTotal = ieAnnual + arAnnualMonthly;
    if (!withinTolerance(monthlyRow.incomeStatePension, expectedMonthlyTotal, expectedMonthlyTotal * 0.001)) {
      errors.push(
        `Monthly-period state pension total mismatch at age ${ageToCheck} (expected ~${expectedMonthlyTotal.toFixed(2)}; got ${monthlyRow.incomeStatePension.toFixed(2)})`
      );
    }

    // PV should deflate per-country: IE uses 2%, AR uses 10%
    const expectedPV = (52 * 300) + (12 * 50000);
    if (!withinTolerance(monthlyRow.incomeStatePensionPV, expectedPV, expectedPV * 0.001)) {
      errors.push(
        `State pension PV mismatch at age ${ageToCheck} (expected ~${expectedPV.toFixed(2)}; got ${monthlyRow.incomeStatePensionPV.toFixed(2)})`
      );
    }

    // Scenario 2: AR yearly period (multiplier = 1)
    const yearlyResult = await runScenario(createScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildARRules('yearly')
    }));
    if (!yearlyResult.ok) {
      return { success: false, errors: [yearlyResult.error] };
    }
    const yearlyRow = findRowByAge(yearlyResult.rows, ageToCheck);
    if (!yearlyRow) {
      return { success: false, errors: ['Missing required age ' + ageToCheck + ' in yearly scenario'] };
    }
    const expectedYearlyTotal = ieAnnual + arAnnualYearly;
    if (!withinTolerance(yearlyRow.incomeStatePension, expectedYearlyTotal, expectedYearlyTotal * 0.001)) {
      errors.push(
        `Yearly-period state pension total mismatch at age ${ageToCheck} (expected ~${expectedYearlyTotal.toFixed(2)}; got ${yearlyRow.incomeStatePension.toFixed(2)})`
      );
    }

    return { success: errors.length === 0, errors: errors };
  }
};
