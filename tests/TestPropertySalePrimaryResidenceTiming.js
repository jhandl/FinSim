const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');

function findRowByAge(rows, age) {
  return rows.find(function (row) { return row && typeof row === 'object' && row.age === age; });
}

function resolveCapitalGainsTax(row) {
  if (!row) return null;
  if (row.taxByKey && typeof row.taxByKey.capitalGains === 'number') return row.taxByKey.capitalGains;
  if (typeof row.cgt === 'number') return row.cgt;
  if (typeof row.Tax__capitalGains === 'number') return row.Tax__capitalGains;
  return null;
}

function approxEqual(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}

module.exports = {
  name: 'PropertySalePrimaryResidenceTiming',
  description: 'Ensures property sale keeps primary-residence relief when gain is declared at sale time.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const errors = [];

    const scenarioDefinition = {
      name: 'PropertySaleTiming',
      description: 'Single-country sale of fully primary residence should not create CGT.',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 37,
          retirementAge: 65,
          initialSavings: 150000,
          initialPension: 0,
          emergencyStash: 0,
          inflation: 0,
          StartCountry: 'ie',
          simulation_mode: 'single',
          economy_mode: 'deterministic'
        },
        events: [
          { type: 'R', id: 'Home', amount: 100000, fromAge: 30, toAge: 35, rate: 0.08, currency: 'EUR', linkedCountry: 'ie' }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenarioDefinition)) {
      return { success: false, errors: ['Failed to load scenario'] };
    }

    const ieRules = deepClone(IE_RULES);
    ieRules.capitalGainsTax = ieRules.capitalGainsTax || {};
    ieRules.capitalGainsTax.annualExemption = 0;
    installTestTaxRules(framework, { ie: ieRules });

    const results = await framework.runSimulation();
    if (!results || !results.success || !Array.isArray(results.dataSheet)) {
      return { success: false, errors: ['Simulation failed for primary-residence timing scenario'] };
    }

    const rows = results.dataSheet.filter(function (row) { return row && typeof row === 'object'; });
    const saleRow = findRowByAge(rows, 35);
    if (!saleRow) {
      return { success: false, errors: ['Missing sale-year row at age 35'] };
    }

    const cgt = resolveCapitalGainsTax(saleRow);
    if (cgt === null) {
      errors.push('Could not resolve capital gains tax value from sale-year row');
    } else if (!approxEqual(cgt, 0, 1e-6)) {
      errors.push('Expected zero capital gains tax for full primary-residence sale, got ' + cgt);
    }

    return { success: errors.length === 0, errors: errors };
  }
};
