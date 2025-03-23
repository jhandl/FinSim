/* This file has to work on both the website and Google Sheets */

STATUS_COLORS = {
  ERROR: "#ff8080",
  WARNING: "#ffe066",
  SUCCESS: "#9fdf9f",
  INFO: "#E0E0E0",
  WHITE: "#FFFFFF"
};


class UIManager {

  constructor(ui) {
    this.ui = ui;
  }

  updateDataSheet(runs) {
    if (montecarlo) {   
      for (let i = 1; i <= row; i++) {
        this.updateDataRow(i, i/row, runs);
      }
    }
    this.ui.clearExtraDataRows(params.targetAge);
    this.ui.clearExtraChartRows(params.targetAge);
  }

  updateProgress(msg) {
    this.ui.setStatus(msg);
    this.ui.flush();
  }

  updateStatusCell(successes, runs) {
    if (montecarlo) {
      let percentSuccess = successes / runs;
      let msg = `Success ${(percentSuccess * 100).toFixed(1)}%`;
      let r = between(255, 160, percentSuccess);
      let g = between(128, 255, percentSuccess);
      let b = between(128, 160, percentSuccess);
      let color = rgbToHex(r, g, b);
      this.ui.setStatus(msg, color);
    } else {
      if (success || failedAt > params.targetAge) {
        const msg = success ? "Success!" : "Made it to " + failedAt;
        this.ui.setStatus(msg, STATUS_COLORS.SUCCESS);
      } else {
        this.ui.setStatus("Failed at age " + failedAt, STATUS_COLORS.ERROR);
      }
    }
    this.ui.flush();
  }

  setStatus(message, color) {
    this.ui.setStatus(message, color);
  }

  updateDataRow(row, progress, scale = 1) {
    const data = {
      Age: dataSheet[row].age / scale,
      Year: dataSheet[row].year / scale,
      IncomeSalaries: dataSheet[row].incomeSalaries / scale,
      IncomeRSUs: dataSheet[row].incomeRSUs / scale,
      IncomeRentals: dataSheet[row].incomeRentals / scale,
      IncomePrivatePension: dataSheet[row].incomePrivatePension / scale,
      IncomeStatePension: dataSheet[row].incomeStatePension / scale,
      IncomeFundsRent: dataSheet[row].incomeFundsRent / scale,
      IncomeSharesRent: dataSheet[row].incomeSharesRent / scale,
      IncomeCash: dataSheet[row].incomeCash / scale,
      RealEstateCapital: dataSheet[row].realEstateCapital / scale,
      NetIncome: dataSheet[row].netIncome / scale,
      Expenses: dataSheet[row].expenses / scale,
      Savings: dataSheet[row].savings / scale,
      PensionFund: dataSheet[row].pensionFund / scale,
      Cash: dataSheet[row].cash / scale,
      FundsCapital: dataSheet[row].indexFundsCapital / scale,
      SharesCapital: dataSheet[row].sharesCapital / scale,
      PensionContribution: dataSheet[row].pensionContribution / scale,
      WithdrawalRate: dataSheet[row].withdrawalRate / scale,
      IT: dataSheet[row].it / scale,
      PRSI: dataSheet[row].prsi / scale,
      USC: dataSheet[row].usc / scale,
      CGT: dataSheet[row].cgt / scale,
      Worth: dataSheet[row].worth / scale
    };

    this.ui.setDataRow(row, data);
    this.ui.setChartsRow(row, data);
    if (row % 5 === 0) {
      this.updateProgress("Updating "+Math.round(100 * progress) + "%");
    }
  }

  readParameters(validate = true) {
    const params = {
      startingAge: this.ui.getValue("StartingAge"),
      targetAge: this.ui.getValue("TargetAge"),
      initialSavings: this.ui.getValue("InitialSavings"),
      initialPension: this.ui.getValue("InitialPension"),
      initialFunds: this.ui.getValue("InitialFunds"),
      initialShares: this.ui.getValue("InitialShares"),
      retirementAge: this.ui.getValue("RetirementAge"),
      emergencyStash: this.ui.getValue("EmergencyStash"),
      pensionPercentage: this.ui.getValue("PensionContributionPercentage"),
      pensionCapped: this.ui.getValue("PensionContributionCapped") === "Yes",
      statePensionWeekly: this.ui.getValue("StatePensionWeekly"),
      growthRatePension: this.ui.getValue("PensionGrowthRate"),
      growthDevPension: this.ui.getValue("PensionGrowthStdDev"),
      growthRateFunds: this.ui.getValue("FundsGrowthRate"),
      growthDevFunds: this.ui.getValue("FundsGrowthStdDev"),
      growthRateShares: this.ui.getValue("SharesGrowthRate"),
      growthDevShares: this.ui.getValue("SharesGrowthStdDev"),
      inflation: this.ui.getValue("Inflation"),
      FundsAllocation: this.ui.getValue("FundsAllocation"),
      SharesAllocation: this.ui.getValue("SharesAllocation"),
      priorityCash: this.ui.getValue("PriorityCash"),
      priorityPension: this.ui.getValue("PriorityPension"),
      priorityFunds: this.ui.getValue("PriorityFunds"),
      priorityShares: this.ui.getValue("PriorityShares"),
      marriageYear: this.ui.getValue("MarriageYear"),
      youngestChildBorn: this.ui.getValue("YoungestChildBorn"),
      oldestChildBorn: this.ui.getValue("OldestChildBorn"),
      personalTaxCredit: this.ui.getValue("PersonalTaxCredit")
    };
    
    if (validate) {
      if (params.retirementAge < config.minOccupationalPensionRetirementAge) {
        this.ui.setWarning("RetirementAge", "Warning: Only occupational pension schemes allow retirement before age "+config.minOccupationalPensionRetirementAge+".");
      }
      if (params.retirementAge < config.minPrivatePensionRetirementAge) {
        this.ui.setWarning("RetirementAge", "Warning: Private pensions don't normally allow retirement before age "+config.minPrivatePensionRetirementAge+".");
      }

      if (params.FundsAllocation + params.SharesAllocation > 1.0001) {
        this.ui.setWarning("FundsAllocation", "Index Funds + Individual Shares allocations can't exceed 100%");
        this.ui.setWarning("SharesAllocation", "");
        errors = true;
      }
    }

    return params;
  }

  clearWarnings() {
    this.ui.clearAllWarnings();
  }

  readEvents(validate=true) {
    const events = [];
    errors = false;
        
    const rows = this.ui.getTableData("Events", 6);

      for (const [i, [name, amount, fromAge, toAge, rate, match]] of rows.entries()) {
      const pos = name.indexOf(":");
      if (pos < 0) {
        if (name === "") break;
        if (validate) {
          this.ui.setWarning(`Events[${i + 1},1]`, "Invalid event format: missing colon.");
          errors = true;
          break;
        }
      }

      const type = name.substr(0, pos);
      if (validate) {
        const valid = {
          "NOP": "Non-operation: way to make the simulation ignore an event without needing to remove the line",
          "RI": "Rental Income",
          "SI": "Salary Income (with private pension contribution if so defined)",
          "SInp": "Salary Income (no private pension contribution)",
          "UI": "RSU Income",
          "DBI": "Defined Benefit Pension Income",
          "FI": "Tax-free Income",
          "E": "Expense",
          "R": "Real Estate",
          "M": "Mortgage",
          "SM": "Stock Market"
        }

        if (!valid.hasOwnProperty(type)) {
          const validTypesMsg = Object.keys(valid)
            .map(key => `${key} (${valid[key]})`)
            .join(", ");
          this.ui.setWarning(`Events[${i + 1},1]`, `Invalid event type. Valid types are: ${validTypesMsg}`);
          errors = true;
          break;
        }
      }

      const id = name.substr(pos + 1);
      events.push(new SimEvent(
        type, id, amount, fromAge, 
        (toAge === "" && (type === "R" || type === "DBI")) ? 999 : toAge,
        (rate === "") ? undefined : rate,
        (match === "") ? undefined : match
      ))
    }

    if (validate) {
      this.validateEventFields(events);
      this.validateMortgageEvents(events);
    }

    return events;
  }

  validateMortgageEvents(events) {
    for (let m = 0; m < events.length; m++) {
      if (events[m].type === 'M') {
        let found = false;
        for (let p = 0; p < events.length; p++) {
          if (events[p].type === 'R' && events[p].id === events[m].id) {
            found = true;
            if (events[p].fromAge !== events[m].fromAge) {
              this.ui.setWarning(`Events[${m + 1},3]`, "The mortgage (M) and purchase (R) events for a property should have the same starting age.");
              errors = true;
            }
            if (events[m].toAge > events[p].toAge) {
              this.ui.setWarning(`Events[${m + 1},4]`, "The mortgage should not continue after the property is sold.");
              errors = true;
            }
          }
        }
        if (!found) {
          this.ui.setWarning(`Events[${m + 1},1]`, `Couldn't find a purchase event for the property '${events[m].id}'.`);
          errors = true;
        }
      }
    }
  }

  validateEventFields(events) {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const required = UIManager.getRequiredFields(event.type);
      if (!required) continue;

      UIManager.getFields().forEach(field => {
        let value = undefined;
        switch(field) {
          case 'name':
            value = event.id;
            break;
          case 'amount':
            value = event.amount;
            break;
          case 'fromAge':
            value = event.fromAge;
            break;
          case 'toAge':
            value = event.toAge;
            break;
          case 'rate':
            value = event.rate;
            break;
          case 'match':
            value = event.match;
            break;
        }

        if (required[field] === 'required' && (value === undefined || value === '')) {
          this.ui.setWarning(`Events[${i + 1},${UIManager.getIndexForField(field)}]`, "Required field");
          errors = true;
        }
      });

      if (event.fromAge && event.toAge) {
        if (event.toAge < event.fromAge) {
          this.ui.setWarning(`Events[${i + 1},4]`, "End age can't be less than start age");
          errors = true;
        }
      }
    }
  }

  saveToFile() {
    this.ui.saveToFile();
  }

  loadFromFile(file) {
    this.ui.loadFromFile(file);
  }

  static getFields() {
    return ['name', 'amount', 'fromAge', 'toAge', 'rate', 'match'];
  }

  static getIndexForField(field) {
    return {
      'name': 1,
      'amount': 2,
      'fromAge': 3,
      'toAge': 4,
      'rate': 5,
      'match': 6
    }[field];
  }

  static getRequiredFields(eventType) {
    // r=required, o=optional, -=hidden
    const patterns = {
      'NOP': 'oooooo',
      'RI':  'rrrro-',
      'SI':  'rrrroo',
      'SInp':'rrrro-',
      'UI':  'rrrro-',
      'DBI': 'rrroo-',
      'FI':  'rrrro-',
      'E':   'rrrro-',
      'R':   'rrroo-',
      'M':   'rrrrr-',
      'SM':  'r-rrr-'
    };
    const fields = UIManager.getFields();
    const pattern = patterns[eventType]?.split('') || [];
    return Object.fromEntries(fields.map((field, i) => [
      field,
      pattern[i] === 'r' ? 'required' : pattern[i] === 'o' ? 'optional' : 'hidden'
    ]));
  }

} 