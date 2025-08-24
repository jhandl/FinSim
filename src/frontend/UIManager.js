/* This file has to work on both the website and Google Sheets */

STATUS_COLORS = {
  ERROR: "#ff8080",
  WARNING: "#ffe066",
  SUCCESS: "#9fdf9f",
  INFO: "#E0E0E0",
  WHITE: "#FFFFFF"
};

class UIManager {

  // Constants
  static REQUIRED_FIELD_MESSAGE = "Required field";

  constructor(ui) {
    this.ui = ui;
  }

  // Constants
  updateDataSheet(runs, perRunResults) {
    // Average the attributions over all runs
    for (let i = 1; i <= row; i++) {
        const totalAttributions = {};
        for (let j = 0; j < runs; j++) {
            if (perRunResults[j] && perRunResults[j][i-1]) {
                const runAttributions = perRunResults[j][i-1].attributions;
                for (const metric in runAttributions) {
                    if (!totalAttributions[metric]) {
                        totalAttributions[metric] = {};
                    }
                    const breakdown = runAttributions[metric].slices;
                    for (const source in breakdown) {
                        if (!totalAttributions[metric][source]) {
                            totalAttributions[metric][source] = 0;
                        }
                        totalAttributions[metric][source] += breakdown[source];
                    }
                }
            }
        }

        // Divide by number of runs to get the average
        for (const metric in totalAttributions) {
            for (const source in totalAttributions[metric]) {
                totalAttributions[metric][source] /= runs;
            }
        }
        dataSheet[i].attributions = totalAttributions;
    }

    let rowColors = {};
    
    // Store simulation results for later visualization changes (web UI only)
    if (this.ui.storeSimulationResults && perRunResults && perRunResults.length > 0) {
      this.ui.storeSimulationResults(runs, perRunResults);
    }
    
    // Calculate pinch point colors if we have per-run results
    if (perRunResults && perRunResults.length > 0) {
      // Use PinchPointVisualizer if available (web UI only)
      if (typeof PinchPointVisualizer !== 'undefined') {
        // Get selected configuration from UI
        const selectedPreset = this.getSelectedVisualizationPreset();
        
        // Skip color calculation for "Plain" color scheme to allow CSS zebra striping
        if (selectedPreset !== 'default') {
          const config = this.createVisualizationConfig(selectedPreset);
          const visualizer = new PinchPointVisualizer(config);
          rowColors = visualizer.calculateRowColors(perRunResults);
        }
      }
    }
    
    if (montecarlo) {   
      for (let i = 1; i <= row; i++) {
        this.updateDataRow(i, i/row, runs, rowColors[i]);
      }
    } else {
      // For single runs, also apply colors if available
      for (let i = 1; i <= row; i++) {
        if (rowColors[i]) {
          this.ui.setDataRowBackgroundColor(i, rowColors[i]);
        }
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

  getSelectedVisualizationPreset() {
    // Try to get the selected preset from the custom select
    const optionsContainer = document.getElementById('presetOptions');
    if (optionsContainer) {
      const selectedOption = optionsContainer.querySelector('.selected');
      if (selectedOption) {
        return selectedOption.getAttribute('data-value') || 'default';
      }
    }

    // Fallback to default
    return 'default';
  }

  createVisualizationConfig(presetName) {
    if (typeof VisualizationConfig !== 'undefined' && VisualizationConfig.createFromPreset) {
      return VisualizationConfig.createFromPreset(presetName);
    }
    // Fallback to default config if VisualizationConfig is not available
    return new VisualizationConfig();
  }

  updateDataRow(row, progress, scale = 1, backgroundColor = null) {
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
      PensionFund: dataSheet[row].pensionFund / scale,
      Cash: dataSheet[row].cash / scale,
      FundsCapital: dataSheet[row].indexFundsCapital / scale,
      SharesCapital: dataSheet[row].sharesCapital / scale,
      PensionContribution: dataSheet[row].pensionContribution / scale,
      WithdrawalRate: dataSheet[row].withdrawalRate / scale,
      Worth: dataSheet[row].worth / scale,
      Attributions: dataSheet[row].attributions
    };

    // Add dynamic per-investment-type fields so the table can render N investment types
    try {
      const incMap = dataSheet[row].investmentIncomeByKey || {};
      for (const key in incMap) {
        data['Income__' + key] = incMap[key] / scale;
      }
      const capMap = dataSheet[row].investmentCapitalByKey || {};
      for (const key in capMap) {
        data['Capital__' + key] = capMap[key] / scale;
      }
      // Add dynamic tax totals with display names from tax ruleset
      const taxMap = dataSheet[row].taxByKey || {};
      for (const tId in taxMap) {
        data['Tax__' + tId] = taxMap[tId] / scale;
      }
      
      // Also add legacy hardcoded tax fields for backward compatibility with existing UI components
      // These will be dynamically populated from the taxByKey map
      if (taxMap.incomeTax !== undefined) data.IT = taxMap.incomeTax / scale;
      if (taxMap.prsi !== undefined) data.PRSI = taxMap.prsi / scale;
      if (taxMap.usc !== undefined) data.USC = taxMap.usc / scale;
      if (taxMap.capitalGains !== undefined) data.CGT = taxMap.capitalGains / scale;
    } catch (_) {}

    this.ui.setDataRow(row, data);
    this.ui.setChartsRow(row, data);
    
    // Apply background color if provided
    if (backgroundColor) {
      this.ui.setDataRowBackgroundColor(row, backgroundColor);
    }
    
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
      pensionCapped: this.ui.getValue("PensionContributionCapped"),
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
      personalTaxCredit: this.ui.getValue("PersonalTaxCredit"),

      // Person 2 Parameters
      p2StartingAge: this.ui.getValue("P2StartingAge"),
      p2RetirementAge: this.ui.getValue("P2RetirementAge"),
      p2StatePensionWeekly: this.ui.getValue("P2StatePensionWeekly"),
      initialPensionP2: this.ui.getValue("InitialPensionP2"),
      pensionPercentageP2: this.ui.getValue("PensionContributionPercentageP2"),
      simulation_mode: this.ui.getValue("simulation_mode"),
      economyMode: this.ui.getValue("economy_mode")
    };

    // In deterministic mode, override volatility parameters to 0 to ensure fixed growth rates
    // This ensures equity classes receive 0 standard deviation and use only the mean growth rate
    if (params.economyMode === 'deterministic') {
      params.growthDevPension = 0;
      params.growthDevFunds = 0;
      params.growthDevShares = 0;
    }
    
    if (validate) {
      // Check mandatory fields first
      this.validateRequiredFields(params);
      
      // Validate age fields - basic range validation
      this.validateParameterAgeFields(params);
      
      // Pension retirement age validation using TaxRuleSet where available
      try {
        const cfg = Config.getInstance();
        const rs = cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet(cfg.getDefaultCountry()) : null;
        const minOcc = (rs && typeof rs.getPensionMinRetirementAgeOccupational === 'function' && rs.getPensionMinRetirementAgeOccupational() > 0)
          ? rs.getPensionMinRetirementAgeOccupational()
          : config.minOccupationalPensionRetirementAge;
        const minPriv = (rs && typeof rs.getPensionMinRetirementAgePrivate === 'function') ? rs.getPensionMinRetirementAgePrivate() : config.minPrivatePensionRetirementAge;
        if (params.retirementAge < minOcc) {
          this.ui.setWarning("RetirementAge", "Only occupational pension schemes allow retirement before age "+minOcc+".");
        }
        if (params.retirementAge < minPriv) {
          this.ui.setWarning("RetirementAge", "Private pensions don't normally allow retirement before age "+minPriv+".");
        }
      } catch (_) {
        if (params.retirementAge < config.minOccupationalPensionRetirementAge) {
          this.ui.setWarning("RetirementAge", "Only occupational pension schemes allow retirement before age "+config.minOccupationalPensionRetirementAge+".");
        }
        if (params.retirementAge < config.minPrivatePensionRetirementAge) {
          this.ui.setWarning("RetirementAge", "Private pensions don't normally allow retirement before age "+config.minPrivatePensionRetirementAge+".");
        }
      }

      // Person 2 retirement age validation against config minimums
      try {
        const cfg = Config.getInstance();
        const rs = cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet(cfg.getDefaultCountry()) : null;
        const minOcc = (rs && typeof rs.getPensionMinRetirementAgeOccupational === 'function' && rs.getPensionMinRetirementAgeOccupational() > 0)
          ? rs.getPensionMinRetirementAgeOccupational()
          : config.minOccupationalPensionRetirementAge;
        const minPriv = (rs && typeof rs.getPensionMinRetirementAgePrivate === 'function') ? rs.getPensionMinRetirementAgePrivate() : config.minPrivatePensionRetirementAge;
        if (params.p2RetirementAge < minOcc) {
          this.ui.setWarning("P2RetirementAge", "Only occupational pension schemes allow retirement before age "+minOcc+".");
        }
        if (params.p2RetirementAge < minPriv) {
          this.ui.setWarning("P2RetirementAge", "Private pensions don't normally allow retirement before age "+minPriv+".");
        }
      } catch (_) {
        if (params.p2RetirementAge < config.minOccupationalPensionRetirementAge) {
          this.ui.setWarning("P2RetirementAge", "Only occupational pension schemes allow retirement before age "+config.minOccupationalPensionRetirementAge+".");
        }
        if (params.p2RetirementAge < config.minPrivatePensionRetirementAge) {
          this.ui.setWarning("P2RetirementAge", "Private pensions don't normally allow retirement before age "+config.minPrivatePensionRetirementAge+".");
        }
      }

      // Person 1 Validation: startingAge and retirementAge required if either provided.
      if (params.startingAge !== 0 && params.retirementAge === 0) {
        this.ui.setWarning("RetirementAge", "Person 1 Retirement Age is required if Person 1 Current Age is provided.");
        errors = true;
      }
      if (params.retirementAge !== 0 && params.startingAge === 0) {
        this.ui.setWarning("StartingAge", "Person 1 Current Age is required if Person 1 Retirement Age is provided.");
        errors = true;
      }

      // Person 2 Validation: If any P2 field provided, p2StartingAge and p2RetirementAge become required.
      const anyP2FieldProvided = params.p2StartingAge !== 0 || 
                                 params.p2RetirementAge !== 0 || 
                                 params.p2StatePensionWeekly !== 0 || 
                                 params.initialPensionP2 !== 0 || 
                                 params.pensionPercentageP2 !== 0;

      if (anyP2FieldProvided) {
        if (params.p2StartingAge === 0) {
          this.ui.setWarning("P2StartingAge", "Person 2 Current Age is required if any Person 2 detail is provided.");
          errors = true;
        }
        if (params.p2RetirementAge === 0) {
          this.ui.setWarning("P2RetirementAge", "Person 2 Retirement Age is required if any Person 2 detail is provided.");
          errors = true;
        }
      }

      if (params.FundsAllocation + params.SharesAllocation > 1.0001) {
        // Derive labels from ruleset if available for better UX
        let fundsLabel = 'Index Funds', sharesLabel = 'Individual Shares';
        try {
          const cfg = Config.getInstance();
          const rs = cfg.getCachedTaxRuleSet(cfg.getDefaultCountry());
          if (rs && rs.findInvestmentTypeByKey) {
            const f = rs.findInvestmentTypeByKey('indexFunds');
            const s = rs.findInvestmentTypeByKey('shares');
            if (f && f.label) fundsLabel = f.label;
            if (s && s.label) sharesLabel = s.label;
          }
        } catch (_) {}
        this.ui.setWarning("FundsAllocation", `${fundsLabel} + ${sharesLabel} allocations can't exceed 100%`);
        this.ui.setWarning("SharesAllocation", `${fundsLabel} + ${sharesLabel} allocations can't exceed 100%`);
        errors = true;
      }
      
      // Validate percentage fields
      this.validateParameterPercentageFields(params);

      // Validate volatility parameters for variable rate mode
      if (params.economyMode === 'montecarlo') {
        if (params.growthDevPension === 0 && params.growthDevFunds === 0 && params.growthDevShares === 0) {
          // Use dynamic labels for more helpful messages
          let fundsLabel = 'Index Funds', sharesLabel = 'Shares';
          try {
            const cfg = Config.getInstance();
            const rs = cfg.getCachedTaxRuleSet(cfg.getDefaultCountry());
            if (rs && rs.findInvestmentTypeByKey) {
              const f = rs.findInvestmentTypeByKey('indexFunds');
              const s = rs.findInvestmentTypeByKey('shares');
              if (f && f.label) fundsLabel = f.label;
              if (s && s.label) sharesLabel = s.label;
            }
          } catch (_) {}
          this.ui.setWarning("PensionGrowthStdDev", "At least one volatility rate must be greater than 0% in variable growth mode");
          this.ui.setWarning("FundsGrowthStdDev", `At least one of Pension, ${fundsLabel}, or ${sharesLabel} volatility must be > 0% in variable growth mode`);
          this.ui.setWarning("SharesGrowthStdDev", `At least one of Pension, ${fundsLabel}, or ${sharesLabel} volatility must be > 0% in variable growth mode`);
          errors = true;
        }
      }
    }

    return params;
  }

  clearWarnings() {
    this.ui.clearAllWarnings();
  }

  validateRequiredFields(params) {
    // Check absolute minimum required fields to run a simulation
    
    // Starting Age is mandatory
    if (!this.hasValue(params.startingAge)) {
      this.ui.setWarning("StartingAge", UIManager.REQUIRED_FIELD_MESSAGE);
      errors = true;
    }
    
    // Target Age is mandatory
    if (!this.hasValue(params.targetAge)) {
      this.ui.setWarning("TargetAge", UIManager.REQUIRED_FIELD_MESSAGE);
      errors = true;
    }
    
    // Retirement Age is mandatory
    if (!this.hasValue(params.retirementAge)) {
      this.ui.setWarning("RetirementAge", UIManager.REQUIRED_FIELD_MESSAGE);
      errors = true;
    }
  }

  readEvents(validate=true) {
    const events = [];
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
        const simulationMode = this.ui.getValue('simulation_mode');
        let sInpDescriptionSingle = "Salary Income (no pension)";
        let sInpDescriptionJoint = "Your Salary (no pension)";
        let siDescriptionSingle = "Salary Income";
        let siDescriptionJoint = "Salary Income (You)";

        const valid = {
          "NOP": "Non-operation: make the simulation ignore an event without needing to remove the line",
          "SI": simulationMode === 'couple' ? siDescriptionJoint : siDescriptionSingle,
          "SInp": simulationMode === 'couple' ? sInpDescriptionJoint : sInpDescriptionSingle,
          // SI2 and SI2np are only valid in couple mode, so they are added conditionally
        };

        if (simulationMode === 'couple') {
          valid["SI2"] = "Salary Income (Them, Pensionable)";
          valid["SI2np"] = "Salary Income (Them, no pension)";
        }

        // Add other non-salary event types that are always valid
        Object.assign(valid, {
          "UI": "RSU Income",
          "RI": "Rental Income",
          "DBI": "Defined Benefit Pension Income",
          "FI": "Tax-free Income",
          "E": "Expense",
          "R": "Real Estate",
          "M": "Mortgage",
          "SM": "Stock Market"
        });

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
      
      // Convert years to ages if we're in year mode
      let processedFromAge = fromAge;
      let processedToAge = toAge;
      
      // Check if EventsTableManager exists and is in year mode
      const eventsTableManager = this.ui.eventsTableManager;
      if (eventsTableManager && eventsTableManager.ageYearMode === 'year') {
        const startingAge = parseInt(this.ui.getValue('StartingAge')) || 0;
        const p2StartingAge = parseInt(this.ui.getValue('P2StartingAge')) || 0;
        
        // Convert fromAge from year to age
        if (fromAge !== "" && !isNaN(fromAge)) {
          const birthYear = this.calculateBirthYear(type, startingAge, p2StartingAge);
          processedFromAge = this.convertEventYearToAge(parseInt(fromAge), birthYear);
        }
        
        // Convert toAge from year to age
        if (toAge !== "" && !isNaN(toAge)) {
          const birthYear = this.calculateBirthYear(type, startingAge, p2StartingAge);
          processedToAge = this.convertEventYearToAge(parseInt(toAge), birthYear);
        }
      }


      events.push(new SimEvent(
        type, id, amount, processedFromAge,
        (processedToAge === "" && (type === "R" || type === "DBI")) ? 999 : processedToAge,
        (rate === "") ? undefined : rate,
        (match === "") ? undefined : match
      ))
    }

    if (validate) {
      this.validateEventFields(events);
      this.validateMortgageEvents(events);
      this.validateAgeYearFields(events);
      this.validateRequiredEvents(events);
    }

    return events;
  }

  // Helper function to calculate birth year for a person based on event type
  calculateBirthYear(eventType, startingAge, p2StartingAge) {
    const currentYear = new Date().getFullYear();
    const eventPerson = this.determineEventPerson(eventType);
    
    if (eventPerson === 'P2') {
      return currentYear - p2StartingAge;
    } else {
      return currentYear - startingAge;
    }
  }

  // Helper function to convert a year to an age for a specific person
  convertEventYearToAge(eventYear, birthYear) {
    return eventYear - birthYear;
  }

  // Helper function to determine which person an event applies to
  determineEventPerson(eventType) {
    // SI2 and SI2np events apply to Person 2
    if (eventType === 'SI2' || eventType === 'SI2np') {
      return 'P2';
    }
    // All other events apply to Person 1 (or are global)
    return 'P1';
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

    }
  }

  validateAgeYearFields(events) {
    const startingAge = parseInt(this.ui.getValue('StartingAge')) || 0;
    const p2StartingAge = parseInt(this.ui.getValue('P2StartingAge')) || 0;
    
    // Get current UI mode for appropriate error messages
    const eventsTableManager = this.ui.eventsTableManager;
    const currentMode = eventsTableManager?.ageYearMode || 'age';
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      
      // Skip validation for NOP events as they ignore all fields
      if (event.type === 'NOP') continue;
      
      // Validate From Age (events always contain ages after conversion)
      if (event.fromAge !== undefined && event.fromAge !== '') {
        const validation = this.validateAgeValue(event.fromAge, event.type, startingAge, p2StartingAge, currentMode);
        if (!validation.isValid) {
          this.ui.setWarning(`Events[${i + 1},3]`, validation.message);
          errors = true;
        }
      }
      
      // Validate To Age (events always contain ages after conversion)
      if (event.toAge !== undefined && event.toAge !== '' && event.toAge !== 999) {
        const validation = this.validateAgeValue(event.toAge, event.type, startingAge, p2StartingAge, currentMode);
        if (!validation.isValid) {
          this.ui.setWarning(`Events[${i + 1},4]`, validation.message);
          errors = true;
        }
      }
      
      // Validate that toAge is not smaller than fromAge
      if (event.fromAge && event.toAge && event.toAge !== 999) {
        if (event.toAge < event.fromAge) {
          this.ui.setWarning(`Events[${i + 1},4]`, `End ${currentMode} can't be before start ${currentMode}`);
          errors = true;
        }
      }
    }
  }

  validateAgeValue(value, eventType, startingAge, p2StartingAge, currentMode) {
    const parsed = ValidationUtils.validateValue('age', value);
    if (parsed === null) {
      return { isValid: false, message: "Please enter a valid non-negative number" };
    }

    // Additional sanity check relative to starting age if parameters supplied
    const numValue = parsed;
    const modeWord = currentMode || 'age';
    const capModeWord = modeWord.charAt(0).toUpperCase() + modeWord.slice(1);

    const relevantStartingAge = this.getRelevantStartingAge(eventType, startingAge, p2StartingAge);
    if (relevantStartingAge > 0) {
      // We use an extremely wide ±1000 year window just to catch obvious mistakes without judging typical values
      if (numValue > relevantStartingAge + 1000) {
        return { isValid: false, message: `${capModeWord} seems very far in the future (${numValue - relevantStartingAge} years from now)` };
      }
      if (numValue < relevantStartingAge - 1000) {
        return { isValid: false, message: `${capModeWord} seems very far in the past (${relevantStartingAge - numValue} years ago)` };
      }
    }
    
    return { isValid: true };
  }

  getRelevantStartingAge(eventType, startingAge, p2StartingAge) {
    // Determine which person this event applies to based on event type
    if (eventType === 'SI2' || eventType === 'SI2np') {
      return p2StartingAge;
    } else {
      return startingAge;
    }
  }

  validateParameterAgeFields(params) {
    const allAgeFields = [
      { value: params.startingAge, fieldId: 'StartingAge', name: 'Current Age', person: 'P1' },
      { value: params.retirementAge, fieldId: 'RetirementAge', name: 'Retirement Age', person: 'P1' },
      { value: params.targetAge, fieldId: 'TargetAge', name: 'Target Age', person: 'shared' },
      { value: params.p2StartingAge, fieldId: 'P2StartingAge', name: 'Partner Current Age', person: 'P2' },
      { value: params.p2RetirementAge, fieldId: 'P2RetirementAge', name: 'Partner Retirement Age', person: 'P2' }
    ];

    // Determine which fields to validate
    const shouldValidateP2 = (params.simulation_mode === 'couple');
    const fieldsToValidate = allAgeFields.filter(field => 
      field.person === 'P1' || field.person === 'shared' || shouldValidateP2
    );

    // Validate individual age fields (numeric only)
    fieldsToValidate.forEach(field => {
      if (this.hasValue(field.value)) {
        const parsed = ValidationUtils.validateValue('age', field.value);
        if (parsed === null) {
          this.ui.setWarning(field.fieldId, "Please enter a valid non-negative number");
          errors = true;
        }
      }
    });

    const validateRelationship = (current, future, fieldId, message) => {
      if (this.hasValue(current) && this.hasValue(future) && future <= current) {
        this.ui.setWarning(fieldId, message);
        errors = true;
      }
    };
    validateRelationship(params.startingAge, params.targetAge, 'TargetAge', 'Target age must be greater than current age');

  }

  hasValue(value) {
    return value !== undefined && value !== '' && value !== 0;
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
      'SI2': 'rrrroo',    // Added for Person 2 Pensionable Salary
      'SI2np':'rrrro-',  // Added for Person 2 Non-Pensionable Salary
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

  validateParameterPercentageFields(params) {
    // Define percentage fields with their validation rules
    const percentageFields = [
      { 
        value: params.FundsAllocation, 
        fieldId: 'FundsAllocation', 
        name: (function(){
          try {
            const cfg = Config.getInstance();
            const rs = cfg.getCachedTaxRuleSet(cfg.getDefaultCountry());
            const f = rs && rs.findInvestmentTypeByKey ? rs.findInvestmentTypeByKey('indexFunds') : null;
            if (f && f.label) return `${f.label} Allocation`;
          } catch(_) {}
          return 'Index Funds Allocation';
        })(),
        min: 0, 
        max: 1,
        unit: '%'
      },
      { 
        value: params.SharesAllocation, 
        fieldId: 'SharesAllocation', 
        name: (function(){
          try {
            const cfg = Config.getInstance();
            const rs = cfg.getCachedTaxRuleSet(cfg.getDefaultCountry());
            const s = rs && rs.findInvestmentTypeByKey ? rs.findInvestmentTypeByKey('shares') : null;
            if (s && s.label) return `${s.label} Allocation`;
          } catch(_) {}
          return 'Individual Shares Allocation';
        })(),
        min: 0, 
        max: 1,
        unit: '%'
      },
      { 
        value: params.pensionPercentage, 
        fieldId: 'PensionContributionPercentage', 
        name: 'Pension Contribution Percentage',
        min: 0, 
        max: 1,
        unit: '%',
        allowExceedMax: true,
        exceedMaxMessage: "You can contribute more than 100% but you won't get tax relief on the excess"
      },
      { 
        value: params.pensionPercentageP2, 
        fieldId: 'PensionContributionPercentageP2', 
        name: 'Partner Pension Contribution Percentage',
        min: 0, 
        max: 1,
        unit: '%',
        allowExceedMax: true,
        exceedMaxMessage: "They can contribute more than 100% but they won't get tax relief on the excess"
      },
    ];

    // Filter fields based on simulation mode
    const shouldValidateP2 = (params.simulation_mode === 'couple');
    const fieldsToValidate = percentageFields.filter(field => 
      !field.fieldId.includes('P2') || shouldValidateP2
    );

    // Validate each percentage field
    fieldsToValidate.forEach(field => {
      if (this.hasValue(field.value)) {
        const validation = this.validatePercentageValue(field.value, field.name, field.min, field.max, field.unit, field.allowExceedMax, field.exceedMaxMessage);
        if (!validation.isValid) {
          this.ui.setWarning(field.fieldId, validation.message);
          if (!validation.isWarningOnly) {
            errors = true;
          }
        }
      }
    });
  }

  validatePercentageValue(value, fieldName, min, max, unit, allowExceedMax = false, exceedMaxMessage = null) {
    const parsed = ValidationUtils.validateValue('percentage', value);
    if (parsed === null) {
      return { isValid: false, message: "Please enter a valid number", isWarningOnly: false };
    }

    // Apply min/max rules if provided (parsed is decimal eg 0.1)
    if (min !== undefined && parsed < min) {
      return { isValid: false, message: `${fieldName} cannot be less than ${min * 100}${unit}`, isWarningOnly: false };
    }
    if (max !== undefined && parsed > max) {
      if (allowExceedMax && exceedMaxMessage) {
        return { isValid: false, message: exceedMaxMessage, isWarningOnly: true };
      }
      return { isValid: false, message: `${fieldName} cannot be greater than ${max * 100}${unit}`, isWarningOnly: false };
    }

    return { isValid: true };
  }

  validateRequiredEvents(events) {
    const message = "At least one event is required (e.g., salary income or expenses)";

    if (!events || events.length === 0) {
      // No rows at all – highlight section title
      this.ui.setWarning("EventsTitle", message);
      errors = true;
      return;
    }

    // Check for any non-NOP events
    const validEvents = events.filter(event => event.type !== 'NOP');

    if (validEvents.length === 0) {
      // All rows are NOP – highlight first NOP event type cell if available, otherwise title
      const firstNopIndex = events.findIndex(e => e.type === 'NOP');
      if (firstNopIndex >= 0) {
        // Clear any previous title warning
        const titleEl = document.getElementById('EventsTitle');
        if (titleEl) this.ui.clearElementWarning(titleEl);

        // Highlight the event type field (column 0)
        this.ui.setWarning(`Events[${firstNopIndex + 1},0]`, message);
      } else {
        // Fallback (shouldn't happen)
        this.ui.setWarning("EventsTitle", message);
      }
      errors = true;
    }
  }

} 
