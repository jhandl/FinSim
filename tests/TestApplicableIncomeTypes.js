const { TestFramework } = require('../src/core/TestFramework.js');
const { TOY_AA, TOY_CC, microParams, installTestTaxRules } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'APPLICABLE-INCOME-TYPES',
  description: 'Verifies applicableIncomeTypes filtering for Social Contributions, Additional Taxes, and Income Tax.',
  category: 'unit',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // --- Test Case A: Default behavior (no filtering) ---
    const frameworkA = new TestFramework();
    frameworkA.loadScenario({
      name: 'DEFAULT-SC',
      description: 'Default SC behavior',
      scenario: {
        parameters: microParams({ targetAge: 31 }),
        events: [
          { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, rate: 0 },
          { type: 'RI', id: 'rental', amount: 5000, fromAge: 30, toAge: 30 }
        ]
      },
      assertions: []
    });
    installTestTaxRules(frameworkA, { aa: TOY_AA });
    const resultsA = await frameworkA.runSimulation();
    const rowA = resultsA.dataSheet.find(r => r && r.age === 30);
    if (!rowA || Math.abs(rowA['Tax__sc'] - 750) > 1) {
      errors.push(`Default SC failed: Expected Tax__sc ≈ 750 at age 30, got ${rowA ? rowA['Tax__sc'] : 'null'}`);
    }

    // --- Test Case B: Social contribution filtered to ['employment'] ---
    const TOY_SC_FILTER = JSON.parse(JSON.stringify(TOY_AA));
    TOY_SC_FILTER.socialContributions[0].applicableIncomeTypes = ['employment'];

    const frameworkSC = new TestFramework();
    frameworkSC.loadScenario({
      name: 'SC-FILTER',
      description: 'SC Filter',
      scenario: {
        parameters: microParams({ targetAge: 31 }),
        events: [
          { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, rate: 0 },
          { type: 'RI', id: 'rental', amount: 5000, fromAge: 30, toAge: 30 }
        ]
      },
      assertions: []
    });
    installTestTaxRules(frameworkSC, { aa: TOY_SC_FILTER });
    const resultsSC = await frameworkSC.runSimulation();
    const rowSC = resultsSC.dataSheet.find(r => r && r.age === 30);
    if (!rowSC || Math.abs(rowSC['Tax__sc'] - 500) > 1) {
      errors.push(`SC Filter failed: Expected Tax__sc ≈ 500 at age 30, got ${rowSC ? rowSC['Tax__sc'] : 'null'}`);
    }

    // --- Test Case C: Additional tax filtered to ['employment'] ---
    const TOY_AT_FILTER = JSON.parse(JSON.stringify(TOY_AA));
    TOY_AT_FILTER.additionalTaxes = [
      { name: 'extra', brackets: { '0': 0.05 }, applicableIncomeTypes: ['employment'] }
    ];
    TOY_AT_FILTER.pensionRules = {
      pensionSystem: { type: 'mixed' },
      contributionLimits: { ageBandsPercent: { '0': 1.0 }, annualCap: 1000000000 },
      lumpSumTaxBands: { '0': 0 },
      definedBenefit: { enabled: true, treatment: 'incomeTax' }
    };

    const frameworkAT = new TestFramework();
    frameworkAT.loadScenario({
      name: 'AT-FILTER',
      description: 'AT Filter',
      scenario: {
        parameters: microParams({ targetAge: 31 }),
        events: [
          { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, rate: 0 },
          { type: 'DBI', id: 'pension', amount: 5000, fromAge: 30, toAge: 30 }
        ]
      },
      assertions: []
    });
    installTestTaxRules(frameworkAT, { aa: TOY_AT_FILTER });
    const resultsAT = await frameworkAT.runSimulation();
    const rowAT = resultsAT.dataSheet.find(r => r && r.age === 30);
    if (!rowAT || Math.abs(rowAT['Tax__extra'] - 500) > 1) {
      errors.push(`AT Filter failed: Expected Tax__extra ≈ 500 at age 30, got ${rowAT ? rowAT['Tax__extra'] : 'null'}`);
    }

    // --- Test Case D: Income tax filtered to ['employment'] ---
    const TOY_IT_FILTER = JSON.parse(JSON.stringify(TOY_AA));
    TOY_IT_FILTER.incomeTax.applicableIncomeTypes = ['employment'];

    const frameworkIT = new TestFramework();
    frameworkIT.loadScenario({
      name: 'IT-FILTER',
      description: 'IT Filter',
      scenario: {
        parameters: microParams({ targetAge: 31 }),
        events: [
          { type: 'SI', id: 'salary', amount: 10000, fromAge: 30, toAge: 30, rate: 0 },
          { type: 'RI', id: 'rental', amount: 5000, fromAge: 30, toAge: 30 }
        ]
      },
      assertions: []
    });
    installTestTaxRules(frameworkIT, { aa: TOY_IT_FILTER });
    const resultsIT = await frameworkIT.runSimulation();
    const rowIT = resultsIT.dataSheet.find(r => r && r.age === 30);
    if (!rowIT || rowIT['Tax__incomeTax'] === undefined || Math.abs(rowIT['Tax__incomeTax'] - 1000) > 1) {
      errors.push(`IT Filter failed: Expected Tax__incomeTax ≈ 1000 at age 30, got ${rowIT ? rowIT['Tax__incomeTax'] : 'null'}`);
    }

    // --- Test Case E: Investment Income filtering in SC ---
    const TOY_SC_INV = JSON.parse(JSON.stringify(TOY_AA));
    TOY_SC_INV.socialContributions[0].applicableIncomeTypes = ['employment', 'investmentIncome'];

    const frameworkE = new TestFramework();
    frameworkE.loadScenario({
      name: 'SC-INV-FILTER',
      description: 'SC Investment Income Filter',
      scenario: {
        parameters: microParams({ targetAge: 31 }),
        events: []
      },
      assertions: []
    });
    installTestTaxRules(frameworkE, { aa: TOY_SC_INV });
    await frameworkE.runSimulation();
    const scInvResult = vm.runInContext(`
      (function() {
        var tm = revenue;
        var country = tm.ruleset.getCountryCode().toLowerCase(); 
        tm.salariesP1 = [{ amount: 10000, description: 'Salary', contribRate: 0 }];
        tm.investmentIncome = 2000;
        attributionManager.record('income', 'Salary', 10000);
        tm.declareInvestmentIncome(Money.from(2000, tm.residenceCurrency, country), 'Dividend', country);
        tm.taxTotals['sc'] = 0;
        tm.computeSocialContributionsGeneric();
        return tm.taxTotals['sc'];
      })()
    `, frameworkE.simulationContext);

    if (Math.abs(scInvResult - 600) > 1) {
      errors.push(`SC Investment Filter failed: Expected Tax__sc ≈ 600, got ${scInvResult}`);
    }

    // --- Test Case F: Domestic IT filtering with 'otherIncome' ---
    const TOY_CC_FILTER = JSON.parse(JSON.stringify(TOY_CC));
    TOY_CC_FILTER.incomeTax.applicableIncomeTypes = ['otherIncome'];

    const frameworkF = new TestFramework();
    frameworkF.loadScenario({
      name: 'DOMESTIC-OTHER-FILTER',
      description: 'Domestic IT Other Income Filter',
      scenario: {
        parameters: microParams({ StartCountry: 'cc', targetAge: 31 }),
        events: []
      },
      assertions: []
    });
    installTestTaxRules(frameworkF, { cc: TOY_CC_FILTER });
    await frameworkF.runSimulation();
    const rowFResult = vm.runInContext(`
      (function() {
        var tm = revenue;
        var country = 'cc';
        tm.taxTotals['incomeTax'] = 0;
        tm.declareOtherIncome(Money.from(5000, tm.residenceCurrency, country), 'Other');
        tm.computeTaxes();
        return tm.taxTotals['incomeTax'] || 0;
      })()
    `, frameworkF.simulationContext);

    if (Math.abs(rowFResult - 1000) > 1) {
      errors.push(`Domestic Other Filter failed: Expected Tax__incomeTax ≈ 1000, got ${rowFResult}`);
    }

    // --- Test Case G: Domestic basis + investment income -> no IT ---
    const TOY_G = JSON.parse(JSON.stringify(TOY_CC));
    const frameworkG = new TestFramework();
    frameworkG.loadScenario({
      name: 'DOMESTIC-INV-NO-IT',
      description: 'Domestic basis should not include investment income in IT',
      scenario: {
        parameters: microParams({ StartCountry: 'cc', targetAge: 31 }),
        events: []
      },
      assertions: []
    });
    installTestTaxRules(frameworkG, { cc: TOY_G });
    await frameworkG.runSimulation();
    const domesticInvResult = vm.runInContext(`
      (function() {
        var tm = revenue;
        var country = 'cc';
        tm.taxTotals['incomeTax'] = 0;
        tm.declareInvestmentIncome(Money.from(5000, tm.residenceCurrency, country), 'Fund Sale', country);
        tm.computeTaxes();
        return tm.taxTotals['incomeTax'] || 0;
      })()
    `, frameworkG.simulationContext);

    if (domesticInvResult !== 0) {
      errors.push(`Domestic Investment IT failed: Expected 0 IT for investment income in domestic mode, got ${domesticInvResult}`);
    }

    // --- Test Case H: DBI token 'definedBenefit' filtering ---
    const TOY_H_IN = JSON.parse(JSON.stringify(TOY_AA));
    TOY_H_IN.incomeTax.applicableIncomeTypes = ['definedBenefit'];
    const frameworkH_IN = new TestFramework();
    frameworkH_IN.loadScenario({
      name: 'DBI-FILTER-IN',
      description: 'DBI included when definedBenefit is in filter',
      scenario: {
        parameters: microParams({ targetAge: 31 }),
        events: [
          { type: 'DBI', id: 'pension', amount: 5000, fromAge: 30, toAge: 30 }
        ]
      },
      assertions: []
    });
    installTestTaxRules(frameworkH_IN, { aa: TOY_H_IN });
    const resultsH_IN = await frameworkH_IN.runSimulation();
    const rowH_IN = resultsH_IN.dataSheet.find(r => r && r.age === 30);
    if (!rowH_IN || rowH_IN['Tax__incomeTax'] === undefined || Math.abs(rowH_IN['Tax__incomeTax'] - 500) > 1) {
      errors.push(`DBI Filter IN failed: Expected Tax__incomeTax ≈ 500, got ${rowH_IN ? rowH_IN['Tax__incomeTax'] : 'null'}`);
    }

    const TOY_H_OUT = JSON.parse(JSON.stringify(TOY_AA));
    TOY_H_OUT.incomeTax.applicableIncomeTypes = ['employment'];
    const frameworkH_OUT = new TestFramework();
    frameworkH_OUT.loadScenario({
      name: 'DBI-FILTER-OUT',
      description: 'DBI excluded when definedBenefit is NOT in filter',
      scenario: {
        parameters: microParams({ targetAge: 31 }),
        events: [
          { type: 'DBI', id: 'pension', amount: 5000, fromAge: 30, toAge: 30 }
        ]
      },
      assertions: []
    });
    installTestTaxRules(frameworkH_OUT, { aa: TOY_H_OUT });
    const resultsH_OUT = await frameworkH_OUT.runSimulation();
    const rowH_OUT = resultsH_OUT.dataSheet.find(r => r && r.age === 30);
    if (!rowH_OUT || (rowH_OUT['Tax__incomeTax'] || 0) > 1) {
      errors.push(`DBI Filter OUT failed: Expected Tax__incomeTax ≈ 0, got ${rowH_OUT ? rowH_OUT['Tax__incomeTax'] : 'null'}`);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
