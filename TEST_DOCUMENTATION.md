# FinSim Test Suite Documentation

## Table of Contents
1. [Quick Start Guide](#quick-start-guide)
2. [Running Tests](#running-tests)
3. [Understanding Test Results](#understanding-test-results)
4. [Adding New Tests](#adding-new-tests)
5. [Test Structure and Framework](#test-structure-and-framework)
6. [Debugging Failed Tests](#debugging-failed-tests)
7. [Troubleshooting Common Issues](#troubleshooting-common-issues)
8. [Best Practices](#best-practices)
9. [CI/CD Integration](#cicd-integration)

---

## Quick Start Guide

### Prerequisites
- **Node.js** installed and available in PATH
- Working directory must be the `src/` folder
- Core simulation files must be present in `src/core/`

### Running Tests
```bash
cd /path/to/FinSim/src
./run-tests.sh [TestName|--list|--help]
```

#### Run All Tests
```bash
./run-tests.sh
```

#### Run Specific Test by Name
```bash
./run-tests.sh TestBasicTaxCalculation
```

#### List Available Tests
```bash
./run-tests.sh --list
```

### Test Categories

The test suite includes several categories of tests:

#### **Core Functionality Tests**
- `TestBasicTaxCalculation` - Irish tax system validation
- `TestPensionContributionValidation` - Pension contributions and matching
- `TestInvestmentAllocationStrategy` - Investment allocation logic
- `TestIrishTaxSystem` - Comprehensive Irish tax system tests

#### **Real-World Scenario Tests**
- `TestRetirementPhaseTransition` - Retirement transition scenarios
- `TestRealEstateTransaction` - Property purchase/sale scenarios
- `TestMultipleIncomeStreams` - Complex income scenarios
- `TestMortgageAmortization` - Mortgage calculations
- `TestStatePensionIntegration` - State pension integration

#### **Edge Case and Robustness Tests**
- `TestBoundaryConditions` - Edge cases and limits
- `TestAccuracyRobustness` - Long-term precision validation
- `TestEmergencyFundUsage` - Insufficient funds scenarios

#### **Integration and Regression Tests**
- `TestLifeScenarios` - Full lifetime simulations
- `TestRegression` - Regression prevention tests
- `TestRegressionSinglePerson` - Single person regression tests
- `TestRegressionStressTest` - Stress testing scenarios

#### **Monte Carlo and Statistical Tests**
- `TestMonteCarloValidation` - Statistical simulation validation
- `TestMonteCarloHighVolatility` - High volatility scenarios
- `TestMonteCarloMultiAsset` - Multi-asset portfolio tests
- `TestMarketCrashImpact` - Market crash simulations

#### **Debug and Development Tests**
- `TestDebugRetirement` - Debug retirement scenarios

---

## Understanding Test Results

### 1. Test Output Format

#### Successful Test Run
```
🧪 Running all FinSim tests...
✅ PASSED: TestBasicTaxCalculation
✅ PASSED: TestPensionContributionValidation
Test Results: 2 passed, 0 failed
🎉 All tests passed!
```

#### Failed Test Run
```
❌ FAILED: TestBasicTaxCalculation
Assertion failed: Expected income tax of €7071.5 but got €7000
  - Type: exact_value
  - Target: age 31, field 'it'
  - Expected: 7071.5
  - Actual: 7000
  - Tolerance: 10
```

### 2. Understanding Assertion Failures

Each test failure includes:
- **Assertion Type**: exact_value, range, comparison, or trend
- **Target Location**: age, row number, or final result
- **Field Name**: The data field being tested
- **Expected vs Actual**: What was expected vs what was calculated
- **Tolerance**: Acceptable margin of error (for numerical comparisons)

---

## Adding New Tests

### 1. Test File Structure

Create a new test file in `src/tests/` following this basic template:

```javascript
module.exports = {
  name: "Your Test Name",
  description: "Brief description of what this test validates",
  category: "tax|investment|scenario|edge-case",
  
  scenario: {
    parameters: {
      // Simulation parameters
      startingAge: 30,
      targetAge: 35,
      initialSavings: 0,
      // ... other parameters
    },
    
    events: [
      {
        type: 'SI',           // Event type
        id: 'test-event',
        amount: 50000,
        fromAge: 30,
        toAge: 34
      }
      // ... other events
    ]
  },

  assertions: [
    {
      type: 'exact_value',
      target: 'age',
      age: 31,
      field: 'it',
      expected: 7071.5,
      tolerance: 10
    }
    // ... other assertions
  ]
};
```

### 2. Key Parameters

#### Required Simulation Parameters
- `startingAge`, `targetAge` - Simulation age range
- `initialSavings`, `initialPension`, `initialFunds`, `initialShares` - Starting assets
- `retirementAge` - When retirement begins
- `personalTaxCredit` - Personal tax credit (required for Irish tax system)
- `statePensionWeekly` - Weekly state pension amount

#### Financial Parameters
- `pensionPercentage` - Pension contribution rate (as decimal, not %)
- `growthRatePension`, `growthRateFunds`, `growthRateShares` - Growth rates
- `inflation` - Inflation rate
- `FundsAllocation`, `SharesAllocation` - Investment allocation (as decimal 0-1)

### 3. Event Types

- **SI** - Salary Income
- **E** - Expense
- **REB** - Real Estate Purchase
- **SM** - Real Estate Sale
- **M** - Marriage

### 4. Assertion Types

- **exact_value** - Test for specific value with tolerance
- **range** - Test value falls within min/max range
- **comparison** - Test with operators (>, <, >=, <=, ==, !=)
- **trend** - Test if values increase/decrease/stay stable over time

### 5. Data Fields Reference

#### Income Fields
- `incomeSalaries`, `incomePrivatePension`, `incomeStatePension`
- `incomeShares`, `incomeRentals`, `incomeDefinedBenefit`
- `incomeTaxFree`, `netIncome`

#### Asset Fields
- `cash`, `indexFundsCapital`, `sharesCapital`, `pensionFund`, `worth`

#### Tax and Contribution Fields
- `it` (income tax), `prsi`, `usc`, `cgt`, `pensionContribution`

#### Other Fields
- `age`, `year`, `expenses`, `withdrawalRate`

---

## Test Structure and Framework

### 1. Framework Architecture

The test framework consists of:
- **TestFramework.js** - Main testing engine
- **TestUtils.js** - Helper functions and utilities  
- **run-tests.sh** - Command-line test runner

### 2. Execution Environment

Tests run in an isolated Node.js VM context with:
- Mock browser/Google Apps Script globals
- Core simulation modules loaded in sandbox
- Direct access to financial calculation functions

---

## Debugging Failed Tests

### 1. Understanding Failure Messages

Key information in failure messages:
- **Assertion Type**: What kind of check failed
- **Target**: Where in the simulation the failure occurred
- **Field**: Which data field was incorrect
- **Expected vs Actual**: The specific values that didn't match
- **Tolerance**: How much variance was allowed

### 2. Debugging Steps

1. **Verify Test Data** - Check if test parameters match expectations
2. **Check Event Configuration** - Ensure events have correct amounts and age ranges
3. **Review Assertions** - Verify age, field names, and expected values are correct

### 3. Debugging Techniques

- Add debug assertions to check intermediate values
- Use range assertions with wide ranges to see actual values
- Check multiple ages to identify patterns
- Create simplified versions of failing tests

---

## Troubleshooting Common Issues

### 1. Execution Environment Issues

#### Permission denied
```bash
chmod +x run-tests.sh
./run-tests.sh
```

#### Node.js not found
Check if Node.js is installed: `which node` and `node --version`

### 2. Directory Issues

**Always run from correct directory:**
```bash
cd /path/to/FinSim/src    # Correct
./run-tests.sh
```

### 3. Common Error Patterns

- **"Core file not found"** - Verify you're in `src/` directory and core files exist
- **"Test file not found"** - Use exact test names from `--list` command
- **All tests failing with config errors** - Check if config JSON file exists and is valid

---

## Best Practices

### 1. Test Design Principles

- **Test One Thing at a Time** - Focus each test on a specific functionality
- **Use Realistic Data** - Use typical Irish financial values and rates
- **Set Appropriate Tolerances** - Account for rounding in financial calculations

### 2. Test Organization

Tests are organized by naming convention:
- `Test[Feature][Scenario].js` format
- Test names should match functionality being tested

### 3. Test Maintenance

- Make tax rules configurable using config files
- Document expected calculations in test comments
- Include config version and tax year in tests
- Update tests annually with Budget changes

### 4. Performance Considerations

- Keep test scenarios focused and efficient for CI/CD
- Use shorter simulation periods for routine testing
- Run full statistical tests separately from quick validation tests

---

## CI/CD Integration

### 1. Basic Setup

```bash
#!/bin/bash
set -e
cd src/
chmod +x run-tests.sh
./run-tests.sh
```

### 2. Exit Codes
- `0` - All tests passed
- `1` - One or more tests failed or environment setup errors

### 3. Test Categories by CI Stage

- **Fast Tests (Pre-commit)** - Basic tax and pension tests
- **Comprehensive Tests (Pre-merge)** - All standard tests  
- **Nightly Tests (Full validation)** - Monte Carlo and robustness tests

---

## Conclusion

Key points to remember:

1. **Always run tests from the `src/` directory**
2. **Use `./run-tests.sh` for all test execution**
3. **Follow the standard test structure for new tests**
4. **Set appropriate tolerances for financial calculations**
5. **Debug systematically using simplified test cases**
6. **Keep tests focused and maintainable**

For examples and detailed implementations, refer to:
- Test files in `src/tests/` directory
- `TestFramework.js` for technical implementation
- `TEST_PLAN.md` for complete test strategy 