const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');

module.exports = {
  name: 'SalaryPensionCrossBorder',
  description: 'Validates source-country salary/pension taxation and foreign tax credits.',
  isCustomTest: true,
  runCustomTest: async function () {
    const errors = [];
    const framework = new TestFramework();

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    framework.ensureVMUIManagerMocks(null, null);
    const ctx = framework.simulationContext;
    await vm.runInContext('Config.initialize(WebUI.getInstance())', ctx);
    await vm.runInContext('Promise.all([Config.getInstance().getTaxRuleSet("us"), Config.getInstance().getTaxRuleSet("ar")])', ctx);
    await vm.runInContext('params = { taxCreditsByCountry: {} };', ctx);

    const results = vm.runInContext(`
      (function () {
        function makeTaxman() {
          var tm = new Taxman();
          tm.ruleset = Config.getInstance().getCachedTaxRuleSet('ie');
          tm.attributionManager = new AttributionManager();
          tm.attributionManager.currentCountry = 'ie';
          tm.attributionManager.year = 2026;
          tm.attributionManager.yearlyAttributions = {};
          tm.countryHistory = [{ country: 'ie', fromYear: 2026 }];
          tm.married = false;
          tm.dependentChildren = false;
          tm.privatePensionP1 = 0;
          tm.privatePensionP2 = 0;
          tm.privatePensionLumpSumP1 = 0;
          tm.privatePensionLumpSumP2 = 0;
          tm.privatePensionLumpSumCountP1 = 0;
          tm.privatePensionLumpSumCountP2 = 0;
          tm.pensionContribReliefP1 = 0;
          tm.pensionContribReliefP2 = 0;
          tm.investmentTypeIncome = {};
          tm.salariesP1 = [];
          tm.salariesP2 = [];
          tm.totalSalaryP1 = 0;
          tm.totalSalaryP2 = 0;
          tm.salaryIncomeBySourceCountry = {};
          tm.person1Ref = { id: 1, age: 45 };
          tm.person2Ref = null;
          tm.gains = {};
          tm.taxTotals = {};
          return tm;
        }

        function setAttribution(tm, key, entries) {
          var attr = new Attribution(key, 'ie', 2026);
          for (var i = 0; i < entries.length; i++) {
            attr.add(entries[i].source, entries[i].amount);
          }
          tm.attributionManager.yearlyAttributions[key] = attr;
        }

        function foreignCreditAbs(tm) {
          var attr = tm.attributionManager.getAttribution('tax:incomeTax');
          if (!attr) return 0;
          var breakdown = attr.getBreakdown();
          var total = 0;
          for (var label in breakdown) {
            if (label === 'Foreign Tax Credit') {
              total += -breakdown[label];
            }
          }
          return total;
        }

        function countryCreditAbs(tm, cc) {
          var key = 'tax:incomeTax:' + cc;
          var attr = tm.attributionManager.getAttribution(key);
          if (!attr) return 0;
          var breakdown = attr.getBreakdown();
          var label = 'Foreign Tax Credit (' + String(cc).toUpperCase() + ')';
          return breakdown[label] ? -breakdown[label] : 0;
        }

        // 1) Foreign salary with treaty (IE-US)
        var c1 = makeTaxman();
        setAttribution(c1, 'income', [
          { source: 'Domestic Salary', amount: 50000 },
          { source: 'US Salary', amount: 40000 }
        ]);
        c1.salaryIncomeBySourceCountry.us = 40000;
        c1.computeIT();
        var econ = Config.getInstance().getEconomicData();
        var baseYear = Config.getInstance().getSimulationStartYear();
        var usRules = Config.getInstance().getCachedTaxRuleSet('us');
        var salaryUsd = econ.convert(40000, 'IE', 'US', 2026, { baseYear: baseYear, fxMode: 'evolution' });
        var expectedUsSalaryTaxUsd = c1.computeTaxFromBands(usRules.getIncomeTaxBracketsFor('single', false), salaryUsd);
        var expectedUsSalaryTaxEur = econ.convert(expectedUsSalaryTaxUsd, 'US', 'IE', 2026, { baseYear: baseYear, fxMode: 'evolution' });

        // 2) Foreign pension with treaty (IE-US)
        var c2 = makeTaxman();
        c2.privatePensionP1 = 30000;
        setAttribution(c2, 'incomeprivatepension:us', [{ source: 'US Private Pension', amount: 30000 }]);
        c2.computeIT();

        // 3) Foreign salary without treaty (IE-AR)
        var c3 = makeTaxman();
        setAttribution(c3, 'income', [
          { source: 'Domestic Salary', amount: 50000 },
          { source: 'AR Salary', amount: 40000 }
        ]);
        c3.salaryIncomeBySourceCountry.ar = 40000;
        c3.computeIT();

        // 4) Domestic salary/pension only
        var c4 = makeTaxman();
        c4.privatePensionP1 = 10000;
        setAttribution(c4, 'income', [{ source: 'Domestic Salary', amount: 70000 }]);
        setAttribution(c4, 'incomesalaries', [{ source: 'Domestic Salary', amount: 70000 }]);
        setAttribution(c4, 'incomeprivatepension', [{ source: 'Domestic Private Pension', amount: 10000 }]);
        c4.computeIT();

        // 5) Mixed domestic + foreign salary/pension
        var c5 = makeTaxman();
        c5.privatePensionP1 = 12000;
        setAttribution(c5, 'income', [
          { source: 'Domestic Salary', amount: 55000 },
          { source: 'US Salary', amount: 25000 }
        ]);
        c5.salaryIncomeBySourceCountry.us = 25000;
        setAttribution(c5, 'incomeprivatepension:us', [{ source: 'US Private Pension', amount: 12000 }]);
        c5.computeIT();

        // 6) Multiple source countries (US treaty, AR no treaty)
        var c6 = makeTaxman();
        setAttribution(c6, 'income', [
          { source: 'Domestic Salary', amount: 50000 },
          { source: 'US Salary', amount: 20000 },
          { source: 'AR Salary', amount: 20000 }
        ]);
        c6.salaryIncomeBySourceCountry.us = 20000;
        c6.salaryIncomeBySourceCountry.ar = 20000;
        c6.computeIT();

        return {
          case1: {
            sourceTaxUs: c1.taxTotals['incomeTax:us'] || 0,
            residenceTax: c1.taxTotals['incomeTax'] || 0,
            foreignCredit: foreignCreditAbs(c1),
            expectedSourceTaxUs: expectedUsSalaryTaxEur
          },
          case2: {
            sourceTaxUs: c2.taxTotals['incomeTax:us'] || 0,
            residenceTax: c2.taxTotals['incomeTax'] || 0,
            foreignCredit: foreignCreditAbs(c2)
          },
          case3: {
            sourceTaxAr: c3.taxTotals['incomeTax:ar'] || 0,
            residenceTax: c3.taxTotals['incomeTax'] || 0,
            foreignCredit: foreignCreditAbs(c3)
          },
          case4: {
            foreignTaxKeys: Object.keys(c4.taxTotals || {}).filter(function (k) { return k.indexOf('incomeTax:') === 0; }),
            residenceTax: c4.taxTotals['incomeTax'] || 0
          },
          case5: {
            sourceTaxUs: c5.taxTotals['incomeTax:us'] || 0,
            residenceTax: c5.taxTotals['incomeTax'] || 0,
            foreignCredit: foreignCreditAbs(c5)
          },
          case6: {
            sourceTaxUs: c6.taxTotals['incomeTax:us'] || 0,
            sourceTaxAr: c6.taxTotals['incomeTax:ar'] || 0,
            usCountryCredit: countryCreditAbs(c6, 'us'),
            arCountryCredit: countryCreditAbs(c6, 'ar')
          }
        };
      })()
    `, ctx);

    if (!(results.case1.sourceTaxUs > 0)) {
      errors.push('Case 1 failed: expected source-country salary tax for US.');
    }
    if (Math.abs(results.case1.sourceTaxUs - results.case1.expectedSourceTaxUs) > 1e-6) {
      errors.push('Case 1 failed: expected US source salary tax in residence currency after FX-normalized source-country computation.');
    }
    if (!(results.case1.foreignCredit > 0)) {
      errors.push('Case 1 failed: expected foreign tax credit with treaty for US salary.');
    }

    if (!(results.case2.sourceTaxUs > 0)) {
      errors.push('Case 2 failed: expected source-country pension tax for US.');
    }
    if (!(results.case2.foreignCredit > 0)) {
      errors.push('Case 2 failed: expected foreign tax credit with treaty for US pension.');
    }

    if (!(results.case3.sourceTaxAr > 0)) {
      errors.push('Case 3 failed: expected source-country salary tax for AR.');
    }
    if (Math.abs(results.case3.foreignCredit) > 1e-9) {
      errors.push('Case 3 failed: expected no foreign tax credit without treaty (IE-AR).');
    }

    if (results.case4.foreignTaxKeys.length !== 0) {
      errors.push('Case 4 failed: domestic-only income should not create foreign income tax buckets.');
    }

    if (!(results.case5.sourceTaxUs > 0)) {
      errors.push('Case 5 failed: expected mixed scenario to include US source tax.');
    }
    if (!(results.case5.foreignCredit > 0)) {
      errors.push('Case 5 failed: expected mixed scenario to apply foreign tax credit.');
    }

    if (!(results.case6.sourceTaxUs > 0 && results.case6.sourceTaxAr > 0)) {
      errors.push('Case 6 failed: expected source taxes for both US and AR.');
    }
    if (!(results.case6.usCountryCredit > 0)) {
      errors.push('Case 6 failed: expected US country credit allocation.');
    }
    if (Math.abs(results.case6.arCountryCredit) > 1e-9) {
      errors.push('Case 6 failed: expected no AR country credit allocation (no treaty).');
    }

    return { success: errors.length === 0, errors };
  }
};
