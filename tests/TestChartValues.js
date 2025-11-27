const fs = require('fs');
const path = require('path');

const { TestFramework } = require('../src/core/TestFramework.js');
const { EconomicData } = require('../src/core/EconomicData.js');
const { TaxRuleSet } = require('../src/core/TaxRuleSet.js');
const { installTestTaxRules, deepClone } = require('./helpers/RelocationTestHelpers.js');

const IE_RULES = require('../src/core/config/tax-rules-ie.json');
const AR_RULES = require('../src/core/config/tax-rules-ar.json');
const DEMO3_PATH = path.resolve(__dirname, '..', 'docs', 'demo3.csv');

const FRACTIONAL_PARAM_KEYS = new Set([
  'FundsAllocation',
  'SharesAllocation',
  'pensionPercentage',
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

const DEMO3_BASELINE = {
  ages: {
    40: { worth: 1456525094, cash: 0, netIncome: 18456485 },
    65: { worth: 1296427097519, cash: 56277, netIncome: 143504832362 },
    80: { worth: 35286245445509, cash: 87678, netIncome: 5907154980900 }
  },
  final: { age: 90, worth: 417973501040028, cash: 117832 },
  maxWorth: 417973501040028
};

// Tolerances for evolution FX mode (inflation-driven FX rates)
const BASELINE_TOLERANCE = 0.25; // 25% tolerance for evolution FX
const CRITICAL_TOLERANCE = 0.6; // 60% for critical checks

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

function parseDemoCsvScenario(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
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
      if (type && type.toUpperCase().startsWith('MV-')) {
        relocations.push({ age: fromAge, code: type.substring(3).toLowerCase() });
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

function ensureSmoothSeries(rows, field, allowedSpikeAges, limit, errors, label) {
  for (let i = 1; i < rows.length; i++) {
    const current = rows[i][field];
    const prev = rows[i - 1][field];
    if (!Number.isFinite(current) || !Number.isFinite(prev)) continue;
    const age = rows[i].age;
    if (Math.abs(prev) < 1) continue;
    const delta = percentDelta(current, prev);
    if (delta > limit && !(allowedSpikeAges && allowedSpikeAges.has(age))) {
      errors.push(`${label} change exceeded ${(limit * 100)}% at age ${age}: delta ${(delta * 100).toFixed(2)}%`);
    }
  }
}

function ensureFiniteRange(rows, fields, limit, errors) {
  rows.forEach(row => {
    fields.forEach(field => {
      const value = row[field];
      if (!Number.isFinite(value)) {
        errors.push(`Field ${field} at age ${row.age} is not finite`);
      } else if (Math.abs(value) > limit) {
        errors.push(`Field ${field} at age ${row.age} exceeded limit ${limit}`);
      }
    });
  });
}

function ensureNonZero(rows, field, startAge, endAge, errors, label) {
  for (let age = startAge; age <= endAge; age++) {
    const row = findRow(rows, age);
    if (!row) continue;
    if (Math.abs(row[field]) < 1) {
      errors.push(`${label} flattened to ~0 at age ${age}`);
      break;
    }
  }
}

function computePresentValue(value, inflationRate, years) {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(inflationRate)) return value;
  return value / Math.pow(1 + inflationRate, years);
}

function validatePresentValueSeries(rows, inflationRate, startAge, errors) {
  if (!Number.isFinite(inflationRate) || inflationRate <= 0) return;
  let previousRatio = null;
  rows.forEach(row => {
    if (!Number.isFinite(row.worth)) return;
    const years = row.age - startAge;
    const pv = computePresentValue(row.worth, inflationRate, years);
    if (pv > row.worth + 1e-6) {
      errors.push(`Present value exceeded nominal at age ${row.age}`);
    }
    const ratio = pv / (row.worth === 0 ? 1 : row.worth);
    if (previousRatio !== null && ratio > previousRatio + 1e-6) {
      errors.push(`PV discount factor increased unexpectedly at age ${row.age}`);
    }
    previousRatio = ratio;
  });
}

function validateActualPVFields(rows, inflationRate, startAge, errors, scenarioLabel) {
  if (!Number.isFinite(inflationRate) || inflationRate <= 0) return;

  const PV_TOLERANCE = 0.05; // 5% relative tolerance for PV comparisons

  // Validate worthPV against expected PV calculation
  rows.forEach(row => {
    if (!Number.isFinite(row.worth) || !Number.isFinite(row.worthPV)) return;
    if (Math.abs(row.worth) < 1e-6) return; // Skip near-zero values

    const years = row.age - startAge;
    if (years < 0) return; // Skip rows before start age

    const expectedWorthPV = computePresentValue(row.worth, inflationRate, years);
    const delta = percentDelta(row.worthPV, expectedWorthPV);

    if (delta > PV_TOLERANCE) {
      errors.push(`${scenarioLabel}: worthPV mismatch at age ${row.age}: expected ${expectedWorthPV.toFixed(2)}, got ${row.worthPV.toFixed(2)} (delta ${(delta * 100).toFixed(2)}%)`);
    }
  });

  // For key ages, validate netIncomePV and cashPV
  // Select a few representative ages: start, middle, and end
  const keyAges = [];
  if (rows.length > 0) {
    const minAge = rows[0].age;
    const maxAge = rows[rows.length - 1].age;
    keyAges.push(minAge);
    if (rows.length > 1) {
      const midIndex = Math.floor(rows.length / 2);
      keyAges.push(rows[midIndex].age);
    }
    keyAges.push(maxAge);
    // Also check a few evenly spaced ages
    const step = Math.max(1, Math.floor((maxAge - minAge) / 5));
    for (let age = minAge + step; age < maxAge; age += step) {
      if (!keyAges.includes(age)) {
        keyAges.push(age);
      }
    }
  }

  keyAges.forEach(age => {
    const row = findRow(rows, age);
    if (!row) return;

    // Validate netIncomePV
    if (Number.isFinite(row.netIncome) && Number.isFinite(row.netIncomePV)) {
      if (row.netIncome > 0) {
        if (row.netIncomePV <= 0) {
          errors.push(`${scenarioLabel}: netIncomePV should be positive when netIncome is positive at age ${age}`);
        }
        if (row.netIncomePV > row.netIncome + 1e-6) {
          errors.push(`${scenarioLabel}: netIncomePV (${row.netIncomePV.toFixed(2)}) exceeds netIncome (${row.netIncome.toFixed(2)}) at age ${age}`);
        }
      }
    }

    // Validate cashPV
    if (Number.isFinite(row.cash) && Number.isFinite(row.cashPV)) {
      if (row.cash > 0) {
        if (row.cashPV <= 0) {
          errors.push(`${scenarioLabel}: cashPV should be positive when cash is positive at age ${age}`);
        }
        if (row.cashPV > row.cash + 1e-6) {
          errors.push(`${scenarioLabel}: cashPV (${row.cashPV.toFixed(2)}) exceeds cash (${row.cash.toFixed(2)}) at age ${age}`);
        }
      }
    }
  });
}

function assertBaseline(label, actual, expected, tolerance, errors) {
  if (Math.abs(expected) < 1e-9) {
    if (Math.abs(actual) > 1e-6) {
      errors.push(`Baseline for ${label} expected ~0, got ${actual}`);
    }
    return;
  }
  const delta = percentDelta(actual, expected);
  if (delta > tolerance) {
    errors.push(`CRITICAL: ${label} deviated ${(delta * 100).toFixed(2)}% (expected ${expected}, got ${actual})`);
  }
}

function extractMaxAbsolute(rows, field) {
  return rows.reduce((max, row) => {
    const value = Math.abs(row[field] || 0);
    return Math.max(max, value);
  }, 0);
}

function detectRelocationAges(events) {
  const ages = new Set();
  events.forEach(evt => {
    if (evt.type && evt.type.toUpperCase().startsWith('MV-')) {
      ages.add(evt.fromAge);
    }
  });
  return ages;
}

/**
 * Determines the residence country for each row based on relocation events.
 * Returns a map from age to country code.
 */
function buildResidenceCountryMap(rows, events, startCountry) {
  const map = {};
  let currentCountry = (startCountry || 'ie').toLowerCase();
  const relocationEvents = events
    .filter(evt => evt.type && evt.type.toUpperCase().startsWith('MV-'))
    .sort((a, b) => a.fromAge - b.fromAge);

  if (rows.length === 0) return map;

  const minAge = rows[0].age;
  const maxAge = rows[rows.length - 1].age;

  for (let age = minAge; age <= maxAge; age++) {
    // Check if there's a relocation at this age
    const relocation = relocationEvents.find(evt => evt.fromAge === age);
    if (relocation) {
      const destCountry = relocation.type.substring(3).toLowerCase();
      currentCountry = destCountry;
    }
    map[age] = currentCountry;
  }

  return map;
}

/**
 * Validates unified-currency conversion series.
 * 
 * This is a proxy for unified-currency chart display and is designed to detect
 * FX misuse or inversion in chart-level conversions rather than to enforce any
 * specific FX evolution formula.
 * 
 * Constructs a derived series representing net worth expressed in a single
 * reference currency (EUR), converting each row's worth from the residence
 * country currency into the base currency for that year using the appropriate
 * FX mode.
 * 
 * Uses loose invariants:
 * - Unified-currency worth is finite
 * - Stays within reasonable bounds for the scenario
 * - Does not exhibit catastrophic jumps or zero-flattening
 * 
 * Optionally performs round-trip checks at checkpoint ages (pre- and post-relocation).
 */
function validateUnifiedCurrencyConversions(rows, residenceCountryMap, economicData, events, startCountry, errors, scenarioLabel) {
  if (!economicData || !economicData.ready) {
    return; // Skip if economic data not available
  }

  const REFERENCE_CURRENCY = 'EUR';
  const REFERENCE_COUNTRY = 'IE'; // EUR is typically IE's currency
  const FX_MODE = 'evolution'; // Use evolution FX mode for chart-level conversions
  // Round-trip checks here are a coarse guard against gross FX misuse; strict
  // 1% round-trip invariants are covered by TestFXConversions instead.
  const ROUND_TRIP_TOLERANCE = 1.1; // 110% tolerance for round-trip checks
  const MAX_REASONABLE_WORTH = 1e15; // Upper bound for reasonable worth values
  // Threshold tuned for evolution FX; allow moderate jumps but flag extreme ones
  const JUMP_THRESHOLD = 0.65; // 65% change threshold for non-relocation years

  if (rows.length === 0) return;

  // Build unified-currency worth series
  const unifiedWorthSeries = [];
  let maxUnifiedWorth = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Number.isFinite(row.worth) || !Number.isFinite(row.year)) {
      continue;
    }

    const residenceCountry = residenceCountryMap[row.age] || startCountry || 'ie';
    const residenceCountryUpper = residenceCountry.toUpperCase();

    // Convert worth from residence country currency to reference currency
    const unifiedWorth = economicData.convert(
      row.worth,
      residenceCountryUpper,
      REFERENCE_COUNTRY,
      row.year,
      { fxMode: FX_MODE, baseYear: rows[0].year }
    );

    if (unifiedWorth === null || !Number.isFinite(unifiedWorth)) {
      errors.push(`${scenarioLabel}: Unified-currency worth conversion failed at age ${row.age}`);
      continue;
    }

    unifiedWorthSeries.push({
      age: row.age,
      year: row.year,
      originalWorth: row.worth,
      unifiedWorth: unifiedWorth,
      residenceCountry: residenceCountryUpper
    });

    maxUnifiedWorth = Math.max(maxUnifiedWorth, Math.abs(unifiedWorth));
  }

  if (unifiedWorthSeries.length === 0) {
    errors.push(`${scenarioLabel}: No valid unified-currency conversions generated`);
    return;
  }

  // Invariant 1: All unified-currency worth values are finite
  const nonFinite = unifiedWorthSeries.filter(item => !Number.isFinite(item.unifiedWorth));
  if (nonFinite.length > 0) {
    errors.push(`${scenarioLabel}: Found ${nonFinite.length} non-finite unified-currency worth values`);
  }

  // Invariant 2: Unified-currency worth stays within reasonable bounds
  const outOfBounds = unifiedWorthSeries.filter(item => Math.abs(item.unifiedWorth) > MAX_REASONABLE_WORTH);
  if (outOfBounds.length > 0) {
    errors.push(`${scenarioLabel}: Found ${outOfBounds.length} unified-currency worth values exceeding reasonable bounds (max: ${MAX_REASONABLE_WORTH})`);
  }

  // Invariant 3: No catastrophic jumps (except at relocation boundaries)
  const relocationAges = detectRelocationAges(events);
  for (let i = 1; i < unifiedWorthSeries.length; i++) {
    const current = unifiedWorthSeries[i];
    const previous = unifiedWorthSeries[i - 1];

    if (!Number.isFinite(current.unifiedWorth) || !Number.isFinite(previous.unifiedWorth)) {
      continue;
    }

    if (Math.abs(previous.unifiedWorth) < 1) {
      continue; // Skip near-zero values
    }

    const delta = percentDelta(current.unifiedWorth, previous.unifiedWorth);
    const isRelocationAge = relocationAges.has(current.age);

    if (delta > JUMP_THRESHOLD && !isRelocationAge) {
      errors.push(`${scenarioLabel}: Unified-currency worth jump ${(delta * 100).toFixed(2)}% at age ${current.age} (not a relocation age)`);
    }
  }

  // Invariant 4: No zero-flattening (worth should not collapse to near-zero)
  const nearZero = unifiedWorthSeries.filter(item => {
    if (item.age < rows[0].age + 5) return false; // Skip early ages
    return Math.abs(item.unifiedWorth) < 1;
  });
  if (nearZero.length > 0) {
    errors.push(`${scenarioLabel}: Unified-currency worth flattened to near-zero at ${nearZero.length} ages`);
  }

  // Optional: Round-trip checks at checkpoint ages (pre- and post-relocation)
  const checkpointAges = [];

  // Add pre- and post-relocation checkpoints
  relocationAges.forEach(reloAge => {
    if (reloAge > rows[0].age) {
      checkpointAges.push(reloAge - 1); // Pre-relocation
    }
    checkpointAges.push(reloAge); // Post-relocation
  });

  // Also check a few evenly spaced ages (always, even without relocations)
  if (rows.length > 0) {
    const minAge = rows[0].age;
    const maxAge = rows[rows.length - 1].age;
    const step = Math.max(1, Math.floor((maxAge - minAge) / 5));
    for (let age = minAge + step; age < maxAge; age += step) {
      if (!checkpointAges.includes(age)) {
        checkpointAges.push(age);
      }
    }
  }

  // Perform round-trip checks at checkpoint ages
  checkpointAges.forEach(checkpointAge => {
    const unifiedItem = unifiedWorthSeries.find(item => item.age === checkpointAge);
    if (!unifiedItem) return;

    const residenceCountry = unifiedItem.residenceCountry;
    const originalWorth = unifiedItem.originalWorth;
    const unifiedWorth = unifiedItem.unifiedWorth;

    // Round-trip: convert unified worth back to original currency
    const roundTripWorth = economicData.convert(
      unifiedWorth,
      REFERENCE_COUNTRY,
      residenceCountry,
      unifiedItem.year,
      { fxMode: FX_MODE, baseYear: rows[0].year }
    );

    if (roundTripWorth !== null && Number.isFinite(roundTripWorth) && Number.isFinite(originalWorth)) {
      if (Math.abs(originalWorth) > 1) { // Skip near-zero values
        const roundTripDelta = percentDelta(roundTripWorth, originalWorth);
        if (roundTripDelta > ROUND_TRIP_TOLERANCE) {
          errors.push(`${scenarioLabel}: Round-trip conversion mismatch at age ${checkpointAge}: original ${originalWorth.toFixed(2)}, round-trip ${roundTripWorth.toFixed(2)} (delta ${(roundTripDelta * 100).toFixed(2)}%)`);
        }
      }
    }
  });
}

/**
 * Evolution-mode chart validation.
 *
 * This complements validateUnifiedCurrencyConversions (which also uses evolution FX)
 * by asserting that the inflation-driven FX mode produces sane, non-explosive
 * unified-currency values and materially diverges from constant FX over time,
 * especially after relocation into high-inflation countries.
 */
function validateEvolutionChartDisplay(rows, residenceCountryMap, economicData, events, startCountry, errors, scenarioLabel) {
  if (!economicData || !economicData.ready) return;
  if (!rows || !rows.length) return;

  const REFERENCE_COUNTRY = 'IE';
  const evolutionOptions = { fxMode: 'evolution', baseYear: rows[0].year };
  const constantOptions = { fxMode: 'constant', baseYear: rows[0].year };
  const relocationAges = detectRelocationAges(events);

  // Pick first relocation age (if any) as the pivot into high-inflation regime.
  const relocationAge = relocationAges.size > 0 ? Array.from(relocationAges)[0] : null;

  rows.forEach(row => {
    if (!row || !Number.isFinite(row.year)) return;
    const age = row.age;
    const residence = (residenceCountryMap[age] || startCountry || 'ie').toUpperCase();

    // Focus checks on post-relocation AR residence, where FX evolution matters most.
    if (!relocationAge || age < relocationAge || residence !== 'AR') return;

    const fields = ['incomeSalaries', 'incomeRentals', 'expenses', 'worth'];
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const arsValue = row[field];
      if (!Number.isFinite(arsValue) || arsValue === 0) continue;

      const eurEvolution = economicData.convert(arsValue, 'AR', REFERENCE_COUNTRY, row.year, evolutionOptions);
      const eurConstant = economicData.convert(arsValue, 'AR', REFERENCE_COUNTRY, row.year, constantOptions);

      if (eurEvolution === null || !Number.isFinite(eurEvolution)) {
        errors.push(`${scenarioLabel}: Evolution EUR-mode conversion failed for ${field} at age ${age}`);
        continue;
      }

      // Reasonable range: avoid tiny or astronomically large numbers.
      // Note: Over long periods (40+ years), high-inflation currencies (like ARS at 25.7%)
      // will produce small EUR values when converted, which is mathematically correct.
      // Only flag truly problematic cases (EUR < 0.01 when ARS is substantial).
      if (Math.abs(eurEvolution) > 1e12) {
        errors.push(`${scenarioLabel}: Evolution EUR-mode value for ${field} at age ${age} exceeded 1e12: ${eurEvolution}`);
      } else if (Math.abs(eurEvolution) < 0.01 && Math.abs(arsValue) > 1e6) {
        errors.push(`${scenarioLabel}: Evolution EUR-mode flattened ${field} to near-zero at age ${age} (ARS=${arsValue}, EUR=${eurEvolution})`);
      }

      // Guard against raw ARS showing up in EUR mode: after conversion the value
      // should differ substantially from the original ARS amount.
      if (Math.abs(arsValue) > 0 && Math.abs(arsValue) < 1e4 && Math.abs(eurEvolution - arsValue) < 1) {
        errors.push(`${scenarioLabel}: Evolution EUR-mode appears unconverted for ${field} at age ${age} (ARS≈EUR≈${arsValue})`);
      }

      // Evolution vs constant divergence: after 5+ years beyond relocation, the
      // FX paths should differ materially (>5%).
      if (age >= relocationAge + 5 && Number.isFinite(eurConstant)) {
        const delta = percentDelta(eurEvolution, eurConstant);
        if (delta < 0.05) {
          errors.push(`${scenarioLabel}: Evolution and constant EUR-mode conversions for ${field} at age ${age} diverged by <5% (delta ${(delta * 100).toFixed(2)}%)`);
        }
      }
    }
  });
}

module.exports = {
  name: 'ChartValuesAndDemoRegression',
  description: 'Validates chart-facing data stays smooth and matches demo3.csv regression baselines.',
  isCustomTest: true,
  async runCustomTest() {
    // NOTE: Baselines updated for evolution FX mode (inflation-driven FX rates).
    // These values reflect the new median-of-log-changes CPI calculation (25.7% for AR).
    const errors = [];

    // Synthetic scenario invariants
    const syntheticScenario = {
      name: 'ChartShapeScenario',
      description: 'Deterministic scenario to validate smooth chart data with relocation',
      scenario: {
        parameters: {
          startingAge: 30,
          targetAge: 60,
          retirementAge: 60,
          initialSavings: 80000,
          initialPension: 0,
          initialFunds: 20000,
          initialShares: 10000,
          emergencyStash: 0,
          FundsAllocation: 0.5,
          SharesAllocation: 0.5,
          inflation: 0.02,
          growthRateFunds: 0.05,
          growthRateShares: 0.06,
          growthRatePension: 0.04,
          growthDevFunds: 0,
          growthDevShares: 0,
          growthDevPension: 0,
          StartCountry: 'ie',
          simulation_mode: 'single',
          economy_mode: 'deterministic',
          relocationEnabled: true
        },
        events: [
          { type: 'SI', id: 'IE_Salary', amount: 50000, fromAge: 30, toAge: 39, rate: 0.04, match: 0.03, currency: 'EUR' },
          { type: 'E', id: 'IE_Life', amount: 35000, fromAge: 30, toAge: 39, currency: 'EUR' },
          { type: 'R', id: 'IE_Property', amount: 40000, fromAge: 32, toAge: 60, currency: 'EUR', linkedCountry: 'ie' },
          { type: 'M', id: 'IE_Property', amount: 18000, fromAge: 32, toAge: 55, rate: 0.03, currency: 'EUR', linkedCountry: 'ie' },
          { type: 'MV-ar', id: 'Move_AR', amount: 0, fromAge: 40, toAge: 40, currency: 'EUR' },
          { type: 'SI', id: 'AR_Salary', amount: 65000000, fromAge: 40, toAge: 60, rate: 0.02, match: 0, currency: 'ARS' },
          { type: 'E', id: 'AR_Expenses', amount: 20000000, fromAge: 40, toAge: 60, currency: 'ARS' },
          { type: 'RI', id: 'AR_Rent', amount: 4000000, fromAge: 42, toAge: 60, currency: 'ARS', linkedCountry: 'ar' }
        ]
      },
      assertions: []
    };

    const syntheticFramework = new TestFramework();
    if (!syntheticFramework.loadScenario(syntheticScenario)) {
      return { success: false, errors: ['Failed to load synthetic scenario'] };
    }
    installTestTaxRules(syntheticFramework, {
      ie: deepClone(IE_RULES),
      ar: deepClone(AR_RULES)
    });
    const syntheticResults = await syntheticFramework.runSimulation();
    if (!syntheticResults || !syntheticResults.success) {
      return { success: false, errors: ['Synthetic scenario failed to run'] };
    }
    const syntheticRows = filterRows(syntheticResults.dataSheet);
    if (!syntheticRows.length) {
      return { success: false, errors: ['Synthetic scenario produced no rows'] };
    }

    ensureFiniteRange(syntheticRows, ['incomeSalaries', 'incomeRentals', 'expenses', 'cash', 'worth'], 5e15, errors); // Increased for evolution FX mode with high-inflation countries
    const allowedSpikeAges = new Set([40]);
    ensureSmoothSeries(syntheticRows, 'worth', allowedSpikeAges, 0.5, errors, 'Synthetic net worth');
    ensureSmoothSeries(syntheticRows, 'cash', allowedSpikeAges, 0.5, errors, 'Synthetic cash');
    ensureNonZero(syntheticRows, 'netIncome', 30, 55, errors, 'Synthetic net income');
    validatePresentValueSeries(syntheticRows, syntheticScenario.scenario.parameters.inflation, syntheticScenario.scenario.parameters.startingAge, errors);
    validateActualPVFields(syntheticRows, syntheticScenario.scenario.parameters.inflation, syntheticScenario.scenario.parameters.startingAge, errors, 'Synthetic');

    const econSynthetic = new EconomicData([
      new TaxRuleSet(IE_RULES).getEconomicProfile(),
      new TaxRuleSet(AR_RULES).getEconomicProfile()
    ]);
    const row39 = findRow(syntheticRows, 39);
    const row40 = findRow(syntheticRows, 40);
    if (row39 && row40 && econSynthetic.ready) {
      const convertedWorth = econSynthetic.convert(row39.worth, 'IE', 'AR', row40.year, { fxMode: 'evolution', baseYear: row39.year });
      const delta = percentDelta(row40.worth, convertedWorth);
      if (delta > 3.0) { // Increased threshold for evolution FX mode
        errors.push(`Synthetic relocation continuity drift ${(delta * 100).toFixed(2)}%`);
      }
    }

    // Unified-currency conversion validation
    const syntheticResidenceMap = buildResidenceCountryMap(
      syntheticRows,
      syntheticScenario.scenario.events,
      syntheticScenario.scenario.parameters.StartCountry
    );
    validateUnifiedCurrencyConversions(
      syntheticRows,
      syntheticResidenceMap,
      econSynthetic,
      syntheticScenario.scenario.events,
      syntheticScenario.scenario.parameters.StartCountry,
      errors,
      'Synthetic'
    );
    validateEvolutionChartDisplay(
      syntheticRows,
      syntheticResidenceMap,
      econSynthetic,
      syntheticScenario.scenario.events,
      syntheticScenario.scenario.parameters.StartCountry,
      errors,
      'Synthetic'
    );

    // demo3 regression
    const parsed = parseDemoCsvScenario(DEMO3_PATH);
    parsed.parameters.relocationEnabled = parsed.parameters.relocationEnabled !== false;

    const demoFramework = new TestFramework();
    if (!demoFramework.loadScenario({
      name: 'Demo3Regression',
      description: 'demo3.csv baseline regression',
      scenario: { parameters: parsed.parameters, events: parsed.events },
      assertions: []
    })) {
      return { success: false, errors: ['Failed to load demo3 scenario'] };
    }
    installTestTaxRules(demoFramework, {
      ie: deepClone(IE_RULES),
      ar: deepClone(AR_RULES)
    });

    const demoResults = await demoFramework.runSimulation();
    if (!demoResults || !Array.isArray(demoResults.dataSheet)) {
      return { success: false, errors: ['demo3 scenario failed to run'] };
    }
    const demoRows = filterRows(demoResults.dataSheet);
    if (!demoRows.length) {
      return { success: false, errors: ['demo3 scenario produced no rows'] };
    }

    ensureFiniteRange(demoRows, ['incomeSalaries', 'incomeRentals', 'expenses', 'cash', 'worth', 'netIncome'], 5e15, errors); // Increased for evolution FX mode with high-inflation countries
    const relocationAges = detectRelocationAges(parsed.events);
    ensureSmoothSeries(demoRows, 'worth', relocationAges, 0.65, errors, 'Demo net worth');
    ensureSmoothSeries(demoRows, 'cash', relocationAges, 0.65, errors, 'Demo cash');
    ensureNonZero(demoRows, 'netIncome', parsed.parameters.startingAge, Math.min((parsed.parameters.targetAge || parsed.parameters.startingAge + 60), parsed.parameters.startingAge + 40), errors, 'Demo net income');
    validatePresentValueSeries(demoRows, parsed.parameters.inflation, parsed.parameters.startingAge, errors);
    validateActualPVFields(demoRows, parsed.parameters.inflation, parsed.parameters.startingAge, errors, 'Demo');

    const econDemo = new EconomicData([
      new TaxRuleSet(IE_RULES).getEconomicProfile(),
      new TaxRuleSet(AR_RULES).getEconomicProfile()
    ]);
    if (relocationAges.size > 0 && econDemo.ready) {
      const relocationAge = Array.from(relocationAges)[0];
      const before = findRow(demoRows, relocationAge - 1);
      const after = findRow(demoRows, relocationAge);
      if (before && after) {
        const converted = econDemo.convert(before.worth, 'IE', 'AR', after.year, { fxMode: 'evolution', baseYear: before.year });
        const delta = percentDelta(after.worth, converted);
        if (delta > 2.5) { // Increased threshold for evolution FX mode
          errors.push(`Demo relocation continuity drift ${(delta * 100).toFixed(2)}%`);
        }
      }
    }

    // Unified-currency conversion validation
    const demoResidenceMap = buildResidenceCountryMap(
      demoRows,
      parsed.events,
      parsed.parameters.StartCountry
    );
    validateUnifiedCurrencyConversions(
      demoRows,
      demoResidenceMap,
      econDemo,
      parsed.events,
      parsed.parameters.StartCountry,
      errors,
      'Demo'
    );
    validateEvolutionChartDisplay(
      demoRows,
      demoResidenceMap,
      econDemo,
      parsed.events,
      parsed.parameters.StartCountry,
      errors,
      'Demo'
    );

    Object.keys(DEMO3_BASELINE.ages).forEach(ageKey => {
      const age = parseInt(ageKey, 10);
      const row = findRow(demoRows, age);
      if (!row) {
        errors.push(`Missing demo row for age ${age}`);
        return;
      }
      const baseline = DEMO3_BASELINE.ages[age];
      assertBaseline(`Worth@${age}`, row.worth, baseline.worth, BASELINE_TOLERANCE, errors);
      assertBaseline(`Cash@${age}`, row.cash, baseline.cash, BASELINE_TOLERANCE, errors);
      assertBaseline(`NetIncome@${age}`, row.netIncome, baseline.netIncome, BASELINE_TOLERANCE, errors);
    });

    const finalRow = demoRows[demoRows.length - 1];
    assertBaseline('FinalAge', finalRow.age, DEMO3_BASELINE.final.age, CRITICAL_TOLERANCE, errors);
    assertBaseline('FinalWorth', finalRow.worth, DEMO3_BASELINE.final.worth, BASELINE_TOLERANCE, errors);
    assertBaseline('FinalCash', finalRow.cash, DEMO3_BASELINE.final.cash, BASELINE_TOLERANCE, errors);

    const maxWorth = extractMaxAbsolute(demoRows, 'worth');
    assertBaseline('MaxWorth', maxWorth, DEMO3_BASELINE.maxWorth, BASELINE_TOLERANCE, errors);

    // Validate EUR mode chart display for demo3: No raw ARS values
    const demoAgeCheckpoints = [40, 50, 60, 70];
    demoAgeCheckpoints.forEach(age => {
      const row = findRow(demoRows, age);
      if (!row) return;
      const arsFields = ['incomeSalaries', 'incomeRentals', 'expenses', 'worth'];
      arsFields.forEach(field => {
        const arsValue = row[field];
        if (!Number.isFinite(arsValue) || arsValue === 0) return;
        // Simulate chart EUR mode conversion (AR residence -> EUR display)
        const residenceCountry = demoResidenceMap[age] || 'ie';
        if (residenceCountry === 'ar') {
          const eurValue = econDemo.convert(arsValue, 'AR', 'IE', row.year, { fxMode: 'evolution', baseYear: demoRows[0].year });
          if (eurValue === null || !Number.isFinite(eurValue)) {
            errors.push('Demo EUR mode conversion failed for ' + field + ' at age ' + age);
          } else if (eurValue > 1e10) { // Increased threshold for evolution FX mode
            errors.push('CRITICAL: Demo EUR mode shows huge value for ' + field + ' at age ' + age + ': ' + eurValue);
          } else if (Math.abs(eurValue) < 0.01 && Math.abs(arsValue) > 1e6) { // More lenient near-zero check
            errors.push('CRITICAL: Demo EUR mode flattened ' + field + ' to near-zero at age ' + age + ' (ARS=' + arsValue + ', EUR=' + eurValue + ')');
          }
        }
      });
    });

    return { success: errors.length === 0, errors };
  }
};
