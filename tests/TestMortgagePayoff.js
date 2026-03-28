// @finsim-test-speed: fast
const { TestFramework } = require('../src/core/TestFramework.js');
const { microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
const { getDisplayAmountByLabel } = require('./helpers/DisplayAttributionTestHelpers.js');

module.exports = {
  name: 'TestMortgagePayoffGeneric',
  description: 'Verifies that shortening toAge triggers a payoff and mortgageTerm preserves principal.',
  category: 'repro',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    
    // Scenario 1: A 20-year mortgage from age 30 to 50.
    const events20 = [
      { type: 'SI', id: 'salary', amount: 50000, fromAge: 30, toAge: 60, currency: 'EUR', linkedCountry: 'ie' },
      { type: 'R', id: 'home', amount: 100000, fromAge: 30, toAge: 60, rate: 0, linkedCountry: 'ie' },
      { type: 'M', id: 'home', amount: 10000, fromAge: 30, toAge: 50, rate: 0.05, linkedCountry: 'ie' }
    ];
    
    // Scenario 2: The same mortgage, but shortened to age 40 (intended payoff).
    // We use mortgageTerm: 20 to ensure it's still calculated as a 20-year loan.
    const eventsShort = [
      { type: 'SI', id: 'salary', amount: 50000, fromAge: 30, toAge: 60, currency: 'EUR', linkedCountry: 'ie' },
      { type: 'R', id: 'home', amount: 100000, fromAge: 30, toAge: 60, rate: 0, linkedCountry: 'ie' },
      { type: 'M', id: 'home', amount: 10000, fromAge: 30, toAge: 40, rate: 0.05, linkedCountry: 'ie', mortgageTerm: 20 }
    ];

    const params = microParams({ startingAge: 30, targetAge: 60, StartCountry: 'ie' });
    
    // Run Scenario 1 (Full term)
    framework.loadScenario({ name: 'FullTerm', scenario: { parameters: params, events: events20 }, assertions: [] });
    installTestTaxRules(framework);
    const results20 = await framework.runSimulation();
    
    // Run Scenario 2 (Shortened term + mortgageTerm)
    framework.loadScenario({ name: 'Shortened', scenario: { parameters: params, events: eventsShort }, assertions: [] });
    installTestTaxRules(framework);
    const resultsShort = await framework.runSimulation();

    const errors = [];
    
    if (!results20 || !results20.dataSheet || !resultsShort || !resultsShort.dataSheet) {
      return { success: false, errors: ['Simulation failed to produce dataSheet'] };
    }

    const row30_20 = results20.dataSheet.find(r => r && r.age === 30);
    const row30_Short = resultsShort.dataSheet.find(r => r && r.age === 30);
    
    // Equity (realEstateCapital) at age 30 should be identical if the principal is identical.
    if (Math.abs(row30_20.realEstateCapital - row30_Short.realEstateCapital) > 1) {
      errors.push(`Principal mismatch: Equity at age 30 differs. Full term ${row30_20.realEstateCapital} vs Shortened term ${row30_Short.realEstateCapital}.`);
    }

    // Check for a payoff entry at age 40 in the shortened scenario
    const row40_Short = resultsShort.dataSheet.find(r => r && r.age === 40);
    const payoffExpense = getDisplayAmountByLabel(row40_Short, 'Expenses', 'Mortgage Payoff (home)');

    if (!payoffExpense || payoffExpense <= 0) {
      errors.push(`No mortgage payoff recorded at age 40 in shortened scenario.`);
    }

    // Verify Scenario 1 has NO payoff at age 40
    const row40_20 = results20.dataSheet.find(r => r && r.age === 40);
    const payoff20 = getDisplayAmountByLabel(row40_20, 'Expenses', 'Mortgage Payoff (home)');
    if (payoff20) {
      errors.push(`Unexpected payoff recorded at age 40 in full term scenario.`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
