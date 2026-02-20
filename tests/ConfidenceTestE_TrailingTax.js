const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules, deepClone } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'E_TrailingTax',
  description: 'Verifies trailing tax duration after relocation.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    // AA trailing period = 3 years
    const TOY_AA_TRAILING3 = deepClone(TOY_AA);
    TOY_AA_TRAILING3.residencyRules.postEmigrationTaxYears = 3;

    const params = microParams({ 
      startingAge: 30,
      targetAge: 35, 
      relocationEnabled: true,
      StartCountry: 'aa' 
    });
    
    // Move to BB at age 31. Trailing years = 31, 32, 33.
    // At 34, trailing should end.
    // (Calculation: postEmigrationTaxYears = 3. Year of exit is Y. Active in Y, Y+1, Y+2. Exit at 31 -> 31, 32, 33)
    const events = [
      { type: 'MV', id: 'move', name: 'bb', fromAge: 31, toAge: 31, label: 'Move to BB' },
      // Income events in trailing and post-trailing years
      { type: 'SI', id: 'inc1', amount: 10000, fromAge: 31, toAge: 35, currency: 'BBB', linkedCountry: 'bb', label: 'BB Income' }
    ];

    const scenarioDef = {
      name: 'E_TrailingTax',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA_TRAILING3, bb: TOY_BB });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const checkTrailing = (age, shouldBeTrailing) => {
      const row = results.dataSheet.find(r => r && r.age === age);
      if (!row) {
        errors.push(`Row for age ${age} not found`);
        return;
      }
      
      const taxByKey = row.taxByKey || {};
      const hasAA = taxByKey['incomeTax:aa'] > 0;
      
      if (shouldBeTrailing && !hasAA) {
        errors.push(`Expected trailing AA tax at age ${age}, but none found in taxByKey: ${JSON.stringify(taxByKey)}`);
      }
      if (!shouldBeTrailing && hasAA) {
        errors.push(`Expected NO trailing AA tax at age ${age}, but found in taxByKey: ${JSON.stringify(taxByKey)}`);
      }
    };

    checkTrailing(31, true);
    checkTrailing(32, true);
    checkTrailing(33, true);
    checkTrailing(34, false);
    checkTrailing(35, false);

    return {
      success: errors.length === 0,
      errors
    };
  }
};
