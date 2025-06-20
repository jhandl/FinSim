/* This file has to work only on the website */

var WebUI_instance = null;

class WebUI extends AbstractUI {
  
  constructor() {
    try {
      super();
      
      // Initialize simulation state tracking
      this.isSimulationRunning = false;
      this.currentSimMode = 'single'; // Default to single person mode
      
      this.p1Labels = {
        'StartingAge': { neutral: 'Current Age', your: 'Your Current Age' },
        'InitialPension': { neutral: 'Pension Fund', your: 'Your Pension Fund' },
        'RetirementAge': { neutral: 'Retirement Age', your: 'Your Retirement Age' },
        'PensionContributionPercentage': { neutral: 'Pension Contribution', your: 'Your Pension Contribution' },
        'StatePensionWeekly': { neutral: 'State Pension (Weekly)', your: 'Your State Pension (Weekly)' },
        'InitialSavings': { neutral: 'Current Savings', your: 'Current Savings (Joint)' }
      };
      this.p2InputIds = ['P2StartingAge', 'InitialPensionP2', 'P2RetirementAge', 'PensionContributionPercentageP2', 'P2StatePensionWeekly'];
      
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
      this.setupSimModeToggle(); // Setup the new mode toggle
      this.setupParameterTooltips(); // Setup parameter age field tooltips
      this.setupVisualizationControls(); // Setup visualization controls
      this.parameterTooltipTimeout = null; // Reference to parameter tooltip delay timeout
      
      this.eventsTableManager.addEventRow();
      
      // Set initial UI state
      this.setStatus("Ready", STATUS_COLORS.INFO);
      this.fileManager.updateLastSavedState(); // Establish baseline for new scenario
      
      this.updateUIForSimMode(); // Set initial UI state based on mode
      if (this.eventsTableManager) { // Ensure event table UI is also updated on init
        this.eventsTableManager.updateEventRowsVisibilityAndTypes();
      }
      
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

  getTableData(groupId, columnCount = 1, includeHiddenEventTypes = false) {
    return this.tableManager.getTableData(groupId, columnCount, includeHiddenEventTypes);
  }

  setDataRow(rowIndex, data) {
    this.tableManager.setDataRow(rowIndex, data);
  }

  setDataRowBackgroundColor(rowIndex, backgroundColor) {
    this.tableManager.setDataRowBackgroundColor(rowIndex, backgroundColor);
  }

  setChartsRow(rowIndex, data) {
    this.chartManager.updateChartsRow(rowIndex, data);
  }

  getVersion() {
    return localStorage.getItem('simulatorVersion') || '1.27'; // TODO: Has to be a better way to get the starting defaultversion
  }

  setVersion(version) {
    localStorage.setItem('simulatorVersion', version);
    const versionSpan = document.querySelector('.version');
    if (versionSpan) {
      versionSpan.textContent = `Version ${version}`;
    }
  }

  async newDataVersion(latestVersion, dataUpdateMessage) {
    const confirmed = await this.showAlert(`New configuration version available (${latestVersion}):\n\n${dataUpdateMessage}\n\nDo you want to update?`, 'New Version Available', true);
    if (confirmed) {
      this.setVersion(latestVersion);
      this.showToast(`Configuration updated to version ${latestVersion}. Please reload the page to apply changes.`, "Reload Pending", 15);
    } else {
      this.showToast(`Configuration ${latestVersion} not updated.`, "Update Cancelled", 15);
    }

  }

  showAlert(message, title = 'Warning', buttons = false) {
    return this.notificationUtils.showAlert(message, title, buttons);
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
    if (elementId === 'simulation_mode') {
      return this.currentSimMode;
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

      // If P2StartingAge changes, update the state of other P2 fields
      if (element.id === 'P2StartingAge') {
        // this.updatePerson2FieldsState(); // REMOVED by user request
      }

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
        // Unsaved changes check is now handled in loadFromUrl
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

    // Use a more comprehensive event handler that prevents multiple rapid triggers
    this.handleRunSimulation = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (this.isSimulationRunning || runButton.disabled) {
        return; // Don't start another simulation
      }

      if (this._isScenarioDataMissing()) {
        return; // Don't run simulation if data is missing
      }

      // Clear all warnings at the start of each simulation attempt
      this.clearAllWarnings();

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

  _isScenarioDataMissing() {
    const startingAge = this.getValue('StartingAge');
    const retirementAge = this.getValue('RetirementAge');
    const targetAge = this.getValue('TargetAge');

    if (!startingAge || !retirementAge || !targetAge) {
      return true;
    }

    const eventsTable = document.getElementById('Events');
    const rows = eventsTable.getElementsByTagName('tr');
    let validEventFound = false;

    for (let i = 1; i < rows.length; i++) { // Start from 1 to skip header row
      const row = rows[i];
      if (row.style.display === 'none') {
        continue;
      }

      const eventType = row.querySelector('.event-type').value;
      if (eventType !== 'NOP') {
        validEventFound = true;
        break;
      }
    }

    return !validEventFound;
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

  // Method to trigger event validation (used by EventsTableManager)
  validateEvents() {
    // Get the global UIManager instance and trigger event validation
    if (typeof uiManager !== 'undefined' && uiManager) {
      uiManager.readEvents(true); // This will validate and set warnings
    }
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
    const currentYear = new Date().getFullYear();

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
    this.parameterTooltipElement.style.top = `${rect.top - 5}px`;

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

    // Setup direct dropdown functionality
    this.setupDirectDropdown();

    // Set initial preset
    this.onVisualizationPresetChange('default');
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

  setupDirectDropdown() {
    const toggleButton = document.getElementById('visualizationToggle');
    const dropdown = document.getElementById('presetOptions');
    const controlContainer = document.querySelector('.visualization-control');

    if (!toggleButton || !dropdown || !controlContainer) return;

    let activeTooltip = null;
    let tooltipTimeout = null;

    // Function to create tooltip element
    const createTooltip = (text) => {
      const tooltip = document.createElement('div');
      tooltip.className = 'visualization-tooltip';

      // Use marked.js to parse markdown if available, otherwise fall back to plain text
      if (typeof marked !== 'undefined') {
        tooltip.innerHTML = marked.parse(text);
      } else {
        tooltip.textContent = text;
      }

      document.body.appendChild(tooltip);
      return tooltip;
    };

    // Function to position tooltip
    const positionTooltip = (tooltip, targetRect) => {
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        // Mobile uses fixed positioning (handled by CSS)
        return;
      }

      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      // Position above the target
      let left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
      let top = targetRect.top - tooltipRect.height - 10;

      const margin = 10;

      // Adjust for left clipping
      if (left < margin) {
        left = margin;
      }
      // Adjust for right clipping
      else if (left + tooltipRect.width > viewportWidth - margin) {
        left = viewportWidth - tooltipRect.width - margin;
      }

      tooltip.style.position = 'fixed';
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    };

    // Function to show tooltip with delay
    const showTooltipDelayed = (text, targetRect) => {
      // Clear any existing timeout
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
      }

      // Hide any existing tooltip immediately
      hideTooltip();

      if (!text) return;

      // Set timeout for 600ms delay
      tooltipTimeout = setTimeout(() => {
        const tooltip = createTooltip(text);
        activeTooltip = tooltip;

        requestAnimationFrame(() => {
          positionTooltip(tooltip, targetRect);
          tooltip.classList.add('visible');
        });
        tooltipTimeout = null;
      }, 600);
    };

    // Function to hide tooltip
    const hideTooltip = () => {
      // Clear any pending tooltip
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
      }

      if (activeTooltip) {
        activeTooltip.classList.remove('visible');
        if (activeTooltip.parentNode) {
          activeTooltip.parentNode.removeChild(activeTooltip);
        }
        activeTooltip = null;
      }
    };

    // Toggle dropdown when clicking anywhere in the control area
    controlContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display !== 'none';

      if (isVisible) {
        dropdown.style.display = 'none';
        return;
      }

      // Hide any existing tooltip when opening dropdown
      hideTooltip();

      // Show dropdown and position it smartly
      dropdown.style.display = 'block';
      dropdown.style.visibility = 'hidden'; // Hide while measuring

      // Get measurements
      const iconRect = toggleButton.getBoundingClientRect();
      const dropdownRect = dropdown.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Calculate available space
      const spaceBelow = viewportHeight - iconRect.bottom;
      const spaceAbove = iconRect.top;
      const dropdownHeight = dropdownRect.height;

      // Reset position styles
      dropdown.style.position = 'absolute';
      dropdown.style.left = '0';
      dropdown.style.zIndex = '1000';

      // Choose position based on available space
      if (spaceBelow >= dropdownHeight + 10) {
        // Enough space below - position below icon (default)
        dropdown.style.top = '100%';
        dropdown.style.bottom = 'auto';
      } else if (spaceAbove >= dropdownHeight + 10) {
        // Not enough space below but enough above - position above icon
        dropdown.style.top = 'auto';
        dropdown.style.bottom = '100%';
      } else {
        // Not enough space either way - use fixed positioning to fit in viewport
        dropdown.style.position = 'fixed';
        dropdown.style.left = iconRect.left + 'px';
        const maxTop = viewportHeight - dropdownHeight - 10;
        dropdown.style.top = Math.max(10, maxTop) + 'px';
      }

      // Make visible
      dropdown.style.visibility = 'visible';

      // When opening, highlight the currently selected option
      const selectedOption = dropdown.querySelector('.selected');
      if (selectedOption) {
        // Clear any existing highlights
        dropdown.querySelectorAll('.highlighted').forEach(opt => opt.classList.remove('highlighted'));
        // Highlight the selected option
        selectedOption.classList.add('highlighted');
      }
    });

    // Handle option selection
    dropdown.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-value')) {
        const value = e.target.getAttribute('data-value');
        const text = e.target.textContent;

        // Update selected state
        dropdown.querySelectorAll('div[data-value]').forEach(opt => opt.classList.remove('selected'));
        e.target.classList.add('selected');

        // Update the display next to the icon
        const displayElement = document.getElementById('selectedPresetDisplay');
        if (displayElement) {
          displayElement.textContent = text;
        }

        // Hide dropdown
        dropdown.style.display = 'none';

        // Trigger change
        this.onVisualizationPresetChange(value);
      }
    });

    // Handle mouse movement over options (highlight follows mouse)
    dropdown.addEventListener('mouseover', (e) => {
      if (e.target.hasAttribute('data-value')) {
        // Clear all highlights
        dropdown.querySelectorAll('.highlighted').forEach(opt => opt.classList.remove('highlighted'));
        // Highlight the hovered option
        e.target.classList.add('highlighted');

        // Show tooltip on desktop with delay
        if (window.innerWidth > 768) {
          const description = e.target.getAttribute('data-description');
          if (description) {
            const targetRect = e.target.getBoundingClientRect();
            showTooltipDelayed(description, targetRect);
          }
        }
      }
    });

    // Hide tooltip on mouse out
    dropdown.addEventListener('mouseout', () => {
      if (window.innerWidth <= 768) return; // Skip on mobile
      hideTooltip();
    });

    // Show tooltip when hovering over the control container
    controlContainer.addEventListener('mouseover', () => {
      if (window.innerWidth > 768) {
        const selectedOption = dropdown.querySelector('.selected');
        if (selectedOption) {
          const description = selectedOption.getAttribute('data-description');
          if (description) {
            const targetRect = controlContainer.getBoundingClientRect();
            showTooltipDelayed(description, targetRect);
          }
        }
      }
    });

    // Hide tooltip when leaving the control container
    controlContainer.addEventListener('mouseout', () => {
      if (window.innerWidth <= 768) return; // Skip on mobile
      hideTooltip();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !controlContainer.contains(e.target)) {
        dropdown.style.display = 'none';
        // Clear highlights when closing
        dropdown.querySelectorAll('.highlighted').forEach(opt => opt.classList.remove('highlighted'));
        hideTooltip();
      }
    });

    // Hide tooltip on scroll or resize
    document.addEventListener('scroll', hideTooltip, { passive: true });
    window.addEventListener('resize', hideTooltip);
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
