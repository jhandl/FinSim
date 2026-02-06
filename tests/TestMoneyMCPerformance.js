// @finsim-test-speed: slow
const { TestFramework } = require('../src/core/TestFramework.js');

module.exports = {
  name: 'MoneyMCPerformance',
  description: 'Validates Money refactor does not slow down 2500-simulation Monte Carlo runs by >5%',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const errors = [];

    const scenario = {
      name: 'MCPerfTest',
      description: 'Performance regression test for Money refactor',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 35, // Short 5-year test
          retirementAge: 65,
          initialSavings: 10000,
          initialPension: 0,
          initialFunds: 5000,
          initialShares: 5000,
          emergencyStash: 10000,
          FundsAllocation: 0.5,
          SharesAllocation: 0.5,
          pensionPercentage: 0,
          pensionCapped: "No",
          growthRatePension: 0.05,
          growthDevPension: 0,
          growthRateFunds: 0.07,
          growthDevFunds: 0.15,
          growthRateShares: 0.08,
          growthDevShares: 0.20,
          inflation: 0.02,
          StartCountry: 'ie',
          simulation_mode: 'single',
          economy_mode: 'montecarlo',
          monteCarloRuns: 2500
        },
        events: [
          { type: 'SI', id: 'salary', amount: 50000, fromAge: 30, toAge: 35, rate: 0.03, match: 0 }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenario)) {
      return { success: false, errors: ['Failed to load scenario'] };
    }

    const results = await framework.runSimulation();

    if (!results || !results.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    if (!results.montecarlo || results.runs !== 2500) {
      return { success: false, errors: ['Expected Monte Carlo mode with 2500 runs (gate not exercised)'] };
    }

    // Performance gate: average ms per Monte Carlo simulation must remain within 5% of baseline.
    // Baseline (pre-cleanup): ~0.83ms per simulation for this 5-year scenario (see docs/money-performance-baseline.md).
    const baselineAvgMsPerSim = 0.83;
    const maxAvgMsPerSim = baselineAvgMsPerSim * 1.05;
    const avgMsPerSim = results.executionTime / results.runs;
    if (avgMsPerSim > maxAvgMsPerSim) {
      errors.push(
        `MC performance regression: avg ${avgMsPerSim.toFixed(4)}ms/sim exceeds ${maxAvgMsPerSim.toFixed(4)}ms/sim (baseline ${baselineAvgMsPerSim.toFixed(2)}ms/sim, +5%)`
      );
    }

    return {
      success: errors.length === 0,
      errors: errors,
      performance: {
        totalTime: results.executionTime,
        runsCompleted: results.runs,
        avgTimePerRun: avgMsPerSim.toFixed(4),
        baselineAvgMsPerSim: baselineAvgMsPerSim,
        maxAvgMsPerSim: maxAvgMsPerSim
      }
    };
  }
};
