const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');

module.exports = {
  name: 'GlobalAssetWithholding',
  description: 'Validates global asset withholding tax deduction',
  isCustomTest: true,
  runCustomTest: async function () {
    const framework = new TestFramework();
    const errors = [];

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    const ctx = framework.simulationContext;
    framework.ensureVMUIManagerMocks(null, null);
    await vm.runInContext('Config.initialize(WebUI.getInstance())', ctx);

    // Test 1: US dividend withholding (30%) is applied during computeTaxes()
    try {
      const result = vm.runInContext(`
        (function() {
          params = {
            startingAge: 40,
            retirementAge: 65,
            marriageYear: null,
            youngestChildBorn: null,
            oldestChildBorn: null,
            personalTaxCredit: 0,
            StartCountry: 'ie'
          };
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          year = 2024;
          
          attributionManager = new AttributionManager();
          attributionManager.reset(currentCountry, year, currentCountry);
          
          var person1 = { id: 'P1', name: 'P1', age: 40 };
          var taxman = new Taxman();
          taxman.reset(person1, null, attributionManager, currentCountry, year);
          
          var grossDividend = 1000;
          var dividendMoney = Money.from(grossDividend, 'EUR', 'ie');
          taxman.declareInvestmentIncome(dividendMoney, 'US Equity Dividend', 'us');

          // Force a compute pass (netIncome calls computeTaxes internally)
          var netIncome = taxman.netIncome();

          var withholdingTax = taxman.taxTotals && taxman.taxTotals['withholding'] ? taxman.taxTotals['withholding'] : 0;
          var withholdingAttr = taxman.attributionManager ? taxman.attributionManager.getAttribution('tax:withholding') : null;
          var hasWithholdingDescription = false;
          if (withholdingAttr) {
            var breakdown = withholdingAttr.getBreakdown();
            for (var key in breakdown) {
              if (key && key.indexOf('US Dividend Withholding') >= 0) {
                hasWithholdingDescription = true;
                break;
              }
            }
          }
          
          return {
            investmentIncome: taxman.investmentIncome,
            expectedGross: grossDividend,
            withholdingTax: withholdingTax,
            expectedWithholding: grossDividend * 0.3,
            hasWithholdingDescription: hasWithholdingDescription,
            netIncome: netIncome,
            expectedNetIncome: grossDividend * 0.7
          };
        })()
      `, ctx);
      
      if (Math.abs(result.investmentIncome - result.expectedGross) > 0.01) {
        errors.push('US dividend withholding: expected gross investment income ' + result.expectedGross + ', got ' + result.investmentIncome);
      }
      
      if (Math.abs(result.withholdingTax - result.expectedWithholding) > 0.01) {
        errors.push('US dividend withholding: expected withholding tax ' + result.expectedWithholding + ', got ' + result.withholdingTax);
      }
      
      if (!result.hasWithholdingDescription) {
        errors.push('US dividend withholding: withholding tax description not found in attribution');
      }

      if (Math.abs(result.netIncome - result.expectedNetIncome) > 0.01) {
        errors.push('US dividend withholding: expected netIncome ' + result.expectedNetIncome + ', got ' + result.netIncome);
      }
    } catch (err) {
      errors.push('US dividend withholding test failed: ' + err.message);
    }

    // Test 2: No withholding when assetCountry not provided
    try {
      const result = vm.runInContext(`
        (function() {
          params = {
            startingAge: 40,
            retirementAge: 65,
            marriageYear: null,
            youngestChildBorn: null,
            oldestChildBorn: null,
            personalTaxCredit: 0,
            StartCountry: 'ie'
          };
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          year = 2024;
          
          attributionManager = new AttributionManager();
          attributionManager.reset(currentCountry, year, currentCountry);
          
          var person1 = { id: 'P1', name: 'P1', age: 40 };
          var taxman = new Taxman();
          taxman.reset(person1, null, attributionManager, currentCountry, year);
          
          var grossDividend = 1000;
          var dividendMoney = Money.from(grossDividend, 'EUR', 'ie');
          taxman.declareInvestmentIncome(dividendMoney, 'Local Dividend'); // No assetCountry

          // Force a compute pass
          var netIncome = taxman.netIncome();

          var withholdingTax = taxman.taxTotals && taxman.taxTotals['withholding'] ? taxman.taxTotals['withholding'] : 0;
          
          return {
            investmentIncome: taxman.investmentIncome,
            expected: grossDividend,
            withholdingTax: withholdingTax,
            netIncome: netIncome,
            expectedNetIncome: grossDividend
          };
        })()
      `, ctx);
      
      if (Math.abs(result.investmentIncome - result.expected) > 0.01) {
        errors.push('No withholding test: expected full income ' + result.expected + ', got ' + result.investmentIncome);
      }
      
      if (Math.abs(result.withholdingTax) > 0.01) {
        errors.push('No withholding test: expected no withholding tax, got ' + result.withholdingTax);
      }

      if (Math.abs(result.netIncome - result.expectedNetIncome) > 0.01) {
        errors.push('No withholding test: expected netIncome ' + result.expectedNetIncome + ', got ' + result.netIncome);
      }
    } catch (err) {
      errors.push('No withholding test failed: ' + err.message);
    }

    // Test 3: Capital gains withholding (US has 0% in schema)
    try {
      const result = vm.runInContext(`
        (function() {
          params = {
            startingAge: 40,
            retirementAge: 65,
            marriageYear: null,
            youngestChildBorn: null,
            oldestChildBorn: null,
            personalTaxCredit: 0,
            StartCountry: 'ie'
          };
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          year = 2024;
          
          attributionManager = new AttributionManager();
          attributionManager.reset(currentCountry, year, currentCountry);
          
          var person1 = { id: 'P1', name: 'P1', age: 40 };
          var taxman = new Taxman();
          taxman.reset(person1, null, attributionManager, currentCountry, year);
          
          var grossGains = 5000;
          var gainsMoney = Money.from(grossGains, 'EUR', 'ie');
          taxman.declareInvestmentGains(gainsMoney, 0.33, 'US Equity Sale', {
            category: 'cgt',
            eligibleForAnnualExemption: true,
            allowLossOffset: true
          }, 'us');
          
          // US capital gains withholding is 0% in schema
          taxman.computeTaxes();
          var withholdingTax = taxman.taxTotals && taxman.taxTotals['withholding'] ? taxman.taxTotals['withholding'] : 0;
          
          return {
            gainsRecorded: taxman.gains[0.33] ? taxman.gains[0.33].amount : 0,
            expected: grossGains,
            withholdingTax: withholdingTax
          };
        })()
      `, ctx);
      
      if (Math.abs(result.gainsRecorded - result.expected) > 0.01) {
        errors.push('Capital gains withholding: expected ' + result.expected + ', got ' + result.gainsRecorded);
      }
      
      if (Math.abs(result.withholdingTax) > 0.01) {
        errors.push('Capital gains withholding: expected no withholding (0%), got ' + result.withholdingTax);
      }
    } catch (err) {
      errors.push('Capital gains withholding test failed: ' + err.message);
    }

    // Test 4: Withholding survives recompute (does not get wiped or double-counted)
    try {
      const result = vm.runInContext(`
        (function() {
          params = {
            startingAge: 40,
            retirementAge: 65,
            marriageYear: null,
            youngestChildBorn: null,
            oldestChildBorn: null,
            personalTaxCredit: 0,
            StartCountry: 'ie'
          };
          currentCountry = 'ie';
          residenceCurrency = 'EUR';
          year = 2024;
          
          attributionManager = new AttributionManager();
          attributionManager.reset(currentCountry, year, currentCountry);
          
          var person1 = { id: 'P1', name: 'P1', age: 40 };
          var taxman = new Taxman();
          taxman.reset(person1, null, attributionManager, currentCountry, year);

          var grossDividend = 1000;
          taxman.declareInvestmentIncome(Money.from(grossDividend, 'EUR', 'ie'), 'US Equity Dividend', 'us');

          taxman.computeTaxes();
          var w1 = taxman.taxTotals && taxman.taxTotals['withholding'] ? taxman.taxTotals['withholding'] : 0;

          taxman.computeTaxes();
          var w2 = taxman.taxTotals && taxman.taxTotals['withholding'] ? taxman.taxTotals['withholding'] : 0;

          return { w1: w1, w2: w2, expected: grossDividend * 0.3 };
        })()
      `, ctx);

      if (Math.abs(result.w1 - result.expected) > 0.01) {
        errors.push('Recompute withholding: first compute expected ' + result.expected + ', got ' + result.w1);
      }
      if (Math.abs(result.w2 - result.expected) > 0.01) {
        errors.push('Recompute withholding: second compute expected ' + result.expected + ', got ' + result.w2);
      }
    } catch (err) {
      errors.push('Recompute withholding test failed: ' + err.message);
    }

    return { success: errors.length === 0, errors: errors };
  }
};

