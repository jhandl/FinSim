/**
 * DataAggregatesCalculator.js
 * 
 * Purpose: Computes nominal financial aggregates for the simulation data sheet.
 * Extracted from Simulator.js::updateYearlyData() for testability.
 * 
 * GAS Compatibility: Uses plain functions and global object access, avoiding ES6 modules.
 * 
 * Context Object Pattern:
 * All inputs are passed via a single context object (ctx) for clarity and maintainability.
 * This matches the pattern used by PresentValueCalculator.js.
 */

/**
 * Compute nominal financial aggregates for a simulation year.
 * 
 * Numeric boundary contract: All monetary inputs are numeric values (pre-extracted .amount from Money objects).
 * Money objects never enter this aggregation layer—currency safety is enforced upstream in asset classes.
 * 
 * @param {Object} ctx - Context object containing all inputs:
 *   @param {Array} ctx.dataSheet - Array of data rows, mutated in-place
 *   @param {number} ctx.row - Index in dataSheet to update
 *   @param {number} ctx.incomeSalaries - Pre-extracted .amount from salary Money objects
 *   @param {number} ctx.incomeShares - Pre-extracted .amount from RSU Money objects
 *   @param {number} ctx.incomeRentals - Pre-extracted .amount from rental Money objects
 *   @param {number} ctx.incomePrivatePension - Pre-extracted .amount from pension Money objects
 *   @param {number} ctx.incomeStatePension - Pre-extracted .amount from state pension Money objects
 *   @param {number} ctx.cashWithdraw - Pre-extracted .amount from cash withdrawal Money objects
 *   @param {number} ctx.incomeDefinedBenefit - Pre-extracted .amount from DB pension Money objects
 *   @param {number} ctx.incomeTaxFree - Pre-extracted .amount from tax-free income Money objects
 *   @param {number} ctx.netIncome - Pre-extracted .amount (post-tax income)
 *   @param {number} ctx.expenses - Pre-extracted .amount from expense Money objects
 *   @param {number} ctx.personalPensionContribution - Pre-extracted .amount from contribution Money objects
 *   @param {number} ctx.withdrawalRate - Numeric withdrawal rate
 *   @param {number} ctx.pensionCap - Pre-computed total pension capital in residence currency
 *   @param {Object} ctx.person1 - Person object (for age extraction)
 *   @param {number} ctx.realEstateConverted - Pre-extracted .amount from converted real estate
 *   @param {Object} ctx.capsByKey - Map of investment capitals by key
 *   @param {Object} ctx.investmentIncomeByKey - Map of income by investment type
 *   @param {Object} ctx.revenue - Taxman instance (for tax column population)
 *   @param {Array} ctx.stableTaxIds - Array of stable tax IDs for consistent Tax__ columns
 *   @param {number} ctx.cash - Pre-extracted .amount from cash
 *   @param {number} ctx.year - Simulation year
 */
function computeNominalAggregates(ctx) {
  // Extract from context
  var dataSheet = ctx.dataSheet;
  var row = ctx.row;
  var incomeSalaries = ctx.incomeSalaries;
  var incomeShares = ctx.incomeShares;
  var incomeRentals = ctx.incomeRentals;
  var incomePrivatePension = ctx.incomePrivatePension;
  var incomeStatePension = ctx.incomeStatePension;
  var cashWithdraw = ctx.cashWithdraw;
  var incomeDefinedBenefit = ctx.incomeDefinedBenefit;
  var incomeTaxFree = ctx.incomeTaxFree;
  var netIncome = ctx.netIncome;
  var expenses = ctx.expenses;
  var personalPensionContribution = ctx.personalPensionContribution;
  var withdrawalRate = ctx.withdrawalRate;
  var pensionCap = ctx.pensionCap;
  var person1 = ctx.person1;
  var realEstateConverted = ctx.realEstateConverted;
  var capsByKey = ctx.capsByKey;
  var investmentIncomeByKey = ctx.investmentIncomeByKey;
  var revenue = ctx.revenue;
  var stableTaxIds = ctx.stableTaxIds;
  var cash = ctx.cash;
  var year = ctx.year;

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
      "incomeCash": 0,
      "incomeDefinedBenefit": 0,
      "incomeTaxFree": 0,
      "realEstateCapital": 0,
      "netIncome": 0,
      "expenses": 0,
      "pensionFund": 0,
      "cash": 0,
      "pensionContribution": 0,
      "withdrawalRate": 0,
      "worth": 0,
      // Present-value (PV) aggregates – expressed in simulation-start year terms
      "incomeSalariesPV": 0,
      "incomeRSUsPV": 0,
      "incomeRentalsPV": 0,
      "incomePrivatePensionPV": 0,
      "incomeStatePensionPV": 0,
      "incomeCashPV": 0,
      "incomeDefinedBenefitPV": 0,
      "incomeTaxFreePV": 0,
      "realEstateCapitalPV": 0,
      "netIncomePV": 0,
      "expensesPV": 0,
      "pensionFundPV": 0,
      "cashPV": 0,
      "pensionContributionPV": 0,
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
        // Initialize PV counterpart for deduction PV support
        var tcolPV = tcol + 'PV';
        if (dataSheet[row][tcolPV] === undefined) dataSheet[row][tcolPV] = 0;
      }
    }

    // Initialize dynamic tax columns based on current tax totals
    for (const taxId in revenue.taxTotals) {
      const taxColumnName = `Tax__${taxId}`;
      dataSheet[row][taxColumnName] = 0;
      // Initialize PV counterpart for deduction PV support
      dataSheet[row][taxColumnName + 'PV'] = 0;
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
  dataSheet[row].incomeCash += Math.max(cashWithdraw, 0);
  dataSheet[row].incomeDefinedBenefit += incomeDefinedBenefit;
  dataSheet[row].incomeTaxFree += incomeTaxFree;
  dataSheet[row].realEstateCapital += realEstateConverted;
  dataSheet[row].netIncome += netIncome;
  dataSheet[row].expenses += expenses;
  dataSheet[row].pensionFund += pensionCap;
  dataSheet[row].cash += cash;
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
  dataSheet[row].worth += realEstateConverted + pensionCap + totalInvestmentCaps + cash;
}

var DataAggregatesCalculator = { computeNominalAggregates: computeNominalAggregates };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataAggregatesCalculator;
}
