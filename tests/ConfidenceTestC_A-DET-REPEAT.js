const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');

module.exports = {
  name: 'C_A-DET-REPEAT',
  description: 'Verifies that identical simulation runs produce identical results (deterministic repeatability).',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const params = microParams({ targetAge: 32 });
    const events = [
      { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 31, currency: 'AAA', rate: 0, match: 0 },
      { type: 'E', id: 'expense', amount: 2000, fromAge: 30, toAge: 31, currency: 'AAA' }
    ];
    const scenarioDef = {
      name: 'C_A-DET-REPEAT',
      description: 'Verifies that identical simulation runs produce identical results (deterministic repeatability).',
      scenario: {
        parameters: params,
        events: events
      },
      assertions: []
    };

    const errors = [];

    // Run 1
    const framework1 = new TestFramework();
    framework1.loadScenario(scenarioDef);
    installTestTaxRules(framework1, { aa: TOY_AA });
    const results1 = await framework1.runSimulation();

    // Run 2
    const framework2 = new TestFramework();
    framework2.loadScenario(scenarioDef);
    installTestTaxRules(framework2, { aa: TOY_AA });
    const results2 = await framework2.runSimulation();

    if (!results1.success) errors.push('Run 1 failed');
    if (!results2.success) errors.push('Run 2 failed');

    if (results1.dataSheet.length !== results2.dataSheet.length) {
      errors.push(`Row count mismatch: Run 1 has ${results1.dataSheet.length}, Run 2 has ${results2.dataSheet.length}`);
    } else {
      for (let i = 0; i < results1.dataSheet.length; i++) {
        const row1 = results1.dataSheet[i];
        const row2 = results2.dataSheet[i];
        
        if (!row1 && !row2) continue;
        if (!row1 || !row2) {
          errors.push(`Row ${i} presence mismatch: Run 1 is ${!!row1}, Run 2 is ${!!row2}`);
          continue;
        }

        const keys = Object.keys(row1);
        
        for (const key of keys) {
          const v1 = row1[key];
          const v2 = row2[key];
          
          if (typeof v1 === 'number' && typeof v2 === 'number') {
            if (Math.abs(v1 - v2) > 0) {
              errors.push(`Value divergence at row ${i}, field "${key}": ${v1} vs ${v2}`);
            }
          } else if (typeof v1 === 'object' || typeof v2 === 'object') {
            if (JSON.stringify(v1) !== JSON.stringify(v2)) {
              errors.push(`Object divergence at row ${i}, field "${key}"`);
            }
          } else if (v1 !== v2) {
            errors.push(`Value divergence at row ${i}, field "${key}": ${v1} vs ${v2}`);
          }
        }
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
