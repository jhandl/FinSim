const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');

function findRowByAge(rows, age) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].age === age) return rows[i];
  }
  return null;
}

function withinTolerance(actual, expected, relTol, absTol) {
  const diff = Math.abs(actual - expected);
  if (diff <= absTol) return true;
  const denom = Math.abs(expected) > 1e-9 ? Math.abs(expected) : 1;
  return (diff / denom) <= relTol;
}

module.exports = {
  name: 'TestMultiPotPensionAggregation',
  description: 'Ensures pensionFund/worth include non-start-country pension pots.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    framework.loadCoreModules();

    const scenarioDefinition = {
      name: 'MultiPotPensionAggregationScenario',
      description: 'StartCountry IE with pension contributions only into a US pension pot',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 31,
          retirementAge: 65,
          initialSavings: 0,
          initialPension: 0,
          initialFunds: 0,
          initialShares: 0,
          emergencyStash: 0,
          FundsAllocation: 0,
          SharesAllocation: 0,
          priorityCash: 1,
          priorityPension: 2,
          priorityFunds: 3,
          priorityShares: 4,
          pensionPercentage: 0.1,
          pensionCapped: 'No',
          statePensionWeekly: 0,
          growthRatePension: 0,
          growthDevPension: 0,
          growthRateFunds: 0,
          growthDevFunds: 0,
          growthRateShares: 0,
          growthDevShares: 0,
          inflation: 0,
          relocationEnabled: true,
          StartCountry: 'ie',
          economyMode: 'deterministic',
          simulation_mode: 'single'
        },
        events: [
          {
            type: 'SI',
            id: 'US_Salary',
            amount: 100000,
            fromAge: 30,
            toAge: 30,
            rate: 0,
            match: 0,
            currency: 'USD',
            linkedCountry: 'us'
          }
        ]
      },
      assertions: []
    };

    const loaded = framework.loadScenario(scenarioDefinition);
    if (!loaded) {
      return { success: false, errors: ['Failed to load scenario'] };
    }

    const results = await framework.runSimulation();
    if (!results || !results.success) {
      return { success: false, errors: ['Simulation failed to run successfully'] };
    }

    const rows = Array.isArray(results.dataSheet) ? results.dataSheet.filter(r => r && typeof r === 'object') : [];
    if (rows.length === 0) {
      return { success: false, errors: ['Simulation produced no data rows'] };
    }

    const rowAge30 = findRowByAge(rows, 30);
    if (!rowAge30) {
      return { success: false, errors: ['Required age 30 row not present in data sheet'] };
    }

    // Contribution: 10% of 100,000 USD = 10,000 USD into the US pension pot.
    const expectedPensionFund = vm.runInContext(
      `convertCurrencyAmount(10000, 'USD', 'us', 'EUR', 'ie', ${rowAge30.year}, true)`,
      framework.simulationContext
    );

    const errors = [];
    if (!(typeof expectedPensionFund === 'number' && isFinite(expectedPensionFund) && expectedPensionFund > 0)) {
      errors.push(`Expected pension conversion must be > 0, got ${expectedPensionFund}`);
    }

    if (!withinTolerance(rowAge30.pensionFund, expectedPensionFund, 1e-6, 0.5)) {
      errors.push(`Age 30 pensionFund expected ~${expectedPensionFund}, got ${rowAge30.pensionFund}`);
    }

    // Worth should include pensionFund (at minimum, worth >= pensionFund).
    if (!(rowAge30.worth >= rowAge30.pensionFund - 1e-6)) {
      errors.push(`Age 30 worth must include pensionFund (worth=${rowAge30.worth}, pensionFund=${rowAge30.pensionFund})`);
    }

    return errors.length > 0 ? { success: false, errors } : { success: true };
  }
};
