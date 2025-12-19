const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');
const perfHooks = require('perf_hooks');

module.exports = {
  name: 'MoneyPerfSmoke',
  description: 'CI smoke: runs MoneyPerfTest() with reduced iterations and enforces overhead vs plain object.',
  isCustomTest: true,
  runCustomTest: async function() {
    const framework = new TestFramework();
    const errors = [];

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    // MoneyPerfTest uses performance.now(); provide Node perf_hooks inside the VM.
    framework.simulationContext.performance = perfHooks.performance;

    const result = vm.runInContext(
      `
      (function() {
        var originalLog = console.log;
        console.log = function() {};
        try {
          var iters = 2000000;
          var r = MoneyPerfTest({
            iterations: iters,
            warmupIterations: 200000,
            holdingsCount: 120,
            years: 250
          });
          r._effectiveIterations = iters;
          return r;
        } finally {
          console.log = originalLog;
        }
      })()
    `,
      framework.simulationContext
    );

    if (!result || typeof result.overheadStructVsObject !== 'number' || !isFinite(result.overheadStructVsObject)) {
      errors.push('MoneyPerfTest did not return a numeric overheadStructVsObject');
    } else {
      const maxOverheadPct = 5;
      if (result.overheadStructVsObject > maxOverheadPct) {
        errors.push(
          `Money overhead vs plain object ${result.overheadStructVsObject.toFixed(2)}% exceeds ${maxOverheadPct}% (iters=${result._effectiveIterations})`
        );
      }
    }

    return { success: errors.length === 0, errors: errors, performance: result };
  }
};
