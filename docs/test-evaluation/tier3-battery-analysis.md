# Test Battery Analysis

You are analyzing a complete test suite for a financial simulation engine. You have been provided with metadata extracted from every test in the suite.

## Context

This is a personal finance simulator supporting:
- **Countries**: Ireland (IE), Argentina (AR), potentially others
- **Features**: Income/expense modeling, tax calculations (IT/PRSI/USC/CGT/Exit Tax), investments (pension, index funds, shares), real estate, mortgages, relocation, currency conversion, Monte Carlo analysis
- **Lifecycle**: Simulations span 40-60+ years, covering career through retirement

## Input

You will receive:
1. An array of test metadata objects (one per test file)
2. (Optional) Summary of quality scores from individual evaluations

## Task

Produce a comprehensive battery-level analysis.

## Analysis Sections

### 1. Coverage Matrix

Create matrices showing coverage across key dimensions:

**Feature Coverage**: For each major feature, list which tests exercise it.

| Feature | Tests Covering | Coverage Level |
|---------|---------------|----------------|
| Income Tax | [...] | High/Medium/Low/None |
| PRSI | [...] | ... |
| USC | [...] | ... |
| Pension | [...] | ... |
| CGT | [...] | ... |
| Exit Tax | [...] | ... |
| FX Conversion | [...] | ... |
| Relocation | [...] | ... |
| Monte Carlo | [...] | ... |
| Real Estate | [...] | ... |
| Present Value | [...] | ... |

**Country Coverage**:

| Country | Test Count | Features Tested |
|---------|------------|-----------------|
| IE | n | [...] |
| AR | n | [...] |
| IE→AR | n | [...] |

**Lifecycle Coverage**:

| Phase | Test Count | Assertion Density |
|-------|------------|-------------------|
| Early Career (25-35) | n | n assertions |
| Mid Career (35-55) | n | ... |
| Pre-Retirement (55-65) | n | ... |
| Retirement (65-80) | n | ... |
| Late Retirement (80+) | n | ... |

### 2. Test Pyramid Analysis

Categorize tests by scope:
- **Unit-like** (tests one calculation/component in isolation)
- **Integration** (tests component interactions)
- **System/Regression** (tests complete simulation scenarios)

Assess: Is the pyramid balanced? (Many unit, fewer integration, few system)

### 3. Boundary Testing Assessment

Aggregate all boundary values tested across the suite:
- Tax thresholds covered: [...]
- Tax thresholds NOT covered: [...]
- Age thresholds covered: [...]
- Zero-value tests: [...]
- Maximum-value tests: [...]

### 4. Gap Analysis

Identify:
1. **Untested features**: Features mentioned in documentation but with no test coverage
2. **Under-tested features**: Features with only 1 test or only happy-path coverage
3. **Missing boundary tests**: Important thresholds without ±1 tests
4. **Missing combinations**: Country × feature combinations not tested
5. **Lifecycle gaps**: Phases with sparse assertion coverage

### 5. Risk Assessment

For each gap, assess:
- **Severity**: How bad would a bug in this area be? (Critical/High/Medium/Low)
- **Likelihood**: How likely is a bug to be introduced here? (High/Medium/Low)
- **Priority**: Severity × Likelihood → testing priority

### 6. Recommendations

Prioritized list of recommended new tests or test improvements:
1. [Highest priority gap] → Recommended test approach
2. [Next priority] → ...
...

### 7. Overall Battery Health Score

Provide a summary assessment:
- **Coverage Score** (0-100): What % of features/boundaries are tested?
- **Depth Score** (0-100): How thoroughly are tested features validated?
- **Balance Score** (0-100): Is the test pyramid well-structured?
- **Maintainability Score** (0-100): How easy is the suite to update?
- **Overall Health**: (average, with commentary)

## Output Format

Provide analysis in markdown format with clear headers and tables as shown above.
