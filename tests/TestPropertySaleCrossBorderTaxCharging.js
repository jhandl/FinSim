const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const US_RULES = require('../src/core/config/tax-rules-us.json');

module.exports = {
  name: 'TestPropertySaleCrossBorderTaxCharging',
  description: 'Charges source-country property sale tax and applies treaty credit to residence CGT.',
  isCustomTest: true,
  runCustomTest: async function () {
    const errors = [];
    const framework = new TestFramework();

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    framework.ensureVMUIManagerMocks(null, null);
    await vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);

    const ieRules = deepClone(IE_RULES);
    ieRules.capitalGainsTax = ieRules.capitalGainsTax || {};
    ieRules.capitalGainsTax.rate = 0.2;
    ieRules.capitalGainsTax.annualExemption = 0;
    if (ieRules.locale) ieRules.locale.currencyCode = 'EUR';
    if (ieRules.economicData && ieRules.economicData.inflation) ieRules.economicData.inflation.cpi = 0;
    if (ieRules.economicData && ieRules.economicData.exchangeRate) ieRules.economicData.exchangeRate.perEur = 1;

    const usRules = deepClone(US_RULES);
    usRules.capitalGainsTax = usRules.capitalGainsTax || {};
    usRules.capitalGainsTax.rate = 0.3;
    usRules.capitalGainsTax.annualExemption = 0;
    usRules.propertyGainsTax = {
      taxRef: 'capitalGains',
      primaryResidenceExemption: {
        enabled: true,
        proportional: true
      },
      holdingPeriodExemptionYears: null,
      residentsOnly: false,
      capitalGainsOptions: {
        rateRef: 'capitalGainsTax.rate',
        eligibleForAnnualExemption: true,
        allowLossOffset: true
      }
    };
    if (usRules.locale) usRules.locale.currencyCode = 'USD';
    if (usRules.economicData && usRules.economicData.inflation) usRules.economicData.inflation.cpi = 0;
    if (usRules.economicData && usRules.economicData.exchangeRate) usRules.economicData.exchangeRate.perEur = 1;

    installTestTaxRules(framework, {
      ie: ieRules,
      us: usRules
    });

    if (!framework.loadScenario({
      name: 'ForeignPropertySaleTreatyCredit',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 32,
          retirementAge: 65,
          initialSavings: 150000,
          initialPension: 0,
          initialFunds: 0,
          initialShares: 0,
          emergencyStash: 0,
          inflation: 0,
          simulation_mode: 'single',
          economy_mode: 'deterministic',
          StartCountry: 'ie'
        },
        events: [
          { type: 'SI', id: 'salary', amount: 50000, fromAge: 31, toAge: 32, currency: 'EUR', linkedCountry: 'ie' },
          { type: 'R', id: 'home', amount: 100000, fromAge: 31, toAge: 32, rate: 0.2, currency: 'USD', linkedCountry: 'us' }
        ]
      },
      assertions: []
    })) {
      return { success: false, errors: ['Unable to load test scenario'] };
    }

    const results = await framework.runSimulation();
    if (!results || !results.success) {
      var detail = '';
      if (results) {
        detail = ' (failedAt=' + (results.failedAt !== undefined ? results.failedAt : 'n/a') + ', error=' + (results.error || 'n/a') + ')';
      }
      return { success: false, errors: ['Simulation failed for cross-border property sale scenario' + detail] };
    }

    const totalsJson = vm.runInContext(`
      JSON.stringify({
        taxTotals: (revenue && revenue.taxTotals) ? revenue.taxTotals : {},
        total: (revenue && revenue.getAllTaxesTotal) ? revenue.getAllTaxesTotal() : 0
      })
    `, framework.simulationContext);
    const totals = JSON.parse(totalsJson);

    const sourceTax = totals.taxTotals['capitalGains:us'] || 0;
    const residenceTax = totals.taxTotals.capitalGains || 0;
    const totalTax = totals.total || 0;
    const expectedSourceTax = 24000 * 0.3;
    const expectedResidenceTaxAfterCredit = 0;
    const tolerance = 1e-6;

    if (Math.abs(sourceTax - expectedSourceTax) > tolerance) {
      errors.push('Expected source-country tax capitalGains:us = ' + expectedSourceTax + ', got ' + sourceTax);
    }
    if (Math.abs(residenceTax - expectedResidenceTaxAfterCredit) > tolerance) {
      errors.push('Expected residence capitalGains after treaty credit = ' + expectedResidenceTaxAfterCredit + ', got ' + residenceTax);
    }
    if (totalTax + tolerance < expectedSourceTax) {
      errors.push('Expected total tax to include source-country property tax ' + expectedSourceTax + ', got ' + totalTax);
    }

    return { success: errors.length === 0, errors };
  }
};
