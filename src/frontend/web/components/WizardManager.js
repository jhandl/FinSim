/* Generic Wizard Manager (non-module, browser global) */

class WizardManager {

  constructor(context, renderer, options) {
    this.context = context; // typically webUI
    this.renderer = renderer || null;
    if (this.renderer) {
      // Allow renderer to access its manager if it wants to
      try { this.renderer.manager = this; } catch (_) {}
    }

    const defaults = { overlayId: 'eventWizardOverlay', modalId: 'eventWizardModal', cssPrefix: 'event-wizard' };
    this.options = Object.assign({}, defaults, options || {});

    this.wizardData = null;
    this.currentWizard = null;
    this.currentStep = 0;
    this._stepHistory = [];
    this.wizardState = {};
    this.isActive = false;
    this._viewportCleanup = null;
    this._keyboardActive = false;
    this._keyboardFocusHandlers = null;
    this._ignoreNextOverlayClick = false;

    // Mobile detection via DeviceUtils if available
    this.isMobile = (window.DeviceUtils && window.DeviceUtils.isMobile)
      ? window.DeviceUtils.isMobile()
      : /Mobi|Android/i.test(navigator.userAgent);

    // Duplicate-advance guard and queued timers
    this._lastNextStep = 0;
    this._pendingNextTimeouts = [];

    // Hook to be provided by feature wrapper (e.g., EventsWizard)
    this.onCompleteAction = null;
  }

  async loadConfig(url, parser) {
    try {
      const response = await fetch(url);
      const yamlText = await response.text();
      const p = parser || window.jsyaml;
      if (p && typeof p.load === 'function') {
        this.wizardData = p.load(yamlText);
      } else {
        console.warn('YAML parser not available, wizard configuration not loaded');
      }
    } catch (err) {
      console.error('Failed to load wizard configuration:', err);
    }
  }

  startWizard(idOrConfig, initialData = {}, onComplete = null, onCancel = null) {
    if (!this.wizardData || !this.wizardData.EventWizards) {
      if (typeof idOrConfig === 'object' && idOrConfig) {
        // Allow direct config start for testing/advanced usage
          this.currentWizard = idOrConfig;
      } else {
        console.error('Wizard configuration not loaded');
        return false;
      }
    }

    if (!this.currentWizard) {
      let wizardConfig = null;
      if (typeof idOrConfig === 'string') {
        // Find by id first, then by eventType
        wizardConfig = this.wizardData.EventWizards.find(w => w.id === idOrConfig) ||
                       this.wizardData.EventWizards.find(w => w.eventType === idOrConfig) || null;
      } else if (typeof idOrConfig === 'object' && idOrConfig) {
        wizardConfig = idOrConfig;
      }
      if (!wizardConfig) {
        console.error('No wizard configuration found for:', idOrConfig);
        return false;
      }
      this.currentWizard = wizardConfig;
    }

    // Reset state and initialize
    this.currentStep = 0;
    this._stepHistory = [];
    this.wizardState = {
      eventType: this.currentWizard.eventType,
      data: initialData || {},
      onComplete: onComplete || null,
      onCancel: onCancel || null,
    };
    this.isActive = true;

    this.showCurrentStep();
    return true;
  }

  showCurrentStep() {
    if (!this.currentWizard || !this.isActive) return;
    if (!this.currentWizard.steps) {
      console.error('currentWizard has no steps property:', this.currentWizard);
      return;
    }
    const step = this.currentWizard.steps[this.currentStep];
    if (!step) {
      console.error('Invalid step index:', this.currentStep, 'Available steps:', this.currentWizard.steps.length);
      return;
    }
    if (step.condition && !this.shouldShowStep(step)) {
      this.nextStep();
      return;
    }
    this.createWizardModal(step);
  }

  createWizardModal(step) {
    const overlayId = this.options.overlayId;
    const modalId = this.options.modalId;

    // Remove any existing overlay/modal
    const existingOverlay = document.getElementById(overlayId);
    if (existingOverlay) existingOverlay.remove();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'wizard-overlay';
    overlay.id = overlayId;

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'wizard-modal event-wizard-modal';
    if (this.currentWizard && this.currentWizard.category) {
      const catClass = `wizard-category-${this.currentWizard.category}`;
      modal.classList.add('wizard-modal-category', catClass);
    }
    modal.id = modalId;

    // Build content using renderer
    const content = this.createStepContent(step);
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Ensure modal fits visible viewport height
    if (this._viewportCleanup) { this._viewportCleanup(); this._viewportCleanup = null; }
    this._viewportCleanup = this.setupViewportResizeListener(modal);

    // Keyboard focus class toggling on mobile
    const isTextualInput = (el) => {
      if (!el) return false;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName === 'INPUT') {
        const bad = ['radio','checkbox','hidden','range','button','submit','reset','file','color','date','datetime-local','month','time','week'];
        const type = el.getAttribute('type')?.toLowerCase() || 'text';
        return !bad.includes(type);
      }
      return false;
    };
    const keyboardActivate = (e) => { if (!this.isMobile) return; if (!isTextualInput(e.target)) return; this._keyboardActive = true; overlay.classList.add('keyboard-active'); };
    const keyboardDeactivate = () => {
      if (!this.isMobile) return;
      setTimeout(() => {
        const active = document.activeElement;
        const stillInside = overlay.contains(active) && isTextualInput(active);
        if (!stillInside) { overlay.classList.remove('keyboard-active'); this._keyboardActive = false; }
      }, 100);
    };
    overlay.addEventListener('focusin', keyboardActivate);
    overlay.addEventListener('focusout', keyboardDeactivate);
    this._keyboardFocusHandlers = { overlay, keyboardActivate, keyboardDeactivate };
    if (this._keyboardActive) overlay.classList.add('keyboard-active');

    this.setupModalEventListeners(overlay);

    // Focus first input shortly after render
    setTimeout(() => {
      const firstInput = modal.querySelector('input, select, textarea');
      if (firstInput) firstInput.focus();
    }, 100);

    // If this step has no text inputs, clear keyboard-active class
    if (!this.isMobile || !modal.querySelector('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="color"]):not([type="date"]):not([type="datetime-local"]):not([type="month"]):not([type="time"]):not([type="week"], textarea')) {
      overlay.classList.remove('keyboard-active');
      this._keyboardActive = false;
    }
  }

  setupViewportResizeListener(modal) {
    if (!modal) return () => {};
    const viewport = window.visualViewport || window;
    const resize = () => {
      const visibleHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      modal.style.maxHeight = Math.round(visibleHeight * 0.9) + 'px';
    };
    resize();
    viewport.addEventListener('resize', resize);
    return () => viewport.removeEventListener('resize', resize);
  }

  createStepContent(step) {
    const container = document.createElement('div');
    container.className = `${this.options.cssPrefix}-step-content`;

    const header = document.createElement('div');
    header.className = `${this.options.cssPrefix}-step-header`;
    const title = document.createElement('h3');
    title.textContent = step.title;
    header.appendChild(title);
    const progress = document.createElement('div');
    progress.className = `${this.options.cssPrefix}-progress`;
    const totalSteps = this.currentWizard?.steps?.length || 1;
    progress.textContent = `Step ${this.currentStep + 1} of ${totalSteps}`;
    header.appendChild(progress);
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = `${this.options.cssPrefix}-step-body`;
    const content = (this.renderer && typeof this.renderer.render === 'function')
      ? this.renderer.render(step, this.wizardState)
      : document.createElement('div');
    body.appendChild(content);
    container.appendChild(body);

    const footer = document.createElement('div');
    footer.className = `${this.options.cssPrefix}-step-footer`;
    const buttons = this.createStepButtons(step);
    footer.appendChild(buttons);
    container.appendChild(footer);
    return container;
  }

  createStepButtons(step) {
    const container = document.createElement('div');
    container.className = `${this.options.cssPrefix}-buttons`;
    let buttons = step.showButtons || ['back','next'];
    if (step.contentType === 'choice') {
      buttons = buttons.filter(b => b !== 'next');
    }
    buttons.forEach((buttonType) => {
      const button = document.createElement('button');
      button.className = `${this.options.cssPrefix}-button ${this.options.cssPrefix}-button-${buttonType}`;
      switch (buttonType) {
        case 'back':
          button.textContent = 'Back';
          button.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            if (!this.isMobile) return;
            const active = document.activeElement;
            const isTextual = (el) => {
              if (!el) return false;
              if (el.tagName === 'TEXTAREA') return true;
              if (el.tagName === 'INPUT') {
                const bad = ['radio','checkbox','hidden','range','button','submit','reset','file','color','date','datetime-local','month','time','week'];
                const type = el.getAttribute('type')?.toLowerCase() || 'text';
                return !bad.includes(type);
              }
              return false;
            };
            // Prevent immediate dismissal of the next overlay (wizard selection)
            this._ignoreNextOverlayClick = true;
            if (isTextual(active)) {
              active.addEventListener('blur', () => { this.previousStep(); }, { once: true });
            } else {
              this.previousStep();
            }
            e.preventDefault();
          });
          button.addEventListener('click', () => { if (this.isMobile) return; this.previousStep(); });
          break;
        case 'next':
          button.textContent = 'Next';
          button.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            if (!this.isMobile) return;
            if (this._pendingNextTimeouts && this._pendingNextTimeouts.length) {
              this._pendingNextTimeouts.forEach(t => clearTimeout(t));
              this._pendingNextTimeouts = [];
            }
            const active = document.activeElement;
            const isTextual = (el) => {
              if (!el) return false;
              if (el.tagName === 'TEXTAREA') return true;
              if (el.tagName === 'INPUT') {
                const bad = ['radio','checkbox','hidden','range','button','submit','reset','file','color','date','datetime-local','month','time','week'];
                const type = el.getAttribute('type')?.toLowerCase() || 'text';
                return !bad.includes(type);
              }
              return false;
            };
            const ignoreOverlayClick = () => {
              this._ignoreNextOverlayClick = true;
              setTimeout(() => { this._ignoreNextOverlayClick = false; }, 350);
            };
            if (isTextual(active)) {
              let advanced = false;
              let fallbackId = null;
              const advance = () => {
                if (advanced) return;
                advanced = true;
                if (fallbackId) clearTimeout(fallbackId);
                ignoreOverlayClick();
                this.nextStep('button');
              };
              active.addEventListener('blur', advance, { once: true });
              try { active.blur(); } catch (_) {}
              fallbackId = setTimeout(advance, 120);
            } else {
              ignoreOverlayClick();
              this.nextStep('button');
            }
            e.preventDefault();
          });
          button.addEventListener('click', () => { if (this.isMobile) return; this.nextStep('button'); });
          break;
        case 'create':
          button.textContent = 'Create Event';
          button.className += ` ${this.options.cssPrefix}-button-primary`;
          button.addEventListener('click', () => {
            // Delegate to feature hook
            const data = Object.assign({ eventType: this.wizardState.eventType }, this.wizardState.data);
            if (typeof this.onCompleteAction === 'function') {
              this.onCompleteAction(data);
            }
          });
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

  renderStepContent(step) {
    // Unused in generic manager (renderer.render is called directly in createStepContent)
    const content = document.createElement('div');
    content.className = `${this.options.cssPrefix}-content ${this.options.cssPrefix}-content-${step.contentType}`;
    return content;
  }

  nextStep(origin = 'unknown') {
    const activeModal = document.getElementById(this.options.modalId);
    if (activeModal && activeModal.querySelector('.validation-error')) {
      const errInput = activeModal.querySelector('input.validation-error, textarea.validation-error, select.validation-error');
      if (errInput && typeof errInput.focus === 'function') {
        setTimeout(() => errInput.focus(), 0);
      }
      return;
    }
    const now = Date.now();
    if (now - (this._lastNextStep || 0) < 200) return;
    this._lastNextStep = now;

    // Required-field validation for input/period steps
    if (this.currentWizard && this.currentWizard.steps) {
      const currentStepConfig = this.currentWizard.steps[this.currentStep];
      if (currentStepConfig && currentStepConfig.contentType === 'input') {
        const validationRules = (currentStepConfig.content && currentStepConfig.content.validation) || '';
        const rules = validationRules.split('|').map(r => r.trim());
        if (rules.includes('required')) {
          const fieldName = currentStepConfig.field;
          const value = (this.wizardState.data && this.wizardState.data[fieldName]) || '';
          if (!value || value.toString().trim() === '') {
            const modal = document.getElementById(this.options.modalId);
            if (modal) {
              const idSuffix = fieldName === 'name' ? 'alias' : fieldName;
              const inputEl = modal.querySelector(`#wizard-${idSuffix}`);
              if (inputEl) {
                this.clearWizardFieldValidation(inputEl);
                this.showWizardFieldValidation(inputEl, 'This field is required');
                inputEl.focus();
              }
            }
            return;
          }
        }
        if (rules.includes('positive')) {
          const fieldName = currentStepConfig.field;
          const value = (this.wizardState.data && this.wizardState.data[fieldName]) || '';
          if (value && value.toString().trim() !== '') {
            const inputType = (currentStepConfig.content && currentStepConfig.content.inputType) || '';
            let numeric = null;
            if (inputType === 'currency') numeric = ValidationUtils.validateValue('money', value);
            else if (inputType === 'percentage') numeric = ValidationUtils.validateValue('percentage', value);
            if (numeric !== null && numeric <= 0) {
              const modal = document.getElementById(this.options.modalId);
              if (modal) {
                const idSuffix = fieldName === 'name' ? 'alias' : fieldName;
                const inputEl = modal.querySelector(`#wizard-${idSuffix}`);
                if (inputEl) {
                  this.clearWizardFieldValidation(inputEl);
                  this.showWizardFieldValidation(inputEl, 'Value must be positive');
                  inputEl.focus();
                }
              }
              return;
            }
          }
        }
      } else if (currentStepConfig && currentStepConfig.contentType === 'period') {
        const validationRules = (currentStepConfig.content && currentStepConfig.content.validation) || '';
        const requiresFrom = validationRules.includes('required') || validationRules.includes('fromAgeRequired');
        const requiresTo = validationRules.includes('required');
        const fromVal = (this.wizardState.data && this.wizardState.data.fromAge) || '';
        const toVal = (this.wizardState.data && this.wizardState.data.toAge) || '';
        if (requiresFrom && (!fromVal || fromVal.toString().trim() === '')) {
          const modal = document.getElementById(this.options.modalId);
          if (modal) {
            const fromInputEl = modal.querySelector('#wizard-fromAge');
            if (fromInputEl) { this.clearWizardFieldValidation(fromInputEl); this.showWizardFieldValidation(fromInputEl, 'This field is required'); fromInputEl.focus(); }
          }
          return;
        }
        if (requiresTo && (!toVal || toVal.toString().trim() === '')) {
          const modal = document.getElementById(this.options.modalId);
          if (modal) {
            const toInputEl = modal.querySelector('#wizard-toAge');
            if (toInputEl) { this.clearWizardFieldValidation(toInputEl); this.showWizardFieldValidation(toInputEl, 'This field is required'); toInputEl.focus(); }
          }
          return;
        }
        if (fromVal && toVal) {
          const relationship = ValidationUtils.validateAgeRelationship(fromVal, toVal);
          if (!relationship.isValid) {
            const modal = document.getElementById(this.options.modalId);
            if (modal) {
              const toInputEl = modal.querySelector('#wizard-toAge');
              if (toInputEl) { this.clearWizardFieldValidation(toInputEl); this.showWizardFieldValidation(toInputEl, relationship.message); toInputEl.focus(); }
            }
            return;
          }
        }
      }
    }

    if (this._pendingNextTimeouts && this._pendingNextTimeouts.length) {
      this._pendingNextTimeouts.forEach(t => clearTimeout(t));
      this._pendingNextTimeouts = [];
    }

    if (!this.currentWizard || !this.currentWizard.steps) {
      console.error('Cannot navigate: currentWizard or steps not available');
      return;
    }

    let nextStepIndex = this.currentStep + 1;
    while (nextStepIndex < this.currentWizard.steps.length) {
      const step = this.currentWizard.steps[nextStepIndex];
      if (this.shouldShowStep(step)) {
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
    if (this._stepHistory && this._stepHistory.length > 0) {
      this.currentStep = this._stepHistory.pop();
      this.showCurrentStep();
      return;
    }
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
    // If no previous step exists, close wizard and let caller handle fallback
    const existingData = { ...(this.wizardState?.data || {}) };
    this.cancelWizard();
    try {
      if (this.context && this.context.eventsTableManager && typeof this.context.eventsTableManager.showWizardSelection === 'function') {
        this.context.eventsTableManager.showWizardSelection(existingData);
      }
    } catch (_) {}
  }

  shouldShowStep(step) {
    if (!step.condition) return true;
    return this.evaluateCondition(step.condition);
  }

  evaluateCondition(condition) {
    if (!condition) return true;
    if (!this.wizardState || !this.wizardState.data) return false;
    try {
      const data = this.wizardState.data;
      let expression = String(condition);

      if (expression.includes('simulationMode')) {
        const simulationMode = (this.context && typeof this.context.getValue === 'function') ? this.context.getValue('simulation_mode') : 'single';
        expression = expression.replace(/\bsimulationMode\b/g, '"' + String(simulationMode) + '"');
      }

      Object.keys(data).forEach(key => {
        const value = data[key];
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp('\\b' + escapedKey + '\\b', 'g');
        const replacement = (value === undefined) ? 'undefined' : JSON.stringify(value);
        expression = expression.replace(regex, replacement);
      });

      expression = expression.replace(/'/g, '"');
      const withoutStrings = expression.replace(/"[^"\\]*"/g, '');
      if (!/^[\s0-9.\-+*/%<>=!&|()?:,]*$/.test(withoutStrings)) {
        const identifiers = withoutStrings.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
        const allowed = new Set(['true','false','null','undefined']);
        for (let i = 0; i < identifiers.length; i++) {
          if (!allowed.has(identifiers[i])) return false;
        }
      }
      // eslint-disable-next-line no-new-func
      const fn = new Function('return (' + expression + ');');
      return !!fn();
    } catch (err) {
      console.warn('Error evaluating step condition:', condition, err);
      return true;
    }
  }

  setupModalEventListeners(overlay) {
    overlay.addEventListener('click', (e) => {
      if (this._ignoreNextOverlayClick) { this._ignoreNextOverlayClick = false; return; }
      if (e.target === overlay) this.cancelWizard();
    });
    // Store bound handler so it can be removed later without leaking
    if (!this._boundKeydownHandler) {
      this._boundKeydownHandler = this.handleKeyDown.bind(this);
    }
    document.addEventListener('keydown', this._boundKeydownHandler);
  }

  handleKeyDown(e) {
    if (e.key === 'Escape' && this.isActive) {
      this.cancelWizard();
    }
  }

  validateWizardField(input, fieldName, fieldType) {
    const value = input.value;
    let validation = { isValid: true };
    this.clearWizardFieldValidation(input);
    if (!value || value.trim() === '') return;
    switch (fieldType) {
      case 'currency':
        if (ValidationUtils.validateValue('money', value) === null) validation = { isValid: false, message: 'Please enter a valid amount' };
        break;
      case 'percentage':
        if (ValidationUtils.validateValue('percentage', value) === null) validation = { isValid: false, message: 'Please enter a valid percentage' };
        break;
      default:
        if (fieldName === 'fromAge' || fieldName === 'toAge') {
          if (ValidationUtils.validateValue('age', value) === null) validation = { isValid: false, message: 'Please enter a valid age' };
        }
        break;
    }
    if (!validation.isValid) this.showWizardFieldValidation(input, validation.message);
  }

  showWizardFieldValidation(input, message, isWarningOnly = false) {
    input.classList.add(isWarningOnly ? 'validation-warning' : 'validation-error');
    const validationMessage = document.createElement('div');
    validationMessage.className = `wizard-validation-message ${isWarningOnly ? 'warning' : 'error'}`;
    validationMessage.textContent = message;
    const inputGroup = input.closest('.event-wizard-input-group');
    if (inputGroup) {
      inputGroup.parentNode.appendChild(validationMessage);
    }
  }

  clearWizardFieldValidation(input) {
    input.classList.remove('validation-error', 'validation-warning');
    const inputGroup = input.closest('.event-wizard-input-group');
    if (inputGroup) {
      const existingMessage = inputGroup.parentNode.querySelector('.wizard-validation-message');
      if (existingMessage) existingMessage.remove();
    }
  }

  cancelWizard() {
    if (this.wizardState && this.wizardState.onCancel) {
      try { this.wizardState.onCancel(); } catch (_) {}
    }
    this.closeWizard();
  }

  closeWizard() {
    const overlay = document.getElementById(this.options.overlayId);
    if (overlay) overlay.remove();
    if (this._viewportCleanup) { this._viewportCleanup(); this._viewportCleanup = null; }
    if (this._keyboardFocusHandlers) {
      const { overlay: ov, keyboardActivate, keyboardDeactivate } = this._keyboardFocusHandlers;
      try { ov.removeEventListener('focusin', keyboardActivate); } catch (_) {}
      try { ov.removeEventListener('focusout', keyboardDeactivate); } catch (_) {}
      this._keyboardFocusHandlers = null;
    }
    // Remove keydown handler using stored reference
    if (this._boundKeydownHandler) {
      try { document.removeEventListener('keydown', this._boundKeydownHandler); } catch (_) {}
      this._boundKeydownHandler = null;
    }
    this.isActive = false;
    this.currentWizard = null;
    this.currentStep = 0;
    this.wizardState = {};
    this._lastNextStep = 0;
  }

  resetWizardState() {
    this.currentWizard = null;
    this.currentStep = 0;
    this.wizardState = {};
    this.isActive = false;
    this._lastNextStep = 0;
  }
}

