// Custom test to validate that income and contribution present-value calculations
// use source-country (asset/contribution country) deflation, not the current
// residence country's deflation. This tests exposes bugs in PresentValueCalculator
// where incomeSalariesPV, incomeRentalsPV, incomePrivatePensionPV, and
// pensionContributionPV all incorrectly use `deflationFactor` (residence country
// inflation) instead of per-source-country deflation.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');
const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

const INFLATION_SERVICE_CODE = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'core', 'InflationService.js'),
  'utf8'
);

/**
 * Check if actual is within tolerance of expected.
 * Handles both absolute and relative tolerance.
 */
function withinTolerance(actual, expected, tol) {
  if (!isFinite(actual) || !isFinite(expected)) return false;
  const diff = Math.abs(actual - expected);
  if (diff <= tol) return true;
  const denom = Math.abs(expected) > 1e-9 ? Math.abs(expected) : 1;
  return diff / denom <= tol;
}

/**
 * Ensure InflationService is loaded in the framework's VM context.
 */
function ensureInflationServiceLoaded(framework) {
  const ctx = framework.simulationContext;
  if (!ctx || ctx.__inflationServiceLoaded) return;
  vm.runInContext(INFLATION_SERVICE_CODE, ctx, {
    filename: 'InflationService.js',
    displayErrors: true
  });
  ctx.__inflationServiceLoaded = true;
}

/**
 * Create AR rules that use EUR currency to simplify testing
 * by avoiding currency conversion complications.
 */
function buildEuroARRules() {
  const clone = deepClone(AR_RULES);
  if (!clone.locale) clone.locale = {};
  clone.locale.currencyCode = 'EUR';
  clone.locale.currencySymbol = '€';
  return clone;
}

/**
 * Find a row by age (rounded).
 */
function findRowByAge(rows, age) {
  return rows.find(row => Math.round(row.age) === age);
}

/**
 * Run a scenario and return the results.
 */
async function runScenario(scenarioFactory, rulesFactory) {
  const framework = new TestFramework();
  const scenarioDefinition = scenarioFactory();

  if (!framework.loadScenario(scenarioDefinition)) {
    return { ok: false, error: 'Failed to load scenario: ' + scenarioDefinition.name };
  }

  ensureInflationServiceLoaded(framework);
  const ruleMap = typeof rulesFactory === 'function' ? rulesFactory() : null;
  if (ruleMap) {
    installTestTaxRules(framework, ruleMap);
  }

  const results = await framework.runSimulation();
  if (!results || !results.success) {
    return { ok: false, error: 'Simulation failed for scenario: ' + scenarioDefinition.name };
  }

  const rows = Array.isArray(results.dataSheet)
    ? results.dataSheet.filter(row => row && typeof row === 'object')
    : [];

  if (!rows.length) {
    return { ok: false, error: 'Simulation produced no rows for scenario: ' + scenarioDefinition.name };
  }

  return { ok: true, rows, results };
}

// ============================================================================
// Test 0.1: Pension Contribution PV
// ============================================================================
// Scenario: Irish salary with pension contributions, relocate to Argentina at
// age 40. At age 45 (5 years post-relocation), pension contributions should
// use Ireland deflation (~0.74 for 15 years at 2%), NOT Argentina deflation
// (~0.13 for 5 years at 50%).

function createPensionContributionScenario() {
  return {
    name: 'PensionContributionPVDeflation',
    description: 'Pension contributions should use contribution-country deflation, not residence deflation',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 50,
        retirementAge: 65,
        initialSavings: 100000,
        initialPension: 0,
        initialFunds: 0,
        initialShares: 0,
        emergencyStash: 0,
        FundsAllocation: 0,
        SharesAllocation: 0,
        pensionPercentage: 0.10,
        statePensionWeekly: 0,
        inflation: 0.02,
        growthRateFunds: 0,
        growthDevFunds: 0,
        growthRateShares: 0,
        growthDevShares: 0,
        growthRatePension: 0.05,
        growthDevPension: 0,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economyMode: 'deterministic',
        relocationEnabled: true
      },
      events: [
        { type: 'SI', id: 'Salary_IE', amount: 50000, fromAge: 30, toAge: 64, currency: 'EUR', rate: 0.02 },
        { type: 'MV', name: 'AR', id: 'Move_AR', amount: 0, fromAge: 40, toAge: 40, currency: 'EUR', rate: 0.50 }
      ]
    },
    assertions: []
  };
}

// ============================================================================
// Test 0.2: Private Pension Income PV
// ============================================================================
// Scenario: Irish pension pot built up from contributions, relocate at age 40,
// draw pension at age 65. Private pension income should use Ireland deflation
// (~0.50 for 35 years at 2%), NOT Argentina deflation (~0.00003 for 25 years at 50%).

function createPrivatePensionIncomeScenario() {
  return {
    name: 'PrivatePensionIncomePVDeflation',
    description: 'Private pension income should use fund-country deflation, not residence deflation',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 70,
        retirementAge: 65,
        initialSavings: 100000,
        initialPension: 100000,
        initialFunds: 0,
        initialShares: 0,
        emergencyStash: 0,
        FundsAllocation: 0,
        SharesAllocation: 0,
        pensionPercentage: 0.10,
        statePensionWeekly: 0,
        inflation: 0.02,
        growthRateFunds: 0,
        growthDevFunds: 0,
        growthRateShares: 0,
        growthDevShares: 0,
        growthRatePension: 0.05,
        growthDevPension: 0,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economyMode: 'deterministic',
        relocationEnabled: true
      },
      events: [
        { type: 'SI', id: 'Salary_IE', amount: 50000, fromAge: 30, toAge: 64, currency: 'EUR', rate: 0.02 },
        { type: 'MV', name: 'AR', id: 'Move_AR', amount: 0, fromAge: 40, toAge: 40, currency: 'EUR', rate: 0.50 }
      ]
    },
    assertions: []
  };
}

// ============================================================================
// Test 0.3: Salaries PV (Multi-Country in Same Year)
// ============================================================================
// Scenario: Irish salary (age 30-40) and Argentine salary (age 40-64), relocate
// at age 40. At age 40 (relocation year), salaries from both countries should
// use per-country deflation, not a single residence deflation factor.

function createSalariesMultiCountryScenario() {
  return {
    name: 'SalariesMultiCountryPVDeflation',
    description: 'Salary income should use per-country deflation for each income source',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 50,
        retirementAge: 65,
        initialSavings: 100000,
        initialPension: 0,
        initialFunds: 0,
        initialShares: 0,
        emergencyStash: 0,
        FundsAllocation: 0,
        SharesAllocation: 0,
        pensionPercentage: 0,
        statePensionWeekly: 0,
        inflation: 0.02,
        growthRateFunds: 0,
        growthDevFunds: 0,
        growthRateShares: 0,
        growthDevShares: 0,
        growthRatePension: 0,
        growthDevPension: 0,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economyMode: 'deterministic',
        relocationEnabled: true
      },
      events: [
        { type: 'SI', id: 'Salary_IE', amount: 40000, fromAge: 30, toAge: 40, currency: 'EUR', rate: 0.02 },
        { type: 'SI', id: 'Salary_AR', amount: 30000, fromAge: 40, toAge: 64, currency: 'EUR', linkedCountry: 'ar', rate: 0.50 },
        { type: 'MV', name: 'AR', id: 'Move_AR', amount: 0, fromAge: 40, toAge: 40, currency: 'EUR', rate: 0.50 }
      ]
    },
    assertions: []
  };
}

// ============================================================================
// Test 0.4: Rental Income PV
// ============================================================================
// Scenario: Irish rental property (€2,000/month = €24,000/year), relocate to
// Argentina at age 35. At age 45 (10 years post-relocation), rental income
// should use Ireland deflation (~0.74 for 15 years at 2%), NOT Argentina
// deflation (~0.017 for 10 years at 50%).

function createRentalIncomeScenario() {
  return {
    name: 'RentalIncomePVDeflation',
    description: 'Rental income should use property-country deflation, not residence deflation',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 50,
        retirementAge: 65,
        initialSavings: 500000,
        initialPension: 0,
        initialFunds: 0,
        initialShares: 0,
        emergencyStash: 0,
        FundsAllocation: 0,
        SharesAllocation: 0,
        pensionPercentage: 0,
        statePensionWeekly: 0,
        inflation: 0.02,
        growthRateFunds: 0,
        growthDevFunds: 0,
        growthRateShares: 0,
        growthDevShares: 0,
        growthRatePension: 0,
        growthDevPension: 0,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economyMode: 'deterministic',
        relocationEnabled: true
      },
      events: [
        // Irish rental income of €24,000/year (€2,000/month) linked to IE property
        { type: 'RI', id: 'IE_Rental', amount: 24000, fromAge: 30, toAge: 70, currency: 'EUR', linkedCountry: 'ie', rate: 0.02 },
        { type: 'MV', name: 'AR', id: 'Move_AR', amount: 0, fromAge: 35, toAge: 35, currency: 'EUR', rate: 0.50 }
      ]
    },
    assertions: []
  };
}

module.exports = {
  name: 'PVMultiCountryDeflation',
  description: 'Validates that income/contribution PV uses source-country deflation, not residence-country deflation',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // ========================================================================
    // Test 0.1: Pension Contribution PV
    // ========================================================================
    const pensionContribResult = await runScenario(createPensionContributionScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildEuroARRules()
    }));
    if (!pensionContribResult.ok) {
      return { success: false, errors: [pensionContribResult.error] };
    }

    const pcRows = pensionContribResult.rows;

    // At age 38, 8 years since start (age 30), still in IE (relocation at 40)
    const pcRow38 = findRowByAge(pcRows, 38);
    if (!pcRow38) {
      return { success: false, errors: ['Missing age 38 row in pension contribution scenario'] };
    }

    const pcYearsSinceStart38 = 8;
    const pcIeDefFactor38 = 1 / Math.pow(1.02, pcYearsSinceStart38);  // ~0.85

    // Check that pensionContribution and pensionContributionPV exist at age 38 (still in IE)
    if (pcRow38.pensionContribution && pcRow38.pensionContribution > 0) {
      const pcActualRatio38 = pcRow38.pensionContributionPV / pcRow38.pensionContribution;

      // At age 38 (still in IE), contribution PV should use IE deflation
      if (!withinTolerance(pcActualRatio38, pcIeDefFactor38, 0.02)) {
        errors.push(
          `Test 0.1 FAIL: Pre-relocation pension contribution PV at age 38 should use IE deflation (~${pcIeDefFactor38.toFixed(4)}), ` +
          `but got ratio ${pcActualRatio38.toFixed(4)}. `
        );
      }
    } else {
      errors.push('Test 0.1 SKIP: No pension contributions found at age 38 (pre-relocation)');
    }

    // Also test at age 45 (5 years post-relocation) - contributions after relocation go to AR pot
    // but should still use per-country deflation based on contribution country
    const pcRow45 = findRowByAge(pcRows, 45);

    if (!pcRow45) {
      errors.push('Test 0.1 WARNING: Missing age 45 row in pension contribution scenario');
    } else if (pcRow45.pensionContribution && pcRow45.pensionContribution > 0) {
      // At age 45, contributions are to AR pot (post-relocation)
      // The deflationFactor bug would show if we had IE contributions being deflated with AR rate
      // Since contributions at age 45 are AR contributions, they should use AR cumulative deflation
      const pcYearsSinceStart = 15;
      const pcYearsPostRelocation = 5;

      // For AR contributions at age 45:
      // Bug uses cumulative residence deflation: 1/(1.02^10 * 1.50^5) = ~0.11
      // But AR contributions should use AR deflation from contribution time
      // Since these are current-year contributions, they get minimal AR deflation
      const pcActualRatio = pcRow45.pensionContributionPV / pcRow45.pensionContribution;

      // The key insight: pensionContributionPV is a cumulative total, not per-year
      // At age 45, it includes:
      // - IE contributions (ages 30-39): should use IE deflation
      // - AR contributions (ages 40-45): should use AR deflation
      // Current bug: uses single residence deflation for all

      // For now, just log the actual values
      const bugDeflation = 1 / (Math.pow(1.02, 10) * Math.pow(1.50, 5));  // ~0.11
      if (pcActualRatio < 0.20) {  // If ratio is very low, indicates bug
        errors.push(
          `Test 0.1 FAIL: Pension contribution PV at age 45 has ratio ${pcActualRatio.toFixed(4)}, ` +
          `which suggests cumulative residence deflation is being applied. ` +
          `Expected higher ratio with per-country deflation.`
        );
      }
    }

    // ========================================================================
    // Test 0.2: Private Pension Income PV
    // ========================================================================
    const privatePensionResult = await runScenario(createPrivatePensionIncomeScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildEuroARRules()
    }));
    if (!privatePensionResult.ok) {
      return { success: false, errors: [privatePensionResult.error] };
    }

    const ppRows = privatePensionResult.rows;
    const ppRow65 = findRowByAge(ppRows, 65);

    if (!ppRow65) {
      return { success: false, errors: ['Missing age 65 row in private pension income scenario'] };
    }

    // At age 65, 35 years since start (age 30), 25 years post-relocation
    const ppYearsSinceStart = 35;
    const ppYearsPostRelocation = 25;
    const ppIeDefFactor = 1 / Math.pow(1.02, ppYearsSinceStart);  // ~0.50
    const ppArDefFactor = 1 / Math.pow(1.50, ppYearsPostRelocation);  // ~0.00003

    // Check that incomePrivatePension and incomePrivatePensionPV exist
    if (ppRow65.incomePrivatePension && ppRow65.incomePrivatePension > 0) {
      const ppActualRatio = ppRow65.incomePrivatePensionPV / ppRow65.incomePrivatePension;

      // Test will FAIL because actualRatio will be tiny (AR) not ~0.50 (IE)
      if (!withinTolerance(ppActualRatio, ppIeDefFactor, 0.02)) {
        errors.push(
          `Test 0.2 FAIL: Private pension income PV should use IE deflation (~${ppIeDefFactor.toFixed(4)}), ` +
          `but got ratio ${ppActualRatio.toFixed(6)}. ` +
          `AR deflation would be ~${ppArDefFactor.toFixed(6)}. ` +
          `This indicates residence-country deflation is being used instead of fund-country.`
        );
      }

      // Verify it's not using AR deflation (ratio should be >> AR deflation)
      if (ppActualRatio <= ppArDefFactor * 100) {
        errors.push(
          `Test 0.2 FAIL: PV ratio (${ppActualRatio.toFixed(6)}) is too close to AR deflation ` +
          `(${ppArDefFactor.toFixed(6)}), confirming residence-country deflation bug.`
        );
      }
    } else {
      errors.push('Test 0.2 SKIP: No private pension income found at age 65');
    }

    // ========================================================================
    // Test 0.3: Salaries PV (Multi-Country in Same Year)
    // ========================================================================
    const salariesResult = await runScenario(createSalariesMultiCountryScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildEuroARRules()
    }));
    if (!salariesResult.ok) {
      return { success: false, errors: [salariesResult.error] };
    }

    const salRows = salariesResult.rows;
    const salRow45 = findRowByAge(salRows, 45);

    if (!salRow45) {
      return { success: false, errors: ['Missing age 45 row in salaries multi-country scenario'] };
    }

    // At age 45, 15 years since start (age 30), 5 years post-relocation
    // Only AR salary is active at this point (IE salary ended at age 40)
    const salYearsSinceStart = 15;
    const salYearsPostRelocation = 5;
    const salIeDefFactor = 1 / Math.pow(1.02, salYearsSinceStart);  // ~0.74
    const salArDefFactor = 1 / Math.pow(1.50, salYearsPostRelocation);  // ~0.13

    if (salRow45.incomeSalaries && salRow45.incomeSalaries > 0) {
      const salActualRatio = salRow45.incomeSalariesPV / salRow45.incomeSalaries;

      // The cumulative residence deflation bug: uses 1/(1.02^10 * 1.50^5) = ~0.011
      // instead of just AR deflation from relocation point: 1/1.50^5 = ~0.13
      // The extremely low ratio indicates the bug is present
      const bugDeflationFactor = 1 / (Math.pow(1.02, 10) * Math.pow(1.50, 5));  // ~0.011

      if (salActualRatio < salArDefFactor * 0.5) {
        errors.push(
          `Test 0.3 FAIL: At age 45, salary PV ratio is ${salActualRatio.toFixed(4)}. ` +
          `Expected ratio ~${salArDefFactor.toFixed(4)} (AR deflation from relocation), ` +
          `but got value closer to bug deflation ~${bugDeflationFactor.toFixed(4)}. ` +
          `This indicates cumulative residence deflation is being applied incorrectly.`
        );
      }
    }

    // Test at age 40 where both salaries might be active
    const salRow40 = findRowByAge(salRows, 40);
    if (salRow40) {
      const iePortionNominal = 40000;
      const arPortionNominal = 30000;
      const totalNominal = iePortionNominal + arPortionNominal;
      const ieDefFactorAt40 = 1 / Math.pow(1.02, 10);  // ~0.82
      const arDefFactorAt40 = 1.0;  // same year as relocation
      const expectedPV = iePortionNominal * ieDefFactorAt40 + arPortionNominal * arDefFactorAt40;
      // Expected = 40000 * 0.82 + 30000 * 1.0 = 32,800 + 30,000 = 62,800

      const actualSalaries = salRow40.incomeSalaries || 0;
      const actualSalariesPV = salRow40.incomeSalariesPV || 0;

      if (actualSalaries >= totalNominal * 0.9) {  // At least 90% of expected
        // Check if PV uses per-country deflation
        if (!withinTolerance(actualSalariesPV, expectedPV, expectedPV * 0.05)) {
          const bugPV = actualSalaries * ieDefFactorAt40;  // Bug would use single factor
          errors.push(
            `Test 0.3 FAIL: At age 40 (relocation year), total salaries PV should use per-country deflation. ` +
            `Expected ~€${expectedPV.toFixed(0)} (weighted: IE@0.82 + AR@1.0), ` +
            `but got €${actualSalariesPV.toFixed(0)}.`
          );
        }
      }
    }

    // ========================================================================
    // Test 0.4: Rental Income PV
    // ========================================================================
    const rentalResult = await runScenario(createRentalIncomeScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildEuroARRules()
    }));
    if (!rentalResult.ok) {
      return { success: false, errors: [rentalResult.error] };
    }

    const rentRows = rentalResult.rows;
    const rentRow45 = findRowByAge(rentRows, 45);

    if (!rentRow45) {
      return { success: false, errors: ['Missing age 45 row in rental income scenario'] };
    }

    // At age 45, 15 years since start (age 30), 10 years post-relocation
    const rentYearsSinceStart = 15;
    const rentYearsPostRelocation = 10;
    const rentIeDefFactor = 1 / Math.pow(1.02, rentYearsSinceStart);  // ~0.74
    const rentArDefFactor = 1 / Math.pow(1.50, rentYearsPostRelocation);  // ~0.017

    // Check that incomeRentals and incomeRentalsPV exist
    // The rental property is in IE (linkedCountry: 'ie'), so should use IE deflation
    if (rentRow45.incomeRentals && rentRow45.incomeRentals > 0) {
      const rentActualRatio = rentRow45.incomeRentalsPV / rentRow45.incomeRentals;

      // Test will FAIL because actualRatio will be ~0.017 (AR) not ~0.74 (IE)
      if (!withinTolerance(rentActualRatio, rentIeDefFactor, 0.02)) {
        errors.push(
          `Test 0.4 FAIL: Rental income PV from IE property should use IE deflation (~${rentIeDefFactor.toFixed(4)}), ` +
          `but got ratio ${rentActualRatio.toFixed(4)}. ` +
          `AR deflation would be ~${rentArDefFactor.toFixed(4)}. ` +
          `This indicates residence-country deflation is being used instead of property-country.`
        );
      }

      // Verify it's not using AR deflation (ratio should be >> AR deflation)
      if (rentActualRatio <= rentArDefFactor * 10) {
        errors.push(
          `Test 0.4 FAIL: Rental PV ratio (${rentActualRatio.toFixed(4)}) is too close to AR deflation ` +
          `(${rentArDefFactor.toFixed(4)}), confirming residence-country deflation bug.`
        );
      }
    } else {
      errors.push('Test 0.4 SKIP: No rental income found at age 45');
    }

    // ========================================================================
    // Test 0.5: Attribution Separation by Country
    // ========================================================================
    // Verify that attributions are properly separated by country with
    // country-qualified source names in the dataRow.attributions structure.
    // 
    // NOTE: In the salaries multi-country scenario at age 40:
    // - Salary_IE is flushed BEFORE relocation when currentCountry='ie' → no suffix
    // - Salary_AR is flushed AFTER relocation when currentCountry='ar' → no suffix
    // Both sources should be present but neither gets a country suffix because
    // each is processed in its "home" country context.

    // Re-use the salaries multi-country scenario which has IE + AR salaries at age 40
    const attrResult = await runScenario(createSalariesMultiCountryScenario, () => ({
      ie: deepClone(IE_RULES),
      ar: buildEuroARRules()
    }));
    if (!attrResult.ok) {
      errors.push(`Test 0.5 SETUP ERROR: ${attrResult.error}`);
    } else {
      const attrRows = attrResult.rows;
      const attrRow40 = findRowByAge(attrRows, 40);

      if (!attrRow40) {
        errors.push('Test 0.5 SKIP: Missing age 40 row for attribution test');
      } else if (!attrRow40.attributions || !attrRow40.attributions.incomesalaries) {
        errors.push('Test 0.5 SKIP: No incomesalaries attributions found at age 40');
      } else {
        const salaryAttrs = attrRow40.attributions.incomesalaries;
        const sources = Object.keys(salaryAttrs);

        // Check for both salary sources
        // Expected pattern: "Salary_IE" and "Salary_AR" (both without country suffix
        // because each is processed in its home country context)
        const hasIeSource = sources.some(s => s.includes('Salary_IE'));
        const hasArSource = sources.some(s => s.includes('Salary_AR'));

        if (!hasIeSource || !hasArSource) {
          errors.push(
            `Test 0.5 FAIL: Expected both IE and AR salary sources at age 40, ` +
            `but found: [${sources.join(', ')}]. ` +
            `One or both sources are missing from attributions.`
          );
        }

        // Verify amounts are reasonable (non-zero)
        for (const source of sources) {
          const amount = salaryAttrs[source];
          if (!amount || amount <= 0) {
            errors.push(`Test 0.5 FAIL: Attribution source "${source}" has invalid amount: ${amount}`);
          }
        }
      }
    }

    return { success: errors.length === 0, errors };
  }
};
