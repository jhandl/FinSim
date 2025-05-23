class FileManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.lastSavedState = null; // Initialize lastSavedState
    this.setupSaveButton();
    this.setupLoadButton();
  }

  updateLastSavedState() {
    // Ensure this is called when the UI is in a known "clean" or "new scenario" state.
    this.lastSavedState = serializeSimulation(this.webUI);
  }

  hasUnsavedChanges() {
      const currentState = serializeSimulation(this.webUI);
      // If lastSavedState is null, it means either it's a fresh session
      // or state tracking hasn't been initialized by a load/save.
      // In a fresh session, we need WebUI to call updateLastSavedState()
      // with the serialized empty form.
      // If it's still null here, we can't be sure, so err on the side of caution.
      if (this.lastSavedState === null) {
          // This case should ideally be handled by WebUI initializing lastSavedState.
          // If current state is "empty" (however defined by serializeSimulation),
          // then no unsaved changes. This is hard to define here.
          // Safest is to assume true if not explicitly set.
          return true;
      }
      return currentState !== this.lastSavedState;
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
      loadButton.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.webUI.loadFromFile(e.target.files[0]));
    }
  }

  async saveToFile() {
    const csvContent = serializeSimulation(this.webUI);
    const currentScenarioName = document.querySelector('.scenario-name')?.textContent || 'my scenario';
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
        this.webUI.setScenarioName(scenarioName);
        
        const writable = await handle.createWritable();
        await writable.write(csvContent);
        await writable.close();
        this.lastSavedState = serializeSimulation(this.webUI); // Update on successful save
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        this.webUI.notificationUtils.showAlert('Error saving file: ' + err.message);
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
    const scenarioName = file.name.replace('.csv', '');
    const fileInput = document.getElementById('loadSimulationDialog');
    try {
      const content = await file.text();
      this.loadFromString(content, scenarioName);
      this.updateLastSavedState(); // Ensure this is here
    } catch (error) {
      console.error(error);
      this.webUI.notificationUtils.showAlert('Error loading file: Please make sure this is a valid simulation save file.');
      return; // Keep this return to avoid issues in finally if fileInput is crucial
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }

  async loadFromUrl(url, name) {
    try {
      const content = await this.fetchUrl(url); // ensure await here
      this.loadFromString(content, name);
      this.updateLastSavedState(); // Update state after successful load and UI update
    } catch (error) {
      // Handle or propagate error, e.g., show a notification via webUI
      console.error(`Error in loadFromUrl for ${name}:`, error);
      this.webUI.notificationUtils.showAlert(`Error loading demo scenario '${name}'. Please check console for details.`);
      // Optionally, re-throw if WebUI needs to react further
    }
  }

  loadFromString(content, name) {
    this.webUI.tableManager.clearContent('Events');
    this.webUI.tableManager.clearExtraDataRows(0);
    this.webUI.chartManager.clearExtraChartRows(0);
    this.webUI.setScenarioName(name);
    const eventData = deserializeSimulation(content, this.webUI);
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
          tbody.appendChild(row);
        }
      });
      this.webUI.formatUtils.setupCurrencyInputs();
      this.webUI.formatUtils.setupPercentageInputs();
    }
    this.webUI.setStatus("Ready");
    // Note: The removal of 'this.lastSavedState = serializeSimulation(this.webUI);'
    // from loadFromString was specified, but based on the last file read,
    // it was already not present. If it were, it would be removed here.
  }

  async fetchUrl(url) {
    try {
      const response = await fetch(url);
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

}