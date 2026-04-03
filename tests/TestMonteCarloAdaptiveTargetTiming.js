// @finsim-test-speed: slow
const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');

module.exports = {
  name: 'MonteCarloAdaptiveTargetTiming',
  description: 'Validates adaptive Monte Carlo total runtime stays within 10% of configured target time.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const errors = [];

    const targetSeconds = 5;
    const maxRelativeError = 0.10;

    const scenario = {
      name: 'MCAdaptiveTargetTiming',
      description: 'End-to-end runtime validation for adaptive Monte Carlo targeting',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 55,
          retirementAge: 65,
          initialSavings: 100000,
          initialPension: 20000,
          initialFunds: 30000,
          initialShares: 40000,
          emergencyStash: 25000,
          FundsAllocation: 0.45,
          SharesAllocation: 0.55,
          pensionPercentage: 0.10,
          pensionCapped: 'No',
          growthRatePension: 0.05,
          growthDevPension: 0.08,
          growthRateFunds: 0.06,
          growthDevFunds: 0.14,
          growthRateShares: 0.08,
          growthDevShares: 0.20,
          inflation: 0.02,
          StartCountry: 'ie',
          simulation_mode: 'single',
          economy_mode: 'montecarlo'
        },
        events: [
          { type: 'SI', id: 'salary', amount: 70000, fromAge: 30, toAge: 55, rate: 0.03, match: 0.05 },
          { type: 'E', id: 'living', amount: 38000, fromAge: 30, toAge: 55, rate: 0.02, match: 0 },
          { type: 'SM', id: 'shock', amount: -0.20, fromAge: 37, toAge: 37, rate: 0, match: 0 },
          { type: 'R', id: 'rent', amount: 12000, fromAge: 36, toAge: 55, rate: 0.01, match: 0 }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenario)) {
      return { success: false, errors: ['Failed to load scenario'] };
    }

    framework.ensureVMUIManagerMocks(
      framework.currentTest.scenario.parameters,
      framework.currentTest.scenario.events
    );
    framework.currentTest.scenario.parameters.monteCarloRuns = null;
    await vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);
    const minRuns = vm.runInContext('Config.getInstance().monteCarloMinRuns', framework.simulationContext);
    vm.runInContext(`Config.getInstance().monteCarloTargetSeconds = ${targetSeconds};`, framework.simulationContext);

    const result = await framework.runSimulation();
    if (!result || !result.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const actualSeconds = result.executionTime / 1000;
    const relativeError = Math.abs(actualSeconds - targetSeconds) / targetSeconds;

    if (!result.montecarlo) {
      errors.push('Expected Monte Carlo mode to be active.');
    }
    if (typeof result.runs !== 'number' || result.runs < minRuns) {
      errors.push('Expected adaptive Monte Carlo run count with minimum ' + minRuns + ' runs, got ' + result.runs);
    }
    if (relativeError > maxRelativeError) {
      errors.push(
        `Adaptive timing mismatch: target ${targetSeconds.toFixed(2)}s, actual ${actualSeconds.toFixed(2)}s, error ${(relativeError * 100).toFixed(1)}%, runs=${result.runs}`
      );
    }

    return {
      success: errors.length === 0,
      errors: errors,
      timing: {
        targetSeconds: targetSeconds,
        actualSeconds: actualSeconds,
        relativeError: relativeError,
        runs: result.runs
      }
    };
  }
};
