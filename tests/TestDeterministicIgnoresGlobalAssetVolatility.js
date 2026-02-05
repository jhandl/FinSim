const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');

function getFinalIndexFundsCapital(results) {
  if (!results || !Array.isArray(results.dataSheet)) return null;
  const rows = results.dataSheet.filter(r => r && typeof r === 'object');
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  if (!last.investmentCapitalByKey) return null;
  const value = last.investmentCapitalByKey.indexFunds_ie;
  return (typeof value === 'number') ? value : null;
}

async function runDeterministicScenario() {
  const framework = new TestFramework();
  const loaded = framework.loadScenario({
    name: 'DeterministicGlobalVolatilityScenario',
    description: 'Deterministic scenario with non-zero GlobalAssetVolatility_globalEquity',
    scenario: {
      parameters: {
        startingAge: 30,
        targetAge: 50,
        retirementAge: 65,
        initialSavings: 0,
        initialPension: 0,
        emergencyStash: 0,
        inflation: 0,
        StartCountry: 'ie',
        simulation_mode: 'single',
        economy_mode: 'deterministic',
        economyMode: 'deterministic',
        growthRatePension: 0,
        growthDevPension: 0,
        priorityCash: 1,
        priorityPension: 4,
        priorityFunds: 2,
        priorityShares: 3,
        drawdownPrioritiesByKey: {
          cash: 1,
          pension: 4,
          indexFunds_ie: 2,
          shares_ie: 3
        },
        initialCapitalByKey: {
          indexFunds_ie: 10000,
          shares_ie: 0
        },
        investmentAllocationsByCountry: {
          ie: {
            indexFunds_ie: 1,
            shares_ie: 0
          }
        },
        investmentGrowthRatesByKey: {
          shares_ie: 0
        },
        investmentVolatilitiesByKey: {
          shares_ie: 0
        },
        GlobalAssetGrowth_globalEquity: 7,
        GlobalAssetVolatility_globalEquity: 15
      },
      events: []
    },
    assertions: []
  });

  if (!loaded) {
    return { error: 'Failed to load scenario', results: null };
  }

  installTestTaxRules(framework, { ie: deepClone(IE_RULES) });
  const results = await framework.runSimulation();
  return { error: null, results: results };
}

module.exports = {
  name: 'DeterministicIgnoresGlobalAssetVolatility',
  description: 'Ensures deterministic mode ignores GlobalAssetVolatility_* for baseRef wrappers.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    const runA = await runDeterministicScenario();
    const runB = await runDeterministicScenario();

    if (runA.error || !runA.results || !runA.results.success) {
      errors.push('Run A failed');
      return { success: false, errors: errors };
    }
    if (runB.error || !runB.results || !runB.results.success) {
      errors.push('Run B failed');
      return { success: false, errors: errors };
    }

    const finalA = getFinalIndexFundsCapital(runA.results);
    const finalB = getFinalIndexFundsCapital(runB.results);
    if (typeof finalA !== 'number') {
      errors.push('Run A missing final indexFunds_ie capital');
    }
    if (typeof finalB !== 'number') {
      errors.push('Run B missing final indexFunds_ie capital');
    }
    if (typeof finalA === 'number' && typeof finalB === 'number') {
      if (Math.abs(finalA - finalB) > 0.000001) {
        errors.push('Deterministic runs diverged with global volatility set: runA=' + finalA + ', runB=' + finalB);
      }
    }

    return { success: errors.length === 0, errors: errors };
  }
};
