// @finsim-test-speed: slow
const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');

module.exports = {
  name: 'MoneyUnitOps',
  description: 'Unit tests for Money arithmetic operations with 1M ops benchmark',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const errors = [];

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    const ctx = framework.simulationContext;

    // Test 1: Money.create produces correct structure
    try {
      const created = vm.runInContext(`
        var m = Money.create(1000, 'EUR', 'ie');
        ({ amount: m.amount, currency: m.currency, country: m.country });
      `, ctx);
      if (created.amount !== 1000 || created.currency !== 'EUR' || created.country !== 'ie') {
        errors.push('Money.create structure incorrect');
      }
    } catch (err) {
      errors.push('Money.create failed: ' + err.message);
    }

    // Test 2: Money.add mutates target
    try {
      const added = vm.runInContext(`
        var m1 = Money.create(1000, 'EUR', 'ie');
        var m2 = Money.create(500, 'EUR', 'ie');
        Money.add(m1, m2);
        m1.amount;
      `, ctx);
      if (added !== 1500) {
        errors.push('Money.add should mutate target: expected 1500, got ' + added);
      }
    } catch (err) {
      errors.push('Money.add failed: ' + err.message);
    }

    // Test 3: Money.subtract mutates target
    try {
      const subtracted = vm.runInContext(`
        var m1 = Money.create(1000, 'EUR', 'ie');
        var m2 = Money.create(300, 'EUR', 'ie');
        Money.subtract(m1, m2);
        m1.amount;
      `, ctx);
      if (subtracted !== 700) {
        errors.push('Money.subtract should mutate target: expected 700, got ' + subtracted);
      }
    } catch (err) {
      errors.push('Money.subtract failed: ' + err.message);
    }

    // Test 4: Money.multiply mutates target
    try {
      const multiplied = vm.runInContext(`
        var m = Money.create(1000, 'EUR', 'ie');
        Money.multiply(m, 1.05);
        m.amount;
      `, ctx);
      if (Math.abs(multiplied - 1050) > 0.01) {
        errors.push('Money.multiply should mutate target: expected 1050, got ' + multiplied);
      }
    } catch (err) {
      errors.push('Money.multiply failed: ' + err.message);
    }

    // Test 5: Money.zero creates zero amount
    try {
      const zero = vm.runInContext(`
        var m = Money.zero('EUR', 'ie');
        m.amount;
      `, ctx);
      if (zero !== 0) {
        errors.push('Money.zero should create zero amount: got ' + zero);
      }
    } catch (err) {
      errors.push('Money.zero failed: ' + err.message);
    }

    // Test 6: Money.isZero detects zero
    try {
      const isZero = vm.runInContext(`
        var m = Money.zero('EUR', 'ie');
        Money.isZero(m);
      `, ctx);
      if (!isZero) {
        errors.push('Money.isZero should return true for zero amount');
      }
    } catch (err) {
      errors.push('Money.isZero failed: ' + err.message);
    }

    // Test 7: Money.isPositive detects positive
    try {
      const isPositive = vm.runInContext(`
        var m = Money.create(100, 'EUR', 'ie');
        Money.isPositive(m);
      `, ctx);
      if (!isPositive) {
        errors.push('Money.isPositive should return true for positive amount');
      }
    } catch (err) {
      errors.push('Money.isPositive failed: ' + err.message);
    }

    // Test 8: Money.clone creates independent copy
    try {
      const cloneTest = vm.runInContext(`
        var m1 = Money.create(1000, 'EUR', 'ie');
        var m2 = Money.clone(m1);
        m2.amount = 2000;
        m1.amount;
      `, ctx);
      if (cloneTest !== 1000) {
        errors.push('Money.clone should create independent copy: expected 1000, got ' + cloneTest);
      }
    } catch (err) {
      errors.push('Money.clone failed: ' + err.message);
    }

    // Test 9: 1M ops benchmark with numeric baseline comparison
    try {
      const bench = vm.runInContext(`
	        (function() {
	          function nowMs() { return Date.now(); }

	          function median(times) {
	            var sorted = times.slice().sort(function(a, b) { return a - b; });
	            var mid = Math.floor(sorted.length / 2);
	            if (sorted.length % 2 === 1) return sorted[mid];
	            return (sorted[mid - 1] + sorted[mid]) / 2;
	          }

	          function runNumbers(iterations) {
	            var n1 = 1000;
	            var n2 = 100;
	            var start = nowMs();
	            for (var i = 0; i < iterations; i++) {
	              n1 = n1 + n2;
	              n1 = n1 * 1.0001;
	            }
	            return { time: nowMs() - start, final: n1 };
	          }

	          function runObjectAmount(iterations) {
	            var o1 = { amount: 1000, currency: 'EUR', country: 'ie' };
	            var o2 = { amount: 100, currency: 'EUR', country: 'ie' };
	            var start = nowMs();
	            for (var i = 0; i < iterations; i++) {
	              o1.amount = o1.amount + o2.amount;
	              o1.amount = o1.amount * 1.0001;
	            }
	            return { time: nowMs() - start, final: o1.amount };
	          }

	          function runMoneyHotPath(iterations) {
	            var m1 = Money.create(1000, 'EUR', 'ie');
	            var m2 = Money.create(100, 'EUR', 'ie');
	            var start = nowMs();
	            for (var i = 0; i < iterations; i++) {
	              m1.amount = m1.amount + m2.amount;
	              m1.amount = m1.amount * 1.0001;
	            }
	            return { time: nowMs() - start, final: m1.amount };
	          }

	          function runMoneyHelpers(iterations) {
	            var m1 = Money.create(1000, 'EUR', 'ie');
	            var m2 = Money.create(100, 'EUR', 'ie');
	            var start = nowMs();
	            for (var i = 0; i < iterations; i++) {
	              Money.add(m1, m2);
	              Money.multiply(m1, 1.0001);
	            }
	            return { time: nowMs() - start, final: m1.amount };
	          }

	          // Stabilize Date.now() timing: scale iterations until baselines are measurable,
	          // but allow different iteration counts per path (Money helpers are much slower).
		          var minMs = 200;
	          var iterationsNumbers = 250000;
	          var probeNumbers = runNumbers(iterationsNumbers);
	          while (probeNumbers.time < minMs && iterationsNumbers < 100000000) {
	            iterationsNumbers = iterationsNumbers * 2;
	            probeNumbers = runNumbers(iterationsNumbers);
	          }

	          var iterationsHelpers = 25000;
	          var probeHelpers = runMoneyHelpers(iterationsHelpers);
	          while (probeHelpers.time < minMs && iterationsHelpers < 5000000) {
	            iterationsHelpers = iterationsHelpers * 2;
	            probeHelpers = runMoneyHelpers(iterationsHelpers);
	          }

	          // Multiple trials + median to reduce jitter.
	          var trials = 7;
	          var timesNumbers = [];
	          var timesObject = [];
	          var timesHot = [];
	          var timesHelpers = [];
	          var finalNumbers = null;
	          var finalObject = null;
	          var finalHot = null;
	          var finalHelpers = null;

	          // Warmup each path briefly (helps reduce first-run effects).
		          runNumbers(100000);
		          runObjectAmount(100000);
		          runMoneyHotPath(100000);
		          runMoneyHelpers(100000);

		          for (var t = 0; t < trials; t++) {
		            var rN = runNumbers(iterationsNumbers);
		            var rO = runObjectAmount(iterationsNumbers);
		            var rH = runMoneyHotPath(iterationsNumbers);
		            var rM = runMoneyHelpers(iterationsHelpers);
		            timesNumbers.push(rN.time);
		            timesObject.push(rO.time);
		            timesHot.push(rH.time);
		            timesHelpers.push(rM.time);
		            finalNumbers = rN.final;
		            finalObject = rO.final;
		            finalHot = rH.final;
		            finalHelpers = rM.final;
		          }

		          var medianNumbers = median(timesNumbers);
		          var medianObject = median(timesObject);
		          var medianHot = median(timesHot);
		          var medianHelpers = median(timesHelpers);

		          // Timing stability check: flag noisy runs where Date.now() jitter dominates.
		          var varianceNumbers = 0;
		          for (var i = 0; i < timesNumbers.length; i++) {
		            var delta = timesNumbers[i] - medianNumbers;
		            varianceNumbers += delta * delta;
		          }
		          varianceNumbers = varianceNumbers / timesNumbers.length;
		          // CV = standard deviation / mean (not variance / mean)
		          var cvNumbers = Math.sqrt(varianceNumbers) / medianNumbers;

		          return {
		            iterationsNumbers: iterationsNumbers,
		            iterationsHelpers: iterationsHelpers,
		            trials: trials,
		            medianNumbersMs: medianNumbers,
		            medianObjectMs: medianObject,
		            medianMoneyHotMs: medianHot,
		            medianMoneyHelpersMs: medianHelpers,
		            cvNumbers: cvNumbers,
		            finalNumbers: finalNumbers,
		            finalObject: finalObject,
		            finalMoneyHot: finalHot,
		            finalMoneyHelpers: finalHelpers
		          };
		        })()
		      `, ctx);

      // Sanity: operations executed (all variants should increase from 1000).
      if (bench.finalNumbers <= 1000 || bench.finalObject <= 1000 || bench.finalMoneyHot <= 1000 || bench.finalMoneyHelpers <= 1000) {
        errors.push('Benchmark did not modify amounts correctly');
      }

      if (typeof bench.cvNumbers === 'number' && bench.cvNumbers > 0.5) {
        errors.push('Timing too unstable (CV=' + (bench.cvNumbers * 100).toFixed(1) + '%), results unreliable');
      }

      // Assertions: compare per-iteration timings (iterations differ per path).
      var numbersPerIter = bench.medianNumbersMs / bench.iterationsNumbers;
      var objectPerIter = bench.medianObjectMs / bench.iterationsNumbers;
      var hotPerIter = bench.medianMoneyHotMs / bench.iterationsNumbers;
      var helpersPerIter = bench.medianMoneyHelpersMs / bench.iterationsHelpers;

      var objectOverhead = objectPerIter / numbersPerIter;
      var helpersVsHotOverhead = helpersPerIter / hotPerIter;

      if (objectOverhead > 5.0) {
        errors.push(
          'Benchmark regression: object .amount loop too slow vs numbers: ' +
          bench.medianObjectMs + 'ms vs ' + bench.medianNumbersMs + 'ms (' +
          (objectOverhead * 100).toFixed(1) + '% of baseline per-iter, expected <= 500%).'
        );
      }

      // Money helper overhead is expected to be large (function calls + mismatch checks).
      // This guard is only intended to catch catastrophic slowdowns.
      if (helpersVsHotOverhead > 500.0) {
        errors.push(
          'Benchmark regression: Money.add/multiply too slow vs Money hot-path: ' +
          bench.medianMoneyHelpersMs + 'ms (' + bench.iterationsHelpers + ' iters) vs ' +
          bench.medianMoneyHotMs + 'ms (' + bench.iterationsNumbers + ' iters), overhead=' +
          (helpersVsHotOverhead * 100).toFixed(1) + '% per-iter (expected <= 50000%).'
        );
      }

      // Benchmark results are validated via assertions above, no output needed
    } catch (err) {
      errors.push('1M ops benchmark failed: ' + err.message);
    }

    return { success: errors.length === 0, errors: errors };
  }
};
