class TestRealEstate {

  setUp() {
    super.setUp();
    params = {inflation: 0.02};
    periods = 0;
  }

  assertClose(actual, expected, message) {
    const epsilon = 0.01;
    if (Math.abs(actual - expected) > epsilon) {
      throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
  }

  testPropertyPurchase() {
    this.setUp();
    const property = new Property();
    property.buy(100000, 0.03); // 100k purchase with 3% appreciation
    
    this.assertClose(property.getValue(), 100000, "Initial property value should match purchase price");
    
    property.addYear();
    // Value should increase by appreciation + inflation: 100000 * (1.03 + 0.02)
    this.assertClose(property.getValue(), 105000, "Property value after 1 year should include appreciation and inflation");
  }

  testMortgageCalculation() {
    this.setUp();
    const property = new Property();
    
    // 300k mortgage over 30 years at 3.5% with 1000/month payment
    property.mortgage(30, 0.035, 1000);
    
    // Monthly payment of 1000 at 3.5% over 30 years should finance ~209,461
    this.assertClose(property.borrowed, 209461, "Mortgage principal calculation failed");
    this.assertClose(property.getPayment(), 1000, "Monthly payment should match input");
    
    // After 15 years (halfway)
    for (let i = 0; i < 15; i++) property.addYear();
    this.assertClose(property.fractionRepaid, 0.5, "Mortgage repayment fraction after 15/30 years");
  }

  testPropertyPortfolio() {
    this.setUp();
    const portfolio = new RealEstate();
    
    // Add two properties
    portfolio.buy("home", 100000, 0.03);
    portfolio.buy("rental", 150000, 0.04);
    
    this.assertClose(portfolio.getTotalValue(), 250000, "Portfolio total value should sum all properties");
    
    // Add mortgage to rental property
    portfolio.mortgage("rental", 20, 0.035, 1000);
    
    // Sell home property
    const salePrice = portfolio.sell("home");
    this.assertClose(salePrice, 100000, "Property sale value should match current value");
    this.assertClose(portfolio.getTotalValue(), 150000, "Portfolio should update after sale");
  }

  testPropertyAppreciation() {
    this.setUp();
    const portfolio = new RealEstate();
    
    // Property with 100k down payment, 3% appreciation
    portfolio.buy("home", 100000, 0.03);
    
    // Add 200k mortgage over 30 years at 3.5% with 1000/month payment
    portfolio.mortgage("home", 30, 0.035, 1000);
    
    // Initial value should be down payment + borrowed amount
    const borrowed = portfolio.properties["home"].borrowed;
    this.assertClose(portfolio.getValue("home"), 100000 + borrowed, "Initial value should include down payment and mortgage");
    
    // After 5 years
    for (let i = 0; i < 5; i++) portfolio.addYear();
    
    // Value should reflect:
    // 1. Original value appreciated at 3% + 2% inflation for 5 years
    // 2. Mortgage repayment fraction (5/30)
    const expectedValue = adjust(100000 + borrowed * (5/30), 0.03, 5);
    this.assertClose(portfolio.getValue("home"), expectedValue, "Property value should reflect appreciation and mortgage repayment");
  }

  testNonExistentProperty() {
    this.setUp();
    const portfolio = new RealEstate();
    
    this.assertClose(portfolio.getValue("nonexistent"), 0, "Non-existent property should return 0 value");
    this.assertClose(portfolio.getPayment("nonexistent"), 0, "Non-existent property should return 0 payment");
    this.assertClose(portfolio.sell("nonexistent"), 0, "Selling non-existent property should return 0");
  }

  runTests() {
    const tests = [
      'testPropertyPurchase',
      'testMortgageCalculation',
      'testPropertyPortfolio',
      'testPropertyAppreciation',
      'testNonExistentProperty'
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