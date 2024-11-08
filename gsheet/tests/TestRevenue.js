
class TestRevenue extends TestCase {

  setUp() {
    super.setUp();
    params = {personalTaxCredit: 1650};
    revenue = new Revenue();
    age = 40;
    year = 2024;
    periods = 0;
  }

  assertClose(actual, expected, message) {
    const epsilon = 0.01;
    if (Math.abs(actual - expected) > epsilon) {
      throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
  }

  testBasicIncomeTax() {
    this.setUp();
    revenue.reset();
    revenue.declareSalaryIncome(50000, 0);
    revenue.computeIT();
    // 35000 * 0.2 + 15000 * 0.4 - (1650 + 1000) = 10350
    this.assertClose(revenue.it, 10350, "Basic income tax calculation failed");
  }

  testMarriedIncomeTax() {
    this.setUp();
    params.marriageYear = 2020;
    revenue.reset();
    revenue.declareSalaryIncome(50000, 0);
    revenue.declareSalaryIncome(30000, 0);
    revenue.computeIT();
    // Using married bands + increase: (44000 + 25000) at 20%, rest at 40%
    // (69000 * 0.2 + 11000 * 0.4) - (1650 + 2*1000) = 14550
    this.assertClose(revenue.it, 14550, "Married income tax calculation failed");
  }

  testPRSIExemption() {
    this.setUp();
    age = 71;
    revenue.reset();
    revenue.declareSalaryIncome(50000, 0);
    revenue.computePRSI();
    this.assertClose(revenue.prsi, 0, "PRSI age exemption failed");
  }

  testUSCReducedRates() {
    this.setUp();
    age = 71;
    revenue.reset();
    revenue.declareSalaryIncome(50000, 0);
    revenue.computeUSC();
    // Should use reduced bands as income < 60000 and age > 70
    this.assertClose(revenue.usc, 
      12012 * 0.005 + (50000 - 12012) * 0.02,
      "USC reduced rates calculation failed");
  }

  testPensionContributions() {
    this.setUp();
    revenue.reset();
    revenue.declareSalaryIncome(120000, 0.1);
    revenue.computeIT();
    // Pension relief should be limited to 100000
    this.assertClose(revenue.pensionContribRelief, 10000, 
      "Pension contribution relief limit failed");
  }

  testCGTExemption() {
    this.setUp();
    revenue.reset();
    revenue.declareInvestmentGains(2000, 0.33);
    revenue.computeCGT();
    // Only (2000 - 1270) should be taxed
    this.assertClose(revenue.cgt, 240.9, "CGT exemption calculation failed");
  }

  testMultipleGainRates() {
    this.setUp();
    revenue.reset();
    revenue.declareInvestmentGains(1000, 0.41); // ETF gains
    revenue.declareInvestmentGains(2000, 0.33); // Regular gains
    revenue.computeCGT();
    // ETF gains should be taxed first (higher rate)
    // (1000 * 0.41) + (730 * 0.33) = 650.9
    this.assertClose(revenue.cgt, 650.9, "Multiple CGT rates calculation failed");
  }

  runTests() {
    const tests = [
      'testBasicIncomeTax',
      'testMarriedIncomeTax',
      'testPRSIExemption',
      'testUSCReducedRates',
      'testPensionContributions',
      'testCGTExemption',
      'testMultipleGainRates'
    ];
    
    let passed = 0;
    for (const test of tests) {
      try {
        this[test]();
        console.log(`✓ ${test} passed`);
        passed++;
      } catch (e) {
        console.error(`✗ ${test}: ${e.message}`);
      }
    }
    console.log(`${passed}/${tests.length} tests passed`);
  }
}