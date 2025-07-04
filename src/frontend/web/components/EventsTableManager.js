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
    // Sorting preset and handlers
    this.sortPreset = localStorage.getItem('eventsSortPreset') || 'none';
    this.sortColumn = null;
    this.sortDir = null;
    this.sortKeys = [];
    this.populateSortPresets();
    this.setupSortDirectDropdown();
    this.setupColumnSortHandlers();
    this.setupAutoSortOnBlur();
    // Apply initial sort after DOM settles
    setTimeout(() => this.applyPresetSort(), 0);
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
    if (!tbody) {
      return;
    }

    const rows = tbody.querySelectorAll('tr');

    rows.forEach((row, index) => {
      const typeSelect = row.querySelector('.event-type');
      const originalEventType = row.dataset.originalEventType || (typeSelect ? typeSelect.value : '');

      if (typeSelect) {

        // 1. Update row visibility for P2-specific events
        let shouldHide = simulationMode === 'single' && (originalEventType === 'SI2' || originalEventType === 'SI2np');

        if (shouldHide) {
          row.style.display = 'none';
        } else {
          row.style.display = '';
        }

        // 2. Refresh event type dropdown options, trying to select the original type
        const newOptionsHTML = this.getEventTypeOptions(originalEventType);
        typeSelect.innerHTML = newOptionsHTML;
        typeSelect.value = originalEventType;
      } else {
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
    
    row.innerHTML = `
      <td>
          <select id="EventType_${rowId}" class="event-type">
              ${this.getEventTypeOptions(type)}
          </select>
      </td>
      <td><input type="text" id="EventName_${rowId}" class="event-name" value="${name}"></td>
      <td><input type="number" id="EventAmount_${rowId}" class="event-amount currency" inputmode="numeric" pattern="[0-9]*" step="1000" value="${amount}"></td>
      <td><input type="number" id="EventFromAge_${rowId}" class="event-from-age" value="${fromAge}"></td>
      <td><input type="number" id="EventToAge_${rowId}" class="event-to-age" value="${toAge}"></td>
      <td><div class="percentage-container"><input type="number" id="EventRate_${rowId}" class="event-rate percentage" inputmode="numeric" pattern="[0-9]*" placeholder="inflation" value="${rate}"></div></td>
      <td><div class="percentage-container"><input type="number" id="EventMatch_${rowId}" class="event-match percentage" inputmode="numeric" pattern="[0-9]*" value="${match}"></div></td>
      <td>
          <button class="delete-event" title="Delete event">×</button>
      </td>
    `;
    if (type) {
      this.updateFieldVisibility(row.querySelector(`#EventType_${rowId}`));
    }

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

    // Re-apply preset sort if active
    this.applyPresetSort();
  }

  getEventTypeOptions(selectedType = '') {
    const simulationMode = this.webUI.getValue('simulation_mode'); 
    
    // Define all possible salary event types with their codes and base labels
    // P1 codes are SI, SInp. P2 codes are SI2, SI2np.
    const salaryTypesConfig = [
      { code: 'SI', singleLabel: "Salary Income", jointLabel: "Your Salary" },
      { code: 'SInp', singleLabel: "Salary (no pension)", jointLabel: "Your Salary (no pension)" },
      { code: 'SI2', singleLabel: null, jointLabel: "Their Salary" },
      { code: 'SI2np', singleLabel: null, jointLabel: "Their Salary (no pension)" }
    ];

    const eventTypes = [
      { value: 'NOP', label: 'No Operation' },
      // Salary types will be inserted here
    ];

    salaryTypesConfig.forEach(stc => {
      if (simulationMode === 'single') {
        if (stc.singleLabel) { // Only add if it has a label for single mode (SI, SInp)
          eventTypes.push({ value: stc.code, label: stc.singleLabel });
        }
      } else { // joint mode
        // In joint mode, all configured salary types with a jointLabel are added
        if (stc.jointLabel) {
            eventTypes.push({ value: stc.code, label: stc.jointLabel });
        }
      }
    });

    // Add other non-salary event types
    eventTypes.push(
      ...[
        { value: 'UI', label: 'RSU Income' },
        { value: 'RI', label: 'Rental Income' },
        { value: 'DBI', label: 'Defined Benefit Income' },
        { value: 'FI', label: 'Tax-free Income' },
        { value: 'E', label: 'Expense' },
        { value: 'R', label: 'Real Estate' },
        { value: 'M', label: 'Mortgage' },
        { value: 'SM', label: 'Stock Market' }
      ]
    );
    
    // Order: NOP, P1 Salarires (SI, SInp), P2 Salaries (SI2, SI2np if joint), then UI, RI, DBI etc.
    // This order is naturally achieved by current insertion if salaryTypesConfig is ordered SI, SInp, SI2, SI2np.
    // If a more specific order is required, sort eventTypes array here before mapping.

    return eventTypes.map(type => {
      return `<option value="${type.value}" ${type.value === selectedType ? 'selected' : ''}>${type.label}</option>`;
    }).join('');
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

  populateSortPresets() {
    const dropdown = document.getElementById('eventsSortOptions');
    if (!dropdown) return;

    // Avoid repopulation
    if (dropdown.querySelector('[data-value]')) return;

    const presets = [
      { value: 'none', label: 'None', description: 'Disable automatic sorting' },
      { value: 'age', label: 'Age (asc)', description: 'Sort by starting age ascending' },
      { value: 'amount', label: 'Amount (desc)', description: 'Sort by amount descending' },
      { value: 'type-age', label: 'Type → Age', description: 'Sort by event type then age' },
      { value: 'type-amount', label: 'Type → Amount', description: 'Sort by event type then amount' },
      { value: 'custom', label: 'Custom', description: 'Ordering set via column headers' }
    ];

    presets.forEach(p => {
      const opt = document.createElement('div');
      opt.setAttribute('data-value', p.value);
      opt.textContent = p.label;
      opt.setAttribute('data-description', p.description);
      if (p.value === this.sortPreset) opt.classList.add('selected');
      dropdown.appendChild(opt);
    });
  }

  updateSelectedSortDisplay() {
    const displayEl = document.getElementById('selectedSortDisplay');
    if (!displayEl) return;
    const dropdown = document.getElementById('eventsSortOptions');
    if (!dropdown) return;
    const selected = dropdown.querySelector(`div[data-value="${this.sortPreset}"]`);
    if (selected) displayEl.textContent = selected.textContent;
  }

  setupSortDirectDropdown() {
    const toggleButton = document.getElementById('eventsSortToggle');
    const dropdown = document.getElementById('eventsSortOptions');
    const controlContainer = toggleButton ? toggleButton.closest('.visualization-control') : null;

    if (!toggleButton || !dropdown || !controlContainer) return;

    let activeTooltip = null;
    let tooltipTimeout = null;

    const createTooltip = (text) => {
      const tooltip = document.createElement('div');
      tooltip.className = 'visualization-tooltip';
      tooltip.textContent = text;
      document.body.appendChild(tooltip);
      return tooltip;
    };

    const positionTooltip = (tooltip, targetRect) => {
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const margin = 10;
      let left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
      let top = targetRect.top - tooltipRect.height - 10;
      if (left < margin) left = margin;
      if (left + tooltipRect.width > viewportWidth - margin) left = viewportWidth - tooltipRect.width - margin;
      if (top < margin) top = targetRect.bottom + 10;
      tooltip.style.position = 'fixed';
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    };

    const showTooltipDelayed = (text, targetRect) => {
      if (tooltipTimeout) clearTimeout(tooltipTimeout);
      if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
      if (!text) return;
      tooltipTimeout = setTimeout(() => {
        const tt = createTooltip(text);
        activeTooltip = tt;
        requestAnimationFrame(() => {
          positionTooltip(tt, targetRect);
          tt.classList.add('visible');
        });
        tooltipTimeout = null;
      }, 600);
    };

    const hideTooltip = () => {
      if (tooltipTimeout) { clearTimeout(tooltipTimeout); tooltipTimeout = null; }
      if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
    };

    // Toggle dropdown on click
    controlContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      const visible = dropdown.style.display !== 'none';
      if (visible) { dropdown.style.display = 'none'; return; }

      hideTooltip();
      dropdown.style.display = 'block';
      dropdown.style.visibility = 'hidden';

      const iconRect = toggleButton.getBoundingClientRect();
      const dropdownRect = dropdown.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - iconRect.bottom;
      const spaceAbove = iconRect.top;
      const dropdownHeight = dropdownRect.height;
      dropdown.style.position = 'fixed';
      dropdown.style.zIndex = '10001';
      if (spaceBelow >= dropdownHeight + 10) {
        dropdown.style.left = iconRect.left + 'px';
        dropdown.style.top = (iconRect.bottom + 2) + 'px';
      } else if (spaceAbove >= dropdownHeight + 10) {
        dropdown.style.left = iconRect.left + 'px';
        dropdown.style.top = (iconRect.top - dropdownHeight - 2) + 'px';
      } else {
        dropdown.style.left = iconRect.left + 'px';
        dropdown.style.top = Math.max(10, viewportHeight - dropdownHeight - 10) + 'px';
      }
      dropdown.style.visibility = 'visible';

      // highlight selected
      const sel = dropdown.querySelector('.selected');
      dropdown.querySelectorAll('.highlighted').forEach(o=>o.classList.remove('highlighted'));
      if (sel) sel.classList.add('highlighted');
    });

    // Option click
    dropdown.addEventListener('click', (e) => {
      if (!e.target.hasAttribute('data-value')) return;
      const val = e.target.getAttribute('data-value');
      this.sortPreset = val;
      localStorage.setItem('eventsSortPreset', this.sortPreset);
      // Update UI selections
      dropdown.querySelectorAll('[data-value]').forEach(opt=>opt.classList.remove('selected'));
      e.target.classList.add('selected');
      dropdown.style.display = 'none';
      this.updateSelectedSortDisplay();
      setTimeout(()=>this.applyPresetSort(true),0);
    });

    // Option hover tooltip (desktop)
    dropdown.addEventListener('mouseover', (e) => {
      if (window.innerWidth <= 768) return;
      if (!e.target.hasAttribute('data-value')) return;
      dropdown.querySelectorAll('.highlighted').forEach(opt=>opt.classList.remove('highlighted'));
      e.target.classList.add('highlighted');
      const desc = e.target.getAttribute('data-description');
      if (desc) {
        showTooltipDelayed(desc, e.target.getBoundingClientRect());
      }
    });
    dropdown.addEventListener('mouseout', () => { if (window.innerWidth > 768) hideTooltip(); });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !controlContainer.contains(e.target)) {
        dropdown.style.display = 'none';
        hideTooltip();
      }
    });

    // Initial display
    this.updateSelectedSortDisplay();
  }

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

        // Switch to custom preset
        this.sortPreset = 'custom';
        localStorage.setItem('eventsSortPreset', this.sortPreset);
        this.updateSelectedSortDisplay();
        setTimeout(()=>this.applyPresetSort(true),0);
      });
    });
  }

  setupAutoSortOnBlur() {
    const eventsTable = document.getElementById('Events');
    if (!eventsTable) return;
    eventsTable.addEventListener('blur', (e) => {
      if (e.target.matches('input') && this.sortKeys.length > 0) {
        this.applyPresetSort();
      }
    }, true);
  }

  applyPresetSort(flashRows = false) {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    // Determine sort keys
    if (this.sortPreset === 'none') {
      this.sortKeys = [];
    } else if (this.sortPreset === 'age') {
      this.sortKeys = [{ col: 'from-age', dir: 'asc' }];
    } else if (this.sortPreset === 'amount') {
      this.sortKeys = [{ col: 'event-amount', dir: 'desc' }];
    } else if (this.sortPreset === 'type-age') {
      this.sortKeys = [
        { col: 'event-type', dir: 'asc' },
        { col: 'from-age', dir: 'asc' }
      ];
    } else if (this.sortPreset === 'type-amount') {
      this.sortKeys = [
        { col: 'event-type', dir: 'asc' },
        { col: 'event-amount', dir: 'asc' }
      ];
    } else if (this.sortPreset === 'custom') {
      if (this.sortColumn && this.sortDir) {
        this.sortKeys = [{ col: this.sortColumn, dir: this.sortDir }];
      } else {
        this.sortKeys = [];
      }
    }

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

  /**
   * Set sort preset programmatically (e.g., when loading a scenario)
   */
  setSortPreset(preset) {
    if (!preset) return;
    this.sortPreset = preset;
    // Reset custom columns if preset not custom
    if (preset !== 'custom') {
      this.sortColumn = null;
      this.sortDir = null;
    }
    localStorage.setItem('eventsSortPreset', this.sortPreset);
    this.updateSelectedSortDisplay();
    this.applyPresetSort();
  }

  // After constructor, ensure unsorted carets show correctly
  initializeCarets() {
    document.querySelectorAll('#Events thead th.sortable .sort-caret').forEach(c => {
      c.textContent = '⇅';
    });
  }

} 