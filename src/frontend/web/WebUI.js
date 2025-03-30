/* This file has to work only on the website */

// Local frontend module imports
// AbstractUI is loaded globally via <script> tag for GAS compatibility
import FormatUtils from './utils/FormatUtils.js';
import NotificationUtils from './utils/NotificationUtils.js';
import ChartManager from './components/ChartManager.js';
import TableManager from './components/TableManager.js';
import FileManager from './components/FileManager.js';
import EventsTableManager from './components/EventsTableManager.js';
import DragAndDrop from './components/DragAndDrop.js';
import Wizard from './components/Wizard.js';
import DOMUtils from './utils/DOMUtils.js';

// NPM Library imports
// Note: Driver.js CSS is still loaded via <link> in HTML
import * as Driver from 'driver.js';
// import yaml from 'js-yaml'; // Import if/when yaml parsing is needed in this file or FileManager
// import Chart from 'chart.js/auto'; // Import if/when Chart object is directly used here or ChartManager

// Assume STATUS_COLORS is available globally from a core script or needs to be defined/imported later
// Assume AbstractUI is available globally

let WebUI_instance = null; // Module-scoped singleton instance

export class WebUI extends AbstractUI { // Extends the globally available AbstractUI

  constructor() {
    try {
      super();

      // Initialize in a specific order to ensure dependencies are met
      this.formatUtils = new FormatUtils();
      this.notificationUtils = new NotificationUtils();
      this.chartManager = new ChartManager(); // Assumes Chart is globally available or imported by ChartManager
      this.tableManager = new TableManager(this);
      this.fileManager = new FileManager(this); // Assumes yaml might be imported/used within FileManager
      this.eventsTableManager = new EventsTableManager(this);
      this.dragAndDrop = new DragAndDrop(); // Assumes Driver is imported/used within DragAndDrop or Wizard
      this.editCallbacks = new Map();

      // Setup event listeners
      this.setupChangeListener();
      this.setupRunSimulationButton();
      this.setupWizardInvocation();
      this.setupNavigation();

      this.eventsTableManager.addEventRow();

      // Set initial UI state
      // Assume STATUS_COLORS is globally available for now
      this.setStatus("Ready", STATUS_COLORS.INFO);

    } catch (error) {
      console.error("Error initializing WebUI:", error); // Log error
      throw error;
    }
  }

  // Singleton
  static getInstance() {
    if (!WebUI_instance) {
      try {
        WebUI_instance = new WebUI();

        // Initialize Config after WebUI is created
        // Config is loaded globally via <script> tag, assume it exists.
        try {
           Config.getInstance(WebUI_instance);
        } catch (configError) {
           console.error("Error initializing Config:", configError);
          // Continue without Config rather than breaking the whole app
        }

      } catch (error) {
        console.error("Error creating WebUI instance:", error); // Log error
        throw error;
      }
    }
    return WebUI_instance;
  }

  // Assume STATUS_COLORS is globally available for the default parameter
  setStatus(message, color = STATUS_COLORS.INFO) {
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
      // Check if element has an ID before proceeding
      if (element && element.id) {
          this.clearElementWarning(element); // Clear warning on change
          this.editCallbacks.forEach(callback => {
              callback({
                  element: element,
                  value: element.value,
                  id: element.id
              });
          });
      }
    });
  }

  setupRunSimulationButton() {
    const runButton = document.getElementById('runSimulation');
    if (!runButton) return;

    runButton.addEventListener('click', () => {
      runButton.disabled = true;
      runButton.classList.add('disabled');
      // Assume STATUS_COLORS is global
      this.setStatus('Running...', STATUS_COLORS.INFO);

      // Use setTimeout to run after UI updates
      setTimeout(() => {
        try {
          // run() is loaded globally via <script> tag, assume it exists.
          run();
        } catch (error) {
          console.error("Simulation error:", error); // Log the full error
          // Assume STATUS_COLORS is global
          this.setStatus('Simulation failed: ' + error.message, STATUS_COLORS.ERROR);
        } finally {
          runButton.disabled = false;
          runButton.classList.remove('disabled');
        }
      }, 0);
    });
  }

  setupWizardInvocation() {
    // Wizard should be imported now
    const wizard = Wizard.getInstance(); // Assumes Wizard uses Driver internally
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
        // Ensure we are in an iframe before posting message
        if (window.self !== window.top) {
            window.parent.postMessage({ type: 'navigate', href: link.getAttribute('href') }, '*');
        } else {
            // Handle navigation differently if not in an iframe (optional)
            console.warn("Navigation attempt outside of iframe context.");
        }
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

// Initialize the singleton instance when the module loads
WebUI.getInstance();

// Expose WebUI to the global window object for Simulator.js
if (typeof window !== 'undefined') {
  window.WebUI = WebUI;
}
