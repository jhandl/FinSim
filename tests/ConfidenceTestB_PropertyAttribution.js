const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_B-PropertyAttribution',
  description: 'Verifies property sale proceeds funding a subsequent purchase.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ 
      targetAge: 35, 
      initialSavings: 100000 
    });
    const events = [
      // Purchase 1 at age 30, sold at age 32
      { type: 'R', id: 'home1', amount: 100000, fromAge: 30, toAge: 32, rate: 0 },
      // Purchase 2 at age 32 (funded by sale of home1)
      { type: 'R', id: 'home2', amount: 80000, fromAge: 32, toAge: 34, rate: 0 }
    ];
    const scenarioDef = {
      name: 'C_B-PropertyAttribution',
      description: 'Verifies property sale proceeds funding a subsequent purchase.',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const framework = new TestFramework();
    framework.loadScenario(scenarioDef);
    installTestTaxRules(framework, { aa: TOY_AA });
    const results = await framework.runSimulation();

    const errors = [];
    if (!results.success) {
      errors.push('Simulation failed');
      return { success: false, errors };
    }

    const row30 = results.dataSheet.find(r => r && r.age === 30);
    const row32 = results.dataSheet.find(r => r && r.age === 32);
    const row34 = results.dataSheet.find(r => r && r.age === 34);

    if (!row30) errors.push('No row found at age 30');
    else {
      if (!(row30.realEstateCapital > 0)) errors.push(`Age 30: Expected realEstateCapital > 0, got ${row30.realEstateCapital}`);
    }

    if (!row32) errors.push('No row found at age 32');
    else {
      // Sale of home1 (100k) should fund purchase of home2 (80k), leaving 20k cash
      if (Math.abs(row32.cash - 20000) > 1) errors.push(`Age 32: Expected cash ≈ 20000, got ${row32.cash}`);
      if (!(row32.realEstateCapital > 0)) errors.push(`Age 32: Expected realEstateCapital > 0 (home2), got ${row32.realEstateCapital}`);
    }

    if (!row34) errors.push('No row found at age 34');
    else {
      // home2 sold at age 34. 20k (from before) + 80k (sale) = 100k.
      if (Math.abs(row34.cash - 100000) > 1) errors.push(`Age 34: Expected cash ≈ 100000, got ${row34.cash}`);
      if (Math.abs(row34.realEstateCapital - 0) > 1) errors.push(`Age 34: Expected realEstateCapital ≈ 0, got ${row34.realEstateCapital}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
