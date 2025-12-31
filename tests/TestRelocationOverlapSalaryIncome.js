const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

const TestRelocationOverlapSalaryIncome = {
  name: "Relocation Overlap - Salary Income",
  description: "Ensures overlapping salary events across a relocation boundary both appear in the data sheet (currency defaults use event start-country, not current residence).",
  isCustomTest: true,

  async runCustomTest() {
    const errors = [];
    const framework = new TestFramework();
    framework.setVerbose(false);

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    installTestTaxRules(framework, { ie: IE_RULES, ar: AR_RULES });

    const eurSalary = 1000000;
    const arsSalary = 5000;

    const scenarioDefinition = {
      name: 'Relocation overlap salary test',
      description: 'IE -> AR relocation at age 40 with overlapping salary events at age 40',
      scenario: {
        parameters: {
          startingAge: 39,
          targetAge: 41,
          emergencyStash: 0,
          initialSavings: 0,
          initialPension: 0,
          initialFunds: 0,
          initialShares: 0,
          retirementAge: 65,
          FundsAllocation: 0,
          SharesAllocation: 0,
          pensionPercentage: 0,
          pensionCapped: "No",
          growthRatePension: 0,
          growthDevPension: 0,
          growthRateFunds: 0,
          growthDevFunds: 0,
          growthRateShares: 0,
          growthDevShares: 0,
          inflation: 0,
          priorityCash: 1,
          priorityPension: 4,
          priorityFunds: 2,
          priorityShares: 3,
          personalTaxCredit: 0,
          StartCountry: 'ie'
        },
        events: [
          { type: 'MV-AR', id: 'move', amount: 0, fromAge: 40, toAge: 40, rate: 0, match: 0 },
          { type: 'SI', id: 'eurSalary', amount: eurSalary, fromAge: 39, toAge: 40, rate: 0, match: 0 },
          { type: 'SI', id: 'arsSalary', amount: arsSalary, fromAge: 40, toAge: 40, rate: 0, match: 0, currency: 'ARS' }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenarioDefinition)) {
      return { success: false, errors: ['Failed to load scenario'] };
    }

    const results = await framework.runSimulation();
    if (!results || !results.dataSheet) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const rows = Array.isArray(results.dataSheet) ? results.dataSheet.filter(r => r && typeof r === 'object') : [];
    const row40 = rows.find(r => r && typeof r === 'object' && r.age === 40);
    if (!row40) {
      return { success: false, errors: ['Age 40 row not found'] };
    }

    const convertedEurToArs = vm.runInContext(
      `convertCurrencyAmount(${eurSalary}, 'EUR', 'ie', 'ARS', 'ar', ${row40.year}, true)`,
      framework.simulationContext
    );

    if (typeof convertedEurToArs !== 'number' || !isFinite(convertedEurToArs) || convertedEurToArs <= 0) {
      errors.push(`Expected positive EUR->ARS conversion, got ${convertedEurToArs}`);
    }

    // Sanity: ensure conversion meaningfully differs from "no conversion".
    if (convertedEurToArs <= eurSalary * 10) {
      errors.push(`EUR->ARS conversion too small for a meaningful overlap test: ${convertedEurToArs}`);
    }

    const expected = convertedEurToArs + arsSalary;
    const actual = row40.incomeSalaries;

    const tolerance = Math.max(1, Math.abs(expected) * 1e-6);
    if (Math.abs(actual - expected) > tolerance) {
      errors.push(`Age 40 incomeSalaries expected ~${expected}, got ${actual} (tolerance ${tolerance})`);
    }

    return { success: errors.length === 0, errors };
  }
};

module.exports = TestRelocationOverlapSalaryIncome;

