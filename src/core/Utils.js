/* This file has to work on both the website and Google Sheets */

// This function assumes fixed rate when an explicit rate is provided. When
// rate is omitted it will resolve an inflation rate using the current
// simulation context (country/year) via InflationService where available,
// falling back to params.inflation to preserve legacy behaviour.
function adjust(value, rate = null, n = periods) {
  // Explicit rate: keep legacy behaviour (no country logic).
  if ((rate !== null) && (rate !== undefined) && (rate !== "")) {
    return value * Math.pow(1 + rate, (typeof n === 'number') ? n : periods);
  }

  // Context-aware path: try to derive an inflation rate for the active country/year.
  var effectiveRate = null;
  var hasContext = false;
  try {
    hasContext = (typeof currentCountry !== 'undefined' && currentCountry) &&
      (typeof year === 'number');
  } catch (_) {
    hasContext = false;
  }

  if (hasContext && typeof InflationService !== 'undefined' && InflationService && typeof InflationService.resolveInflationRate === 'function') {
    try {
      var cfg = Config.getInstance();
      var economicData = cfg.getEconomicData();
      var baseCountry = params.StartCountry || cfg.getDefaultCountry();

      // Use the simulator's active country/year so tax thresholds and other
      // implicit adjust() calls move with the same CPI as flows.
      effectiveRate = InflationService.resolveInflationRate(currentCountry, year, {
        params: params,
        config: cfg,
        economicData: economicData,
        countryInflationOverrides: countryInflationOverrides,
        baseCountry: baseCountry,
        defaultRate: 0.02
      });
    } catch (_) {
      effectiveRate = null;
    }
  }

  // Fallback to params.inflation only if InflationService couldn't resolve a rate
  // (null/undefined means failure, but 0 might be a valid rate, so we check params.inflation explicitly)
  if (effectiveRate === null || effectiveRate === undefined) {
    // Legacy fallback: single global scalar inflation.
    effectiveRate = (params && typeof params.inflation === 'number') ? params.inflation : 0;
  }

  var periodsToUse = (typeof n === 'number') ? n : periods;
  return value * Math.pow(1 + effectiveRate, periodsToUse);
}

/**
 * Deflate a nominal future value back to present-value terms by reversing inflation.
 *
 * This is the inverse of adjust(), dividing by the compound growth factor instead
 * of multiplying. It is used by the present-value display system to express
 * simulated future amounts in today's money.
 *
 * @param {number} value - Nominal future value to convert to present-value.
 * @param {number|null} rate - Inflation rate to use (e.g., 0.02 for 2%). If null/undefined/empty,
 *                             defaults to params.inflation.
 * @param {number} n - Number of periods (years) to deflate. Defaults to global periods.
 * @returns {number} Present-value amount in today's terms.
 *
 * @example
 * // A value of 110 in one year at 10% inflation deflates to 100 today
 * // deflate(110, 0.10, 1) -> 100
 */
function deflate(value, rate = null, n = periods) {
  // Explicit rate: legacy fixed-rate behaviour.
  if ((rate !== null) && (rate !== undefined) && (rate !== "")) {
    var baseFixed = 1 + rate;
    if (baseFixed <= 0) {
      return value;
    }
    return value / Math.pow(baseFixed, (typeof n === 'number') ? n : periods);
  }

  // Context-aware path: mirror adjust() logic to preserve inverse semantics.
  var effectiveRate = null;
  var hasContext = false;
  try {
    hasContext = (typeof currentCountry !== 'undefined' && currentCountry) &&
      (typeof year === 'number');
  } catch (_) {
    hasContext = false;
  }

  if (hasContext && typeof InflationService !== 'undefined' && InflationService && typeof InflationService.resolveInflationRate === 'function') {
    try {
      effectiveRate = InflationService.resolveInflationRate(currentCountry, year, {
        params: (typeof params !== 'undefined') ? params : null,
        countryInflationOverrides: (typeof countryInflationOverrides !== 'undefined') ? countryInflationOverrides : null
      });
    } catch (_) {
      effectiveRate = null;
    }
  }

  if (effectiveRate === null || effectiveRate === undefined) {
    effectiveRate = (params && typeof params.inflation === 'number') ? params.inflation : 0;
  }

  var base = 1 + effectiveRate;
  if (base <= 0) {
    return value;
  }
  var periodsToUse = (typeof n === 'number') ? n : periods;
  return value / Math.pow(base, periodsToUse);
}

/**
 * Compute a multiplicative deflation factor for a given simulation age/year.
 *
 * This helper returns the factor that converts nominal values at a specific
 * simulation point back to present-value. It derives the number of periods (n)
 * since the start of the simulation and returns deflate(1, inflationRate, n).
 *
 * Period calculation:
 * - Preferred: use age - params.startingAge when both are available.
 * - Fallback:  use (year - startYear) when age represents a calendar year.
 *   If startYear is not provided, attempts Config.getInstance().getSimulationStartYear().
 *
 * @param {number} age - Simulation age (preferred) or calendar year for the row.
 * @param {number|null} startYear - Simulation start year (calendar), e.g., Config.getSimulationStartYear().
 * @param {number|null} inflationRate - Inflation rate to use; if null/undefined/empty, defaults to params.inflation.
 * @returns {number} The deflation factor (multiply a nominal value by this to get present-value).
 *
 * @example
 * // With params.startingAge = 30, age 35 and inflation 2%, n = 5
 * // getDeflationFactor(35, null, 0.02) ~ 1 / (1.02^5)
 */
function getDeflationFactor(age, startYear, inflationRate) {
  var n = 0;

  var ageNum = (age === null || age === undefined || age === "") ? null : parseFloat(age);
  var startingAge = (typeof params !== 'undefined' && params && params.startingAge !== undefined && params.startingAge !== null && params.startingAge !== "")
    ? parseFloat(params.startingAge)
    : null;

  if (ageNum !== null && !isNaN(ageNum) && startingAge !== null && !isNaN(startingAge)) {
    n = ageNum - startingAge;
  } else {
    var sy = (startYear === null || startYear === undefined || startYear === "") ? null : parseInt(startYear, 10);
    if ((sy === null || isNaN(sy)) && typeof Config !== 'undefined' && Config && typeof Config.getInstance === 'function') {
      try {
        sy = parseInt(Config.getInstance().getSimulationStartYear(), 10);
      } catch (_e) { }
    }
    if (ageNum !== null && !isNaN(ageNum) && sy !== null && !isNaN(sy)) {
      n = ageNum - sy;
    } else {
      n = 0;
    }
  }

  if (n < 0) { n = 0; }

  if ((inflationRate === null) || (inflationRate === undefined) || (inflationRate === "")) {
    inflationRate = params.inflation;
  }

  return deflate(1, inflationRate, n);
}

/**
 * Compute a present-value deflation factor for a specific country.
 *
 * This helper mirrors the present-value logic used in the simulator but
 * allows callers to target an arbitrary country (asset country, pension
 * country, etc.) instead of only the active residency country. It is
 * designed for multi-country asset present-value calculations where, for
 * example, an Irish property should continue to use IE inflation even
 * after relocating to another country.
 *
 * The function:
 *  - Normalizes the provided country code.
 *  - Derives an effective calendar year using either options.year or
 *    (startYear + (ageNum - params.startingAge)) when available.
 *  - Resolves an inflation rate via InflationService.resolveInflationRate().
 *  - Falls back to params.inflation (or 0) when resolution fails.
 *  - Delegates to getDeflationFactor(ageNum, startYear, inflationRate).
 *
 * Inputs are defensive: missing/invalid age or startYear return 1, and the
 * final factor is clamped to 1 when it is invalid, NaN, or non-positive.
 *
 * @param {string} countryCode - ISO-2 country code (e.g., 'ie', 'ar') for which to compute the deflation factor.
 * @param {number} ageNum - Current simulation age (e.g., person1.age).
 * @param {number} startYear - Simulation start year (e.g., Config.getSimulationStartYear()).
 * @param {Object=} options - Optional context:
 *   - params: scenario parameters (must include startingAge/inflation for best results)
 *   - config: Config instance
 *   - economicData: EconomicData instance
 *   - countryInflationOverrides: per-country inflation overrides
 *   - year: explicit effective calendar year for CPI lookup
 *
 * @returns {number} Multiplicative factor to convert nominal future values
 *                   to present-value for the given country.
 *
 * @example
 * // With params.startingAge = 30, inflation = 0.02, startYear = 2020:
 * // getDeflationFactorForCountry('ie', 35, 2020, { params }) ~ 1 / (1.02^5)
 *
 * @note This helper is intended for multi-country asset PV and does not
 *       change existing residency-based PV behaviour.
 */
function getDeflationFactorForCountry(countryCode, ageNum, startYear, options) {
  // Guard against missing core inputs: without age/startYear we cannot
  // meaningfully compute periods, so return neutral factor 1.
  var ageVal = (ageNum === null || ageNum === undefined || ageNum === "") ? null : parseFloat(ageNum);
  var startYearVal = (startYear === null || startYear === undefined || startYear === "") ? null : parseInt(startYear, 10);

  if (ageVal === null || isNaN(ageVal) || startYearVal === null || isNaN(startYearVal)) {
    return 1;
  }

  var opts = options || {};

  // Resolve params/config/economicData/overrides from options or globals.
  var paramsObj = opts.params || null;
  try {
    if (!paramsObj && typeof params !== 'undefined') {
      paramsObj = params;
    }
  } catch (_e0) { }

  var cfg = opts.config || null;
  try {
    if (!cfg && typeof Config !== 'undefined' && Config && typeof Config.getInstance === 'function') {
      cfg = Config.getInstance();
    }
  } catch (_e1) { }

  var economicData = opts.economicData || null;
  if (!economicData && cfg && typeof cfg.getEconomicData === 'function') {
    try {
      economicData = cfg.getEconomicData();
    } catch (_e2) { }
  }

  var overrides = opts.countryInflationOverrides || null;
  if (!overrides) {
    try {
      if (typeof countryInflationOverrides !== 'undefined') {
        overrides = countryInflationOverrides;
      }
    } catch (_e3) { }
  }

  // Normalize country code using shared InflationService helper when available
  // to avoid drift from the central implementation. Fall back to a local,
  // minimal normalizer when the service is not present (e.g. in legacy tests).
  var key = '';
  if (typeof InflationService !== 'undefined' && InflationService && typeof InflationService.normalizeCountry === 'function') {
    try {
      key = InflationService.normalizeCountry(countryCode) || '';
    } catch (_eNorm) {
      key = '';
    }
  } else if (countryCode !== null && countryCode !== undefined) {
    key = String(countryCode).trim().toLowerCase();
  }

  // Derive effective calendar year for CPI lookup.
  var effectiveYear = null;
  if (opts && typeof opts.year === 'number' && isFinite(opts.year)) {
    effectiveYear = opts.year;
  } else {
    var startingAge = null;
    if (paramsObj && paramsObj.startingAge !== undefined && paramsObj.startingAge !== null && paramsObj.startingAge !== "") {
      startingAge = parseFloat(paramsObj.startingAge);
    }
    if (startingAge !== null && !isNaN(startingAge)) {
      var nYears = ageVal - startingAge;
      if (!isNaN(nYears)) {
        effectiveYear = startYearVal + nYears;
      }
    }
  }

  var inflationRate = null;

  // Resolve inflation using InflationService when available.
  if (typeof InflationService !== 'undefined' && InflationService && typeof InflationService.resolveInflationRate === 'function') {
    try {
      inflationRate = InflationService.resolveInflationRate(key, effectiveYear, {
        params: paramsObj,
        config: cfg,
        economicData: economicData,
        countryInflationOverrides: overrides
      });
    } catch (_e4) {
      inflationRate = null;
    }
  }

  // Fallback: scenario scalar inflation, then 0.
  if (inflationRate === null || inflationRate === undefined || inflationRate === "") {
    if (paramsObj && typeof paramsObj.inflation === 'number') {
      inflationRate = paramsObj.inflation;
    } else {
      inflationRate = 0;
    }
  }

  var factor = getDeflationFactor(ageVal, startYearVal, inflationRate);

  if (typeof factor !== 'number' || !isFinite(factor) || factor <= 0) {
    return 1;
  }

  return factor;
}

function gaussian(mean, stdev, withOverride = true) {
  let u1 = 1 - Math.random();
  let u2 = 1 - Math.random();
  let val = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  if (withOverride && (stockGrowthOverride !== undefined)) {
    mean = stockGrowthOverride;
  }
  return mean + stdev * val;
}

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function between(a, b, p) {
  return Math.round(a + (b - a) * p);
}

function isBetween(num, min, max) {
  return ((num >= min) && (num <= max));
}

function serializeSimulation(ui) {
  var config = Config.getInstance();
  var startCountry = config.getStartCountry();
  var startRuleset = config.getCachedTaxRuleSet(startCountry);
  var investmentTypes = startRuleset.getResolvedInvestmentTypes() || [];
  // Collect events early so we can infer scenario countries for economy fields.
  var events = ui.getTableData('Events', 6, true);
  var scenarioCountries = [];
  var scenarioCountrySet = {};
  var scLower = (startCountry || config.getDefaultCountry() || '').toString().trim().toLowerCase();
  if (scLower) {
    scenarioCountrySet[scLower] = true;
    scenarioCountries.push(scLower);
  }
  for (var ei = 0; ei < events.length; ei++) {
    var evt = events[ei];
    var rawType = evt && evt[0] ? String(evt[0]) : '';
    var type = rawType;
    if (rawType.indexOf(':') >= 0) type = rawType.split(':')[0];
    if (type && /^MV-[A-Z]{2,}$/.test(type)) {
      var cc = type.substring(3).toLowerCase();
      if (!scenarioCountrySet[cc]) {
        scenarioCountrySet[cc] = true;
        scenarioCountries.push(cc);
      }
    }
  }

  var priorityLegacyIdsByBaseType = {
    cash: 'PriorityCash',
    pension: 'PriorityPension',
    indexFunds: 'PriorityFunds',
    shares: 'PriorityShares'
  };
  var getPriorityValue = function(baseType, fallbackValue) {
    var dynamicId = 'Priority_' + baseType;
    var legacyId = priorityLegacyIdsByBaseType[baseType];
    var value = null;
    try {
      if (typeof document === 'undefined' || document.getElementById(dynamicId)) {
        value = ui.getValue(dynamicId);
      }
    } catch (_) { value = null; }
    if (value === undefined || value === null || value === '') {
      try {
        if (legacyId && (typeof document === 'undefined' || document.getElementById(legacyId))) {
          value = ui.getValue(legacyId);
        }
      } catch (_) { value = null; }
    }
    if (value === undefined || value === null || value === '') return fallbackValue;
    return value;
  };

  // Collect all parameters
  const parameters = {
    StartingAge: ui.getValue('StartingAge'),
    TargetAge: ui.getValue('TargetAge'),
    InitialSavings: ui.getValue('InitialSavings'),
    InitialPension: ui.getValue('InitialPension'),
    RetirementAge: ui.getValue('RetirementAge'),
    EmergencyStash: ui.getValue('EmergencyStash'),
    PensionContributionPercentage: ui.getValue('PensionContributionPercentage'),
    PensionContributionCapped: ui.getValue('PensionContributionCapped'),
    PensionGrowthRate: ui.getValue('PensionGrowthRate'),
    PensionGrowthStdDev: ui.getValue('PensionGrowthStdDev'),
    Inflation: ui.getValue('Inflation'),
    MarriageYear: ui.getValue('MarriageYear'),
    YoungestChildBorn: ui.getValue('YoungestChildBorn'),
    OldestChildBorn: ui.getValue('OldestChildBorn'),
    PersonalTaxCredit: ui.getValue('PersonalTaxCredit'),
    StatePensionWeekly: ui.getValue('StatePensionWeekly'),
    PriorityCash: getPriorityValue('cash', 1),
    PriorityPension: getPriorityValue('pension', 2),
    PriorityFunds: getPriorityValue('indexFunds', 3),
    PriorityShares: getPriorityValue('shares', 4),
    // Person 2 Parameters
    P2StartingAge: ui.getValue('P2StartingAge'),
    P2RetirementAge: ui.getValue('P2RetirementAge'),
    P2StatePensionWeekly: ui.getValue('P2StatePensionWeekly'),
    InitialPensionP2: ui.getValue('InitialPensionP2'),
    PensionContributionPercentageP2: ui.getValue('PensionContributionPercentageP2'),
    // Simulation Mode
    simulation_mode: ui.getValue('simulation_mode'),
    // Economy Mode
    economy_mode: ui.getValue('economy_mode'),
    // Feature toggles
    investmentStrategiesEnabled: ui.getValue('investmentStrategiesEnabled'),
    perCountryInvestmentsEnabled: ui.getValue('perCountryInvestmentsEnabled')
  };

  var priorityBaseTypes = {};
  priorityBaseTypes.cash = true;
  priorityBaseTypes.pension = true;
  for (var sci0 = 0; sci0 < scenarioCountries.length; sci0++) {
    var cc0 = scenarioCountries[sci0];
    var ruleset0 = config.getCachedTaxRuleSet(cc0);
    if (!ruleset0 || typeof ruleset0.getResolvedInvestmentTypes !== 'function') continue;
    var investmentTypes0 = ruleset0.getResolvedInvestmentTypes() || [];
    for (var ti0 = 0; ti0 < investmentTypes0.length; ti0++) {
      var invType0 = investmentTypes0[ti0];
      if (!invType0 || !invType0.key || invType0.sellWhenReceived) continue;
      var baseType0 = String(invType0.key).split('_')[0];
      if (baseType0) priorityBaseTypes[baseType0] = true;
    }
  }
  var priorityTypeKeys = Object.keys(priorityBaseTypes);
  for (var pti = 0; pti < priorityTypeKeys.length; pti++) {
    var baseType = priorityTypeKeys[pti];
    var fallbackPriority = 4;
    if (baseType === 'cash') fallbackPriority = 1;
    if (baseType === 'pension') fallbackPriority = 2;
    parameters['Priority_' + baseType] = getPriorityValue(baseType, fallbackPriority);
  }

  // Dynamic investment parameters from StartCountry ruleset (generic fields only)
  for (var i = 0; i < investmentTypes.length; i++) {
    var type = investmentTypes[i];
    var key = type.key;
    parameters['InitialCapital_' + key] = ui.getValue('InitialCapital_' + key);
    // Wrapper-level growth/volatility inputs are only present for local investments (no baseRef)
    if (!type.baseRef) {
      parameters[key + 'GrowthRate'] = ui.getValue(key + 'GrowthRate');
      parameters[key + 'GrowthStdDev'] = ui.getValue(key + 'GrowthStdDev');
    }
  }

  // Global + local economy inputs (dynamic rows rendered in the growth rates panel).
  var getRawInputValue = function(id) {
    try {
      if (typeof document !== 'undefined') {
        var el = document.getElementById(id);
        if (el && el.value !== undefined) return String(el.value);
      }
    } catch (_) { }
    return null;
  };
  var isMissingRaw = function(raw) {
    return (raw === null || raw === undefined || String(raw).trim() === '');
  };

  var economyFeatureActive = false;
  if (scenarioCountries.length > 1) economyFeatureActive = true;
  if (ui.getValue('perCountryInvestmentsEnabled') === 'on' || ui.getValue('perCountryInvestmentsEnabled') === true) {
    economyFeatureActive = true;
  }

  var globalBaseTypes = config.getInvestmentBaseTypes();
  var globalEntries = [];
  var anyGlobalValuePresent = false;
  for (var gb = 0; gb < globalBaseTypes.length; gb++) {
    var gt = globalBaseTypes[gb] || {};
    var baseKey = gt.baseKey;
    if (!baseKey) continue;
    var gGrowthId = 'GlobalAssetGrowth_' + baseKey;
    var gVolId = 'GlobalAssetVolatility_' + baseKey;
    var gGrowthRaw = getRawInputValue(gGrowthId);
    var gVolRaw = getRawInputValue(gVolId);
    if (!isMissingRaw(gGrowthRaw) || !isMissingRaw(gVolRaw)) anyGlobalValuePresent = true;
    globalEntries.push({ baseKey: baseKey, gGrowthId: gGrowthId, gVolId: gVolId, gGrowthRaw: gGrowthRaw, gVolRaw: gVolRaw });
  }

  var globalEconomyInUse = economyFeatureActive || anyGlobalValuePresent;
  for (var gi = 0; gi < globalEntries.length; gi++) {
    var entry = globalEntries[gi];
    var shouldWriteGlobal = globalEconomyInUse || !isMissingRaw(entry.gGrowthRaw) || !isMissingRaw(entry.gVolRaw);
    if (!shouldWriteGlobal) continue;

    try { if (ui && typeof ui.ensureParameterInput === 'function') ui.ensureParameterInput(entry.gGrowthId, 'percentage'); } catch (_) { }
    try { if (ui && typeof ui.ensureParameterInput === 'function') ui.ensureParameterInput(entry.gVolId, 'percentage'); } catch (_) { }

    var gGrowthVal = ui.getValue(entry.gGrowthId);
    parameters[entry.gGrowthId] = gGrowthVal;

    var gVolVal = ui.getValue(entry.gVolId);
    parameters[entry.gVolId] = gVolVal;
  }

  for (var sci = 0; sci < scenarioCountries.length; sci++) {
    var cc2 = scenarioCountries[sci];
    var pensionGrowthId = 'PensionGrowth_' + cc2;
    var pensionVolId = 'PensionVolatility_' + cc2;
    var inflationId = 'Inflation_' + cc2;
    var hadPgInput = false;
    var hadPvInput = false;
    var hadInfInput = false;
    try {
      if (typeof document !== 'undefined') {
        hadPgInput = !!document.getElementById(pensionGrowthId);
        hadPvInput = !!document.getElementById(pensionVolId);
        hadInfInput = !!document.getElementById(inflationId);
      }
    } catch (_) { }
    try { if (ui && typeof ui.ensureParameterInput === 'function') ui.ensureParameterInput(pensionGrowthId, 'percentage'); } catch (_) { }
    try { if (ui && typeof ui.ensureParameterInput === 'function') ui.ensureParameterInput(pensionVolId, 'percentage'); } catch (_) { }
    try { if (ui && typeof ui.ensureParameterInput === 'function') ui.ensureParameterInput(inflationId, 'percentage'); } catch (_) { }

    var pgRaw = getRawInputValue(pensionGrowthId);
    var pgVal = ui.getValue(pensionGrowthId);
    var shouldWritePensionGrowth = economyFeatureActive || hadPgInput || !isMissingRaw(pgRaw);
    if (shouldWritePensionGrowth) {
      if (isMissingRaw(pgRaw)) pgVal = '';
      parameters[pensionGrowthId] = pgVal;
    }

    var pvRaw = getRawInputValue(pensionVolId);
    var pvVal = ui.getValue(pensionVolId);
    var shouldWritePensionVol = economyFeatureActive || hadPvInput || !isMissingRaw(pvRaw);
    if (shouldWritePensionVol) {
      if (isMissingRaw(pvRaw)) pvVal = '';
      parameters[pensionVolId] = pvVal;
    }

    var infRaw = getRawInputValue(inflationId);
    var infVal = ui.getValue(inflationId);
    var shouldWriteInflation = economyFeatureActive || hadInfInput || !isMissingRaw(infRaw);
    if (shouldWriteInflation) {
      if (isMissingRaw(infRaw)) infVal = '';
      parameters[inflationId] = infVal;
    }

    var rs = config.getCachedTaxRuleSet(cc2);
    var invTypes = (rs && typeof rs.getResolvedInvestmentTypes === 'function') ? (rs.getResolvedInvestmentTypes() || []) : [];
    for (var li = 0; li < invTypes.length; li++) {
      var t = invTypes[li] || {};
      var key = t.key;
      if (!key) continue;
      var scope = (t.residenceScope || '').toString().trim().toLowerCase();
      if (scope !== 'local') continue;
      // Skip inheriting wrappers (baseRef) - they use asset-level params
      if (t.baseRef) continue;
      var suffix = '_' + cc2;
      var baseKey2 = (String(key).toLowerCase().endsWith(suffix)) ? String(key).slice(0, String(key).length - suffix.length) : String(key);
      var localGrowthId = 'LocalAssetGrowth_' + cc2 + '_' + baseKey2;
      var localVolId = 'LocalAssetVolatility_' + cc2 + '_' + baseKey2;
      try { if (ui && typeof ui.ensureParameterInput === 'function') ui.ensureParameterInput(localGrowthId, 'percentage'); } catch (_) { }
      try { if (ui && typeof ui.ensureParameterInput === 'function') ui.ensureParameterInput(localVolId, 'percentage'); } catch (_) { }

      var lgRaw = getRawInputValue(localGrowthId);
      var lgVal = ui.getValue(localGrowthId);
      var shouldWriteLocalGrowth = economyFeatureActive || !isMissingRaw(lgRaw);
      if (shouldWriteLocalGrowth) {
        if (isMissingRaw(lgRaw) && economyFeatureActive) {
          var legacyGrowthId = key + 'GrowthRate';
          var legacyGrowthRaw = getRawInputValue(legacyGrowthId);
          if (!isMissingRaw(legacyGrowthRaw)) lgVal = ui.getValue(legacyGrowthId);
        }
        parameters[localGrowthId] = lgVal;
      }

      var lvRaw = getRawInputValue(localVolId);
      var lvVal = ui.getValue(localVolId);
      var shouldWriteLocalVol = economyFeatureActive || !isMissingRaw(lvRaw);
      if (shouldWriteLocalVol) {
        if (isMissingRaw(lvRaw) && economyFeatureActive) {
          var legacyVolId = key + 'GrowthStdDev';
          var legacyVolRaw = getRawInputValue(legacyVolId);
          if (!isMissingRaw(legacyVolRaw)) lvVal = ui.getValue(legacyVolId);
        }
        parameters[localVolId] = lvVal;
      }
    }
  }

  // Allocations + per-country state pension: serialize ONLY via generic keys.
  // - Allocations: InvestmentAllocation_{typeKey} where typeKey already encodes country (e.g. indexFunds_ie)
  // - State pension by country: StatePension_{countryCode} / P2StatePension_{countryCode}
  // Deserializer maps these into the chip-driven UI inputs.
  var isRelocationEnabled = config && typeof config.isRelocationEnabled === 'function' && config.isRelocationEnabled();
  // Always write StartCountry allocation keys (generic). If relocation UI is active the visible inputs
  // may be per-country, so prefer those when present.
  var sc = (startCountry || '').toString().trim().toLowerCase();
  for (var i = 0; i < investmentTypes.length; i++) {
    var type = investmentTypes[i];
    var key = type.key;
    var suffix = '_' + sc;
    var baseKey = (String(key).toLowerCase().endsWith(suffix)) ? String(key).slice(0, String(key).length - suffix.length) : String(key);
    var perId = 'InvestmentAllocation_' + sc + '_' + baseKey;
    var genericId = 'InvestmentAllocation_' + key;
    try {
      if (typeof document !== 'undefined' && document.getElementById(perId)) {
        var perRaw = getRawInputValue(perId);
        if (perRaw !== null && String(perRaw).trim() === '') {
          parameters[genericId] = '';
        } else {
          parameters[genericId] = ui.getValue(perId);
        }
      } else if (typeof document !== 'undefined' && document.getElementById(genericId)) {
        var genRaw = getRawInputValue(genericId);
        if (genRaw !== null && String(genRaw).trim() === '') {
          parameters[genericId] = '';
        } else {
          parameters[genericId] = ui.getValue(genericId);
        }
      }
    } catch (_) { }
  }

  // When relocation is enabled, also persist ANY country-dependent fields that exist in the DOM (including hidden stash),
  // regardless of current MV-* events, so values don't vanish when the user removes a relocation temporarily.
  if (isRelocationEnabled && typeof document !== 'undefined') {
    // Allocations: per-country ids -> generic ids
    try {
      var inputs = Array.prototype.slice.call(document.querySelectorAll('input[id^="InvestmentAllocation_"]'));
      for (var ii = 0; ii < inputs.length; ii++) {
        var el = inputs[ii];
        if (!el || !el.id) continue;
        var id = String(el.id);
        var m = id.match(/^InvestmentAllocation_([a-z]{2,})_(.+)$/i); // cc_baseKey
        if (!m) continue;
        var cc = String(m[1]).toLowerCase();
        var baseKey = String(m[2]);
        var typeKey = baseKey + '_' + cc;
        var rawAlloc = (el.value !== undefined) ? String(el.value) : '';
        if (rawAlloc.trim() === '') {
          parameters['InvestmentAllocation_' + typeKey] = '';
        } else {
          parameters['InvestmentAllocation_' + typeKey] = ui.getValue(id);
        }
      }
    } catch (_) { }

    // State pensions: per-country ids -> generic ids
    try {
      var sp = Array.prototype.slice.call(document.querySelectorAll('input[id^="StatePension_"]'));
      for (var si = 0; si < sp.length; si++) {
        var el = sp[si];
        if (!el || !el.id) continue;
        var m = String(el.id).match(/^StatePension_([a-z]{2,})$/i);
        if (!m) continue;
        var cc = String(m[1]).toLowerCase();
        parameters['StatePension_' + cc] = ui.getValue(el.id);
      }
    } catch (_) { }
    try {
      var sp2 = Array.prototype.slice.call(document.querySelectorAll('input[id^="P2StatePension_"]'));
      for (var si2 = 0; si2 < sp2.length; si2++) {
        var el = sp2[si2];
        if (!el || !el.id) continue;
        var m = String(el.id).match(/^P2StatePension_([a-z]{2,})$/i);
        if (!m) continue;
        var cc = String(m[1]).toLowerCase();
        parameters['P2StatePension_' + cc] = ui.getValue(el.id);
      }
    } catch (_) { }

    // Pension contributions: per-country ids -> generic ids
    try {
      var p1Inputs = Array.prototype.slice.call(document.querySelectorAll('input[id^="P1PensionContrib_"]'));
      for (var pc1 = 0; pc1 < p1Inputs.length; pc1++) {
        var el = p1Inputs[pc1];
        if (!el || !el.id) continue;
        var m = String(el.id).match(/^P1PensionContrib_([a-z]{2,})$/i);
        if (!m) continue;
        var cc = String(m[1]).toLowerCase();
        parameters['P1PensionContrib_' + cc] = ui.getValue(el.id);
      }
    } catch (_) { }
    try {
      var p2Inputs = Array.prototype.slice.call(document.querySelectorAll('input[id^="P2PensionContrib_"]'));
      for (var pc2 = 0; pc2 < p2Inputs.length; pc2++) {
        var el = p2Inputs[pc2];
        if (!el || !el.id) continue;
        var m = String(el.id).match(/^P2PensionContrib_([a-z]{2,})$/i);
        if (!m) continue;
        var cc = String(m[1]).toLowerCase();
        parameters['P2PensionContrib_' + cc] = ui.getValue(el.id);
      }
    } catch (_) { }
    try {
      var capInputs = Array.prototype.slice.call(document.querySelectorAll('input[id^="PensionCapped_"]'));
      for (var pci = 0; pci < capInputs.length; pci++) {
        var el = capInputs[pci];
        if (!el || !el.id) continue;
        var m = String(el.id).match(/^PensionCapped_([a-z]{2,})$/i);
        if (!m) continue;
        var cc = String(m[1]).toLowerCase();
        parameters['PensionCapped_' + cc] = ui.getValue(el.id);
      }
    } catch (_) { }

    // Keep legacy scalar pensions aligned with StartCountry per-country fields when present
    try {
      var spStart = 'StatePension_' + sc;
      var sp2Start = 'P2StatePension_' + sc;
      if (document.getElementById(spStart)) parameters.StatePensionWeekly = ui.getValue(spStart);
      if (document.getElementById(sp2Start)) parameters.P2StatePensionWeekly = ui.getValue(sp2Start);
    } catch (_) { }
  }

  // Tax credits: persist per-country ids whenever present (independent of relocation setting).
  if (typeof document !== 'undefined') {
    try {
      var credits = Array.prototype.slice.call(document.querySelectorAll('input[id^="TaxCredit_"]'));
      for (var ci = 0; ci < credits.length; ci++) {
        var el = credits[ci];
        if (!el || !el.id) continue;
        var m = String(el.id).match(/^TaxCredit_(.+)_([a-z]{2,})$/i);
        if (!m) continue;
        var creditId = String(m[1]);
        var cc = String(m[2]).toLowerCase();
        var val = ui.getValue(el.id);
        parameters['TaxCredit_' + creditId + '_' + cc] = val;
        // Keep legacy PersonalTaxCredit aligned for StartCountry.
        if (creditId === 'personal' && cc === sc) {
          parameters.PersonalTaxCredit = val;
        }
      }
    } catch (_) { }
  }

  if (typeof document !== 'undefined') {
    var globalAllocInputs = Array.prototype.slice.call(document.querySelectorAll('[id^="GlobalAllocation_"]'));
    for (var gai = 0; gai < globalAllocInputs.length; gai++) {
      var el = globalAllocInputs[gai];
      if (!el || !el.id) continue;
      var m = String(el.id).match(/^GlobalAllocation_(.+)$/);
      if (!m) continue;
      parameters[el.id] = ui.getValue(el.id);
    }

    var mixInputs = Array.prototype.slice.call(document.querySelectorAll('[id^="MixConfig_"]'));
    for (var mi = 0; mi < mixInputs.length; mi++) {
      var el = mixInputs[mi];
      if (!el || !el.id) continue;
      if (!/^MixConfig_([a-z]{2,})_(.+)_(type|asset1|asset2|startAge|targetAge|targetAgeOverridden|startAsset1Pct|startAsset2Pct|endAsset1Pct|endAsset2Pct)$/i.test(el.id)) continue;
      parameters[el.id] = ui.getValue(el.id);
    }

    var globalMixInputs = Array.prototype.slice.call(document.querySelectorAll('[id^="GlobalMixConfig_"]'));
    for (var gmi = 0; gmi < globalMixInputs.length; gmi++) {
      var el = globalMixInputs[gmi];
      if (!el || !el.id) continue;
      if (!/^GlobalMixConfig_(.+)_(type|asset1|asset2|startAge|targetAge|targetAgeOverridden|startAsset1Pct|startAsset2Pct|endAsset1Pct|endAsset2Pct)$/i.test(el.id)) continue;
      parameters[el.id] = ui.getValue(el.id);
    }
  }

  // Conditionally add StartCountry if relocation is enabled
  if (config.isRelocationEnabled()) {
    parameters.StartCountry = ui.getValue('StartCountry');
  }

  // Preserve empty input values as empty strings in CSV output.
  if (typeof document !== 'undefined') {
    for (const key in parameters) {
      if (!Object.prototype.hasOwnProperty.call(parameters, key)) continue;
      if (key.indexOf('InvestmentAllocation_') === 0) continue;
      if (key.indexOf('LocalAssetGrowth_') === 0) continue;
      if (key.indexOf('LocalAssetVolatility_') === 0) continue;
      const raw = getRawInputValue(key);
      if (raw !== null && String(raw).trim() === '') {
        parameters[key] = '';
      }
    }
  }

  // Format special values (percentages and booleans)
  for (const [key, value] of Object.entries(parameters)) {
    // Skip formatting if value is undefined or null
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (ui.isPercentage(key)) {
      parameters[key] = FormatUtils.formatPercentage(Math.round(value * 10000) / 10000);
    } else if (ui.isBoolean(key)) {
      parameters[key] = FormatUtils.formatBoolean(value);
    }
  }

  // Get events data, including hidden event types (like SI2 in single mode)
  // (already collected above for economy parameter defaults)

  // Collect Meta per-row from DOM when running in web UI (GAS-safe guard)
  var metaByRow = [];
  try {
    // Build a parallel list of event table rows in the same order as getTableData (skip resolution rows)
    var table = (typeof document !== 'undefined') ? document.getElementById('Events') : null;
    if (table) {
      var allRows = Array.prototype.slice.call(table.getElementsByTagName('tr'));
      for (var ri = 0; ri < allRows.length; ri++) {
        var rowEl = allRows[ri];
        try { if (rowEl.classList && rowEl.classList.contains('resolution-panel-row')) continue; } catch (_e) { }
        var cells = rowEl && rowEl.getElementsByTagName ? rowEl.getElementsByTagName('td') : [];
        if (!cells || cells.length === 0) continue; // skip header
        // When includeHiddenEventTypes is true, hidden rows are still included by getTableData
        // so we do not filter by display here.
        // Extract hidden inputs
        var metaPairs = [];
        try {
          var currencyInput = rowEl.querySelector ? rowEl.querySelector('.event-currency') : null;
          if (currencyInput && currencyInput.value) {
            metaPairs.push('currency=' + encodeURIComponent(currencyInput.value));
          }
        } catch (_e1) { }
        try {
          var linkedCountryInput = rowEl.querySelector ? rowEl.querySelector('.event-linked-country') : null;
          if (linkedCountryInput && linkedCountryInput.value) {
            metaPairs.push('linkedCountry=' + encodeURIComponent(linkedCountryInput.value));
          }
        } catch (_e2) { }
        try {
          var linkedEventIdInput = rowEl.querySelector ? rowEl.querySelector('.event-linked-event-id') : null;
          if (linkedEventIdInput && linkedEventIdInput.value) {
            metaPairs.push('linkedEventId=' + encodeURIComponent(linkedEventIdInput.value));
          }
        } catch (_e3) { }
        var resolvedMeta = null;
        try {
          var resolutionOverrideInput = rowEl.querySelector ? rowEl.querySelector('.event-resolution-override') : null;
          if (resolutionOverrideInput && resolutionOverrideInput.value) {
            resolvedMeta = '1';
            metaPairs.push('resolved=1');
          }
        } catch (_e4) { }
        try {
          if (resolvedMeta !== '1' && rowEl && rowEl.dataset && rowEl.dataset.relocationImpact === '1') {
            metaPairs.push('resolved=0');
          }
        } catch (_e5) { }
        metaByRow.push(metaPairs.join(';'));
      }
    }
  } catch (_err) {
    // Non-web environments (e.g., GAS) won't have a DOM; leave meta arrays empty
    metaByRow = [];
  }

  // Create CSV content (always save with FinSim header for forward compatibility)
  let csvContent = "# FinSim v" + ui.getVersion() + " Save File\n";
  csvContent += "# Parameters\n";
  for (const [key, value] of Object.entries(parameters)) {
    // Convert undefined values to empty strings to avoid "undefined" in CSV
    const csvValue = (value === undefined || value === null) ? '' : value;
    csvContent += `${key},${csvValue}\n`;
  }

  csvContent += "\n";

  var isRelocationEnabled = config && typeof config.isRelocationEnabled === 'function' && config.isRelocationEnabled();

  csvContent += "# Events\n";
  // Use conditional header based on relocation enabled state
  if (isRelocationEnabled) {
    csvContent += "Type,Name,Amount,FromAge,ToAge,Rate,Extra,Meta\n";
  } else {
    csvContent += "Type,Name,Amount,FromAge,ToAge,Rate,Extra\n";
  }

  var metaIndex = 0;
  events.forEach(event => {
    // Split the first field (which contains "type:name") into separate type and name
    const [type, ...nameParts] = event[0].split(':');
    const name = nameParts.join(':'); // Rejoin in case name contained colons

    // URL-encode commas in the name to prevent breaking CSV format
    const encodedName = name.replace(/,/g, "%2C");

    // Convert undefined values in event fields to empty strings
    const otherFields = event.slice(1).map(field =>
      (field === undefined || field === null) ? '' : field
    );
    // Append Meta value only if relocation is enabled
    if (isRelocationEnabled) {
      var metaVal = '';
      if (metaByRow && metaIndex < metaByRow.length) {
        metaVal = metaByRow[metaIndex] || '';
      }
      metaIndex++;
      csvContent += `${type},${encodedName},${otherFields.join(',')},${metaVal}\n`;
    } else {
      csvContent += `${type},${encodedName},${otherFields.join(',')}\n`;
    }
  });

  return csvContent;
}

function deserializeSimulation(content, ui) {
  const lines = content.split('\n').map(line => line.trim());

  // Verify file format and extract version (accept legacy and new headers)
  let fileVersion = null;
  const headerLine = lines[0] || '';
  const finSimMatch = headerLine.match(/FinSim\s+v(\d+\.\d+)/);
  const irelandMatch = headerLine.match(/Ireland\s+Financial\s+Simulator\s+v(\d+\.\d+)/);
  if (finSimMatch) {
    fileVersion = parseFloat(finSimMatch[1]);
  } else if (irelandMatch) {
    fileVersion = parseFloat(irelandMatch[1]);
  } else {
    // Not a recognized simulator file or very old format without 'vX.Y'
    throw new Error('Invalid or unrecognized scenario file format.');
  }
  if (fileVersion === null || isNaN(fileVersion)) {
    throw new Error('Could not determine scenario file version.');
  }

  const legacyAdapter = new LegacyScenarioAdapter();
  // Pre-scan for StartCountry to allow single-pass mapping with normalization
  var startCountryForNormalization = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('# Parameters')) {
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (l.startsWith('#')) break;
        if (l === '') continue;
        const commaIndex = l.indexOf(',');
        const key = (commaIndex >= 0) ? l.substring(0, commaIndex) : l;
        if (key === 'StartCountry') {
          startCountryForNormalization = (commaIndex >= 0) ? l.substring(commaIndex + 1).trim() : null;
          break;
        }
      }
      break;
    }
  }

  const isLegacyIeScenario = (irelandMatch || (fileVersion !== null && fileVersion < 2.0));

  if (!startCountryForNormalization) {
    try {
      startCountryForNormalization = Config.getInstance().getStartCountry();
    } catch (_) { }
  }

  let section = '';
  let p2StartingAgeExists = false;
  let simulationModeExists = false;
  let economyModeExists = false;
  let hasVolatilityInFile = false;
  // Legacy scalars that must be copied into per-country fields when relocation UI is enabled
  var legacyStatePensionWeekly = null;
  var legacyP2StatePensionWeekly = null;
  var legacyPensionContributionPercentage = null;
  var legacyPensionContributionPercentageP2 = null;
  var legacyPensionContributionCapped = null;
  var sawLegacyStatePensionWeekly = false;
  var sawLegacyP2StatePensionWeekly = false;
  var sawLegacyPensionContributionPercentage = false;
  var sawLegacyPensionContributionPercentageP2 = false;
  var sawLegacyPensionContributionCapped = false;
  var sawPerCountryPensionGrowth = {};
  var sawPerCountryPensionVolatility = {};
  var sawPerCountryInflation = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) {
      section = line;
      continue;
    }
    if (line === '') continue;

    if (section.includes('Parameters')) {
      // Split only on the first comma so values like "1,234" don't get truncated.
      const commaIndex = line.indexOf(',');
      const key = (commaIndex >= 0) ? line.substring(0, commaIndex) : line;
      let value = (commaIndex >= 0) ? line.substring(commaIndex + 1) : '';

      const actualKey = legacyAdapter.mapFieldName(key, startCountryForNormalization, isLegacyIeScenario);
      if (/^PensionGrowth_[a-z]{2,}$/i.test(actualKey)) {
        sawPerCountryPensionGrowth[String(actualKey.substring('PensionGrowth_'.length)).toLowerCase()] = true;
      }
      if (/^PensionVolatility_[a-z]{2,}$/i.test(actualKey)) {
        sawPerCountryPensionVolatility[String(actualKey.substring('PensionVolatility_'.length)).toLowerCase()] = true;
      }
      if (/^Inflation_[a-z]{2,}$/i.test(actualKey)) {
        sawPerCountryInflation[String(actualKey.substring('Inflation_'.length)).toLowerCase()] = true;
      }

      // Track legacy scalar values for later per-country migration.
      if (actualKey === 'StatePensionWeekly') { legacyStatePensionWeekly = value; sawLegacyStatePensionWeekly = true; }
      if (actualKey === 'P2StatePensionWeekly') { legacyP2StatePensionWeekly = value; sawLegacyP2StatePensionWeekly = true; }
      if (actualKey === 'PensionContributionPercentage') { legacyPensionContributionPercentage = value; sawLegacyPensionContributionPercentage = true; }
      if (actualKey === 'PensionContributionPercentageP2') { legacyPensionContributionPercentageP2 = value; sawLegacyPensionContributionPercentageP2 = true; }
      if (actualKey === 'PensionContributionCapped') { legacyPensionContributionCapped = value; sawLegacyPensionContributionCapped = true; }

      // Ensure dynamic fields exist before setting values (web UI only).
      // This keeps CSV load working even if chip-driven DOM sections aren't built yet.
      try {
        if (ui && typeof ui.ensureParameterInput === 'function') {
          // Generic allocations are saved as InvestmentAllocation_{typeKey} (e.g. InvestmentAllocation_indexFunds_ie).
          // Also allow chip-driven per-country ids to exist in files (future-proof).
          if (/^InvestmentAllocation_/.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'percentage');
          } else if (/^InitialCapital_.+_[a-z]{2,}$/i.test(actualKey)) {
            // Namespaced capital keys (e.g. InitialCapital_indexFunds_ie)
            ui.ensureParameterInput(actualKey, 'currency');
          } else if (/.+_[a-z]{2,}(GrowthRate|GrowthStdDev)$/i.test(actualKey)) {
            // Namespaced growth/vol keys (e.g. indexFunds_ieGrowthRate)
            ui.ensureParameterInput(actualKey, 'percentage');
          } else if (/^GlobalAllocation_.+/.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'percentage');
          } else if (/^GlobalAssetGrowth_.+/.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'percentage');
          } else if (/^GlobalAssetVolatility_.+/.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'percentage');
          } else if (/^LocalAssetGrowth_[a-z]{2,}_.+/i.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'percentage');
          } else if (/^LocalAssetVolatility_[a-z]{2,}_.+/i.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'percentage');
          } else if (/^PensionGrowth_[a-z]{2,}$/i.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'percentage');
          } else if (/^PensionVolatility_[a-z]{2,}$/i.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'percentage');
          } else if (/^Inflation_[a-z]{2,}$/i.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'percentage');
          } else if (/^MixConfig_([a-z]{2,})_(.+)_(type|asset1|asset2|startAge|targetAge|targetAgeOverridden|startAsset1Pct|startAsset2Pct|endAsset1Pct|endAsset2Pct)$/i.test(actualKey)) {
            var mixMatch = actualKey.match(/^MixConfig_([a-z]{2,})_(.+)_(type|asset1|asset2|startAge|targetAge|targetAgeOverridden|startAsset1Pct|startAsset2Pct|endAsset1Pct|endAsset2Pct)$/i);
            var mixField = mixMatch ? String(mixMatch[3]) : '';
            var mixType = 'string';
            if (mixField === 'startAge' || mixField === 'targetAge') mixType = 'number';
            if (mixField === 'targetAgeOverridden') mixType = 'boolean';
            if (mixField.indexOf('Pct') >= 0) mixType = 'percentage';
            ui.ensureParameterInput(actualKey, mixType);
          } else if (/^GlobalMixConfig_(.+)_(type|asset1|asset2|startAge|targetAge|targetAgeOverridden|startAsset1Pct|startAsset2Pct|endAsset1Pct|endAsset2Pct)$/i.test(actualKey)) {
            var gMixMatch = actualKey.match(/^GlobalMixConfig_(.+)_(type|asset1|asset2|startAge|targetAge|targetAgeOverridden|startAsset1Pct|startAsset2Pct|endAsset1Pct|endAsset2Pct)$/i);
            var gMixField = gMixMatch ? String(gMixMatch[2]) : '';
            var gMixType = 'string';
            if (gMixField === 'startAge' || gMixField === 'targetAge') gMixType = 'number';
            if (gMixField === 'targetAgeOverridden') gMixType = 'boolean';
            if (gMixField.indexOf('Pct') >= 0) gMixType = 'percentage';
            ui.ensureParameterInput(actualKey, gMixType);
          } else if (/^StatePension_[a-z]{2,}$/.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'currency');
          } else if (/^P2StatePension_[a-z]{2,}$/.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'currency');
          } else if (/^TaxCredit_.+_[a-z]{2,}$/i.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'currency');
          } else if (/^P1PensionContrib_[a-z]{2,}$/i.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'percentage');
          } else if (/^P2PensionContrib_[a-z]{2,}$/i.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'percentage');
          } else if (/^PensionCapped_[a-z]{2,}$/i.test(actualKey)) {
            ui.ensureParameterInput(actualKey, 'string');
          }
        }
      } catch (_) { }

      // Track StartCountry for investment key normalization
      if (actualKey === 'StartCountry' && value && value.trim() !== '') {
        startCountryForNormalization = value.trim();
      }

      try {
        ui.setValue(actualKey, value);
        try {
          if (typeof document !== 'undefined') {
            if (/^PensionGrowth_[a-z]{2,}$/i.test(actualKey) ||
                /^PensionVolatility_[a-z]{2,}$/i.test(actualKey) ||
                /^Inflation_[a-z]{2,}$/i.test(actualKey)) {
              var loadedEl = document.getElementById(actualKey);
              if (loadedEl) loadedEl.setAttribute('data-csv-loaded', '1');
            }
          }
        } catch (_) { }
        if (actualKey === 'P2StartingAge' && value && value.trim() !== '') {
          p2StartingAgeExists = true;
        }
        if (actualKey === 'simulation_mode') {
          simulationModeExists = true;
        }
        if (actualKey === 'economy_mode') {
          economyModeExists = true;
        }
        // Track if file has volatility values (pension or any investment type)
        if ((actualKey === 'PensionGrowthStdDev' || actualKey.endsWith('GrowthStdDev'))
          && value && parseFloat(value) > 0) {
          hasVolatilityInFile = true;
        }
      } catch (e) {
        // Skip if parameter doesn't exist
      }
    }
  }

  var investmentStrategiesValue = ui.getValue('investmentStrategiesEnabled');
  if (investmentStrategiesValue === undefined || investmentStrategiesValue === null || investmentStrategiesValue === '') {
    ui.setValue('investmentStrategiesEnabled', 'off');
  }

  var perCountryInvestmentsValue = ui.getValue('perCountryInvestmentsEnabled');
  if (perCountryInvestmentsValue === undefined || perCountryInvestmentsValue === null || perCountryInvestmentsValue === '') {
    ui.setValue('perCountryInvestmentsEnabled', 'off');
  }

  // Map generic per-country keys into chip-driven UI fields (web UI only).
  // - InvestmentAllocation_{typeKey} -> InvestmentAllocation_{country}_{baseKey}
  // - StatePension_{country} -> StatePension_{country}
  // - P2StatePension_{country} -> P2StatePension_{country}
  try {
    if (ui && typeof ui.ensureParameterInput === 'function') {
      const cfg = Config.getInstance();
      const list = (cfg.getAvailableCountries && cfg.getAvailableCountries()) ? cfg.getAvailableCountries() : [];
      const countrySet = {};
      for (let i = 0; i < list.length; i++) {
        const code = list[i] && list[i].code ? String(list[i].code).trim().toLowerCase() : '';
        if (code) countrySet[code] = true;
      }

      // 1) Map saved generic per-country pension keys into chip-driven inputs.
      try {
        const spKeys = (typeof document !== 'undefined')
          ? Array.prototype.slice.call(document.querySelectorAll('input[id^="StatePension_"]'))
          : [];
        for (let i = 0; i < spKeys.length; i++) {
          const id = spKeys[i] && spKeys[i].id ? String(spKeys[i].id) : '';
          const m = id.match(/^StatePension_([a-z]{2,})$/i);
          if (!m) continue;
          const cc = String(m[1]).toLowerCase();
          if (!countrySet[cc]) continue;
          ui.ensureParameterInput('StatePension_' + cc, 'currency');
          try { ui.setValue('StatePension_' + cc, ui.getValue(id)); } catch (_) { }
        }
      } catch (_) { }
      try {
        const sp2Keys = (typeof document !== 'undefined')
          ? Array.prototype.slice.call(document.querySelectorAll('input[id^="P2StatePension_"]'))
          : [];
        for (let i = 0; i < sp2Keys.length; i++) {
          const id = sp2Keys[i] && sp2Keys[i].id ? String(sp2Keys[i].id) : '';
          const m = id.match(/^P2StatePension_([a-z]{2,})$/i);
          if (!m) continue;
          const cc = String(m[1]).toLowerCase();
          if (!countrySet[cc]) continue;
          ui.ensureParameterInput('P2StatePension_' + cc, 'currency');
          try { ui.setValue('P2StatePension_' + cc, ui.getValue(id)); } catch (_) { }
        }
      } catch (_) { }

      // 2) Map saved generic allocation keys into chip-driven per-country allocation inputs.
      try {
        const allocKeys = (typeof document !== 'undefined')
          ? Array.prototype.slice.call(document.querySelectorAll('input[id^="InvestmentAllocation_"]'))
          : [];
        for (let i = 0; i < allocKeys.length; i++) {
          const id = allocKeys[i] && allocKeys[i].id ? String(allocKeys[i].id) : '';
          // Generic key form: InvestmentAllocation_{baseKey}_{cc}
          const m = id.match(/^InvestmentAllocation_(.+)_([a-z]{2,})$/i);
          if (!m) continue;
          const baseKey = String(m[1]);
          const cc = String(m[2]).toLowerCase();
          if (!countrySet[cc]) continue;
          const perId = 'InvestmentAllocation_' + cc + '_' + baseKey;
          ui.ensureParameterInput(perId, 'percentage');
          try {
            var rawAlloc = null;
            try {
              if (typeof document !== 'undefined') {
                var elAlloc = document.getElementById(id);
                if (elAlloc && elAlloc.value !== undefined) rawAlloc = String(elAlloc.value);
              }
            } catch (_) { rawAlloc = null; }
            if (rawAlloc !== null && rawAlloc.trim() === '') {
              ui.setValue(perId, '');
            } else {
              ui.setValue(perId, ui.getValue(id));
            }
          } catch (_) { }
        }
      } catch (_) { }

      // 3) Legacy personal tax credit -> per-country tax credit input
      let legacyCredit = null;
      let legacyCreditRaw = null;
      try {
        if (typeof document !== 'undefined') {
          const el = document.getElementById('PersonalTaxCredit');
          if (el && el.value !== undefined) legacyCreditRaw = String(el.value);
        }
      } catch (_) { }
      if (legacyCreditRaw !== null) {
        if (String(legacyCreditRaw).trim() !== '') legacyCredit = legacyCreditRaw;
      } else if (ui && typeof ui.getValue === 'function') {
        legacyCredit = ui.getValue('PersonalTaxCredit');
      }
      if (legacyCredit !== undefined && legacyCredit !== null && legacyCredit !== '') {
        const startRaw = (ui && typeof ui.getValue === 'function') ? ui.getValue('StartCountry') : null;
        const startCountry = String(startRaw || cfg.getStartCountry() || '').trim().toLowerCase();
        if (startCountry) {
          const creditId = 'TaxCredit_personal_' + startCountry;
          ui.ensureParameterInput(creditId, 'currency');
          ui.setValue(creditId, legacyCredit);
        }
      }
    }
  } catch (_) { }

  // Set simulation_mode based on P2StartingAge for older files if simulation_mode is not present
  if (!simulationModeExists) {
    if (p2StartingAgeExists) {
      ui.setValue('simulation_mode', 'couple');
    } else {
      ui.setValue('simulation_mode', 'single');
    }
  }

  // Set economy_mode based on volatility values for older files if economy_mode is not present
  if (!economyModeExists) {
    if (hasVolatilityInFile) {
      ui.setValue('economy_mode', 'montecarlo');
    } else {
      ui.setValue('economy_mode', 'deterministic');
    }
  }

  // Clear Person 2 fields if they weren't present in the loaded scenario
  // This prevents old single-person scenarios from retaining Person 2 data from previously loaded joint scenarios
  if (!p2StartingAgeExists) {
    try {
      ui.setValue('P2StartingAge', '');
      ui.setValue('P2RetirementAge', '');
      ui.setValue('P2StatePensionWeekly', '');
      ui.setValue('InitialPensionP2', '');
      ui.setValue('PensionContributionPercentageP2', '');
    } catch (e) {
      // Skip if parameters don't exist in the UI
    }
  }

  // Legacy fallback: map global pension contribution fields to StartCountry-prefixed fields
  try {
    var fallbackStartCountry = startCountryForNormalization || Config.getInstance().getStartCountry();
    if (fallbackStartCountry) {
      var ccLower = String(fallbackStartCountry).toLowerCase();
      var p1Key = 'P1PensionContrib_' + ccLower;
      var p2Key = 'P2PensionContrib_' + ccLower;
      var capKey = 'PensionCapped_' + ccLower;
      // Ensure per-country fields exist so the migration can run during load,
      // even before the chip-driven allocation UI has built those inputs.
      try {
        if (ui && typeof ui.ensureParameterInput === 'function') {
          ui.ensureParameterInput(p1Key, 'percentage');
          ui.ensureParameterInput(p2Key, 'percentage');
          ui.ensureParameterInput(capKey, 'string');
        }
      } catch (_) { }

      // IMPORTANT: Use raw DOM .value checks here (DOMUtils.getValue returns 0 for empty numeric inputs),
      // otherwise empty fields look "present" and we skip the migration.
      var existingP1Raw = '';
      var existingP2Raw = '';
      var existingCapRaw = '';
      try {
        if (typeof document !== 'undefined') {
          var el1 = document.getElementById(p1Key);
          var el2 = document.getElementById(p2Key);
          var el3 = document.getElementById(capKey);
          existingP1Raw = (el1 && el1.value !== undefined) ? String(el1.value) : '';
          existingP2Raw = (el2 && el2.value !== undefined) ? String(el2.value) : '';
          existingCapRaw = (el3 && el3.value !== undefined) ? String(el3.value) : '';
        }
      } catch (_) { }
      var hasExisting = (existingP1Raw && existingP1Raw.trim() !== '') ||
        (existingP2Raw && existingP2Raw.trim() !== '') ||
        (existingCapRaw && existingCapRaw.trim() !== '');
      if (!hasExisting) {
        var legacyP1 = ui.getValue('PensionContributionPercentage');
        var legacyP2 = ui.getValue('PensionContributionPercentageP2');
        var legacyCap = ui.getValue('PensionContributionCapped');
        // Normalize legacy string values to the exact dropdown option values (Yes/No/Match).
        try {
          var lc = (legacyCap !== undefined && legacyCap !== null) ? String(legacyCap).trim().toLowerCase() : '';
          if (lc === 'yes') legacyCap = 'Yes';
          if (lc === 'no') legacyCap = 'No';
          if (lc === 'match') legacyCap = 'Match';
        } catch (_) { }
        if (legacyP1 !== undefined && legacyP1 !== null && legacyP1 !== '') ui.setValue(p1Key, legacyP1);
        if (legacyP2 !== undefined && legacyP2 !== null && legacyP2 !== '') ui.setValue(p2Key, legacyP2);
        if (legacyCap !== undefined && legacyCap !== null && legacyCap !== '') ui.setValue(capKey, legacyCap);
      }

      // If the legacy scalar keys were present in the file, they should win over any pre-filled defaults
      // (e.g. €0 or Yes) that may exist before deserialization finishes.
      try {
        if (sawLegacyPensionContributionPercentage && legacyPensionContributionPercentage !== null && legacyPensionContributionPercentage !== undefined) {
          ui.setValue(p1Key, legacyPensionContributionPercentage);
        }
      } catch (_) { }
      try {
        if (sawLegacyPensionContributionPercentageP2 && legacyPensionContributionPercentageP2 !== null && legacyPensionContributionPercentageP2 !== undefined) {
          ui.setValue(p2Key, legacyPensionContributionPercentageP2);
        }
      } catch (_) { }
      try {
        if (sawLegacyPensionContributionCapped && legacyPensionContributionCapped !== null && legacyPensionContributionCapped !== undefined) {
          var lc2 = String(legacyPensionContributionCapped).trim().toLowerCase();
          var normalized = legacyPensionContributionCapped;
          if (lc2 === 'yes') normalized = 'Yes';
          if (lc2 === 'no') normalized = 'No';
          if (lc2 === 'match') normalized = 'Match';
          ui.setValue(capKey, normalized);
          // Also sync the visible toggle text if it already exists (dropdown may have initialized earlier).
          try {
            if (typeof document !== 'undefined') {
              var t = document.getElementById('PensionCappedToggle_' + ccLower);
              if (t) t.textContent = normalized;
            }
          } catch (_) { }
        }
      } catch (_) { }
    }
  } catch (_) { }

  // Legacy fallback: map scalar state pension fields to StartCountry per-country IDs (period-agnostic).
  // Without this, relocation UI hides the legacy inputs and the visible per-country fields stay empty (0).
  try {
    if (ui && typeof ui.ensureParameterInput === 'function') {
      var sc = (startCountryForNormalization || Config.getInstance().getStartCountry() || '').toString().trim().toLowerCase();
      if (sc) {
        var spKey = 'StatePension_' + sc;
        var sp2Key = 'P2StatePension_' + sc;
        ui.ensureParameterInput(spKey, 'currency');
        ui.ensureParameterInput(sp2Key, 'currency');

        // If the legacy scalar keys were present in the file, they should win over any pre-filled defaults.
        if (sawLegacyStatePensionWeekly && legacyStatePensionWeekly !== null && legacyStatePensionWeekly !== undefined) {
          ui.setValue(spKey, legacyStatePensionWeekly);
        }
        if (sawLegacyP2StatePensionWeekly && legacyP2StatePensionWeekly !== null && legacyP2StatePensionWeekly !== undefined) {
          ui.setValue(sp2Key, legacyP2StatePensionWeekly);
        }
      }
    }
  } catch (_) { }

  // Migrate legacy flat allocations to per-country structure
  if (typeof params !== 'undefined' && !params.investmentAllocationsByCountry && params.investmentAllocationsByKey) {
    var startCountry = (params.StartCountry || Config.getInstance().getStartCountry() || 'ie').toLowerCase();
    params.investmentAllocationsByCountry = {};
    params.investmentAllocationsByCountry[startCountry] = params.investmentAllocationsByKey;
    // Keep legacy field for backward compat with old code paths
  }

  // Load events
  let eventData = [];
  let inEvents = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('# Events')) {
      inEvents = true;
      continue;
    }
    if (inEvents && line && !line.startsWith('Type,')) {
      const parts = line.split(',');
      if (parts.length > 1) {
        parts[1] = parts[1].replace(/%2C/g, ",");
      }
      eventData.push(parts);
    }
  }

  // Default new economy fields from legacy values when missing (globals/locals/pension/inflation).
  try {
    var cfg2 = Config.getInstance();
    var rawStart = startCountryForNormalization;
    if (!rawStart && ui && typeof ui.getValue === 'function') {
      rawStart = ui.getValue('StartCountry');
    }
    if (!rawStart) rawStart = cfg2.getStartCountry();
    var sc2 = (rawStart || '').toString().trim().toLowerCase();
    var scenarioCountries = [];
    var scenarioSet = {};
    if (sc2) {
      scenarioSet[sc2] = true;
      scenarioCountries.push(sc2);
    }
    for (var ei2 = 0; ei2 < eventData.length; ei2++) {
      var row = eventData[ei2];
      var t = row && row[0] ? String(row[0]) : '';
      if (t && /^MV-[A-Z]{2,}$/.test(t)) {
        var cc2 = t.substring(3).toLowerCase();
        if (!scenarioSet[cc2]) {
          scenarioSet[cc2] = true;
          scenarioCountries.push(cc2);
        }
      }
    }

    var getRawInputValue = function(id) {
      try {
        if (typeof document !== 'undefined') {
          var el = document.getElementById(id);
          if (el && el.value !== undefined) return String(el.value);
        }
      } catch (_) { }
      return null;
    };
    var isMissingRaw = function(raw) {
      return (raw === null || raw === undefined || String(raw).trim() === '');
    };

    var legacyPensionGrowth = ui.getValue('PensionGrowthRate');
    var legacyPensionVol = ui.getValue('PensionGrowthStdDev');
    var legacyInflation = ui.getValue('Inflation');

    for (var sci = 0; sci < scenarioCountries.length; sci++) {
      var cc = scenarioCountries[sci];
      var isStartCountry = (cc === sc2);
      var pensionGrowthId = 'PensionGrowth_' + cc;
      var pensionVolId = 'PensionVolatility_' + cc;
      var inflationId = 'Inflation_' + cc;
      try { if (ui && typeof ui.ensureParameterInput === 'function') ui.ensureParameterInput(pensionGrowthId, 'percentage'); } catch (_) { }
      try { if (ui && typeof ui.ensureParameterInput === 'function') ui.ensureParameterInput(pensionVolId, 'percentage'); } catch (_) { }
      try { if (ui && typeof ui.ensureParameterInput === 'function') ui.ensureParameterInput(inflationId, 'percentage'); } catch (_) { }

      if (isStartCountry && !sawPerCountryPensionGrowth[cc] && isMissingRaw(getRawInputValue(pensionGrowthId))) {
        ui.setValue(pensionGrowthId, legacyPensionGrowth);
      }
      if (isStartCountry && !sawPerCountryPensionVolatility[cc] && isMissingRaw(getRawInputValue(pensionVolId))) {
        ui.setValue(pensionVolId, legacyPensionVol);
      }
      if (isStartCountry && !sawPerCountryInflation[cc] && isMissingRaw(getRawInputValue(inflationId))) {
        ui.setValue(inflationId, legacyInflation);
      }

      var rs = cfg2.getCachedTaxRuleSet(cc);
      var invTypes = (rs && typeof rs.getResolvedInvestmentTypes === 'function') ? (rs.getResolvedInvestmentTypes() || []) : [];
      for (var li = 0; li < invTypes.length; li++) {
        var it = invTypes[li] || {};
        var key = it.key;
        if (!key) continue;
        var scope = (it.residenceScope || '').toString().trim().toLowerCase();
        if (scope !== 'local') continue;
        // Skip inheriting wrappers (baseRef) - they use asset-level params
        if (it.baseRef) continue;
        var suffix = '_' + cc;
        var baseKey2 = (String(key).toLowerCase().endsWith(suffix)) ? String(key).slice(0, String(key).length - suffix.length) : String(key);
        var localGrowthId = 'LocalAssetGrowth_' + cc + '_' + baseKey2;
        var localVolId = 'LocalAssetVolatility_' + cc + '_' + baseKey2;
        try { if (ui && typeof ui.ensureParameterInput === 'function') ui.ensureParameterInput(localGrowthId, 'percentage'); } catch (_) { }
        try { if (ui && typeof ui.ensureParameterInput === 'function') ui.ensureParameterInput(localVolId, 'percentage'); } catch (_) { }

        if (isMissingRaw(getRawInputValue(localGrowthId))) {
          var legacyGrowthId = key + 'GrowthRate';
          if (!isMissingRaw(getRawInputValue(legacyGrowthId))) ui.setValue(localGrowthId, ui.getValue(legacyGrowthId));
        }
        if (isMissingRaw(getRawInputValue(localVolId))) {
          var legacyVolId = key + 'GrowthStdDev';
          if (!isMissingRaw(getRawInputValue(legacyVolId))) ui.setValue(localVolId, ui.getValue(legacyVolId));
        }
      }
    }
  } catch (_) { }

  return eventData;
}

function getRateForKey(key, rateBands) {
  if (!rateBands || typeof rateBands !== 'object' || Object.keys(rateBands).length === 0) {
    // Return 0 when no bands are defined (no contribution allowed)
    return 0;
  }
  const bandKeys = Object.keys(rateBands).map(Number);
  for (let i = bandKeys.length - 1; i >= 0; i--) {
    const bandKey = bandKeys[i];
    if (key >= bandKey) {
      return rateBands[bandKey];
    }
  }
  var defaultRate = rateBands[bandKeys[0]];
  // Ensure we return a valid number, default to 1.0 if undefined
  return (typeof defaultRate === 'number' && !isNaN(defaultRate)) ? defaultRate : 1.0;
}

// ============================================================
// Relocation Lookup Functions
// ============================================================

/**
 * Get country for a given age by scanning MV-* events.
 * @param {number} age - The age to look up
 * @param {Array} events - Full events array
 * @param {string} startCountry - Starting country code
 * @returns {string} Country code (lowercase)
 */
function getCountryForAge(age, events, startCountry) {
  var country = (startCountry || 'ie').toLowerCase();
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    if (e && e.type && e.type.indexOf('MV-') === 0 && age >= e.fromAge) {
      country = e.type.substring(3).toLowerCase();
    }
  }
  return country;
}

/**
 * Get unique countries from MV-* events.
 * @param {Array} events - Full events array
 * @param {string} startCountry - Starting country code
 * @returns {Set} Set of country codes (lowercase)
 */
function getUniqueCountries(events, startCountry) {
  var country = (startCountry || 'ie').toLowerCase();
  var countries = new Set();
  countries.add(country);
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    if (e && e.type && e.type.indexOf('MV-') === 0) {
      countries.add(e.type.substring(3).toLowerCase());
    }
  }
  return countries;
}
