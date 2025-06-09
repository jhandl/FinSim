/* This file has to work on both the website and Google Sheets */

var uiManager, params, events, config, dataSheet, row, errors;
var year, periods, failedAt, success, montecarlo;
var revenue, realEstate, stockGrowthOverride;
var netIncome, expenses, savings, targetCash, cashWithdraw, cashDeficit;
var incomeStatePension, incomePrivatePension, incomeFundsRent, incomeSharesRent, withdrawalRate;
var incomeSalaries, incomeShares, incomeRentals, incomeDefinedBenefit, incomeTaxFree, pensionContribution;
var cash, indexFunds, shares;
var person1, person2;

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
  // Initialize investment instruments
  indexFunds = new IndexFunds(params.growthRateFunds, params.growthDevFunds);
  shares = new Shares(params.growthRateShares, params.growthDevShares);
  if (params.initialFunds > 0) indexFunds.buy(params.initialFunds);
  if (params.initialShares > 0) shares.buy(params.initialShares);

  // Initialize Person 1 (P1)
  const p1SpecificParams = {
    startingAge: params.startingAge,
    retirementAge: params.retirementAge,
    statePensionWeekly: params.statePensionWeekly,
    pensionContributionPercentage: params.pensionPercentage
  };
  person1 = new Person('P1', p1SpecificParams, params, { 
    growthRatePension: params.growthRatePension, 
    growthDevPension: params.growthDevPension 
  });
  if (params.initialPension > 0) person1.pension.buy(params.initialPension);

  // Initialize Person 2 (P2) if exists
  if (params.p2StartingAge) {
    const p2PensionContribPercentage = params.pensionPercentageP2 || params.pensionPercentage;
    const p2SpecificParams = {
      startingAge: params.p2StartingAge,
      retirementAge: params.p2RetirementAge,
      statePensionWeekly: params.p2StatePensionWeekly,
      pensionContributionPercentage: p2PensionContribPercentage
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

  initializeRealEstate();

  year = new Date().getFullYear() - 1;
  cash = params.initialSavings;
  failedAt = 0;
  row = 0;
}

function resetYearlyVariables() {
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
  withdrawalRate = 0;
  cashDeficit = 0;
  cashWithdraw = 0;
  savings = 0;

  // Add year to Person objects (this increments their ages and calls pension.addYear())
  person1.addYear();
  if (person2) person2.addYear();
  
  // Increment global year
  year++;

  // Pass Person objects to revenue reset (now using updated ages and year)
  revenue.reset(person1, person2);
  
  // Add year to global investment objects
  indexFunds.addYear();
  shares.addYear();
  realEstate.addYear();
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
  const p1CalcResults = person1.calculateYearlyPensionIncome(config);
  if (p1CalcResults.lumpSumAmount > 0) {
    cash += p1CalcResults.lumpSumAmount;
    revenue.declarePrivatePensionLumpSum(p1CalcResults.lumpSumAmount);
  }
  incomePrivatePension += person1.yearlyIncomePrivatePension;
  incomeStatePension += person1.yearlyIncomeStatePension;

  // Calculate pension income for Person 2 (if exists)
  if (person2) {
    const p2CalcResults = person2.calculateYearlyPensionIncome(config);
    if (p2CalcResults.lumpSumAmount > 0) {
      cash += p2CalcResults.lumpSumAmount;
      revenue.declarePrivatePensionLumpSum(p2CalcResults.lumpSumAmount);
    }
    incomePrivatePension += person2.yearlyIncomePrivatePension;
    incomeStatePension += person2.yearlyIncomeStatePension;
  }

  // Declare total state pension to revenue
  revenue.declareStatePensionIncome(incomeStatePension);
}

function processEvents() {
  expenses = 0;
  
  // First pass: Process all real estate sales for the current age
  for (let i = 0; i < events.length; i++) {
    let event = events[i];
    if (event.type === 'R' && event.toAge && person1.age === event.toAge) {
      // console.log("Sell property ["+event.id+"] for "+Math.round(realEstate.getValue(event.id)));            
      cash += realEstate.sell(event.id);
    }
  }
  
  // Second pass: Process all other events including real estate purchases
  for (let i = 0; i < events.length; i++) {
    let event = events[i];
    let amount = adjust(event.amount, event.rate);
    // Default toAge to 999 if not required for this event type
    let inScope = (person1.age >= event.fromAge && person1.age <= (event.toAge || 999));

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
          let contribRate = person1.pensionContributionPercentageParam * getRateForKey(person1.age, config.pensionContributionRateBands);
          if (params.pensionCapped && (amount > adjust(config.pensionContribEarningLimit))) {
            contribRate = contribRate * adjust(config.pensionContribEarningLimit) / amount;
          }
          let companyMatch = Math.min(event.match || 0, contribRate);
          let personalContrib = contribRate * amount;
          let companyContrib = companyMatch * amount;
          let totalContrib = personalContrib + companyContrib;
          pensionContribution += totalContrib;
          person1.pension.buy(totalContrib);
          revenue.declareSalaryIncome(amount, contribRate, person1.age);
        }
        break;

      case 'SInp': // Salary income (Partner/Person 2)
        if (inScope) {
          incomeSalaries += amount;
          if (person2) {
            let contribRate = person2.pensionContributionPercentageParam * getRateForKey(person2.age, config.pensionContributionRateBands);
            if (params.pensionCapped && (amount > adjust(config.pensionContribEarningLimit))) {
              contribRate = contribRate * adjust(config.pensionContribEarningLimit) / amount;
            }
            let companyMatch = Math.min(event.match || 0, contribRate);
            let personalContrib = contribRate * amount;
            let companyContrib = companyMatch * amount;
            let totalContrib = personalContrib + companyContrib;
            pensionContribution += totalContrib;
            person2.pension.buy(totalContrib);
            revenue.declareSalaryIncome(amount, contribRate, person2.age);
          } else {
            // SInp event but no Person 2 defined - treat as salary with no pension for P1
            revenue.declareSalaryIncome(amount, 0, person1.age);
          }
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
        if (person1.age == event.fromAge) {
          realEstate.mortgage(event.id, event.toAge - event.fromAge, event.rate, event.amount);
          //            console.log("Borrowed "+Math.round(realEstate.properties[event.id].borrowed)+" on a "+(event.toAge - event.fromAge)+"-year "+(event.rate*100)+"% mortgage for property ["+event.id+"] paying "+Math.round(amount)+"/year");
        }
        if (inScope) {
          expenses += realEstate.getPayment(event.id); // not adjusted once mortgage starts, assuming fixed rate
          //            console.log("Mortgage payment "+realEstate.getPayment(event.id)+" for property ["+event.id+"] ("+(realEstate.properties[event.id].paymentsMade)+" of "+realEstate.properties[event.id].terms+")");
        }
        break;

      case 'R': // Real estate
        // purchase only (sales were handled in first pass)
        if (person1.age === event.fromAge) {
          realEstate.buy(event.id, amount, event.rate);
          // Use available cash first, only add remainder to expenses
          let cashUsed = Math.min(cash, amount);
          cash -= cashUsed;
          let remainingExpense = amount - cashUsed;
          expenses += remainingExpense;
          //            console.log("Buy property ["+event.id+"] with "+Math.round(amount)+" downpayment (used "+Math.round(cashUsed)+" cash, "+Math.round(remainingExpense)+" added to expenses) (valued "+Math.round(realEstate.getValue(event.id))+")");
        }
        // Note: sales are now handled in the first pass above to ensure sale proceeds are available before purchases
        break;

      case 'SM': // Stock Market Growth override to simulate bull or bear markets
        if (person1.age == event.fromAge) {
          stockGrowthOverride = Math.pow(1 + event.rate, 1 / (event.toAge - event.fromAge + 1)) - 1;
        }
        if (person1.age === event.toAge + 1) {
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
    switch (person1.phase) {
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
    failedAt = person1.age;
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
      if (loopCount > 50) {
        break;
      }
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
          };
          break;
        case pensionPriority:
          // Try Person 1 pension first if retired or at retirement age
          if (person1PensionCapital > 0.5 && (person1.phase === Phases.retired || person1.age >= person1.retirementAgeParam)) {
            let withdraw = Math.min(person1PensionCapital, needed);
            totalWithdraw += withdraw;
            incomePrivatePension += person1.pension.sell(withdraw);
            keepTrying = true;
          }
          // If still need more and Person 2 exists, try Person 2 pension
          else if (person2PensionCapital > 0.5 && person2 && (person2.phase === Phases.retired || person2.age >= person2.retirementAgeParam)) {
            let withdraw = Math.min(person2PensionCapital, needed);
            totalWithdraw += withdraw;
            incomePrivatePension += person2.pension.sell(withdraw);
            keepTrying = true;
          }
          break;
        case FundsPriority:
          if (indexFundsCapital > 0.5) {
            let withdraw = Math.min(indexFundsCapital, needed);
            totalWithdraw += withdraw;
            incomeFundsRent += indexFunds.sell(withdraw);
            keepTrying = true;
          }
          break;
        case SharesPriority:
          if (sharesCapital > 0.5) {
            let withdraw = Math.min(sharesCapital, needed);
            totalWithdraw += withdraw;
            incomeSharesRent += shares.sell(withdraw);
            keepTrying = true;
          }
          break;
        default:
      }
      netIncome = cashWithdraw + revenue.netIncome();
      if (keepTrying == false) {
        break;
      }
    }
  }
}

function liquidateAll() {
  cashWithdraw = cash;
  cash = 0;
  if (person1.pension.capital() > 0) {
    incomePrivatePension += person1.pension.sell(person1.pension.capital());
  }
  if (person2 && person2.pension.capital() > 0) {
    incomePrivatePension += person2.pension.sell(person2.pension.capital());
  }
  if (indexFunds.capital() > 0) {
    incomeFundsRent += indexFunds.sell(indexFunds.capital());
  }
  if (shares.capital() > 0) {
    incomeSharesRent += shares.sell(shares.capital());
  }
  netIncome = cashWithdraw + revenue.netIncome();
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
          props.get(event.id).property = realEstate.buy(event.id, event.amount, event.rate);
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
          props.get(event.id).property = realEstate.mortgage(event.id, event.toAge - event.fromAge, event.rate, event.amount);
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
  dataSheet[row].age += person1.age;
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
  dataSheet[row].pensionFund += person1.pension.capital() + (person2 ? person2.pension.capital() : 0);
  dataSheet[row].cash += cash;
  dataSheet[row].indexFundsCapital += indexFunds.capital();
  dataSheet[row].sharesCapital += shares.capital();
  dataSheet[row].pensionContribution += pensionContribution;
  dataSheet[row].withdrawalRate += withdrawalRate;
  dataSheet[row].it += revenue.it;
  dataSheet[row].prsi += revenue.prsi;
  dataSheet[row].usc += revenue.usc;
  dataSheet[row].cgt += revenue.cgt;
  dataSheet[row].worth += realEstate.getTotalValue() + person1.pension.capital() + (person2 ? person2.pension.capital() : 0) + indexFunds.capital() + shares.capital() + cash;

  if (!montecarlo) {
    uiManager.updateDataRow(row, (person1.age-params.startingAge) / (100-params.startingAge));
  }
}

