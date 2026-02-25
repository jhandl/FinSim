const { TestFramework } = require('../src/core/TestFramework.js');
const { microParams, installTestTaxRules, deepClone, TOY_AA } = require('./helpers/CoreConfidenceFixtures.js');
const vm = require('vm');

module.exports = {
  name: 'Test CGT Per-Type Annual Exemption',
  description: 'Verifies that CGT annual exemptions can be applied per investment type.',
  category: 'tax',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // TOY_DD base ruleset
    const TOY_DD = deepClone(TOY_AA);
    TOY_DD.country = 'dd';
    TOY_DD.investmentTypes = [
      { 
        key: 'type_a_dd', 
        label: 'Type A', 
        baseCurrency: 'AAA', 
        assetCountry: 'dd', 
        taxation: { capitalGains: { rate: 0.20 } } 
      },
      { 
        key: 'type_b_dd', 
        label: 'Type B', 
        baseCurrency: 'AAA', 
        assetCountry: 'dd', 
        taxation: { capitalGains: { rate: 0.20 } } 
      }
    ];
    TOY_DD.capitalGainsTax = { rate: 0.20, annualExemption: 1000 };

    // Sub-scenario A — global pool (backward-compatible)
    {
      const framework = new TestFramework();
      framework.loadScenario({
        name: 'CGT-PER-TYPE-A',
        assertions: [],
        scenario: {
          parameters: microParams({
            StartCountry: 'dd',
            targetAge: 32,
            initialFunds: 5000,
            growthRateFunds: 0,
            initialShares: 5000,
            growthRateShares: 0,
            FundsAllocation: 50,
            SharesAllocation: 50,
            priorityFunds: 1,
            priorityShares: 2,
            priorityCash: 4,
            priorityPension: 4
          }),
          events: [
            { type: 'SM', id: 'growth', amount: 0, fromAge: 30, toAge: 30, rate: 0.20 },
            { type: 'E', id: 'forceSale', amount: 15000, fromAge: 31, toAge: 31, rate: 0 }
          ]
        }
      });
      
      installTestTaxRules(framework, { dd: TOY_DD });
      const results = await framework.runSimulation();
      const row31 = results.dataSheet.find(r => r && r.age === 31);
      
      if (!row31) {
        errors.push('Sub-scenario A: No row found at age 31');
      } else {
        if (Math.abs(row31.cgt - 200) > 2) {
          errors.push(`Sub-scenario A (global pool): Expected cgt ≈ 200, got ${row31.cgt}`);
        }
      }
    }

    // Sub-scenario B — per-type pools
    {
      const framework = new TestFramework();
      const customRulesB = deepClone(TOY_DD);
      customRulesB.investmentTypes[0].taxation.capitalGains.annualExemption = 1000;
      customRulesB.investmentTypes[1].taxation.capitalGains.annualExemption = 1000;
      customRulesB.capitalGainsTax.annualExemption = 0;

      framework.loadScenario({
        name: 'CGT-PER-TYPE-B',
        assertions: [],
        scenario: {
          parameters: microParams({
            StartCountry: 'dd',
            targetAge: 32,
            initialFunds: 5000,
            growthRateFunds: 0,
            initialShares: 5000,
            growthRateShares: 0,
            FundsAllocation: 50,
            SharesAllocation: 50,
            priorityFunds: 1,
            priorityShares: 2,
            priorityCash: 4,
            priorityPension: 4
          }),
          events: [
            { type: 'SM', id: 'growth', amount: 0, fromAge: 30, toAge: 30, rate: 0.20 },
            { type: 'E', id: 'forceSale', amount: 15000, fromAge: 31, toAge: 31, rate: 0 }
          ]
        }
      });
      
      installTestTaxRules(framework, { dd: customRulesB });
      const results = await framework.runSimulation();
      const row31 = results.dataSheet.find(r => r && r.age === 31);
      
      if (!row31) {
        errors.push('Sub-scenario B: No row found at age 31');
      } else {
        if (Math.abs(row31.cgt - 0) > 2) {
          errors.push(`Sub-scenario B (per-type pool): Expected cgt ≈ 0, got ${row31.cgt}`);
        }
      }
    }

    // Sub-scenario C — verify clone() preservation via VM context
    {
      const framework = new TestFramework();
      framework.loadCoreModules();
      framework.ensureVMUIManagerMocks();
      await vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);
      
      const customRulesC = deepClone(TOY_DD);
      customRulesC.capitalGainsTax.annualExemption = 0;
      customRulesC.investmentTypes[0].taxation.capitalGains.annualExemption = 1000;
      
      installTestTaxRules(framework, { dd: customRulesC });

      const result = vm.runInContext(`
        (function() {
          var taxman = new Taxman();
          var p1 = new Person(1, 30);
          var attrMgr = new AttributionManager();
          params = { marriageYear: null }; // Initialize global params
          taxman.reset(p1, null, attrMgr, 'dd', 2025);
          
          taxman.declareInvestmentGains(
            Money.create(1000, 'AAA', 'dd'), 
            0.20, 
            'Test Gain', 
            { 
              category: 'cgt', 
              eligibleForAnnualExemption: true, 
              exemptionKey: 'type_a_dd', 
              annualExemptionAmount: 1000 
            },
            'dd'
          );

          var cloned = taxman.clone();
          cloned.ruleset = taxman.ruleset; 
          cloned.computeCGT();
          
          return cloned.getTaxByType('capitalGains');
        })()
      `, framework.simulationContext);

      if (result !== 0) {
        errors.push(`Sub-scenario C (clone preservation): Expected cloned tax 0 (fully exempted), got ${result}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
