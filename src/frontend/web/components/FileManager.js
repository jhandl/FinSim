export default class FileManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.setupSaveButton();
    this.setupLoadButton();
  }


  setupSaveButton() {
    const saveButton = document.getElementById('saveSimulation');
    if (saveButton) {
      saveButton.addEventListener('click', () => this.saveToFile()); // Call local method
    }
  }

  setupLoadButton() {
    const loadButton = document.getElementById('loadSimulation');
    const fileInput = document.getElementById('loadSimulationDialog');
    if (loadButton && fileInput) {
      loadButton.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.loadFromFile(e.target.files[0])); // Call local method
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
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        console.error('Error saving file via picker:', err);
        this.webUI.notificationUtils.showAlert('Error saving file: ' + err.message);
      }
    } else {
      // Legacy fallback
      try {
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = suggestedName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
      } catch (err) {
          console.error('Error saving file via fallback:', err);
          this.webUI.notificationUtils.showAlert('Error saving file: ' + err.message);
      }
    }
  }

  async loadFromFile(file) {
    if (!file) return;
    const scenarioName = file.name.replace('.csv', '');
    const fileInput = document.getElementById('loadSimulationDialog');
    try {
      const content = await file.text();
      this.loadFromString(content, scenarioName);
    } catch (error) {
      console.error('Error reading file:', error);
      this.webUI.notificationUtils.showAlert('Error loading file: Please make sure this is a valid simulation save file.');
      return;
    } finally {
      // Reset file input to allow loading the same file again
      if (fileInput) fileInput.value = '';
    }
  }

  async loadFromUrl(url, name) {
     try {
        const content = await this.fetchUrl(url); // Use async fetchUrl
        this.loadFromString(content, name);
     } catch (error) {
        console.error(`Error loading from URL ${url}:`, error);
        this.webUI.notificationUtils.showAlert(`Error loading scenario from URL: ${error.message}`);
     }
  }

  loadFromString(content, name) {
    // Assume deserializeSimulation is globally available from Utils.js
    if (typeof deserializeSimulation !== 'function') {
        this.webUI.notificationUtils.showAlert('Error: deserializeSimulation function not found.');
        return;
    }
    try {
        this.webUI.tableManager.clearContent('Events');
        this.webUI.tableManager.clearExtraDataRows(0);
        this.webUI.chartManager.clearExtraChartRows(0);
        this.webUI.setScenarioName(name);
        const eventData = deserializeSimulation(content, this.webUI); // Pass WebUI instance

        // Update priorities based on loaded data
        const priorityIds = ['PriorityCash', 'PriorityPension', 'PriorityFunds', 'PriorityShares'];
        const prioritiesContainer = document.querySelector('.priorities-container');
        if (prioritiesContainer) {
          const priorityValues = priorityIds.map(id => ({
            id: id,
            // Get value directly from WebUI instance which reads from DOM
            value: parseInt(this.webUI.getValue(id)) || 0,
            element: prioritiesContainer.querySelector(`[data-priority-id="${id}"]`)
          })).sort((a, b) => a.value - b.value); // Sort based on loaded values

          // Reorder elements in the DOM
          priorityValues.forEach(item => {
            if (item.element) {
              prioritiesContainer.appendChild(item.element);
              // Input value should already be set by deserializeSimulation via webUI.setValue
            }
          });
        }

        // Populate events table
        const tbody = document.querySelector('#Events tbody');
        if (tbody) {
          tbody.innerHTML = ''; // Clear existing rows
          this.webUI.eventsTableManager.eventRowCounter = 0; // Reset counter
          eventData.forEach(([type, name, amount, fromAge, toAge, rate, match]) => {
            if (type) {
              // Format rate/match back to percentage string for display
              const displayRate = (rate !== undefined && rate !== null && rate !== '') ? String(parseFloat((Number(rate) * 100).toFixed(2))) : '';
              const displayMatch = (match !== undefined && match !== null && match !== '') ? String(parseFloat((Number(match) * 100).toFixed(2))) : '';
              const row = this.webUI.eventsTableManager.createEventRow(type, name, amount, fromAge || '', toAge || '', displayRate, displayMatch);
              tbody.appendChild(row);
            }
          });
          // Re-apply input formatting after adding rows
          this.webUI.formatUtils.setupCurrencyInputs();
          this.webUI.formatUtils.setupPercentageInputs();
        }
        this.webUI.setStatus("Ready");
    } catch (error) {
        console.error("Error processing loaded simulation data:", error);
        this.webUI.notificationUtils.showAlert(`Error processing simulation data: ${error.message}`);
        this.webUI.clearScenarioName(); // Clear name on error
    }
  }

  fetchUrl(url) { // Synchronous fetch using XMLHttpRequest
    try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false); // false makes the request synchronous
        xhr.send(null);
        if (xhr.status < 200 || xhr.status >= 300) {
            throw new Error(`HTTP ${xhr.status}: ${xhr.statusText}`);
        }
        return xhr.responseText;
    } catch (error) {
        console.error(`Failed to fetch URL ${url}:`, error);
        throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }

}