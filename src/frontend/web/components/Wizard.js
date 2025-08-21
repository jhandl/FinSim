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
    // In unit tests or early boot, selector stubs may not implement querySelectorAll.
    // Fall back gracefully instead of throwing.
    let rows = [];
    if (tbody && typeof tbody.querySelectorAll === 'function') {
      // Only consider rows that are actually visible to the user. Hidden rows
      // (e.g. P2 events while in single mode) must be ignored so the wizard does
      // not target elements that are not present on screen.
      const allRows = Array.from(tbody.querySelectorAll('tr'));
      rows = allRows.filter(row => this.isElementVisible(row));
    }
    
    if (rows.length === 0) {
      // Accordion fallback: table rows are hidden, derive state from accordion
      try {
        const mode = this.getCurrentEventsMode ? this.getCurrentEventsMode() : 'table';
        if (mode === 'accordion') {
          const webUI = (typeof WebUI !== 'undefined') ? WebUI.getInstance() : null;
          const mgr = webUI && webUI.eventAccordionManager ? webUI.eventAccordionManager : null;
          const events = (mgr && Array.isArray(mgr.events)) ? mgr.events : [];
          if (events.length > 0) {
            let chosen = null;
            try {
              // Prefer the accordion item that currently holds focus
              const active = document.activeElement;
              const focusedItem = active ? active.closest && active.closest('.events-accordion-item') : null;
              if (focusedItem) {
                const accId = focusedItem.getAttribute('data-accordion-id') || '';
                chosen = events.find(e => e.accordionId === accId) || null;
              }
              if (!chosen) {
                // Next, prefer the currently expanded accordion item (if any)
                const expandedAcc = document.querySelector('.events-accordion-item .accordion-item-content.expanded');
                const expandedItem = expandedAcc ? expandedAcc.closest('.events-accordion-item') : null;
                if (expandedItem) {
                  const accId = expandedItem.getAttribute('data-accordion-id') || '';
                  chosen = events.find(e => e.accordionId === accId) || null;
                }
              }
            } catch (_) {}
            if (!chosen) chosen = events[0];

            const rowId = chosen && chosen.rowId ? chosen.rowId : null;
            const eventType = chosen && chosen.type ? chosen.type : null;
            const rowIsEmpty = !(
              (eventType && eventType !== 'NOP') ||
              (chosen && (
                (chosen.name && chosen.name.trim() !== '') ||
                (chosen.amount && chosen.amount.trim() !== '') ||
                (chosen.fromAge && chosen.fromAge.trim() !== '') ||
                (chosen.toAge && chosen.toAge.trim() !== '') ||
                (chosen.rate && chosen.rate.trim() !== '') ||
                (chosen.match && chosen.match.trim() !== '')
              ))
            );

            const state = {
              isEmpty: false,
              rows: events.length,
              rowIsEmpty,
              eventType,
              focusedRow: null,
              rowId
            };
            return state;
          }
        }
      } catch (_) {}
      return { isEmpty: true };
    }
    let focusedRow = this.lastFocusedField ? Array.from(rows).find(row => row.contains(this.lastFocusedField)) : null;

    // Accordion mode: if the last focused field is inside an accordion item (and not in the hidden table),
    // derive the corresponding table row by matching the numeric suffix.
    if (!focusedRow && this.lastFocusedField) {
      const accItem = this.lastFocusedField.closest('.events-accordion-item');
      if (accItem && accItem.getAttribute('data-accordion-id')) {
        const accIdStr = accItem.getAttribute('data-accordion-id') || accItem.id || '';
        const m = accIdStr.match(/(\d+)$/);
        if (m && m[1] !== undefined) {
          const idx = parseInt(m[1],10)+1;
          const derivedRowId = `row_${idx}`;  // accordion-item is zero-based; table row ids start at 1
          focusedRow = Array.from(rows).find(r => r.dataset.rowId === derivedRowId) || null;
          
        }
      }
    }

    // BEGIN ADD: Fallback to first expanded accordion item when no lastFocusedField is available
    if (!focusedRow) {
      const expandedAcc = document.querySelector('.events-accordion-item .accordion-item-content.expanded');
      const expandedItem = expandedAcc ? expandedAcc.closest('.events-accordion-item') : null;
      if (expandedItem && expandedItem.getAttribute('data-accordion-id')) {
        const accIdStr = expandedItem.getAttribute('data-accordion-id');
        const m = accIdStr.match(/(\d+)$/);
        if (m && m[1] !== undefined) {
          const idx = parseInt(m[1], 10) + 1; // accordion-item is zero-based; table rows are 1-based
          const derivedRowId = `row_${idx}`;
          focusedRow = Array.from(rows).find(r => r.dataset.rowId === derivedRowId) || focusedRow;
        }
      }
    }
    // END ADD


    const row = focusedRow || rows[0];
    const rowId = row.dataset.rowId;
    

    const typeInputHidden = row.querySelector(`input.event-type`);
    const nameInput = row.querySelector(`input#EventAlias_${rowId}`);
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

      // Use the *unfiltered* master list to build the mapping so it is always available regardless of tour type
      const masterSteps = (this.originalConfig && this.originalConfig.steps) ? this.originalConfig.steps : sourceSteps;
      const accordionLookup = {};
      masterSteps.forEach((st) => {
        if (st['accordion-element'] && st.element && st.element.startsWith('#Event')) {
          const fld = st.element.replace(/^#(Event[A-Za-z]+)$/,'$1');
          accordionLookup[fld] = st['accordion-element'];
        }
      });

    // Determine current view mode for later checks (accordion vs table)
    const currentMode = this.getCurrentEventsMode ? this.getCurrentEventsMode() : 'table';
    // NOTE: No auto-expansion here; we'll expand lazily when we actually navigate to the first accordion field.

    this.tableState = this.getEventTableState();
    

    // Header buttons that might live inside the burger menu on mobile
    const burgerMenuHeaderButtons = [
      '#saveSimulation',
      '#loadSimulation',
      '#loadDemoScenarioHeader',
      '#startWizard'
    ];

    const filteredSteps = stepsCopy.filter(step => {
      // 1) Tour visibility filtering via `tours` key
      if (step.tours && !step.tours.includes(this.currentTourId)) {
        return false;
      }

      // BEGIN ADD: View mode filtering via `eventModes` key
      if (step.eventModes && !step.eventModes.includes(currentMode)) {
        return false;
      }

      // Swap selector when accordion mode is active and alternative provided
        if (currentMode === 'accordion' && step['accordion-element']) {
          step.element = step['accordion-element'];
          // For event type steps, ensure we target the row-specific toggle id
          if (step.element.startsWith('#AccordionEventTypeToggle') && !step.element.includes('_')) {
            const st = this.getEventTableState();
            if (st && st.rowId) {
              step.element = `#AccordionEventTypeToggle_${st.rowId}`;
            }
          }
        }
      // END ADD

      // Steps without elements are always valid
      if (!step.element) return true;

      // Always keep header-button steps (we will open the burger menu on demand)
      if (burgerMenuHeaderButtons.includes(step.element)) {
        // Make sure the element exists in the DOM at least once
        return document.querySelector(step.element) !== null;
      }

      if (!step.element.includes('Event') || step.element.startsWith('#AccordionEventTypeToggle')) {
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

        // For other elements (form fields, buttons), handle accordion fields specially
        if (currentMode === 'accordion' && (step.element.startsWith('#AccordionEventTypeToggle') || step.element.startsWith('.accordion-edit-'))) {
          // Always scope selector to current accordion item so we highlight the correct row
          try {
            // Determine the correct accordion index for the current row. We cannot rely on
            // the numeric suffix of the table rowId because rows can be deleted and
            // recreated, leaving gaps (e.g. row_1 removed, new first row is row_2). Instead
            // we locate the actual DOM <tr> element and use its position within the table.
            let accIndex = 0;
            if (this.tableState && this.tableState.rowId) {
              const tbody = document.querySelector('#Events tbody');
              if (tbody && typeof tbody.querySelectorAll === 'function') {
                const rowsArr = Array.from(tbody.querySelectorAll('tr'));
                const rowEl   = rowsArr.find(r => r.dataset.rowId === this.tableState.rowId);
                if (rowEl) {
                  accIndex = rowsArr.indexOf(rowEl);
                } else {
                  // Fallback to numeric part of rowId if element lookup failed
                  const m = this.tableState.rowId.match(/row_(\d+)/);
                  accIndex = m && m[1] ? parseInt(m[1], 10) - 1 : 0;
                }
              } else {
                // Environment without querySelectorAll (e.g., unit tests): use numeric suffix
                const m = this.tableState.rowId.match(/row_(\d+)/);
                accIndex = m && m[1] ? parseInt(m[1], 10) - 1 : 0;
              }
            }
            const accId = `accordion-item-${accIndex}`;
            if (step.element.startsWith('.')) {
              // Avoid double-prefixing
              if (!step.element.startsWith('.events-accordion-item[')) {
                step.element = `.events-accordion-item[data-accordion-id="${accId}"] ${step.element}`;
              }
            } else if (step.element.startsWith('#AccordionEventTypeToggle') && !step.element.includes('_')) {
              // Target the current row's toggle specifically
              if (this.tableState && this.tableState.rowId) {
                step.element = `#AccordionEventTypeToggle_${this.tableState.rowId}`;
              }
            }
            
          } catch(err) {
            console.warn('Wizard: selector scoping failed', err);
          }

          // Decide whether to keep this accordion field step
          if (this.tableState.rowIsEmpty) {
            if (this.tableState.rows && this.tableState.rows > 1) {
              // Skip only generic guidance when other events exist
              if (!step.eventTypes && !step.noEventTypes) {
                return false;
              }
            } else {
              // Single (empty) event row – keep generic guidance
              if (!step.eventTypes && !step.noEventTypes) {
                return true;
              }
            }
            // Fall through so event-specific guidance for the empty row is evaluated below
          }
          // Non-empty row: keep only if the step explicitly targets this event type
          if (step.eventTypes) {
            return step.eventTypes.includes(this.tableState.eventType);
          }
          if (step.noEventTypes) {
            return !step.noEventTypes.includes(this.tableState.eventType);
          }
          // Generic field (no event type restrictions): keep for dedup stage.
          // A later pass will collapse duplicates preferring event-specific when available.
          return true;
        }

        // In accordion view handle field steps specially: 
        if (currentMode === 'accordion' && (step.element.includes('.accordion-edit-') || step.element.startsWith('#AccordionEventTypeToggle'))) {
          const el = document.querySelector(step.element);
          if (!el) {
            // Field not rendered yet – keep it; ensureFirstAccordionExpanded will create it later
            
            return true;
          }
          // Element exists: include only if visible (the EventSummaryRenderer hides non-applicable fields via display:none)
          
          return this.isElementVisible(el);
        }

        const element = document.querySelector(step.element);
        const exists = element !== null;
        const visible = exists ? this.isElementVisible(element) : false;
        return exists && visible;
      } else {
        // Map table selector to visible accordion selector when in accordion view
          if (currentMode === 'accordion') {
            const m = step.element.match(/^#(Event[A-Za-z]+)/);
            if (m) {
              const field = m[1];
              const accSel = accordionLookup[field];
              if (accSel) {
                // Replace selector with accordion equivalent
                step.element = accSel;
                // Special-case event type toggle: append current rowId to target the
                // row-specific toggle element (e.g. #AccordionEventTypeToggle_row_3)
                if (step.element.startsWith('#AccordionEventTypeToggle') && !step.element.includes('_')) {
                  if (this.tableState && this.tableState.rowId) {
                    step.element = `#AccordionEventTypeToggle_${this.tableState.rowId}`;
                  }
                }
              } else {
                // No accordion counterpart – skip this step entirely
                return false; // filter out
              }
            }
          }
          // Preserve the static #EventType selector so it highlights the dropdown wrapper we assign.
          // Only append the rowId once to prevent duplicate suffixes when filterValidSteps is called multiple times.
          if (!step.element.includes(`_${this.tableState.rowId}`)) {
            step.element = step.element.replace(/Event([A-Za-z]+)/, `Event$1_${this.tableState.rowId}`);
          }
          
        if (this.tableState.isEmpty) {
          return false;
        } else {
          if (this.tableState.rowIsEmpty) {
            if (this.tableState.rows && this.tableState.rows > 1) {
              // When other events exist, skip generic guidance for empty rows
              if (!step.eventTypes && !step.noEventTypes) {
                return false;
              }
            } else {
              // Only event row in the table – allow generic guidance
              if (!step.eventTypes && !step.noEventTypes) {
                return true;
              }
              // For single empty rows, exclude event-specific guidance to avoid duplicates
              if (step.eventTypes || step.noEventTypes) {
                return false;
              }
            }
            // Evaluate event-specific or exclusion rules
            if (step.eventTypes) {
              return step.eventTypes.includes(this.tableState.eventType);
            }
            if (step.noEventTypes) {
              return !step.noEventTypes.includes(this.tableState.eventType);
            }
            return true;
          } else {
            if (step.eventTypes) {
              return step.eventTypes.includes(this.tableState.eventType);
            }
            if (step.noEventTypes) {
              return !step.noEventTypes.includes(this.tableState.eventType);
            }
          }

          // Robustness: if targeting a specific event type toggle, ensure it's present before returning
          // Note: cannot use await in this sync path; instead just no-op if missing.
        }
      }
    });

    

          // BEGIN ADD: Deduplicate accordion field steps so only one per field remains (prefer event-specific for current row)
      if (currentMode === 'accordion') {
        const fieldMap = {}; // key -> step
        const deduped = [];
        const getFieldKey = (sel) => {
          if (!sel) return null;
          // Strip accordion prefix if present
          sel = sel.replace(/\.events-accordion-item\[.*?\]\s+/, '');
          let m = sel.match(/\.accordion-edit-([a-z]+)/);
          if (m && m[1]) return `edit-${m[1]}`;
          m = sel.match(/#AccordionEventTypeToggle_row_\d+/);
          if (m) return 'event-type-toggle';
          return null;
        };

        filteredSteps.forEach(step => {
          const key = getFieldKey(step.element);
          if (!key) {
            deduped.push(step);
            return;
          }
          const existing = fieldMap[key];
          if (!existing) {
            fieldMap[key] = step;
            deduped.push(step);
          } else {
            const existingMatches = existing.eventTypes && existing.eventTypes.includes(this.tableState.eventType);
            const stepMatches = step.eventTypes && step.eventTypes.includes(this.tableState.eventType);
            // If both are generic or both match current event, keep the first (stable)
            // If existing is generic and step is event-specific, always prefer event-specific
            if (!existingMatches && stepMatches) {
              const idx = deduped.indexOf(existing);
              if (idx !== -1) deduped[idx] = step;
              fieldMap[key] = step;
            }
          }
        });

        // Re-scope every accordion field selector after deduping to ensure correct prefix
        deduped.forEach(st => {
          if (st.element && (st.element.startsWith('#AccordionEventTypeToggle_') || st.element.includes('.accordion-edit-'))) {
            try {
              // Calculate accordion index robustly in case the first table row (row_1) was
              // deleted and recreated. We search for the actual <tr> element in the table to
              // find its zero-based position which matches the accordion index.
              let accIdx = 0;
              if (this.tableState && this.tableState.rowId) {
                const tbody = document.querySelector('#Events tbody');
                if (tbody && typeof tbody.querySelectorAll === 'function') {
                  const rowsArr = Array.from(tbody.querySelectorAll('tr'));
                  const rowEl   = rowsArr.find(r => r.dataset.rowId === this.tableState.rowId);
                  if (rowEl) {
                    accIdx = rowsArr.indexOf(rowEl);
                  } else {
                    const m = this.tableState.rowId.match(/row_(\d+)/);
                    accIdx = m && m[1] ? parseInt(m[1], 10) - 1 : 0;
                  }
                } else {
                  const m = this.tableState.rowId.match(/row_(\d+)/);
                  accIdx = m && m[1] ? parseInt(m[1], 10) - 1 : 0;
                }
              }
              const accId = `accordion-item-${accIdx}`;
              if (st.element.startsWith('.')) {
                if (!st.element.startsWith('.events-accordion-item[')) {
                  st.element = `.events-accordion-item[data-accordion-id="${accId}"] ${st.element}`;
                }
              }
            } catch(e) { /* ignore */ }
          }
        });

        return deduped;
      }

      return filteredSteps;
  }

  // BEGIN ADD: Ensure first accordion item expanded for wizard selectors
  async ensureFirstAccordionExpanded() {
    try {
      const webUI = WebUI.getInstance();
      if (!webUI || !webUI.eventAccordionManager) return;
      const mgr = webUI.eventAccordionManager;
      if (!mgr.events || mgr.events.length === 0) return;
      // If at least one item is already expanded we do nothing – avoids opening the first row when
      // the user is working in a different accordion item.
      if (mgr.expandedItems && mgr.expandedItems.size > 0) {
        return;
      }
      const firstEvent = mgr.events[0];
      if (!firstEvent || !firstEvent.accordionId) return;
      mgr.toggleAccordionItem(firstEvent.accordionId);
      // Wait for the CSS transition (max-height 0.3s) to finish so that
      // Driver.js calculates the correct bounding box for the highlight.
      await new Promise(resolve => setTimeout(resolve, 350));

      this._autoExpandedAccordionId = firstEvent.accordionId;
      this._accordionExpandedByWizard = true;
    } catch (err) {
      console.error('Wizard: failed to auto-expand accordion event', err);
    }
  }
  // END ADD

  // BEGIN ADD: helper to collapse auto-expanded accordion
  collapseAutoExpandedAccordion() {
    if (!this._accordionExpandedByWizard || !this._autoExpandedAccordionId) return;
    try {
      const webUI = WebUI.getInstance();
      if (webUI && webUI.eventAccordionManager) {
        const mgr = webUI.eventAccordionManager;
        if (mgr.expandedItems && mgr.expandedItems.has(this._autoExpandedAccordionId)) {
          // Guard against missing DOM nodes after rerenders
          const accId = this._autoExpandedAccordionId;
          const el = document.querySelector(`[data-accordion-id="${accId}"]`);
          if (el) {
            mgr.toggleAccordionItem(accId);
          } else {
            // Element no longer exists; clean up manager state silently
            try { mgr.expandedItems.delete(accId); } catch (_) {}
          }
        }
      }
    } catch (err) {
      console.error('Wizard: error collapsing accordion', err);
    }
    this._autoExpandedAccordionId = null;
    this._accordionExpandedByWizard = false;
  }
  // END ADD

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





  getLastFocusedFieldIndex() {
    if (!this.lastFocusedField) {
      return null;
    }

    let exactMatchIndex = -1;
    let containerMatchIndex = -1;

    // Iterate over all steps and evaluate *all* matching elements, not just the first one.
    outer: for (let i = 0; i < this.validSteps.length; i++) {
      const step = this.validSteps[i];
      const elementSelector = step.element;
      if (!elementSelector) continue;

      // There can be multiple elements matching the selector (one per accordion row)
      const stepElements = document.querySelectorAll(elementSelector);
      if (!stepElements || stepElements.length === 0) continue;

      for (const el of stepElements) {
        // Exact match takes absolute priority
        if (el === this.lastFocusedField) {
          exactMatchIndex = i;
          break outer; // we found the best possible match
        }

        // Fallback: the element contains the focused field
        if (containerMatchIndex === -1 && el.contains && el.contains(this.lastFocusedField)) {
          containerMatchIndex = i;
          // Keep looking – maybe we find an exact match later
        }
      }
    }

    const finalIndex = exactMatchIndex >= 0 ? exactMatchIndex : containerMatchIndex;
    return finalIndex >= 0 ? finalIndex : null;
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
    // CORRECT FIX: We need filterValidSteps() for selector adaptation and visibility checks
    // But we should NOT do the tour-type filtering again since steps are already filtered by type
    // The issue is that full/help tours call filterValidSteps() twice with different contexts

    // For full/help tours: steps are already filtered by filterValidSteps() in start()
    // For quick/mini tours: steps are filtered by _getFilteredSteps() but need filterValidSteps() for selectors

    if (this.currentTourId === 'quick' || this.currentTourId === 'mini') {
      // Quick/mini tours need filterValidSteps for selector adaptation
      const originalSteps = this.config ? this.config.steps : null;
      if (this.config) {
        this.config.steps = steps; // temporarily swap so filterValidSteps knows mapping
      }

      this.validSteps = this.filterValidSteps(steps);

      if (this.config && originalSteps) {
        this.config.steps = originalSteps; // restore
      }
    } else {
      // Full/help tours already have properly filtered and adapted steps
      this.validSteps = steps;
    }

    if (this.validSteps.length === 0) {
      console.warn('No valid steps after processing');
      return;
    }

      // Ensure startingIndex is within bounds
    if (startingIndex >= this.validSteps.length) {
      startingIndex = 0;
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
        const last = this.validSteps[this.validSteps.length - 1];
        if (first && first.popover) {
          first.popover.showButtons = ['next'];
        }
        if (last && last.popover) {
          last.popover.showButtons = ['prev', 'next'];
          last.popover.nextBtnText = ['Done'];
        }
      }
    }

    // Prepare Driver.js config – progress bar for full/help tours, not for mini tours
    const driverCfg = {
      showProgress: this.currentTourId === 'full' || this.currentTourId === 'help',
      animate: true,
      smoothScroll: true,
      overlayOpacity: 0.5,
      allowKeyboardControl: true,
      steps: this.validSteps,
      onNextClick: async () => {
        const nextIdx = this.tour.getActiveIndex() + 1;
        if (nextIdx < this.validSteps.length) {
          const nextEl = document.querySelector(this.validSteps[nextIdx].element);
          await this.exposeHiddenElement(nextIdx);
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
          await this.exposeHiddenElement(prevIdx);
          if (prevEl && !this.isMobile) prevEl.focus();
        }
        this.tour.movePrevious();
      },
      onDestroyStarted: () => this.finishTour(),
      onHighlighted: async (el) => {
          try {
            const idx = this.tour ? this.tour.getActiveIndex() : -1;
            const step = (idx >= 0 && this.validSteps) ? this.validSteps[idx] : null;
            
            if (step) {
              // Determine which accordion row is being highlighted (if any)
              let highlightRowId = 'n/a';
              let highlightAcc = 'n/a';
              if (el) {
                const accEl = el.closest('.events-accordion-item');
                if (accEl) {
                  highlightAcc = accEl.getAttribute('data-accordion-id');
                  const mRow = highlightAcc ? highlightAcc.match(/(\d+)$/) : null;
                  if (mRow && mRow[1] !== undefined) {
                    highlightRowId = `row_${parseInt(mRow[1], 10) + 1}`;
                  }
                }
              }
              
              // Identify bubble content source – generic vs event-specific
              const contentTag = step.eventTypes ? `eventTypes=${step.eventTypes.join('|')}` : 'generic';
            }

            // (reverted) expansion-on-highlight – we now expand targets before highlighting in exposeHiddenElement()
          } catch(e) { /* silent */ }
        this.cleanupInlineStyles();
        this.handleBurgerMenuSimple(el);

        // Fix popover positioning on mobile to prevent it from going off-screen
        if (this.isMobile) {
          this.fixPopoverPositioning();
        }

        // Add 'done' class dynamically based on button label to suppress arrows
        const nextBtn = document.querySelector('.driver-popover-next-btn');
        if (nextBtn && nextBtn.textContent.trim().toLowerCase() === 'done') {
          nextBtn.classList.add('done');
        }

        // Accordion auto-collapse when leaving event - SHARED BY ALL TOUR TYPES
        if (this.getCurrentEventsMode && this.getCurrentEventsMode() === 'accordion' && this._autoExpandedAccordionId) {
          const withinAcc = el ? el.closest('.events-accordion-item') : null;
          // Peek at next step – if it's another accordion field step, keep open
          const nextIdx = (this.tour && typeof this.tour.getActiveIndex === 'function') ? this.tour.getActiveIndex() + 1 : -1;
          const nextStep = (nextIdx >= 0 && nextIdx < (this.validSteps?.length || 0)) ? this.validSteps[nextIdx] : null;
          const nextIsAccordionField = !!(nextStep && nextStep.element && (nextStep.element.startsWith('#AccordionEventTypeToggle') || nextStep.element.includes('.accordion-edit-')));
          if (!withinAcc && this._accordionExpandedByWizard && !nextIsAccordionField) {
            this.collapseAutoExpandedAccordion();

            // Wait for accordion collapse animation to complete before highlight recalculation
            // This prevents the highlight box from being sized for the expanded accordion
            setTimeout(() => {
              // Force highlight recalculation by triggering a resize event
              // The Bubbles.js library listens for resize events and recalculates the highlight
              window.dispatchEvent(new Event('resize'));
            }, 350);
          }
        }

        // Demo button logic for full/help tours only
        if (this.currentTourId === 'full' || this.currentTourId === 'help') {
          const popover = document.querySelector('.driver-popover');
          if (popover) {
            // Logic for the #load-example-scenario button
            const loadExampleBtn = popover.querySelector('#load-example-scenario');
            if (loadExampleBtn && !loadExampleBtn.getAttribute('data-click-attached')) {
              loadExampleBtn.setAttribute('data-click-attached', 'true');
              loadExampleBtn.addEventListener('click', () => {
                WebUI.getInstance().fileManager.loadFromUrl("/src/frontend/web/assets/demo.csv", "Example");
                this.finishTour();
              });
            }

            // Logic for the #load-demo-scenario button
            const loadDemoBtn = popover.querySelector('#load-demo-scenario');
            if (loadDemoBtn && !loadDemoBtn.getAttribute('data-click-attached')) {
              loadDemoBtn.setAttribute('data-click-attached', 'true');
              loadDemoBtn.addEventListener('click', () => {
                WebUI.getInstance().fileManager.loadFromUrl("/src/frontend/web/assets/demo.csv", "Demo");
                this.finishTour();
              });
            }

            // Logic for the #load-demo-scenario-header button
            const loadDemoHeaderBtn = popover.querySelector('#load-demo-scenario-header');
            if (loadDemoHeaderBtn && !loadDemoHeaderBtn.getAttribute('data-click-attached')) {
              loadDemoHeaderBtn.setAttribute('data-click-attached', 'true');
              loadDemoHeaderBtn.addEventListener('click', () => {
                WebUI.getInstance().fileManager.loadFromUrl("/src/frontend/web/assets/demo.csv", "Demo");
                this.finishTour();
              });
            }

            // Logic for the #load-demo-scenario-mobile button
            const loadDemoMobileBtn = popover.querySelector('#load-demo-scenario-mobile');
            if (loadDemoMobileBtn && !loadDemoMobileBtn.getAttribute('data-click-attached')) {
              loadDemoMobileBtn.setAttribute('data-click-attached', 'true');
              loadDemoMobileBtn.addEventListener('click', () => {
                WebUI.getInstance().fileManager.loadFromUrl("/src/frontend/web/assets/demo.csv", "Demo");
                this.finishTour();
              });
            }
          }
        }
      }
    };

    this.tour = this.driver(driverCfg);

    // Keyboard & mobile tweaks
    document.addEventListener('keydown', this.handleKeys);
    this.disableMobileKeyboard();
    this.wizardActive = true;

    // NOTE: Removed freezeScroll() call to allow proper scrolling for all tour types
    // The original implementation froze scroll for full/help tours, preventing them
    // from scrolling to bring highlighted elements to the top of the page

    if (this.isMobile) {
      document.body.setAttribute('data-wizard-active', 'true');
      document.addEventListener('focusin', this.preventFocus, true);
      document.addEventListener('touchstart', this.preventTouch, true);
      document.addEventListener('click', this.preventTouch, true);
    }

    // Handle burger menu for the initial step
    await this.exposeHiddenElement(startingIndex);

    this.tour.drive(startingIndex);
  }

  followFocus(event) {
    // Skip if this is a programmatic focus from vertical navigation
    if (this._programmaticFocus) {
      return;
    }

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
    // If a temporary NOP row was added for a mini tour, clean it up first
    this.cleanupTemporaryMiniTourRow();

    // Collapse auto-expanded accordion if still open
    this.collapseAutoExpandedAccordion();

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

    // Reset last focused tracking so the next tour starts fresh
    this.lastFocusedField = null;
    this.lastFocusedWasInput = false;

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

  fixPopoverPositioning() {
    // Fix Driver.js popover positioning on mobile to prevent it from going off-screen
    const popover = document.querySelector('.driver-popover');
    if (!popover) return;

    const rect = popover.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Check if popover is positioned outside the viewport
    if (rect.top < 0 || rect.bottom > viewportHeight || rect.left < 0 || rect.right > viewportWidth) {
      // Calculate new position to keep popover within viewport
      let newTop = rect.top;
      let newLeft = rect.left;

      // Adjust vertical position
      if (rect.top < 0) {
        newTop = 10; // 10px from top
      } else if (rect.bottom > viewportHeight) {
        newTop = viewportHeight - rect.height - 10; // 10px from bottom
      }

      // Adjust horizontal position
      if (rect.left < 0) {
        newLeft = 10; // 10px from left
      } else if (rect.right > viewportWidth) {
        newLeft = viewportWidth - rect.width - 10; // 10px from right
      }

      // Apply the new position
      if (newTop !== rect.top || newLeft !== rect.left) {
        popover.style.position = 'fixed';
        popover.style.top = `${newTop}px`;
        popover.style.left = `${newLeft}px`;
        popover.style.transform = 'none'; // Remove any existing transforms that might interfere
      }
    }
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
          // Calculate target index first
          const targetIndex = direction === 'next'
            ? this.tour.getActiveIndex() + 1
            : this.tour.getActiveIndex() - 1;

          // Remove focus from the current field if it's an input or select
          if (document.activeElement && document.activeElement.matches('input, select')) {
            // Set flag to prevent followFocus from interfering during navigation
            this._programmaticFocus = true;
            document.activeElement.blur();
            // Don't clear lastFocusedField if we're moving within the events table
            // This preserves table context for vertical navigation from phantom fields
            const targetElement = targetIndex >= 0 && targetIndex < this.validSteps.length 
              ? document.querySelector(this.validSteps[targetIndex].element) 
              : null;
            const isMovingWithinTable = targetElement && targetElement.id && targetElement.id.includes('Event');
            if (!isMovingWithinTable) {
              this.lastFocusedField = null;
            }
            // Clear the flag after a short delay
            setTimeout(() => {
              this._programmaticFocus = false;
            }, 10);
          }

          // Handle burger menu before navigation

          if (targetIndex >= 0 && targetIndex < this.validSteps.length) {
            const targetElement = document.querySelector(this.validSteps[targetIndex].element);
            this.exposeHiddenElement(targetIndex).then(() => {
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
            // For mini tours, stay at the current position instead of moving to events section
            if (this.currentTourId === 'mini') {
              return null; // Don't move, stay at current field
            }
            // For help/full tours, move to the events section overview step
            const tableStep = this.validSteps.findIndex(step => step.element === '.events-section');
            if (tableStep >= 0 && this.tour) {
              document.activeElement.blur();
              this.lastFocusedField = null;
              this.tour.drive(tableStep);
              return null;
            }
          } else {
            targetRow = rows[currentRowIndex - 1];
          }
        } else if (direction === 'down') {
          if (currentRowIndex === rows.length - 1) {
            // For mini tours, stay at the current position instead of moving to next section
            if (this.currentTourId === 'mini') {
              return null; // Don't move, stay at current field
            }
            // For help/full tours, move to the next non-table step
            const currentStep = this.tour.getActiveIndex();
            const nextNonTableStep = this.validSteps.findIndex((step, index) => {
              return index > currentStep && (!step.element || !step.element.includes('Event'));
            });
            if (nextNonTableStep >= 0 && this.tour) {
              document.activeElement.blur();
              this.lastFocusedField = null;
              this.tour.drive(nextNonTableStep);
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
            // Update lastFocusedField to the new target
            this.lastFocusedField = targetField;

            if (!this.isMobile) {
              // Focus the target field on desktop
              // Set a flag to prevent followFocus from interfering
              this._programmaticFocus = true;
              targetField.focus();
              // Clear the flag after a short delay
              setTimeout(() => {
                this._programmaticFocus = false;
              }, 10);
            }

            // Update the table state to reflect the new row
            this.tableState = this.getEventTableState();

            // Update ALL event-related steps to point to the new row AND update their content
            this.validSteps.forEach(step => {
              if (step.element && step.element.includes('Event') && step.element.includes('_')) {
                // Extract the field type from the step element (e.g., "EventType" from "#EventType_123")
                const stepFieldType = step.element.replace(/#(Event[A-Za-z]+)_.*/, '$1');
                // Update to point to the same field type in the new row
                step.element = `#${stepFieldType}_${targetRowId}`;

                // Update the step content based on the current event type
                this.updateStepContentForEventType(step, stepFieldType);
              }
            });

            // Find the current step that matches our field type
            const currentStepIndex = this.tour.getActiveIndex();

            // Re-drive the current step to update the highlight
            if (this.tour && currentStepIndex >= 0) {
              this.tour.drive(currentStepIndex);
            }
            return null;
          }
        }
      }
    }
    return direction === 'up' ? 'previous' : 'next';
  }

  /**
   * Updates a step's content based on the current event type
   * @param {Object} step - The step to update
   * @param {string} stepFieldType - The field type (e.g., "EventType", "EventAlias")
   */
  updateStepContentForEventType(step, stepFieldType) {``
    if (!this.originalConfig || !this.originalConfig.steps || !this.tableState) {
      return;
    }

    // Find all original steps that match this field type
    const dbgMatches = [];
    const matchingOriginalSteps = this.originalConfig.steps.filter(originalStep => {
      if (!originalStep.element) return false;

      // Check if this step is for the same field type
      const originalFieldType = originalStep.element.replace(/#(Event[A-Za-z]+)(_.*)?$/, '$1');
      const isMatch = originalFieldType === stepFieldType;
      if (isMatch) dbgMatches.push({ element: originalStep.element, eventTypes: originalStep.eventTypes });
      return isMatch;
    });

    // Find the best matching step for the current event type
    let bestMatch = null;

    for (const originalStep of matchingOriginalSteps) {
      // Check if this step matches the current event type
      if (originalStep.eventTypes) {
        if (originalStep.eventTypes.includes(this.tableState.eventType)) {
          bestMatch = originalStep;
          break; // Exact match found
        }
      } else if (originalStep.noEventTypes) {
        if (!originalStep.noEventTypes.includes(this.tableState.eventType)) {
          bestMatch = originalStep;
          break; // Negative match found
        }
      } else if (!bestMatch) {
        // No event type restriction - use as fallback
        bestMatch = originalStep;
      }
    }

    // Update the step's popover content if we found a match
    if (bestMatch && bestMatch.popover && step.popover) {
      // Copy the popover content from the best match
      if (bestMatch.popover.description) {
        step.popover.description = bestMatch.popover.description;
      }
      if (bestMatch.popover.title) {
        step.popover.title = bestMatch.popover.title;
      }

      // Handle structured content if present
      if (bestMatch.popover.contentType && bestMatch.popover.content) {
        step.popover.contentType = bestMatch.popover.contentType;
        step.popover.content = bestMatch.popover.content;

        // Re-render the content if ContentRenderer is available
        if (typeof ContentRenderer !== 'undefined') {
          step.popover.description = ContentRenderer.render(
            bestMatch.popover.contentType,
            this.processAgeYearInContent(bestMatch.popover.content),
            { context: 'wizard', compact: true }
          );
        }
      }
    }
  }

  // Detect if we're on a mobile device
  detectMobile() {
    if (window.DeviceUtils && window.DeviceUtils.isMobile) {
      return window.DeviceUtils.isMobile();
    }
    const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasTouchSupport = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isSmallScreen = window.innerWidth <= 768;
    const isMobileViewport = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const isMobile = isMobileUserAgent || (hasTouchSupport && (isSmallScreen || isMobileViewport));
    return isMobile;
  }

  // BEGIN ADD: Utility to detect current events view mode (table vs accordion)
  getCurrentEventsMode() {
    // Try to use EventsTableManager state if available
    try {
      const webUI = WebUI.getInstance();
      if (webUI && webUI.eventsTableManager && webUI.eventsTableManager.viewMode) {
        const mode = webUI.eventsTableManager.viewMode;
        return mode;
      }
    } catch (_) {
      // Ignore and fall back to DOM inference
    }
    // Fallback: inspect DOM visibility
    const accordionContainer = document.querySelector('.events-accordion-container');
    const isVisible = !!(accordionContainer && window.getComputedStyle(accordionContainer).display !== 'none');
    const mode = isVisible ? 'accordion' : 'table';
    
    if (isVisible) {
      return 'accordion';
    }
    return 'table';
  }
  // END ADD

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

  // Small helper to await element presence in DOM up to timeoutMs
  async waitForElement(selector, timeoutMs = 600) {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (!document.querySelector(selector) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 30));
    }
  }

  // Handle burger menu BEFORE highlighting a step
  async exposeHiddenElement(stepIndex) {
    // -------------------------------------------------------
    // 0. Accordion auto-expand logic (runs BEFORE burger menu)
    // -------------------------------------------------------
    try {
      if (this.getCurrentEventsMode && this.getCurrentEventsMode() === 'accordion') {
        const step = stepIndex !== null ? this.validSteps[stepIndex] : null;
        if (step && step.element && (
            step.element.includes('#AccordionEventTypeToggle') ||
            step.element.includes('.accordion-edit-')
          )) {
          
          await this.ensureFirstAccordionExpanded();
          // Give the DOM a tick to render new elements
          await new Promise(r => setTimeout(r, 80));

          // After expansion, if targeting the event type toggle without a row suffix,
          // bind it to the currently expanded accordion item (or the first item).
          if (step.element.startsWith('#AccordionEventTypeToggle') && !step.element.includes('_')) {
            let targetRowId = null;
            try {
              // Prefer the currently expanded accordion item
              const expandedAcc = document.querySelector('.events-accordion-item .accordion-item-content.expanded');
              const expandedItem = expandedAcc ? expandedAcc.closest('.events-accordion-item') : null;
              if (expandedItem) {
                const accIdStr = expandedItem.getAttribute('data-accordion-id') || '';
                // Robust mapping: use accordion manager events to resolve rowId for this accordionId
                try {
                  const webUI = WebUI.getInstance();
                  const mgr = webUI && webUI.eventAccordionManager;
                  const ev = mgr && mgr.events ? mgr.events.find(e => e.accordionId === accIdStr) : null;
                  targetRowId = ev && ev.rowId ? ev.rowId : null;
                  if (!targetRowId) {
                    // Heuristic fallback only if manager lookup fails
                    const m = accIdStr.match(/(\d+)$/);
                    if (m && m[1] !== undefined) {
                      targetRowId = `row_${parseInt(m[1], 10) + 1}`;
                    }
                  }
                  
                } catch(_) {}
              }
              // Fallback to the first event via manager
              if (!targetRowId) {
                const webUI = WebUI.getInstance();
                const mgr = webUI && webUI.eventAccordionManager;
                if (mgr && mgr.events && mgr.events[0] && mgr.events[0].rowId) {
                  targetRowId = mgr.events[0].rowId;
                }
              }
            } catch (_) {}
            if (targetRowId) {
              this.validSteps[stepIndex].element = `#AccordionEventTypeToggle_${targetRowId}`;
              // Do not trigger additional resize here; Bubbles recalculates on next highlight
            }
          }
          
        }
      }
    } catch (err) {
      console.error('Wizard: accordion auto-expand error', err);
    }

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
      // Close burger menu before highlighting non-menu elements, regardless of who opened it
      if (burgerMenu.isOpen) {
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

    // BEGIN ADD: Detect current mode for filtering/selector swapping
    const currentMode = this.getCurrentEventsMode ? this.getCurrentEventsMode() : 'table';
    // END ADD

    const filtered = stepsCopy.filter(step => {
      // Filter by tours key
      if (step.tours && !step.tours.includes(tourId)) return false;

      // Additional card filtering for mini-tours
      if (tourId === 'mini' && card) {
        if (step.card) return step.card === card;
        // If YAML not yet tagged with card, skip to avoid showing unrelated steps
        return false;
      }

      // BEGIN ADD: View mode filtering via `eventModes` key
      if (step.eventModes && !step.eventModes.includes(currentMode)) return false;
      // END ADD

      return true;
    });

    // BEGIN ADD: Swap selector for accordion mode when applicable
    filtered.forEach(step => {
      if (currentMode === 'accordion' && step['accordion-element']) {
        step.element = step['accordion-element'];
      }
    });
    // END ADD

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

    // After initial filtering, run through filterValidSteps to remove fields not present in the current event (e.g., when in accordion view)
    // This reuses the comprehensive validation logic (event type, visibility, etc.) already implemented for full/help tours.
    const finalSteps = this.filterValidSteps(filtered);
    return finalSteps;
  }

  /**
   * Unified entry point for all tour types.
   * Replaces the separate start() and startTour() methods with a single,
   * parameter-based approach that handles all tour variations.
   *
   * @param {Object|number} options - Tour configuration options, or fromStep for backward compatibility
   * @param {string} options.type - Tour type: 'full', 'quick', 'mini', 'help'
   * @param {string} [options.card] - Card identifier for mini tours
   * @param {number} [options.startAtStep] - Starting step index for help tours
   */
  async start(options = {}) {
    // Handle backward compatibility: if called without options or with just a number (fromStep),
    // treat it as the original start() method behavior (help tour)
    let actualOptions = options;
    if (typeof options === 'number' || (typeof options === 'object' && Object.keys(options).length === 0)) {
      // Called as start() or start(fromStep) - original behavior was help tour
      actualOptions = { type: 'help', startAtStep: typeof options === 'number' ? options : undefined };
    }

    const { type = 'help', card = null, startAtStep = undefined } = actualOptions;

    // Parameter validation
    if (type === 'mini' && !card) {
      console.warn('Mini tours require a card parameter');
      return;
    }

    // Load or refresh configuration
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

    // Set tour type and get filtered steps
    this.currentTourId = type;

    // Get steps for the tour type
    let steps;
    let startingStepIndex = 0;

    if (type === 'full' || type === 'help') {
      // Use the full tour path with welcome modal replacement and help-specific logic
      // Help tours use the same steps as full tours, just starting at a different position
      this.currentTourId = 'full'; // Both full and help tours use 'full' tour steps

      this.validSteps = this.filterValidSteps();
      steps = this.validSteps;

      // Set the actual tour ID for display purposes
      this.currentTourId = type;

      // Replace old welcome/how-to steps with welcome modal triggers (full tours only)
      if (type === 'full') {
        steps = steps.map(step => {
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
      }

      // Calculate starting step for help tours
      const focusedFieldIndex = this.getLastFocusedFieldIndex();

      startingStepIndex = startAtStep !== undefined ? startAtStep :
        (this.lastFocusedWasInput ? (focusedFieldIndex || this.lastStepIndex) : this.lastStepIndex);

      // Ensure startingStepIndex is within valid bounds
      if (startingStepIndex >= steps.length) {
        startingStepIndex = 0; // Reset to beginning if index is out of bounds
      } else if (startingStepIndex < 0) {
        startingStepIndex = 0; // Ensure non-negative index
      }

      if (startingStepIndex > 1 && startingStepIndex < steps.length && !this.isMobile) {
        const element = document.querySelector(steps[startingStepIndex].element);
        if (element) {
          // Only focus on desktop to avoid keyboard issues on mobile
          element.focus();
        }
      }
    } else {
      // Use the filtered steps for quick/mini tours
      // Special handling: for events card mini tour ensure a visible row exists so
      // field bubbles can be anchored. If no visible row, insert a temporary NOP row.
      if (type === 'mini' && card === 'events') {
        try { await this.ensureTemporaryEventRowForMiniTour(); } catch (_) {}
      }

      steps = this._getFilteredSteps(type, card);
      
      // DEBUG: Log filtered steps for mini tours
      if (type === 'mini') {
        console.log(`DEBUG: Mini tour steps for card "${card}":`, steps.map(s => ({ element: s.element, tours: s.tours, card: s.card })));
      }

      if (steps.length === 0) {
        console.warn(`No steps found for tour "${type}"${card ? ` and card "${card}"` : ''}`);
        return;
      }

      // Mini-tour tweaks: show a "Done" button on the last (or only) step.
      if (type === 'mini') {
        
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

      startingStepIndex = 0; // Quick/mini tours always start at the beginning
    }

    // Now use the unified _runTour method for ALL tour types
    await this._runTour(steps, startingStepIndex);
  }

  /**
   * Ensure a visible temporary NOP event row exists for the Events mini tour when the
   * table currently has no visible rows. Marks the row so it can be removed when the
   * tour finishes if the user did not modify it.
   */
  async ensureTemporaryEventRowForMiniTour() {
    try {
      // Create a temp row only when the table truly has NO rows at all.
      const tbody = document.querySelector('#Events tbody');
      const hasAnyRow = !!(tbody && tbody.querySelector('tr'));
      
      if (hasAnyRow) { return; }

      const webUI = (typeof WebUI !== 'undefined') ? WebUI.getInstance() : null;
      const etm = webUI && webUI.eventsTableManager ? webUI.eventsTableManager : null;
      if (!etm) return;

      const result = etm.addEventRow();
      if (!result || !result.row) return;

      // Remember the temporary row so we can clean up on finish
      this._tempMiniTourRowId = result.row.dataset.rowId || null;
      this._tempMiniTourEventId = result.id || null;
      
      

      // When in accordion mode, the table manager will refresh the accordion internally.
      // Give the DOM a tick to settle before selector computations.
      await new Promise(r => setTimeout(r, 30));
    } catch (_) {
      // fail silently – mini tour can still run without a row, though with fewer anchors
    }
  }

  /**
   * Remove the temporary NOP row inserted for the events mini tour if it is still empty
   * (NOP and all fields blank). Leaves the row intact if the user made any edits.
   */
  cleanupTemporaryMiniTourRow() {
    if (!this._tempMiniTourRowId) return;
    try {
      const webUI = (typeof WebUI !== 'undefined') ? WebUI.getInstance() : null;
      const etm = webUI && webUI.eventsTableManager ? webUI.eventsTableManager : null;
      if (!etm) { this._tempMiniTourRowId = null; this._tempMiniTourEventId = null; return; }

      const tbody = document.querySelector('#Events tbody');
      const row = tbody ? Array.from(tbody.querySelectorAll('tr')).find(r => r.dataset.rowId === this._tempMiniTourRowId) : null;
      if (!row) { this._tempMiniTourRowId = null; this._tempMiniTourEventId = null; return; }

      const isStillEmpty = etm.isEventEmpty(row);
      
      if (isStillEmpty) {
        row.remove();
        // If accordion is visible, refresh it to reflect removal
        if (webUI && webUI.eventAccordionManager && (webUI.eventsTableManager?.viewMode === 'accordion')) {
          try { webUI.eventAccordionManager.refresh(); } catch (_) {}
        }
        
      }
    } catch (_) {
      // ignore
    } finally {
      this._tempMiniTourRowId = null;
      this._tempMiniTourEventId = null;
    }
  }




}

