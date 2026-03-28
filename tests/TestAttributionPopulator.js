const fs = require('fs');
const path = require('path');
const { TestFramework } = require('../src/core/TestFramework.js');
const AttributionPopulator = require('../src/core/AttributionPopulator.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');
const { getDisplayItems, getDisplayAmountByLabel, getDisplayAmountByMeta } = require('./helpers/DisplayAttributionTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');
const REFERENCE_PATH = path.resolve(__dirname, 'fixtures', 'reference.csv');
const DEMO_PATH = path.resolve(__dirname, '..', 'src', 'frontend', 'web', 'assets', 'demo.csv');

function withinTolerance(actual, expected, tol) {
  if (!isFinite(actual) || !isFinite(expected)) return false;
  const diff = Math.abs(actual - expected);
  if (diff <= tol) return true;
  const denom = Math.abs(expected) > 1e-9 ? Math.abs(expected) : 1;
  return diff / denom <= tol;
}

// Mock Attribution class for testing
function MockAttribution() {
  this.breakdown = {};
  this.sourceMeta = {};
}

MockAttribution.prototype.getBreakdown = function() {
  return this.breakdown;
};

MockAttribution.prototype.record = function(source, amount, meta) {
  this.breakdown[source] = (this.breakdown[source] || 0) + amount;
  if (meta && typeof meta === 'object') {
    var existing = this.sourceMeta[source] || {};
    var keys = Object.keys(meta);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = meta[key];
      if (value === undefined || value === null || value === '') continue;
      existing[key] = value;
    }
    this.sourceMeta[source] = existing;
  }
};

MockAttribution.prototype.getSourceMeta = function(source) {
  return this.sourceMeta[source] || null;
};

// Mock AttributionManager for testing
function MockAttributionManager() {
  this.attributions = {};
}

MockAttributionManager.prototype.record = function(metric, source, amount, meta) {
  if (!this.attributions[metric]) {
    this.attributions[metric] = new MockAttribution();
  }
  this.attributions[metric].record(source, amount, meta);
};

MockAttributionManager.prototype.getAllAttributions = function() {
  return this.attributions;
};

MockAttributionManager.prototype.reset = function(currentCountry, year, baseCountry) {
  this.attributions = {};
  this.currentCountry = currentCountry;
  this.year = year;
  this.baseCountry = baseCountry;
};

// Helper functions from TestChartValues.js for CSV parsing
function parseNumeric(value, treatPercentAsFraction) {
  if (value === undefined || value === null) return 0;
  const trimmed = String(value).trim();
  if (!trimmed) return 0;
  const percent = trimmed.endsWith('%');
  const numericPortion = percent ? trimmed.slice(0, -1) : trimmed;
  const num = parseFloat(numericPortion);
  if (isNaN(num)) return 0;
  if (percent && treatPercentAsFraction) {
    return num / 100;
  }
  return num;
}

const FRACTIONAL_PARAM_KEYS = new Set([
  'FundsAllocation',
  'SharesAllocation',
  'pensionPercentage',
  'PensionGrowthRate',
  'FundsGrowthRate',
  'SharesGrowthRate',
  'PensionGrowthStdDev',
  'FundsGrowthStdDev',
  'SharesGrowthStdDev',
  'PensionContributionPercentage',
  'PensionContributionPercentageP2',
  'PensionContributionPercentagep2',
  'growthRatePension',
  'growthRateFunds',
  'growthRateShares',
  'growthDevPension',
  'growthDevFunds',
  'growthDevShares',
  'inflation',
  'Inflation',
  'inflationRate'
]);

const PARAM_KEY_MAP = {
  StartingAge: 'startingAge',
  TargetAge: 'targetAge',
  RetirementAge: 'retirementAge',
  InitialSavings: 'initialSavings',
  InitialPension: 'initialPension',
  InitialFunds: 'initialFunds',
  InitialShares: 'initialShares',
  EmergencyStash: 'emergencyStash',
  FundsAllocation: 'FundsAllocation',
  SharesAllocation: 'SharesAllocation',
  PensionContributionPercentage: 'pensionPercentage',
  PensionContributionPercentageP2: 'PensionContributionPercentageP2',
  PensionContributionCapped: 'pensionCapped',
  PensionGrowthRate: 'growthRatePension',
  PensionGrowthStdDev: 'growthDevPension',
  FundsGrowthRate: 'growthRateFunds',
  FundsGrowthStdDev: 'growthDevFunds',
  SharesGrowthRate: 'growthRateShares',
  SharesGrowthStdDev: 'growthDevShares',
  Inflation: 'inflation',
  InflationRate: 'inflation',
  MarriageYear: 'marriageYear',
  YoungestChildBorn: 'youngestChildBorn',
  OldestChildBorn: 'oldestChildBorn',
  PersonalTaxCredit: 'personalTaxCredit',
  StatePensionWeekly: 'statePensionWeekly',
  Priority_cash: 'priorityCash',
  Priority_pension: 'priorityPension',
  Priority_indexFunds: 'priorityFunds',
  Priority_shares: 'priorityShares',
  PriorityCash: 'priorityCash',
  PriorityPension: 'priorityPension',
  PriorityFunds: 'priorityFunds',
  PriorityShares: 'priorityShares',
  P2StartingAge: 'P2StartingAge',
  P2RetirementAge: 'P2RetirementAge',
  P2StatePensionWeekly: 'P2StatePensionWeekly',
  InitialPensionP2: 'InitialPensionP2',
  simulation_mode: 'simulation_mode',
  economy_mode: 'economy_mode',
  StartCountry: 'StartCountry'
};

function normalizeParamValue(key, rawValue) {
  if (rawValue === undefined || rawValue === null) return '';
  const trimmed = String(rawValue).trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'yes') return 'Yes';
  if (lower === 'no') return 'No';
  if (FRACTIONAL_PARAM_KEYS.has(key)) {
    return parseNumeric(trimmed, true);
  }
  const num = Number(trimmed);
  if (!isNaN(num)) {
    return num;
  }
  return trimmed;
}

function parseMeta(metaString) {
  const meta = { currency: null, linkedCountry: null, linkedEventId: null, resolutionOverride: null };
  if (!metaString || typeof metaString !== 'string') {
    return meta;
  }
  const pairs = metaString.split(';').filter(Boolean);
  for (let i = 0; i < pairs.length; i++) {
    const [key, value] = pairs[i].split('=');
    if (!key) continue;
    const decoded = decodeURIComponent(value || '');
    if (key === 'cur') meta.currency = decoded.toUpperCase();
    if (key === 'lc') meta.linkedCountry = decoded.toLowerCase();
    if (key === 'lei') meta.linkedEventId = decoded;
    if (key === 'ro') meta.resolutionOverride = decoded;
  }
  return meta;
}

function addParameter(target, rawKey, rawValue) {
  if (!rawKey) return;
  const trimmedKey = rawKey.trim();
  const actualKey = PARAM_KEY_MAP[trimmedKey] || trimmedKey;
  let normalized = normalizeParamValue(actualKey, rawValue);
  if (actualKey === 'StartCountry' && typeof normalized === 'string') {
    normalized = normalized.toLowerCase();
  }
  target[actualKey] = normalized;
  if (actualKey !== trimmedKey) {
    target[trimmedKey] = normalized;
  }
}

function parseReferenceCsvScenario(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').map(line => line.replace(/\r$/, ''));
  const params = {};
  const events = [];
  const relocations = [];
  let section = '';
  let headerSkipped = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      section = line.toLowerCase();
      headerSkipped = false;
      continue;
    }
    if (section.includes('parameters')) {
      const parts = rawLine.split(',');
      const key = parts[0];
      const value = parts.slice(1).join(',').trim();
      addParameter(params, key, value);
      continue;
    }
    if (section.includes('# events')) {
      if (!headerSkipped) {
        headerSkipped = true;
        continue;
      }
      const parts = rawLine.split(',');
      if (parts.length < 2) continue;
      const type = (parts[0] || '').trim();
      const name = (parts[1] || '').replace(/%2C/g, ',').trim();
      const amount = parseNumeric(parts[2], false);
      const fromAge = Math.round(parseNumeric(parts[3], false));
      const toAge = Math.round(parseNumeric(parts[4], false));
      const rate = parseNumeric(parts[5], true);
      const extra = parseNumeric(parts[6], true);
      const meta = parseMeta(parts[7] || '');
      events.push({
        type,
        id: name || type,
        name: name || '',
        amount,
        fromAge,
        toAge,
        rate,
        match: extra,
        currency: meta.currency || null,
        linkedCountry: meta.linkedCountry || null,
        linkedEventId: meta.linkedEventId || null,
        resolutionOverride: meta.resolutionOverride || null
      });
      if (type === 'MV') {
        const code = String(name || '').trim().toLowerCase();
        if (code) relocations.push({ age: fromAge, code: code });
      }
    }
  }

  if (!params.relocationEnabled && relocations.length) {
    params.relocationEnabled = true;
  }
  if (!params.StartCountry) {
    params.StartCountry = 'ie';
  }
  if (!params.economyMode && params.economy_mode) {
    params.economyMode = params.economy_mode;
  }
  if (!params.economyMode) {
    params.economyMode = 'deterministic';
  }
  params.growthDevFunds = 0;
  params.growthDevShares = 0;
  params.growthDevPension = 0;

  return { parameters: params, events, relocations };
}

function filterRows(dataSheet) {
  return Array.isArray(dataSheet)
    ? dataSheet.filter(row => row && typeof row === 'object')
    : [];
}

function findRow(rows, age) {
  return rows.find(r => r && r.age === age) || null;
}

function percentDelta(a, b) {
  const denom = Math.max(Math.abs(b), 1);
  return Math.abs(a - b) / denom;
}

function runTest() {
  const errors = [];

  // Test Case 1: Standard, dynamic investment, and tax displays use exact column keys.
  {
    const dataRow = { displayAttributions: {}, taxByKey: {} };
    const indexFundsAsset = {
      getPortfolioStats: () => ({ yearlyBought: 10000, yearlySold: 2000, principal: 50000, totalGain: 5000 })
    };
    const sharesAsset = {
      getPortfolioStats: () => ({ yearlyBought: 0, yearlySold: 3000, principal: 20000, totalGain: -1000 })
    };
    const investmentAssets = [
      { key: 'indexFunds', asset: indexFundsAsset, assetCountry: 'ie', label: 'Index Funds' },
      { key: 'shares', asset: sharesAsset, assetCountry: 'ie', label: 'Shares' }
    ];
    const attributionManager = new MockAttributionManager();
    attributionManager.record('incomesalaries', 'Salary IE', 40000, { sourceCountry: 'ie' });
    attributionManager.record('expenses', 'Living Costs', 20000);
    attributionManager.record('investmentincome:indexFunds', 'Index Funds Income', 1200, { sourceCountry: 'ie', investmentKey: 'indexFunds' });
    attributionManager.record('tax:incomeTax', 'Salary IE', 8000);
    const revenue = { taxTotals: { incomeTax: 15000, socialContrib: 5000, capitalGains: 2000 } };

    AttributionPopulator.populateDisplayAttributionFields(dataRow, investmentAssets, { indexFunds: 1200 }, attributionManager, revenue, 'ie');

    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'IncomeSalaries', 'Salary IE'), 40000, 0.01)) {
      errors.push('Expected IncomeSalaries display attribution for Salary IE');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Expenses', 'Living Costs'), 20000, 0.01)) {
      errors.push('Expected Expenses display attribution for Living Costs');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Income__indexFunds', 'Index Funds Income'), 1200, 0.01)) {
      errors.push('Expected exact Income__indexFunds display attribution');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Capital__indexFunds', 'Bought'), 10000, 0.01)) {
      errors.push('Expected Capital__indexFunds Bought = 10000');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Capital__indexFunds', 'Sold'), 2000, 0.01)) {
      errors.push('Expected Capital__indexFunds Sold = 2000');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Capital__indexFunds', 'Principal'), 50000, 0.01)) {
      errors.push('Expected Capital__indexFunds Principal = 50000');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Capital__indexFunds', 'P/L'), 5000, 0.01)) {
      errors.push('Expected Capital__indexFunds P/L = 5000');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Capital__shares', 'Sold'), 3000, 0.01)) {
      errors.push('Expected Capital__shares Sold = 3000');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Capital__shares', 'Principal'), 20000, 0.01)) {
      errors.push('Expected Capital__shares Principal = 20000');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Capital__shares', 'P/L'), -1000, 0.01)) {
      errors.push('Expected Capital__shares P/L = -1000');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Tax__incomeTax', 'Salary IE'), 8000, 0.01)) {
      errors.push('Expected Tax__incomeTax Salary IE = 8000');
    }

    if (!withinTolerance(dataRow.taxByKey.incomeTax, 15000, 0.01)) {
      errors.push("Expected taxByKey.incomeTax = 15000, got " + dataRow.taxByKey.incomeTax);
    }
    if (!withinTolerance(dataRow.taxByKey.socialContrib, 5000, 0.01)) {
      errors.push("Expected taxByKey.socialContrib = 5000, got " + dataRow.taxByKey.socialContrib);
    }
    if (!withinTolerance(dataRow.taxByKey.capitalGains, 2000, 0.01)) {
      errors.push("Expected taxByKey.capitalGains = 2000, got " + dataRow.taxByKey.capitalGains);
    }
  }

  // Test Case 2: Foreign mapped and source-only taxes stay isolated by exact display column.
  {
    const dataRow = { displayAttributions: {}, taxByKey: {} };
    const attributionManager = new MockAttributionManager();
    attributionManager.record('tax:incomeTax:ar', 'Salary Income Tax', 55, { taxCountry: 'ar' });
    attributionManager.record('tax:prsi:ie', 'Salary PRSI', 40, { taxCountry: 'ie' });
    attributionManager.record('tax:usc:ie', 'Salary USC', 30, { taxCountry: 'ie' });
    const revenue = { taxTotals: { 'incomeTax:ar': 55, 'prsi:ie': 40, 'usc:ie': 30 } };

    AttributionPopulator.populateDisplayAttributionFields(dataRow, [], {}, attributionManager, revenue, 'ie');

    if (!withinTolerance(getDisplayAmountByMeta(dataRow, 'Tax__incomeTax:ar', function (item) {
      return item.label === 'Salary Income Tax' && String(item.taxCountry || '').toLowerCase() === 'ar';
    }), 55, 0.01)) {
      errors.push('Expected foreign income tax to stay isolated under Tax__incomeTax:ar without ruleset mapping');
    }
    if (!withinTolerance(Object.keys(dataRow.displayAttributions || {}).reduce(function (total, columnKey) {
      if (columnKey.indexOf('Tax__') !== 0) return total;
      return total + getDisplayAmountByMeta(dataRow, columnKey, function (item) {
        return item.label === 'Salary PRSI' && String(item.taxCountry || '').toLowerCase() === 'ie';
      });
    }, 0), 40, 0.01)) {
      errors.push('Expected PRSI display attribution to preserve label/taxCountry regardless of mapped column key');
    }
    if (!withinTolerance(Object.keys(dataRow.displayAttributions || {}).reduce(function (total, columnKey) {
      if (columnKey.indexOf('Tax__') !== 0) return total;
      return total + getDisplayAmountByMeta(dataRow, columnKey, function (item) {
        return item.label === 'Salary USC' && String(item.taxCountry || '').toLowerCase() === 'ie';
      });
    }, 0), 30, 0.01)) {
      errors.push('Expected USC display attribution to preserve label/taxCountry regardless of mapped column key');
    }
  }

  // Test Case 3: Capital gains tooltip synthesis lives in the display builder.
  {
    const attributionManager = new MockAttributionManager();
    const dataRow = { displayAttributions: {}, taxByKey: {} };
    attributionManager.record('capitalgains', 'Index Funds Sale', 9050.143699927663, { sourceCountry: 'ie', investmentKey: 'indexFunds_ie' });
    attributionManager.record('capitalgains', 'Shares Sale', 2565.030918146188, { sourceCountry: 'ie', investmentKey: 'shares_ie' });
    attributionManager.record('tax:capitalGainsPreRelief', 'Index Funds Sale', 3439.054605972512, { sourceCountry: 'ie', investmentKey: 'indexFunds_ie' });
    attributionManager.record('tax:capitalGainsPreRelief', 'Shares Sale', 846.4602029882421, { sourceCountry: 'ie', investmentKey: 'shares_ie' });
    attributionManager.record('tax:capitalGains', 'Index Funds Sale', 3439.054605972512, { sourceCountry: 'ie', investmentKey: 'indexFunds_ie' });
    attributionManager.record('tax:capitalGains', 'Shares Sale', 360.60843844911216, { sourceCountry: 'ie', investmentKey: 'shares_ie' });
    attributionManager.record('tax:capitalGains', 'CGT Relief', -485.85176453913004, { taxCountry: 'ie' });
    const revenue = { taxTotals: { capitalGains: 3799.6630444216244 } };

    AttributionPopulator.populateDisplayAttributionFields(dataRow, [], {}, attributionManager, revenue, 'ie');

    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Tax__capitalGains', 'Index Funds Gains'), 9050.143699927663, 0.01)) {
      errors.push('Expected Tax__capitalGains to include Index Funds Gains');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Tax__capitalGains', 'Index Funds Tax'), 3439.054605972512, 0.01)) {
      errors.push('Expected Tax__capitalGains to include Index Funds Tax');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Tax__capitalGains', 'Shares Gains'), 2565.030918146188, 0.01)) {
      errors.push('Expected Tax__capitalGains to include Shares Gains');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Tax__capitalGains', 'Shares Tax'), 846.4602029882421, 0.01)) {
      errors.push('Expected Tax__capitalGains to include Shares Tax');
    }
    if (!withinTolerance(getDisplayAmountByLabel(dataRow, 'Tax__capitalGains', 'CGT Relief'), -485.85176453913004, 0.01)) {
      errors.push('Expected Tax__capitalGains to include CGT Relief');
    }
  }

  return errors;
}

async function runReferenceRegressionTest() {
  const errors = [];

  try {
    const parsed = parseReferenceCsvScenario(REFERENCE_PATH);
    parsed.parameters.relocationEnabled = parsed.parameters.relocationEnabled !== false;

    const framework = new TestFramework();
    if (!framework.loadScenario({
      name: 'ReferenceAttributionRegression',
      description: 'reference.csv attribution and tax breakdown regression',
      scenario: { parameters: parsed.parameters, events: parsed.events },
      assertions: []
    })) {
      return ['Failed to load reference scenario'];
    }

    installTestTaxRules(framework, {
      ie: deepClone(IE_RULES),
      ar: deepClone(AR_RULES)
    });

    const results = await framework.runSimulation();
    if (!results || !Array.isArray(results.dataSheet)) {
      return ['reference scenario failed to run'];
    }

    const rows = filterRows(results.dataSheet);
    if (!rows.length) {
      return ['reference scenario produced no rows'];
    }

    const keyAges = [40, 65, 80];
    for (const age of keyAges) {
      const row = findRow(rows, age);
      if (!row) {
        errors.push(`Missing row for age ${age}`);
        continue;
      }
      if (!row.displayAttributions || typeof row.displayAttributions !== 'object') {
        errors.push(`Age ${age}: displayAttributions is missing or invalid`);
      }
      if (!row.taxByKey || typeof row.taxByKey !== 'object') {
        errors.push(`Age ${age}: taxByKey is missing or invalid`);
      }
      if (age === 40 || age === 65 || age === 80) {
        const fundsPrincipal = getDisplayAmountByLabel(row, 'Capital__indexFunds_ie', 'Principal');
        const sharesPrincipal = getDisplayAmountByLabel(row, 'Capital__shares_ie', 'Principal');
        if (!Number.isFinite(fundsPrincipal)) {
          errors.push(`Age ${age}: Capital__indexFunds_ie Principal is not finite`);
        }
        if (!Number.isFinite(sharesPrincipal)) {
          errors.push(`Age ${age}: Capital__shares_ie Principal is not finite`);
        }
      }
    }

    const demoParsed = parseReferenceCsvScenario(DEMO_PATH);
    demoParsed.parameters.relocationEnabled = demoParsed.parameters.relocationEnabled !== false;

    const demoFramework = new TestFramework();
    if (!demoFramework.loadScenario({
      name: 'DemoDisplayAttributionRegression',
      description: 'demo.csv exact-key display attribution regression',
      scenario: { parameters: demoParsed.parameters, events: demoParsed.events },
      assertions: []
    })) {
      return ['Failed to load demo scenario'];
    }

    installTestTaxRules(demoFramework, {
      ie: deepClone(IE_RULES),
      ar: deepClone(AR_RULES)
    });

    const demoResults = await demoFramework.runSimulation();
    if (!demoResults || !Array.isArray(demoResults.dataSheet)) {
      return ['demo scenario failed to run'];
    }

    const demoRows = filterRows(demoResults.dataSheet);
    [35, 65, 66].forEach((age) => {
      const row = findRow(demoRows, age);
      if (!row) {
        errors.push(`Demo age ${age}: missing row`);
        return;
      }
      const investmentIncomeByKey = row.investmentIncomeByKey || {};
      const incomeKeys = Object.keys(investmentIncomeByKey).filter((key) => {
        return typeof investmentIncomeByKey[key] === 'number' && investmentIncomeByKey[key] !== 0;
      });
      if (!incomeKeys.length) {
        errors.push(`Demo age ${age}: expected at least one dynamic investment income value`);
        return;
      }
      incomeKeys.forEach((key) => {
        if (!getDisplayItems(row, 'Income__' + key).length) {
          errors.push(`Demo age ${age}: missing exact Income__${key} display attribution`);
        }
      });
      if (age >= 65 && getDisplayItems(row, 'IncomeSalaries').length) {
        errors.push(`Demo age ${age}: dynamic investment income should not depend on salary display attribution presence`);
      }
    });

  } catch (error) {
    errors.push(`Regression test error: ${error.message}`);
    if (error.stack) {
      errors.push(`Stack: ${error.stack}`);
    }
  }

  return errors;
}

module.exports = {
  isCustomTest: true,
  runCustomTest: async function() {
    const errors = runTest();
    const regressionErrors = await runReferenceRegressionTest();
    errors.push(...regressionErrors);

    return {
      success: errors.length === 0,
      errors: errors
    };
  }
};
