
const STATUS_COLORS = {
  ERROR: "#ff8080",
  WARNING: "#ffe066",
  SUCCESS: "#9fdf9f",
  NEUTRAL: "#E0E0E0",
  WHITE: "#FFFFFF"
};

function updateDataSheet(runs) {
  if (montecarlo) {   
    for (let i = 1; i <= row; i++) {
      updateDataRow(i, i/row, runs);
    }
  }
  let dataTab = spreadsheet.getSheetByName("Data");
  dataTab.getRange(Year.getRow() + row, Year.getColumn(), 100, Worth.getColumn() - Year.getColumn() + 1).clearContent();
}

function updateProgress(msg) {
  statusCell.setValue(msg);
  SpreadsheetApp.flush();
}

function updateStatusCell(successes, runs) {
  if (montecarlo) {
    let percentSuccess = successes / runs;
    let msg = `Success ${(percentSuccess * 100).toFixed(1)}%`;
    statusCell.setValue(msg);
    let r = between(255, 160, percentSuccess);
    let g = between(128, 255, percentSuccess);
    let b = between(128, 160, percentSuccess);
    statusCell.setBackground(rgbToHex(r, g, b));
  } else {
    if (success || failedAt > params.targetAge) {
      statusCell.setValue(success ? "Success!" : "Made it to " + failedAt);
      statusCell.setBackground(STATUS_COLORS.SUCCESS);
    } else {
      statusCell.setValue("Failed at age " + failedAt);
      statusCell.setBackground(STATUS_COLORS.ERROR);
    }
  }
  SpreadsheetApp.flush();
}

function updateDataRow(row, progress, scale = 1) {
  Age.getCell(row, 1).setValue(dataSheet[row].age / scale);
  Year.getCell(row, 1).setValue(dataSheet[row].year / scale);
  IncomeSalaries.getCell(row, 1).setValue(dataSheet[row].incomeSalaries / scale);
  IncomeRSUs.getCell(row, 1).setValue(dataSheet[row].incomeRSUs / scale);
  IncomeRentals.getCell(row, 1).setValue(dataSheet[row].incomeRentals / scale);
  IncomePrivatePension.getCell(row, 1).setValue(dataSheet[row].incomePrivatePension / scale);
  IncomeStatePension.getCell(row, 1).setValue(dataSheet[row].incomeStatePension / scale);
  IncomeEtfRent.getCell(row, 1).setValue(dataSheet[row].incomeEtfRent / scale);
  IncomeTrustRent.getCell(row, 1).setValue(dataSheet[row].incomeTrustRent / scale);
  IncomeCash.getCell(row, 1).setValue(dataSheet[row].incomeCash / scale);
  RealEstateCapital.getCell(row, 1).setValue(dataSheet[row].realEstateCapital / scale);
  NetIncome.getCell(row, 1).setValue(dataSheet[row].netIncome / scale);
  Expenses.getCell(row, 1).setValue(dataSheet[row].expenses / scale);
  Savings.getCell(row, 1).setValue(dataSheet[row].savings / scale);
  PensionFund.getCell(row, 1).setValue(dataSheet[row].pensionFund / scale);
  Cash.getCell(row, 1).setValue(dataSheet[row].cash / scale);
  EtfCapital.getCell(row, 1).setValue(dataSheet[row].etfCapital / scale);
  TrustCapital.getCell(row, 1).setValue(dataSheet[row].trustCapital / scale);
  PensionContribution.getCell(row, 1).setValue(dataSheet[row].pensionContribution / scale);
  WithdrawalRate.getCell(row, 1).setValue(dataSheet[row].withdrawalRate / scale);
  IT.getCell(row, 1).setValue(dataSheet[row].it / scale);
  PRSI.getCell(row, 1).setValue(dataSheet[row].prsi / scale);
  USC.getCell(row, 1).setValue(dataSheet[row].usc / scale);
  CGT.getCell(row, 1).setValue(dataSheet[row].cgt / scale);
  Worth.getCell(row, 1).setValue(dataSheet[row].worth / scale);
  if (row % 5 === 0) {
    updateProgress("Updating "+Math.round(100 * progress) + "%");
  }
}


function readRanges() {
  Events = spreadsheet.getRangeByName("Events");
  Year = spreadsheet.getRangeByName("Year");
  Age = spreadsheet.getRangeByName("Age");
  IncomeSalaries = spreadsheet.getRangeByName("Salary");
  IncomeRSUs = spreadsheet.getRangeByName("RSUs");
  IncomeRentals = spreadsheet.getRangeByName("Rental");
  IncomePrivatePension = spreadsheet.getRangeByName("PrivatePension");
  IncomeStatePension = spreadsheet.getRangeByName("StatePension");
  IncomeEtfRent = spreadsheet.getRangeByName("EtfRent");
  IncomeTrustRent = spreadsheet.getRangeByName("TrustRent");
  IncomeCash = spreadsheet.getRangeByName("IncomeCash");
  IT = spreadsheet.getRangeByName("IT");
  PRSI = spreadsheet.getRangeByName("PRSI");
  USC = spreadsheet.getRangeByName("USC");
  CGT = spreadsheet.getRangeByName("CGT");
  NetIncome = spreadsheet.getRangeByName("NetIncome");
  Expenses = spreadsheet.getRangeByName("Expenses");
  Savings = spreadsheet.getRangeByName("Savings");
  PensionContribution = spreadsheet.getRangeByName("PensionContribution");
  WithdrawalRate = spreadsheet.getRangeByName("WithdrawalRate");
  Cash = spreadsheet.getRangeByName("Cash");
  RealEstateCapital = spreadsheet.getRangeByName("RealEstate");
  EtfCapital = spreadsheet.getRangeByName("EtfCapital");
  TrustCapital = spreadsheet.getRangeByName("TrustCapital");
  PensionFund = spreadsheet.getRangeByName("PensionFund");
  Worth = spreadsheet.getRangeByName("Worth");
}

function readParameters() {
  spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  statusCell = spreadsheet.getRangeByName("Progress").getCell(1, 1);
  statusCell.setBackground(STATUS_COLORS.NEUTRAL);
  updateProgress("Initializing");
  
  readRanges();

  params = {
    startingAge: spreadsheet.getRangeByName("StartingAge").getValue(),
    targetAge: spreadsheet.getRangeByName("TargetAge").getValue(),
    initialSavings: spreadsheet.getRangeByName("InitialSavings").getValue(),
    initialPension: spreadsheet.getRangeByName("InitialPension").getValue(),
    initialETFs: spreadsheet.getRangeByName("InitialETFs").getValue(),
    initialTrusts: spreadsheet.getRangeByName("InitialTrusts").getValue(),
    retirementAge: spreadsheet.getRangeByName("RetirementAge").getValue(),
    emergencyStash: spreadsheet.getRangeByName("EmergencyStash").getValue(),
    pensionPercentage: spreadsheet.getRangeByName("PensionContributionPercentage").getValue(),
    pensionCapped: (spreadsheet.getRangeByName("PensionContributionCapped").getValue() === "Yes"),
    statePensionWeekly: spreadsheet.getRangeByName("StatePensionWeekly").getValue(),
    growthRatePension: spreadsheet.getRangeByName("PensionGrowthRate").getValue(),
    growthDevPension: spreadsheet.getRangeByName("PensionGrowthStdDev").getValue(),
    growthRateETF: spreadsheet.getRangeByName("EtfGrowthRate").getValue(),
    growthDevETF: spreadsheet.getRangeByName("EtfGrowthStdDev").getValue(),
    growthRateTrust: spreadsheet.getRangeByName("TrustGrowthRate").getValue(),
    growthDevTrust: spreadsheet.getRangeByName("TrustGrowthStdDev").getValue(),
    inflation: spreadsheet.getRangeByName("Inflation").getValue(),
    etfAllocation: spreadsheet.getRangeByName("EtfAllocation").getValue(),
    trustAllocation: spreadsheet.getRangeByName("TrustAllocation").getValue(),
    priorityCash: spreadsheet.getRangeByName("Priorities").getCell(1, 2).getValue(),
    priorityPension: spreadsheet.getRangeByName("Priorities").getCell(2, 2).getValue(),
    priorityEtf: spreadsheet.getRangeByName("Priorities").getCell(3, 2).getValue(),
    priorityTrust: spreadsheet.getRangeByName("Priorities").getCell(4, 2).getValue(),
    incomeTaxBracket: spreadsheet.getRangeByName("IncomeTaxBracket").getValue(),
    personalTaxCredit: spreadsheet.getRangeByName("PersonalTaxCredit").getValue()
  };
  spreadsheet.getRangeByName("Parameters").setBackground(STATUS_COLORS.WHITE);
  spreadsheet.getRangeByName("Parameters").clearNote();

  if (params.retirementAge < config.minOccupationalPensionRetirementAge) {
    spreadsheet.getRangeByName("RetirementAge").setNote("Warning: Only occupational pension schemes allow retirement before age 60.");
  }
  if (params.retirementAge < config.minPrivatePensionRetirementAge) {
    spreadsheet.getRangeByName("RetirementAge").setNote("Warning: Private pensions don't normally allow retirement before age 50.");
  }

  if (params.etfAllocation + params.trustAllocation > 1) {
    spreadsheet.getRangeByName("EtfAllocation").setBackground(STATUS_COLORS.WARNING);
    spreadsheet.getRangeByName("TrustAllocation").setBackground(STATUS_COLORS.WARNING);
    spreadsheet.getRangeByName("EtfAllocation").setNote("ETF + Trust allocations can't exceed 100%");
    errors = true;
  }
}

// Read events from the parameters sheet
function readEvents() {
  events = [];
  Events.setBackground(STATUS_COLORS.WHITE);
  Events.clearNote();
  for (let i = 1; i <= Events.getHeight(); i++) {
    let name = Events.getCell(i, 1).getValue();
    let pos = name.indexOf(":");
    if (pos < 0) {
      if (name === "") break;
      Events.getCell(i, 1).setNote("Invalid event format: missing colon.");
      Events.getCell(i, 1).setBackground(STATUS_COLORS.WARNING);
      errors = true;
      break;
    }
    let type = name.substr(0, pos);
    let valid = { "NOP": "Non-operation: way to make the simulation ignore an event without needing to remove the line", "RI": "Rental Income", "SI": "Salary Income (with private pension contribution if so defined)", "SInp": "Salary Income (no private pension contribution)", "UI": "RSU Income", "DBI" : "Defined Benefit Pension Income", "FI" : "Tax-free Income", "E": "Expense", "R": "Real Estate", "M": "Mortgage", "SM": "Stock Market" };
    if (!valid.hasOwnProperty(type)) {
      Events.getCell(i, 1).setNote("Invalid event type. Valid types are: " + Object.keys(valid).map(key => { return key + " (" + valid[key] + ")" }).join(", "));
      Events.getCell(i, 1).setBackground("#ffe066");
      errors = true;
      break;
    }
    let id = name.substr(pos + 1);
    let amount = Events.getCell(i, 2).isBlank() ? 0 : Events.getCell(i, 2).getValue();
    let fromAge = Events.getCell(i, 3).isBlank() ? 0 : Events.getCell(i, 3).getValue();
    let toAge = Events.getCell(i, 4).isBlank() ? 999 : Events.getCell(i, 4).getValue();
    let rate = Events.getCell(i, 5).isBlank() ? undefined : Events.getCell(i, 5).getValue();
    let extra = Events.getCell(i, 6).isBlank() ? 0 : Events.getCell(i, 6).getValue();
    events.push(new Event(type, id, amount, fromAge, toAge, rate, extra));
  }

  // Validate that mortgage events have their corresponding purchase event
  for (let m = 0; m < events.length; m++) {
    if (events[m].type === 'M') {
      let found = false;
      for (let p = 0; p < events.length; p++) {
        if (events[p].type === 'R' && events[p].id === events[m].id) {
          found = true;
          if (events[p].fromAge !== events[m].fromAge) {
            Events.getCell(m + 1, 3).setNote("The mortgage (M) and purchase (R) events for a property should have the same starting age.");
            Events.getCell(m + 1, 3).setBackground(STATUS_COLORS.WARNING);
            Events.getCell(p + 1, 3).setBackground(STATUS_COLORS.WARNING);
            errors = true;
            continue;
          }
          if (events[m].toAge > events[p].toAge) {
            Events.getCell(m + 1, 4).setNote("The mortgage should not continure after the property is sold.");
            Events.getCell(m + 1, 4).setBackground(STATUS_COLORS.WARNING);
            Events.getCell(p + 1, 4).setBackground(STATUS_COLORS.WARNING);
            errors = true;
            continue;
          }
        }
      }
      if (!found) {
        Events.getCell(m + 1, 1).setNote("Couldn't find a purchase (R) event for the property '" + events[m].id + "'.");
        Events.getCell(m + 1, 1).setBackground(STATUS_COLORS.WARNING);
        errors = true;
        continue;
      }
    }
  }
}


function onEdit(e) {
  if (e.range.getA1Notation() == 'F2') {
    e.range.setValue("");
    run()
  }
}
