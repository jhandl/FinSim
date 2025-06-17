/* Event management functionality */

class EventsTableManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.eventRowCounter = 0;
    this.ageYearMode = 'age'; // Track current toggle mode
    this.setupAddEventButton();
    this.setupEventTableRowDelete();
    this.setupEventTypeChangeHandler();
    this.setupSimulationModeChangeHandler();
    this.setupAgeYearToggle();
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
    
    // Update table headers and input placeholders
    this.updateTableHeaders();
    this.updateInputPlaceholders();
  }

  updateTableHeaders() {
    // TODO: Implement in Step 5
    // Will update "From Age" ↔ "From Year" and "To Age" ↔ "To Year"
  }

  updateInputPlaceholders() {
    // TODO: Implement in Step 6
    // Will update input placeholders to show "YYYY" in year mode
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
      <td><input type="number" id="EventFromAge_${rowId}" class="event-from-age" min="0" max="100" value="${fromAge}"></td>
      <td><input type="number" id="EventToAge_${rowId}" class="event-to-age" min="0" max="100" value="${toAge}"></td>
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

} 