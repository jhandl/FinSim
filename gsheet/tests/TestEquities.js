class TestEquities extends TestCase {

  setUp() {
    super.setUp();
    revenue = new Revenue();
    revenue.reset();
    params = {inflation: 0.02};
    periods = 0;
    stockGrowthOverride = undefined; // Disable random growth for testing
  }

  assertClose(actual, expected, message) {
    const epsilon = 0.01;
    if (Math.abs(actual - expected) > epsilon) {
      throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
  }

  testBasicEquityOperations() {
    this.setUp();
    const equity = new Equity(0.33, 0.05); // 33% CGT, 5% growth
    
    equity.buy(10000);
    this.assertClose(equity.capital(), 10000, "Initial capital should match purchase amount");
    
    equity.addYear();
    // Growth should be exactly 5% without randomness
    this.assertClose(equity.capital(), 10500, "Capital after 1 year should reflect growth rate");
    
    const sold = equity.sell(5000);
    this.assertClose(sold, 5000, "Sold amount should match requested amount");
    this.assertClose(equity.capital(), 5500, "Remaining capital should reflect partial sale");
  }

  testETFDeemedDisposal() {
    this.setUp();
    const etf = new ETF(0.05); // 5% growth
    etf.buy(10000);
    
    // Simulate 8 years for deemed disposal
    for (let i = 0; i < 8; i++) {
      etf.addYear();
    }
    
    // After 8 years at 5% growth: 10000 * (1.05)^8 = 14775.09
    // Gains = 4775.09, taxed at 41% (ETF rate)
    this.assertClose(revenue.gains[config.etfExitTax], 4775.09, 
      "ETF deemed disposal should trigger gains tax after 8 years");
    
    // Capital should be reset to new base after deemed disposal
    this.assertClose(etf.portfolio[0].amount, 14775.09, 
      "ETF base cost should be reset after deemed disposal");
    this.assertClose(etf.portfolio[0].interest, 0, 
      "ETF gains should be reset after deemed disposal");
  }

  testInvestmentTrustGains() {
    this.setUp();
    const trust = new InvestmentTrust(0.05); // 5% growth
    trust.buy(10000);
    
    trust.addYear();
    // Sell entire position
    const sold = trust.sell(trust.capital());
    
    // After 1 year at 5% growth: gains = 500
    this.assertClose(revenue.gains[config.cgtRate], 500, 
      "Investment trust should apply standard CGT rate to gains");
  }

  testPensionWithdrawals() {
    this.setUp();
    const pension = new Pension(0.05);
    pension.buy(100000);
    
    // Test lump sum withdrawal (25% tax-free limit)
    const lumpSum = pension.getLumpsum();
    this.assertClose(lumpSum, 25000, "Pension lump sum should be 25% of total");
    this.assertClose(revenue.privatePensionLumpSum, 25000, 
      "Lump sum should be declared as pension lump sum income");
    
    // Test minimum drawdown (4% at age 60-70)
    age = 65;
    const drawdown = pension.drawdown();
    const expectedDrawdown = pension.capital() * 0.04;
    this.assertClose(drawdown, expectedDrawdown, 
      "Pension drawdown should match minimum requirement for age");
    this.assertClose(revenue.privatePension, expectedDrawdown, 
      "Drawdown should be declared as pension income");
  }

  testPartialSales() {
    this.setUp();
    const equity = new Equity(0.33, 0.05);
    
    // Buy in two tranches
    equity.buy(10000);
    equity.addYear(); // First tranche grows for a year
    equity.buy(5000);
    equity.addYear(); // Both tranches grow for a year
    
    // Sell partial amount
    const sold = equity.sell(8000);
    this.assertClose(sold, 8000, "Partial sale amount should match requested");
    
    // Verify FIFO order (First In, First Out)
    const remainingCapital = equity.capital();
    this.assertClose(remainingCapital, 8925, 
      "Remaining capital should reflect FIFO sale order");
  }

  testMultipleGrowthPeriods() {
    this.setUp();
    const equity = new Equity(0.33, 0.05);
    equity.buy(10000);
    
    // Simulate 5 years of growth
    for (let i = 0; i < 5; i++) {
      equity.addYear();
    }
    
    // 10000 * (1.05)^5 = 12762.82
    this.assertClose(equity.capital(), 12762.82, 
      "Capital should compound correctly over multiple years");
  }

  runTests() {
    const tests = [
      'testBasicEquityOperations',
      'testETFDeemedDisposal',
      'testInvestmentTrustGains',
      'testPensionWithdrawals',
      'testPartialSales',
      'testMultipleGrowthPeriods'
    ];
    
    let passed = 0;
    for (const test of tests) {
      try {
        this[test]();
        console.log(`✓ ${test} passed`);
        passed++;
      } catch (e) {
        console.error(`✗ ${test} failed: ${e.message}`);
      }
    }
    console.log(`${passed}/${tests.length} tests passed`);
  }
}