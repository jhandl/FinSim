/* Event management functionality */

// Assume UIManager is loaded globally for GAS compatibility
export default class EventsTableManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.eventRowCounter = 0;
    this.setupAddEventButton();
    this.setupEventTableRowDelete();
    this.setupEventTypeChangeHandler();
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
          this.updateFieldVisibility(e.target);
        }
      });
    }
  }

  updateFieldVisibility(typeSelect) {
    const row = typeSelect.closest('tr');
    if (!row) return; // Exit if row not found
    const eventType = typeSelect.value;
    // UIManager is global
    const required = UIManager.getRequiredFields(eventType);
    UIManager.getFields().forEach(field => {
      const colIndex = UIManager.getIndexForField(field);
      const cell = row.cells[colIndex];
      if (cell) {
        const input = cell.querySelector('input');
        if (input) {
          // Use 'hidden' for visibility to maintain layout
          input.style.visibility = required[field] === 'hidden' ? 'hidden' : 'visible';
        }
      }
    });
    const rateInput = row.querySelector('.event-rate');
    if (rateInput) {
        // Set placeholder based on whether rate is optional
        rateInput.placeholder = (!required || !required.rate || required.rate === 'optional') ? 'inflation' : '';
    }
  }

  generateEventRowId() {
      // Simple counter, might need adjustment if rows are reordered/deleted frequently in complex ways
      return `row_${++this.eventRowCounter}`;
  }

  createEventRow(type = '', name = '', amount = '', fromAge = '', toAge = '', rate = '', match = '') {
    const rowId = this.generateEventRowId();
    const row = document.createElement('tr');
    row.dataset.rowId = rowId;
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

    const row = this.createEventRow();
    tbody.appendChild(row);

    // Apply formatting to the newly added row
    this.webUI.formatUtils.setupCurrencyInputs();
    this.webUI.formatUtils.setupPercentageInputs();
  }

  getEventTypeOptions(selectedType = '') {
    const eventTypes = [
      { value: 'NOP', label: 'No Operation' },
      { value: 'RI', label: 'Rental Income' },
      { value: 'SI', label: 'Salary Income' },
      { value: 'SInp', label: 'Salary (No Pension)' },
      { value: 'UI', label: 'RSU Income' },
      { value: 'DBI', label: 'Defined Benefit Income' },
      { value: 'FI', label: 'Tax-free Income' },
      { value: 'E', label: 'Expense' },
      { value: 'R', label: 'Real Estate' },
      { value: 'M', label: 'Mortgage' },
      { value: 'SM', label: 'Stock Market' }
    ];
    return eventTypes.map(type => {
      return `<option value="${type.value}" ${type.value === selectedType ? 'selected' : ''}>${type.label}</option>`;
    }).join('');
  }

}