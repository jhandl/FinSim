const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_BB, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_F-ALLOC-SCOPING',
  description: 'Verifies investment allocation scoping across relocation with toy rules.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({
      targetAge: 33,
      StartCountry: 'aa',
      relocationEnabled: true,
      initialSavings: 0,
      initialCapitalByKey: { shares_aa: 1000 },
      investmentAllocationsByCountry: { aa: { funds_aa: 0, shares_aa: 1 }, bb: { funds_bb: 0, shares_bb: 1 } },
      investmentGrowthRatesByKey: { shares_aa: 0, shares_bb: 0 },
      investmentVolatilitiesByKey: { shares_aa: 0, shares_bb: 0 }
    });

    const events = [
      { type: 'SI', id: 'salary_aa', amount: 10000, fromAge: 30, toAge: 30, rate: 0, currency: 'AAA' },
      { type: 'MV', id: 'move_bb', name: 'bb', fromAge: 31, toAge: 31 },
      { type: 'SI', id: 'salary_bb', amount: 10000, fromAge: 32, toAge: 32, rate: 0, currency: 'BBB', linkedCountry: 'bb' }
    ];

    const scenarioDef = {
      name: 'C_F-ALLOC-SCOPING',
      description: 'Verifies investment allocation scoping across relocation with toy rules.',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA, bb: TOY_BB });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const assets = framework.simulationContext.investmentAssets || [];
    const hasSharesAA = assets.some(entry => entry && entry.key === 'shares_aa');
    const hasSharesBB = assets.some(entry => entry && entry.key === 'shares_bb');
    if (!hasSharesAA) errors.push('Missing shares_aa investment asset');
    if (!hasSharesBB) errors.push('Missing shares_bb investment asset');

    const row30 = results.dataSheet.find(r => r && r.age === 30);
    const row32 = results.dataSheet.find(r => r && r.age === 32);
    if (!row30 || !row32) {
      errors.push('Missing age 30 or age 32 rows');
    } else {
      const capAA = row30.investmentCapitalByKey ? row30.investmentCapitalByKey.shares_aa : 0;
      const capBB = row32.investmentCapitalByKey ? row32.investmentCapitalByKey.shares_bb : 0;
      // What is tested:
      // Allocation map should route AA net savings to shares_aa and BB net savings to shares_bb.
      //
      // Hand math:
      // Age 30 AA salary 10,000 AAA:
      //   AA IT = 1,000, AA SC = 500 => net = 8,500
      //   With initial shares_aa 1,000 and 100% AA allocation to shares_aa:
      //   shares_aa at age 30 = 1,000 + 8,500 = 9,500
      //
      // Age 32 BB salary 10,000 BBB:
      //   BB IT = 1,500, BB SC = 300 => net = 8,200
      //   100% BB allocation to shares_bb => shares_bb at age 32 = 8,200
      if (Math.abs(capAA - 9500) > 1) errors.push(`Expected shares_aa at age 30 ≈ 9500, got ${capAA}`);
      if (Math.abs(capBB - 8200) > 1) errors.push(`Expected shares_bb at age 32 ≈ 8200, got ${capBB}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
