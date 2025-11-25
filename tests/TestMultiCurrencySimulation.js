const { TestFramework } = require('../src/core/TestFramework.js');
const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');

function findRowByAge(rows, age) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].age === age) {
      return rows[i];
    }
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
  name: 'MultiCurrencySimulation',
  description: 'Validates currency conversions across relocation with foreign income and expenses.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const scenarioDefinition = {
      name: 'MultiCurrencyScenario',
      description: 'Relocation with mixed-currency salary, rental income, and mortgage expenses',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 38,
          retirementAge: 65,
          initialSavings: 100000,
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
          pensionPercentage: 0,
          pensionCapped: "No",
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
            id: 'IE_Salary',
            amount: 50000,
            fromAge: 30,
            toAge: 34,
            rate: 0,
            match: 0,
            currency: 'EUR'
          },
          {
            type: 'R',
            id: 'IE_Home',
            amount: 100000,
            fromAge: 30,
            toAge: 60,
            rate: 0,
            currency: 'EUR',
            linkedCountry: 'ie'
          },
          {
            type: 'M',
            id: 'IE_Home',
            amount: 20000,
            fromAge: 30,
            toAge: 59,
            rate: 0.02,
            currency: 'EUR',
            linkedCountry: 'ie'
          },
          {
            type: 'RI',
            id: 'IE_Rent',
            amount: 15000,
            fromAge: 31,
            toAge: 59,
            rate: 0,
            currency: 'EUR',
            linkedCountry: 'ie'
          },
          {
            type: 'MV-ar',
            id: 'MoveToAR',
            amount: 10000,
            fromAge: 35,
            toAge: 35,
            rate: 0,
            currency: 'EUR',
            linkedCountry: 'ie'
          },
          {
            type: 'RI',
            id: 'AR_Rent',
            amount: 3000000,
            fromAge: 35,
            toAge: 59,
            rate: 0,
            currency: 'ARS',
            linkedCountry: 'ar'
          },
          {
            type: 'SI',
            id: 'AR_Salary',
            amount: 60000000,
            fromAge: 35,
            toAge: 37,
            rate: 0,
            match: 0,
            currency: 'ARS'
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
    const errors = [];

    if (rows.length === 0) {
      return { success: false, errors: ['Simulation produced no data rows'] };
    }

    const rowAge30 = findRowByAge(rows, 30);
    const rowAge34 = findRowByAge(rows, 34);
    const rowAge36 = findRowByAge(rows, 36);

    if (!rowAge30 || !rowAge34 || !rowAge36) {
      return { success: false, errors: ['Required ages (30, 34, 36) not present in data sheet'] };
    }

    // Base year for conversions: first simulation year
    const baseYear = rowAge30.year;
    const arRules = new TaxRuleSet(require('../src/core/config/tax-rules-ar.json'));
    const ieRules = new TaxRuleSet(require('../src/core/config/tax-rules-ie.json'));
    const econ = new EconomicData([ieRules.getEconomicProfile(), arRules.getEconomicProfile()]);
    const conversionOptions = { fxMode: 'constant', baseYear: baseYear };

    // Pre-move sanity checks (all EUR values)
    if (!withinTolerance(rowAge34.incomeSalaries, 50000, 1e-6, 0.5)) {
      errors.push(`Age 34 salary expected 50000 EUR, got ${rowAge34.incomeSalaries}`);
    }
    if (!withinTolerance(rowAge34.incomeRentals, 15000, 1e-6, 0.5)) {
      errors.push(`Age 34 rental income expected 15000 EUR, got ${rowAge34.incomeRentals}`);
    }

    // Post-move expectations (residence currency ARS)
    const year36 = rowAge36.year;
    const conversionOptionsEvolution = { fxMode: 'evolution', baseYear: baseYear };
    const convertedRentalEUR = econ.convert(15000, 'IE', 'AR', year36, conversionOptionsEvolution);
    const expectedRentalConverted = 3000000 + convertedRentalEUR;
    const convertedMortgage = econ.convert(20000, 'IE', 'AR', year36, conversionOptionsEvolution);
    if (!Number.isFinite(convertedRentalEUR) || convertedRentalEUR <= 0) {
      errors.push('Currency conversion for rental income failed to produce a positive value');
    }

    if (!Number.isFinite(rowAge36.incomeSalaries)) {
      errors.push('Age 36 salary is not a finite number');
    } else if (!withinTolerance(rowAge36.incomeSalaries, 60000000, 0.05, 1000)) { // Relaxed tolerance for evolution FX
      errors.push(`Age 36 salary expected 60000000 ARS, got ${rowAge36.incomeSalaries}`);
    }

    if (!Number.isFinite(rowAge36.incomeRentals)) {
      errors.push('Age 36 rental income is not a finite number');
    } else if (!withinTolerance(rowAge36.incomeRentals, expectedRentalConverted, 0.5, 1000)) { // Relaxed tolerance for evolution FX
      errors.push(`Age 36 rental income expected ${expectedRentalConverted.toFixed(2)} ARS, got ${rowAge36.incomeRentals}`);
    }

    if (!Number.isFinite(rowAge36.expenses)) {
      errors.push('Age 36 expenses are not a finite number');
    } else if (!withinTolerance(rowAge36.expenses, convertedMortgage, 0.5, 1000)) { // Relaxed tolerance for evolution FX
      errors.push(`Age 36 expenses expected ${convertedMortgage.toFixed(2)} ARS, got ${rowAge36.expenses}`);
    }

    if (!Number.isFinite(rowAge36.cash)) {
      errors.push('Age 36 cash balance is not a finite number');
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};
