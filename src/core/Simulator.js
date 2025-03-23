/* This file has to work on both the website and Google Sheets */

var uiManager, params, events, config, dataSheet, row, errors;
var age, year, phase, periods, failedAt, success, montecarlo;
var revenue, realEstate, stockGrowthOverride;
var netIncome, expenses, savings, targetCash, cashWithdraw, cashDeficit;
var incomeStatePension, incomePrivatePension, incomeFundsRent, incomeSharesRent, withdrawalRate;
var cash, indexFunds, shares, pension;

const Phases = {
  growth: 'growth',
  retired: 'retired'
}


function run() {
  if (!initializeSimulator()) return;
  montecarlo = (params.growthDevPension > 0 || params.growthDevFunds > 0 || params.growthDevShares > 0);
  let runs = (montecarlo ? config.simulationRuns : 1);
  let successes = 0;
  uiManager.updateProgress("Running");
  for (let run = 0; run < runs; run++) {
    successes += runSimulation(); 
  }
  uiManager.updateDataSheet(runs);
  uiManager.updateStatusCell(successes, runs);
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
  params = uiManager.readParameters(validate); // 6918 ms
  events = uiManager.readEvents(validate); // 534 ms
  if (errors) {
    uiManager.setStatus("Check errors", STATUS_COLORS.WARNING);
  }
  return !errors;
}

function initializeSimulator() {
  initializeUI();
  uiManager.setStatus("Initializing", STATUS_COLORS.INFO);
  config = Config.getInstance(uiManager.ui);
  revenue = new Revenue();
  dataSheet = [];
  return readScenario(validate = true);
}

function saveToFile() {
  uiManager.setStatus("Preparing to save", STATUS_COLORS.INFO);
  if (readScenario(validate = false)) {
    uiManager.saveToFile();
  }
  uiManager.setStatus("", STATUS_COLORS.INFO);
}

function loadFromFile(file) {
  uiManager.loadFromFile(file);
}

function initializeSimulationVariables() {
  // revenue.reset();
  pension = new Pension(params.growthRatePension, params.growthDevPension);
  indexFunds = new IndexFunds(params.growthRateFunds, params.growthDevFunds);
  shares = new Shares(params.growthRateShares, params.growthDevShares);
  if (params.initialPension > 0) pension.buy(params.initialPension);
  if (params.initialFunds > 0) indexFunds.buy(params.initialFunds);
  if (params.initialShares > 0) shares.buy(params.initialShares);

  periods = 0;
  success = true;
  stockGrowthOverride = undefined;

  initializeRealEstate();

  age = params.startingAge - 1;
  year = new Date().getFullYear() - 1;
  phase = Phases.growth;
  cash = params.initialSavings;
  failedAt = 0;
  row = 0;
}

function resetYearlyVariables() {
  // Reset yearly variables here
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
  withdrawalRate = 0;
  cashDeficit = 0;
  cashWithdraw = 0;
  savings = 0;

  revenue.reset();
  indexFunds.addYear();
  shares.addYear();
  pension.addYear();
  realEstate.addYear();
}

function runSimulation() {
  initializeSimulationVariables();

  while (age < params.targetAge) {

    row++;
    year++;
    age++;
    periods = row - 1;

    // console.log("  ======== Age: "+age+" ========");

    resetYearlyVariables();
    calculatePensionIncome();
    processEvents();
    handleInvestments();
    updateYearlyData();
  }
  return success;
}

function calculatePensionIncome() {
  // Private Pension
  if (age === params.retirementAge) {
    cash += pension.getLumpsum();
    phase = Phases.retired;
  }
  if (phase === Phases.retired) {
    incomePrivatePension += pension.drawdown();
  }
  // State Pension
  if (age >= config.statePensionQualifyingAge) {
    incomeStatePension = 52 * adjust(params.statePensionWeekly);
    if (age >= config.statePensionIncreaseAge) {
      incomeStatePension += 52 * adjust(config.statePensionIncreaseAmount);
    }
  }
  revenue.declareStatePensionIncome(incomeStatePension);
}

function processEvents() {
  expenses = 0;
  for (let i = 0; i < events.length; i++) {
    let event = events[i];
    let amount = adjust(event.amount, event.rate);
    // Default toAge to 999 if not required for this event type
    let inScope = (age >= event.fromAge && age <= (event.toAge || 999));

    switch (event.type) {

      case "NOP": // No Operation
        break;

      case 'RI': // Rental income
        if (inScope) {
          incomeRentals += amount;
          revenue.declareOtherIncome(amount);
        }
        break;

      case 'SI': // Salary income (with private pension contribution if so defined)
        if (inScope) {
          incomeSalaries += amount;
          let contribRate = params.pensionPercentage * getRateForKey(age, config.pensionContributionRateBands);
          if (params.pensionCapped && (amount > adjust(config.pensionContribEarningLimit))) {
            contribRate = contribRate * adjust(config.pensionContribEarningLimit) / amount;
          }
          let companyMatch = Math.min(event.match || 0, contribRate);
          let personalContrib = contribRate * amount;
          let companyContrib = companyMatch * amount;
          let totalContrib = personalContrib + companyContrib;
          pensionContribution += totalContrib;
          pension.buy(totalContrib);
          revenue.declareSalaryIncome(amount, contribRate);
        }
        break;

      case 'SInp': // Salary income (with no private pension contribution even if pension contribution is > 0)
        if (inScope) {
          incomeSalaries += amount;
          revenue.declareSalaryIncome(amount, 0);
        }
        break;

      case 'UI': // RSU income
        if (inScope) {
          incomeShares += amount;
          revenue.declareNonEuSharesIncome(amount);
        }
        break;

      case 'DBI': // Defined Benefit Pension Income
        if (inScope) {
          incomeDefinedBenefit += amount;
          revenue.declareSalaryIncome(amount, 0);
        }
        break;

      case 'FI': // Tax-free income
        if (inScope) {
          incomeTaxFree += amount;
        }
        break;

      case 'E': // Expenses
        if (inScope) {
          expenses += amount;
        }
        break;

      case 'M': // Mortgage
        if (age == event.fromAge) {
          realEstate.mortgage(event.id, event.toAge - event.fromAge, event.rate, event.amount);
          //            console.log("Borrowed "+Math.round(realEstate.properties[event.id].borrowed)+" on a "+(event.toAge - event.fromAge)+"-year "+(event.rate*100)+"% mortgage for property ["+event.id+"] paying "+Math.round(amount)+"/year");
        }
        if (inScope) {
          expenses += realEstate.getPayment(event.id); // not adjusted once mortgage starts, assuming fixed rate
          //            console.log("Mortgage payment "+realEstate.getPayment(event.id)+" for property ["+event.id+"] ("+(realEstate.properties[event.id].paymentsMade)+" of "+realEstate.properties[event.id].terms+")");
        }
        break;

      case 'R': // Real estate
        // purchase
        if (age === event.fromAge) {
          realEstate.buy(event.id, amount, event.rate);
          expenses += amount;
          //            console.log("Buy property ["+event.id+"] with "+Math.round(amount)+"  downpayment (valued "+Math.round(realEstate.getValue(event.id))+")");            
        }
        // sale - only if toAge is specified
        if (event.toAge && age === event.toAge) {
          //            console.log("Sell property ["+event.id+"] for "+Math.round(realEstate.getValue(event.id)));            
          cash += realEstate.sell(event.id);
        }
        break;

      case 'SM': // Stock Market Growth override to simulate bull or bear markets
        if (age == event.fromAge) {
          stockGrowthOverride = Math.pow(1 + event.rate, 1 / (event.toAge - event.fromAge + 1)) - 1;
        }
        if (age === event.toAge + 1) {
          stockGrowthOverride = undefined;
        }
        break;

      default:
        break;
    }
  }
}


function handleInvestments() {
  netIncome = revenue.netIncome() + incomeTaxFree;

  if (netIncome > expenses) {
    savings = netIncome - expenses;
    cash += savings;
  }
  targetCash = adjust(params.emergencyStash);
  
  if (cash < targetCash) {
    cashDeficit = targetCash - cash;
  }

  let capitalPreWithdrawal = indexFunds.capital() + shares.capital();
    
  // If deficit, drawdown from where needed
  if (expenses > netIncome) {
    switch (phase) {
      case Phases.growth:
        withdraw(params.priorityCash, 0, params.priorityFunds, params.priorityShares);  // taken from user configuration, but without ability to withdraw from pension
        break;
      case Phases.retired:
        withdraw(params.priorityCash, params.priorityPension, params.priorityFunds, params.priorityShares);  // taken from user configuration
        break;
    }
  }

  if (capitalPreWithdrawal > 0) {
    withdrawalRate = (incomeFundsRent + incomeSharesRent) / capitalPreWithdrawal;
  } else {
    withdrawalRate = 0;
  }

  // If extra cash, invest
  let invested = 0;
  if (cash > targetCash + 0.001) {
    let surplus = cash - targetCash;
    indexFunds.buy(surplus * params.FundsAllocation);
    shares.buy(surplus * params.SharesAllocation);
    invested = surplus * (params.FundsAllocation + params.SharesAllocation);
    cash -= invested;
  }
  // Any remaining income should be used to top-up the emergency stash
  if ((netIncome > expenses + invested) && (targetCash - cash > 0.001)) {
    let addToStash = netIncome - (expenses + invested);
    cash += addToStash;
    expenses += addToStash;
  }

  if ((netIncome < expenses - 100) && success) {
    success = false;
    failedAt = age;
  }
}


// Get more money from: cash, pension, Index Funds, Shares, 
// in the specified order of priority:
// - fromX = 0 (don't use X)
// - fromX = 1 (use X first)
// - fromX = 2 (use X if first option not enough)
// - fromX = 3 (use X if first and second options not enough)
//
function withdraw(cashPriority, pensionPriority, FundsPriority, SharesPriority) {
  cashWithdraw = 0;
  let totalWithdraw = 0;
  let startNetIncome = revenue.netIncome();

  for (let priority = 1; priority <= 4; priority++) {
    while (expenses + cashDeficit - netIncome > 0.75) {
      let keepTrying = false;
      let needed = expenses + cashDeficit - netIncome;
      let indexFundsCapital = indexFunds.capital();
      let sharesCapital = shares.capital();
      let pensionCapital = pension.capital();
      //      if (option === 1) console.log("Need "+Math.round(needed)+" (netIncome="+Math.round(netIncome)+" < Expenses="+Math.round(expenses)+"). Funds: cash="+Math.round(cash)+" (deficit="+Math.round(cashDeficit)+") Funds="+Math.round(FundsCapital)+" Shares="+Math.round(SharesCapital)+" pension="+Math.round(pensionCapital));
      switch (priority) {
        case cashPriority:
          if (cash > 0) {
            cashWithdraw = Math.min(cash, needed);
            totalWithdraw += cashWithdraw;
            cash -= cashWithdraw;
            //            console.log("... Withdrawing "+Math.round(cashWithdraw)+" from cash savings");
          };
          break;
        case pensionPriority:
          if (pensionCapital > 0) {
            let withdraw = Math.min(pensionCapital, needed);
            totalWithdraw += withdraw;
            incomePrivatePension += pension.sell(withdraw);
            //            console.log("... Withdrawing "+Math.round(withdraw)+" from pension");
            keepTrying = true;
          }
          break;
        case FundsPriority:
          if (indexFundsCapital > 0) {
            let withdraw = Math.min(indexFundsCapital, needed);
            totalWithdraw += withdraw;
            incomeFundsRent += indexFunds.sell(withdraw);
            //            console.log("... Withdrawing "+Math.round(withdraw)+" from index funds");
            keepTrying = true;
          }
          break;
        case SharesPriority:
          if (sharesCapital > 0) {
            let withdraw = Math.min(sharesCapital, needed);
            totalWithdraw += withdraw;
            incomeSharesRent += shares.sell(withdraw);
            //            console.log("... Withdrawing "+Math.round(withdraw)+" from Shares");
            keepTrying = true;
          }
          break;
        default:
      }
      netIncome = cashWithdraw + revenue.netIncome();
      // console.log("netIncome: "+netIncome+"  delta: "+(netIncome-startNetIncome)+"  Withdraw: "+totalWithdraw);
      if (keepTrying == false) {
        break;
      }
    }
  }
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
          props.set(event.id,
            {
              "fromAge": event.fromAge,
              "property": realEstate.buy(event.id, event.amount, event.rate)
            });
        }
        break;
      case 'M':
        if (event.fromAge < params.startingAge) {
          props.set(event.id,
            {
              "fromAge": event.fromAge,
              "property": realEstate.mortgage(event.id, event.toAge - event.fromAge, event.rate, event.amount)
            });
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
  let FundsTax = (incomeFundsRent + incomeSharesRent + cashWithdraw > 0) ? revenue.cgt * incomeFundsRent / (incomeFundsRent + incomeSharesRent + cashWithdraw) : 0;
  let SharesTax = (incomeFundsRent + incomeSharesRent + cashWithdraw > 0) ? revenue.cgt * incomeSharesRent / (incomeFundsRent + incomeSharesRent + cashWithdraw) : 0;

  if (!(row in dataSheet)) {
    dataSheet[row] = { "age": 0, "year": 0, "incomeSalaries": 0, "incomeRSUs": 0, "incomeRentals": 0, "incomePrivatePension": 0, "incomeStatePension": 0, "incomeFundsRent": 0, "incomeSharesRent": 0, "incomeCash": 0, "realEstateCapital": 0, "netIncome": 0, "expenses": 0, "savings": 0, "pensionFund": 0, "cash": 0, "indexFundsCapital": 0, "sharesCapital": 0, "pensionContribution": 0, "withdrawalRate": 0, "it": 0, "prsi": 0, "usc": 0, "cgt": 0, "worth": 0 };
  }
  dataSheet[row].age += age;
  dataSheet[row].year += year;
  dataSheet[row].incomeSalaries += incomeSalaries;
  dataSheet[row].incomeRSUs += incomeShares;
  dataSheet[row].incomeRentals += incomeRentals;
  dataSheet[row].incomePrivatePension += incomePrivatePension + incomeDefinedBenefit;
  dataSheet[row].incomeStatePension += incomeStatePension;
  dataSheet[row].incomeFundsRent += Math.max(incomeFundsRent - FundsTax, 0);
  dataSheet[row].incomeSharesRent += Math.max(incomeSharesRent - SharesTax, 0);
  dataSheet[row].incomeCash += Math.max(cashWithdraw, 0) + incomeTaxFree;
  dataSheet[row].realEstateCapital += realEstate.getTotalValue();
  dataSheet[row].netIncome += netIncome;
  dataSheet[row].expenses += expenses;
  dataSheet[row].savings += savings;
  dataSheet[row].pensionFund += pension.capital();
  dataSheet[row].cash += cash;
  dataSheet[row].indexFundsCapital += indexFunds.capital();
  dataSheet[row].sharesCapital += shares.capital();
  dataSheet[row].pensionContribution += pensionContribution;
  dataSheet[row].withdrawalRate += withdrawalRate;
  dataSheet[row].it += revenue.it;
  dataSheet[row].prsi += revenue.prsi;
  dataSheet[row].usc += revenue.usc;
  dataSheet[row].cgt += revenue.cgt;
  dataSheet[row].worth += realEstate.getTotalValue() + pension.capital() + indexFunds.capital() + shares.capital() + cash;

  if (!montecarlo) {
    uiManager.updateDataRow(row, (age-params.startingAge) / (100-params.startingAge));
  }
}

