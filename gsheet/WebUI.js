class WebUI extends AbstractUI {
  constructor() {
    super();
    this.STATUS_COLORS = {
      ERROR: "#ff8080",
      WARNING: "#ffe066",
      SUCCESS: "#9fdf9f",
      NEUTRAL: "#E0E0E0",
      WHITE: "#FFFFFF"
    };
    this.editCallbacks = new Map();
  }

  initialize() {
    this.statusElement = document.getElementById('progress');
    this.setupEventListeners();
  }

  getValue(elementId) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    return element.value !== undefined ? element.value : element.textContent;
  }

  setValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    if (element.value !== undefined) {
      element.value = value;
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
      for (let i = 0; i < columnCount; i++) {
        const value = cells[i]?.querySelector('input')?.value ?? 
                     cells[i]?.textContent ?? '';
        rowData.push(value);
      }
      
      if (rowData[0] === "") break;
      elements.push(rowData);
    }
    
    return elements;
  }

  setStatus(message, color) {
    if (!this.statusElement) return;
    this.statusElement.textContent = message;
    if (color) {
      this.statusElement.style.backgroundColor = color;
    }
  }

  setProgress(percentage) {
    this.setStatus(`Processing ${Math.round(percentage)}%`, this.STATUS_COLORS.NEUTRAL);
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
    
    element.setAttribute('title', message);
    element.style.backgroundColor = this.STATUS_COLORS.WARNING;
    
    // Add warning icon if not exists
    if (!element.nextElementSibling?.classList.contains('warning-icon')) {
      const warningIcon = document.createElement('span');
      warningIcon.classList.add('warning-icon');
      warningIcon.textContent = '⚠️';
      element.parentNode.insertBefore(warningIcon, element.nextSibling);
    }
  }

  clearWarning(elementId) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    
    element.removeAttribute('title');
    element.style.backgroundColor = this.STATUS_COLORS.WHITE;
    
    const warningIcon = element.nextElementSibling;
    if (warningIcon?.classList.contains('warning-icon')) {
      warningIcon.remove();
    }
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
} 