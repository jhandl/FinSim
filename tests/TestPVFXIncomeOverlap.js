// Regression test: present-value cashflow should not embed evolved FX when a single
// simulation year includes incomes from multiple currencies (e.g. relocation overlap).
//
// Bug signature (UI): PV cashflow "Salaries" spikes massively in the relocation year.
// Root cause: Simulator tracked per-country salary/rental breakdowns already converted
// to residence currency (year-specific FX). PV mode then converted using start-year FX,
// effectively double-counting FX evolution.

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

function ensureInflationServiceLoaded(framework) {
  const ctx = framework.simulationContext;
  if (!ctx || ctx.__inflationServiceLoaded) return;
  vm.runInContext(INFLATION_SERVICE_CODE, ctx, {
    filename: 'InflationService.js',
    displayErrors: true
  });
  ctx.__inflationServiceLoaded = true;
}

function findRowByAge(rows, age) {
  return rows.find(row => row && typeof row === 'object' && Math.round(row.age) === age);
}

function createOverlapScenario() {
  return {
    name: 'PVFXIncomeOverlap',
    description: 'PV salaries remain stable when a year has EUR + ARS salary overlap',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 41,
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
        inflation: 0.03,
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
        // Runs through age 40 (inclusive in the simulator year loop), producing overlap at 40.
        { type: 'SI', id: 'Salary_IE', amount: 40000, fromAge: 30, toAge: 40, currency: 'EUR', rate: 0 },
        // Move at age 40 to AR; residence currency becomes ARS for that year.
        { type: 'MV-ar', id: 'Move_AR', amount: 0, fromAge: 40, toAge: 40 },
        // Starts at age 40 in ARS; combined with Salary_IE in the same year triggers the bug.
        { type: 'SI', id: 'Salary_AR', amount: 30000000, fromAge: 40, toAge: 41, currency: 'ARS', linkedCountry: 'ar', rate: 0 }
      ]
    },
    assertions: []
  };
}

module.exports = {
  name: 'PVFXIncomeOverlap',
  description: 'Prevents PV salaries spike in multi-currency overlap years',
  isCustomTest: true,
  runCustomTest: async function () {
    const framework = new TestFramework();
    const errors = [];

    try {
      if (!framework.loadScenario(createOverlapScenario())) {
        return { success: false, errors: ['Failed to load PVFXIncomeOverlap scenario'] };
      }

      ensureInflationServiceLoaded(framework);
      installTestTaxRules(framework, {
        ie: deepClone(IE_RULES),
        ar: deepClone(AR_RULES)
      });

      const results = await framework.runSimulation();
      if (!results || !results.success || !Array.isArray(results.dataSheet)) {
        return { success: false, errors: ['Simulation failed for PVFXIncomeOverlap'] };
      }

      const row40 = findRowByAge(results.dataSheet, 40);
      if (!row40) {
        return { success: false, errors: ['Missing age 40 row in PVFXIncomeOverlap'] };
      }

      if (!(row40.incomeSalariesPV > 0) || !(row40.incomeSalaries > 0)) {
        errors.push('Expected positive incomeSalaries and incomeSalariesPV at age 40');
      } else {
        // Emulate ChartManager PV unified conversion behavior: convert from residence country
        // (AR) to EUR (representative: IE) using simulation-start-year FX.
        const ctx = framework.simulationContext;
        const simStartYear = vm.runInContext('Config.getInstance().getSimulationStartYear()', ctx);
        const eurPV = vm.runInContext(
          'Config.getInstance().getEconomicData().convert(' +
            String(row40.incomeSalariesPV) +
            ', "AR", "IE", ' +
            String(simStartYear) +
            ', { baseYear: ' +
            String(simStartYear) +
            ' })',
          ctx
        );

        if (eurPV === null || !Number.isFinite(eurPV)) {
          errors.push('PV salary conversion to EUR failed/NaN at age 40');
        } else if (eurPV > 200000) {
          errors.push(
            'PV salary at age 40 is implausibly large in EUR (' +
              eurPV +
              '), indicating PV FX is still embedding evolved FX'
          );
        }
      }

      return { success: errors.length === 0, errors };
    } catch (e) {
      return { success: false, errors: [e.message || String(e)] };
    }
  }
};

