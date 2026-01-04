const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');
const { installTestTaxRules } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function buildRulesWithNoDrawdown(raw, overrides) {
  const next = clone(raw);
  next.pensionRules = next.pensionRules || {};
  next.pensionRules.minDrawdownRates = { '0': 0 };
  Object.assign(next.pensionRules, overrides || {});
  return next;
}

async function runScenarioToTargetAge(targetAge) {
  const framework = new TestFramework();
  framework.loadCoreModules();

  const testRules = {
    ie: buildRulesWithNoDrawdown(IE_RULES, { minRetirementAgePrivate: 60, lumpSumMaxPercent: 0.25 }),
    zz: {
      country: 'ZZ',
      countryName: 'Testland',
      version: 'test',
      locale: { numberLocale: 'en-US', currencyCode: 'USD', currencySymbol: '$' },
      economicData: {
        inflation: { cpi: 0, year: 2025 },
        purchasingPowerParity: { value: 1.0, year: 2025 },
        exchangeRate: { perEur: 1.0, asOf: '2025-01-01' }
      },
      incomeTax: { name: 'Test Tax', personalAllowance: 0, taxCredits: {}, bracketsByStatus: { single: { '0': 0.0 } } },
      socialContributions: [],
      capitalGainsTax: { rate: 0, annualExemption: 0, allowLossOffset: true },
      pensionRules: {
        minRetirementAgePrivate: 65,
        minRetirementAgeOccupational: 65,
        minRetirementAgeState: 65,
        pensionSystem: { type: 'mixed' },
        contributionLimits: { ageBandsPercent: { '0': 1.0 }, annualCap: 999999999 },
        lumpSumTaxBands: {},
        lumpSumMaxPercent: 0.25,
        minDrawdownRates: { '0': 0 },
        statePensionAge: 67,
        statePensionIncreaseBands: {},
        definedBenefit: { treatment: 'privatePension' }
      },
      residencyRules: { postEmigrationTaxYears: 0, taxesForeignIncome: false },
      investmentTypes: [],
      pinnedIncomeTypes: []
    }
  };

  installTestTaxRules(framework, testRules);

  const scenarioDefinition = {
    name: 'MultiPotPensionLumpSumEligibilityScenario',
    description: 'IE pot eligible at 60; ZZ pot only eligible at 65',
    scenario: {
      parameters: {
        startingAge: 59,
        targetAge,
        retirementAge: 60,
        initialSavings: 0,
        initialPension: 100000,
        initialFunds: 0,
        initialShares: 0,
        emergencyStash: 0,
        FundsAllocation: 0,
        SharesAllocation: 0,
        priorityCash: 1,
        priorityPension: 2,
        priorityFunds: 3,
        priorityShares: 4,
        pensionPercentage: 1.0,
        pensionCapped: 'No',
        statePensionWeekly: 0,
        growthRatePension: 0,
        growthDevPension: 0,
        growthRateFunds: 0,
        growthDevFunds: 0,
        growthRateShares: 0,
        growthDevShares: 0,
        inflation: 0,
        relocationEnabled: true,
        StartCountry: 'ie',
        economyMode: 'deterministic',
        simulation_mode: 'single'
      },
      events: [
        {
          type: 'SI',
          id: 'ZZ_Salary_SeedPension',
          amount: 10000,
          fromAge: 59,
          toAge: 59,
          rate: 0,
          match: 0,
          currency: 'USD',
          linkedCountry: 'zz'
        }
      ]
    },
    assertions: []
  };

  const loaded = framework.loadScenario(scenarioDefinition);
  if (!loaded) {
    return { success: false, errors: ['Failed to load scenario'] };
  }

  const results = await framework.runSimulation();
  if (!results || !results.success) {
    return { success: false, errors: ['Simulation failed to run successfully'] };
  }

  const status = vm.runInContext(
    `(function() {
      return {
        age: person1.age,
        ieTaken: !!(person1 && person1.pensions && person1.pensions.ie && person1.pensions.ie.lumpSumTaken),
        zzTaken: !!(person1 && person1.pensions && person1.pensions.zz && person1.pensions.zz.lumpSumTaken)
      };
    })()`,
    framework.simulationContext
  );

  return { success: true, status };
}

module.exports = {
  name: 'TestMultiPotPensionLumpSumEligibility',
  description: 'Lump sums apply per pot only when each pot’s min retirement age is reached.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // Up to age 64: IE lump sum should be taken; ZZ lump sum should NOT.
    {
      const res = await runScenarioToTargetAge(64);
      if (!res.success) return res;
      if (!res.status.ieTaken) errors.push('Expected IE pot lump sum to be taken by age 64');
      if (res.status.zzTaken) errors.push('Expected ZZ pot lump sum NOT to be taken by age 64');
    }

    // Up to age 65: ZZ becomes eligible, so its lump sum should be taken.
    {
      const res = await runScenarioToTargetAge(65);
      if (!res.success) return res;
      if (!res.status.ieTaken) errors.push('Expected IE pot lump sum to be taken by age 65');
      if (!res.status.zzTaken) errors.push('Expected ZZ pot lump sum to be taken at/after age 65');
    }

    return errors.length ? { success: false, errors } : { success: true };
  }
};

