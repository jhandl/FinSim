/* Test Utilities for FinSim - Helper functions and constants for testing
 * 
 * This file provides utility functions for creating test scenarios, generating common
 * parameter sets and event arrays, and includes constants for Irish tax rates and limits.
 * Designed to simplify test creation and ensure consistency across test scenarios.
 */

// =============================================================================
// IRISH TAX SYSTEM CONSTANTS (2024/2025 Tax Year)
// =============================================================================

const IRISH_TAX_RATES = {
  // Income Tax Bands
  INCOME_TAX: {
    STANDARD_RATE: 0.20,        // 20% standard rate
    HIGHER_RATE: 0.40,          // 40% higher rate
    STANDARD_RATE_BAND_SINGLE: 40000,    // €40,000 for single person
    STANDARD_RATE_BAND_MARRIED: 80000,   // €80,000 for married couple (both working)
  },

  // Personal Tax Credits
  TAX_CREDITS: {
    PERSONAL_SINGLE: 1875,      // €1,875 personal tax credit
    PERSONAL_MARRIED: 3750,     // €3,750 married persons tax credit
    EMPLOYEE: 1875,             // €1,875 employee tax credit
    EARNED_INCOME: 1875,        // €1,875 earned income tax credit
  },

  // PRSI (Pay Related Social Insurance)
  PRSI: {
    EMPLOYEE_RATE: 0.04,        // 4% for employees
    EMPLOYER_RATE: 0.1105,      // 11.05% for employers
    WEEKLY_THRESHOLD: 352,      // €352 per week threshold
    ANNUAL_THRESHOLD: 18304,    // €18,304 annual threshold
  },

  // USC (Universal Social Charge)
  USC: {
    BAND_1_RATE: 0.005,         // 0.5% on first €12,012
    BAND_1_LIMIT: 12012,
    BAND_2_RATE: 0.02,          // 2% on €12,013 to €25,760
    BAND_2_LIMIT: 25760,
    BAND_3_RATE: 0.04,          // 4% on €25,761 to €70,044
    BAND_3_LIMIT: 70044,
    BAND_4_RATE: 0.08,          // 8% on balance over €70,044
    SURCHARGE_RATE: 0.03,       // 3% surcharge for high earners
    SURCHARGE_THRESHOLD: 100000, // €100,000 threshold for surcharge
  },

  // Capital Gains Tax
  CGT: {
    RATE: 0.33,                 // 33% capital gains tax rate
    ANNUAL_EXEMPTION: 1270,     // €1,270 annual exemption
  },

  // Pension Contribution Limits
  PENSION: {
    MAX_ANNUAL_EARNINGS: 115000, // €115,000 max pensionable earnings
    AGE_BANDS: {
      30: 0.15,  // 15% under age 30
      40: 0.20,  // 20% age 30-39
      50: 0.25,  // 25% age 40-49
      60: 0.30,  // 30% age 50-59
      70: 0.40,  // 40% age 60+
    }
  },

  // State Pension
  STATE_PENSION: {
    WEEKLY_RATE: 289.30,        // €289.30 per week (2024)
    QUALIFYING_AGE: 66,         // Age 66 qualification
    INCREASE_AGE: 80,           // Age 80 for increase
    INCREASE_AMOUNT: 10,        // €10 weekly increase at age 80
  }
};

// =============================================================================
// COMMON PARAMETER SETS
// =============================================================================

const STANDARD_PARAMETERS = {
  // Basic young professional scenario
  YOUNG_PROFESSIONAL: {
    startingAge: 25,
    targetAge: 70,
    retirementAge: 65,
    initialSavings: 5000,
    initialPension: 0,
    initialFunds: 0,
    initialShares: 0,
    emergencyStash: 20000,
    fundsAllocation: 0.6,       // 60% to index funds
    sharesAllocation: 0.4,      // 40% to individual shares
    pensionPercentage: 0.8,     // 80% of maximum allowed pension contribution
    pensionCapped: true,
    pensionGrowthRate: 0.06,    // 6% pension growth
    pensionGrowthStdDev: 0.15,  // 15% volatility
    fundsGrowthRate: 0.07,      // 7% index funds growth
    fundsGrowthStdDev: 0.18,    // 18% volatility
    sharesGrowthRate: 0.08,     // 8% shares growth
    sharesGrowthStdDev: 0.25,   // 25% volatility
    inflation: 0.025,           // 2.5% inflation
    marriageYear: null,
    youngestChildBorn: null,
    oldestChildBorn: null,
    personalTaxCredit: IRISH_TAX_RATES.TAX_CREDITS.PERSONAL_SINGLE,
    statePensionWeekly: IRISH_TAX_RATES.STATE_PENSION.WEEKLY_RATE,
    priorityCash: 1,            // Withdraw from cash first
    priorityPension: 4,         // Withdraw from pension last
    priorityFunds: 2,           // Withdraw from funds second
    priorityShares: 3           // Withdraw from shares third
  },

  // Mid-career professional scenario
  MID_CAREER: {
    startingAge: 35,
    targetAge: 75,
    retirementAge: 65,
    initialSavings: 25000,
    initialPension: 50000,
    initialFunds: 30000,
    initialShares: 20000,
    emergencyStash: 30000,
    fundsAllocation: 0.7,
    sharesAllocation: 0.3,
    pensionPercentage: 1.0,     // Maximum allowed pension contribution
    pensionCapped: true,
    pensionGrowthRate: 0.05,
    pensionGrowthStdDev: 0.12,
    fundsGrowthRate: 0.065,
    fundsGrowthStdDev: 0.16,
    sharesGrowthRate: 0.075,
    sharesGrowthStdDev: 0.22,
    inflation: 0.025,
    marriageYear: null,
    youngestChildBorn: null,
    oldestChildBorn: null,
    personalTaxCredit: IRISH_TAX_RATES.TAX_CREDITS.PERSONAL_SINGLE,
    statePensionWeekly: IRISH_TAX_RATES.STATE_PENSION.WEEKLY_RATE,
    priorityCash: 1,
    priorityPension: 4,
    priorityFunds: 2,
    priorityShares: 3
  },

  // Pre-retirement scenario
  PRE_RETIREMENT: {
    startingAge: 55,
    targetAge: 85,
    retirementAge: 65,
    initialSavings: 50000,
    initialPension: 200000,
    initialFunds: 100000,
    initialShares: 50000,
    emergencyStash: 40000,
    fundsAllocation: 0.5,
    sharesAllocation: 0.2,      // More conservative allocation
    pensionPercentage: 1.0,
    pensionCapped: true,
    pensionGrowthRate: 0.04,    // More conservative growth
    pensionGrowthStdDev: 0.10,
    fundsGrowthRate: 0.05,
    fundsGrowthStdDev: 0.12,
    sharesGrowthRate: 0.06,
    sharesGrowthStdDev: 0.18,
    inflation: 0.025,
    marriageYear: null,
    youngestChildBorn: null,
    oldestChildBorn: null,
    personalTaxCredit: IRISH_TAX_RATES.TAX_CREDITS.PERSONAL_SINGLE,
    statePensionWeekly: IRISH_TAX_RATES.STATE_PENSION.WEEKLY_RATE,
    priorityCash: 1,
    priorityPension: 3,         // Earlier access to pension
    priorityFunds: 2,
    priorityShares: 4
  },

  // Married couple scenario
  MARRIED_COUPLE: {
    startingAge: 30,
    targetAge: 75,
    retirementAge: 65,
    initialSavings: 15000,
    initialPension: 10000,
    initialFunds: 5000,
    initialShares: 5000,
    emergencyStash: 25000,
    fundsAllocation: 0.6,
    sharesAllocation: 0.4,
    pensionPercentage: 0.9,
    pensionCapped: true,
    pensionGrowthRate: 0.06,
    pensionGrowthStdDev: 0.15,
    fundsGrowthRate: 0.07,
    fundsGrowthStdDev: 0.18,
    sharesGrowthRate: 0.08,
    sharesGrowthStdDev: 0.25,
    inflation: 0.025,
    marriageYear: 2025,
    youngestChildBorn: 2027,
    oldestChildBorn: 2025,
    personalTaxCredit: IRISH_TAX_RATES.TAX_CREDITS.PERSONAL_MARRIED,
    statePensionWeekly: IRISH_TAX_RATES.STATE_PENSION.WEEKLY_RATE,
    priorityCash: 1,
    priorityPension: 4,
    priorityFunds: 2,
    priorityShares: 3
  }
};

// =============================================================================
// COMMON EVENT GENERATORS
// =============================================================================

class EventGenerator {
  
  /**
   * Generate a salary income event
   * @param {string} id - Event identifier
   * @param {number} amount - Annual salary amount
   * @param {number} fromAge - Starting age
   * @param {number} toAge - Ending age (optional)
   * @param {number} annualIncrease - Annual increase rate (default 3%)
   * @param {number} employerMatch - Employer pension match rate (default 6%)
   * @returns {Object} - Salary event object
   */
  static createSalaryEvent(id, amount, fromAge, toAge = null, annualIncrease = 0.03, employerMatch = 0.06) {
    return {
      type: 'SI',
      id: id,
      amount: amount,
      fromAge: fromAge,
      toAge: toAge,
      rate: annualIncrease,
      match: employerMatch
    };
  }

  /**
   * Generate an expense event
   * @param {string} id - Event identifier
   * @param {number} amount - Annual expense amount
   * @param {number} fromAge - Starting age
   * @param {number} toAge - Ending age (optional)
   * @param {number} annualIncrease - Annual increase rate (default inflation rate)
   * @returns {Object} - Expense event object
   */
  static createExpenseEvent(id, amount, fromAge, toAge = null, annualIncrease = 0.025) {
    return {
      type: 'E',
      id: id,
      amount: amount,
      fromAge: fromAge,
      toAge: toAge,
      rate: annualIncrease
    };
  }

  /**
   * Generate a rental income event
   * @param {string} id - Event identifier
   * @param {number} amount - Annual rental income
   * @param {number} fromAge - Starting age
   * @param {number} toAge - Ending age (optional)
   * @param {number} annualIncrease - Annual increase rate (default 2%)
   * @returns {Object} - Rental income event object
   */
  static createRentalIncomeEvent(id, amount, fromAge, toAge = null, annualIncrease = 0.02) {
    return {
      type: 'RI',
      id: id,
      amount: amount,
      fromAge: fromAge,
      toAge: toAge,
      rate: annualIncrease
    };
  }

  /**
   * Generate a real estate purchase event
   * @param {string} id - Property identifier
   * @param {number} amount - Purchase price
   * @param {number} age - Age at purchase
   * @param {number} appreciationRate - Annual appreciation rate (default 3%)
   * @returns {Object} - Real estate purchase event object
   */
  static createRealEstatePurchaseEvent(id, amount, age, appreciationRate = 0.03) {
    return {
      type: 'R',
      id: id,
      amount: amount,
      fromAge: age,
      toAge: null,
      rate: appreciationRate
    };
  }

  /**
   * Generate a real estate sale event
   * @param {string} id - Property identifier (must match purchase event)
   * @param {number} age - Age at sale
   * @returns {Object} - Real estate sale event object
   */
  static createRealEstateSaleEvent(id, age) {
    return {
      type: 'R',
      id: id,
      amount: 0,  // Sale price calculated from appreciation
      fromAge: null,
      toAge: age,
      rate: null
    };
  }

  /**
   * Generate a mortgage event
   * @param {string} id - Property identifier
   * @param {number} amount - Mortgage amount
   * @param {number} fromAge - Starting age
   * @param {number} termYears - Mortgage term in years
   * @param {number} interestRate - Annual interest rate
   * @returns {Object} - Mortgage event object
   */
  static createMortgageEvent(id, amount, fromAge, termYears, interestRate) {
    return {
      type: 'M',
      id: id,
      amount: amount,
      fromAge: fromAge,
      toAge: fromAge + termYears,
      rate: interestRate
    };
  }

  /**
   * Generate a lump sum tax-free income event
   * @param {string} id - Event identifier
   * @param {number} amount - Tax-free income amount
   * @param {number} age - Age at which income is received
   * @returns {Object} - Tax-free income event object
   */
  static createTaxFreeIncomeEvent(id, amount, age) {
    return {
      type: 'FI',  // Tax-free Income
      id: id,
      amount: amount,
      fromAge: age,
      toAge: age,  // One-time event
      rate: null
    };
  }

  /**
   * Generate a complete life scenario with common events
   * @param {Object} config - Configuration object with salary, expenses, house purchase, etc.
   * @returns {Array} - Array of events for a complete life scenario
   */
  static createLifeScenario(config) {
    const events = [];
    
    // Career progression with salary increases
    if (config.career) {
      for (const period of config.career) {
        events.push(this.createSalaryEvent(
          period.id,
          period.salary,
          period.fromAge,
          period.toAge,
          period.annualIncrease || 0.03,
          period.employerMatch || 0.06
        ));
      }
    }

    // Living expenses
    if (config.expenses) {
      for (const expense of config.expenses) {
        events.push(this.createExpenseEvent(
          expense.id,
          expense.amount,
          expense.fromAge,
          expense.toAge,
          expense.annualIncrease || 0.025
        ));
      }
    }

    // Real estate transactions
    if (config.realEstate) {
      for (const property of config.realEstate) {
        if (property.purchaseAge) {
          events.push(this.createRealEstatePurchaseEvent(
            property.id,
            property.purchasePrice,
            property.purchaseAge,
            property.appreciationRate || 0.03
          ));
        }
        if (property.saleAge) {
          events.push(this.createRealEstateSaleEvent(property.id, property.saleAge));
        }
        if (property.mortgage) {
          events.push(this.createMortgageEvent(
            property.id,
            property.mortgage.amount,
            property.mortgage.fromAge,
            property.mortgage.termYears,
            property.mortgage.interestRate
          ));
        }
      }
    }

    // Rental income
    if (config.rentalIncome) {
      for (const rental of config.rentalIncome) {
        events.push(this.createRentalIncomeEvent(
          rental.id,
          rental.amount,
          rental.fromAge,
          rental.toAge,
          rental.annualIncrease || 0.02
        ));
      }
    }

    return events;
  }
}

// =============================================================================
// NUMERICAL COMPARISON UTILITIES
// =============================================================================

class NumericUtils {
  
  /**
   * Compare two numbers with tolerance
   * @param {number} actual - Actual value
   * @param {number} expected - Expected value
   * @param {number} tolerance - Absolute tolerance (default €1)
   * @returns {Object} - Comparison result with success flag and details
   */
  static compareWithTolerance(actual, expected, tolerance = 1.0) {
    const diff = Math.abs(actual - expected);
    const success = diff <= tolerance;
    
    return {
      success: success,
      actual: actual,
      expected: expected,
      difference: diff,
      tolerance: tolerance,
      message: success 
        ? `✓ ${actual} matches ${expected} within tolerance ±${tolerance}`
        : `✗ ${actual} differs from ${expected} by ${diff.toFixed(2)} (tolerance: ±${tolerance})`
    };
  }

  /**
   * Compare percentage values with tolerance
   * @param {number} actual - Actual percentage (0-1)
   * @param {number} expected - Expected percentage (0-1)
   * @param {number} tolerancePercent - Tolerance in percentage points (default 0.1%)
   * @returns {Object} - Comparison result
   */
  static comparePercentageWithTolerance(actual, expected, tolerancePercent = 0.001) {
    return this.compareWithTolerance(actual, expected, tolerancePercent);
  }

  /**
   * Check if a value is within a range
   * @param {number} value - Value to check
   * @param {number} min - Minimum value (inclusive)
   * @param {number} max - Maximum value (inclusive)
   * @returns {Object} - Range check result
   */
  static isInRange(value, min, max) {
    const success = value >= min && value <= max;
    
    return {
      success: success,
      value: value,
      min: min,
      max: max,
      message: success
        ? `✓ ${value} is within range [${min}, ${max}]`
        : `✗ ${value} is outside range [${min}, ${max}]`
    };
  }

  /**
   * Calculate percentage difference between two values
   * @param {number} actual - Actual value
   * @param {number} expected - Expected value
   * @returns {number} - Percentage difference
   */
  static calculatePercentageDifference(actual, expected) {
    if (expected === 0) {
      return actual === 0 ? 0 : Infinity;
    }
    return Math.abs((actual - expected) / expected) * 100;
  }

  /**
   * Round to specified decimal places
   * @param {number} value - Value to round
   * @param {number} decimals - Number of decimal places (default 2)
   * @returns {number} - Rounded value
   */
  static roundTo(value, decimals = 2) {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
}

// =============================================================================
// TEST RESULT FORMATTING UTILITIES
// =============================================================================

class FormatUtils {
  
  /**
   * Format currency values
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency symbol (default €)
   * @returns {string} - Formatted currency string
   */
  static formatCurrency(amount, currency = '€') {
    return `${currency}${Math.round(amount).toLocaleString()}`;
  }

  /**
   * Format percentage values
   * @param {number} percentage - Percentage value (0-1)
   * @param {number} decimals - Number of decimal places (default 1)
   * @returns {string} - Formatted percentage string
   */
  static formatPercentage(percentage, decimals = 1) {
    return `${(percentage * 100).toFixed(decimals)}%`;
  }

  /**
   * Format age values
   * @param {number} age - Age value
   * @returns {string} - Formatted age string
   */
  static formatAge(age) {
    return `Age ${age}`;
  }

  /**
   * Format test assertion results for console output
   * @param {Object} assertion - Assertion object
   * @param {Object} result - Assertion result
   * @returns {string} - Formatted assertion result
   */
  static formatAssertionResult(assertion, result) {
    const status = result.success ? '✓ PASS' : '✗ FAIL';
    const field = assertion.field;
    const type = assertion.type;
    
    let details = '';
    if (!result.success) {
      details = `\n    Expected: ${JSON.stringify(assertion.expected)}`;
      details += `\n    Actual: ${result.actual}`;
      if (result.error) {
        details += `\n    Error: ${result.error}`;
      }
    }
    
    return `  ${status} ${field} (${type})${details}`;
  }

  /**
   * Format execution time
   * @param {number} milliseconds - Execution time in milliseconds
   * @returns {string} - Formatted time string
   */
  static formatExecutionTime(milliseconds) {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${(milliseconds / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = ((milliseconds % 60000) / 1000).toFixed(1);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Create a summary table of test results
   * @param {Array} testResults - Array of test result objects
   * @returns {string} - Formatted summary table
   */
  static createSummaryTable(testResults) {
    let table = '\n';
    table += '┌─────────────────────────────────────┬──────────┬──────────────┬───────────────┐\n';
    table += '│ Test Name                           │ Status   │ Assertions   │ Execution Time│\n';
    table += '├─────────────────────────────────────┼──────────┼──────────────┼───────────────┤\n';
    
    for (const result of testResults) {
      const name = result.name.padEnd(35).substring(0, 35);
      const status = (result.success ? 'PASS' : 'FAIL').padEnd(8);
      const assertions = result.assertionResults 
        ? `${result.assertionResults.passedAssertions}/${result.assertionResults.totalAssertions}`.padEnd(12)
        : 'N/A'.padEnd(12);
      const time = this.formatExecutionTime(result.executionTime).padEnd(13);
      
      table += `│ ${name} │ ${status} │ ${assertions} │ ${time} │\n`;
    }
    
    table += '└─────────────────────────────────────┴──────────┴──────────────┴───────────────┘\n';
    return table;
  }
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

class ValidationHelpers {
  
  /**
   * Validate Irish tax calculations
   * @param {number} grossIncome - Gross annual income
   * @param {number} actualTax - Actual tax calculated
   * @param {boolean} isMarried - Whether person is married
   * @returns {Object} - Validation result
   */
  static validateIncomeTax(grossIncome, actualTax, isMarried = false) {
    const standardBand = isMarried 
      ? IRISH_TAX_RATES.INCOME_TAX.STANDARD_RATE_BAND_MARRIED
      : IRISH_TAX_RATES.INCOME_TAX.STANDARD_RATE_BAND_SINGLE;
    
    let expectedTax = 0;
    if (grossIncome <= standardBand) {
      expectedTax = grossIncome * IRISH_TAX_RATES.INCOME_TAX.STANDARD_RATE;
    } else {
      expectedTax = standardBand * IRISH_TAX_RATES.INCOME_TAX.STANDARD_RATE +
                   (grossIncome - standardBand) * IRISH_TAX_RATES.INCOME_TAX.HIGHER_RATE;
    }
    
    // Apply tax credits
    const credits = isMarried 
      ? IRISH_TAX_RATES.TAX_CREDITS.PERSONAL_MARRIED + IRISH_TAX_RATES.TAX_CREDITS.EMPLOYEE
      : IRISH_TAX_RATES.TAX_CREDITS.PERSONAL_SINGLE + IRISH_TAX_RATES.TAX_CREDITS.EMPLOYEE;
    
    expectedTax = Math.max(0, expectedTax - credits);
    
    return NumericUtils.compareWithTolerance(actualTax, expectedTax, 1.0);
  }

  /**
   * Validate PRSI calculations
   * @param {number} grossIncome - Gross annual income
   * @param {number} actualPRSI - Actual PRSI calculated
   * @returns {Object} - Validation result
   */
  static validatePRSI(grossIncome, actualPRSI) {
    let expectedPRSI = 0;
    if (grossIncome > IRISH_TAX_RATES.PRSI.ANNUAL_THRESHOLD) {
      expectedPRSI = grossIncome * IRISH_TAX_RATES.PRSI.EMPLOYEE_RATE;
    }
    
    return NumericUtils.compareWithTolerance(actualPRSI, expectedPRSI, 1.0);
  }

  /**
   * Validate USC calculations
   * @param {number} grossIncome - Gross annual income
   * @param {number} actualUSC - Actual USC calculated
   * @returns {Object} - Validation result
   */
  static validateUSC(grossIncome, actualUSC) {
    let expectedUSC = 0;
    
    if (grossIncome <= IRISH_TAX_RATES.USC.BAND_1_LIMIT) {
      expectedUSC = grossIncome * IRISH_TAX_RATES.USC.BAND_1_RATE;
    } else if (grossIncome <= IRISH_TAX_RATES.USC.BAND_2_LIMIT) {
      expectedUSC = IRISH_TAX_RATES.USC.BAND_1_LIMIT * IRISH_TAX_RATES.USC.BAND_1_RATE +
                   (grossIncome - IRISH_TAX_RATES.USC.BAND_1_LIMIT) * IRISH_TAX_RATES.USC.BAND_2_RATE;
    } else if (grossIncome <= IRISH_TAX_RATES.USC.BAND_3_LIMIT) {
      expectedUSC = IRISH_TAX_RATES.USC.BAND_1_LIMIT * IRISH_TAX_RATES.USC.BAND_1_RATE +
                   (IRISH_TAX_RATES.USC.BAND_2_LIMIT - IRISH_TAX_RATES.USC.BAND_1_LIMIT) * IRISH_TAX_RATES.USC.BAND_2_RATE +
                   (grossIncome - IRISH_TAX_RATES.USC.BAND_2_LIMIT) * IRISH_TAX_RATES.USC.BAND_3_RATE;
    } else {
      expectedUSC = IRISH_TAX_RATES.USC.BAND_1_LIMIT * IRISH_TAX_RATES.USC.BAND_1_RATE +
                   (IRISH_TAX_RATES.USC.BAND_2_LIMIT - IRISH_TAX_RATES.USC.BAND_1_LIMIT) * IRISH_TAX_RATES.USC.BAND_2_RATE +
                   (IRISH_TAX_RATES.USC.BAND_3_LIMIT - IRISH_TAX_RATES.USC.BAND_2_LIMIT) * IRISH_TAX_RATES.USC.BAND_3_RATE +
                   (grossIncome - IRISH_TAX_RATES.USC.BAND_3_LIMIT) * IRISH_TAX_RATES.USC.BAND_4_RATE;
    }
    
    // Add surcharge for high earners
    if (grossIncome > IRISH_TAX_RATES.USC.SURCHARGE_THRESHOLD) {
      expectedUSC += grossIncome * IRISH_TAX_RATES.USC.SURCHARGE_RATE;
    }
    
    return NumericUtils.compareWithTolerance(actualUSC, expectedUSC, 1.0);
  }

  /**
   * Validate pension contribution limits
   * @param {number} salary - Annual salary
   * @param {number} age - Person's age
   * @param {number} contribution - Pension contribution amount
   * @returns {Object} - Validation result
   */
  static validatePensionContribution(salary, age, contribution) {
    // Get age-based contribution rate
    let maxRate = 0.15; // Default for under 30
    for (const [ageThreshold, rate] of Object.entries(IRISH_TAX_RATES.PENSION.AGE_BANDS)) {
      if (age >= parseInt(ageThreshold)) {
        maxRate = rate;
      }
    }
    
    // Apply earnings cap
    const pensionableEarnings = Math.min(salary, IRISH_TAX_RATES.PENSION.MAX_ANNUAL_EARNINGS);
    const maxContribution = pensionableEarnings * maxRate;
    
    const isValid = contribution <= maxContribution + 1; // Allow €1 tolerance
    
    return {
      success: isValid,
      actual: contribution,
      expected: maxContribution,
      maxRate: maxRate,
      pensionableEarnings: pensionableEarnings,
      message: isValid 
        ? `✓ Contribution ${FormatUtils.formatCurrency(contribution)} is within limit ${FormatUtils.formatCurrency(maxContribution)}`
        : `✗ Contribution ${FormatUtils.formatCurrency(contribution)} exceeds limit ${FormatUtils.formatCurrency(maxContribution)}`
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export for Node.js
module.exports = {
  IRISH_TAX_RATES,
  STANDARD_PARAMETERS,
  EventGenerator,
  NumericUtils,
  FormatUtils,
  ValidationHelpers
}; 