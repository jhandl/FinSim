#!/usr/bin/env node
/*
 * Compare scenario results between two FinSim repositories by running each scenario
 * through each repo's core engine and diffing the resulting data tables.
 *
 * Usage:
 *   node compare.js \
 *     --repoA /Users/jhandl/FinSim \
 *     --repoB /Users/jhandl/FinSim1 \
 *     --tolerance 0.01 \
 *     --fields age,year,incomeSalaries,netIncome,expenses,pensionFund,cash,indexFundsCapital,sharesCapital,pensionContribution,Tax__incomeTax,Tax__socialContrib,Tax__additionalTax,Tax__capitalGains,worth \
 *     /path/to/scenario1.csv /path/to/scenario2.csv
 *
 * Notes:
 * - Scenario files can be saved CSV scenarios (preferred), JS or JSON test definitions.
 * - By default, all numeric top-level columns in the dataSheet rows are compared.
 * - Use --fields to restrict comparison to a subset of columns.
 * - Exit code will be 1 if any differences are found beyond tolerance.
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    repoA: '/Users/jhandl/FinSim',
    repoB: '/Users/jhandl/FinSim1',
    tolerance: 0,
    fields: null, // null means auto-detect numeric fields
    output: 'console', // 'console' | 'json'
    forceDeterministic: false,
    showEqual: false,
    verbose: false,
    scenarios: []
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--repoA') { args.repoA = argv[++i]; continue; }
    if (arg === '--repoB') { args.repoB = argv[++i]; continue; }
    if (arg === '--tolerance') { args.tolerance = parseFloat(argv[++i]); continue; }
    if (arg === '--fields') { args.fields = argv[++i].split(',').map(s => s.trim()).filter(Boolean); continue; }
    if (arg === '--output') { args.output = argv[++i]; continue; }
    if (arg === '--forceDeterministic') { args.forceDeterministic = true; continue; }
    if (arg === '--showEqual') { args.showEqual = true; continue; }
    if (arg === '--verbose') { args.verbose = true; continue; }
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    // Positional: scenario file path
    args.scenarios.push(arg);
  }

  return args;
}

function ts() {
  return new Date().toISOString();
}

function printHelp() {
  const msg = `\nCompare FinSim scenarios across two repos\n\n` +
    `Options:\n` +
    `  --repoA <path>               Absolute path to repo A (default /Users/jhandl/FinSim)\n` +
    `  --repoB <path>               Absolute path to repo B (default /Users/jhandl/FinSim1)\n` +
    `  --tolerance <percent>        Percentage tolerance for diffs (e.g., 0.5 for 0.5%)\n` +
    `  --fields <csv>               Comma-separated list of fields to compare (default: all numeric top-level fields)\n` +
    `  --output <console|json>      Output mode (default console)\n` +
    `  --forceDeterministic         Force zero volatility to avoid Monte Carlo (off by default)\n` +
    `  --showEqual                  Also show equal rows/fields (default false)\n` +
    `  --help                       Show this help\n` +
    `\nExamples:\n` +
    `  node compare.js --repoA /Users/jhandl/FinSim --repoB /Users/jhandl/FinSim1 /Users/jhandl/FinSim/src/frontend/web/assets/demo.csv\n` +
    `  node compare.js --fields age,year,netIncome,expenses,Tax__incomeTax,Tax__socialContrib --tolerance 0.01 /Users/jhandl/FinSim/src/frontend/web/assets/demo.csv\n`;
  console.log(msg);
}

function resolveFramework(repoPath) {
  const frameworkPath = path.resolve(repoPath, 'src/core/TestFramework.js');
  if (!fs.existsSync(frameworkPath)) {
    throw new Error(`TestFramework not found at ${frameworkPath}`);
  }
  // Load without caching collisions by using absolute path
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const mod = require(frameworkPath);
  const TestFramework = mod.TestFramework || mod.default || mod;
  if (!TestFramework) {
    throw new Error(`Could not load TestFramework class from ${frameworkPath}`);
  }
  return { TestFramework, frameworkPath };
}

function loadScenarioDefinition(scenarioPath) {
  const abs = path.resolve(scenarioPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Scenario file not found: ${abs}`);
  }
  if (abs.toLowerCase().endsWith('.csv')) {
    const { parameters, events } = parseCsvScenario(abs);
    return {
      name: path.basename(abs),
      description: 'CSV scenario',
      scenario: { parameters, events },
      assertions: []
    };
  }
  if (abs.endsWith('.json')) {
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    return sanitizeScenario(raw);
  }
  // JS module (CommonJS)
  // Clear from cache to allow reloading if needed
  delete require.cache[abs];
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const mod = require(abs);
  return sanitizeScenario(mod && mod.default ? mod.default : mod);
}

function sanitizeScenario(s) {
  // Deep-clone to remove functions (e.g., debugOutput)
  const cloned = JSON.parse(JSON.stringify(s));
  // Ensure minimal required structure
  if (!cloned || !cloned.scenario || !cloned.scenario.parameters || !Array.isArray(cloned.scenario.events)) {
    throw new Error('Invalid scenario definition: expected { scenario: { parameters, events }, ... }');
  }
  if (!Array.isArray(cloned.assertions)) {
    cloned.assertions = []; // Not needed for comparison
  }
  if (!cloned.name) cloned.name = 'Unnamed Scenario';
  if (!cloned.description) cloned.description = '';
  return cloned;
}

// --- CSV Scenario Parsing (UI-compatible) ---
function parseCsvScenario(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/).map(l => l.trim());
  // Accept any of:
  // - "# FinSim v<version>"
  // - "# <Any> Financial Simulator v<version>"
  // - Legacy: "# Ireland Financial Simulator v<version> Save File"
  const headerLine = lines[0] || '';
  const headerPatterns = [
    /^#\s*FinSim\s+v[0-9]+\.[0-9]+(?:\s+Save\s+File)?$/i,
    /^#\s*.*Financial\s+Simulator\s+v[0-9]+\.[0-9]+(?:\s+Save\s+File)?$/i,
    /^#\s*Ireland\s+Financial\s+Simulator\s+v[0-9]+\.[0-9]+\s+Save\s+File$/i
  ];
  const validHeader = headerPatterns.some(re => re.test(headerLine));
  if (!validHeader) {
    throw new Error('Invalid scenario CSV header. Expected first line like "# FinSim v<version>", "# <Name> Financial Simulator v<version>", or legacy "# Ireland Financial Simulator v<version> Save File".');
  }
  let section = '';
  const paramRaw = {}; // raw key->value as in CSV
  const events = [];
  let inEvents = false;
  let inParameters = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (line.includes('# Parameters')) { inParameters = true; continue; }
    if (inParameters) {
      const idx = line.indexOf(',');
      if (idx !== -1) {
        const key = line.slice(0, idx);
        const value = line.slice(idx + 1);
        paramRaw[key] = value;
      }
    }

    if (line.includes('# Events')) { inParameters = false; inEvents = true; continue; }
    if (inEvents) {
      if (line.startsWith('Type,')) continue; // header
      const parts = line.split(',');
      if (parts.length < 2) continue;
      const type = (parts[0] || '').trim();
      const name = ((parts[1] || '').trim()).replace(/%2C/g, ',');
      const amount = parseNumber(parts[2]);
      const fromAge = parseNumber(parts[3]);
      const toAge = parseNumber(parts[4]);
      const rate = parsePercent(parts[5]);
      const match = parsePercent(parts[6]);
      if (type) {
        events.push({ type, id: name, amount: amount || 0, fromAge: fromAge || 0, toAge, rate, match });
      }
    }
  }

  const parameters = mapParametersFromCsv(paramRaw);
  return { parameters, events };
}

function parseNumber(val) {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== 'string') {
    const n = Number(val);
    return Number.isFinite(n) ? n : undefined;
  }
  const cleaned = val.replace(/[^0-9+\-.]/g, '');
  if (cleaned === '') return undefined;
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function parsePercent(val) {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') return val;
  let s = String(val).trim();
  if (s.endsWith('%')) s = s.slice(0, -1);
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return undefined;
  // CSV stores display percentages; convert to decimal if > 1
  return n > 1 ? n / 100 : n;
}

function mapParametersFromCsv(raw) {
  const has = (k) => Object.prototype.hasOwnProperty.call(raw, k) && raw[k] !== '';
  // Derive simulation mode if missing
  const simMode = has('simulation_mode')
    ? String(raw['simulation_mode']).trim()
    : (has('P2StartingAge') && String(raw['P2StartingAge']).trim() !== '' ? 'couple' : 'single');
  // Derive economy mode if missing
  const anyVol = [raw['PensionGrowthStdDev'], raw['FundsGrowthStdDev'], raw['SharesGrowthStdDev']]
    .map(parsePercent)
    .some(v => (v || 0) > 0);
  const ecoMode = has('economy_mode')
    ? String(raw['economy_mode']).trim()
    : (anyVol ? 'montecarlo' : 'deterministic');

  const params = {
    startingAge: parseNumber(raw['StartingAge']) || 0,
    StartCountry: raw['StartCountry'] ? String(raw['StartCountry']).trim() : 'IE',
    targetAge: parseNumber(raw['TargetAge']) || 0,
    initialSavings: parseNumber(raw['InitialSavings']) || 0,
    initialPension: parseNumber(raw['InitialPension']) || 0,
    initialFunds: parseNumber(raw['InitialFunds']) || 0,
    initialShares: parseNumber(raw['InitialShares']) || 0,
    retirementAge: parseNumber(raw['RetirementAge']) || 0,
    emergencyStash: parseNumber(raw['EmergencyStash']) || 0,
    pensionPercentage: parsePercent(raw['PensionContributionPercentage']) || 0,
    pensionCapped: has('PensionContributionCapped') ? String(raw['PensionContributionCapped']).trim() : 'Yes',
    statePensionWeekly: parseNumber(raw['StatePensionWeekly']) || 0,
    growthRatePension: parsePercent(raw['PensionGrowthRate']) || 0,
    growthDevPension: parsePercent(raw['PensionGrowthStdDev']) || 0,
    growthRateFunds: parsePercent(raw['FundsGrowthRate']) || 0,
    growthDevFunds: parsePercent(raw['FundsGrowthStdDev']) || 0,
    growthRateShares: parsePercent(raw['SharesGrowthRate']) || 0,
    growthDevShares: parsePercent(raw['SharesGrowthStdDev']) || 0,
    inflation: parsePercent(raw['Inflation']) || 0,
    FundsAllocation: parsePercent(raw['FundsAllocation']) || 0,
    SharesAllocation: parsePercent(raw['SharesAllocation']) || 0,
    priorityCash: parseNumber(raw['PriorityCash']) || 0,
    priorityPension: parseNumber(raw['PriorityPension']) || 0,
    priorityFunds: parseNumber(raw['PriorityFunds']) || 0,
    priorityShares: parseNumber(raw['PriorityShares']) || 0,
    marriageYear: parseNumber(raw['MarriageYear']) || null,
    youngestChildBorn: parseNumber(raw['YoungestChildBorn']) || null,
    oldestChildBorn: parseNumber(raw['OldestChildBorn']) || null,
    personalTaxCredit: parseNumber(raw['PersonalTaxCredit']) || 0,
    p2StartingAge: parseNumber(raw['P2StartingAge']) || 0,
    p2RetirementAge: parseNumber(raw['P2RetirementAge']) || 0,
    p2StatePensionWeekly: parseNumber(raw['P2StatePensionWeekly']) || 0,
    initialPensionP2: parseNumber(raw['InitialPensionP2']) || 0,
    pensionPercentageP2: parsePercent(raw['PensionContributionPercentageP2']) || 0,
    simulation_mode: simMode,
    economyMode: ecoMode
  };

  return params;
}

async function runWithFramework(FrameworkClass, scenarioDef, opts = {}) {
  const fw = new FrameworkClass();
  try {
    if (opts.verbose && typeof fw.setVerbose === 'function') {
      fw.setVerbose(true);
    }
    const repoLabel = opts.repoLabel || 'repo';
    const repoPath = opts.repoPath || '';

    // (debug removed)

    const localScenario = prepareScenarioForRun(scenarioDef, opts);

    // (debug removed)

    const loaded = fw.loadScenario(localScenario);
    if (!loaded) {
      throw new Error('loadScenario() failed');
    }

    // (debug removed)

    const results = await fw.runSimulation();

    if (!results || !results.dataSheet) {
      throw new Error('Simulation did not return dataSheet');
    }

    // (debug removed)

    const rows = toValidRows(results.dataSheet);

    // (debug removed)

    const last = rows.length > 0 ? rows[rows.length - 1] : null;
    const finalYear = last && typeof last.year !== 'undefined' ? last.year : 'n/a';
    const finalWorth = last && typeof last.worth !== 'undefined' ? roundValueForField('worth', last.worth) : 'n/a';
    const mc = results && results.montecarlo ? `, montecarlo runs=${results.runs}` : '';

    // (debug removed)

    return results;
  } finally {
    if (typeof fw.reset === 'function') {
      fw.reset();
    }
  }
}

function prepareScenarioForRun(scenarioDef, opts) {
  const clone = JSON.parse(JSON.stringify(scenarioDef));
  if (opts.forceDeterministic) {
    const p = clone.scenario.parameters || {};
    // Zero-out volatilities to avoid Monte Carlo variance
    if (typeof p.growthDevPension === 'number') p.growthDevPension = 0;
    if (typeof p.growthDevFunds === 'number') p.growthDevFunds = 0;
    if (typeof p.growthDevShares === 'number') p.growthDevShares = 0;
    // Avoid forcing economyMode unless explicitly set by caller
  }
  return clone;
}

function toValidRows(dataSheet) {
  if (!Array.isArray(dataSheet)) return [];
  return dataSheet.filter(r => r && typeof r === 'object');
}

function detectNumericFields(rows) {
  if (!rows.length) return [];
  const sample = rows[0];
  const banned = new Set(['attributions', 'investmentIncomeByKey', 'investmentCapitalByKey']);
  const fields = Object.keys(sample)
    .filter(k => !banned.has(k))
    .filter(k => typeof sample[k] === 'number');
  return fields;
}

const PERCENT_FIELDS = new Set(['withdrawalRate']);

function roundValueForField(field, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  if (PERCENT_FIELDS.has(field)) {
    // Round to nearest 0.0001 (two decimals in percent representation)
    return Math.round(value * 10000) / 10000;
  }
  // Quantities: round to nearest whole number
  return Math.round(value);
}

function compareSheets(rowsA, rowsB, fields, tolerancePercent, keyMapA, keyMapB) {
  const maxRows = Math.max(rowsA.length, rowsB.length);
  const diffs = [];
  for (let i = 0; i < maxRows; i++) {
    const a = rowsA[i];
    const b = rowsB[i];
    if (!a || !b) {
      diffs.push({ row: i, type: 'row_mismatch', aExists: !!a, bExists: !!b });
      continue;
    }
    for (const field of fields) {
      // Resolve actual underlying keys per-repo when provided (use field as fallback)
      const keyA = (keyMapA && keyMapA[field]) ? keyMapA[field] : field;
      const keyB = (keyMapB && keyMapB[field]) ? keyMapB[field] : field;
      const va = roundValueForField(field, a[keyA]);
      const vb = roundValueForField(field, b[keyB]);
      if (typeof va !== 'number' || typeof vb !== 'number') continue;
      const diffAbs = Math.abs(va - vb);
      // Use symmetric denominator to avoid infinite percentages when expected is 0
      const denom = Math.max(Math.abs(vb), Math.abs(va), 1e-9);
      const percentDiff = (diffAbs / denom) * 100;
      const equal = percentDiff <= tolerancePercent;
      if (!equal) {
        const age = (a && a.age !== undefined) ? a.age : (b && b.age !== undefined ? b.age : null);
        diffs.push({ row: i, age, field, a: va, b: vb, deltaPct: percentDiff });
      }
    }
  }
  return diffs;
}

function formatValueForOutput(field, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  if (PERCENT_FIELDS.has(field)) {
    return `${(value * 100).toFixed(2)}%`;
  }
  return String(value);
}

function formatDeltaForOutput(field, deltaPct) {
  if (typeof deltaPct !== 'number' || !Number.isFinite(deltaPct)) return String(deltaPct);
  return `${deltaPct.toFixed(2)}%`;
}

function formatConsoleReport(report, showEqual) {
  const lines = [];
  lines.push('');
  lines.push('='.repeat(100));
  lines.push(`Scenario: ${report.scenarioName}`);
  lines.push(`Files: ${report.scenarioPath}`);
  lines.push(`Repo A: ${report.repoA}`);
  lines.push(`Repo B: ${report.repoB}`);
  lines.push(`Compared fields: ${report.fields.join(', ')}`);
  lines.push(`Tolerance: ${report.tolerance}`);
  lines.push('-'.repeat(100));
  if (report.diffs.length === 0) {
    lines.push('No differences found.');
  } else {
    lines.push(`Differences (${report.diffs.length}):`);
    for (const d of report.diffs) {
      if (d.type === 'row_mismatch') {
        lines.push(`  Row ${d.row}: row presence mismatch (repoA=${d.aExists}, repoB=${d.bExists})`);
      } else {
        const aStr = formatValueForOutput(d.field, d.a);
        const bStr = formatValueForOutput(d.field, d.b);
        const deltaStr = formatDeltaForOutput(d.field, d.deltaPct);
        lines.push(`  Row ${d.row} field ${d.field}: A=${aStr} B=${bStr} (Δ=${deltaStr})`);
      }
    }
  }
  if (showEqual) {
    lines.push('-'.repeat(100));
    lines.push('Note: showEqual requested, but equal rows/fields are not enumerated to avoid noise.');
  }
  lines.push('='.repeat(100));
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.scenarios.length === 0) {
    printHelp();
    process.exit(args.help ? 0 : 1);
    return;
  }

  const { TestFramework: TF_A, frameworkPath: FP_A } = resolveFramework(args.repoA);
  const { TestFramework: TF_B, frameworkPath: FP_B } = resolveFramework(args.repoB);

  const allReports = [];
  let anyDiffs = false;

  for (const scenPath of args.scenarios) {
    const scenarioAbs = path.resolve(scenPath);
    const scenarioDef = loadScenarioDefinition(scenarioAbs);

    const [resA, resB] = await Promise.all([
      runWithFramework(TF_A, scenarioDef, { forceDeterministic: args.forceDeterministic, repoLabel: 'repoA', repoPath: args.repoA, verbose: args.verbose }),
      runWithFramework(TF_B, scenarioDef, { forceDeterministic: args.forceDeterministic, repoLabel: 'repoB', repoPath: args.repoB, verbose: args.verbose })
    ]);

    const rowsA = toValidRows(resA.dataSheet);
    const rowsB = toValidRows(resB.dataSheet);

    // Build optional key maps to resolve display-name aliases to actual Tax__ keys
    const buildKeyMap = (rows) => {
      if (!rows || rows.length === 0) return null;
      const sample = rows[0];
      const map = Object.create(null);
      // Map Tax__ keys to multiple lookup forms
      for (const k of Object.keys(sample)) {
        if (!k) continue;
        if (k.indexOf('Tax__') === 0) {
          // Field reported in compare fields may be the display name or id without Tax__ prefix
          const id = k.substring(5);
          if (id) {
            // Map various lookup forms to this actual key
            map[id] = k;
            map[id.toLowerCase()] = k;
            map[id.replace(/\s+/g, '')] = k;
            map[id.toLowerCase().replace(/\s+/g, '')] = k;
            // Also map the full Tax__ key to the actual key (identity)
            map['Tax__' + id] = k;
          }
        }
      }

      // If this repo exposes short legacy keys (e.g., 'it','prsi','usc','cgt'), map canonical Tax__ keys to them
      const knownShorts = { it: 'incomeTax', prsi: 'prsi', usc: 'usc', cgt: 'capitalGains' };
      for (const k of Object.keys(sample)) {
        if (!k) continue;
        const lk = k.toLowerCase();
        if (knownShorts[lk]) {
          const canonical = knownShorts[lk];
          // Map Tax__canonical -> actual short key in this repo
          map['Tax__' + canonical] = k;
          map[canonical] = k;
          map[canonical.toLowerCase()] = k;
          map[lk] = k;
        }
      }
      // Add common legacy short aliases if corresponding Tax__ keys exist
      // incomeTax -> it, prsi, usc, capitalGains -> cgt
      if (map['incometax'] || map['incomeTax']) {
        map['it'] = map['incometax'] || map['incomeTax'];
      }
      if (map['prsi']) {
        map['prsi'] = map['prsi'];
      }
      if (map['usc']) {
        map['usc'] = map['usc'];
      }
      if (map['capitalgains'] || map['capitalGains']) {
        map['cgt'] = map['capitalgains'] || map['capitalGains'];
      }
      return map;
    };

    const keyMapA = buildKeyMap(rowsA);
    const keyMapB = buildKeyMap(rowsB);

    // (debug removed)

    const fields = (args.fields && args.fields.length > 0)
      ? args.fields
      : (function () {
        const autoA = rowsA.length > 0 ? detectNumericFields(rowsA) : [];
        const autoB = rowsB.length > 0 ? detectNumericFields(rowsB) : [];
        return Array.from(new Set(autoA.concat(autoB)));
      })();

    // (debug removed)

    // Normalize requested fields to canonical keys to avoid duplicate/ambiguous comparisons
    const normalizeFields = (fieldsList, mapA, mapB) => {
      const seen = Object.create(null);
      const out = [];
      for (const f of fieldsList) {
        let canonical = f;
        // If it's already a Tax__ key, keep as-is
        if (!String(f).startsWith('Tax__')) {
          // Try maps (A then B) to resolve aliases like 'it' -> 'Tax__incomeTax'
          if (mapA && mapA[f]) canonical = mapA[f];
          else if (mapB && mapB[f]) canonical = mapB[f];
          else {
            // Also try lowercased / whitespace-stripped forms
            const lc = String(f).toLowerCase().replace(/\s+/g, '');
            if (mapA && mapA[lc]) canonical = mapA[lc];
            else if (mapB && mapB[lc]) canonical = mapB[lc];
          }
        }
        if (!seen[canonical]) {
          seen[canonical] = true;
          out.push(canonical);
        }
      }
      return out;
    };

    const normFields = normalizeFields(fields, keyMapA, keyMapB);
    // (debug removed)
    const diffs = compareSheets(rowsA, rowsB, normFields, args.tolerance, keyMapA, keyMapB);
    anyDiffs = anyDiffs || diffs.length > 0;

    const report = {
      scenarioName: scenarioDef.name || path.basename(scenarioAbs),
      scenarioPath: scenarioAbs,
      repoA: args.repoA,
      repoB: args.repoB,
      fields: normFields,
      tolerance: args.tolerance,
      diffs
    };
    allReports.push(report);

    if (args.output === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatConsoleReport(report, args.showEqual));
    }
  }

  if (args.output === 'json' && allReports.length > 1) {
    // If multiple scenarios, emit one combined JSON to stdout
    console.log(JSON.stringify({ reports: allReports }, null, 2));
  }

  process.exitCode = anyDiffs ? 1 : 0;
}

main().catch(err => {
  console.error('Error:', err && err.stack ? err.stack : String(err));
  process.exit(2);
});


