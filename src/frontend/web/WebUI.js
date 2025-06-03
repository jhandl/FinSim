/* This file has to work only on the website */

var WebUI_instance = null;

class WebUI extends AbstractUI {
  
  constructor() {
    try {
      super();
      
      // Initialize simulation state tracking
      this.isSimulationRunning = false;
      
      // Initialize in a specific order to ensure dependencies are met
      this.formatUtils = new FormatUtils();
      this.notificationUtils = new NotificationUtils();
      this.errorModalUtils = new ErrorModalUtils();
      this.chartManager = new ChartManager();
      this.tableManager = new TableManager(this);
      this.fileManager = new FileManager(this);
      this.eventsTableManager = new EventsTableManager(this);
      this.dragAndDrop = new DragAndDrop();
      this.editCallbacks = new Map();
      
      // Connect error modal to notification utils
      this.notificationUtils.setErrorModalUtils(this.errorModalUtils);
      
      // Setup event listeners
      this.setupChangeListener();
      this.setupRunSimulationButton();
      this.setupWizardInvocation();
      this.setupNavigation();
      this.setupLoadDemoScenarioButton();
      
      this.eventsTableManager.addEventRow();
      
      // Set initial UI state
      this.setStatus("Ready", STATUS_COLORS.INFO);
      this.fileManager.updateLastSavedState(); // Establish baseline for new scenario
      
    } catch (error) {
      throw error;
    }
  }

  // Singleton
  static getInstance() {
    if (!WebUI_instance) {
      try {
        WebUI_instance = new WebUI();
      } catch (error) {
        throw error; // Propagate error if WebUI creation fails
      }
    }
    return WebUI_instance;
  }

  setStatus(message, color=STATUS_COLORS.INFO) {
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
        if (this.fileManager.hasUnsavedChanges()) {
          if (window.confirm("Loading the demo scenario will overwrite any unsaved changes. Are you sure you want to proceed?")) {
            this.fileManager.loadFromUrl("/src/frontend/web/assets/demo.csv", "Example");
          }
        } else {
          // No unsaved changes, load directly
          this.fileManager.loadFromUrl("/src/frontend/web/assets/demo.csv", "Example");
        }
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

    // Use a more comprehensive event handler that prevents multiple rapid triggers
    this.handleRunSimulation = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (this.isSimulationRunning || runButton.disabled) {
        return; // Don't start another simulation
      }

      this.isSimulationRunning = true;
      runButton.disabled = true;
      runButton.classList.add('disabled');
      runButton.style.pointerEvents = 'none';      
      this.setStatus('Running...');
      runButton.offsetHeight; // This forces the browser to recalculate layout immediately

      // Use setTimeout to run after UI updates
      setTimeout(() => {
        try {
          run();
        } catch (error) {
          this.setError('Simulation failed: ' + error.message);
          // Re-enable button on error
          this.isSimulationRunning = false;
          runButton.disabled = false;
          runButton.classList.remove('disabled');
          runButton.style.pointerEvents = '';      
        }
        // Note: Button re-enabling on success is handled in flush when simulation completes
      }, 0);
    };

    runButton.addEventListener('click', this.handleRunSimulation);
  }

  setupWizardInvocation() {
    const wizard = Wizard.getInstance();
    const helpButton = document.getElementById('startWizard');
    if (helpButton) {
      helpButton.addEventListener('click', () => {
        // Use wizard's built-in logic only if there was a recently focused input field
        // lastStepIndex > 0 alone doesn't indicate field context, just previous wizard usage
        if (wizard.lastFocusedWasInput && wizard.lastFocusedField) {
          // There was recent field interaction - use wizard's built-in logic
          wizard.start();
        } else {
          // No recent field interaction - start from step 1 (how to use the simulator)
          wizard.start(1);
        }
      });
    }
    const userManualButton = document.getElementById('userManual');
    if (userManualButton) {
      userManualButton.addEventListener('click', () => wizard.start(0));
    }
    document.addEventListener('keydown', function(event) {
      if (event.key === '?') {
        event.preventDefault();
        // For keyboard shortcut, use same logic as Help button
        if (wizard.lastFocusedWasInput && wizard.lastFocusedField) {
          wizard.start();
        } else {
          wizard.start(1);
        }
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
    this.fileManager.setScenarioName(name);
  }

  getScenarioName() {
    return this.fileManager.getScenarioName();
  }

  clearScenarioName() {
    this.fileManager.clearScenarioName();
  }

  flush() {    
    // flush() is called at the end of updateStatusCell, which signals simulation completion
    if (this.isSimulationRunning) {
      this.isSimulationRunning = false;
      const runButton = document.getElementById('runSimulation');
      if (runButton) {
        setTimeout(() => {
          runButton.disabled = false;
          runButton.classList.remove('disabled');
          runButton.style.pointerEvents = '';
        }, 100);
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', async () => { // Add async
  try {
    const webUi = WebUI.getInstance(); // Get WebUI instance
    await Config.initialize(webUi);   // Initialize Config and wait for it
    
    // Automatically start the wizard
    const wizard = Wizard.getInstance();
    if (wizard) {
      wizard.start(0); // Start wizard from the first step (welcome popover)
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
  }
});
