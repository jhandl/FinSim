/* Event Wizard Management functionality */

class EventWizardManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.wizardData = null;
    this.currentWizard = null;
    this.currentStep = 0;
    this.wizardState = {};
    this.isActive = false;
    this.renderer = new EventWizardRenderer(webUI);
    // Store cleanup for viewport resize listener
    this._viewportCleanup = null;
    // Track if keyboard is active to keep modal pinned across steps
    this._keyboardActive = false;
    // Detect mobile once using shared utility
    this.isMobile = (window.DeviceUtils && window.DeviceUtils.isMobile) ? window.DeviceUtils.isMobile() : true;
    // BEGIN ADD: timestamp of last successful nextStep call to suppress accidental double-advances
    this._lastNextStep = 0;
    // END ADD
    this._pendingNextTimeouts = []; // Store any auto-advance timeouts to cancel on navigation
    this.loadWizardConfiguration();
  }

  // detectMobile helper removed – use DeviceUtils instead

  async loadWizardConfiguration() {
    try {
      const response = await fetch('/src/frontend/web/assets/events-wizard.yml');
      const yamlText = await response.text();
      
      // Parse YAML (using existing YAML parser if available, or simple parsing)
      if (window.jsyaml) {
        this.wizardData = window.jsyaml.load(yamlText);
      } else {
        console.warn('YAML parser not available, wizard configuration not loaded');
        return;
      }
      
    } catch (error) {
      console.error('Failed to load wizard configuration:', error);
    }
  }

  /**
   * Start a wizard for a specific event type
   * @param {string} eventType - The event type code (e.g., 'SI', 'E', 'R') or wizard ID
   * @param {Object} prePopulatedData - Pre-populated data for the wizard
   * @param {Function} onComplete - Callback function when wizard completes
   */
  startWizard(eventType, prePopulatedData = {}, onComplete = null) {
    if (!this.wizardData || !this.wizardData.EventWizards) {
      console.error('Wizard configuration not loaded');
      return false;
    }

    // Find the wizard configuration by ID or event type
    let wizardConfig = this.wizardData.EventWizards.find(w => w.id === eventType);

    // If not found by ID, try by event type
    if (!wizardConfig) {
      wizardConfig = this.wizardData.EventWizards.find(w => w.eventType === eventType);
    }

    if (!wizardConfig) {
      console.error(`No wizard configuration found for: ${eventType}`);
      return false;
    }

    // Ensure any previous wizard is completely closed and reset
    if (this.isActive) {
      this.closeWizard();
    } else {
      // Only reset if not already active to avoid interfering with current wizard
      this.resetWizardState();
    }

    // Handle different parameter formats
    let options = {};
    let initialData = {};

    // If prePopulatedData is a function, it's the onComplete callback (old format)
    if (typeof prePopulatedData === 'function') {
      onComplete = prePopulatedData;
    }
    // If it's an object with onComplete property (old format)
    else if (prePopulatedData && typeof prePopulatedData === 'object') {
      if (prePopulatedData.onComplete) {
        onComplete = prePopulatedData.onComplete;
        // Extract other options
        const { onComplete: _, ...otherOptions } = prePopulatedData;
        options = otherOptions;
      } else {
        // It's pre-populated data in the new format
        initialData = prePopulatedData;
      }
    }

    // Initialize wizard state
    this.currentWizard = wizardConfig;
    this.currentStep = 0;
    this.wizardState = {
      eventType: wizardConfig.eventType,
      data: initialData, // Use pre-populated data if provided
      onComplete: onComplete,
      ...options
    };
    this.isActive = true;

    // Show the first step
    this.showCurrentStep();
    return true;
  }

  /**
   * Show the current wizard step
   */
  showCurrentStep() {
    if (!this.currentWizard || !this.isActive) {
      return;
    }

    if (!this.currentWizard.steps) {
      console.error('currentWizard has no steps property:', this.currentWizard);
      return;
    }

    const step = this.currentWizard.steps[this.currentStep];
    if (!step) {
      console.error('Invalid step index:', this.currentStep, 'Available steps:', this.currentWizard.steps.length);
      return;
    }

    // Check step condition if present
    if (step.condition && !this.evaluateCondition(step.condition)) {
      // Skip this step
      this.nextStep();
      return;
    }
    // Create and show the wizard modal
    this.createWizardModal(step);
  }

  /**
   * Create and display the wizard modal for a step
   * @param {Object} step - The step configuration
   */
  createWizardModal(step) {
    // Remove any existing wizard modal DOM elements only
    const existingOverlay = document.getElementById('eventWizardOverlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'wizard-overlay';
    overlay.id = 'eventWizardOverlay';

    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'wizard-modal event-wizard-modal';

    // Add category-based class for stronger shading on subsequent pages
    if (this.currentWizard && this.currentWizard.category) {
      const catClass = `wizard-category-${this.currentWizard.category}`;
      modal.classList.add('wizard-modal-category', catClass);
    }
    modal.id = 'eventWizardModal';

    // Create modal content
    const content = this.createStepContent(step);
    modal.appendChild(content);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // --- Ensure modal height fits within visible viewport (keyboard safe) ---
    if (this._viewportCleanup) {
      // Remove any previous listener first
      this._viewportCleanup();
      this._viewportCleanup = null;
    }
    this._viewportCleanup = this.setupViewportResizeListener(modal, overlay);

    // Helper to determine if an element triggers the soft keyboard
    const isTextualInput = (el) => {
      if (!el) return false;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName === 'INPUT') {
        const badTypes = ['radio', 'checkbox', 'hidden', 'range', 'button', 'submit', 'reset', 'file', 'color', 'date', 'datetime-local', 'month', 'time', 'week'];
        const type = el.getAttribute('type')?.toLowerCase() || 'text';
        return !badTypes.includes(type);
      }
      return false;
    };

    // Toggle keyboard-active class on overlay when inputs gain / lose focus
    const keyboardActivate = (e) => {
      if (!this.isMobile) return; // desktop: ignore
      if (!isTextualInput(e.target)) return;
      this._keyboardActive = true;
      overlay.classList.add('keyboard-active');
    };

    const keyboardDeactivate = () => {
      if (!this.isMobile) return;
      setTimeout(() => {
        const active = document.activeElement;
        const stillInside = overlay.contains(active) && isTextualInput(active);
        if (!stillInside) {
          overlay.classList.remove('keyboard-active');
          this._keyboardActive = false;
        }
      }, 100);
    };

    overlay.addEventListener('focusin', keyboardActivate);
    overlay.addEventListener('focusout', keyboardDeactivate);

    // Store for cleanup
    this._keyboardFocusHandlers = { overlay, keyboardActivate, keyboardDeactivate };

    // If keyboard was active on previous step, keep modal pinned immediately
    if (this._keyboardActive) {
      overlay.classList.add('keyboard-active');
    }

    // Add event listeners
    this.setupModalEventListeners(overlay, modal, step);

    // Focus management
    setTimeout(() => {
      const firstInput = modal.querySelector('input, select, textarea');
      if (firstInput) {
        firstInput.focus();
      }
    }, 100);

    // If the current step has no input elements, ensure the modal is centered
    // even if the previous step had the keyboard active.
    if (!this.isMobile || !modal.querySelector('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="color"]):not([type="date"]):not([type="datetime-local"]):not([type="month"]):not([type="time"]):not([type="week"], textarea')) {
      overlay.classList.remove('keyboard-active');
      this._keyboardActive = false;
    }
  }

  /**
   * Sets up a resize listener that keeps the wizard modal inside the visible
   * viewport (e.g. above the on-screen keyboard). Returns a cleanup function.
   * @param {HTMLElement} modal
   * @returns {Function} cleanup callback to remove the listener
   */
  setupViewportResizeListener(modal, overlay) {
    if (!modal) return () => {};

    const viewport = window.visualViewport || window;

    const resize = () => {
      const visibleHeight = window.visualViewport
        ? window.visualViewport.height
        : window.innerHeight;
      modal.style.maxHeight = Math.round(visibleHeight * 0.9) + 'px';
    };

    // Initial adjustment
    resize();

    viewport.addEventListener('resize', resize);

    return () => viewport.removeEventListener('resize', resize);
  }

  /**
   * Create the content for a wizard step
   * @param {Object} step - The step configuration
   * @returns {HTMLElement} The step content element
   */
  createStepContent(step) {
    const container = document.createElement('div');
    container.className = 'event-wizard-step-content';

    // Step header
    const header = document.createElement('div');
    header.className = 'event-wizard-step-header';

    const title = document.createElement('h3');
    title.textContent = step.title;
    header.appendChild(title);

    // Progress indicator
    const progress = document.createElement('div');
    progress.className = 'event-wizard-progress';
    const totalSteps = this.currentWizard?.steps?.length || 1;
    const progressText = `Step ${this.currentStep + 1} of ${totalSteps}`;
    progress.textContent = progressText;
    header.appendChild(progress);

    container.appendChild(header);

    // Step body
    const body = document.createElement('div');
    body.className = 'event-wizard-step-body';

    // Render content based on step type
    const stepContent = this.renderStepContent(step);
    body.appendChild(stepContent);

    container.appendChild(body);

    // Step footer with buttons
    const footer = document.createElement('div');
    footer.className = 'event-wizard-step-footer';

    const buttons = this.createStepButtons(step);
    footer.appendChild(buttons);

    container.appendChild(footer);

    return container;
  }

  /**
   * Render step content based on content type
   * @param {Object} step - The step configuration
   * @returns {HTMLElement} The rendered content
   */
  renderStepContent(step) {
    const content = document.createElement('div');
    content.className = `event-wizard-content event-wizard-content-${step.contentType}`;

    switch (step.contentType) {
      case 'intro':
        content.appendChild(this.renderIntroContent(step));
        break;
      case 'input':
        content.appendChild(this.renderInputContent(step));
        break;
      case 'choice':
        content.appendChild(this.renderChoiceContent(step));
        break;
      case 'period':
        content.appendChild(this.renderer.renderPeriodContent(step, this.wizardState));
        break;
      case 'summary':
        content.appendChild(this.renderer.renderSummaryContent(step, this.wizardState));
        break;
      case 'mortgage':
        content.appendChild(this.renderer.renderMortgageContent(step, this.wizardState));
        break;
      default:
        content.appendChild(this.renderTextContent(step));
    }

    return content;
  }

  /**
   * Render intro content (welcome screens)
   */
  renderIntroContent(step) {
    const container = document.createElement('div');
    container.className = 'event-wizard-intro';



    const text = document.createElement('p');
    text.textContent = step.content.text;
    container.appendChild(text);

    return container;
  }

  /**
   * Render input content (single field input)
   */
  renderInputContent(step) {
    const container = document.createElement('div');
    container.className = 'event-wizard-input';

    // Input field
    const inputGroup = document.createElement('div');
    inputGroup.className = 'event-wizard-input-group';

    // Apply label positioning class if specified
    const labelPosition = step.labelPosition || 'left'; // default to left
    inputGroup.classList.add(`label-position-${labelPosition}`);

    // Create label element for all positioning types
    const label = document.createElement('label');
    const idSuffix = step.field === 'name' ? 'alias' : step.field;
    label.htmlFor = `wizard-${idSuffix}`;
    label.textContent = this.renderer.processTextVariables(step.content.text, this.wizardState);

    const input = document.createElement('input');
    input.type = step.content.inputType === 'currency' ? 'text' :
                 step.content.inputType === 'percentage' ? 'text' : 'text';
    input.id = `wizard-${idSuffix}`;
    input.name = idSuffix;
    input.placeholder = step.content.placeholder || '';

    // Set current value if exists
    const currentValue = this.wizardState.data[step.field];
    if (currentValue !== undefined) {
      input.value = currentValue;
    }

    // Add input formatting for currency/percentage/age
    if (step.content.inputType === 'currency') {
      input.className = 'currency-input';
    } else if (step.content.inputType === 'percentage') {
      input.className = 'percentage-input';
    } else if (step.content.inputType === 'age') {
      input.className = 'age-input';
    }

    // Add label and input to group in the correct order
    // (CSS will handle the visual positioning)
    inputGroup.appendChild(label);
    inputGroup.appendChild(input);
    container.appendChild(inputGroup);

    // Help text
    if (step.content.help) {
      const help = document.createElement('div');
      help.className = 'event-wizard-help';
      help.textContent = this.renderer.processTextVariables(step.content.help, this.wizardState);
      container.appendChild(help);
    }

    // Add input event listener: only update state and clear validation while typing
    input.addEventListener('input', () => {
      this.wizardState.data[step.field] = input.value;
      // Clear any existing validation styling/message while user is actively editing
      this.clearWizardFieldValidation(input);
    });

    // Validate when the user leaves the field (blur) to give feedback after editing
    input.addEventListener('blur', () => {
      this.validateWizardField(input, step.field, step.content.inputType);
    });

    // Add Enter key listener to advance to next step for single input pages
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Force blur so validation runs before attempting to advance
        input.blur();
        this.nextStep('input');
      }
    });

    return container;
  }

  /**
   * Render choice content (multiple choice selection)
   */
  renderChoiceContent(step) {
    const container = document.createElement('div');
    container.className = 'event-wizard-choice';

    // Description text
    const description = document.createElement('p');
    description.textContent = step.content.text;
    container.appendChild(description);

    // Choice options
    const choicesContainer = document.createElement('div');
    choicesContainer.className = 'event-wizard-choices';

    step.content.choices.forEach((choice, index) => {
      const choiceElement = document.createElement('div');
      choiceElement.className = 'event-wizard-choice-option';
      choiceElement.dataset.value = choice.value;

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'wizardChoice';
      radio.value = choice.value;
      radio.id = `choice-${index}`;

      // Set current selection if exists
      const currentValue = this.wizardState.data[step.stepId];
      if (currentValue === choice.value) {
        radio.checked = true;
        choiceElement.classList.add('selected');
      }

      const label = document.createElement('label');
      label.htmlFor = `choice-${index}`;

      const title = document.createElement('div');
      title.className = 'event-wizard-choice-title';
      title.textContent = choice.title;

      const desc = document.createElement('div');
      desc.className = 'event-wizard-choice-description';
      desc.textContent = choice.description;

      label.appendChild(title);
      label.appendChild(desc);

      choiceElement.appendChild(radio);
      choiceElement.appendChild(label);

      // Add click handler: advance immediately without timers
      choiceElement.addEventListener('click', () => {
        const alreadySelected = choiceElement.classList.contains('selected');

        if (!alreadySelected) {
          // Clear other selections
          choicesContainer.querySelectorAll('.event-wizard-choice-option').forEach(opt => {
            opt.classList.remove('selected');
            opt.querySelector('input').checked = false;
          });

          // Select this option
          choiceElement.classList.add('selected');
          radio.checked = true;
          this.wizardState.data[step.stepId] = choice.value;

          // Handle special cases when choices are made
          this.handleChoiceSpecialCases(step.stepId, choice.value);
        }

        // Proceed to next step immediately (duplicate rapid calls are already guarded in nextStep)
        this.nextStep('choice');
      });

      choicesContainer.appendChild(choiceElement);
    });

    container.appendChild(choicesContainer);
    return container;
  }

  /**
   * Create step navigation buttons
   */
  createStepButtons(step) {
    const container = document.createElement('div');
    container.className = 'event-wizard-buttons';

    let buttons = step.showButtons || ['back', 'next'];

    // BEGIN ADD: For choice steps, remove 'next' button so user must make a selection
    if (step.contentType === 'choice') {
      buttons = buttons.filter(btn => btn !== 'next');
    }
    // END ADD

    buttons.forEach(buttonType => {
      const button = document.createElement('button');
      button.className = `event-wizard-button event-wizard-button-${buttonType}`;
      
      switch (buttonType) {
        case 'back':
          button.textContent = 'Back';
          button.addEventListener('click', () => this.previousStep());
          button.disabled = this.currentStep === 0;
          break;
        case 'next':
          button.textContent = 'Next';
          button.addEventListener('click', () => {
            // Trigger blur on active element so its validation fires first
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
              document.activeElement.blur();
            }
            this.nextStep('button');
          });
          break;
        case 'create':
          button.textContent = 'Create Event';
          button.className += ' event-wizard-button-primary';
          button.addEventListener('click', () => this.createEvent());
          break;
        case 'cancel':
          button.textContent = 'Cancel';
          button.addEventListener('click', () => this.cancelWizard());
          break;
      }

      container.appendChild(button);
    });

    return container;
  }

  renderTextContent(step) {
    const container = document.createElement('div');
    container.innerHTML = `<p>${step.content.text || 'Content not available'}</p>`;
    return container;
  }

  // Navigation methods
  nextStep(origin = 'unknown') {
    // BEGIN ADD: suppress duplicate rapid calls (e.g. duplicate click bubbling) RIGHT AT ENTRY
    // ----- Block navigation if current modal still has validation errors -----
    const activeModal = document.getElementById('eventWizardModal');
    if (activeModal && activeModal.querySelector('.validation-error')) {
      return;
    }
    const now = Date.now();
    if (now - (this._lastNextStep || 0) < 200) {
      return; // Ignore rapid duplicate invocation
    }
    this._lastNextStep = now;

    // BEGIN ADD: Required field validation for current step before advancing
    if (this.currentWizard && this.currentWizard.steps) {
      const currentStepConfig = this.currentWizard.steps[this.currentStep];

      // Only validate when moving FORWARD (next button / Enter key auto-advance)
      // We skip validation when current step is the last visible summary step where createEvent() takes over.
      if (currentStepConfig && currentStepConfig.contentType === 'input') {
        const validationRules = (currentStepConfig.content && currentStepConfig.content.validation) || '';
        const rules = validationRules.split('|').map(r => r.trim());

        if (rules.includes('required')) {
          const fieldName = currentStepConfig.field;
          const value = (this.wizardState.data && this.wizardState.data[fieldName]) || '';

          if (!value || value.toString().trim() === '') {
            const modal = document.getElementById('eventWizardModal');
            if (modal) {
              const idSuffix = fieldName === 'name' ? 'alias' : fieldName;
              const inputEl = modal.querySelector(`#wizard-${idSuffix}`);
              if (inputEl) {
                // Clear any previous validation on this input first
                this.clearWizardFieldValidation(inputEl);
                this.showWizardFieldValidation(inputEl, 'This field is required');
                inputEl.focus();
              }
            }
            return; // Prevent advancing to the next step until field is filled
          }
        }

        // Optional: handle positive numeric rule (e.g. "required|positive")
        if (rules.includes('positive')) {
          const fieldName = currentStepConfig.field;
          const value = (this.wizardState.data && this.wizardState.data[fieldName]) || '';
          if (value && value.toString().trim() !== '') {
            // Determine validation type from inputType
            const inputType = (currentStepConfig.content && currentStepConfig.content.inputType) || '';
            let numeric = null;
            if (inputType === 'currency') {
              numeric = ValidationUtils.validateValue('money', value);
            } else if (inputType === 'percentage') {
              numeric = ValidationUtils.validateValue('percentage', value);
            }
            if (numeric !== null && numeric <= 0) {
              const modal = document.getElementById('eventWizardModal');
              if (modal) {
                const idSuffix = fieldName === 'name' ? 'alias' : fieldName;
                const inputEl = modal.querySelector(`#wizard-${idSuffix}`);
                if (inputEl) {
                  this.clearWizardFieldValidation(inputEl);
                  this.showWizardFieldValidation(inputEl, 'Value must be positive');
                  inputEl.focus();
                }
              }
              return; // Prevent advance
            }
          }
        }
      }
      // Validate period steps (fromAge/toAge relationship) right before advancing
      else if (currentStepConfig && currentStepConfig.contentType === 'period') {
        const fromVal = (this.wizardState.data && this.wizardState.data.fromAge) || '';
        const toVal = (this.wizardState.data && this.wizardState.data.toAge) || '';

        // Only check relationship if both values are present
        if (fromVal && toVal) {
          const relationship = ValidationUtils.validateAgeRelationship(fromVal, toVal);
          if (!relationship.isValid) {
            const modal = document.getElementById('eventWizardModal');
            if (modal) {
              const toInputEl = modal.querySelector('#wizard-toAge');
              if (toInputEl) {
                this.clearWizardFieldValidation(toInputEl);
                this.showWizardFieldValidation(toInputEl, relationship.message);
                toInputEl.focus();
              }
            }
            return; // Prevent advancing until relationship is valid
          }
        }
      }
    }
    // END ADD: validation logic
    if (!this.currentWizard || !this.currentWizard.steps) {
      console.error('Cannot navigate: currentWizard or steps not available');
      return;
    }

    // Cancel any still-pending auto-advance timers from the previous step
    if (this._pendingNextTimeouts && this._pendingNextTimeouts.length) {
      this._pendingNextTimeouts.forEach(t => clearTimeout(t));
      this._pendingNextTimeouts = [];
    }

    // Find next valid step (skip steps that don't meet conditions)
    let nextStepIndex = this.currentStep + 1;
    while (nextStepIndex < this.currentWizard.steps.length) {
      const step = this.currentWizard.steps[nextStepIndex];
      if (this.shouldShowStep(step)) {
        this.currentStep = nextStepIndex;
        this.showCurrentStep();
        return;
      }
      nextStepIndex++;
    }
  }

  previousStep() {
    if (!this.currentWizard || !this.currentWizard.steps) {
      console.error('Cannot navigate: currentWizard or steps not available');
      return;
    }

    // Find previous valid step (skip steps that don't meet conditions)
    let prevStepIndex = this.currentStep - 1;
    while (prevStepIndex >= 0) {
      const step = this.currentWizard.steps[prevStepIndex];
      if (this.shouldShowStep(step)) {
        this.currentStep = prevStepIndex;
        this.showCurrentStep();
        return;
      }
      prevStepIndex--;
    }
  }

  // Utility methods

  /**
   * Check if a step should be shown based on its condition
   * @param {Object} step - The step to evaluate
   * @returns {boolean} - Whether the step should be shown
   */
  shouldShowStep(step) {
    if (!step.condition) {
      return true; // No condition means always show
    }

    return this.evaluateCondition(step.condition);
  }

  /**
   * Evaluate a condition string against the current wizard state
   * @param {string} condition - The condition to evaluate (e.g., "type === 'oneoff'")
   * @returns {boolean} - Whether the condition is met
   */
  evaluateCondition(condition) {
    if (!condition || !this.wizardState.data) {
      return true;
    }

    try {
      // Simple condition evaluation for common patterns
      // Support: field === 'value', field !== 'value', and special variables
      const data = this.wizardState.data;

      // Replace field names with actual values from wizard state
      let expression = condition;

      // Handle special variables
      if (expression.includes('simulationMode')) {
        const simulationMode = this.webUI.getValue('simulation_mode');
        expression = expression.replace(/\bsimulationMode\b/g, `"${simulationMode}"`);
      }

      // Handle common field references
      Object.keys(data).forEach(key => {
        const value = data[key];
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        expression = expression.replace(regex, `"${value}"`);
      });

      // Normalize quotes to all be double quotes
      expression = expression.replace(/'/g, '"');

      // Evaluate the expression safely
      // Support simple comparison operations and logical AND
      if (/^"[^"]*"\s*(===|!==)\s*"[^"]*"(\s*&&\s*"[^"]*"\s*(===|!==)\s*"[^"]*")*$/.test(expression)) {
        return eval(expression);
      }
      return true; // Default to showing step if condition can't be evaluated
    } catch (error) {
      console.warn('Error evaluating step condition:', condition, error);
      return true; // Default to showing step on error
    }
  }

  setupModalEventListeners(overlay, modal, step) {
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.cancelWizard();
      }
    });

    // ESC key to close
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  handleKeyDown(e) {
    if (e.key === 'Escape' && this.isActive) {
      this.cancelWizard();
    }
  }

  createEvent() {
    // Validate required fields
    if (!this.validateWizardData()) {
      return;
    }

    // Handle special cases before creating event (may modify eventType)
    this.handleSpecialCases();

    // Prepare event data (use potentially modified eventType)
    const eventData = {
      eventType: this.wizardState.eventType,
      ...this.wizardState.data
    };

    // Call completion callback if provided
    if (this.wizardState.onComplete) {
      this.wizardState.onComplete(eventData);

      // For property purchases with mortgage, also create mortgage event
      if (this.wizardState.eventType === 'R' && this.wizardState.data.financing === 'mortgage') {
        this.createMortgageEvent(eventData);
      }
    }

    this.closeWizard();
  }

  /**
   * Create a mortgage event for property purchases with financing
   */
  createMortgageEvent(propertyEventData) {
    const data = this.wizardState.data;

    // Calculate mortgage details
    const propertyValue = parseFloat(data.propertyValue) || 0;
    const downPayment = parseFloat(data.amount) || 0;
    const loanAmount = propertyValue - downPayment;
    const interestRate = parseFloat(data.mortgageRate) / 100 || 0.035; // Default 3.5%
    const termYears = parseInt(data.mortgageTerm) || 25; // Default 25 years

    // Calculate annual mortgage payment using standard mortgage formula
    const monthlyRate = interestRate / 12;
    const numPayments = termYears * 12;
    const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                          (Math.pow(1 + monthlyRate, numPayments) - 1);
    const annualPayment = monthlyPayment * 12;

    // Create mortgage event data
    const mortgageEventData = {
      eventType: 'M',
      name: data.name, // Same name as property
      amount: Math.round(annualPayment),
      fromAge: data.fromAge,
      toAge: parseInt(data.fromAge) + termYears,
      rate: interestRate * 100, // Convert back to percentage for display
      match: 0
    };

    console.log('Creating mortgage event with data:', mortgageEventData);

    // Call completion callback for mortgage event
    if (this.wizardState.onComplete) {
      this.wizardState.onComplete(mortgageEventData);
    }
  }

  /**
   * Handle special cases when choices are made during the wizard
   */
  handleChoiceSpecialCases(stepId, choiceValue) {
    // Currently no special handling needed during choice selection
    // This method is kept for future extensibility
  }

  /**
   * Handle special cases for different event types (called before creating event)
   */
  handleSpecialCases() {
    const data = this.wizardState.data;

    // For one-time expenses or frequency-based adjustments
    if (this.wizardState.eventType === 'E') {
      const freq = data.frequency || 'yearly';

      // Convert entered amount to an annual figure for weekly or monthly frequencies
      const parseAmount = (val) => {
        const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
        return isNaN(num) ? 0 : num;
      };

      let annualAmount = parseAmount(data.amount);
      if (freq === 'weekly') {
        annualAmount *= 52;
      } else if (freq === 'monthly') {
        annualAmount *= 12;
      }
      // Round to nearest integer to keep consistent formatting
      data.amount = Math.round(annualAmount);

      // Handle one-off expenses
      if (freq === 'oneoff') {
        // Set isOneOff for one-off expenses
        data.isOneOff = true;
        data.toAge = data.fromAge;
        data.rate = '';
      }
    }

    // Ensure one-off events still follow single-age rules
    if (data.isOneOff) {
      data.toAge = data.fromAge;
      data.rate = '';
    }

    // For income wizard, determine the correct event type based on choices
    if (this.wizardState.eventType === 'SI' && data.incomeType === 'salary') {
      const simulationMode = this.webUI.getValue('simulation_mode');
      const person = data.person || 'person1'; // Default to person1 if not specified
      const pensionContribution = data.pensionContribution || 'yes'; // Default to yes if not specified

      // Determine the correct event type
      if (simulationMode === 'single') {
        this.wizardState.eventType = pensionContribution === 'yes' ? 'SI' : 'SInp';
      } else { // couple mode
        if (person === 'person1') {
          this.wizardState.eventType = pensionContribution === 'yes' ? 'SI' : 'SInp';
        } else {
          this.wizardState.eventType = pensionContribution === 'yes' ? 'SI2' : 'SI2np';
        }
      }
    }
  }

  /**
   * Get current age from the simulator if available
   */
  getCurrentAge() {
    try {
      // Try to get current age from the simulator
      if (window.webUI && window.webUI.simulator && window.webUI.simulator.currentAge) {
        return parseInt(window.webUI.simulator.currentAge);
      }
    } catch (error) {
      // Ignore errors, will use default
    }
    return null;
  }

  /**
   * Validate wizard data before creating event
   * @returns {boolean} True if data is valid
   */
  validateWizardData() {
    const data = this.wizardState.data;

    // Validate required fields
    const nameValidation = ValidationUtils.validateRequired(data.name, 'Event name');
    if (!nameValidation.isValid) {
      alert(nameValidation.message);
      return false;
    }

    // Skip amount validation for Stock Market events which do not use an amount field
    if (this.wizardState.eventType !== 'SM') {
      const amountValidation = ValidationUtils.validateRequired(data.amount, 'Amount');
      if (!amountValidation.isValid) {
        alert(amountValidation.message);
        return false;
      }
    }

    const fromAgeValidation = ValidationUtils.validateRequired(data.fromAge, 'Starting age/year');
    if (!fromAgeValidation.isValid) {
      alert(fromAgeValidation.message);
      return false;
    }

    // Validate numeric values
    if (this.wizardState.eventType !== 'SM') {
      if (ValidationUtils.validateValue('money', data.amount) === null) {
        alert('Please enter a valid amount');
        return false;
      }
    }

    if (ValidationUtils.validateValue('age', data.fromAge) === null) {
      alert('Please enter a valid starting age/year');
      return false;
    }

    // Validate toAge if present
    if (data.toAge && data.toAge.trim() !== '') {
      if (ValidationUtils.validateValue('age', data.toAge) === null) {
        alert('Please enter a valid ending age/year');
        return false;
      }

      const relationship = ValidationUtils.validateAgeRelationship(data.fromAge, data.toAge);
      if (!relationship.isValid) {
        alert(relationship.message);
        return false;
      }
    }

    // Validate rate
    if (data.rate && data.rate.trim() !== '') {
      if (ValidationUtils.validateValue('percentage', data.rate) === null) {
        alert('Please enter a valid rate');
        return false;
      }
    } else if (this.wizardState.eventType === 'SM') {
      // For Stock Market events, rate is mandatory
      alert('Market growth value is required');
      return false;
    }

    // Validate match if present
    if (data.match && data.match.trim() !== '') {
      if (ValidationUtils.validateValue('percentage', data.match) === null) {
        alert('Please enter a valid match percentage');
        return false;
      }
    }

    return true;
  }

  /**
   * Validate a single wizard field in real-time
   */
  validateWizardField(input, fieldName, fieldType) {
    const value = input.value;
    let validation = { isValid: true };

    // Clear any existing validation styling
    this.clearWizardFieldValidation(input);

    if (!value || value.trim() === '') return; // empty allowed, handled on final submit

    // Map field types to ValidationUtils
    switch (fieldType) {
      case 'currency':
        if (ValidationUtils.validateValue('money', value) === null) {
          validation = { isValid: false, message: 'Please enter a valid amount' };
        }
        break;
      case 'percentage':
        if (ValidationUtils.validateValue('percentage', value) === null) {
          validation = { isValid: false, message: 'Please enter a valid percentage' };
        }
        break;
      default:
        if (fieldName === 'fromAge' || fieldName === 'toAge') {
          if (ValidationUtils.validateValue('age', value) === null) {
            validation = { isValid: false, message: 'Please enter a valid age' };
          }
        }
        break;
    }

    if (!validation.isValid) {
      this.showWizardFieldValidation(input, validation.message);
    }
  }

  /**
   * Show validation error for wizard field
   */
  showWizardFieldValidation(input, message, isWarningOnly = false) {
    // Add error styling to input
    input.classList.add(isWarningOnly ? 'validation-warning' : 'validation-error');

    // Create and show validation message
    const validationMessage = document.createElement('div');
    validationMessage.className = `wizard-validation-message ${isWarningOnly ? 'warning' : 'error'}`;
    validationMessage.textContent = message;

    // Insert validation message after the input group
    const inputGroup = input.closest('.event-wizard-input-group');
    if (inputGroup) {
      inputGroup.parentNode.appendChild(validationMessage);
    }
  }

  /**
   * Clear validation error for wizard field
   */
  clearWizardFieldValidation(input) {
    // Remove error styling
    input.classList.remove('validation-error', 'validation-warning');

    // Remove validation message
    const inputGroup = input.closest('.event-wizard-input-group');
    if (inputGroup) {
      const existingMessage = inputGroup.parentNode.querySelector('.wizard-validation-message');
      if (existingMessage) {
        existingMessage.remove();
      }
    }
  }

  cancelWizard() {
    this.closeWizard();
  }

  closeWizard() {
    const overlay = document.getElementById('eventWizardOverlay');
    if (overlay) {
      overlay.remove();
    }

    // Clean up viewport resize listener if present
    if (this._viewportCleanup) {
      this._viewportCleanup();
      this._viewportCleanup = null;
    }

    // Remove focus handlers if present
    if (this._keyboardFocusHandlers) {
      const { overlay, keyboardActivate, keyboardDeactivate } = this._keyboardFocusHandlers;
      overlay.removeEventListener('focusin', keyboardActivate);
      overlay.removeEventListener('focusout', keyboardDeactivate);
      this._keyboardFocusHandlers = null;
    }

    // Complete reset of wizard state
    this.isActive = false;
    this.currentWizard = null;
    this.currentStep = 0;
    this.wizardState = {};
    // BEGIN ADD: clear duplicate-guard timestamp
    this._lastNextStep = 0;
    // END ADD

    // Remove event listeners
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * Reset wizard state completely
   */
  resetWizardState() {
    this.currentWizard = null;
    this.currentStep = 0;
    this.wizardState = {};
    this.isActive = false;
    // BEGIN ADD: clear duplicate-guard timestamp
    this._lastNextStep = 0;
    // END ADD
  }
}
