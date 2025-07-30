// Gen-AI Coder Prompt:
// "Create a test named 'Market Crash Impact' that validates the impact of negative market returns. 
// Set up parameters: €100,000 in index funds, standard volatility settings. 
// Add events: Stock market override to achieve -25% annual returns from age 70-72. 
// Assert that: index fund values decrease by 25% each year during crash period, recovery begins after crash period ends, 
// and withdrawal calculations adjust to reduced portfolio values."

const TestMarketCrashImpact = {
  name: "Market Crash Impact",
  description: "Validates the impact of a stock market crash override achieving -25% annual returns on index funds.",
  scenario: {
    parameters: {
      startingAge: 68,        
      targetAge: 75,          
      initialSavings: 10000,      
      initialFunds: 100000,       
      initialShares: 0,         
      growthRateFunds: 0, // Set to 0 to test MRO in isolation
      growthRateShares: 0,   
      pensionGrowthRate: 0,  
      inflation: 0           
    },
    events: [
      {
        type: "SM", // Stock Market Growth override to simulate bull or bear markets
        id: "indexFundsCrash",  
        fromAge: 69,           // SM event affects growth starting the next year (age 70)
        toAge: 71,             // SM event affects growth through age 72             
        rate: -0.578125, // Total rate over 3-year period that yields -25% annually when annualized
        amount: 0,             
        match: 0               
      }
    ]
  },
  assertions: [
    // Age 69: Before crash period. With growthRateFunds = 0, value stays at initial 100,000.
    {
      type: "exact_value",
      target: "age", 
      age: 69,
      field: "indexFundsCapital",
      expected: 100000, // Initial value, 0% base growth
      tolerance: 1
    },
    // Age 70: First year of -25% annual growth override.
    {
      type: "exact_value",
      target: "age", 
      age: 70,
      field: "indexFundsCapital",
      expected: 100000 * 0.75, // 75000 after first -25% year
      tolerance: 1
    },
    // Age 72: Third year of -25% annual growth override.
    // Year 1 (age 70): 100000 * 0.75 = 75000
    // Year 2 (age 71): 75000 * 0.75 = 56250  
    // Year 3 (age 72): 56250 * 0.75 = 42187.5
    {
      type: "exact_value",
      target: "age", 
      age: 72,
      field: "indexFundsCapital",
      expected: 100000 * 0.75 * 0.75 * 0.75, // 42187.5 after three -25% years
      tolerance: 1
    },
    // Age 73: Override ended, back to 0% base growth rate.
    {
      type: "exact_value",
      target: "age", 
      age: 73,
      field: "indexFundsCapital",
      expected: 100000 * 0.75 * 0.75 * 0.75, // Still 42187.5 (no growth)
      tolerance: 1
    }
  ]
};

// Export the test scenario
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestMarketCrashImpact;
} 