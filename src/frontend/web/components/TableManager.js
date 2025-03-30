/* Table management functionality */

import DOMUtils from '../utils/DOMUtils.js'; // Import local utility

export default class TableManager {

  constructor(webUI) {
    this.webUI = webUI; // Store reference if needed, otherwise remove
  }

  getTableData(groupId, columnCount) {
    const table = document.getElementById(groupId);
    if (!table) throw new Error(`Table not found: ${groupId}`);

    const rows = Array.from(table.getElementsByTagName('tr'));
    const elements = [];

    const getInputValue = (input) => {
      if (!input) return undefined;
      const tempId = 'temp_input_for_getValue_' + Math.random().toString(36).substring(2, 9); // More unique temp ID
      const originalId = input.id;
      input.id = tempId;
      const value = DOMUtils.getValue(tempId); // Use imported DOMUtils
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
        // Get type from select element and name from input
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

      // Stop processing if the first cell of a row is empty (assuming it indicates end of data)
      if (rowData.length > 0 && (rowData[0] === "" || rowData[0] === undefined || rowData[0] === null)) break;
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

      // Create cell even if value is undefined/null to maintain column structure
      const td = document.createElement('td');
      if (value !== undefined && value !== null) {
        if (key === 'Age' || key === 'Year') {
          td.textContent = value.toString();
        } else if (key === 'WithdrawalRate') {
          // Ensure value is a number before formatting
          const numValue = parseFloat(value);
          td.textContent = !isNaN(numValue) ? numValue.toLocaleString("en-IE", {style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2}) : '';
        } else {
           // Ensure value is a number before formatting
          const numValue = parseFloat(value);
          td.textContent = !isNaN(numValue) ? numValue.toLocaleString("en-IE", {style: 'currency', currency: 'EUR', maximumFractionDigits: 0}) : '';
        }
      } else {
        td.textContent = ''; // Explicitly set empty content
      }
      row.appendChild(td);
    });
  }

  clearExtraDataRows(maxAge) {
    const headerRow = document.querySelector('#Data thead tr:nth-child(2)');
    if (!headerRow) {
        console.error("Data table header row not found");
        return;
    }
    const headers = Array.from(headerRow.cells);
    const ageColumnIndex = headers.findIndex(header => header.getAttribute('data-key') === 'Age');
    if (ageColumnIndex === -1) {
      console.error("Age column not found in data table header");
      return;
    }
    const dataRows = document.querySelectorAll('#Data tbody tr');
    let maxAgeRowIndex = -1;
    dataRows.forEach((row, index) => {
      const ageCell = row.cells[ageColumnIndex];
      if (ageCell) {
        const age = parseInt(ageCell.textContent, 10);
        if (!isNaN(age) && age === maxAge && maxAgeRowIndex === -1) {  // Find first occurrence
          maxAgeRowIndex = index; // Index of the row with maxAge
        }
      }
    });

    if (maxAgeRowIndex !== -1) {
      // Remove all rows starting after the first maxAge row
      for (let i = dataRows.length - 1; i > maxAgeRowIndex; i--) {
        dataRows[i].remove();
      }
    }
  }

}