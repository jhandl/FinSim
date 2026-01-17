const { TestFramework } = require('../src/core/TestFramework.js');

function buildBaseParams() {
  return {
    startingAge: 30,
    targetAge: 35,
    initialSavings: 0,
    initialPension: 0,
    initialFunds: 0,
    initialShares: 0,
    retirementAge: 65,
    emergencyStash: 10000,
    pensionPercentage: 0,
    pensionCapped: "No",
    statePensionWeekly: 0,
    growthRatePension: 0.05,
    growthDevPension: 0.0,
    growthRateFunds: 0.07,
    growthDevFunds: 0.0,
    growthRateShares: 0.08,
    growthDevShares: 0.0,
    inflation: 0.02,
    priorityCash: 1,
    priorityPension: 4,
    priorityFunds: 2,
    priorityShares: 3,
    marriageYear: null,
    youngestChildBorn: null,
    oldestChildBorn: null,
    StartCountry: 'ie',
    simulation_mode: 'single',
    economy_mode: 'deterministic'
  };
}

function buildEvents() {
  return [
    {
      type: 'SI',
      id: 'TestSalary',
      amount: 50000,
      fromAge: 30,
      toAge: 34,
      rate: 0,
      match: 0
    }
  ];
}

function getIncomeTax(result, age) {
  if (!result || !Array.isArray(result.dataSheet)) return null;
  const row = result.dataSheet.find(r => r && r.age === age);
  if (!row) return null;
  if (row.taxByKey && row.taxByKey.incomeTax !== undefined) return row.taxByKey.incomeTax;
  if (row.it !== undefined) return row.it;
  return null;
}

async function runScenario(params, events) {
  const framework = new TestFramework();
  if (!framework.loadCoreModules()) {
    return { error: 'Failed to load core modules' };
  }
  const result = await framework.executeCoreSimulation(params, events);
  return result ? { result } : { error: 'Simulation failed to run' };
}

module.exports = {
  name: "Generic Tax Credits",
  description: "Validates generic tax credit overrides by country",
  category: "tax",
  isCustomTest: true,

  runCustomTest: async function () {
    const errors = [];
    const events = buildEvents();

    const baselineParams = buildBaseParams();
    const baselineRun = await runScenario(baselineParams, events);
    if (baselineRun.error) {
      return { success: false, errors: [baselineRun.error] };
    }
    const baselineTax = getIncomeTax(baselineRun.result, 31);
    if (!Number.isFinite(baselineTax)) {
      return { success: false, errors: ['Baseline income tax missing or invalid'] };
    }

    const ignoredParams = buildBaseParams();
    ignoredParams.taxCreditsByCountry = { ie: { personal: '' } };
    const ignoredRun = await runScenario(ignoredParams, events);
    if (!ignoredRun.result) {
      return { success: false, errors: ['Ignore-credit scenario failed'] };
    }
    const ignoredTax = getIncomeTax(ignoredRun.result, 31);
    if (!Number.isFinite(ignoredTax) || Math.abs(ignoredTax - baselineTax) > 1e-6) {
      errors.push('Empty credit override should not change income tax');
    }

    const zeroParams = buildBaseParams();
    zeroParams.taxCreditsByCountry = { ie: { personal: 0, employee: 0 } };
    const zeroRun = await runScenario(zeroParams, events);
    if (!zeroRun.result) {
      return { success: false, errors: ['Zero-credit scenario failed'] };
    }
    const zeroTax = getIncomeTax(zeroRun.result, 31);
    if (!Number.isFinite(zeroTax) || zeroTax <= baselineTax) {
      errors.push('Zeroed credits should increase income tax');
    }

    const overrideParams = buildBaseParams();
    overrideParams.taxCreditsByCountry = { ie: { personal: 2000, employee: 2500 } };
    const overrideRun = await runScenario(overrideParams, events);
    if (!overrideRun.result) {
      return { success: false, errors: ['Override-credit scenario failed'] };
    }
    const overrideTax = getIncomeTax(overrideRun.result, 31);
    if (!Number.isFinite(overrideTax) || overrideTax >= baselineTax) {
      errors.push('Higher credits should reduce income tax');
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};
