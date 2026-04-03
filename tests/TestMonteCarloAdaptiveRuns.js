const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');

module.exports = {
  name: 'MonteCarloAdaptiveRuns',
  description: 'Validates adaptive Monte Carlo run sizing from first 10 runs with configured minimum runs.',
  isCustomTest: true,
  runCustomTest: async function () {
    const framework = new TestFramework();
    const errors = [];

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    const params = {
      startingAge: 30,
      targetAge: 35,
      retirementAge: 65,
      initialSavings: 10000,
      initialPension: 0,
      initialFunds: 0,
      initialShares: 10000,
      emergencyStash: 0,
      FundsAllocation: 0,
      SharesAllocation: 1,
      priorityCash: 1,
      priorityFunds: 2,
      priorityShares: 3,
      priorityPension: 4,
      pensionPercentage: 0,
      pensionCapped: 'No',
      statePensionWeekly: 0,
      growthRateFunds: 0.05,
      growthDevFunds: 0,
      growthRateShares: 0.05,
      growthDevShares: 0.2,
      growthRatePension: 0.02,
      growthDevPension: 0,
      inflation: 0,
      simulation_mode: 'single',
      economy_mode: 'montecarlo',
      economyMode: 'montecarlo',
      StartCountry: 'ie'
    };

    framework.ensureVMUIManagerMocks(params, []);
    await vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);
    const minRuns = vm.runInContext('Config.getInstance().monteCarloMinRuns', framework.simulationContext);

    vm.runInContext(`
      __fakeNow = 0;
      __simCallCount = 0;
      __originalDateNow = Date.now;
      Date.now = function() { return __fakeNow; };

      var __originalRunSimulation = runSimulation;
      runSimulation = async function() {
        __simCallCount += 1;
        __fakeNow += 50; // 50ms per simulated run
        return await __originalRunSimulation();
      };
    `, framework.simulationContext);

    // 32.5s target and 50ms/run => 650 runs after 10-run benchmark
    await vm.runInContext(`
      Config.getInstance().monteCarloTargetSeconds = 32.5;
      testParams.monteCarloRuns = null;
    `, framework.simulationContext);
    await vm.runInContext('run()', framework.simulationContext);
    const adaptiveResult = vm.runInContext('({ runs: monteCarloRunsExecuted, calls: __simCallCount, montecarlo: montecarlo })', framework.simulationContext);

    if (!adaptiveResult.montecarlo) {
      errors.push('Expected Monte Carlo mode to be enabled for adaptive sizing test.');
    }
    if (adaptiveResult.runs !== 650) {
      errors.push('Expected adaptive run count 650, got ' + adaptiveResult.runs);
    }
    if (adaptiveResult.calls !== 650) {
      errors.push('Expected 650 simulation calls, got ' + adaptiveResult.calls);
    }

    // 2s target and 50ms/run => 40 estimated, but floor is configured minimum runs
    await vm.runInContext(`
      __fakeNow = 0;
      __simCallCount = 0;
      Config.getInstance().monteCarloTargetSeconds = 2;
      testParams.monteCarloRuns = null;
    `, framework.simulationContext);
    await vm.runInContext('run()', framework.simulationContext);
    const minResult = vm.runInContext('({ runs: monteCarloRunsExecuted, calls: __simCallCount })', framework.simulationContext);

    if (minResult.runs !== minRuns) {
      errors.push('Expected configured minimum runs (' + minRuns + '), got ' + minResult.runs);
    }
    if (minResult.calls !== minRuns) {
      errors.push('Expected simulation calls to match configured minimum runs (' + minRuns + '), got ' + minResult.calls);
    }

    return { success: errors.length === 0, errors: errors };
  }
};
