const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');

module.exports = {
  name: 'MortgagePrincipalCoherence',
  description: 'Validates amortized remaining principal, equity valuation, settlement behavior, and zero-rate mortgages.',
  isCustomTest: true,
  runCustomTest: async function () {
    const framework = new TestFramework();
    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    const resultJson = vm.runInContext(`
      (function () {
        var errors = [];

        function approxEqual(actual, expected, tolerance, label) {
          if (Math.abs(actual - expected) > tolerance) {
            errors.push(label + ': expected ' + expected + ', got ' + actual);
          }
        }

        // Main amortization path: 280k principal over 25 years at 3.5%
        var principal = 280000;
        var years = 25;
        var rate = 0.035;
        var r = rate / 12;
        var n = years * 12;
        var c = Math.pow(1 + r, n);
        var monthlyPayment = principal * r * c / (c - 1);
        var annualPayment = monthlyPayment * 12;

        var re = new RealEstate();
        re.buy('home', 70000, 0.03, 'EUR', 'ie');
        re.mortgage('home', years, rate, annualPayment, 'EUR', 'ie');

        for (var i = 0; i < 5; i++) re.addYear();

        var k = 5 * 12;
        var growth = Math.pow(1 + r, k);
        var expectedRemaining = principal * growth - monthlyPayment * ((growth - 1) / r);
        var remaining = re.getRemainingPrincipal('home');
        approxEqual(remaining, expectedRemaining, 0.01, 'Remaining principal after 5 years');

        var expectedMarketValue = (70000 + principal) * Math.pow(1.03, 5);
        var expectedEquity = expectedMarketValue - expectedRemaining;
        var value = re.getValue('home');
        approxEqual(value, expectedEquity, 0.01, 'Equity value should be market minus remaining principal');

        var basisBefore = re.getPurchaseBasis('home');
        var payoff = re.settleMortgage('home');
        var basisAfter = re.getPurchaseBasis('home');
        var postSettleValue = re.getValue('home');

        approxEqual(payoff, expectedRemaining, 0.01, 'Mortgage payoff should equal remaining principal');
        approxEqual(basisBefore, 350000, 0.01, 'Purchase basis before settlement');
        approxEqual(basisAfter, 350000, 0.01, 'Purchase basis should remain stable after settlement');
        approxEqual(postSettleValue, expectedMarketValue, 0.01, 'Post-settlement value should be full market value');

        // Zero-rate path: borrowed amount and remaining principal should be linear.
        var reZero = new RealEstate();
        reZero.buy('zero', 20000, 0, 'EUR', 'ie');
        reZero.mortgage('zero', 10, 0, 12000, 'EUR', 'ie'); // 1k/month => 120k principal
        for (var z = 0; z < 3; z++) reZero.addYear();

        var zeroRemaining = reZero.getRemainingPrincipal('zero');
        var expectedZeroRemaining = 120000 - (1000 * 36);
        approxEqual(zeroRemaining, expectedZeroRemaining, 0.01, 'Zero-rate remaining principal after 3 years');

        return JSON.stringify({ success: errors.length === 0, errors: errors });
      })();
    `, framework.simulationContext);

    return JSON.parse(resultJson);
  }
};
