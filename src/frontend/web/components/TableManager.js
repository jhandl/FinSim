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
        const typeInput = cells[0].querySelector('.event-type');
        const originalType = row.dataset.originalEventType;
        const type = (includeHiddenEventTypes && originalType) ? originalType : (typeInput?.value || '');
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

    // Before building row, ensure headers exist for any new dynamic keys
    const headerRow = document.querySelector('#Data thead tr:nth-child(2)');
    if (headerRow) {
      const existingKeys = new Set(Array.from(headerRow.querySelectorAll('th[data-key]')).map(h=>h.dataset.key));
      const deductionsGroupTh = document.querySelector('#Data thead tr.header-groups th:nth-child(16)'); // 0-index? colSpan=5 originally
      let addedCount = 0;
      for (const key in data) {
        if (key.startsWith('Tax__') && !existingKeys.has(key)) {
          // create new header
          const th = document.createElement('th');
          th.setAttribute('data-key', key);
          const labelRaw = key.substring(6); // remove Tax__
          th.textContent = labelRaw.toUpperCase();
          th.title = labelRaw + ' tax paid';
          headerRow.appendChild(th);
          existingKeys.add(key);
          addedCount++;
        }
      }
      if (addedCount>0 && deductionsGroupTh) {
        deductionsGroupTh.colSpan = (parseInt(deductionsGroupTh.colSpan) || 5) + addedCount;
      }
    }

    // Get the order of columns from the table header, only those with data-key attributes
    const headers = Array.from(document.querySelectorAll('#Data thead th[data-key]'));

    // Create cells and format values in the order of the headers
    headers.forEach(header => {
      const key = header.dataset.key;
      const value = data[key];

      if (value !== undefined) {
        const td = document.createElement('td');
        
        // Create a container for the cell content
        const contentContainer = document.createElement('div');
        contentContainer.className = 'cell-content';
        
        // Add the formatted value
        if (key === 'Age' || key === 'Year') {
          contentContainer.textContent = value.toString();
        } else if (key === 'WithdrawalRate') {
          contentContainer.textContent = value.toLocaleString("en-IE", {style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2});
        } else {
          contentContainer.textContent = value.toLocaleString("en-IE", {style: 'currency', currency: 'EUR', maximumFractionDigits: 0});
        }
        
        // Add tooltip for attributable values
        let hasTooltip = false;
        if (data.Attributions) {
            // Convert table column key to lowercase to match attribution keys
            let attributionKey = key.toLowerCase();
            
            // Handle combined columns that have multiple attribution sources
            let breakdown = null;
            if (key === 'incomePrivatePension') {
                // Combine private pension and defined benefit attributions
                const privatePensionBreakdown = data.Attributions['incomeprivatepension'] || {};
                const definedBenefitBreakdown = data.Attributions['incomedefinedbenefit'] || {};
                breakdown = { ...privatePensionBreakdown, ...definedBenefitBreakdown };
            } else if (key === 'incomeCash') {
                // Combine cash withdrawal and tax-free income attributions
                const cashBreakdown = data.Attributions['incomecash'] || {};
                const taxFreeBreakdown = data.Attributions['incometaxfree'] || {};
                breakdown = { ...cashBreakdown, ...taxFreeBreakdown };
            } else if (key === 'FundsCapital') {
                // Use index funds capital attribution
                breakdown = data.Attributions['indexfundscapital'] || {};
            } else if (key === 'SharesCapital') {
                // Use shares capital attribution
                breakdown = data.Attributions['sharescapital'] || {};
            } else {
                // Check for specific attribution first, then fall back to general 'income' for income columns
                breakdown = data.Attributions[attributionKey];
                if (!breakdown && key.startsWith('income') && data.Attributions.income) {
                    breakdown = data.Attributions.income;
                }
            }
            
            if (breakdown) {
                let tooltipText = '';
                
                // Special handling for asset columns (FundsCapital and SharesCapital)
                if (key === 'FundsCapital' || key === 'SharesCapital') {
                    const orderedKeys = ['Bought', 'Sold', 'Principal', 'P/L'];
                    
                    // Pre-format all amounts and calculate max width
                    const formattedAmounts = orderedKeys.map(source => {
                        const amount = breakdown[source] || 0;
                        if (amount === 0) return null;
                        
                        // Special handling for P/L
                        let displaySource = source;
                        if (source === 'P/L') {
                            displaySource = amount > 0 ? 'Accum. Gains' : 'Accum. Losses';
                        }
                        
                        return {
                            source: displaySource,
                            formatted: Math.abs(amount).toLocaleString("en-IE", {style: 'currency', currency: 'EUR', maximumFractionDigits: 0})
                        };
                    }).filter(item => item !== null);
                    
                    // Only proceed if we have formatted amounts to display
                    if (formattedAmounts.length > 0) {
                        // Find the longest display source name for alignment (after P/L transformation)
                        const maxSourceLength = Math.max(...formattedAmounts.map(item => item.source.length));
                        const maxAmountWidth = Math.max(...formattedAmounts.map(item => item.formatted.length));
                        
                        for (const {source, formatted} of formattedAmounts) {
                            const sourcePadding = '&nbsp;'.repeat(Math.max(0, maxSourceLength - source.length + 1));
                            const amountPadding = '&nbsp;'.repeat(Math.max(0, maxAmountWidth - formatted.length));
                            tooltipText += `\n\n<code>${source}${sourcePadding}  ${amountPadding}${formatted}</code>`;
                        }
                    } 
                } else {
                    // Original logic for other columns
                    const breakdownEntries = Object.entries(breakdown);
                    
                    // Find the longest source name for alignment
                    const maxSourceLength = Math.max(...breakdownEntries.map(([source]) => source.length));
                    
                    // Pre-format all amounts and calculate max width
                    const formattedAmounts = breakdownEntries.map(([source, amount]) => ({
                        source,
                        amount,
                        formatted: amount.toLocaleString("en-IE", {style: 'currency', currency: 'EUR', maximumFractionDigits: 0})
                    }));
                    
                    // Calculate max width including potential tax amount
                    const potentialTax = (data.IT || 0) + (data.USC || 0) + (data.PRSI || 0) + (data.CGT || 0);
                    const formattedTax = potentialTax.toLocaleString("en-IE", {style: 'currency', currency: 'EUR', maximumFractionDigits: 0});
                    const maxAmountWidth = Math.max(
                        ...formattedAmounts.map(item => item.formatted.length),
                        formattedTax.length
                    );
                    
                    for (const {source, amount, formatted} of formattedAmounts) {
                        if (amount !== 0) {
                            const sourcePadding = '&nbsp;'.repeat(maxSourceLength - source.length + 1);
                            const amountPadding = '&nbsp;'.repeat(maxAmountWidth - formatted.length);
                            tooltipText += `\n\n<code>${source}${sourcePadding}  ${amountPadding}${formatted}</code>`;
                        }
                    }
                }
                
                // Only attach tooltip and show 'i' icon if there's meaningful content to display
                if (tooltipText.trim() !== '' && value >= 1) {
                    TooltipUtils.attachTooltip(td, tooltipText);
                    hasTooltip = true;
                }
            }
        }

        // Add the content container to the cell
        td.appendChild(contentContainer);
        
        // Add 'i' icon if the cell has a tooltip
        if (hasTooltip) {
            const infoIcon = document.createElement('span');
            infoIcon.className = 'cell-info-icon';
            infoIcon.textContent = 'i';
            contentContainer.appendChild(infoIcon);
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
 