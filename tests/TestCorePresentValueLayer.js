// Custom test for core present-value aggregates in Simulator.updateYearlyData()
//
// This test does NOT attempt to validate the full multi-country PV model.
// Instead, it uses a simple single-country, single-run scenario to assert
// that cashInflows/cashInflowsPV match the legacy UI inflows formula while
// being provided by core dataSheet fields.

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
            priorityCash: 1,
            priorityPension: 2,
            priorityFunds: 3,
            priorityShares: 4,
            simulation_mode: 'single',
            economyMode: 'deterministic',
            StartCountry: 'ie',
            startingCountry: 'ie'
          },
          events: [
            // Force a cash withdrawal from savings so incomeCash/cashInflows are populated.
            { type: 'E', id: 'expense', amount: 5000, fromAge: 30, toAge: 30, rate: 0, match: 0 }
          ]
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

      const withdrawalRowIndex = evalInSim('Array.isArray(dataSheet) ? dataSheet.findIndex(function(r) { return r && r.incomeCash > 0; }) : -1');
      if (withdrawalRowIndex < 0) {
        return { success: false, errors: ['Expected a row with positive incomeCash but found none'] };
      }
      const rowExpr = 'dataSheet[' + withdrawalRowIndex + ']';

      const netIncome = evalInSim(rowExpr + '.netIncome');
      const incomeCash = evalInSim(rowExpr + '.incomeCash');
      const cashInflows = evalInSim(rowExpr + '.cashInflows');
      const netIncomePV = evalInSim(rowExpr + '.netIncomePV');
      const incomeCashPV = evalInSim(rowExpr + '.incomeCashPV');
      const cashInflowsPV = evalInSim(rowExpr + '.cashInflowsPV');
      const worth = evalInSim(rowExpr + '.worth');
      const worthPV = evalInSim(rowExpr + '.worthPV');

      // Basic sanity checks: PV fields should exist and be numbers
      if (typeof netIncomePV !== 'number') {
        testResults.success = false;
        testResults.errors.push('netIncomePV is not a number');
      }
      if (typeof cashInflowsPV !== 'number') {
        testResults.success = false;
        testResults.errors.push('cashInflowsPV is not a number');
      }
      if (typeof worthPV !== 'number') {
        testResults.success = false;
        testResults.errors.push('worthPV is not a number');
      }

      const rowObj = evalInSim(rowExpr);
      const nominalInvestmentIncome = (rowObj && rowObj.investmentIncomeByKey)
        ? Object.keys(rowObj.investmentIncomeByKey).reduce((sum, key) => sum + (rowObj.investmentIncomeByKey[key] || 0), 0)
        : 0;
      const nominalTaxTotal = rowObj
        ? Object.keys(rowObj).filter(key => key.indexOf('Tax__') === 0 && key.slice(-2) !== 'PV').reduce((sum, key) => {
          const value = rowObj[key];
          return sum + (typeof value === 'number' ? value : 0);
        }, 0)
        : 0;
      const expectedCashInflowsNominal =
        (rowObj.incomeSalaries || 0) +
        (rowObj.incomeRSUs || 0) +
        (rowObj.incomeRentals || 0) +
        (rowObj.incomePrivatePension || 0) +
        (rowObj.incomeStatePension || 0) +
        (rowObj.incomeDefinedBenefit || 0) +
        (rowObj.incomeTaxFree || 0) +
        (rowObj.incomeCash || 0) +
        nominalInvestmentIncome -
        nominalTaxTotal -
        (rowObj.pensionContribution || 0);
      if (typeof cashInflows === 'number') {
        const nominalDiff = Math.abs(cashInflows - expectedCashInflowsNominal);
        if (nominalDiff > 1e-6) {
          testResults.success = false;
          testResults.errors.push('cashInflows does not match legacy UI inflows formula');
        }
      }
      const pvInvestmentIncome = (rowObj && rowObj.investmentIncomeByKeyPV)
        ? Object.keys(rowObj.investmentIncomeByKeyPV).reduce((sum, key) => sum + (rowObj.investmentIncomeByKeyPV[key] || 0), 0)
        : 0;
      const pvTaxTotal = rowObj
        ? Object.keys(rowObj).filter(key => key.indexOf('Tax__') === 0 && key.slice(-2) === 'PV').reduce((sum, key) => {
          const value = rowObj[key];
          return sum + (typeof value === 'number' ? value : 0);
        }, 0)
        : 0;
      const expectedCashInflowsPV =
        (rowObj.incomeSalariesPV || 0) +
        (rowObj.incomeRSUsPV || 0) +
        (rowObj.incomeRentalsPV || 0) +
        (rowObj.incomePrivatePensionPV || 0) +
        (rowObj.incomeStatePensionPV || 0) +
        (rowObj.incomeDefinedBenefitPV || 0) +
        (rowObj.incomeTaxFreePV || 0) +
        (rowObj.incomeCashPV || 0) +
        pvInvestmentIncome -
        pvTaxTotal -
        (rowObj.pensionContributionPV || 0);
      if (typeof cashInflowsPV === 'number') {
        const pvDiff = Math.abs(cashInflowsPV - expectedCashInflowsPV);
        if (pvDiff > 1e-6) {
          testResults.success = false;
          testResults.errors.push('cashInflowsPV does not match legacy UI inflows PV formula');
        }
      }

      if (typeof cashInflows === 'number' && Math.abs(cashInflows) > 1e-6) {
        const impliedFactor = cashInflowsPV / cashInflows;
        if (Math.abs(worth) > 1e-6) {
          const recomputedWorthPV = worth * impliedFactor;
          const diff = Math.abs(recomputedWorthPV - worthPV);
          if (diff > Math.max(1e-6, Math.abs(worthPV) * 1e-6)) {
            testResults.success = false;
            testResults.errors.push('worthPV does not match cashInflows-based deflation factor');
          }
        }
      }

      return testResults;

    } catch (e) {
      return { success: false, errors: [e.message || String(e)] };
    }
  }
};
