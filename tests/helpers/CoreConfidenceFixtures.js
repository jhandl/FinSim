const vm = require('vm');
const { installTestTaxRules, deepClone } = require('./RelocationTestHelpers.js');

const TOY_AA = {
  version: 'test-1',
  country: 'aa',
  countryName: 'Toy Alpha',
  locale: {
    currencyCode: 'AAA',
    currencySymbol: '¤A'
  },
  incomeTax: {
    brackets: { '0': 0.10 },
    taxCredits: {}
  },
  socialContributions: [
    { name: 'SC', rate: 0.05 }
  ],
  additionalTaxes: [],
  capitalGainsTax: {
    rate: 0.20,
    annualExemption: 1000
  },
  propertyGainsTax: {
    taxRef: 'capitalGains',
    capitalGainsOptions: {
      rateRef: 'capitalGainsTax.rate',
      eligibleForAnnualExemption: true,
      allowLossOffset: true
    },
    primaryResidenceExemption: {
      enabled: true,
      proportional: true
    }
  },
  investmentTypes: [
    {
      key: 'funds_aa',
      label: 'Funds AA',
      baseCurrency: 'AAA',
      assetCountry: 'aa',
      taxation: { exitTax: { rate: 0.40 } }
    },
    {
      key: 'shares_aa',
      label: 'Shares AA',
      baseCurrency: 'AAA',
      assetCountry: 'aa',
      taxation: { capitalGains: { rate: 0.20, annualExemption: 1000 } }
    }
  ],
  pensionRules: {
    pensionSystem: { type: 'mixed' },
    // Keep toy pension contribution math simple:
    // - ageBandsPercent 1.0 means p1Pct/p2Pct act as the effective contribution rate
    // - annualCap is very large so it never binds in micro-scenarios
    contributionLimits: { ageBandsPercent: { '0': 1.0 }, annualCap: 1000000000 },
    lumpSumTaxBands: { '0': 0 },
    // Confidence tests can explicitly exercise DBI as salary-like income.
    // contribRate=0: DBI should not auto-create pension contributions.
    definedBenefit: { treatment: 'salary', salary: { contribRate: 0 } }
  },
  residencyRules: {
    postEmigrationTaxYears: 0,
    taxesForeignIncome: true
  },
  economicData: {
    inflation: 0.0,
    exchangeRate: { perEur: 1.0, asOf: '2025-01-01' },
    purchasingPowerParity: { value: 1.0, year: 2025 }
  },
  taxBasis: 'worldwide'
};

const TOY_BB = deepClone(TOY_AA);
TOY_BB.country = 'bb';
TOY_BB.countryName = 'Toy Beta';
TOY_BB.locale.currencyCode = 'BBB';
TOY_BB.locale.currencySymbol = '¤B';
TOY_BB.incomeTax.brackets = { '0': 0.15 };
TOY_BB.socialContributions = [{ name: 'SC', rate: 0.03 }];
TOY_BB.capitalGainsTax = { rate: 0.25, annualExemption: 500 };
TOY_BB.investmentTypes = [
  {
    key: 'funds_bb',
    label: 'Funds BB',
    baseCurrency: 'BBB',
    assetCountry: 'bb',
    taxation: { exitTax: { rate: 0.35 } }
  },
  {
    key: 'shares_bb',
    label: 'Shares BB',
    baseCurrency: 'BBB',
    assetCountry: 'bb',
    taxation: { capitalGains: { rate: 0.25 } }
  }
];
TOY_BB.economicData.exchangeRate = { perEur: 2.0, asOf: '2025-01-01' };
TOY_BB.economicData.purchasingPowerParity = { value: 2.0, year: 2025 };

const TOY_CC = deepClone(TOY_AA);
TOY_CC.country = 'cc';
TOY_CC.countryName = 'Toy Gamma';
TOY_CC.locale.currencyCode = 'CCC';
TOY_CC.locale.currencySymbol = '¤C';
TOY_CC.incomeTax.brackets = { '0': 0.20 };
TOY_CC.socialContributions = [{ name: 'SC', rate: 0.08 }];
TOY_CC.capitalGainsTax = { rate: 0.30, annualExemption: 0 };
TOY_CC.investmentTypes = [
  {
    key: 'funds_cc',
    label: 'Funds CC',
    baseCurrency: 'CCC',
    assetCountry: 'cc',
    taxation: { exitTax: { rate: 0.30 } }
  },
  {
    key: 'shares_cc',
    label: 'Shares CC',
    baseCurrency: 'CCC',
    assetCountry: 'cc',
    taxation: { capitalGains: { rate: 0.30 } }
  }
];
TOY_CC.pensionRules = {
  pensionSystem: { type: 'none' },
  lumpSumTaxBands: { '0': 0 }
};
TOY_CC.residencyRules = {
  postEmigrationTaxYears: 0,
  taxesForeignIncome: false
};
TOY_CC.taxBasis = 'domestic';
TOY_CC.economicData.exchangeRate = { perEur: 3.0, asOf: '2025-01-01' };
TOY_CC.economicData.purchasingPowerParity = { value: 3.0, year: 2025 };

const TOY_RULES_TREATY = { aa: TOY_AA, bb: TOY_BB };
const TOY_RULES_NO_TREATY = { aa: TOY_AA, cc: TOY_CC };
const TREATY_PAIRS = [['aa', 'bb']];

function installTreatyPairs(framework, pairs) {
  if (!framework || !framework.simulationContext) {
    throw new Error('TestFramework simulation context not initialized');
  }
  framework.simulationContext.__testTreatyPairs = pairs || [];

  vm.runInContext(`
    (function() {
      if (Config.prototype.__testTreatyPatch) return;
      Config.prototype.__testTreatyPatch = true;
      var _origGetGlobalTaxRules = Config.prototype.getGlobalTaxRules;
      Config.prototype.getGlobalTaxRules = function() {
        var base;
        try {
          base = _origGetGlobalTaxRules.call(this);
        } catch (e) {
          base = {};
        }
        var result = {};
        for (var key in base) {
          if (Object.prototype.hasOwnProperty.call(base, key)) {
            result[key] = base[key];
          }
        }
        result.treaties = (typeof __testTreatyPairs !== 'undefined') ? __testTreatyPairs : [];
        return result;
      };
    })();
  `, framework.simulationContext);
}

function microParams(overrides) {
  const BASE = {
    startingAge: 30,
    targetAge: 32,
    retirementAge: 65,
    initialSavings: 0,
    initialPension: 0,
    initialFunds: 0,
    initialShares: 0,
    emergencyStash: 0,
    inflation: 0,
    growthRatePension: 0,
    growthDevPension: 0,
    growthRateFunds: 0,
    growthDevFunds: 0,
    growthRateShares: 0,
    growthDevShares: 0,
    simulation_mode: 'single',
    economy_mode: 'deterministic',
    StartCountry: 'aa',
    fxMode: 'constant'
  };
  return Object.assign({}, BASE, overrides || {});
}

module.exports = {
  TOY_AA,
  TOY_BB,
  TOY_CC,
  TOY_RULES_TREATY,
  TOY_RULES_NO_TREATY,
  TREATY_PAIRS,
  installTreatyPairs,
  microParams,
  installTestTaxRules,
  deepClone
};
