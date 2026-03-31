var uiManager, params, events, config, dataSheet, row, errors;
var year, periods, failedAt, success, montecarlo;
var revenue, realEstate, stockGrowthOverride, attributionManager;
var currentEconomicRegime = null;
var economicRegimesModel = null;
var netIncome, expenses, savings, targetCash, cashWithdraw, cashDeficit;
var purchaseShortfallThisYear;
var purchaseCashUsedThisYear;
var incomeStatePension, incomePrivatePension, withdrawalRate;
var incomeSalaries, incomeShares, incomeRentals, incomeSale, incomeDefinedBenefit, incomeTaxFree, pensionContribution;
var personalPensionContribution, personalPensionContributionByCountry;
var incomePrivatePensionByCountry;
var incomeSalariesByCountry;
var incomeRentalsByCountry;
/**
 * Cash tracking architecture:
 * - cash (number): Primary numeric value for performance-critical operations
 * - cashMoney (Money): Money object for currency context (used at boundaries)
 *
 * Cash operations update both to maintain invariant: cash === cashMoney.amount
 */
var cash, cashMoney;
// Generic investment array (future replacement for specific variables)
var investmentAssets; // [{ key, label, asset }]
// Track per-investment-type flows to support dynamic UI columns
var investmentIncomeByKey; // { [key: string]: number }
var person1, person2;
// Variables for pinch point visualization
var perRunResults, currentRun;
var capturePerRunResults;
// Variables for earned net income tracking
var earnedNetIncome, householdPhase;
// Stable tax ids for consistent Tax__... columns per run
var stableTaxIds;
// Country context for multi-country inflation application (currency is separate)
var currentCountry, countryInflationOverrides;
// Active residence currency (upper-cased ISO code)
var residenceCurrency;
// Country -> currency cache (normalized)
var countryCurrencyCache;
var economicData, baseCountryCode;
// Module-level FX conversion cache - persists across Monte Carlo runs (FX rates are deterministic)
var fxConversionCache = {};
// Module-level residency timeline cache - persists across Monte Carlo runs
var residencyTimeline = null;

const Phases = {
  growth: 'growth',
  retired: 'retired'
}


async function run() {
  residencyTimeline = null;
  if (!(await initializeSimulator())) {
    // If initialization fails (validation errors), ensure UI state is reset
    uiManager.ui.flush();
    return;
  }
  residencyTimeline = getResidencyTimeline(params, events);

  // Monte Carlo mode is enabled when user selects it AND there are volatility values.
  var hasVolatility = (params.growthDevPension > 0);
  var volByKey = params.investmentVolatilitiesByKey || {};
  for (var k in volByKey) {
    if (!Object.prototype.hasOwnProperty.call(volByKey, k)) continue;
    if (parseFloat(volByKey[k]) > 0) { hasVolatility = true; break; }
  }
  if (!hasVolatility) {
    for (var pk in params) {
      if (!Object.prototype.hasOwnProperty.call(params, pk)) continue;
      if (String(pk).indexOf('GlobalAssetVolatility_') !== 0) continue;
      if (parseFloat(params[pk]) > 0) { hasVolatility = true; break; }
    }
  }
  montecarlo = (params.economyMode === 'montecarlo') && (hasVolatility || params.economicRegimesEnabled);


  // In web UI we retain per-run yearly data for pinch-point visualization.
  // In tests / GAS environments this data is unused and very expensive at Monte Carlo scale.
  capturePerRunResults = !!(uiManager && uiManager.ui && typeof uiManager.ui.storeSimulationResults === 'function');

  // Allow scenario/tests to override Monte Carlo run count explicitly.
  // Falls back to config.simulationRuns for existing UI behavior.
  var runsOverride = (params && params.monteCarloRuns !== undefined && params.monteCarloRuns !== null)
    ? (typeof params.monteCarloRuns === 'string' ? parseInt(params.monteCarloRuns, 10) : params.monteCarloRuns)
    : null;
  let runs = (montecarlo ? ((typeof runsOverride === 'number' && isFinite(runsOverride) && runsOverride > 0) ? runsOverride : config.simulationRuns) : 1);
  let successes = 0;

  // Initialize per-run results tracking
  perRunResults = capturePerRunResults ? [] : null;

  uiManager.updateProgress("Running");
  for (currentRun = 0; currentRun < runs; currentRun++) {
    successes += runSimulation();
  }
  uiManager.updateDataSheet(runs, perRunResults);
  uiManager.updateStatusCell(successes, runs);
}

function flagSimulationFailure(age) {
  success = false;
  if (typeof age === 'number') {
    failedAt = age;
  } else if (person1 && typeof person1.age === 'number') {
    failedAt = person1.age;
  }
}

function normalizeCountry(code) {
  if (code === null || code === undefined) throw new Error('normalizeCountry: code is null/undefined');
  return String(code).trim().toLowerCase();
}

function getResidencyTimeline(params, events) {
  if (residencyTimeline) return residencyTimeline;
  var cfg = Config.getInstance();
  var startCountry = normalizeCountry((params && params.StartCountry) ? params.StartCountry : cfg.getDefaultCountry());
  var startAge = (params && typeof params.startingAge === 'number') ? params.startingAge : 0;
  var targetAge = (params && typeof params.targetAge === 'number') ? params.targetAge : null;
  var moves = [];

  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    if (!e || !e.type) continue;
    if (!isRelocationEvent(e)) continue;
    var age = (typeof e.fromAge === 'number') ? e.fromAge : parseFloat(e.fromAge);
    if (!isFinite(age)) continue;
    var moveCountry = getRelocationCountryCode(e);
    if (!moveCountry) continue;
    moves.push({
      age: age,
      country: normalizeCountry(moveCountry),
      index: i
    });
  }

  moves.sort(function (a, b) {
    if (a.age === b.age) return a.index - b.index;
    return a.age - b.age;
  });

  var timeline = [];
  var currentCountry = startCountry;
  var currentFromAge = startAge;

  for (var j = 0; j < moves.length; j++) {
    var mv = moves[j];
    if (mv.age <= currentFromAge) {
      currentCountry = mv.country;
      continue;
    }
    timeline.push({
      fromAge: currentFromAge,
      toAge: mv.age - 1,
      country: currentCountry
    });
    currentCountry = mv.country;
    currentFromAge = mv.age;
  }

  timeline.push({
    fromAge: currentFromAge,
    toAge: (typeof targetAge === 'number') ? (targetAge - 1) : null,
    country: currentCountry
  });

  residencyTimeline = timeline;
  return timeline;
}

function getCountryForAgeCached(age, events, startCountry) {
  var actualAge = age;
  var actualEvents = events;
  var actualStart = startCountry;
  if (Array.isArray(age)) {
    actualEvents = age;
    actualAge = events;
  }
  if (residencyTimeline && typeof actualAge === 'number') {
    for (var i = 0; i < residencyTimeline.length; i++) {
      var entry = residencyTimeline[i];
      if (!entry) continue;
      if (actualAge >= entry.fromAge && (entry.toAge === null || actualAge <= entry.toAge)) {
        return entry.country;
      }
    }
  }
  return getCountryForAge(actualAge, actualEvents, actualStart);
}

function normalizeCurrency(code) {
  if (code === null || code === undefined) throw new Error('normalizeCurrency: code is null/undefined');
  return String(code).trim().toUpperCase();
}

function getCurrencyForCountry(code) {
  var normalized = normalizeCountry(code);
  if (!normalized) throw new Error('getCurrencyForCountry: empty country code');
  if (countryCurrencyCache && countryCurrencyCache.hasOwnProperty(normalized)) {
    return countryCurrencyCache[normalized];
  }
  var cfg = Config.getInstance();
  var rs = cfg.getCachedTaxRuleSet(normalized);
  if (!rs) return null; // Ruleset not cached - return null instead of crashing
  var cur = rs.getCurrencyCode();
  if (cur) {
    var normalizedCur = normalizeCurrency(cur);
    if (!countryCurrencyCache) countryCurrencyCache = {};
    countryCurrencyCache[normalized] = normalizedCur;
    return normalizedCur;
  }
  return null; // No currency defined in ruleset
}

function getEventCurrencyInfo(event, fallbackCountry) {
  var info = { currency: null, country: null };
  var fallback = normalizeCountry(fallbackCountry || currentCountry);
  if (!event) {
    info.country = fallback;
    info.currency = getCurrencyForCountry(fallback);
    return info;
  }

  var linkedCountry = event.linkedCountry ? normalizeCountry(event.linkedCountry) : null;
  info.country = linkedCountry || fallback;
  if (event.currency) {
    info.currency = normalizeCurrency(event.currency);
  } else {
    info.currency = getCurrencyForCountry(info.country);
  }

  var expectedCurrency = getCurrencyForCountry(info.country);
  if (!expectedCurrency) {
    if (typeof errors !== 'undefined') {
      errors = true;
    }
    if (typeof success !== 'undefined') {
      success = false;
    }
    if (uiManager && typeof uiManager.setStatus === 'function') {
      uiManager.setStatus("Missing ruleset currency for country: " + info.country, STATUS_COLORS.ERROR);
    }
    return info;
  }
  expectedCurrency = normalizeCurrency(expectedCurrency);
  if (info.currency !== expectedCurrency) {
    if (typeof errors !== 'undefined') {
      errors = true;
    }
    if (typeof success !== 'undefined') {
      success = false;
    }
    if (uiManager && typeof uiManager.setStatus === 'function') {
      uiManager.setStatus(
        "Currency/country mismatch: " + info.currency + " does not match " + info.country + " (" + expectedCurrency + ")",
        STATUS_COLORS.ERROR
      );
    }
  }
  return info;
}

/**
 * Global helper function: Convert a nominal value between countries using FX rates (not PPP).
 * This is the standard ledger conversion helper that ensures all financial
 * calculations use exchange rates rather than purchasing power parity.
 * 
 * NOTE: EconomicData.convert() now supports an inflation-driven 'evolution' mode
 * as its default for chart/unified-currency and ledger purposes.
 * 
 * Available globally for use by ledger code paths (e.g., Attribution.js).
 * Uses EconomicData.convert() with default 'evolution' mode (inflation-driven FX).
 * 
 * Returns null if conversion fails or produces non-finite results. Logs warnings for results exceeding 1e12.
 * 
 * @param {number} value - Amount to convert
 * @param {string} fromCountry - Source country code (ISO-2, e.g., 'ie', 'ar')
 * @param {string} toCountry - Target country code (ISO-2, e.g., 'ie', 'ar')
 * @param {number} year - Simulation year for the conversion
 * @returns {number|null} Converted amount, or null if conversion fails
 */
function convertNominal(value, fromCountry, toCountry, year) {
  if (!value || !fromCountry || !toCountry) return value || null;
  var fromCountryUpper = String(fromCountry).toUpperCase();
  var toCountryUpper = String(toCountry).toUpperCase();
  // Fast path: same country = no conversion needed
  if (fromCountryUpper === toCountryUpper) return value;
  // Check module-level FX cache (persists across Monte Carlo runs)
  var cacheKey = fromCountryUpper + ':' + toCountryUpper + ':' + year;
  if (fxConversionCache.hasOwnProperty(cacheKey)) {
    var cachedRate = fxConversionCache[cacheKey];
    if (cachedRate === null) return null; // Cached failure
    return value * cachedRate;
  }
  // Cache miss - compute FX rate
  var econ = economicData || config.getEconomicData();
  if (!econ || !econ.ready) throw new Error('convertNominal: EconomicData not ready');
  var baseYear = config.getSimulationStartYear();
  var options = {
    baseYear: baseYear,
    fxMode: 'evolution'
  };
  // Convert 1 unit to get the FX rate, then cache it
  var fxRate = econ.convert(1, fromCountryUpper, toCountryUpper, year, options);
  if (fxRate === null || !Number.isFinite(fxRate)) {
    fxConversionCache[cacheKey] = null; // Cache the failure
    console.warn('convertNominal: Conversion returned null/NaN for ' + fromCountry + '->' + toCountry + ' at year ' + year);
    return null;
  }
  fxConversionCache[cacheKey] = fxRate;
  return value * fxRate;
}

function convertCurrencyAmount(value, fromCurrency, fromCountry, toCurrency, toCountry, year) {
  if (!value) return 0;
  // NOTE: This helper delegates to convertNominal(), which uses evolved FX (inflation-driven).
  // EconomicData.convert() defaults to 'evolution' mode, adopted by all ledger paths as of T9.
  var sourceCurrency = normalizeCurrency(fromCurrency);
  var targetCurrency = normalizeCurrency(toCurrency);
  var sourceCountry = normalizeCountry(fromCountry);
  var targetCountry = normalizeCountry(toCountry);
  var expectedSourceCurrency = getCurrencyForCountry(sourceCountry);
  var expectedTargetCurrency = getCurrencyForCountry(targetCountry);

  if (!expectedSourceCurrency || !expectedTargetCurrency) {
    if (typeof errors !== 'undefined') {
      errors = true;
    }
    if (typeof success !== 'undefined') {
      success = false;
    }
    if (uiManager && typeof uiManager.setStatus === 'function') {
      var missingCountry = !expectedSourceCurrency ? sourceCountry : targetCountry;
      uiManager.setStatus("Missing ruleset currency for country: " + missingCountry, STATUS_COLORS.ERROR);
    }
    return null;
  }

  expectedSourceCurrency = normalizeCurrency(expectedSourceCurrency);
  expectedTargetCurrency = normalizeCurrency(expectedTargetCurrency);
  if (sourceCurrency !== expectedSourceCurrency || targetCurrency !== expectedTargetCurrency) {
    if (typeof errors !== 'undefined') {
      errors = true;
    }
    if (typeof success !== 'undefined') {
      success = false;
    }
    if (uiManager && typeof uiManager.setStatus === 'function') {
      var badCountry = (sourceCurrency !== expectedSourceCurrency) ? sourceCountry : targetCountry;
      var badCurrency = (sourceCurrency !== expectedSourceCurrency) ? sourceCurrency : targetCurrency;
      var expectedCurrency = (sourceCurrency !== expectedSourceCurrency) ? expectedSourceCurrency : expectedTargetCurrency;
      uiManager.setStatus(
        "Currency/country mismatch: " + badCurrency + " does not match " + badCountry + " (" + expectedCurrency + ")",
        STATUS_COLORS.ERROR
      );
    }
    return null;
  }

  if (sourceCurrency === targetCurrency) {
    return value;
  }

  var converted = convertNominal(value, sourceCountry, targetCountry, year);
  if (converted === null || typeof converted !== 'number' || isNaN(converted)) {
    console.error('convertCurrencyAmount: convertNominal failed for ' + sourceCountry + '->' + targetCountry + ' at year ' + year + '');
    console.warn("Currency conversion failed:", value, sourceCurrency, targetCurrency, year);
    if (typeof errors !== 'undefined') {
      errors = true;
    }
    if (typeof success !== 'undefined') {
      success = false;
    }
    if (uiManager && typeof uiManager.setStatus === 'function') {
      uiManager.setStatus("Currency conversion failed - check economic data for " + sourceCurrency + " to " + targetCurrency, STATUS_COLORS.ERROR);
    }
    return null;
  }
  return converted;
}

function convertToResidenceCurrency(amount, currency, country, year) {
  return convertCurrencyAmount(amount, currency, country, residenceCurrency, currentCountry, year);
}

function initializeUI() {
  uiManager = (typeof SpreadsheetApp !== 'undefined')
    ? new UIManager(GasUI.getInstance())
    : new UIManager(WebUI.getInstance());
}

function readScenario(validate) {
  errors = false;
  uiManager.clearWarnings();
  params = uiManager.readParameters(validate);
  events = uiManager.readEvents(validate);
  if (errors) {
    uiManager.setStatus("Check errors", STATUS_COLORS.WARNING);
  }
  return !errors;
}

async function initializeSimulator() {
  initializeUI();
  uiManager.setStatus("Initializing", STATUS_COLORS.INFO);
  config = Config.getInstance(uiManager.ui);
  revenue = new Taxman();
  attributionManager = new AttributionManager();
  dataSheet = [];
  // Clear FX conversion cache for new simulation (different scenario may have different parameters)
  fxConversionCache = {};
  countryCurrencyCache = {};
  if (!readScenario(true)) {
    return false;
  }

  // StartCountry is mandatory
  var sc = (params && params.StartCountry) ? String(params.StartCountry).trim() : '';
  if (!sc) {
    errors = true;
    success = false;
    uiManager.setStatus("StartCountry is required", STATUS_COLORS.ERROR);
    return false;
  }

  // Preload tax rulesets for all countries referenced in events (await to ensure readiness)
  var startCountry = params.StartCountry || config.getDefaultCountry();
  var syncResult = await config.syncTaxRuleSetsWithEvents(events, startCountry);
  if (syncResult && syncResult.failed && syncResult.failed.length > 0) {
    errors = true;
    success = false;
    var failedCodes = syncResult.failed.join(', ');
    uiManager.setStatus("Unknown relocation country: " + failedCodes, STATUS_COLORS.ERROR);
    return false;
  }

  if (!validatePerCountryInputs(startCountry, events, params)) {
    return false;
  }

  // Pre-run in-memory completion: ensure events have linkedCountry/currency when missing.
  // This happens after the UI relocation-impact gate; it does not persist to disk.
  if (!completeMissingCurrencyAndLinkedCountry(events, startCountry)) {
    return false;
  }

  // Initialize economic regimes if enabled and in Monte Carlo mode
  if (params.economicRegimesEnabled && params.economyMode === 'montecarlo') {
    try {
      var regimesConfig = config.getEconomicRegimes();
      economicRegimesModel = new EconomicRegimeModel(regimesConfig);
    } catch (e) {
      errors = true;
      success = false;
      uiManager.setStatus(e.message, STATUS_COLORS.ERROR);
      return false;
    }
  } else {
    economicRegimesModel = null;
    currentEconomicRegime = null;
  }

  return true;
}

function validatePerCountryInputs(startCountry, events, params) {
  if (!config || !params || !config.isRelocationEnabled || !config.isRelocationEnabled()) return true;

  var countries = [];
  var seen = {};
  var sc = startCountry ? String(startCountry).toLowerCase() : null;
  if (sc) {
    countries.push(sc);
    seen[sc] = true;
  }

  var hasRelocation = false;
  if (Array.isArray(events)) {
    for (var i = 0; i < events.length; i++) {
      var evt = events[i];
      if (!evt || !evt.type) continue;
      if (isRelocationEvent(evt)) {
        hasRelocation = true;
        var code = getRelocationCountryCode(evt);
        if (code && !seen[code]) {
          countries.push(code);
          seen[code] = true;
        }
      }
    }
  }
  if (!hasRelocation) return true;

  var allocMissing = [];
  var contribMissing = [];
  var allocByCountry = params.investmentAllocationsByCountry || {};
  var contribByCountry = params.pensionContributionsByCountry || {};
  var isCouple = params.simulation_mode === 'couple';

  for (var ci = 0; ci < countries.length; ci++) {
    var code = countries[ci];
    var rs = config.getCachedTaxRuleSet(code);

    var allocMap = allocByCountry[code];
    // Only validate completeness when a per-country allocation map is explicitly provided.
    // Missing allocations for a visited country means "no investing in that residence period".
    if (allocMap && typeof allocMap === 'object' && Object.keys(allocMap).length > 0) {
      var types = rs.getResolvedInvestmentTypes();
      for (var ti = 0; ti < types.length; ti++) {
        var t = types[ti] || {};
        if (!t.key) continue;
        if (t.excludeFromAllocations) continue;
        if (allocMap[t.key] === undefined || allocMap[t.key] === null) {
          allocMissing.push(code);
          break;
        }
      }
    }

    if (rs.getPensionSystemType() !== 'state_only') {
      var contribMap = contribByCountry[code];
      var contribOk = !!(contribMap && contribMap.p1Pct !== undefined && contribMap.capped !== undefined);
      if (isCouple && (!contribMap || contribMap.p2Pct === undefined)) contribOk = false;
      // Only require per-country pension contribution config when explicitly provided for that country.
      // If omitted, the simulation treats it as 0% contributions for that residence period.
      if (contribMap && Object.keys(contribMap).length > 0 && !contribOk) contribMissing.push(code);
    }
  }

  if (allocMissing.length || contribMissing.length) {
    errors = true;
    success = false;
    var parts = [];
    if (allocMissing.length) parts.push('allocations: ' + allocMissing.join(', '));
    if (contribMissing.length) parts.push('pension contributions: ' + contribMissing.join(', '));
    uiManager.ui.setError(new Error('Missing per-country inputs (' + parts.join('; ') + ')'));
    return false;
  }

  return true;
}

function completeMissingCurrencyAndLinkedCountry(events, startCountry) {
  for (var i = 0; i < events.length; i++) {
    var evt = events[i];
    if (!evt || !evt.type) continue;
    if (isRelocationEvent(evt)) continue;
    if (!evt.linkedCountry && evt.type === 'RI') {
      evt.__autoLinkedCountry = false;
      continue;
    }
    var eventCountry = getCountryForAgeCached(Number(evt.fromAge), events, startCountry);
    if (!evt.linkedCountry) {
      evt.linkedCountry = eventCountry;
      evt.__autoLinkedCountry = true;
    } else {
      evt.__autoLinkedCountry = false;
    }
    var expectedCurrency = getCurrencyForCountry(evt.linkedCountry);
    if (!expectedCurrency) {
      errors = true;
      success = false;
      if (uiManager && typeof uiManager.setStatus === 'function') {
        uiManager.setStatus("Missing ruleset currency for country: " + evt.linkedCountry, STATUS_COLORS.ERROR);
      }
      return false;
    }
    expectedCurrency = normalizeCurrency(expectedCurrency);
    if (!evt.currency) {
      evt.currency = expectedCurrency;
    } else if (normalizeCurrency(evt.currency) !== expectedCurrency) {
      errors = true;
      success = false;
      if (uiManager && typeof uiManager.setStatus === 'function') {
        uiManager.setStatus(
          "Currency/country mismatch: " + normalizeCurrency(evt.currency) + " does not match " + evt.linkedCountry + " (" + expectedCurrency + ")",
          STATUS_COLORS.ERROR
        );
      }
      return false;
    }
  }
  return true;
}

function saveToFile() {
  uiManager.setStatus("Preparing to save", STATUS_COLORS.INFO);
  if (readScenario(false)) {
    uiManager.saveToFile();
  }
  uiManager.setStatus("", STATUS_COLORS.INFO);
}

function loadFromFile(file) {
  uiManager.loadFromFile(file);
}

function initializeSimulationVariables() {
  // Get growth rates and volatilities from dynamic maps
  var growthByKey = params.investmentGrowthRatesByKey || {};
  // In deterministic mode, volatility must be zero (even if scenario provides stddev fields).
  // Monte Carlo mode is the only time stdev is applied.
  var volByKey = montecarlo ? (params.investmentVolatilitiesByKey || {}) : {};
  // BaseRef wrappers read GlobalAssetVolatility_* directly from params in InvestmentTypeFactory.
  // Zero those values in deterministic mode to keep deterministic runs truly non-stochastic.
  var assetFactoryParams = params;
  if (!montecarlo) {
    assetFactoryParams = {};
    for (var pk in params) {
      if (!Object.prototype.hasOwnProperty.call(params, pk)) continue;
      assetFactoryParams[pk] = params[pk];
    }
    for (var ak in assetFactoryParams) {
      if (!Object.prototype.hasOwnProperty.call(assetFactoryParams, ak)) continue;
      if (String(ak).indexOf('GlobalAssetVolatility_') === 0) {
        assetFactoryParams[ak] = 0;
      }
    }
  }
  // Initialize legacy single-country instruments for the StartCountry (used by some legacy columns/paths).
  var sc = String(params.StartCountry || config.getDefaultCountry()).toLowerCase();
  
  // Create generic assets array using the factory
  // Per strictness §9: investmentAssets must always be a valid, non-empty array
  try {
    var cfg = Config.getInstance();
    var startCode = String(params.StartCountry || config.getDefaultCountry()).toLowerCase();
    var countryOrder = [];
    var seenCountries = {};
    if (startCode) { countryOrder.push(startCode); seenCountries[startCode] = true; }
    for (var ei = 0; ei < events.length; ei++) {
      var evt = events[ei];
      if (isRelocationEvent(evt)) {
        var mvCode = getRelocationCountryCode(evt);
        if (mvCode && !seenCountries[mvCode]) { countryOrder.push(mvCode); seenCountries[mvCode] = true; }
      }
      if (evt && evt.linkedCountry) {
        var lc = String(evt.linkedCountry).toLowerCase();
        if (lc && !seenCountries[lc]) { countryOrder.push(lc); seenCountries[lc] = true; }
      }
    }
    investmentAssets = [];
    var seenKeys = {};
    for (var ci = 0; ci < countryOrder.length; ci++) {
      var code = countryOrder[ci];
      var rs = cfg.getCachedTaxRuleSet(code);
      if (rs && typeof InvestmentTypeFactory !== 'undefined') {
        var assets = InvestmentTypeFactory.createAssets(rs, growthByKey, volByKey, assetFactoryParams);
        for (var ai = 0; ai < assets.length; ai++) {
          var a = assets[ai];
          if (a && a.key && !seenKeys[a.key]) {
            investmentAssets.push(a);
            seenKeys[a.key] = true;
          }
        }
      }
    }
  } catch (e) {
    // Catch silently - fallback validation below will handle it
  }

  // Ensure investmentAssets is always populated
  if (!investmentAssets || investmentAssets.length === 0) {
    throw new Error('No investment assets created. Check tax rules configuration.');
  }
  // Initialize investment assets with initial capital from dynamic map
  var initialCapitalByKey = params.initialCapitalByKey || {};
  // Backward compat: project base keys (indexFunds/shares) onto namespaced keys (indexFunds_ie/shares_ie)
  // so tests/scenarios that seed initialFunds/initialShares still work with investmentTypes.
  if (investmentAssets && investmentAssets.length > 0) {
    for (var ik = 0; ik < investmentAssets.length; ik++) {
      var entryKey = investmentAssets[ik] && investmentAssets[ik].key;
      if (!entryKey) continue;
      if (initialCapitalByKey[entryKey] !== undefined) continue;
      if (String(entryKey).indexOf('_') > 0) {
        var baseKey = String(entryKey).split('_')[0];
        if (initialCapitalByKey[baseKey] !== undefined) {
          initialCapitalByKey[entryKey] = initialCapitalByKey[baseKey];
        }
      }
    }
  }
  var startCountry = normalizeCountry(params.StartCountry || config.getDefaultCountry());
  // Build set of StartCountry investment type keys for initial capital filtering
  var startCountryKeys = {};
  try {
    var startRuleset = cfg.getCachedTaxRuleSet(startCountry);
    if (startRuleset && typeof startRuleset.getResolvedInvestmentTypes === 'function') {
      var startTypes = startRuleset.getResolvedInvestmentTypes() || [];
      for (var si = 0; si < startTypes.length; si++) {
        if (startTypes[si] && startTypes[si].key) {
          startCountryKeys[startTypes[si].key] = true;
        }
      }
    }
  } catch (_) {
    // Fallback: if ruleset unavailable, allow all keys (backward compat)
    startCountryKeys = null;
  }
  var startCurrency = getCurrencyForCountry(startCountry);
  var startAgeForMix = params.startingAge;
  for (var i = 0; i < investmentAssets.length; i++) {
    var entry = investmentAssets[i];
    var initialCapital = initialCapitalByKey[entry.key];
    // Only seed holdings for StartCountry investment types
    if (initialCapital > 0 && (startCountryKeys === null || startCountryKeys[entry.key])) {
      var currency = entry.baseCurrency || startCurrency;
      var country = entry.assetCountry || startCountry;
      var mixConfig = entry.asset.mixConfig;
      if (mixConfig && (mixConfig.type === 'fixed' || mixConfig.type === 'glidePath')) {
        var asset1Pct = mixConfig.startAsset1Pct;
        if (mixConfig.type === 'glidePath' && typeof GlidePathCalculator !== 'undefined') {
          var seededMix = GlidePathCalculator.getCurrentMix(startAgeForMix, mixConfig);
          if (seededMix) asset1Pct = seededMix.asset1Pct;
        }
        if (asset1Pct === null || asset1Pct === undefined) asset1Pct = mixConfig.endAsset1Pct;
        var amount1 = initialCapital * (asset1Pct / 100);
        var amount2 = initialCapital - amount1;
        if (amount1 > 0) entry.asset.buy(amount1, currency, country, 1);
        if (amount2 > 0) entry.asset.buy(amount2, currency, country, 2);
      } else {
        entry.asset.buy(initialCapital, currency, country);
      }
    }
  }

  // Initialize stable tax ids from ruleset for consistent Tax__ columns
  try {
    var _rs = (function () { try { return Config.getInstance().getCachedTaxRuleSet(params.StartCountry || config.getDefaultCountry()); } catch (_) { return null; } })();
    stableTaxIds = (_rs && typeof _rs.getTaxOrder === 'function') ? _rs.getTaxOrder() : ['incomeTax', 'capitalGains'];
  } catch (e) {
    stableTaxIds = ['incomeTax', 'capitalGains'];
  }

  var baseStateCountry = (params.StartCountry || config.getDefaultCountry() || '').toLowerCase();
  var baseStateCurrency = getCurrencyForCountry(baseStateCountry) || 'EUR';

  // Initialize Person 1 (P1)
  const p1SpecificParams = {
    startingAge: params.startingAge,
    retirementAge: params.retirementAge,
    statePensionByCountry: params.statePensionByCountry
  };
  person1 = new Person('P1', p1SpecificParams, params, {
    growthRatePension: params.growthRatePension,
    growthDevPension: params.growthDevPension
  });
  var p1Pension = person1.getPensionForCountry(baseStateCountry);
  var p1MixConfig = resolvePensionMixConfig(person1, baseStateCountry);
  p1Pension.mixConfig = p1MixConfig || null;
  if (params.initialPension > 0) {
    buyPensionWithMix(p1Pension, params.initialPension, baseStateCurrency, baseStateCountry, p1MixConfig, person1.age + 1);
  }

  // Initialize Person 2 (P2) if the mode is 'couple'
  if (params.simulation_mode === 'couple') {
    // Check if P2 starting age is provided; if not, it's a configuration issue that
    // should ideally be caught by UI validation, but we proceed with P2 initialization.
    // The Person class constructor will handle a missing/zero starting age if necessary,
    // though UI validation aims to prevent this.
    if (!params.p2StartingAge || params.p2StartingAge === 0) {
      // Optionally, log a warning here if P2 starting age is missing in couple mode,
      // though UI should prevent saving/running in this state.
      // console.warn("Simulator: Person 2 starting age is missing or zero in couple mode.");
    }

    const p2SpecificParams = {
      startingAge: params.p2StartingAge, // Will be 0 or undefined if not set
      retirementAge: params.p2RetirementAge,
      statePensionByCountry: params.p2StatePensionByCountry
    };
    person2 = new Person('P2', p2SpecificParams, params, {
      growthRatePension: params.growthRatePension,
      growthDevPension: params.growthDevPension
    });
    var p2Pension = person2.getPensionForCountry(baseStateCountry);
    var p2MixConfig = resolvePensionMixConfig(person2, baseStateCountry);
    p2Pension.mixConfig = p2MixConfig || null;
    if (params.initialPensionP2 > 0) {
      buyPensionWithMix(p2Pension, params.initialPensionP2, baseStateCurrency, baseStateCountry, p2MixConfig, person2.age + 1);
    }
  } else {
    person2 = null;
  }

  periods = 0;
  success = true;
  stockGrowthOverride = undefined;

  // Initialize country context for multi-country support
  // Note: event.currency is NOT used for inflation decisions; it's for display/conversion only
  // Only event.rate (override), event.linkedCountry, and currentCountry determine inflation
  currentCountry = ((params.StartCountry || config.getDefaultCountry() || '') + '').toLowerCase();
  countryInflationOverrides = {};
  residenceCurrency = getCurrencyForCountry(currentCountry)
    || getCurrencyForCountry(params.StartCountry || config.getDefaultCountry())
    || normalizeCurrency(residenceCurrency)
    || 'EUR';

  initializeRealEstate();

  year = config.getSimulationStartYear() - 1;
  cash = params.initialSavings;
  cashMoney = Money.from(params.initialSavings, residenceCurrency, currentCountry);
  targetCash = params.emergencyStash; // Initialize target cash (emergency stash) in starting currency
  failedAt = 0;
  row = 0;

  // Pick starting economic regime
  if (economicRegimesModel) {
    currentEconomicRegime = economicRegimesModel.sampleStartingRegime();
  } else {
    currentEconomicRegime = null;
  }
}

function resetYearlyVariables() {
  // Increment global year
  year++;

  // Reset attribution manager for the new year
  var baseCountry = ((params.StartCountry || config.getDefaultCountry() || '') + '').toLowerCase();
  attributionManager.reset(currentCountry, year, baseCountry);

  // Call Person-specific yearly variable resets
  person1.resetYearlyVariables();
  if (person2) person2.resetYearlyVariables();

  // Reset global yearly accumulators
  incomeSalaries = 0;
  incomeShares = 0;
  incomeRentals = 0;
  incomeSale = 0;
  incomePrivatePension = 0;
  incomeStatePension = 0;
  incomeDefinedBenefit = 0;
  incomeTaxFree = 0;
  pensionContribution = 0;
  // Reset per-type income map for the year
  investmentIncomeByKey = {};
  personalPensionContribution = 0;
  personalPensionContributionByCountry = {};
  incomePrivatePensionByCountry = {};
  incomeSalariesByCountry = {};
  incomeRentalsByCountry = {};
  withdrawalRate = 0;
  cashDeficit = 0;
  cashWithdraw = 0;
  savings = 0;
  purchaseShortfallThisYear = 0;
  purchaseCashUsedThisYear = 0;

  // Add year to Person objects (this increments their ages and calls pension.addYear())
  person1.addYear();
  if (person2) person2.addYear();

  // Pass Person objects to revenue reset (now using updated ages and year)
  revenue.reset(person1, person2, attributionManager, currentCountry, year);

  // Add year to investment assets
  if (investmentAssets && investmentAssets.length > 0) {
    for (var i = 0; i < investmentAssets.length; i++) {
      var ga = investmentAssets[i].asset;
      if (!ga || !ga.addYear) continue;
      ga.addYear();
    }
  }
  realEstate.addYear();

  // Reset yearly statistics for attribution tracking
  if (investmentAssets && investmentAssets.length > 0) {
    for (var j = 0; j < investmentAssets.length; j++) {
      var assetObj = investmentAssets[j].asset;
      if (!assetObj || !assetObj.resetYearlyStats) continue;
      assetObj.resetYearlyStats();
    }
  }

  // Transition economic regime
  if (economicRegimesModel && currentEconomicRegime) {
    currentEconomicRegime = economicRegimesModel.getNextRegime(currentEconomicRegime);
  }

  residenceCurrency = getCurrencyForCountry(currentCountry) || residenceCurrency || 'EUR';
}

function resolveCountryInflation(code) {
  // Prefer InflationService when available to keep logic in one place.
  if (typeof InflationService !== 'undefined' && InflationService && typeof InflationService.resolveInflationRate === 'function') {
    return InflationService.resolveInflationRate(code, year, {
      params: params,
      config: config,
      economicData: economicData,
      baseCountry: baseCountryCode
    });
  }

  // Fallback: legacy inline logic (kept for safety in non-browser test contexts).
  var key = normalizeCountry(code);
  if (!key) key = baseCountryCode;
  var perCountryKey = 'Inflation_' + key;
  if (typeof params[perCountryKey] === 'number') {
    return params[perCountryKey];
  }
  if (economicData && economicData.ready) {

    if (typeof economicData.getInflationForYear === 'function') {
      var inflationForYear = economicData.getInflationForYear(key, year);
      if (inflationForYear != null) {
        return Number(inflationForYear) / 100;
      }
    }
    var inflation = economicData.getInflation(key);
    if (inflation != null) {
      return Number(inflation) / 100;
    }
  }
  // Compatibility scalar bridge for non-country-aware callers/tests.
  // UIManager derives params.inflation from canonical Inflation_<StartCountry>.
  if (key === baseCountryCode && typeof params.inflation === 'number') {
    return params.inflation;
  }
  return null;
}

function runSimulation() {
  initializeSimulationVariables();
  // Clear cross-border country history at the start of each run (fixes accumulation across Monte Carlo runs)
  revenue.countryHistory = [];

  while (person1.age < params.targetAge) {
    row++;
    periods = row - 1;
    resetYearlyVariables();
    calculatePensionIncome();
    processEvents();
    handleInvestments();
    updateYearlyData();
  }
  return success;
}

function calculatePensionIncome() {
  // Calculate pension income for Person 1
  const p1CalcResults = person1.calculateYearlyPensionIncome(config, currentCountry, residenceCurrency, year);
  if (p1CalcResults && p1CalcResults.lumpSumAmount === null) {
    flagSimulationFailure(person1.age);
    return;
  }
  /**
   * @assumes residenceCurrency - Pension lump sums are pre-converted by Person.calculateYearlyPensionIncome().
   * @performance Hot path - direct .amount access for zero overhead in yearly simulation loop.
   */
  if (p1CalcResults.lumpSumAmount > 0) {
    cash += p1CalcResults.lumpSumAmount;
    cashMoney.amount += p1CalcResults.lumpSumAmount;
    // Note: Lump sum tax is already declared in Pension.declareRevenue() when getLumpsum() calls sell()
  }
  if (person1.yearlyIncomePrivatePension === null) {
    flagSimulationFailure(person1.age);
    return;
  }
  if (person1.yearlyIncomePrivatePension > 0) {
    // Record per-country private pension income attributions
    if (p1CalcResults && p1CalcResults.privatePensionByCountry) {
      for (var p1AttrCountry in p1CalcResults.privatePensionByCountry) {
        if (!Object.prototype.hasOwnProperty.call(p1CalcResults.privatePensionByCountry, p1AttrCountry)) continue;
        var p1AttrAmount = p1CalcResults.privatePensionByCountry[p1AttrCountry];
        if (p1AttrAmount > 0) {
          var p1MetricKey = 'incomeprivatepension';
          if (p1AttrCountry !== currentCountry) {
            p1MetricKey = 'incomeprivatepension:' + p1AttrCountry;
          }
          attributionManager.record(p1MetricKey, 'Your Private Pension', p1AttrAmount, { sourceCountry: p1AttrCountry });
        }
      }
    } else {
      // Fallback for single-country scenarios
      attributionManager.record('incomeprivatepension', 'Your Private Pension', person1.yearlyIncomePrivatePension, { sourceCountry: currentCountry });
    }
    incomePrivatePension += person1.yearlyIncomePrivatePension;
  }
  // Accumulate per-country private pension income for PV calculations
  if (p1CalcResults && p1CalcResults.privatePensionByCountry) {
    for (var p1Country in p1CalcResults.privatePensionByCountry) {
      if (!Object.prototype.hasOwnProperty.call(p1CalcResults.privatePensionByCountry, p1Country)) continue;
      incomePrivatePensionByCountry[p1Country] = (incomePrivatePensionByCountry[p1Country] || 0) + p1CalcResults.privatePensionByCountry[p1Country];
    }
  }
  var person1StatePension = person1.yearlyIncomeStatePension ? person1.yearlyIncomeStatePension.amount : 0;
  if (person1StatePension > 0) {
    attributionManager.record('incomestatepension', 'Your State Pension', person1StatePension, { sourceCountry: currentCountry });
    incomeStatePension += person1StatePension;
  }

  // Calculate pension income for Person 2 (if exists)
  if (person2) {
    const p2CalcResults = person2.calculateYearlyPensionIncome(config, currentCountry, residenceCurrency, year);
    if (p2CalcResults && p2CalcResults.lumpSumAmount === null) {
      flagSimulationFailure(person2.age);
      return;
    }
    /**
     * @assumes residenceCurrency - P2 pension lump sums are pre-converted by Person.calculateYearlyPensionIncome().
     * @performance Hot path - direct .amount access for zero overhead.
     */
    if (p2CalcResults.lumpSumAmount > 0) {
      cash += p2CalcResults.lumpSumAmount;
      cashMoney.amount += p2CalcResults.lumpSumAmount;
      // Note: Lump sum tax is already declared in Pension.declareRevenue() when getLumpsum() calls sell()
    }
    if (person2.yearlyIncomePrivatePension === null) {
      flagSimulationFailure(person2.age);
      return;
    }
    if (person2.yearlyIncomePrivatePension > 0) {
      // Record per-country private pension income attributions for person 2
      if (p2CalcResults && p2CalcResults.privatePensionByCountry) {
        for (var p2AttrCountry in p2CalcResults.privatePensionByCountry) {
          if (!Object.prototype.hasOwnProperty.call(p2CalcResults.privatePensionByCountry, p2AttrCountry)) continue;
          var p2AttrAmount = p2CalcResults.privatePensionByCountry[p2AttrCountry];
          if (p2AttrAmount > 0) {
            var p2MetricKey = 'incomeprivatepension';
            if (p2AttrCountry !== currentCountry) {
              p2MetricKey = 'incomeprivatepension:' + p2AttrCountry;
            }
            attributionManager.record(p2MetricKey, 'Their Private Pension', p2AttrAmount, { sourceCountry: p2AttrCountry });
          }
        }
      } else {
        // Fallback for single-country scenarios
        attributionManager.record('incomeprivatepension', 'Their Private Pension', person2.yearlyIncomePrivatePension, { sourceCountry: currentCountry });
      }
      incomePrivatePension += person2.yearlyIncomePrivatePension;
    }
    // Accumulate per-country private pension income for PV calculations
    if (p2CalcResults && p2CalcResults.privatePensionByCountry) {
      for (var p2Country in p2CalcResults.privatePensionByCountry) {
        if (!Object.prototype.hasOwnProperty.call(p2CalcResults.privatePensionByCountry, p2Country)) continue;
        incomePrivatePensionByCountry[p2Country] = (incomePrivatePensionByCountry[p2Country] || 0) + p2CalcResults.privatePensionByCountry[p2Country];
      }
    }
    var person2StatePension = person2.yearlyIncomeStatePension ? person2.yearlyIncomeStatePension.amount : 0;
    if (person2StatePension > 0) {
      attributionManager.record('incomestatepension', 'Their State Pension', person2StatePension, { sourceCountry: currentCountry });
      incomeStatePension += person2StatePension;
    }
  }

  // Declare total state pension to revenue
  const statePensionMoney = Money.from(incomeStatePension, residenceCurrency, currentCountry);
  revenue.declareStatePensionIncome(statePensionMoney);
}

function processEvents() {
  expenses = 0;
  if (!countryInflationOverrides) countryInflationOverrides = {};
  economicData = (typeof config.getEconomicData === 'function') ? config.getEconomicData() : null;
  baseCountryCode = ((params.StartCountry || config.getDefaultCountry() || '') + '').toLowerCase();


  function createFlowState() {
    return {
      incomeBuckets: {},
      expenseBuckets: {},
      orderedEntries: []
    };
  }

  function getEffectiveCurrency(info) {
    var currency = normalizeCurrency((info && info.currency) ? info.currency : (residenceCurrency || 'EUR'));
    var country = (info && info.country) ? normalizeCountry(info.country) : normalizeCountry(currentCountry);
    return {
      currency: currency,
      country: country
    };
  }

  function ensureBucket(map, info) {
    var eff = getEffectiveCurrency(info);
    var key = eff.currency + '::' + eff.country;
    if (!map[key]) {
      map[key] = { currency: eff.currency, country: eff.country, total: 0, categories: {} };
    }
    return key;
  }

  function recordIncomeEntry(state, info, amount, payload) {
    var entry = payload || {};
    if (!state) return;
    if (!amount && !entry.allowZero) return;
    var key = ensureBucket(state.incomeBuckets, info);
    state.incomeBuckets[key].total += amount;
    var eff = getEffectiveCurrency(info);
    entry.info = eff;
    entry.bucketKey = key;
    entry.kind = 'income';
    entry.amount = amount;
    var bucket = state.incomeBuckets[key];
    var catKey = entry.type || 'unknown';
    if (!bucket.categories[catKey]) bucket.categories[catKey] = 0;
    bucket.categories[catKey] += amount;
    state.orderedEntries.push(entry);
  }

  function recordExpenseEntry(state, info, amount, payload) {
    if (!state || !amount) return;
    var key = ensureBucket(state.expenseBuckets, info);
    state.expenseBuckets[key].total += amount;
    var entry = payload || {};
    var eff = getEffectiveCurrency(info);
    entry.info = eff;
    entry.bucketKey = key;
    entry.kind = 'expense';
    entry.amount = amount;
    var bucket = state.expenseBuckets[key];
    var catKey = entry.type || 'unknown';
    if (!bucket.categories[catKey]) bucket.categories[catKey] = 0;
    bucket.categories[catKey] += amount;
    state.orderedEntries.push(entry);
  }

  var incomeByCurrency = {};
  var expensesByCurrency = {};
  var conversionFactorCache = {};

  function getConversionFactor(currency, country) {
    var normalizedCurrency = normalizeCurrency(currency || residenceCurrency || 'EUR');
    var normalizedCountry = normalizeCountry(country || currentCountry);
    var cacheKey = normalizedCurrency + '::' + normalizedCountry + '::' + year;
    if (conversionFactorCache.hasOwnProperty(cacheKey)) {
      return conversionFactorCache[cacheKey];
    }
    if (!normalizedCurrency || normalizedCurrency === normalizeCurrency(residenceCurrency)) {
      conversionFactorCache[cacheKey] = 1;
      return 1;
    }
    var factor = convertCurrencyAmount(1, normalizedCurrency, normalizedCountry, residenceCurrency, currentCountry, year);
    if (factor === null) {
      // Conversion failure: abort simulation
      success = false;
      failedAt = person1.age;
      return 1; // Return 1 to avoid division by zero, but simulation will fail due to errors flag
    }
    conversionFactorCache[cacheKey] = factor;
    return factor;
  }


  function flushFlowState(state) {
    if (!state || state.orderedEntries.length === 0) return;

    // Consolidation step: compute net flows per currency before any conversion
    var netByCurrency = {};
    var allCurrencies = {};
    for (var key in state.incomeBuckets) {
      if (!Object.prototype.hasOwnProperty.call(state.incomeBuckets, key)) continue;
      allCurrencies[key] = true;
      var incomeTotal = state.incomeBuckets[key].total || 0;
      var expenseTotal = (state.expenseBuckets[key] && state.expenseBuckets[key].total) || 0;
      netByCurrency[key] = incomeTotal - expenseTotal;
      if (incomeByCurrency) {
        var cur = state.incomeBuckets[key].currency;
        incomeByCurrency[cur] = (incomeByCurrency[cur] || 0) + incomeTotal;
      }
      if (expensesByCurrency && state.expenseBuckets[key]) {
        var curExp = state.expenseBuckets[key].currency;
        expensesByCurrency[curExp] = (expensesByCurrency[curExp] || 0) + expenseTotal;
      }
    }
    for (var keyExp in state.expenseBuckets) {
      if (!Object.prototype.hasOwnProperty.call(state.expenseBuckets, keyExp)) continue;
      if (!allCurrencies[keyExp]) {
        allCurrencies[keyExp] = true;
        var expTotal = state.expenseBuckets[keyExp].total || 0;
        netByCurrency[keyExp] = -expTotal;
        if (expensesByCurrency) {
          var curExpOnly = state.expenseBuckets[keyExp].currency;
          expensesByCurrency[curExpOnly] = (expensesByCurrency[curExpOnly] || 0) + expTotal;
        }
      }
    }

    // Convert only the net for each non-residence currency
    var categoryTotalsByType = {}; // Track consolidated amounts by entry type
    var resCurrencyNorm = normalizeCurrency(residenceCurrency);

    for (var curKey in netByCurrency) {
      if (!Object.prototype.hasOwnProperty.call(netByCurrency, curKey)) continue;
      var netAmount = netByCurrency[curKey];

      var bucket = state.incomeBuckets[curKey] || state.expenseBuckets[curKey];
      if (!bucket) continue;
      var bucketCurrency = normalizeCurrency(bucket.currency);
      var bucketCountry = normalizeCountry(bucket.country);

      // Derive a single forward conversion factor per bucket (foreign→residence) for arithmetic consistency
      var categoryConversionFactor = 1;
      if (bucketCurrency !== resCurrencyNorm) {
        categoryConversionFactor = getConversionFactor(bucketCurrency, bucketCountry);
      }

      var incomeBucket = state.incomeBuckets[curKey];
      var expenseBucket = state.expenseBuckets[curKey];

      if (incomeBucket && incomeBucket.categories) {
        for (var cat in incomeBucket.categories) {
          if (!Object.prototype.hasOwnProperty.call(incomeBucket.categories, cat)) continue;
          var catAmount = incomeBucket.categories[cat];
          var convertedCat = (bucketCurrency === resCurrencyNorm) ? catAmount : (catAmount * categoryConversionFactor);
          if (!categoryTotalsByType[cat]) categoryTotalsByType[cat] = 0;
          categoryTotalsByType[cat] += convertedCat;
        }
      }

      if (expenseBucket && expenseBucket.categories) {
        for (var catExp in expenseBucket.categories) {
          if (!Object.prototype.hasOwnProperty.call(expenseBucket.categories, catExp)) continue;
          var catExpAmount = expenseBucket.categories[catExp];
          var convertedCatExp = (bucketCurrency === resCurrencyNorm) ? catExpAmount : (catExpAmount * categoryConversionFactor);
          if (!categoryTotalsByType[catExp]) categoryTotalsByType[catExp] = 0;
          categoryTotalsByType[catExp] += convertedCatExp;
        }
      }
    }

      // Track which categories have been counted/declared (aggregate across all currencies)
      var countedCategories = {};
      var declaredEntries = {};

    // Post entries for attribution and declarations using consolidated amounts
    for (var i = 0; i < state.orderedEntries.length; i++) {
      var entry = state.orderedEntries[i];
      var bucket = (entry.kind === 'income') ? state.incomeBuckets[entry.bucketKey] : state.expenseBuckets[entry.bucketKey];
      if (!bucket) continue;

      var bucketCurrency = normalizeCurrency(bucket.currency);
      var bucketCountry = normalizeCountry(bucket.country);
      var isResidenceCurrency = bucketCurrency === resCurrencyNorm;

      // Compute conversion factor for this currency (always forward: foreign → residence)
      // For attribution, we always convert entries from their currency to residence currency
      var entryConversionFactor = 1;
      if (!isResidenceCurrency) {
        // Always use forward conversion (foreign → residence) for attribution
        entryConversionFactor = getConversionFactor(bucketCurrency, bucketCountry);
      }

      // For attribution, convert entry amount using the forward conversion factor
      var entryConvertedAmount = entry.amount * entryConversionFactor;

      // Use entry type for category tracking (aggregate across all currencies)
      var entryCategory = entry.type || 'unknown';
      // IMPORTANT: event IDs are not unique across the scenario (e.g., split events before/after relocation
      // can share the same id like "You"). Declaration de-duping must therefore be keyed per entry instance,
      // not per eventId, otherwise we under-declare income to Taxman and under-tax (see TestChartValues).
      var entryKey = (entry.eventId ? String(entry.eventId) : entryCategory) +
        '::' + String(entry.kind || '') +
        '::' + String(entry.bucketKey || '') +
        '::' + String(i);

      switch (entry.type) {
        /**
         * @assumes residenceCurrency - Property sale amounts are pre-converted via getConversionFactor().
         * @performance Hot path - direct .amount access for zero overhead.
         */
        case 'sale': {
          cash += entryConvertedAmount;
          cashMoney.amount += entryConvertedAmount;
          incomeSale += entryConvertedAmount;
          attributionManager.record('incomesale', entry.label || ('Sale (' + entry.eventId + ')'), entryConvertedAmount);
          attributionManager.record('realestatecapital', entry.label || ('Sale (' + entry.eventId + ')'), -entryConvertedAmount);
          var salePropertyId = entry.eventId;
          var forwardSettlement = (typeof entry.forwardMortgagePayoff === 'number') ? (entry.forwardMortgagePayoff * entryConversionFactor) : 0;
          var reverseSettlement = (typeof entry.reverseMortgagePayoff === 'number') ? (entry.reverseMortgagePayoff * entryConversionFactor) : 0;
          var reverseWriteOff = (typeof entry.reverseMortgageWriteOff === 'number') ? (entry.reverseMortgageWriteOff * entryConversionFactor) : 0;
          if (forwardSettlement > 0) {
            attributionManager.record('expenses', 'Mortgage Settlement (' + salePropertyId + ')', forwardSettlement);
          }
          if (reverseSettlement > 0) {
            attributionManager.record('expenses', 'Reverse Mortgage Settlement (' + salePropertyId + ')', reverseSettlement);
          }
          if (reverseWriteOff > 0) {
            attributionManager.record('realestatecapital', 'Reverse Mortgage Write-off (' + salePropertyId + ')', -reverseWriteOff);
          }

          // Compute property gain and declare to Taxman
          var propertyId = entry.eventId;
          var purchaseBasisConverted = 0;
          if (typeof entry.purchaseBasis === 'number' && entry.purchaseBasis > 0) {
            purchaseBasisConverted = entry.purchaseBasis * entryConversionFactor;
          }
          if (purchaseBasisConverted > 0 && entryConvertedAmount > purchaseBasisConverted) {
            var gain = entryConvertedAmount - purchaseBasisConverted;
            var propertyCountry = entry.propertyCountry;
            var heldYears = entry.heldYears;
            var residentCountryAtSale = entry.residentCountryAtSale;
            var primaryResidenceProportion = entry.primaryResidenceProportion;
            var gainMoney = Money.create(gain, residenceCurrency, currentCountry);
            var sourceTaxman = null;

            // Residence-country tax always applies according to active residency rules.
            revenue.declarePropertyGain(
              gainMoney,
              heldYears,
              residentCountryAtSale,
              primaryResidenceProportion,
              propertyCountry,
              'Property Sale (' + propertyId + ')'
            );

            // Source-country tax also applies for cross-border property sales.
            if (propertyCountry && propertyCountry !== currentCountry) {
              var sourceRuleset = Config.getInstance().getCachedTaxRuleSet(propertyCountry);
              if (sourceRuleset) {
                sourceTaxman = new Taxman();
                sourceTaxman.reset(person1, person2, attributionManager, propertyCountry, year);
                sourceTaxman.ruleset = sourceRuleset;
                sourceTaxman.residenceCurrency = residenceCurrency;
                sourceTaxman.declarePropertyGain(
                  gainMoney,
                  heldYears,
                  propertyCountry,
                  primaryResidenceProportion,
                  propertyCountry,
                  'Property Sale (' + propertyId + ')'
                );
              }
            }

            if (sourceTaxman) {
              sourceTaxman.computeTaxes();
              var sourceTaxTotals = sourceTaxman.taxTotals || {};
              for (var sourceTaxKey in sourceTaxTotals) {
                if (!Object.prototype.hasOwnProperty.call(sourceTaxTotals, sourceTaxKey)) continue;
                var sourceTaxAmount = sourceTaxTotals[sourceTaxKey];
                if (!(typeof sourceTaxAmount === 'number') || sourceTaxAmount <= 0) continue;
                revenue.declareExternalTax(sourceTaxKey, propertyCountry, 'Property Sale Tax (' + propertyId + ')', sourceTaxAmount);
              }
            }
          }
          break;
        }

        case 'salary': {
          var salaryPerson = entry.personRef || person1;
          var isPensionable = entry.pensionable && salaryPerson && typeof salaryPerson.getPensionForCountry === 'function';
          var declaredRate = 0;
          var salarySourceCountry = normalizeCountry(entry.sourceCountry || bucketCountry);
          if (!salarySourceCountry) salarySourceCountry = normalizeCountry(bucketCountry);

          // Use consolidated total for incomeSalaries accumulation (only once per currency bucket)
          var consolidatedSalary = categoryTotalsByType['salary'] || 0;
          if (!countedCategories[entryCategory] && consolidatedSalary > 0) {
            incomeSalaries += consolidatedSalary;
            countedCategories[entryCategory] = true;
          }

          // Track salary by country for PV calculation
          // IMPORTANT: Track amounts in the salary's own currency (not residence currency).
          // PV conversion happens later using start-year FX to avoid embedding evolved FX
          // into PV results (critical for overlap years with multi-currency incomes).
          if (entry.amount > 0) {
            var salaryCountry = normalizeCountry(bucketCountry);
            if (!incomeSalariesByCountry[salaryCountry]) {
              incomeSalariesByCountry[salaryCountry] = 0;
            }
            incomeSalariesByCountry[salaryCountry] += entry.amount;
          }

          // Determine if country qualification is needed for salary attribution
          var salaryMetricKey = 'incomesalaries';
          if (bucketCountry && bucketCountry !== currentCountry) {
            salaryMetricKey = 'incomesalaries:' + bucketCountry;
          }
          attributionManager.record(salaryMetricKey, entry.eventId, entryConvertedAmount, { sourceCountry: bucketCountry });

          if (isPensionable && entryConvertedAmount > 0) {
            // Use salary's origin country for pension rules (not current residence)
            var rsSalary = (function () { try { return Config.getInstance().getCachedTaxRuleSet(bucketCountry); } catch (_) { return null; } })();

            // Check if salary's origin country has private pension system
            var pensionSystemType = (rsSalary && typeof rsSalary.getPensionSystemType === 'function')
              ? rsSalary.getPensionSystemType() : 'mixed';

            // State-only countries don't allow private pension contributions
            if (pensionSystemType === 'state_only') {
              // No private pension contributions in this country
              // declaredRate stays 0, salary processing continues without pension
            } else {
              // Country has private pension - use current country's pension pot
              var bands = (rsSalary && typeof rsSalary.getPensionContributionAgeBands === 'function') ? rsSalary.getPensionContributionAgeBands() : {};
              var countryContribs = getPensionContributionsByCountry(year);
              var contribPct = null;
              if (countryContribs) {
                if (typeof person2 !== 'undefined' && salaryPerson === person2 && countryContribs.p2Pct !== undefined) {
                  contribPct = countryContribs.p2Pct;
                } else if (countryContribs.p1Pct !== undefined) {
                  contribPct = countryContribs.p1Pct;
                }
              }
              var effectivePct = (contribPct !== null && contribPct !== undefined) ? contribPct : 0;
              var baseRate = effectivePct * getRateForKey(salaryPerson.age, bands);

              // Use salary's origin country for pension pot (not current residence)
              var pensionCountry = bucketCountry;
              var pensionCurrency = getCurrencyForCountry(pensionCountry);
              var pensionBaseAmount = entry.amount;

              // Convert to pension country currency if bucket currency differs
              if (bucketCurrency !== pensionCurrency && typeof convertCurrencyAmount === 'function') {
                var convertedToPensionCurrency = convertCurrencyAmount(entry.amount, bucketCurrency, bucketCountry, pensionCurrency, pensionCountry, year);
                if (convertedToPensionCurrency === null) {
                  flagSimulationFailure(person1.age);
                  return;
                }
                if (isFinite(convertedToPensionCurrency) && convertedToPensionCurrency > 0) {
                  pensionBaseAmount = convertedToPensionCurrency;
                }
              }
              var effectiveCapped = (countryContribs && countryContribs.capped !== undefined)
                ? countryContribs.capped
                : (params.pensionCapped || 'No');
              if (effectiveCapped === "Yes") {
                var cap = (rsSalary && typeof rsSalary.getPensionContributionAnnualCap === 'function') ? rsSalary.getPensionContributionAnnualCap() : 0;
                var capValue = adjust(cap);
                // Convert cap to pension country currency for comparison
                if (capValue > 0 && typeof convertCurrencyAmount === 'function') {
                  var capInPensionCurrency = convertCurrencyAmount(capValue, resCurrencyNorm, currentCountry, pensionCurrency, pensionCountry, year);
                  if (capInPensionCurrency === null) {
                    flagSimulationFailure(person1.age);
                    return;
                  }
                  if (isFinite(capInPensionCurrency) && capInPensionCurrency > 0) {
                    capValue = capInPensionCurrency;
                  }
                }
                if (capValue > 0 && pensionBaseAmount > capValue) {
                  baseRate = baseRate * capValue / pensionBaseAmount;
                }
              } else if (effectiveCapped === "Match") {
                baseRate = Math.min(entry.match || 0, baseRate);
              }
              var employerRate = Math.min(entry.match || 0, baseRate);
              var personalAmount = baseRate * pensionBaseAmount;
              var employerAmount = employerRate * pensionBaseAmount;
              var totalContrib = personalAmount + employerAmount;
              if (totalContrib > 0) {
                // Convert to residence currency for display
                var personalAmountForDisplay = personalAmount;
                var totalContribForDisplay = totalContrib;
                if (pensionCurrency !== residenceCurrency) {
                  personalAmountForDisplay = convertCurrencyAmount(personalAmount, pensionCurrency, pensionCountry, residenceCurrency, currentCountry, year);
                  if (personalAmountForDisplay === null) {
                    flagSimulationFailure(person1.age);
                    return;
                  }
                  totalContribForDisplay = convertCurrencyAmount(totalContrib, pensionCurrency, pensionCountry, residenceCurrency, currentCountry, year);
                  if (totalContribForDisplay === null) {
                    flagSimulationFailure(person1.age);
                    return;
                  }
                }
                pensionContribution += totalContribForDisplay;
                personalPensionContribution += personalAmountForDisplay;
                // Track contributions by country in ORIGINAL currency for PV calculation
                if (!personalPensionContributionByCountry[pensionCountry]) {
                  personalPensionContributionByCountry[pensionCountry] = 0;
                }
                personalPensionContributionByCountry[pensionCountry] += personalAmount;
                if (personalAmount > 0) {
                  // Determine if country qualification is needed for pension contribution
                  var pensionMetricKey = 'pensioncontribution';
                  if (pensionCountry && pensionCountry !== currentCountry) {
                    pensionMetricKey = 'pensioncontribution:' + pensionCountry;
                  }
                  attributionManager.record(pensionMetricKey, entry.eventId, personalAmount);
                }
                // buy() receives numeric amount + currency/country metadata.
                // Use getPensionForCountry to get/create the correct country's pension pot.
                var pensionPot = salaryPerson.getPensionForCountry(pensionCountry);
                var pensionMixConfig = resolvePensionMixConfig(salaryPerson, pensionCountry);
                pensionPot.mixConfig = pensionMixConfig || null;
                buyPensionWithMix(pensionPot, totalContrib, pensionCurrency, pensionCountry, pensionMixConfig, salaryPerson.age);
              }
              declaredRate = baseRate;
            }
          }

          if (!declaredEntries[entryKey]) {
            const salaryMoney = Money.from(entryConvertedAmount, residenceCurrency, currentCountry);
            revenue.declareSalaryIncome(salaryMoney, declaredRate, salaryPerson, entry.eventId, salarySourceCountry);
            declaredEntries[entryKey] = true;
          }
          break;
        }

        case 'rsu':
          var rsuTotal = categoryTotalsByType['rsu'] || 0;
          if (!countedCategories[entryCategory] && rsuTotal > 0) {
            incomeShares += rsuTotal;
            countedCategories[entryCategory] = true;
          }
          attributionManager.record('incomersus', entry.eventId, entryConvertedAmount);
          if (entryConvertedAmount > 0 && !declaredEntries[entryKey]) {
            const rsuMoney = Money.from(entryConvertedAmount, residenceCurrency, currentCountry);
            revenue.declareInvestmentTypeIncome(rsuMoney, 'rsu_' + currentCountry, entry.eventId);
            declaredEntries[entryKey] = true;
          }
          break;

        case 'rental':
          var rentalTotal = categoryTotalsByType['rental'] || 0;
          if (!countedCategories[entryCategory] && rentalTotal > 0) {
            incomeRentals += rentalTotal;
            countedCategories[entryCategory] = true;
          }
          // Track rental income by country for PV calculation
          // Track amounts in the rental's own currency (not residence currency) so PV
          // can use start-year FX without double-counting FX evolution.
          if (entry.amount > 0) {
            var rentalCountry = normalizeCountry(bucketCountry);
            if (!incomeRentalsByCountry[rentalCountry]) {
              incomeRentalsByCountry[rentalCountry] = 0;
            }
            incomeRentalsByCountry[rentalCountry] += entry.amount;
          }
          // Determine if country qualification is needed for rental attribution
          var rentalMetricKey = 'incomerentals';
          var sourceCountry = normalizeCountry(entry.sourceCountry || currentCountry);
          if (sourceCountry && sourceCountry !== currentCountry) {
            rentalMetricKey = 'incomerentals:' + sourceCountry;
          }
          attributionManager.record(rentalMetricKey, entry.eventId, entryConvertedAmount, { sourceCountry: sourceCountry });
          if (entryConvertedAmount > 0 && !declaredEntries[entryKey]) {
            const rentalIncomeMoney = Money.from(entryConvertedAmount, residenceCurrency, currentCountry);
            revenue.declareRentalIncome(rentalIncomeMoney, sourceCountry, entry.eventId);
            declaredEntries[entryKey] = true;
          }
          break;

        case 'dbi': {
          var dbiTotal = categoryTotalsByType['dbi'] || 0;
          if (!countedCategories[entryCategory] && dbiTotal > 0) {
            incomeDefinedBenefit += dbiTotal;
            countedCategories[entryCategory] = true;
          }
          attributionManager.record('incomedefinedbenefit', entry.eventId, entryConvertedAmount);
          if (entryConvertedAmount > 0 && !declaredEntries[entryKey]) {
            var rsDbi = (function () { try { return Config.getInstance().getCachedTaxRuleSet(currentCountry); } catch (_) { return null; } })();
            var dbiSpec = (rsDbi && typeof rsDbi.getDefinedBenefitSpec === 'function') ? rsDbi.getDefinedBenefitSpec() : null;
            if (!dbiSpec || !dbiSpec.treatment) {
              errors = true;
              if (uiManager && typeof uiManager.setStatus === 'function') {
                uiManager.setStatus("Tax rules error: Defined Benefit behaviour is not defined in the active ruleset.", STATUS_COLORS.ERROR);
              }
            } else {
              switch (dbiSpec.treatment) {
                case 'privatePension':
                  const dbiPensionMoney = Money.from(entryConvertedAmount, residenceCurrency, currentCountry);
                  revenue.declarePrivatePensionIncome(dbiPensionMoney, person1, entry.eventId);
                  break;
                case 'salary':
                  var contrib = (dbiSpec.salary && typeof dbiSpec.salary.contribRate === 'number') ? dbiSpec.salary.contribRate : 0;
                  const dbiSalaryMoney = Money.from(entryConvertedAmount, residenceCurrency, currentCountry);
                  revenue.declareSalaryIncome(dbiSalaryMoney, contrib, person1, entry.eventId);
                  break;
                default:
                  errors = true;
                  if (uiManager && typeof uiManager.setStatus === 'function') {
                    uiManager.setStatus("Tax rules error: Unknown DBI treatment '" + String(dbiSpec.treatment) + "'.", STATUS_COLORS.ERROR);
                  }
                  break;
              }
            }
            declaredEntries[entryKey] = true;
          }
          break;
        }

        case 'taxFree':
          var taxFreeTotal = categoryTotalsByType['taxFree'] || 0;
          if (!countedCategories[entryCategory] && taxFreeTotal > 0) {
            incomeTaxFree += taxFreeTotal;
            countedCategories[entryCategory] = true;
          }
          attributionManager.record('incometaxfree', entry.eventId, entryConvertedAmount);
          break;

        case 'expense':
          var expenseTotal = categoryTotalsByType['expense'] || 0;
          if (!countedCategories[entryCategory] && expenseTotal > 0) {
            expenses += expenseTotal;
            countedCategories[entryCategory] = true;
          }
          attributionManager.record('expenses', entry.label || entry.eventId, entryConvertedAmount);
          break;

        case 'mortgage':
          var mortgageTotal = categoryTotalsByType['mortgage'] || 0;
          if (!countedCategories[entryCategory] && mortgageTotal > 0) {
            expenses += mortgageTotal;
            countedCategories[entryCategory] = true;
          }
          attributionManager.record('expenses', entry.label || entry.eventId, entryConvertedAmount);
          break;

        case 'mortgage_overpay':
          var overpayTotal = categoryTotalsByType['mortgage_overpay'] || 0;
          if (!countedCategories[entryCategory] && overpayTotal > 0) {
            expenses += overpayTotal;
            countedCategories[entryCategory] = true;
          }
          attributionManager.record('expenses', entry.label || entry.eventId, entryConvertedAmount);
          break;

        case 'mortgage_payoff':
          var payoffTotal = categoryTotalsByType['mortgage_payoff'] || 0;
          if (!countedCategories[entryCategory] && payoffTotal > 0) {
            expenses += payoffTotal;
            countedCategories[entryCategory] = true;
          }
          attributionManager.record('expenses', entry.label || entry.eventId, entryConvertedAmount);
          break;

        case 'reverse_mortgage_payout':
          var reversePayoutTotal = categoryTotalsByType['reverse_mortgage_payout'] || 0;
          var reversePayoutTreatment = (entry.taxTreatment === 'otherIncome') ? 'otherIncome' : 'taxFree';
          if (!countedCategories[entryCategory] && reversePayoutTotal > 0) {
            if (reversePayoutTreatment === 'taxFree') {
              incomeTaxFree += reversePayoutTotal;
            }
            countedCategories[entryCategory] = true;
          }
          if (reversePayoutTreatment === 'taxFree') {
            attributionManager.record('incometaxfree', entry.label || entry.eventId, entryConvertedAmount);
          } else if (entryConvertedAmount > 0 && !declaredEntries[entryKey]) {
            const reversePayoutIncomeMoney = Money.from(entryConvertedAmount, residenceCurrency, currentCountry);
            revenue.declareOtherIncome(reversePayoutIncomeMoney, entry.label || entry.eventId);
            declaredEntries[entryKey] = true;
          }
          break;

        case 'purchase': {
          var purchaseTotal = entryConvertedAmount;
          var cashUsed = Math.min(cash, purchaseTotal);
          cash -= cashUsed;
          cashMoney.amount -= cashUsed;
          purchaseCashUsedThisYear += cashUsed;
          var shortfall = purchaseTotal - cashUsed;
          if (shortfall > 0) {
            expenses += shortfall;
            purchaseShortfallThisYear += shortfall;
          }
          var expenseLabel = 'Cash Purchase (' + entry.eventId + ')';
          for (var eventIndex = 0; eventIndex < events.length; eventIndex++) {
            if (events[eventIndex].type === 'M' && events[eventIndex].id === entry.eventId) {
              expenseLabel = 'Downpayment (' + entry.eventId + ')';
              break;
            }
          }
          attributionManager.record('expenses', expenseLabel, purchaseTotal);
          attributionManager.record('realestatecapital', 'Purchase (' + entry.eventId + ')', purchaseTotal);
          break;
        }

        default:
          break;
      }
    }

    state.incomeBuckets = {};
    state.expenseBuckets = {};
    state.orderedEntries = [];
  }

  // Zero pass: process relocation events FIRST so currency/country is updated
  // before any income/expense processing (including pension contributions)
  for (let i = 0; i < events.length; i++) {
    let event = events[i];
    if (isRelocationEvent(event)) {
      if (person1.age === event.fromAge) {
        var prevCountry = currentCountry;
        var destCountry = getRelocationCountryCode(event);
        var startCountry = (params.StartCountry || config.getDefaultCountry() || '').toLowerCase();
        var infCountry = event.linkedCountry ? normalizeCountry(event.linkedCountry) : (prevCountry || startCountry);
        var reloRate = resolveCountryInflation(infCountry);
        var relocationAmount = adjust(event.amount, reloRate);
        var relocationInfo = getEventCurrencyInfo(event, prevCountry || startCountry || currentCountry);
        if (relocationAmount > 0) {
          var relocationConverted = convertCurrencyAmount(relocationAmount, relocationInfo.currency, relocationInfo.country, residenceCurrency, prevCountry, year);
          if (relocationConverted === null) {
            success = false;
            failedAt = person1.age;
            return; // Abort processing this year
          }
          expenses += relocationConverted;
          attributionManager.record('expenses', 'Relocation (' + event.id + ')', relocationConverted);
        }
        var prevCurrency = residenceCurrency;
        var prevCountryNormalized = prevCountry;
        var newResidenceCurrency = getCurrencyForCountry(destCountry) || prevCurrency || 'EUR';
        if (prevCurrency && newResidenceCurrency && prevCurrency !== newResidenceCurrency) {
          // Convert pooled cash to new residence currency.
          var convertedCash = convertCurrencyAmount(cash, prevCurrency, prevCountryNormalized, newResidenceCurrency, destCountry, year);
          if (convertedCash === null) {
            success = false;
            failedAt = person1.age;
            return; // Abort processing this year
          }
          cash = convertedCash;
          cashMoney = Money.convertTo(cashMoney, newResidenceCurrency, destCountry, year, economicData);

          // Convert target cash (emergency stash) to new currency using PPP.
          var pppRatio = (economicData && economicData.ready)
            ? economicData.getPPP(prevCountryNormalized, destCountry)
            : null;
          if (pppRatio !== null) {
            targetCash = targetCash * pppRatio;
          } else {
            var convertedTargetCash = convertCurrencyAmount(targetCash, prevCurrency, prevCountryNormalized, newResidenceCurrency, destCountry, year);
            if (convertedTargetCash === null) {
              success = false;
              failedAt = person1.age;
              return; // Abort processing this year
            }
            targetCash = convertedTargetCash;
          }
        }
        currentCountry = destCountry;
        residenceCurrency = newResidenceCurrency;
        conversionFactorCache = {};
        // Reset Taxman with the new country to ensure correct ruleset is loaded
        revenue.reset(person1, person2, attributionManager, currentCountry, year);
      }
    }
  }

  // First pass: process property sales so proceeds are consolidated before purchases
  var saleState = createFlowState();
  for (let i = 0; i < events.length; i++) {
    let event = events[i];
    if (event.type === 'R' && event.toAge && person1.age === event.toAge) {
      var propertyCurrency = null;
      var propertyCountry = null;
      var purchaseBasis = 0;
      var purchaseAge = event.fromAge;
      var saleAge = person1.age;
      if (realEstate && typeof realEstate.getCurrency === 'function') {
        propertyCurrency = realEstate.getCurrency(event.id);
      }
      if (realEstate && typeof realEstate.getLinkedCountry === 'function') {
        propertyCountry = realEstate.getLinkedCountry(event.id);
      }
      if (realEstate && typeof realEstate.getPurchaseBasis === 'function') {
        purchaseBasis = realEstate.getPurchaseBasis(event.id);
      }
      var saleInfo = getEventCurrencyInfo(event, propertyCountry || currentCountry);
      var saleEntryInfo = {
        currency: propertyCurrency || saleInfo.currency,
        country: propertyCountry || saleInfo.country
      };
      var salePropertyCountry = propertyCountry || saleEntryInfo.country;
      var heldYears = saleAge - purchaseAge;
      var residentCountryAtSale = getCountryForAgeCached(saleAge, events, params.StartCountry);
      var rentalEvents = [];
      for (var ri = 0; ri < events.length; ri++) {
        var rentalEvent = events[ri];
        if (rentalEvent && rentalEvent.type === 'RI' && rentalEvent.id === event.id) {
          rentalEvents.push(rentalEvent);
        }
      }
      var primaryResidenceProportion = realEstate.calculatePrimaryResidenceProportion(
        salePropertyCountry,
        event.id,
        purchaseAge,
        saleAge,
        residencyTimeline,
        rentalEvents
      );
      var saleBreakdown = (realEstate && typeof realEstate.getSaleBreakdown === 'function')
        ? realEstate.getSaleBreakdown(event.id)
        : null;
      // sell() returns numeric amount in the property's native currency.
      var saleProceeds = realEstate.sell(event.id);
      recordIncomeEntry(saleState, saleEntryInfo, saleProceeds, {
        type: 'sale',
        eventId: event.id,
        label: 'Sale (' + (event.name || event.id) + ')',
        allowZero: true,
        purchaseBasis: purchaseBasis,
        propertyCountry: salePropertyCountry,
        heldYears: heldYears,
        residentCountryAtSale: residentCountryAtSale,
        primaryResidenceProportion: primaryResidenceProportion,
        grossValue: saleBreakdown ? saleBreakdown.grossValue : saleProceeds,
        forwardMortgagePayoff: saleBreakdown ? saleBreakdown.forwardMortgagePayoff : 0,
        reverseMortgagePayoff: saleBreakdown ? saleBreakdown.reverseMortgagePayoff : 0,
        reverseMortgageWriteOff: saleBreakdown ? saleBreakdown.reverseMortgageWriteOff : 0
      });
    }
  }
  flushFlowState(saleState);

  // Second pass: aggregate all other flows
  var flowState = createFlowState();

  for (let i = 0; i < events.length; i++) {
    let event = events[i];
    var inflationRate;
    if (event.rate !== null && event.rate !== undefined && event.rate !== '') {
      inflationRate = event.rate;
    } else {
      var countryForInflation = event.linkedCountry || currentCountry || baseCountryCode;
      inflationRate = resolveCountryInflation(countryForInflation);
    }
    let amount = adjust(event.amount, inflationRate);
    let inScope = (person1.age >= event.fromAge && person1.age <= (event.toAge || 999));

    switch (event.type) {
      case 'NOP':
        break;

      case 'SI':
        if (inScope) {
          var salaryInfo = getEventCurrencyInfo(event, currentCountry);
          var salarySourceCountry = (event.linkedCountry && !event.__autoLinkedCountry) ? normalizeCountry(event.linkedCountry) : null;
          recordIncomeEntry(flowState, salaryInfo, amount, {
            type: 'salary',
            eventId: event.id,
            match: event.match || 0,
            personRef: person1,
            pensionable: true,
            sourceCountry: salarySourceCountry
          });
        }
        break;

      case 'SInp':
        if (inScope) {
          var salaryNpInfo = getEventCurrencyInfo(event, currentCountry);
          var salaryNpSourceCountry = (event.linkedCountry && !event.__autoLinkedCountry) ? normalizeCountry(event.linkedCountry) : null;
          recordIncomeEntry(flowState, salaryNpInfo, amount, {
            type: 'salary',
            eventId: event.id,
            match: 0,
            personRef: person1,
            pensionable: false,
            sourceCountry: salaryNpSourceCountry
          });
        }
        break;

      case 'SI2':
        if (inScope && person2) {
          var salary2Info = getEventCurrencyInfo(event, currentCountry);
          var salary2SourceCountry = (event.linkedCountry && !event.__autoLinkedCountry) ? normalizeCountry(event.linkedCountry) : null;
          recordIncomeEntry(flowState, salary2Info, amount, {
            type: 'salary',
            eventId: event.id,
            match: event.match || 0,
            personRef: person2,
            pensionable: true,
            sourceCountry: salary2SourceCountry
          });
        } else if (inScope) {
          var salaryFallbackInfo = getEventCurrencyInfo(event, currentCountry);
          var salaryFallbackSourceCountry = (event.linkedCountry && !event.__autoLinkedCountry) ? normalizeCountry(event.linkedCountry) : null;
          recordIncomeEntry(flowState, salaryFallbackInfo, amount, {
            type: 'salary',
            eventId: event.id,
            match: 0,
            personRef: person1,
            pensionable: false,
            sourceCountry: salaryFallbackSourceCountry
          });
        }
        break;

      case 'SI2np':
        if (inScope && person2) {
          var salary2npInfo = getEventCurrencyInfo(event, currentCountry);
          var salary2npSourceCountry = (event.linkedCountry && !event.__autoLinkedCountry) ? normalizeCountry(event.linkedCountry) : null;
          recordIncomeEntry(flowState, salary2npInfo, amount, {
            type: 'salary',
            eventId: event.id,
            match: 0,
            personRef: person2,
            pensionable: false,
            sourceCountry: salary2npSourceCountry
          });
        }
        break;

      case 'UI':
        if (inScope) {
          var rsuInfo = getEventCurrencyInfo(event, currentCountry);
          recordIncomeEntry(flowState, rsuInfo, amount, {
            type: 'rsu',
            eventId: event.id
          });
        }
        break;

      case 'RI':
        if (inScope) {
          var propertyCountry = realEstate.getLinkedCountry(event.id);
          var sourceCountry = normalizeCountry(propertyCountry || event.linkedCountry || currentCountry);
          var rentalInfo = getEventCurrencyInfo(event, sourceCountry);
          recordIncomeEntry(flowState, rentalInfo, amount, {
            type: 'rental',
            eventId: event.id,
            sourceCountry: sourceCountry
          });
        }
        break;

      case 'DBI':
        if (inScope) {
          var dbInfo = getEventCurrencyInfo(event, currentCountry);
          recordIncomeEntry(flowState, dbInfo, amount, {
            type: 'dbi',
            eventId: event.id
          });
        }
        break;

      case 'FI':
        if (inScope) {
          var taxFreeInfo = getEventCurrencyInfo(event, currentCountry);
          recordIncomeEntry(flowState, taxFreeInfo, amount, {
            type: 'taxFree',
            eventId: event.id
          });
        }
        break;

      case 'E':
        if (inScope) {
          var expenseInfo = getEventCurrencyInfo(event, currentCountry);
          recordExpenseEntry(flowState, expenseInfo, amount, {
            type: 'expense',
            eventId: event.id
          });
        }
        break;

      case 'M': {
        var mortgageInfo = getEventCurrencyInfo(event, event.linkedCountry || currentCountry);
        if (person1.age == event.fromAge) {
          // Use explicit mortgageTerm if provided, otherwise fall back to event duration.
          // This allows modeling an early payoff (by shortening toAge) without
          // incorrectly recalculating the initial principal.
          var term = (event.mortgageTerm !== undefined && event.mortgageTerm !== null)
            ? parseInt(event.mortgageTerm)
            : (event.toAge - event.fromAge);
          
          realEstate.mortgage(event.id, term, event.rate, event.amount, mortgageInfo.currency, mortgageInfo.country);
        }
        if (inScope) {
          var payment = realEstate.getPayment(event.id);
          var mortgageCurrency = mortgageInfo.currency;
          var mortgageCountry = mortgageInfo.country;
          var storedCurrency = realEstate.getCurrency(event.id);
          if (storedCurrency) mortgageCurrency = storedCurrency;
          var storedCountry = realEstate.getLinkedCountry(event.id);
          if (storedCountry) mortgageCountry = storedCountry;
          recordExpenseEntry(flowState, { currency: mortgageCurrency, country: mortgageCountry }, payment, {
            type: 'mortgage',
            eventId: event.id,
            label: 'Mortgage (' + event.id + ')'
          });
        }
        // Backward-compatibility: if no explicit MP event is present for this age,
        // preserve implicit payoff behavior at M.toAge.
        if (person1.age === event.toAge) {
          var hasExplicitPayoff = false;
          for (var mpi = 0; mpi < events.length; mpi++) {
            var mpEvent = events[mpi];
            if (mpEvent && mpEvent.type === 'MP' && mpEvent.id === event.id && mpEvent.fromAge === person1.age) {
              hasExplicitPayoff = true;
              break;
            }
          }
          if (!hasExplicitPayoff) {
            var implicitPayoff = realEstate.settleMortgage(event.id);
            if (implicitPayoff > 0) {
              var implicitCurrency = realEstate.getCurrency(event.id) || mortgageInfo.currency;
              var implicitCountry = realEstate.getLinkedCountry(event.id) || mortgageInfo.country;
              recordExpenseEntry(flowState, { currency: implicitCurrency, country: implicitCountry }, implicitPayoff, {
                type: 'mortgage_payoff',
                eventId: event.id,
                label: 'Mortgage Payoff (' + event.id + ')'
              });
            }
          }
        }
        break;
      }

      case 'MO': {
        if (inScope) {
          var overpayInfo = getEventCurrencyInfo(event, event.linkedCountry || currentCountry);
          var overpayCurrency = realEstate.getCurrency(event.id) || overpayInfo.currency;
          var overpayCountry = realEstate.getLinkedCountry(event.id) || overpayInfo.country;
          var overpayRawAmount = Number(event.amount);
          if (!(overpayRawAmount > 0)) overpayRawAmount = 0;
          var overpayAmount = realEstate.overpayMortgage(event.id, overpayRawAmount);
          if (overpayAmount > 0) {
            recordExpenseEntry(flowState, { currency: overpayCurrency, country: overpayCountry }, overpayAmount, {
              type: 'mortgage_overpay',
              eventId: event.id,
              label: 'Mortgage Overpay (' + event.id + ')'
            });
          }
        }
        break;
      }

      case 'MP': {
        if (person1.age === event.fromAge) {
          var payoffInfo = getEventCurrencyInfo(event, event.linkedCountry || currentCountry);
          var payoffCurrency = realEstate.getCurrency(event.id) || payoffInfo.currency;
          var payoffCountry = realEstate.getLinkedCountry(event.id) || payoffInfo.country;
          var explicitPayoff = realEstate.settleMortgage(event.id);
          if (explicitPayoff > 0) {
            recordExpenseEntry(flowState, { currency: payoffCurrency, country: payoffCountry }, explicitPayoff, {
              type: 'mortgage_payoff',
              eventId: event.id,
              label: 'Mortgage Payoff (' + event.id + ')'
            });
          }
        }
        break;
      }

      case 'MR': {
        var reverseInfo = getEventCurrencyInfo(event, event.linkedCountry || currentCountry);
        var reverseCurrency = realEstate.getCurrency(event.id) || reverseInfo.currency;
        var reverseCountry = realEstate.getLinkedCountry(event.id) || reverseInfo.country;
        if (person1.age === event.fromAge || realEstate.getReverseMortgageBalance(event.id) > 0) {
          realEstate.reverseMortgage(event.id, event.rate, reverseCurrency, reverseCountry);
        }
        if (inScope) {
          var reversePayoutRequested = Number(event.amount);
          if (!(reversePayoutRequested > 0)) reversePayoutRequested = 0;
          var reverseResult = realEstate.advanceReverseMortgage(event.id, reversePayoutRequested, event.rate, reverseCurrency, reverseCountry);
          if (reverseResult && reverseResult.payout > 0) {
            var reversePayoutTaxTreatment = 'taxFree';
            if (revenue && revenue.ruleset && typeof revenue.ruleset.getReverseMortgagePayoutTaxTreatment === 'function') {
              reversePayoutTaxTreatment = revenue.ruleset.getReverseMortgagePayoutTaxTreatment();
            }
            recordIncomeEntry(flowState, { currency: reverseCurrency, country: reverseCountry }, reverseResult.payout, {
              type: 'reverse_mortgage_payout',
              taxTreatment: reversePayoutTaxTreatment,
              eventId: event.id,
              label: 'Reverse Mortgage (' + event.id + ')'
            });
          }
        }
        break;
      }

      case 'R':
        if (person1.age === event.fromAge) {
          var purchaseInfo = getEventCurrencyInfo(event, event.linkedCountry || currentCountry);
          // buy() receives numeric amount + currency/country metadata.
          // Asset classes track Money internally; Simulator works with numbers only.
          realEstate.buy(event.id, amount, event.rate, purchaseInfo.currency, purchaseInfo.country);
          recordExpenseEntry(flowState, purchaseInfo, amount, {
            type: 'purchase',
            eventId: event.id
          });
        }
        break;

      case 'SM':
        if (person1.age == event.fromAge) {
          stockGrowthOverride = Math.pow(1 + event.rate, 1 / (event.toAge - event.fromAge + 1)) - 1;
        }
        if (person1.age === event.toAge + 1) {
          stockGrowthOverride = undefined;
        }
        break;

      default:
        // Relocation events are handled in zero pass above
        break;
    }
  }

  flushFlowState(flowState);

  if (revenue) {
    revenue.incomeByCurrency = incomeByCurrency;
    revenue.expensesByCurrency = expensesByCurrency;
  }
}

function getPensionMixBaseKey(person) {
  if (person && person.id === 'P2') return 'pensionP2';
  return 'pensionP1';
}

function resolvePensionMixConfig(person, countryCode) {
  var baseKey = getPensionMixBaseKey(person);
  var cc = normalizeCountry(countryCode);
  return InvestmentTypeFactory.resolveMixConfig(params, cc, baseKey);
}

function resolveAssetClassForBaseKey(baseKey) {
  if (!baseKey) {
    throw new Error('Economic regime configuration error: Missing base key in pension mix configuration');
  }
  var cfg = Config.getInstance();
  var baseType = cfg.getInvestmentBaseTypeByKey(baseKey);
  if (!baseType) {
    throw new Error('Economic regime configuration error: Unknown investment base type "' + baseKey + '" in pension mix configuration');
  }
  if (!baseType.assetClass) {
    throw new Error('Economic regime configuration error: Missing assetClass for investment base type "' + baseKey + '"');
  }
  return baseType.assetClass;
}

function createMixedAssetForPension(pensionPot, mixConfig) {
  if (!pensionPot || !mixConfig) return;
  if (pensionPot._mixedAsset) return; // Already created

  var assetClass1 = resolveAssetClassForBaseKey(mixConfig.asset1);
  var assetClass2 = resolveAssetClassForBaseKey(mixConfig.asset2);
  
  var leg1TypeDef = { key: mixConfig.asset1, assetClass: assetClass1 };
  var leg2TypeDef = { key: mixConfig.asset2, assetClass: assetClass2 };
  
  pensionPot._mixedAsset = new MixedInvestmentAsset(
    leg1TypeDef, leg2TypeDef,
    mixConfig.asset1Growth, mixConfig.asset1Vol,
    mixConfig.asset2Growth, mixConfig.asset2Vol,
    null
  );
  pensionPot._mixedAsset.mixConfig = mixConfig;

  // Redirect yearly stats to the mixed asset (which aggregates legs)
  // This ensures rebalancing sales (which happen on legs) are visible on the pension pot
  Object.defineProperty(pensionPot, 'yearlyBought', { get: function() { return this._mixedAsset.yearlyBought; }, configurable: true });
  Object.defineProperty(pensionPot, 'yearlySold', { get: function() { return this._mixedAsset.yearlySold; }, configurable: true });
  Object.defineProperty(pensionPot, 'yearlyGrowth', { get: function() { return this._mixedAsset.yearlyGrowth; }, configurable: true });
}

function buyPensionWithMix(pensionPot, amount, currency, country, mixConfig, currentAge) {
  if (mixConfig && (mixConfig.type === 'fixed' || mixConfig.type === 'glidePath')) {
    createMixedAssetForPension(pensionPot, mixConfig);
    
    var asset1Pct = mixConfig.startAsset1Pct;
    if (mixConfig.type === 'glidePath' && typeof GlidePathCalculator !== 'undefined') {
      var currentMix = GlidePathCalculator.getCurrentMix(currentAge, mixConfig);
      if (currentMix) asset1Pct = currentMix.asset1Pct;
    }
    if (asset1Pct === null || asset1Pct === undefined) asset1Pct = mixConfig.endAsset1Pct;
    var asset2Pct = 100 - asset1Pct;
    var amount1 = amount * (asset1Pct / 100);
    var amount2 = amount - amount1;
    if (amount1 > 0) pensionPot.buy(amount1, currency, country, 1);
    if (amount2 > 0) pensionPot.buy(amount2, currency, country, 2);
  } else {
    pensionPot.buy(amount, currency, country);
  }
}

function buildForeignTaxCredits(taxman, trailing) {
  var ruleset = taxman.ruleset;
  var equivalents = ruleset.getTreatyEquivalents();
  var buckets = {};
  var byCountry = {};
  var treatyFound = false;
  var includedCapitalGainsCountries = {};
  var addMappedCredits = function (countryCode, sourceTaxes) {
    var mapped = taxman.aggregateTreatyBuckets(sourceTaxes, equivalents);
    for (var k in mapped) {
      buckets[k] = (buckets[k] || 0) + mapped[k];
      if (!byCountry[k]) byCountry[k] = {};
      byCountry[k][countryCode] = (byCountry[k][countryCode] || 0) + mapped[k];
    }
  };
  for (var i = 0; i < trailing.length; i++) {
    var t = trailing[i];
    if (!t || !t.country) continue;
    if (!ruleset.hasTreatyWith(t.country)) continue;
    treatyFound = true;
    var sourceTaxes = {};
    var incomeKey = 'incomeTax:' + t.country;
    if (taxman.taxTotals && typeof taxman.taxTotals[incomeKey] === 'number') {
      sourceTaxes.incomeTax = taxman.taxTotals[incomeKey];
    }
    var gainsKey = 'capitalGains:' + t.country;
    if (taxman.taxTotals && typeof taxman.taxTotals[gainsKey] === 'number') {
      sourceTaxes.capitalGains = taxman.taxTotals[gainsKey];
      includedCapitalGainsCountries[String(t.country).toLowerCase()] = true;
    }
    addMappedCredits(t.country, sourceTaxes);
  }

  // Include source-country CGT buckets even when they are not from trailing residency
  // (e.g. property sales taxed at source regardless of residency).
  if (taxman.taxTotals) {
    var taxKeys = Object.keys(taxman.taxTotals);
    for (var ti = 0; ti < taxKeys.length; ti++) {
      var taxKey = taxKeys[ti];
      if (taxKey.indexOf('capitalGains:') !== 0) continue;
      var sourceCountry = String(taxKey.substring('capitalGains:'.length) || '').toLowerCase();
      if (!sourceCountry || includedCapitalGainsCountries[sourceCountry]) continue;
      if (!ruleset.hasTreatyWith(sourceCountry)) continue;
      var sourceAmount = taxman.taxTotals[taxKey];
      if (!(typeof sourceAmount === 'number') || sourceAmount <= 0) continue;
      treatyFound = true;
      addMappedCredits(sourceCountry, { capitalGains: sourceAmount });
    }
  }
  if (!treatyFound) return null;
  if (!buckets.income && !buckets.capitalGains && !buckets.dividends) return null;
  buckets.byCountry = byCountry;
  buckets.treatyExists = true;
  return buckets;
}

function computeNetIncomeWithForeignCredits(taxman) {
  var trailing = taxman.getActiveCrossBorderTaxCountries();
  var hasExternalCapitalGains = false;
  if (taxman.externalTaxEntries && taxman.externalTaxEntries.length > 0) {
    for (var i = 0; i < taxman.externalTaxEntries.length; i++) {
      var ext = taxman.externalTaxEntries[i];
      if (ext && ext.taxId === 'capitalGains' && typeof ext.amount === 'number' && ext.amount > 0) {
        hasExternalCapitalGains = true;
        break;
      }
    }
  }
  if ((trailing && trailing.length > 0) || hasExternalCapitalGains) {
    taxman.computeTaxes();
    var credits = buildForeignTaxCredits(taxman, trailing);
    if (credits) {
      return taxman.netIncome(credits);
    }
    return taxman.netIncome();
  }
  return taxman.netIncome();
}

function rebalancePersonPensions(person) {
  var pensions = person.pensions;
  var keys = Object.keys(pensions).sort();
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var pot = pensions[key];
    if (!pot) continue;
    var mixConfig = resolvePensionMixConfig(person, key);
    pot.mixConfig = mixConfig || null;
    if (!mixConfig) continue;
    var entry = {
      asset: pot,
      baseCurrency: pot._getBaseCurrency(),
      assetCountry: pot._getAssetCountry()
    };
    rebalanceMixAsset(entry, 0, person.age);
  }
}


function handleInvestments() {
  netIncome = computeNetIncomeWithForeignCredits(revenue) + incomeTaxFree;
  earnedNetIncome = netIncome;
  householdPhase = 'growth';
  if (person1.phase === Phases.retired && (!person2 || person2.phase === Phases.retired)) {
    householdPhase = 'retired';
  }

  /**
   * @assumes residenceCurrency - netIncome and expenses are already in residence currency.
   * @performance Hot path - direct .amount access for net savings accumulation.
   */
  if (netIncome > expenses) {
    savings = netIncome - expenses;
    if (!(purchaseShortfallThisYear > 0)) {
      cash += savings;
      cashMoney.amount += savings;
    }
  }


  if (cash < targetCash) {
    cashDeficit = targetCash - cash;
  }
  // Compute capsByKey inline for capital calculations (canonical: investmentAssets keys)
  var capsByKey = {};
  if (investmentAssets && investmentAssets.length > 0) {
    for (var ci = 0; ci < investmentAssets.length; ci++) {
      var centry = investmentAssets[ci];
      if (!centry || !centry.asset || typeof centry.asset.capital !== 'function') continue;
      var c = centry.asset.capital();
      capsByKey[centry.key] = (capsByKey[centry.key] || 0) + c;
    }
  }
  let totalInvestmentCaps = 0;
  for (var k in capsByKey) {
    totalInvestmentCaps += capsByKey[k];
  }
  let capitalPreWithdrawal = totalInvestmentCaps + person1.getTotalPensionCapital() + (person2 ? person2.getTotalPensionCapital() : 0);
  if (expenses > netIncome) {
    switch (person1.phase) {
      case Phases.growth:
        withdraw(params.priorityCash, 0, params.priorityFunds, params.priorityShares);
        break;
      case Phases.retired:
        withdraw(params.priorityCash, params.priorityPension, params.priorityFunds, params.priorityShares);
        break;
    }
  }
  if (capitalPreWithdrawal > 0) {
    let invIncome = 0;
    for (var k in investmentIncomeByKey) invIncome += investmentIncomeByKey[k];
    withdrawalRate = (invIncome + incomePrivatePension) / capitalPreWithdrawal;
  } else {
    withdrawalRate = 0;
  }
  let invested = 0;
  if (cash > targetCash + 0.001) {
    let surplus = cash - targetCash;
    let usedDynamic = false;
    // Dynamic distribution across generic investment assets when they are defined
    // via InvestmentTypeFactory (entries carry baseCurrency/assetCountry metadata).
    var supportsContributionModes = false;
    if (investmentAssets && investmentAssets.length > 0) {
      for (var mi = 0; mi < investmentAssets.length; mi++) {
        var metaEntry = investmentAssets[mi];
        if (metaEntry && metaEntry.baseCurrency) {
          supportsContributionModes = true;
          break;
        }
      }
    }
    if (investmentAssets && supportsContributionModes) {
      var allocations = getAllocationsByYear(year);
      var sumInvested = 0;
      var sumAlloc = 0;
      var currentAge = person1 ? person1.age : null;
      for (var i = 0; i < investmentAssets.length; i++) {
        var entry = investmentAssets[i];
        var alloc = allocations[entry.key] || 0;
        sumAlloc += alloc;
        if (alloc > 0 && entry.asset && entry.asset.buy) {
          var amount = surplus * alloc;
          if (amount > 0) {
            // Apply implicit currency conversion: convert if base currency differs from residence.
            // If baseCurrency is missing, follow the legacy default (no conversion).
            var amountInAssetCurrency = amount;
            var buyCurrency = residenceCurrency;
            var buyCountry = currentCountry;
            if (entry.baseCurrency && entry.baseCurrency !== residenceCurrency) {
              amountInAssetCurrency = convertCurrencyAmount(
                amount,
                residenceCurrency,
                currentCountry,
                entry.baseCurrency,
                entry.assetCountry,
                year
              );
              if (amountInAssetCurrency === null) {
                flagSimulationFailure(person1.age);
                return;
              }
              buyCurrency = entry.baseCurrency;
              buyCountry = entry.assetCountry;
            }
            var mixConfig = entry.asset.mixConfig;
            if (mixConfig && (mixConfig.type === 'fixed' || mixConfig.type === 'glidePath')) {
              var asset1Pct = mixConfig.startAsset1Pct;
              if (mixConfig.type === 'glidePath' && typeof GlidePathCalculator !== 'undefined') {
                var currentMix = GlidePathCalculator.getCurrentMix(currentAge, mixConfig);
                if (currentMix) asset1Pct = currentMix.asset1Pct;
              }
              if (asset1Pct === null || asset1Pct === undefined) asset1Pct = mixConfig.endAsset1Pct;
              var asset2Pct = 100 - asset1Pct;
              var amount1 = amountInAssetCurrency * (asset1Pct / 100);
              var amount2 = amountInAssetCurrency - amount1;
              if (amount1 > 0) entry.asset.buy(amount1, buyCurrency, buyCountry, 1);
              if (amount2 > 0) entry.asset.buy(amount2, buyCurrency, buyCountry, 2);
            } else {
              // Base currency matches residence currency - no conversion needed
              entry.asset.buy(amountInAssetCurrency, buyCurrency, buyCountry);
            }
            // Track invested amount in residence currency for cash deduction
            sumInvested += amount;
            usedDynamic = true;
          }
        }
      }
      if (usedDynamic) {
        invested = sumInvested;
        cash -= invested;
        cashMoney.amount -= invested;
      }
    }
  }
  // Hybrid rebalance for mix-enabled assets (after surplus allocation, before next year's growth)
  if (investmentAssets && investmentAssets.length > 0) {
    var currentAge = person1 ? person1.age : null;
    var remainingSurplus = cash > targetCash ? (cash - targetCash) : 0;
    for (var ri = 0; ri < investmentAssets.length; ri++) {
      var entry = investmentAssets[ri];
      if (entry.asset && entry.asset.mixConfig) {
        var consumed = rebalanceMixAsset(entry, remainingSurplus, currentAge);
        if (consumed > 0) {
          remainingSurplus -= consumed;
          cash -= consumed;
          cashMoney.amount -= consumed;
        }
      }
    }
  }
  // Pension mix rebalancing (per person, per country)
  if (person1) rebalancePersonPensions(person1);
  if (person2) rebalancePersonPensions(person2);
  /**
   * @assumes residenceCurrency - Emergency cash top-up uses residence currency amounts.
   * @performance Hot path - direct .amount access for cash top-up.
   */
  // If cash is below targetCash (inflated emergency stash), top it up from surplus income
  // This ensures cash grows to match the inflated target over time
  if (cash < targetCash && netIncome > expenses + invested) {
    let availableSurplus = netIncome - expenses - invested;
    let needed = targetCash - cash;
    let topUp = Math.min(needed, availableSurplus);
    if (topUp > 0) {
      cash += topUp;
      cashMoney.amount += topUp;
    }
  }

  // If yearly income cannot cover expenses after all withdrawals, mark run as failed.
  if (netIncome < expenses - 100 && success) {
    success = false;
    failedAt = person1.age;
  }

  // Inflate target cash (emergency stash) at residence country inflation to maintain purchasing power
  // This is done at the end of the year so it applies to the target for the NEXT year
  var residenceInflation = resolveCountryInflation(currentCountry);
  targetCash *= (1 + residenceInflation);
}


function rebalanceMixAsset(assetEntry, surplusCash, currentAge) {
  var asset = assetEntry.asset;
  var mixConfig = asset.mixConfig;
  if (!mixConfig || (mixConfig.type !== 'fixed' && mixConfig.type !== 'glidePath')) return 0;
  
  // Resolve the composite asset (Pension delegates to _mixedAsset; normal assets ARE the composite)
  var composite = asset._mixedAsset || asset;
  
  // Ensure legs exist (pension might not have bought yet)
  if (!composite.leg1 || !composite.leg2) return 0;

  var skipTax = asset && asset._isPension && asset.taxAdvantaged;
  if (skipTax) asset._internalRebalance = true;
  try {

    var t1 = 0;
    var t2 = 0;
    if (mixConfig.type === 'glidePath') {
      var currentMix = GlidePathCalculator.getCurrentMix(currentAge, mixConfig);
      t1 = currentMix.asset1Pct / 100;
      t2 = currentMix.asset2Pct / 100;
    } else {
      var asset1Pct = mixConfig.startAsset1Pct;
      if (asset1Pct === null || asset1Pct === undefined) asset1Pct = mixConfig.endAsset1Pct;
      var asset2Pct = mixConfig.startAsset2Pct;
      if (asset2Pct === null || asset2Pct === undefined) asset2Pct = 100 - asset1Pct;
      t1 = asset1Pct / 100;
      t2 = asset2Pct / 100;
    }

    var v1_raw = composite.leg1.capital();
    var v2_raw = composite.leg2.capital();
    
    // Capital is already in residence currency for MixedInvestmentAsset legs? 
    // Wait, InvestmentAsset.capital() returns residence currency total.
    // Yes, InvestmentAsset.capital() does FX conversion internally.
    // So v1_raw and v2_raw ARE in residence currency.
    var v1 = v1_raw;
    var v2 = v2_raw;

    if (v1 + v2 === 0) return 0;

    var V = v1 + v2 + surplusCash;
    var targetV1 = V * t1;
    var targetV2 = V * t2;
    var d1 = targetV1 - v1;
    var d2 = targetV2 - v2;
    var tolerance = 0.001;

    var buyCurrency = residenceCurrency;
    var buyCountry = currentCountry;
    if (assetEntry.baseCurrency && assetEntry.baseCurrency !== residenceCurrency) {
      buyCurrency = assetEntry.baseCurrency;
      buyCountry = assetEntry.assetCountry;
    }

    var startingSurplus = surplusCash;

    function buyIntoLeg(leg, amountResidence) {
      var amountInAssetCurrency = amountResidence;
      if (buyCurrency !== residenceCurrency) {
        amountInAssetCurrency = convertCurrencyAmount(
          amountResidence,
          residenceCurrency,
          currentCountry,
          buyCurrency,
          buyCountry,
          year
        );
        if (amountInAssetCurrency === null) {
          throw new Error('rebalanceMixAsset: buy conversion failed');
        }
      }
      leg.buy(amountInAssetCurrency, buyCurrency, buyCountry);
    }

    function sellFromLeg(leg, amountToSell) {
      if (amountToSell <= 0) return 0;
      
      // If pension/tax-advantaged, suppress revenue declarations during rebalance
      if (skipTax) leg._suppressRevenue = true;
      var sold = leg.sell(amountToSell);
      if (skipTax) leg._suppressRevenue = false;
      
      if (sold === null) {
        throw new Error('rebalanceMixAsset: sell conversion failed');
      }
      return sold;
    }

    if (d1 > tolerance * V && surplusCash > 0) {
      var buy1 = Math.min(d1, surplusCash);
      if (buy1 > 0) {
        buyIntoLeg(composite.leg1, buy1);
        surplusCash -= buy1;
        d1 -= buy1;
      }
    }
    if (d2 > tolerance * V && surplusCash > 0) {
      var buy2 = Math.min(d2, surplusCash);
      if (buy2 > 0) {
        buyIntoLeg(composite.leg2, buy2);
        surplusCash -= buy2;
        d2 -= buy2;
      }
    }

    if (d1 > tolerance * V && d2 < -tolerance * V) {
      var sold2 = sellFromLeg(composite.leg2, d1);
      if (sold2 > 0) {
        buyIntoLeg(composite.leg1, sold2);
      }
    } else if (d2 > tolerance * V && d1 < -tolerance * V) {
      var sold1 = sellFromLeg(composite.leg1, d2);
      if (sold1 > 0) {
        buyIntoLeg(composite.leg2, sold1);
      }
    }

    return startingSurplus - surplusCash;
  } finally {
    if (skipTax) asset._internalRebalance = false;
  }
}


// Withdraw funds from available sources (cash, pension, investments) based on priority.
// Priorities: 0 = don't use, 1 = first, 2 = second, 3 = third, 4 = fourth.
// Iterates through investmentAssets array using getDrawdownPrioritiesByKey() for dynamic allocation.
// Per strictness §9: assumes investmentAssets is a valid, non-empty array (initialized via InvestmentTypeFactory).
function withdraw(cashPriority, pensionPriority, FundsPriority, SharesPriority) {
  var clonedRevenue = revenue.clone();
  // Simulate selling all investment assets to estimate total availability after taxes
  for (var si = 0; si < investmentAssets.length; si++) {
    var simAsset = investmentAssets[si].asset;
    simAsset.simulateSellAll(clonedRevenue);
  }
  var needed = expenses + cashDeficit - netIncome;
  // NOTE: Pension capital should only be available for withdrawal during retirement phase.
  // Including it in totalAvailable during growth phase causes premature liquidation.
  var totalPensionCapital = 0;
  if (person1.phase === Phases.retired) {
    totalPensionCapital += person1.getTotalPensionCapital();
  }
  if (person2 && person2.phase === Phases.retired) {
    totalPensionCapital += person2.getTotalPensionCapital();
  }
  var totalAvailable = Math.max(0, cash) + Math.max(0, totalPensionCapital) + Math.max(0, computeNetIncomeWithForeignCredits(clonedRevenue) + incomeTaxFree);
  if (needed > totalAvailable + 0.01) {
    liquidateAll();
    return;
  }

  cashWithdraw = 0;
  var prioritiesByKey = getDrawdownPrioritiesByKey();
  // Determine max priority rank across assets and special buckets
  var maxRank = 0;
  for (var k in prioritiesByKey) { if (prioritiesByKey.hasOwnProperty(k)) { maxRank = Math.max(maxRank, prioritiesByKey[k] || 0); } }
  maxRank = Math.max(maxRank, cashPriority || 0, pensionPriority || 0, 4);

  for (var priority = 1; priority <= maxRank; priority++) {
    var loopCount = 0;
    while (expenses + cashDeficit - netIncome >= 1) {
      loopCount++;
      if (loopCount > 50) { break; }
      needed = expenses + cashDeficit - netIncome;
      var keepTrying = false;

      /**
       * @assumes residenceCurrency - Cash withdrawals are in residence currency.
       * @performance Hot path - direct .amount access for withdrawal operations.
       */
      // Cash bucket
      if (priority === cashPriority) {
        if (cash > 0.5) {
          cashWithdraw = Math.min(cash, needed);
          cash -= cashWithdraw;
          cashMoney.amount -= cashWithdraw;
          attributionManager.record('incomecash', 'Cash Withdrawal', cashWithdraw);
        }
      }

      // Pension bucket (P1 then P2)
      if (priority === pensionPriority) {
        var p1Cap = person1.getTotalPensionCapital();
        var p2Cap = person2 ? person2.getTotalPensionCapital() : 0;
        if (p1Cap > 0.5 && (person1.phase === Phases.retired || person1.age >= person1.retirementAgeParam)) {
          var w1 = Math.min(p1Cap, needed);
          // sell() returns numeric amount in residence currency.
          // Internal Money conversion happens inside asset class; Simulator receives number only.
          var sold1 = person1.sellPension(w1);
          if (sold1 === null) {
            flagSimulationFailure(person1.age);
            return;
          }
          incomePrivatePension += sold1;
          attributionManager.record('incomeprivatepension', 'Pension Drawdown P1', sold1);
          keepTrying = true;
        } else if (p2Cap > 0.5 && person2 && (person2.phase === Phases.retired || person2.age >= person2.retirementAgeParam)) {
          var w2 = Math.min(p2Cap, needed);
          var sold2 = person2.sellPension(w2);
          if (sold2 === null) {
            flagSimulationFailure(person2.age);
            return;
          }
          incomePrivatePension += sold2;
          attributionManager.record('incomeprivatepension', 'Pension Drawdown P2', sold2);
          keepTrying = true;
        }
      }

      // Investment assets at this priority - unified loop using prioritiesByKey
      for (var ai = 0; ai < investmentAssets.length; ai++) {
        var entry = investmentAssets[ai];
        var rank = prioritiesByKey[entry.key] || 0;
        if (rank !== priority) continue;
        var assetObj = entry.asset;
        var cap = assetObj.capital();
        if (cap > 0.5) {
          var w = Math.min(cap, needed);
          // sell() returns numeric amount in residence currency.
          // Internal Money conversion happens inside asset class; Simulator receives number only.
          var sold = assetObj.sell(w);
          if (sold === null) {
            flagSimulationFailure(person1.age);
            return;
          }
          // Record dynamic income for this investment type
          if (!investmentIncomeByKey) investmentIncomeByKey = {};
          if (!investmentIncomeByKey[entry.key]) investmentIncomeByKey[entry.key] = 0;
          investmentIncomeByKey[entry.key] += sold;
          keepTrying = true;
        }
      }

      netIncome = cashWithdraw + computeNetIncomeWithForeignCredits(revenue) + incomeTaxFree;;
      if (keepTrying == false) { break; }
    }
  }
}

function liquidateAll() {
  cashWithdraw = cash;
  cash = 0;
  cashMoney = Money.zero(residenceCurrency, currentCountry);

  // Only liquidate pension if retired - pension should not be touched during growth phase
  if (person1.phase === Phases.retired && person1.getTotalPensionCapital() > 0) {
    var soldAmount = person1.sellPension(person1.getTotalPensionCapital());
    if (soldAmount === null) {
      flagSimulationFailure(person1.age);
      return;
    }
    incomePrivatePension += soldAmount;
    attributionManager.record('incomeprivatepension', 'Pension Withdrawal P1', soldAmount);
  }
  if (person2 && person2.phase === Phases.retired && person2.getTotalPensionCapital() > 0) {
    var soldAmount = person2.sellPension(person2.getTotalPensionCapital());
    if (soldAmount === null) {
      flagSimulationFailure(person2.age);
      return;
    }
    incomePrivatePension += soldAmount;
    attributionManager.record('incomeprivatepension', 'Pension Withdrawal P2', soldAmount);
  }

  // Unified investment asset liquidation - single loop over investmentAssets
  for (var i = 0; i < investmentAssets.length; i++) {
    var entry = investmentAssets[i];
    var assetObj = entry.asset;
    var cap = assetObj.capital();
    if (cap > 0) {
      var sold = assetObj.sell(cap);
      if (sold === null) {
        flagSimulationFailure(person1.age);
        return;
      }
      // Populate dynamic income map
      if (!investmentIncomeByKey) investmentIncomeByKey = {};
      if (!investmentIncomeByKey[entry.key]) investmentIncomeByKey[entry.key] = 0;
      investmentIncomeByKey[entry.key] += sold;
    }
  }

  netIncome = cashWithdraw + computeNetIncomeWithForeignCredits(revenue) + incomeTaxFree;
}

/**
 * Returns allocation map for the current simulation year based on residence country.
 * Allocations are scoped per country and switch when residence changes via MV events.
 * Falls back to StartCountry allocations if current country not configured.
 *
 * @param {number} year - Current simulation year (for future time-varying allocations)
 * @returns {Object} Map of investment type keys to allocation percentages
 */
function getAllocationsByYear(year) {
  // Derive residence country from person1.age (matches year loop context)
  var residenceCountry = getCountryForAgeCached(person1.age, events, params.StartCountry);

  var countryAllocations = params.investmentAllocationsByCountry[residenceCountry];
  // Missing per-country allocations means "no investing" for this residence period.
  return countryAllocations || {};
}

/**
 * Get pension contribution configuration for the given year's residence country.
 * @param {number} year - Simulation year
 * @returns {Object|null} - {p1Pct, p2Pct, capped} or null if not configured
 */
function getPensionContributionsByCountry(year) {
  if (!params.pensionContributionsByCountry) return null;
  var residenceCountry = getResidenceCountryForYear(year);
  return params.pensionContributionsByCountry[residenceCountry] || null;
}

/**
 * Derive residence country for a given year from MV events.
 * @param {number} year - Simulation year
 * @returns {string} - Country code (lowercase)
 */
function getResidenceCountryForYear(year) {
  var age = (person1 && typeof person1.age === 'number') ? person1.age : (year - params.startingAge + person1.age);
  var country = getCountryForAgeCached(age, events, params.StartCountry);
  return country ? String(country).toLowerCase() : (params.StartCountry || '').toLowerCase();
}

// Returns a growth rate map keyed by investment type key.
// Uses dynamic investmentGrowthRatesByKey from UI.
function getGrowthRatesByKey() {
  return params.investmentGrowthRatesByKey || {};
}

// Returns a volatility map keyed by investment type key.
// Uses dynamic investmentVolatilitiesByKey from UI.
function getVolatilitiesByKey() {
  return params.investmentVolatilitiesByKey || {};
}

// Returns a priority map keyed by investment type key.
// Backward-compat: derive ranks for 'indexFunds' and 'shares' from legacy params; others default to lowest priority (4).
function getDrawdownPrioritiesByKey() {
  return params.drawdownPrioritiesByKey;
}

function initializeRealEstate() {
  realEstate = new RealEstate();
  // buy properties that were bought before the startingAge
  let props = new Map();
  for (let i = 0; i < events.length; i++) {
    let event = events[i];
    switch (event.type) {
      case 'R':
        if (event.fromAge < params.startingAge) {
          if (!props.has(event.id)) {
            props.set(event.id, {
              "fromAge": event.fromAge,
              "property": null
            });
          } else {
            props.get(event.id).fromAge = event.fromAge;
          }
          var prePurchaseInfo = getEventCurrencyInfo(event, event.linkedCountry || currentCountry);
          // buy() receives numeric amount + currency/country metadata.
          // Asset classes track Money internally; Simulator works with numbers only.
          props.get(event.id).property = realEstate.buy(event.id, event.amount, event.rate, prePurchaseInfo.currency, prePurchaseInfo.country);
        }
        break;
      case 'M':
        if (event.fromAge < params.startingAge) {
          if (!props.has(event.id)) {
            props.set(event.id, {
              "fromAge": event.fromAge,
              "property": null
            });
          } else {
            props.get(event.id).fromAge = event.fromAge;
          }
          var preMortgageInfo = getEventCurrencyInfo(event, event.linkedCountry || currentCountry);
          // Use explicit mortgageTerm if provided, otherwise fall back to event duration.
          var term = (event.mortgageTerm !== undefined && event.mortgageTerm !== null)
            ? parseInt(event.mortgageTerm)
            : (event.toAge - event.fromAge);
          
          props.get(event.id).property = realEstate.mortgage(event.id, term, event.rate, event.amount, preMortgageInfo.currency, preMortgageInfo.country);
        }
        break;
      case 'MR':
        if (event.fromAge < params.startingAge) {
          if (!props.has(event.id)) {
            props.set(event.id, {
              "fromAge": event.fromAge,
              "property": null
            });
          } else {
            if (event.fromAge < props.get(event.id).fromAge) {
              props.get(event.id).fromAge = event.fromAge;
            }
          }
          var preReverseInfo = getEventCurrencyInfo(event, event.linkedCountry || currentCountry);
          props.get(event.id).property = realEstate.reverseMortgage(event.id, event.rate, preReverseInfo.currency, preReverseInfo.country);
        }
        break;
      default:
        break;
    }
  }
  // let years go by, repaying mortgage, until the starting age
  for (let [id, data] of props) {
    for (let y = data.fromAge; y < params.startingAge; y++) {
      for (let ei = 0; ei < events.length; ei++) {
        let preEvent = events[ei];
        if (!preEvent || preEvent.id !== id) continue;
        if (preEvent.type === 'MO') {
          if (y >= preEvent.fromAge && y <= (preEvent.toAge || 999)) {
            realEstate.overpayMortgage(id, Number(preEvent.amount) || 0);
          }
        } else if (preEvent.type === 'MP') {
          if (y === preEvent.fromAge) {
            realEstate.settleMortgage(id);
          }
        } else if (preEvent.type === 'MR') {
          if (y >= preEvent.fromAge && y <= (preEvent.toAge || 999)) {
            var preReverseInfo2 = getEventCurrencyInfo(preEvent, preEvent.linkedCountry || currentCountry);
            realEstate.reverseMortgage(id, preEvent.rate, preReverseInfo2.currency, preReverseInfo2.country);
            realEstate.advanceReverseMortgage(id, Number(preEvent.amount) || 0, preEvent.rate, preReverseInfo2.currency, preReverseInfo2.country);
          }
        }
      }
      data.property.addYear();
    }
  }
}

/**
 * Build unified context object for aggregate calculators.
 * Consolidates pre-computation and context building into a single function.
 * Both DataAggregatesCalculator and PresentValueCalculator use this context.
 */
function buildAggregateContext() {
  var cfg = Config.getInstance();
  var startYear = cfg.getSimulationStartYear();

  // Pre-compute values that require method calls on asset classes
  var realEstateConverted = realEstate.getTotalValueConverted(residenceCurrency, currentCountry, year);
  if (realEstateConverted === null) {
    throw new Error('Real estate value conversion failed: cannot convert total value to ' + residenceCurrency + ' for country ' + currentCountry + ' at year ' + year);
  }

  // Compute capitals by key (canonical: investmentAssets keys)
  var capsByKey = {};
  if (investmentAssets && investmentAssets.length > 0) {
    for (var ci = 0; ci < investmentAssets.length; ci++) {
      var centry = investmentAssets[ci];
      if (!centry || !centry.asset || typeof centry.asset.capital !== 'function') continue;
      var c = centry.asset.capital();
      capsByKey[centry.key] = (capsByKey[centry.key] || 0) + c;
    }
  }

  var pensionCap = person1.getTotalPensionCapital() + (person2 ? person2.getTotalPensionCapital() : 0);

  return {
    // Output targets
    dataSheet: dataSheet,
    row: row,
    dataRow: dataSheet[row],

    // Pre-computed values
    realEstateConverted: realEstateConverted,
    capsByKey: capsByKey,
    pensionCap: pensionCap,

    // Core simulation state
    person1: person1,
    person2: person2,
    params: params,
    cfg: cfg,
    countryInflationOverrides: (typeof countryInflationOverrides !== 'undefined') ? countryInflationOverrides : null,
    year: year,
    ageNum: person1.age,
    currentCountry: currentCountry,
    residenceCurrency: residenceCurrency,
    startYear: startYear,

    // Asset managers
    realEstate: realEstate,
    investmentAssets: investmentAssets,

    // Income/expense flows
    incomeSalaries: incomeSalaries,
    incomeShares: incomeShares,
    incomeRentals: incomeRentals,
    incomeSale: incomeSale,
    incomePrivatePension: incomePrivatePension,
    incomeStatePension: incomeStatePension,
    incomeStatePensionByCountry: (person1 && person1.yearlyIncomeStatePensionByCountry) ? person1.yearlyIncomeStatePensionByCountry : {},
    incomeStatePensionByCountryP2: (person2 && person2.yearlyIncomeStatePensionByCountry) ? person2.yearlyIncomeStatePensionByCountry : {},
    cashWithdraw: cashWithdraw,
    incomeDefinedBenefit: incomeDefinedBenefit,
    incomeTaxFree: incomeTaxFree,
    // Data sheet / chart semantics:
    // - `netIncome` is take-home cash from non-withdrawal income streams.
    // - Internal `netIncome` may be temporarily increased by withdrawals for solvency.
    netIncome: earnedNetIncome,
    expenses: expenses,
    cash: cash,
    purchaseCashUsedThisYear: purchaseCashUsedThisYear,
    personalPensionContribution: personalPensionContribution,
    personalPensionContributionByCountry: personalPensionContributionByCountry,
    incomePrivatePensionByCountry: incomePrivatePensionByCountry,
    incomeSalariesByCountry: incomeSalariesByCountry,
    incomeRentalsByCountry: incomeRentalsByCountry,
    withdrawalRate: withdrawalRate,

    // Dynamic maps
    investmentIncomeByKey: investmentIncomeByKey,

    // Taxman instance for tax column population
    revenue: revenue,
    stableTaxIds: stableTaxIds,

    // Helper function references (to avoid global coupling)
    getDeflationFactor: getDeflationFactor,
    getDeflationFactorForCountry: getDeflationFactorForCountry,
    normalizeCurrency: normalizeCurrency,
    normalizeCountry: normalizeCountry,
    convertCurrencyAmount: convertCurrencyAmount,
    getCurrencyForCountry: getCurrencyForCountry
  };
}

function updateYearlyData() {
  // dataSheet stores numeric aggregates only.
  // Money objects never leave asset class boundaries.
  // Capture per-run data for pinch point visualization
  if (capturePerRunResults) {
    if (!perRunResults[currentRun]) {
      perRunResults[currentRun] = [];
    }
    perRunResults[currentRun].push({
      netIncome: netIncome,
      earnedNetIncome: earnedNetIncome,
      householdPhase: householdPhase,
      expenses: expenses,
      success: success
    });
  }

  // Build unified context for all aggregate calculators
  var ctx = buildAggregateContext();

  // Compute nominal aggregates (extracted to DataAggregatesCalculator.js for testability)
  DataAggregatesCalculator.computeNominalAggregates(ctx);

  // Compute present-value aggregates (extracted to PresentValueCalculator.js for testability)
  PresentValueCalculator.computePresentValueAggregates(ctx);

  // Populate display attribution fields (extracted for exact-key tooltip testability)
  DisplayAttributionBuilder.populateDisplayAttributionFields(
    dataSheet[row],
    investmentAssets,
    investmentIncomeByKey,
    attributionManager,
    revenue,
    currentCountry
  );

  if (!montecarlo) {
    uiManager.updateDataRow(row, (person1.age - params.startingAge) / (100 - params.startingAge));
  }
}
