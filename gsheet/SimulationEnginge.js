
function initializeSimulationVariables() {
  revenue.reset();
  pension = new Pension(params.growthRatePension, params.growthDevPension);
  etf = new ETF(params.growthRateETF, params.growthDevETF);
  trust = new InvestmentTrust(params.growthRateTrust, params.growthDevTrust);
  if (params.initialPension > 0) pension.buy(params.initialPension);
  if (params.initialETFs > 0) etf.buy(params.initialETFs);
  if (params.initialTrusts > 0) trust.buy(params.initialTrusts);

  periods = 0;
  success = true;
  stockGrowthOverride = undefined;

  initializeRealEstate();

  age = params.startingAge - 1;
  year = new Date().getFullYear() - 1;
  phase = Phases.growth;
  cash = params.initialSavings;
  failedAt = 0
  row = 0;
}

function simulateYear() {
  row++;
  year++;
  age++;
  periods = row - 1;

  resetYearlyVariables();
  calculateIncome();
  calculateExpenses();
  handleInvestments();
  updateYearlyData();
    
  if (!montecarlo) {
    updateDataRow(row, (age-params.startingAge) / (100-params.startingAge));
  }
}

function resetYearlyVariables() {
  // Reset yearly variables here
  incomeSalaries = 0;
  incomeShares = 0;
  incomeRentals = 0;
  incomePrivatePension = 0;
  incomeStatePension = 0;
  incomeDefinedBenefit = 0;
  incomeEtfRent = 0;
  incomeTrustRent = 0;
  incomeTaxFree = 0;
  pensionContribution = 0;
  withdrawalRate = 0;
  cashDeficit = 0;
  cashWithdraw = 0;
  savings = 0;

  revenue.reset();
  etf.addYear();
  trust.addYear();
  pension.addYear();
  realEstate.addYear();
}

function runSimulation() {
  initializeSimulationVariables();

  while (age < 100) {

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

    if (!montecarlo) {
      updateDataRow(row, (age-params.startingAge) / (100-params.startingAge));
    }  
  }

  function calculatePensionIncome() {
    // Private Pension
    if (age === params.retirementAge) {
      cash += pension.getLumpsum();
      phase = Phases.lumpSum;
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
      switch (event.type) {
        case "NOP": // No Operation
          break;
        case 'RI': // Rental income
          if (age >= event.fromAge && age <= event.toAge && amount > 0) {
            incomeRentals += amount;
            revenue.declareOtherIncome(amount);
          }
          break;
        case 'SI': // Salary income (with private pension contribution if so defined)
          if (age >= event.fromAge && age <= event.toAge && amount > 0) {
            incomeSalaries += amount;
            let contribRate = params.pensionPercentage * ((age < 30) ? 0.15 : (age < 40) ? 0.20 : (age < 50) ? 0.25 : (age < 55) ? 0.30 : (age < 60) ? 0.35 : 0.40);
            if (params.pensionCapped && (amount > adjust(config.pensionContribEarningLimit))) {
              contribRate = contribRate * adjust(config.pensionContribEarningLimit) / amount;
            }
            let companyMatch = Math.min(event.extra, contribRate);
            let personalContrib = contribRate * amount;
            let companyContrib = companyMatch * amount;
            let totalContrib = personalContrib + companyContrib;
            pensionContribution += totalContrib;
            pension.buy(totalContrib);
            revenue.declareSalaryIncome(amount, contribRate);
          }
          break;
        case 'SInp': // Salary income (with no private pension contribution)
          if (age >= event.fromAge && age <= event.toAge && amount > 0) {
            incomeSalaries += amount;
            revenue.declareSalaryIncome(amount, 0);
          }
          break;
        case 'UI': // RSU income
          if (age >= event.fromAge && age <= event.toAge && amount > 0) {
            incomeShares += amount;
            revenue.declareNonEuSharesIncome(amount);
          }
          break;
        case 'DBI': // Defined Benefit Pension Income
          if (age >= event.fromAge && age <= event.toAge && amount > 0) {
            incomeDefinedBenefit += amount;
            revenue.declareSalaryIncome(amount, 0);
          }
          break;
        case 'FI': // Tax-free income
          if (age >= event.fromAge && age <= event.toAge && amount > 0) {
            incomeTaxFree += amount;
          }
          break;
        case 'E': // Expenses
          if (age >= event.fromAge && age <= event.toAge) {
            expenses += amount;
          }
          break;
        case 'M': // Mortgage
          if (age == event.fromAge) {
            realEstate.mortgage(event.id, event.toAge - event.fromAge, event.rate, amount);
            //            console.log("Borrowed "+Math.round(realEstate.properties[event.id].borrowed)+" on a "+(event.toAge - event.fromAge)+"-year "+(event.rate*100)+"% mortgage for property ["+event.id+"] paying "+Math.round(amount)+"/year");
          }
          if (age >= event.fromAge && age < event.toAge) {
            expenses += realEstate.getPayment(event.id); // not adjusted once mortgage starts, assuming fixed rate
            //            console.log("Mortgage payment "+realEstate.getPayment(event.id)+" for property ["+event.id+"] ("+(realEstate.properties[event.id].paymentsMade+1)+" of "+realEstate.properties[event.id].terms+")");
          }
          break;
        case 'R': // Real estate
          // purchase
          if (age === event.fromAge) {
            realEstate.buy(event.id, amount, event.rate);
            expenses += amount;
            //            console.log("Buy property ["+event.id+"] with "+Math.round(amount)+"  downpayment (valued "+Math.round(realEstate.getValue(event.id))+")");            
          }
          // sale
          if (age === event.toAge) {
            //            console.log("Sell property ["+event.id+"] for "+Math.round(realEstate.getValue(event.id)));            
            cash += realEstate.sell(event.id)
          }
          break;
        case 'SM': // Stock Market Growth override to simulate a crash or a bubble (only the growth part of the bubble)
          if (age == event.fromAge) {
            stockGrowthOverride = event.amount / (event.toAge - event.fromAge);
          }
          if (age === event.toAge) {
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
    if ((phase == Phases.lumpSum) && (cash < targetCash) && (age >= params.retirementAge)) {
      phase = Phases.retired;
    }
    if (cash < targetCash) {
      cashDeficit = targetCash - cash;
    }

    let capitalPreWithdrawal = etf.capital() + trust.capital();
    // If deficit, drawdown from where needed
    if (expenses > netIncome) {
      switch (phase) {
        case Phases.growth:
          withdraw(1, 0, 2, 3); // cash -> etf -> trust
          break;
        case Phases.lumpSum:
          withdraw(1, 4, 2, 3); // cash -> etf -> trust -> pension
          break;
        case Phases.retired:
          withdraw(params.priorityCash, params.priorityPension, params.priorityEtf, params.priorityTrust);  // taken from user configuration
          break;
      }
    }
    if (capitalPreWithdrawal > 0) {
      withdrawalRate = (incomeEtfRent + incomeTrustRent) / capitalPreWithdrawal;
    } else {
      withdrawalRate = 0;
    }

    // If extra cash, invest
    let invested = 0;
    if ((cash > targetCash + 0.001) && (incomeSalaries > 0)) {
      let surplus = cash - targetCash;
      etf.buy(surplus * params.etfAllocation);
      trust.buy(surplus * params.trustAllocation);
      invested = surplus * (params.etfAllocation + params.trustAllocation);
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

  function updateYearlyData() {
    // This is used below to hide the deemed disposal tax payments, otherwise they're shown as income.
    let etfTax = (incomeEtfRent + incomeTrustRent + cashWithdraw > 0) ? revenue.cgt * incomeEtfRent / (incomeEtfRent + incomeTrustRent + cashWithdraw) : 0;
    let trustTax = (incomeEtfRent + incomeTrustRent + cashWithdraw > 0) ? revenue.cgt * incomeTrustRent / (incomeEtfRent + incomeTrustRent + cashWithdraw) : 0;

    if (!(row in dataSheet)) {
      dataSheet[row] = { "age": 0, "year": 0, "incomeSalaries": 0, "incomeRSUs": 0, "incomeRentals": 0, "incomePrivatePension": 0, "incomeStatePension": 0, "incomeEtfRent": 0, "incomeTrustRent": 0, "incomeCash": 0, "realEstateCapital": 0, "netIncome": 0, "expenses": 0, "savings": 0, "pensionFund": 0, "cash": 0, "etfCapital": 0, "trustCapital": 0, "pensionContribution": 0, "withdrawalRate": 0, "it": 0, "prsi": 0, "usc": 0, "cgt": 0, "worth": 0 };
    }
    dataSheet[row].age += age;
    dataSheet[row].year += year;
    dataSheet[row].incomeSalaries += incomeSalaries;
    dataSheet[row].incomeRSUs += incomeShares;
    dataSheet[row].incomeRentals += incomeRentals;
    dataSheet[row].incomePrivatePension += incomePrivatePension + incomeDefinedBenefit;
    dataSheet[row].incomeStatePension += incomeStatePension;
    dataSheet[row].incomeEtfRent += Math.max(incomeEtfRent - etfTax, 0);
    dataSheet[row].incomeTrustRent += Math.max(incomeTrustRent - trustTax, 0);
    dataSheet[row].incomeCash += Math.max(cashWithdraw, 0) + incomeTaxFree;
    dataSheet[row].realEstateCapital += realEstate.getTotalValue();
    dataSheet[row].netIncome += netIncome;
    dataSheet[row].expenses += expenses;
    dataSheet[row].savings += savings;
    dataSheet[row].pensionFund += pension.capital();
    dataSheet[row].cash += cash;
    dataSheet[row].etfCapital += etf.capital();
    dataSheet[row].trustCapital += trust.capital();
    dataSheet[row].pensionContribution += pensionContribution;
    dataSheet[row].withdrawalRate += withdrawalRate;
    dataSheet[row].it += revenue.it;
    dataSheet[row].prsi += revenue.prsi;
    dataSheet[row].usc += revenue.usc;
    dataSheet[row].cgt += revenue.cgt;
    dataSheet[row].worth += realEstate.getTotalValue() + pension.capital() + etf.capital() + trust.capital() + cash;

    if (!montecarlo) {
      updateDataRow(row, (age-params.startingAge) / (100-params.startingAge));
    }
  }
  return (success || (failedAt > params.targetAge));
}
