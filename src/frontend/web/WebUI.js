var WebUI_instance = null;

class WebUI extends AbstractUI {

  constructor() {
    super();

    // Initialize simulation state tracking
    this.isSimulationRunning = false;
    this.currentSimMode = 'single'; // Default to single person mode
    this.currentEconomyMode = 'deterministic'; // Default to deterministic mode
    this.preservedVolatilityValues = {}; // Store volatility values when switching modes

    this.p1Labels = {
      'StartingAge': { neutral: 'Current Age', your: 'Your Current Age' },
      'InitialPension': { neutral: 'Pension Fund', your: 'Your Pension Fund' },
      'RetirementAge': { neutral: 'Retirement Age', your: 'Your Retirement Age' },
      'StatePensionWeekly': { neutral: 'State Pension (Weekly)', your: 'Your State Pension (Weekly)' },
      'InitialSavings': { neutral: 'Current Savings', your: 'Current Savings (Joint)' }
    };
    this.p2InputIds = ['P2StartingAge', 'InitialPensionP2', 'P2RetirementAge', 'P2StatePensionWeekly'];

    // Country chip selectors (relocation-enabled scenarios only)
    this.allocationsCountryChipSelector = null;
    this.personalCircumstancesCountryChipSelector = null;
    this.economyCountryChipSelector = null;
    this._allocationValueCache = {};
    this.pensionCappedDropdowns = {};
    this.countryTabSyncManager = CountryTabSyncManager.getInstance();

    // Initialize in a specific order to ensure dependencies are met
    this.formatUtils = new FormatUtils();
    this.notificationUtils = new NotificationUtils();
    this.errorModalUtils = new ErrorModalUtils();
    this.fieldLabelsManager = FieldLabelsManager.getInstance();
    this.chartManager = new ChartManager(this);
    this.tableManager = new TableManager(this);
    this.fileManager = new FileManager(this);
    this.eventsTableManager = new EventsTableManager(this);
    this.eventAccordionManager = new EventAccordionManager(this);
    this.eventsWizard = new EventsWizard(this);
    this.dragAndDrop = new DragAndDrop();

    // Initialize WelcomeModal with error checking
    try {
      this.welcomeModal = new WelcomeModal();
    } catch (error) {
      console.error('Error creating WelcomeModal:', error);
      this.welcomeModal = null;
    }

    this.editCallbacks = new Map();
    this.countryTabSyncManager.addSyncStateListener(() => {
      this._syncCountryTabsFromManager();
    });

    // Connect error modal to notification utils
    this.notificationUtils.setErrorModalUtils(this.errorModalUtils);

    // Setup event listeners
    this.setupChangeListener();
    this.setupRunSimulationButton();
    this.setupWizardInvocation();
    this.setupNavigation();
    this.setupLoadDemoScenarioButton();
    this.setupSimModeToggle(); // Setup the single/couple mode toggle
    this.setupEconomyModeToggle(); // Setup the deterministic/Monte Carlo mode toggle
    this.setupParameterTooltips(); // Setup parameter age field tooltips
    this.setupVisualizationControls(); // Setup visualization controls
    this.setupCardInfoIcons(); // Setup info icons on cards
    this.setupDataExportButton(); // Setup data table CSV export button
    this.setupIconTooltips(); // Setup tooltips for various mode toggle icons
    this.setupCursorEndOnFocus(); // Ensure caret is placed at the end when inputs receive focus
    this.setupMobileLongPressHelp(); // Long-press on inputs/selects opens contextual help on mobile
    this.setupStatusClickHandler(); // Setup click handler for relocation impact status
    this.parameterTooltipTimeout = null; // Reference to parameter tooltip delay timeout

    // Defer adding the initial empty event row until after Config is initialized

    // Set initial UI state
    this.setStatus("Ready", STATUS_COLORS.INFO);
    // Baseline will be established after Config is initialized (see DOMContentLoaded)

    this.updateUIForSimMode(); // Set initial UI state based on mode
    this.updateUIForEconomyMode(); // Set initial UI state for economy mode
    if (this.eventsTableManager) { // Ensure event table UI is also updated on init
      this.eventsTableManager.updateEventRowsVisibilityAndTypes();
    }
  }

  // Singleton
  static getInstance() {
    if (!WebUI_instance) {
      WebUI_instance = new WebUI();
    }
    return WebUI_instance;
  }

  setStatus(message, color = STATUS_COLORS.INFO) {
    this.notificationUtils.setStatus(message, color);
  }

  setError(message) {
    this.notificationUtils.setError(message);
  }

  setWarning(elementId, message) {
    this.notificationUtils.setWarning(elementId, message);
  }

  clearElementWarning(element) {
    this.notificationUtils.clearElementWarning(element);
  }

  clearAllWarnings() {
    this.notificationUtils.clearAllWarnings();
  }

  updateStatusForRelocationImpacts(events) {
    let count = 0;
    for (let i = 0; i < events.length; i++) {
      if (events[i].relocationImpact) count++;
    }
    const statusElement = document.getElementById('progress');
    if (count > 0) {
      // Show count only; icon is rendered via CSS ::before for consistent sizing/color
      this.setStatus(String(count), STATUS_COLORS.WARNING);
      statusElement.classList.add('relocation-impact');
      this.relocationImpactCount = count;
    } else {
      // Guard against overwriting active statuses
      const currentText = statusElement ? (statusElement.textContent || '') : '';
      const isRunning = currentText === 'Running...';
      const isError = statusElement && statusElement.classList.contains('error');
      if (!isRunning && !isError) {
        this.setStatus("Ready", STATUS_COLORS.INFO);
      }
      statusElement.classList.remove('relocation-impact');
      this.relocationImpactCount = null;
    }
    // Update run button state based on relocation impacts
    this.updateRunButtonState();
  }

  updateRunButtonState() {
    const runButton = document.getElementById('runSimulation');
    const mobileRunButton = document.getElementById('runSimulationMobile');
    const hasImpacts = this.relocationImpactCount && this.relocationImpactCount > 0;

    // Don't disable if simulation is already running
    if (this.isSimulationRunning) {
      return;
    }

    if (runButton) {
      runButton.disabled = hasImpacts;
      if (hasImpacts) {
        runButton.classList.add('disabled');
        runButton.style.pointerEvents = 'none';
      } else {
        runButton.classList.remove('disabled');
        runButton.style.pointerEvents = '';
      }
    }

    if (mobileRunButton) {
      mobileRunButton.disabled = hasImpacts;
      if (hasImpacts) {
        mobileRunButton.classList.add('disabled');
        mobileRunButton.style.pointerEvents = 'none';
      } else {
        mobileRunButton.classList.remove('disabled');
        mobileRunButton.style.pointerEvents = '';
      }
    }
  }

  setupStatusClickHandler() {
    this.statusElement = document.getElementById('progress');
    this.statusElement.addEventListener('click', () => {
      if (this.statusElement.classList.contains('relocation-impact') && this.relocationImpactCount) {
        this.showAlert(
          `${this.relocationImpactCount} events need attention due to relocations in your timeline. Click the warning badges (⚠️) on affected events to resolve them.`,
          "Relocation Impacts Need Review"
        ).then(() => {
          if (this.eventsTableManager && typeof this.eventsTableManager.navigateToFirstImpact === 'function') {
            this.eventsTableManager.navigateToFirstImpact();
          }
        });
      }
    });

    // Also bind click handler for mobile status indicator if present
    const mobileStatusElement = document.getElementById('progressMobile');
    if (mobileStatusElement) {
      mobileStatusElement.addEventListener('click', () => {
        if (mobileStatusElement.classList.contains('relocation-impact') && this.relocationImpactCount) {
          this.showAlert(
            `Cannot run simulation. ${this.relocationImpactCount} events need attention due to relocations in your timeline. Click the warning badges (⚠️) on affected events to resolve them.`,
            "Relocation Impacts Need Review"
          ).then(() => {
            if (this.eventsTableManager && typeof this.eventsTableManager.navigateToFirstImpact === 'function') {
              this.eventsTableManager.navigateToFirstImpact();
            }
          });
        }
      });
    }
  }

  getTableData(groupId, columnCount = 1, includeHiddenEventTypes = false) {
    return this.tableManager.getTableData(groupId, columnCount, includeHiddenEventTypes);
  }

  getStartCountryRaw() {
    return this.getValue('StartCountry');
  }

  setDataRow(rowIndex, data) {
    this.tableManager.setDataRow(rowIndex, data);
  }

  rerenderData() {
    if (window.dataSheet && window.dataSheet.length > 0) {
      this.tableManager.conversionCache = {};
      this.tableManager.storedCountryTimeline = null; // Invalidate stored timeline before rerender
      const uiMgr = (typeof uiManager !== 'undefined') ? uiManager : null;
      const scale = runs;
      for (let i = 1; i < window.dataSheet.length; i++) {
        let rowData = window.dataSheet[i];
        if (uiMgr && typeof uiMgr.buildDisplayDataRow === 'function') {
          rowData = uiMgr.buildDisplayDataRow(i, scale);
        }
        if (!rowData) continue;
        this.tableManager.setDataRow(i, rowData);
      }
      try { this.tableManager.finalizeDataTableLayout(); } catch (_) { }
    } else if (this.tableManager && typeof this.tableManager.refreshDisplayedCurrencies === 'function') {
      // Fallback path for test/preview contexts where dataSheet isn't populated
      this.tableManager.refreshDisplayedCurrencies();
    }
  }

  setDataRowBackgroundColor(rowIndex, backgroundColor) {
    this.tableManager.setDataRowBackgroundColor(rowIndex, backgroundColor);
  }

  setChartsRow(rowIndex, data) {
    this.chartManager.updateChartsRow(rowIndex, data);
  }

  downloadDataTableCSV() {
    return this.tableManager.downloadDataTableCSV();
  }

  getVersion() {
    const key = 'simulatorVersion';
    let stored = null;
    if (typeof localStorage !== 'undefined') {
      stored = localStorage.getItem(key);
    }
    // Record whether a version was actually present in localStorage so callers
    // (e.g. Config.initialize) can decide whether to show one-time update toasts.
    this._hasStoredVersion = (stored !== null && stored !== undefined);
    return stored || '1.27'; // TODO: Has to be a better way to get the starting default version
  }

  setVersion(version) {
    const key = 'simulatorVersion';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, version);
    }
    const versionSpan = document.querySelector('.version');
    if (versionSpan) {
      versionSpan.textContent = `Version ${version}`;
    }
  }

  showAlert(message, title = 'Warning', buttons = false) {
    return this.notificationUtils.showAlert(message, title, buttons);
  }

  showToast(message, title, timeout) {
    this.notificationUtils.showToast(message, title, timeout);
  }

  showWelcomeModal() {
    if (!this.welcomeModal) {
      console.error('WelcomeModal not available');
      return;
    }

    try {
      // Show welcome modal with callbacks for quick tour and full tour
      this.welcomeModal.show(
        () => {
          // Callback for "Quick Tour" button - start the quick tour
          const wizard = Wizard.getInstance();
          if (wizard) {
            wizard.start({ type: 'quick' }); // Start the quick tour
          }
        },
        () => {
          // Callback for "Full Tour" button - start the original wizard tour from header buttons
          const wizard = Wizard.getInstance();
          if (wizard) {
            wizard.start({ type: 'help', startAtStep: 0 }); // Start at header overview
          }
        }
      );
    } catch (error) {
      console.error('Error showing welcome modal:', error);
    }
  }

  setVersionNote(message) {
    this.notificationUtils.setVersionNote(message);
  }

  clearVersionNote() {
    this.notificationUtils.clearVersionNote();
  }

  setVersionHighlight(warning) {
    this.notificationUtils.setVersionHighlight(warning);
  }

  // No-op placeholder; app-level code update toast is handled in Config.newCodeVersion()
  newCodeVersion(latestVersion) { }

  isPercentage(elementId) {
    const element = document.getElementById(elementId);
    return element && element.classList.contains('percentage');
  }

  isBoolean(elementId) {
    const element = document.getElementById(elementId);
    return element && element.classList.contains('boolean');
  }

  getValue(elementId) {
    if (elementId === 'simulation_mode') {
      return this.currentSimMode;
    }
    if (elementId === 'economy_mode') {
      return this.currentEconomyMode;
    }
    return DOMUtils.getValue(elementId);
  }

  setValue(elementId, value) {
    if (elementId === 'simulation_mode') {
      if (this.currentSimMode === value) return; // No change, do nothing
      this.currentSimMode = value;
      this.updateUIForSimMode(); // Updates main P2 fields, P1 labels, and toggle icon active state
      if (this.eventsTableManager) { // Ensure eventsTableManager is initialized
        this.eventsTableManager.updateEventRowsVisibilityAndTypes();
      }
      return;
    }
    if (elementId === 'economy_mode') {
      if (this.currentEconomyMode === value) return; // No change, do nothing
      this.switchEconomyMode(value);
      return;
    }
    DOMUtils.setValue(elementId, value);
  }

  fetchUrl(url) {
    return this.fileManager.fetchUrl(url);
  }

  saveToFile() {
    return this.fileManager.saveToFile();
  }

  async loadFromFile(file) {
    // Explicitly reset currency selectors to default state before loading
    if (this.chartManager) {
      this.chartManager.reportingCurrency = null; // Force reset
      this.chartManager.setupChartCurrencyControls(this);
    }
    if (this.tableManager) {
      this.tableManager.reportingCurrency = null; // Force reset
      this.tableManager.setupTableCurrencyControls();
    }

    await this.fileManager.loadFromFile(file);
    RelocationUtils.extractRelocationTransitions(this, this.chartManager);
    // Rebuild currency selector now that scenario events (and currencies) are available
    this.chartManager.setupChartCurrencyControls(this);
    this.chartManager.refreshChartsWithCurrency();
    // Also refresh table currency controls
    if (this.tableManager) {
      RelocationUtils.extractRelocationTransitions(this, this.tableManager);
      this.tableManager.setupTableCurrencyControls();
    }
  }

  async loadFromUrl(url, name) {
    // Explicitly reset currency selectors to default state before loading
    if (this.chartManager) {
      this.chartManager.reportingCurrency = null; // Force reset
      this.chartManager.setupChartCurrencyControls(this);
    }
    if (this.tableManager) {
      this.tableManager.reportingCurrency = null; // Force reset
      this.tableManager.setupTableCurrencyControls();
    }

    await this.fileManager.loadFromUrl(url, name);
    RelocationUtils.extractRelocationTransitions(this, this.chartManager);
    // Rebuild currency selector now that scenario events (and currencies) are available
    this.chartManager.setupChartCurrencyControls(this);
    this.chartManager.refreshChartsWithCurrency();
    // Also refresh table currency controls
    if (this.tableManager) {
      RelocationUtils.extractRelocationTransitions(this, this.tableManager);
      this.tableManager.setupTableCurrencyControls();
    }
  }

  // Lightweight proxy to read events without creating a new UIManager instance
  readEvents(validate = false) {
    if (typeof uiManager !== 'undefined' && uiManager) {
      return uiManager.readEvents(validate);
    }
    return new UIManager(this).readEvents(validate);
  }

  setupChangeListener() {
    document.addEventListener('change', (event) => {
      const element = event.target;

      this.editCallbacks.forEach(callback => {
        callback({
          element: element,
          value: element.value,
          id: element.id
        });
      });

      // Keep country chip visibility in sync with scenario MV-* events.
      // This is intentionally lightweight (no heavy parsing): just refresh UI affordances.
      try {
        if (element && element.closest && element.closest('#Events')) {
          this.refreshCountryChipsFromScenario();
        }
      } catch (_) { }

      // StartCountry changes can flip effective relocation state (single ↔ multi country).
      try {
        if (element && element.id === 'StartCountry') {
          this.refreshCountryChipsFromScenario();
        }
      } catch (_) { }
    });
  }

  setupScenarioCountryAutoRefresh() {
    // When rows are added/removed in the Events table (e.g. deleting the only MV-* row),
    // there may be no 'change' event to hook. Observe row mutations and refresh chips.
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;
    if (this._eventsCountryObserver) return;
    this._eventsCountryObserver = new MutationObserver(() => {
      try { this.refreshCountryChipsFromScenario(); } catch (_) { }
    });
    this._eventsCountryObserver.observe(tbody, { childList: true });
  }

  // New method to setup the load demo scenario button
  setupLoadDemoScenarioButton() {
    const loadDemoButton = document.getElementById('loadDemoScenarioHeader');
    if (loadDemoButton) {
      loadDemoButton.addEventListener('click', async () => {
        try {
          // Unsaved changes check is now handled in loadFromUrl
          await this.loadFromUrl("/src/frontend/web/assets/demo.csv", "demo");
          // After successfully loading the demo scenario, scroll to graphs and run the simulation
          const runButton = document.getElementById('runSimulation');
          if (runButton && !this.isSimulationRunning) {
            // Wait for scroll to complete before running the demo
            await this.scrollToGraphs();
            // Add a small delay after scroll completes to allow DOM to settle
            setTimeout(() => {
              // Instead of programmatic click, directly call the handler method
              // Create a mock event object to avoid issues with preventDefault/stopPropagation
              const mockEvent = {
                preventDefault: () => { },
                stopPropagation: () => { }
              };
              this.handleRunSimulation(mockEvent);
            }, 200);
          }
        } catch (error) {
          console.error("Error loading demo scenario:", error);
          // Don't auto-run simulation if demo loading failed
        }
      });
    } else {
      // It's better to log an error if the button isn't found during development
      // but for production, we might not want to throw an error or log excessively.
      // For now, let's log it as it helps in debugging.
      console.error("loadDemoScenarioHeader button not found");
    }
  }

  setupDataExportButton() {
    const exportButton = document.getElementById('exportDataCSV');

    if (!exportButton) {
      console.error("exportDataCSV button not found");
      return;
    }

    // Primary click behaviour – download CSV
    exportButton.addEventListener('click', () => {
      this.downloadDataTableCSV();
    });

    // Reusable tooltip
    const description = exportButton.getAttribute('data-description') || 'Export data table as CSV';
    TooltipUtils.attachTooltip(exportButton, description);
  }

  // Apply investment type labels from the loaded TaxRuleSet to existing UI fields (IE-compatible two-type layout)
  applyInvestmentLabels() {
    const configInstance = Config.getInstance();
    const ruleset = configInstance.getCachedTaxRuleSet(configInstance.getDefaultCountry());
    if (!ruleset) return;

    const types = ruleset.getResolvedInvestmentTypes ? ruleset.getResolvedInvestmentTypes() : [];
    const fundsType = ruleset.findInvestmentTypeByKey ? ruleset.findInvestmentTypeByKey('indexFunds') : null;
    const sharesType = ruleset.findInvestmentTypeByKey ? ruleset.findInvestmentTypeByKey('shares') : null;

    const fundsLabel = (fundsType && fundsType.label) || (types[0] && types[0].label) || 'Index Funds';
    const sharesLabel = (sharesType && sharesType.label) || (types[1] && types[1].label) || 'Shares';

    const setLabelFor = (fieldId, text) => {
      const el = document.querySelector(`label[for="${fieldId}"]`);
      if (el) el.textContent = text;
    };

    // Initial capitals
    setLabelFor('InitialFunds', fundsLabel);
    setLabelFor('InitialShares', sharesLabel);

    // Allocations
    setLabelFor('FundsAllocation', `${fundsLabel} Allocation`);
    setLabelFor('SharesAllocation', `${sharesLabel} Allocation`);

    // Drawdown priorities (labels only)
    const prFunds = document.querySelector('[data-priority-id="PriorityFunds"] .priority-label');
    if (prFunds) prFunds.textContent = fundsLabel;
    const prShares = document.querySelector('[data-priority-id="PriorityShares"] .priority-label');
    if (prShares) prShares.textContent = sharesLabel;

    // Growth rates table row headings
    const setRowHeadingForInput = (inputId, label) => {
      const input = document.getElementById(inputId);
      if (!input) return;
      const td = input.closest('td');
      if (!td) return;
      const tr = td.parentElement;
      if (!tr) return;
      const firstCell = tr.children && tr.children[0];
      if (firstCell) firstCell.textContent = label;
    };
    setRowHeadingForInput('FundsGrowthRate', fundsLabel);
    setRowHeadingForInput('SharesGrowthRate', sharesLabel);

    // Withdrawal rate tooltip (keep short header text)
    const thWithdraw = document.querySelector('th[data-key="WithdrawalRate"]');
    if (thWithdraw) {
      // If we have more than two investment types, build a dynamic label list
      const labelList = (types && types.length > 0) ? types.map(t => t.label).join(' + ') : `${fundsLabel} + ${sharesLabel}`;
      thWithdraw.title = `Percentage of your liquid assets (${labelList} + Pension) that you're withdrawing to cover your expenses.`;
    }

    // Update charts legend labels via ChartManager
    if (this.chartManager && typeof this.chartManager.applyInvestmentLabels === 'function') {
      this.chartManager.applyInvestmentLabels(fundsLabel, sharesLabel);
    }
    // Also rebuild chart datasets for dynamic investment types
    if (this.chartManager && typeof this.chartManager.applyInvestmentTypes === 'function') {
      this.chartManager.applyInvestmentTypes(types);
    }
    // Ensure capital columns are always rendered as Capital__*.
    if (types && types.length > 0) {
      this.applyDynamicColumns(types);
    }
  }

  /**
   * Ensure investment-related parameter inputs exist for the active StartCountry ruleset.
   * The static HTML still includes legacy (un-namespaced) fields for CSV back-compat;
   * this method creates namespaced fields (e.g. InitialCapital_indexFunds_ie) as needed.
   */
  async ensureInvestmentParameterFields() {
    const config = Config.getInstance();
    const startCountry = config.getStartCountry();
    let ruleset = config.getCachedTaxRuleSet(startCountry);
    if (!ruleset) {
      ruleset = await config.getTaxRuleSet(startCountry);
    }
    const investmentTypes = ruleset.getResolvedInvestmentTypes() || [];
    this.renderInvestmentParameterFields(investmentTypes);
  }

  renderInvestmentParameterFields(investmentTypes) {
    const types = Array.isArray(investmentTypes) ? investmentTypes : [];

    // Capture existing growth rate/volatility values before removing dynamic fields.
    // This preserves values when StartCountry changes trigger mid-deserialization.
    const growthRateCache = {};
    const existingDynamicInputs = document.querySelectorAll('[data-dynamic-investment-param="true"] input.percentage');
    existingDynamicInputs.forEach(input => {
      if (input && input.id && input.value) {
        growthRateCache[input.id] = input.value;
      }
    });

    // Remove previously generated dynamic fields
    document.querySelectorAll('[data-dynamic-investment-param="true"]').forEach(el => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    // Store the cache on this instance so we can restore values after creation
    this._growthRateCacheForRestore = growthRateCache;

    const hideInputWrapper = (inputId) => {
      const el = document.getElementById(inputId);
      if (!el) return;
      const wrapper = el.closest('.input-wrapper');
      if (wrapper) wrapper.style.display = 'none';
    };

    const hideGrowthRow = (inputId) => {
      const el = document.getElementById(inputId);
      if (!el) return;
      const td = el.closest('td');
      const tr = td ? td.parentElement : null;
      if (tr) tr.style.display = 'none';
    };

    // Keep legacy fields in DOM for CSV back-compat normalization, but hide them from view.
    hideInputWrapper('InitialCapital_indexFunds');
    hideInputWrapper('InitialCapital_shares');
    hideInputWrapper('InvestmentAllocation_indexFunds');
    hideInputWrapper('InvestmentAllocation_shares');
    // Legacy pension contribution fields (now per-country) kept hidden for back-compat serialization
    this.ensureParameterInput('PensionContributionPercentage', 'percentage');
    this.ensureParameterInput('PensionContributionPercentageP2', 'percentage');
    this.ensureParameterInput('PensionContributionCapped', 'string');
    hideGrowthRow('indexFundsGrowthRate');
    hideGrowthRow('sharesGrowthRate');

    const startGroup = document.querySelector('#startingPosition .input-group');
    if (startGroup) {
      // Per Phase 7 design: starting position initial capital remains StartCountry-only.
      // IDs intentionally remain `InitialCapital_{typeKey}` (no country prefix).
      for (let i = 0; i < types.length; i++) {
        const t = types[i] || {};
        const key = t.key;
        if (!key) continue;
        const labelText = t.label || key;
        const inputId = 'InitialCapital_' + key;

        const wrapper = document.createElement('div');
        wrapper.className = 'input-wrapper';
        wrapper.setAttribute('data-dynamic-investment-param', 'true');

        const label = document.createElement('label');
        label.setAttribute('for', inputId);
        label.textContent = labelText;
        wrapper.appendChild(label);

        const input = this._takeOrCreateInput(inputId, 'currency');
        input.type = 'text';
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('pattern', '[0-9]*');
        wrapper.appendChild(input);

        startGroup.appendChild(wrapper);
      }
    }

    // Allocations: if relocation is enabled AND MV-* events exist, render per-country allocation inputs
    // and use the chips as a context switcher (show/hide per-country containers).
    this.refreshCountryChipsFromScenario(types);

    const tbody = document.querySelector('#growthRates table.growth-rates-table tbody');
    const inflationInput = document.getElementById('Inflation');
    const inflationRow = inflationInput ? inflationInput.closest('tr') : null;
    this._appendGrowthRateRows(tbody, types, inflationRow);

    // Restore cached growth rate values to newly created inputs
    if (this._growthRateCacheForRestore) {
      for (const [id, value] of Object.entries(this._growthRateCacheForRestore)) {
        const input = document.getElementById(id);
        if (input && !input.value) {
          input.value = value;
        }
      }
      this._growthRateCacheForRestore = null;
    }

    // Re-apply economy mode visibility to newly created volatility cells
    this.updateUIForEconomyMode();
  }

  _appendGrowthRateRows(tbody, types, inflationRow) {
    if (!tbody) return;
    for (let i = 0; i < types.length; i++) {
      const t = types[i] || {};
      const key = t.key;
      if (!key) continue;
      const labelText = t.label || key;

      const tr = document.createElement('tr');
      tr.setAttribute('data-dynamic-investment-param', 'true');

      const tdLabel = document.createElement('td');
      tdLabel.textContent = labelText;
      tr.appendChild(tdLabel);

      const tdGrowth = document.createElement('td');
      const grWrap = document.createElement('div');
      grWrap.className = 'percentage-container';
      const gr = this._takeOrCreateInput(key + 'GrowthRate', 'percentage');
      gr.type = 'text';
      gr.setAttribute('inputmode', 'numeric');
      gr.setAttribute('pattern', '[0-9]*');
      gr.setAttribute('step', '1');
      grWrap.appendChild(gr);
      tdGrowth.appendChild(grWrap);
      tr.appendChild(tdGrowth);

      const tdVol = document.createElement('td');
      const sdWrap = document.createElement('div');
      sdWrap.className = 'percentage-container';
      const sd = this._takeOrCreateInput(key + 'GrowthStdDev', 'percentage');
      sd.type = 'text';
      sd.setAttribute('inputmode', 'numeric');
      sd.setAttribute('pattern', '[0-9]*');
      sd.setAttribute('step', '1');
      sdWrap.appendChild(sd);
      tdVol.appendChild(sdWrap);
      tr.appendChild(tdVol);

      if (inflationRow && inflationRow.parentNode === tbody) {
        tbody.insertBefore(tr, inflationRow);
      } else {
        tbody.appendChild(tr);
      }
    }
  }

  _clearDynamicGrowthRateRows(tbody) {
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr[data-dynamic-investment-param="true"]');
    rows.forEach(row => {
      try {
        const inputs = row.querySelectorAll('input');
        for (let i = 0; i < inputs.length; i++) this._stashInputElement(inputs[i]);
      } catch (_) { }
      if (row && row.parentNode) row.parentNode.removeChild(row);
    });
  }

  // -------------------------------------------------------------
  // Country chips + per-country parameter rendering
  // -------------------------------------------------------------

  _syncCountryTabsFromManager() {
    const mgr = this.countryTabSyncManager;
    if (!mgr) return;
    try {
      const a = this.allocationsCountryChipSelector;
      const ac = mgr.getSelectedCountry('allocations');
      if (a && ac) a.setSelectedCountry(ac);
    } catch (_) { }
    try {
      const p = this.personalCircumstancesCountryChipSelector;
      const pc = mgr.getSelectedCountry('personalCircumstances');
      if (p && pc) p.setSelectedCountry(pc);
    } catch (_) { }
    try {
      const e = this.economyCountryChipSelector;
      const ec = mgr.getSelectedCountry('economy');
      if (e && ec) e.setSelectedCountry(ec);
    } catch (_) { }
  }

  /**
   * Returns an array of unique country codes present in the scenario:
   * StartCountry + all MV-* event countries.
   */
  getScenarioCountries() {
    const cfg = Config.getInstance();
    const start = (cfg.getStartCountry && cfg.getStartCountry()) ? cfg.getStartCountry() : cfg.getDefaultCountry();
    const startCountry = (start || '').toString().trim().toLowerCase();
    const set = {};
    if (startCountry) set[startCountry] = true;
    const events = this.readEvents(false) || [];
    for (let i = 0; i < events.length; i++) {
      const t = events[i] && events[i].type ? String(events[i].type) : '';
      if (t && /^MV-[A-Z]{2,}$/.test(t)) {
        set[t.substring(3).toLowerCase()] = true;
      }
    }
    return Object.keys(set);
  }

  hasRelocationEvents() {
    const events = this.readEvents(false) || [];
    for (let i = 0; i < events.length; i++) {
      const t = events[i] && events[i].type ? String(events[i].type) : '';
      if (t && /^MV-[A-Z]{2,}$/.test(t)) return true;
    }
    return false;
  }

  // "Effective" relocation means there is at least one MV-* event whose country differs from StartCountry.
  // If all MV-* events are MV-<StartCountry>, the scenario is effectively single-country for UI editing.
  hasEffectiveRelocationEvents() {
    const cfg = Config.getInstance();
    const startCountry = (cfg.getStartCountry && cfg.getStartCountry()) ? String(cfg.getStartCountry()).toLowerCase() : '';
    const events = this.readEvents(false) || [];
    for (let i = 0; i < events.length; i++) {
      const t = events[i] && events[i].type ? String(events[i].type) : '';
      if (t && /^MV-[A-Z]{2,}$/.test(t)) {
        const c = t.substring(3).toLowerCase();
        if (c && c !== startCountry) return true;
      }
    }
    return false;
  }

  getStatePensionPeriodLabel(countryCode) {
    const cfg = Config.getInstance();
    const code = (countryCode || '').toString().trim().toLowerCase();
    const rs = cfg.getCachedTaxRuleSet(code);
    let period = (rs && typeof rs.getStatePensionPeriod === 'function') ? rs.getStatePensionPeriod() : null;
    period = (period || '').toString().trim().toLowerCase();
    if (!period) return 'Period';
    return period.charAt(0).toUpperCase() + period.slice(1);
  }

  /**
   * Ensure the target parameter input exists, even if it's not currently visible.
   * Used to support CSV load of per-country fields before chips/containers are rendered.
   */
  ensureParameterInput(elementId, className) {
    const id = (elementId || '').toString().trim();
    if (!id) return;
    if (document.getElementById(id)) return;
    const stash = this._ensureHiddenParamStash();
    const input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    input.className = className || '';
    input.autocomplete = 'off';
    stash.appendChild(input);
  }

  _ensureHiddenParamStash() {
    let stash = document.getElementById('hidden-parameter-stash');
    if (stash) return stash;
    stash = document.createElement('div');
    stash.id = 'hidden-parameter-stash';
    stash.style.display = 'none';
    const host = document.querySelector('.parameters-section') || document.body;
    host.appendChild(stash);
    return stash;
  }

  _stashInputElement(inputEl) {
    if (!inputEl || !inputEl.id) return;
    const stash = this._ensureHiddenParamStash();
    // If it's already in the stash, do nothing.
    if (inputEl.parentNode === stash) return;
    stash.appendChild(inputEl);
  }

  _takeOrCreateInput(inputId, className) {
    const existing = document.getElementById(inputId);
    if (existing) return existing;
    const input = document.createElement('input');
    input.id = inputId;
    input.className = className || '';
    input.autocomplete = 'off';
    return input;
  }

  /**
   * Refresh chip visibility + per-country inputs for Allocations and Personal Circumstances.
   * Optional `fallbackStartTypes` is the StartCountry investment types passed from renderInvestmentParameterFields.
   */
  refreshCountryChipsFromScenario(fallbackStartTypes) {
    const cfg = Config.getInstance();
    const relocationEnabled = cfg.isRelocationEnabled();
    const hasMV = relocationEnabled && this.hasEffectiveRelocationEvents();

    // If we were called from a generic events-table change (no types provided),
    // fall back to StartCountry-resolved investment types so we can correctly
    // revert to single-country mode when MV-* events are removed.
    let types = Array.isArray(fallbackStartTypes) ? fallbackStartTypes : [];
    if (!types.length) {
      const startCountry = cfg.getStartCountry();
      const rs = cfg.getCachedTaxRuleSet(startCountry);
      types = (rs && typeof rs.getResolvedInvestmentTypes === 'function') ? (rs.getResolvedInvestmentTypes() || []) : [];
    }

    // Allocations chips + per-country allocation inputs
    this._setupAllocationsCountryChips(hasMV, types);

    // Economy chips + per-country growth tables
    this._setupEconomyCountryChips(hasMV, types);

    // Personal circumstances chips + per-country state pension inputs
    this.setupPersonalCircumstancesCountryChips();
  }

  _setupAllocationsCountryChips(hasMV, fallbackStartTypes) {
    const cfg = Config.getInstance();
    const allocCard = document.getElementById('Allocations');
    const allocGroup = document.querySelector('#Allocations .input-group');
    if (!allocCard || !allocGroup) return;
    const simulationMode = this.getValue('simulation_mode') || this.currentSimMode || 'single';

    // Persist any user-entered values before we tear down/rebuild allocation inputs
    this._captureAllocationValues();

    let chipContainer = allocGroup.querySelector('.country-chip-container') || allocCard.querySelector('.country-chip-container');
    if (!chipContainer) {
      chipContainer = document.createElement('div');
      chipContainer.className = 'country-chip-container';
    }
    // Place the tabs at the top of the allocations card
    if (allocGroup.firstChild) {
      allocGroup.insertBefore(chipContainer, allocGroup.firstChild);
    } else {
      allocGroup.appendChild(chipContainer);
    }

    // Clear any previously generated allocation inputs (both legacy dynamic and per-country containers)
    // so we don't end up with duplicates when MV-* events are added/removed.
    this._clearDynamicAllocationInputs(allocGroup);

    // Remove any previously generated per-country allocation containers (not the chip container)
    // We'll recreate the correct set each time based on current scenario countries.
    const existingCountryContainers = allocGroup.querySelectorAll('[data-country-allocation-container="true"]');
    existingCountryContainers.forEach(el => {
      try {
        const inputs = el.querySelectorAll('input');
        for (let i = 0; i < inputs.length; i++) this._stashInputElement(inputs[i]);
      } catch (_) { }
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    if (!hasMV) {
      // Chips hidden: keep StartCountry inputs effectively identical to multi-country mode.
      // If relocation is enabled, render StartCountry using per-country IDs (InvestmentAllocation_{country}_{baseKey})
      // so values do not "move" when effective relocation is toggled on/off.
      chipContainer.style.display = 'none';
      this.allocationsCountryChipSelector = null;

      const relocationEnabled = cfg.isRelocationEnabled && cfg.isRelocationEnabled();
      const types = Array.isArray(fallbackStartTypes) ? fallbackStartTypes : [];
      const startCountry = (cfg.getStartCountry() || '').toLowerCase();

      if (relocationEnabled) {
        const countryContainer = document.createElement('div');
        countryContainer.setAttribute('data-country-allocation-container', 'true');
        countryContainer.setAttribute('data-country-code', startCountry);
        countryContainer.style.display = '';
        countryContainer.style.flexDirection = 'column';
        countryContainer.style.gap = '0.225rem';
        countryContainer.style.display = 'flex';

        // Pension fields first
        this._renderCountryPensionContributionFields(countryContainer, startCountry, simulationMode);

        for (let i = types.length - 1; i >= 0; i--) {
          const t = types[i] || {};
          const key = t.key;
          if (!key) continue;
          const baseKey = this._toBaseInvestmentKey(key, startCountry);
          const labelText = (t.label || key) + ' Allocation';
          const inputId = 'InvestmentAllocation_' + startCountry + '_' + baseKey;
          const legacyId = 'InvestmentAllocation_' + key;

          // Keep legacy cache seeded for serialization/back-compat
          if (!this._allocationValueCache[inputId] && this._allocationValueCache[legacyId]) {
            this._allocationValueCache[inputId] = this._allocationValueCache[legacyId];
          }
          if (!this._allocationValueCache[legacyId] && this._allocationValueCache[inputId]) {
            this._allocationValueCache[legacyId] = this._allocationValueCache[inputId];
          }

          const wrapper = document.createElement('div');
          wrapper.className = 'input-wrapper';
          wrapper.setAttribute('data-dynamic-investment-param', 'true');

          const label = document.createElement('label');
          label.setAttribute('for', inputId);
          label.textContent = labelText;
          wrapper.appendChild(label);

          const pctContainer = document.createElement('div');
          pctContainer.className = 'percentage-container';
          const input = this._takeOrCreateInput(inputId, 'percentage');
          input.type = 'text';
          input.setAttribute('inputmode', 'numeric');
          input.setAttribute('pattern', '[0-9]*');
          input.setAttribute('step', '1');
          input.setAttribute('placeholder', ' ');
          this._applyAllocationValueIfCached(inputId, input);
          pctContainer.appendChild(input);
          wrapper.appendChild(pctContainer);

          countryContainer.appendChild(wrapper);
        }

        allocGroup.appendChild(countryContainer);
      } else {
        // Relocation disabled: keep original legacy layout/IDs.
        // Pension fields first
        this._renderCountryPensionContributionFields(allocGroup, startCountry, simulationMode);

        for (let i = 0; i < types.length; i++) {
          const t = types[i] || {};
          const key = t.key;
          if (!key) continue;
          const labelText = (t.label || key) + ' Allocation';
          const inputId = 'InvestmentAllocation_' + key;

          const wrapper = document.createElement('div');
          wrapper.className = 'input-wrapper';
          wrapper.setAttribute('data-dynamic-investment-param', 'true');

          const label = document.createElement('label');
          label.setAttribute('for', inputId);
          label.textContent = labelText;
          wrapper.appendChild(label);

          const pctContainer = document.createElement('div');
          pctContainer.className = 'percentage-container';
          const input = this._takeOrCreateInput(inputId, 'percentage');
          input.type = 'text';
          input.setAttribute('inputmode', 'numeric');
          input.setAttribute('pattern', '[0-9]*');
          input.setAttribute('step', '1');
          input.setAttribute('placeholder', ' ');
          this._applyAllocationValueIfCached(inputId, input);
          pctContainer.appendChild(input);
          wrapper.appendChild(pctContainer);

          allocGroup.appendChild(wrapper);
        }
      }
      return;
    }

    // MV-* present: show chips and render per-country allocation inputs for ALL scenario countries.
    chipContainer.style.display = '';
    const scenarioCountries = this.getScenarioCountries();
    const countries = scenarioCountries.map(code => ({ code: code, name: cfg.getCountryNameByCode(code) }));
    const startCountry = cfg.getStartCountry();
    const mgrSelected = this.countryTabSyncManager.getSelectedCountry('allocations');
    const prevSelected = (this.allocationsCountryChipSelector && this.allocationsCountryChipSelector.getSelectedCountry())
      ? this.allocationsCountryChipSelector.getSelectedCountry()
      : null;
    let selected = mgrSelected || prevSelected || startCountry;
    if (scenarioCountries.indexOf(String(selected).toLowerCase()) === -1) selected = startCountry;

    this.allocationsCountryChipSelector = new CountryChipSelector(
      countries,
      selected,
      (code) => { this._showAllocationsCountry(code); },
      'allocations'
    );
    this.allocationsCountryChipSelector.render(chipContainer);

    for (let ci = 0; ci < scenarioCountries.length; ci++) {
      const code = scenarioCountries[ci];
      const rs = cfg.getCachedTaxRuleSet(code);
      const invTypes = (rs && typeof rs.getResolvedInvestmentTypes === 'function') ? (rs.getResolvedInvestmentTypes() || []) : [];
      const countryContainer = document.createElement('div');
      countryContainer.setAttribute('data-country-allocation-container', 'true');
      countryContainer.setAttribute('data-country-code', code);
      countryContainer.style.display = (code === selected) ? '' : 'none';
      countryContainer.style.display = countryContainer.style.display || 'flex';
      countryContainer.style.flexDirection = 'column';
      countryContainer.style.gap = '0.225rem';

      // Pension fields first
      this._renderCountryPensionContributionFields(countryContainer, code, simulationMode);

      for (let i = invTypes.length - 1; i >= 0; i--) {
        const t = invTypes[i] || {};
        const key = t.key;
        if (!key) continue;
        const baseKey = this._toBaseInvestmentKey(key, code);
        const labelText = (t.label || key) + ' Allocation';
        // Field IDs are country-prefixed so the chip selector can switch contexts without losing values.
        // Convention: InvestmentAllocation_{countryCode}_{typeKey}
        const inputId = 'InvestmentAllocation_' + code + '_' + baseKey;
        const legacyId = 'InvestmentAllocation_' + key;

        // If user previously entered StartCountry allocations in legacy fields and is now enabling MV-*,
        // seed the StartCountry per-country values (only when per-country is empty).
        if (String(code).toLowerCase() === String(startCountry).toLowerCase()) {
          if (!this._allocationValueCache[inputId] && this._allocationValueCache[legacyId]) {
            this._allocationValueCache[inputId] = this._allocationValueCache[legacyId];
          }
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'input-wrapper';
        wrapper.setAttribute('data-dynamic-investment-param', 'true');

        const label = document.createElement('label');
        label.setAttribute('for', inputId);
        label.textContent = labelText;
        wrapper.appendChild(label);

        const pctContainer = document.createElement('div');
        pctContainer.className = 'percentage-container';
        const input = this._takeOrCreateInput(inputId, 'percentage');
        input.type = 'text';
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('pattern', '[0-9]*');
        input.setAttribute('step', '1');
        input.setAttribute('placeholder', ' ');
        this._applyAllocationValueIfCached(inputId, input);
        pctContainer.appendChild(input);
        wrapper.appendChild(pctContainer);

        countryContainer.appendChild(wrapper);
      }

      allocGroup.appendChild(countryContainer);
    }
    this.countryTabSyncManager.setSelectedCountry('allocations', selected);
  }

  _setupEconomyCountryChips(hasMV, fallbackStartTypes) {
    const cfg = Config.getInstance();
    const economyCard = document.getElementById('growthRates');
    if (!economyCard) return;
    const legacyTable = economyCard.querySelector('table.growth-rates-table');

    let economyContainer = economyCard.querySelector('[data-economy-multi="true"]');
    if (!economyContainer) {
      economyContainer = document.createElement('div');
      economyContainer.setAttribute('data-economy-multi', 'true');
      economyContainer.style.display = 'none';
      if (legacyTable && legacyTable.parentNode) {
        legacyTable.parentNode.insertBefore(economyContainer, legacyTable);
      } else {
        economyCard.appendChild(economyContainer);
      }
    }

    let chipContainer = economyContainer.querySelector('.country-chip-container');
    if (!chipContainer) {
      chipContainer = document.createElement('div');
      chipContainer.className = 'country-chip-container';
      economyContainer.appendChild(chipContainer);
    }

    const existingCountryContainers = economyContainer.querySelectorAll('[data-country-economy-container="true"]');
    existingCountryContainers.forEach(el => {
      try {
        const inputs = el.querySelectorAll('input');
        for (let i = 0; i < inputs.length; i++) this._stashInputElement(inputs[i]);
      } catch (_) { }
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    if (!hasMV) {
      economyContainer.style.display = 'none';
      if (legacyTable) legacyTable.style.display = '';
      this.economyCountryChipSelector = null;
      chipContainer.innerHTML = '';
      this._restoreLegacyEconomyRows(fallbackStartTypes);
      return;
    }

    economyContainer.style.display = '';
    if (legacyTable) legacyTable.style.display = 'none';

    const scenarioCountries = this.getScenarioCountries();
    const countries = scenarioCountries.map(code => ({ code: code, name: cfg.getCountryNameByCode(code) }));
    const startCountry = cfg.getStartCountry();
    const mgrSelected = this.countryTabSyncManager.getSelectedCountry('economy');
    const prevSelected = (this.economyCountryChipSelector && this.economyCountryChipSelector.getSelectedCountry)
      ? this.economyCountryChipSelector.getSelectedCountry()
      : null;
    let selected = mgrSelected || prevSelected || startCountry;
    if (scenarioCountries.indexOf(String(selected).toLowerCase()) === -1) selected = startCountry;

    this.economyCountryChipSelector = new CountryChipSelector(
      countries,
      selected,
      (code) => { this._showEconomyCountry(code); },
      'economy'
    );
    this.economyCountryChipSelector.render(chipContainer);

    for (let ci = 0; ci < scenarioCountries.length; ci++) {
      const code = scenarioCountries[ci];
      const rs = cfg.getCachedTaxRuleSet(code);
      const invTypes = (rs && typeof rs.getResolvedInvestmentTypes === 'function') ? (rs.getResolvedInvestmentTypes() || []) : [];
      const countByBaseRef = {};
      for (let i = 0; i < invTypes.length; i++) {
        const baseRef = invTypes[i] && invTypes[i].baseRef ? invTypes[i].baseRef : '';
        if (baseRef) countByBaseRef[baseRef] = (countByBaseRef[baseRef] || 0) + 1;
      }

      const countryContainer = document.createElement('div');
      countryContainer.setAttribute('data-country-economy-container', 'true');
      countryContainer.setAttribute('data-country-code', code);
      countryContainer.style.display = (code === selected) ? '' : 'none';

      const table = document.createElement('table');
      table.className = 'growth-rates-table economy-country-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      const thLabel = document.createElement('th');
      const thGrowth = document.createElement('th');
      const thVol = document.createElement('th');
      thGrowth.textContent = 'Growth Rate';
      thVol.textContent = 'Volatility';
      headRow.appendChild(thLabel);
      headRow.appendChild(thGrowth);
      headRow.appendChild(thVol);
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (let i = 0; i < invTypes.length; i++) {
        const t = invTypes[i] || {};
        const key = t.key;
        if (!key) continue;
        const labelText = t.label || key;

        const tr = document.createElement('tr');
        const tdLabel = document.createElement('td');
        const baseRef = t.baseRef ? String(t.baseRef) : '';
        const baseType = baseRef ? cfg.getInvestmentBaseTypeByKey(baseRef) : null;
        const profileLabel = baseRef ? (baseType && baseType.label ? baseType.label : baseRef) : '(local-only)';
        const taxLabel = (t.taxation && t.taxation.exitTax)
          ? 'Exit Tax'
          : (t.taxation && t.taxation.capitalGains) ? 'CGT' : 'Unknown';
        const titleParts = [];
        if (baseRef) {
          titleParts.push('Profile: ' + profileLabel + ' (' + baseRef + ')');
        } else {
          titleParts.push('Profile: ' + profileLabel);
        }
        titleParts.push('Tax: ' + taxLabel);
        tdLabel.title = titleParts.join('\n');
        tdLabel.appendChild(document.createTextNode(labelText));

        if (baseRef && countByBaseRef[baseRef] >= 2) {
          const indicator = document.createElement('span');
          indicator.className = 'economy-linked-indicator';
          indicator.textContent = 'linked';
          indicator.title = 'Shares market behavior with other wrappers in this country.';
          tdLabel.appendChild(document.createTextNode(' '));
          tdLabel.appendChild(indicator);
        }
        tr.appendChild(tdLabel);

        const tdGrowth = document.createElement('td');
        const grWrap = document.createElement('div');
        grWrap.className = 'percentage-container';
        const gr = this._takeOrCreateInput(key + 'GrowthRate', 'percentage');
        gr.type = 'text';
        gr.setAttribute('inputmode', 'numeric');
        gr.setAttribute('pattern', '[0-9]*');
        gr.setAttribute('step', '1');
        grWrap.appendChild(gr);
        tdGrowth.appendChild(grWrap);
        tr.appendChild(tdGrowth);

        const tdVol = document.createElement('td');
        const sdWrap = document.createElement('div');
        sdWrap.className = 'percentage-container';
        const sd = this._takeOrCreateInput(key + 'GrowthStdDev', 'percentage');
        sd.type = 'text';
        sd.setAttribute('inputmode', 'numeric');
        sd.setAttribute('pattern', '[0-9]*');
        sd.setAttribute('step', '1');
        sdWrap.appendChild(sd);
        tdVol.appendChild(sdWrap);
        tr.appendChild(tdVol);

        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      countryContainer.appendChild(table);
      economyContainer.appendChild(countryContainer);
    }
    this.countryTabSyncManager.setSelectedCountry('economy', selected);
    this.updateUIForEconomyMode();
  }

  _restoreLegacyEconomyRows(fallbackStartTypes) {
    const cfg = Config.getInstance();
    let types = Array.isArray(fallbackStartTypes) ? fallbackStartTypes : [];
    if (!types.length) {
      const startCountry = cfg.getStartCountry();
      const rs = cfg.getCachedTaxRuleSet(startCountry);
      types = (rs && typeof rs.getResolvedInvestmentTypes === 'function') ? (rs.getResolvedInvestmentTypes() || []) : [];
    }
    const tbody = document.querySelector('#growthRates table.growth-rates-table tbody');
    if (!tbody) return;
    const inflationInput = document.getElementById('Inflation');
    const inflationRow = inflationInput ? inflationInput.closest('tr') : null;
    this._clearDynamicGrowthRateRows(tbody);
    this._appendGrowthRateRows(tbody, types, inflationRow);
    this.updateUIForEconomyMode();
  }

  _showEconomyCountry(code) {
    const selected = (code || '').toString().trim().toLowerCase();
    const containers = document.querySelectorAll('#growthRates [data-country-economy-container="true"]');
    containers.forEach(el => {
      const c = (el.getAttribute('data-country-code') || '').toLowerCase();
      el.style.display = (c === selected) ? '' : 'none';
    });
  }

  _showAllocationsCountry(code) {
    const selected = (code || '').toString().trim().toLowerCase();
    const containers = document.querySelectorAll('#Allocations .input-group [data-country-allocation-container="true"]');
    containers.forEach(el => {
      const c = (el.getAttribute('data-country-code') || '').toLowerCase();
      el.style.display = (c === selected) ? '' : 'none';
    });
  }

  _clearDynamicAllocationInputs(allocGroup) {
    if (!allocGroup) return;
    // Remove dynamic allocation input wrappers created by renderInvestmentParameterFields()
    // and/or previous MV-* container rebuilds.
    const wrappers = Array.from(allocGroup.querySelectorAll('.input-wrapper[data-dynamic-investment-param="true"]'));
    for (let i = 0; i < wrappers.length; i++) {
      const w = wrappers[i];
      try {
        const input = w.querySelector('input');
        const id = input && input.id ? String(input.id) : '';
        if (id.indexOf('InvestmentAllocation_') === 0) {
          // Preserve values across mode switches by stashing the input instead of destroying it
          if (input) this._stashInputElement(input);
          if (w.parentNode) w.parentNode.removeChild(w);
        }
      } catch (_) { }
    }
  }

  _captureAllocationValues() {
    if (!this._allocationValueCache) this._allocationValueCache = {};
    const allocCard = document.getElementById('Allocations');
    const stash = document.getElementById('hidden-parameter-stash');
    const roots = [];
    if (allocCard) roots.push(allocCard);
    if (stash) roots.push(stash);
    for (let r = 0; r < roots.length; r++) {
      const inputs = roots[r].querySelectorAll('input[id^="InvestmentAllocation_"]');
      for (let i = 0; i < inputs.length; i++) {
        const el = inputs[i];
        const id = el && el.id ? String(el.id) : '';
        if (!id) continue;
        const v = (el.value != null) ? String(el.value) : '';
        // Only overwrite cache with non-empty values; this preserves previously entered values
        // even if a rebuilt UI briefly creates empty inputs.
        if (v.trim().length > 0) this._allocationValueCache[id] = v;
      }
    }
  }

  _applyAllocationValueIfCached(inputId, inputEl) {
    if (!this._allocationValueCache) return;
    const id = (inputId || '').toString();
    if (!id || !inputEl) return;
    const cached = this._allocationValueCache[id];
    if (cached === undefined || cached === null) return;
    const current = (inputEl.value != null) ? String(inputEl.value) : '';
    if (!current || !current.trim()) inputEl.value = String(cached);
  }

  _toBaseInvestmentKey(typeKey, countryCode) {
    const key = (typeKey || '').toString();
    const c = (countryCode || '').toString().trim().toLowerCase();
    const suffix = '_' + c;
    if (c && key.toLowerCase().endsWith(suffix)) {
      return key.slice(0, key.length - suffix.length);
    }
    return key;
  }

  _renderCountryPensionContributionFields(container, countryCode, simulationMode) {
    const host = container;
    if (!host) return;
    const country = (countryCode || '').toString().trim().toLowerCase();
    if (!country) return;

    // Remove any previously rendered pension fields for this country within the host and stash inputs.
    const existing = host.querySelectorAll(`[data-country-pension="true"][data-country-code="${country}"]`);
    existing.forEach(el => {
      try {
        const inputs = el.querySelectorAll('input');
        for (let i = 0; i < inputs.length; i++) this._stashInputElement(inputs[i]);
      } catch (_) { }
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    const cfg = Config.getInstance();
    const rs = cfg.getCachedTaxRuleSet(country);
    if (!rs) return;
    if (rs && typeof rs.hasPrivatePensions === 'function' && !rs.hasPrivatePensions()) return;

    const shouldShowP2 = (simulationMode || '').toString().toLowerCase() === 'couple';

    // P1 contribution
    const p1Wrapper = document.createElement('div');
    p1Wrapper.className = 'input-wrapper';
    p1Wrapper.setAttribute('data-country-pension', 'true');
    p1Wrapper.setAttribute('data-country-code', country);
    const p1Label = document.createElement('label');
    const p1Id = 'P1PensionContrib_' + country;
    p1Label.setAttribute('for', p1Id);
    p1Label.textContent = shouldShowP2 ? 'Your Pension Contribution' : 'Pension Contribution';
    p1Wrapper.appendChild(p1Label);
    const p1PctContainer = document.createElement('div');
    p1PctContainer.className = 'percentage-container';
    const p1Input = this._takeOrCreateInput(p1Id, 'percentage');
    p1Input.type = 'text';
    p1Input.setAttribute('inputmode', 'numeric');
    p1Input.setAttribute('pattern', '[0-9]*');
    p1Input.setAttribute('step', '1');
    p1Input.setAttribute('placeholder', ' ');
    p1PctContainer.appendChild(p1Input);
    p1Wrapper.appendChild(p1PctContainer);
    host.appendChild(p1Wrapper);

    // P2 contribution (couple mode only)
    const p2Wrapper = document.createElement('div');
    p2Wrapper.className = 'input-wrapper';
    p2Wrapper.setAttribute('data-country-pension', 'true');
    p2Wrapper.setAttribute('data-country-code', country);
    p2Wrapper.setAttribute('data-couple-only', 'true');
    p2Wrapper.style.display = shouldShowP2 ? 'flex' : 'none';
    const p2Label = document.createElement('label');
    const p2Id = 'P2PensionContrib_' + country;
    p2Label.setAttribute('for', p2Id);
    p2Label.textContent = 'Their Pension Contribution';
    p2Wrapper.appendChild(p2Label);
    const p2PctContainer = document.createElement('div');
    p2PctContainer.className = 'percentage-container';
    const p2Input = this._takeOrCreateInput(p2Id, 'percentage');
    p2Input.type = 'text';
    p2Input.setAttribute('inputmode', 'numeric');
    p2Input.setAttribute('pattern', '[0-9]*');
    p2Input.setAttribute('step', '1');
    p2Input.setAttribute('placeholder', ' ');
    p2PctContainer.appendChild(p2Input);
    p2Wrapper.appendChild(p2PctContainer);
    host.appendChild(p2Wrapper);

    // Pension capped dropdown per country
    const cappedWrapper = document.createElement('div');
    cappedWrapper.className = 'input-wrapper';
    cappedWrapper.setAttribute('data-country-pension', 'true');
    cappedWrapper.setAttribute('data-country-code', country);
    const cappedLabel = document.createElement('label');
    const cappedToggleId = 'PensionCappedToggle_' + country;
    cappedLabel.setAttribute('for', cappedToggleId);
    cappedLabel.textContent = 'Pension Contrib. Capped';
    cappedWrapper.appendChild(cappedLabel);

    const hiddenInput = this._takeOrCreateInput('PensionCapped_' + country, 'string');
    if (!hiddenInput.value) hiddenInput.value = 'Yes';
    hiddenInput.type = 'hidden';
    hiddenInput.autocomplete = 'off';
    cappedWrapper.appendChild(hiddenInput);

    const controlDiv = document.createElement('div');
    controlDiv.className = 'pension-capped-dd visualization-control';
    controlDiv.id = 'PensionCappedControl_' + country;
    const toggleSpan = document.createElement('span');
    toggleSpan.id = cappedToggleId;
    toggleSpan.className = 'dd-toggle pseudo-select';
    toggleSpan.textContent = hiddenInput.value || 'Yes';
    controlDiv.appendChild(toggleSpan);
    const optionsDiv = document.createElement('div');
    optionsDiv.id = 'PensionCappedOptions_' + country;
    optionsDiv.className = 'visualization-dropdown';
    optionsDiv.style.display = 'none';
    controlDiv.appendChild(optionsDiv);
    cappedWrapper.appendChild(controlDiv);
    host.appendChild(cappedWrapper);

    // Setup dropdown immediately using the created elements.
    // IMPORTANT: In some code paths the host container isn't attached to the document yet,
    // so document.getElementById(...) would fail and the dropdown would never initialize.
    try {
      const current = hiddenInput.value || 'Yes';
      toggleSpan.textContent = current;
      const dropdown = DropdownUtils.create({
        toggleEl: toggleSpan,
        dropdownEl: optionsDiv,
        options: [
          { value: 'Yes', label: 'Yes', description: 'Yes' },
          { value: 'No', label: 'No', description: 'No' },
          { value: 'Match', label: 'Match', description: 'Match' },
        ],
        selectedValue: current,
        onSelect: (val, label) => {
          hiddenInput.value = val;
          toggleSpan.textContent = label;
          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        },
      });
      this.pensionCappedDropdowns[country] = dropdown;
      if (dropdown && dropdown.wrapper) {
        hiddenInput._dropdownWrapper = dropdown.wrapper;
      }
    } catch (_) { }
    const tooltipTargets = [p1Id, 'P2PensionContrib_' + country];
    this.setupPensionContributionTooltips(tooltipTargets);
  }

  /**
   * Render UI-configurable tax credit fields for a country.
   * @param {HTMLElement} container - Parent container
   * @param {string} countryCode - Country code
   */
  _renderCountryTaxCreditFields(container, countryCode) {
    const host = container;
    if (!host) return;
    const country = (countryCode || '').toString().trim().toLowerCase();
    if (!country) return;

    // Remove any previously rendered credit fields for this country
    const existing = host.querySelectorAll(`[data-country-tax-credit="true"][data-country-code="${country}"]`);
    existing.forEach(el => {
      const inputs = el.querySelectorAll('input');
      for (let i = 0; i < inputs.length; i++) this._stashInputElement(inputs[i]);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    const cfg = Config.getInstance();
    const rs = cfg.getCachedTaxRuleSet(country);
    if (!rs || typeof rs.getUIConfigurableCredits !== 'function') return;

    const credits = rs.getUIConfigurableCredits();
    if (!credits || credits.length === 0) return;

    for (let i = 0; i < credits.length; i++) {
      const credit = credits[i];
      const creditId = credit.id;
      const uiInput = credit.uiInput;

      if (!uiInput || uiInput.section !== 'personalCircumstances') continue;

      const wrapper = document.createElement('div');
      wrapper.className = 'input-wrapper';
      wrapper.setAttribute('data-country-tax-credit', 'true');
      wrapper.setAttribute('data-country-code', country);
      wrapper.setAttribute('data-credit-id', creditId);

      const inputId = `TaxCredit_${creditId}_${country}`;

      const label = document.createElement('label');
      label.setAttribute('for', inputId);
      label.textContent = uiInput.label || creditId;
      wrapper.appendChild(label);

      const input = this._takeOrCreateInput(inputId, 'currency');
      input.type = 'text';
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('placeholder', ' ');
      wrapper.appendChild(input);

      if (uiInput.tooltip && typeof TooltipUtils !== 'undefined') {
        TooltipUtils.attachTooltip(input, uiInput.tooltip, {
          showOnFocus: true,
          persistWhileFocused: true
        });
      }

      host.appendChild(wrapper);
    }
  }

  /**
   * Setup country chips in Personal Circumstances and render per-country fields.
   */
  setupPersonalCircumstancesCountryChips() {
    const cfg = Config.getInstance();
    const relocationEnabled = cfg.isRelocationEnabled();
    const chipsVisible = relocationEnabled && this.hasEffectiveRelocationEvents();

    const card = document.getElementById('personalCircumstances');
    const group = document.querySelector('#personalCircumstances .input-group');
    if (!card || !group) return;

    // Place the tabs between global fields (marriage/children) and country-specific fields.
    let chipContainer = group.querySelector('.country-chip-container') || card.querySelector('.country-chip-container');
    if (!chipContainer) {
      chipContainer = document.createElement('div');
      chipContainer.className = 'country-chip-container';
    }
    const youngest = document.getElementById('YoungestChildBorn');
    const youngestWrap = youngest ? youngest.closest('.input-wrapper') : null;
    if (youngestWrap && youngestWrap.parentNode === group) {
      group.insertBefore(chipContainer, youngestWrap.nextSibling);
    } else {
      group.insertBefore(chipContainer, group.firstChild);
    }

    // Remove previously generated per-country state pension wrappers
    const existing = group.querySelectorAll('[data-country-state-pension="true"], [data-country-state-pension-p2="true"]');
    existing.forEach(el => {
      try {
        const inputs = el.querySelectorAll('input');
        for (let i = 0; i < inputs.length; i++) this._stashInputElement(inputs[i]);
      } catch (_) { }
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    const existingCredits = group.querySelectorAll('[data-country-credit-container="true"]');
    existingCredits.forEach(el => {
      const inputs = el.querySelectorAll('input');
      for (let i = 0; i < inputs.length; i++) this._stashInputElement(inputs[i]);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    // If relocation UI is disabled entirely, still render start-country tax credit inputs
    // (chips stay hidden; no per-country state pension UI in this mode).
    if (!relocationEnabled) {
      chipContainer.style.display = 'none';
      this.personalCircumstancesCountryChipSelector = null;

      const startCountry = cfg.getStartCountry();

      const legacyCredit = document.getElementById('PersonalTaxCredit');
      const legacyCreditWrap = legacyCredit ? legacyCredit.closest('.input-wrapper') : null;

      const creditContainer = document.createElement('div');
      creditContainer.setAttribute('data-country-credit-container', 'true');
      creditContainer.setAttribute('data-country-code', startCountry);
      creditContainer.style.display = '';
      this._renderCountryTaxCreditFields(creditContainer, startCountry);

      // If this country has no configurable credits, keep legacy field visible and stop.
      if (!creditContainer.firstChild) {
        if (legacyCreditWrap) legacyCreditWrap.style.display = '';
        return;
      }

      // Hide legacy PersonalTaxCredit field whenever the new per-country credit fields are shown.
      if (legacyCreditWrap) legacyCreditWrap.style.display = 'none';

      // Pre-populate the new personal credit input from legacy value (if present).
      if (legacyCredit && legacyCredit.value) {
        const newPersonal = document.getElementById('TaxCredit_personal_' + String(startCountry).toLowerCase());
        if (newPersonal && (!newPersonal.value || String(newPersonal.value).trim() === '')) {
          newPersonal.value = legacyCredit.value;
        }
      }

      // Insert where the legacy credit used to be; otherwise append.
      if (legacyCreditWrap && legacyCreditWrap.parentNode) {
        legacyCreditWrap.parentNode.insertBefore(creditContainer, legacyCreditWrap);
      } else {
        group.appendChild(creditContainer);
      }
      return;
    }

    // Relocation UI enabled:
    // - chips are shown only when there is an effective relocation
    // - StartCountry fields stay consistent (use per-country IDs even in "single-country" mode)
    chipContainer.style.display = chipsVisible ? '' : 'none';
    const startCountry = cfg.getStartCountry();
    const scenarioCountries = chipsVisible ? this.getScenarioCountries() : [startCountry];
    const countries = scenarioCountries.map(code => ({ code: code, name: cfg.getCountryNameByCode(code) }));
    const mgrSelected = this.countryTabSyncManager.getSelectedCountry('personalCircumstances');
    const prevSelected = (this.personalCircumstancesCountryChipSelector && this.personalCircumstancesCountryChipSelector.getSelectedCountry())
      ? this.personalCircumstancesCountryChipSelector.getSelectedCountry()
      : null;
    let selected = mgrSelected || prevSelected || startCountry;
    if (scenarioCountries.indexOf(String(selected).toLowerCase()) === -1) selected = startCountry;

    if (chipsVisible) {
      this.personalCircumstancesCountryChipSelector = new CountryChipSelector(
        countries,
        selected,
        (code) => { this._showStatePensionCountry(code); },
        'personalCircumstances'
      );
      this.personalCircumstancesCountryChipSelector.render(chipContainer);
    } else {
      this.personalCircumstancesCountryChipSelector = null;
    }
    // Per-country fields are now the visible/editable ones whenever relocation UI is enabled.
    this._enforceLegacyStatePensionVisibilityWhenChipsActive();

    // Hide legacy PersonalTaxCredit field when relocation UI is enabled
    const legacyCredit = document.getElementById('PersonalTaxCredit');
    const legacyCreditWrap = legacyCredit ? legacyCredit.closest('.input-wrapper') : null;
    if (legacyCreditWrap) legacyCreditWrap.style.display = 'none';

    // Insert per-country state pension wrappers before where legacy state pension wrapper used to be
    const legacyEl = document.getElementById('StatePensionWeekly');
    const legacyWrap = legacyEl ? legacyEl.closest('.input-wrapper') : null;
    const insertBeforeEl = legacyWrap || group.querySelector('.input-wrapper:last-child');

    for (let i = 0; i < scenarioCountries.length; i++) {
      const code = scenarioCountries[i];
      const periodLabel = this.getStatePensionPeriodLabel(code);
      // Convention: StatePension_{country} (period defined in tax rules)
      const inputId = 'StatePension_' + code;
      const inputIdP2 = 'P2StatePension_' + code;

      const wrapper = document.createElement('div');
      wrapper.className = 'input-wrapper';
      wrapper.setAttribute('data-country-state-pension', 'true');
      wrapper.setAttribute('data-country-code', code);
      wrapper.style.display = (code === selected) ? '' : 'none';

      const label = document.createElement('label');
      label.setAttribute('for', inputId);
      label.textContent = (this.currentSimMode === 'single')
        ? ('State Pension (' + periodLabel + ')')
        : ('Your State Pension (' + periodLabel + ')');
      wrapper.appendChild(label);

      const input = this._takeOrCreateInput(inputId, 'currency');
      input.type = 'text';
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('pattern', '[0-9]*');
      input.setAttribute('data-1p-ignore', '');
      wrapper.appendChild(input);

      // Person 2 field (same period label; visibility also depends on single/couple mode)
      const wrapperP2 = document.createElement('div');
      wrapperP2.className = 'input-wrapper';
      wrapperP2.setAttribute('data-country-state-pension-p2', 'true');
      wrapperP2.setAttribute('data-country-code', code);
      wrapperP2.style.display = (code === selected) ? '' : 'none';

      const labelP2 = document.createElement('label');
      labelP2.setAttribute('for', inputIdP2);
      labelP2.textContent = 'Their State Pension (' + periodLabel + ')';
      wrapperP2.appendChild(labelP2);

      const inputP2 = this._takeOrCreateInput(inputIdP2, 'currency');
      inputP2.type = 'text';
      inputP2.setAttribute('inputmode', 'numeric');
      inputP2.setAttribute('pattern', '[0-9]*');
      inputP2.setAttribute('data-1p-ignore', '');
      wrapperP2.appendChild(inputP2);

      if (insertBeforeEl && insertBeforeEl.parentNode === group) {
        group.insertBefore(wrapper, insertBeforeEl);
        group.insertBefore(wrapperP2, insertBeforeEl);
      } else {
        group.appendChild(wrapper);
        group.appendChild(wrapperP2);
      }
    }

    // Render tax credit fields for each country
    for (let i = 0; i < scenarioCountries.length; i++) {
      const code = scenarioCountries[i];

      // Create a container for this country's credit fields
      const creditContainer = document.createElement('div');
      creditContainer.setAttribute('data-country-credit-container', 'true');
      creditContainer.setAttribute('data-country-code', code);
      creditContainer.style.display = (code === selected) ? '' : 'none';

      this._renderCountryTaxCreditFields(creditContainer, code);

      if (insertBeforeEl && insertBeforeEl.parentNode) {
        insertBeforeEl.parentNode.insertBefore(creditContainer, insertBeforeEl);
      } else {
        group.appendChild(creditContainer);
      }
    }

    // Respect single/couple toggle for the P2 per-country state pension wrappers
    this._syncP2CountryStatePensionVisibility();
    this.countryTabSyncManager.setSelectedCountry('personalCircumstances', selected);
  }

  _showStatePensionCountry(code) {
    const selected = (code || '').toString().trim().toLowerCase();
    const wrappers = document.querySelectorAll('#personalCircumstances .input-group [data-country-state-pension="true"]');
    wrappers.forEach(el => {
      const c = (el.getAttribute('data-country-code') || '').toLowerCase();
      el.style.display = (c === selected) ? '' : 'none';
    });
    const wrappersP2 = document.querySelectorAll('#personalCircumstances .input-group [data-country-state-pension-p2="true"]');
    wrappersP2.forEach(el => {
      const c = (el.getAttribute('data-country-code') || '').toLowerCase();
      el.style.display = (c === selected) ? '' : 'none';
    });
    const creditContainers = document.querySelectorAll('#personalCircumstances .input-group [data-country-credit-container="true"]');
    creditContainers.forEach(el => {
      const c = (el.getAttribute('data-country-code') || '').toLowerCase();
      el.style.display = (c === selected) ? '' : 'none';
    });
    this._syncP2CountryStatePensionVisibility();
  }

  _syncP2CountryStatePensionVisibility() {
    const isSingleMode = this.currentSimMode === 'single';
    const selected = (this.personalCircumstancesCountryChipSelector && this.personalCircumstancesCountryChipSelector.getSelectedCountry)
      ? this.personalCircumstancesCountryChipSelector.getSelectedCountry()
      : null;
    const wrappersP2 = document.querySelectorAll('#personalCircumstances .input-group [data-country-state-pension-p2="true"]');
    wrappersP2.forEach(el => {
      const c = (el.getAttribute('data-country-code') || '').toLowerCase();
      if (isSingleMode) {
        el.style.display = 'none';
      } else {
        el.style.display = (!selected || c === String(selected).toLowerCase()) ? '' : 'none';
      }
    });
  }

  _enforceLegacyStatePensionVisibilityWhenChipsActive() {
    const cfg = Config.getInstance();
    // When relocation UI is enabled, legacy StatePensionWeekly fields should never be visible,
    // otherwise they can resurface on single/couple toggle and duplicate the per-country fields.
    const chipsActive = cfg.isRelocationEnabled && cfg.isRelocationEnabled();
    if (!chipsActive) return;
    try {
      const legacy = document.getElementById('StatePensionWeekly');
      const legacyWrap = legacy ? legacy.closest('.input-wrapper') : null;
      if (legacyWrap) legacyWrap.style.display = 'none';
    } catch (_) { }
    try {
      const legacy2 = document.getElementById('P2StatePensionWeekly');
      const legacyWrap2 = legacy2 ? legacy2.closest('.input-wrapper') : null;
      if (legacyWrap2) legacyWrap2.style.display = 'none';
    } catch (_) { }
  }

  getIncomeColumnVisibility() {
    const visibility = {};
    const threshold = 0.5;

    // Get pinned income types from tax rules
    const taxRuleSet = Config.getInstance().getCachedTaxRuleSet();
    const pinnedTypes = (taxRuleSet && taxRuleSet.getPinnedIncomeTypes) ? (taxRuleSet.getPinnedIncomeTypes() || []) : [];

    // Mark pinned types as always visible (keys are compared lowercased)
    for (let i = 0; i < pinnedTypes.length; i++) {
      visibility[String(pinnedTypes[i]).toLowerCase()] = true;
    }

    // Fixed asset columns should always remain visible
    visibility.pensionfund = true;
    visibility.cash = true;
    visibility.realestatecapital = true;

    // Scan dataSheet for income/capital columns with non-zero values
    try {
      const ds = (typeof dataSheet !== 'undefined') ? dataSheet : null;
      const length = Array.isArray(ds) ? ds.length : 0;
      if (length > 0) {
        // Build union of ALL income/capital keys across ALL rows (rows are 1-based)
        const visKeyToSourceKeys = {};
        const visKeyToMapInfo = {};
        for (let r = 1; r < length; r++) {
          const rowObj = ds[r];
          if (!rowObj) continue;
          const keys = Object.keys(rowObj);
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const lk = String(k).toLowerCase();
            if (!lk.startsWith('income') && lk.indexOf('capital__') !== 0) continue;
            const vKey = lk;
            if (!visKeyToSourceKeys[vKey]) visKeyToSourceKeys[vKey] = [];
            if (visKeyToSourceKeys[vKey].indexOf(k) === -1) visKeyToSourceKeys[vKey].push(k);
          }

          // Core emits dynamic investment liquidation income via investmentIncomeByKey (not flattened Income__ fields).
          // Add visibility keys matching the dynamic table columns: th[data-key="Income__${key}"] lowercased.
          const incMap = rowObj.investmentIncomeByKey;
          if (incMap && typeof incMap === 'object') {
            for (const invKey in incMap) {
              const vKey = ('income__' + String(invKey)).toLowerCase();
              if (!visKeyToSourceKeys[vKey]) visKeyToSourceKeys[vKey] = [];
              visKeyToMapInfo[vKey] = { map: 'income', key: invKey };
            }
          }

          const capMap = rowObj.investmentCapitalByKey;
          if (capMap && typeof capMap === 'object') {
            for (const invKey in capMap) {
              const vKey = ('capital__' + String(invKey)).toLowerCase();
              if (!visKeyToSourceKeys[vKey]) visKeyToSourceKeys[vKey] = [];
              visKeyToMapInfo[vKey] = { map: 'capital', key: invKey };
            }
          }
        }

        // For each visibility key, show if ANY row has a non-zero value in ANY of its source keys
        const visKeys = Object.keys(visKeyToSourceKeys);
        for (let i = 0; i < visKeys.length; i++) {
          const vKey = visKeys[i];
          if (visibility[vKey]) continue; // already pinned
          const sourceKeys = visKeyToSourceKeys[vKey] || [];
          let hasNonZeroValue = false;
          for (let r = 1; r < length && !hasNonZeroValue; r++) {
            const rowObj = ds[r];
            if (!rowObj) continue;
            const mapInfo = visKeyToMapInfo[vKey];
            if (mapInfo) {
              const srcMap = (mapInfo.map === 'capital') ? rowObj.investmentCapitalByKey : rowObj.investmentIncomeByKey;
              if (srcMap && typeof srcMap === 'object') {
                const value = srcMap[mapInfo.key];
                if (typeof value === 'number' && Math.abs(value) > threshold) { hasNonZeroValue = true; break; }
              }
            }
            for (let s = 0; s < sourceKeys.length; s++) {
              const sourceKey = sourceKeys[s];
              const value = rowObj[sourceKey];
              if (typeof value === 'number' && Math.abs(value) > threshold) { hasNonZeroValue = true; break; }
            }
          }
          visibility[vKey] = hasNonZeroValue;
        }
      }
    } catch (err) {
      // If anything goes wrong, keep pinned-only to avoid breaking UI
      console.warn('getIncomeColumnVisibility failed', err);
    }
    return visibility;
  }

  // Dynamically add per-investment-type income and capital columns when >2 types exist
  applyDynamicColumns(types, incomeVisibility) {
    // Dynamic table columns are now handled by DynamicSectionsConfig + TableManager.
    return;
  }

  // Mark the last column of each top-level group so borders can align dynamically
  updateGroupBorders() {
    const table = document.getElementById('Data');
    if (!table) return;
    const thead = table.querySelector('thead');
    if (!thead) return;
    const headerRow = thead.querySelector('tr:nth-child(2)');
    if (!headerRow) return;

    const allHeaders = Array.from(headerRow.querySelectorAll('th[data-key]')).filter(h => h.style.display !== 'none');
    if (!allHeaders.length || !this.tableManager) return;

    // Clear existing markers and borders
    for (let i = 0; i < allHeaders.length; i++) {
      allHeaders[i].removeAttribute('data-group-end');
      allHeaders[i].style.borderRight = '';
    }

    let blueprint = null;
    let boundarySet = null;
    try {
      blueprint = this.tableManager._buildRowBlueprint(Config.getInstance().getDefaultCountry());
      boundarySet = this.tableManager._computeGroupBoundarySet(blueprint);
    } catch (_) { }
    if (!blueprint || !boundarySet) return;

    for (let i = 0; i < blueprint.length && i < allHeaders.length; i++) {
      const th = allHeaders[i];
      const seg = blueprint[i];
      let applyBorder = boundarySet.has(i);
      if (seg && seg.type === 'section') {
        const cfg = this.tableManager.dynamicSectionsManager.getSectionConfig(seg.sectionId);
        if (cfg && cfg.isGroupBoundary === false) applyBorder = false;
      }
      if (applyBorder) {
        th.setAttribute('data-group-end', '1');
        th.style.borderRight = '3px solid #666';
      }
    }

    // Always close the table with a right-side border on the last column
    if (allHeaders.length > 0) {
      const lastTh = allHeaders[allHeaders.length - 1];
      lastTh.setAttribute('data-group-end', '1');
      lastTh.style.borderRight = '3px solid #666';
    }
  }

  setupRunSimulationButton() {
    const runButton = document.getElementById('runSimulation');
    if (!runButton) return;

    // Use a more comprehensive event handler that prevents multiple rapid triggers
    this.handleRunSimulation = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (this.isSimulationRunning || runButton.disabled) {
        return; // Don't start another simulation
      }

      // Clear all warnings at the start of each simulation attempt
      this.clearAllWarnings();

      // Check for relocation impacts if feature is enabled
      // Note: Button should already be disabled if impacts exist, but check as a safety measure
      try {
        if (Config.getInstance().isRelocationEnabled()) {
          // Ensure relocation impacts are freshly analyzed before gating
          const events = this.readEvents(false);
          const startCountry = Config.getInstance().getStartCountry();
          const summary = RelocationImpactDetector.analyzeEvents(events, startCountry);
          // Ensure relocation impact badges/indicators are refreshed immediately after analysis
          if (this.eventsTableManager && typeof this.eventsTableManager.updateRelocationImpactIndicators === 'function') {
            this.eventsTableManager.updateRelocationImpactIndicators(events);
          }
          this.updateStatusForRelocationImpacts(events);
          const hasImpacts = summary && summary.totalImpacted > 0;

          if (hasImpacts) {
            // Button should already be disabled, but prevent execution as a safety measure
            return; // Don't proceed with normal flow
          }
        }
      } catch (err) {
        // Log error but don't block simulation
        console.error('Error checking relocation impacts:', err);
      }

      // No impacts or relocation disabled - proceed normally
      const mobileRunButton = document.getElementById('runSimulationMobile');
      this.proceedWithSimulation(runButton, mobileRunButton);
    };

    runButton.addEventListener('click', this.handleRunSimulation);
  }

  proceedWithSimulation(runButton, mobileRunButton) {
    this.isSimulationRunning = true;
    // Clear stored country timeline at the start of a new simulation
    if (this.tableManager) {
      this.tableManager.storedCountryTimeline = null;
    }
    runButton.disabled = true;
    runButton.classList.add('disabled');
    runButton.style.pointerEvents = 'none';

    if (mobileRunButton) {
      mobileRunButton.disabled = true;
      mobileRunButton.classList.add('disabled');
      mobileRunButton.style.pointerEvents = 'none';
    }

    this.setStatus('Running...');
    runButton.offsetHeight; // This forces the browser to recalculate layout immediately

    // Do not rebuild chart datasets here; defer to end-of-run to avoid mid-run resets

    setTimeout(() => {
      try {
        run();
      } catch (error) {
        this.setError(error);
        // Re-enable button on error
        this.isSimulationRunning = false;
        runButton.disabled = false;
        runButton.classList.remove('disabled');
        runButton.style.pointerEvents = '';

        // Also re-enable mobile button on error
        if (mobileRunButton) {
          mobileRunButton.disabled = false;
          mobileRunButton.classList.remove('disabled');
          mobileRunButton.style.pointerEvents = '';
        }
      }
    }, 50); // Increased from 0 to 50ms to allow browser to render visual changes before CPU-intensive simulation
  }

  setupWizardInvocation() {
    const wizard = Wizard.getInstance();
    const helpButton = document.getElementById('startWizard');
    if (helpButton) {
      helpButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Close any open dropdowns before launching the wizard (helps when invoking on dropdown fields)
        if (window.__openDropdowns) {
          window.__openDropdowns.forEach((closer) => {
            if (typeof closer === 'function') closer();
          });
        }
        // Use wizard's built-in logic only if there was a recently focused input field
        if (wizard.lastFocusedWasInput && wizard.lastFocusedField) {
          wizard.start({ type: 'help' });
        } else {
          this.showWelcomeModal();
        }
      });
    }
    const userManualButton = document.getElementById('userManual');
    if (userManualButton) {
      userManualButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Close any open dropdowns before launching the wizard
        if (window.__openDropdowns) {
          window.__openDropdowns.forEach((closer) => {
            if (typeof closer === 'function') closer();
          });
        }
        wizard.start({ type: 'help', startAtStep: 0 });
      });
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === '?') {
        event.preventDefault();
        // Close any open dropdowns before launching the wizard
        if (window.__openDropdowns) {
          window.__openDropdowns.forEach((closer) => {
            if (typeof closer === 'function') closer();
          });
        }
        // For keyboard shortcut, use same logic as Help button
        if (wizard.lastFocusedWasInput && wizard.lastFocusedField) {
          wizard.start({ type: 'help' });
        } else {
          this.showWelcomeModal();
        }
      }
    });
  }

  setupNavigation() {
    document.querySelectorAll('a[href^="/"]').forEach(link => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        // If there are unsaved changes, confirm with the user before navigating away
        if (this.fileManager && this.fileManager.hasUnsavedChanges()) {
          const proceed = await this.showAlert("You have unsaved changes. Are you sure you want to navigate away and lose them?", "Unsaved Changes", true);
          if (!proceed) {
            return; // User chose to stay on the page
          }
        }
        window.parent.postMessage({ type: 'navigate', href: link.getAttribute('href') }, '*');
      });
    });
  }

  setupCardInfoIcons() {
    const cardSelectors = [
      '.card',                    // Standard parameter cards
      '.events-section',          // Events section
      '.graph-container',         // Graph containers
      '.data-section'            // Data table section
    ];

    cardSelectors.forEach(selector => {
      const cards = document.querySelectorAll(selector);
      cards.forEach(card => {
        // Special handling for graph containers
        if (card.classList.contains('graph-container')) {
          this.setupGraphContainerIcon(card);
          return;
        }

        // Find the h2 element within this card
        const h2Element = card.querySelector('h2');
        if (!h2Element) {
          return; // Skip if no h2 found
        }

        // Skip if icon already exists
        if (h2Element.querySelector('.card-info-icon')) {
          return;
        }

        // Create and configure info icon
        const infoIcon = document.createElement('div');
        infoIcon.className = 'card-info-icon';
        infoIcon.textContent = 'i';
        infoIcon.title = 'Information';

        // Add click event listener
        infoIcon.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleInfoIconClick(card);
        });

        // Append to the h2 element
        h2Element.appendChild(infoIcon);
      });
    });
  }

  setupGraphContainerIcon(graphContainer) {
    // Skip if icon already exists
    if (graphContainer.querySelector('.card-info-icon')) {
      return;
    }

    // Determine graph title based on canvas ID
    const canvas = graphContainer.querySelector('canvas');
    let title = 'Graph';
    if (canvas) {
      if (canvas.id === 'cashflowGraph') {
        title = 'Cashflow';
      } else if (canvas.id === 'assetsGraph') {
        title = 'Assets';
      }
    }

    // Create title element
    const titleElement = document.createElement('h2');
    titleElement.textContent = title;
    titleElement.style.position = 'absolute';
    titleElement.style.top = '1.2rem';
    titleElement.style.left = '50%';
    titleElement.style.transform = 'translateX(-50%)';
    titleElement.style.margin = '0';
    titleElement.style.fontSize = '1.08rem';
    titleElement.style.fontWeight = '600';
    titleElement.style.zIndex = '20';
    titleElement.style.pointerEvents = 'none';
    titleElement.style.color = 'var(--text-color)';
    titleElement.style.textAlign = 'center';

    // Create and configure info icon
    const infoIcon = document.createElement('div');
    infoIcon.className = 'card-info-icon';
    infoIcon.textContent = 'i';
    infoIcon.title = 'Information';
    infoIcon.style.pointerEvents = 'auto'; // Allow clicks on the icon

    // Add click event listener
    infoIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleInfoIconClick(graphContainer);
    });

    // Append icon to title, then title to graph container
    titleElement.appendChild(infoIcon);
    graphContainer.appendChild(titleElement);

    // Add class to trigger CSS adjustments for canvas positioning
    graphContainer.classList.add('has-html-title');
  }

  handleInfoIconClick(cardElement) {
    // Determine card type from parent element
    let cardType = 'unknown';

    if (cardElement.id) {
      cardType = cardElement.id;
    } else if (cardElement.classList.contains('events-section')) {
      cardType = 'events';
    } else if (cardElement.classList.contains('graph-container')) {
      // Determine specific graph based on contained canvas id
      const canvas = cardElement.querySelector('canvas');
      if (canvas && (canvas.id === 'cashflowGraph' || canvas.id === 'assetsGraph')) {
        cardType = canvas.id; // 'cashflowGraph' or 'assetsGraph'
      } else {
        cardType = 'graphs'; // fallback (should not happen if DOM is correct)
      }
    } else if (cardElement.classList.contains('data-section')) {
      cardType = 'data';
    }

    // Now call the wizard's showCardOverview method
    const wizard = Wizard.getInstance();
    if (wizard && cardType !== 'unknown') {
      // Prevent opening multiple mini-tours simultaneously
      if (wizard.wizardActive) {
        return; // A tour is already active, ignore additional clicks
      }
      try {
        wizard.start({ type: 'mini', card: cardType });
      } catch (error) {
        console.error('Error starting mini tour:', error);
      }
    } else {
      console.warn(`Cannot show overview for card type: ${cardType}`);
    }
  }

  clearExtraDataRows(maxAge) {
    this.tableManager.clearExtraDataRows(maxAge);
  }

  clearExtraChartRows(maxAge) {
    this.chartManager.clearExtraChartRows(maxAge);
  }

  setScenarioName(name) {
    this.fileManager.setScenarioName(name);
  }

  getScenarioName() {
    return this.fileManager.getScenarioName();
  }

  clearScenarioName() {
    this.fileManager.clearScenarioName();
  }

  // Method to trigger event validation (used by EventsTableManager)
  validateEvents() {
    // Get the global UIManager instance and trigger event validation
    if (typeof uiManager !== 'undefined' && uiManager) {
      uiManager.readEvents(true); // This will validate and set warnings
    }
  }

  flush(rerender = false) {
    if (rerender) {
      if (window.dataSheet && window.dataSheet.length > 0) {
        const uiMgr = (typeof uiManager !== 'undefined') ? uiManager : null;
        const scale = runs;
        for (let i = 1; i < window.dataSheet.length; i++) {
          let rowData = window.dataSheet[i];
          if (uiMgr && typeof uiMgr.buildDisplayDataRow === 'function') {
            rowData = uiMgr.buildDisplayDataRow(i, scale);
          }
          if (!rowData) continue;
          this.setDataRow(i, rowData);
        }
        try { this.tableManager.finalizeDataTableLayout(); } catch (_) { }
      }
      return;
    }
    // flush() is called at the end of updateStatusCell, which signals simulation completion
    if (this.isSimulationRunning) {
      // End-of-run: rebuild datasets transactionally and re-apply visibility to ensure single-step update
      const cfg = Config.getInstance();
      const rs = (cfg && typeof cfg.getCachedTaxRuleSet === 'function') ? cfg.getCachedTaxRuleSet(cfg.getDefaultCountry && cfg.getDefaultCountry()) : null;
      const types = (rs && typeof rs.getResolvedInvestmentTypes === 'function') ? (rs.getResolvedInvestmentTypes() || []) : [];
      if (this.chartManager && typeof this.chartManager.applyInvestmentTypes === 'function') {
        this.chartManager.applyInvestmentTypes(types, { preserveData: true, transactional: true });
      }
      // Recompute income visibility now that dataSheet is fully updated, then apply to chart
      if (this.chartManager && typeof this.chartManager.applyIncomeVisibility === 'function') {
        const incomeVisibility = this.getIncomeColumnVisibility();
        this.chartManager.applyIncomeVisibility(incomeVisibility);
      }

      this.isSimulationRunning = false;
      // Update button state (will re-enable if no impacts, or keep disabled if impacts exist)
      setTimeout(() => {
        this.updateRunButtonState();
      }, 100);
    }
  }

  scrollToGraphs() {
    // Auto-scroll to graphs section to show simulation results
    return new Promise((resolve) => {
      const graphsSection = document.querySelector('.graphs-section');
      if (!graphsSection) {
        resolve(); // No graphs section found, resolve immediately
        return;
      }

      // Add a small delay to ensure graphs are rendered
      setTimeout(() => {
        // Calculate header height to avoid clipping
        const header = document.querySelector('header');
        const headerHeight = header ? header.offsetHeight : 60; // fallback to 60px
        const additionalPadding = 20; // Extra space for visual comfort

        // Get the graphs section position
        const graphsRect = graphsSection.getBoundingClientRect();
        const currentScrollY = window.scrollY;
        const targetScrollY = currentScrollY + graphsRect.top - headerHeight - additionalPadding;

        // Check if we need to scroll at all
        const scrollDistance = Math.abs(targetScrollY - currentScrollY);

        // Robust check: simulate what the browser will actually do
        const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const clampedTargetScrollY = Math.max(0, Math.min(targetScrollY, maxScrollY));
        const wouldActuallyScroll = Math.abs(clampedTargetScrollY - currentScrollY) > 1; // 1px tolerance for rounding

        if (!wouldActuallyScroll) {
          // Browser won't actually scroll, resolve immediately
          resolve();
          return;
        }

        // Use modern scrollend event for precise scroll completion detection
        let hasResolved = false;
        const resolveOnce = () => {
          if (!hasResolved) {
            hasResolved = true;
            resolve();
          }
        };

        // Try modern scrollend event first (best option)
        const handleScrollEnd = () => {
          window.removeEventListener('scrollend', handleScrollEnd);
          resolveOnce();
        };

        // Fallback for browsers without scrollend support
        let scrollTimer = null;
        const handleScrollFallback = () => {
          if (scrollTimer) {
            clearTimeout(scrollTimer);
          }
          scrollTimer = setTimeout(() => {
            window.removeEventListener('scroll', handleScrollFallback);
            resolveOnce();
          }, 150);
        };

        // Check if scrollend is supported
        const supportsScrollEnd = 'onscrollend' in window;

        if (supportsScrollEnd) {
          // Modern browsers with scrollend support
          window.addEventListener('scrollend', handleScrollEnd, { once: true });
        } else {
          // Fallback for older browsers
          window.addEventListener('scroll', handleScrollFallback, { passive: true });
        }

        // Safety timeout to prevent hanging
        setTimeout(() => {
          window.removeEventListener('scrollend', handleScrollEnd);
          window.removeEventListener('scroll', handleScrollFallback);
          if (scrollTimer) {
            clearTimeout(scrollTimer);
          }
          resolveOnce();
        }, 3000);

        // Start the smooth scroll
        window.scrollTo({
          top: Math.max(0, targetScrollY),
          behavior: 'smooth'
        });
      }, 200);
    });
  }

  setupSimModeToggle() {
    const simModeSingle = document.getElementById('simModeSingle');
    const simModeCouple = document.getElementById('simModeCouple');

    if (simModeSingle && simModeCouple) {
      simModeSingle.addEventListener('click', () => {
        this.setValue('simulation_mode', 'single');
      });

      simModeCouple.addEventListener('click', () => {
        this.setValue('simulation_mode', 'couple');
      });
    }
  }

  updateUIForSimMode() {
    const isSingleMode = this.currentSimMode === 'single';

    // Update toggle icons active state
    const simModeSingle = document.getElementById('simModeSingle');
    const simModeCouple = document.getElementById('simModeCouple');
    if (simModeSingle && simModeCouple) {
      if (isSingleMode) {
        simModeSingle.classList.add('mode-toggle-active');
        simModeCouple.classList.remove('mode-toggle-active');
      } else {
        simModeCouple.classList.add('mode-toggle-active');
        simModeSingle.classList.remove('mode-toggle-active');
      }
    }

    // Show/Hide P2 Field Wrappers
    this.p2InputIds.forEach(inputId => {
      const inputElement = document.getElementById(inputId);
      if (inputElement) {
        const wrapper = inputElement.closest('.input-wrapper');
        if (wrapper) {
          wrapper.style.display = isSingleMode ? 'none' : 'flex'; // Assuming .input-wrapper uses flex
        }
      }
    });
    this._toggleCoupleOnlyFields(isSingleMode);

    // Update P1 Labels
    for (const inputId in this.p1Labels) {
      const labelElement = document.querySelector(`label[for="${inputId}"]`);
      if (labelElement) {
        labelElement.textContent = isSingleMode ? this.p1Labels[inputId].neutral : this.p1Labels[inputId].your;
      }
    }

    // Update InitialSavings label
    const initialSavingsLabel = document.querySelector('label[for="InitialSavings"]');
    if (initialSavingsLabel) {
      initialSavingsLabel.textContent = isSingleMode ? 'Current Savings' : 'Current Savings (Joint)';
    }

    // Sync chip-driven state pension fields with sim mode (single/couple).
    try {
      this.setupPersonalCircumstancesCountryChips();
      this._enforceLegacyStatePensionVisibilityWhenChipsActive();
    } catch (_) { }

    // Keep per-country pension contribution labels consistent with legacy behaviour
    this._updatePensionContributionLabelsForMode(isSingleMode);
  }

  _toggleCoupleOnlyFields(isSingleMode) {
    const wrappers = document.querySelectorAll('[data-couple-only="true"]');
    wrappers.forEach(w => {
      w.style.display = isSingleMode ? 'none' : 'flex';
    });
  }

  _updatePensionContributionLabelsForMode(isSingleMode) {
    const labels = document.querySelectorAll('label[for^="P1PensionContrib_"]');
    labels.forEach(l => {
      l.textContent = isSingleMode ? 'Pension Contribution' : 'Your Pension Contribution';
    });
  }

  setupEconomyModeToggle() {
    const deterministic = document.getElementById('economyModeDeterministic');
    const monteCarlo = document.getElementById('economyModeMonteCarlo');

    if (deterministic && monteCarlo) {
      deterministic.addEventListener('click', () => {
        this.switchEconomyMode('deterministic');
      });

      monteCarlo.addEventListener('click', () => {
        this.switchEconomyMode('montecarlo');
      });
    }
  }

  switchEconomyMode(mode) {
    if (this.currentEconomyMode === mode) return;

    this.preserveVolatilityValues();
    this.currentEconomyMode = mode;
    this.updateUIForEconomyMode();
  }

  updateUIForEconomyMode() {
    const isDeterministic = this.currentEconomyMode === 'deterministic';

    // Update toggle visual state
    const deterministic = document.getElementById('economyModeDeterministic');
    const monteCarlo = document.getElementById('economyModeMonteCarlo');

    if (deterministic && monteCarlo) {
      if (isDeterministic) {
        deterministic.classList.add('mode-toggle-active');
        monteCarlo.classList.remove('mode-toggle-active');
      } else {
        monteCarlo.classList.add('mode-toggle-active');
        deterministic.classList.remove('mode-toggle-active');
      }
    }

    // Show/hide volatility column - use visibility to maintain table layout
    const volatilityHeaders = document.querySelectorAll('#growthRates th:nth-child(3)');
    const volatilityCells = document.querySelectorAll('#growthRates td:nth-child(3)');

    volatilityHeaders.forEach(header => {
      header.style.visibility = isDeterministic ? 'hidden' : '';
    });

    volatilityCells.forEach(cell => {
      cell.style.visibility = isDeterministic ? 'hidden' : '';
    });

    // Restore or preserve values
    if (isDeterministic) {
      // Values are already preserved above
    } else {
      this.restoreVolatilityValues();
    }
  }

  preserveVolatilityValues() {
    const elements = document.querySelectorAll('#growthRates input[id$="GrowthStdDev"]');
    elements.forEach(el => {
      if (el && el.id && el.value) {
        this.preservedVolatilityValues[el.id] = el.value;
      }
    });
  }

  restoreVolatilityValues() {
    const elements = document.querySelectorAll('#growthRates input[id$="GrowthStdDev"]');
    elements.forEach(el => {
      if (el && el.id && this.preservedVolatilityValues[el.id]) {
        el.value = this.preservedVolatilityValues[el.id];
      }
    });
  }

  setupParameterTooltips() {
    const parameterAgeFields = ['StartingAge', 'P2StartingAge', 'RetirementAge', 'P2RetirementAge', 'TargetAge'];

    parameterAgeFields.forEach(fieldId => {
      const input = document.getElementById(fieldId);
      if (input) {
        input.addEventListener('mouseenter', () => {
          this.scheduleParameterTooltip(input, fieldId);
        });

        input.addEventListener('mouseleave', () => {
          this.cancelParameterTooltip();
        });
      }
    });

    // Hide parameter tooltips on scroll
    document.addEventListener('scroll', () => {
      this.cancelParameterTooltip();
    }, { passive: true });
  }

  /* -------------------------------------------------------------
   * Pension Contribution tooltip (maps entered % of max to actual % by age band)
   * ------------------------------------------------------------- */
  setupPensionContributionTooltips(targetInputIds) {
    const cfg = Config.getInstance();
    const ids = Array.isArray(targetInputIds) && targetInputIds.length
      ? targetInputIds
      : Array.from(document.querySelectorAll('input[id^="P1PensionContrib_"], input[id^="P2PensionContrib_"]')).map(el => el.id);

    const attach = (inputId) => {
      const el = document.getElementById(inputId);
      if (!el || typeof TooltipUtils === 'undefined') return;
      const country = this._extractCountryFromPensionId(inputId) || cfg.getDefaultCountry();
      TooltipUtils.attachTooltip(el, () => {
        // Determine entered value as a fraction (e.g., 100 -> 1.0)
        let entered = 1; // default to 100% for clarity when empty
        const raw = (el.value || '').toString().trim();
        const parsed = FormatUtils.parsePercentage(raw);
        if (typeof parsed === 'number' && !isNaN(parsed)) entered = parsed;

        // Get age bands from TaxRuleSet (fallback to legacy config if needed)
        let bands = {};
        const rs = cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet(country) : null;
        bands = (rs && typeof rs.getPensionContributionAgeBands === 'function')
          ? rs.getPensionContributionAgeBands()
          : (cfg && cfg.pensionContributionRateBands) ? cfg.pensionContributionRateBands : {};

        const keys = Object.keys(bands)
          .map(k => parseInt(k, 10))
          .filter(n => !isNaN(n))
          .sort((a, b) => a - b);

        // If no bands, show an empty table header
        if (keys.length === 0) {
          return '| Age | Contrib |\n| --- | --- |';
        }

        const lines = [];
        lines.push('| Age | Contrib |');
        lines.push('| --- | --- |');

        for (let i = 0; i < keys.length; i++) {
          const start = keys[i];
          const end = (i < keys.length - 1) ? (keys[i + 1] - 1) : null;
          const label = (i === 0 && start === 0)
            ? `<${keys[i + 1]}`
            : (end === null ? `${start}+` : `${start}-${end}`);
          const maxRate = parseFloat(bands[String(start)]);
          const actual = (isNaN(maxRate) ? 0 : maxRate) * entered;
          lines.push(`| ${label} | ${FormatUtils.formatPercentage(actual)} |`);
        }

        return lines.join('\n');
      }, {
        showOnFocus: true,
        persistWhileFocused: true,
        hideOnWizard: true,
        suppressTouchLongPress: true,
        tooltipClass: 'pension-tooltip'
      });
    };

    for (let i = 0; i < ids.length; i++) {
      attach(ids[i]);
    }
  }

  _extractCountryFromPensionId(inputId) {
    if (!inputId) return '';
    const idx = inputId.lastIndexOf('_');
    if (idx === -1) return '';
    return inputId.substring(idx + 1).toLowerCase();
  }

  showParameterTooltip(inputElement, fieldId) {
    const currentValue = parseInt(inputElement.value);
    if (isNaN(currentValue) || currentValue === 0) return;

    const alternativeValue = this.getParameterAlternativeValue(currentValue, fieldId);
    if (alternativeValue === null) return;

    let tooltipText;
    if (fieldId === 'StartingAge' || fieldId === 'P2StartingAge') {
      tooltipText = `Born in ${alternativeValue}`;
    } else if (fieldId === 'RetirementAge' || fieldId === 'P2RetirementAge') {
      tooltipText = `Retire in ${alternativeValue}`;
    } else if (fieldId === 'TargetAge') {
      tooltipText = `Year ${alternativeValue}`;
    }

    this.createParameterTooltip(inputElement, tooltipText);
  }

  getParameterAlternativeValue(inputValue, fieldId) {
    const currentYear = Config.getInstance().getSimulationStartYear();

    if (fieldId === 'StartingAge' || fieldId === 'P2StartingAge') {
      return currentYear - inputValue; // Birth year
    } else if (fieldId === 'RetirementAge' || fieldId === 'P2RetirementAge') {
      const startingAge = parseInt(this.getValue(fieldId.includes('P2') ? 'P2StartingAge' : 'StartingAge')) || 0;
      if (startingAge === 0) return null;
      const birthYear = currentYear - startingAge;
      return birthYear + inputValue; // Retirement year
    } else if (fieldId === 'TargetAge') {
      const startingAge = parseInt(this.getValue('StartingAge')) || 0;
      if (startingAge === 0) return null;
      const birthYear = currentYear - startingAge;
      return birthYear + inputValue; // Target year
    }
    return null;
  }

  createParameterTooltip(inputElement, text) {
    this.hideParameterTooltip(); // Remove any existing tooltip

    this.parameterTooltipElement = document.createElement('div');
    this.parameterTooltipElement.className = 'conversion-tooltip';
    this.parameterTooltipElement.textContent = text;
    document.body.appendChild(this.parameterTooltipElement);

    const rect = inputElement.getBoundingClientRect();
    this.parameterTooltipElement.style.left = `${rect.left + rect.width / 2}px`;
    this.parameterTooltipElement.style.top = `${rect.top}px`;

    // Trigger the visible state
    requestAnimationFrame(() => {
      if (this.parameterTooltipElement) {
        this.parameterTooltipElement.classList.add('visible');
      }
    });
  }

  scheduleParameterTooltip(inputElement, fieldId) {
    // Clear any existing timeout
    this.cancelParameterTooltip();

    // Schedule tooltip to show after delay
    this.parameterTooltipTimeout = setTimeout(() => {
      this.showParameterTooltip(inputElement, fieldId);
      this.parameterTooltipTimeout = null;
    }, 600); // 600ms delay
  }

  cancelParameterTooltip() {
    // Clear any pending timeout
    if (this.parameterTooltipTimeout) {
      clearTimeout(this.parameterTooltipTimeout);
      this.parameterTooltipTimeout = null;
    }

    // Hide any visible tooltip
    this.hideParameterTooltip();
  }

  hideParameterTooltip() {
    if (this.parameterTooltipElement) {
      this.parameterTooltipElement.remove();
      this.parameterTooltipElement = null;
    }
  }

  setupVisualizationControls() {
    // Populate the dropdown with available presets
    this.populateVisualizationPresets();

    // Initialise reusable dropdown helper
    this.visualizationDropdown = DropdownUtils.create({
      toggleEl: document.getElementById('visualizationToggle'),
      dropdownEl: document.getElementById('presetOptions'),
      selectedValue: 'default',
      onSelect: (val, label) => {
        // Update inline display label
        const displayElement = document.getElementById('selectedPresetDisplay');
        if (displayElement) displayElement.textContent = label;
        // Forward to existing handler
        this.onVisualizationPresetChange(val);
      },
    });

    // Set initial preset
    this.onVisualizationPresetChange('default');
  }

  /* -------------------------------------------------------------
   * Pension Capped dropdown (Yes / No / Match) with tooltips
   * ------------------------------------------------------------- */
  setupPensionCappedDropdownForCountry(countryCode) {
    const country = (countryCode || '').toString().trim().toLowerCase();
    if (!country) return;
    try {
      const hiddenInput = document.getElementById('PensionCapped_' + country);
      const toggleEl = document.getElementById('PensionCappedToggle_' + country);
      const dropdownEl = document.getElementById('PensionCappedOptions_' + country);
      if (!hiddenInput || !toggleEl || !dropdownEl) return;

      // Build descriptions for each option from help.yml text used for the legacy field
      let yesDesc = 'Yes';
      let noDesc = 'No';
      let matchDesc = 'Match';
      try {
        const help = window.driver?.js?.getHelpData?.();
        const step = Array.isArray(help?.WizardSteps)
          ? help.WizardSteps.find(s => s.element === '#PensionContributionCappedToggle')
          : null;
        if (step && step.popover && step.popover.description) {
          let html = String(step.popover.description);
          try {
            if (typeof FormatUtils !== 'undefined') {
              html = FormatUtils.processVariables(html);
              html = FormatUtils.replaceAgeYearPlaceholders(html);
            }
          } catch (_) { }
          const extract = (label) => {
            const re = new RegExp(`<li>\\s*<b>${label}<\\/b>\\s*:\\s*([^<]+)<\\/li>`, 'i');
            const m = html.match(re);
            return m ? m[1].trim() : label;
          };
          yesDesc = extract('Yes');
          noDesc = extract('No');
          matchDesc = extract('Match');
        }
      } catch (_) { }

      const current = hiddenInput.value || 'Yes';
      toggleEl.textContent = current;

      const options = [
        { value: 'Yes', label: 'Yes', description: yesDesc },
        { value: 'No', label: 'No', description: noDesc },
        { value: 'Match', label: 'Match', description: matchDesc },
      ];

      const dropdown = DropdownUtils.create({
        toggleEl,
        dropdownEl,
        options,
        selectedValue: current,
        onSelect: (val, label) => {
          hiddenInput.value = val;
          toggleEl.textContent = label;
          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        },
      });

      this.pensionCappedDropdowns[country] = dropdown;

      if (dropdown && dropdown.wrapper) {
        hiddenInput._dropdownWrapper = dropdown.wrapper;
      }
    } catch (err) {
      // Non-fatal: keep native fallback if anything goes wrong
      console.warn('setupPensionCappedDropdownForCountry failed', err);
    }
  }

  setupStartCountryDropdown() {
    try {
      const config = Config.getInstance();
      if (!config.isRelocationEnabled()) return;

      const inputGroup = document.querySelector('#startingPosition .input-group');
      if (!inputGroup) return;

      // Create wrapper div
      const wrapper = document.createElement('div');
      wrapper.className = 'input-wrapper';

      // Create label
      const label = document.createElement('label');
      label.setAttribute('for', 'StartCountry');
      label.textContent = 'Current Country';
      wrapper.appendChild(label);

      // Create hidden input
      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.id = 'StartCountry';
      hiddenInput.className = 'string';
      hiddenInput.autocomplete = 'off';
      // Initialize deterministically, but mark as "auto" so geolocation may override it
      // without being treated as a user edit.
      // IMPORTANT: do NOT call config.getStartCountry() here because StartCountry doesn't exist yet
      // and getStartCountry() reads it when relocation is enabled.
      hiddenInput.value = config.getDefaultCountry();
      hiddenInput.dataset.auto = '1';
      wrapper.appendChild(hiddenInput);
      hiddenInput.addEventListener('change', async () => {
        await this.ensureInvestmentParameterFields();
      });

      // Create dropdown control div
      const controlDiv = document.createElement('div');
      controlDiv.className = 'start-country-dd visualization-control';
      controlDiv.id = 'StartCountryControl';

      // Create toggle span
      const toggleSpan = document.createElement('span');
      toggleSpan.id = 'StartCountryToggle';
      toggleSpan.className = 'dd-toggle pseudo-select';
      controlDiv.appendChild(toggleSpan);

      // Create options div
      const optionsDiv = document.createElement('div');
      optionsDiv.id = 'StartCountryOptions';
      optionsDiv.className = 'visualization-dropdown';
      optionsDiv.style.display = 'none';
      controlDiv.appendChild(optionsDiv);

      wrapper.appendChild(controlDiv);

      // Insert after first child (after "Your Current Age")
      const firstChild = inputGroup.firstElementChild;
      if (firstChild) {
        inputGroup.insertBefore(wrapper, firstChild);
      } else {
        inputGroup.appendChild(wrapper);
      }

      // Populate options
      const availableCountries = config.getAvailableCountries();
      const options = availableCountries.map(c => ({ value: c.code, label: c.name }));

      this.startCountryDropdown = DropdownUtils.create({
        toggleEl: toggleSpan,
        dropdownEl: optionsDiv,
        options,
        selectedValue: hiddenInput.value,
        onSelect: (val, label) => {
          hiddenInput.value = val;
          hiddenInput.dataset.auto = '0'; // user-chosen
          toggleSpan.textContent = label;
          // Fire change so listeners update
          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        },
      });

      // Ensure visible label is populated for the initial selected value.
      try {
        const initial = (hiddenInput.value || '').toString().trim();
        if (initial) {
          const match = options.find(o => String(o.value).trim().toLowerCase() === initial.toLowerCase());
          if (match) toggleSpan.textContent = match.label;
        }
      } catch (_) { }

      // Bridge validation styling
      if (this.startCountryDropdown && this.startCountryDropdown.wrapper) {
        hiddenInput._dropdownWrapper = this.startCountryDropdown.wrapper;
      }

      // Fetch user country (non-blocking; never gate app startup on network)
      this.fetchUserCountry();
    } catch (err) {
      // Non-fatal
      console.warn('setupStartCountryDropdown failed', err);
    }
  }

  async fetchUserCountry() {
    try {
      // Ensure StartCountry input exists before setting value
      this.ensureParameterInput('StartCountry', 'string');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch('https://ipapi.co/country/', { signal: controller.signal });
      clearTimeout(timeoutId);
      const countryRaw = (await response.text());
      const country = typeof countryRaw === 'string' ? countryRaw.trim().toLowerCase() : '';
      if (!country) return;
      const config = Config.getInstance();
      const available = config.getAvailableCountries();
      const match = available.find(function (c) {
        var code = (c && c.code != null) ? String(c.code) : '';
        return code.trim().toLowerCase() === country;
      });
      if (match) {
        const from = this.getValue('StartCountry');
        const baselineSet = (this.fileManager && this.fileManager.lastSavedState !== null);
        const wasDirty = (this.fileManager && this.fileManager.hasUnsavedChanges && this.fileManager.hasUnsavedChanges());
        // Only auto-set if StartCountry is still "auto"/default (not user-selected) and hasn't started editing.
        const el = (typeof document !== 'undefined') ? document.getElementById('StartCountry') : null;
        const isAuto = !!(el && el.dataset && el.dataset.auto === '1');
        if (!isAuto) return;
        if (wasDirty) return;

        this.setValue('StartCountry', match.code);
        try { if (el && el.dataset) el.dataset.auto = '1'; } catch (_) { }
        // Also update the visible dropdown label/selected state (avoid re-dispatching change)
        const optionsEl = document.getElementById('StartCountryOptions');
        const toggleEl = document.getElementById('StartCountryToggle');
        if (optionsEl && toggleEl) {
          optionsEl.querySelectorAll('[data-value]').forEach(el => el.classList.remove('selected'));
          const optEl = optionsEl.querySelector(`[data-value="${match.code}"]`);
          if (optEl) {
            optEl.classList.add('selected');
            toggleEl.textContent = optEl.textContent;
          }
        }
        // Auto-detected StartCountry is part of initial app state, not a user edit:
        // refresh baseline if one was already established.
        if (this.fileManager && baselineSet) {
          this.fileManager.updateLastSavedState();
        }
      }
    } catch (e) {
      console.error('Failed to fetch user country:', e);
    }
  }

  populateVisualizationPresets() {
    const dropdown = document.getElementById('presetOptions');
    if (!dropdown) return;

    // Only populate if not already populated (check for options, not just any children)
    if (dropdown.querySelector('[data-value]')) return;

    // Ensure header exists
    let header = dropdown.querySelector('.dropdown-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'dropdown-header';
      header.textContent = 'Color Scheme';
      dropdown.appendChild(header);
    }

    // Get presets from VisualizationConfig
    if (typeof VisualizationConfig !== 'undefined' && VisualizationConfig.getPresets) {
      const presets = VisualizationConfig.getPresets();

      // Add options for each preset
      for (const [presetKey, presetData] of Object.entries(presets)) {
        const option = document.createElement('div');
        option.setAttribute('data-value', presetKey);
        option.textContent = presetData.name;
        option.setAttribute('data-description', presetData.description);

        if (presetKey === 'default') {
          option.classList.add('selected');
          // Update the display next to the icon
          const displayElement = document.getElementById('selectedPresetDisplay');
          if (displayElement) {
            displayElement.textContent = presetData.name;
          }
        }

        dropdown.appendChild(option);
      }
    } else {
      // Fallback if VisualizationConfig is not available
      const option = document.createElement('div');
      option.setAttribute('data-value', 'default');
      option.textContent = 'Default';
      option.classList.add('selected');
      dropdown.appendChild(option);
    }
  }

  onVisualizationPresetChange(presetName) {
    // Only redraw table colors if we have valid simulation results
    // The table data itself doesn't need to be redrawn, just the colors
    if (this.lastSimulationResults && this.lastSimulationResults.perRunResults && this.lastSimulationResults.perRunResults.length > 0) {
      try {
        this.redrawTableColors(this.lastSimulationResults.perRunResults, presetName);
      } catch (error) {
        console.error('Error redrawing table colors:', error);
        // Don't show error to user, just log it
      }
    }
  }

  // Store simulation results for later use with visualization changes
  storeSimulationResults(runs, perRunResults) {
    this.lastSimulationResults = {
      runs: runs,
      perRunResults: perRunResults
    };
  }

  // Redraw only the table row colors without changing the data
  redrawTableColors(perRunResults, presetName) {
    if (!window.uiManager || !perRunResults || perRunResults.length === 0) {
      return;
    }

    // Use the passed preset name instead of trying to get it from DOM
    const selectedPreset = presetName || 'default';

    // For "Plain" color scheme, clear all background colors to allow CSS zebra striping
    if (selectedPreset === 'default') {
      // Clear background colors from all data rows to let CSS zebra striping take over
      const maxRowsToCheck = Math.max(...perRunResults.map(run => run.length));
      for (let rowIndex = 1; rowIndex <= maxRowsToCheck; rowIndex++) {
        this.setDataRowBackgroundColor(rowIndex, '');
      }
      return;
    }

    const config = window.uiManager.createVisualizationConfig(selectedPreset);

    // Calculate new colors
    if (typeof PinchPointVisualizer !== 'undefined') {
      try {
        const visualizer = new PinchPointVisualizer(config);
        const rowColors = visualizer.calculateRowColors(perRunResults);

        // Apply colors to existing table rows
        for (const row in rowColors) {
          const rowIndex = parseInt(row);
          const color = rowColors[row];
          this.setDataRowBackgroundColor(rowIndex, color);
        }
      } catch (error) {
        console.error('Error in PinchPointVisualizer:', error);
      }
    }
  }

  /* -------------------------------------------------------------
   * Icon Tooltips (single/couple, age/year, economy modes)
   * ------------------------------------------------------------- */

  setupIconTooltips() {
    const tooltipMappings = {
      'simModeSingle': 'Single person mode',
      'simModeCouple': 'Couple/partnership mode',
      'ageYearModeAge': 'Show time in terms of age',
      'ageYearModeYear': 'Show time in terms of year',
      'economyModeDeterministic': 'Linear growth (no volatility)',
      'economyModeMonteCarlo': 'Volatility mode (Monte Carlo)'
    };

    Object.entries(tooltipMappings).forEach(([id, txt]) => {
      const el = document.getElementById(id);
      if (el) TooltipUtils.attachTooltip(el, txt);
    });
  }

  /**
   * Automatically moves the caret to the end of the text inside an input/textarea
   * whenever it gains focus for the first time. This improves usability on
   * mobile where tapping a field typically positions the cursor at the start.
   *
   * The listener is registered once for the whole document using the
   * `focusin` event (which bubbles) so that it works for dynamically created
   * inputs as well. We only target common text-like inputs to avoid impacting
   * controls such as checkboxes or buttons.
   */
  setupCursorEndOnFocus() {
    document.addEventListener('focusin', (event) => {
      const el = event.target;
      if (!el) return;

      // Consider INPUT types that accept free text plus TEXTAREA
      const textInputTypes = ['text', 'search', 'url', 'tel', 'password', 'email', 'number'];
      const isTextInput = (el.tagName === 'INPUT' && textInputTypes.includes(el.type)) || el.tagName === 'TEXTAREA';

      if (!isTextInput) return;

      // Only apply on mobile and tablet devices, skip desktop
      const hasTouchSupport = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      const isSmallScreen = window.innerWidth <= 1024; // common breakpoint for tablets
      const isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isMobileOrTablet = isMobileUserAgent || (hasTouchSupport && (isSmallScreen || isCoarsePointer));
      if (!isMobileOrTablet) return;

      // Defer to allow other focus handlers (e.g. FormatUtils) to adjust value first
      setTimeout(() => {
        try {
          const length = el.value?.length ?? 0;
          if (typeof el.setSelectionRange === 'function') {
            el.setSelectionRange(length, length);
          } else if (typeof el.createTextRange === 'function') { // IE fallback
            const range = el.createTextRange();
            range.collapse(false);
            range.select();
          }
        } catch (err) {
          // Silently ignore errors (e.g. unsupported input type)
        }
      }, 0);
    });
  }

  /**
   * Mobile-only: Long-press on an input/select/textarea opens contextual help (same as pressing '?').
   * Excludes dropdown toggles which are handled by DropdownUtils.
   */
  setupMobileLongPressHelp() {
    try {
      const isMobile = (typeof DeviceUtils !== 'undefined' && DeviceUtils.isMobile && DeviceUtils.isMobile());
      if (!isMobile) return;

      let longPressTimer = null;
      let startX = 0;
      let startY = 0;
      let pressedElement = null;
      const PRESS_DELAY_MS = 600;
      const MOVE_TOLERANCE_PX = 10;

      const cancelTimer = () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        pressedElement = null;
      };

      document.addEventListener(
        'touchstart',
        (e) => {
          // Avoid when any dropdown is open (options have their own handlers)
          if (window.__openDropdowns && window.__openDropdowns.size > 0) return;

          // Only target native inputs – custom dropdowns handled in DropdownUtils
          const target = e.target;
          const inputEl = target && target.closest && target.closest('input, textarea, select');
          if (!inputEl) return;
          if (inputEl.disabled) return;

          // Do not trigger if interacting with custom dropdown wrappers/toggles
          if (target.closest && (target.closest('.dropdown-wrapper') || target.closest('.visualization-control') || target.closest('[id$="Toggle"]'))) {
            return;
          }

          const touch = e.touches && e.touches[0];
          if (!touch) return;
          startX = touch.clientX;
          startY = touch.clientY;
          pressedElement = inputEl;

          longPressTimer = setTimeout(() => {
            const wizard = (typeof Wizard !== 'undefined' && typeof Wizard.getInstance === 'function') ? Wizard.getInstance() : null;
            if (!wizard || wizard.wizardActive) { cancelTimer(); return; }

            // Close any open dropdowns before launching the wizard
            if (window.__openDropdowns) {
              window.__openDropdowns.forEach((closer) => {
                if (typeof closer === 'function') closer();
              });
            }

            // Provide context for help
            wizard.lastFocusedField = pressedElement;
            wizard.lastFocusedWasInput = true;
            wizard.start({ type: 'help' });
            cancelTimer();
          }, PRESS_DELAY_MS);
        },
        { passive: true }
      );

      // Suppress native context menu on long-press for inputs and custom dropdown controls (mobile only)
      document.addEventListener('contextmenu', (e) => {
        if (!isMobile) return;
        const t = e.target;
        if (!t) return;
        if (t.closest && (
          t.closest('input, textarea, select') ||
          t.closest('.dropdown-wrapper') ||
          t.closest('.visualization-control')
        )) {
          e.preventDefault();
        }
      }, { capture: true });

      document.addEventListener(
        'touchmove',
        (e) => {
          if (!longPressTimer) return;
          const touch = e.touches && e.touches[0];
          if (!touch) return;
          const dx = Math.abs(touch.clientX - startX);
          const dy = Math.abs(touch.clientY - startY);
          if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
            cancelTimer();
          }
        },
        { passive: true }
      );

      ['touchend', 'touchcancel'].forEach((type) => {
        document.addEventListener(type, cancelTimer, { passive: true });
      });
    } catch (_) {
      // Fail safe – never block UI if feature detection fails
    }
  }

}

window.addEventListener('DOMContentLoaded', async () => { // Add async
  try {
    const webUi = WebUI.getInstance(); // Get WebUI instance
    await Config.initialize(webUi);   // Initialize Config and wait for it
    // Tax ruleset is preloaded by Config.initialize(); no need to preload again here
    // Apply dynamic investment labels from ruleset (first two investment types)
    webUi.applyInvestmentLabels();

    // Initialize controls that depend on Config/tax rules being available
    // IMPORTANT: Create StartCountry controls before any code may read it
    await webUi.setupStartCountryDropdown();
    // StartCountry may be changed by fetchUserCountry(); ensure its ruleset is cached
    // before any sync-only consumers (e.g. dynamic sections) run.
    const cfgStart = Config.getInstance();
    const startCountry = cfgStart.getStartCountry();
    if (!cfgStart.getCachedTaxRuleSet(startCountry)) {
      await cfgStart.getTaxRuleSet(startCountry);
    }
    await webUi.ensureInvestmentParameterFields();
    webUi.setupScenarioCountryAutoRefresh();

    // Create the initial empty event row as early as possible post-Config init
    // so tests and UI logic can safely target row_1 without racing later steps
    if (webUi.eventsTableManager) webUi.eventsTableManager.addEventRow();

    // Minimal trigger to ensure tax headers exist: build row 0 then remove it
    if (webUi.tableManager && typeof webUi.tableManager.setDataRow === 'function') {
      webUi.tableManager.setDataRow(0, {});
      const temp = document.getElementById('data_row_0');
      if (temp && temp.parentNode) temp.parentNode.removeChild(temp);
    }

    // Capture static header tooltip text for reuse in dynamic tax headers, then
    // attach TooltipUtils to static data table headers (replace native title tooltips).
    document.querySelectorAll('#Data thead th[title]').forEach(th => {
      const txt = th.getAttribute('title');
      if (!txt) return;
      // Persist tooltip text for TableManager-generated sticky tax headers
      try { th.setAttribute('data-tooltip', txt); } catch (_) { }
      th.removeAttribute('title');
      TooltipUtils.attachTooltip(th, txt, { hoverDelay: 150, touchDelay: 250 });
    });

    // After labels and headers are present, apply pinned-only income visibility
    const cfg = Config.getInstance();
    const rs = (cfg.getCachedTaxRuleSet ? (cfg.getCachedTaxRuleSet(cfg.getDefaultCountry())) : null) || (cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet() : null);
    if (rs && typeof rs.getInvestmentTypes === 'function') {
      let investmentTypes = rs.getResolvedInvestmentTypes() || [];
      try {
        const cached = cfg.listCachedRuleSets ? cfg.listCachedRuleSets() : {};
        const typeByKey = {};
        const ordered = [];
        const addTypes = (list) => {
          const arr = Array.isArray(list) ? list : [];
          for (let i = 0; i < arr.length; i++) {
            const t = arr[i];
            if (!t || !t.key) continue;
            if (!typeByKey[t.key]) {
              typeByKey[t.key] = t;
              ordered.push(t);
            }
          }
        };
        addTypes(investmentTypes);
        for (const cc in cached) {
          const crs = cached[cc];
          if (!crs || crs === rs || typeof crs.getResolvedInvestmentTypes !== 'function') continue;
          addTypes(crs.getResolvedInvestmentTypes());
        }
        investmentTypes = ordered;
      } catch (_) { }
      const pinned = (typeof rs.getPinnedIncomeTypes === 'function') ? (rs.getPinnedIncomeTypes() || []) : [];
      const pinnedVisibility = {};
      for (let i = 0; i < pinned.length; i++) {
        pinnedVisibility[String(pinned[i]).toLowerCase()] = true;
      }
      // Rebuild chart datasets to include dynamic investment income/capital, but preserve any data
      webUi.chartManager.applyInvestmentTypes(investmentTypes, { preserveData: true, transactional: true });
      // Setup chart currency controls after charts are initialized
      webUi.chartManager.setupChartCurrencyControls(webUi);
      // Apply initial pinned-only visibility to both table and chart
      webUi.applyDynamicColumns(investmentTypes, pinnedVisibility);
      webUi.chartManager.applyIncomeVisibility(pinnedVisibility);
    }
    // Guard: If ruleset not yet cached at this point, still setup chart currency controls once
    else if (webUi.chartManager) {
      webUi.chartManager.setupChartCurrencyControls(webUi);
    }
    if (webUi.tableManager) {
      webUi.tableManager.setupTableCurrencyControls();
    }

    // Apply saved preferences (view mode + age/year) now that Config is ready
    if (webUi.eventsTableManager) webUi.eventsTableManager._applySavedPreferences();

    // (Initial row already added earlier)

    // Establish baseline for new scenario now that Config is initialized (avoids extra getVersion call)
    webUi.fileManager.updateLastSavedState();

    // Load field labels configuration
    await webUi.fieldLabelsManager.loadLabels();

    // Show welcome modal based on user preference
    const welcomeModalState = localStorage.getItem('welcomeModalState') || 'on';
    if (welcomeModalState === 'on') {
      webUi.showWelcomeModal();
    }

    // Hide loading overlay when initialization completes successfully
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }

    // Any further app initialization that depends on Config being ready can go here.
    // For example, if WebUI needs to refresh something based on config:
    // webUi.postConfigInit(); // (if such a method were needed)

  } catch (error) {
    console.error("Failed to initialize application:", error);
    // Display a user-friendly error message on the page if necessary
    const body = document.querySelector('body');
    if (body) {
      body.innerHTML = `<div style="padding: 20px; text-align: center; font-family: sans-serif;">
                          <h1>Application Error</h1>
                          <p>Could not initialize application configuration. Please try again later.</p>
                          <p>Details: ${error.message}</p>
                       </div>`;
    }

    // Hide loading overlay in error scenario as well
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }
});

// Explicitly expose WebUI on window for reliable access in test contexts
if (typeof window !== 'undefined') {
  window.WebUI = WebUI;
}
