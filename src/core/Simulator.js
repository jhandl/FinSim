/* This file has to work on both the website and Google Sheets */

var uiManager, params, events, config, dataSheet, row, errors;
var year, periods, failedAt, success, montecarlo;
var revenue, realEstate, stockGrowthOverride, attributionManager;
var netIncome, expenses, savings, targetCash, cashWithdraw, cashDeficit;
var incomeStatePension, incomePrivatePension, incomeFundsRent, incomeSharesRent, withdrawalRate;
var incomeSalaries, incomeShares, incomeRentals, incomeDefinedBenefit, incomeTaxFree, pensionContribution;
var cash, indexFunds, shares;
// Generic investment array (future replacement for specific variables)
var investmentAssets; // [{ key, label, asset }]
// Track per-investment-type flows to support dynamic UI columns
var investmentIncomeByKey; // { [key: string]: number }
var person1, person2;
// Variables for pinch point visualization
var perRunResults, currentRun;
// Variables for earned net income tracking
var earnedNetIncome, householdPhase;
// Stable tax ids for consistent Tax__... columns per run
var stableTaxIds;
// Country context for multi-country inflation application (currency is separate)
var currentCountry, countryInflationOverrides;
// Active residence currency (upper-cased ISO code) and cache for currency-country lookups
var residenceCurrency, currencyCountryCache;

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
  let runs = (montecarlo ? config.simulationRuns : 1);
  let successes = 0;
  
  // Initialize per-run results tracking
  perRunResults = [];
  
  uiManager.updateProgress("Running");
  for (currentRun = 0; currentRun < runs; currentRun++) {
    successes += runSimulation(); 
  }
  uiManager.updateDataSheet(runs, perRunResults);
  uiManager.updateStatusCell(successes, runs);
}

function normalizeCountry(code) {
  if (code === null || code === undefined) return '';
  return String(code).trim().toLowerCase();
}

function normalizeCurrency(code) {
  if (code === null || code === undefined) return '';
  return String(code).trim().toUpperCase();
}

function getCurrencyForCountry(code) {
  var normalized = normalizeCountry(code);
  if (!normalized) return null;
  try {
    var cfg = Config.getInstance();
    if (cfg && typeof cfg.getCachedTaxRuleSet === 'function') {
      var rs = cfg.getCachedTaxRuleSet(normalized);
      if (rs && typeof rs.getCurrencyCode === 'function') {
        var cur = rs.getCurrencyCode();
        if (cur) return normalizeCurrency(cur);
      }
    }
  } catch (_) {}
  return null;
}

function ensureCurrencyCountryCache() {
  if (!currencyCountryCache) currencyCountryCache = {};
  return currencyCountryCache;
}

function findCountryForCurrency(currencyCode, preferredCountry) {
  var currency = normalizeCurrency(currencyCode);
  var preferred = normalizeCountry(preferredCountry);
  if (!currency) return preferred || normalizeCountry((Config.getInstance() || {}).getDefaultCountry && Config.getInstance().getDefaultCountry());
  var cache = ensureCurrencyCountryCache();
  if (cache[currency]) return cache[currency];

  if (preferred) {
    var prefCurrency = getCurrencyForCountry(preferred);
    if (normalizeCurrency(prefCurrency) === currency) {
      cache[currency] = preferred;
      return preferred;
    }
  }

  try {
    var cfg = Config.getInstance();
    if (cfg && typeof cfg.listCachedRuleSets === 'function') {
      var cachedSets = cfg.listCachedRuleSets();
      for (var key in cachedSets) {
        if (!Object.prototype.hasOwnProperty.call(cachedSets, key)) continue;
        var rs = cachedSets[key];
        if (!rs || typeof rs.getCurrencyCode !== 'function') continue;
        var rsCurrency = normalizeCurrency(rs.getCurrencyCode());
        if (rsCurrency === currency) {
          var countryCode = null;
          if (typeof rs.getCountryCode === 'function') {
            countryCode = rs.getCountryCode();
          }
          if (!countryCode) {
            countryCode = key;
          }
          cache[currency] = normalizeCountry(countryCode);
          return cache[currency];
        }
      }
    }
  } catch (_) {}

  if (preferred) {
    cache[currency] = preferred;
    return preferred;
  }

  try {
    var cfg2 = Config.getInstance();
    if (cfg2 && typeof cfg2.getDefaultCountry === 'function') {
      var fallback = normalizeCountry(cfg2.getDefaultCountry());
      if (fallback) {
        cache[currency] = fallback;
        return fallback;
      }
    }
  } catch (_) {}

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
      info.country = normalizeCountry(linkedCountry || fallbackCountry || currentCountry) || normalizeCountry((Config.getInstance() || {}).getDefaultCountry && Config.getInstance().getDefaultCountry());
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
      info.country = normalizeCountry(fallbackCountry || currentCountry) || normalizeCountry((Config.getInstance() || {}).getDefaultCountry && Config.getInstance().getDefaultCountry());
    }
  }
  return info;
}

/**
 * Global helper function: Convert a nominal value between countries using constant FX rates (not PPP).
 * This is the standard ledger conversion helper that ensures all financial
 * calculations use nominal exchange rates rather than purchasing power parity.
 * 
 * Available globally for use by ledger code paths (e.g., Attribution.js).
 * Uses EconomicData.convert() with fxMode: 'constant' for ledger safety.
 * 
 * @param {number} value - Amount to convert
 * @param {string} fromCountry - Source country code (ISO-2, e.g., 'ie', 'ar')
 * @param {string} toCountry - Target country code (ISO-2, e.g., 'ie', 'ar')
 * @param {number} year - Simulation year for the conversion
 * @returns {number|null} Converted amount, or null if conversion fails
 */
function convertNominal(value, fromCountry, toCountry, year) {
  if (!value || !fromCountry || !toCountry) return value || null;
  var econ = null;
  try {
    if (typeof config !== 'undefined' && config && typeof config.getEconomicData === 'function') {
      econ = config.getEconomicData();
    } else {
      var cfg = Config.getInstance();
      if (cfg && typeof cfg.getEconomicData === 'function') {
        econ = cfg.getEconomicData();
      }
    }
  } catch (_) { econ = null; }
  if (!econ || !econ.ready || typeof econ.convert !== 'function') {
    return null;
  }
  var baseYear = null;
  try {
    if (config && typeof config.getSimulationStartYear === 'function') {
      baseYear = config.getSimulationStartYear();
    } else {
      var cfg2 = Config.getInstance();
      if (cfg2 && typeof cfg2.getSimulationStartYear === 'function') {
        baseYear = cfg2.getSimulationStartYear();
      }
    }
  } catch (_) { baseYear = null; }
  var options = {
    fxMode: 'constant',
    baseYear: (baseYear != null) ? baseYear : new Date().getFullYear()
  };
  var fromCountryUpper = String(fromCountry).toUpperCase();
  var toCountryUpper = String(toCountry).toUpperCase();
  return econ.convert(value, fromCountryUpper, toCountryUpper, year, options);
}

function convertCurrencyAmount(value, fromCurrency, fromCountry, toCurrency, toCountry, year, strict) {
  if (!value) return 0;
  var sourceCurrency = normalizeCurrency(fromCurrency);
  var targetCurrency = normalizeCurrency(toCurrency);
  if (!sourceCurrency || !targetCurrency || sourceCurrency === targetCurrency) {
    return value;
  }
  var sourceCountry = findCountryForCurrency(sourceCurrency, fromCountry);
  var sourceCountryMapped = !!sourceCountry; // Track if we successfully mapped currency to country
  if (!sourceCountry) {
    sourceCountry = normalizeCountry(fromCountry || currentCountry) || normalizeCountry((Config.getInstance() || {}).getDefaultCountry && Config.getInstance().getDefaultCountry());
  }
  var targetCountry = findCountryForCurrency(targetCurrency, toCountry);
  var targetCountryMapped = !!targetCountry; // Track if we successfully mapped currency to country
  if (!targetCountry) {
    targetCountry = normalizeCountry(toCountry || currentCountry) || normalizeCountry((Config.getInstance() || {}).getDefaultCountry && Config.getInstance().getDefaultCountry());
  }
  
  // In strict mode, fail if we couldn't map currency to country (even if we have fallback countries)
  if (strict && (!sourceCountryMapped || !targetCountryMapped)) {
    if (typeof errors !== 'undefined') {
      errors = true;
    }
    try {
      if (uiManager && typeof uiManager.setStatus === 'function') {
        var missingCurrency = !sourceCountryMapped ? sourceCurrency : targetCurrency;
        uiManager.setStatus("Unknown currency code: " + missingCurrency + " - cannot map to country", STATUS_COLORS.ERROR);
      }
    } catch (_) {}
    return null;
  }
  
  var converted = convertNominal(value, sourceCountry, targetCountry, year);
  if (converted === null || typeof converted !== 'number' || isNaN(converted)) {
    try { console.warn("Currency conversion failed:", value, sourceCurrency, targetCurrency, year); } catch (_) {}
    if (typeof errors !== 'undefined') {
      errors = true;
    }
    try {
      if (uiManager && typeof uiManager.setStatus === 'function') {
        if (strict) {
          uiManager.setStatus("Currency conversion failed - check economic data for " + sourceCurrency + " to " + targetCurrency, STATUS_COLORS.ERROR);
        } else {
          uiManager.setStatus("Currency conversion failed - check economic data", STATUS_COLORS.WARNING);
        }
      }
    } catch (_) {}
    if (strict) {
      return null;
    }
    return value;
  }
  return converted;
}

function convertToResidenceCurrency(amount, currency, country, year) {
  return convertCurrencyAmount(amount, currency, country, residenceCurrency, currentCountry, year);
}

function initializeUI() {
  if (typeof SpreadsheetApp !== 'undefined') {
    uiManager = new UIManager(GasUI.getInstance());
  } else {
    uiManager = new UIManager(WebUI.getInstance());
  }
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
  if (!readScenario(true)) {
    return false;
  }

  // When relocation is enabled, StartCountry is mandatory
  try {
    if (config && typeof config.isRelocationEnabled === 'function' && config.isRelocationEnabled()) {
      // Accept both canonical 'StartCountry' and legacy 'startingCountry' param names
      var sc = (params && (params.StartCountry || params.startingCountry)) ? String(params.StartCountry || params.startingCountry).trim() : '';
      if (!sc) {
        errors = true;
        success = false;
        uiManager.setStatus("StartCountry is required when relocation is enabled", STATUS_COLORS.ERROR);
        return false;
      }
    }
  } catch (_) {}

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
  // Initialize investment instruments (rates sourced inside from ruleset when available)
  indexFunds = new IndexFunds(params.growthRateFunds, params.growthDevFunds);
  shares = new Shares(params.growthRateShares, params.growthDevShares);
  // Also create generic assets array (compat path: map first two to existing ones for IE)
  try {
    var rs = (function(){ try { return Config.getInstance().getCachedTaxRuleSet(params.StartCountry || config.getDefaultCountry()); } catch(_) { return null; } })();
    if (rs && typeof InvestmentTypeFactory !== 'undefined') {
      var growthMap = {
        indexFunds: params.growthRateFunds,
        shares: params.growthRateShares
      };
      var stdevMap = {
        indexFunds: params.growthDevFunds,
        shares: params.growthDevShares
      };
      investmentAssets = InvestmentTypeFactory.createAssets(rs, growthMap, stdevMap);
      // Bridge: ensure first two assets align to legacy objects if present
      if (investmentAssets && investmentAssets.length > 0) {
        if (investmentAssets[0].key === 'indexFunds') investmentAssets[0].asset = indexFunds;
        if (investmentAssets.length > 1 && investmentAssets[1].key === 'shares') investmentAssets[1].asset = shares;
      }
    } else {
      investmentAssets = [];
    }
  } catch (e) {
    investmentAssets = [];
  }
  if (params.initialFunds > 0) indexFunds.buy(params.initialFunds);
  if (params.initialShares > 0) shares.buy(params.initialShares);

  // Initialize stable tax ids from ruleset for consistent Tax__ columns
  try {
    var _rs = (function(){ try { return Config.getInstance().getCachedTaxRuleSet(params.StartCountry || config.getDefaultCountry()); } catch(_) { return null; } })();
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
  if (params.initialPension > 0) person1.pension.buy(params.initialPension);

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
    if (params.initialPensionP2 > 0) person2.pension.buy(params.initialPensionP2);
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
  incomeDefinedBenefit = 0;
  incomeFundsRent = 0;
  incomeSharesRent = 0;
  incomeTaxFree = 0;
  pensionContribution = 0;
  // Reset per-type income map for the year
  investmentIncomeByKey = {};
  personalPensionContribution = 0;
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

function runSimulation() {
  initializeSimulationVariables();

  while (person1.age < params.targetAge) {

    row++;
    periods = row - 1;

    // console.log("  ======== Age: "+person1.age+" ========");

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
  if (p1CalcResults.lumpSumAmount > 0) {
    cash += p1CalcResults.lumpSumAmount;
    // Note: Lump sum tax is already declared in Pension.declareRevenue() when getLumpsum() calls sell()
  }
  if (person1.yearlyIncomePrivatePension > 0) {
            attributionManager.record('incomeprivatepension', 'Your Private Pension', person1.yearlyIncomePrivatePension);
    incomePrivatePension += person1.yearlyIncomePrivatePension;
  }
  if (person1.yearlyIncomeStatePension > 0) {
            attributionManager.record('incomestatepension', 'Your State Pension', person1.yearlyIncomeStatePension);
    incomeStatePension += person1.yearlyIncomeStatePension;
  }

  // Calculate pension income for Person 2 (if exists)
  if (person2) {
    const p2CalcResults = person2.calculateYearlyPensionIncome(config, currentCountry, residenceCurrency, year);
    if (p2CalcResults.lumpSumAmount > 0) {
      cash += p2CalcResults.lumpSumAmount;
      // Note: Lump sum tax is already declared in Pension.declareRevenue() when getLumpsum() calls sell()
    }
    if (person2.yearlyIncomePrivatePension > 0) {
              attributionManager.record('incomeprivatepension', 'Their Private Pension', person2.yearlyIncomePrivatePension);
      incomePrivatePension += person2.yearlyIncomePrivatePension;
    }
    if (person2.yearlyIncomeStatePension > 0) {
              attributionManager.record('incomestatepension', 'Their State Pension', person2.yearlyIncomeStatePension);
      incomeStatePension += person2.yearlyIncomeStatePension;
    }
  }

  // Declare total state pension to revenue
  revenue.declareStatePensionIncome(incomeStatePension);
}

function processEvents() {
  expenses = 0;
  if (!countryInflationOverrides) countryInflationOverrides = {};
  var economicData = (typeof config.getEconomicData === 'function') ? config.getEconomicData() : null;
  var baseCountryCode = ((params.StartCountry || config.getDefaultCountry() || '') + '').toLowerCase();

  function normalizeCountry(code) {
    return (code || '').toString().trim().toLowerCase();
  }

  function resolveCountryInflation(code) {
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
      country = normalizeCountry(currentCountry) || normalizeCountry((Config.getInstance() || {}).getDefaultCountry && Config.getInstance().getDefaultCountry());
    } else {
      country = normalizeCountry(country);
    }
    return {
      currency: currency || 'EUR',
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
      try {
        if (uiManager && typeof uiManager.setStatus === 'function') {
          uiManager.setStatus("Unknown currency code: " + normalizedCurrency + " - cannot map to country", STATUS_COLORS.ERROR);
        }
      } catch (_) {}
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
      var entryKey = entry.eventId ? String(entry.eventId) : (entryCategory + '_' + i);

      switch (entry.type) {
        case 'sale':
          cash += entryConvertedAmount;
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

          attributionManager.record('incomesalaries', entry.eventId, entryConvertedAmount);

          if (isPensionable && entryConvertedAmount > 0) {
            var rsSalary = (function(){ try { return Config.getInstance().getCachedTaxRuleSet(currentCountry); } catch(_) { return null; } })();
            var bands = (rsSalary && typeof rsSalary.getPensionContributionAgeBands === 'function') ? rsSalary.getPensionContributionAgeBands() : {};
            var baseRate = (salaryPerson.pensionContributionPercentageParam || 0) * getRateForKey(salaryPerson.age, bands);
            if (params.pensionCapped === "Yes") {
              var cap = (rsSalary && typeof rsSalary.getPensionContributionAnnualCap === 'function') ? rsSalary.getPensionContributionAnnualCap() : 0;
              var capValue = adjust(cap);
              if (capValue > 0 && entryConvertedAmount > capValue) {
                baseRate = baseRate * capValue / entryConvertedAmount;
              }
            } else if (params.pensionCapped === "Match") {
              baseRate = Math.min(entry.match || 0, baseRate);
            }
            var employerRate = Math.min(entry.match || 0, baseRate);
            var personalAmount = baseRate * entryConvertedAmount;
            var employerAmount = employerRate * entryConvertedAmount;
            var totalContrib = personalAmount + employerAmount;
            if (totalContrib > 0) {
              pensionContribution += totalContrib;
              personalPensionContribution += personalAmount;
              if (personalAmount > 0) {
                attributionManager.record('pensioncontribution', entry.eventId, personalAmount);
              }
              salaryPerson.pension.buy(totalContrib);
            }
            declaredRate = baseRate;
          }

          if (!declaredEntries[entryKey]) {
            revenue.declareSalaryIncome(entryConvertedAmount, declaredRate, salaryPerson, entry.eventId);
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
            revenue.declareNonEuSharesIncome(entryConvertedAmount, entry.eventId);
            declaredEntries[entryKey] = true;
          }
          break;

        case 'rental':
          var rentalTotal = categoryTotalsByType['rental'] || 0;
          if (!countedCategories[entryCategory] && rentalTotal > 0) {
            incomeRentals += rentalTotal;
            countedCategories[entryCategory] = true;
          }
          attributionManager.record('incomerentals', entry.eventId, entryConvertedAmount);
          if (entryConvertedAmount > 0 && !declaredEntries[entryKey]) {
            revenue.declareOtherIncome(entryConvertedAmount, entry.eventId);
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
            var rsDbi = (function(){ try { return Config.getInstance().getCachedTaxRuleSet(currentCountry); } catch(_) { return null; } })();
            var dbiSpec = (rsDbi && typeof rsDbi.getDefinedBenefitSpec === 'function') ? rsDbi.getDefinedBenefitSpec() : null;
            if (!dbiSpec || !dbiSpec.treatment) {
              errors = true;
              try { uiManager.setStatus("Tax rules error: Defined Benefit behaviour is not defined in the active ruleset.", STATUS_COLORS.ERROR); } catch (_) {}
            } else {
              switch (dbiSpec.treatment) {
                case 'privatePension':
                  revenue.declarePrivatePensionIncome(entryConvertedAmount, person1, entry.eventId);
                  break;
                case 'salary':
                  var contrib = (dbiSpec.salary && typeof dbiSpec.salary.contribRate === 'number') ? dbiSpec.salary.contribRate : 0;
                  revenue.declareSalaryIncome(entryConvertedAmount, contrib, person1, entry.eventId);
                  break;
                default:
                  errors = true;
                  try { uiManager.setStatus("Tax rules error: Unknown DBI treatment '" + String(dbiSpec.treatment) + "'.", STATUS_COLORS.ERROR); } catch (_) {}
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

  // First pass: process property sales so proceeds are consolidated before purchases
  var saleState = createFlowState();
  for (let i = 0; i < events.length; i++) {
    let event = events[i];
    if (event.type === 'R' && event.toAge && person1.age === event.toAge) {
      var propertyCurrency = null;
      var propertyCountry = null;
      try {
        if (realEstate && typeof realEstate.getCurrency === 'function') {
          propertyCurrency = realEstate.getCurrency(event.id);
        }
      } catch (_) {}
      try {
        if (realEstate && typeof realEstate.getLinkedCountry === 'function') {
          propertyCountry = realEstate.getLinkedCountry(event.id);
        }
      } catch (_) {}
      var saleInfo = getEventCurrencyInfo(event, propertyCountry || currentCountry);
      var saleEntryInfo = {
        currency: propertyCurrency || saleInfo.currency,
        country: propertyCountry || saleInfo.country
      };
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
  var allowCashConversion = (params && params.convertCashOnRelocation === true);

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
          realEstate.mortgage(event.id, event.toAge - event.fromAge, event.rate, event.amount, mortgageInfo.currency, mortgageInfo.country);
        }
        if (inScope) {
          var payment = realEstate.getPayment(event.id);
          var mortgageCurrency = mortgageInfo.currency;
          var mortgageCountry = mortgageInfo.country;
          try {
            var storedCurrency = realEstate.getCurrency(event.id);
            if (storedCurrency) mortgageCurrency = storedCurrency;
          } catch (_) {}
          try {
            var storedCountry = realEstate.getLinkedCountry(event.id);
            if (storedCountry) mortgageCountry = storedCountry;
          } catch (_) {}
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
            flushFlowState(flowState);
            var prevCurrency = residenceCurrency;
            var prevCountryNormalized = prevCountry;
            var newResidenceCurrency = getCurrencyForCountry(destCountry) || prevCurrency || 'EUR';
            if (allowCashConversion && prevCurrency && newResidenceCurrency && prevCurrency !== newResidenceCurrency) {
              // TODO(financial-engine): convert pooled cash once multi-currency cash tracking lands.
              var convertedCash = convertCurrencyAmount(cash, prevCurrency, prevCountryNormalized, newResidenceCurrency, destCountry, year, true);
              if (convertedCash === null) {
                success = false;
                failedAt = person1.age;
                return; // Abort processing this year
              }
              cash = convertedCash;
            }
            currentCountry = destCountry;
            residenceCurrency = newResidenceCurrency;
            conversionFactorCache = {};
            if (event.rate !== null && event.rate !== undefined && event.rate !== '') {
              if (!countryInflationOverrides) countryInflationOverrides = {};
              countryInflationOverrides[currentCountry] = event.rate;
            }
            flowState = createFlowState();
          }
        }
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

  if (netIncome > expenses) {
    savings = netIncome - expenses;
    cash += savings;
  }
  targetCash = adjust(params.emergencyStash);
  if (cash < targetCash) {
    cashDeficit = targetCash - cash;
  }
  let capitalPreWithdrawal = indexFunds.capital() + shares.capital() + person1.pension.capital() + (person2 ? person2.pension.capital() : 0);
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
    // Dynamic distribution across generic investment assets only if there are more than the two legacy assets
    if (investmentAssets && investmentAssets.length > 0) {
      var allocations = getAllocationsByKey();
      var sumInvested = 0;
      for (var i = 0; i < investmentAssets.length; i++) {
        var entry = investmentAssets[i];
        var alloc = allocations[entry.key] || 0;
        if (alloc > 0 && entry.asset && entry.asset.buy) {
          var amount = surplus * alloc;
          if (amount > 0) {
            entry.asset.buy(amount);
            sumInvested += amount;
            usedDynamic = true;
          }
        }
      }
      if (usedDynamic) {
        invested = sumInvested;
        cash -= invested;
      }
    }
    // Legacy two-asset investing path
    if (!usedDynamic) {
      indexFunds.buy(surplus * params.FundsAllocation);
      shares.buy(surplus * params.SharesAllocation);
      invested = surplus * (params.FundsAllocation + params.SharesAllocation);
      cash -= invested;
    }
  }
  if ((netIncome > expenses + invested) && (targetCash - cash > 0.001)) {
    let addToStash = netIncome - (expenses + invested);
    cash += addToStash;
  }
  if ((netIncome < expenses - 100) && success) {
    success = false;
    failedAt = person1.age;
  }
  // Final recomputation of taxes after all withdrawals/sales to ensure totals include any newly realised gains or income.
  revenue.computeTaxes();
}


// Get more money from: cash, pension, Index Funds, Shares, 
// in the specified order of priority:
// - fromX = 0 (don't use X)
// - fromX = 1 (use X first)
// - fromX = 2 (use X if first option not enough)
// - fromX = 3 (use X if first and second options not enough)
//
function withdraw(cashPriority, pensionPriority, FundsPriority, SharesPriority) {
  // Dynamic generic path only when we have additional assets beyond legacy two
  if (investmentAssets && investmentAssets.length > 2) {
    const clonedRevenue = revenue.clone();
    // Simulate selling all investment assets to estimate total availability after taxes
    for (let si = 0; si < investmentAssets.length; si++) {
      let simAsset = investmentAssets[si].asset;
      if (simAsset && simAsset.simulateSellAll) simAsset.simulateSellAll(clonedRevenue);
    }
    let needed = expenses + cashDeficit - netIncome;
    let totalPensionCapital = person1.pension.capital() + (person2 ? person2.pension.capital() : 0);
    let totalAvailable = Math.max(0, cash) + Math.max(0, totalPensionCapital) + Math.max(0, clonedRevenue.netIncome());
    if (needed > totalAvailable + 0.01) {
      liquidateAll();
      return;
    }

    cashWithdraw = 0;
    let totalWithdraw = 0;
    const prioritiesByKey = getDrawdownPrioritiesByKey();
    // Determine max priority rank across assets and special buckets
    let maxRank = 0;
    for (let k in prioritiesByKey) { if (prioritiesByKey.hasOwnProperty(k)) { maxRank = Math.max(maxRank, prioritiesByKey[k] || 0); } }
    maxRank = Math.max(maxRank, cashPriority || 0, pensionPriority || 0, 4);

    for (let priority = 1; priority <= maxRank; priority++) {
      let loopCount = 0;
      while (expenses + cashDeficit - netIncome >= 1) {
        loopCount++;
        if (loopCount > 50) { break; }
        needed = expenses + cashDeficit - netIncome;
        let keepTrying = false;

        // Cash bucket
        if (priority === cashPriority) {
          if (cash > 0.5) {
            cashWithdraw = Math.min(cash, needed);
            totalWithdraw += cashWithdraw;
            cash -= cashWithdraw;
            attributionManager.record('incomecash', 'Cash Withdrawal', cashWithdraw);
          }
        }

        // Pension bucket (P1 then P2)
        if (priority === pensionPriority) {
          let p1Cap = person1.pension.capital();
          let p2Cap = person2 ? person2.pension.capital() : 0;
          if (p1Cap > 0.5 && (person1.phase === Phases.retired || person1.age >= person1.retirementAgeParam)) {
            let w1 = Math.min(p1Cap, needed);
            totalWithdraw += w1;
            let sold1 = person1.pension.sell(w1);
            incomePrivatePension += sold1;
            attributionManager.record('incomeprivatepension', 'Pension Drawdown P1', sold1);
            keepTrying = true;
          } else if (p2Cap > 0.5 && person2 && (person2.phase === Phases.retired || person2.age >= person2.retirementAgeParam)) {
            let w2 = Math.min(p2Cap, needed);
            totalWithdraw += w2;
            let sold2 = person2.pension.sell(w2);
            incomePrivatePension += sold2;
            attributionManager.record('incomeprivatepension', 'Pension Drawdown P2', sold2);
            keepTrying = true;
          }
        }

        // Investment assets at this priority
        for (let ai = 0; ai < investmentAssets.length; ai++) {
          let entry = investmentAssets[ai];
          let rank = prioritiesByKey[entry.key] || 0;
          if (rank !== priority) continue;
          let assetObj = entry.asset;
          if (!assetObj || !assetObj.capital) continue;
          let cap = assetObj.capital();
          if (cap > 0.5) {
            let w = Math.min(cap, needed);
            totalWithdraw += w;
            let sold = assetObj.sell(w);
            // Maintain legacy income buckets for the two legacy assets
            if (assetObj === indexFunds || entry.key === 'indexFunds') {
              incomeFundsRent += sold;
            } else if (assetObj === shares || entry.key === 'shares') {
              incomeSharesRent += sold;
            }
            // Record dynamic income for this investment type
            try {
              if (entry && entry.key) {
                if (!investmentIncomeByKey) investmentIncomeByKey = {};
                if (!investmentIncomeByKey[entry.key]) investmentIncomeByKey[entry.key] = 0;
                investmentIncomeByKey[entry.key] += sold;
              }
            } catch (_) {}
            keepTrying = true;
          }
        }

        netIncome = cashWithdraw + revenue.netIncome();
        if (keepTrying == false) { break; }
      }
    }
    return;
  }

  // Legacy two-asset path (default for IE compatibility)
  const clonedRevenue = revenue.clone();
  indexFunds.simulateSellAll(clonedRevenue);
  shares.simulateSellAll(clonedRevenue);
  let needed = expenses + cashDeficit - netIncome;
  let totalPensionCapital = person1.pension.capital() + (person2 ? person2.pension.capital() : 0);
  let totalAvailable = Math.max(0, cash) + Math.max(0, totalPensionCapital) + Math.max(0, clonedRevenue.netIncome());
  if (needed > totalAvailable + 0.01) {
    liquidateAll();
    return;
  }
  
  cashWithdraw = 0;
  let totalWithdraw = 0;
  for (let priority = 1; priority <= 4; priority++) {
    let loopCount = 0;
    while (expenses + cashDeficit - netIncome >= 1) {
      loopCount++;
      if (loopCount > 50) { break; }
      needed = expenses + cashDeficit - netIncome;
      let keepTrying = false;
      let indexFundsCapital = indexFunds.capital();
      let sharesCapital = shares.capital();
      let person1PensionCapital = person1.pension.capital();
      let person2PensionCapital = person2 ? person2.pension.capital() : 0;
      switch (priority) {
        case cashPriority:
          if (cash > 0.5) {
            cashWithdraw = Math.min(cash, needed);
            totalWithdraw += cashWithdraw;
            cash -= cashWithdraw;
            attributionManager.record('incomecash', 'Cash Withdrawal', cashWithdraw);
          }
          break;
        case pensionPriority:
          if (person1PensionCapital > 0.5 && (person1.phase === Phases.retired || person1.age >= person1.retirementAgeParam)) {
            let withdraw = Math.min(person1PensionCapital, needed);
            totalWithdraw += withdraw;
            const soldAmount = person1.pension.sell(withdraw);
            incomePrivatePension += soldAmount;
            attributionManager.record('incomeprivatepension', 'Pension Drawdown P1', soldAmount);
            keepTrying = true;
          } else if (person2PensionCapital > 0.5 && person2 && (person2.phase === Phases.retired || person2.age >= person2.retirementAgeParam)) {
            let withdraw = Math.min(person2PensionCapital, needed);
            totalWithdraw += withdraw;
            const soldAmount = person2.pension.sell(withdraw);
            incomePrivatePension += soldAmount;
            attributionManager.record('incomeprivatepension', 'Pension Drawdown P2', soldAmount);
            keepTrying = true;
          }
          break;
        case FundsPriority:
          if (indexFundsCapital > 0.5) {
            let withdraw = Math.min(indexFundsCapital, needed);
            totalWithdraw += withdraw;
            let soldAmt = indexFunds.sell(withdraw);
            incomeFundsRent += soldAmt;
            try {
              if (!investmentIncomeByKey) investmentIncomeByKey = {};
              if (!investmentIncomeByKey['indexFunds']) investmentIncomeByKey['indexFunds'] = 0;
              investmentIncomeByKey['indexFunds'] += soldAmt;
            } catch (_) {}
            keepTrying = true;
          }
          break;
        case SharesPriority:
          if (sharesCapital > 0.5) {
            let withdraw = Math.min(sharesCapital, needed);
            totalWithdraw += withdraw;
            let soldAmt = shares.sell(withdraw);
            incomeSharesRent += soldAmt;
            try {
              if (!investmentIncomeByKey) investmentIncomeByKey = {};
              if (!investmentIncomeByKey['shares']) investmentIncomeByKey['shares'] = 0;
              investmentIncomeByKey['shares'] += soldAmt;
            } catch (_) {}
            keepTrying = true;
          }
          break;
        default:
      }
      netIncome = cashWithdraw + revenue.netIncome();
      if (keepTrying == false) { break; }
    }
  }
}

function liquidateAll() {
  cashWithdraw = cash;
  cash = 0;
  
  if (person1.pension.capital() > 0) {
    const soldAmount = person1.pension.sell(person1.pension.capital());
    incomePrivatePension += soldAmount;
    attributionManager.record('incomeprivatepension', 'Pension Withdrawal P1', soldAmount);
  }
  if (person2 && person2.pension.capital() > 0) {
    const soldAmount = person2.pension.sell(person2.pension.capital());
    incomePrivatePension += soldAmount;
    attributionManager.record('incomeprivatepension', 'Pension Withdrawal P2', soldAmount);
  }
  if (indexFunds.capital() > 0) {
    var soldIdx = indexFunds.sell(indexFunds.capital());
    incomeFundsRent += soldIdx;
    try {
      if (!investmentIncomeByKey) investmentIncomeByKey = {};
      if (!investmentIncomeByKey['indexFunds']) investmentIncomeByKey['indexFunds'] = 0;
      investmentIncomeByKey['indexFunds'] += soldIdx;
    } catch (_) {}
  }
  if (shares.capital() > 0) {
    var soldSh = shares.sell(shares.capital());
    incomeSharesRent += soldSh;
    try {
      if (!investmentIncomeByKey) investmentIncomeByKey = {};
      if (!investmentIncomeByKey['shares']) investmentIncomeByKey['shares'] = 0;
      investmentIncomeByKey['shares'] += soldSh;
    } catch (_) {}
  }
  // Also liquidate any additional generic investment assets (avoid double-selling legacy ones)
  if (investmentAssets && investmentAssets.length > 2) {
    for (var li = 0; li < investmentAssets.length; li++) {
      var ent = investmentAssets[li];
      if (!ent || !ent.asset || !ent.asset.capital) continue;
      var assetObj = ent.asset;
      if (assetObj === indexFunds || assetObj === shares) continue; // already liquidated above
      var cap = assetObj.capital();
      if (cap > 0) {
        assetObj.sell(cap);
      }
    }
  }
  netIncome = cashWithdraw + revenue.netIncome();
}

// Returns an allocation map keyed by investment type key.
// Backward-compat: map legacy Funds/Shares allocations to 'indexFunds' and 'shares'.
function getAllocationsByKey() {
  var map = {};
  try {
    // Bridge only; UI dynamic allocations to be wired in later phases
    map['indexFunds'] = (typeof params.FundsAllocation === 'number') ? params.FundsAllocation : 0;
    map['shares'] = (typeof params.SharesAllocation === 'number') ? params.SharesAllocation : 0;
  } catch (e) {
    map['indexFunds'] = 0;
    map['shares'] = 0;
  }
  return map;
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
          var prePurchaseInfo = getEventCurrencyInfo(event, event.linkedCountry || currentCountry || params.StartCountry);
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
          var preMortgageInfo = getEventCurrencyInfo(event, event.linkedCountry || currentCountry || params.StartCountry);
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


function updateYearlyData() {
  // This is used below to hide the deemed disposal tax payments, otherwise they're shown as income.
  let FundsTax = (incomeFundsRent + incomeSharesRent + cashWithdraw > 0) ? revenue.getTaxTotal('capitalGains') * incomeFundsRent / (incomeFundsRent + incomeSharesRent + cashWithdraw) : 0;
  let SharesTax = (incomeFundsRent + incomeSharesRent + cashWithdraw > 0) ? revenue.getTaxTotal('capitalGains') * incomeSharesRent / (incomeFundsRent + incomeSharesRent + cashWithdraw) : 0;

  // Capture per-run data for pinch point visualization
  if (!perRunResults[currentRun]) {
    perRunResults[currentRun] = [];
  }
  perRunResults[currentRun].push({
    netIncome: netIncome,
    earnedNetIncome: earnedNetIncome,
    householdPhase: householdPhase,
    expenses: expenses,
    success: success,
    attributions: attributionManager.getAllAttributions()
  });
  
  if (!(row in dataSheet)) {
    dataSheet[row] = { "age": 0, "year": 0, "incomeSalaries": 0, "incomeRSUs": 0, "incomeRentals": 0, "incomePrivatePension": 0, "incomeStatePension": 0, "incomeFundsRent": 0, "incomeSharesRent": 0, "incomeCash": 0, "incomeDefinedBenefit": 0, "incomeTaxFree": 0, "realEstateCapital": 0, "netIncome": 0, "expenses": 0, "pensionFund": 0, "cash": 0, "indexFundsCapital": 0, "sharesCapital": 0, "pensionContribution": 0, "withdrawalRate": 0, "worth": 0, "attributions": {}, "investmentIncomeByKey": {}, "investmentCapitalByKey": {}, "taxByKey": {} };
    // Pre-initialize stable tax columns for consistency across rows
    if (stableTaxIds && stableTaxIds.length > 0) {
      for (var ti = 0; ti < stableTaxIds.length; ti++) {
        var tcol = 'Tax__' + stableTaxIds[ti];
        if (dataSheet[row][tcol] === undefined) dataSheet[row][tcol] = 0;
      }
    }
    
    // Initialize dynamic tax columns based on current tax totals
    if (revenue && revenue.taxTotals) {
      for (const taxId in revenue.taxTotals) {
        const taxColumnName = `Tax__${taxId}`;
        dataSheet[row][taxColumnName] = 0;
      }
    }
  }
  dataSheet[row].age += person1.age;
  dataSheet[row].year += year;
  var realEstateConverted = 0;
  try {
    if (realEstate && typeof realEstate.getTotalValueConverted === 'function') {
      var converted = realEstate.getTotalValueConverted(residenceCurrency, currentCountry, year);
      if (converted === null) {
        // Strict mode failure: abort simulation
        success = false;
        failedAt = person1.age;
        realEstateConverted = 0;
      } else {
        realEstateConverted = converted;
      }
    } else if (realEstate && typeof realEstate.getTotalValue === 'function') {
      realEstateConverted = realEstate.getTotalValue();
    }
  } catch (_) {
    try {
      realEstateConverted = realEstate.getTotalValue();
    } catch (__) {
      realEstateConverted = 0;
    }
  }
  dataSheet[row].incomeSalaries += incomeSalaries;
  dataSheet[row].incomeRSUs += incomeShares;
  dataSheet[row].incomeRentals += incomeRentals;
  dataSheet[row].incomePrivatePension += incomePrivatePension;
  dataSheet[row].incomeStatePension += incomeStatePension;
  dataSheet[row].incomeFundsRent += incomeFundsRent;
  dataSheet[row].incomeSharesRent += incomeSharesRent;
  dataSheet[row].incomeCash += Math.max(cashWithdraw, 0);
  dataSheet[row].incomeDefinedBenefit += incomeDefinedBenefit;
  dataSheet[row].incomeTaxFree += incomeTaxFree;
  dataSheet[row].realEstateCapital += realEstateConverted;
  dataSheet[row].netIncome += netIncome;
  dataSheet[row].expenses += expenses;
  dataSheet[row].pensionFund += person1.pension.capital() + (person2 ? person2.pension.capital() : 0);
  dataSheet[row].cash += cash;
  dataSheet[row].indexFundsCapital += indexFunds.capital();
  dataSheet[row].sharesCapital += shares.capital();
  // Accumulate per-type income and capital for dynamic UI columns
  try {
    if (investmentIncomeByKey) {
      for (var k in investmentIncomeByKey) {
        if (!dataSheet[row].investmentIncomeByKey[k]) dataSheet[row].investmentIncomeByKey[k] = 0;
        dataSheet[row].investmentIncomeByKey[k] += investmentIncomeByKey[k];
      }
    }
    // Compute capitals by key while avoiding double-counting legacy assets
    var capsByKey = {};
    try { capsByKey['indexFunds'] = indexFunds.capital(); } catch (_) {}
    try { capsByKey['shares'] = shares.capital(); } catch (_) {}
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
    for (var key in capsByKey) {
      if (!dataSheet[row].investmentCapitalByKey[key]) dataSheet[row].investmentCapitalByKey[key] = 0;
      dataSheet[row].investmentCapitalByKey[key] += capsByKey[key];
    }
  } catch (_) {}
  dataSheet[row].pensionContribution += personalPensionContribution;
  dataSheet[row].withdrawalRate += withdrawalRate;
  
  // Populate dynamic tax columns
  if (revenue && revenue.taxTotals) {
    for (const taxId in revenue.taxTotals) {
      const taxColumnName = `Tax__${taxId}`;
      if (!dataSheet[row][taxColumnName]) {
        dataSheet[row][taxColumnName] = 0;
      }
      dataSheet[row][taxColumnName] += revenue.getTaxByType(taxId);
    }
  }
  
  dataSheet[row].worth += realEstateConverted + person1.pension.capital() + (person2 ? person2.pension.capital() : 0) + indexFunds.capital() + shares.capital() + cash;

  // Record portfolio statistics for tooltip attribution
  const indexFundsStats = indexFunds.getPortfolioStats();
  const indexFundsNet = indexFundsStats.yearlyBought - indexFundsStats.yearlySold;
  if (indexFundsNet > 0) {
    attributionManager.record('indexfundscapital', 'Bought', indexFundsNet);
  } else if (indexFundsNet < 0) {
    attributionManager.record('indexfundscapital', 'Sold', -indexFundsNet);
  }
  attributionManager.record('indexfundscapital', 'Principal', indexFundsStats.principal);
  attributionManager.record('indexfundscapital', 'P/L', indexFundsStats.totalGain);
  
  const sharesStats = shares.getPortfolioStats();
  const sharesNet = sharesStats.yearlyBought - sharesStats.yearlySold;
  if (sharesNet > 0) {
    attributionManager.record('sharescapital', 'Bought', sharesNet);
  } else if (sharesNet < 0) {
    attributionManager.record('sharescapital', 'Sold', -sharesNet);
  }
  attributionManager.record('sharescapital', 'Principal', sharesStats.principal);
  attributionManager.record('sharescapital', 'P/L', sharesStats.totalGain);
  
  const currentAttributions = attributionManager.getAllAttributions();
  for (const metric in currentAttributions) {
    if (!dataSheet[row].attributions[metric]) {
      dataSheet[row].attributions[metric] = {};
    }
    try {
      const breakdown = currentAttributions[metric].getBreakdown();
      for (const source in breakdown) {
        if (!dataSheet[row].attributions[metric][source]) {
          dataSheet[row].attributions[metric][source] = 0;
        }
        dataSheet[row].attributions[metric][source] += breakdown[source];
      }
    } catch (error) {
      console.error(`Error getting breakdown for ${metric}:`, error);
    }
  }

  // After processing standard taxes accumulation, accumulate dynamic taxTotals
  try {
    const totMap = revenue.taxTotals || {};
    if (!dataSheet[row].taxByKey) dataSheet[row].taxByKey = {};
    for (const tId in totMap) {
      if (!dataSheet[row].taxByKey[tId]) dataSheet[row].taxByKey[tId] = 0;
      dataSheet[row].taxByKey[tId] += totMap[tId];
    }
  } catch (_) {}

  if (!montecarlo) {
    uiManager.updateDataRow(row, (person1.age-params.startingAge) / (100-params.startingAge));
  }
  // At the end of the year, when updating the data sheet
  // dataSheet[row].sharesCapital = shares.capital();
}
