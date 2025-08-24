/* Test Utilities for FinSim - Helper functions and constants for testing
 * 
 * This file provides utility functions for creating test scenarios, generating common
 * parameter sets and event arrays, and includes generic validation helpers for tax
 * calculations driven by a provided tax ruleset. Designed to simplify test creation
 * and ensure consistency across test scenarios.
 */

const path = require('path');

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
    pensionCapped: "Yes",
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
    // Country-specific values should be filled from the tax ruleset in tests/simulations.
    personalTaxCredit: 0,
    statePensionWeekly: 0,
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
    pensionCapped: "Yes",
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
    personalTaxCredit: 0,
    statePensionWeekly: 0,
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
    pensionCapped: "Yes",
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
    personalTaxCredit: 0,
    statePensionWeekly: 0,
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
    pensionCapped: "Yes",
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
    personalTaxCredit: 0,
    statePensionWeekly: 0,
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
// VALIDATION HELPERS (Generic, driven by a TaxRuleSet)
// =============================================================================

class ValidationHelpers {

  /**
   * Helper: extract a TaxRuleSet instance from various inputs.
   * Accepts:
   * - Explicit taxRuleSet object (instance or raw JSON)
   * - options object containing taxRuleSet
   * - global Config if available: Config.getInstance().getCachedTaxRuleSet()
   */
  static _resolveTaxRuleSet(options = {}) {
    // Direct provided taxRuleSet
    if (options && options.taxRuleSet) {
      const tr = options.taxRuleSet;
      // If a raw JSON is provided, wrap into TaxRuleSet if available
      if (tr && typeof tr.getIncomeTaxSpec !== 'function') {
        if (typeof TaxRuleSet === 'function') return new TaxRuleSet(tr);
        return tr; // best-effort fallback
      }
      return tr;
    }

    // Try Config singleton if present
    if (typeof Config !== 'undefined' && Config.getInstance && typeof Config.getInstance === 'function') {
      try {
        const cfg = Config.getInstance();
        if (cfg && typeof cfg.getCachedTaxRuleSet === 'function') {
          const cached = cfg.getCachedTaxRuleSet();
          if (cached) return cached;
        }
      } catch (e) {
        // ignore and fallback
      }
    }

    // If a global taxRules raw object exists, try to wrap
    if (typeof taxRules !== 'undefined' && taxRules) {
      if (typeof TaxRuleSet === 'function') return new TaxRuleSet(taxRules);
      return taxRules;
    }

    // As last resort, if a TaxRuleSet class is available but no rules provided,
    // return null to indicate failure to resolve a ruleset.
    return null;
  }

  /**
   * Compute tax based on bracket definitions.
   * Expects 'brackets' to be an object mapping lower-threshold (string/number) -> rate (0-1).
   * Example: { "0": 0.2, "40000": 0.4 }
   */
  static _computeTaxFromBrackets(income, brackets) {
    if (!brackets || typeof brackets !== 'object') return 0;
    const keys = Object.keys(brackets).map(k => parseFloat(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
    if (keys.length === 0) return 0;

    let tax = 0;
    for (let i = 0; i < keys.length; i++) {
      const lower = keys[i];
      const upper = (i + 1 < keys.length) ? keys[i + 1] : Infinity;
      const rate = parseFloat(brackets[String(lower)]);
      if (isNaN(rate)) continue;
      const taxable = Math.max(0, Math.min(income, upper) - lower);
      if (taxable > 0) tax += taxable * rate;
      if (income <= upper) break;
    }
    return tax;
  }

  /**
   * Generic income tax validation driven by a tax ruleset.
   * Attempts to compute expected income tax using the ruleset's bracket definition
   * and tax credits and compares using NumericUtils.compareWithTolerance.
   *
   * @param {number} grossIncome - Gross annual income
   * @param {number} actualTax - Actual tax calculated by the simulator
   * @param {Object} options - Optional parameters:
   *   - status: 'single'|'married' (default 'single')
   *   - hasDependentChildren: boolean (default false)
   *   - taxRuleSet: TaxRuleSet instance or raw JSON
   *   - tolerance: numeric tolerance for comparison (default 1.0)
   * @returns {Object} - Comparison result from NumericUtils.compareWithTolerance
   */
  static validateTaxCalculation(grossIncome, actualTax, options = {}) {
    const status = options.status || 'single';
    const hasDependentChildren = !!options.hasDependentChildren;
    const tolerance = (typeof options.tolerance === 'number') ? options.tolerance : 1.0;

    const taxRuleSet = this._resolveTaxRuleSet(options);
    if (!taxRuleSet || typeof taxRuleSet.getIncomeTaxBracketsFor !== 'function') {
      // If we cannot resolve a ruleset, fall back to direct bracket object in options
      const fallbackBrackets = options.brackets || {};
      const expected = this._computeTaxFromBrackets(grossIncome, fallbackBrackets);
      return NumericUtils.compareWithTolerance(actualTax, expected, tolerance);
    }

    // Get appropriate brackets for status (TaxRuleSet handles status-specific selection)
    const brackets = (typeof taxRuleSet.getIncomeTaxBracketsFor === 'function')
      ? taxRuleSet.getIncomeTaxBracketsFor(status, hasDependentChildren)
      : (taxRuleSet.incomeTax && taxRuleSet.incomeTax.brackets) || {};

    const expectedBeforeCredits = this._computeTaxFromBrackets(grossIncome, brackets);

    // Determine credits from income tax spec (best-effort lookup of common keys)
    const itSpec = (typeof taxRuleSet.getIncomeTaxSpec === 'function') ? taxRuleSet.getIncomeTaxSpec() : (taxRuleSet.incomeTax || {});
    const creditsObj = itSpec.taxCredits || {};

    const employeeCredit = (typeof creditsObj.employee === 'number') ? creditsObj.employee :
                            (typeof creditsObj.employee_credit === 'number' ? creditsObj.employee_credit : 0);

    let personalCredit = 0;
    if (typeof creditsObj.personal === 'number') personalCredit = creditsObj.personal;
    else if (typeof creditsObj.personalSingle === 'number') personalCredit = creditsObj.personalSingle;
    else if (typeof creditsObj.personal_single === 'number') personalCredit = creditsObj.personal_single;
    else if (typeof creditsObj.single === 'number') personalCredit = creditsObj.single;
    else if (typeof creditsObj.personal_single_amount === 'number') personalCredit = creditsObj.personal_single_amount;

    let marriedCredit = 0;
    if (typeof creditsObj.married === 'number') marriedCredit = creditsObj.married;
    else if (typeof creditsObj.personalMarried === 'number') marriedCredit = creditsObj.personalMarried;
    else if (typeof creditsObj.personal_married === 'number') marriedCredit = creditsObj.personal_married;

    const creditTotal = employeeCredit + (status === 'married' ? (marriedCredit || personalCredit) : personalCredit);

    const expected = Math.max(0, expectedBeforeCredits - creditTotal);

    return NumericUtils.compareWithTolerance(actualTax, expected, tolerance);
  }

  /**
   * Generic social contribution validation.
   * Tries to locate a social contribution descriptor by taxId/name within the ruleset
   * and compute expected contribution. Falls back to a simple rate*income if only a rate is present.
   *
   * @param {number} grossIncome
   * @param {number} actualContribution
   * @param {Object} options - { taxId: 'prsi', taxName: 'PRSI', taxRuleSet, tolerance }
   * @returns {Object} - Comparison result
   */
  static validateSocialContribution(grossIncome, actualContribution, options = {}) {
    const tolerance = (typeof options.tolerance === 'number') ? options.tolerance : 1.0;
    const taxRuleSet = this._resolveTaxRuleSet(options);
    let expected = 0;

    if (taxRuleSet && typeof taxRuleSet.getSocialContributions === 'function') {
      const list = taxRuleSet.getSocialContributions();
      const id = options.taxId || options.taxName;
      let found = null;
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (!t) continue;
        if ((id && (t.id === id || t.name === id || (t.name && t.name.toLowerCase() === String(id).toLowerCase()))) || (!id && (t.id === 'prsi' || (t.name && t.name.toLowerCase() === 'prsi')))) {
          found = t;
          break;
        }
      }
      if (found) {
        // If descriptor provides a flat rate, apply it. If there is a threshold, attempt to honor it.
        if (typeof found.rate === 'number') {
          const threshold = (typeof found.annualThreshold === 'number') ? found.annualThreshold : (typeof found.minIncome === 'number' ? found.minIncome : null);
          if (threshold !== null && grossIncome <= threshold) {
            expected = 0;
          } else {
            expected = grossIncome * found.rate;
          }
        } else {
          // No structured descriptor: fallback to zero
          expected = 0;
        }
      }
    }

    // If no ruleset or not found, allow caller to provide expected in options
    if (typeof options.expected !== 'undefined') expected = options.expected;

    return NumericUtils.compareWithTolerance(actualContribution, expected, tolerance);
  }

  /**
   * Generic additional tax validation (e.g., USC-like progressive additional taxes).
   * Uses TaxRuleSet.getAdditionalTaxBandsFor(name, age, totalIncome) to select bands.
   *
   * @param {number} grossIncome
   * @param {number} actualTax
   * @param {Object} options - { taxName: 'usc', age: number, taxRuleSet, tolerance }
   * @returns {Object} - Comparison result
   */
  static validateAdditionalTax(grossIncome, actualTax, options = {}) {
    const tolerance = (typeof options.tolerance === 'number') ? options.tolerance : 1.0;
    const taxRuleSet = this._resolveTaxRuleSet(options);
    const taxName = options.taxName || options.name || options.taxId || 'usc';
    let expected = 0;

    if (taxRuleSet && typeof taxRuleSet.getAdditionalTaxBandsFor === 'function') {
      const bands = taxRuleSet.getAdditionalTaxBandsFor(taxName, options.age || null, grossIncome);
      expected = this._computeTaxFromBrackets(grossIncome, bands);
      // If descriptor defines an exemptAmount, subtract it by reducing taxable income
      if (typeof taxRuleSet.getAdditionalTaxExemptAmount === 'function') {
        const exempt = taxRuleSet.getAdditionalTaxExemptAmount(taxName);
        if (exempt && exempt > 0) {
          const adjusted = Math.max(0, grossIncome - exempt);
          expected = this._computeTaxFromBrackets(adjusted, bands);
        }
      }
    }

    if (typeof options.expected !== 'undefined') expected = options.expected;

    return NumericUtils.compareWithTolerance(actualTax, expected, tolerance);
  }

  /**
   * Validate pension contribution against ruleset pension contribution limits (generic).
   * Uses pension contribution age bands and annual cap if available.
   *
   * @param {number} salary
   * @param {number} age
   * @param {number} contribution
   * @param {Object} options - { taxRuleSet, tolerance }
   * @returns {Object} - Validation result
   */
  static validatePensionContribution(salary, age, contribution, options = {}) {
    const tolerance = (typeof options.tolerance === 'number') ? options.tolerance : 1.0;
    const taxRuleSet = this._resolveTaxRuleSet(options);

    let maxRate = 0.15; // sensible default if not provided
    let annualCap = Infinity;

    if (taxRuleSet) {
      if (typeof taxRuleSet.getPensionContributionAgeBands === 'function') {
        const bands = taxRuleSet.getPensionContributionAgeBands();
        // bands expected to be map ageThreshold -> percent
        const thresholds = Object.keys(bands || {}).map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
        for (let i = 0; i < thresholds.length; i++) {
          if (age >= thresholds[i]) maxRate = bands[String(thresholds[i])] || maxRate;
        }
      }
      if (typeof taxRuleSet.getPensionContributionAnnualCap === 'function') {
        const cap = taxRuleSet.getPensionContributionAnnualCap();
        if (typeof cap === 'number' && cap > 0) annualCap = cap;
      }
    }

    const pensionableEarnings = Math.min(salary, annualCap === Infinity ? salary : annualCap);
    const maxContribution = pensionableEarnings * maxRate;

    const isValid = contribution <= (maxContribution + tolerance);

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

// Export for Node.js and CommonJS environments
module.exports = {
  STANDARD_PARAMETERS,
  EventGenerator,
  NumericUtils,
  FormatUtils,
  ValidationHelpers
};

// -----------------------------------------------------------------------------
// Test-time tax rates adapter
// -----------------------------------------------------------------------------
// Provide a lightweight, test-friendly view of values commonly referenced in
// tests. Values are sourced from the local tax rules JSON file so tests remain
// data-driven rather than hard-coding country-specific constants.
try {
  // Load the Irish tax rules JSON (used as the authoritative test fixture).
  // Keep the key names here generic so tests can use `TAX_RATES` instead of
  // referencing a country by name.
  const localTaxRules = require(path.join(__dirname, 'config', 'tax-rules-ie.json'));

  // Build a minimal mapping expected by tests. Use actual keys present in the
  // tax rules file when available, otherwise fall back to sensible defaults.
  const incomeTax = localTaxRules.incomeTax || {};
  const pensionRules = localTaxRules.pensionRules || {};

  module.exports.TAX_RATES = {
    TAX_CREDITS: {
      // Many tax rule JSONs expose an "employee" credit; tests historically
      // referenced a PERSONAL_SINGLE constant — map it to a sensible source.
      PERSONAL_SINGLE: (incomeTax.taxCredits && (typeof incomeTax.taxCredits.employee === 'number')) ? incomeTax.taxCredits.employee : 0
    },
    STATE_PENSION: {
      // No universal weekly rate exists in the current JSON; default to 0
      // if not provided. Tests should tolerate zero where appropriate.
      WEEKLY_RATE: (pensionRules.statePensionWeekly && typeof pensionRules.statePensionWeekly === 'number') ? pensionRules.statePensionWeekly : 0
    }
  };
} catch (e) {
  // If loading fails for any reason, provide a minimal fallback to avoid
  // crashing tests that reference `TestUtils.TAX_RATES`.
  module.exports.TAX_RATES = {
    TAX_CREDITS: { PERSONAL_SINGLE: 0 },
    STATE_PENSION: { WEEKLY_RATE: 0 }
  };
}

// Backwards compatibility alias used by tests
module.exports.IRISH_TAX_RATES = module.exports.TAX_RATES;