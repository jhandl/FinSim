#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TestFramework } = require('../src/core/TestFramework.js');

const UI_TO_SCENARIO_KEY_MAP = {
  StartingAge: 'startingAge',
  TargetAge: 'targetAge',
  RetirementAge: 'retirementAge',
  InitialSavings: 'initialSavings',
  InitialPension: 'initialPension',
  InitialPensionP2: 'initialPensionP2',
  EmergencyStash: 'emergencyStash',
  MarriageYear: 'marriageYear',
  YoungestChildBorn: 'youngestChildBorn',
  OldestChildBorn: 'oldestChildBorn',
  PensionGrowthRate: 'growthRatePension',
  PensionGrowthStdDev: 'growthDevPension',
  FundsGrowthRate: 'growthRateFunds',
  FundsGrowthStdDev: 'growthDevFunds',
  SharesGrowthRate: 'growthRateShares',
  SharesGrowthStdDev: 'growthDevShares',
  Inflation: 'inflation',
  Priority_cash: 'priorityCash',
  Priority_pension: 'priorityPension',
  Priority_indexFunds: 'priorityFunds',
  Priority_shares: 'priorityShares',
  P2StartingAge: 'p2StartingAge',
  P2RetirementAge: 'p2RetirementAge',
  simulation_mode: 'simulation_mode',
  economy_mode: 'economy_mode',
  StartCountry: 'StartCountry'
};

function parseArgs(argv) {
  const args = {
    scenario: path.resolve(process.cwd(), 'src/frontend/web/assets/demo.csv'),
    startRuns: 64,
    maxRuns: 10000,
    repetitionsInitial: 4,
    repetitionsFinal: 30,
    targetStdDev: 1,
    growthFactor: 2
  };

  let repetitionsAlias = null;
  let hasExplicitInitial = false;
  let hasExplicitFinal = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--scenario' && next) {
      args.scenario = path.resolve(process.cwd(), next);
      i++;
      continue;
    }
    if (token === '--start-runs' && next) {
      args.startRuns = parseInt(next, 10);
      i++;
      continue;
    }
    if (token === '--max-runs' && next) {
      args.maxRuns = parseInt(next, 10);
      i++;
      continue;
    }
    if (token === '--repetitions' && next) {
      repetitionsAlias = parseInt(next, 10);
      i++;
      continue;
    }
    if (token === '--repetitions-initial' && next) {
      args.repetitionsInitial = parseInt(next, 10);
      hasExplicitInitial = true;
      i++;
      continue;
    }
    if (token === '--repetitions-final' && next) {
      args.repetitionsFinal = parseInt(next, 10);
      hasExplicitFinal = true;
      i++;
      continue;
    }
    if (token === '--target-std' && next) {
      args.targetStdDev = parseFloat(next);
      i++;
      continue;
    }
    if (token === '--growth-factor' && next) {
      args.growthFactor = parseFloat(next);
      i++;
      continue;
    }
    if (token === '--help' || token === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  if (repetitionsAlias !== null) {
    if (!hasExplicitFinal) args.repetitionsFinal = repetitionsAlias;
    if (!hasExplicitInitial) args.repetitionsInitial = Math.max(2, Math.floor(repetitionsAlias / 3));
  }

  if (!Number.isFinite(args.startRuns) || args.startRuns < 1) throw new Error('start-runs must be >= 1');
  if (!Number.isFinite(args.maxRuns) || args.maxRuns < args.startRuns) throw new Error('max-runs must be >= start-runs');
  if (!Number.isFinite(args.repetitionsInitial) || args.repetitionsInitial < 2) throw new Error('repetitions-initial must be >= 2');
  if (!Number.isFinite(args.repetitionsFinal) || args.repetitionsFinal < args.repetitionsInitial) {
    throw new Error('repetitions-final must be >= repetitions-initial');
  }
  if (!Number.isFinite(args.targetStdDev) || args.targetStdDev <= 0) throw new Error('target-std must be > 0');
  if (!Number.isFinite(args.growthFactor) || args.growthFactor <= 1) throw new Error('growth-factor must be > 1');

  args.targetStdDev = args.targetStdDev / 100;

  return args;
}

function printUsage() {
  console.log('Usage: node scripts/find-montecarlo-min-runs.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --scenario <path>             CSV scenario path (default: src/frontend/web/assets/demo.csv)');
  console.log('  --start-runs <int>            Initial Monte Carlo run count X (default: 64)');
  console.log('  --max-runs <int>              Maximum X to consider (default: 10000)');
  console.log('  --repetitions <int>           Compatibility alias (sets final reps, initial~final/3)');
  console.log('  --repetitions-initial <int>   Fast coarse repetitions per X (default: 4)');
  console.log('  --repetitions-final <int>     Precision repetitions near answer (default: 30)');
  console.log('  --target-std <float>          Target std dev in percentage points (default: 1.0)');
  console.log('  --growth-factor <float>       Multiplicative growth during bracketing (default: 2.0)');
}

function parseOptionalNumeric(value, treatPercentAsFraction) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const percent = trimmed.endsWith('%');
  const numericPortion = percent ? trimmed.slice(0, -1) : trimmed;
  const num = parseFloat(numericPortion);
  if (isNaN(num)) return null;
  if (percent && treatPercentAsFraction) return num / 100;
  return num;
}

function parseMeta(metaString) {
  const meta = {};
  if (!metaString || typeof metaString !== 'string') return meta;
  const pairs = metaString.split(';').filter(Boolean);
  for (let i = 0; i < pairs.length; i++) {
    const equalsIndex = pairs[i].indexOf('=');
    if (equalsIndex <= 0) continue;
    const key = pairs[i].substring(0, equalsIndex);
    const value = decodeURIComponent(pairs[i].substring(equalsIndex + 1) || '');
    meta[key] = value;
  }
  if (meta.cur && !meta.currency) meta.currency = String(meta.cur).toUpperCase();
  if (meta.lc && !meta.linkedCountry) meta.linkedCountry = String(meta.lc).toLowerCase();
  if (meta.lei && !meta.linkedEventId) meta.linkedEventId = meta.lei;
  if (meta.ro && !meta.resolutionOverride) meta.resolutionOverride = meta.ro;
  return meta;
}

function parseEventRows(eventRows) {
  const events = [];
  const relocations = [];
  for (let i = 0; i < eventRows.length; i++) {
    const row = eventRows[i] || [];
    const type = String(row[0] || '').trim();
    if (!type) continue;
    const name = String(row[1] || '').trim();
    const amountRaw = parseOptionalNumeric(row[2], false);
    const fromAgeRaw = parseOptionalNumeric(row[3], false);
    const toAgeRaw = parseOptionalNumeric(row[4], false);
    const rateRaw = parseOptionalNumeric(row[5], true);
    const matchRaw = parseOptionalNumeric(row[6], true);
    const meta = parseMeta(row[7] || '');

    const event = {
      type,
      id: name || type,
      name: name || '',
      amount: amountRaw === null ? 0 : amountRaw,
      fromAge: fromAgeRaw === null ? '' : Math.round(fromAgeRaw),
      toAge: toAgeRaw === null ? '' : Math.round(toAgeRaw),
      rate: rateRaw === null ? undefined : rateRaw,
      match: matchRaw === null ? undefined : matchRaw
    };

    const metaKeys = Object.keys(meta);
    for (let mk = 0; mk < metaKeys.length; mk++) {
      const key = metaKeys[mk];
      if (meta[key] === '') continue;
      event[key] = meta[key];
    }

    events.push(event);
    if (type === 'MV') {
      const code = String(name || '').trim().toLowerCase();
      if (code) relocations.push({ age: event.fromAge, code: code });
    }
  }
  return { events, relocations };
}

function normalizeScalarValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = String(value).trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  if (lower === 'yes') return 'Yes';
  if (lower === 'no') return 'No';
  if (lower === 'match') return 'Match';
  if (text.endsWith('%')) {
    const pct = parseFloat(text.slice(0, -1));
    if (isFinite(pct)) return pct / 100;
    return text;
  }
  const numeric = Number(text);
  if (!isNaN(numeric)) return numeric;
  return text;
}

function normalizeDeserializedParameters(rawParams) {
  const normalized = {};
  const keys = Object.keys(rawParams || {});
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = normalizeScalarValue(rawParams[key]);
    normalized[key] = value;
    const mapped = UI_TO_SCENARIO_KEY_MAP[key];
    if (mapped && mapped !== key) normalized[mapped] = value;
  }
  if (typeof normalized.StartCountry === 'string') normalized.StartCountry = normalized.StartCountry.trim().toLowerCase();

  const sc = String(normalized.StartCountry || '').toLowerCase();
  if (sc) {
    const p1ContribKey = 'P1PensionContrib_' + sc;
    const p2ContribKey = 'P2PensionContrib_' + sc;
    const pensionCappedKey = 'PensionCapped_' + sc;
    const statePensionKey = 'StatePension_' + sc;
    const p2StatePensionKey = 'P2StatePension_' + sc;
    const personalCreditKey = 'TaxCredit_personal_' + sc;
    const pensionGrowthKey = 'PensionGrowth_' + sc;
    const pensionVolatilityKey = 'PensionVolatility_' + sc;
    const inflationKey = 'Inflation_' + sc;
    const initialFundsKey = 'InitialCapital_indexFunds_' + sc;
    const initialSharesKey = 'InitialCapital_shares_' + sc;
    const allocFundsKey = 'InvestmentAllocation_' + sc + '_indexFunds';
    const allocSharesKey = 'InvestmentAllocation_' + sc + '_shares';
    const localSharesGrowthKey = 'LocalAssetGrowth_' + sc + '_shares';
    const localSharesVolKey = 'LocalAssetVolatility_' + sc + '_shares';

    if (normalized.pensionPercentage === undefined && normalized[p1ContribKey] !== undefined) normalized.pensionPercentage = normalized[p1ContribKey];
    if (normalized.pensionPercentageP2 === undefined && normalized[p2ContribKey] !== undefined) normalized.pensionPercentageP2 = normalized[p2ContribKey];
    if (normalized.pensionCapped === undefined && normalized[pensionCappedKey] !== undefined) normalized.pensionCapped = normalized[pensionCappedKey];
    if (normalized.statePensionWeekly === undefined && normalized[statePensionKey] !== undefined) normalized.statePensionWeekly = normalized[statePensionKey];
    if (normalized.p2StatePensionWeekly === undefined && normalized[p2StatePensionKey] !== undefined) normalized.p2StatePensionWeekly = normalized[p2StatePensionKey];
    if (normalized.personalTaxCredit === undefined && normalized[personalCreditKey] !== undefined) normalized.personalTaxCredit = normalized[personalCreditKey];
    if (normalized.growthRatePension === undefined && normalized[pensionGrowthKey] !== undefined) normalized.growthRatePension = normalized[pensionGrowthKey];
    if (normalized.growthDevPension === undefined && normalized[pensionVolatilityKey] !== undefined) normalized.growthDevPension = normalized[pensionVolatilityKey];
    if (normalized.inflation === undefined && normalized[inflationKey] !== undefined) normalized.inflation = normalized[inflationKey];
    if (normalized.initialFunds === undefined && normalized[initialFundsKey] !== undefined) normalized.initialFunds = normalized[initialFundsKey];
    if (normalized.initialShares === undefined && normalized[initialSharesKey] !== undefined) normalized.initialShares = normalized[initialSharesKey];
    if (normalized.FundsAllocation === undefined && normalized[allocFundsKey] !== undefined) normalized.FundsAllocation = normalized[allocFundsKey];
    if (normalized.SharesAllocation === undefined && normalized[allocSharesKey] !== undefined) normalized.SharesAllocation = normalized[allocSharesKey];
    if (normalized.growthRateShares === undefined && normalized[localSharesGrowthKey] !== undefined) normalized.growthRateShares = normalized[localSharesGrowthKey];
    if (normalized.growthDevShares === undefined && normalized[localSharesVolKey] !== undefined) normalized.growthDevShares = normalized[localSharesVolKey];
  }

  if (normalized.growthRateFunds === undefined && normalized.GlobalAssetGrowth_globalEquity !== undefined) {
    normalized.growthRateFunds = normalized.GlobalAssetGrowth_globalEquity;
  }
  if (normalized.growthDevFunds === undefined && normalized.GlobalAssetVolatility_globalEquity !== undefined) {
    normalized.growthDevFunds = normalized.GlobalAssetVolatility_globalEquity;
  }

  if (!normalized.economyMode && normalized.economy_mode) normalized.economyMode = normalized.economy_mode;
  return normalized;
}

async function parseScenarioCsv(filePath) {
  const framework = new TestFramework();
  if (!framework.loadCoreModules()) throw new Error('Failed to load core modules');
  framework.ensureVMUIManagerMocks(null, null);

  const initPromise = vm.runInContext('Config.initialize(WebUI.getInstance())', framework.simulationContext);
  if (initPromise && typeof initPromise.then === 'function') await initPromise;

  const csvContent = fs.readFileSync(filePath, 'utf8');
  framework.simulationContext.__csvContent = csvContent;
  vm.runInContext(`
    params = {};
    globalThis.__csvParams = {};
    var __csvUi = {
      setValue: function(key, value) { globalThis.__csvParams[key] = value; },
      getValue: function(key) {
        return Object.prototype.hasOwnProperty.call(globalThis.__csvParams, key)
          ? globalThis.__csvParams[key]
          : '';
      },
      ensureParameterInput: function() {},
      setWarning: function() {},
      clearAllWarnings: function() {}
    };
    globalThis.__csvEventRows = deserializeSimulation(globalThis.__csvContent, __csvUi);
  `, framework.simulationContext);

  const parsed = vm.runInContext('({ parameters: globalThis.__csvParams, eventRows: globalThis.__csvEventRows })', framework.simulationContext);
  if (!parsed || !parsed.parameters || !Array.isArray(parsed.eventRows)) {
    throw new Error('Failed to deserialize scenario from CSV');
  }

  const parameters = normalizeDeserializedParameters(parsed.parameters);
  const parsedEvents = parseEventRows(parsed.eventRows);
  if (!parameters.StartCountry) parameters.StartCountry = 'ie';
  if (!parameters.simulation_mode) parameters.simulation_mode = parameters.p2StartingAge ? 'couple' : 'single';
  if (parsedEvents.relocations.length && !parameters.relocationEnabled) parameters.relocationEnabled = true;

  return { parameters, events: parsedEvents.events, relocations: parsedEvents.relocations };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function toNumericFraction(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number' && isFinite(value)) return value;
  const text = String(value).trim();
  if (!text) return 0;
  const percent = text.endsWith('%');
  const parsed = parseFloat(percent ? text.slice(0, -1) : text);
  if (!isFinite(parsed)) return 0;
  return percent ? (parsed / 100) : parsed;
}

function hasAnyVolatility(params) {
  if (toNumericFraction(params.growthDevPension) > 0) return true;
  if (toNumericFraction(params.growthDevFunds) > 0) return true;
  if (toNumericFraction(params.growthDevShares) > 0) return true;
  const volMap = params.investmentVolatilitiesByKey || {};
  const volKeys = Object.keys(volMap);
  for (let i = 0; i < volKeys.length; i++) {
    if (toNumericFraction(volMap[volKeys[i]]) > 0) return true;
  }
  const keys = Object.keys(params);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const keyText = String(key);
    if (keyText.indexOf('GlobalAssetVolatility_') === 0 && toNumericFraction(params[key]) > 0) return true;
    if (keyText.indexOf('LocalAssetVolatility_') === 0 && toNumericFraction(params[key]) > 0) return true;
    if (keyText.indexOf('PensionVolatility_') === 0 && toNumericFraction(params[key]) > 0) return true;
  }
  return false;
}

function mean(values) {
  let total = 0;
  for (let i = 0; i < values.length; i++) total += values[i];
  return total / values.length;
}

function sampleStdDev(values) {
  if (values.length <= 1) return 0;
  const m = mean(values);
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

function percentile(values, p) {
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const w = idx - lower;
  return sorted[lower] * (1 - w) + sorted[upper] * w;
}

function formatPct(value) {
  return (value * 100).toFixed(2) + '%';
}

function isPassing(stats, targetStdDev) {
  return stats.stdDevSuccessRate <= targetStdDev;
}

function createAccumulator(monteCarloRuns) {
  return {
    monteCarloRuns,
    rates: [],
    timings: [],
    runsUsedTotal: 0
  };
}

function summarizeAccumulator(acc) {
  const avg = mean(acc.rates);
  const std = sampleStdDev(acc.rates);
  const p05 = percentile(acc.rates, 5);
  const p95 = percentile(acc.rates, 95);
  const avgMs = mean(acc.timings);
  const degenerate = acc.rates.every(v => v === acc.rates[0]);
  return {
    monteCarloRuns: acc.monteCarloRuns,
    repetitions: acc.rates.length,
    meanSuccessRate: avg,
    stdDevSuccessRate: std,
    p05,
    p95,
    avgExecutionMs: avgMs,
    avgRunsUsed: acc.runsUsedTotal / acc.rates.length,
    degenerate,
    rates: acc.rates.slice()
  };
}

async function runSingleEstimate(baseScenario, monteCarloRuns) {
  const framework = new TestFramework();
  framework.loadCoreModules();

  const originalEnsure = framework.ensureVMUIManagerMocks.bind(framework);
  framework.ensureVMUIManagerMocks = function(params, events) {
    originalEnsure(params, events);
    vm.runInContext(`
      globalThis.__mcStatus = { successes: null, runs: null };
      MockUIManager.prototype.updateStatusCell = function(successes, runs) {
        globalThis.__mcStatus = { successes: Number(successes), runs: Number(runs) };
      };
    `, this.simulationContext);
  };

  const scenario = deepClone(baseScenario);
  scenario.parameters.economy_mode = 'montecarlo';
  scenario.parameters.economyMode = 'montecarlo';
  scenario.parameters.monteCarloRuns = monteCarloRuns;

  if (!framework.loadScenario({
    name: 'MonteCarloRunCountSweep',
    description: 'Run-count stability analysis',
    scenario: scenario,
    assertions: []
  })) {
    throw new Error('Failed to load scenario into TestFramework');
  }

  const result = await framework.runSimulation();
  if (!result || (result.success === false && !result.dataSheet)) {
    throw new Error('Simulation execution failed');
  }

  const status = vm.runInContext('globalThis.__mcStatus', framework.simulationContext);
  const successes = status && Number.isFinite(status.successes) ? status.successes : null;
  const runs = status && Number.isFinite(status.runs) ? status.runs : null;
  if (successes === null || runs === null || runs <= 0) {
    throw new Error('Failed to capture Monte Carlo success count from updateStatusCell');
  }

  return {
    successRate: successes / runs,
    successes,
    runs,
    executionTimeMs: result.executionTime || 0
  };
}

async function ensureEvaluated(cache, baseScenario, monteCarloRuns, repetitions) {
  if (monteCarloRuns < 1) throw new Error('Monte Carlo runs must be >= 1');
  let acc = cache[monteCarloRuns];
  if (!acc) {
    acc = createAccumulator(monteCarloRuns);
    cache[monteCarloRuns] = acc;
  }

  let added = 0;
  while (acc.rates.length < repetitions) {
    const measurement = await runSingleEstimate(baseScenario, monteCarloRuns);
    acc.rates.push(measurement.successRate);
    acc.timings.push(measurement.executionTimeMs);
    acc.runsUsedTotal += measurement.runs;
    added++;
  }

  return {
    stats: summarizeAccumulator(acc),
    added
  };
}

function repetitionsForInterval(options, currentWidth, initialWidth) {
  if (options.repetitionsFinal === options.repetitionsInitial) return options.repetitionsFinal;
  if (currentWidth <= 1) return options.repetitionsFinal;

  const denominator = Math.max(1, initialWidth - 1);
  const rawProgress = 1 - ((currentWidth - 1) / denominator);
  const progress = Math.max(0, Math.min(1, rawProgress));
  const curved = Math.pow(progress, 1.5);
  const value = options.repetitionsInitial + ((options.repetitionsFinal - options.repetitionsInitial) * curved);
  return Math.max(options.repetitionsInitial, Math.min(options.repetitionsFinal, Math.round(value)));
}

async function searchMinimumRuns(baseScenario, options) {
  const cache = {};

  async function evaluate(x, repetitions, phase) {
    const { stats, added } = await ensureEvaluated(cache, baseScenario, x, repetitions);
    const stdPp = stats.stdDevSuccessRate * 100;
    console.log(
      [
        `phase=${phase}`,
        `X=${x}`,
        `reps=${stats.repetitions}`,
        `new=${added}`,
        `mean=${formatPct(stats.meanSuccessRate)}`,
        `std=${stdPp.toFixed(3)}pp`,
        `p05=${formatPct(stats.p05)}`,
        `p95=${formatPct(stats.p95)}`,
        `degenerate=${stats.degenerate ? 'yes' : 'no'}`,
        `avgTime=${stats.avgExecutionMs.toFixed(1)}ms`
      ].join(' | ')
    );
    return stats;
  }

  const target = options.targetStdDev;
  let lowFail = 0;
  let highPass = null;

  let x = options.startRuns;
  let stats = await evaluate(x, options.repetitionsInitial, 'coarse');
  if (isPassing(stats, target)) {
    highPass = x;
  } else {
    lowFail = x;
    while (x < options.maxRuns) {
      const next = Math.min(options.maxRuns, Math.max(x + 1, Math.ceil(x * options.growthFactor)));
      x = next;
      stats = await evaluate(x, options.repetitionsInitial, 'coarse');
      if (isPassing(stats, target)) {
        highPass = x;
        break;
      }
      lowFail = x;
    }
  }

  if (highPass === null) {
    return { recommendedRuns: null, statsByRuns: cache, bounds: { low: lowFail, high: null } };
  }

  const binaryInitialWidth = highPass - lowFail;
  while ((highPass - lowFail) > 1) {
    const width = highPass - lowFail;
    const requiredReps = repetitionsForInterval(options, width, binaryInitialWidth);
    const mid = Math.floor((lowFail + highPass) / 2);
    const midStats = await evaluate(mid, requiredReps, 'binary');
    if (isPassing(midStats, target)) {
      highPass = mid;
    } else {
      lowFail = mid;
    }
  }

  let candidate = highPass;
  let candidateStats = await evaluate(candidate, options.repetitionsFinal, 'confirm');

  if (!isPassing(candidateStats, target)) {
    let low = candidate;
    let high = null;
    let probe = candidate;

    while (probe < options.maxRuns) {
      const next = Math.min(options.maxRuns, Math.max(probe + 1, Math.ceil(probe * options.growthFactor)));
      probe = next;
      const probeStats = await evaluate(probe, options.repetitionsFinal, 'confirm-up');
      if (isPassing(probeStats, target)) {
        high = probe;
        break;
      }
      low = probe;
    }

    if (high === null) {
      return { recommendedRuns: null, statsByRuns: cache, bounds: { low: low, high: null } };
    }

    while ((high - low) > 1) {
      const mid = Math.floor((low + high) / 2);
      const midStats = await evaluate(mid, options.repetitionsFinal, 'confirm-bin-up');
      if (isPassing(midStats, target)) high = mid;
      else low = mid;
    }

    return { recommendedRuns: high, statsByRuns: cache, bounds: { low: low, high: high } };
  }

  let finalLow = lowFail;
  if (finalLow > 0) {
    const lowStats = await evaluate(finalLow, options.repetitionsFinal, 'confirm-low');
    if (isPassing(lowStats, target)) {
      let probe = finalLow;
      let failFound = false;
      while (probe > 1) {
        probe = Math.floor(probe / 2);
        const probeStats = await evaluate(probe, options.repetitionsFinal, 'confirm-down');
        if (!isPassing(probeStats, target)) {
          finalLow = probe;
          failFound = true;
          break;
        }
      }
      if (!failFound) finalLow = 0;
    }
  }

  let finalHigh = candidate;
  while ((finalHigh - finalLow) > 1) {
    const mid = Math.floor((finalLow + finalHigh) / 2);
    const midStats = await evaluate(mid, options.repetitionsFinal, 'confirm-bin-down');
    if (isPassing(midStats, target)) finalHigh = mid;
    else finalLow = mid;
  }

  return { recommendedRuns: finalHigh, statsByRuns: cache, bounds: { low: finalLow, high: finalHigh } };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const parsed = await parseScenarioCsv(options.scenario);

  if (!hasAnyVolatility(parsed.parameters)) {
    throw new Error('Scenario has no volatility inputs, so Monte Carlo mode cannot be activated.');
  }

  const baseScenario = {
    parameters: parsed.parameters,
    events: parsed.events
  };

  console.log('Monte Carlo run-count stability sweep');
  console.log(`scenario=${options.scenario}`);
  console.log(
    `repetitionsInitial=${options.repetitionsInitial} | repetitionsFinal=${options.repetitionsFinal} | targetStd=${(options.targetStdDev * 100).toFixed(3)}pp`
  );
  console.log(`startRuns=${options.startRuns} | maxRuns=${options.maxRuns} | growthFactor=${options.growthFactor}`);
  console.log('');

  const result = await searchMinimumRuns(baseScenario, options);
  console.log('');
  if (result.recommendedRuns === null) {
    console.log(`No X <= ${options.maxRuns} reached target std <= ${(options.targetStdDev * 100).toFixed(3)}pp.`);
    process.exitCode = 2;
    return;
  }

  const bestStats = summarizeAccumulator(result.statsByRuns[result.recommendedRuns]);
  console.log(`Recommended minimum X: ${result.recommendedRuns}`);
  console.log(
    [
      `mean=${formatPct(bestStats.meanSuccessRate)}`,
      `std=${(bestStats.stdDevSuccessRate * 100).toFixed(3)}pp`,
      `p05=${formatPct(bestStats.p05)}`,
      `p95=${formatPct(bestStats.p95)}`,
      `repetitions=${bestStats.repetitions}`
    ].join(' | ')
  );
  if (bestStats.degenerate && (bestStats.meanSuccessRate === 0 || bestStats.meanSuccessRate === 1)) {
    console.log('Warning: success rate is degenerate (always 0% or 100%) in sampled repeats, so std-dev alone is not informative.');
  }
}

main().catch(err => {
  console.error('Error:', err && err.message ? err.message : err);
  process.exit(1);
});
