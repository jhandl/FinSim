/* Event Wizard Management functionality */

class EventWizardManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.wizardData = null;
    this.currentWizard = null;
    this.currentStep = 0;
    // Maintain a history stack of visited step indices for reliable back navigation
    this._stepHistory = [];
    this.wizardState = {};
    this.isActive = false;
    this.renderer = new EventWizardRenderer(webUI);
    // Store cleanup for viewport resize listener
    this._viewportCleanup = null;
    // Track if keyboard is active to keep modal pinned across steps
    this._keyboardActive = false;
    // Detect mobile once using shared utility
    // Mobile detection: use DeviceUtils if ready, otherwise a basic UA check (desktop false)
    this.isMobile = (window.DeviceUtils && window.DeviceUtils.isMobile)
      ? window.DeviceUtils.isMobile()
      : /Mobi|Android/i.test(navigator.userAgent);
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
   * @param {Function} onCancel - Callback function when wizard is cancelled
   */
  startWizard(eventType, prePopulatedData = {}, onComplete = null, onCancel = null) {
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
      onCancel: onCancel,
      ...options
    };
    this.isActive = true;
    // Reset navigation history at the beginning of a new wizard
    this._stepHistory = [];

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

    // If this field represents numeric data, configure the input to trigger the
    // numeric keypad on mobile devices (mirrors behaviour used for age inputs).
    const numericInputTypes = ['currency', 'percentage', 'age', 'number'];
    if (numericInputTypes.includes(step.content.inputType)) {
      input.inputMode = 'numeric';
      input.pattern = '[0-9]*';
    }

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
      // Primary type-specific validation
      this.validateWizardField(input, step.field, step.content.inputType);

      // Additional relational validations defined in YAML (e.g. lt:otherField)
      const validationRules = (step.content && step.content.validation) || '';
      if (validationRules) {
        const rules = validationRules.split('|').map(r => r.trim());
        rules.forEach(r => {
          // Pattern: comparator:fieldName (e.g. lt:propertyValue)
          const m = r.match(/^(lt|lte|gt|gte):(.+)$/);
          if (m) {
            const comparator = m[1];
            const otherField = m[2];
            const otherValRaw = this.wizardState.data[otherField];
            const thisValNum = parseFloat(input.value.replace(/[^0-9.-]/g, ''));
            const otherValNum = parseFloat((otherValRaw || '').toString().replace(/[^0-9.-]/g, ''));

            if (!isNaN(thisValNum) && !isNaN(otherValNum)) {
              let valid = true;
              switch (comparator) {
                case 'lt':  valid = thisValNum < otherValNum; break;
                case 'lte': valid = thisValNum <= otherValNum; break;
                case 'gt':  valid = thisValNum > otherValNum; break;
                case 'gte': valid = thisValNum >= otherValNum; break;
              }
              if (!valid) {
                const comparatorTextMap = { lt: 'less than', lte: 'less than or equal to', gt: 'greater than', gte: 'greater than or equal to' };
                const comparatorText = comparatorTextMap[comparator] || comparator;
                const message = `Value must be ${comparatorText} ${otherField.replace(/([A-Z])/g, ' $1').toLowerCase()}`;
                this.showWizardFieldValidation(input, message);
              }
            }
          }
        });
      }
    });

    // Add Enter key listener to advance to next step for single input pages
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Force blur so validation runs before attempting to advance
        input.blur();

        // BEGIN MODIFY: Schedule nextStep slightly later so the blur/validation cycle
        // has a chance to update the DOM, preventing premature navigation when
        // validation fails. Also clear any previously scheduled auto-advances to
        // avoid multiple queued navigations from rapid key presses.
        // Cancel any pending timeouts for this step
        if (this._pendingNextTimeouts && this._pendingNextTimeouts.length) {
          this._pendingNextTimeouts.forEach(t => clearTimeout(t));
          this._pendingNextTimeouts = [];
        }

        // Schedule the actual navigation after a short delay (50-100 ms is plenty)
        const timeoutId = setTimeout(() => {
          this.nextStep('input');
          // Remove this timeout reference once it has executed
          this._pendingNextTimeouts = this._pendingNextTimeouts.filter(id => id !== timeoutId);
        }, 60);

        this._pendingNextTimeouts.push(timeoutId);
        // END MODIFY
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
          // Pointerdown handler for mobile (prevents click cancellation)
          button.addEventListener('pointerdown', (e) => {
            // For safety, ignore secondary buttons
            if (e.button !== 0) return;

            if (!this.isMobile) return; // desktop: let click handler handle navigation

            const oldActive = document.activeElement;

            // Helper to check if an element is a textual input that can trigger the keyboard
            const isTextualInput = (el) => {
              if (!el) return false;
              if (el.tagName === 'TEXTAREA') return true;
              if (el.tagName === 'INPUT') {
                const badTypes = [
                  'radio', 'checkbox', 'hidden', 'range', 'button', 'submit', 'reset',
                  'file', 'color', 'date', 'datetime-local', 'month', 'time', 'week'
                ];
                const type = el.getAttribute('type')?.toLowerCase() || 'text';
                return !badTypes.includes(type);
              }
              return false;
            };

            // We will re-focus the first input in the *new* modal only after the old input blurs
            let refocused = false;
            const handleBlur = () => {
              if (refocused) return;
              refocused = true;
              // Delay to next micro-task to ensure new modal is in the DOM
              setTimeout(() => {
                const modal = document.getElementById('eventWizardModal');
                if (modal) {
                  const firstInput = modal.querySelector('input, select, textarea');
                  if (firstInput) firstInput.focus();
                }
              }, 0);
            };

            if (isTextualInput(oldActive)) {
              oldActive.addEventListener('blur', handleBlur, { once: true });
              // Fallback: if blur somehow never fires, trigger focus after 500 ms
              setTimeout(handleBlur, 500);
            }

            // Perform navigation before keyboard collapse to preserve click
            // Set flag so that the overlay click generated by this touch sequence
            // (which can target the new overlay after it is created) does not
            // immediately close the wizard on mobile devices.
            this._ignoreNextOverlayClick = true;
            this.previousStep();

            // Prevent the subsequent click event so we don’t navigate twice
            e.preventDefault();
          });
          // Desktop click navigation (ignored on mobile)
          button.addEventListener('click', () => {
            if (this.isMobile) return;
            this.previousStep();
          });
          break;
        case 'next':
          button.textContent = 'Next';
          // Pointerdown for mobile devices only
          button.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return; // primary touch/click only

            if (!this.isMobile) return; // desktop: let click handle navigation

            // Cancel pending auto-advance timers (Enter key etc.)
            if (this._pendingNextTimeouts && this._pendingNextTimeouts.length) {
              this._pendingNextTimeouts.forEach(t => clearTimeout(t));
              this._pendingNextTimeouts = [];
            }

            const active = document.activeElement;

            const isTextualInput = (el) => {
              if (!el) return false;
              if (el.tagName === 'TEXTAREA') return true;
              if (el.tagName === 'INPUT') {
                const badTypes = [
                  'radio', 'checkbox', 'hidden', 'range', 'button', 'submit', 'reset',
                  'file', 'color', 'date', 'datetime-local', 'month', 'time', 'week'
                ];
                const type = el.getAttribute('type')?.toLowerCase() || 'text';
                return !badTypes.includes(type);
              }
              return false;
            };

            if (isTextualInput(active)) {
              const onBlur = () => {
                this.nextStep('button');
              };
              active.addEventListener('blur', onBlur, { once: true });
              // Let natural focus shift blur the input (pointerdown on button triggers this)
            } else {
              this.nextStep('button');
            }

            // Prevent legacy click from firing to avoid duplicate navigation
            e.preventDefault();
          });
          // Desktop click handler (ignored on mobile)
          button.addEventListener('click', () => {
            if (this.isMobile) return;
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
    // ----- Block navigation if current modal still has validation errors -----
    const activeModal = document.getElementById('eventWizardModal');
    if (activeModal && activeModal.querySelector('.validation-error')) {
      // Re-focus the first input that has the validation error so the keyboard re-opens
      const errInput = activeModal.querySelector('input.validation-error, textarea.validation-error, select.validation-error');
      if (errInput && typeof errInput.focus === 'function') {
        // Defer to next micro-task to ensure blur processing is done
        setTimeout(() => errInput.focus(), 0);
      }
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
        // BEGIN MODIFY: perform required field validation for period steps when advancing
        const validationRules = (currentStepConfig.content && currentStepConfig.content.validation) || '';
        const requiresFrom = validationRules.includes('required') || validationRules.includes('fromAgeRequired');
        const requiresTo = validationRules.includes('required');

        const fromVal = (this.wizardState.data && this.wizardState.data.fromAge) || '';
        const toVal = (this.wizardState.data && this.wizardState.data.toAge) || '';

        // Check required fields first
        if (requiresFrom && (!fromVal || fromVal.toString().trim() === '')) {
          const modal = document.getElementById('eventWizardModal');
          if (modal) {
            const fromInputEl = modal.querySelector('#wizard-fromAge');
            if (fromInputEl) {
              this.clearWizardFieldValidation(fromInputEl);
              this.showWizardFieldValidation(fromInputEl, 'This field is required');
              fromInputEl.focus();
            }
          }
          return; // Prevent advancing until required From age is provided
        }

        if (requiresTo && (!toVal || toVal.toString().trim() === '')) {
          const modal = document.getElementById('eventWizardModal');
          if (modal) {
            const toInputEl = modal.querySelector('#wizard-toAge');
            if (toInputEl) {
              this.clearWizardFieldValidation(toInputEl);
              this.showWizardFieldValidation(toInputEl, 'This field is required');
              toInputEl.focus();
            }
          }
          return; // Prevent advancing until required To age is provided
        }

        // END MODIFY: required checks complete

        // Existing relationship validation
        const fromValAfterReq = fromVal; // names unchanged but keep semantic clarity
        const toValAfterReq = toVal;

        // Only check relationship if both values are present
        if (fromValAfterReq && toValAfterReq) {
          const relationship = ValidationUtils.validateAgeRelationship(fromValAfterReq, toValAfterReq);
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
        // Push the current step onto the history stack before moving forward
        this._stepHistory.push(this.currentStep);
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

    // Pop the last visited step from history, if available
    if (this._stepHistory && this._stepHistory.length > 0) {
      this.currentStep = this._stepHistory.pop();
      this.showCurrentStep();
      return;
    }
    // Fallback: if history is empty, attempt to find any previous visible step
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

    // If no previous step exists, close the wizard and reopen the event-type selection modal
    const existingData = { ...(this.wizardState?.data || {}) };
    this.cancelWizard();

    if (this.webUI && this.webUI.eventsTableManager && typeof this.webUI.eventsTableManager.showWizardSelection === 'function') {
      this.webUI.eventsTableManager.showWizardSelection(existingData);
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
    if (!condition) {
      return true;
    }
    if (!this.wizardState || !this.wizardState.data) {
      // No state to evaluate against -> do not show conditional steps
      return false;
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

      // Replace field names with JSON-encoded values so types are preserved
      Object.keys(data).forEach(key => {
        const value = data[key];
        // Escape key for regex
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedKey}\\b`, 'g');
        const replacement = (value === undefined) ? 'undefined' : JSON.stringify(value);
        expression = expression.replace(regex, replacement);
      });

      // Normalize quotes to double quotes for any literal strings in the condition
      expression = expression.replace(/'/g, '"');

      // Remove quoted strings for safety checks
      const withoutStrings = expression.replace(/"[^"\\]*"/g, '');

      // Ensure remaining characters are only allowed operators / punctuation / numbers / whitespace
      if (!/^[\s0-9.\-+*/%<>=!&|()?:,]*$/.test(withoutStrings)) {
        // If there are bare identifiers left, allow only boolean/null/undefined literals
        const identifiers = withoutStrings.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
        const allowed = new Set(['true', 'false', 'null', 'undefined']);
        for (let id of identifiers) {
          if (!allowed.has(id)) {
            return false; // unsafe identifier present -> do not show
          }
        }
      }

      // At this point the expression is considered safe to evaluate
      try {
        // Use Function constructor instead of eval for slightly better scoping
        const fn = new Function('return (' + expression + ');');
        return Boolean(fn());
      } catch (err) {
        console.warn('Failed to evaluate wizard condition expression:', expression, err);
        return false;
      }
    } catch (error) {
      console.warn('Error evaluating step condition:', condition, error);
      return true; // Default to showing step on error
    }
  }

  setupModalEventListeners(overlay, modal, step) {
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      // If the previous navigation (e.g., mobile Back button) marked the next
      // overlay click to be ignored, consume it and reset the flag.
      if (this._ignoreNextOverlayClick) {
        this._ignoreNextOverlayClick = false;
        return;
      }

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

    // Debug logging removed

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
        data.toAge = data.fromAge;
        data.rate = '';
      }
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
    // Map non-salary income selections to their corresponding event codes
    else if (this.wizardState.eventType === 'SI' && data.incomeType) {
      const nonSalaryMap = {
        rsu: 'UI',
        rental: 'RI',
        defined_benefit: 'DBI',
        tax_free: 'FI'
      };
      const mappedType = nonSalaryMap[data.incomeType];
      if (mappedType) {
        this.wizardState.eventType = mappedType;
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

    if (!value || value.trim() === '') {
      return; // empty allowed, handled on final submit
    }

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
    // Call onCancel callback if provided
    if (this.wizardState && this.wizardState.onCancel) {
      this.wizardState.onCancel();
    }
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
