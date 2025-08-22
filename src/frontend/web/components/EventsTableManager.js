/* Event management functionality */

class EventsTableManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.eventRowCounter = 0;
    this.ageYearMode = 'age'; // Track current toggle mode
    this.viewMode = 'table'; // Track current view mode (table/accordion)
    this.tooltipElement = null; // Reference to current tooltip
    this.tooltipTimeout = null; // Reference to tooltip delay timeout
    this.setupAddEventButton();
    this.setupEventTableRowDelete();
    this.setupEventTypeChangeHandler();
    this.setupSimulationModeChangeHandler();
    this.setupViewToggle();
    this.setupAgeYearToggle();
    this.setupTooltipHandlers();
    this.sortColumn = null;
    this.sortDir = null;
    this.sortKeys = [];
    this.setupColumnSortHandlers();
    this.setupAutoSortOnBlur();
    // Apply initial sort after DOM settles
    setTimeout(() => this.applySort(), 0);
    this.initializeCarets();
    // Check for empty state on initial load
    setTimeout(() => this.checkEmptyState(), 0);

    /* NEW: Apply saved preferences (view mode + age/year mode) & defaults */
    setTimeout(() => this._applySavedPreferences(), 0);
  }

  /**
   * NEW: Apply saved view/age-year preferences from localStorage.
   * - viewMode key: 'viewMode' (values: 'table' | 'accordion')
   * - ageYearMode key: 'ageYearMode' (values: 'age' | 'year')
   *
   * Defaults when nothing is stored:
   *   • viewMode -> 'accordion' on mobile devices, otherwise 'table'
   *   • ageYearMode -> 'age'
   */
  _applySavedPreferences() {
    try {
      // Retrieve stored preferences
      const storedView = localStorage.getItem('viewMode');
      const storedAgeYear = localStorage.getItem('ageYearMode');

      // Determine preferred view mode
      let preferredView = storedView;
      if (!preferredView) {
        // Default: accordion for mobile, table for desktop
        preferredView = (typeof DeviceUtils !== 'undefined' && DeviceUtils.isMobile()) ? 'accordion' : 'table';
      }

      // Determine preferred age/year mode (default = age)
      const preferredAgeYear = (storedAgeYear === 'year') ? 'year' : 'age';

      // Apply view preference if different
      if (preferredView !== this.viewMode) {
        this.handleViewToggle(preferredView);
      }

      // Apply age/year preference if different
      if (preferredAgeYear !== this.ageYearMode) {
        this.handleAgeYearToggle(preferredAgeYear);
      }

      // Ensure accordion manager (once created) is synced with age/year mode
      setTimeout(() => {
        if (this.webUI.eventAccordionManager) {
          this.webUI.eventAccordionManager.updateAgeYearMode(this.ageYearMode);
        }
      }, 0);
    } catch (err) {
      console.warn('Failed to apply saved preferences:', err);
    }
  }

  setupAddEventButton() {
    const addEventButton = document.getElementById('addEventRow');
    if (addEventButton) {
      addEventButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleAddEventClick();
      });

      // NEW: Set initial icon state based on wizard toggle
      this.updateAddEventButtonIcons();

      // NEW: Listen for wizard toggle changes to update icon dynamically
      window.addEventListener('eventsWizardToggle', (ev) => {
        const enabled = ev?.detail?.enabled;
        this.updateAddEventButtonIcons(enabled);
      });
    }
  }

  /**
   * Handle Add Event button click - either show wizard or add empty event based on toggle state
   */
  handleAddEventClick() {
    // Check if Events Wizard toggle is enabled
    const eventsWizardEnabled = this.isEventsWizardEnabled();

    if (eventsWizardEnabled) {
      // Show wizard selection (will handle empty row detection internally)
      this.showWizardSelection();
    } else {
      // Check for existing empty row first
      const existingEmptyRow = this.findEmptyEventRow();
      if (existingEmptyRow) {
        // Only use focusOnEmptyRow in table mode
        if (this.viewMode !== 'accordion') {
          this.focusOnEmptyRow(existingEmptyRow);
        }
      } else {
        // Add empty event row
        this.addEventRow();
      }

      // In accordion mode, open the empty event after a delay
      if (this.viewMode === 'accordion') {
        setTimeout(() => this.openEmptyInAccordion(), 200);
      }
    }
  }

  /**
   * Check if Events Wizard is enabled via localStorage
   * @returns {boolean} True if Events Wizard is enabled
   */
  isEventsWizardEnabled() {
    const savedState = localStorage.getItem('eventsWizardState') || 'on';
    return savedState === 'on';
  }

  /**
   * Update the Add Event button icons depending on whether the Events Wizard is enabled.
   * Shows a star icon on both sides of the text when enabled.
   * @param {boolean} [wizardEnabled] – optional explicit state; falls back to localStorage lookup when omitted.
   */
  updateAddEventButtonIcons(wizardEnabled = undefined) {
    const addEventButton = document.getElementById('addEventRow');
    if (!addEventButton) return;

    const enabled = (typeof wizardEnabled === 'boolean') ? wizardEnabled : this.isEventsWizardEnabled();

    if (enabled) {
      // Show star icons on both sides of the label
      addEventButton.innerHTML = '🌟 Add Event 🌟';
      addEventButton.classList.add('wizard-active');
    } else {
      // Revert to plain label
      addEventButton.textContent = 'Add Event';
      addEventButton.classList.remove('wizard-active');
    }
  }


  setupEventTableRowDelete() {
    const eventsTable = document.getElementById('Events');
    if (eventsTable) {
      eventsTable.addEventListener('click', (e) => {
        // Check if the clicked element or its parent is the delete button
        const deleteButton = e.target.closest('.delete-event');
        if (deleteButton) {
          const row = deleteButton.closest('tr');
          if (row) {
            this.deleteTableRowWithAnimation(row);
          }
        }
      });
    }
  }

  /**
   * Delete table row with smooth animation
   */
  deleteTableRowWithAnimation(row) {
    // Check if this is the only row
    const allRows = document.querySelectorAll('#Events tbody tr');
    const isLastRow = allRows.length === 1;

    if (isLastRow) {
      // Simple fade for last row
      row.classList.add('deleting-last');
      setTimeout(() => {
        row.remove();
        // Check empty state after deletion
        this.checkEmptyState();
        // Refresh accordion if it's active
        if (this.viewMode === 'accordion' && this.webUI.eventAccordionManager) {
          this.webUI.eventAccordionManager.refresh();
        }
      }, 400);
    } else {
      // Complex animation with slide-up for multiple rows
      this.deleteRowWithSlideUp(row);
    }
  }

  /**
   * Delete row with slide-up animation for remaining rows
   */
  deleteRowWithSlideUp(rowToDelete) {
    const allRows = Array.from(document.querySelectorAll('#Events tbody tr'));
    const deleteIndex = allRows.indexOf(rowToDelete);
    const rowsBelow = allRows.slice(deleteIndex + 1);
    const isLastRowAfterDelete = allRows.length <= 1;

    // Get the height of the row being deleted (including borders/padding)
    const deletedRowHeight = rowToDelete.offsetHeight;

    // Phase 1: Fade out the row being deleted
    rowToDelete.classList.add('deleting-fade');

    setTimeout(() => {
      // Phase 2: Remove the row first, then slide up the rows below
      rowToDelete.remove();

      // If this was the last row, show empty state message
      if (isLastRowAfterDelete) {
        this.checkEmptyState();
      }

      // Now animate the rows below sliding up
      rowsBelow.forEach(row => {
        // Start them displaced down by the deleted row height
        row.style.transform = `translateY(${deletedRowHeight}px)`;
        row.style.transition = 'none'; // No transition for initial position
      });

      // Force a reflow to ensure the initial position is applied
      rowsBelow[0]?.offsetHeight;

      // Now animate them back to their natural position
      rowsBelow.forEach(row => {
        row.style.transition = 'transform 0.3s ease-out';
        row.style.transform = 'translateY(0)';
      });

      // Clean up after animation completes
      setTimeout(() => {
        rowsBelow.forEach(row => {
          row.style.transform = '';
          row.style.transition = '';
        });

        // Refresh accordion if it's active
        if (this.viewMode === 'accordion' && this.webUI.eventAccordionManager) {
          this.webUI.eventAccordionManager.refresh();
        }
      }, 300); // Wait for slide animation to complete
    }, 200); // Wait for fade to complete
  }

  setupEventTypeChangeHandler() {
    const eventsTable = document.getElementById('Events');
    if (eventsTable) {
      eventsTable.addEventListener('change', (e) => {
        if (e.target.classList.contains('event-type')) {
          const row = e.target.closest('tr');
          if (row) {
            // Update the stored original type to the new user selection
            row.dataset.originalEventType = e.target.value;
          }
          this.updateFieldVisibility(e.target);
          this.updateWizardIconsVisibility(row);
        }
      });

      // Also listen for input changes on all event fields to update wizard icons
      eventsTable.addEventListener('input', (e) => {
        if (e.target.matches('.event-name, .event-amount, .event-from-age, .event-to-age, .event-rate, .event-match')) {
          const row = e.target.closest('tr');
          if (row) {
            this.updateWizardIconsVisibility(row);
          }
        }
      });
    }
  }

  setupSimulationModeChangeHandler() {
    const simulationModeSelect = document.getElementById('simulation_mode');
    if (simulationModeSelect) {
      simulationModeSelect.addEventListener('change', () => {
        this.updateEventRowsVisibilityAndTypes();
      });
      setTimeout(() => this.updateEventRowsVisibilityAndTypes(), 0);
    }
  }

  setupViewToggle() {
    const tableToggle = document.getElementById('viewModeTable');
    const accordionToggle = document.getElementById('viewModeAccordion');

    if (tableToggle) {
      tableToggle.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleViewToggle('table');
      });
    }

    if (accordionToggle) {
      accordionToggle.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleViewToggle('accordion');
      });
    }

    // Attach tooltips to view toggles
    if (typeof TooltipUtils !== 'undefined') {
      if (tableToggle) {
        TooltipUtils.attachTooltip(tableToggle, "Table view is ideal for larger screens and when you know your way around these events.");
      }
      if (accordionToggle) {
        TooltipUtils.attachTooltip(accordionToggle, "Cards view is best for smaller screens and while you're learning the ropes.");
      }
    }
  }

  setupAgeYearToggle() {
    const ageToggle = document.getElementById('ageYearModeAge');
    const yearToggle = document.getElementById('ageYearModeYear');

    if (ageToggle) {
      ageToggle.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleAgeYearToggle('age');
      });
    }

    if (yearToggle) {
      yearToggle.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleAgeYearToggle('year');
      });
    }
  }

  handleViewToggle(newMode) {
    // Don't do anything if already in the requested mode
    if (this.viewMode === newMode) {
      return;
    }

    // CRITICAL FIX: Force blur on any active accordion input before switching
    if (this.viewMode === 'accordion' && newMode === 'table') {
      const activeElement = document.activeElement;
      if (activeElement && activeElement.matches('.accordion-edit-name, .accordion-edit-amount, .accordion-edit-fromage, .accordion-edit-toage, .accordion-edit-rate, .accordion-edit-match')) {
        activeElement.blur();
        // Give a small delay to allow the blur event and sync to complete
        setTimeout(() => {
          this.completeViewToggle(newMode);
        }, 50);
        return;
      }
    }

    this.completeViewToggle(newMode);
  }

  completeViewToggle(newMode) {
    // Update the mode
    this.viewMode = newMode;

    // Update visual state of toggle buttons
    const tableToggle = document.getElementById('viewModeTable');
    const accordionToggle = document.getElementById('viewModeAccordion');

    if (tableToggle && accordionToggle) {
      if (newMode === 'table') {
        tableToggle.classList.add('mode-toggle-active');
        accordionToggle.classList.remove('mode-toggle-active');
      } else {
        accordionToggle.classList.add('mode-toggle-active');
        tableToggle.classList.remove('mode-toggle-active');
      }
    }

    // Switch between table and accordion views
    this.switchView(newMode);

    // NEW: Persist preference
    try {
      localStorage.setItem('viewMode', newMode);
    } catch (_) { }
  }

  handleAgeYearToggle(newMode) {
    // Prevent switching to "year" mode if current age has not been provided
    if (newMode === 'year') {
      const startingAgeInput = 'StartingAge';
      const startingAgeVal = parseInt(this.webUI.getValue(startingAgeInput)) || 0;

      if (startingAgeVal === 0) {
        // Inform the user and highlight the missing field
        if (typeof this.webUI.showToast === 'function') {
          this.webUI.showToast('Please enter your current age in order to switch to year mode.', 'Current Age Needed', 7);
        } else {
          alert('Please enter your current age in order to switch to year mode.');
        }

        // Highlight the missing age field so the user knows where to act
        if (typeof this.webUI.setWarning === 'function') {
          this.webUI.setWarning(startingAgeInput, 'Current age is required');
        }

        // Keep the toggle in its existing state
        return;
      }
    }
    // Don't do anything if already in the requested mode
    if (this.ageYearMode === newMode) {
      return;
    }

    // Convert existing input values before changing the mode
    this.convertExistingInputValues(this.ageYearMode, newMode);

    // Update the mode
    this.ageYearMode = newMode;

    // Update visual state of toggle buttons
    const ageToggle = document.getElementById('ageYearModeAge');
    const yearToggle = document.getElementById('ageYearModeYear');

    if (ageToggle && yearToggle) {
      if (newMode === 'age') {
        ageToggle.classList.add('mode-toggle-active');
        yearToggle.classList.remove('mode-toggle-active');
      } else {
        yearToggle.classList.add('mode-toggle-active');
        ageToggle.classList.remove('mode-toggle-active');
      }
    }

    // Update table headers
    this.updateTableHeaders();

    // Update accordion age/year mode if it exists
    if (this.webUI.eventAccordionManager) {
      this.webUI.eventAccordionManager.updateAgeYearMode(newMode);
    }

    // Clear warnings and revalidate events to ensure warning messages
    // use the correct terminology (age vs year) for the new mode
    this.webUI.clearAllWarnings();
    this.webUI.validateEvents();

    // Persist preference
    try {
      localStorage.setItem('ageYearMode', newMode);
    } catch (_) { }
  }

  updateTableHeaders() {
    const fromHeader = document.getElementById('fromAgeHeader');
    const toHeader = document.getElementById('toAgeHeader');

    if (fromHeader && toHeader) {
      const setText = (el, txt) => { const span = el.querySelector('.header-text'); if (span) { span.textContent = txt; } else { el.childNodes[0].textContent = txt; } };
      if (this.ageYearMode === 'age') {
        setText(fromHeader, 'From Age');
        setText(toHeader, 'To Age');
        fromHeader.classList.remove('year-mode');
        toHeader.classList.remove('year-mode');
      } else {
        setText(fromHeader, 'From Year');
        setText(toHeader, 'To Year');
        fromHeader.classList.add('year-mode');
        toHeader.classList.add('year-mode');
      }
    }
  }

  switchView(viewMode) {
    const tableContainer = document.querySelector('.events-section .table-container');
    const addEventContainer = document.querySelector('.events-section div[style*="text-align: right"]');

    if (viewMode === 'table') {
      // Show table view
      if (tableContainer) {
        tableContainer.style.display = 'block';
      }
      if (addEventContainer) {
        addEventContainer.style.display = 'block';
      }
      // Hide accordion view
      const accordionContainer = document.querySelector('.events-accordion-container');
      if (accordionContainer) {
        accordionContainer.style.display = 'none';
      }

      // Check for empty state in table view
      this.checkEmptyState();
    } else {
      // Hide table view
      if (tableContainer) {
        tableContainer.style.display = 'none';
      }
      if (addEventContainer) {
        addEventContainer.style.display = 'none';
      }
      // Show accordion view
      this.showAccordionView();
    }
  }

  showAccordionView() {
    // Show accordion view using the accordion manager
    const accordionContainer = document.querySelector('.events-accordion-container');
    if (accordionContainer) {
      accordionContainer.style.display = 'block';

      // Refresh accordion to sync with current table data
      if (this.webUI.eventAccordionManager) {
        this.webUI.eventAccordionManager.refresh();
      }
    }
  }

  convertExistingInputValues(currentMode, newMode) {
    const startingAge = parseInt(this.webUI.getValue('StartingAge')) || 0;
    const p2StartingAge = parseInt(this.webUI.getValue('P2StartingAge')) || 0;

    if (startingAge === 0) return;

    const currentYear = new Date().getFullYear();
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    tbody.querySelectorAll('tr').forEach(row => {
      if (row.style.display === 'none') return;

      const eventType = row.querySelector('.event-type')?.value;
      if (!eventType) return;

      const isP2Event = eventType === 'SI2' || eventType === 'SI2np';
      const relevantStartingAge = isP2Event ? p2StartingAge : startingAge;
      if (relevantStartingAge === 0) return;

      const birthYear = currentYear - relevantStartingAge;

      ['.event-from-age', '.event-to-age'].forEach(selector => {
        const input = row.querySelector(selector);
        if (!input?.value) return;

        const currentValue = parseInt(input.value);
        if (isNaN(currentValue)) return;

        if (currentMode === 'age' && newMode === 'year') {
          input.value = birthYear + currentValue;
        } else if (currentMode === 'year' && newMode === 'age') {
          input.value = currentValue - birthYear;
        }
      });
    });
  }

  updateEventRowsVisibilityAndTypes() {
    const simulationMode = this.webUI.getValue('simulation_mode');
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    tbody.querySelectorAll('tr').forEach((row) => {
      const typeInput = row.querySelector('.event-type');
      const originalEventType = row.dataset.originalEventType || (typeInput ? typeInput.value : '');

      /* Handle row visibility for P2-specific events */
      const shouldHide = simulationMode === 'single' && (originalEventType === 'SI2' || originalEventType === 'SI2np');
      row.style.display = shouldHide ? 'none' : '';

      /* Refresh dropdown options to reflect simulation mode */
      const dropdown = row._eventTypeDropdown;
      if (dropdown) {
        const newOpts = this.getEventTypeOptionObjects();
        dropdown.setOptions(newOpts);
        const curVal = typeInput.value;
        const curOpt = newOpts.find((o) => o.value === curVal);
        const toggleEl = row.querySelector(`#EventTypeToggle_${row.dataset.rowId}`);
        if (toggleEl && curOpt) toggleEl.textContent = curOpt.label;
      }
    });
  }

  updateFieldVisibility(typeSelect) {
    const row = typeSelect.closest('tr');
    const eventType = typeSelect.value;
    const required = UIManager.getRequiredFields(eventType);
    UIManager.getFields().forEach(field => {
      const colIndex = UIManager.getIndexForField(field);
      const cell = row.cells[colIndex];
      if (cell) {
        const input = cell.querySelector('input');
        if (input) {
          const isHidden = required[field] === 'hidden';
          input.style.visibility = isHidden ? 'hidden' : 'visible';

          // For percentage inputs, also hide the container with the % symbol
          const container = input.closest('.percentage-container');
          if (container) {
            container.style.visibility = isHidden ? 'hidden' : 'visible';
          }
        }
      }
    });
    const rateInput = row.querySelector('.event-rate');
    if (rateInput) {
      rateInput.placeholder = (!required || !required.rate || required.rate === 'optional') ? 'inflation' : '';
    }
  }

  generateEventRowId() {
    return `row_${++this.eventRowCounter}`;
  }

  /* ------------------------------------------------------------
     Inflow / Outflow visual helpers
  ------------------------------------------------------------ */
  isInflow(eventType) {
    return ['SI', 'SInp', 'SI2', 'SI2np', 'UI', 'RI', 'DBI', 'FI'].includes(eventType);
  }

  isOutflow(eventType) {
    return ['E'].includes(eventType); // SM handled separately
  }

  isStockMarket(eventType) {
    return ['SM'].includes(eventType);
  }

  isRealEstate(eventType) {
    return ['R', 'M'].includes(eventType);
  }

  applyTypeColouring(row) {
    const typeVal = row.querySelector('.event-type')?.value;
    const toggle = row.querySelector('.dd-toggle');
    if (!toggle) return;
    /* Reset all possible styling classes, including the new 'nop' marker */
    toggle.classList.remove('inflow', 'outflow', 'real-estate', 'stock-market', 'nop');

    /* Apply appropriate class based on the event type */
    if (typeVal === 'NOP') {
      toggle.classList.add('nop');
    } else if (this.isStockMarket(typeVal)) {
      toggle.classList.add('stock-market');
    } else if (this.isRealEstate(typeVal)) {
      toggle.classList.add('real-estate');
    } else if (this.isInflow(typeVal)) {
      toggle.classList.add('inflow');
    } else if (this.isOutflow(typeVal)) {
      toggle.classList.add('outflow');
    }
  }

  /**
   * Check if an event row is empty (NOP type and all fields blank)
   */
  isEventEmpty(row) {
    const typeInput = row.querySelector('.event-type');
    const nameInput = row.querySelector('.event-name');
    const amountInput = row.querySelector('.event-amount');
    const fromAgeInput = row.querySelector('.event-from-age');
    const toAgeInput = row.querySelector('.event-to-age');
    const rateInput = row.querySelector('.event-rate');
    const matchInput = row.querySelector('.event-match');

    // Check if type is NOP and all other fields are blank
    return typeInput?.value === 'NOP' &&
      (!nameInput?.value || nameInput.value.trim() === '') &&
      (!amountInput?.value || amountInput.value.trim() === '') &&
      (!fromAgeInput?.value || fromAgeInput.value.trim() === '') &&
      (!toAgeInput?.value || toAgeInput.value.trim() === '') &&
      (!rateInput?.value || rateInput.value.trim() === '') &&
      (!matchInput?.value || matchInput.value.trim() === '');
  }

  /**
   * Find the first empty event row in the table
   * @returns {HTMLElement|null} The first empty row or null if none found
   */
  findEmptyEventRow() {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return null;

    const rows = tbody.querySelectorAll('tr');
    for (const row of rows) {
      if (this.isEventEmpty(row)) {
        return row;
      }
    }
    return null;
  }

  /**
   * Focus on an existing empty row and open its event type dropdown
   * @param {HTMLElement} row - The empty row to focus on
   */
  focusOnEmptyRow(row) {
    // Ensure the row is visible – scroll only if it’s outside the viewport
    const rect = row.getBoundingClientRect();
    const viewportHeight = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    const needsScroll = rect.top < 0 || rect.bottom > viewportHeight;
    if (needsScroll) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    const openDropdownProgrammatically = () => {
      // Prefer programmatic API when available for robustness
      if (row._eventTypeDropdown && typeof row._eventTypeDropdown.open === 'function') {
        try { row._eventTypeDropdown.open(); return; } catch (_) { /* fallback below */ }
      }
      const toggle = row.querySelector('.event-type-dd');
      if (toggle) {
        try { toggle.click(); } catch (_) { /* ignore */ }
      }
    };

    // If we scrolled, wait until the row position stabilizes before opening (Safari-friendly)
    if (needsScroll) {
      const start = Date.now();
      let lastTop = row.getBoundingClientRect().top;
      let stableCount = 0;
      const checkStable = () => {
        const nowTop = row.getBoundingClientRect().top;
        if (Math.abs(nowTop - lastTop) < 1) {
          stableCount++;
        } else {
          stableCount = 0;
        }
        lastTop = nowTop;
        if (stableCount >= 3 || Date.now() - start > 1500) {
          openDropdownProgrammatically();
        } else {
          requestAnimationFrame(checkStable);
        }
      };
      requestAnimationFrame(checkStable);
    } else {
      // Already in view – open on next frame
      requestAnimationFrame(openDropdownProgrammatically);
    }

    // Safety retry in case the first attempt gets ignored under load
    setTimeout(() => openDropdownProgrammatically(), 1200);
  }

  /**
   * Open empty event in accordion mode
   */
  openEmptyInAccordion() {
    const emptyRow = this.findEmptyEventRow();
    if (!emptyRow || !this.webUI.eventAccordionManager) return;

    const rowId = emptyRow.dataset.rowId;

    // Fast-path: if the accordion item for this empty row is already open, show its dropdown
    const toggleNow = document.querySelector(`#AccordionEventTypeToggle_${rowId}`);
    if (toggleNow) {
      const contentEl = toggleNow.closest('.accordion-item-content');
      if (contentEl && contentEl.classList.contains('expanded')) {
        toggleNow.click();
        return;
      }
    }

    // Otherwise sync accordion with current table state and proceed
    this.webUI.eventAccordionManager.refresh();

    const emptyEvent = this.webUI.eventAccordionManager.events.find(e => e.rowId === rowId);
    if (!emptyEvent) return;

    const accordionId = emptyEvent.accordionId;

    // Locate the DOM element for this accordion item
    const accordionEl = document.querySelector(`[data-accordion-id="${accordionId}"]`)?.closest('.events-accordion-item');

    // Determine current expanded state BEFORE any potential toggle below
    const isExpanded = this.webUI.eventAccordionManager.expandedItems.has(accordionId);

    if (accordionEl) {
      if (isExpanded) {
        // Item is already open – ensure it’s fully visible (no double-scroll)
        this.webUI.eventAccordionManager._scrollExpandedItemIntoView?.(accordionEl);
      } else {
        // Item collapsed – only scroll if it’s off-screen. Use block:"nearest" to
        // avoid forcing the header to the middle which causes the later upward
        // correction.
        const rect = accordionEl.getBoundingClientRect();
        const viewportHeight = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        if (rect.top < 0 || rect.bottom > viewportHeight) {
          accordionEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }

    if (isExpanded) {
      // Accordion already open – auto-show dropdown
      const toggle = document.querySelector(`#AccordionEventTypeToggle_${rowId}`);
      if (toggle) toggle.click();
    } else {
      // Accordion collapsed – just expand, leave dropdown closed
      this.webUI.eventAccordionManager.toggleAccordionItem(accordionId);
    }
  }

  /**
   * Replace an empty row with event data from wizard
   * @param {HTMLElement} emptyRow - The empty row to replace
   * @param {Object} eventData - Data from the wizard
   */
  replaceEmptyRowWithEvent(emptyRow, eventData) {
    // Create a new properly structured row with the wizard data
    const newRow = this.createEventRow(
      eventData.eventType || '',
      eventData.name || '',
      eventData.amount || '',
      eventData.fromAge || '',
      eventData.toAge || '',
      eventData.rate || '',
      eventData.match || ''
    );
    const newEventId = newRow.dataset.eventId; // capture ID for accordion highlight

    // Preserve the position by inserting the new row before the empty row
    const tbody = emptyRow.parentNode;
    if (tbody) {
      tbody.insertBefore(newRow, emptyRow);
      // Remove the empty row
      emptyRow.remove();
    }

    // Setup formatting for new inputs
    this.webUI.formatUtils.setupCurrencyInputs();
    this.webUI.formatUtils.setupPercentageInputs();

    // Apply highlight animation to the new row
    this.applyHighlightAnimation(newRow);

    // Trigger sorting if needed
    if (this.sortKeys && this.sortKeys.length > 0) {
      this.applySortingWithAnimation();
    } else {
      // No sorting active – let highlight animation handle any needed scrolling
    }

    // Refresh accordion with highlight if it's active
    if (this.viewMode === 'accordion' && this.webUI.eventAccordionManager) {
      this.webUI.eventAccordionManager.refreshWithNewEventAnimation(eventData, newEventId);
    }
  }

  /**
   * Apply highlight animation to a table row
   * @param {HTMLElement} row - The row to animate
   */
  applyHighlightAnimation(row) {
    if (!row) return;

    // Find the table container to temporarily allow overflow
    const tableContainer = row.closest('.table-container');
    const eventsTable = document.getElementById('Events');

    // Temporarily allow overflow to prevent clipping
    if (tableContainer) {
      tableContainer.style.overflow = 'visible';
    }
    if (eventsTable) {
      eventsTable.style.overflow = 'visible';
    }

    // Add pulse animation class
    row.classList.add('new-event-highlight');

    // Remove highlight and restore overflow after animation completes
    setTimeout(() => {
      row.classList.remove('new-event-highlight');

      // Restore original overflow settings
      if (tableContainer) {
        tableContainer.style.overflow = '';
      }
      if (eventsTable) {
        eventsTable.style.overflow = '';
      }
    }, 800); // Match animation duration
  }

  /**
   * Update wizard button visibility based on whether event is empty
   */
  updateWizardIconsVisibility(row) {
    const wizardButton = row.querySelector('.wizard-icons');
    const dropdown = row.querySelector('.event-type-dd');

    if (!wizardButton || !dropdown) return;

    const isEmpty = this.isEventEmpty(row);

    if (isEmpty) {
      wizardButton.style.display = 'flex';
      dropdown.classList.add('has-wizard-icons');
    } else {
      wizardButton.style.display = 'none';
      dropdown.classList.remove('has-wizard-icons');
    }
  }

  createEventRow(type = '', name = '', amount = '', fromAge = '', toAge = '', rate = '', match = '') {
    const rowId = this.generateEventRowId();
    const row = document.createElement('tr');
    row.dataset.rowId = rowId;
    row.dataset.originalEventType = type;

    // Store creation index for natural sorting order
    row.dataset.creationIndex = this.eventRowCounter;

    // Generate unique ID for this event to track it in accordion view
    const eventId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    row.dataset.eventId = eventId;

    // Build dropdown options & find label for current selection
    const optionObjects = this.getEventTypeOptionObjects();
    const selectedObj = optionObjects.find((o) => o.value === type)
      || optionObjects.find((o) => o.value === 'NOP')
      || optionObjects[0];
    const selectedLabel = selectedObj.label;

    row.innerHTML = `
      <td>
          <input type="hidden" id="EventTypeValue_${rowId}" class="event-type" value="${selectedObj.value}">
          <div class="event-type-container">
              <button class="wizard-icons" style="display: none;" id="EventWizard_${rowId}" title="Launch wizard to create event" type="button">🌟</button>
              <div class="event-type-dd visualization-control" id="EventType_${rowId}">
                  <span id="EventTypeToggle_${rowId}" class="dd-toggle pseudo-select">${selectedLabel}</span>
                  <div id="EventTypeOptions_${rowId}" class="visualization-dropdown" style="display:none;"></div>
              </div>
          </div>
      </td>
      <td><input type="text" id="EventAlias_${rowId}" class="event-name" value="${name}"></td>
      <td><input type="text" id="EventAmount_${rowId}" class="event-amount currency" inputmode="numeric" pattern="[0-9]*" step="1000" value="${amount}"></td>
      <td><input type="text" id="EventFromAge_${rowId}" class="event-from-age" inputmode="numeric" pattern="[0-9]*" value="${fromAge}"></td>
      <td><input type="text" id="EventToAge_${rowId}" class="event-to-age" inputmode="numeric" pattern="[0-9]*" value="${toAge}"></td>
      <td><div class="percentage-container"><input type="text" id="EventRate_${rowId}" class="event-rate percentage" inputmode="numeric" pattern="[0-9]*" placeholder="inflation" value="${rate}"></div></td>
      <td><div class="percentage-container"><input type="text" id="EventMatch_${rowId}" class="event-match percentage" inputmode="numeric" pattern="[0-9]*" value="${match}"></div></td>
      <td>
          <button class="delete-event" title="Delete event">
            <i class="fas fa-trash"></i>
          </button>
      </td>
    `;

    /* =============================================================
       Instantiate dropdown for this row
    ============================================================= */
    const typeInput = row.querySelector(`#EventTypeValue_${rowId}`);
    const toggleEl = row.querySelector(`#EventTypeToggle_${rowId}`);
    const dropdownEl = row.querySelector(`#EventTypeOptions_${rowId}`);

    const dropdown = DropdownUtils.create({
      toggleEl,
      dropdownEl,
      options: optionObjects,
      selectedValue: selectedObj.value,
      onSelect: (val, label) => {
        // Normal behaviour for genuine event type selections
        typeInput.value = val;
        toggleEl.textContent = label;
        row.dataset.originalEventType = val;
        this.updateFieldVisibility(typeInput);
        this.applyTypeColouring(row);
        typeInput.dispatchEvent(new Event('change', { bubbles: true }));
      },
    });
    // Keep reference for later refreshes
    row._eventTypeDropdown = dropdown;

    // Store reference to the dropdown wrapper on the hidden input element
    // This allows the validation system to find the visible element to style
    if (dropdown.wrapper) {
      typeInput._dropdownWrapper = dropdown.wrapper;
    }

    // Initial visibility update
    this.updateFieldVisibility(typeInput);
    this.applyTypeColouring(row);
    this.updateWizardIconsVisibility(row);

    // Add click handler for wizard button
    const wizardButton = row.querySelector('.wizard-icons');
    // Attach tooltip to wizard button when available
    if (wizardButton && typeof TooltipUtils !== 'undefined') {
      TooltipUtils.attachTooltip(wizardButton, "Launch wizard to create event");
    }
    if (wizardButton) {
      wizardButton.addEventListener('click', (e) => {
        e.preventDefault();
        // Explicitly close the event-type dropdown (if open) before launching the wizard
        if (row._eventTypeDropdown && typeof row._eventTypeDropdown.close === 'function') {
          row._eventTypeDropdown.close();
        }
        e.stopPropagation();

        // Get current row data to pre-fill wizard
        const initialData = {
          name: row.querySelector('.event-name')?.value || '',
          amount: row.querySelector('.event-amount')?.value || '',
          fromAge: row.querySelector('.event-from-age')?.value || '',
          toAge: row.querySelector('.event-to-age')?.value || '',
          rate: row.querySelector('.event-rate')?.value || '',
          match: row.querySelector('.event-match')?.value || '',
        };

        // Launch wizard selection modal
        this.showWizardSelection(initialData);
      });
    }

    return row;
  }

  addEventRow() {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    // Store the current scroll position to prevent page jumping
    const currentScrollY = window.scrollY;

    const row = this.createEventRow();
    const eventId = row.dataset.eventId;
    /* Debug log removed */

    tbody.appendChild(row);

    // Update empty state after adding a row
    this.updateEmptyStateMessage(true);

    this.webUI.formatUtils.setupCurrencyInputs();
    this.webUI.formatUtils.setupPercentageInputs();

    // Refresh accordion if it's active
    if (this.viewMode === 'accordion' && this.webUI.eventAccordionManager) {
      /* Debug log removed */

      // First refresh the accordion to include the new event
      this.webUI.eventAccordionManager.refresh();
    }

    // Prevent any automatic focus that might cause scrolling
    // Use setTimeout to ensure this runs after any potential focus events
    setTimeout(() => {
      // Restore scroll position if it changed (prevents mobile page jumping)
      if (window.scrollY !== currentScrollY) {
        window.scrollTo(0, currentScrollY);
      }
    }, 0);

    // Do not apply sort immediately.
    // The row will be sorted on blur after being edited.

    return { row, id: eventId };
  }

  getEventTypeOptionObjects() {
    const simulationMode = this.webUI.getValue('simulation_mode');

    const salaryTypesConfig = [
      { code: 'SI', singleLabel: 'Salary Income', jointLabel: 'Your Salary' },
      { code: 'SInp', singleLabel: 'Salary (no pension)', jointLabel: 'Your Salary (no pension)' },
      { code: 'SI2', singleLabel: null, jointLabel: 'Their Salary' },
      { code: 'SI2np', singleLabel: null, jointLabel: 'Their Salary (no pension)' },
    ];

    const eventTypes = [
      { value: 'NOP', label: 'No Operation' },
    ];

    salaryTypesConfig.forEach((stc) => {
      if (simulationMode === 'single') {
        if (stc.singleLabel) eventTypes.push({ value: stc.code, label: stc.singleLabel });
      } else if (stc.jointLabel) {
        eventTypes.push({ value: stc.code, label: stc.jointLabel });
      }
    });

    eventTypes.push(
      ...[
        { value: 'UI', label: 'RSU Income' },
        { value: 'RI', label: 'Rental Income' },
        { value: 'DBI', label: 'Defined Benefit Income' },
        { value: 'FI', label: 'Tax-free Income' },
        { value: 'E', label: 'Expense' },
        { value: 'R', label: 'Real Estate' },
        { value: 'M', label: 'Mortgage' },
        { value: 'SM', label: 'Stock Market' },
      ],
    );

    /* ------------------------------------------------------------
       Enrich option objects with real descriptions from help.yml
    -------------------------------------------------------------*/
    let descMap = {};
    try {
      const help = window.driver?.js?.getHelpData?.();
      if (help && Array.isArray(help.WizardSteps)) {
        help.WizardSteps.forEach((step) => {
          if (step.element === '#EventType' && Array.isArray(step.eventTypes) && step.eventTypes.length === 1) {
            const code = step.eventTypes[0];
            let desc = step.popover && step.popover.description ? step.popover.description : '';
            // Strip HTML tags for plain-text tooltip
            desc = desc.replace(/<[^>]+>/g, '').trim();
            if (desc) descMap[code] = desc;
          }
        });
      }
    } catch (err) {
      console.warn('EventsTableManager: failed to extract event type descriptions', err);
    }

    // Attach description so DropdownUtils can show tooltips.
    // Preserve any description explicitly set on the option object.
    return eventTypes.map((et) => ({
      ...et,
      description: et.description || descMap[et.value] || et.label,
    }));
  }

  setupTooltipHandlers() {
    const eventsTable = document.getElementById('Events');
    if (eventsTable) {
      // Use event delegation to handle dynamically added rows
      eventsTable.addEventListener('mouseenter', (e) => {
        if (e.target.classList.contains('event-from-age') || e.target.classList.contains('event-to-age')) {
          this.scheduleTooltip(e.target);
        }
      }, true);

      eventsTable.addEventListener('mouseleave', (e) => {
        if (e.target.classList.contains('event-from-age') || e.target.classList.contains('event-to-age')) {
          this.cancelTooltip();
        }
      }, true);
    }

    // Hide event tooltips on scroll
    document.addEventListener('scroll', () => {
      this.cancelTooltip();
    }, { passive: true });
  }

  showAlternativeTooltip(inputElement) {
    const currentValue = parseInt(inputElement.value);
    if (isNaN(currentValue) || currentValue === 0) return;

    const row = inputElement.closest('tr');
    const eventType = row.querySelector('.event-type')?.value;
    if (!eventType) return;

    const alternativeValue = this.getAlternativeValue(currentValue, eventType);
    if (alternativeValue === null) return;

    const alternativeMode = this.ageYearMode === 'age' ? 'year' : 'age';
    const tooltipText = this.formatTooltipText(alternativeValue, alternativeMode);

    this.createTooltip(inputElement, tooltipText);
  }

  getAlternativeValue(inputValue, eventType) {
    const startingAge = parseInt(this.webUI.getValue('StartingAge')) || 0;
    const p2StartingAge = parseInt(this.webUI.getValue('P2StartingAge')) || 0;
    const currentYear = new Date().getFullYear();

    const isP2Event = eventType === 'SI2' || eventType === 'SI2np';
    const relevantStartingAge = isP2Event ? p2StartingAge : startingAge;

    if (relevantStartingAge === 0) return null;

    const birthYear = currentYear - relevantStartingAge;

    if (this.ageYearMode === 'age') {
      // Converting from age to year
      return birthYear + inputValue;
    } else {
      // Converting from year to age
      return inputValue - birthYear;
    }
  }

  formatTooltipText(alternativeValue, alternativeMode) {
    const modeLabel = alternativeMode === 'year' ? 'Year' : 'Age';
    return `${modeLabel} ${alternativeValue}`;
  }

  createTooltip(inputElement, text) {
    this.hideTooltip(); // Remove any existing tooltip

    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'conversion-tooltip';
    this.tooltipElement.textContent = text;
    document.body.appendChild(this.tooltipElement);

    const rect = inputElement.getBoundingClientRect();
    this.tooltipElement.style.left = `${rect.left + rect.width / 2}px`;
    this.tooltipElement.style.top = `${rect.top}px`;

    // Trigger the visible state
    requestAnimationFrame(() => {
      if (this.tooltipElement) {
        this.tooltipElement.classList.add('visible');
      }
    });
  }

  scheduleTooltip(inputElement) {
    // Clear any existing timeout
    this.cancelTooltip();

    // Schedule tooltip to show after delay
    this.tooltipTimeout = setTimeout(() => {
      this.showAlternativeTooltip(inputElement);
      this.tooltipTimeout = null;
    }, 600); // 600ms delay
  }

  cancelTooltip() {
    // Clear any pending timeout
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }

    // Hide any visible tooltip
    this.hideTooltip();
  }

  hideTooltip() {
    if (this.tooltipElement) {
      this.tooltipElement.remove();
      this.tooltipElement = null;
    }
  }

  /* ---------------- Sorting Helpers ---------------- */

  setupColumnSortHandlers() {
    const headers = document.querySelectorAll('#Events thead th.sortable');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const col = header.dataset.col;
        if (!col) return;

        if (this.sortColumn !== col) {
          this.sortColumn = col;
          this.sortDir = 'asc';
        } else {
          if (this.sortDir === 'asc') {
            this.sortDir = 'desc';
          } else if (this.sortDir === 'desc') {
            this.sortColumn = null;
            this.sortDir = null;
          } else {
            this.sortDir = 'asc';
          }
        }

        // Apply the sort
        setTimeout(() => this.applySort(true), 0);
      });
    });
  }

  setupAutoSortOnBlur() {
    const eventsTable = document.getElementById('Events');
    if (!eventsTable) return;
    eventsTable.addEventListener('blur', (e) => {
      if (e.target.matches('input') && this.sortKeys.length > 0) {
        this.applySort();
      }
    }, true);
  }

  applySort() {
    return;
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    // Build sortKeys array from current column/dir selection
    this.sortKeys = (this.sortColumn && this.sortDir)
      ? [{ col: this.sortColumn, dir: this.sortDir }]
      : [];

    if (this.sortKeys.length === 0) {
      // When sorting is deactivated, restore natural creation order
      if (window.RowSorter) {
        RowSorter.sortRows(tbody, [{ col: 'creation-index', dir: 'asc' }]);
      }
      this.updateHeaderIndicators();
      // Update accordion row indices after restoring natural order
      this.updateAccordionRowIndices();
      // Notify accordion that sorting was cleared
      this.notifyAccordionOfSortChange();
      return;
    }

    if (window.RowSorter) {
      RowSorter.sortRows(tbody, this.sortKeys);
    }

    this.updateHeaderIndicators();

    // CRITICAL FIX: Update tableRowIndex values in accordion manager after sorting
    this.updateAccordionRowIndices();

    // Notify accordion of sort change
    this.notifyAccordionOfSortChange();
  }

  /**
   * Update tableRowIndex values in accordion manager after sorting
   * This ensures that the accordion view can correctly map to table rows
   * even after the table has been sorted
   */
  updateAccordionRowIndices() {
    if (!this.webUI.eventAccordionManager) return;

    const tableRows = document.querySelectorAll('#Events tbody tr');
    const eventIdToIndexMap = new Map();

    // Create a map of eventId to new table row index
    Array.from(tableRows).forEach((row, index) => {
      const eventId = row.dataset.eventId;
      if (eventId) {
        eventIdToIndexMap.set(eventId, index);
      }
    });

    // Update tableRowIndex for each event in the accordion manager
    this.webUI.eventAccordionManager.events.forEach(event => {
      const newIndex = eventIdToIndexMap.get(event.id);
      if (newIndex !== undefined) {
        event.tableRowIndex = newIndex;
      }
    });
  }

  /**
   * Notify accordion manager of sorting changes
   */
  notifyAccordionOfSortChange() {
    if (this.webUI.eventAccordionManager) {
      // Always update row indices when sorting changes
      this.updateAccordionRowIndices();

      // Only refresh if accordion is currently visible
      if (this.viewMode === 'accordion') {
        this.webUI.eventAccordionManager.refresh();
      }
    }
  }

  updateHeaderIndicators() {
    const headers = document.querySelectorAll('#Events thead th.sortable');
    headers.forEach(h => {
      h.classList.remove('sorted-asc', 'sorted-desc', 'sorted-secondary');
      const caret = h.querySelector('.sort-caret');
      if (caret) caret.textContent = '⇅';
    });

    if (!this.sortKeys.length) return;

    // Primary key
    const primary = this.sortKeys[0];
    const primaryHeader = document.querySelector(`#Events thead th.sortable[data-col="${primary.col}"]`);
    if (primaryHeader) {
      primaryHeader.classList.add(primary.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      const caret = primaryHeader.querySelector('.sort-caret');
      if (caret) caret.textContent = primary.dir === 'asc' ? '▲' : '▼';
    }

    // Secondary keys (if any)
    if (this.sortKeys.length > 1) {
      this.sortKeys.slice(1).forEach(sec => {
        const secHeader = document.querySelector(`#Events thead th.sortable[data-col="${sec.col}"]`);
        if (secHeader) {
          secHeader.classList.add('sorted-secondary');
          const caret = secHeader.querySelector('.sort-caret');
          if (caret) caret.textContent = sec.dir === 'asc' ? '▲' : '▼';
        }
      });
    }
  }

  // After constructor, ensure unsorted carets show correctly
  initializeCarets() {
    document.querySelectorAll('#Events thead th.sortable .sort-caret').forEach(c => {
      c.textContent = '⇅';
    });
  }

  /**
   * Show wizard selection modal for event types
   */
  showWizardSelection(initialData = {}) {
    // Get available wizards from the wizard manager
    const wizardManager = this.webUI.eventWizardManager;
    if (!wizardManager || !wizardManager.wizardData) {
      console.error('Wizard manager not available');
      return;
    }

    const wizards = wizardManager.wizardData.EventWizards;
    if (!wizards || wizards.length === 0) {
      console.error('No wizards available');
      return;
    }

    // Check for existing empty row and store reference for replacement
    // This ensures consistent behavior regardless of how the wizard was invoked
    if (!this.pendingEmptyRowForReplacement) {
      const existingEmptyRow = this.findEmptyEventRow();
      if (existingEmptyRow) {
        this.pendingEmptyRowForReplacement = existingEmptyRow;
      }
    }

    // Create selection modal
    this.createWizardSelectionModal(wizards, initialData);
  }

  /**
   * Create and display wizard selection modal
   * @param {Array} wizards - Available wizard configurations
   */
  createWizardSelectionModal(wizards, initialData = {}) {
    // Remove any existing modal
    const existingModal = document.getElementById('wizardSelectionOverlay');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'wizard-overlay';
    overlay.id = 'wizardSelectionOverlay';

    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'event-wizard-modal event-wizard-selection-modal';

    // Modal header
    const header = document.createElement('div');
    header.className = 'event-wizard-step-header';

    const title = document.createElement('h3');
    title.textContent = 'Choose Event Type';
    header.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Select the type of event you want to create:';
    subtitle.className = 'event-wizard-selection-subtitle';
    header.appendChild(subtitle);

    modal.appendChild(header);

    // Modal body with wizard options
    const body = document.createElement('div');
    body.className = 'event-wizard-step-body';

    const wizardGrid = document.createElement('div');
    wizardGrid.className = 'wizard-selection-grid';

    wizards.forEach(wizard => {
      const option = document.createElement('div');
      option.className = 'wizard-selection-option';
      option.dataset.eventType = wizard.eventType;
      option.dataset.category = wizard.category; // expose category to CSS
      option.classList.add(`wizard-category-${wizard.category}`);

      option.innerHTML = `
        <div class="wizard-option-content">
          <h4>${wizard.name}</h4>
        </div>
      `;

      // Add click handler
      option.addEventListener('click', () => {
        this.startWizardForEventType(wizard.eventType, initialData);
        overlay.remove();
      });

      wizardGrid.appendChild(option);
    });

    body.appendChild(wizardGrid);
    modal.appendChild(body);

    // Modal footer
    const footer = document.createElement('div');
    footer.className = 'event-wizard-step-footer';

    // Use a button container to apply consistent right-alignment styles
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'event-wizard-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'event-wizard-button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
      // Clear pending empty row reference when wizard selection is cancelled
      this.pendingEmptyRowForReplacement = null;
      overlay.remove();
    });

    // Append the cancel button to the container, then container to footer
    buttonContainer.appendChild(cancelButton);
    footer.appendChild(buttonContainer);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      // Mobile fix: if the previous Back navigation set the ignore flag, consume
      // this first overlay click without closing the selection modal. This
      // prevents the tap sequence that triggered Back from immediately
      // dismissing the newly opened wizard-selection overlay on touch devices.
      const wizardMgr = this.webUI?.eventWizardManager;
      if (wizardMgr && wizardMgr._ignoreNextOverlayClick) {
        wizardMgr._ignoreNextOverlayClick = false;
        return;
      }

      if (e.target === overlay) {
        // Clear pending empty row reference when wizard selection is cancelled
        this.pendingEmptyRowForReplacement = null;
        overlay.remove();
      }
    });

    // ESC key to close
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Clear pending empty row reference when wizard selection is cancelled
        this.pendingEmptyRowForReplacement = null;
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  }

  /**
   * Start wizard for specific event type
   * @param {string} eventType - The event type code
   */
  startWizardForEventType(eventType, initialData = {}) {
    const wizardManager = this.webUI.eventWizardManager;
    if (wizardManager) {
      // Check for existing empty row and store reference for replacement
      // This ensures consistent behavior regardless of how the wizard was invoked
      if (!this.pendingEmptyRowForReplacement) {
        const existingEmptyRow = this.findEmptyEventRow();
        if (existingEmptyRow) {
          this.pendingEmptyRowForReplacement = existingEmptyRow;
        }
      }

      // Pass pre-populated data along with completion and cancellation callbacks
      wizardManager.startWizard(eventType, initialData,
        // onComplete callback
        (eventData) => {
          // Check if we need to replace an empty row
          if (this.pendingEmptyRowForReplacement) {
            this.replaceEmptyRowWithEvent(this.pendingEmptyRowForReplacement, eventData);
            this.pendingEmptyRowForReplacement = null; // Clear the reference
          } else {
            // Normal flow - create new event
            if (this.viewMode === 'accordion' && this.webUI.eventAccordionManager) {
              // In accordion mode, let accordion manager handle creation and animation
              this.webUI.eventAccordionManager.addEventFromWizard(eventData);
            } else {
              // In table mode, handle creation and sorting here
              this.addEventFromWizardWithSorting(eventData);
            }
          }
        },
        // onCancel callback
        () => {
          // Clear the pending empty row reference if wizard is cancelled
          this.pendingEmptyRowForReplacement = null;
        }
      );
    }
  }

  /**
   * Create event from wizard data
   * @param {Object} eventData - Data collected from wizard
   * @returns {HTMLElement} The created table row
   */
  createEventFromWizard(eventData) {
    // Generate unique ID for this event
    const id = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create a new event row with the wizard data
    const row = this.createEventRow(
      eventData.eventType || '',
      eventData.name || '',
      eventData.amount || '',
      eventData.fromAge || '',
      eventData.toAge || '',
      eventData.rate || '',
      eventData.match || ''
    );

    // Store the unique ID on the row
    row.dataset.eventId = id;

    // Add to table
    const tbody = document.querySelector('#Events tbody');
    if (tbody) {
      tbody.appendChild(row);

      // Update empty state after adding a row
      this.updateEmptyStateMessage(true);

      // Setup formatting for new inputs
      this.webUI.formatUtils.setupCurrencyInputs();
      this.webUI.formatUtils.setupPercentageInputs();
    }

    return { row, id };
  }

  /**
   * Add event from wizard data with sorting and animation for table view
   * @param {Object} eventData - Data collected from wizard
   */
  addEventFromWizardWithSorting(eventData) {
    // Create the event
    const result = this.createEventFromWizard(eventData);
    const row = result.row;
    const id = result.id;

    // Apply sorting and animation for table view
    if (this.sortKeys.length > 0) {
      this.applySort(); // Apply FLIP animation for moved rows

      // Apply HIGHLIGHT animation to the new row after FLIP animation
      setTimeout(() => {
        if (row) {
          row.classList.add('new-event-highlight');
          // Make sure the event ID is preserved after sorting
          if (id && !row.dataset.eventId) {
            row.dataset.eventId = id;
          }
          setTimeout(() => {
            row.classList.remove('new-event-highlight');
          }, 800); // Match animation duration
        }
      }, 400); // After FLIP animation completes
    } else {
      // No sorting active – let highlight animation handle any needed scrolling
      if (row) {
        row.classList.add('new-event-highlight');
        // Make sure the event ID is preserved
        if (id && !row.dataset.eventId) {
          row.dataset.eventId = id;
        }
        setTimeout(() => {
          row.classList.remove('new-event-highlight');
        }, 800); // Match animation duration
      }
    }

    return result;
  }



  /**
   * Format category name for display
   * @param {string} category - Category name
   * @returns {string} Formatted category
   */
  formatCategory(category) {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  /**
   * Animate the newly created table row
   */
  animateNewTableRow(eventData) {
    // The new row is always the one that was just added to the DOM
    // After sorting, we need to find it by marking it during creation
    const tableRows = document.querySelectorAll('#Events tbody tr');
    let targetRow = null;

    // Look for the row that was just created (should have a temporary marker)
    targetRow = document.querySelector('#Events tbody tr.just-created');

    // If no marker found, fall back to finding by data
    if (!targetRow) {
      for (const row of tableRows) {
        if (this.isRowMatchingEventData(row, eventData)) {
          targetRow = row;
          break;
        }
      }
    }

    // Final fallback to last row
    if (!targetRow && tableRows.length > 0) {
      targetRow = tableRows[tableRows.length - 1];
    }

    if (targetRow) {
      // Find the table container to temporarily allow overflow
      const tableContainer = targetRow.closest('.table-container');
      const eventsTable = document.getElementById('Events');

      // Temporarily allow overflow to prevent clipping
      if (tableContainer) {
        tableContainer.style.overflow = 'visible';
      }
      if (eventsTable) {
        eventsTable.style.overflow = 'visible';
      }

      // Add pulse animation class
      targetRow.classList.add('new-event-highlight');

      // Make sure the row is visible before highlighting; scroll only if off-screen
      const rect = targetRow.getBoundingClientRect();
      const viewportHeight = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      if (rect.top < 0 || rect.bottom > viewportHeight) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Remove highlight and restore overflow after animation completes
      setTimeout(() => {
        targetRow.classList.remove('new-event-highlight');
        targetRow.classList.remove('just-created'); // Remove the marker

        // Restore original overflow settings
        if (tableContainer) {
          tableContainer.style.overflow = '';
        }
        if (eventsTable) {
          eventsTable.style.overflow = '';
        }
      }, 800);
    }
  }

  /**
   * Check if a table row matches the given event data
   */
  isRowMatchingEventData(row, eventData) {
    const typeInput = row.querySelector('.event-type');
    const nameInput = row.querySelector('.event-name');
    const amountInput = row.querySelector('.event-amount');
    const fromAgeInput = row.querySelector('.event-from-age');
    const toAgeInput = row.querySelector('.event-to-age');

    // Clean the amount from the table (remove currency formatting)
    const cleanRowAmount = amountInput?.value ? amountInput.value.replace(/[^0-9\.]/g, '') : '';
    const cleanEventAmount = eventData.amount ? eventData.amount.toString() : '';

    return typeInput && typeInput.value === eventData.eventType &&
      nameInput && nameInput.value === eventData.name &&
      cleanRowAmount === cleanEventAmount &&
      fromAgeInput && fromAgeInput.value === eventData.fromAge &&
      toAgeInput && toAgeInput.value === eventData.toAge;
  }

  /**
   * Check if the events table is empty and show appropriate message
   */
  checkEmptyState() {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    const hasRows = tbody.querySelectorAll('tr').length > 0;
    this.updateEmptyStateMessage(hasRows);
  }

  /**
   * Update empty state message visibility
   * @param {boolean} hasEvents - Whether there are events in the table
   */
  updateEmptyStateMessage(hasEvents) {
    let emptyStateEl = document.querySelector('.table-empty-state');

    if (!hasEvents) {
      // No events - show empty state message
      if (!emptyStateEl) {
        const tableContainer = document.querySelector('.events-section .table-container');
        if (tableContainer) {
          // Create empty state element
          emptyStateEl = document.createElement('div');
          emptyStateEl.className = 'table-empty-state';
          emptyStateEl.innerHTML = `
            <p>No events yet. Add events with the wizard or using the Add Event button.</p>
          `;

          // Position it properly within the table container
          const table = tableContainer.querySelector('#Events');
          if (table) {
            // Insert after the table
            table.insertAdjacentElement('afterend', emptyStateEl);
          } else {
            // Fallback: append to container
            tableContainer.appendChild(emptyStateEl);
          }
        }
      } else {
        emptyStateEl.style.display = 'block';
      }
    } else if (emptyStateEl) {
      // Has events - hide empty state message
      emptyStateEl.style.display = 'none';
    }
  }

}