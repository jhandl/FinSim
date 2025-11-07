// Custom test for deflation utilities in Utils.js

module.exports = {
  name: 'DeflationUtils',
  description: 'Validates deflate() and getDeflationFactor() present-value helpers',
  isCustomTest: true,
  runCustomTest: async function() {
    const { TestFramework } = require('../src/core/TestFramework.js');
    const vm = require('vm');

    const framework = new TestFramework();
    const testResults = { success: true, errors: [] };

    try {
      if (!framework.loadCoreModules()) {
        return { success: false, errors: ['Failed to load core modules'] };
      }

      // 1) Direct deflate tests using explicit rate and n
      var v1 = vm.runInContext('deflate(110, 0.10, 1)', framework.simulationContext);
      if (Math.abs(v1 - 100) > 1e-6) { testResults.success = false; testResults.errors.push('deflate 1y @10% failed'); }

      var v2 = vm.runInContext('deflate(121, 0.10, 2)', framework.simulationContext);
      if (Math.abs(v2 - 100) > 1e-6) { testResults.success = false; testResults.errors.push('deflate 2y @10% failed'); }

      // 1a) n = 0 returns identity
      var v0 = vm.runInContext('deflate(123.45, 0.25, 0)', framework.simulationContext);
      if (Math.abs(v0 - 123.45) > 1e-12) { testResults.success = false; testResults.errors.push('deflate n=0 identity failed'); }

      // 2) Defaults: params.inflation and global periods
      vm.runInContext('params = { inflation: 0.02, startingAge: 30 }; periods = 5;', framework.simulationContext);
      var v3 = vm.runInContext('deflate(110.40808)', framework.simulationContext); // 100 * (1.02^5) = 110.40808
      if (Math.abs(v3 - 100) > 1e-4) { testResults.success = false; testResults.errors.push('deflate default args failed'); }

      // 2a) getDeflationFactor fallback to params.inflation when inflationRate is missing
      var fFallback = vm.runInContext('getDeflationFactor(35, null, null)', framework.simulationContext); // n = 5
      var expectedFFallback = 1 / Math.pow(1.02, 5);
      if (Math.abs(fFallback - expectedFFallback) > 1e-8) { testResults.success = false; testResults.errors.push('getDeflationFactor fallback inflation failed'); }

      // 3) getDeflationFactor with age-based n (age - params.startingAge)
      var f1 = vm.runInContext('getDeflationFactor(35, null, 0.02)', framework.simulationContext); // n = 5
      var expectedF1 = 1 / Math.pow(1.02, 5);
      if (Math.abs(f1 - expectedF1) > 1e-8) { testResults.success = false; testResults.errors.push('getDeflationFactor age-based failed'); }

      // 4) getDeflationFactor with year-based fallback (year - startYear)
      vm.runInContext('params = { inflation: 0.02 };', framework.simulationContext);
      var f2 = vm.runInContext('getDeflationFactor(2023, 2020, 0.02)', framework.simulationContext); // n = 3
      var expectedF2 = 1 / Math.pow(1.02, 3);
      if (Math.abs(f2 - expectedF2) > 1e-8) { testResults.success = false; testResults.errors.push('getDeflationFactor year-based failed'); }

      // 5) Missing inputs return factor 1 (n resolves to 0)
      var fMissing = vm.runInContext('getDeflationFactor("", "", null)', framework.simulationContext);
      if (Math.abs(fMissing - 1) > 1e-12) { testResults.success = false; testResults.errors.push('getDeflationFactor missing inputs should return 1'); }

      // 6) Sanity: adjust() and deflate() are inverses
      vm.runInContext('params = { inflation: 0.03 }; periods = 7;', framework.simulationContext);
      var adj = vm.runInContext('adjust(100, 0.03, 7)', framework.simulationContext);
      var back = vm.runInContext('deflate(' + adj + ', 0.03, 7)', framework.simulationContext);
      if (Math.abs(back - 100) > 1e-8) { testResults.success = false; testResults.errors.push('adjust/deflate inverse sanity check failed'); }

      return testResults;

    } catch (e) {
      return { success: false, errors: [e.message] };
    }
  }
};


