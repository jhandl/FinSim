/* Event management functionality */

class EventsTableManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.eventRowCounter = 0;
    this.ageYearMode = 'age'; // Track current toggle mode
    this.tooltipElement = null; // Reference to current tooltip
    this.tooltipTimeout = null; // Reference to tooltip delay timeout
    this.setupAddEventButton();
    this.setupEventTableRowDelete();
    this.setupEventTypeChangeHandler();
    this.setupSimulationModeChangeHandler();
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
  }

  setupAddEventButton() {
    const addEventButton = document.getElementById('addEventRow');
    if (addEventButton) {
      addEventButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.addEventRow();
      });
    }
  }

  setupEventTableRowDelete() {
    const eventsTable = document.getElementById('Events');
    if (eventsTable) {
      eventsTable.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-event')) {
          const row = e.target.closest('tr');
          if (row) row.remove();
        }
      });
    }
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

  handleAgeYearToggle(newMode) {
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
    
    // Clear warnings and revalidate events to ensure warning messages 
    // use the correct terminology (age vs year) for the new mode
    this.webUI.clearAllWarnings();
    this.webUI.validateEvents();
  }

  updateTableHeaders() {
    const fromHeader = document.getElementById('fromAgeHeader');
    const toHeader = document.getElementById('toAgeHeader');
    
    if (fromHeader && toHeader) {
      const setText=(el,txt)=>{const span=el.querySelector('.header-text'); if(span){span.textContent=txt;} else {el.childNodes[0].textContent=txt;}};
      if (this.ageYearMode === 'age') {
        setText(fromHeader,'From Age');
        setText(toHeader,'To Age');
        fromHeader.classList.remove('year-mode');
        toHeader.classList.remove('year-mode');
      } else {
        setText(fromHeader,'From Year');
        setText(toHeader,'To Year');
        fromHeader.classList.add('year-mode');
        toHeader.classList.add('year-mode');
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

  createEventRow(type = '', name = '', amount = '', fromAge = '', toAge = '', rate = '', match = '') {
    const rowId = this.generateEventRowId();
    const row = document.createElement('tr');
    row.dataset.rowId = rowId;
    row.dataset.originalEventType = type;

    // Build dropdown options & find label for current selection
    const optionObjects = this.getEventTypeOptionObjects();
    const selectedObj = optionObjects.find((o) => o.value === type) || optionObjects[0];
    const selectedLabel = selectedObj.label;

    row.innerHTML = `
      <td>
          <input type="hidden" id="EventTypeValue_${rowId}" class="event-type" value="${selectedObj.value}">
          <div class="event-type-dd visualization-control" id="EventType_${rowId}">
              <span id="EventTypeToggle_${rowId}" class="dd-toggle pseudo-select">${selectedLabel}</span>
              <div id="EventTypeOptions_${rowId}" class="visualization-dropdown" style="display:none;"></div>
          </div>
      </td>
      <td><input type="text" id="EventName_${rowId}" class="event-name" value="${name}"></td>
      <td><input type="text" id="EventAmount_${rowId}" class="event-amount currency" inputmode="numeric" pattern="[0-9]*" step="1000" value="${amount}"></td>
      <td><input type="text" id="EventFromAge_${rowId}" class="event-from-age" inputmode="numeric" pattern="[0-9]*" value="${fromAge}"></td>
      <td><input type="text" id="EventToAge_${rowId}" class="event-to-age" inputmode="numeric" pattern="[0-9]*" value="${toAge}"></td>
      <td><div class="percentage-container"><input type="text" id="EventRate_${rowId}" class="event-rate percentage" inputmode="numeric" pattern="[0-9]*" placeholder="inflation" value="${rate}"></div></td>
      <td><div class="percentage-container"><input type="text" id="EventMatch_${rowId}" class="event-match percentage" inputmode="numeric" pattern="[0-9]*" value="${match}"></div></td>
      <td>
          <button class="delete-event" title="Delete event">×</button>
      </td>
    `;

    /* =============================================================
       Instantiate dropdown for this row
    ============================================================= */
    const typeInput   = row.querySelector(`#EventTypeValue_${rowId}`);
    const toggleEl    = row.querySelector(`#EventTypeToggle_${rowId}`);
    const dropdownEl  = row.querySelector(`#EventTypeOptions_${rowId}`);

    const dropdown = DropdownUtils.create({
      toggleEl,
      dropdownEl,
      options: optionObjects,
      selectedValue: selectedObj.value,
      width: 200,
      header: 'Event Type',
      onSelect: (val, label) => {
        typeInput.value = val;
        toggleEl.textContent = label;
        row.dataset.originalEventType = val;
        this.updateFieldVisibility(typeInput);
        typeInput.dispatchEvent(new Event('change', { bubbles: true }));
      },
    });
    // Keep reference for later refreshes
    row._eventTypeDropdown = dropdown;

    // Initial visibility update
    this.updateFieldVisibility(typeInput);

    return row;
  }

  addEventRow() {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    // Store the current scroll position to prevent page jumping
    const currentScrollY = window.scrollY;
    
    const row = this.createEventRow();
    tbody.appendChild(row);

    this.webUI.formatUtils.setupCurrencyInputs();
    this.webUI.formatUtils.setupPercentageInputs();
    
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

    // Attach description so DropdownUtils can show tooltips
    return eventTypes.map((et) => ({ ...et, description: descMap[et.value] || et.label }));
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
        setTimeout(()=>this.applySort(true),0);
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

  applySort(flashRows = false) {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    // Build sortKeys array from current column/dir selection
    this.sortKeys = (this.sortColumn && this.sortDir)
      ? [{ col: this.sortColumn, dir: this.sortDir }]
      : [];

    if (this.sortKeys.length === 0) {
      this.updateHeaderIndicators();
      return;
    }

    if (window.RowSorter) {
      RowSorter.sortRows(tbody, this.sortKeys, { flash: flashRows });
    }

    this.updateHeaderIndicators();
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

} 