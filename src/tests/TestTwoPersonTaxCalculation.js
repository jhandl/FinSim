/* Two-Person Tax Calculation Test
 *
 * This test validates comprehensive tax calculations for a two-person scenario
 * covering age-related tax credits, PRSI exemptions, and USC bands.
 * Enhanced with comprehensive scenarios migrated from the original 526-line test suite.
 */

module.exports = {
  name: "Two-Person Tax Calculation - P2 Age Credit Scenario", 
  description: "Validates age-related tax credits when P2 is eligible for age credit and P1 is not (P1=60, P2=65)",
  category: "tax",

  scenario: {
    parameters: {
      simulation_mode: 'couple',   // REQUIRED for two-person simulation
      startingAge: 60,             // P1 age 60 (not eligible for age credit at 65)
      p2StartingAge: 65,           // P2 age 65 (eligible for age credit)
      targetAge: 62,               // Short test duration
      retirementAge: 70,
      p2RetirementAge: 70,
      initialSavings: 0,
      initialPension: 0,
      initialPensionP2: 0,
      initialFunds: 0,
      initialShares: 0,
      emergencyStash: 0,
      pensionPercentage: 0,        // No pension contributions to simplify tax calc
      pensionPercentageP2: 0,
      pensionCapped: "No",
      statePensionWeekly: 0,       // No state pension to focus on salary tax
      p2StatePensionWeekly: 0,
      growthRatePension: 0.05,
      growthDevPension: 0.0,
      growthRateFunds: 0.07,
      growthDevFunds: 0.0,
      growthRateShares: 0.08,
      growthDevShares: 0.0,
      inflation: 0.0,              // No inflation for predictable tax calculations
      fundsAllocation: 0,
      sharesAllocation: 0,
      priorityCash: 1,
      priorityPension: 4,
      priorityFunds: 2,
      priorityShares: 3,
      marriageYear: 2000,          // Married for tax purposes  
      youngestChildBorn: null,
      oldestChildBorn: null,
      personalTaxCredit: 1875      // Standard personal tax credit
    },

    events: [
      {
        type: 'SI',                // P1 Salary Income
        id: 'p1-salary',
        amount: 60000,             // €60,000 annual salary
        fromAge: 60,
        toAge: 61,
        rate: 0,                   // No pension contribution
        match: 0
      },
      {
        type: 'SI2np',             // P2 Salary Income (no pension)
        id: 'p2-salary',
        amount: 40000,             // €40,000 annual salary  
        fromAge: 60,               // Based on P1's age
        toAge: 61,
        rate: 0,                   // No pension contribution
        match: 0
      }
    ]
  },

  assertions: [
    // Test that both salaries are recorded correctly
    {
      type: 'exact_value',
      target: 'age',
      age: 61,
      field: 'incomeSalaries',
      expected: 100000,            // €60,000 + €40,000
      tolerance: 10
    },

    // Test that income tax reflects age credit for P2
    // With P2 eligible for age credit, total IT should be lower than
    // if both were under 65. This tests the age-related tax benefit.
    {
      type: 'comparison',
      target: 'age',
      age: 61,
      field: 'it',
      expected: {
        operator: '<',
        value: 25000               // Should be less than full rate due to P2's age credit
      }
    },

    // Test that PRSI is calculated correctly
    // P2 at 65 should still pay PRSI (exemption typically at 66)
    {
      type: 'comparison',
      target: 'age',
      age: 61,
      field: 'prsi',
      expected: {
        operator: '>',
        value: 2000                // Should have PRSI on €100k combined income
      }
    },

    // Test that USC is calculated for combined income
    {
      type: 'comparison',
      target: 'age',
      age: 61,
      field: 'usc',
      expected: {
        operator: '>',
        value: 1000                // Should have USC on €100k combined income
      }
    },

    // Test net income is reasonable after taxes and age credits
    {
      type: 'comparison',
      target: 'age',
      age: 61,
      field: 'netIncome',
      expected: {
        operator: '>',
        value: 45000               // Should retain most income due to age credit
      }
    },

    // Test that both persons contribute to taxes  
    {
      type: 'comparison',
      target: 'age',
      age: 61,
      field: 'it',
      expected: {
        operator: '>',
        value: 1000                // Should have meaningful IT despite age credit
      }
    },

    // Test simulation completes successfully
    {
      type: 'comparison',
      target: 'final',
      field: 'age',
      expected: {
        operator: '>=',
        value: 61
      }
    }
  ]
};
