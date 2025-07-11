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
    this.scrollFrozen = false;
    this.savedScrollPos = 0;
    // Track which tour type is currently being run ('full', 'quick', or 'mini').
    this.currentTourId = 'full';
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
      const rawConfig = jsyaml.load(yamlText);

      // Allow legacy "steps" key but prefer "WizardSteps"
      if (rawConfig && rawConfig.WizardSteps && !rawConfig.steps) {
        rawConfig.steps = rawConfig.WizardSteps;
      }

      // Store original config with variables processed but placeholders intact
      this.originalConfig = FormatUtils.processVariablesInObject(rawConfig);

      // Process content: use ContentRenderer for structured content, markdown links for legacy HTML
      if (this.originalConfig.steps) {
        this.originalConfig.steps = this.originalConfig.steps.map(step => {
          if (step.popover) {
            if (step.popover.contentType && typeof ContentRenderer !== 'undefined') {
              // Use ContentRenderer for structured content
              step.popover.description = ContentRenderer.render(
                step.popover.contentType,
                step.popover.content,
                { context: 'wizard', compact: true }
              );
            } else if (step.popover.description) {
              // Backward compatibility: process as HTML string
              step.popover.description = FormatUtils.processMarkdownLinks(step.popover.description);
            }
          }
          return step;
        });
      }

      // Create working config with age/year placeholders processed
      this.config = JSON.parse(JSON.stringify(this.originalConfig));
      if (this.config.steps) {
        this.config.steps = this.config.steps.map(step => {
          if (step.popover) {
            if (step.popover.contentType && typeof ContentRenderer !== 'undefined') {
              // Re-render with ContentRenderer to process age/year placeholders
              step.popover.description = ContentRenderer.render(
                step.popover.contentType,
                this.processAgeYearInContent(step.popover.content),
                { context: 'wizard', compact: true }
              );
            } else if (step.popover.description) {
              // Process age/year placeholders in legacy HTML descriptions
              step.popover.description = FormatUtils.replaceAgeYearPlaceholders(step.popover.description);
            }
          }
          return step;
        });
      }
    } catch (error) {
      console.error('Failed to load wizard configuration:', error);
    }
  }

  /**
   * Recursively processes age/year placeholders in structured content
   * @param {Object|Array|string} content - Content to process
   * @returns {Object|Array|string} Content with placeholders replaced
   */
  processAgeYearInContent(content) {
    if (typeof content === 'string') {
      return FormatUtils.replaceAgeYearPlaceholders(content);
    }
    if (Array.isArray(content)) {
      return content.map(item => this.processAgeYearInContent(item));
    }
    if (content && typeof content === 'object') {
      const processed = {};
      for (const [key, value] of Object.entries(content)) {
        processed[key] = this.processAgeYearInContent(value);
      }
      return processed;
    }
    return content;
  }

  getEventTableState() {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return { isEmpty: true };
    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) return { isEmpty: true };
    const focusedRow = this.lastFocusedField ? Array.from(rows).find(row => row.contains(this.lastFocusedField)) : null;
    const row = focusedRow || rows[0];
    const rowId = row.dataset.rowId;

    const typeInputHidden = row.querySelector(`input.event-type`);
    const nameInput = row.querySelector(`input#EventName_${rowId}`);
    const amountInput = row.querySelector(`input#EventAmount_${rowId}`);
    const fromAgeInput = row.querySelector(`input#EventFromAge_${rowId}`);
    const toAgeInput = row.querySelector(`input#EventToAge_${rowId}`);
    const rateInput = row.querySelector(`input#EventRate_${rowId}`);
    const matchInput = row.querySelector(`input#EventMatch_${rowId}`);

    const hasNonDefaultValues = 
        (typeInputHidden && typeInputHidden.value && typeInputHidden.value !== "NOP") ||
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
        eventType: typeInputHidden ? typeInputHidden.value : null,
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

    // Additional check for opacity and dimensions
    if (style.opacity === '0' ||
        element.offsetWidth === 0 ||
        element.offsetHeight === 0) {
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

    // Special case for header element: always consider it visible if it exists
    // since it might be position: fixed on mobile and standard visibility checks
    // might not work correctly
    if (element.tagName && element.tagName.toLowerCase() === 'header') {
      return true;
    }

    return true;
  }

  filterValidSteps(stepsOverride = null) {
    // Decide which set of steps we are filtering
    const sourceSteps = stepsOverride || (this.config ? this.config.steps : []);
    if (!sourceSteps || sourceSteps.length === 0) return [];

    // Deep-copy to prevent accidental mutation of the original config
    const stepsCopy = JSON.parse(JSON.stringify(sourceSteps));

    this.tableState = this.getEventTableState();

    // Header buttons that might live inside the burger menu on mobile
    const burgerMenuHeaderButtons = [
      '#saveSimulation',
      '#loadSimulation',
      '#loadDemoScenarioHeader',
      '#startWizard'
    ];

    return stepsCopy.filter(step => {
      // 1) Tour visibility filtering via `tours` key
      if (step.tours && !step.tours.includes(this.currentTourId)) {
        return false;
      }

      // Steps without elements are always valid
      if (!step.element) return true;

      // Always keep header-button steps (we will open the burger menu on demand)
      if (burgerMenuHeaderButtons.includes(step.element)) {
        // Make sure the element exists in the DOM at least once
        return document.querySelector(step.element) !== null;
      }

      if (!step.element.includes('Event')) {
        // Special case for data-section: find the visible element and update selector
        if (step.element === '.data-section') {
          const elements = document.querySelectorAll(step.element);
          const visibleElement = Array.from(elements).find(el => this.isElementVisible(el));
          if (visibleElement) {
            if (visibleElement.id) {
              step.element = `#${visibleElement.id}`;
            }
            return true;
          }
          return false;
        }

        // Overview elements (major UI sections) should always be valid if they exist
        const overviewElements = [
          'header',
          '.parameters-section',
          '.events-section',
          '.graphs-section',
          '.data-section'
        ];

        if (overviewElements.includes(step.element)) {
          const element = document.querySelector(step.element);
          return element !== null;
        }

        // For other elements (form fields, buttons), check both existence and visibility
        const element = document.querySelector(step.element);
        return element !== null && this.isElementVisible(element);
      } else {
        // Preserve the static #EventType selector so it highlights the dropdown wrapper we assign.
        step.element = step.element.replace(/Event([A-Za-z]+)/, `Event$1_${this.tableState.rowId}`);
        if (this.tableState.isEmpty) {
          return false;
        } else {
          if (this.tableState.rowIsEmpty) {
            return !step.eventTypes && !step.noEventTypes;
          } else {
            if (step.eventTypes) {
              return step.eventTypes.includes(this.tableState.eventType);
            }
            if (step.noEventTypes) {
              return !step.noEventTypes.includes(this.tableState.eventType);
            }
          }
        }
      }
    });
  }

  // Freeze page scroll while wizard is active
  freezeScroll() {
    if (this.scrollFrozen) return;
    this.savedScrollPos = window.scrollY || window.pageYOffset;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${this.savedScrollPos}px`;
    document.body.style.width = '100%';
    // Compensate for scrollbar to avoid content shift
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }
    this.scrollFrozen = true;
  }

  // Restore page scroll state when wizard ends
  unfreezeScroll() {
    if (!this.scrollFrozen) return;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.paddingRight = '';
    window.scrollTo(0, this.savedScrollPos || 0);
    this.scrollFrozen = false;
    this.savedScrollPos = null;
  }

  async start(fromStep = undefined) {
    if (!this.config) {
      await this.loadConfig();
    } else {
      // Refresh working config from original with current age/year mode
      this.config = JSON.parse(JSON.stringify(this.originalConfig));
      if (this.config.steps) {
        this.config.steps = this.config.steps.map(step => {
          if (step.popover) {
            if (step.popover.contentType && typeof ContentRenderer !== 'undefined') {
              // Re-render with ContentRenderer to process age/year placeholders
              step.popover.description = ContentRenderer.render(
                step.popover.contentType,
                this.processAgeYearInContent(step.popover.content),
                { context: 'wizard', compact: true }
              );
            } else if (step.popover.description) {
              // Process age/year placeholders in legacy HTML descriptions
              step.popover.description = FormatUtils.replaceAgeYearPlaceholders(step.popover.description);
            }
          }
          return step;
        });
      }
    }

    // Mark tour type and filter steps accordingly
    this.currentTourId = 'full';
    this.validSteps = this.filterValidSteps();

    // Replace old welcome/how-to steps with welcome modal triggers
    this.validSteps = this.validSteps.map(step => {
      if (!step.element && step.popover &&
          (step.popover.popoverClass === 'welcome-popover' ||
           step.popover.popoverClass === 'howto-popover')) {
        // Replace with a special step that triggers the welcome modal
        return {
          element: 'body', // Use body as a dummy element
          popover: {
            title: 'Welcome',
            description: 'Loading welcome information...',
            showButtons: ['close'],
            onPopoverRender: () => {
              // When this step is shown, immediately show the welcome modal instead
              setTimeout(() => {
                this.finishTour();
                const webUI = WebUI.getInstance();
                if (webUI) {
                  webUI.showWelcomeModal();
                }
              }, 100);
            }
          }
        };
      }
      return step;
    });

    let startingStepIndex = fromStep !== undefined ? fromStep : (this.lastFocusedWasInput ? (this.getLastFocusedFieldIndex() || this.lastStepIndex) : this.lastStepIndex);
    if (startingStepIndex > 1 && startingStepIndex < this.validSteps.length && !this.isMobile) {
      const element = document.querySelector(this.validSteps[startingStepIndex].element);
      if (element) {
        // Only focus on desktop to avoid keyboard issues on mobile
        element.focus();
      }
    }

    this.tour = this.driver({
      showProgress: false,
      animate: true,
      smoothScroll: true,
      overlayOpacity: 0.5,
      allowKeyboardControl: true,
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
          this.tour.moveNext();
        } else {
          this.finishTour();
        }
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

        // Add 'done' class dynamically based on button label to suppress arrows
        const nextBtn = document.querySelector('.driver-popover-next-btn');
        if (nextBtn && nextBtn.textContent.trim().toLowerCase() === 'done') {
          nextBtn.classList.add('done');
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

  /**
   * Internal helper that launches a Driver.js tour with the provided steps.
   * It handles burger-menu integration, keyboard hooks, scroll freezing, and
   * mobile keyboard tweaks in one place so the various public tour flavours
   * can share the same engine.
   *
   * @param {Array} steps – already processed WizardSteps to show.
   * @param {number} [startingIndex=0] – optional starting step.
   */
  async _runTour(steps, startingIndex = 0) {
    if (!steps || steps.length === 0) {
      console.warn('_runTour called with no steps');
      return;
    }

    // Use filterValidSteps to adapt selectors (events table IDs, etc.)
    const originalSteps = this.config ? this.config.steps : null;
    if (this.config) {
      this.config.steps = steps; // temporarily swap so filterValidSteps knows mapping
    }

    this.validSteps = this.filterValidSteps(steps);

    if (this.config && originalSteps) {
      this.config.steps = originalSteps; // restore
    }

    if (this.validSteps.length === 0) {
      console.warn('No valid steps after filtering');
      return;
    }

    // ------------------------------------------------------------------
    // Final button tweaks for mini tours (must run AFTER filtering so the
    // visible first/last steps are correct even if some fields are hidden).
    // ------------------------------------------------------------------
    if (this.currentTourId === 'mini') {
      if (this.validSteps.length === 1) {
        const step = this.validSteps[0];
        if (step.popover) {
          step.popover.showButtons = ['next'];
          step.popover.nextBtnText = ['Done'];
        }
      } else {
        const first = this.validSteps[0];
        const last  = this.validSteps[this.validSteps.length - 1];
        if (first && first.popover) {
          first.popover.showButtons = ['next'];
        }
        if (last && last.popover) {
          last.popover.showButtons = ['prev', 'next'];
          last.popover.nextBtnText = ['Done'];
        }
      }
    }

    // Prepare Driver.js config – progress bar only for non-mini tours
    const driverCfg = {
      showProgress: this.currentTourId !== 'mini',
      animate: true,
      smoothScroll: true,
      overlayOpacity: 0.5,
      allowKeyboardControl: true,
      steps: this.validSteps,
      onNextClick: async () => {
        const nextIdx = this.tour.getActiveIndex() + 1;
        if (nextIdx < this.validSteps.length) {
          const nextEl = document.querySelector(this.validSteps[nextIdx].element);
          await this.handleBurgerMenuBeforeStep(nextEl, nextIdx);
          if (nextEl && !this.isMobile) nextEl.focus();
          this.tour.moveNext();
        } else {
          this.finishTour();
        }
      },
      onPrevClick: async () => {
        const prevIdx = this.tour.getActiveIndex() - 1;
        if (prevIdx >= 0) {
          const prevEl = document.querySelector(this.validSteps[prevIdx].element);
          await this.handleBurgerMenuBeforeStep(prevEl, prevIdx);
          if (prevEl && !this.isMobile) prevEl.focus();
        }
        this.tour.movePrevious();
      },
      onDestroyStarted: () => this.finishTour(),
      onHighlighted: (el) => {
        this.cleanupInlineStyles();
        this.handleBurgerMenuSimple(el);

        // Add 'done' class dynamically based on button label to suppress arrows
        const nextBtn = document.querySelector('.driver-popover-next-btn');
        if (nextBtn && nextBtn.textContent.trim().toLowerCase() === 'done') {
          nextBtn.classList.add('done');
        }
      }
    };

    this.tour = this.driver(driverCfg);

    // Keyboard & mobile tweaks
    document.addEventListener('keydown', this.handleKeys);
    this.disableMobileKeyboard();
    this.wizardActive = true;
    if (this.isMobile) {
      document.body.setAttribute('data-wizard-active', 'true');
      document.addEventListener('focusin', this.preventFocus, true);
      document.addEventListener('touchstart', this.preventTouch, true);
      document.addEventListener('click', this.preventTouch, true);
    }

    // Handle burger menu for the initial step
    const initialElement = document.querySelector(this.validSteps[startingIndex].element);
    await this.handleBurgerMenuBeforeStep(initialElement, startingIndex);

    this.tour.drive(startingIndex);
  }

  followFocus(event) {
    if (!event.target.matches('#startWizard') && 
        !event.target.closest('#mobileMenuToggle, #mobileMenu')) {
      if (event.target.matches('input, textarea, select') || event.target.classList.contains('visualization-control')) {
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
    // Skip focus reset if the click originates from the mobile burger menu or its toggle
    const isBurgerMenuClick = event.target.closest('#mobileMenuToggle, #mobileMenu');

    // Clear field tracking when clicking on non-input elements that are not part of the burger menu
    // This ensures clicks on non-focusable elements reset last focused state
    if (!isBurgerMenuClick &&
        !event.target.matches('input, textarea, select') &&
        !event.target.classList.contains('visualization-control')) {
      this.lastFocusedField = null;
      this.lastFocusedWasInput = false;
    }

    // Close the wizard if the click/tap is outside the tour popover
    if (this.wizardActive) {
      const popoverEl = document.querySelector('.driver-popover');
      if (popoverEl && !event.target.closest('.driver-popover')) {
        this.finishTour();
      }
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
      this.unfreezeScroll();
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
    
    // Restore page scroll after wizard finishes
    this.unfreezeScroll();
    
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

      // Try to trigger the custom "next" action for single-step overview
      // tours ("Fields Help" button). Depending on the tour engine version
      // we may not have direct access to the callback via tour.options, so
      // fall back to simulating a click on the visible next button.
      const handledEnter = (() => {
        if (this.tour && typeof this.tour.options?.onNextClick === 'function') {
          this.tour.options.onNextClick();
          return true;
        }
        const btn = document.querySelector('.driver-popover-next-btn');
        if (btn) { btn.click(); return true; }
        return false;
      })();
      if (handledEnter) {
        event.preventDefault();
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
        } else {
          // No further step available. Ignore "previous" on the first step,
          // otherwise treat navigation keys as a shortcut to activate the
          // primary action on the current popover (e.g., "Fields Help").
          if (direction === 'previous') {
            return; // Nothing to do when already at the first step.
          }
          // We are likely on a single-step overview (no real navigation
          // possible). Treat navigation keys as a shortcut to activate the
          // "Fields Help" button.
          const invoked = (() => {
            if (this.tour && typeof this.tour.options?.onNextClick === 'function') {
              this.tour.options.onNextClick();
              return true;
            }
            const btn = document.querySelector('.driver-popover-next-btn');
            if (btn) { btn.click(); return true; }
            return false;
          })();
          if (invoked) return; // action handled
        }
      }
    }
  }

  handleVerticalNavigation(direction) {
    if (this.lastFocusedField && (this.lastFocusedField.matches('input, select') || this.lastFocusedField.classList.contains('visualization-control'))) {
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
        this.unfreezeScroll();
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
        this.unfreezeScroll();
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
        this.unfreezeScroll();
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
        this.unfreezeScroll();
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
        // Freeze page scroll while burger menu is visible
        this.freezeScroll();
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
        this.unfreezeScroll();
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
        this.unfreezeScroll();
      }
    }
  }

  /**
   * Return a deep-cloned list of steps filtered by tourId and optional card.
   * Age/year placeholders are replaced, and markdown links already processed
   * when the YAML was loaded.
   *
   * @param {string} tourId – 'full' | 'quick' | 'mini' | <custom>
   * @param {string|null} card – card identifier when tourId === 'mini'
   */
  _getFilteredSteps(tourId, card = null) {
    if (!this.originalConfig || !this.originalConfig.steps) {
      console.warn('_getFilteredSteps called before YAML was loaded');
      return [];
    }

    const stepsCopy = this.originalConfig.steps.map(step => JSON.parse(JSON.stringify(step)));

    const filtered = stepsCopy.filter(step => {
      // Filter by tours key
      if (step.tours && !step.tours.includes(tourId)) return false;

      // Additional card filtering for mini-tours
      if (tourId === 'mini' && card) {
        if (step.card) return step.card === card;
        // If YAML not yet tagged with card, skip to avoid showing unrelated steps
        return false;
      }

      return true;
    });

    // Process content with age/year placeholders for UI display
    filtered.forEach(step => {
      if (step.popover) {
        if (step.popover.contentType && typeof ContentRenderer !== 'undefined') {
          // Re-render with ContentRenderer to process age/year placeholders
          step.popover.description = ContentRenderer.render(
            step.popover.contentType,
            this.processAgeYearInContent(step.popover.content),
            { context: 'wizard', compact: true }
          );
        } else if (step.popover.description) {
          // Process age/year placeholders in legacy HTML descriptions
          step.popover.description = FormatUtils.replaceAgeYearPlaceholders(step.popover.description);
        }
      }
    });

    return filtered;
  }

  async startTour(tourId, card = null) {
    if (!tourId) {
      console.warn('startTour requires a tourId');
      return;
    }

    if (!this.config) {
      await this.loadConfig();
    }

    // ------------------------------------------------------------------
    // Modern unified path using YAML tags + _runTour()
    // ------------------------------------------------------------------

    if (tourId === 'full' || tourId === 'quick' || tourId === 'mini') {
      this.currentTourId = tourId;

      // For mini tours ensure card is specified
      if (tourId === 'mini' && !card) {
        console.warn('startTour("mini") requires a card parameter');
        return;
      }

      const steps = this._getFilteredSteps(tourId, card);

      if (steps.length === 0) {
        console.warn(`No steps found for tour "${tourId}"${card ? ` and card "${card}"` : ''}`);
        return;
      }

      // Mini-tour tweaks: show a "Done" button on the last (or only) step.
      if (tourId === 'mini') {
        if (steps.length === 1) {
          const step = steps[0];
          if (step && step.popover) {
            step.popover.showButtons = ['next'];
            step.popover.nextBtnText = ['Done'];
            step.popover.nextBtnClass = ['done'];
          }
        } else {
          // First step: only "Next" (overview) – no Close button required.
          if (steps[0] && steps[0].popover) {
            steps[0].popover.showButtons = ['next'];
          }

          // Last step: Prev + Done.
          const last = steps[steps.length - 1];
          if (last && last.popover) {
            last.popover.showButtons = ['prev', 'next'];
            last.popover.nextBtnText = ['Done'];
            last.popover.nextBtnClass = ['done'];
          }
        }
      }

      await this._runTour(steps, 0);
      return;
    }

    console.warn(`Unknown tourId: ${tourId}`);
  }
}
