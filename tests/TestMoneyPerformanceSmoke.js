const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');

module.exports = {
  name: 'MoneyPerformanceSmoke',
  description: 'Lightweight Money vs legacy loop microbenchmark with overhead guardrail.',
  isCustomTest: true,
  runCustomTest: async function() {
    const errors = [];
    const framework = new TestFramework();

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    const perfResult = vm.runInContext(`
      (function() {
        var holdingsCount = 150;
        var growth = 0.05;

        function runLegacyUntil(targetMs) {
          var portfolio = [];
          for (var i = 0; i < holdingsCount; i++) {
            portfolio.push({ amount: 1000, interest: 0 });
          }
          var start = Date.now();
          var iterations = 0;
          var maxIterations = 200000;
          while ((Date.now() - start) < targetMs && iterations < maxIterations) {
            for (var j = 0; j < holdingsCount; j++) {
              var holding = portfolio[j];
              var growthAmount = (holding.amount + holding.interest) * growth;
              holding.interest += growthAmount;
            }
            iterations++;
          }
          return { ms: Date.now() - start, iterations: iterations };
        }

        function runMoney(iterations) {
          var portfolio = [];
          for (var i = 0; i < holdingsCount; i++) {
            portfolio.push({
              principal: Money.create(1000, 'EUR', 'ie'),
              interest: Money.create(0, 'EUR', 'ie')
            });
          }
          var start = Date.now();
          for (var y = 0; y < iterations; y++) {
            for (var j = 0; j < holdingsCount; j++) {
              var holding = portfolio[j];
              var growthAmount = (holding.principal.amount + holding.interest.amount) * growth;
              holding.interest.amount += growthAmount;
            }
          }
          return Date.now() - start;
        }

        var targetMs = 150;
        var baseline = runLegacyUntil(targetMs);
        var iterations = baseline.iterations;
        function runStatePension(iterations) {
          var person = new Person('P1', {
            startingAge: 70,
            retirementAge: 65,
            statePensionWeekly: 289,
            statePensionCurrency: 'EUR',
            statePensionCountry: 'ie',
            pensionContributionPercentage: 0
          }, { inflation: 0.02, StartCountry: 'ie' }, { growthRatePension: 0.05, growthDevPension: 0 });

          var start = Date.now();
          for (var i = 0; i < iterations; i++) {
            person.calculateYearlyPensionIncome({ params: { inflation: 0.02 } }, 'ie', 'EUR', 2024);
          }
          return Date.now() - start;
        }

        var statePensionIterations = 10000;
        return { legacy: baseline.ms, money: runMoney(iterations), statePension: { iterations: statePensionIterations, ms: runStatePension(statePensionIterations) } };
      })()
    `, framework.simulationContext);

    if (!perfResult || perfResult.legacy == null || perfResult.money == null) {
      errors.push('Performance test failed to capture timing results');
    } else {
      const minBaselineMs = 20;
      if (perfResult.legacy >= minBaselineMs) {
        const overhead = ((perfResult.money - perfResult.legacy) / perfResult.legacy) * 100;
        if (overhead > 5) {
          errors.push(`Money overhead ${overhead.toFixed(2)}% exceeds 5%`);
        }
      }
    }

    return { success: errors.length === 0, errors: errors };
  }
};
