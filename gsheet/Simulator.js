var age, year, phase, periods, row, failedAt, success, montecarlo;
var revenue, realEstate, stockGrowthOverride;
var netIncome, expenses, savings, targetCash, cashWithdraw, cashDeficit;
var incomeStatePension, incomePrivatePension, incomeEtfRent, incomeTrustRent, withdrawalRate;
var cash, etf, trust, pension;
var Events, Year, Age, IncomeSalaries, IncomeRSUs, IncomeRentals, IncomePrivatePension;
var IncomeStatePension, IncomeEtfRent, IncomeTrustRent, IncomeCash, IT, PRSI, USC, CGT;
var NetIncome, Expenses, Savings, PensionContribution, Cash, RealEstateCapital, EtfCapital;
var TrustCapital, PensionFund, Worth;

const Phases = {
  growth: 'growth',
  lumpSum: 'lumpSum',
  retired: 'retired'
}

function run() {
  if (!initializeSimulator()) return;

  montecarlo = (params.growthDevPension > 0 || params.growthDevETF > 0 || params.growthDevTrust > 0);
  let runs = (montecarlo ? config.simulationRuns : 1);
  let successes = 0;

  updateProgress("Running");

  for (let run = 0; run < runs; run++) {
    successes += runSimulation(); 
  }

  updateDataSheet(runs);
  updateStatusCell(successes, runs);
}



// Get more money from: cash, pension, etfs, trusts, 
// in the specified order of priority:
// - fromX = 0 (don't use X)
// - fromX = 1 (use X first)
// - fromX = 2 (use X if first option not enough)
// - fromX = 3 (use X if first and second options not enough)
//
function withdraw(cashPriority, pensionPriority, etfPriority, trustPriority) {
  cashWithdraw = 0;
  let totalWithdraw = 0;
  let startNetIncome = revenue.netIncome();

  for (let priority = 1; priority <= 4; priority++) {
    while (expenses + cashDeficit - netIncome > 0.75) {
      let keepTrying = false;
      let needed = expenses + cashDeficit - netIncome;
      let etfCapital = etf.capital();
      let trustCapital = trust.capital();
      let pensionCapital = pension.capital();
      //      if (option === 1) console.log("Need "+Math.round(needed)+" (netIncome="+Math.round(netIncome)+" < Expenses="+Math.round(expenses)+"). Funds: cash="+Math.round(cash)+" (deficit="+Math.round(cashDeficit)+") etf="+Math.round(etfCapital)+" trust="+Math.round(trustCapital)+" pension="+Math.round(pensionCapital));
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
        case etfPriority:
          if (etfCapital > 0) {
            let withdraw = Math.min(etfCapital, needed);
            totalWithdraw += withdraw;
            incomeEtfRent += etf.sell(withdraw);
            //            console.log("... Withdrawing "+Math.round(withdraw)+" from etf");
            keepTrying = true;
          }
          break;
        case trustPriority:
          if (trustCapital > 0) {
            let withdraw = Math.min(trustCapital, needed);
            totalWithdraw += withdraw;
            incomeTrustRent += trust.sell(withdraw);
            //            console.log("... Withdrawing "+Math.round(withdraw)+" from trust");
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


function initializeSimulator() {
  config = new Config();
  revenue = new Revenue();
  errors = false;
  readParameters();
  readEvents();
  if (errors) {
    statusCell.setValue("Check errors");
    statusCell.setBackground("#ffe066");
  }
  dataSheet = [];
  return !errors;
}

