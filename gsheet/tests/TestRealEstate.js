class TestRealEstate extends TestCase {

  setUp() {
    super.setUp();
    params = {inflation: 0.02};
    periods = 0;
  }

  testPropertyPurchase() {
    this.setUp();
    const property = new Property();
    property.buy(100000, 0.03); // 100k purchase with 3% appreciation
    
    this.assertClose(property.getValue(), 100000, "Initial property value should match purchase price");
    
    property.addYear();
    // Value should increase by appreciation + inflation: 100000 * 1.03
    this.assertClose(property.getValue(), 103000, "Property value after 1 year should include appreciation");
  }

  testMortgageCalculation() {
    this.setUp();
    const property = new Property();
    
    // 300k property, 100K down payment + 200k mortgage over 30 years at 4% with 954.83/month payment
    property.buy(100000,0);
    property.mortgage(30, 0.04, 12*954.83);
    
    this.assertClose(property.borrowed, 200000, "Mortgage principal calculation failed", 0.5);
    this.assertClose(property.getPayment(), 12*954.83, "Monthly payment should match input");
    
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
    
    // Add 200k mortgage over 30 years at 3.5% with 954.83/month payment
    portfolio.mortgage("home", 30, 0.04, 12*954.83);
    
    // Initial value should be down payment + borrowed amount
    const borrowed = portfolio.properties["home"].borrowed;
    this.assertClose(portfolio.getValue("home"), 100000, "Initial value should be the down payment");
    
    // After 5 years
    for (let i = 0; i < 5; i++) portfolio.addYear();
    
    // Value should reflect:
    // 1. Original value appreciated at 3% inflation for 5 years
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
    super.runTests([
      'testPropertyPurchase',
      'testMortgageCalculation',
      'testPropertyPortfolio',
      'testPropertyAppreciation',
      'testNonExistentProperty'
    ])
  }

}