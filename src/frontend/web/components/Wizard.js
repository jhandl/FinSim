var wizard_instance = null;

class Wizard {

  constructor() {
    this.driver = window.driver.js.driver;
    this.tour = null;
    this.config = null;
    this.originalConfig = null; // Store original config with placeholders intact
    this.lastFocusedField = null;
    this.lastFocusedWasInput = false;
    this.lastStepIndex = 0;
    this.validSteps = [];
    this.tableState = null;
    this.followFocus = this.followFocus.bind(this);
    this.handleKeys = this.handleKeys.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.isMobile = this.detectMobile();
    this.originalInputStates = new Map(); // Store original readonly states
    this.wizardActive = false;
    this.preventFocus = this.preventFocus.bind(this);
    this.preventTouch = this.preventTouch.bind(this);
    document.addEventListener('focusin', this.followFocus);
    document.addEventListener('click', this.handleClick);
  }

  // Singleton
  static getInstance() {
    if (!wizard_instance) {
      wizard_instance = new Wizard();
    }
    return wizard_instance;
  }

  
  processMarkdownLinks(text) {
    if (!text) return text;
    return text.replace(
      /\[([^\]]+)\]\(([^\)]+)\)(?:\{[^\}]*\})?/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  }

  // Replace {{age_or_year}} placeholders with current mode
  replaceAgeYearPlaceholders(text) {
    if (!text) return text;
    
    // Get current mode from EventsTableManager if available
    let currentMode = 'age'; // default fallback
    try {
      const webUI = WebUI.getInstance();
      if (webUI && webUI.eventsTableManager && webUI.eventsTableManager.ageYearMode) {
        currentMode = webUI.eventsTableManager.ageYearMode;
      }
    } catch (error) {
      // Silently fall back to 'age' if EventsTableManager not available
    }
    
    return text.replace(/\{\{age_or_year\}\}/g, currentMode);
  }



  // Helper function to format numbers based on type
  formatValue(value, format) {
    if (format === 'currency') {
      return new Intl.NumberFormat('en-IE', { 
        style: 'currency', 
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    }
    if (format === 'percentage') {
      return new Intl.NumberFormat('en-IE', { 
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    }
    return value;
  }

  // Process variables in text using config values
  processVariables(text) {
    const config = Config.getInstance(WebUI.getInstance()); // the Wizard only runs in the website so it's safe to assume that the UI is the WebUI
    if (!config || !text || typeof text !== 'string') return text;
    return text.replace(/\${([^}]+)}/g, (match, variable) => {
      let [varToken, format] = variable.split(',').map(s => s.trim());
      if (varToken.includes('.')) {
        const tokens = varToken.split('.');
        let value = config;
        for (let i = 0; i < tokens.length - 1; i++) {
          if (value && typeof value === 'object' && tokens[i] in value) {
            value = value[tokens[i]];
          } else {
            return match;
          }
        }
        const lastToken = tokens[tokens.length - 1];
        if (value && typeof value === 'object') {
          if (lastToken in value) {
            value = value[lastToken];
          } else if (lastToken === 'min' || lastToken === 'max') {
            let keys = Object.keys(value).filter(k => !isNaN(parseFloat(k)));
            if (keys.length === 0) {
              keys = Object.keys(value);
            }
            if (keys.length > 0) {
              keys.sort((a, b) => parseFloat(a) - parseFloat(b));
              const chosenKey = lastToken === 'min' ? keys[0] : keys[keys.length - 1];
              value = value[chosenKey];
            } else {
              return match;
            }
          } else {
            return match;
          }
        } else {
          return match;
        }
        return this.formatValue(value, format);
      }
      if (config.hasOwnProperty(varToken)) {
        const value = config[varToken];
        return this.formatValue(value, format);
      }
      console.warn(`Variable ${varToken} not found in config`);
      return match; // Keep original if variable not found
    });
  }

  // Recursively process variables in an object
  processVariablesInObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(item => this.processVariablesInObject(item));
    }
    const processed = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        processed[key] = this.processVariables(value);
      } else if (typeof value === 'object') {
        processed[key] = this.processVariablesInObject(value);
      } else {
        processed[key] = value;
      }
    }
    return processed;
  }

  async loadConfig() {
    try {
      const timestamp = new Date().getTime();
      const response = await fetch(`/src/frontend/web/assets/help.yml?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const yamlText = await response.text();
      
      // Store original config with variables processed but placeholders intact
      this.originalConfig = this.processVariablesInObject(jsyaml.load(yamlText));
      
      // Process markdown links but keep age/year placeholders for later processing
      if (this.originalConfig.steps) {
        this.originalConfig.steps = this.originalConfig.steps.map(step => {
          if (step.popover && step.popover.description) {
            step.popover.description = this.processMarkdownLinks(step.popover.description);
          }
          return step;
        });
      }
      
      // Create working config with age/year placeholders processed
      this.config = JSON.parse(JSON.stringify(this.originalConfig));
      if (this.config.steps) {
        this.config.steps = this.config.steps.map(step => {
          if (step.popover && step.popover.description) {
            step.popover.description = this.replaceAgeYearPlaceholders(step.popover.description);
          }
          return step;
        });
      }
    } catch (error) {
      console.error('Failed to load wizard configuration:', error);
    }
  }

  getEventTableState() {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return { isEmpty: true };
    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) return { isEmpty: true };
    const focusedRow = this.lastFocusedField ? Array.from(rows).find(row => row.contains(this.lastFocusedField)) : null;
    const row = focusedRow || rows[0];
    const rowId = row.dataset.rowId;

    const typeSelect = row.querySelector(`select#EventType_${rowId}`);
    const nameInput = row.querySelector(`input#EventName_${rowId}`);
    const amountInput = row.querySelector(`input#EventAmount_${rowId}`);
    const fromAgeInput = row.querySelector(`input#EventFromAge_${rowId}`);
    const toAgeInput = row.querySelector(`input#EventToAge_${rowId}`);
    const rateInput = row.querySelector(`input#EventRate_${rowId}`);
    const matchInput = row.querySelector(`input#EventMatch_${rowId}`);

    const hasNonDefaultValues = 
        (typeSelect && typeSelect.value && typeSelect.value !== "NOP") ||
        (nameInput && nameInput.value.trim() !== '') ||
        (amountInput && amountInput.value.trim() !== '') ||
        (fromAgeInput && fromAgeInput.value.trim() !== '') ||
        (toAgeInput && toAgeInput.value.trim() !== '') ||
        (rateInput && rateInput.value.trim() !== '') ||
        (matchInput && matchInput.value.trim() !== '');

    const state = {
        isEmpty: false,
        rows: rows.length,
        rowIsEmpty: !hasNonDefaultValues,
        eventType: typeSelect ? typeSelect.value : null,
        focusedRow,
        rowId
    };
    
    return state;
  }

  // Helper function to check if an element is visible
  isElementVisible(element) {
    if (!element) return false;
    
    // Check if element is hidden via display: none or visibility: hidden
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    
    // Check if any parent wrapper is hidden (common case for P2 fields)
    let parent = element.closest('.input-wrapper');
    if (parent) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
        return false;
      }
    }
    
    return true;
  }

  filterValidSteps() {
    if (!this.config || !this.config.steps) return [];

    this.tableState = this.getEventTableState();
    const configCopy = JSON.parse(JSON.stringify(this.config));
    
    return configCopy.steps.filter(step => {
      // Steps without elements are always valid
      if (!step.element) return true;

      if (!step.element.includes('Event')) {
        const element = document.querySelector(step.element);
        return element !== null && this.isElementVisible(element);
      } else {
        step.element = step.element.replace(/Event([A-Za-z]+)/, `Event$1_${this.tableState.rowId}`);
        if (this.tableState.isEmpty) {
          return false;
        } else {
          if (this.tableState.rowIsEmpty) {
            return !step.eventTypes && !step.noEventTypes;
          } else {
            if (step.eventTypes) {
              // Only show this step if it matches the current event type
              return step.eventTypes.includes(this.tableState.eventType);
            }
            if (step.noEventTypes) {
              // Only show this step if it doesn't match the current event type
              return !step.noEventTypes.includes(this.tableState.eventType);
            }
          }
        }
      }
    });
  }

  async start(fromStep = undefined) {
    if (!this.config) {
      await this.loadConfig();
    } else {
      // Refresh working config from original with current age/year mode
      this.config = JSON.parse(JSON.stringify(this.originalConfig));
      if (this.config.steps) {
        this.config.steps = this.config.steps.map(step => {
          if (step.popover && step.popover.description) {
            step.popover.description = this.replaceAgeYearPlaceholders(step.popover.description);
          }
          return step;
        });
      }
    }

    this.validSteps = this.filterValidSteps();

    let startingStepIndex = fromStep !== undefined ? fromStep : (this.lastFocusedWasInput ? (this.getLastFocusedFieldIndex() || this.lastStepIndex) : this.lastStepIndex);
    if (startingStepIndex > 1 && startingStepIndex < this.validSteps.length && !this.isMobile) {
      const element = document.querySelector(this.validSteps[startingStepIndex].element);
      if (element) {
        // Only focus on desktop to avoid keyboard issues on mobile
        element.focus();
      }
    }

    this.tour = this.driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      showProgress: false,
      overlayOpacity: 0.5,
      allowKeyboardControl: false,
      steps: this.validSteps,
      onNextClick: async (element) => {
        const nextIndex = this.tour.getActiveIndex() + 1;
        if (nextIndex < this.validSteps.length) {
          const nextElement = document.querySelector(this.validSteps[nextIndex].element);
          // Handle burger menu BEFORE moving to next step
          await this.handleBurgerMenuBeforeStep(nextElement, nextIndex);
          if (nextElement && !this.isMobile) {
            // Only focus on desktop to avoid keyboard issues on mobile
            nextElement.focus();
          }
        }
        this.tour.moveNext();
      },
      onPrevClick: async (element) => {
        const prevIndex = this.tour.getActiveIndex() - 1;
        if (prevIndex >= 0) {
          const prevElement = document.querySelector(this.validSteps[prevIndex].element);
          // Handle burger menu BEFORE moving to previous step
          await this.handleBurgerMenuBeforeStep(prevElement, prevIndex);
          if (prevElement && !this.isMobile) {
            // Only focus on desktop to avoid keyboard issues on mobile
            prevElement.focus();
          }
        }
        this.tour.movePrevious();
      },
      onDestroyStarted: () => this.finishTour(),
      onHighlighted: (element) => {
        // Clean up any residual inline border styles from the previous element
        this.cleanupInlineStyles();

        // Simple burger menu handling - just open it if element needs it
        this.handleBurgerMenuSimple(element);

        const popover = document.querySelector('.driver-popover');
        if (popover) {
          // Existing logic for the #load-example-scenario button
          const loadExampleBtn = popover.querySelector('#load-example-scenario');
          if (loadExampleBtn && !loadExampleBtn.getAttribute('data-click-attached')) {
            loadExampleBtn.setAttribute('data-click-attached', 'true');
            loadExampleBtn.addEventListener('click', () => {
              WebUI.getInstance().fileManager.loadFromUrl("/src/frontend/web/assets/demo.csv", "Example");
              this.finishTour();
            });
          }

          // Focus management for step 0 (welcome step)
          if (this.tour && typeof this.tour.getActiveIndex === 'function' && this.tour.getActiveIndex() === 0) {
            // Make sure popover is focusable
            if (!popover.hasAttribute('tabindex')) {
              popover.setAttribute('tabindex', '-1');
            }
            
            // Try to find the next button
            const nextButton = popover.querySelector('.driver-popover-next-btn') || 
                              popover.querySelector('[data-driver="next"]') ||
                              popover.querySelector('.driver-btn.driver-next');
            
            // Check if we have a focused element that can handle keyboard events
            const currentFocus = document.activeElement;
            
            // If current focus is body (auto startup) or not a good focus target, establish proper focus
            if (currentFocus === document.body || currentFocus === document.documentElement) {
              // First try the next button
              if (nextButton) {
                nextButton.focus({ preventScroll: true });
              } else {
                // Make body focusable and focus it
                document.body.setAttribute('tabindex', '-1');
                document.body.focus({ preventScroll: true });
              }
            }
          }
        }
      }
    });

    document.addEventListener('keydown', this.handleKeys);
    
    // Disable mobile keyboard to prevent it from covering the wizard popover
    this.disableMobileKeyboard();
    
    // Add visual indicator that wizard is active and set up focus prevention
    this.wizardActive = true;
    if (this.isMobile) {
      document.body.setAttribute('data-wizard-active', 'true');
      // Add multiple event prevention layers
      document.addEventListener('focusin', this.preventFocus, true);
      document.addEventListener('touchstart', this.preventTouch, true);
      document.addEventListener('click', this.preventTouch, true);
    }
    
    
    
    // Handle burger menu for initial step before starting
    if (startingStepIndex < this.validSteps.length) {
      const initialElement = document.querySelector(this.validSteps[startingStepIndex].element);
      this.handleBurgerMenuBeforeStep(initialElement, startingStepIndex).then(() => {
        this.tour.drive(startingStepIndex);
      });
    } else {
      this.tour.drive(startingStepIndex);
    }
  }

  getLastFocusedFieldIndex() {
    const index = this.validSteps.findIndex(step => {
      let elementSelector = step.element;
      const stepElement = document.querySelector(elementSelector);
      return stepElement === this.lastFocusedField;
    });
    return index >= 0 ? index : null;
  }

  followFocus(event) {
    if (!event.target.matches('#startWizard')) {
      if (event.target.matches('input, textarea, select')) {
        this.lastFocusedField = event.target;
        this.lastFocusedWasInput = true;
      } else {
        // Focus moved to a non-input element (button, link, etc.)
        this.lastFocusedField = null;
        this.lastFocusedWasInput = false;
      }
    }
  }

  handleClick(event) {
    // Clear field tracking when clicking on non-input elements
    // This handles cases where clicking on non-focusable elements doesn't trigger focusin
    if (!event.target.matches('input, textarea, select')) {
      this.lastFocusedField = null;
      this.lastFocusedWasInput = false;
    }
  }

  finishTour() {
    this.cleanupHighlighting();
    if (this.tour) {
      this.tour.destroy();
      this.tour = null;
    }
    
    // Close burger menu if we opened it for the wizard
    const burgerMenu = window.mobileBurgerMenuInstance;
    if (this.wizardOpenedBurgerMenu && burgerMenu && burgerMenu.isOpen) {
      burgerMenu.closeMenu();
      this.wizardOpenedBurgerMenu = false;
    }
    
    document.removeEventListener('keydown', this.handleKeys);
    
    this.wizardActive = false;
    if (this.isMobile) {
      document.body.removeAttribute('data-wizard-active');
      document.removeEventListener('focusin', this.preventFocus, true);
      document.removeEventListener('touchstart', this.preventTouch, true);
      document.removeEventListener('click', this.preventTouch, true);
    }
    
    this.enableMobileKeyboard();
    
    // Only update lastStepIndex if tour was completed normally
    if (this.tour && typeof this.tour.getActiveIndex === 'function') {
      this.lastStepIndex = this.tour.getActiveIndex();
    }
  }

  cleanupInlineStyles() {
    // Fix specific elements that Driver.js adds inline border styles to
    const problematicElements = [
      '#simModeSingle', '#simModeCouple',
      '#ageYearModeAge', '#ageYearModeYear',
      '#exportDataCSV', '#visualizationToggle'
    ];

    problematicElements.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        // Remove any inline border styles that Driver.js might have added
        element.style.removeProperty('border');
        element.style.removeProperty('border-top');
        element.style.removeProperty('border-left');
        element.style.removeProperty('border-right');
        element.style.removeProperty('border-bottom');
        element.style.removeProperty('outline');
        element.style.removeProperty('box-shadow');
      }
    });
  }

  cleanupHighlighting() {
    // Gentle cleanup - only remove leftover Driver.js elements and classes

    // Remove any leftover driver overlay elements
    const overlayElements = document.querySelectorAll('#driver-highlighted-element-stage, .driver-overlay, .driver-popover');
    overlayElements.forEach(element => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });

    // Remove Driver.js classes that might be stuck on elements
    const driverClasses = ['driver-active-element', 'driver-highlighted-element', 'driver-stage-element'];
    driverClasses.forEach(className => {
      const elements = document.querySelectorAll(`.${className}`);
      elements.forEach(element => {
        element.classList.remove(className);
      });
    });

    // Also clean up inline styles
    this.cleanupInlineStyles();
  }

  handleKeys(event) {
    if (event.key === 'Escape') {
      this.finishTour();
      return;
    }

    // Handle Enter key on the final tour complete popover
    if (event.key === 'Enter') {
      const popover = document.querySelector('.driver-popover');
      if (popover && popover.classList.contains('tour-complete-popover')) {
        event.preventDefault();
        this.finishTour();
        return;
      }
    }

    const moveActions = {
      'Tab': (event) => event.shiftKey ? 'previous' : 'next',
      'ArrowRight': () => 'next',
      'ArrowLeft': () => 'previous',
      'ArrowUp': () => this.handleVerticalNavigation('up'),
      'ArrowDown': () => this.handleVerticalNavigation('down')
    };

    const direction = moveActions[event.key]?.(event);
    
    if (direction !== undefined) {
      event.preventDefault();
      if (direction === 'next' || direction === 'previous') {
        const canMove = direction === 'next' 
          ? this.tour.hasNextStep() 
          : this.tour.hasPreviousStep();
        
        if (canMove) {
          // Remove focus from the current field if it's an input or select
          if (document.activeElement && document.activeElement.matches('input, select')) {
            document.activeElement.blur();
            this.lastFocusedField = null;
          }
          
          // Handle burger menu before navigation
          const targetIndex = direction === 'next' 
            ? this.tour.getActiveIndex() + 1 
            : this.tour.getActiveIndex() - 1;
          
          if (targetIndex >= 0 && targetIndex < this.validSteps.length) {
            const targetElement = document.querySelector(this.validSteps[targetIndex].element);
            this.handleBurgerMenuBeforeStep(targetElement, targetIndex).then(() => {
              direction === 'next' ? this.tour.moveNext() : this.tour.movePrevious();
              const currentIndex = this.tour.getActiveIndex();
              const currentElement = document.querySelector(this.validSteps[currentIndex].element);
              if (currentElement && !this.isMobile) {
                // Only focus on desktop to avoid keyboard issues on mobile
                currentElement.focus();
              }
            });
          } else {
            direction === 'next' ? this.tour.moveNext() : this.tour.movePrevious();
          }
        }
      }
    }
  }

  handleVerticalNavigation(direction) {
    if (this.lastFocusedField && this.lastFocusedField.matches('input, select')) {
      const currentState = this.getEventTableState();
      if (!currentState.isEmpty && currentState.focusedRow) {
        const tbody = document.querySelector('#Events tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const currentRowIndex = rows.indexOf(currentState.focusedRow);
        
        let targetRow;
        if (direction === 'up') {
          if (currentRowIndex === 0) {
            const tableStep = this.validSteps.findIndex(step => step.element === '.events-section');
            if (tableStep >= 0) {
              document.activeElement.blur();
              this.lastFocusedField = null;
              this.start(tableStep);
              return null;
            }
          } else {
            targetRow = rows[currentRowIndex - 1];
          }
        } else if (direction === 'down') {
          if (currentRowIndex === rows.length - 1) {
            // Find the first step after all table-related steps
            const currentStep = this.tour.getActiveIndex();
            const nextNonTableStep = this.validSteps.findIndex((step, index) => {
              return index > currentStep && (!step.element || !step.element.includes('Event'));
            });
            if (nextNonTableStep >= 0) {
              document.activeElement.blur();
              this.lastFocusedField = null;
              this.start(nextNonTableStep);
              return null;
            }
          } else {
            targetRow = rows[currentRowIndex + 1];
          }
        }

        if (targetRow) {
          const targetRowId = targetRow.dataset.rowId;
          const currentField = this.lastFocusedField;
          const currentFieldId = currentField.id;
          const fieldType = currentFieldId.split('_')[0];
          const targetField = targetRow.querySelector(`#${fieldType}_${targetRowId}`);
          
          if (targetField && !this.isMobile) {
            // Only focus on desktop to avoid keyboard issues on mobile
            targetField.focus();
            // If the field is hidden, focus will not succeed, so focus the Event Type field instead
            if (document.activeElement !== targetField) {
              const eventTypeField = targetRow.querySelector(`#EventType_${targetRowId}`);
              if (eventTypeField) {
                eventTypeField.focus();
                this.start(this.tour.getActiveIndex());
                eventTypeField.blur();
                return null;
              }
            } else {
              this.start(this.tour.getActiveIndex());
              return null;
            }
          } else if (targetField && this.isMobile) {
            // On mobile, restart wizard at current step without focusing
            this.start(this.tour.getActiveIndex());
            return null;
          }
        }
      }
    }
    return direction === 'up' ? 'previous' : 'next';
  }

  // Detect if we're on a mobile device
  detectMobile() {
    const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasTouchSupport = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isSmallScreen = window.innerWidth <= 768;
    const isMobileViewport = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    
    return isMobileUserAgent || (hasTouchSupport && (isSmallScreen || isMobileViewport));
  }

  // Prevent focus on input elements during wizard on mobile
  preventFocus(event) {
    if (!this.wizardActive || !this.isMobile) return;
    
    const target = event.target;
    if (target && (target.matches('input[type="text"], input[type="number"], textarea, select'))) {
      event.preventDefault();
      event.stopPropagation();
      target.blur();
      return false;
    }
  }

  // Prevent touch/click on input elements during wizard on mobile
  preventTouch(event) {
    if (!this.wizardActive || !this.isMobile) return;
    
    const target = event.target;
    if (target && (target.matches('input[type="text"], input[type="number"], textarea, select'))) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  }

  // Prevent mobile keyboard from showing during wizard
  disableMobileKeyboard() {
    if (!this.isMobile) return;
    
    const inputs = document.querySelectorAll('input[type="text"], input[type="number"], textarea, select');
    
    inputs.forEach(input => {
      // Store original states
      this.originalInputStates.set(input, {
        readonly: input.readOnly,
        inputMode: input.inputMode || input.getAttribute('inputmode') || '',
        tabIndex: input.tabIndex,
        pointerEvents: input.style.pointerEvents,
        userSelect: input.style.userSelect
      });
      
      if (input.tagName.toLowerCase() !== 'select') {
        // Multiple approaches to prevent keyboard
        input.setAttribute('inputmode', 'none');
        input.readOnly = true;
        input.tabIndex = -1;
        input.style.pointerEvents = 'none';
        input.style.userSelect = 'none';
        input.setAttribute('autocomplete', 'off');
      } else {
        // For select elements
        input.style.pointerEvents = 'none';
        input.tabIndex = -1;
        input.style.userSelect = 'none';
      }
    });
  }

  // Restore inputs to their original state
  enableMobileKeyboard() {
    if (!this.isMobile || this.originalInputStates.size === 0) return;
    
    const inputs = document.querySelectorAll('input[type="text"], input[type="number"], textarea, select');
    inputs.forEach(input => {
      const originalState = this.originalInputStates.get(input);
      if (originalState) {
        if (input.tagName.toLowerCase() !== 'select') {
          // Restore original inputMode
          if (originalState.inputMode) {
            input.setAttribute('inputmode', originalState.inputMode);
          } else {
            input.removeAttribute('inputmode');
          }
          // Restore all original states
          input.readOnly = originalState.readonly;
          input.tabIndex = originalState.tabIndex;
          input.style.pointerEvents = originalState.pointerEvents || '';
          input.style.userSelect = originalState.userSelect || '';
        } else {
          // Restore select element
          input.style.pointerEvents = originalState.pointerEvents || '';
          input.tabIndex = originalState.tabIndex;
          input.style.userSelect = originalState.userSelect || '';
        }
      }
    });
    
    this.originalInputStates.clear();
  }

  // Handle burger menu BEFORE highlighting a step
  async handleBurgerMenuBeforeStep(element, stepIndex = null) {
    const burgerMenu = window.mobileBurgerMenuInstance;
    if (!burgerMenu) return;
    
    // Check if burger menu toggle is visible (indicates mobile mode)
    const burgerToggle = document.getElementById('mobileMenuToggle');
    if (!burgerToggle) return;
    
    const burgerToggleStyle = window.getComputedStyle(burgerToggle);
    const burgerMenuAvailable = burgerToggleStyle.display !== 'none';
    
    if (!burgerMenuAvailable) {
      // Close burger menu if we opened it and we're back to desktop
      if (this.wizardOpenedBurgerMenu && burgerMenu.isOpen) {
        burgerMenu.closeMenu();
        this.wizardOpenedBurgerMenu = false;
      }
      return;
    }
    
    // Get the step configuration to determine which element we should target
    const step = stepIndex !== null ? this.validSteps[stepIndex] : null;
    if (!step) {
      // Close burger menu if we opened it and we're moving to an invalid step
      if (this.wizardOpenedBurgerMenu && burgerMenu.isOpen) {
        burgerMenu.closeMenu();
        this.wizardOpenedBurgerMenu = false;
      }
      return;
    }
    
    // Extract the base element ID from the step configuration
    const stepElementSelector = step.element;
    if (!stepElementSelector || typeof stepElementSelector !== 'string') {
      // Close burger menu if we opened it and step has invalid element selector
      if (this.wizardOpenedBurgerMenu && burgerMenu.isOpen) {
        burgerMenu.closeMenu();
        this.wizardOpenedBurgerMenu = false;
      }
      return;
    }
    
    const baseElementId = stepElementSelector.replace('#', '').replace('Mobile', '').replace('Header', '');
    
    // Define burger menu buttons by their base IDs
    const burgerMenuButtons = ['saveSimulation', 'loadSimulation', 'loadDemoScenario', 'startWizard'];
    const isBurgerMenuButton = burgerMenuButtons.includes(baseElementId);
    
    if (!isBurgerMenuButton) {
      // Close burger menu if we opened it and we're moving to a non-burger-menu element
      if (this.wizardOpenedBurgerMenu && burgerMenu.isOpen) {
        burgerMenu.closeMenu();
        this.wizardOpenedBurgerMenu = false;
      }
      return;
    }
    
    // Determine the correct desktop element ID
    let desktopElementId = baseElementId;
    if (baseElementId === 'loadDemoScenario') {
      desktopElementId = 'loadDemoScenarioHeader';
    }
    
    // Check if the desktop element is currently visible
    const desktopElement = document.getElementById(desktopElementId);
    if (!desktopElement) return;
    
    const elementStyle = window.getComputedStyle(desktopElement);
    const elementVisible = elementStyle.display !== 'none' && 
                          elementStyle.visibility !== 'hidden' && 
                          elementStyle.opacity !== '0' &&
                          desktopElement.offsetWidth > 0 && 
                          desktopElement.offsetHeight > 0;
    
    if (!elementVisible) {
      // Element is hidden, so it's in the burger menu - open it and target mobile version
      if (!burgerMenu.isOpen) {
        burgerMenu.openMenu();
        this.wizardOpenedBurgerMenu = true;
        // Wait for animation to complete before proceeding
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      
      // Switch to the mobile element in the step configuration
      let mobileElementId = baseElementId + 'Mobile';
      if (baseElementId === 'loadDemoScenario') {
        mobileElementId = 'loadDemoScenarioMobile';
      }
      
      const mobileElement = document.getElementById(mobileElementId);
      if (mobileElement) {
        this.validSteps[stepIndex].element = `#${mobileElementId}`;
      }
    } else {
      // Element is visible in header, use desktop version and close burger menu if we opened it
      if (this.wizardOpenedBurgerMenu && burgerMenu.isOpen) {
        burgerMenu.closeMenu();
        this.wizardOpenedBurgerMenu = false;
      }
      // Ensure we're using the desktop element
      this.validSteps[stepIndex].element = `#${desktopElementId}`;
    }
  }

  // Simple burger menu handler for onHighlighted (non-async)
  handleBurgerMenuSimple(element) {
    // This is now just for cleanup or fallback cases
    if (!element || !element.id) return;
    
    const burgerMenuButtons = ['saveSimulation', 'loadSimulation', 'loadDemoScenarioHeader', 'startWizard'];
    const isBurgerMenuButton = burgerMenuButtons.includes(element.id);
    
    if (!isBurgerMenuButton) return;
    
    const burgerMenu = window.mobileBurgerMenuInstance;
    if (!burgerMenu) return;
    
    // Check if burger menu toggle is visible (indicates mobile mode)
    const burgerToggle = document.getElementById('mobileMenuToggle');
    if (!burgerToggle) return;
    
    const burgerToggleStyle = window.getComputedStyle(burgerToggle);
    const burgerMenuAvailable = burgerToggleStyle.display !== 'none';
    
    if (!burgerMenuAvailable) {
      // Close burger menu if we opened it and we're back to desktop
      if (this.wizardOpenedBurgerMenu && burgerMenu.isOpen) {
        burgerMenu.closeMenu();
        this.wizardOpenedBurgerMenu = false;
      }
    }
  }



}
