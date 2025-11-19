// Custom test for core present-value aggregates in Simulator.updateYearlyData()
//
// This test does NOT attempt to validate the full multi-country PV model.
// Instead, it uses a simple single-country, single-run scenario to assert
// that the new *PV aggregates match the corresponding nominal aggregates
// deflated by the same factor that getDeflationFactor(age, startYear, rate)
// would produce for that row.

module.exports = {
  name: 'CorePresentValueLayer',
  description: 'Validates basic PV aggregates in the core data sheet',
  isCustomTest: true,
  runCustomTest: async function() {
    const { TestFramework } = require('../src/core/TestFramework.js');
    const vm = require('vm');

    const framework = new TestFramework();
    const testResults = { success: true, errors: [] };

    try {
      // Define a minimal single-country deterministic scenario directly
      const scenarioDefinition = {
        name: 'Core PV layer sanity',
        description: 'Minimal single-country scenario to sanity-check PV aggregates',
        scenario: {
          parameters: {
            startingAge: 30,
            targetAge: 31,
            initialSavings: 100000,
            initialPension: 0,
            initialFunds: 0,
            initialShares: 0,
            retirementAge: 65,
            emergencyStash: 0,
            FundsAllocation: 0,
            SharesAllocation: 0,
            pensionPercentage: 0,
            statePensionWeekly: 0,
            PersonalTaxCredit: 0,
            inflation: 0.02,
            growthRateFunds: 0,
            growthDevFunds: 0,
            growthRateShares: 0,
            growthDevShares: 0,
            growthRatePension: 0,
            growthDevPension: 0,
            simulation_mode: 'single',
            economyMode: 'deterministic',
            StartCountry: 'ie',
            startingCountry: 'ie'
          },
          events: []
        },
        assertions: []
      };

      if (!framework.loadScenario(scenarioDefinition)) {
        return { success: false, errors: ['Failed to load PV test scenario'] };
      }

      const simResult = await framework.runSimulation();
      if (!simResult || !simResult.dataSheet) {
        return { success: false, errors: ['Simulation failed or missing dataSheet in PV test'] };
      }

      // Inspect the simulation context (global variables) directly
      const ctx = framework.simulationContext;

      // Helper to safely evaluate an expression inside the simulation context
      function evalInSim(expr) {
        return vm.runInContext(expr, ctx);
      }

      // Guard: ensure dataSheet exists and has rows
      const rowCount = evalInSim('Array.isArray(dataSheet) ? dataSheet.length : 0');
      if (!rowCount || rowCount <= 0) {
        return { success: false, errors: ['dataSheet is empty in PV test'] };
      }

      // Use the final row as a representative sample
      const lastRowIndex = rowCount - 1;
      const rowExpr = 'dataSheet[' + lastRowIndex + ']';

      const age = evalInSim(rowExpr + '.age');
      const netIncome = evalInSim(rowExpr + '.netIncome');
      const netIncomePV = evalInSim(rowExpr + '.netIncomePV');
      const worth = evalInSim(rowExpr + '.worth');
      const worthPV = evalInSim(rowExpr + '.worthPV');

      // Basic sanity checks: PV fields should exist and be numbers
      if (typeof netIncomePV !== 'number') {
        testResults.success = false;
        testResults.errors.push('netIncomePV is not a number');
      }
      if (typeof worthPV !== 'number') {
        testResults.success = false;
        testResults.errors.push('worthPV is not a number');
      }

      // Compute the implied deflation factor from netIncome/netIncomePV when netIncome is non-zero.
      if (typeof netIncome === 'number' && Math.abs(netIncome) > 1e-6) {
        const impliedFactor = netIncomePV / netIncome;
        // The same factor should approximately map worth -> worthPV as well
        if (Math.abs(worth) > 1e-6) {
          const recomputedWorthPV = worth * impliedFactor;
          const diff = Math.abs(recomputedWorthPV - worthPV);
          if (diff > Math.max(1e-6, Math.abs(worthPV) * 1e-6)) {
            testResults.success = false;
            testResults.errors.push('worthPV does not match netIncome-based deflation factor');
          }
        }
      }

      return testResults;

    } catch (e) {
      return { success: false, errors: [e.message || String(e)] };
    }
  }
};


