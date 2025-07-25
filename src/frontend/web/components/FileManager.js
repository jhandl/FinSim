class FileManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.lastSavedState = null; // Initialize lastSavedState
    this.currentScenarioName = ''; // Track current scenario name
    this.setupSaveButton();
    this.setupLoadButton();
  }

  updateLastSavedState() {
    // Ensure this is called when the UI is in a known "clean" or "new scenario" state.
    this.lastSavedState = serializeSimulation(this.webUI);
  }

  hasUnsavedChanges() {
      const currentState = serializeSimulation(this.webUI);

      // If we haven't saved yet, treat as unsaved only if real data differs
      if (this.lastSavedState === null) {
          return true;
      }

      const normalize = (csv) => {
          return csv
              .split('\n')
              .filter(line => {
                  if (line.startsWith('EventsSortPreset,')) return false;
                  return true;
              })
              .join('\n');
      };

      return normalize(currentState) !== normalize(this.lastSavedState);
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
    if (this.hasUnsavedChanges()) {
      const proceed = await this.webUI.showAlert("Loading a new scenario will overwrite any unsaved changes. Are you sure you want to proceed?", "Confirm Load", true);
      if (!proceed) {
        return; // User cancelled
      }
    }
    
    const scenarioName = file.name.replace('.csv', '');
    const fileInput = document.getElementById('loadSimulationDialog');
    try {
      const content = await file.text();
      this.loadFromString(content, scenarioName);
      this.updateLastSavedState(); // Ensure this is here
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
    if (this.hasUnsavedChanges()) {
      const proceed = await this.webUI.showAlert("Loading the demo scenario will overwrite any unsaved changes. Are you sure you want to proceed?", "Confirm Load", true);
      if (!proceed) {
        return; // User cancelled
      }
    }
    
    try {
      const content = await this.fetchUrl(url); // ensure await here
      this.loadFromString(content, name);
      this.updateLastSavedState(); // Update state after successful load and UI update
    } catch (error) {
      // Handle or propagate error, e.g., show a notification via webUI
      console.error(`Error in loadFromUrl for ${name}:`, error);
      this.webUI.notificationUtils.showAlert(`Error loading demo scenario '${name}'. Please check console for details.`, 'Error');
      // Optionally, re-throw if WebUI needs to react further
    }
  }

  loadFromString(content, name) {
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

    const eventData = deserializeSimulation(content, this.webUI);

    // Note: Simulation mode is already set by deserializeSimulation based on file version and P2 data
    // No need to override it here

    const priorityIds = ['PriorityCash', 'PriorityPension', 'PriorityFunds', 'PriorityShares'];
    const prioritiesContainer = document.querySelector('.priorities-container');
    if (prioritiesContainer) {
      const priorityValues = priorityIds.map(id => ({
        id: id,
        value: parseInt(this.webUI.getValue(id)) || 0,
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
      eventData.forEach(([type, name, amount, fromAge, toAge, rate, match]) => {
        if (type) {
          const displayRate = (rate !== undefined && rate !== '') ? String(parseFloat((Number(rate) * 100).toFixed(2))) : '';
          const displayMatch = (match !== undefined && match !== '') ? String(parseFloat((Number(match) * 100).toFixed(2))) : '';
          const row = this.webUI.eventsTableManager.createEventRow(type, name, amount, fromAge || '', toAge || '', displayRate, displayMatch);
          if (type === 'E' && fromAge !== "" && toAge !== "" && parseInt(fromAge) === parseInt(toAge)) {
            const event = this.webUI.eventsTableManager.extractEventFromRow(row);
            event.isOneOff = true;
          }
          tbody.appendChild(row);
        }
      });
      this.webUI.formatUtils.setupCurrencyInputs();
      this.webUI.formatUtils.setupPercentageInputs();
      this.webUI.eventsTableManager.updateEventRowsVisibilityAndTypes();

      // TODO: This is the wrong place for this. It belongs in the UI side of things.
      if (this.webUI.eventAccordionManager) {
        this.webUI.eventAccordionManager.refresh();
      }
    }
    this.webUI.setStatus("Ready");
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