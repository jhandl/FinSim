var uiManager, params, events, config, dataSheet, row, errors;
var year, periods, failedAt, success, montecarlo;
var revenue, realEstate, stockGrowthOverride, attributionManager;
var netIncome, expenses, savings, targetCash, cashWithdraw, cashDeficit;
var incomeStatePension, incomePrivatePension, incomeFundsRent, incomeSharesRent, withdrawalRate;
var incomeSalaries, incomeShares, incomeRentals, incomeDefinedBenefit, incomeTaxFree, pensionContribution;
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
var cash, cashMoney, indexFunds, shares;
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
// Active residence currency (upper-cased ISO code) and cache for currency-country lookups
var residenceCurrency, currencyCountryCache;
var economicData, baseCountryCode;
// Module-level FX conversion cache - persists across Monte Carlo runs (FX rates are deterministic)
var fxConversionCache = {};

const Phases = {
  growth: 'growth',
  retired: 'retired'
}


async function run() {
  if (!(await initializeSimulator())) {
    // If initialization fails (validation errors), ensure UI state is reset
    uiManager.ui.flush();
    return;
  }
  // Check if we have volatility values
  const hasVolatility = (params.growthDevPension > 0 || params.growthDevFunds > 0 || params.growthDevShares > 0);

  // Monte Carlo mode is enabled when user selects it AND there are volatility values
  // For backward compatibility, if economyMode is undefined, infer from volatility values
  if (params.economyMode === undefined || params.economyMode === null) {
    montecarlo = hasVolatility; // Backward compatibility: auto-detect from volatility
  } else {
    montecarlo = (params.economyMode === 'montecarlo' && hasVolatility);
  }

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

function normalizeCurrency(code) {
  if (code === null || code === undefined) throw new Error('normalizeCurrency: code is null/undefined');
  return String(code).trim().toUpperCase();
}

function getCurrencyForCountry(code) {
  var normalized = normalizeCountry(code);
  if (!normalized) throw new Error('getCurrencyForCountry: empty country code');
  var cfg = Config.getInstance();
  var rs = cfg.getCachedTaxRuleSet(normalized);
  if (!rs) return null; // Ruleset not cached - return null instead of crashing
  var cur = rs.getCurrencyCode();
  if (cur) return normalizeCurrency(cur);
  return null; // No currency defined in ruleset
}

function ensureCurrencyCountryCache() {
  if (!currencyCountryCache) currencyCountryCache = {};
  return currencyCountryCache;
}

function findCountryForCurrency(currencyCode, preferredCountry) {
  if (!currencyCode) {
    var preferred = preferredCountry ? normalizeCountry(preferredCountry) : null;
    return preferred || normalizeCountry(Config.getInstance().getDefaultCountry());
  }
  var currency = normalizeCurrency(currencyCode);
  var preferred = preferredCountry ? normalizeCountry(preferredCountry) : null;
  if (!currency) return preferred || normalizeCountry(Config.getInstance().getDefaultCountry());
  var cache = ensureCurrencyCountryCache();
  if (cache[currency]) return cache[currency];

  if (preferred) {
    var prefCurrency = getCurrencyForCountry(preferred);
    if (normalizeCurrency(prefCurrency) === currency) {
      cache[currency] = preferred;
      return preferred;
    }
  }

  var cfg = Config.getInstance();
  var cachedSets = cfg.listCachedRuleSets();
  for (var key in cachedSets) {
    if (!Object.prototype.hasOwnProperty.call(cachedSets, key)) continue;
    var rs = cachedSets[key];
    var rsCurrency = normalizeCurrency(rs.getCurrencyCode());
    if (rsCurrency === currency) {
      var countryCode = rs.getCountryCode();
      if (!countryCode) {
        countryCode = key;
      }
      cache[currency] = normalizeCountry(countryCode);
      return cache[currency];
    }
  }

  if (preferred) {
    cache[currency] = preferred;
    return preferred;
  }

  // Return null instead of empty string when no match found
  // Don't cache null to allow retries with different preferredCountry
  return null;
}

function getEventCurrencyInfo(event, fallbackCountry) {
  var info = { currency: null, country: null };
  if (!event) {
    info.currency = normalizeCurrency(residenceCurrency) || 'EUR';
    info.country = normalizeCountry(fallbackCountry || currentCountry);
    return info;
  }
  var linkedCountry = event.linkedCountry ? normalizeCountry(event.linkedCountry) : null;
  if (event.currency) {
    info.currency = normalizeCurrency(event.currency);
    info.country = findCountryForCurrency(info.currency, linkedCountry || fallbackCountry || currentCountry);
    if (!info.country) {
      info.country = normalizeCountry(linkedCountry || fallbackCountry || currentCountry) || normalizeCountry(Config.getInstance().getDefaultCountry());
    }
  } else if (linkedCountry) {
    info.country = linkedCountry;
    info.currency = getCurrencyForCountry(linkedCountry) || normalizeCurrency(residenceCurrency) || 'EUR';
  } else {
    var fallback = normalizeCountry(fallbackCountry || currentCountry);
    info.country = fallback;
    info.currency = getCurrencyForCountry(fallback) || normalizeCurrency(residenceCurrency) || 'EUR';
  }
  if (!info.currency) {
    info.currency = normalizeCurrency(residenceCurrency) || 'EUR';
  }
  if (!info.country) {
    info.country = findCountryForCurrency(info.currency, fallbackCountry || currentCountry);
    if (!info.country) {
      info.country = normalizeCountry(fallbackCountry || currentCountry) || normalizeCountry(Config.getInstance().getDefaultCountry());
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

function convertCurrencyAmount(value, fromCurrency, fromCountry, toCurrency, toCountry, year, strict) {
  if (!value) return 0;
  // NOTE: This helper delegates to convertNominal(), which uses evolved FX (inflation-driven).
  // EconomicData.convert() defaults to 'evolution' mode, adopted by all ledger paths as of T9.
  var sourceCurrency = normalizeCurrency(fromCurrency);
  var targetCurrency = normalizeCurrency(toCurrency);
  if (!sourceCurrency || !targetCurrency || sourceCurrency === targetCurrency) {
    return value;
  }
  var sourceCountry = findCountryForCurrency(sourceCurrency, fromCountry);
  var sourceCountryMapped = !!sourceCountry; // Track if we successfully mapped currency to country
  if (!sourceCountry) {
    sourceCountry = normalizeCountry(fromCountry || currentCountry) || normalizeCountry(Config.getInstance().getDefaultCountry());
  }
  var targetCountry = findCountryForCurrency(targetCurrency, toCountry);
  var targetCountryMapped = !!targetCountry; // Track if we successfully mapped currency to country
  if (!targetCountry) {
    targetCountry = normalizeCountry(toCountry || currentCountry) || normalizeCountry(Config.getInstance().getDefaultCountry());
  }

  // In strict mode, fail if we couldn't map currency to country (even if we have fallback countries)
  if (strict && (!sourceCountryMapped || !targetCountryMapped)) {
    if (typeof errors !== 'undefined') {
      errors = true;
    }
    if (uiManager && typeof uiManager.setStatus === 'function') {
      var missingCurrency = !sourceCountryMapped ? sourceCurrency : targetCurrency;
      uiManager.setStatus("Unknown currency code: " + missingCurrency + " - cannot map to country", STATUS_COLORS.ERROR);
    }
    return null;
  }

  var converted = convertNominal(value, sourceCountry, targetCountry, year);
  if (converted === null || typeof converted !== 'number' || isNaN(converted)) {
    // Existing error handling (lines 270-286) is good, keep as-is
    console.error('convertCurrencyAmount: convertNominal failed for ' + sourceCountry + '->' + targetCountry + ' at year ' + year + '');
    console.warn("Currency conversion failed:", value, sourceCurrency, targetCurrency, year);
    if (typeof errors !== 'undefined') {
      errors = true;
    }
    if (uiManager && typeof uiManager.setStatus === 'function') {
      if (strict) {
        uiManager.setStatus("Currency conversion failed - check economic data for " + sourceCurrency + " to " + targetCurrency, STATUS_COLORS.ERROR);
      } else {
        uiManager.setStatus("Currency conversion failed - check economic data", STATUS_COLORS.WARNING);
      }
    }
    if (strict) {
      return null;
    }
    return value;
  }
  // Suppress "exceeds 1e12" warnings - these are expected for large ARS values in long simulations
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
  // Normalize parameter aliases to prevent NaN propagation from undefined keys (root-cause fix)
  // Tests may provide 'fundsAllocation'/'sharesAllocation' (lower camelCase); engine expects 'FundsAllocation'/'SharesAllocation'
  if (params) {
    // Ensure growth rates/devs are numeric defaults (0) when omitted by tests
    var toNumOrZero = function (v) {
      var n = (typeof v === 'string') ? parseFloat(v) : v;
      return (typeof n === 'number' && isFinite(n)) ? n : 0;
    };
    params.growthRateFunds = toNumOrZero(params.growthRateFunds);
    params.growthDevFunds = toNumOrZero(params.growthDevFunds);
    params.growthRateShares = toNumOrZero(params.growthRateShares);
    params.growthDevShares = toNumOrZero(params.growthDevShares);
    params.growthRatePension = toNumOrZero(params.growthRatePension);
    params.growthDevPension = toNumOrZero(params.growthDevPension);

    if (params.FundsAllocation === undefined && params.fundsAllocation !== undefined) {
      var fa = (typeof params.fundsAllocation === 'string') ? parseFloat(params.fundsAllocation) : params.fundsAllocation;
      params.FundsAllocation = (typeof fa === 'number' && isFinite(fa)) ? fa : 0;
    }
    if (params.SharesAllocation === undefined && params.sharesAllocation !== undefined) {
      var sa = (typeof params.sharesAllocation === 'string') ? parseFloat(params.sharesAllocation) : params.sharesAllocation;
      params.SharesAllocation = (typeof sa === 'number' && isFinite(sa)) ? sa : 0;
    }
    // Ensure numeric defaults if still missing
    if (typeof params.FundsAllocation !== 'number' || !isFinite(params.FundsAllocation)) params.FundsAllocation = 0;
    if (typeof params.SharesAllocation !== 'number' || !isFinite(params.SharesAllocation)) params.SharesAllocation = 0;
  }
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
  if (!readScenario(true)) {
    return false;
  }

  // StartCountry is mandatory
  // Accept both canonical 'StartCountry' and legacy 'startingCountry' param names
  var sc = (params && (params.StartCountry || params.startingCountry)) ? String(params.StartCountry || params.startingCountry).trim() : '';
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
  var volByKey = params.investmentVolatilitiesByKey || {};
  // Initialize investment instruments using dynamic growth/vol maps
  indexFunds = new IndexFunds(growthByKey.indexFunds || 0, volByKey.indexFunds || 0);
  shares = new Shares(growthByKey.shares || 0, volByKey.shares || 0);
  // Also create generic assets array (compat path: map first two to existing ones for IE)
  // Per strictness §9: investmentAssets must always be a valid, non-empty array
  try {
    var rs = (function () { try { return Config.getInstance().getCachedTaxRuleSet(params.StartCountry || config.getDefaultCountry()); } catch (_) { return null; } })();
    if (rs && typeof InvestmentTypeFactory !== 'undefined') {
      investmentAssets = InvestmentTypeFactory.createAssets(rs, growthByKey, volByKey);
      // NOTE: Do NOT replace GenericInvestmentAsset objects with legacy IndexFunds/Shares.
      // The factory creates assets with proper baseCurrency metadata for currency conversion.
      // Legacy indexFunds/shares objects are still maintained separately for backward compat
      // in data display, but investmentAssets should use the factory-created objects.
    }
  } catch (e) {
    // Catch silently - fallback below will populate investmentAssets
  }
  // Fallback: if investmentAssets is empty or undefined, create minimal array with legacy assets
  // This ensures withdraw() and liquidateAll() can always iterate over investmentAssets
  if (!investmentAssets || investmentAssets.length === 0) {
    investmentAssets = [
      { key: 'indexFunds', asset: indexFunds },
      { key: 'shares', asset: shares }
    ];
  }
  // Initialize investment assets with initial capital from dynamic map
  var initialCapitalByKey = params.initialCapitalByKey || {};
  var startCountry = normalizeCountry(params.StartCountry || config.getDefaultCountry());
  var startCurrency = getCurrencyForCountry(startCountry);
  for (var i = 0; i < investmentAssets.length; i++) {
    var entry = investmentAssets[i];
    var initialCapital = initialCapitalByKey[entry.key];
    if (initialCapital > 0) {
      var currency = entry.baseCurrency || startCurrency;
      var country = entry.assetCountry || startCountry;
      entry.asset.buy(initialCapital, currency, country);
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
    statePensionWeekly: params.statePensionWeekly,
    pensionContributionPercentage: params.pensionPercentage,
    statePensionCurrency: baseStateCurrency,
    statePensionCountry: baseStateCountry
  };
  person1 = new Person('P1', p1SpecificParams, params, {
    growthRatePension: params.growthRatePension,
    growthDevPension: params.growthDevPension
  });
  if (params.initialPension > 0) person1.pension.buy(params.initialPension, baseStateCurrency, baseStateCountry);

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
      statePensionWeekly: params.p2StatePensionWeekly,
      pensionContributionPercentage: params.pensionPercentageP2,
      statePensionCurrency: baseStateCurrency,
      statePensionCountry: baseStateCountry
    };
    person2 = new Person('P2', p2SpecificParams, params, {
      growthRatePension: params.growthRatePension,
      growthDevPension: params.growthDevPension
    });
    if (params.initialPensionP2 > 0) person2.pension.buy(params.initialPensionP2, baseStateCurrency, baseStateCountry);
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
  if (currentCountry && typeof params.inflation === 'number') {
    countryInflationOverrides[currentCountry] = params.inflation;
  }
  residenceCurrency = getCurrencyForCountry(currentCountry)
    || getCurrencyForCountry(params.StartCountry || config.getDefaultCountry())
    || normalizeCurrency(residenceCurrency)
    || 'EUR';

  initializeRealEstate();

  year = new Date().getFullYear() - 1;
  cash = params.initialSavings;
  cashMoney = Money.from(params.initialSavings, residenceCurrency, currentCountry);
  targetCash = params.emergencyStash; // Initialize target cash (emergency stash) in starting currency
  failedAt = 0;
  row = 0;
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
  incomePrivatePension = 0;
  incomeStatePension = 0;
  incomeStatePensionBaseCurrency = 0; // Track State Pension in base currency (EUR) for PV calculation
  incomeDefinedBenefit = 0;
  incomeFundsRent = 0;
  incomeSharesRent = 0;
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

  // Add year to Person objects (this increments their ages and calls pension.addYear())
  person1.addYear();
  if (person2) person2.addYear();

  // Pass Person objects to revenue reset (now using updated ages and year)
  revenue.reset(person1, person2, attributionManager, currentCountry, year);

  // Add year to global investment objects
  indexFunds.addYear();
  shares.addYear();
  // Also update generic assets if any (avoid double-calling for legacy assets)
  if (investmentAssets && investmentAssets.length > 0) {
    for (var i = 0; i < investmentAssets.length; i++) {
      var ga = investmentAssets[i].asset;
      if (!ga || !ga.addYear) continue;
      if (ga === indexFunds || ga === shares) continue; // skip duplicates
      ga.addYear();
    }
  }
  realEstate.addYear();

  // Reset yearly statistics for attribution tracking
  indexFunds.resetYearlyStats();
  shares.resetYearlyStats();
  if (investmentAssets && investmentAssets.length > 0) {
    for (var j = 0; j < investmentAssets.length; j++) {
      var assetObj = investmentAssets[j].asset;
      if (!assetObj || !assetObj.resetYearlyStats) continue;
      if (assetObj === indexFunds || assetObj === shares) continue; // skip duplicates
      assetObj.resetYearlyStats();
    }
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
      countryInflationOverrides: countryInflationOverrides,
      baseCountry: baseCountryCode,
      defaultRate: 0.02
    });
  }

  // Fallback: legacy inline logic (kept for safety in non-browser test contexts).
  var key = normalizeCountry(code);
  if (!key) key = baseCountryCode;
  if (countryInflationOverrides && countryInflationOverrides.hasOwnProperty(key)) {
    var override = countryInflationOverrides[key];

    if (override !== null && override !== undefined && override !== '') {
      return override;
    }
  }
  if (key === baseCountryCode && typeof params.inflation === 'number') {
    return params.inflation;
  }
  if (economicData && economicData.ready) {

    if (typeof economicData.getInflationForYear === 'function') {
      var cpiYear = economicData.getInflationForYear(key, year);
      if (cpiYear != null) {
        return Number(cpiYear) / 100;
      }
    }
    var cpi = economicData.getInflation(key);
    if (cpi != null) {
      return Number(cpi) / 100;
    }
  }
  var rs = config.getCachedTaxRuleSet ? config.getCachedTaxRuleSet(key) : null;
  if (rs && typeof rs.getInflationRate === 'function') {
    var rate = rs.getInflationRate();
    if (rate !== null && rate !== undefined) {

      return rate;
    }
  }
  if (typeof params.inflation === 'number') {
    return params.inflation;
  }

  return 0.02;
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
          attributionManager.record(p1MetricKey, 'Your Private Pension', p1AttrAmount);
        }
      }
    } else {
      // Fallback for single-country scenarios
      attributionManager.record('incomeprivatepension', 'Your Private Pension', person1.yearlyIncomePrivatePension);
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
    attributionManager.record('incomestatepension', 'Your State Pension', person1StatePension);
    incomeStatePension += person1StatePension;
    // Track base currency amount for PV calculation (before currency conversion)
    var person1StatePensionBaseCurrency = person1.yearlyIncomeStatePensionBaseCurrency ? person1.yearlyIncomeStatePensionBaseCurrency.amount : 0;
    if (person1StatePensionBaseCurrency > 0) {
      incomeStatePensionBaseCurrency += person1StatePensionBaseCurrency;
    }
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
            attributionManager.record(p2MetricKey, 'Their Private Pension', p2AttrAmount);
          }
        }
      } else {
        // Fallback for single-country scenarios
        attributionManager.record('incomeprivatepension', 'Their Private Pension', person2.yearlyIncomePrivatePension);
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
      attributionManager.record('incomestatepension', 'Their State Pension', person2StatePension);
      incomeStatePension += person2StatePension;
      // Track base currency amount for PV calculation (before currency conversion)
      var person2StatePensionBaseCurrency = person2.yearlyIncomeStatePensionBaseCurrency ? person2.yearlyIncomeStatePensionBaseCurrency.amount : 0;
      if (person2StatePensionBaseCurrency > 0) {
        incomeStatePensionBaseCurrency += person2StatePensionBaseCurrency;
      }
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
    var country = (info && info.country) ? normalizeCountry(info.country) : findCountryForCurrency(currency, currentCountry);
    if (!country) {
      country = normalizeCountry(currentCountry) || normalizeCountry(Config.getInstance().getDefaultCountry());
    } else {
      country = normalizeCountry(country);
    }
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
    if (!state || !amount) return;
    var key = ensureBucket(state.incomeBuckets, info);
    state.incomeBuckets[key].total += amount;
    var entry = payload || {};
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
    // In strict mode, check if currency can be mapped to country before attempting conversion
    // We need to verify the currency actually matches a country, not just get a fallback
    var sourceCountryMapped = findCountryForCurrency(normalizedCurrency, normalizedCountry);
    if (sourceCountryMapped) {
      // Verify the currency actually matches the country (not just a fallback)
      var mappedCurrency = getCurrencyForCountry(sourceCountryMapped);
      if (normalizeCurrency(mappedCurrency) !== normalizedCurrency) {
        // Currency doesn't match - this was a fallback, fail in strict mode
        sourceCountryMapped = null;
      }
    }
    if (!sourceCountryMapped) {
      // Currency cannot be mapped to any country - fail in strict mode
      if (typeof errors !== 'undefined') {
        errors = true;
      }
      if (uiManager && typeof uiManager.setStatus === 'function') {
        uiManager.setStatus("Unknown currency code: " + normalizedCurrency + " - cannot map to country", STATUS_COLORS.ERROR);
      }
      success = false;
      failedAt = person1.age;
      return 1; // Return 1 to avoid division by zero, but simulation will fail due to errors flag
    }
    var factor = convertCurrencyAmount(1, normalizedCurrency, normalizedCountry, residenceCurrency, currentCountry, year, true);
    if (factor === null) {
      // Strict mode failure: abort simulation
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
        case 'sale':
          cash += entryConvertedAmount;
          cashMoney.amount += entryConvertedAmount;
          attributionManager.record('realestatecapital', entry.label || ('Sale (' + entry.eventId + ')'), -entryConvertedAmount);
          break;

        case 'salary': {
          var salaryPerson = entry.personRef || person1;
          var isPensionable = entry.pensionable && salaryPerson && salaryPerson.pension;
          var declaredRate = 0;

          // Use consolidated total for incomeSalaries accumulation (only once per currency bucket)
          var consolidatedSalary = categoryTotalsByType['salary'] || 0;
          if (!countedCategories[entryCategory] && consolidatedSalary > 0) {
            incomeSalaries += consolidatedSalary;
            countedCategories[entryCategory] = true;
          }

          // Track salary by country for PV calculation
          if (entryConvertedAmount > 0) {
            var salaryCountry = normalizeCountry(bucketCountry);
            if (!incomeSalariesByCountry[salaryCountry]) {
              incomeSalariesByCountry[salaryCountry] = 0;
            }
            incomeSalariesByCountry[salaryCountry] += entryConvertedAmount;
          }

          // Determine if country qualification is needed for salary attribution
          var salaryMetricKey = 'incomesalaries';
          if (bucketCountry && bucketCountry !== currentCountry) {
            salaryMetricKey = 'incomesalaries:' + bucketCountry;
          }
          attributionManager.record(salaryMetricKey, entry.eventId, entryConvertedAmount);

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
              var baseRate = (salaryPerson.pensionContributionPercentageParam || 0) * getRateForKey(salaryPerson.age, bands);

              // Use salary's origin country for pension pot (not current residence)
              var pensionCountry = bucketCountry;
              var pensionCurrency = getCurrencyForCountry(pensionCountry);
              var pensionBaseAmount = entry.amount;

              // Convert to pension country currency if bucket currency differs
              if (bucketCurrency !== pensionCurrency && typeof convertCurrencyAmount === 'function') {
                var convertedToPensionCurrency = convertCurrencyAmount(entry.amount, bucketCurrency, bucketCountry, pensionCurrency, pensionCountry, year, false);
                if (convertedToPensionCurrency !== null && isFinite(convertedToPensionCurrency) && convertedToPensionCurrency > 0) {
                  pensionBaseAmount = convertedToPensionCurrency;
                }
              }
              if (params.pensionCapped === "Yes") {
                var cap = (rsSalary && typeof rsSalary.getPensionContributionAnnualCap === 'function') ? rsSalary.getPensionContributionAnnualCap() : 0;
                var capValue = adjust(cap);
                // Convert cap to pension country currency for comparison
                if (capValue > 0 && typeof convertCurrencyAmount === 'function') {
                  var capInPensionCurrency = convertCurrencyAmount(capValue, resCurrencyNorm, currentCountry, pensionCurrency, pensionCountry, year, false);
                  if (capInPensionCurrency !== null && isFinite(capInPensionCurrency) && capInPensionCurrency > 0) {
                    capValue = capInPensionCurrency;
                  }
                }
                if (capValue > 0 && pensionBaseAmount > capValue) {
                  baseRate = baseRate * capValue / pensionBaseAmount;
                }
              } else if (params.pensionCapped === "Match") {
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
                  personalAmountForDisplay = convertCurrencyAmount(personalAmount, pensionCurrency, pensionCountry, residenceCurrency, currentCountry, year, true) || personalAmount;
                  totalContribForDisplay = convertCurrencyAmount(totalContrib, pensionCurrency, pensionCountry, residenceCurrency, currentCountry, year, true) || totalContrib;
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
                salaryPerson.getPensionForCountry(pensionCountry).buy(totalContrib, pensionCurrency, pensionCountry);
              }
              declaredRate = baseRate;
            }
          }

          if (!declaredEntries[entryKey]) {
            const salaryMoney = Money.from(entryConvertedAmount, residenceCurrency, currentCountry);
            revenue.declareSalaryIncome(salaryMoney, declaredRate, salaryPerson, entry.eventId);
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
            revenue.declareNonEuSharesIncome(rsuMoney, entry.eventId);
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
          if (entryConvertedAmount > 0) {
            var rentalCountry = normalizeCountry(bucketCountry);
            if (!incomeRentalsByCountry[rentalCountry]) {
              incomeRentalsByCountry[rentalCountry] = 0;
            }
            incomeRentalsByCountry[rentalCountry] += entryConvertedAmount;
          }
          // Determine if country qualification is needed for rental attribution
          var rentalMetricKey = 'incomerentals';
          if (bucketCountry && bucketCountry !== currentCountry) {
            rentalMetricKey = 'incomerentals:' + bucketCountry;
          }
          attributionManager.record(rentalMetricKey, entry.eventId, entryConvertedAmount);
          if (entryConvertedAmount > 0 && !declaredEntries[entryKey]) {
            const otherIncomeMoney = Money.from(entryConvertedAmount, residenceCurrency, currentCountry);
            revenue.declareOtherIncome(otherIncomeMoney, entry.eventId);
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

        case 'purchase': {
          var purchaseTotal = categoryTotalsByType['purchase'] || entryConvertedAmount;
          var cashUsed = Math.min(cash, purchaseTotal);
          cash -= cashUsed;
          cashMoney.amount -= cashUsed;
          var shortfall = purchaseTotal - cashUsed;
          if (shortfall > 0) {
            expenses += shortfall;
            attributionManager.record('expenses', 'Purchase shortfall (' + entry.eventId + ')', shortfall);
          }
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
    if (typeof event.type === 'string' && event.type.indexOf('MV-') === 0) {
      if (person1.age === event.fromAge) {
        var prevCountry = currentCountry;
        var destCountry = event.type.substring(3).toLowerCase();
        var startCountry = (params.StartCountry || config.getDefaultCountry() || '').toLowerCase();
        var infCountry = null;
        if (event.currency) {
          infCountry = findCountryForCurrency(event.currency, prevCountry);
        }
        if (!infCountry && event.linkedCountry) {
          infCountry = normalizeCountry(event.linkedCountry);
        }
        if (!infCountry) {
          infCountry = prevCountry || startCountry;
        }
        var reloRate = resolveCountryInflation(infCountry);
        var relocationAmount = adjust(event.amount, reloRate);
        var relocationInfo = getEventCurrencyInfo(event, prevCountry || startCountry || currentCountry);
        if (relocationAmount > 0) {
          var relocationConverted = convertCurrencyAmount(relocationAmount, relocationInfo.currency, relocationInfo.country, residenceCurrency, prevCountry, year, true);
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
          var convertedCash = convertCurrencyAmount(cash, prevCurrency, prevCountryNormalized, newResidenceCurrency, destCountry, year, true);
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
            var convertedTargetCash = convertCurrencyAmount(targetCash, prevCurrency, prevCountryNormalized, newResidenceCurrency, destCountry, year, true);
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
        if (event.rate !== null && event.rate !== undefined && event.rate !== '') {
          if (!countryInflationOverrides) countryInflationOverrides = {};
          countryInflationOverrides[currentCountry] = event.rate;
        }
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
      if (realEstate && typeof realEstate.getCurrency === 'function') {
        propertyCurrency = realEstate.getCurrency(event.id);
      }
      if (realEstate && typeof realEstate.getLinkedCountry === 'function') {
        propertyCountry = realEstate.getLinkedCountry(event.id);
      }
      var saleInfo = getEventCurrencyInfo(event, propertyCountry || currentCountry);
      var saleEntryInfo = {
        currency: propertyCurrency || saleInfo.currency,
        country: propertyCountry || saleInfo.country
      };
      // sell() returns numeric amount in residence currency.
      // Internal Money conversion happens inside asset class; Simulator receives number only.
      var saleProceeds = realEstate.sell(event.id);
      recordIncomeEntry(saleState, saleEntryInfo, saleProceeds, {
        type: 'sale',
        eventId: event.id,
        label: 'Sale (' + event.id + ')'
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
          recordIncomeEntry(flowState, salaryInfo, amount, {
            type: 'salary',
            eventId: event.id,
            match: event.match || 0,
            personRef: person1,
            pensionable: true
          });
        }
        break;

      case 'SInp':
        if (inScope) {
          var salaryNpInfo = getEventCurrencyInfo(event, currentCountry);
          recordIncomeEntry(flowState, salaryNpInfo, amount, {
            type: 'salary',
            eventId: event.id,
            match: 0,
            personRef: person1,
            pensionable: false
          });
        }
        break;

      case 'SI2':
        if (inScope && person2) {
          var salary2Info = getEventCurrencyInfo(event, currentCountry);
          recordIncomeEntry(flowState, salary2Info, amount, {
            type: 'salary',
            eventId: event.id,
            match: event.match || 0,
            personRef: person2,
            pensionable: true
          });
        } else if (inScope) {
          var salaryFallbackInfo = getEventCurrencyInfo(event, currentCountry);
          recordIncomeEntry(flowState, salaryFallbackInfo, amount, {
            type: 'salary',
            eventId: event.id,
            match: 0,
            personRef: person1,
            pensionable: false
          });
        }
        break;

      case 'SI2np':
        if (inScope && person2) {
          var salary2npInfo = getEventCurrencyInfo(event, currentCountry);
          recordIncomeEntry(flowState, salary2npInfo, amount, {
            type: 'salary',
            eventId: event.id,
            match: 0,
            personRef: person2,
            pensionable: false
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
          var rentalInfo = getEventCurrencyInfo(event, event.linkedCountry || currentCountry);
          recordIncomeEntry(flowState, rentalInfo, amount, {
            type: 'rental',
            eventId: event.id
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
          // mortgage() receives numeric principal + currency/country metadata.
          // Asset classes track Money internally; Simulator works with numbers only.
          realEstate.mortgage(event.id, event.toAge - event.fromAge, event.rate, event.amount, mortgageInfo.currency, mortgageInfo.country);
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
        // MV-* relocation events are handled in zero pass above
        break;
    }
  }

  flushFlowState(flowState);

  if (revenue) {
    revenue.incomeByCurrency = incomeByCurrency;
    revenue.expensesByCurrency = expensesByCurrency;
  }
}


function handleInvestments() {
  netIncome = revenue.netIncome() + incomeTaxFree;
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
    cash += savings;
    cashMoney.amount += savings;
  }


  if (cash < targetCash) {
    cashDeficit = targetCash - cash;
  }
  // Compute capsByKey inline for capital calculations
  var capsByKey = {};
  capsByKey['indexFunds'] = indexFunds.capital();
  capsByKey['shares'] = shares.capital();
  if (investmentAssets && investmentAssets.length > 0) {
    for (var ci = 0; ci < investmentAssets.length; ci++) {
      var centry = investmentAssets[ci];
      if (!centry || !centry.asset || typeof centry.asset.capital !== 'function') continue;
      var assetObj = centry.asset;
      if (assetObj === indexFunds || assetObj === shares) continue;
      var c = assetObj.capital();
      capsByKey[centry.key] = (capsByKey[centry.key] || 0) + c;
    }
  }
  let totalInvestmentCaps = 0;
  for (var k in capsByKey) {
    totalInvestmentCaps += capsByKey[k];
  }
  let capitalPreWithdrawal = totalInvestmentCaps + person1.pension.capital() + (person2 ? person2.pension.capital() : 0);
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
    withdrawalRate = (incomeFundsRent + incomeSharesRent + incomePrivatePension) / capitalPreWithdrawal;
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
      var allocations = getAllocationsByKey();
      var sumInvested = 0;
      for (var i = 0; i < investmentAssets.length; i++) {
        var entry = investmentAssets[i];
        var alloc = allocations[entry.key] || 0;
        if (alloc > 0 && entry.asset && entry.asset.buy) {
          var amount = surplus * alloc;
          if (amount > 0) {
            // Apply currency conversion based on contributionCurrencyMode:
            // - 'asset': convert contribution from residence currency to asset's base currency
            // - 'residence': invest directly in residence currency (no conversion)
            if (entry.contributionCurrencyMode === 'asset') {
              var amountInAssetCurrency = convertCurrencyAmount(
                amount,
                residenceCurrency,
                currentCountry,
                entry.baseCurrency,
                entry.assetCountry,
                year
              );
              if (amountInAssetCurrency === null) {
                // Conversion failed - log error and skip this investment type
                if (uiManager && typeof uiManager.setStatus === 'function') {
                  uiManager.setStatus('Currency conversion failed for investment type: ' + entry.key, STATUS_COLORS.ERROR);
                }
                continue;
              }
              // Equity.buy() receives numeric amount + currency/country.
              // Asset classes track Money internally; capital() returns sum of numeric amounts.
              entry.asset.buy(amountInAssetCurrency, entry.baseCurrency, entry.assetCountry);
            } else {
              // contributionCurrencyMode === 'residence': invest directly in residence currency
              // Equity.buy() receives numeric amount + currency/country.
              // Asset classes track Money internally; capital() returns sum of numeric amounts.
              entry.asset.buy(amount, residenceCurrency, currentCountry);
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
    // Legacy two-asset investing path - use dynamic allocations
    if (!usedDynamic) {
      var allocByKey = getAllocationsByKey();
      // buy() receives numeric amount + currency/country metadata.
      // Asset classes track Money internally; Simulator works with numbers only.
      indexFunds.buy(surplus * (allocByKey.indexFunds || 0), residenceCurrency, currentCountry);
      shares.buy(surplus * (allocByKey.shares || 0), residenceCurrency, currentCountry);
      invested = surplus * ((allocByKey.indexFunds || 0) + (allocByKey.shares || 0));
      /**
       * @assumes residenceCurrency - Investment amounts are in residence currency.
       * @performance Hot path - direct .amount access for investment deduction.
       */
      cash -= invested;
      cashMoney.amount -= invested;
    }
  }
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

  // Inflate target cash (emergency stash) at residence country inflation to maintain purchasing power
  // This is done at the end of the year so it applies to the target for the NEXT year
  var residenceInflation = resolveCountryInflation(currentCountry);
  targetCash *= (1 + residenceInflation);
  if ((netIncome < expenses - 100) && success) {
    success = false;
    failedAt = person1.age;
  }
  // Final recomputation of taxes after all withdrawals/sales to ensure totals include any newly realised gains or income.
  revenue.computeTaxes();
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
    totalPensionCapital += person1.pension.capital();
  }
  if (person2 && person2.phase === Phases.retired) {
    totalPensionCapital += person2.pension.capital();
  }
  var totalAvailable = Math.max(0, cash) + Math.max(0, totalPensionCapital) + Math.max(0, clonedRevenue.netIncome());
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
        var p1Cap = person1.pension.capital();
        var p2Cap = person2 ? person2.pension.capital() : 0;
        if (p1Cap > 0.5 && (person1.phase === Phases.retired || person1.age >= person1.retirementAgeParam)) {
          var w1 = Math.min(p1Cap, needed);
          // sell() returns numeric amount in residence currency.
          // Internal Money conversion happens inside asset class; Simulator receives number only.
          var sold1 = person1.pension.sell(w1);
          if (sold1 === null) {
            flagSimulationFailure(person1.age);
            return;
          }
          incomePrivatePension += sold1;
          attributionManager.record('incomeprivatepension', 'Pension Drawdown P1', sold1);
          keepTrying = true;
        } else if (p2Cap > 0.5 && person2 && (person2.phase === Phases.retired || person2.age >= person2.retirementAgeParam)) {
          var w2 = Math.min(p2Cap, needed);
          var sold2 = person2.pension.sell(w2);
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
          // Populate legacy income buckets for backward compatibility
          if (entry.key === 'indexFunds') {
            incomeFundsRent += sold;
          } else if (entry.key === 'shares') {
            incomeSharesRent += sold;
          }
          // Record dynamic income for this investment type
          if (!investmentIncomeByKey) investmentIncomeByKey = {};
          if (!investmentIncomeByKey[entry.key]) investmentIncomeByKey[entry.key] = 0;
          investmentIncomeByKey[entry.key] += sold;
          keepTrying = true;
        }
      }

      netIncome = cashWithdraw + revenue.netIncome();
      if (keepTrying == false) { break; }
    }
  }
}

function liquidateAll() {
  cashWithdraw = cash;
  cash = 0;
  cashMoney = Money.zero(residenceCurrency, currentCountry);

  // Only liquidate pension if retired - pension should not be touched during growth phase
  if (person1.phase === Phases.retired && person1.pension.capital() > 0) {
    var soldAmount = person1.pension.sell(person1.pension.capital());
    if (soldAmount === null) {
      flagSimulationFailure(person1.age);
      return;
    }
    incomePrivatePension += soldAmount;
    attributionManager.record('incomeprivatepension', 'Pension Withdrawal P1', soldAmount);
  }
  if (person2 && person2.phase === Phases.retired && person2.pension.capital() > 0) {
    var soldAmount = person2.pension.sell(person2.pension.capital());
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
      // Populate legacy income buckets for backward compatibility
      if (entry.key === 'indexFunds') {
        incomeFundsRent += sold;
      } else if (entry.key === 'shares') {
        incomeSharesRent += sold;
      }
      // Populate dynamic income map
      if (!investmentIncomeByKey) investmentIncomeByKey = {};
      if (!investmentIncomeByKey[entry.key]) investmentIncomeByKey[entry.key] = 0;
      investmentIncomeByKey[entry.key] += sold;
    }
  }

  netIncome = cashWithdraw + revenue.netIncome();
}

// Returns an allocation map keyed by investment type key.
// Uses dynamic investmentAllocationsByKey from UI; legacy fallback for backward compat.
function getAllocationsByKey() {
  // Prefer dynamic map from params
  if (params.investmentAllocationsByKey) {
    return params.investmentAllocationsByKey;
  }
  // Legacy fallback
  var map = {};
  map['indexFunds'] = (typeof params.FundsAllocation === 'number') ? params.FundsAllocation : 0;
  map['shares'] = (typeof params.SharesAllocation === 'number') ? params.SharesAllocation : 0;
  return map;
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
  var map = {};
  try {
    map['indexFunds'] = (typeof params.priorityFunds === 'number') ? params.priorityFunds : 0;
    map['shares'] = (typeof params.priorityShares === 'number') ? params.priorityShares : 0;
  } catch (e) {
    map['indexFunds'] = 0;
    map['shares'] = 0;
  }
  // Assign a default lowest priority to any additional assets
  var defaultPriority = 4;
  if (investmentAssets && investmentAssets.length > 0) {
    for (var i = 0; i < investmentAssets.length; i++) {
      var key = investmentAssets[i].key;
      if (map[key] === undefined) {
        map[key] = defaultPriority;
      }
    }
  }
  return map;
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
          // mortgage() receives numeric principal + currency/country metadata.
          // Asset classes track Money internally; Simulator works with numbers only.
          props.get(event.id).property = realEstate.mortgage(event.id, event.toAge - event.fromAge, event.rate, event.amount, preMortgageInfo.currency, preMortgageInfo.country);
        }
        break;
      default:
        break;
    }
  }
  // let years go by, repaying mortgage, until the starting age
  for (let [id, data] of props) {
    for (let y = data.fromAge; y < params.startingAge; y++) {
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

  // Compute capitals by key while avoiding double-counting legacy assets
  var capsByKey = {};
  capsByKey['indexFunds'] = indexFunds.capital();
  capsByKey['shares'] = shares.capital();
  if (investmentAssets && investmentAssets.length > 0) {
    for (var ci = 0; ci < investmentAssets.length; ci++) {
      var centry = investmentAssets[ci];
      if (!centry || !centry.asset || typeof centry.asset.capital !== 'function') continue;
      var assetObj = centry.asset;
      if (assetObj === indexFunds || assetObj === shares) continue; // skip legacy duplicates
      var c = assetObj.capital();
      capsByKey[centry.key] = (capsByKey[centry.key] || 0) + c;
    }
  }

  var pensionCap = person1.pension.capital() + (person2 ? person2.pension.capital() : 0);

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
    indexFunds: indexFunds,
    shares: shares,
    investmentAssets: investmentAssets,

    // Income/expense flows
    incomeSalaries: incomeSalaries,
    incomeShares: incomeShares,
    incomeRentals: incomeRentals,
    incomePrivatePension: incomePrivatePension,
    incomeStatePension: incomeStatePension,
    incomeStatePensionBaseCurrency: (typeof incomeStatePensionBaseCurrency !== 'undefined') ? incomeStatePensionBaseCurrency : 0,
    incomeFundsRent: incomeFundsRent,
    incomeSharesRent: incomeSharesRent,
    cashWithdraw: cashWithdraw,
    incomeDefinedBenefit: incomeDefinedBenefit,
    incomeTaxFree: incomeTaxFree,
    // Data sheet / chart semantics:
    // - Use earned post-tax income (exclude withdrawals), but add back personal pension
    //   contributions so "NetIncome" reflects net earnings including pension savings.
    // - Internal `netIncome` may be temporarily increased by withdrawals for solvency.
    netIncome: earnedNetIncome + personalPensionContribution,
    expenses: expenses,
    cash: cash,
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

  // Populate attribution fields (extracted to AttributionPopulator.js for testability)
  AttributionPopulator.populateAttributionFields(
    dataSheet[row],
    indexFunds,
    shares,
    attributionManager,
    revenue
  );

  if (!montecarlo) {
    uiManager.updateDataRow(row, (person1.age - params.startingAge) / (100 - params.startingAge));
  }
}

/**
 * Returns investment context for UI components like RelocationImpactDetector.
 * Provides investmentAssets array and current capital by investment key.
 * Per §9 strictness: assumes investmentAssets is initialized and each entry has
 * a valid asset with capital() method.
 * @returns {Object} { investmentAssets, capsByKey }
 */
function getInvestmentContext() {
  // Build capsByKey map from current asset capitals
  var capsByKey = {};
  for (var i = 0; i < investmentAssets.length; i++) {
    capsByKey[investmentAssets[i].key] = investmentAssets[i].asset.capital();
  }

  return {
    investmentAssets: investmentAssets,
    capsByKey: capsByKey
  };
}

// Expose getInvestmentContext globally for UI access
this.getInvestmentContext = getInvestmentContext;
