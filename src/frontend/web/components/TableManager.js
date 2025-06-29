/* Table management functionality */

class TableManager {

  constructor(webUI) {
    this.webUI = webUI;
  }

  getTableData(groupId, columnCount, includeHiddenEventTypes = false) {
    const table = document.getElementById(groupId);
    if (!table) throw new Error(`Table not found: ${groupId}`);
    
    const rows = Array.from(table.getElementsByTagName('tr'));
    const elements = [];

    const getInputValue = (input) => {
      if (!input) return undefined;
      const tempId = 'temp_input_for_getValue';
      const originalId = input.id;
      input.id = tempId;
      const value = DOMUtils.getValue(tempId);
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
      
      // Skip hidden rows unless specifically requested to include hidden event types
      if (groupId === 'Events' && !includeHiddenEventTypes && row.style.display === 'none') {
        continue;
      }
      
      const rowData = [];
      
      if (groupId === 'Events') {
        // Get type from select element and name from input
        // Use the original stored event type if specifically requested (for serialization), otherwise use current value
        const selectElement = cells[0].querySelector('select');
        const originalType = row.dataset.originalEventType;
        const type = (includeHiddenEventTypes && originalType) ? originalType : (selectElement?.value || '');
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
          td.textContent = value.toString();
        } else if (key === 'WithdrawalRate') {
          td.textContent = value.toLocaleString("en-IE", {style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2});
        } else {
          td.textContent = value.toLocaleString("en-IE", {style: 'currency', currency: 'EUR', maximumFractionDigits: 0});
        }
        row.appendChild(td);
      }
    });
  }

  setDataRowBackgroundColor(rowIndex, backgroundColor) {
    const row = document.getElementById(`data_row_${rowIndex}`);
    if (row) {
      row.style.backgroundColor = backgroundColor;
    }
  }

  clearExtraDataRows(maxAge) {
    const headerRow = document.querySelector('#Data thead tr:nth-child(2)');
    const headers = Array.from(headerRow.cells);
    const ageColumnIndex = headers.findIndex(header => header.getAttribute('data-key') === 'Age');
    if (ageColumnIndex === -1) {
      console.error("Age column not found");
      return;
    }
    const dataRows = document.querySelectorAll('#Data tbody tr');
    let maxAgeRowIndex = -1;
    dataRows.forEach((row, index) => {
      const ageCell = row.cells[ageColumnIndex];
      if (ageCell) {
        const age = parseInt(ageCell.textContent, 10);
        if (age === maxAge && maxAgeRowIndex === -1) {  // Find first occurrence
          maxAgeRowIndex = index + 1;  // Save the index of the next row
        }
      }
    });
    if (maxAgeRowIndex !== -1) {
      // Remove all rows starting after the first maxAge row
      for (let i = dataRows.length - 1; i >= maxAgeRowIndex; i--) {
        dataRows[i].remove();
      }
    }
  }

  exportDataTableAsCSV() {
    const table = document.getElementById('Data');
    if (!table) {
      throw new Error('Data table not found');
    }

    // Get headers from the second header row (the one with data-key attributes)
    const headerRow = table.querySelector('thead tr:nth-child(2)');
    if (!headerRow) {
      throw new Error('Data table headers not found');
    }

    const headers = Array.from(headerRow.cells)
      .filter(cell => cell.hasAttribute('data-key'))
      .map(cell => cell.textContent.trim());

    // Get data rows
    const dataRows = Array.from(table.querySelectorAll('tbody tr'));

    if (dataRows.length === 0) {
      throw new Error('No data to export. Please run a simulation first.');
    }

    // Build CSV content
    let csvContent = headers.join(',') + '\n';

    dataRows.forEach(row => {
      const cells = Array.from(row.cells);
      const rowData = cells.map(cell => {
        let value = cell.textContent.trim();

        // Handle values that contain commas by wrapping in quotes
        if (value.includes(',')) {
          value = `"${value}"`;
        }

        return value;
      });

      csvContent += rowData.join(',') + '\n';
    });

    return csvContent;
  }

  async downloadDataTableCSV() {
    try {
      const csvContent = this.exportDataTableAsCSV();
      const scenarioName = this.webUI.getScenarioName() || 'scenario';
      const suggestedName = `${scenarioName.trim()}_simulation-data.csv`;

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: suggestedName,
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
            return; // User cancelled
          }
          throw err;
        }
      } else {
        // Legacy fallback
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      this.webUI.notificationUtils.showAlert(error.message, 'Error');
    }
  }

}
 