# FinSim Acceptance Test Plan

## Quick Reference: Running Tests

**🚨 IMPORTANT**: Always use `./run-tests.sh` from the `src/` directory.

```bash
# Basic commands (run from src/ directory)
./run-tests.sh                    # Run all tests
./run-tests.sh TestBasicTax       # Run specific test
./run-tests.sh --help             # Show help
```

📖 **Complete instructions**: See Section 6.0

---

## 1. Executive Summary

This document outlines the test plan for implementing acceptance tests for the FinSim (Ireland Financial Simulator) application. The goal is to create a comprehensive suite of serialized scenario-based tests that validate the simulator's financial calculations and data outputs through structured assertions.

## 2. Project Overview

FinSim is a browser-based financial planning simulator that:
- Models long-term financial scenarios (age 30-90 typical range)
- Supports various income sources, expenses, and investment vehicles
- Calculates taxes, pension contributions, and withdrawal strategies
- Runs Monte Carlo simulations with volatility modeling
- Works both as a web application and Google Sheets add-on

## 3. Test Scope and Objectives

### 3.1 Primary Objectives
- **Functional Verification**: Ensure all financial calculations are accurate
- **Scenario Validation**: Test real-world financial planning scenarios
- **Regression Prevention**: Catch breaking changes during development
- **Configuration Testing**: Validate Irish tax system configurations
- **Data Integrity**: Verify output data tables contain expected values

### 3.2 Scope Inclusions
- Core simulation engine (`Simulator.js`)
- All event types and their financial impacts
- Tax calculations (Income Tax, PRSI, USC, CGT)
- Investment vehicle calculations (Pension, Funds, Shares, Real Estate)
- Withdrawal priority algorithms
- Monte Carlo simulation features
- Edge cases and boundary conditions

### 3.3 Scope Exclusions
- UI functionality testing (separate from core logic)
- Cross-browser compatibility
- Platform-specific implementations (gas vs web) - tests focus on shared core engine

## 4. Test Architecture

### 4.1 Test Structure
Each acceptance test consists of:
```javascript
{
  name: "Test scenario name",
  description: "What this test validates",
  scenario: {
    parameters: { /* Simulation parameters */ },
    events: [ /* Array of life events */ ]
  },
  assertions: [
    {
      type: "exact_value|range|comparison|trend",
      target: "age|row|final",
      field: "data_field_name", 
      expected: /* Expected value */,
      tolerance: /* Optional tolerance for numerical comparisons */
    }
  ]
}
```

### 4.2 Data Table Structure
The simulator outputs data rows with these key fields:
- `age`, `year` - Timeline markers
- Income fields: `incomeSalaries`, `incomePrivatePension`, `incomeStatePension`, etc.
- Asset fields: `cash`, `indexFundsCapital`, `sharesCapital`, `pensionFund`
- Tax fields: `it` (income tax), `prsi`, `usc`, `cgt`
- Summary fields: `netIncome`, `expenses`, `worth`, `withdrawalRate`

### 4.3 Test Categories

#### 4.3.1 Basic Functionality Tests
- Simple salary and expense scenarios
- Single event type validations
- Basic tax calculations

#### 4.3.2 Investment Vehicle Tests  
- Pension contribution and growth
- Index fund investments and withdrawals
- Share portfolio management
- Real estate purchase, appreciation, and sale

#### 4.3.3 Tax System Tests
- Income tax bands and credits
- PRSI calculations
- USC (Universal Social Charge)
- Capital Gains Tax on investments

#### 4.3.4 Life Event Scenarios
- Marriage and tax implications
- Having children and associated costs
- Career progression and salary changes
- Retirement and pension drawdown

#### 4.3.5 Complex Integration Tests
- Multi-event scenarios over full lifetime
- Withdrawal priority algorithms
- Market crash simulations
- Emergency fund utilization

#### 4.3.6 Edge Case Tests
- Insufficient funds scenarios
- Zero/negative values
- Boundary age conditions
- Maximum contribution limits

## 5. Detailed Test Scenarios

### 5.1 Scenario Template

```javascript
// Gen-AI Coder Prompt:
// "Create a test for [scenario name] that validates [specific behavior]. 
// Set up parameters: [list key parameters]. 
// Add events: [describe events].
// Assert that: [specific assertions about data table values]."
```

### 5.2 Priority Test Scenarios

#### 5.2.1 Basic Income and Tax Validation
**Prompt for Gen-AI Coder:**
"Create a test named 'Basic Salary Tax Calculation' that validates income tax, PRSI, and USC calculations for a single individual. Set up parameters: startingAge=30, targetAge=35, no initial assets. Add events: €50,000 annual salary from age 30-34. Assert that: income tax calculations match expected Irish tax bands, PRSI is 4% of income, USC is calculated correctly, and net income equals gross minus all taxes."

#### 5.2.2 Pension Contribution Test
**Prompt for Gen-AI Coder:**
"Create a test named 'Pension Contribution Validation' that validates pension contributions and employer matching. Set up parameters: 30% pension contribution rate, 6% employer match, 5% pension growth. Add events: €60,000 salary with 6% employer match from age 30-34. Assert that: pension contributions equal 30% of salary, employer contributions equal 6% of salary, pension fund grows by expected compound amount, and salary income is reduced by personal contribution amount."

#### 5.2.3 Investment Allocation Test  
**Prompt for Gen-AI Coder:**
"Create a test named 'Investment Allocation Strategy' that validates surplus cash investment. Set up parameters: 50% funds allocation, 50% shares allocation, €20,000 emergency stash target. Add events: €70,000 salary, €40,000 expenses from age 30-34. Assert that: excess cash above emergency fund is invested, investments are split 50/50 between funds and shares, and cash balance maintains emergency stash target."

#### 5.2.4 Real Estate Purchase and Sale
**Prompt for Gen-AI Coder:**
"Create a test named 'Real Estate Transaction' that validates property purchase, appreciation, and sale. Set up parameters: standard tax rates, starting age 30. Add events: purchase €400,000 house at age 35 with 3% annual appreciation, sell at age 65. Assert that: property value grows at 3% annually, sale proceeds reflect 30 years of appreciation, and capital gains tax is calculated correctly on the profit."

#### 5.2.5 Retirement Transition Test
**Prompt for Gen-AI Coder:**
"Create a test named 'Retirement Phase Transition' that validates the switch from accumulation to drawdown phase. Set up parameters: retirement age 65, €500,000 pension fund, 4% withdrawal rate target. Add events: salary ends at age 64, pension drawdown starts at age 65. Assert that: salary income stops at correct age, pension lump sum (25%) is added to cash at age 65, annual pension drawdown equals 4% of remaining fund, and state pension begins at qualifying age."

#### 5.2.6 Market Crash Simulation
**Prompt for Gen-AI Coder:**
"Create a test named 'Market Crash Impact' that validates the impact of negative market returns. Set up parameters: €100,000 in index funds, standard volatility settings. Add events: -25% stock market override from age 70-72. Assert that: index fund values decrease by 25% during crash years, recovery begins after crash period ends, and withdrawal calculations adjust to reduced portfolio values."

#### 5.2.7 Mortgage and Interest Calculations
**Prompt for Gen-AI Coder:**
"Create a test named 'Mortgage Amortization' that validates mortgage payments and interest calculations. Set up parameters: standard mortgage rates. Add events: €350,000 property purchase at age 35, €280,000 mortgage over 25 years at 3.5% interest. Assert that: monthly mortgage payments match amortization schedule, principal and interest splits are calculated correctly, property equity increases over time, and mortgage balance reaches zero at term end."

#### 5.2.8 Multiple Income Sources
**Prompt for Gen-AI Coder:**
"Create a test named 'Multiple Income Streams' that validates complex income scenarios. Set up parameters: married couple, multiple tax credits. Add events: €50,000 salary, €20,000 rental income, €10,000 dividend income from age 35-65. Assert that: each income type is taxed correctly according to Irish tax law, rental income receives appropriate deductions, dividend income is subject to correct withholding tax, and total net income reflects proper tax calculations."

#### 5.2.9 Emergency Fund Utilization
**Prompt for Gen-AI Coder:**
"Create a test named 'Emergency Fund Usage' that validates withdrawal priority algorithms. Set up parameters: €30,000 emergency fund, withdrawal priorities cash=1, funds=2, shares=3, pension=4. Add events: €45,000 salary, €50,000 one-time expense at age 40. Assert that: emergency fund is depleted first, then investments are sold in priority order, withdrawal amounts match deficit calculations, and tax implications of investment sales are properly calculated."

#### 5.2.10 State Pension Integration
**Prompt for Gen-AI Coder:**
"Create a test named 'State Pension Calculation' that validates state pension entitlements. Set up parameters: €289 weekly state pension, qualification age 66, increase age 80. Add events: full PRSI contribution history from age 22-66. Assert that: state pension begins at correct qualification age, weekly amount matches current rates, additional payments begin at age 80, and state pension income is subject to correct tax treatment."

### 5.3 Edge Case Scenarios

#### 5.3.1 Insufficient Funds Scenario
**Prompt for Gen-AI Coder:**
"Create a test named 'Insufficient Funds Handling' that validates behavior when expenses exceed all available resources. Set up parameters: minimal starting assets, low income. Add events: €20,000 salary, €30,000 expenses from age 30-35. Assert that: simulation correctly identifies failure point, success flag is set to false, failedAt age is recorded accurately, and all available resources are exhausted in correct priority order."

#### 5.3.2 Zero Contribution Limits
**Prompt for Gen-AI Coder:**
"Create a test named 'Zero Pension Contribution' that validates scenarios with no pension contributions. Set up parameters: 0% pension contribution rate. Add events: €60,000 salary from age 30-65. Assert that: no pension contributions are made, full salary is subject to tax, pension fund remains empty, and retirement income relies entirely on other sources."

#### 5.3.3 Maximum Age Boundary
**Prompt for Gen-AI Coder:**
"Create a test named 'Maximum Age Simulation' that validates calculations at extreme ages. Set up parameters: startingAge=30, targetAge=100. Add events: comprehensive life scenario with all event types. Assert that: calculations remain accurate across 70-year timespan, compound growth calculations don't overflow, tax calculations work at all ages, and data table maintains consistency throughout."

### 5.4 Additional Focused Scenarios

#### 5.4.1 Pension Age-Specific Rule Validation
**Prompt for Gen-AI Coder:**
"Create a test named 'Pension Age Specific Rules' that validates age-dependent pension contribution rates and minimum drawdown percentages. Set up parameters with varying starting ages. Add events: Salary income across different age bands (e.g., 20s, 30s, 40s, 50s, 60+). For drawdown, simulate retirement at various ages post-minimum retirement age (e.g., 61, 66, 72). Assert that: pension contribution percentages correctly align with `pensionContributionRateBands` based on age, and that minimum pension drawdown percentages correctly align with `pensionMinDrawdownBands` based on age after retirement."

#### 5.4.2 Fund Deemed Disposal and Exit Tax Validation
**Prompt for Gen-AI Coder:**
"Create a test named 'Fund Deemed Disposal And Exit Tax' that validates the 8-year deemed disposal rule and Funds Exit Tax. Set up parameters: relevant tax rates from config. Add events: Invest in an index fund and hold it for more than 8 years without selling. Also, include a scenario where funds are sold before and after the 8-year mark. Assert that: deemed disposal occurs at the 8-year anniversary with `FundsExitTax` applied to gains if no actual sale occurs, `FundsExitTax` is correctly applied on actual sale, and `FundsCanOffsetLosses` (if applicable in the scenario) is handled correctly. Verify against `deemedDisposalYears` and `FundsExitTax` from the configuration."

#### 5.4.3 Complex Asset Liquidation Hierarchy
**Prompt for Gen-AI Coder:**
"Create a test named 'Complex Asset Liquidation Order' that validates the withdrawal priority across multiple asset types when expenses significantly exceed income. Set up parameters: an emergency fund, cash, index funds, shares, and a withdrawable pension (post-retirement age), each with initial balances. Define a clear withdrawal priority (e.g., cash, emergency fund, index funds, shares, pension). Add events: A large one-time expense that forces liquidation from multiple asset classes. Assert that: assets are liquidated in the exact specified priority order, and the correct amounts are withdrawn from each to meet the shortfall."

#### 5.4.4 Marital Status Tax Impact Validation
**Prompt for Gen-AI Coder:**
"Create a test named 'Marital Status Tax Configuration' that specifically validates the differences in income tax calculations for married individuals versus single individuals. Set up two parallel scenarios: one single, one married, with identical incomes. Add events: Salary income that spans multiple tax bands. Assert that: the married scenario correctly utilizes `itMarriedBands` and the `itMaxMarriedBandIncrease` (if applicable based on spouse income, though for simplicity this test could assume single earner in married couple or a specific secondary income to test the increase). Compare directly against the single individual's tax calculated using `itSingleNoChildrenBands` to highlight the differences due to marital status specific bands."

#### 5.4.5 USC Reduced Rate Application for Seniors
**Prompt for Gen-AI Coder:**
"Create a test named 'USC Reduced Rates for Seniors' that validates the application of reduced USC rates for individuals over a certain age and below a specific income threshold. Set up parameters based on `uscRaducedRateAge`, `uscReducedRateMaxIncome`, `uscTaxBands`, and `uscReducedTaxBands` from the config. Add events: Income scenarios for individuals just below and just above `uscRaducedRateAge`, and for those over the age, with incomes just below and just above `uscReducedRateMaxIncome`. Assert that: USC is calculated using `uscReducedTaxBands` only when both age and income conditions are met, and `uscTaxBands` are used otherwise."

## 6. Test Implementation Plan

### 6.0 Test Execution Instructions

**IMPORTANT**: All tests are executed using the `./run-tests.sh` script from the `src/` directory.

#### Basic Test Execution Commands:
```bash
# Navigate to the src directory first
cd /path/to/FinSim/src

# Run all tests
./run-tests.sh

# Run specific test
./run-tests.sh TestBasicTaxCalculation

# Get help
./run-tests.sh --help
```

#### File Structure Requirements:
- Test files must be in `src/tests/` directory
- Test files follow naming pattern: `Test*.js`
- Each test file exports a single test definition object
- Tests import core simulation modules directly (no browser dependencies)

#### Prerequisites:
- Node.js must be installed and available in PATH
- All core simulation files must be present in `src/core/`
- Test configuration files must be available in `src/core/config/`

#### Command Line Execution Requirements:
- Tests run from the command line using Node.js with no external dependencies
- Simple console output with pass/fail results
- Self-contained execution compatible with CI/CD pipelines

### 6.1 Phase 1: Test Infrastructure (Weeks 1-2)
**Gen-AI Coder Prompts:**

1.  "Create a test framework file `TestFramework.js` that can load scenario definitions, run simulations, and validate assertions. Include methods for: loadScenario(), runSimulation(), validateAssertions(), and generateReport(). Design it to run from Node.js command line with the core simulation engine imported as modules."
    **Status: Complete**

2.  "Create a test utility file `TestUtils.js` with helper functions for: creating common parameter sets, generating standard event arrays, comparing numerical values with tolerance, and formatting test results. Include constants for common test values like standard Irish tax rates."
    **Status: Complete**

3.  "Update the shell script `run-tests.sh` to provide a simple command-line interface for running tests. Support basic functionality: run all tests, run specific test by name, and show help. Keep it simple with clear pass/fail output and proper exit codes for CI/CD integration."
    **Status: Complete**

### 6.2 Phase 2: Core Functionality Tests (Weeks 3-4)
**Gen-AI Coder Prompts:**

4.  "Implement the 10 priority test scenarios defined in section 5.2. Each test should be in a separate file named `Test[ScenarioName].js`. Follow the test structure template and ensure all assertions validate the specific behaviors described in each scenario prompt."
    **Status: Complete (10/10 Complete)**

5.  "Create boundary condition tests in `TestBoundaryConditions.js` that validate: zero values, negative values, maximum contribution limits, minimum pension ages, and edge cases around Irish tax thresholds. Include at least 15 different boundary scenarios."
    **Status: Complete**

### 6.3 Phase 3: Integration and Complex Scenarios (Weeks 5-6)
**Gen-AI Coder Prompts:**

6.  "Create complex life scenario tests in `TestLifeScenarios.js` that combine multiple events over full lifetimes. Include scenarios like: young professional → marriage → children → career growth → house purchase → retirement → inheritance. Each scenario should span 40+ years with 10+ events."
    **Status: Complete**

7.  "Implement Monte Carlo simulation tests in `TestMonteCarloValidation.js` that validate statistical outcomes over multiple runs. Test scenarios with different volatility settings and verify that results fall within expected statistical ranges. Focus on fundamental statistical properties (mean, standard deviation, percentile distributions) rather than execution speed. Include tests that run sufficient iterations to ensure statistical significance."
    **Status: Complete**

### 6.4 Phase 4: Regression and Validation Tests (Weeks 7-8)
**Gen-AI Coder Prompts:**

8.  "Create regression tests in `TestRegression.js` that establish baseline scenarios and capture their outputs as 'golden' standards. Start with the existing demo.csv scenario and create additional comprehensive scenarios. These tests should detect any unintended changes in future versions while allowing for easy updates when tax rules change."
    **Status: Complete**

9.  "Implement Irish tax system validation tests in `TestIrishTaxSystem.js` that verify all tax calculations against current Irish tax rules. Structure tests to make tax rates and thresholds easily configurable through constants at the top of test files. Include tests for all tax bands, credits, allowances, and special cases like marriage tax benefits. Document expected tax calculations clearly for future maintenance."
    **Status: Not Started**

10. "Create accuracy and robustness tests in `TestAccuracyRobustness.js` that validate calculation precision and system behavior under extreme conditions. Prioritize thoroughness over speed - include comprehensive tests for very long simulations (100+ years), high-value scenarios (millions in assets), and edge cases like very small amounts or unusual combinations of events."
    **Status: Not Started**

### 6.5 Phase 5: Documentation and Integration (Week 9)
**Gen-AI Coder Prompts:**

11. "Create comprehensive test documentation in `TEST_DOCUMENTATION.md` that explains: how to run tests, how to add new tests, how to interpret results, and how to debug failing tests. Include examples and troubleshooting guides for the simplified test infrastructure."
    **Status: Not Started**

12. "Integrate the test suite with the main project by creating: npm scripts for running tests, package.json test configurations, and basic test reporting. Include setup instructions for running tests in different environments and CI/CD integration with the simplified `run-tests.sh` interface."
    **Status: Not Started**

## 7. Success Criteria

### 7.1 Coverage Targets
- **Event Types**: 100% of all event types (SI, SInp, UI, DBI, FI, E, M, R, SM, RI, NOP)
- **Tax Calculations**: All Irish tax components (IT, PRSI, USC, CGT)
- **Investment Vehicles**: Pension, Index Funds, Shares, Real Estate, Cash
- **Life Phases**: Growth phase and retirement phase transitions
- **Edge Cases**: At least 90% of identified boundary conditions

### 7.2 Quality Metrics
- **Test Reliability**: 99%+ pass rate for stable scenarios
- **Precision**: Financial calculations accurate to ±€1 for typical scenarios
- **Thoroughness**: Comprehensive coverage prioritized over execution speed
- **Maintainability**: Tests are self-documenting with easily configurable tax parameters

### 7.3 Validation Criteria
- All priority scenarios from section 5.2 are implemented and passing
- Edge cases from section 5.3 are handled correctly
- Regression tests prevent breaking changes
- Tax calculations match Irish Revenue documentation
- Monte Carlo simulations produce statistically valid distributions

## 8. Risk Management

### 8.1 Technical Risks
- **Floating Point Precision**: Use appropriate tolerance levels (±€1) for financial calculations
- **Tax Law Updates**: Structure tests to make tax rule changes easy to implement
- **Complex Dependencies**: Ensure tests run independently from command line without external dependencies
- **Platform Compatibility**: Ensure Node.js environment can properly import and run core simulation modules

### 8.2 Mitigation Strategies
- Implement comprehensive error handling in test framework
- Use version-controlled test data with clear change documentation
- Create isolated test environments that don't depend on external APIs
- Maintain backward compatibility for test scenarios

## 9. Maintenance and Evolution

### 9.1 Ongoing Responsibilities
- Update tax rates and thresholds annually based on Irish Budget announcements
- Add new test scenarios for newly implemented features
- Review and update edge case tests as the application evolves
- Monitor test execution times and optimize as needed

### 9.2 Annual Review Process
- Validate all tax calculations against current Irish tax law
- Review test coverage for new features added during the year
- Update boundary condition tests for changed limits or thresholds
- Performance review of test suite execution time and resource usage

## 10. Conclusion

This test plan provides a comprehensive framework for implementing acceptance tests for the FinSim application. The structured approach ensures that all critical financial calculations are validated, edge cases are handled properly, and the system maintains accuracy as it evolves.

The plan emphasizes practical, real-world scenarios while maintaining rigorous validation of the underlying mathematical models. By following this plan, the development team will have confidence in the accuracy and reliability of the FinSim financial planning simulator.

**Next Steps**: Begin implementation with Phase 1 (Test Infrastructure) and proceed systematically through each phase, using the detailed Gen-AI Coder prompts provided for each deliverable. After completing each test, update the status of the test in the test plan.

## 11. Troubleshooting and Common Mistakes

### 11.1 Test Execution Issues

#### ❌ Common Mistake: Running from wrong directory
```bash
# DON'T run from root directory:
cd /path/to/FinSim
./src/run-tests.sh

# CORRECT - run from src directory:
cd /path/to/FinSim/src
./run-tests.sh
```

#### ❌ Common Mistake: Forgetting script permissions
```bash
# If you get "Permission denied":
chmod +x run-tests.sh
./run-tests.sh
```

### 11.2 Test Discovery Issues

#### ❌ No tests found
```bash
# Problem: Tests directory wrong or missing
./run-tests.sh
# Shows: No test files found in /path/to/tests

# Solution: Check directory structure
ls tests/          # Should show Test*.js files
pwd               # Should be in /path/to/FinSim/src
```

#### ❌ Test file not found
```bash
# Problem: Test name doesn't match file
./run-tests.sh BasicTax  # Won't find TestBasicTaxCalculation.js

# Solution: Use correct test name
./run-tests.sh TestBasicTaxCalculation    # Correct
ls tests/                                 # See available test files
```

### 11.3 Development Workflow Tips

#### ✅ Recommended development cycle:
```bash
# 1. Check available tests
ls tests/

# 2. Run specific test for debugging
./run-tests.sh TestBasicTaxCalculation

# 3. Run all tests before committing
./run-tests.sh
```

### 11.4 Environment Issues

#### ❌ Node.js not found
```bash
# Error: command not found: node
# Solution: Install Node.js or add to PATH
which node                                     # Check if installed
node --version                                 # Check version
```

#### ❌ Missing core files
```bash
# Error: Core file not found
# Solution: Ensure all files present
ls core/                                       # Should show all .js files
ls core/config/                               # Should show config files
```

Remember: **Always use `./run-tests.sh` from the `src/` directory!** 