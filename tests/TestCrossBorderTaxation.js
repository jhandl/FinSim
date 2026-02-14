const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');
const CrossBorderInvestmentTaxation = require('./TestCrossBorderInvestmentTaxation.js');
const SalaryPensionCrossBorder = require('./TestSalaryPensionCrossBorder.js');
const RentalIncomeCrossBorder = require('./TestRentalIncomeCrossBorder.js');
const TestPropertySaleTaxation = require('./TestPropertySaleTaxation.js');

const TRAILING_RULES = {
  xx: {
    version: 'test-1',
    country: 'XX',
    countryName: 'Country X',
    locale: { currencyCode: 'XXX', currencySymbol: '¤X' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: {
      brackets: { '0': 0.2 },
      taxCredits: { employee: 0, personal: 0 }
    },
    socialContributions: [
      { name: 'PRSI', rate: 0.05 }
    ],
    additionalTaxes: [
      { name: 'USC', brackets: { '0': 0.03 } }
    ],
    residencyRules: {
      postEmigrationTaxYears: 3,
      taxesForeignIncome: true
    },
    capitalGainsTax: {
      rate: 0.2,
      annualExemption: 0
    },
    pensionRules: {
      systemType: 'mixed',
      lumpSumTaxBands: { '0': 0 }
    },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'XXX', assetCountry: 'xx', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'XXX', assetCountry: 'xx', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  },
  yy: {
    version: 'test-1',
    country: 'YY',
    countryName: 'Country Y',
    locale: { currencyCode: 'YYY', currencySymbol: '¤Y' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: {
      brackets: { '0': 0.1 },
      taxCredits: { employee: 0, personal: 0 }
    },
    residencyRules: {
      postEmigrationTaxYears: 0,
      taxesForeignIncome: false
    },
    capitalGainsTax: {
      rate: 0.1,
      annualExemption: 0
    },
    pensionRules: {
      systemType: 'mixed',
      lumpSumTaxBands: { '0': 0 }
    },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'YYY', assetCountry: 'yy', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'YYY', assetCountry: 'yy', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  },
  zz: {
    version: 'test-1',
    country: 'ZZ',
    countryName: 'Country Z',
    locale: { currencyCode: 'ZZZ', currencySymbol: '¤Z' },
    economicData: {
      inflation: { cpi: 0.0, year: 2025 },
      purchasingPowerParity: { value: 1.0, year: 2025 },
      exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
    },
    incomeTax: {
      brackets: { '0': 0.25 },
      taxCredits: { employee: 0, personal: 0 }
    },
    residencyRules: {
      postEmigrationTaxYears: 2,
      taxesForeignIncome: true
    },
    capitalGainsTax: {
      rate: 0.25,
      annualExemption: 0
    },
    pensionRules: {
      systemType: 'mixed',
      lumpSumTaxBands: { '0': 0 }
    },
    investmentTypes: [
      { key: 'funds', label: 'Funds', baseCurrency: 'ZZZ', assetCountry: 'zz', taxation: { exitTax: { rate: 0.41 } } },
      { key: 'shares', label: 'Shares', baseCurrency: 'ZZZ', assetCountry: 'zz', taxation: { capitalGains: { rate: 0.33 } } }
    ]
  }
};

function findRowByAge(rows, age) {
  return rows.find(r => r && typeof r === 'object' && r.age === age);
}

module.exports = {
  name: 'CrossBorderTaxation',
  description: 'Validates trailing cross-border taxation timelines across relocations.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    const framework = new TestFramework();
    const scenarioDefinition = {
      name: 'TwoStageRelocation',
      description: 'Relocate from X to Y then to Z with trailing rules.',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 40,
          retirementAge: 65,
          initialSavings: 10000,
          initialPension: 0,
          initialFunds: 0,
          initialShares: 0,
          emergencyStash: 0,
          inflation: 0,
          simulation_mode: 'single',
          economy_mode: 'deterministic',
          StartCountry: 'xx'
        },
        events: [
          { type: 'SI', id: 'salary-xx', amount: 60000, fromAge: 30, toAge: 34, currency: 'XXX' },
          { type: 'UI', id: 'bonus-xx', amount: 10000, fromAge: 32, toAge: 32, currency: 'XXX' },
          { type: 'MV', name: 'YY', id: 'move-to-yy', amount: 0, fromAge: 35, toAge: 35 },
          { type: 'SI', id: 'salary-yy', amount: 80000, fromAge: 35, toAge: 38, currency: 'YYY' },
          { type: 'MV', name: 'ZZ', id: 'move-to-zz', amount: 0, fromAge: 39, toAge: 39 },
          { type: 'SI', id: 'salary-zz', amount: 70000, fromAge: 39, toAge: 40, currency: 'ZZZ' }
        ]
      },
      assertions: []
    };

    if (!framework.loadScenario(scenarioDefinition)) {
      return { success: false, errors: ['Unable to load cross-border scenario'] };
    }

    installTestTaxRules(framework, deepClone(TRAILING_RULES));

    vm.runInContext(`
      (function(){
        __crossBorderYearLog = [];
        var originalComputeIT = Taxman.prototype.computeIT;
        Taxman.prototype.computeIT = function() {
          var result = originalComputeIT.apply(this, arguments);
          try {
            var trailing = this.getActiveCrossBorderTaxCountries ? this.getActiveCrossBorderTaxCountries() : [];
            __crossBorderYearLog.push({
              year: this.currentYear,
              currentCountry: (this.countryHistory && this.countryHistory.length > 0) ? this.countryHistory[this.countryHistory.length - 1].country : null,
              trailingCountries: trailing.map(function(entry){ return entry.country; }),
              salaryCountryMetrics: Object.keys((this.attributionManager && this.attributionManager.yearlyAttributions) || {})
                .filter(function(key){ return key.indexOf('incomesalaries:') === 0; }),
              pensionCountryMetrics: Object.keys((this.attributionManager && this.attributionManager.yearlyAttributions) || {})
                .filter(function(key){ return key.indexOf('incomeprivatepension:') === 0; }),
              sourceTaxKeys: Object.keys(this.taxTotals || {})
                .filter(function(key){ return key.indexOf(':') !== -1; })
            });
          } catch (err) {
            __crossBorderYearLog.push({ year: this.currentYear, error: String(err && err.message ? err.message : err) });
          }
          return result;
        };
      })();
    `, framework.simulationContext);

    const results = await framework.runSimulation();
    if (!results || !results.success) {
      errors.push('Cross-border simulation failed to run');
      return { success: errors.length === 0, errors };
    }

    const rows = Array.isArray(results.dataSheet)
      ? results.dataSheet.filter(r => r && typeof r === 'object')
      : [];
    if (rows.length === 0) {
      errors.push('Simulation produced no data rows');
      return { success: false, errors };
    }

    const moveToYRow = findRowByAge(rows, 35);
    const afterMoveRow = findRowByAge(rows, 36);
    const moveToZRow = findRowByAge(rows, 39);
    if (!moveToYRow || !afterMoveRow || !moveToZRow) {
      errors.push('Missing expected age rows (35, 36, 39)');
    } else {
      if (afterMoveRow.incomeSalaries <= 0 || moveToZRow.incomeSalaries <= 0) {
        errors.push('Salary amounts post-relocation should be positive');
      }
    }

    const historyJson = vm.runInContext(
      'JSON.stringify(revenue && revenue.countryHistory ? revenue.countryHistory : [])',
      framework.simulationContext
    );
    const history = JSON.parse(historyJson);
    const historyOrder = history.map(entry => entry.country);
    const expectedHistory = ['xx', 'yy', 'zz'];
    expectedHistory.forEach(country => {
      if (historyOrder.indexOf(country) === -1) {
        errors.push(`Country history missing ${country}`);
      }
    });

    const logJson = vm.runInContext('JSON.stringify(__crossBorderYearLog || [])', framework.simulationContext);
    const logEntries = JSON.parse(logJson);
    const targetYears = {};
    logEntries.forEach(entry => {
      if (entry && typeof entry.year === 'number') {
        targetYears[entry.year] = entry;
      }
    });

    const startYearRow = findRowByAge(rows, 30);
    const baseYear = startYearRow ? startYearRow.year : (rows[0] && rows[0].year);

    const yearAtExit = baseYear + (35 - 30);         // Age 35 year (move year, trailing starts)
    const yearNearExpiry = baseYear + (37 - 30);     // Age 37 year (final trailing year)
    const yearBeyondTrailing = baseYear + (38 - 30); // Age 38 year (trailing expired)
    const yearAfterSecondMove = baseYear + (39 - 30);

    const trailingEntry = targetYears[yearAtExit];
    if (!trailingEntry || trailingEntry.trailingCountries.indexOf('xx') === -1) {
      errors.push('Trailing tax countries should include origin XX starting in move year (Y+0)');
    }
    if (!trailingEntry || !Array.isArray(trailingEntry.sourceTaxKeys) || trailingEntry.sourceTaxKeys.indexOf('incomeTax:xx') === -1) {
      errors.push('Expected trailing source-country income tax bucket incomeTax:xx for foreign salary');
    }
    if (!trailingEntry || !Array.isArray(trailingEntry.sourceTaxKeys) || trailingEntry.sourceTaxKeys.indexOf('prsi:xx') === -1) {
      errors.push('Expected trailing source-country social contribution bucket prsi:xx');
    }
    if (!trailingEntry || !Array.isArray(trailingEntry.sourceTaxKeys) || trailingEntry.sourceTaxKeys.indexOf('usc:xx') === -1) {
      errors.push('Expected trailing source-country additional tax bucket usc:xx');
    }

    const nearExpiryEntry = targetYears[yearNearExpiry];
    if (!nearExpiryEntry || nearExpiryEntry.trailingCountries.indexOf('xx') === -1) {
      errors.push('Trailing tax should still include XX during configured period');
    }
    const beyondTrailingEntry = targetYears[yearBeyondTrailing];
    if (beyondTrailingEntry && beyondTrailingEntry.trailingCountries.indexOf('xx') !== -1) {
      errors.push('Trailing tax for XX should end after Y+2');
    }
    if (beyondTrailingEntry && Array.isArray(beyondTrailingEntry.sourceTaxKeys) && beyondTrailingEntry.sourceTaxKeys.indexOf('incomeTax:xx') !== -1) {
      errors.push('incomeTax:xx should not be present after trailing period ends');
    }
    if (beyondTrailingEntry && Array.isArray(beyondTrailingEntry.sourceTaxKeys) && beyondTrailingEntry.sourceTaxKeys.indexOf('prsi:xx') !== -1) {
      errors.push('prsi:xx should not be present after trailing period ends');
    }
    if (beyondTrailingEntry && Array.isArray(beyondTrailingEntry.sourceTaxKeys) && beyondTrailingEntry.sourceTaxKeys.indexOf('usc:xx') !== -1) {
      errors.push('usc:xx should not be present after trailing period ends');
    }

    const futureTrailingJson = vm.runInContext(`
      (function(){
        var taxman = revenue;
        if (!taxman) return [];
        taxman.currentYear = ${yearBeyondTrailing};
        var list = taxman.getActiveCrossBorderTaxCountries();
        return JSON.stringify(list ? list.map(function(e){ return e.country; }) : []);
      })();
    `, framework.simulationContext);
    const futureTrailing = JSON.parse(futureTrailingJson);
    if (futureTrailing && futureTrailing.indexOf('xx') !== -1) {
      errors.push('Trailing tax for XX should expire after configured period');
    }

    const trailingZJson = vm.runInContext(`
      (function(){
        var taxman = revenue;
        if (!taxman) return [];
        taxman.currentYear = ${yearAfterSecondMove};
        var list = taxman.getActiveCrossBorderTaxCountries();
        return JSON.stringify(list ? list.map(function(e){ return e.country; }) : []);
      })();
    `, framework.simulationContext);
    const trailingZ = JSON.parse(trailingZJson);
    if (Array.isArray(trailingZ) && trailingZ.indexOf('zz') !== -1) {
      errors.push('Trailing list should not include current country ZZ');
    }

    // Expand coverage by running the dedicated cross-border suites from this authoritative test entry point.
    const delegatedSuites = [
      CrossBorderInvestmentTaxation,
      SalaryPensionCrossBorder,
      RentalIncomeCrossBorder,
      TestPropertySaleTaxation
    ];
    for (let ds = 0; ds < delegatedSuites.length; ds++) {
      const suite = delegatedSuites[ds];
      if (!suite || typeof suite.runCustomTest !== 'function') {
        errors.push(`Delegated suite missing runCustomTest(): ${suite && suite.name ? suite.name : 'unknown'}`);
        continue;
      }
      const delegatedResult = await suite.runCustomTest();
      if (!delegatedResult || delegatedResult.success !== true) {
        const delegatedErrors = (delegatedResult && Array.isArray(delegatedResult.errors)) ? delegatedResult.errors : ['Unknown failure'];
        for (let de = 0; de < delegatedErrors.length; de++) {
          errors.push(`[${suite.name}] ${delegatedErrors[de]}`);
        }
      }
    }

    // Additional mixed and edge coverage in one place.
    const mixedEdgeFramework = new TestFramework();
    if (!mixedEdgeFramework.loadCoreModules()) {
      errors.push('Failed to load core modules for mixed/edge cross-border cases');
    } else {
      mixedEdgeFramework.ensureVMUIManagerMocks(null, null);
      const mixedCtx = mixedEdgeFramework.simulationContext;
      await vm.runInContext('Config.initialize(WebUI.getInstance())', mixedCtx);
      await vm.runInContext('Promise.all([Config.getInstance().getTaxRuleSet("us"), Config.getInstance().getTaxRuleSet("ar")])', mixedCtx);
      await vm.runInContext('params = { taxCreditsByCountry: { ie: { personal: 0 } } };', mixedCtx);

      const mixedJson = vm.runInContext(`
        (function () {
          function makeTaxman() {
            currentCountry = 'ie';
            residenceCurrency = 'EUR';
            year = 2026;
            var attributionManager = new AttributionManager();
            attributionManager.currentCountry = 'ie';
            attributionManager.year = 2026;
            attributionManager.yearlyAttributions = {};
            var person1 = { id: 'P1', age: 45 };
            var tm = new Taxman();
            tm.reset(person1, null, attributionManager, 'ie', 2026);
            tm.ruleset = Config.getInstance().getCachedTaxRuleSet('ie');
            tm.attributionManager = attributionManager;
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
            tm.rentalIncomeBySource = {};
            tm.person1Ref = person1;
            tm.person2Ref = null;
            tm.gains = {};
            tm.taxTotals = {};
            tm.residenceCurrency = 'EUR';
            return tm;
          }

          function foreignCreditAbs(tm) {
            var attr = tm.attributionManager.getAttribution('tax:incomeTax');
            if (!attr) return 0;
            var breakdown = attr.getBreakdown();
            return breakdown['Foreign Tax Credit'] ? -breakdown['Foreign Tax Credit'] : 0;
          }

          function countryCreditAbs(tm, cc) {
            var key = 'tax:incomeTax:' + cc;
            var attr = tm.attributionManager.getAttribution(key);
            if (!attr) return 0;
            var breakdown = attr.getBreakdown();
            var label = 'Foreign Tax Credit (' + String(cc).toUpperCase() + ')';
            return breakdown[label] ? -breakdown[label] : 0;
          }

          // Mixed scenario: salary + investment + rental from two source countries.
          var mixed = makeTaxman();
          mixed.declareSalaryIncome(Money.from(20000, 'EUR', 'ie'), 0, mixed.person1Ref, 'US Salary', 'us');
          mixed.declareSalaryIncome(Money.from(10000, 'EUR', 'ie'), 0, mixed.person1Ref, 'AR Salary', 'ar');
          mixed.declareRentalIncome(Money.from(7000, 'EUR', 'ie'), 'us', 'US Rental');
          mixed.declareInvestmentIncome(Money.from(5000, 'EUR', 'ie'), 'US Dividend', 'us');
          mixed.computeTaxes();
          var withholding = mixed.taxTotals && mixed.taxTotals.withholding ? mixed.taxTotals.withholding : 0;
          mixed.computeTaxes({
            income: withholding,
            treatyExists: true,
            byCountry: { income: { us: withholding } }
          });

          // Domestic only: no foreign buckets and no foreign credits.
          var domestic = makeTaxman();
          domestic.declareSalaryIncome(Money.from(50000, 'EUR', 'ie'), 0, domestic.person1Ref, 'IE Salary', null);
          domestic.computeIT();

          // Max FTC cap: credit cannot exceed residence income tax.
          var cap = makeTaxman();
          cap.declareOtherIncome(Money.from(1000, 'EUR', 'ie'), 'Baseline');
          cap.computeTaxes();
          var beforeCapTax = cap.taxTotals && cap.taxTotals.incomeTax ? cap.taxTotals.incomeTax : 0;
          cap.computeTaxes({
            income: beforeCapTax * 5,
            treatyExists: true,
            byCountry: { income: { us: beforeCapTax * 5 } }
          });
          var afterCapTax = cap.taxTotals && cap.taxTotals.incomeTax ? cap.taxTotals.incomeTax : 0;

          // Residence-country treaty status across relocations.
          var ieRules = Config.getInstance().getCachedTaxRuleSet('ie');
          var usRules = Config.getInstance().getCachedTaxRuleSet('us');
          var arRules = Config.getInstance().getCachedTaxRuleSet('ar');

          return JSON.stringify({
            mixed: {
              sourceUs: mixed.taxTotals['incomeTax:us'] || 0,
              sourceAr: mixed.taxTotals['incomeTax:ar'] || 0,
              foreignCredit: foreignCreditAbs(mixed),
              usCountryCredit: countryCreditAbs(mixed, 'us'),
              arCountryCredit: countryCreditAbs(mixed, 'ar')
            },
            domestic: {
              foreignTaxKeys: Object.keys(domestic.taxTotals || {}).filter(function (k) { return k.indexOf(':') !== -1; }),
              foreignCredit: foreignCreditAbs(domestic)
            },
            maxCredit: {
              before: beforeCapTax,
              after: afterCapTax,
              applied: beforeCapTax - afterCapTax
            },
            relocationTreaties: {
              usHasIe: usRules.hasTreatyWith('ie'),
              arHasIe: arRules.hasTreatyWith('ie'),
              ieHasUs: ieRules.hasTreatyWith('us'),
              ieHasAr: ieRules.hasTreatyWith('ar')
            }
          });
        })();
      `, mixedCtx);

      const mixedEdge = JSON.parse(mixedJson);
      if (!(mixedEdge.mixed.sourceUs > 0 && mixedEdge.mixed.sourceAr > 0)) {
        errors.push('Mixed case: expected source-country incomeTax buckets for both US and AR.');
      }
      if (!(mixedEdge.mixed.foreignCredit > 0 && mixedEdge.mixed.usCountryCredit > 0)) {
        errors.push('Mixed case: expected treaty foreign tax credit allocation for US sources.');
      }
      if (Math.abs(mixedEdge.mixed.arCountryCredit) > 1e-9) {
        errors.push('Mixed case: expected no AR foreign tax credit allocation (no treaty).');
      }
      if (mixedEdge.domestic.foreignTaxKeys.length !== 0) {
        errors.push('Domestic edge case: expected no foreign tax buckets for domestic-only income.');
      }
      if (Math.abs(mixedEdge.domestic.foreignCredit) > 1e-9) {
        errors.push('Domestic edge case: expected zero foreign tax credit.');
      }
      if (!(mixedEdge.maxCredit.after >= 0)) {
        errors.push('Maximum credit edge case: income tax should never become negative.');
      }
      if (Math.abs(mixedEdge.maxCredit.applied - mixedEdge.maxCredit.before) > 1e-6) {
        errors.push('Maximum credit edge case: credit should be capped at the residence tax amount.');
      }
      if (!(mixedEdge.relocationTreaties.ieHasUs && !mixedEdge.relocationTreaties.ieHasAr && mixedEdge.relocationTreaties.usHasIe && !mixedEdge.relocationTreaties.arHasIe)) {
        errors.push('Relocation treaty edge case: expected IE<->US treaty and no treaty with AR.');
      }
    }

    // Backward compatibility: single-country scenario should not create cross-border tax buckets.
    const singleCountryFramework = new TestFramework();
    const singleCountry = {
      name: 'SingleCountryBackwardCompat',
      description: 'Verify single-country scenarios work unchanged',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 40,
          retirementAge: 65,
          initialSavings: 10000,
          initialPension: 0,
          initialFunds: 0,
          initialShares: 0,
          emergencyStash: 0,
          inflation: 0,
          StartCountry: 'ie',
          simulation_mode: 'single',
          economy_mode: 'deterministic'
        },
        events: [
          { type: 'SI', id: 'salary', amount: 50000, fromAge: 30, toAge: 40, currency: 'EUR' }
        ]
      },
      assertions: []
    };
    if (!singleCountryFramework.loadScenario(singleCountry)) {
      errors.push('Backward compatibility case: failed to load single-country scenario.');
    } else {
      const singleCountryResults = await singleCountryFramework.runSimulation();
      if (!singleCountryResults || !singleCountryResults.success) {
        errors.push('Backward compatibility case: single-country simulation failed.');
      } else {
        const taxTotalsJson = vm.runInContext(
          'JSON.stringify(revenue && revenue.taxTotals ? revenue.taxTotals : {})',
          singleCountryFramework.simulationContext
        );
        const taxTotals = JSON.parse(taxTotalsJson || '{}');
        const foreignTaxKeys = Object.keys(taxTotals).filter(key => key.indexOf(':') !== -1);
        if (foreignTaxKeys.length !== 0) {
          errors.push(`Backward compatibility case: expected no cross-border tax buckets, got ${foreignTaxKeys.join(', ')}`);
        }
      }
    }

    return { success: errors.length === 0, errors };
  }
};
