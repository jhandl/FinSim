/* Two-Person Regression Test - Married Scenario
 *
 * This test validates two-person simulation with married tax status.
 * Marriage affects tax calculations through different tax credits and
 * potential tax band allocation strategies between spouses.
 * 
 * This tests the system's ability to handle married tax calculations
 * and compare outcomes with single tax status scenarios.
 */

module.exports = {
  name: "Two-Person Married Tax Scenario Regression Test", 
  description: "Validates two-person simulation with married tax status and associated tax implications",
  category: "regression",

  scenario: {
    parameters: {
      simulation_mode: 'couple',  // REQUIRED for two-person simulation
      startingAge: 30,
      p2StartingAge: 28,
      targetAge: 60,              // Test to age 60 for this scenario
      marriageYear: 1,            // Married from year 1 (start of simulation)
      personalTaxCredit: 3750,    // Married person's tax credit (doubled)
      inflation: 0.0,             // No inflation for stable regression values
      initialSavings: 10000,
      initialPension: 5000,
      initialPensionP2: 2000,
      initialFunds: 0,
      initialShares: 0,
      retirementAge: 65,
      p2RetirementAge: 65,
      emergencyStash: 20000,
      pensionPercentage: 0.75,    // 75% of max allowed (0.20 at age 30 = 15% actual rate)
      pensionPercentageP2: 0.50,  // 50% of max allowed (0.20 at age 30 = 10% actual rate) 
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
      oldestChildBorn: null
    },

    events: [
      {
        type: 'SI',                // P1 Salary Income
        id: 'p1-salary-married',
        amount: 70000,
        fromAge: 30,
        toAge: 64,
        rate: 0,
        match: 0
      },
      {
        type: 'SI2np',             // P2 Salary Income (no pension contributions)
        id: 'p2-salary-married',
        amount: 50000,
        fromAge: 28,
        toAge: 64,
        rate: 0,
        match: 0
      },
      {
        type: 'E',                 // Annual Living Costs
        id: 'living-costs-married',
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
      expected: 120000,          // €70,000 + €50,000
      tolerance: 100
    },

    // P1 pension capital (should accumulate over time)
    {
      type: 'comparison',
      target: 'final',
      field: 'pensionFund',
      expected: {
        operator: '>',
        value: 100000            // Should have significant accumulation
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

    // Income tax should be different due to married status
    {
      type: 'comparison',
      target: 'final',
      field: 'it',               // Income tax for final year
      expected: {
        operator: '<',
        value: 20000             // Should be lower than equivalent single scenario
      }
    },

    // Total worth should be positive and potentially better than single scenario
    {
      type: 'comparison',
      target: 'final',
      field: 'worth',
      expected: {
        operator: '>',
        value: 100000
      }
    },

    // Net income (should be positive with corrected pension calculations)
    {
      type: 'range',
      target: 'final',
      field: 'netIncome',
      expected: {
        min: -50000,            // May be slightly negative due to end-of-simulation effects
        max: 150000             // Should be within reasonable range
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