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
    // In Monte Carlo mode, core accumulates attribution totals directly into dataSheet rows.
    // Divide once here to present averages (avoid storing per-run attribution snapshots).
    if (montecarlo && runs > 1) {
      for (let i = 1; i <= row; i++) {
        const attributions = (dataSheet[i] && dataSheet[i].attributions) ? dataSheet[i].attributions : null;
        if (!attributions) continue;
        for (const metric in attributions) {
          const metricObj = attributions[metric];
          if (!metricObj) continue;
          for (const source in metricObj) {
            metricObj[source] = metricObj[source] / runs;
          }
        }
      }
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

    // Apply income visibility before rendering rows so header and data align
    try {
      if (this.ui && this.ui.tableManager && typeof this.ui.tableManager.applyIncomeVisibilityAfterSimulation === 'function') {
        this.ui.tableManager.applyIncomeVisibilityAfterSimulation();
      }
    } catch (_) { /* no-op */ }

    if (montecarlo) {
      // Re-render rows using runs count to ensure proper averaging inside updateDataRow
      for (let i = 1; i <= row; i++) {
        this.updateDataRow(i, i / row, runs, rowColors[i]);
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

  buildDisplayDataRow(row, scale = 1) {
    if (!dataSheet || !dataSheet[row]) return null;

    // Data sheet semantics:
    // - core `netIncome` includes personal pension contributions (pension savings)
    // - UI "Inflows" should reflect cash inflows after taxes, excluding pension contributions.
    //   It must be computed from the post-withdrawal income/tax buckets (not from core `netIncome`,
    //   which is computed pre-withdrawal and intentionally excludes withdrawals).
    const invMap = dataSheet[row].investmentIncomeByKey || {};
    let invIncome = 0;
    for (const key in invMap) invIncome += invMap[key];
    const invMapPV = dataSheet[row].investmentIncomeByKeyPV || {};
    let invIncomePV = 0;
    for (const key in invMapPV) invIncomePV += invMapPV[key];
    const taxByKey = dataSheet[row].taxByKey || {};
    let totalTax = 0;
    for (const tId in taxByKey) totalTax += taxByKey[tId];
    let totalTaxPV = 0;
    for (const tId in taxByKey) {
      const pvKey = 'Tax__' + tId + 'PV';
      totalTaxPV += (dataSheet[row][pvKey] || 0);
    }
    const grossInflows =
      (dataSheet[row].incomeSalaries || 0) +
      (dataSheet[row].incomeRSUs || 0) +
      (dataSheet[row].incomeRentals || 0) +
      (dataSheet[row].incomePrivatePension || 0) +
      (dataSheet[row].incomeStatePension || 0) +
      (dataSheet[row].incomeDefinedBenefit || 0) +
      (dataSheet[row].incomeTaxFree || 0) +
      (dataSheet[row].incomeCash || 0) +
      invIncome;
    const grossInflowsPV =
      (dataSheet[row].incomeSalariesPV || 0) +
      (dataSheet[row].incomeRSUsPV || 0) +
      (dataSheet[row].incomeRentalsPV || 0) +
      (dataSheet[row].incomePrivatePensionPV || 0) +
      (dataSheet[row].incomeStatePensionPV || 0) +
      (dataSheet[row].incomeDefinedBenefitPV || 0) +
      (dataSheet[row].incomeTaxFreePV || 0) +
      (dataSheet[row].incomeCashPV || 0) +
      invIncomePV;
    const cashInflows = grossInflows - totalTax - (dataSheet[row].pensionContribution || 0);
    const cashInflowsPV = grossInflowsPV - totalTaxPV - (dataSheet[row].pensionContributionPV || 0);

    const data = {
      // Age and year are state values, not accumulated - don't divide by scale
      Age: dataSheet[row].age,
      Year: dataSheet[row].year,
      IncomeSalaries: dataSheet[row].incomeSalaries / scale,
      IncomeRSUs: dataSheet[row].incomeRSUs / scale,
      IncomeRentals: dataSheet[row].incomeRentals / scale,
      IncomePrivatePension: dataSheet[row].incomePrivatePension / scale,
      IncomeStatePension: dataSheet[row].incomeStatePension / scale,
      IncomeCash: dataSheet[row].incomeCash / scale,
      IncomeDefinedBenefit: dataSheet[row].incomeDefinedBenefit / scale,
      IncomeTaxFree: dataSheet[row].incomeTaxFree / scale,
      RealEstateCapital: dataSheet[row].realEstateCapital / scale,
      NetIncome: cashInflows / scale,
      Expenses: dataSheet[row].expenses / scale,
      PensionFund: dataSheet[row].pensionFund / scale,
      Cash: dataSheet[row].cash / scale,
      PensionContribution: dataSheet[row].pensionContribution / scale,
      WithdrawalRate: dataSheet[row].withdrawalRate / scale,
      Worth: dataSheet[row].worth / scale,
      // Core PV aggregates: exposed so table/chart PV paths can be exact by construction
      IncomeSalariesPV: dataSheet[row].incomeSalariesPV / scale,
      IncomeRSUsPV: dataSheet[row].incomeRSUsPV / scale,
      IncomeRentalsPV: dataSheet[row].incomeRentalsPV / scale,
      IncomePrivatePensionPV: dataSheet[row].incomePrivatePensionPV / scale,
      IncomeStatePensionPV: dataSheet[row].incomeStatePensionPV / scale,
      IncomeCashPV: dataSheet[row].incomeCashPV / scale,
      IncomeDefinedBenefitPV: dataSheet[row].incomeDefinedBenefitPV / scale,
      IncomeTaxFreePV: dataSheet[row].incomeTaxFreePV / scale,
      RealEstateCapitalPV: dataSheet[row].realEstateCapitalPV / scale,
      NetIncomePV: cashInflowsPV / scale,
      ExpensesPV: dataSheet[row].expensesPV / scale,
      PensionFundPV: dataSheet[row].pensionFundPV / scale,
      CashPV: dataSheet[row].cashPV / scale,
      PensionContributionPV: dataSheet[row].pensionContributionPV / scale,
      WorthPV: dataSheet[row].worthPV / scale,
      attributions: dataSheet[row].attributions
    };

    // Add dynamic per-investment-type fields so the table can render N investment types
    try {
      const incMap = dataSheet[row].investmentIncomeByKey || {};
      const incOut = {};
      for (const key in incMap) {
        const value = incMap[key] / scale;
        data['Income__' + key] = value;
        incOut[key] = value;
      }
      data.investmentIncomeByKey = incOut;
      const capMap = dataSheet[row].investmentCapitalByKey || {};
      const capOut = {};
      for (const key in capMap) {
        const value = capMap[key] / scale;
        data['Capital__' + key] = value;
        capOut[key] = value;
      }
      data.investmentCapitalByKey = capOut;
      // Add dynamic PV mirrors for per-investment income/capital so PV mode can
      // be exact-by-construction for dynamic columns as well.
      const incMapPV = dataSheet[row].investmentIncomeByKeyPV || {};
      const incOutPV = {};
      for (const key in incMapPV) {
        const value = incMapPV[key] / scale;
        data['Income__' + key + 'PV'] = value;
        incOutPV[key] = value;
      }
      data.investmentIncomeByKeyPV = incOutPV;
      const capMapPV = dataSheet[row].investmentCapitalByKeyPV || {};
      const capOutPV = {};
      for (const key in capMapPV) {
        const value = capMapPV[key] / scale;
        data['Capital__' + key + 'PV'] = value;
        capOutPV[key] = value;
      }
      data.investmentCapitalByKeyPV = capOutPV;

      // Add dynamic tax totals with display names from tax ruleset
      const taxMap = dataSheet[row].taxByKey || {};
      const age = dataSheet[row].age;
      const residenceCountry = RelocationUtils.getCountryForAge(age, this.ui) || Config.getInstance().getDefaultCountry();
      const residenceRuleSet = Config.getInstance().getCachedTaxRuleSet(residenceCountry);
      const residenceTaxOrder = (residenceRuleSet && typeof residenceRuleSet.getTaxOrder === 'function')
        ? residenceRuleSet.getTaxOrder()
        : [];
      const residenceTaxSet = {};
      for (let i = 0; i < residenceTaxOrder.length; i++) {
        const taxId = String(residenceTaxOrder[i] || '').toLowerCase();
        if (taxId) residenceTaxSet[taxId] = true;
      }
      const getResidenceTaxIdByLower = (taxIdLower) => {
        for (let i = 0; i < residenceTaxOrder.length; i++) {
          const rid = residenceTaxOrder[i];
          if (String(rid || '').toLowerCase() === taxIdLower) return rid;
        }
        return null;
      };

      const displayTaxMap = {};
      for (const rawTaxId in taxMap) {
        const taxAmount = taxMap[rawTaxId];
        if (typeof taxAmount !== 'number') continue;
        const rawTaxIdStr = String(rawTaxId || '');
        if (!rawTaxIdStr) continue;
        const sep = rawTaxIdStr.indexOf(':');
        if (sep > 0) {
          const baseTaxId = rawTaxIdStr.substring(0, sep);
          const baseTaxIdLower = baseTaxId.toLowerCase();
          const sourceCountryCode = String(rawTaxIdStr.substring(sep + 1) || '').toLowerCase();
          let displayTaxId = null;
          if (residenceTaxSet[baseTaxIdLower]) {
            displayTaxId = getResidenceTaxIdByLower(baseTaxIdLower) || baseTaxId;
          } else if (sourceCountryCode && residenceRuleSet) {
            const sourceRuleSet = Config.getInstance().getCachedTaxRuleSet(sourceCountryCode);
            if (sourceRuleSet && typeof sourceRuleSet.getEquivalentTaxIdIn === 'function') {
              displayTaxId = sourceRuleSet.getEquivalentTaxIdIn(residenceRuleSet, baseTaxId);
            }
          }
          if (!displayTaxId) displayTaxId = rawTaxIdStr;
          if (!displayTaxMap[displayTaxId]) displayTaxMap[displayTaxId] = 0;
          displayTaxMap[displayTaxId] += taxAmount;
        } else {
          if (!displayTaxMap[rawTaxIdStr]) displayTaxMap[rawTaxIdStr] = 0;
          displayTaxMap[rawTaxIdStr] += taxAmount;
        }
      }

      for (const displayTaxId in displayTaxMap) {
        data['Tax__' + displayTaxId] = displayTaxMap[displayTaxId] / scale;
      }
      // Add Tax PV fields for present-value mode support on deduction columns
      // These are computed by PresentValueCalculator and stored directly on dataSheet[row]
      const taxPvKeys = Object.keys(dataSheet[row]).filter(k => k.startsWith('Tax__') && k.endsWith('PV'));
      for (let ti = 0; ti < taxPvKeys.length; ti++) {
        const pvKey = taxPvKeys[ti];
        data[pvKey] = dataSheet[row][pvKey] / scale;
      }

      // Also add legacy hardcoded tax fields for backward compatibility with existing UI components
      // These will be dynamically populated from the taxByKey map
      if (displayTaxMap.incomeTax !== undefined) data.IT = displayTaxMap.incomeTax / scale;
      if (displayTaxMap.prsi !== undefined) data.PRSI = displayTaxMap.prsi / scale;
      if (displayTaxMap.usc !== undefined) data.USC = displayTaxMap.usc / scale;
      if (displayTaxMap.capitalGains !== undefined) data.CGT = displayTaxMap.capitalGains / scale;
    } catch (_) { }

    return data;
  }

  updateDataRow(row, progress, scale = 1, backgroundColor = null) {
    const data = this.buildDisplayDataRow(row, scale);
    if (!data) return;

    this.ui.setDataRow(row, data);
    this.ui.setChartsRow(row, data);

    // Apply background color if provided
    if (backgroundColor) {
      this.ui.setDataRowBackgroundColor(row, backgroundColor);
    }

    if (row % 5 === 0) {
      this.updateProgress("Updating " + Math.round(100 * progress) + "%");
    }
  }

  readParameters(validate = true) {
    const params = {
      startingAge: this.ui.getValue("StartingAge"),
      targetAge: this.ui.getValue("TargetAge"),
      initialSavings: this.ui.getValue("InitialSavings"),
      initialPension: this.ui.getValue("InitialPension"),
      retirementAge: this.ui.getValue("RetirementAge"),
      emergencyStash: this.ui.getValue("EmergencyStash"),
      pensionPercentage: this.ui.getValue("PensionContributionPercentage"),
      pensionCapped: this.ui.getValue("PensionContributionCapped"),
      statePensionWeekly: this.ui.getValue("StatePensionWeekly"),
      growthRatePension: this.ui.getValue("PensionGrowthRate"),
      growthDevPension: this.ui.getValue("PensionGrowthStdDev"),
      inflation: this.ui.getValue("Inflation"),
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

    // StartCountry is always required
    const cfg = Config.getInstance();
    params.StartCountry = cfg.getStartCountry();

    // Dynamic investment parameters from ruleset
    const ruleset = cfg.getCachedTaxRuleSet(params.StartCountry);
    const investmentTypes = ruleset.getResolvedInvestmentTypes() || [];
    const initialCapitalByKey = {};
    const investmentAllocationsByCountry = {};
    const investmentGrowthRatesByKey = {};
    const investmentVolatilitiesByKey = {};
    const globalBaseRefs = {};
    const startCountry = params.StartCountry.toLowerCase();
    const perCountryEnabledVal = this.ui.getValue('perCountryInvestmentsEnabled');
    const perCountryEnabled = (perCountryEnabledVal === 'on' || perCountryEnabledVal === true);
    investmentAllocationsByCountry[startCountry] = {};
    for (let i = 0; i < investmentTypes.length; i++) {
      const type = investmentTypes[i];
      const key = type.key;
      initialCapitalByKey[key] = this.ui.getValue(`InitialCapital_${key}`);
      // Allocation inputs can be rendered either as legacy `InvestmentAllocation_{typeKey}`
      // or as per-country `InvestmentAllocation_{countryCode}_{baseKey}` when relocation UI is enabled.
      let alloc = 0;
      try {
        if (!perCountryEnabled) {
          const suffix = '_' + startCountry;
          let baseKey = key;
          if (String(key).toLowerCase().endsWith(suffix)) {
            baseKey = String(key).slice(0, String(key).length - suffix.length);
          }
          const globalId = `GlobalAllocation_${baseKey}`;
          if (typeof document === 'undefined' || document.getElementById(globalId)) {
            alloc = this.ui.getValue(globalId);
          } else {
            alloc = this.ui.getValue(`InvestmentAllocation_${key}`);
          }
        } else {
          alloc = this.ui.getValue(`InvestmentAllocation_${key}`);
        }
      } catch (_) {
        alloc = 0;
      }
      investmentAllocationsByCountry[startCountry][key] = alloc;
      if (!type.sellWhenReceived) {
        if (type.baseRef) {
          globalBaseRefs[type.baseRef] = true;
        } else {
          const growthId = `${key}GrowthRate`;
          if (typeof document !== 'undefined' && !document.getElementById(growthId)) {
            continue;
          }
          investmentGrowthRatesByKey[key] = this.ui.getValue(growthId);
          investmentVolatilitiesByKey[key] = this.ui.getValue(`${key}GrowthStdDev`);
        }
      }        
    }
    params.initialCapitalByKey = initialCapitalByKey;
    params.investmentAllocationsByCountry = investmentAllocationsByCountry;
    params.investmentGrowthRatesByKey = investmentGrowthRatesByKey;
    params.investmentVolatilitiesByKey = investmentVolatilitiesByKey;

    const baseRefKeys = Object.keys(globalBaseRefs);
    for (let i = 0; i < baseRefKeys.length; i++) {
      const baseRef = baseRefKeys[i];
      const growthId = `GlobalAssetGrowth_${baseRef}`;
      const volId = `GlobalAssetVolatility_${baseRef}`;
      if (this.ui && typeof this.ui.ensureParameterInput === 'function') {
        this.ui.ensureParameterInput(growthId, 'percentage');
        this.ui.ensureParameterInput(volId, 'percentage');
      }
      params[growthId] = this.ui.getValue(growthId);
      params[volId] = this.ui.getValue(volId);
    }

    // Relocation-enabled: read per-country allocations from country-prefixed fields
    // Convention: InvestmentAllocation_{countryCode}_{typeKey} (typeKey without country suffix)
    try {
      if (cfg.isRelocationEnabled && cfg.isRelocationEnabled()) {
        // Derive scenario countries from MV events + StartCountry
        let scenarioCountries = null;
        if (this.ui && typeof this.ui.getScenarioCountries === 'function') {
          scenarioCountries = this.ui.getScenarioCountries();
        } else {
          // Fallback: parse events directly (UIManager already knows how)
          const evs = this.readEvents(false) || [];
          const set = {};
          set[startCountry] = true;
          for (let i = 0; i < evs.length; i++) {
            const ev = evs[i];
            if (ev && ev.type === 'MV') {
              const cc = getRelocationCountryCode(ev);
              if (cc) set[cc] = true;
            }
          }
          scenarioCountries = Object.keys(set);
        }

        for (let ci = 0; ci < scenarioCountries.length; ci++) {
          const c = String(scenarioCountries[ci] || '').trim().toLowerCase();
          if (!c) continue;
          if (!investmentAllocationsByCountry[c]) investmentAllocationsByCountry[c] = {};
          const rs = cfg.getCachedTaxRuleSet(c);
          const types = rs.getResolvedInvestmentTypes() || [];
          for (let ti = 0; ti < types.length; ti++) {
            const type = types[ti] || {};
            const key = type.key;
            if (!key) continue;
            const suffix = '_' + c;
            const baseKey = (String(key).toLowerCase().endsWith(suffix)) ? String(key).slice(0, String(key).length - suffix.length) : String(key);
            const fieldId = `InvestmentAllocation_${c}_${baseKey}`;
            investmentAllocationsByCountry[c][key] = this.ui.getValue(fieldId);

            // Relocation economy panel stores local wrapper rates under:
            // LocalAssetGrowth_{country}_{baseKey} / LocalAssetVolatility_{country}_{baseKey}
            // Read them here so non-start-country local wrappers (e.g. merval_ar) are not left at 0.
            if (!type.sellWhenReceived) {
              if (type.baseRef) {
                globalBaseRefs[type.baseRef] = true;
              } else {
                const localGrowthId = `LocalAssetGrowth_${c}_${baseKey}`;
                const localVolId = `LocalAssetVolatility_${c}_${baseKey}`;
                const hasGrowthInput = (typeof document === 'undefined') || !!document.getElementById(localGrowthId);
                const hasVolInput = (typeof document === 'undefined') || !!document.getElementById(localVolId);
                if (hasGrowthInput) {
                  const growthVal = this.ui.getValue(localGrowthId);
                  if (growthVal !== null && growthVal !== undefined && growthVal !== '') {
                    investmentGrowthRatesByKey[key] = growthVal;
                  }
                }
                if (hasVolInput) {
                  const volVal = this.ui.getValue(localVolId);
                  if (volVal !== null && volVal !== undefined && volVal !== '') {
                    investmentVolatilitiesByKey[key] = volVal;
                  }
                }
              }
            }
          }
        }

        // Backward compatibility: if old format `InvestmentAllocation_{key}` exists, map to StartCountry
        // (DOMUtils.getValue throws if missing; detect via DOM when possible).
        try {
          if (typeof document !== 'undefined') {
            for (let i = 0; i < investmentTypes.length; i++) {
              const key = investmentTypes[i] && investmentTypes[i].key;
              if (!key) continue;
              const oldId = `InvestmentAllocation_${key}`;
              if (document.getElementById(oldId)) {
                investmentAllocationsByCountry[startCountry][key] = this.ui.getValue(oldId);
              }
            }
          }
        } catch (_) { }
      }
    } catch (_) { }

    // Per-country pension contributions (relocation-aware)
    params.pensionContributionsByCountry = {};
    if (cfg.isRelocationEnabled && cfg.isRelocationEnabled()) {
      const scenarioCountries = (this.ui && typeof this.ui.getScenarioCountries === 'function')
        ? this.ui.getScenarioCountries()
        : [startCountry];
      for (let ci = 0; ci < scenarioCountries.length; ci++) {
        const c = String(scenarioCountries[ci] || '').trim().toLowerCase();
        if (!c) continue;
        const rs = cfg.getCachedTaxRuleSet(c);
        if (!rs) continue;
        if (rs.hasPrivatePensions && typeof rs.hasPrivatePensions === 'function' && !rs.hasPrivatePensions()) continue;
        const p1Pct = this.ui.getValue(`P1PensionContrib_${c}`);
        const p2Pct = this.ui.getValue(`P2PensionContrib_${c}`);
        const capped = this.ui.getValue(`PensionCapped_${c}`);
        params.pensionContributionsByCountry[c] = {
          p1Pct: (p1Pct !== null && p1Pct !== '') ? parseFloat(p1Pct) : 0,
          p2Pct: (p2Pct !== null && p2Pct !== '') ? parseFloat(p2Pct) : 0,
          capped: capped || 'No'
        };
      }
    }

    // Ensure StartCountry pension contribution settings exist (single-country UI uses global fields).
    const startCountryLower = startCountry.toLowerCase();
    if (!params.pensionContributionsByCountry[startCountryLower]) {
      params.pensionContributionsByCountry[startCountryLower] = {
        p1Pct: params.pensionPercentage || 0,
        p2Pct: params.pensionPercentageP2 || 0,
        capped: params.pensionCapped || 'No'
      };
    }

    // State pension (per-country): Convention StatePension_{countryCode}
    // Note: actual period semantics are derived from ruleset config, not the field ID.
    const statePensionByCountry = {};
    const p2StatePensionByCountry = {};
    if (cfg.isRelocationEnabled && cfg.isRelocationEnabled()) {
      let scenarioCountries = null;
      if (this.ui && typeof this.ui.getScenarioCountries === 'function') {
        scenarioCountries = this.ui.getScenarioCountries();
      } else {
        scenarioCountries = [startCountry];
      }
      for (let i = 0; i < scenarioCountries.length; i++) {
        const c = String(scenarioCountries[i] || '').trim().toLowerCase();
        if (!c) continue;
        const id = `StatePension_${c}`;
        const idP2 = `P2StatePension_${c}`;
        // Only read if the element exists (avoid throwing in non-web environments).
        if (typeof document !== 'undefined' && !document.getElementById(id)) continue;
        statePensionByCountry[c] = this.ui.getValue(id);
        if (typeof document !== 'undefined' && document.getElementById(idP2)) {
          p2StatePensionByCountry[c] = this.ui.getValue(idP2);
        }
      }
    }
    // Single-country UI: StatePensionWeekly / P2StatePensionWeekly apply to StartCountry.
    if (statePensionByCountry[startCountry] === undefined || statePensionByCountry[startCountry] === null) {
      statePensionByCountry[startCountry] = params.statePensionWeekly;
    }
    if (p2StatePensionByCountry[startCountry] === undefined || p2StatePensionByCountry[startCountry] === null) {
      p2StatePensionByCountry[startCountry] = params.p2StatePensionWeekly;
    }
    params.statePensionByCountry = statePensionByCountry;
    params.p2StatePensionByCountry = p2StatePensionByCountry;

    // Read per-country tax credits
    params.taxCreditsByCountry = params.taxCreditsByCountry || {};
    const taxCreditCountries = (this.ui && typeof this.ui.getScenarioCountries === 'function')
      ? this.ui.getScenarioCountries()
      : [startCountry];
    taxCreditCountries.forEach(country => {
      const c = String(country || '').trim().toLowerCase();
      if (!c) return;
      const rs = cfg.getCachedTaxRuleSet(c);
      if (!rs || typeof rs.getUIConfigurableCredits !== 'function') return;
      const credits = rs.getUIConfigurableCredits();
      if (!credits || credits.length === 0) return;
      params.taxCreditsByCountry[c] = params.taxCreditsByCountry[c] || {};
      credits.forEach(credit => {
        const creditId = credit.id;
        const fieldId = `TaxCredit_${creditId}_${c}`;
        const el = (typeof document !== 'undefined') ? document.getElementById(fieldId) : null;
        if (typeof document !== 'undefined' && !el) return;
        if (el && el.value === '') return;
        const val = this.ui.getValue(fieldId);
        if (val !== null && val !== '' && val !== undefined) {
          params.taxCreditsByCountry[c][creditId] = parseFloat(val);
        }
      });
    });

    // Map PersonalTaxCredit override to StartCountry personal credit input (UI convenience).
    const legacyCredit = this.ui.getValue('PersonalTaxCredit');
    if (legacyCredit !== null && legacyCredit !== '' && legacyCredit !== undefined) {
      const startCountryLegacy = params.StartCountry.toLowerCase();
      if (!params.taxCreditsByCountry[startCountryLegacy]) {
        params.taxCreditsByCountry[startCountryLegacy] = {};
      }
      if (!params.taxCreditsByCountry[startCountryLegacy].personal) {
        params.taxCreditsByCountry[startCountryLegacy].personal = parseFloat(legacyCredit);
      }
    }

    const legacyPriorityIdsByBaseType = {
      cash: 'PriorityCash',
      pension: 'PriorityPension',
      indexFunds: 'PriorityFunds',
      shares: 'PriorityShares'
    };
    const readPriorityValue = (baseType, defaultValue) => {
      const fieldId = 'Priority_' + baseType;
      const legacyId = legacyPriorityIdsByBaseType[baseType];
      let value;
      if (typeof document === 'undefined' || document.getElementById(fieldId)) {
        try {
          value = this.ui.getValue(fieldId);
        } catch (_) {
          value = undefined;
        }
      }
      if (value === null || value === '' || value === undefined) {
        if (legacyId && (typeof document === 'undefined' || document.getElementById(legacyId))) {
          try {
            value = this.ui.getValue(legacyId);
          } catch (_) {
            value = undefined;
          }
        }
      }
      if (value === null || value === '' || value === undefined) {
        return defaultValue;
      }
      return value;
    };

    params.priorityCash = readPriorityValue('cash', 1);
    params.priorityPension = readPriorityValue('pension', 2);
    params.priorityFunds = readPriorityValue('indexFunds', 3);
    params.priorityShares = readPriorityValue('shares', 4);

    // Build drawdown priority map keyed by investment type key.
    params.drawdownPrioritiesByKey = {};
    const allocCountries = Object.keys(params.investmentAllocationsByCountry || {});
    
    for (let ci = 0; ci < allocCountries.length; ci++) {
      const cc = allocCountries[ci];
      const ruleset = Config.getInstance().getCachedTaxRuleSet(cc);
      const types = (typeof ruleset.getResolvedInvestmentTypes === 'function') ? ruleset.getResolvedInvestmentTypes() : [];
      for (let ti = 0; ti < types.length; ti++) {
        const type = types[ti];
        if (!type || !type.key) continue;
        if (type.sellWhenReceived) continue;
        const baseType = String(type.key).split('_')[0];
        const val = readPriorityValue(baseType, 4);
        params.drawdownPrioritiesByKey[type.key] = val;
      }
    }
    params.drawdownPrioritiesByKey.cash = readPriorityValue('cash', 1);
    params.drawdownPrioritiesByKey.pension = readPriorityValue('pension', 2);

    // In deterministic mode, override volatility parameters to 0 to ensure fixed growth rates
    if (params.economyMode === 'deterministic') {
      params.growthDevPension = 0;
      const volKeys = Object.keys(params.investmentVolatilitiesByKey);
      for (let i = 0; i < volKeys.length; i++) {
        params.investmentVolatilitiesByKey[volKeys[i]] = 0;
      }
      for (let i = 0; i < baseRefKeys.length; i++) {
        params['GlobalAssetVolatility_' + baseRefKeys[i]] = 0;
      }
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
          this.ui.setWarning("RetirementAge", "Only occupational pension schemes allow retirement before age " + minOcc + ".");
        }
        if (params.retirementAge < minPriv) {
          this.ui.setWarning("RetirementAge", "Private pensions don't normally allow retirement before age " + minPriv + ".");
        }
      } catch (_) {
        if (params.retirementAge < config.minOccupationalPensionRetirementAge) {
          this.ui.setWarning("RetirementAge", "Only occupational pension schemes allow retirement before age " + config.minOccupationalPensionRetirementAge + ".");
        }
        if (params.retirementAge < config.minPrivatePensionRetirementAge) {
          this.ui.setWarning("RetirementAge", "Private pensions don't normally allow retirement before age " + config.minPrivatePensionRetirementAge + ".");
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
          this.ui.setWarning("P2RetirementAge", "Only occupational pension schemes allow retirement before age " + minOcc + ".");
        }
        if (params.p2RetirementAge < minPriv) {
          this.ui.setWarning("P2RetirementAge", "Private pensions don't normally allow retirement before age " + minPriv + ".");
        }
      } catch (_) {
        if (params.p2RetirementAge < config.minOccupationalPensionRetirementAge) {
          this.ui.setWarning("P2RetirementAge", "Only occupational pension schemes allow retirement before age " + config.minOccupationalPensionRetirementAge + ".");
        }
        if (params.p2RetirementAge < config.minPrivatePensionRetirementAge) {
          this.ui.setWarning("P2RetirementAge", "Private pensions don't normally allow retirement before age " + config.minPrivatePensionRetirementAge + ".");
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

      // Dynamic investment allocations sum ≤100% (per country)
      const allocCountries = Object.keys(params.investmentAllocationsByCountry || {});
      for (let ci = 0; ci < allocCountries.length; ci++) {
        const cc = allocCountries[ci];
        const map = params.investmentAllocationsByCountry[cc] || {};
        const keys = Object.keys(map);
        let sum = 0;
        for (let i = 0; i < keys.length; i++) sum += parseFloat(map[keys[i]]) || 0;
        if (sum > 1.0001) {
          const rs = cfg.getCachedTaxRuleSet(cc);
          const types = rs.getResolvedInvestmentTypes ? (rs.getResolvedInvestmentTypes() || []) : [];
          const labels = types.map(function (t) { return t.label || t.key; }).join(' + ');
          for (let i = 0; i < types.length; i++) {
            const t = types[i] || {};
            const key = t.key;
            if (!key) continue;
            // Prefer country-prefixed ID; fall back to unprefixed if present.
            const suffix = '_' + cc;
            const baseKey = (String(key).toLowerCase().endsWith(suffix)) ? String(key).slice(0, String(key).length - suffix.length) : String(key);
            const prefId = `InvestmentAllocation_${cc}_${baseKey}`;
            const legacyId = `InvestmentAllocation_${key}`;
            const warnId = (typeof document !== 'undefined' && document.getElementById(prefId)) ? prefId : legacyId;
            this.ui.setWarning(warnId, `${labels} allocations can't exceed 100%`);
          }
          errors = true;
        }
      }

      // Validate percentage fields
      this.validateParameterPercentageFields(params);

      // Validate volatility parameters for variable rate mode
      if (params.economyMode === 'montecarlo') {
        // Check if any volatility is > 0 (pension + dynamic investment types)
        let hasNonZeroVol = params.growthDevPension > 0;
        const volKeys = Object.keys(params.investmentVolatilitiesByKey);
        for (let i = 0; i < volKeys.length && !hasNonZeroVol; i++) {
          if (parseFloat(params.investmentVolatilitiesByKey[volKeys[i]]) > 0) hasNonZeroVol = true;
        }
        if (!hasNonZeroVol) {
          const labels = investmentTypes.map(function (t) { return t.label || t.key; }).join(', ');
          this.ui.setWarning("PensionGrowthStdDev", "At least one volatility rate must be greater than 0% in variable growth mode");
          for (let i = 0; i < investmentTypes.length; i++) {
            const volId = `${investmentTypes[i].key}GrowthStdDev`;
            this.ui.setWarning(volId, `At least one of Pension, ${labels} volatility must be > 0% in variable growth mode`);
          }
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

    // StartCountry is mandatory
    if (!this.hasValue(params.StartCountry)) {
      this.ui.setWarning('StartCountry', UIManager.REQUIRED_FIELD_MESSAGE);
      errors = true;
    }
  }

  readEvents(validate = true) {
    const events = [];
    const rows = this.ui.getTableData("Events", 6);

    // Build list of visible event table rows to hydrate relocationImpact from dataset (web UI only)
    let __visibleEventRows = null;
    try {
      if (typeof document !== 'undefined') {
        __visibleEventRows = Array.from(document.querySelectorAll('#Events tbody tr'))
          .filter(function (row) {
            return row && row.style.display !== 'none' && !(row.classList && row.classList.contains('resolution-panel-row'));
          });
      }
    } catch (_) { /* Non-DOM environments (GAS) */ }

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

        if (Config.getInstance().isRelocationEnabled()) {
          valid["MV"] = "Relocation";
        }

        if (!valid.hasOwnProperty(type)) {
          const validTypesMsg = Object.keys(valid)
            .map(key => `${key} (${valid[key]})`)
            .join(", ");
          this.ui.setWarning(`Events[${i + 1},1]`, `Invalid event type. Valid types are: ${validTypesMsg}`);
          errors = true;
          break;
        }

        if (type === 'MV') {
          const destCode = String(name || '').trim();
          if (!destCode) {
            this.ui.setWarning(`Events[${i + 1},2]`, 'Relocation destination country is required.');
            errors = true;
            break;
          }
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


      const eventObj = new SimEvent(
        type, id, amount, processedFromAge,
        (processedToAge === "" && (type === "R" || type === "DBI")) ? 999 : processedToAge,
        (rate === "") ? undefined : rate,
        (match === "") ? undefined : match
      );
      if (type === 'MV') {
        eventObj.name = id;
      }
      events.push(eventObj);

      // Always mirror the runtime row id for MV events so relocation references stay stable
      // even when names are duplicated or later edited.
      if (type === 'MV' && __visibleEventRows) {
        const domRow = __visibleEventRows[events.length - 1];
        if (domRow && domRow.dataset && domRow.dataset.eventId) {
          eventObj._mvRuntimeId = domRow.dataset.eventId;
        }
      }

      // Read hidden fields from DOM row (mirror accordion extraction)
      try {
        if (__visibleEventRows) {
          const domRow = __visibleEventRows[events.length - 1];
          if (domRow) {
            const currencyInput = domRow.querySelector('.event-currency');
            if (currencyInput && currencyInput.value) eventObj.currency = currencyInput.value;

            const linkedCountryInput = domRow.querySelector('.event-linked-country');
            if (linkedCountryInput && linkedCountryInput.value) eventObj.linkedCountry = linkedCountryInput.value;

            const linkedEventIdInput = domRow.querySelector('.event-linked-event-id');
            if (linkedEventIdInput && linkedEventIdInput.value) eventObj.linkedEventId = linkedEventIdInput.value;

            const splitMvIdInput = domRow.querySelector('.event-relocation-split-mv-id');
            if (splitMvIdInput && splitMvIdInput.value) eventObj.relocationSplitMvId = splitMvIdInput.value;
            const splitAnchorAgeInput = domRow.querySelector('.event-relocation-split-anchor-age');
            if (splitAnchorAgeInput && splitAnchorAgeInput.value !== '') {
              const splitAnchorAge = Number(splitAnchorAgeInput.value);
              if (!isNaN(splitAnchorAge)) eventObj.relocationSplitAnchorAge = splitAnchorAge;
            }

            const relocationLinkIdInput = domRow.querySelector('.event-relocation-link-id');
            if (relocationLinkIdInput && relocationLinkIdInput.value) eventObj.relocationLinkId = relocationLinkIdInput.value;

            const sellMvIdInput = domRow.querySelector('.event-relocation-sell-mv-id');
            if (sellMvIdInput && sellMvIdInput.value) eventObj.relocationSellMvId = sellMvIdInput.value;
            const sellAnchorAgeInput = domRow.querySelector('.event-relocation-sell-anchor-age');
            if (sellAnchorAgeInput && sellAnchorAgeInput.value !== '') {
              const sellAnchorAge = Number(sellAnchorAgeInput.value);
              if (!isNaN(sellAnchorAge)) eventObj.relocationSellAnchorAge = sellAnchorAge;
            }

            const overrideInput = domRow.querySelector('.event-resolution-override');
            if (overrideInput && overrideInput.value) eventObj.resolutionOverride = overrideInput.value;
          }
        }
      } catch (_) { /* never block readEvents on hidden-field hydration */ }

      // Hydrate relocationImpact from corresponding DOM row dataset if available
      try {
        if (__visibleEventRows) {
          const domRow = __visibleEventRows[events.length - 1];
          if (domRow && domRow.dataset && domRow.dataset.relocationImpact === '1') {
            eventObj.relocationImpact = {
              category: domRow.dataset.relocationImpactCategory || '',
              message: domRow.dataset.relocationImpactMessage || '',
              autoResolvable: domRow.dataset.relocationImpactAuto === '1',
              mvEventId: domRow.dataset.relocationImpactMvId || undefined
            };
          }
        }
      } catch (_) { /* never block readEvents on hydration */ }
    }

    if (validate) {
      this.validateEventFields(events);
      this.validateMortgageEvents(events);
      this.validateRentalIncomeEvents(events);
      this.validateAgeYearFields(events);
      this.validateRequiredEvents(events);
    }

    return events;
  }

  // Helper function to calculate birth year for a person based on event type
  calculateBirthYear(eventType, startingAge, p2StartingAge) {
    const currentYear = Config.getInstance().getSimulationStartYear();
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
              this.ui.setWarning(`Events[${m + 1},3]`, "The mortgage (M) and purchase (R) events for a property must have the same starting age.");
              errors = true;
            }
            if (events[m].toAge > events[p].toAge) {
              this.ui.setWarning(`Events[${m + 1},4]`, "The mortgage must end when the property is sold.");
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

  validateRentalIncomeEvents(events) {
    for (let ri = 0; ri < events.length; ri++) {
      if (events[ri].type === 'RI') {
        let found = false;
        for (let r = 0; r < events.length; r++) {
          if (events[r].type === 'R' && events[r].id === events[ri].id) {
            found = true;
            if (events[ri].fromAge < events[r].fromAge) {
              this.ui.setWarning(`Events[${ri + 1},3]`, "Rental income cannot start before the property purchase.");
              errors = true;
            }
            if (events[r].toAge && events[ri].toAge > events[r].toAge) {
              this.ui.setWarning(`Events[${ri + 1},4]`, "Rental income cannot extend beyond the property sale.");
              errors = true;
            }
          }
        }
        if (!found) {
          this.ui.setWarning(`Events[${ri + 1},1]`, `Couldn't find a property event for rental income '${events[ri].id}'.`);
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
        switch (field) {
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
    if (eventType === 'MV') {
      const pattern = 'rrr-o-'.split('');
      return Object.fromEntries(UIManager.getFields().map((field, i) => [
        field,
        pattern[i] === 'r' ? 'required' : pattern[i] === 'o' ? 'optional' : 'hidden'
      ]));
    }
    // r=required, o=optional, -=hidden
    const patterns = {
      'NOP': 'oooooo',
      'RI': 'rrrro-',
      'SI': 'rrrroo',
      'SInp': 'rrrro-',
      'SI2': 'rrrroo',    // Added for Person 2 Pensionable Salary
      'SI2np': 'rrrro-',  // Added for Person 2 Non-Pensionable Salary
      'UI': 'rrrro-',
      'DBI': 'rrroo-',
      'FI': 'rrrro-',
      'E': 'rrrro-',
      'R': 'rrroo-',
      'M': 'rrrrr-',
      'SM': 'r-rrr-'
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
        name: (function () {
          try {
            const cfg = Config.getInstance();
            const rs = cfg.getCachedTaxRuleSet(cfg.getDefaultCountry());
            const f = rs && rs.findInvestmentTypeByKey ? rs.findInvestmentTypeByKey('indexFunds') : null;
            if (f && f.label) return `${f.label} Allocation`;
          } catch (_) { }
          return 'Index Funds Allocation';
        })(),
        min: 0,
        max: 1,
        unit: '%'
      },
      {
        value: params.SharesAllocation,
        fieldId: 'SharesAllocation',
        name: (function () {
          try {
            const cfg = Config.getInstance();
            const rs = cfg.getCachedTaxRuleSet(cfg.getDefaultCountry());
            const s = rs && rs.findInvestmentTypeByKey ? rs.findInvestmentTypeByKey('shares') : null;
            if (s && s.label) return `${s.label} Allocation`;
          } catch (_) { }
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
