/* PresentValueCalculator.js
 * 
 * Computes present-value (PV) aggregates for a simulation data row.
 * Must remain GAS-compatible (no ES6 modules).
 * 
 * PV Semantics (flows):
 * - Residency-deflated: incomeRSUsPV, incomeFundsRentPV, incomeSharesRentPV,
 *   incomeCashPV, incomeDefinedBenefitPV, incomeTaxFreePV, netIncomePV, expensesPV,
 *   investmentIncomeByKeyPV[*], Tax__*PV
 * - Source-deflated: incomeSalariesPV, incomeRentalsPV, incomePrivatePensionPV,
 *   pensionContributionPV, incomeStatePensionPV
 * PV Semantics (stocks/assets):
 * - Source-deflated: realEstateCapitalPV, pensionFundPV, investmentCapitalByKeyPV[*],
 *   indexFundsCapitalPV, sharesCapitalPV
 * - Residency-deflated: cashPV; worthPV is mixed (source-deflated assets + residency cash)
 * 
 * This file has to work on both the website and Google Sheets.
 */

/**
 * Compute present-value (PV) aggregates for a simulation data row.
 * 
 * Numeric boundary contract: All asset values in ctx are numeric (pre-extracted .amount from Money objects).
 * PV deflation operates on numbers; Money objects remain in asset classes for currency safety.
 * 
 *   @param {Object} ctx - Context object containing:
 *   @param {Object} ctx.dataRow - Data row to populate with PV values
 *   @param {number} ctx.ageNum - Current age
 *   @param {number} ctx.startYear - Simulation start year
 *   @param {Object} ctx.person1 - Person 1 object
 *   @param {Object} ctx.person2 - Person 2 object (nullable)
 *   @param {Object} ctx.params - Simulation parameters
 *   @param {Object} ctx.cfg - Config instance
 *   @param {Object} ctx.countryInflationOverrides - Country inflation overrides
 *   @param {number} ctx.year - Current simulation year
 *   @param {string} ctx.currentCountry - Current country code
 *   @param {string} ctx.residenceCurrency - Current residence currency
 *   @param {Object} ctx.realEstate - RealEstate object
 *   @param {Object} ctx.indexFunds - IndexFunds asset
 *   @param {Object} ctx.shares - Shares asset
 *   @param {Array} ctx.investmentAssets - Array of investment assets
 *   @param {number} ctx.realEstateConverted - Pre-extracted .amount from converted real estate
 *   @param {Object} ctx.capsByKey - Map of investment capitals (pre-extracted .amount values)
 *   @param {number} ctx.incomeSalaries - Pre-extracted .amount from salary Money objects
 *   @param {number} ctx.incomeShares - Pre-extracted .amount from RSU Money objects
 *   ... (all other numeric income/expense fields are pre-extracted .amount values)
 */
function computePresentValueAggregates(ctx) {
  // Numeric boundary contract: All asset values in ctx are numeric.
  // PV deflation operates on numbers; Money objects remain in asset classes.
  // Extract all variables from ctx
  // Note: dataRow is fetched from dataSheet[row] rather than ctx.dataRow because
  // the row is created by computeNominalAggregates() which runs before this function.
  var dataRow = ctx.dataSheet[ctx.row];
  var ageNum = ctx.ageNum;
  var startYear = ctx.startYear;
  var person1 = ctx.person1;
  var person2 = ctx.person2;
  var params = ctx.params;
  var cfg = ctx.cfg;
  var countryInflationOverrides = ctx.countryInflationOverrides;
  var year = ctx.year;
  var currentCountry = ctx.currentCountry;
  var residenceCurrency = ctx.residenceCurrency;
  var realEstate = ctx.realEstate;
  var indexFunds = ctx.indexFunds;
  var shares = ctx.shares;
  var investmentAssets = ctx.investmentAssets;
  var realEstateConverted = ctx.realEstateConverted;
  var capsByKey = ctx.capsByKey;
  // Derive legacy caps from capsByKey (the canonical source)
  var indexFundsCap = capsByKey['indexFunds'];
  var sharesCap = capsByKey['shares'];
  var incomeSalaries = ctx.incomeSalaries;
  var incomeShares = ctx.incomeShares;
  var incomeRentals = ctx.incomeRentals;
  var incomePrivatePension = ctx.incomePrivatePension;
  var incomeStatePension = ctx.incomeStatePension;
  var incomeStatePensionBaseCurrency = ctx.incomeStatePensionBaseCurrency;
  var incomeFundsRent = ctx.incomeFundsRent;
  var incomeSharesRent = ctx.incomeSharesRent;
  var cashWithdraw = ctx.cashWithdraw;
  var incomeDefinedBenefit = ctx.incomeDefinedBenefit;
  var incomeTaxFree = ctx.incomeTaxFree;
  var netIncome = ctx.netIncome;
  var expenses = ctx.expenses;
  var cash = ctx.cash;
  var personalPensionContribution = ctx.personalPensionContribution;
  var personalPensionContributionByCountry = ctx.personalPensionContributionByCountry;
  var incomePrivatePensionByCountry = ctx.incomePrivatePensionByCountry;
  var incomeSalariesByCountry = ctx.incomeSalariesByCountry;
  var incomeRentalsByCountry = ctx.incomeRentalsByCountry;
  var investmentIncomeByKey = ctx.investmentIncomeByKey;
  var getDeflationFactor = ctx.getDeflationFactor;
  var getDeflationFactorForCountry = ctx.getDeflationFactorForCountry;
  var normalizeCurrency = ctx.normalizeCurrency;
  var normalizeCountry = ctx.normalizeCountry;
  var convertCurrencyAmount = ctx.convertCurrencyAmount;
  var getCurrencyForCountry = ctx.getCurrencyForCountry;

  // Build lookup map: key → { assetCountry, residenceScope, ... }
  // Per asset-plan.md §9: assume assets is a valid array, no defensive guards
  function buildInvestmentTypeLookup(assets) {
    var lookup = {};
    for (var i = 0; i < assets.length; i++) {
      var entry = assets[i];
      lookup[entry.key] = entry;
    }
    return lookup;
  }
  var investmentTypeLookup = buildInvestmentTypeLookup(investmentAssets);

  if (!params.StartCountry) throw new Error('PresentValueCalculator: params.StartCountry is required');
  var pvCountry = currentCountry || params.StartCountry.toLowerCase();
  var currentYearPv = year || (startYear + (ageNum - params.startingAge));
  var inflationRate = InflationService.resolveInflationRate(pvCountry, currentYearPv, {
    params: params,
    config: cfg,
    countryInflationOverrides: countryInflationOverrides
  });
  var deflationFactor = getDeflationFactor(ageNum, startYear, inflationRate);

  var realEstateCapitalPV = 0;
  var realEstateCollection = realEstate.properties;
  if (realEstateCollection) {
    var propertyKeys = Object.keys(realEstateCollection);
    if (propertyKeys.length > 0) {
      var normalizedResidenceCurrency = normalizeCurrency(residenceCurrency);
      for (var rk = 0; rk < propertyKeys.length; rk++) {
        var propKey = propertyKeys[rk];
        if (!Object.prototype.hasOwnProperty.call(realEstateCollection, propKey)) continue;
        var prop = realEstateCollection[propKey];
        var propertyNominalValue = prop.getValue();
        var assetCountryForPV = prop.getLinkedCountry() || params.StartCountry;
        assetCountryForPV = normalizeCountry(assetCountryForPV);
        var propertyDeflationFactor = getDeflationFactorForCountry(assetCountryForPV, ageNum, startYear, {
          params: params,
          config: cfg,
          countryInflationOverrides: countryInflationOverrides,
          year: year
        });
        var propertyPVInAssetCurrency = propertyNominalValue * propertyDeflationFactor;
        var propertyCurrencyNormalized = normalizeCurrency(prop.getCurrency());
        var propertyCountryForConversion = normalizeCountry(assetCountryForPV || currentCountry || params.StartCountry);
        var conversionYear = startYear || year;
        var propertyPVInResidenceCurrency;
        if (!propertyCurrencyNormalized || propertyCurrencyNormalized === normalizedResidenceCurrency) {
          propertyPVInResidenceCurrency = propertyPVInAssetCurrency;
        } else {
          var convertedPV = convertCurrencyAmount(propertyPVInAssetCurrency, propertyCurrencyNormalized, propertyCountryForConversion, normalizedResidenceCurrency, currentCountry, conversionYear, true);
          if (convertedPV === null) {
            throw new Error('Real estate PV conversion failed: cannot convert ' + propertyPVInAssetCurrency + ' from ' + propertyCurrencyNormalized + ' to ' + normalizedResidenceCurrency + ' for property ' + propKey);
          }
          propertyPVInResidenceCurrency = convertedPV;
        }
        realEstateCapitalPV += propertyPVInResidenceCurrency;
      }
    }
  }

  // Pension PV: Iterate over all pension pots and use each pot's country for deflation
  // This ensures contributions to each country are deflated by that country's inflation
  var pensionFundNominal = 0;
  var pensionFundPVTotal = 0;

  // NOTE: pot.capital() returns residence currency (post-refactor).
  // Must convert back to pot's currency before applying pot-country deflator.
  function sumPensionPots(person) {
    if (!person || !person.pensions) return;
    for (var potCountry in person.pensions) {
      if (!Object.prototype.hasOwnProperty.call(person.pensions, potCountry)) continue;
      var pot = person.pensions[potCountry];
      var potCapital_res = pot.capital(); // residence currency
      pensionFundNominal += potCapital_res;
      // Skip zero-value pots entirely (0 * any_deflator = 0)
      if (potCapital_res === 0) continue;
      // Use the pot's country for deflation, not StartCountry
      var potDeflator = getDeflationFactorForCountry(potCountry, ageNum, startYear, {
        params: params,
        config: cfg,
        countryInflationOverrides: countryInflationOverrides,
        year: year
      });
      // Back-convert from residence currency to pot's currency for PV calculation
      var potCountry_norm = normalizeCountry(potCountry);
      var potCur = getCurrencyForCountry(potCountry_norm);
      var potCapital_asset;
      // Skip conversion if pot currency matches residence currency (no FX needed)
      if (potCur && potCur === residenceCurrency) {
        potCapital_asset = potCapital_res;
      } else if (potCur) {
        potCapital_asset = convertCurrencyAmount(potCapital_res, residenceCurrency, currentCountry, potCur, potCountry_norm, year, true);
        if (potCapital_asset === null) throw new Error('Pension PV back-conversion failed for pot in ' + potCountry);
      } else {
        // Cannot determine pot currency for non-zero value - fail loudly
        throw new Error('Pension PV: cannot determine currency for pot in ' + potCountry + ' (ruleset not loaded?)');
      }
      pensionFundPVTotal += potCapital_asset * potDeflator;
    }
  }
  sumPensionPots(person1);
  sumPensionPots(person2);

  // State Pension PV: Calculate PV in base currency (EUR) using Ireland's inflation, then convert to residence currency
  // This ensures State Pension purchasing power is measured in the paying country's terms
  var statePensionPVInBaseCurrency = 0;
  var statePensionPVInResidenceCurrency = 0;
  if (incomeStatePension > 0 && incomeStatePensionBaseCurrency > 0 && person1 && person1.statePensionCountryParam) {
    var statePensionCountry = String(person1.statePensionCountryParam).toLowerCase();
    var currentYearPv = year || (startYear + (ageNum - params.startingAge));
    var statePensionInflationRate = InflationService.resolveInflationRate(statePensionCountry, currentYearPv, {
      params: params,
      config: cfg,
      countryInflationOverrides: countryInflationOverrides
    });
    var statePensionPVFactor = getDeflationFactor(ageNum, startYear, statePensionInflationRate);
    // Calculate PV in base currency (EUR) using Ireland's inflation
    statePensionPVInBaseCurrency = incomeStatePensionBaseCurrency * statePensionPVFactor;
    // For State Pension PV: Keep it in EUR (base currency) - do NOT convert to residence currency
    // The nominal State Pension is converted to ARS for the ledger (correct)
    // But PV should remain in EUR because it represents Ireland's purchasing power
    // ChartManager will handle conversion when displaying, recognizing this is EUR
    var baseCurrency = person1.statePensionCurrencyParam || getCurrencyForCountry(statePensionCountry);
    statePensionPVInResidenceCurrency = statePensionPVInBaseCurrency;
  } else if (incomeStatePension > 0) {
    // Fallback: use standard PV calculation if base currency not available
    statePensionPVInResidenceCurrency = incomeStatePension * deflationFactor;
  }

  // Per-investment-type PV deflators (asset-plan.md §4.1):
  // - Global assets (residenceScope='global'): deflate using assetCountry CPI
  // - Local assets (residenceScope='local'): deflate using residency CPI
  // This aligns investments with real estate/pension PV semantics.
  // NOTE: This must run BEFORE the legacy column updates below, which read from investmentCapitalByKeyPV
  // NOTE: capsByKey values are in residence currency (post-refactor).
  // Multi-asset path: convert back to asset currency before applying asset-country deflator.
  // Legacy path: no conversion needed (both capital and deflator use residence currency).
  if (capsByKey) {
    for (var ck in capsByKey) {
      if (!dataRow.investmentCapitalByKeyPV[ck]) dataRow.investmentCapitalByKeyPV[ck] = 0;

      // Lookup investment type metadata for per-type PV deflation
      // Per asset-plan.md §9: when investmentAssets has entries, typeEntry must exist for every key in capsByKey
      // Legacy fallback: when investmentAssets is empty (no investmentTypes in rules), use residency deflator
      var typeEntry = investmentTypeLookup[ck];
      var typeDeflator = deflationFactor; // default to residency deflator
      var cap_res = capsByKey[ck]; // residence currency value

      if (investmentAssets && investmentAssets.length > 0) {
        // Multi-asset path: per asset-plan.md §9, typeEntry must exist
        if (!typeEntry) {
          throw new Error('PresentValueCalculator: missing investmentTypes entry for key "' + ck + '"');
        }
        // Per asset-plan.md §4.1: global assets use assetCountry CPI, local use residency
        if (typeEntry.residenceScope === 'global') {
          // Skip zero-value assets entirely (0 * any_deflator = 0)
          if (cap_res === 0) {
            dataRow.investmentCapitalByKeyPV[ck] = 0;
            continue;
          }
          var assetCountryNormalized = normalizeCountry(typeEntry.assetCountry);
          typeDeflator = getDeflationFactorForCountry(assetCountryNormalized, ageNum, startYear, {
            params: params,
            config: cfg,
            countryInflationOverrides: countryInflationOverrides,
            year: year
          });
          // Back-convert from residence currency to asset currency for PV calculation
          var assetCur = getCurrencyForCountry(assetCountryNormalized);
          var cap_asset;
          // Skip conversion if asset currency matches residence currency (no FX needed)
          if (assetCur && assetCur === residenceCurrency) {
            cap_asset = cap_res;
          } else if (assetCur) {
            cap_asset = convertCurrencyAmount(cap_res, residenceCurrency, currentCountry, assetCur, assetCountryNormalized, year, true);
            if (cap_asset === null) throw new Error('Investment PV back-conversion failed for ' + ck);
          } else {
            // Cannot determine asset currency for non-zero value - fail loudly
            throw new Error('Investment PV: cannot determine currency for ' + ck + ' in ' + assetCountryNormalized + ' (ruleset not loaded?)');
          }
          dataRow.investmentCapitalByKeyPV[ck] += cap_asset * typeDeflator;
        } else {
          // residenceScope === 'local' → no conversion needed, use residency deflationFactor
          dataRow.investmentCapitalByKeyPV[ck] += cap_res * typeDeflator;
        }
      } else {
        // Legacy path (no investmentTypes) → no conversion needed, use residency deflationFactor
        dataRow.investmentCapitalByKeyPV[ck] += cap_res * typeDeflator;
      }
    }
  }

  if (deflationFactor === 1 && (statePensionPVInResidenceCurrency === 0 || statePensionPVInResidenceCurrency === incomeStatePension)) {
    // Still initialise PV fields so downstream consumers can assume presence.
    // Salary income PV: Use per-country deflation (similar to pension contribution PV logic)
    if (incomeSalariesByCountry && typeof incomeSalariesByCountry === 'object') {
      for (var salCountry in incomeSalariesByCountry) {
        if (!Object.prototype.hasOwnProperty.call(incomeSalariesByCountry, salCountry)) continue;
        var salAmount = incomeSalariesByCountry[salCountry];
        if (salAmount === 0) continue;  // Skip zero salaries
        var salCountryNorm = normalizeCountry(salCountry);
        var salDeflator = getDeflationFactorForCountry(salCountryNorm, ageNum, startYear, {
          params: params,
          config: cfg,
          countryInflationOverrides: countryInflationOverrides,
          year: year
        });
        var salCur = getCurrencyForCountry(salCountryNorm);
        var salPv = salAmount * salDeflator;
        var resCurNorm = normalizeCurrency(residenceCurrency);
        if (salCur && resCurNorm && salCur !== resCurNorm) {
          // PV conversion must use start-year FX (not evolved FX) to avoid embedding FX evolution into PV.
          var convertedSalPv = convertCurrencyAmount(salPv, salCur, salCountryNorm, resCurNorm, currentCountry, startYear || year, true);
          if (convertedSalPv === null) {
            throw new Error('Salary PV conversion failed: cannot convert ' + salPv + ' from ' + salCur + ' to ' + resCurNorm + ' (salary country ' + salCountryNorm + ')');
          }
          salPv = convertedSalPv;
        }
        dataRow.incomeSalariesPV += salPv;
      }
    } else {
      // Fallback for backward compatibility (if map not provided)
      dataRow.incomeSalariesPV += incomeSalaries;
    }
    dataRow.incomeRSUsPV += incomeShares;
    // Rental income PV: Use per-country deflation (similar to salary logic)
    if (incomeRentalsByCountry && typeof incomeRentalsByCountry === 'object') {
      for (var rentCountry in incomeRentalsByCountry) {
        if (!Object.prototype.hasOwnProperty.call(incomeRentalsByCountry, rentCountry)) continue;
        var rentAmount = incomeRentalsByCountry[rentCountry];
        if (rentAmount === 0) continue;  // Skip zero rentals
        var rentCountryNorm = normalizeCountry(rentCountry);
        var rentDeflator = getDeflationFactorForCountry(rentCountryNorm, ageNum, startYear, {
          params: params,
          config: cfg,
          countryInflationOverrides: countryInflationOverrides,
          year: year
        });
        var rentCur = getCurrencyForCountry(rentCountryNorm);
        var rentPv = rentAmount * rentDeflator;
        var resCurNorm2 = normalizeCurrency(residenceCurrency);
        if (rentCur && resCurNorm2 && rentCur !== resCurNorm2) {
          var convertedRentPv = convertCurrencyAmount(rentPv, rentCur, rentCountryNorm, resCurNorm2, currentCountry, startYear || year, true);
          if (convertedRentPv === null) {
            throw new Error('Rental PV conversion failed: cannot convert ' + rentPv + ' from ' + rentCur + ' to ' + resCurNorm2 + ' (rental country ' + rentCountryNorm + ')');
          }
          rentPv = convertedRentPv;
        }
        dataRow.incomeRentalsPV += rentPv;
      }
    } else {
      // Fallback for backward compatibility (if map not provided)
      dataRow.incomeRentalsPV += incomeRentals;
    }
    // Private pension income PV: Use per-country deflation (similar to pension fund PV logic)
    // NOTE: incomePrivatePensionByCountry values are in residence currency (from pot.drawdown())
    // Must convert back to pot's currency before applying pot-country deflator.
    if (incomePrivatePensionByCountry && typeof incomePrivatePensionByCountry === 'object') {
      for (var ppCountry in incomePrivatePensionByCountry) {
        if (!Object.prototype.hasOwnProperty.call(incomePrivatePensionByCountry, ppCountry)) continue;
        var ppAmount_res = incomePrivatePensionByCountry[ppCountry];  // residence currency
        if (ppAmount_res === 0) continue;  // Skip zero income
        var ppDeflator = getDeflationFactorForCountry(ppCountry, ageNum, startYear, {
          params: params,
          config: cfg,
          countryInflationOverrides: countryInflationOverrides,
          year: year
        });
        // Back-convert from residence currency to pot's currency for PV calculation
        var ppCountry_norm = normalizeCountry(ppCountry);
        var ppCur = getCurrencyForCountry(ppCountry_norm);
        var ppAmount_asset;
        // Skip conversion if pot currency matches residence currency (no FX needed)
        if (ppCur && ppCur === residenceCurrency) {
          ppAmount_asset = ppAmount_res;
        } else if (ppCur) {
          ppAmount_asset = convertCurrencyAmount(ppAmount_res, residenceCurrency, currentCountry, ppCur, ppCountry_norm, year, true);
          if (ppAmount_asset === null) throw new Error('Private pension income PV back-conversion failed for pot in ' + ppCountry);
        } else {
          // Cannot determine pot currency - fail loudly
          throw new Error('Private pension income PV: cannot determine currency for pot in ' + ppCountry + ' (ruleset not loaded?)');
        }
        dataRow.incomePrivatePensionPV += ppAmount_asset * ppDeflator;
      }
    } else {
      // Fallback for backward compatibility (if map not provided)
      dataRow.incomePrivatePensionPV += incomePrivatePension;
    }
    dataRow.incomeStatePensionPV += (statePensionPVInResidenceCurrency > 0) ? statePensionPVInResidenceCurrency : incomeStatePension;
    dataRow.incomeFundsRentPV += incomeFundsRent;
    dataRow.incomeSharesRentPV += incomeSharesRent;
    dataRow.incomeCashPV += Math.max(cashWithdraw, 0);
    dataRow.incomeDefinedBenefitPV += incomeDefinedBenefit;
    dataRow.incomeTaxFreePV += incomeTaxFree;
    dataRow.realEstateCapitalPV += realEstateCapitalPV;
    dataRow.netIncomePV += netIncome;
    dataRow.expensesPV += expenses;
    dataRow.pensionFundPV += pensionFundPVTotal;
    // Pension contribution PV: Use per-country deflation (similar to pension fund PV logic)
    if (personalPensionContributionByCountry && typeof personalPensionContributionByCountry === 'object') {
      for (var contribCountry in personalPensionContributionByCountry) {
        if (!Object.prototype.hasOwnProperty.call(personalPensionContributionByCountry, contribCountry)) continue;
        var contribAmount = personalPensionContributionByCountry[contribCountry];
        if (contribAmount === 0) continue;  // Skip zero contributions
        var contribDeflator = getDeflationFactorForCountry(contribCountry, ageNum, startYear, {
          params: params,
          config: cfg,
          countryInflationOverrides: countryInflationOverrides,
          year: year
        });
        dataRow.pensionContributionPV += contribAmount * contribDeflator;
      }
    } else {
      // Fallback for backward compatibility (if map not provided)
      dataRow.pensionContributionPV += personalPensionContribution;
    }
    dataRow.cashPV += cash;
    dataRow.indexFundsCapitalPV += (dataRow.investmentCapitalByKeyPV['indexFunds'] || 0);
    dataRow.sharesCapitalPV += (dataRow.investmentCapitalByKeyPV['shares'] || 0);
    var investmentsPV = 0;
    for (var wk in dataRow.investmentCapitalByKeyPV) {
      investmentsPV += dataRow.investmentCapitalByKeyPV[wk];
    }
    dataRow.worthPV += realEstateCapitalPV + pensionFundPVTotal + investmentsPV + cash;
  } else {
    // Salary income PV: Use per-country deflation (similar to pension contribution PV logic)
    if (incomeSalariesByCountry && typeof incomeSalariesByCountry === 'object') {
      for (var salCountry in incomeSalariesByCountry) {
        if (!Object.prototype.hasOwnProperty.call(incomeSalariesByCountry, salCountry)) continue;
        var salAmount = incomeSalariesByCountry[salCountry];
        if (salAmount === 0) continue;  // Skip zero salaries
        var salCountryNorm = normalizeCountry(salCountry);
        var salDeflator = getDeflationFactorForCountry(salCountryNorm, ageNum, startYear, {
          params: params,
          config: cfg,
          countryInflationOverrides: countryInflationOverrides,
          year: year
        });
        var salCur = getCurrencyForCountry(salCountryNorm);
        var salPv = salAmount * salDeflator;
        var resCurNorm = normalizeCurrency(residenceCurrency);
        if (salCur && resCurNorm && salCur !== resCurNorm) {
          var convertedSalPv = convertCurrencyAmount(salPv, salCur, salCountryNorm, resCurNorm, currentCountry, startYear || year, true);
          if (convertedSalPv === null) {
            throw new Error('Salary PV conversion failed: cannot convert ' + salPv + ' from ' + salCur + ' to ' + resCurNorm + ' (salary country ' + salCountryNorm + ')');
          }
          salPv = convertedSalPv;
        }
        dataRow.incomeSalariesPV += salPv;
      }
    } else {
      // Fallback for backward compatibility (if map not provided)
      dataRow.incomeSalariesPV += incomeSalaries * deflationFactor;
    }
    dataRow.incomeRSUsPV += incomeShares * deflationFactor;
    // Rental income PV: Use per-country deflation (similar to salary logic)
    if (incomeRentalsByCountry && typeof incomeRentalsByCountry === 'object') {
      for (var rentCountry in incomeRentalsByCountry) {
        if (!Object.prototype.hasOwnProperty.call(incomeRentalsByCountry, rentCountry)) continue;
        var rentAmount = incomeRentalsByCountry[rentCountry];
        if (rentAmount === 0) continue;  // Skip zero rentals
        var rentCountryNorm = normalizeCountry(rentCountry);
        var rentDeflator = getDeflationFactorForCountry(rentCountryNorm, ageNum, startYear, {
          params: params,
          config: cfg,
          countryInflationOverrides: countryInflationOverrides,
          year: year
        });
        var rentCur = getCurrencyForCountry(rentCountryNorm);
        var rentPv = rentAmount * rentDeflator;
        var resCurNorm2 = normalizeCurrency(residenceCurrency);
        if (rentCur && resCurNorm2 && rentCur !== resCurNorm2) {
          var convertedRentPv = convertCurrencyAmount(rentPv, rentCur, rentCountryNorm, resCurNorm2, currentCountry, startYear || year, true);
          if (convertedRentPv === null) {
            throw new Error('Rental PV conversion failed: cannot convert ' + rentPv + ' from ' + rentCur + ' to ' + resCurNorm2 + ' (rental country ' + rentCountryNorm + ')');
          }
          rentPv = convertedRentPv;
        }
        dataRow.incomeRentalsPV += rentPv;
      }
    } else {
      // Fallback for backward compatibility (if map not provided)
      dataRow.incomeRentalsPV += incomeRentals * deflationFactor;
    }
    // Private pension income PV: Use per-country deflation (similar to pension fund PV logic)
    // NOTE: incomePrivatePensionByCountry values are in residence currency (from pot.drawdown())
    // Must convert back to pot's currency before applying pot-country deflator.
    if (incomePrivatePensionByCountry && typeof incomePrivatePensionByCountry === 'object') {
      for (var ppCountry in incomePrivatePensionByCountry) {
        if (!Object.prototype.hasOwnProperty.call(incomePrivatePensionByCountry, ppCountry)) continue;
        var ppAmount_res = incomePrivatePensionByCountry[ppCountry];  // residence currency
        if (ppAmount_res === 0) continue;  // Skip zero income
        var ppDeflator = getDeflationFactorForCountry(ppCountry, ageNum, startYear, {
          params: params,
          config: cfg,
          countryInflationOverrides: countryInflationOverrides,
          year: year
        });
        // Back-convert from residence currency to pot's currency for PV calculation
        var ppCountry_norm = normalizeCountry(ppCountry);
        var ppCur = getCurrencyForCountry(ppCountry_norm);
        var ppAmount_asset;
        // Skip conversion if pot currency matches residence currency (no FX needed)
        if (ppCur && ppCur === residenceCurrency) {
          ppAmount_asset = ppAmount_res;
        } else if (ppCur) {
          ppAmount_asset = convertCurrencyAmount(ppAmount_res, residenceCurrency, currentCountry, ppCur, ppCountry_norm, year, true);
          if (ppAmount_asset === null) throw new Error('Private pension income PV back-conversion failed for pot in ' + ppCountry);
        } else {
          // Cannot determine pot currency - fail loudly
          throw new Error('Private pension income PV: cannot determine currency for pot in ' + ppCountry + ' (ruleset not loaded?)');
        }
        dataRow.incomePrivatePensionPV += ppAmount_asset * ppDeflator;
      }
    } else {
      // Fallback for backward compatibility (if map not provided)
      dataRow.incomePrivatePensionPV += incomePrivatePension * deflationFactor;
    }
    // State Pension PV: Use the pre-calculated statePensionPVInResidenceCurrency (calculated above before the if/else)
    dataRow.incomeStatePensionPV += statePensionPVInResidenceCurrency;
    dataRow.incomeFundsRentPV += incomeFundsRent * deflationFactor;
    dataRow.incomeSharesRentPV += incomeSharesRent * deflationFactor;
    dataRow.incomeCashPV += Math.max(cashWithdraw, 0) * deflationFactor;
    dataRow.incomeDefinedBenefitPV += incomeDefinedBenefit * deflationFactor;
    dataRow.incomeTaxFreePV += incomeTaxFree * deflationFactor;
    dataRow.realEstateCapitalPV += realEstateCapitalPV;
    dataRow.netIncomePV += netIncome * deflationFactor;
    dataRow.expensesPV += expenses * deflationFactor;
    dataRow.pensionFundPV += pensionFundPVTotal;
    // Pension contribution PV: Use per-country deflation (similar to pension fund PV logic)
    if (personalPensionContributionByCountry && typeof personalPensionContributionByCountry === 'object') {
      for (var contribCountry in personalPensionContributionByCountry) {
        if (!Object.prototype.hasOwnProperty.call(personalPensionContributionByCountry, contribCountry)) continue;
        var contribAmount = personalPensionContributionByCountry[contribCountry];
        if (contribAmount === 0) continue;  // Skip zero contributions
        var contribDeflator = getDeflationFactorForCountry(contribCountry, ageNum, startYear, {
          params: params,
          config: cfg,
          countryInflationOverrides: countryInflationOverrides,
          year: year
        });
        dataRow.pensionContributionPV += contribAmount * contribDeflator;
      }
    } else {
      // Fallback for backward compatibility (if map not provided)
      dataRow.pensionContributionPV += personalPensionContribution * deflationFactor;
    }
    dataRow.cashPV += cash * deflationFactor;
    dataRow.indexFundsCapitalPV += (dataRow.investmentCapitalByKeyPV['indexFunds'] || 0);
    dataRow.sharesCapitalPV += (dataRow.investmentCapitalByKeyPV['shares'] || 0);
    var investmentsPV = 0;
    for (var wk in dataRow.investmentCapitalByKeyPV) {
      investmentsPV += dataRow.investmentCapitalByKeyPV[wk];
    }
    dataRow.worthPV += realEstateCapitalPV + pensionFundPVTotal + investmentsPV + cash * deflationFactor;
  }

  // Dynamic PV maps for per-investment-type income and capital. These mirror
  // the nominal investmentIncomeByKey / investmentCapitalByKey maps so that
  // dynamic Income__/Capital__ columns in the UI can also be "exact by
  // construction" rather than deflated in the browser.
  if (investmentIncomeByKey) {
    for (var ik in investmentIncomeByKey) {
      if (!dataRow.investmentIncomeByKeyPV[ik]) dataRow.investmentIncomeByKeyPV[ik] = 0;
      if (deflationFactor === 1) {
        dataRow.investmentIncomeByKeyPV[ik] += investmentIncomeByKey[ik];
      } else {
        dataRow.investmentIncomeByKeyPV[ik] += investmentIncomeByKey[ik] * deflationFactor;
      }
    }
  }

  // Tax PV computation for deduction columns (Tax__*).
  // Taxes are flow-based deductions, so we use residency deflation (same as income flows).
  // The revenue object (Taxman instance) provides getTaxByType() for per-tax-ID amounts.
  var revenue = ctx.revenue;
  if (revenue && revenue.taxTotals) {
    for (var taxId in revenue.taxTotals) {
      var taxColPV = 'Tax__' + taxId + 'PV';
      if (!dataRow[taxColPV]) dataRow[taxColPV] = 0;
      var taxAmount = revenue.getTaxByType(taxId);
      if (deflationFactor === 1) {
        dataRow[taxColPV] += taxAmount;
      } else {
        dataRow[taxColPV] += taxAmount * deflationFactor;
      }
    }
  }

}

// Expose via namespace object for explicit API contract
var PresentValueCalculator = {
  computePresentValueAggregates: computePresentValueAggregates
};
