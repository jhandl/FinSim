class TestEquities extends TestCase {

  setUp() {
    super.setUp();
    revenue = new Revenue();
    revenue.reset();
    params = {inflation: 0.02};
    periods = 0;
    stockGrowthOverride = undefined; // Disable random growth for testing
  }

  testBasicEquityOperations() {
    this.setUp();
    const equity = new Equity(0.33, 0.05); // 33% CGT, 5% growth
    
    equity.buy(10000);
    assertClose(equity.capital(), 10000, "Initial capital should match purchase amount");
    
    equity.addYear();
    // Growth should be exactly 5% without randomness
    assertClose(equity.capital(), 10500, "Capital after 1 year should reflect growth rate");
    
    const sold = equity.sell(5000);
    assertClose(sold, 5000, "Sold amount should match requested amount");
    assertClose(equity.capital(), 5500, "Remaining capital should reflect partial sale");
  }

  testETFDeemedDisposal() {
    this.setUp();
    if (config.etfDeemedDisposalYears > 0) {
      const etf = new ETF(0.05); // 5% growth
      const start = 10000;
      const years = config.etfDeemedDisposalYears;
      etf.buy(start);
      
      // Simulate necessary years for deemed disposal
      for (let i = 0; i < years; i++) {
        etf.addYear();
      }
      
      const end = 10000 * (1.05 ** years)
      const gains = end - start;

      assertClose(revenue.gains[config.etfExitTax], gains, "ETF deemed disposal should trigger exit tax after "+years+" years");
      assertClose(etf.portfolio[0].amount, end, "ETF base cost should be reset after deemed disposal");
      assertClose(etf.portfolio[0].interest, 0, "ETF gains should be reset after deemed disposal");
    }
  }

  testInvestmentTrustGains() {
    this.setUp();
    const trust = new InvestmentTrust(0.05); // 5% growth
    trust.buy(10000);
    
    trust.addYear();
    // Sell entire position
    const sold = trust.sell(trust.capital());
    
    // After 1 year at 5% growth: gains = 500
    assertClose(revenue.gains[config.cgtRate], 500, 
      "Investment trust should apply standard CGT rate to gains");
  }

  testPensionWithdrawals() {
    this.setUp();
    const pension = new Pension(0.05);
    pension.buy(100000);
    
    // Test lump sum withdrawal (25% tax-free limit)
    const lumpSum = pension.getLumpsum();
    assertClose(lumpSum, 25000, "Pension lump sum should be 25% of total");
    assertClose(revenue.privatePensionLumpSum, 25000, 
      "Lump sum should be declared as pension lump sum income");
    
    // Test minimum drawdown (4% at age 60-70) from the remaining 75000.
    age = 65;
    const expectedDrawdown = pension.capital() * 0.04;
    const drawdown = pension.drawdown();
    assertClose(drawdown, expectedDrawdown, 
      "Pension drawdown should match minimum requirement for age");
    assertClose(revenue.privatePension, expectedDrawdown, 
      "Drawdown should be declared as pension income");
  }

  testPartialSales() {
    this.setUp();
    const equity = new Equity(0.33, 0.05);
    
    // First tranche
    equity.buy(10000);
    equity.addYear(); // Grows to 10500
    
    // Second tranche
    equity.buy(5000);
    equity.addYear(); // First grows to 11025, second grows to 5250
    
    // Sell amount that crosses tranches
    // If FIFO: Should sell from first tranche (11025) which has higher gains
    // If LIFO: Would sell from second tranche (5250) which has lower gains
    // If proportional: Would mix gains from both tranches
    const sold = equity.sell(8000);
    assertClose(sold, 8000, "Partial sale amount should match requested");

    // Check gains - should reflect FIFO order
    // Original cost basis for sold portion: 10000 * (8000/11025) = 7255.33
    // From first tranche: (8000 - 10000 * (8000/11025)) = 743.76 gain
    assertClose(revenue.gains[config.cgtRate], 743.76, "Gains should reflect selling from oldest tranche first (FIFO)");
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
    assertClose(equity.capital(), 12762.82, 
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