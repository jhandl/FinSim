/* Two-Person Regression Test - Different Income Profile
 *
 * This test validates two-person simulation with different income profiles:
 * P1: Lower salary (55K) with higher pension contribution (20%)
 * P2: Higher salary (85K) with lower pension contribution (5%)
 * 
 * This tests the system's ability to handle asymmetric financial scenarios
 * between partners with different earning and saving patterns.
 */

module.exports = {
  name: "Two-Person Different Income Profile Regression Test",
  description: "Validates two-person simulation with different income and pension contribution profiles",
  category: "regression",

  scenario: {
    parameters: {
      simulation_mode: 'couple',  // REQUIRED for two-person simulation
      startingAge: 30,
      p2StartingAge: 28,
      targetAge: 60,              // Test to age 60 for this scenario
      marriageYear: 0,            // Not married for tax simplicity
      personalTaxCredit: 1875,
      inflation: 0.0,             // No inflation for stable regression values
      initialSavings: 10000,
      initialPension: 5000,
      initialPensionP2: 2000,
      initialFunds: 0,
      initialShares: 0,
      retirementAge: 65,
      p2RetirementAge: 65,
      emergencyStash: 20000,
      pensionPercentage: 1.0,     // 100% of max allowed (0.20 at age 30 = 20% actual rate)
      pensionPercentageP2: 0.25,  // 25% of max allowed (0.20 at age 30 = 5% actual rate)
      pensionCapped: "No",
      statePensionWeekly: 250,
      p2StatePensionWeekly: 230,
      growthRatePension: 0.04,    // Deterministic growth rates
      growthDevPension: 0.0,
      growthRateFunds: 0.05,
      growthDevFunds: 0.0,
      growthRateShares: 0.06,
      growthDevShares: 0.0,
      FundsAllocation: 0,         // No other investments for simplicity
      SharesAllocation: 0,
      priorityCash: 1,
      priorityPension: 4,
      priorityFunds: 2,
      priorityShares: 3,
      youngestChildBorn: null,
      oldestChildBorn: null,
      StartCountry: 'ie'
    },

    events: [
      {
        type: 'SI',                // P1 Salary Income (Lower salary)
        id: 'p1-salary-lower',
        amount: 55000,
        fromAge: 30,
        toAge: 64,
        rate: 0,
        match: 0
      },
      {
        type: 'SI2np',             // P2 Salary Income (Higher salary, no pension)
        id: 'p2-salary-higher',
        amount: 85000,
        fromAge: 28,
        toAge: 64,
        rate: 0,
        match: 0
      },
      {
        type: 'E',                 // Annual Living Costs
        id: 'living-costs',
        amount: 30000,
        fromAge: 30,
        toAge: 89,
        rate: 0,
        match: 0
      }
    ]
  },

  assertions: [
    // P1 age at target
    {
      type: 'exact_value',
      target: 'final',
      field: 'age',
      expected: 60,
      tolerance: 0
    },

    // Test combined salaries are recorded correctly
    {
      type: 'exact_value',
      target: 'final',
      field: 'incomeSalaries',
      expected: 140000,          // €55,000 + €85,000
      tolerance: 100
    },

    // P1 pension capital (higher contribution rate despite lower salary)
    {
      type: 'comparison',
      target: 'final',
      field: 'pensionFund',
      expected: {
        operator: '>',
        value: 100000            // Should have accumulation over 30 years
      }
    },

    // Cash position (should be positive with corrected pension calculations)
    {
      type: 'range',
      target: 'final',
      field: 'cash',
      expected: {
        min: 100000,
        max: 2000000
      }
    },

    // Total worth should be positive (combined higher income should offset expenses)
    {
      type: 'comparison',
      target: 'final',
      field: 'worth',
      expected: {
        operator: '>',
        value: 150000
      }
    },

    // Simulation should complete successfully
    {
      type: 'comparison',
      target: 'final',
      field: 'age',
      expected: {
        operator: '>=',
        value: 59
      }
    }
  ]
}; 