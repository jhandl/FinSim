const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

module.exports = {
  name: 'PerCountryInputValidation',
  description: 'Relocation scenarios require per-country allocations and pensions.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    const missingInputsScenario = {
      name: 'RelocationMissingInputsScenario',
      description: 'Relocate to AR without per-country inputs',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 40,
          retirementAge: 65,
          initialSavings: 10000,
          initialPension: 0,
          emergencyStash: 0,
          inflation: 0.02,
          growthRatePension: 0.04,
          growthDevPension: 0,
          StartCountry: 'ie',
          simulation_mode: 'single',
          economy_mode: 'deterministic',
          relocationEnabled: true,
          priorityCash: 1,
          priorityPension: 4,
          priorityFunds: 2,
          priorityShares: 3,
          investmentAllocationsByCountry: {
            ie: { indexFunds_ie: 0.6, shares_ie: 0.4 }
          },
          pensionContributionsByCountry: {
            ie: { p1Pct: 0.05, p2Pct: 0, capped: 'No' }
          },
          statePensionByCountry: {
            ie: 0
          },
          investmentGrowthRatesByKey: {
            indexFunds_ie: 0,
            shares_ie: 0,
            indexFunds_ar: 0,
            shares_ar: 0
          },
          investmentVolatilitiesByKey: {
            indexFunds_ie: 0,
            shares_ie: 0,
            indexFunds_ar: 0,
            shares_ar: 0
          }
        },
        events: [
          { type: 'MV-ar', id: 'move-ar', amount: 0, fromAge: 35, toAge: 35 }
        ]
      },
      assertions: []
    };

    const frameworkMissing = new TestFramework();
    if (!frameworkMissing.loadScenario(missingInputsScenario)) {
      return { success: false, errors: ['Failed to load missing-inputs scenario'] };
    }
    installTestTaxRules(frameworkMissing, {
      ie: deepClone(IE_RULES),
      ar: deepClone(AR_RULES)
    });
    const missingResults = await frameworkMissing.runSimulation();
    if (!missingResults || missingResults.success !== false) {
      errors.push('Expected relocation scenario with missing per-country inputs to fail');
    }

    const stateOnlyScenario = {
      name: 'StateOnlyPensionScenario',
      description: 'Relocate to AR with no private pension map',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 36,
          retirementAge: 65,
          initialSavings: 20000,
          initialPension: 0,
          emergencyStash: 0,
          inflation: 0.02,
          growthRatePension: 0.04,
          growthDevPension: 0,
          StartCountry: 'ie',
          simulation_mode: 'single',
          economy_mode: 'deterministic',
          relocationEnabled: true,
          priorityCash: 1,
          priorityPension: 4,
          priorityFunds: 2,
          priorityShares: 3,
          investmentAllocationsByCountry: {
            ie: { indexFunds_ie: 0.5, shares_ie: 0.5 },
            ar: { indexFunds_ar: 0.7, shares_ar: 0.3 }
          },
          pensionContributionsByCountry: {
            ie: { p1Pct: 0.05, p2Pct: 0, capped: 'No' }
          },
          statePensionByCountry: {
            ie: 0,
            ar: 0
          },
          investmentGrowthRatesByKey: {
            indexFunds_ie: 0,
            shares_ie: 0,
            indexFunds_ar: 0,
            shares_ar: 0
          },
          investmentVolatilitiesByKey: {
            indexFunds_ie: 0,
            shares_ie: 0,
            indexFunds_ar: 0,
            shares_ar: 0
          }
        },
        events: [
          { type: 'SI', id: 'IE_Salary', amount: 60000, fromAge: 30, toAge: 32, rate: 0 },
          { type: 'E', id: 'IE_Expenses', amount: 20000, fromAge: 30, toAge: 32, rate: 0 },
          { type: 'MV-ar', id: 'Move_AR', amount: 0, fromAge: 33, toAge: 33 },
          { type: 'SI', id: 'AR_Salary', amount: 80000000, fromAge: 33, toAge: 35, rate: 0 },
          { type: 'E', id: 'AR_Expenses', amount: 20000000, fromAge: 33, toAge: 35, rate: 0 }
        ]
      },
      assertions: []
    };

    const frameworkStateOnly = new TestFramework();
    if (!frameworkStateOnly.loadScenario(stateOnlyScenario)) {
      return { success: false, errors: ['Failed to load state-only pension scenario'] };
    }
    installTestTaxRules(frameworkStateOnly, {
      ie: deepClone(IE_RULES),
      ar: deepClone(AR_RULES)
    });
    const stateOnlyResults = await frameworkStateOnly.runSimulation();
    if (!stateOnlyResults || stateOnlyResults.success !== true) {
      errors.push('Expected state-only pension country to skip per-country pension contributions');
    }

    const startCountryOnlyScenario = {
      name: 'StartCountryOnlyScenario',
      description: 'No relocations; StartCountry data only',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 35,
          retirementAge: 65,
          initialSavings: 20000,
          initialPension: 0,
          emergencyStash: 0,
          inflation: 0.02,
          growthRatePension: 0.04,
          growthDevPension: 0,
          StartCountry: 'ie',
          simulation_mode: 'single',
          economy_mode: 'deterministic',
          relocationEnabled: true,
          priorityCash: 1,
          priorityPension: 4,
          priorityFunds: 2,
          priorityShares: 3,
          investmentAllocationsByCountry: {
            ie: { indexFunds_ie: 0.5, shares_ie: 0.5 }
          },
          pensionContributionsByCountry: {
            ie: { p1Pct: 0, p2Pct: 0, capped: 'No' }
          },
          statePensionByCountry: {
            ie: 0
          },
          investmentGrowthRatesByKey: {
            indexFunds_ie: 0,
            shares_ie: 0
          },
          investmentVolatilitiesByKey: {
            indexFunds_ie: 0,
            shares_ie: 0
          }
        },
        events: [
          { type: 'SI', id: 'salary', amount: 60000, fromAge: 30, toAge: 34, rate: 0 },
          { type: 'E', id: 'expenses', amount: 20000, fromAge: 30, toAge: 34, rate: 0 }
        ]
      },
      assertions: []
    };

    const frameworkStartOnly = new TestFramework();
    if (!frameworkStartOnly.loadScenario(startCountryOnlyScenario)) {
      return { success: false, errors: ['Failed to load StartCountry-only scenario'] };
    }
    installTestTaxRules(frameworkStartOnly, {
      ie: deepClone(IE_RULES),
      ar: deepClone(AR_RULES)
    });
    const startOnlyResults = await frameworkStartOnly.runSimulation();
    if (!startOnlyResults || startOnlyResults.success !== true) {
      errors.push('Expected StartCountry-only scenario to succeed without extra per-country maps');
    }

    return { success: errors.length === 0, errors };
  }
};
