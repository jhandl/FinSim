const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');

module.exports = {
  name: 'MultiCountryInvestmentCapitalKeys',
  description: 'Ensures investmentCapitalByKey includes IE and AR keys after investing.',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const errors = [];

    const scenarioDefinition = {
      name: 'MultiCountryInvestmentCapitalScenario',
      description: 'Invest in IE, relocate to AR, invest in AR assets',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 36,
          retirementAge: 65,
          initialSavings: 50000,
          initialPension: 0,
          emergencyStash: 0,
          inflation: 0,
          growthRatePension: 0,
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
            ie: { p1Pct: 0, p2Pct: 0, capped: 'No' },
            ar: { p1Pct: 0, p2Pct: 0, capped: 'No' }
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
          { type: 'SI', id: 'IE_Salary', amount: 80000, fromAge: 30, toAge: 32, rate: 0 },
          { type: 'E', id: 'IE_Expenses', amount: 20000, fromAge: 30, toAge: 32, rate: 0 },
          { type: 'MV-ar', id: 'Move_AR', amount: 0, fromAge: 33, toAge: 33 },
          { type: 'SI', id: 'AR_Salary', amount: 80000000, fromAge: 33, toAge: 35, rate: 0 },
          { type: 'E', id: 'AR_Expenses', amount: 20000000, fromAge: 33, toAge: 35, rate: 0 }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenarioDefinition)) {
      return { success: false, errors: ['Failed to load scenario'] };
    }

    installTestTaxRules(framework, {
      ie: deepClone(IE_RULES),
      ar: deepClone(AR_RULES)
    });

    const results = await framework.runSimulation();
    if (!results || !results.success) {
      return { success: false, errors: ['Simulation failed'] };
    }

    const rows = (results.dataSheet || []).filter(r => r && typeof r === 'object');
    const rowAfterMove = rows.find(r => r.age === 34);
    if (!rowAfterMove || !rowAfterMove.investmentCapitalByKey) {
      return { success: false, errors: ['Missing investmentCapitalByKey at age 34'] };
    }

    const caps = rowAfterMove.investmentCapitalByKey;
    const requiredKeys = ['indexFunds_ie', 'shares_ie', 'indexFunds_ar', 'shares_ar'];
    for (let i = 0; i < requiredKeys.length; i++) {
      const key = requiredKeys[i];
      if (typeof caps[key] !== 'number') {
        errors.push('Missing or non-numeric capital for ' + key);
      }
    }
    if (typeof caps.indexFunds_ar === 'number' && caps.indexFunds_ar <= 0) {
      errors.push('Expected indexFunds_ar to be funded after relocation');
    }
    if (typeof caps.shares_ar === 'number' && caps.shares_ar <= 0) {
      errors.push('Expected shares_ar to be funded after relocation');
    }

    return { success: errors.length === 0, errors };
  }
};
