/**
 * DataAggregatesCalculator.js
 * 
 * Purpose: Extracts and modularizes the computation of nominal financial aggregates
 * from the monolithic Simulator.js::updateYearlyData() function. This module handles
 * the initialization and accumulation of yearly data rows, including income flows,
 * expenses, asset capitals, dynamic investment maps, and tax columns.
 * 
 * GAS Compatibility: Designed to run in Google Apps Script environment. Uses plain
 * functions and global object access, avoiding modern JS features like modules.
 * 
 * Parameter Semantics:
 * - dataSheet: Array of data rows, mutated in-place to store aggregates.
 * - row: Index in dataSheet to update (initializes if not present).
 * - incomeSalaries, incomeShares, etc.: Yearly income/expense flows to accumulate.
 * - person1, person2: Person objects for pension capital calculation.
 * - indexFunds, shares, investmentAssets: Asset managers for capital computation.
 * - realEstateConverted: Pre-computed real estate value in residence currency.
 * - indexFundsCap, sharesCap: Pre-computed legacy asset capitals.
 * - capsByKey: Pre-computed map of investment capitals by key (avoids double-counting legacy assets).
 * - investmentIncomeByKey: Map of income by investment type for dynamic columns.
 * - revenue: Taxman instance for tax column population.
 * - stableTaxIds: Array of stable tax IDs for consistent Tax__ columns.
 * - cash: Current cash balance.
 * - year: Simulation year.
 * - currentCountry, residenceCurrency: Context for multi-country support.
 */

/**
 * Compute nominal financial aggregates for a simulation year.
 * 
 * Numeric boundary contract: All monetary inputs are numeric values (pre-extracted .amount from Money objects).
 * Money objects never enter this aggregation layer—currency safety is enforced upstream in asset classes.
 * 
 * @param {Array} dataSheet - Array of data rows, mutated in-place
 * @param {number} row - Index in dataSheet to update
 * @param {number} incomeSalaries - Pre-extracted .amount from salary Money objects
 * @param {number} incomeShares - Pre-extracted .amount from RSU Money objects
 * @param {number} incomeRentals - Pre-extracted .amount from rental Money objects
 * @param {number} incomePrivatePension - Pre-extracted .amount from pension Money objects
 * @param {number} incomeStatePension - Pre-extracted .amount from state pension Money objects
 * @param {number} incomeFundsRent - Pre-extracted .amount from fund income Money objects
 * @param {number} incomeSharesRent - Pre-extracted .amount from share income Money objects
 * @param {number} cashWithdraw - Pre-extracted .amount from cash withdrawal Money objects
 * @param {number} incomeDefinedBenefit - Pre-extracted .amount from DB pension Money objects
 * @param {number} incomeTaxFree - Pre-extracted .amount from tax-free income Money objects
 * @param {number} netIncome - Pre-extracted .amount (post-tax income)
 * @param {number} expenses - Pre-extracted .amount from expense Money objects
 * @param {number} personalPensionContribution - Pre-extracted .amount from contribution Money objects
 * @param {number} withdrawalRate - Numeric withdrawal rate
 * @param {Object} person1 - Person object (for pension capital extraction)
 * @param {Object} person2 - Person object (for pension capital extraction)
 * @param {Object} indexFunds - IndexFunds asset (for capital extraction)
 * @param {Object} shares - Shares asset (for capital extraction)
 * @param {Array} investmentAssets - Array of investment assets (for capital extraction)
 * @param {Object} realEstate - RealEstate object (for property capital)
 * @param {number} realEstateConverted - Pre-extracted .amount from converted real estate Money objects
 * @param {Object} capsByKey - Map of investment capitals by key (pre-extracted .amount values)
 * @param {Object} investmentIncomeByKey - Map of income by investment type (pre-extracted .amount values)
 * @param {Object} revenue - Taxman instance (for tax column population)
 * @param {Array} stableTaxIds - Array of stable tax IDs for consistent Tax__ columns
 * @param {number} cash - Pre-extracted .amount from cash Money object
 * @param {number} year - Simulation year
 * @param {string} currentCountry - Current country code
 * @param {string} residenceCurrency - Current residence currency code
 */
function computeNominalAggregates(dataSheet, row, incomeSalaries, incomeShares, incomeRentals, incomePrivatePension, incomeStatePension, incomeFundsRent, incomeSharesRent, cashWithdraw, incomeDefinedBenefit, incomeTaxFree, netIncome, expenses, personalPensionContribution, withdrawalRate, person1, person2, indexFunds, shares, investmentAssets, realEstate, realEstateConverted, capsByKey, investmentIncomeByKey, revenue, stableTaxIds, cash, year, currentCountry, residenceCurrency) {
  // Numeric boundary contract: All inputs are numeric values extracted from asset classes.
  // Money objects never enter this aggregation layer.
  // This is used below to hide the deemed disposal tax payments, otherwise they're shown as income.
  let FundsTax = (incomeFundsRent + incomeSharesRent + cashWithdraw > 0) ? revenue.getTaxTotal('capitalGains') * incomeFundsRent / (incomeFundsRent + incomeSharesRent + cashWithdraw) : 0;
  let SharesTax = (incomeFundsRent + incomeSharesRent + cashWithdraw > 0) ? revenue.getTaxTotal('capitalGains') * incomeSharesRent / (incomeFundsRent + incomeSharesRent + cashWithdraw) : 0;

  if (!(row in dataSheet)) {
    dataSheet[row] = {
      "age": 0,
      "year": 0,
      // Nominal aggregates
      "incomeSalaries": 0,
      "incomeRSUs": 0,
      "incomeRentals": 0,
      "incomePrivatePension": 0,
      "incomeStatePension": 0,
      "incomeFundsRent": 0,
      "incomeSharesRent": 0,
      "incomeCash": 0,
      "incomeDefinedBenefit": 0,
      "incomeTaxFree": 0,
      "realEstateCapital": 0,
      "netIncome": 0,
      "expenses": 0,
      "pensionFund": 0,
      "cash": 0,
      "indexFundsCapital": 0,
      "sharesCapital": 0,
      "pensionContribution": 0,
      "withdrawalRate": 0,
      "worth": 0,
      // Present-value (PV) aggregates – expressed in simulation-start year terms
      "incomeSalariesPV": 0,
      "incomeRSUsPV": 0,
      "incomeRentalsPV": 0,
      "incomePrivatePensionPV": 0,
      "incomeStatePensionPV": 0,
      "incomeFundsRentPV": 0,
      "incomeSharesRentPV": 0,
      "incomeCashPV": 0,
      "incomeDefinedBenefitPV": 0,
      "incomeTaxFreePV": 0,
      "realEstateCapitalPV": 0,
      "netIncomePV": 0,
      "expensesPV": 0,
      "pensionFundPV": 0,
      "cashPV": 0,
      "indexFundsCapitalPV": 0,
      "sharesCapitalPV": 0,
      "worthPV": 0,
      // Attribution and dynamic per-key maps (nominal and PV)
      "attributions": {},
      "investmentIncomeByKey": {},
      "investmentCapitalByKey": {},
      "investmentIncomeByKeyPV": {},
      "investmentCapitalByKeyPV": {},
      "taxByKey": {}
    };
    // Pre-initialize stable tax columns for consistency across rows
    if (stableTaxIds && stableTaxIds.length > 0) {
      for (var ti = 0; ti < stableTaxIds.length; ti++) {
        var tcol = 'Tax__' + stableTaxIds[ti];
        if (dataSheet[row][tcol] === undefined) dataSheet[row][tcol] = 0;
      }
    }

    // Initialize dynamic tax columns based on current tax totals
    for (const taxId in revenue.taxTotals) {
      const taxColumnName = `Tax__${taxId}`;
      dataSheet[row][taxColumnName] = 0;
    }
  }
  // Set age and year (don't accumulate - these represent the current simulation state)
  dataSheet[row].age = person1.age;
  dataSheet[row].year = year;
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
  dataSheet[row].indexFundsCapital += capsByKey['indexFunds'];
  dataSheet[row].sharesCapital += capsByKey['shares'];
  // Accumulate per-type income and capital for dynamic UI columns
  // Ensure investmentIncomeByKey exists even if row was pre-initialized
  if (!dataSheet[row].investmentIncomeByKey) dataSheet[row].investmentIncomeByKey = {};
  for (var k in investmentIncomeByKey) {
    if (!dataSheet[row].investmentIncomeByKey[k]) dataSheet[row].investmentIncomeByKey[k] = 0;
    dataSheet[row].investmentIncomeByKey[k] += investmentIncomeByKey[k];
  }
  // Ensure investmentCapitalByKey exists even if row was pre-initialized
  if (!dataSheet[row].investmentCapitalByKey) dataSheet[row].investmentCapitalByKey = {};
  // capsByKey is pre-computed to avoid double-counting legacy assets
  for (var key in capsByKey) {
    if (!dataSheet[row].investmentCapitalByKey[key]) dataSheet[row].investmentCapitalByKey[key] = 0;
    dataSheet[row].investmentCapitalByKey[key] += capsByKey[key];
  }
  dataSheet[row].pensionContribution += personalPensionContribution;
  dataSheet[row].withdrawalRate += withdrawalRate;

  // Populate dynamic tax columns
  for (const taxId in revenue.taxTotals) {
    const taxColumnName = `Tax__${taxId}`;
    if (!dataSheet[row][taxColumnName]) {
      dataSheet[row][taxColumnName] = 0;
    }
    dataSheet[row][taxColumnName] += revenue.getTaxByType(taxId);
  }

  // Calculate worth: include all asset capitals from capsByKey (the canonical source)
  let totalInvestmentCaps = 0;
  for (var key in capsByKey) {
    totalInvestmentCaps += capsByKey[key];
  }
  dataSheet[row].worth += realEstateConverted + person1.pension.capital() + (person2 ? person2.pension.capital() : 0) + totalInvestmentCaps + cash;
}

var DataAggregatesCalculator = { computeNominalAggregates: computeNominalAggregates };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataAggregatesCalculator;
}
