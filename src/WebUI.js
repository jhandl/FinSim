/* This file has to work only on the website */

class WebUI extends AbstractUI {

  constructor() {
    super();
    this.editCallbacks = new Map();
    this.statusElement = document.getElementById('progress');
    this.setupEventListeners();
  }

  getValue(elementId) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    if (element.value !== undefined) {
      let value = element.value;
      // Remove % sign if present
      if (typeof value === 'string') {
        value = value.replace('%', '');
      }
      value = parseFloat(value) || 0;
      if (element.classList.contains('percentage')) {
        // Store internally as decimal
        return value / 100;
      }
      return value;
    } 
    return element.textContent;
  }

  setValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    if (element.value !== undefined) {
      if (element.classList.contains('percentage')) {
        // If value comes from file as decimal (< 1), multiply by 100
        const numValue = parseFloat(value);
        value = numValue < 1 ? (numValue * 100) : numValue;
        element.value = value;
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

    for (const row of rows) {
      const cells = Array.from(row.getElementsByTagName('td'));
      if (cells.length === 0) continue; // Skip header row
      
      const rowData = [];
      
      // Special handling for events table
      if (groupId === 'Events') {
        // Get type and name from first two cells
        const type = cells[0].querySelector('select')?.value || '';
        const name = cells[1].querySelector('input')?.value || '';
        rowData.push(`${type}:${name}`); // Combined type:name as first element
        
        // Get remaining values starting from the Amount column (index 2)
        for (let i = 2; i < columnCount + 1; i++) {
          const input = cells[i]?.querySelector('input');
          rowData.push(input?.value || '');
        }
      } else {
        // Normal table handling
        for (let i = 0; i < columnCount; i++) {
          const value = cells[i]?.querySelector('input')?.value ?? 
                       cells[i]?.textContent ?? '';
          rowData.push(value);
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
    // Parse table cell reference if in format "TableName[row,col]"
    const tableMatch = elementId.match(/^(\w+)\[(\d+),(\d+)\]$/);
    if (tableMatch) {
      const [_, tableName, row, col] = tableMatch;
      this.setTableCellWarning(tableName, parseInt(row), parseInt(col), message);
    } else {
      const element = document.getElementById(elementId);
      if (!element) throw new Error(`Element not found: ${elementId}`);
      
      element.setAttribute('title', message);
      element.style.backgroundColor = STATUS_COLORS.WARNING;
      
      // Add warning icon if not exists
      if (!element.nextElementSibling?.classList.contains('warning-icon')) {
        const warningIcon = document.createElement('span');
        warningIcon.classList.add('warning-icon');
        warningIcon.textContent = '⚠️';
        element.parentNode.insertBefore(warningIcon, element.nextSibling);
      }
    }
  }

  setTableCellWarning(tableName, row, col, message) {
    const table = document.getElementById(tableName);
    if (!table) throw new Error(`Table not found: ${tableName}`);
    
    const tbody = table.getElementsByTagName('tbody')[0];
    const rows = tbody.getElementsByTagName('tr');
    
    if (row - 1 >= rows.length) return;
    
    const cells = rows[row - 1].getElementsByTagName('td');
    if (col - 1 >= cells.length) return;
    
    const cell = cells[col - 1];
    cell.setAttribute('title', message);
    cell.style.backgroundColor = STATUS_COLORS.WARNING;
  }

  clearWarning(elementId) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    
    element.removeAttribute('title');
    element.style.backgroundColor = STATUS_COLORS.WHITE;
    
    const warningIcon = element.nextElementSibling;
    if (warningIcon?.classList.contains('warning-icon')) {
      warningIcon.remove();
    }
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
  setDataRow(rowIndex, data, scale = 1) {
    Object.entries(data).forEach(([field, value]) => {
      const cell = document.querySelector(`#${field}_${rowIndex}`);
      if (cell) {
        if (cell.tagName === 'INPUT') {
          cell.value = value / scale;
        } else {
          cell.textContent = value / scale;
        }
      }
    });

    if (rowIndex % 5 === 0) {
      this.setProgress((rowIndex / document.querySelectorAll('[id^="Year_"]').length) * 100);
    }
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
    try {
        const csvContent = serializeSimulation(this);

        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'simulation.csv',
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
            // Fallback for browsers that don't support File System Access API
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'simulation.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
    } catch (error) {
        alert('Error saving file: ' + error.message);
    }
  }

  async loadFromFile(file) {
    if (!file) return;

    try {
        const content = await file.text();
        const eventData = deserializeSimulation(content, this);
        
        // Clear and rebuild events table
        const tbody = document.querySelector('#Events tbody');
        if (tbody) {
            tbody.innerHTML = ''; // Clear existing rows
            eventData.forEach(([type, name, amount, fromAge, toAge, rate, extra]) => {
                if (type && amount) {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>
                            <select class="event-type">
                                ${this.getEventTypeOptions(type)}
                            </select>
                        </td>
                        <td><input type="text" class="event-name" value="${name}"></td>
                        <td><input type="number" class="event-amount" step="1000" value="${amount}"></td>
                        <td><input type="number" class="event-from-age" min="0" max="100" value="${fromAge}"></td>
                        <td><input type="number" class="event-to-age" min="0" max="100" value="${toAge}"></td>
                        <td><input type="number" class="event-rate" step="0.001" value="${rate}"></td>
                        <td><input type="number" class="event-extra" step="0.01" value="${extra}"></td>
                        <td>
                            <button class="delete-event" title="Delete event">×</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                }
            });
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

} 