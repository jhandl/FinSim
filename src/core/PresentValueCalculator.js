/* PresentValueCalculator.js
 * 
 * Computes present-value (PV) aggregates for a simulation data row.
 * Extracted from Simulator.js updateYearlyData() to improve testability
 * and maintainability. Must remain GAS-compatible (no ES6 modules).
 * 
 * PV Semantics:
 * - Flows (income/expenses): Use residency-country deflation (current country CPI)
 * - Stocks (assets): Use asset-origin-country deflation (birth country CPI)
 *   - Real estate: Per-property linkedCountry → StartCountry fallback
 *   - Pensions: StartCountry (contribution origin)
 *   - Investments: StartCountry (EUR brokerage origin)
 * - State pension: Special handling in base currency (EUR) with Ireland CPI
 * 
 * This file has to work on both the website and Google Sheets.
 */

/**
 * Compute present-value (PV) aggregates for a simulation data row.
 * 
 * Numeric boundary contract: All asset values in ctx are numeric (pre-extracted .amount from Money objects).
 * PV deflation operates on numbers; Money objects remain in asset classes for currency safety.
 * 
 * PV Semantics:
 * - Flows (income/expenses): Use residency-country deflation (current country CPI)
 * - Stocks (assets): Use asset-origin-country deflation (birth country CPI)
 * 
 * @param {Object} ctx - Context object containing:
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
  var dataRow = ctx.dataRow;
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

  // Pension PV: Use origin-country (StartCountry) deflation, not residency deflation
  // Pensions should be deflated using the country where contributions were made
  if (!params.StartCountry) throw new Error('PresentValueCalculator: params.StartCountry is required for pension PV calculation');
  var pensionOriginCountry = params.StartCountry.toLowerCase();
  var pensionDeflator = getDeflationFactorForCountry(pensionOriginCountry, ageNum, startYear, {
    params: params,
    config: cfg,
    countryInflationOverrides: countryInflationOverrides,
    year: year
  });
  var pensionFundNominal = person1.pension.capital() + (person2 ? person2.pension.capital() : 0);

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
  if (capsByKey) {
    for (var ck in capsByKey) {
      if (!dataRow.investmentCapitalByKeyPV[ck]) dataRow.investmentCapitalByKeyPV[ck] = 0;

      // Lookup investment type metadata for per-type PV deflation
      // Per asset-plan.md §9: when investmentAssets has entries, typeEntry must exist for every key in capsByKey
      // Legacy fallback: when investmentAssets is empty (no investmentTypes in rules), use residency deflator
      var typeEntry = investmentTypeLookup[ck];
      var typeDeflator = deflationFactor; // default to residency deflator

      if (investmentAssets && investmentAssets.length > 0) {
        // Multi-asset path: per asset-plan.md §9, typeEntry must exist
        if (!typeEntry) {
          throw new Error('PresentValueCalculator: missing investmentTypes entry for key "' + ck + '"');
        }
        // Per asset-plan.md §4.1: global assets use assetCountry CPI, local use residency
        if (typeEntry.residenceScope === 'global') {
          var assetCountryNormalized = normalizeCountry(typeEntry.assetCountry);
          typeDeflator = getDeflationFactorForCountry(assetCountryNormalized, ageNum, startYear, {
            params: params,
            config: cfg,
            countryInflationOverrides: countryInflationOverrides,
            year: year
          });
        }
        // else: residenceScope === 'local' → use residency deflationFactor (already set)
      }
      // else: legacy path (no investmentTypes) → use residency deflationFactor

      dataRow.investmentCapitalByKeyPV[ck] += capsByKey[ck] * typeDeflator;
    }
  }

  if (deflationFactor === 1 && (statePensionPVInResidenceCurrency === 0 || statePensionPVInResidenceCurrency === incomeStatePension)) {
    // Still initialise PV fields so downstream consumers can assume presence.
    dataRow.incomeSalariesPV += incomeSalaries;
    dataRow.incomeRSUsPV += incomeShares;
    dataRow.incomeRentalsPV += incomeRentals;
    dataRow.incomePrivatePensionPV += incomePrivatePension;
    dataRow.incomeStatePensionPV += (statePensionPVInResidenceCurrency > 0) ? statePensionPVInResidenceCurrency : incomeStatePension;
    dataRow.incomeFundsRentPV += incomeFundsRent;
    dataRow.incomeSharesRentPV += incomeSharesRent;
    dataRow.incomeCashPV += Math.max(cashWithdraw, 0);
    dataRow.incomeDefinedBenefitPV += incomeDefinedBenefit;
    dataRow.incomeTaxFreePV += incomeTaxFree;
    dataRow.realEstateCapitalPV += realEstateCapitalPV;
    dataRow.netIncomePV += netIncome;
    dataRow.expensesPV += expenses;
    dataRow.pensionFundPV += pensionFundNominal * pensionDeflator;
    dataRow.pensionContributionPV += personalPensionContribution;
    dataRow.cashPV += cash;
    dataRow.indexFundsCapitalPV += (dataRow.investmentCapitalByKeyPV['indexFunds'] || 0);
    dataRow.sharesCapitalPV += (dataRow.investmentCapitalByKeyPV['shares'] || 0);
    var investmentsPV = 0;
    for (var wk in dataRow.investmentCapitalByKeyPV) {
      investmentsPV += dataRow.investmentCapitalByKeyPV[wk];
    }
    dataRow.worthPV += realEstateCapitalPV + (pensionFundNominal * pensionDeflator) + investmentsPV + cash;
  } else {
    dataRow.incomeSalariesPV += incomeSalaries * deflationFactor;
    dataRow.incomeRSUsPV += incomeShares * deflationFactor;
    dataRow.incomeRentalsPV += incomeRentals * deflationFactor;
    dataRow.incomePrivatePensionPV += incomePrivatePension * deflationFactor;
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
    dataRow.pensionFundPV += pensionFundNominal * pensionDeflator;
    dataRow.pensionContributionPV += personalPensionContribution * deflationFactor;
    dataRow.cashPV += cash * deflationFactor;
    dataRow.indexFundsCapitalPV += (dataRow.investmentCapitalByKeyPV['indexFunds'] || 0);
    dataRow.sharesCapitalPV += (dataRow.investmentCapitalByKeyPV['shares'] || 0);
    var investmentsPV = 0;
    for (var wk in dataRow.investmentCapitalByKeyPV) {
      investmentsPV += dataRow.investmentCapitalByKeyPV[wk];
    }
    dataRow.worthPV += realEstateCapitalPV + (pensionFundNominal * pensionDeflator) + investmentsPV + cash * deflationFactor;
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
