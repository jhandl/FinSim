/* This file has to work only on the website */

var WebUI_instance = null;

class WebUI extends AbstractUI {
  
  constructor() {
    try {
      super();
      
      // Initialize in a specific order to ensure dependencies are met
      this.formatUtils = new FormatUtils();
      this.notificationUtils = new NotificationUtils();
      this.chartManager = new ChartManager();
      this.tableManager = new TableManager(this);
      this.fileManager = new FileManager(this);
      this.eventsTableManager = new EventsTableManager(this);
      this.dragAndDrop = new DragAndDrop();
      this.editCallbacks = new Map();
      
      // Setup event listeners
      this.setupChangeListener();
      this.setupRunSimulationButton();
      this.setupWizardInvocation();
      this.setupNavigation();
      this.setupLoadDemoScenarioButton(); // New method call for the demo button
      
      this.eventsTableManager.addEventRow();
      
      // Set initial UI state
      this.setStatus("Ready", STATUS_COLORS.INFO);
      
    } catch (error) {
      throw error;
    }
  }

  // Singleton
  static getInstance() {
    if (!WebUI_instance) {
      try {
        WebUI_instance = new WebUI();
        
        // Initialize Config after WebUI is created
        try {
          Config.getInstance(WebUI_instance);
        } catch (configError) {
          // Continue without Config rather than breaking the whole app
        }
        
      } catch (error) {
        throw error;
      }
    }
    return WebUI_instance;
  }

  setStatus(message, color=STATUS_COLORS.INFO) {
    this.notificationUtils.setStatus(message, color);
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

  getTableData(groupId, columnCount = 1) {
    return this.tableManager.getTableData(groupId, columnCount);
  }

  setDataRow(rowIndex, data) {
    this.tableManager.setDataRow(rowIndex, data);
  }

  setChartsRow(rowIndex, data) {
    this.chartManager.updateChartsRow(rowIndex, data);
  }

  getVersion() {
    return localStorage.getItem('simulatorVersion') || '1.26'; // TODO: Has to be a better way to get the starting defaultversion
  }

  setVersion(version) {
    localStorage.setItem('simulatorVersion', version);
    const versionSpan = document.querySelector('.version');
    if (versionSpan) {
      versionSpan.textContent = `Version ${version}`;
    }
  }

  newDataVersion(latestVersion) {
    this.notificationUtils.newDataVersion(latestVersion);
  }

  showAlert(message, buttons = false) {
    return this.notificationUtils.showAlert(message, buttons);
  }

  showToast(message, title, timeout) {
    this.notificationUtils.showToast(message, title, timeout);
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

  newCodeVersion(latestVersion) {
    // No action needed in web version as users always get the latest version
  }

  isPercentage(elementId) {
    const element = document.getElementById(elementId);
    return element && element.classList.contains('percentage');
  }

  isBoolean(elementId) {
    const element = document.getElementById(elementId);
    return element && element.classList.contains('boolean');
  }

  getValue(elementId) {
    return DOMUtils.getValue(elementId);
  }

  setValue(elementId, value) {
    DOMUtils.setValue(elementId, value);
  }

  fetchUrl(url) {
    return this.fileManager.fetchUrl(url);
  }
  
  saveToFile() {
    return this.fileManager.saveToFile();
  }

  loadFromFile(file) {
    return this.fileManager.loadFromFile(file);
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
    });
  }

  // New method to setup the load demo scenario button
  setupLoadDemoScenarioButton() {
    const loadDemoButton = document.getElementById('loadDemoScenarioHeader');
    if (loadDemoButton) {
      loadDemoButton.addEventListener('click', () => {
        this.fileManager.loadFromUrl("/src/frontend/web/assets/demo.csv", "Example");
      });
    } else {
      // It's better to log an error if the button isn't found during development
      // but for production, we might not want to throw an error or log excessively.
      // For now, let's log it as it helps in debugging.
      console.error("loadDemoScenarioHeader button not found");
    }
  }

  setupRunSimulationButton() {
    const runButton = document.getElementById('runSimulation');
    if (!runButton) return;

    runButton.addEventListener('click', () => {
      runButton.disabled = true;
      runButton.classList.add('disabled');
      this.setStatus('Running...');
      
      // Use setTimeout to run after UI updates
      setTimeout(() => {
        try {
          run();
        } catch (error) {
          this.setStatus('Simulation failed: ' + error.message, STATUS_COLORS.ERROR);
        } finally {
          runButton.disabled = false;
          runButton.classList.remove('disabled');
        }
      }, 0);
    });
  }

  setupWizardInvocation() {
    const wizard = Wizard.getInstance();
    const helpButton = document.getElementById('startWizard');
    if (helpButton) {
      helpButton.addEventListener('click', () => wizard.start());
    }
    const userManualButton = document.getElementById('userManual');
    if (userManualButton) {
      userManualButton.addEventListener('click', () => wizard.start(0));
    }
    document.addEventListener('keydown', function(event) {
      if (event.key === '?') {
        event.preventDefault();
        wizard.start();
      }
    });
  }

  setupNavigation() {
    document.querySelectorAll('a[href^="/"]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        window.parent.postMessage({ type: 'navigate', href: link.getAttribute('href') }, '*');
      });
    });
  }

  clearExtraDataRows(maxAge) {
    this.tableManager.clearExtraDataRows(maxAge);
  }

  clearExtraChartRows(maxAge) {
    this.chartManager.clearExtraChartRows(maxAge);
  }

  setScenarioName(name) {
    const scenarioSpan = document.querySelector('.scenario-name');
    if (scenarioSpan) {
        scenarioSpan.textContent = name;
    }
  }

  clearScenarioName() {
    const scenarioSpan = document.querySelector('.scenario-name');
    if (scenarioSpan) {
        scenarioSpan.textContent = '';
    }
  }

  flush() {
    // No-op in web UI as changes are immediate
  }
}

window.addEventListener('DOMContentLoaded', () => {
  WebUI.getInstance();
}); 
