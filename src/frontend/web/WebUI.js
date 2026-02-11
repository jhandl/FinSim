var WebUI_instance = null;

class WebUI extends AbstractUI {

  constructor() {
    super();

    // Initialize simulation state tracking
    this.isSimulationRunning = false;
    this.currentSimMode = 'single'; // Default to single person mode
    this.currentEconomyMode = 'deterministic'; // Default to deterministic mode
    this.preservedVolatilityValues = {}; // Store volatility values when switching modes
    this.investmentStrategiesEnabled = false;
    this.perCountryInvestmentsEnabled = false;

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
    this.dragAndDrop = new DragAndDrop(this);

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
    if (elementId === 'investmentStrategiesEnabled') {
      return this.investmentStrategiesEnabled;
    }
    if (elementId === 'perCountryInvestmentsEnabled') {
      return this.perCountryInvestmentsEnabled;
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
    if (elementId === 'investmentStrategiesEnabled') {
      this.investmentStrategiesEnabled = (value === 'on' || value === true || value === 'true');
      return;
    }
    if (elementId === 'perCountryInvestmentsEnabled') {
      this.perCountryInvestmentsEnabled = (value === 'on' || value === true || value === 'true');
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
    this.syncToggleStates();
  }

  async loadFromUrl(url, name) {
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
    this.syncToggleStates();
  }

  syncToggleStates() {
    const strategiesState = this.investmentStrategiesEnabled ? 'on' : 'off';
    localStorage.setItem('investmentStrategiesEnabled', strategiesState);
    const strategiesButton = document.getElementById('investmentStrategiesToggleMobile');
    if (strategiesButton) {
      strategiesButton.setAttribute('data-toggle-state', strategiesState);
      const toggleSwitch = strategiesButton.querySelector('.toggle-switch');
      if (toggleSwitch) {
        if (strategiesState === 'on') toggleSwitch.classList.add('active');
        else toggleSwitch.classList.remove('active');
      }
    }
    window.dispatchEvent(new CustomEvent('investmentStrategiesToggle', {
      detail: { state: strategiesState, enabled: strategiesState === 'on' }
    }));

    const perCountryState = this.perCountryInvestmentsEnabled ? 'on' : 'off';
    localStorage.setItem('perCountryInvestmentsEnabled', perCountryState);
    const perCountryButton = document.getElementById('perCountryInvestmentsToggleMobile');
    if (perCountryButton) {
      perCountryButton.setAttribute('data-toggle-state', perCountryState);
      const toggleSwitch = perCountryButton.querySelector('.toggle-switch');
      if (toggleSwitch) {
        if (perCountryState === 'on') toggleSwitch.classList.add('active');
        else toggleSwitch.classList.remove('active');
      }
    }
    window.dispatchEvent(new CustomEvent('perCountryInvestmentsToggle', {
      detail: { state: perCountryState, enabled: perCountryState === 'on' }
    }));
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
    if (this.dragAndDrop && typeof this.dragAndDrop.renderPriorities === 'function') {
      await this.dragAndDrop.renderPriorities();
    }
  }

  renderInvestmentParameterFields(investmentTypes) {
    const types = Array.isArray(investmentTypes) ? investmentTypes : [];
    const allocationTypes = types.filter(t => !(t && t.excludeFromAllocations));
    const economyTypes = types.filter(t => !(t && t.sellWhenReceived));
    const excludedFromAllocationsTypes = types.filter(t => t && t.excludeFromAllocations);
    this._lastInvestmentTypesForGrowthRates = types;

    // Capture existing growth rate/volatility values before removing dynamic fields.
    // This preserves values when StartCountry changes trigger mid-deserialization.
    const growthRateCache = {};
    const existingDynamicInputs = document.querySelectorAll('[data-dynamic-investment-param="true"] input.percentage');
    existingDynamicInputs.forEach(input => {
      if (input && input.id && input.value) {
        growthRateCache[input.id] = input.value;
      }
    });
    // Preserve starting position initial capital values across dynamic re-renders.
    const startingCapitalCache = {};
    const existingCapitalInputs = document.querySelectorAll('[data-dynamic-investment-param="true"] input.currency');
    existingCapitalInputs.forEach(input => {
      if (!input || !input.id || input.id.indexOf('InitialCapital_') !== 0) return;
      const raw = (input.value !== undefined && input.value !== null) ? String(input.value) : '';
      if (raw.trim() !== '') startingCapitalCache[input.id] = raw;
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

    // Keep hidden parameter inputs for excluded-from-allocations types so
    // serialization/deserialization paths that read by key continue to work.
    for (let i = 0; i < excludedFromAllocationsTypes.length; i++) {
      const t = excludedFromAllocationsTypes[i] || {};
      const key = t.key;
      if (!key) continue;
      this.ensureParameterInput('InitialCapital_' + key, 'currency');
      this.ensureParameterInput('InvestmentAllocation_' + key, 'percentage');
    }

    // Ensure per-type growth inputs exist for local investments (no baseRef) for serialization/back-compat.
    // Non-local wrappers (with baseRef) use asset-level params and don't need wrapper-level inputs.
    for (let i = 0; i < types.length; i++) {
      const t = types[i] || {};
      const key = t.key;
      if (!key) continue;
      
      // Skip wrapper-level inputs for non-local wrappers (those with baseRef)
      // Non-local wrappers use asset-level params: GlobalAssetGrowth_{baseRef}, GlobalAssetVolatility_{baseRef}
      if (t.baseRef) continue;

      const grId = key + 'GrowthRate';
      const sdId = key + 'GrowthStdDev';

      const gr = this._takeOrCreateInput(grId, 'percentage');
      gr.type = 'text';
      gr.setAttribute('inputmode', 'numeric');
      gr.setAttribute('pattern', '[0-9]*');
      gr.setAttribute('step', '1');
      this._stashInputElement(gr);

      const sd = this._takeOrCreateInput(sdId, 'percentage');
      sd.type = 'text';
      sd.setAttribute('inputmode', 'numeric');
      sd.setAttribute('pattern', '[0-9]*');
      sd.setAttribute('step', '1');
      this._stashInputElement(sd);
    }

    const startGroup = document.querySelector('#startingPosition .input-group');
    if (startGroup) {
      // Per Phase 7 design: starting position initial capital remains StartCountry-only.
      // IDs intentionally remain `InitialCapital_{typeKey}` (no country prefix).
      for (let i = 0; i < economyTypes.length; i++) {
        const t = economyTypes[i] || {};
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
        const cached = startingCapitalCache[inputId];
        if (cached !== undefined && cached !== null && String(cached).trim() !== '') {
          input.value = cached;
        }
        wrapper.appendChild(input);

        startGroup.appendChild(wrapper);
      }
    }

    // Allocations: if relocation is enabled AND MV-* events exist, render per-country allocation inputs
    // and use the chips as a context switcher (show/hide per-country containers).
    this.refreshCountryChipsFromScenario(allocationTypes);

    const tbody = document.querySelector('#growthRates table.growth-rates-table tbody');
    const inflationInput = document.getElementById('Inflation');
    const inflationRow = inflationInput ? inflationInput.closest('tr') : null;
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
    if (tbody) {
      const cfg = Config.getInstance();
      const baseTypes = cfg.getInvestmentBaseTypes();
      const makeGrowthRow = (labelText, growthId, volId) => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-dynamic-investment-param', 'true');

        const tdLabel = document.createElement('td');
        tdLabel.textContent = labelText;
        tr.appendChild(tdLabel);

        const tdGrowth = document.createElement('td');
        const grWrap = document.createElement('div');
        grWrap.className = 'percentage-container';
        const gr = this._takeOrCreateInput(growthId, 'percentage');
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
        const sd = this._takeOrCreateInput(volId, 'percentage');
        sd.type = 'text';
        sd.setAttribute('inputmode', 'numeric');
        sd.setAttribute('pattern', '[0-9]*');
        sd.setAttribute('step', '1');
        sdWrap.appendChild(sd);
        tdVol.appendChild(sdWrap);
        tr.appendChild(tdVol);

        return tr;
      };

      if (baseTypes && baseTypes.length > 0) {
        const globalsFrag = document.createDocumentFragment();
        for (let i = 0; i < baseTypes.length; i++) {
          const t = baseTypes[i] || {};
          const baseKey = t.baseKey;
          if (!baseKey) continue;
          const labelText = t.label || baseKey;
          const growthId = 'GlobalAssetGrowth_' + baseKey;
          const volId = 'GlobalAssetVolatility_' + baseKey;
          const tr = makeGrowthRow(labelText, growthId, volId);
          globalsFrag.appendChild(tr);
        }
        if (globalsFrag.firstChild) {
          tbody.insertBefore(globalsFrag, tbody.firstChild);
        }
      }

      const relocationEnabled = cfg.isRelocationEnabled();
      const hasMV = relocationEnabled && this.hasRelocationEvents();
      const showCountryChips = this.perCountryInvestmentsEnabled && hasMV;
      if (!showCountryChips) {
        this.growthRatesCountryChipSelector = null;
        setRowHeadingForInput('Inflation', 'Inflation');
        if (inflationRow) inflationRow.style.display = '';
        const rows = tbody.querySelectorAll('[data-dynamic-inflation-row="true"]');
        rows.forEach(el => {
          const inputs = el.querySelectorAll('input');
          for (let i = 0; i < inputs.length; i++) this._stashInputElement(inputs[i]);
          if (el && el.parentNode) el.parentNode.removeChild(el);
        });

        // Render local investment types for start country (when no chips shown)
        for (let i = 0; i < economyTypes.length; i++) {
          const t = economyTypes[i] || {};
          const key = t.key;
          if (!key) continue;
          
          // Only show local investments (no baseRef)
          // Non-local (with baseRef) are handled by global rows at the top
          if (t.baseRef) continue;

          const labelText = t.label || key;
          const growthId = key + 'GrowthRate';
          const volId = key + 'GrowthStdDev';

          const tr = makeGrowthRow(labelText, growthId, volId);
          if (inflationRow) tbody.insertBefore(tr, inflationRow);
          else tbody.appendChild(tr);
        }
      }

      if (showCountryChips) {
        if (inflationRow) inflationRow.style.display = 'none';
        const insertBeforeRow = inflationRow || null;

        const chipsRow = document.createElement('tr');
        chipsRow.setAttribute('data-dynamic-investment-param', 'true');
        const chipsCell = document.createElement('td');
        chipsCell.colSpan = 3;
        const chipContainer = document.createElement('div');
        chipContainer.className = 'country-chip-container';
        chipsCell.appendChild(chipContainer);
        chipsRow.appendChild(chipsCell);

        if (insertBeforeRow) {
          tbody.insertBefore(chipsRow, insertBeforeRow);
        } else {
          tbody.appendChild(chipsRow);
        }

        const scenarioCountries = this.getScenarioCountries();
        const countries = scenarioCountries.map(code => ({ code: code, name: cfg.getCountryNameByCode(code) }));
        const startCountry = cfg.getStartCountry();
        const mgrSelected = this.countryTabSyncManager.getSelectedCountry('growthRates');
        const prevSelected = (this.growthRatesCountryChipSelector && this.growthRatesCountryChipSelector.getSelectedCountry())
          ? this.growthRatesCountryChipSelector.getSelectedCountry()
          : null;
        let selected = mgrSelected || prevSelected || startCountry;
        if (scenarioCountries.indexOf(String(selected).toLowerCase()) === -1) selected = startCountry;

        const updateCountryLabels = (code) => {
          const cc = (code || '').toString().trim().toUpperCase();
          if (cc) {
            setRowHeadingForInput('Inflation', 'Inflation (' + cc + ')');
          }
        };

        const showGrowthCountry = (code) => {
          const selectedCode = (code || '').toString().trim().toLowerCase();
          const rows = tbody.querySelectorAll('[data-country-growth-row="true"]');
          rows.forEach(el => {
            const c = (el.getAttribute('data-country-code') || '').toLowerCase();
            el.style.display = (c === selectedCode) ? '' : 'none';
          });
          updateCountryLabels(selectedCode);
        };

        const clearInflationRows = () => {
          const rows = tbody.querySelectorAll('[data-dynamic-inflation-row="true"]');
          rows.forEach(el => {
            const inputs = el.querySelectorAll('input');
            for (let i = 0; i < inputs.length; i++) this._stashInputElement(inputs[i]);
            if (el && el.parentNode) el.parentNode.removeChild(el);
          });
        };

        const renderInflationRow = (code) => {
          const selectedCode = (code || '').toString().trim().toLowerCase();
          clearInflationRows();
          if (!selectedCode) return;
          const cc = selectedCode.toUpperCase();
          const infId = 'Inflation_' + selectedCode;
          const trInflation = document.createElement('tr');
          trInflation.setAttribute('data-dynamic-inflation-row', 'true');
          const infLabel = document.createElement('td');
          infLabel.textContent = 'Inflation (' + cc + ')';
          trInflation.appendChild(infLabel);
          const infGrowth = document.createElement('td');
          const infWrap = document.createElement('div');
          infWrap.className = 'percentage-container';
          const infInput = this._takeOrCreateInput(infId, 'percentage');
          infInput.type = 'text';
          infInput.setAttribute('inputmode', 'numeric');
          infInput.setAttribute('pattern', '[0-9]*');
          infInput.setAttribute('step', '0.1');
          infWrap.appendChild(infInput);
          infGrowth.appendChild(infWrap);
          trInflation.appendChild(infGrowth);
          trInflation.appendChild(document.createElement('td'));
          if (insertBeforeRow) {
            tbody.insertBefore(trInflation, insertBeforeRow);
          } else {
            tbody.appendChild(trInflation);
          }
          this.formatUtils.setupPercentageInputs();
          this.updateUIForEconomyMode();
        };

        this.growthRatesCountryChipSelector = new CountryChipSelector(
          countries,
          selected,
          (code) => { showGrowthCountry(code); renderInflationRow(code); },
          'growthRates'
        );
        this.growthRatesCountryChipSelector.render(chipContainer);

        const legacyInflation = this.getValue('Inflation');
        const legacyInfInput = document.getElementById('Inflation');
        const legacyInfRaw = legacyInfInput ? String(legacyInfInput.value || '').trim() : '';
        const startCode = String(startCountry || '').toLowerCase();
        if (startCode) {
          this.ensureParameterInput('Inflation_' + startCode, 'percentage');
          const startInf = document.getElementById('Inflation_' + startCode);
          const startInfLoaded = startInf && startInf.getAttribute('data-csv-loaded') === '1';
          if (startInf && !startInf.value && legacyInfRaw !== '' && !startInfLoaded) this.setValue(startInf.id, legacyInflation);
        }

        for (let ci = 0; ci < scenarioCountries.length; ci++) {
          const code = scenarioCountries[ci];
          const rs = cfg.getCachedTaxRuleSet(code);
          const invTypes = (rs && typeof rs.getResolvedInvestmentTypes === 'function') ? (rs.getResolvedInvestmentTypes() || []) : [];
          const localTypes = invTypes.filter(t => (t && t.residenceScope || '').toLowerCase() === 'local' && !t.baseRef && !(t && t.sellWhenReceived));
          for (let i = 0; i < localTypes.length; i++) {
            const t = localTypes[i] || {};
            const key = t.key;
            if (!key) continue;
            const baseKey = this._toBaseInvestmentKey(key, code);
            if (!baseKey) continue;
            const labelText = t.label || baseKey;
            const growthId = 'LocalAssetGrowth_' + code + '_' + baseKey;
            const volId = 'LocalAssetVolatility_' + code + '_' + baseKey;
            const tr = makeGrowthRow(labelText, growthId, volId);
            tr.setAttribute('data-country-growth-row', 'true');
            tr.setAttribute('data-country-code', code);
            tr.style.display = (String(code).toLowerCase() === String(selected).toLowerCase()) ? '' : 'none';
            if (insertBeforeRow) {
              tbody.insertBefore(tr, insertBeforeRow);
            } else {
              tbody.appendChild(tr);
            }
          }
        }

        showGrowthCountry(selected);
        renderInflationRow(selected);
        this.countryTabSyncManager.setSelectedCountry('growthRates', selected);
      }
    }

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

    // Seed global asset rows from legacy wrapper-level growth inputs (baseRef types).
    if (types && types.length) {
      for (let i = 0; i < types.length; i++) {
        const t = types[i] || {};
        if (!t || !t.baseRef || !t.key || t.sellWhenReceived) continue;
        const legacyGrowthId = t.key + 'GrowthRate';
        const legacyVolId = t.key + 'GrowthStdDev';
        const globalGrowthId = 'GlobalAssetGrowth_' + t.baseRef;
        const globalVolId = 'GlobalAssetVolatility_' + t.baseRef;

        const globalGrowthEl = document.getElementById(globalGrowthId);
        const globalVolEl = document.getElementById(globalVolId);
        const legacyGrowthEl = document.getElementById(legacyGrowthId);
        const legacyVolEl = document.getElementById(legacyVolId);

        if (globalGrowthEl && legacyGrowthEl) {
          const gRaw = (globalGrowthEl.value !== undefined && globalGrowthEl.value !== null) ? String(globalGrowthEl.value).trim() : '';
          const lRaw = (legacyGrowthEl.value !== undefined && legacyGrowthEl.value !== null) ? String(legacyGrowthEl.value).trim() : '';
          if (!gRaw && lRaw) globalGrowthEl.value = legacyGrowthEl.value;
        }
        if (globalVolEl && legacyVolEl) {
          const gRaw = (globalVolEl.value !== undefined && globalVolEl.value !== null) ? String(globalVolEl.value).trim() : '';
          const lRaw = (legacyVolEl.value !== undefined && legacyVolEl.value !== null) ? String(legacyVolEl.value).trim() : '';
          if (!gRaw && lRaw) globalVolEl.value = legacyVolEl.value;
        }
      }
    }

    // Re-apply economy mode visibility to newly created volatility cells
    this.updateUIForEconomyMode();
    this.formatUtils.setupPercentageInputs();

    const refreshGrowthRatesForRelocation = () => {
      const cfg = Config.getInstance();
      const shouldShow = this.perCountryInvestmentsEnabled && cfg.isRelocationEnabled() && this.hasRelocationEvents();
      const hasChips = !!this.growthRatesCountryChipSelector;
      if (shouldShow !== hasChips) {
        this.renderInvestmentParameterFields(this._lastInvestmentTypesForGrowthRates || types);
      }
    };

    if (!this._growthRatesRelocationObserver) {
      const eventsBody = document.querySelector('#Events tbody');
      if (eventsBody) {
        this._growthRatesRelocationObserver = new MutationObserver(() => {
          refreshGrowthRatesForRelocation();
        });
        this._growthRatesRelocationObserver.observe(eventsBody, { childList: true, subtree: true });
      }
    }

    if (!this._growthRatesToggleListener) {
      this._growthRatesToggleListener = () => {
        refreshGrowthRatesForRelocation();
      };
      window.addEventListener('perCountryInvestmentsToggle', this._growthRatesToggleListener);
    }
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
    const perCountryEnabled = !!this.perCountryInvestmentsEnabled;

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
    // Per-country OFF: hide chips and render global-only fields (independent keys).
    // Per-country ON: existing relocation/MV-driven chip behavior.
    this._setupAllocationsCountryChips(perCountryEnabled && hasMV, types);

    // Personal circumstances chips + per-country state pension inputs
    this.setupPersonalCircumstancesCountryChips();

  }

  _sortInvestmentTypes(types) {
    if (!Array.isArray(types)) return [];
    // Sort: types without (baseRef || baseKey) come first.
    return types.slice().sort((a, b) => {
      const aHas = !!(a.baseRef || a.baseKey);
      const bHas = !!(b.baseRef || b.baseKey);
      if (aHas === bHas) return 0;
      return aHas ? 1 : -1;
    });
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
    const headerTarget = allocCard.querySelector('.allocations-country-header');
    if (headerTarget) {
      headerTarget.appendChild(chipContainer);
    } else if (allocGroup.firstChild) {
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
        const inputs = el.querySelectorAll('input, select');
        for (let i = 0; i < inputs.length; i++) this._stashInputElement(inputs[i]);
      } catch (_) { }
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    // Also remove any previously rendered pension contribution fields that may have been
    // attached directly under the allocations group (e.g. global mode), so we don't
    // duplicate them when rendering per-country containers.
    const existingPensionWrappers = allocGroup.querySelectorAll('[data-country-pension="true"]');
    existingPensionWrappers.forEach(el => {
      try {
        const inputs = el.querySelectorAll('input');
        for (let i = 0; i < inputs.length; i++) this._stashInputElement(inputs[i]);
      } catch (_) { }
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    // Per-country toggle OFF: global allocations only (no chips, no per-country containers).
    if (!this.perCountryInvestmentsEnabled) {
      chipContainer.style.display = 'none';
      this.allocationsCountryChipSelector = null;

      const types = this._sortInvestmentTypes(Array.isArray(fallbackStartTypes) ? fallbackStartTypes : [])
        .filter(t => !(t && t.excludeFromAllocations));
      const startCountry = (cfg.getStartCountry() || '').toLowerCase();

      // Render global allocation fields using GlobalAllocation_* keys (independent of per-country fields).
      for (let i = 0; i < types.length; i++) {
        const t = types[i] || {};
        const key = t.key;
        if (!key) continue;
        const baseKey = this._toBaseInvestmentKey(key, startCountry);
        const labelText = (t.label || baseKey);
        const inputId = 'GlobalAllocation_' + baseKey;
        const legacyId = 'InvestmentAllocation_' + key;
        const perCountryId = 'InvestmentAllocation_' + startCountry + '_' + baseKey;

        if (!this._allocationValueCache[inputId]) {
          if (this._allocationValueCache[perCountryId]) {
            this._allocationValueCache[inputId] = this._allocationValueCache[perCountryId];
          } else if (this._allocationValueCache[legacyId]) {
            this._allocationValueCache[inputId] = this._allocationValueCache[legacyId];
          }
        }
        if (!this._allocationValueCache[legacyId] && this._allocationValueCache[inputId]) {
          this._allocationValueCache[legacyId] = this._allocationValueCache[inputId];
        }
        if (!this._allocationValueCache[perCountryId] && this._allocationValueCache[inputId]) {
          this._allocationValueCache[perCountryId] = this._allocationValueCache[inputId];
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'input-wrapper';
        wrapper.setAttribute('data-dynamic-investment-param', 'true');
        wrapper.setAttribute('data-allocations-row', 'true');

        const label = document.createElement('label');
        label.setAttribute('for', inputId);
        const labelSpan = document.createElement('span');
        labelSpan.className = 'alloc-label-text';
        labelSpan.textContent = labelText;
        label.appendChild(labelSpan);
        wrapper.appendChild(label);

        // "Holds" dropdown for baseRef-backed types (e.g., IE Index Funds) lives in the label area.
        const defaultHold = t.baseRef || t.baseKey || '';
        if (defaultHold) {
          const holdId = 'GlobalMixConfig_' + baseKey + '_asset1';
          this._appendHoldsDropdown(wrapper, holdId, String(defaultHold));
        }

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
      // Pension contribution controls remain StartCountry-scoped (same ids as per-country mode)
      this._renderCountryPensionContributionFields(allocGroup, startCountry, simulationMode);
      this.formatUtils.setupPercentageInputs();
      this._refreshAllocationsLabelLayout();
      return;
    }

    if (!hasMV) {
      // Chips hidden: keep StartCountry inputs effectively identical to multi-country mode.
      // If relocation is enabled, render StartCountry using per-country IDs (InvestmentAllocation_{country}_{baseKey})
      // so values do not "move" when effective relocation is toggled on/off.
      chipContainer.style.display = 'none';
      this.allocationsCountryChipSelector = null;

      const relocationEnabled = cfg.isRelocationEnabled && cfg.isRelocationEnabled();
      const types = this._sortInvestmentTypes(Array.isArray(fallbackStartTypes) ? fallbackStartTypes : [])
        .filter(t => !(t && t.excludeFromAllocations));
      const startCountry = (cfg.getStartCountry() || '').toLowerCase();

      if (relocationEnabled) {
        const countryContainer = document.createElement('div');
        countryContainer.setAttribute('data-country-allocation-container', 'true');
        countryContainer.setAttribute('data-country-code', startCountry);
        countryContainer.style.display = '';
        countryContainer.style.flexDirection = 'column';
        countryContainer.style.gap = '0.225rem';
        countryContainer.style.display = 'flex';

        for (let i = 0; i < types.length; i++) {
          const t = types[i] || {};
          const key = t.key;
          if (!key) continue;
          const baseKey = this._toBaseInvestmentKey(key, startCountry);
          const labelText = (t.label || key);
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
          wrapper.setAttribute('data-allocations-row', 'true');

          const label = document.createElement('label');
          label.setAttribute('for', inputId);
          const labelSpan = document.createElement('span');
          labelSpan.className = 'alloc-label-text';
          labelSpan.textContent = labelText;
          label.appendChild(labelSpan);
          wrapper.appendChild(label);

          // "Holds" dropdown for baseRef-backed types (e.g., IE Index Funds). No dropdown for standalone locals (e.g., MERVAL).
          const defaultHold = t.baseRef || t.baseKey || '';
          if (defaultHold) {
            const holdId = 'MixConfig_' + startCountry + '_' + baseKey + '_asset1';
            this._appendHoldsDropdown(wrapper, holdId, String(defaultHold));
          }

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
        // Pension fields below allocations
        this._renderCountryPensionContributionFields(countryContainer, startCountry, simulationMode);

        allocGroup.appendChild(countryContainer);
        this.formatUtils.setupPercentageInputs();
        this._refreshAllocationsLabelLayout();
      } else {
        // Relocation disabled: keep original legacy layout/IDs.
        for (let i = 0; i < types.length; i++) {
          const t = types[i] || {};
          const key = t.key;
          if (!key) continue;
          const labelText = (t.label || key);
          const inputId = 'InvestmentAllocation_' + key;

          const wrapper = document.createElement('div');
          wrapper.className = 'input-wrapper';
          wrapper.setAttribute('data-dynamic-investment-param', 'true');
          wrapper.setAttribute('data-allocations-row', 'true');

          const label = document.createElement('label');
          label.setAttribute('for', inputId);
          const labelSpan = document.createElement('span');
          labelSpan.className = 'alloc-label-text';
          labelSpan.textContent = labelText;
          label.appendChild(labelSpan);
          wrapper.appendChild(label);

          // "Holds" dropdown for baseRef-backed types in legacy single-country mode.
          const defaultHold = t.baseRef || t.baseKey || '';
          if (defaultHold) {
            const baseKey = this._toBaseInvestmentKey(key, startCountry);
            const holdId = 'GlobalMixConfig_' + baseKey + '_asset1';
            this._appendHoldsDropdown(wrapper, holdId, String(defaultHold));
          }

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
        // Pension fields below allocations
        this._renderCountryPensionContributionFields(allocGroup, startCountry, simulationMode);
        this.formatUtils.setupPercentageInputs();
        this._refreshAllocationsLabelLayout();
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
      let invTypes = (rs && typeof rs.getResolvedInvestmentTypes === 'function') ? (rs.getResolvedInvestmentTypes() || []) : [];
      invTypes = this._sortInvestmentTypes(invTypes).filter(t => !(t && t.excludeFromAllocations));
      const countryContainer = document.createElement('div');
      countryContainer.setAttribute('data-country-allocation-container', 'true');
      countryContainer.setAttribute('data-country-code', code);
      countryContainer.style.display = (code === selected) ? '' : 'none';
      countryContainer.style.display = countryContainer.style.display || 'flex';
      countryContainer.style.flexDirection = 'column';
      countryContainer.style.gap = '0.225rem';

      for (let i = 0; i < invTypes.length; i++) {
        const t = invTypes[i] || {};
        const key = t.key;
        if (!key) continue;
        const baseKey = this._toBaseInvestmentKey(key, code);
        const labelText = (t.label || key);
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
        wrapper.setAttribute('data-allocations-row', 'true');

        const label = document.createElement('label');
        label.setAttribute('for', inputId);
        const labelSpan = document.createElement('span');
        labelSpan.className = 'alloc-label-text';
        labelSpan.textContent = labelText;
        label.appendChild(labelSpan);
        wrapper.appendChild(label);

        // "Holds" dropdown for baseRef-backed types (e.g., IE Index Funds / AR CEDEARs). No dropdown for MERVAL.
        const defaultHold = t.baseRef || t.baseKey || '';
        if (defaultHold) {
          const holdId = 'MixConfig_' + code + '_' + baseKey + '_asset1';
          this._appendHoldsDropdown(wrapper, holdId, String(defaultHold));
        }

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
      // Pension fields below allocations
      this._renderCountryPensionContributionFields(countryContainer, code, simulationMode);

      allocGroup.appendChild(countryContainer);
    }
    this.countryTabSyncManager.setSelectedCountry('allocations', selected);
    this.formatUtils.setupPercentageInputs();
    this._refreshAllocationsLabelLayout();
  }


  _showAllocationsCountry(code) {
    const selected = (code || '').toString().trim().toLowerCase();
    const containers = document.querySelectorAll('#Allocations .input-group [data-country-allocation-container="true"]');
    containers.forEach(el => {
      const c = (el.getAttribute('data-country-code') || '').toLowerCase();
      el.style.display = (c === selected) ? '' : 'none';
    });
    this._refreshAllocationsLabelLayout();
  }

  _clearDynamicAllocationInputs(allocGroup) {
    if (!allocGroup) return;
    // Remove dynamic allocation input wrappers created by renderInvestmentParameterFields()
    // and/or previous MV-* container rebuilds.
    const wrappers = Array.from(allocGroup.querySelectorAll('.input-wrapper[data-dynamic-investment-param="true"]'));
    for (let i = 0; i < wrappers.length; i++) {
      const w = wrappers[i];
      try {
        const els = w.querySelectorAll('input, select');
        let shouldRemove = false;
        for (let j = 0; j < els.length; j++) {
          const el = els[j];
          const id = el && el.id ? String(el.id) : '';
          if (!id) continue;
          if (id.indexOf('InvestmentAllocation_') === 0 ||
              id.indexOf('GlobalAllocation_') === 0 ||
              id.indexOf('MixConfig_') === 0 ||
              id.indexOf('GlobalMixConfig_') === 0) {
            shouldRemove = true;
            break;
          }
        }
        if (shouldRemove) {
          // Preserve values across mode switches by stashing inputs instead of destroying them
          for (let j = 0; j < els.length; j++) this._stashInputElement(els[j]);
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
      const els = roots[r].querySelectorAll('[id^="InvestmentAllocation_"], [id^="GlobalAllocation_"], [id^="MixConfig_"], [id^="GlobalMixConfig_"]');
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
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

  _getGlobalBaseTypeDropdownOptions() {
    const cfg = Config.getInstance();
    const types = cfg.getInvestmentBaseTypes() || [];
    const out = [];
    for (let i = 0; i < types.length; i++) {
      const t = types[i] || {};
      const v = t.baseKey;
      if (!v) continue;
      const label = t.label || v;
      out.push({ value: v, label: label, shortLabel: t.shortLabel || '', description: label });
    }
    return out;
  }

  _appendHoldsDropdown(wrapperEl, hiddenInputId, defaultBaseKey) {
    const baseOptions = this._getGlobalBaseTypeDropdownOptions();
    if (!baseOptions.length) return;
    if (!wrapperEl) return;

    const mixPrefix = String(hiddenInputId || '').replace(/_asset1$/i, '');
    const mixInputs = this._ensureMixConfigInputs(mixPrefix, defaultBaseKey);
    const hidden = mixInputs.asset1;

    const strategiesEnabled = !!this.investmentStrategiesEnabled;
    const mixValue = '__mix__';
    const buildOptions = (selectedValue) => {
      const out = [];
      for (let i = 0; i < baseOptions.length; i++) {
        const opt = baseOptions[i];
        if (!opt) continue;
        out.push({
          value: opt.value,
          label: opt.label,
          description: opt.description,
          selected: opt.value === selectedValue,
        });
      }
      if (strategiesEnabled) {
        out.push({ value: mixValue, label: 'Mix...', description: 'Configure a fixed or glidepath mix.' });
      }
      return out;
    };

    const controlDiv = document.createElement('div');
    controlDiv.className = 'alloc-holds-control visualization-control';
    const toggleSpan = document.createElement('span');
    toggleSpan.id = 'HoldsToggle_' + hiddenInputId;
    toggleSpan.className = 'dd-toggle pseudo-select alloc-holds-toggle';
    controlDiv.appendChild(toggleSpan);
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'visualization-dropdown';
    optionsDiv.style.display = 'none';
    controlDiv.appendChild(optionsDiv);

    wrapperEl.appendChild(controlDiv);

    let currentValue = hidden.value || baseOptions[0].value;
    hidden.value = currentValue;
    let currentLabel = null;
    for (let i = 0; i < baseOptions.length; i++) {
      if (baseOptions[i].value === currentValue) { currentLabel = baseOptions[i].label; break; }
    }
    toggleSpan.textContent = currentLabel || currentValue;
    this._fitAllocHoldsToggleWidth(toggleSpan);

    const dropdown = DropdownUtils.create({
      toggleEl: toggleSpan,
      dropdownEl: optionsDiv,
      options: buildOptions(currentValue),
      selectedValue: currentValue,
      onSelect: (val, labelText) => {
        if (val === mixValue) {
          dropdown.setOptions(buildOptions(currentValue));
          this._openMixConfigModal({
            mixPrefix: mixPrefix,
            baseOptions: baseOptions,
            updateSummary: () => updateMixSummary(),
            defaultAsset1: currentValue
          });
          return;
        }
        if (mixInputs.type.value) mixInputs.typeSaved.value = mixInputs.type.value;
        hidden.value = val;
        currentValue = val;
        currentLabel = labelText;
        mixInputs.type.value = '';
        toggleSpan.textContent = labelText;
        this._fitAllocHoldsToggleWidth(toggleSpan);
        // Holds width change can reduce label space; recompute wrap/layout.
        this._refreshAllocationsLabelLayout();
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      },
    });

    const updateMixSummary = () => {
      const showSummary = strategiesEnabled && this._hasMixConfig(mixPrefix);
      const selectedValue = showSummary ? mixValue : currentValue;
      dropdown.setOptions(buildOptions(selectedValue));
      const opts = optionsDiv.querySelectorAll('[data-value]');
      for (let i = 0; i < opts.length; i++) {
        const opt = opts[i];
        const val = opt.getAttribute('data-value');
        opt.classList.toggle('selected', val === selectedValue);
      }
      toggleSpan.classList.toggle('alloc-holds-summary', showSummary);
      if (showSummary) {
        currentValue = hidden.value || currentValue;
        toggleSpan.textContent = this._formatMixSummary(mixPrefix, baseOptions);
      } else {
        const display = currentLabel || currentValue;
        toggleSpan.textContent = display;
      }
      this._fitAllocHoldsToggleWidth(toggleSpan);
      this._refreshAllocationsLabelLayout();
    };

    updateMixSummary();
  }

  _ensureMixConfigInputs(mixPrefix, defaultAsset1) {
    const ensure = (suffix, className, defaultValue) => {
      const id = mixPrefix + '_' + suffix;
      const el = this._takeOrCreateInput(id, className || '');
      el.type = 'hidden';
      el.autocomplete = 'off';
      this._applyAllocationValueIfCached(id, el);
      if (!el.value && defaultValue !== undefined) el.value = defaultValue;
      this._stashInputElement(el);
      return el;
    };
    const asset1 = ensure('asset1', 'string', defaultAsset1);
    const asset2 = ensure('asset2', 'string');
    const type = ensure('type', 'string');
    const typeSaved = ensure('typeSaved', 'string');
    const startAge = ensure('startAge', 'number');
    const targetAge = ensure('targetAge', 'number');
    const targetAgeOverridden = ensure('targetAgeOverridden', 'boolean');
    const startAsset1Pct = ensure('startAsset1Pct', 'percentage');
    const startAsset2Pct = ensure('startAsset2Pct', 'percentage');
    const endAsset1Pct = ensure('endAsset1Pct', 'percentage');
    const endAsset2Pct = ensure('endAsset2Pct', 'percentage');
    return {
      asset1: asset1,
      asset2: asset2,
      type: type,
      typeSaved: typeSaved,
      startAge: startAge,
      targetAge: targetAge,
      targetAgeOverridden: targetAgeOverridden,
      startAsset1Pct: startAsset1Pct,
      startAsset2Pct: startAsset2Pct,
      endAsset1Pct: endAsset1Pct,
      endAsset2Pct: endAsset2Pct
    };
  }

  _hasMixConfig(mixPrefix) {
    const typeEl = document.getElementById(mixPrefix + '_type');
    const typeVal = typeEl && typeEl.value ? String(typeEl.value).trim().toLowerCase() : '';
    return typeVal === 'fixed' || typeVal === 'glide' || typeVal === 'glidepath';
  }

  _stripGlobalPrefix(label) {
    return (label || '').toString().replace(/^global\s+/i, '');
  }

  _shortAssetLabel(label) {
    const stripped = this._stripGlobalPrefix(label);
    const lower = stripped.toLowerCase();
    if (lower.indexOf('equity') === 0) return 'Eq';
    if (lower.indexOf('bond') === 0) return 'Bonds';
    return stripped;
  }

  _formatMixSummary(mixPrefix, baseOptions) {
    const typeEl = document.getElementById(mixPrefix + '_type');
    const typeVal = typeEl && typeEl.value ? String(typeEl.value).trim().toLowerCase() : '';
    const isGlide = typeVal === 'glide' || typeVal === 'glidepath';
    const asset1 = document.getElementById(mixPrefix + '_asset1');
    const asset2 = document.getElementById(mixPrefix + '_asset2');
    const labelMap = {};
    const shortLabelMap = {};
    const opts = Array.isArray(baseOptions) ? baseOptions : this._getGlobalBaseTypeDropdownOptions();
    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      if (!opt || !opt.value) continue;
      labelMap[opt.value] = opt.label || opt.value;
      shortLabelMap[opt.value] = opt.shortLabel || '';
    }
    const asset1Label = this._stripGlobalPrefix(labelMap[asset1 && asset1.value] || (asset1 && asset1.value) || 'Asset1');
    const asset2Label = this._stripGlobalPrefix(labelMap[asset2 && asset2.value] || (asset2 && asset2.value) || 'Asset2');
    const asset1Short = shortLabelMap[asset1 && asset1.value] || this._shortAssetLabel(asset1Label);
    const asset2Short = shortLabelMap[asset2 && asset2.value] || this._shortAssetLabel(asset2Label);

    const pctVal = (field) => {
      const el = document.getElementById(mixPrefix + '_' + field);
      const raw = el && el.value ? String(el.value).trim() : '';
      const num = parseInt(raw, 10);
      return isNaN(num) ? null : num;
    };
    let startPct1 = pctVal('startAsset1Pct');
    let startPct2 = pctVal('startAsset2Pct');
    if (startPct2 === null && startPct1 !== null) startPct2 = 100 - startPct1;
    let endPct1 = pctVal('endAsset1Pct');
    let endPct2 = pctVal('endAsset2Pct');
    if (endPct2 === null && endPct1 !== null) endPct2 = 100 - endPct1;
    if (startPct1 === null && endPct1 !== null) startPct1 = endPct1;
    if (startPct2 === null && endPct2 !== null) startPct2 = endPct2;

    const startPctText = startPct1 === null ? '?' : String(startPct1);
    const startPct2Text = startPct2 === null ? '?' : String(startPct2);
    const endPctText = endPct1 === null ? '?' : String(endPct1);
    const endPct2Text = endPct2 === null ? '?' : String(endPct2);

    if (!isGlide) {
      return `${startPctText}/${startPct2Text} ${asset1Short}/${asset2Short}`;
    }

    const targetAgeEl = document.getElementById(mixPrefix + '_targetAge');
    const targetAge = targetAgeEl && targetAgeEl.value ? String(targetAgeEl.value).trim() : '?';
    return `→${endPctText}/${endPct2Text} ${asset1Short}/${asset2Short}`;
  }

  _ensureMixModal() {
    if (this._mixModal) return this._mixModal;
    const modal = document.createElement('div');
    modal.id = 'mixConfigModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content mix-config-modal">
        <div class="modal-header">
          <h3>Mix Strategy</h3>
          <div class="tab-toggle">
            <span class="tab-toggle-option mode-toggle-active" data-value="fixed">Fixed</span>
            <span class="tab-toggle-option" data-value="glide">Glide Path</span>
          </div>
        </div>
        <div class="modal-body">
          <div class="mix-assets-row">
            <div class="mix-row">
              <div class="mix-label">Asset 1:</div>
              <div class="mix-inline visualization-control">
                <span id="mixConfigAsset1Toggle" class="dd-toggle pseudo-select"></span>
                <div id="mixConfigAsset1Options" class="visualization-dropdown" style="display:none;"></div>
              </div>
            </div>
            <div class="mix-row">
              <div class="mix-label">Asset 2:</div>
              <div class="mix-inline visualization-control">
                <span id="mixConfigAsset2Toggle" class="dd-toggle pseudo-select"></span>
                <div id="mixConfigAsset2Options" class="visualization-dropdown" style="display:none;"></div>
              </div>
            </div>
          </div>
          <div class="mix-chart-container" style="display:none;">
            <canvas id="mixConfigChart"></canvas>
          </div>
          <div class="mix-section">
            <div class="mix-inline">
              <input id="mixConfigStartAge" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="Age">
              <div class="mix-slider-wrapper">
                <span class="mix-slider-label" id="mixConfigStartLabel"></span>
                <input id="mixConfigStartSlider" type="range" min="0" max="100" step="5">
              </div>
            </div>
          </div>
          <div class="mix-section mix-target">
            <div class="mix-inline">
              <input id="mixConfigTargetAge" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="Age">
              <div class="mix-slider-wrapper">
                <span class="mix-slider-label" id="mixConfigEndLabel"></span>
                <input id="mixConfigEndSlider" type="range" min="0" max="100" step="5">
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="mixConfigCancel" class="secondary-button">Cancel</button>
          <button id="mixConfigApply" class="primary-button">Apply</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const cancelBtn = modal.querySelector('#mixConfigCancel');
    const applyBtn = modal.querySelector('#mixConfigApply');
    const tabFixed = modal.querySelector('.tab-toggle-option[data-value="fixed"]');
    const tabGlide = modal.querySelector('.tab-toggle-option[data-value="glide"]');
    const startAgeInput = modal.querySelector('#mixConfigStartAge');
    const targetAgeInput = modal.querySelector('#mixConfigTargetAge');
    const asset1Toggle = modal.querySelector('#mixConfigAsset1Toggle');
    const asset1Options = modal.querySelector('#mixConfigAsset1Options');
    const asset2Toggle = modal.querySelector('#mixConfigAsset2Toggle');
    const asset2Options = modal.querySelector('#mixConfigAsset2Options');
    const startSlider = modal.querySelector('#mixConfigStartSlider');
    const endSlider = modal.querySelector('#mixConfigEndSlider');
    const startLabel = modal.querySelector('#mixConfigStartLabel');
    const endLabel = modal.querySelector('#mixConfigEndLabel');
    const targetSection = modal.querySelector('.mix-target');
    const chartContainer = modal.querySelector('.mix-chart-container');
    const chartCanvas = modal.querySelector('#mixConfigChart');

    const closeModal = () => this._closeMixConfigModal();
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    this._mixModal = {
      modal: modal,
      applyBtn: applyBtn,
      tabFixed: tabFixed,
      tabGlide: tabGlide,
      startAgeInput: startAgeInput,
      targetAgeInput: targetAgeInput,
      asset1Toggle: asset1Toggle,
      asset1Options: asset1Options,
      asset2Toggle: asset2Toggle,
      asset2Options: asset2Options,
      startSlider: startSlider,
      endSlider: endSlider,
      startLabel: startLabel,
      endLabel: endLabel,
      targetSection: targetSection,
      chartContainer: chartContainer,
      chartCanvas: chartCanvas,
      asset1Dropdown: null,
      asset2Dropdown: null,
      asset1Value: '',
      asset2Value: ''
    };

    return this._mixModal;
  }

  _closeMixConfigModal() {
    this._mixModal.modal.style.display = 'none';
    document.body.classList.remove('modal-open');
    if (this._mixModalEscHandler) {
      document.removeEventListener('keydown', this._mixModalEscHandler);
      this._mixModalEscHandler = null;
    }
  }

  _openMixConfigModal(context) {
    const modal = this._ensureMixModal();
    const ctx = context;

    const mixPrefix = ctx.mixPrefix;
    const baseOptions = ctx.baseOptions;
    const mixInputs = this._ensureMixConfigInputs(mixPrefix, ctx.defaultAsset1);

    const labelMap = {};
    for (let i = 0; i < baseOptions.length; i++) {
      const opt = baseOptions[i];
      if (!opt || !opt.value) continue;
      labelMap[opt.value] = opt.label || opt.value;
    }

    const defaultAsset1 = mixInputs.asset1.value || (baseOptions[0] ? baseOptions[0].value : '');
    let defaultAsset2 = mixInputs.asset2.value;
    if (!defaultAsset2) {
      for (let i = 0; i < baseOptions.length; i++) {
        if (baseOptions[i].value !== defaultAsset1) { defaultAsset2 = baseOptions[i].value; break; }
      }
    }
    if (!defaultAsset2) defaultAsset2 = defaultAsset1;

    const typeVal = mixInputs.type.value
      ? String(mixInputs.type.value).trim().toLowerCase()
      : (mixInputs.typeSaved.value ? String(mixInputs.typeSaved.value).trim().toLowerCase() : 'fixed');
    const isGlide = typeVal === 'glide' || typeVal === 'glidepath';

    const isP2Mix = mixPrefix.indexOf('_pensionP2') !== -1;
    const startAgeField = isP2Mix ? 'P2StartingAge' : 'StartingAge';
    const retireAgeField = isP2Mix ? 'P2RetirementAge' : 'RetirementAge';
    const defaultStartAge = mixInputs.startAge.value ? String(mixInputs.startAge.value) : (this.getValue(startAgeField) || '');
    const defaultTargetAge = mixInputs.targetAge.value ? String(mixInputs.targetAge.value) : (this.getValue(retireAgeField) || '');
    const targetAgeOverride = mixInputs.targetAgeOverridden.value ? String(mixInputs.targetAgeOverridden.value).toLowerCase() : '';

    const pctVal = (el) => {
      const raw = el && el.value ? String(el.value).trim() : '';
      const num = parseInt(raw, 10);
      return isNaN(num) ? null : Math.max(0, Math.min(100, num));
    };
    const snapStep = (val) => Math.max(0, Math.min(100, Math.round(val / 5) * 5));
    const startPct = pctVal(mixInputs.startAsset1Pct);
    const endPct = pctVal(mixInputs.endAsset1Pct);
    const startSliderVal = (startPct === null) ? 100 : snapStep(startPct);
    const endSliderVal = (endPct === null) ? startSliderVal : snapStep(endPct);

    if (isGlide) {
      modal.tabGlide.classList.add('mode-toggle-active');
      modal.tabFixed.classList.remove('mode-toggle-active');
    } else {
      modal.tabFixed.classList.add('mode-toggle-active');
      modal.tabGlide.classList.remove('mode-toggle-active');
    }
    modal.startAgeInput.value = defaultStartAge;
    modal.targetAgeInput.value = defaultTargetAge;

    const buildAssetOptions = (selectedValue) => {
      const opts = [];
      for (let i = 0; i < baseOptions.length; i++) {
        const opt = baseOptions[i];
        if (!opt) continue;
        opts.push({
          value: opt.value,
          label: opt.label || opt.value,
          description: opt.description || opt.label || opt.value,
          selected: opt.value === selectedValue
        });
      }
      return opts;
    };
    const setAssetToggle = (toggleEl, value) => {
      toggleEl.textContent = labelMap[value] || value || '';
    };
    modal.asset1Value = defaultAsset1;
    modal.asset2Value = defaultAsset2;
    setAssetToggle(modal.asset1Toggle, defaultAsset1);
    setAssetToggle(modal.asset2Toggle, defaultAsset2);
    if (!modal.asset1Dropdown) {
      modal.asset1Dropdown = DropdownUtils.create({
        toggleEl: modal.asset1Toggle,
        dropdownEl: modal.asset1Options,
        options: buildAssetOptions(defaultAsset1),
        selectedValue: defaultAsset1,
        onSelect: (val, labelText) => {
          modal.asset1Value = val;
          modal.asset1Toggle.textContent = labelText;
          updateSliderLabels();
        }
      });
    } else {
      modal.asset1Dropdown.setOptions(buildAssetOptions(defaultAsset1));
    }
    if (!modal.asset2Dropdown) {
      modal.asset2Dropdown = DropdownUtils.create({
        toggleEl: modal.asset2Toggle,
        dropdownEl: modal.asset2Options,
        options: buildAssetOptions(defaultAsset2),
        selectedValue: defaultAsset2,
        onSelect: (val, labelText) => {
          modal.asset2Value = val;
          modal.asset2Toggle.textContent = labelText;
          updateSliderLabels();
        }
      });
    } else {
      modal.asset2Dropdown.setOptions(buildAssetOptions(defaultAsset2));
    }
    modal.startSlider.value = String(startSliderVal);
    modal.endSlider.value = String(endSliderVal);

    const state = {
      mixPrefix: mixPrefix,
      baseOptions: baseOptions,
      labelMap: labelMap,
      defaultTargetAge: defaultTargetAge,
      targetAgeOverridden: (targetAgeOverride === 'yes' || targetAgeOverride === 'true')
    };

    // Forward declarations for circular dependencies
    let updateChart;
    let updateSliderLabels;

    const updateMode = () => {
      const glideOn = modal.tabGlide.classList.contains('mode-toggle-active');
      modal.targetSection.style.display = glideOn ? '' : 'none';
      modal.startAgeInput.style.display = glideOn ? '' : 'none';
      modal.chartContainer.style.display = glideOn ? '' : 'none';
      if (glideOn) updateChart();
    };

    updateChart = () => {
      if (!modal.tabGlide.classList.contains('mode-toggle-active')) return;
      
      const startAge = parseInt(modal.startAgeInput.value, 10) || 0;
      const endAge = parseInt(modal.targetAgeInput.value, 10) || 0;
      const simTargetAge = parseInt(this.getValue('TargetAge'), 10) || 100;
      
      const startVal = parseInt(modal.startSlider.value, 10);
      const endVal = parseInt(modal.endSlider.value, 10);
      const startPct1 = isNaN(startVal) ? 0 : startVal;
      const endPct1 = isNaN(endVal) ? 0 : endVal;

      const labels = [];
      const data = [];
      
      // Calculate points for the chart
      // 1. Current age (startingAge of sim)
      const currentSimAge = parseInt(this.getValue(isP2Mix ? 'P2StartingAge' : 'StartingAge'), 10) || 0;
      
      // We want to show the range from currentSimAge to simTargetAge
      const minAge = currentSimAge;
      const maxAge = simTargetAge;
      
      if (minAge >= maxAge) return;

      const getPctAtAge = (age) => {
        if (age <= startAge) return startPct1;
        if (age >= endAge) return endPct1;
        if (startAge >= endAge) return startPct1;
        const ratio = (age - startAge) / (endAge - startAge);
        return startPct1 + ratio * (endPct1 - startPct1);
      };

      // Create a few data points for the line
      const ages = [minAge];
      if (startAge > minAge && startAge < maxAge) ages.push(startAge);
      if (endAge > minAge && endAge < maxAge) ages.push(endAge);
      ages.push(maxAge);
      
      // Remove duplicates and sort
      const uniqueAges = [...new Set(ages)].sort((a, b) => a - b);
      
      const chartData = uniqueAges.map(age => ({ x: age, y: getPctAtAge(age) }));

      if (modal.chart) {
        modal.chart.data.datasets[0].data = chartData;
        modal.chart.options.scales.x.min = minAge;
        modal.chart.options.scales.x.max = maxAge;
        // Update ticks to show relevant ages
        modal.chart.options.scales.x.afterBuildTicks = (scale) => {
          const ticks = [{ value: minAge }, { value: maxAge }];
          if (startAge > minAge && startAge < maxAge) ticks.push({ value: startAge });
          if (endAge > minAge && endAge < maxAge) ticks.push({ value: endAge });
          scale.ticks = ticks.sort((a, b) => a.value - b.value);
        };
        modal.chart.update('none');
      } else if (typeof Chart !== 'undefined') {
        modal.chart = new Chart(modal.chartCanvas, {
          type: 'line',
          data: {
            datasets: [{
              data: chartData,
              borderColor: '#3498db',
              backgroundColor: 'rgba(52, 152, 219, 0.1)',
              borderWidth: 2,
              pointRadius: 3,
              fill: true,
              tension: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false }
            },
            scales: {
              x: {
                type: 'linear',
                min: minAge,
                max: maxAge,
                ticks: {
                  maxTicksLimit: 4,
                  stepSize: 1,
                  font: { size: 10 },
                  callback: (value) => Math.round(value)
                },
                afterBuildTicks: (scale) => {
                  const ticks = [{ value: minAge }, { value: maxAge }];
                  if (startAge > minAge && startAge < maxAge) ticks.push({ value: startAge });
                  if (endAge > minAge && endAge < maxAge) ticks.push({ value: endAge });
                  scale.ticks = ticks.sort((a, b) => a.value - b.value);
                }
              },
              y: {
                min: 0,
                max: 100,
                ticks: {
                  stepSize: 50,
                  font: { size: 10 },
                  callback: (value) => value + '%'
                }
              }
            }
          }
        });
      }
    };

    updateSliderLabels = () => {
      const asset1Key = modal.asset1Value;
      const asset2Key = modal.asset2Value;
      const asset1Label = labelMap[asset1Key] || asset1Key || 'Asset1';
      const asset2Label = labelMap[asset2Key] || asset2Key || 'Asset2';
      const startVal = parseInt(modal.startSlider.value, 10);
      const endVal = parseInt(modal.endSlider.value, 10);
      const startPct1 = isNaN(startVal) ? 0 : startVal;
      const endPct1 = isNaN(endVal) ? 0 : endVal;
      modal.startLabel.textContent = `${this._stripGlobalPrefix(asset1Label)}:${startPct1}% ${this._stripGlobalPrefix(asset2Label)}:${100 - startPct1}%`;
      modal.endLabel.textContent = `${this._stripGlobalPrefix(asset1Label)}:${endPct1}% ${this._stripGlobalPrefix(asset2Label)}:${100 - endPct1}%`;
      updateChart();
    };

    updateMode();
    updateSliderLabels();

    modal.tabFixed.onclick = () => {
      modal.tabFixed.classList.add('mode-toggle-active');
      modal.tabGlide.classList.remove('mode-toggle-active');
      updateMode();
    };

    modal.tabGlide.onclick = () => {
      modal.tabGlide.classList.add('mode-toggle-active');
      modal.tabFixed.classList.remove('mode-toggle-active');
      updateMode();
    };

    modal.startSlider.oninput = updateSliderLabels;
    modal.endSlider.oninput = updateSliderLabels;
    modal.startAgeInput.oninput = updateChart;
    modal.targetAgeInput.oninput = () => { state.targetAgeOverridden = true; updateChart(); };

    modal.applyBtn.onclick = () => {
      const isGlideMode = modal.tabGlide.classList.contains('mode-toggle-active');
      const asset1Val = modal.asset1Value;
      const asset2Val = modal.asset2Value;
      const startPct1 = parseInt(modal.startSlider.value, 10) || 0;
      const endPct1 = isGlideMode ? (parseInt(modal.endSlider.value, 10) || 0) : startPct1;
      const startAgeVal = modal.startAgeInput.value ? String(modal.startAgeInput.value).trim() : '';
      const targetAgeVal = modal.targetAgeInput.value ? String(modal.targetAgeInput.value).trim() : '';
      const overrideFlag = (isGlideMode && (state.targetAgeOverridden || (state.defaultTargetAge && targetAgeVal && targetAgeVal !== String(state.defaultTargetAge)))) ? 'Yes' : 'No';

      mixInputs.type.value = isGlideMode ? 'glide' : 'fixed';
      mixInputs.typeSaved.value = mixInputs.type.value;
      mixInputs.asset1.value = asset1Val;
      mixInputs.asset2.value = asset2Val;
      mixInputs.startAge.value = startAgeVal;
      mixInputs.targetAge.value = targetAgeVal;
      mixInputs.targetAgeOverridden.value = overrideFlag;
      mixInputs.startAsset1Pct.value = String(startPct1);
      mixInputs.startAsset2Pct.value = String(100 - startPct1);
      mixInputs.endAsset1Pct.value = String(endPct1);
      mixInputs.endAsset2Pct.value = String(100 - endPct1);

      ctx.updateSummary();
      this._closeMixConfigModal();
    };

    updateMode();
    updateSliderLabels();

    if (this._mixModalEscHandler) document.removeEventListener('keydown', this._mixModalEscHandler);
    this._mixModalEscHandler = (e) => {
      if (e.key === 'Escape' && this._mixModal && this._mixModal.modal.style.display === 'block') {
        this._closeMixConfigModal();
      }
    };
    document.addEventListener('keydown', this._mixModalEscHandler);
    modal.modal.style.display = 'block';
    document.body.classList.add('modal-open');
  }

  _fitAllocHoldsToggleWidth(toggleSpan) {
    if (!toggleSpan) return;
    const text = (toggleSpan.textContent || '').toString();
    if (!text) return;
    const cs = window.getComputedStyle(toggleSpan);
    const font = cs.font || (cs.fontSize + ' ' + cs.fontFamily);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width);
    // Padding + caret room (matches pseudo-select padding/right arrow)
    const padded = w + 28;
    const isSummary = toggleSpan.classList.contains('alloc-holds-summary');
    const minW = isSummary ? 90 : 72;
    const maxW = isSummary ? 220 : 132;
    const clamped = Math.max(minW, Math.min(maxW, padded));
    toggleSpan.style.minWidth = clamped + 'px';
    toggleSpan.style.maxWidth = clamped + 'px';
  }

  _refreshAllocationsLabelLayout() {
    const rows = document.querySelectorAll('#Allocations .input-wrapper[data-allocations-row="true"]');
    requestAnimationFrame(() => {
      // Hidden measurer to avoid early wrap triggers from scrollWidth rounding.
      if (!this._allocLabelMeasurer) {
        const m = document.createElement('span');
        m.style.position = 'absolute';
        m.style.left = '-10000px';
        m.style.top = '-10000px';
        m.style.visibility = 'hidden';
        m.style.whiteSpace = 'nowrap';
        m.style.pointerEvents = 'none';
        m.style.padding = '0';
        m.style.border = '0';
        document.body.appendChild(m);
        this._allocLabelMeasurer = m;
      }
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const holds = row.querySelectorAll('.alloc-holds-toggle');
        for (let h = 0; h < holds.length; h++) {
          const hold = holds[h];
          if (!hold || hold.offsetParent === null) continue;
          this._fitAllocHoldsToggleWidth(hold);
        }

        const labelText = row.querySelector('.alloc-label-text');
        if (!labelText) continue;

        // Always measure in "unwrapped" state to avoid early triggering.
        const original = labelText.getAttribute('data-original-text') || labelText.textContent || '';
        if (!labelText.getAttribute('data-original-text')) {
          labelText.setAttribute('data-original-text', String(original));
        }
        labelText.classList.remove('alloc-wrap');
        while (labelText.firstChild) labelText.removeChild(labelText.firstChild);
        labelText.appendChild(document.createTextNode(String(original)));

        // Trigger wrap ONLY when the one-line label truly exceeds available width at normal font.
        let needsWrap = false;
        try {
          const boxW = labelText.getBoundingClientRect().width;
          const cs = window.getComputedStyle(labelText);
          const measurer = this._allocLabelMeasurer;
          measurer.style.font = cs.font;
          measurer.style.letterSpacing = cs.letterSpacing;
          measurer.style.textTransform = cs.textTransform;
          measurer.style.fontKerning = cs.fontKerning || 'auto';
          measurer.textContent = String(original);
          const textW = measurer.getBoundingClientRect().width;
          // Use a small tolerance to avoid "early" triggers from subpixel differences.
          needsWrap = textW > (boxW + 0.25);
        } catch (_) {
          needsWrap = (labelText.scrollWidth > labelText.clientWidth);
        }
        if (!needsWrap) continue;

        // Enter wrap mode: small font + guaranteed wrap (insert <br>).
        labelText.classList.add('alloc-wrap');

        const text = String(original);
        const boxW = labelText.getBoundingClientRect().width;
        if (!boxW || boxW <= 0) continue;

        // Compute break point using the hidden measurer (nowrap), using the WRAPPED font.
        let breakAt = -1;
        try {
          const csWrap = window.getComputedStyle(labelText);
          const measurer = this._allocLabelMeasurer;
          measurer.style.font = csWrap.font;
          measurer.style.letterSpacing = csWrap.letterSpacing;
          measurer.style.textTransform = csWrap.textTransform;
          measurer.style.fontKerning = csWrap.fontKerning || 'auto';

          const limitW = boxW - 0.25;
          const spacePositions = [];
          for (let p = 0; p < text.length; p++) {
            if (text.charAt(p) === ' ') spacePositions.push(p);
          }
          // Prefer breaking on a space that keeps line1 within limit.
          for (let si = 0; si < spacePositions.length; si++) {
            const pos = spacePositions[si];
            const candidate = text.slice(0, pos).trimRight();
            measurer.textContent = candidate;
            const w = measurer.getBoundingClientRect().width;
            if (w <= limitW) breakAt = pos;
            else break;
          }
          // If no space break works, fall back to per-character split.
          if (breakAt < 0) {
            for (let c = 1; c < text.length; c++) {
              const candidate = text.slice(0, c);
              measurer.textContent = candidate;
              const w = measurer.getBoundingClientRect().width;
              if (w <= limitW) breakAt = c;
              else break;
            }
          }
        } catch (_) { }

        // Restore full original then apply hard break if we found a split point.
        while (labelText.firstChild) labelText.removeChild(labelText.firstChild);
        if (breakAt > 0 && breakAt < text.length - 1) {
          labelText.appendChild(document.createTextNode(text.slice(0, breakAt).trimRight()));
          labelText.appendChild(document.createElement('br'));
          labelText.appendChild(document.createTextNode(text.slice(breakAt).trimLeft()));
        } else {
          // Worst case: force a mid split so wrap is always visible once triggered.
          const mid = Math.max(1, Math.min(text.length - 1, Math.floor(text.length / 2)));
          labelText.appendChild(document.createTextNode(text.slice(0, mid)));
          labelText.appendChild(document.createElement('br'));
          labelText.appendChild(document.createTextNode(text.slice(mid)));
        }
      }
    });
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

    if (host.children.length > 0) {
      const hr = document.createElement('hr');
      hr.setAttribute('data-country-pension', 'true');
      hr.setAttribute('data-country-code', country);
      hr.style.border = 'none';
      hr.style.borderTop = '1px solid #eee';
      hr.style.margin = '0.2rem 0';
      hr.style.height = '0';
      hr.style.width = '100%';
      host.appendChild(hr);
    }

    const shouldShowP2 = (simulationMode || '').toString().toLowerCase() === 'couple';

    // P1 contribution
    const p1Wrapper = document.createElement('div');
    p1Wrapper.className = 'input-wrapper';
    p1Wrapper.setAttribute('data-country-pension', 'true');
    p1Wrapper.setAttribute('data-country-code', country);
    p1Wrapper.setAttribute('data-allocations-row', 'true');
    const p1Label = document.createElement('label');
    const p1Id = 'P1PensionContrib_' + country;
    p1Label.setAttribute('for', p1Id);
    const p1LabelSpan = document.createElement('span');
    p1LabelSpan.className = 'alloc-label-text';
    p1LabelSpan.textContent = shouldShowP2 ? 'Your Pension Contribution' : 'Pension Contribution';
    p1Label.appendChild(p1LabelSpan);
    p1Wrapper.appendChild(p1Label);
    const p1MixId = 'MixConfig_' + country + '_pensionP1_asset1';
    this._appendHoldsDropdown(p1Wrapper, p1MixId, 'globalEquity');
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
    p2Wrapper.setAttribute('data-allocations-row', 'true');
    p2Wrapper.setAttribute('data-couple-only', 'true');
    p2Wrapper.style.display = shouldShowP2 ? 'flex' : 'none';
    const p2Label = document.createElement('label');
    const p2Id = 'P2PensionContrib_' + country;
    p2Label.setAttribute('for', p2Id);
    const p2LabelSpan = document.createElement('span');
    p2LabelSpan.className = 'alloc-label-text';
    p2LabelSpan.textContent = 'Their Pension Contribution';
    p2Label.appendChild(p2LabelSpan);
    p2Wrapper.appendChild(p2Label);
    const p2MixId = 'MixConfig_' + country + '_pensionP2_asset1';
    this._appendHoldsDropdown(p2Wrapper, p2MixId, 'globalEquity');
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
    cappedWrapper.setAttribute('data-allocations-row', 'true');
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
        if (this.fileManager && await this.fileManager.hasUnsavedChanges()) {
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
    const volatilityHeader = document.querySelector('#growthRates th:nth-child(3)');
    const volatilityCells = document.querySelectorAll('#growthRates td:nth-child(3)');

    if (volatilityHeader) {
      volatilityHeader.style.visibility = isDeterministic ? 'hidden' : '';
    }

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

      const availableCountries = config.getAvailableCountries();
      const options = availableCountries.map(c => ({ value: c.code, label: c.name }));

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
      let initialCountry = config.getDefaultCountry();
      const cachedGeo = localStorage.getItem('geoCountry');
      if (cachedGeo) {
        const cachedMatch = options.find(o => String(o.value).trim().toLowerCase() === String(cachedGeo).trim().toLowerCase());
        if (cachedMatch) initialCountry = cachedMatch.value;
      }
      hiddenInput.value = initialCountry;
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
      const { country } = await fetch("https://finsim.ie/_geo", { signal: controller.signal }).then(r => r.json());
      clearTimeout(timeoutId);
      if (!country) return;
      const countryCode = String(country).trim().toLowerCase();
      localStorage.setItem('geoCountry', countryCode);
      const config = Config.getInstance();
      const available = config.getAvailableCountries();
      const match = available.find(function (c) {
        var code = (c && c.code != null) ? String(c.code) : '';
        return code.trim().toLowerCase() === countryCode;
      });
      if (match) {
        const from = this.getValue('StartCountry');
        const baselineSet = (this.fileManager && this.fileManager.lastSavedState !== null);
        const wasDirty = (this.fileManager && this.fileManager.hasUnsavedChanges && await this.fileManager.hasUnsavedChanges());
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
          await this.fileManager.updateLastSavedState();
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

    const investmentStrategiesState = localStorage.getItem('investmentStrategiesEnabled') || 'off';
    webUi.investmentStrategiesEnabled = (investmentStrategiesState === 'on');

    const perCountryInvestmentsState = localStorage.getItem('perCountryInvestmentsEnabled') || 'off';
    webUi.perCountryInvestmentsEnabled = (perCountryInvestmentsState === 'on');

    // Listen for Investment Strategies toggle
    window.addEventListener('investmentStrategiesToggle', (e) => {
      webUi.investmentStrategiesEnabled = e.detail.enabled;
      webUi.refreshCountryChipsFromScenario(webUi._lastInvestmentTypesForGrowthRates);
    });

    // Listen for Per-Country Investments toggle
    window.addEventListener('perCountryInvestmentsToggle', (e) => {
      webUi.perCountryInvestmentsEnabled = e.detail.enabled;
      // Refresh allocations UI immediately (global ↔ per-country mode)
      try { webUi.refreshCountryChipsFromScenario(webUi._lastInvestmentTypesForGrowthRates); } catch (_) { }
    });

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
    await webUi.fileManager.updateLastSavedState();

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
