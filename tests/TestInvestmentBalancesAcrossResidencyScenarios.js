/* Investment Balances Across Residency Scenarios Test
 *
 * PURPOSE:
 * - Capture baseline financial state for three residency scenarios (IE-only, US-only, IE→US relocation)
 * - Detect unintended changes in investment outcomes across residency scenarios
 * - Validate investment type handling across countries and relocation scenarios
 *
 * BASELINE CAPTURE: 2026-02-08, Tax Year: 2025/2026, Simulator Version: 2.0
 */

const { TestFramework } = require('../src/core/TestFramework.js');

// Baseline metadata
const baselineMetadata = {
  baselineDate: "2026-02-08",
  simulatorVersion: "2.0",
  taxYear: "2025/2026",
  investmentTypes: ["indexFunds_ie", "shares_ie", "usIndexFunds", "usShares"],
  updateNotes: "Rebaselined for residency-scope tax changes affecting IE→US relocation investment balances",
  maintainer: "Investment balances across residency scenarios test"
};

const expectedBaselines = {
  "IE-Only": {
    cash: 0.00,
    indexFunds_ie: 186955.34,
    shares_ie: 110958.33,
    usIndexFunds: 0,
    usShares: 0,
    it: 0,
    prsi: 0,
    usc: 0,
    cgt: 1820.60
  },
  "US-Only": {
    cash: 0,
    indexFunds_ie: 0,
    shares_ie: 0,
    usIndexFunds: 242263.20,
    usShares: 143307.31,
    it: 0,
    prsi: 0,
    usc: 0,
    cgt: 0
  },
  "IE→US Relocation": {
    cash: 0,
    indexFunds_ie: 141484.39,
    shares_ie: 88238.61,
    usIndexFunds: 20191.91,
    usShares: 15854.88,
    it: 0,
    prsi: 0,
    usc: 0,
    cgt: 0
  }
};

// Helper functions

function getInvestmentCapital(row, typeKey) {
  if (!row || !row.investmentCapitalByKey) {
    return 0;
  }
  return row.investmentCapitalByKey[typeKey] || 0;
}

function withinTolerance(actual, expected, tolerance) {
  const diff = Math.abs(actual - expected);
  return diff <= tolerance;
}

function extractFinalValues(rows) {
  if (!rows || rows.length === 0) {
    return null;
  }
  const validRows = rows.filter(r => r && typeof r === 'object');
  if (validRows.length === 0) {
    return null;
  }
  const finalRow = validRows[validRows.length - 1];
  return {
    age: finalRow.age,
    cash: finalRow.cash || 0,
    indexFunds_ie: getInvestmentCapital(finalRow, 'indexFunds_ie'),
    shares_ie: getInvestmentCapital(finalRow, 'shares_ie'),
    usIndexFunds: getInvestmentCapital(finalRow, 'usIndexFunds'),
    usShares: getInvestmentCapital(finalRow, 'usShares'),
    it: finalRow.it || finalRow.Tax__incomeTax || 0,
    prsi: finalRow.prsi || finalRow.Tax__prsi || 0,
    usc: finalRow.usc || finalRow.Tax__usc || 0,
    cgt: finalRow.cgt || finalRow.Tax__capitalGains || 0
  };
}

module.exports = {
  name: "Investment Balances Across Residency Scenarios",
  description: "Validates final investment balances and tax buckets for IE-only, US-only, and IE→US relocation scenarios",
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    framework.loadCoreModules();
    const errors = [];

    // =============================================================================
    // SCENARIO 1: IE-ONLY (Deterministic)
    // =============================================================================
    const ieScenario = {
      name: 'IEOnlyScenario',
      description: 'Ireland-only scenario with indexFunds_ie and shares_ie',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 40,
          retirementAge: 65,
          StartCountry: 'ie',
          initialSavings: 0,
          initialPension: 0,
          growthDevPension: 0,
          growthDevFunds: 0,
          growthDevShares: 0,
          initialCapitalByKey: {
            indexFunds_ie: 50000,
            shares_ie: 30000
          },
          investmentAllocationsByCountry: {
            ie: {
              indexFunds_ie: 0.6,
              shares_ie: 0.4
            }
          },
          investmentGrowthRatesByKey: {
            indexFunds_ie: 0.07,
            shares_ie: 0.06
          },
          investmentVolatilitiesByKey: {
            indexFunds_ie: 0,
            shares_ie: 0
          },
          inflation: 0.03,
          emergencyStash: 0,
          priorityCash: 1,
          priorityPension: 2,
          priorityFunds: 3,
          priorityShares: 4,
          pensionPercentage: 0,
          pensionCapped: "No",
          statePensionWeekly: 0,
          growthRatePension: 0,
          FundsAllocation: 0,
          SharesAllocation: 0,
          economyMode: 'deterministic',
          simulation_mode: 'single'
        },
        events: [
          {
            type: 'SI',
            id: 'IESalary',
            amount: 50000,
            fromAge: 30,
            toAge: 39,
            rate: 0,
            match: 0,
            currency: 'EUR'
          },
          {
            type: 'E',
            id: 'Expenses',
            amount: 30000,
            fromAge: 30,
            toAge: 39,
            rate: 0,
            match: 0,
            currency: 'EUR'
          }
        ]
      },
      assertions: []
    };

    // =============================================================================
    // SCENARIO 2: US-ONLY (Deterministic)
    // =============================================================================
    const usScenario = {
      name: 'USOnlyScenario',
      description: 'US-only scenario with usIndexFunds and usShares',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 40,
          retirementAge: 65,
          StartCountry: 'us',
          initialSavings: 0,
          initialPension: 0,
          growthDevPension: 0,
          growthDevFunds: 0,
          growthDevShares: 0,
          initialCapitalByKey: {
            usIndexFunds: 50000,
            usShares: 30000
          },
          investmentAllocationsByCountry: {
            us: {
              usIndexFunds: 0.6,
              usShares: 0.4
            }
          },
          investmentGrowthRatesByKey: {
            usIndexFunds: 0.07,
            usShares: 0.06
          },
          investmentVolatilitiesByKey: {
            usIndexFunds: 0,
            usShares: 0
          },
          inflation: 0.03,
          emergencyStash: 0,
          priorityCash: 1,
          priorityPension: 2,
          priorityFunds: 3,
          priorityShares: 4,
          pensionPercentage: 0,
          pensionCapped: "No",
          statePensionWeekly: 0,
          growthRatePension: 0,
          FundsAllocation: 0,
          SharesAllocation: 0,
          economyMode: 'deterministic',
          simulation_mode: 'single'
        },
        events: [
          {
            type: 'SI',
            id: 'USSalary',
            amount: 60000,
            fromAge: 30,
            toAge: 39,
            rate: 0,
            match: 0,
            currency: 'USD'
          },
          {
            type: 'E',
            id: 'Expenses',
            amount: 35000,
            fromAge: 30,
            toAge: 39,
            rate: 0,
            match: 0,
            currency: 'USD'
          }
        ]
      },
      assertions: []
    };

    // =============================================================================
    // SCENARIO 3: IE→US RELOCATION (Deterministic)
    // =============================================================================
    const relocationScenario = {
      name: 'IERelocationScenario',
      description: 'IE→US relocation scenario with cross-border investment tracking',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 40,
          retirementAge: 65,
          relocationEnabled: true,
          StartCountry: 'ie',
          initialSavings: 0,
          initialPension: 0,
          growthDevPension: 0,
          growthDevFunds: 0,
          growthDevShares: 0,
          initialCapitalByKey: {
            indexFunds_ie: 50000,
            shares_ie: 30000
          },
          investmentAllocationsByCountry: {
            ie: {
              indexFunds_ie: 0.6,
              shares_ie: 0.4
            },
            us: {
              usIndexFunds: 0.6,
              usShares: 0.4
            }
          },
          investmentGrowthRatesByKey: {
            indexFunds_ie: 0.07,
            shares_ie: 0.06,
            usIndexFunds: 0.07,
            usShares: 0.06
          },
          investmentVolatilitiesByKey: {
            indexFunds_ie: 0,
            shares_ie: 0,
            usIndexFunds: 0,
            usShares: 0
          },
          inflation: 0.03,
          emergencyStash: 0,
          priorityCash: 1,
          priorityPension: 2,
          priorityFunds: 3,
          priorityShares: 4,
          pensionPercentage: 0,
          pensionCapped: "No",
          statePensionWeekly: 0,
          growthRatePension: 0,
          FundsAllocation: 0,
          SharesAllocation: 0,
          economyMode: 'deterministic',
          simulation_mode: 'single'
        },
        events: [
          {
            type: 'SI',
            id: 'IESalary',
            amount: 50000,
            fromAge: 30,
            toAge: 34,
            rate: 0,
            match: 0,
            currency: 'EUR'
          },
          {
            type: 'MV',
            name: 'US',
            id: 'MoveToUS',
            amount: 0,
            fromAge: 35,
            toAge: 35,
            rate: 0,
            match: 0,
            currency: 'EUR',
            linkedCountry: 'ie'
          },
          {
            type: 'SI',
            id: 'USSalary',
            amount: 60000,
            fromAge: 35,
            toAge: 39,
            rate: 0,
            match: 0,
            currency: 'USD'
          },
          {
            type: 'E',
            id: 'IEExpenses',
            amount: 30000,
            fromAge: 30,
            toAge: 34,
            rate: 0,
            match: 0,
            currency: 'EUR'
          },
          {
            type: 'E',
            id: 'USExpenses',
            amount: 35000,
            fromAge: 35,
            toAge: 39,
            rate: 0,
            match: 0,
            currency: 'USD'
          }
        ]
      },
      assertions: []
    };

    // Run all three scenarios and capture baselines
    const scenarios = [
      { name: 'IE-Only', def: ieScenario },
      { name: 'US-Only', def: usScenario },
      { name: 'IE→US Relocation', def: relocationScenario }
    ];

    const baselines = {};

    for (const scenario of scenarios) {
      const loaded = framework.loadScenario(scenario.def);
      if (!loaded) {
        errors.push(`Failed to load ${scenario.name} scenario`);
        continue;
      }

      const results = await framework.runSimulation();
      if (!results || !results.success) {
        errors.push(`${scenario.name} simulation failed to run successfully`);
        continue;
      }

      const rows = Array.isArray(results.dataSheet) ? results.dataSheet.filter(r => r && typeof r === 'object') : [];
      if (rows.length === 0) {
        errors.push(`${scenario.name} simulation produced no data rows`);
        continue;
      }

      const finalRow = rows[rows.length - 1];
      const finalValues = extractFinalValues(rows);
      if (!finalValues) {
        errors.push(`${scenario.name} failed to extract final values`);
        continue;
      }

      baselines[scenario.name] = finalValues;

      const expected = expectedBaselines[scenario.name];
      if (!expected) {
        errors.push(`${scenario.name}: Missing expected baseline`);
        continue;
      }

      for (const field in expected) {
        if (!withinTolerance(finalValues[field], expected[field], 1)) {
          errors.push(
            `${scenario.name}: ${field} expected ${expected[field].toFixed(2)}, got ${finalValues[field].toFixed(2)}`
          );
        }
      }

      // Validate assertions with ±€1 tolerance
      const targetAge = scenario.def.scenario.parameters.targetAge;
      
      if (finalRow.age !== targetAge) {
        errors.push(`${scenario.name}: Final age ${finalRow.age} does not match target age ${targetAge}`);
      }

      // Reset framework for next scenario
      framework.reset();
      framework.loadCoreModules();
    }

    // Store baseline metadata
    baselines._metadata = baselineMetadata;

    return {
      success: errors.length === 0,
      errors: errors,
      baselines: baselines
    };
  }
};
