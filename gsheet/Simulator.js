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


