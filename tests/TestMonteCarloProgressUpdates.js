const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');

module.exports = {
  name: 'MonteCarloProgressUpdates',
  description: 'Ensures Monte Carlo emits progress updates from 0% to 100%.',
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
      StartCountry: 'ie',
      monteCarloRuns: 12
    };

    framework.ensureVMUIManagerMocks(params, []);
    await vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);

    vm.runInContext(`
      __progressUpdates = [];
      var __originalUpdateProgress = UIManager.prototype.updateProgress;
      UIManager.prototype.updateProgress = function(status, progress) {
        __progressUpdates.push({ status: status, progress: progress });
        if (__originalUpdateProgress) {
          return __originalUpdateProgress.call(this, status, progress);
        }
      };
    `, framework.simulationContext);

    const runPromise = vm.runInContext('run()', framework.simulationContext);
    if (runPromise && typeof runPromise.then === 'function') {
      await runPromise;
    }

    const result = vm.runInContext('({ success: success, failedAt: failedAt, updates: __progressUpdates })', framework.simulationContext);
    if (!result.success) {
      errors.push('Simulation failed at age ' + result.failedAt);
    }

    const updates = Array.isArray(result.updates) ? result.updates : [];
    if (updates.length < 2) {
      errors.push('Expected multiple progress updates, got ' + updates.length);
    }

    const numericUpdates = updates.filter(function (entry) {
      return entry && typeof entry.progress === 'number' && isFinite(entry.progress);
    });
    if (numericUpdates.length === 0) {
      errors.push('Expected numeric progress updates in Monte Carlo mode.');
    } else {
      const first = numericUpdates[0].progress;
      const last = numericUpdates[numericUpdates.length - 1].progress;
      if (Math.abs(first - 0) > 0.000001) {
        errors.push('Expected first numeric progress to be 0, got ' + first);
      }
      if (Math.abs(last - 1) > 0.000001) {
        errors.push('Expected final numeric progress to be 1, got ' + last);
      }
      for (let i = 1; i < numericUpdates.length; i++) {
        if (numericUpdates[i].progress < numericUpdates[i - 1].progress) {
          errors.push('Progress regressed between updates ' + (i - 1) + ' and ' + i);
          break;
        }
      }
    }

    return { success: errors.length === 0, errors: errors };
  }
};
