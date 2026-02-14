class FileManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.lastSavedState = null; // Initialize lastSavedState
    this.currentScenarioName = ''; // Track current scenario name
    this.setupSaveButton();
    this.setupLoadButton();
  }

  async _ensureScenarioTaxRuleSetsLoaded() {
    const config = Config.getInstance();
    const startCountry = config.getStartCountry();
    if (!config.getCachedTaxRuleSet(startCountry)) {
      await config.getTaxRuleSet(startCountry);
    }
    if (config.isRelocationEnabled()) {
      const events = this.webUI.readEvents(false);
      const result = await config.syncTaxRuleSetsWithEvents(events, startCountry);
      if (result && result.failed && result.failed.length) {
        throw new Error(`Failed to load tax rules for: ${result.failed.join(', ')}`);
      }
    }
  }

  async updateLastSavedState() {
    // Ensure this is called when the UI is in a known "clean" or "new scenario" state.
    await this._ensureScenarioTaxRuleSetsLoaded();
    const snapshot = serializeSimulation(this.webUI);
    this.lastSavedState = snapshot;
  }

  async hasUnsavedChanges() {
    await this._ensureScenarioTaxRuleSetsLoaded();
    const currentState = serializeSimulation(this.webUI);

    // If we haven't saved yet, treat as unsaved only if real data differs
    if (this.lastSavedState === null) {
      // Establish baseline lazily to avoid false positives on first load.
      this.lastSavedState = currentState;
      return false;
    }

    const normalize = (csv) => {
      const lines = csv.split('\n');
      const filtered = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('EventsSortPreset,')) continue;
        filtered.push(line);
      }
      const paramsIndex = filtered.indexOf('# Parameters');
      if (paramsIndex === -1) return filtered.join('\n');
      let eventsIndex = -1;
      for (let i = paramsIndex + 1; i < filtered.length; i++) {
        if (filtered[i] === '# Events') {
          eventsIndex = i;
          break;
        }
      }
      if (eventsIndex === -1) return filtered.join('\n');
      const before = filtered.slice(0, paramsIndex + 1);
      const paramsBlock = filtered.slice(paramsIndex + 1, eventsIndex);
      const after = filtered.slice(eventsIndex);
      const paramsLines = paramsBlock.filter(line => line !== '');
      paramsLines.sort();
      return before.concat(paramsLines).concat(after).join('\n');
    };

    const normCurrent = normalize(currentState);
    const normBase = normalize(this.lastSavedState);
    const dirty = normCurrent !== normBase;
    return dirty;
  }

  setupSaveButton() {
    const saveButton = document.getElementById('saveSimulation');
    if (saveButton) {
      saveButton.addEventListener('click', () => this.webUI.saveToFile());
    }
  }

  setupLoadButton() {
    const loadButton = document.getElementById('loadSimulation');
    const fileInput = document.getElementById('loadSimulationDialog');
    if (loadButton && fileInput) {
      loadButton.addEventListener('click', () => {
        fileInput.click(); // Unsaved changes check is now handled in loadFromFile
      });
      fileInput.addEventListener('change', (e) => this.webUI.loadFromFile(e.target.files[0]));
    }
  }

  async saveToFile() {
    await this._ensureScenarioTaxRuleSetsLoaded();
    const csvContent = serializeSimulation(this.webUI);
    const currentScenarioName = this.currentScenarioName || 'my scenario';
    const suggestedName = `${currentScenarioName.trim()}.csv`;

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [{
            description: 'CSV Files',
            accept: {
              'text/csv': ['.csv'],
            },
          }],
        });

        const scenarioName = handle.name.replace('.csv', '');
        this.setScenarioName(scenarioName);

        const writable = await handle.createWritable();
        await writable.write(csvContent);
        await writable.close();
        this.lastSavedState = serializeSimulation(this.webUI); // Update on successful save
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        this.webUI.notificationUtils.showAlert('Error saving file: ' + err.message, 'Error');
      }
    } else {
      // Legacy fallback
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      this.lastSavedState = serializeSimulation(this.webUI); // Update on successful save (legacy)
    }
  }

  async loadFromFile(file) {
    if (!file) return;

    // Check for unsaved changes before proceeding
    if (await this.hasUnsavedChanges()) {
      const proceed = await this.webUI.showAlert("Loading a new scenario will overwrite any unsaved changes. Are you sure you want to proceed?", "Confirm Load", true);
      if (!proceed) {
        return; // User cancelled
      }
    }

    const scenarioName = file.name.replace('.csv', '');
    const fileInput = document.getElementById('loadSimulationDialog');
    try {
      const content = await file.text();
      await this.loadFromString(content, scenarioName);
      await this.updateLastSavedState(); // Ensure this is here
    } catch (error) {
      console.error(error);
      this.webUI.notificationUtils.showAlert('Error loading file: Please make sure this is a valid simulation save file.', 'Error');
      return; // Keep this return to avoid issues in finally if fileInput is crucial
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }

  async loadFromUrl(url, name) {
    // Check for unsaved changes before proceeding
    if (await this.hasUnsavedChanges()) {
      const proceed = await this.webUI.showAlert("Loading the demo scenario will overwrite any unsaved changes. Are you sure you want to proceed?", "Confirm Load", true);
      if (!proceed) {
        return; // User cancelled
      }
    }

    try {
      const content = await this.fetchUrl(url); // ensure await here
      await this.loadFromString(content, name);
      await this.updateLastSavedState(); // Update state after successful load and UI update
    } catch (error) {
      // Handle or propagate error, e.g., show a notification via webUI
      console.error(`Error in loadFromUrl for ${name}:`, error);
      await this.webUI.showAlert(`Error loading demo scenario '${name}'. Please check console for details.`, 'Error');
      // Optionally, re-throw if WebUI needs to react further
    }
  }

  async loadFromString(content, name) {
    try {
      const cfg = Config.getInstance();
      if (cfg && typeof cfg.isRelocationEnabled === 'function' && !cfg.isRelocationEnabled()) {
        if (this._csvHasRelocationEvents(content)) {
          await this.webUI.showAlert('Invalid scenario file', 'Error');
          return;
        }
      }
    } catch (_) { }

    // Reset currency selectors to default state before loading
    if (this.webUI.chartManager) {
      this.webUI.chartManager.reportingCurrency = null; // Force reset
      this.webUI.chartManager.setupChartCurrencyControls(this.webUI);
    }
    if (this.webUI.tableManager) {
      this.webUI.tableManager.reportingCurrency = null; // Force reset
      this.webUI.tableManager.setupTableCurrencyControls();
    }

    const parameterInputs = document.querySelectorAll('.parameters-section input');
    for (let i = 0; i < parameterInputs.length; i++) {
      parameterInputs[i].value = '';
    }

    this.webUI.clearAllWarnings();
    this.webUI.tableManager.clearContent('Events');
    this.webUI.tableManager.clearExtraDataRows(0);
    this.webUI.chartManager.clearExtraChartRows(0);
    this.setScenarioName(name);

    // Reset age/year toggle to 'age' mode when loading a scenario
    // This ensures loaded scenarios display age values as they are stored in the file
    if (this.webUI.eventsTableManager) {
      this.webUI.eventsTableManager.handleAgeYearToggle('age');
    }

    // Reset StartCountry to default to prevent state leakage from previous scenarios
    try {
      const cfg = Config.getInstance();
      if (cfg && typeof cfg.getDefaultCountry === 'function') {
        this.webUI.setValue('StartCountry', cfg.getDefaultCountry());
      }
    } catch (_) { }

    const eventData = deserializeSimulation(content, this.webUI);

    // Note: Simulation mode is already set by deserializeSimulation based on file version and P2 data
    // No need to override it here

    const cfgForPriorities = Config.getInstance();
    const startCountryForPriorities = cfgForPriorities.getStartCountry();
    const scenarioCountrySetForPriorities = {};
    scenarioCountrySetForPriorities[String(startCountryForPriorities || '').toLowerCase()] = true;
    const availableForPriorities = cfgForPriorities.getAvailableCountries() || [];
    const validPriorityCountries = {};
    for (let i = 0; i < availableForPriorities.length; i++) {
      const item = availableForPriorities[i] || {};
      const itemCode = String(item.code || '').trim().toLowerCase();
      if (itemCode) validPriorityCountries[itemCode] = true;
    }
    for (let i = 0; i < eventData.length; i++) {
      const row = eventData[i] || [];
      const rawType = row[0] ? String(row[0]) : '';
      const type = rawType.indexOf(':') >= 0 ? rawType.split(':')[0] : rawType;
      if (type === 'MV') {
        const code = getRelocationCountryCode({ type: 'MV', name: row[1] });
        if (code && validPriorityCountries[code]) scenarioCountrySetForPriorities[code] = true;
      }
    }
    const scenarioCountriesForPriorities = Object.keys(scenarioCountrySetForPriorities);
    if (this.webUI.dragAndDrop && typeof this.webUI.dragAndDrop.renderPriorities === 'function') {
      await this.webUI.dragAndDrop.renderPriorities();
    }
    const baseTypes = new Set();
    baseTypes.add('cash');
    let includePension = false;
    for (let i = 0; i < scenarioCountriesForPriorities.length; i++) {
      const country = scenarioCountriesForPriorities[i];
      let rulesetForPriorityCountry = cfgForPriorities.getCachedTaxRuleSet(country);
      if (!rulesetForPriorityCountry) {
        rulesetForPriorityCountry = await cfgForPriorities.getTaxRuleSet(country);
      }
      if (rulesetForPriorityCountry && typeof rulesetForPriorityCountry.hasPrivatePensions === 'function' &&
        rulesetForPriorityCountry.hasPrivatePensions()) {
        includePension = true;
      }
      const investmentTypes = rulesetForPriorityCountry.getResolvedInvestmentTypes() || [];
      for (let j = 0; j < investmentTypes.length; j++) {
        const type = investmentTypes[j];
        if (!type || !type.key || type.sellWhenReceived) continue;
        const baseType = String(type.key).split('_')[0];
        if (baseType) baseTypes.add(baseType);
      }
    }
    if (includePension) baseTypes.add('pension');
    const priorityIds = Array.from(baseTypes)
      .sort((a, b) => {
        if (a === b) return 0;
        if (a === 'cash') return -1;
        if (b === 'cash') return 1;
        if (a === 'pension') return -1;
        if (b === 'pension') return 1;
        return a.localeCompare(b);
      })
      .map(baseType => `Priority_${baseType}`);
    const legacyPriorityById = {
      Priority_cash: 'PriorityCash',
      Priority_pension: 'PriorityPension',
      Priority_indexFunds: 'PriorityFunds',
      Priority_shares: 'PriorityShares'
    };
    const readPriorityValue = (fieldId) => {
      const readFrom = (id) => {
        const el = document.getElementById(id);
        if (!el || el.value === undefined || String(el.value).trim() === '') return null;
        const raw = parseInt(el.value, 10);
        return Number.isFinite(raw) && raw > 0 ? raw : null;
      };
      let value = readFrom(fieldId);
      if (value === null && legacyPriorityById[fieldId]) {
        value = readFrom(legacyPriorityById[fieldId]);
      }
      return value || 0;
    };
    const prioritiesContainer = document.querySelector('.priorities-container');
    if (prioritiesContainer) {
      const priorityValues = priorityIds.map(id => ({
        id: id,
        value: readPriorityValue(id),
        element: prioritiesContainer.querySelector(`[data-priority-id="${id}"]`)
      })).sort((a, b) => a.value - b.value);

      priorityValues.forEach(item => {
        if (item.element) {
          prioritiesContainer.appendChild(item.element);
          const input = item.element.querySelector('input');
          if (input) {
            input.value = item.value;
          }
        }
      });
    }
    const tbody = document.querySelector('#Events tbody');
    if (tbody) {
      tbody.innerHTML = '';
      this.webUI.eventsTableManager.eventRowCounter = 0;

      function registerCurrencyCode(code, map) {
        if (code === undefined || code === null) return;
        var normalized = String(code).trim().toUpperCase();
        if (!normalized) return;
        map[normalized] = true;
      }

      let configForMetaValidation = null;
      let shouldValidateCurrencyMeta = false;
      let cachedRuleSetsForValidation = {};
      const knownCurrencyCodes = {};
      const warnedCurrencyCodes = {};
      try {
        configForMetaValidation = Config.getInstance();
        if (configForMetaValidation && typeof configForMetaValidation.isRelocationEnabled === 'function' && configForMetaValidation.isRelocationEnabled()) {
          shouldValidateCurrencyMeta = true;
          // Preload all available country rule sets to ensure currencies are recognized during validation
          if (typeof configForMetaValidation.getAvailableCountries === 'function') {
            try {
              const availableCountries = configForMetaValidation.getAvailableCountries() || [];
              const preloadPromises = availableCountries.map(async (ac) => {
                if (!ac || !ac.code) return;
                const acCode = String(ac.code).trim().toLowerCase();
                try {
                  await configForMetaValidation.getTaxRuleSet(acCode);
                } catch (_) { }
              });
              await Promise.all(preloadPromises);
            } catch (_) { }
          }
          // Refresh cached rule sets after preloading (they may have been loaded)
          if (typeof configForMetaValidation.listCachedRuleSets === 'function') {
            const cachedSets = configForMetaValidation.listCachedRuleSets() || {};
            cachedRuleSetsForValidation = cachedSets;
            for (const code in cachedSets) {
              if (!Object.prototype.hasOwnProperty.call(cachedSets, code)) continue;
              const ruleset = cachedSets[code];
              try {
                if (ruleset && typeof ruleset.getCurrencyCode === 'function') {
                  registerCurrencyCode(ruleset.getCurrencyCode(), knownCurrencyCodes);
                }
              } catch (_) { }
            }
          }
          if (typeof configForMetaValidation.getDefaultCountry === 'function' &&
            typeof configForMetaValidation.getCachedTaxRuleSet === 'function') {
            const defaultCode = configForMetaValidation.getDefaultCountry();
            const defaultRuleset = configForMetaValidation.getCachedTaxRuleSet(defaultCode);
            try {
              if (defaultRuleset && typeof defaultRuleset.getCurrencyCode === 'function') {
                registerCurrencyCode(defaultRuleset.getCurrencyCode(), knownCurrencyCodes);
                if (!cachedRuleSetsForValidation[defaultCode]) {
                  cachedRuleSetsForValidation[defaultCode] = defaultRuleset;
                }
              }
            } catch (_) { }
          }
        }
      } catch (_) {
        shouldValidateCurrencyMeta = false;
      }

      eventData.forEach(([type, name, amount, fromAge, toAge, rate, match, meta]) => {
        if (type) {
          const displayRate = (rate !== undefined && rate !== '') ? String(parseFloat((Number(rate) * 100).toFixed(2))) : '';
          const displayMatch = (match !== undefined && match !== '') ? String(parseFloat((Number(match) * 100).toFixed(2))) : '';
          const row = this.webUI.eventsTableManager.createEventRow(type, name, amount, fromAge || '', toAge || '', displayRate, displayMatch);
          tbody.appendChild(row);

          // Parse optional Meta column to restore hidden fields (currency, linkedCountry, linkedEventId, splitMvId, mvLinkId, sellMvId, resolved)
          try {
            if (meta && typeof meta === 'string') {
              // Meta format: key=value;key=value (values URL-encoded)
              const parts = meta.split(';').filter(Boolean);
              const metaValues = {};
              for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const equalsIndex = part.indexOf('=');
                if (equalsIndex > 0) {
                  const key = part.substring(0, equalsIndex);
                  const value = decodeURIComponent(part.substring(equalsIndex + 1));
                  metaValues[key] = value;
                }
              }
              // Apply to hidden inputs when present
              if (metaValues.linkedCountry) {
                this.webUI.eventsTableManager.getOrCreateHiddenInput(row, 'event-linked-country', metaValues.linkedCountry);
                // Provide direct country hint for per-row formatting
                this.webUI.eventsTableManager.getOrCreateHiddenInput(row, 'event-country', String(metaValues.linkedCountry).toLowerCase());
                if (shouldValidateCurrencyMeta && configForMetaValidation) {
                  try {
                    const normalizedLc = String(metaValues.linkedCountry).trim().toLowerCase();
                    if (normalizedLc) {
                      let lcRuleset = cachedRuleSetsForValidation[normalizedLc];
                      if (!lcRuleset && typeof configForMetaValidation.getCachedTaxRuleSet === 'function') {
                        lcRuleset = configForMetaValidation.getCachedTaxRuleSet(normalizedLc);
                        if (lcRuleset) {
                          cachedRuleSetsForValidation[normalizedLc] = lcRuleset;
                        }
                      }
                      if (lcRuleset && typeof lcRuleset.getCurrencyCode === 'function') {
                        registerCurrencyCode(lcRuleset.getCurrencyCode(), knownCurrencyCodes);
                      }
                    }
                  } catch (_) { }
                }
              }
              if (metaValues.currency) {
                this.webUI.eventsTableManager.getOrCreateHiddenInput(row, 'event-currency', metaValues.currency);
                if (shouldValidateCurrencyMeta) {
                  try {
                    let hasKnownCurrency = false;
                    for (const code in knownCurrencyCodes) {
                      if (Object.prototype.hasOwnProperty.call(knownCurrencyCodes, code)) {
                        hasKnownCurrency = true;
                        break;
                      }
                    }
                    if (hasKnownCurrency) {
                      const currencyCode = String(metaValues.currency).trim().toUpperCase();
                      if (currencyCode) {
                        if (!knownCurrencyCodes[currencyCode]) {
                          let matched = false;
                          for (const ruleKey in cachedRuleSetsForValidation) {
                            if (!Object.prototype.hasOwnProperty.call(cachedRuleSetsForValidation, ruleKey)) continue;
                            const rs = cachedRuleSetsForValidation[ruleKey];
                            if (!rs || typeof rs.getCurrencyCode !== 'function') continue;
                            const rsCurrency = String(rs.getCurrencyCode()).trim().toUpperCase();
                            if (rsCurrency && rsCurrency === currencyCode) {
                              matched = true;
                              registerCurrencyCode(rsCurrency, knownCurrencyCodes);
                              break;
                            }
                          }
                          if (!matched && !warnedCurrencyCodes[currencyCode]) {
                            // Try to find the currency by checking available countries
                            let foundInAvailable = false;
                            if (configForMetaValidation && typeof configForMetaValidation.getAvailableCountries === 'function') {
                              try {
                                const availableCountries = configForMetaValidation.getAvailableCountries() || [];
                                for (let acIdx = 0; acIdx < availableCountries.length; acIdx++) {
                                  const ac = availableCountries[acIdx];
                                  if (!ac || !ac.code) continue;
                                  const acCode = String(ac.code).trim().toLowerCase();
                                  let acRuleset = cachedRuleSetsForValidation[acCode];
                                  if (!acRuleset && typeof configForMetaValidation.getCachedTaxRuleSet === 'function') {
                                    acRuleset = configForMetaValidation.getCachedTaxRuleSet(acCode);
                                    if (acRuleset) {
                                      cachedRuleSetsForValidation[acCode] = acRuleset;
                                    }
                                  }
                                  if (acRuleset && typeof acRuleset.getCurrencyCode === 'function') {
                                    const acCurrency = String(acRuleset.getCurrencyCode()).trim().toUpperCase();
                                    if (acCurrency === currencyCode) {
                                      registerCurrencyCode(acCurrency, knownCurrencyCodes);
                                      foundInAvailable = true;
                                      break;
                                    }
                                  }
                                }
                              } catch (_) { }
                            }
                            if (!foundInAvailable && !warnedCurrencyCodes[currencyCode]) {
                              console.warn('Unknown currency code in Meta:', metaValues.currency, '- Event may not display correctly');
                              warnedCurrencyCodes[currencyCode] = true;
                            }
                          }
                        }
                      }
                    }
                  } catch (_) { }
                }
              }
              if (metaValues.linkedEventId) this.webUI.eventsTableManager.getOrCreateHiddenInput(row, 'event-linked-event-id', metaValues.linkedEventId);
              if (metaValues.splitMvId) this.webUI.eventsTableManager.getOrCreateHiddenInput(row, 'event-relocation-split-mv-id', metaValues.splitMvId);
              if (metaValues.mvLinkId) this.webUI.eventsTableManager.getOrCreateHiddenInput(row, 'event-relocation-link-id', metaValues.mvLinkId);
              if (metaValues.sellMvId) this.webUI.eventsTableManager.getOrCreateHiddenInput(row, 'event-relocation-sell-mv-id', metaValues.sellMvId);
              if (metaValues.resolved === '1') {
                this.webUI.eventsTableManager.getOrCreateHiddenInput(row, 'event-resolution-override', '1');
              }
              if (metaValues.resolved === '0') {
                try {
                  row.dataset.relocationImpact = '1';
                  row.dataset.relocationImpactCategory = 'unresolved';
                  row.dataset.relocationImpactMessage = 'This event is marked as unresolved. Resolve the relocation impact warnings before running.';
                  row.dataset.relocationImpactAuto = '0';
                  row.dataset.relocationImpactMvId = '';
                } catch (_) { }
              }
            }
          } catch (_) { /* Non-fatal: loading continues without meta */ }
        }
      });

      this.webUI.formatUtils.setupCurrencyInputs();
      this.webUI.formatUtils.setupPercentageInputs();
      this.webUI.eventsTableManager.updateEventRowsVisibilityAndTypes();
      if (this.webUI.dragAndDrop && typeof this.webUI.dragAndDrop.renderPriorities === 'function') {
        await this.webUI.dragAndDrop.renderPriorities();
      }

      // TODO: This is the wrong place for this. It belongs in the UI side of things.
      if (this.webUI.eventAccordionManager) {
        this.webUI.eventAccordionManager.refresh();
      }
    }

    // Preload tax rulesets for any relocation events in the loaded scenario
    try {
      var config = Config.getInstance();
      var startCountry = config.getStartCountry();
      var loadedEvents = this.webUI.readEvents(false);
      await config.syncTaxRuleSetsWithEvents(loadedEvents, startCountry);
    } catch (err) {
      console.error('Error preloading tax rulesets:', err);
    }

    // Re-create the empty tax-header row after scenario load so the data table
    // matches a freshly loaded page (headers present, no stale data rows).
    try {
      if (this.webUI.tableManager && typeof this.webUI.tableManager.setDataRow === 'function') {
        this.webUI.tableManager.setDataRow(0, {});
        const temp = document.getElementById('data_row_0');
        if (temp && temp.parentNode) temp.parentNode.removeChild(temp);
      }
    } catch (_) { }

    this.webUI.setStatus("Ready");

    // Check for relocation impacts and update status accordingly
    try {
      const uiManager = new UIManager(this.webUI);
      const events = uiManager.readEvents(false);
      // Analyze impacts immediately after load so badges/status reflect current state
      try {
        const startCountry = Config.getInstance().getStartCountry();
        if (typeof RelocationImpactDetector !== 'undefined' && Config.getInstance().isRelocationEnabled()) {
          RelocationImpactDetector.analyzeEvents(events, startCountry);
          // Refresh badges from analyzed events
          if (this.webUI.eventsTableManager && typeof this.webUI.eventsTableManager.updateRelocationImpactIndicators === 'function') {
            this.webUI.eventsTableManager.updateRelocationImpactIndicators(events);
          }
          // Refresh accordion to reflect impacts on initial load
          try { if (this.webUI.eventAccordionManager) { this.webUI.eventAccordionManager.refresh(); } } catch (_) { }
        }
      } catch (_) { /* non-fatal */ }
      this.webUI.updateStatusForRelocationImpacts(events);
    } catch (error) {
      console.error('Error updating status for relocation impacts after loading:', error);
      // Scenario loading continues normally even if status update fails
    }
  }

  _csvHasRelocationEvents(content) {
    if (!content) return false;
    const lines = content.split('\n');
    let inEvents = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('#')) {
        inEvents = line.indexOf('# Events') === 0;
        continue;
      }
      if (!inEvents) continue;
      if (line.indexOf('Type,') === 0) continue;
      const parts = line.split(',');
      const type = parts[0] ? parts[0].trim() : '';
      if (type === 'MV') return true;
    }
    return false;
  }

  async fetchUrl(url) {
    try {
      // Add cache-busting parameter to ensure fresh content
      const separator = url.includes('?') ? '&' : '?';
      const cacheBustUrl = `${url}${separator}_t=${Date.now()}`;

      const response = await fetch(cacheBustUrl, {
        cache: 'no-store', // Prevent any caching
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      // It's good practice to re-throw or handle the error appropriately.
      // For now, let's make sure it propagates to be caught by callers.
      console.error(`Failed to fetch URL: ${url}`, error);
      throw new Error(`Failed to fetch URL ${url}: ${error.message}`);
    }
  }

  // Methods to manage scenario name
  setScenarioName(name) {
    this.currentScenarioName = name || '';
  }

  getScenarioName() {
    return this.currentScenarioName;
  }

  clearScenarioName() {
    this.currentScenarioName = '';
  }

}
