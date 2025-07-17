/* Test for One-off Expense (E1) Event Type
 * 
 * This test verifies that E1 (one-off expense) events work correctly in the simulation:
 * 1. E1 events are processed as expenses at the specified age
 * 2. E1 events reduce available funds appropriately
 * 3. E1 events behave identically to 'E' events with fromAge == toAge
 * 4. Backward compatibility: legacy 'E' events with fromAge == toAge are converted to 'E1'
 */

const { TestFramework, AssertionTypes, TargetTypes } = require('../core/TestFramework');

const testDefinition = {
  name: "One-off Expense E1 Event Type Test",
  description: "Test E1 event type functionality and backward compatibility",
  
  scenario: {
    parameters: {
      startingAge: 30,
      targetAge: 35,
      initialSavings: 50000,
      initialPension: 0,
      initialFunds: 0,
      initialShares: 0,
      retirementAge: 65,
      emergencyStash: 10000,
      FundsAllocation: 0.6,
      SharesAllocation: 0.4,
      pensionContributionPercentage: 0.05,
      pensionContributionCapped: true,
      statePensionWeekly: 289,
      growthRatePension: 0.05,
      growthDevPension: 0.0,
      growthRateFunds: 0.06,
      growthDevFunds: 0.0,
      growthRateShares: 0.08,
      growthDevShares: 0.0,
      inflation: 0,
      priorityCash: 1,
      priorityPension: 4,
      priorityFunds: 2,
      priorityShares: 3,
      marriageYear: null,
      youngestChildBorn: null,
      oldestChildBorn: null,
      personalTaxCredit: 1875
    },
    
    events: [
      // Regular salary income
      {
        type: 'SI',
        id: 'test-salary',
        amount: 60000,
        fromAge: 30,
        toAge: 34,
        rate: 0,
        match: 0
      },
      // Regular annual expenses
      {
        type: 'E',
        id: 'regular-expenses',
        amount: 35000,
        fromAge: 30,
        toAge: 34,
        rate: 0,
        match: 0
      },
      // One-off expense using new E1 type
      {
        type: 'E1',
        id: 'car-purchase',
        amount: 25000,
        fromAge: 32,
        toAge: 32,  // Should equal fromAge for E1
        rate: 0,    // Zero rate to avoid inflation adjustment for testing
        match: ''   // Not used for expenses
      },
      // Legacy one-off expense using E type (should be converted to E1)
      {
        type: 'E',
        id: 'home-renovation',
        amount: 15000,
        fromAge: 33,
        toAge: 33,  // Same as fromAge - should be converted to E1
        rate: 0,    // Zero rate to avoid inflation adjustment for testing
        match: ''
      }
    ]
  },
  
  assertions: [
    // Test that E1 expense is applied at age 32
    {
      type: AssertionTypes.EXACT_VALUE,
      target: TargetTypes.AGE,
      age: 32,
      field: 'expenses',
      expected: 35000 + 25000, // Regular expenses + E1 one-off expense
      tolerance: 1,
      description: 'E1 one-off expense should be applied at age 32'
    },

    // Test that legacy E expense with fromAge==toAge is applied at age 33
    {
      type: AssertionTypes.EXACT_VALUE,
      target: TargetTypes.AGE,
      age: 33,
      field: 'expenses',
      expected: 35000 + 15000, // Regular expenses + legacy one-off expense
      tolerance: 1,
      description: 'Legacy E one-off expense should be applied at age 33'
    },

    // Test that no one-off expenses are applied at other ages
    {
      type: AssertionTypes.EXACT_VALUE,
      target: TargetTypes.AGE,
      age: 31,
      field: 'expenses',
      expected: 35000, // Only regular expenses
      tolerance: 1,
      description: 'Only regular expenses should be applied at age 31'
    },

    {
      type: AssertionTypes.EXACT_VALUE,
      target: TargetTypes.AGE,
      age: 34,
      field: 'expenses',
      expected: 35000, // Only regular expenses
      tolerance: 1,
      description: 'Only regular expenses should be applied at age 34'
    },

    // Test that cash is reduced appropriately when one-off expenses occur
    {
      type: AssertionTypes.COMPARISON,
      target: TargetTypes.AGE,
      age: 32,
      field: 'cash',
      expected: { operator: '<', value: 50000 }, // Should be less than initial savings
      description: 'Cash should be reduced after E1 one-off expense at age 32'
    },

    // Test that the simulation completes successfully
    {
      type: AssertionTypes.COMPARISON,
      target: TargetTypes.FINAL,
      field: 'cash',
      expected: { operator: '>', value: 0 },
      description: 'Final cash should be positive'
    }
  ]
};

module.exports = testDefinition;
