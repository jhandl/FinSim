class FileManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.setupSaveButton();
    this.setupLoadButton();
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
      console.error(error);
      this.webUI.notificationUtils.showAlert('Error loading file: Please make sure this is a valid simulation save file.');
      return;
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }

  async loadFromUrl(url, name) {
    const content = await this.fetchUrl(url);
    this.loadFromString(content, name);
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
  }

  fetchUrl(url) {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);  // false makes the request synchronous
    try {
      xhr.send();
      if (xhr.status === 200) {
        return xhr.responseText;
      } else {
        throw new Error(`HTTP error! status: ${xhr.status}`);
      }
    } catch (error) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }

} 