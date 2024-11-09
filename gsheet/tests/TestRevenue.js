
class TestRevenue extends TestCase {

  setUp() {
    super.setUp();
    params = {personalTaxCredit: 1650};
    revenue = new Revenue();
    age = 40;
    year = 2024;
    periods = 0;
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

  testCGTWithLosses() {
    this.setUp();
    revenue.reset();
    revenue.declareInvestmentGains(-500, 0.33);  // Loss
    revenue.declareInvestmentGains(2000, 0.41);  // ETF gains
    revenue.declareInvestmentGains(1000, 0.33);  // Regular gains
    revenue.computeCGT();
    // Total gains = 3000, losses = 500, relief = 1270
    // Total losses = 500
    // ETF gains - relief (can't apply losses) = 2000 - 1270 = 730
    // Regular gains - losses - remaining relief = 1000 - 500 - 0 = 500
    // Total tax = 730 * 0.41 + 500 * 0.33 = 464.3
    this.assertClose(revenue.cgt, 464.3, "CGT calculation with losses failed");
  }

  runTests() {
    super.runTests([
      'testBasicIncomeTax',
      'testMarriedIncomeTax',
      'testPRSIExemption',
      'testUSCReducedRates',
      'testPensionContributions',
      'testCGTExemption',
      'testCGTWithLosses'
    ])
  }

}