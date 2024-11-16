/* This file has to work only on the website */

class WebUI extends AbstractUI {

  constructor() {
    super();
    this.editCallbacks = new Map();
    this.statusElement = document.getElementById('progress');
    this.setupEventListeners();
    this.setupPercentageInputs();
    this.setupCurrencyInputs();
  }

  getValue(elementId) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    if (element.value !== undefined) {
        let value = element.value;        
        // If value is empty string, return undefined
        if (value === '') {
            return undefined;
        }
        // Remove € sign and commas if present
        if (element.classList.contains('currency')) {
            value = value.replace(/[€,]/g, '');
        }
        // Remove % sign if present
        if (typeof value === 'string') {
            value = value.replace('%', '');
        }
        if (element.classList.contains('percentage')) {
            // Store internally as decimal
            value = parseFloat(value);
            return isNaN(value) ? undefined : value / 100;
        }
        if (element.classList.contains('boolean')) {
            // Convert Yes/No to true/false
            return value === 'Yes';
        }
        const parsed = parseFloat(value);
        return isNaN(parsed) ? undefined : parsed;
    } 
    return element.textContent;
  }

  setValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    if (element.value !== undefined) {
      if (element.classList.contains('currency')) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          element.value = numValue.toLocaleString('en-IE', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          });
        } else {
          element.value = value;
        }
      } else if (element.classList.contains('percentage')) {
        // If value comes from file as decimal (< 1), multiply by 100
        const numValue = parseFloat(value);
        value = numValue < 1 ? (numValue * 100) : numValue;
        element.value = value;
      } else if (element.classList.contains('boolean')) {
        // Convert various boolean formats to Yes/No
        if (typeof value === 'string') {
          value = value.toLowerCase();
          element.value = (value === 'true' || value === 'yes') ? 'Yes' : 'No';
        } else {
          element.value = value ? 'Yes' : 'No';
        }
      } else {
        element.value = value;
      }
    } else {
      element.textContent = value;
    }
  }

  getTableData(groupId, columnCount = 1) {
    const table = document.getElementById(groupId);
    if (!table) throw new Error(`Table not found: ${groupId}`);
    
    const rows = Array.from(table.getElementsByTagName('tr'));
    const elements = [];

    const getInputValue = (input) => {
      if (!input) return undefined;
      const tempId = 'temp_input_for_getValue';
      const originalId = input.id;
      input.id = tempId;
      const value = this.getValue(tempId);
      if (originalId) {
        input.id = originalId;
      } else {
        input.removeAttribute('id');
      }
      return value;
    };

    for (const row of rows) {
      const cells = Array.from(row.getElementsByTagName('td'));
      if (cells.length === 0) continue; // Skip header row
      
      const rowData = [];
      
      if (groupId === 'Events') {
        // Get type and name from first two cells
        const type = cells[0].querySelector('select')?.value || '';
        const name = cells[1].querySelector('input')?.value || '';
        rowData.push(`${type}:${name}`);
        
        // Get remaining values starting from the Amount column (index 2)
        for (let i = 2; i < columnCount + 1; i++) {
          rowData.push(getInputValue(cells[i]?.querySelector('input')));
        }
      } else {
        // Normal table handling
        for (let i = 0; i < columnCount; i++) {
          const input = cells[i]?.querySelector('input');
          rowData.push(input ? getInputValue(input) : (cells[i]?.textContent ?? ''));
        }
      }
      
      if (rowData[0] === "") break;
      elements.push(rowData);
    }
    
    return elements;
  }

  setStatus(message, color) {
    this.statusElement.innerHTML = message;
    if (color) {
      this.statusElement.style.backgroundColor = color;
    }
  }

  setProgress(msg) {
    this.setStatus(msg, STATUS_COLORS.NEUTRAL);
  }

  clearContent(groupId) {
    const container = document.getElementById(groupId);
    if (!container) throw new Error(`Group not found: ${groupId}`);
    
    const inputs = container.getElementsByTagName('input');
    Array.from(inputs).forEach(input => input.value = '');
    
    const cells = container.getElementsByTagName('td');
    Array.from(cells).forEach(cell => {
      if (!cell.querySelector('input')) {
        cell.textContent = '';
      }
    });
  }

  setWarning(elementId, message) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    
    // Apply warning styles
    element.style.backgroundColor = STATUS_COLORS.WARNING;
    element.setAttribute('data-tooltip', message);

    // Add hover events for input tooltip
    element.addEventListener('mouseenter', function() {
        const tooltip = document.createElement('div');
        tooltip.className = 'input-tooltip';
        tooltip.textContent = message;
        element.parentNode.appendChild(tooltip);
        
        // Position the tooltip above the input
        const rect = element.getBoundingClientRect();
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;
    });

    element.addEventListener('mouseleave', function() {
        const tooltip = document.querySelector('.input-tooltip');
        if (tooltip) tooltip.remove();
    });
  }

  setTableCellWarning(tableName, row, col, message) {
    const table = document.getElementById(tableName);
    if (!table) throw new Error(`Table not found: ${tableName}`);
    
    const tbody = table.getElementsByTagName('tbody')[0];
    const rows = tbody.getElementsByTagName('tr');
    
    if (row - 1 >= rows.length) return;
    
    const cells = rows[row - 1].getElementsByTagName('td');
    if (col - 1 >= cells.length) return;
    
    const cell = cells[col];
    cell.setAttribute('title', message);
    cell.style.backgroundColor = STATUS_COLORS.WARNING;
  }

  clearWarning(elementId) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    
    element.style.backgroundColor = STATUS_COLORS.WHITE;
    element.removeAttribute('data-tooltip');
    
    // Remove event listeners by cloning the element
    const newElement = element.cloneNode(true);
    element.parentNode.replaceChild(newElement, element);
  }

  clearAllWarnings() {
    // Find all elements with background color matching WARNING
    const elements = document.querySelectorAll(`[style*="background-color: ${STATUS_COLORS.WARNING}"]`);
    elements.forEach(element => {
      if (element.id) {
        this.clearWarning(element.id);
      }
    });
  }

  setBackground(elementId, color) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    element.style.backgroundColor = color;
  }

  onEdit(callback) {
    this.editCallbacks.set(callback, callback);
  }

  flush() {
    // No-op in web UI as changes are immediate
  }

  setupEventListeners() {
    document.addEventListener('input', (event) => {
      const element = event.target;
      if (!element.id) return;
      
      this.editCallbacks.forEach(callback => {
        callback({
          element: element,
          value: element.value,
          id: element.id
        });
      });
    });
  }

  // Helper method for data rows
  setDataRow(rowIndex, data) {
    const tbody = document.querySelector('#Data tbody');
    if (!tbody) return;

    // Create row if it doesn't exist
    let row = document.getElementById(`data_row_${rowIndex}`);
    if (!row) {
        row = document.createElement('tr');
        row.id = `data_row_${rowIndex}`;
        tbody.appendChild(row);
    }

    // Clear existing cells
    row.innerHTML = '';

    // Get the order of columns from the table header, only those with data-key attributes
    const headers = Array.from(document.querySelectorAll('#Data thead th[data-key]'));

    // Create cells and format values in the order of the headers
    headers.forEach(header => {
        const key = header.dataset.key;
        const value = data[key];

        if (value !== undefined) {
          const td = document.createElement('td');
          if (key === 'Age' || key === 'Year') {
            td.textContent = value.toLocaleString("en-IE", {style: 'decimal', maximumFractionDigits: 0});
          } else if (key === 'WithdrawalRate') {
            td.textContent = value.toLocaleString("en-IE", {style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2});
          } else {
            td.textContent = value.toLocaleString("en-IE", {style: 'currency', currency: 'EUR', maximumFractionDigits: 0});
          }
          row.appendChild(td);
        }
    });

    if (rowIndex % 5 === 0) {
        this.setProgress(Math.round((rowIndex / document.querySelectorAll('[id^="data_row_"]').length) * 100));
    }
  }

  setChartsRow(rowIndex, data) {
    window.simulatorInterface.updateChartsRow(rowIndex, data);
  }

  getVersion() {
    return localStorage.getItem('simulatorVersion') || '1.26';
  }

  setVersion(version) {
    localStorage.setItem('simulatorVersion', version);
    const versionSpan = document.querySelector('.version');
    if (versionSpan) {
      versionSpan.textContent = `Version ${version}`;
    }
  }

  newDataVersion(latestVersion) {
    if (this.showAlert("New configuration version available ("+latestVersion+"):\n\n"+config.dataUpdateMessage+")\n\nDo you want to update?", true))   {
      this.setVersion(latestVersion);
      this.showToast("Configuration updated to version " + latestVersion, "", 15);
    }
  }

  fetchUrl(url) {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);  // false makes the request synchronous
    try {
      xhr.send();
      if (xhr.status === 200) {
        return xhr.responseText;
      } else {
        throw new Error(`HTTP error! status: ${xhr.status}`);
      }
    } catch (error) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }

  showAlert(message, buttons = false) {
    if (buttons) {
      return confirm(message); // Returns true for OK/Yes, false for Cancel/No
    } else {
      alert(message);
      return null;
    }
  }

  showToast(message, title, timeout) {
    // Simple implementation using a div that fades out
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = title ? `${title}: ${message}` : message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, timeout * 1000);
  }

  setVersionNote(message) {
    const versionSpan = document.querySelector('.version');
    if (versionSpan) {
      versionSpan.title = message;
    }
  }

  clearVersionNote() {
    const versionSpan = document.querySelector('.version');
    if (versionSpan) {
      versionSpan.title = '';
    }
  }

  setVersionHighlight(warning) {
    const versionSpan = document.querySelector('.version');
    if (versionSpan) {
      versionSpan.style.backgroundColor = warning ? '#ffe066' : 'transparent';
    }
  }

  newCodeVersion(latestVersion) {
    // No action needed in web version as users always get the latest version
  }

  async saveToFile() {
    const csvContent = serializeSimulation(this);

    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'scenario.csv',
                types: [{
                    description: 'CSV Files',
                    accept: {
                        'text/csv': ['.csv'],
                    },
                }],
            });
            
            const writable = await handle.createWritable();
            await writable.write(csvContent);
            await writable.close();
        } catch (err) {
            if (err.name === 'AbortError') {
                // User clicked Cancel, do nothing
                return;
            }
            // Some other error occurred
            alert('Error saving file: ' + err.message);
        }
    } else {
        // Legacy fallback
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'scenario.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
  }

  async loadFromFile(file) {
    if (!file) return;

    try {
        const content = await file.text();
        const eventData = deserializeSimulation(content, this);
        
        // Update drawdown priorities panel
        const priorityIds = ['PriorityCash', 'PriorityPension', 'PriorityETF', 'PriorityTrust'];
        const prioritiesContainer = document.querySelector('.priorities-container');
        
        if (prioritiesContainer) {
            // Sort priority items based on their values
            const priorityValues = priorityIds.map(id => ({
                id: id,
                value: parseInt(this.getValue(id)) || 0,
                element: prioritiesContainer.querySelector(`[data-priority-id="${id}"]`)
            })).sort((a, b) => a.value - b.value);

            // Reorder elements in the DOM
            priorityValues.forEach(item => {
                if (item.element) {
                    prioritiesContainer.appendChild(item.element);
                    // Update the hidden input value
                    const input = item.element.querySelector('input');
                    if (input) {
                        input.value = item.value;
                    }
                }
            });
        }
        
        // Clear and rebuild events table
        const tbody = document.querySelector('#Events tbody');
        if (tbody) {
            tbody.innerHTML = ''; // Clear existing rows
            eventData.forEach(([type, name, amount, fromAge, toAge, rate, extra]) => {
                if (type && amount) {
                    // Convert decimal rate to percentage for display, but keep empty if undefined
                    const displayRate = (rate !== undefined && rate !== '') ? (rate * 100).toString() : '';
                    
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>
                            <select class="event-type">
                                ${this.getEventTypeOptions(type)}
                            </select>
                        </td>
                        <td><input type="text" class="event-name" value="${name}"></td>
                        <td><input type="number" class="event-amount currency" step="1000" value="${amount}"></td>
                        <td><input type="number" class="event-from-age" min="0" max="100" value="${fromAge || ''}"></td>
                        <td><input type="number" class="event-to-age" min="0" max="100" value="${toAge || ''}"></td>
                        <td><div class="percentage-container"><input type="number" class="event-rate percentage" value="${displayRate}"></div></td>
                        <td><input type="number" class="event-extra" step="0.01" value="${extra === undefined ? '' : extra}"></td>
                        <td>
                            <button class="delete-event" title="Delete event">×</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                }    
            });
            this.setupCurrencyInputs();
            this.setupPercentageInputs();
        }

    } catch (error) {
        console.log("error loading file: " + error);
        alert('Error loading file: Please make sure this is a valid simulation save file.');
        return;
    }
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

  isPercentage(elementId) {
    const element = document.getElementById(elementId);
    return element && element.classList.contains('percentage');
  }

  setupPercentageInputs() {
    const percentageInputs = document.querySelectorAll('input.percentage');
    percentageInputs.forEach(input => {
        // Only wrap if not already wrapped
        if (!input.parentElement.classList.contains('percentage-container')) {
            const container = document.createElement('div');
            container.className = 'percentage-container';
            input.parentNode.insertBefore(container, input);
            container.appendChild(input);
        }

        // Function to update % symbol visibility
        const updatePercentageVisibility = () => {
            const container = input.parentElement;
            if (container && container.classList.contains('percentage-container')) {
                container.style.setProperty('--show-percentage', 
                    input.value.trim() !== '' ? '1' : '0');
            }
        };

        // Add event listeners
        input.addEventListener('input', updatePercentageVisibility);
        input.addEventListener('change', updatePercentageVisibility);

        // Initial state
        updatePercentageVisibility();

        // Focus/blur handlers for editing
        input.addEventListener('focus', function() {
            const value = this.value.replace('%', '');
            if (value !== this.value) {
                this.value = value;
            }
        });

        input.addEventListener('blur', function() {
            if (this.value.trim() !== '') {
                const value = parseFloat(this.value);
                if (!isNaN(value)) {
                    this.value = value;
                }
            }
            updatePercentageVisibility();
        });
    });
  }

  isBoolean(elementId) {
    const element = document.getElementById(elementId);
    return element && element.classList.contains('boolean');
  }

  setupCurrencyInputs() {
    const currencyInputs = document.querySelectorAll('input.currency');
    
    const formatOptions = {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      style: 'currency',
      currency: 'EUR'
    };

    // Create container elements all at once
    currencyInputs.forEach(input => {
      if (!input.parentElement.classList.contains('currency-container')) {
        const container = document.createElement('div');
        container.className = 'currency-container';
        input.parentNode.insertBefore(container, input);
        container.appendChild(input);
      }

      // Remove type="number" to prevent browser validation of formatted numbers
      input.type = 'text';
      input.inputMode = 'numeric';
      input.pattern = '[0-9]*';
    });

    // Use direct event listeners instead of delegation for better reliability
    currencyInputs.forEach(input => {
      input.addEventListener('focus', function() {
        // On focus, show the raw number
        const value = this.value.replace(/[€,]/g, '');
        if (value !== this.value) {
          this.value = value;
        }
      });

      input.addEventListener('blur', function() {
        const value = this.value.replace(/[€,]/g, '');
        if (value) {
          const number = parseFloat(value);
          if (!isNaN(number)) {
            this.value = number.toLocaleString('en-IE', formatOptions);
          }
        }
      });

      // Format initial value if it exists and isn't already formatted
      const value = input.value;
      if (value && value.indexOf('€') === -1) {
        const number = parseFloat(value);
        if (!isNaN(number)) {
          input.value = number.toLocaleString('en-IE', formatOptions);
        }
      }
    });
  }

} 