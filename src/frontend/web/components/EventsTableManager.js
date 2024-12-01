/* Event management functionality */

class EventsTableManager {

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
    const eventType = typeSelect.value;
    const required = UIManager.getRequiredFields(eventType);
    UIManager.getFields().forEach(field => {
      const colIndex = UIManager.getIndexForField(field);
      const cell = row.cells[colIndex];
      if (cell) {
        const input = cell.querySelector('input');
        if (input) {
          input.style.visibility = required[field] === 'hidden' ? 'hidden' : 'visible';
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

    this.webUI.formatUtils.setupCurrencyInputs();
    this.webUI.formatUtils.setupPercentageInputs();
  }

  getEventTypeOptions(selectedType = '') {
    const eventTypes = [
      'NOP:No Operation',
      'RI:Rental Income',
      'SI:Salary Income',
      'SInp:Salary (No Pension)',
      'UI:RSU Income',
      'DBI:Defined Benefit Income',
      'FI:Tax-free Income',
      'E:Expense',
      'R:Real Estate',
      'M:Mortgage',
      'SM:Stock Market'
    ];
    return eventTypes.map(type => {
      const [value, label] = type.split(':');
      return `<option value="${value}" ${value === selectedType ? 'selected' : ''}>${label}</option>`;
    }).join('');
  }

} 