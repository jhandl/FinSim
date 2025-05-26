var wizard_instance = null;

class Wizard {

  constructor() {
    this.driver = window.driver.js.driver;
    this.tour = null;
    this.config = null;
    this.lastFocusedField = null;
    this.lastFocusedWasInput = false;
    this.lastStepIndex = 0;
    this.validSteps = [];
    this.tableState = null;
    this.followFocus = this.followFocus.bind(this);
    this.handleKeys = this.handleKeys.bind(this);
    this.handleClick = this.handleClick.bind(this);
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
      /\[([^\]]+)\]\(([^\)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
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
      
      this.config = this.processVariablesInObject(jsyaml.load(yamlText));
      
      // Process markdown links in descriptions
      if (this.config.steps) {
        this.config.steps = this.config.steps.map(step => {
          if (step.popover && step.popover.description) {
            step.popover.description = this.processMarkdownLinks(step.popover.description);
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

  filterValidSteps() {
    if (!this.config || !this.config.steps) return [];

    this.tableState = this.getEventTableState();
    const configCopy = JSON.parse(JSON.stringify(this.config));
    
    return configCopy.steps.filter(step => {
      // Steps without elements are always valid
      if (!step.element) return true;

      if (!step.element.includes('Event')) {
        return document.querySelector(step.element) !== null;
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
    }

    this.validSteps = this.filterValidSteps();

    let startingStepIndex = fromStep !== undefined ? fromStep : (this.lastFocusedWasInput ? (this.getLastFocusedFieldIndex() || this.lastStepIndex) : this.lastStepIndex);
    if (startingStepIndex > 1 && startingStepIndex < this.validSteps.length) {
      const element = document.querySelector(this.validSteps[startingStepIndex].element);
      if (element) {
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
      onNextClick: (element) => {
        const nextIndex = this.tour.getActiveIndex() + 1;
        if (nextIndex < this.validSteps.length) {
          const nextElement = document.querySelector(this.validSteps[nextIndex].element);
          if (nextElement) {
            nextElement.focus();
          }
        }
        this.tour.moveNext();
      },
      onPrevClick: (element) => {
        const prevIndex = this.tour.getActiveIndex() - 1;
        if (prevIndex >= 0) {
          const prevElement = document.querySelector(this.validSteps[prevIndex].element);
          if (prevElement) {
            prevElement.focus();
          }
        }
        this.tour.movePrevious();
      },
      onDestroyStarted: () => this.finishTour(),
      onHighlighted: (element) => {
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
    
    this.tour.drive(startingStepIndex);
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
    document.removeEventListener('keydown', this.handleKeys);
    this.lastStepIndex = this.tour.getActiveIndex()
    this.tour.destroy();
  }

  handleKeys(event) {
    if (event.key === 'Escape') {
      this.finishTour();
      return;
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
          
          direction === 'next' ? this.tour.moveNext() : this.tour.movePrevious();
          const currentIndex = this.tour.getActiveIndex();
          const currentElement = document.querySelector(this.validSteps[currentIndex].element);
          if (currentElement) {
            currentElement.focus();
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
          
          if (targetField) {
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
          }
        }
      }
    }
    return direction === 'up' ? 'previous' : 'next';
  }

}
