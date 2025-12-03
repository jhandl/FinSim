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

function computePresentValueAggregates(ctx) {
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
  var indexFundsCap = ctx.indexFundsCap;
  var sharesCap = ctx.sharesCap;
  var capsByKey = ctx.capsByKey;
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
    dataRow.cashPV += cash;
    dataRow.indexFundsCapitalPV += indexFundsCap;
    dataRow.sharesCapitalPV += sharesCap;
    dataRow.worthPV += realEstateCapitalPV + (pensionFundNominal * pensionDeflator) + indexFundsCap + sharesCap + cash;
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
    dataRow.cashPV += cash * deflationFactor;
    dataRow.indexFundsCapitalPV += indexFundsCap * deflationFactor;
    dataRow.sharesCapitalPV += sharesCap * deflationFactor;
    dataRow.worthPV += realEstateCapitalPV + (pensionFundNominal * pensionDeflator) + indexFundsCap * deflationFactor + sharesCap * deflationFactor + cash * deflationFactor;
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
  if (capsByKey) {
    for (var ck in capsByKey) {
      if (!dataRow.investmentCapitalByKeyPV[ck]) dataRow.investmentCapitalByKeyPV[ck] = 0;
      if (deflationFactor === 1) {
        dataRow.investmentCapitalByKeyPV[ck] += capsByKey[ck];
      } else {
        dataRow.investmentCapitalByKeyPV[ck] += capsByKey[ck] * deflationFactor;
      }
    }
  }
}

// Expose via namespace object for explicit API contract
var PresentValueCalculator = {
  computePresentValueAggregates: computePresentValueAggregates
};