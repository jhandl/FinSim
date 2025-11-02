/* Table management functionality */

class TableManager {

  constructor(webUI) {
    this.webUI = webUI;
    // One-time tax header initialization flag per simulation
    this._taxHeaderInitialized = false;
    // Flag to track if income visibility has been initialized
    this._incomeVisibilityInitialized = false;
    this.currencyMode = 'natural'; // 'natural' or 'unified'
    this.reportingCurrency = null;
    this.countryTimeline = [];
    this.conversionCache = {};
    this.storedCountryTimeline = null; // Persisted timeline from last simulation run
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
      // Skip non-data helper rows such as inline resolution panels
      try { if (row.classList && row.classList.contains('resolution-panel-row')) continue; } catch (_) {}
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
        const typeInput = (cells[0] && cells[0].querySelector) ? cells[0].querySelector('.event-type') : null;
        const originalType = row.dataset.originalEventType;
        const type = (includeHiddenEventTypes && originalType) ? originalType : (typeInput?.value || '');
        const name = (cells[1] && cells[1].querySelector) ? (cells[1].querySelector('input')?.value || '') : '';
        rowData.push(`${type}:${name}`);
        
        // Get remaining values starting from the Amount column (index 2)
        for (let i = 2; i < columnCount + 1; i++) {
          const q = (cells[i] && cells[i].querySelector) ? cells[i].querySelector('input') : null;
          rowData.push(getInputValue(q));
        }
      } else {
        // Normal table handling
        for (let i = 0; i < columnCount; i++) {
          const input = (cells[i] && cells[i].querySelector) ? cells[i].querySelector('input') : null;
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

    // Reset header init at the start of each simulation (first row)
    if (rowIndex === 0 || rowIndex === 1) {
      this._taxHeaderInitialized = false;
      this.conversionCache = {}; // Clear cache for new simulation
      // Always clear stored timeline at start to force recomputation for current dataSheet
      this.storedCountryTimeline = null;
      RelocationUtils.extractRelocationTransitions(this.webUI, this);
      // Store the computed timeline for reuse during display of this dataSheet
      this.storedCountryTimeline = this.countryTimeline.slice();
    }

    // On initial page load, show only pinned income columns
    if (!this._incomeVisibilityInitialized) {
      const taxRuleSet = Config.getInstance().getCachedTaxRuleSet();
      const pinnedTypes = taxRuleSet.getPinnedIncomeTypes() || [];
      
      // Create visibility map with only pinned types visible
      const initialVisibility = {};
      pinnedTypes.forEach(type => {
        initialVisibility[String(type).toLowerCase()] = true;
      });
      
      const webUI = WebUI.getInstance();
      const types = Config.getInstance().getCachedTaxRuleSet().getInvestmentTypes();
      webUI.applyDynamicColumns(types, initialVisibility);
      this._incomeVisibilityInitialized = true;
    }

    // Before building row, ensure headers exist for any new dynamic keys
    const headerRow = document.querySelector('#Data thead tr:nth-child(2)');
    if (headerRow) {
      const existingKeys = new Set(Array.from(headerRow.querySelectorAll('th[data-key]')).map(h=>h.dataset.key));
      // Find the Deductions group header cell via data attribute for robustness
      let deductionsGroupTh = null;
      try {
        deductionsGroupTh = document.querySelector('#Data thead tr.header-groups th[data-group="deductions"]');
      } catch (_) { deductionsGroupTh = null; }

      // Note: Pre-existing legacy tax headers (IT/PRSI/USC/CGT) should not exist in the DOM.
      // Dynamic tax headers are created below solely from simulation data + ruleset.

      // Add any new dynamic tax columns that don't already exist, ordered by stableTaxIds
      if (!this._taxHeaderInitialized) {
        // Build stable order list from global simulator or from ruleset/union as fallback
        let order = [];
        // 1) Prefer stableTaxIds exposed globally
        try {
          if (typeof window !== 'undefined' && Array.isArray(window.stableTaxIds) && window.stableTaxIds.length > 0) {
            order = window.stableTaxIds.slice();
          } else if (typeof stableTaxIds !== 'undefined' && Array.isArray(stableTaxIds) && stableTaxIds.length > 0) {
            order = stableTaxIds.slice();
          }
        } catch (_) {}

        // 2) If not available, attempt union of all Tax__* keys from existing dataSheet rows (if present)
        if (!order || order.length === 0) {
          try {
            if (typeof dataSheet !== 'undefined' && Array.isArray(dataSheet)) {
              const union = {};
              for (let ri = 0; ri < dataSheet.length; ri++) {
                const rowObj = dataSheet[ri];
                if (!rowObj) continue;
                const keys = Object.keys(rowObj);
                for (let ki = 0; ki < keys.length; ki++) {
                  const k = keys[ki];
                  if (k && k.indexOf('Tax__') === 0) {
                    const id = k.substring(5);
                    if (id) union[id] = true;
                  }
                }
              }
              order = Object.keys(union);
            }
          } catch (_) {}
        }

        // 3) If still empty, derive in exact file order from ruleset
        if (!order || order.length === 0) {
          try {
            const cfg = Config.getInstance();
            const rs = (cfg.getCachedTaxRuleSet ? (cfg.getCachedTaxRuleSet(cfg.getDefaultCountry && cfg.getDefaultCountry())) : null) || (cfg.getCachedTaxRuleSet ? cfg.getCachedTaxRuleSet() : null);
            if (rs && typeof rs.getTaxOrder === 'function') {
              order = rs.getTaxOrder();
            } else {
              order = ['incomeTax', 'capitalGains'];
            }
          } catch (_) {
            order = ['incomeTax', 'capitalGains'];
          }
        }

        // Also include any Tax__ keys present in this first row's data that aren't in order
        try {
          const currentTaxKeys = Object.keys(data).filter(k => k.indexOf('Tax__') === 0).map(k => k.substring(5));
          const inOrder = {};
          for (let i = 0; i < order.length; i++) inOrder[String(order[i]).toLowerCase()] = true;
          for (let j = 0; j < currentTaxKeys.length; j++) {
            const low = String(currentTaxKeys[j]).toLowerCase();
            if (!inOrder[low]) order.push(currentTaxKeys[j]);
          }
        } catch (_) {}

        // Determine insertion anchor: last existing tax th; fallback to PensionContribution before it
        const taxThs = Array.from(headerRow.querySelectorAll('th[data-key^="Tax__"]'));
        const pensionTh = headerRow.querySelector('th[data-key="PensionContribution"]');
        let anchor = taxThs.length > 0 ? taxThs[taxThs.length - 1] : (pensionTh || null);

        // Create th for each tax id in order if not present
        for (let oi = 0; oi < order.length; oi++) {
          const taxId = order[oi];
          const key = 'Tax__' + taxId;
          if (existingKeys.has(key)) continue;

          const th = document.createElement('th');
          th.setAttribute('data-key', key);
          // Get display name from tax ruleset if available
          let displayName = String(taxId).toUpperCase();
          try {
            const cfg2 = Config.getInstance();
            const rs2 = cfg2.getCachedTaxRuleSet ? cfg2.getCachedTaxRuleSet() : null;
            if (rs2 && typeof rs2.getDisplayNameForTax === 'function') {
              displayName = rs2.getDisplayNameForTax(taxId);
            }
          } catch (_) {}
          th.textContent = displayName;
          let tip = displayName + ' tax paid'; try { const cfg3 = Config.getInstance(); const rs3 = cfg3.getCachedTaxRuleSet ? cfg3.getCachedTaxRuleSet() : null; const t = rs3 && rs3.getTooltipForTax && rs3.getTooltipForTax(taxId); if (t) tip = t; } catch (_){ }
          TooltipUtils.attachTooltip(th, tip, { hoverDelay: 150, touchDelay: 250 });

          if (anchor) {
            if (anchor.nextSibling) {
              headerRow.insertBefore(th, anchor.nextSibling);
            } else {
              headerRow.appendChild(th);
            }
          } else if (pensionTh) {
            headerRow.insertBefore(th, pensionTh);
          } else {
            headerRow.appendChild(th);
          }
          anchor = th;
          existingKeys.add(key);
        }

        // Mark headers initialized for this run
        this._taxHeaderInitialized = true;
      }

      // Fix colspan calculation: count actual tax columns instead of adding to base
      if (deductionsGroupTh) {
        const taxColumnCount = headerRow.querySelectorAll('th[data-key^="Tax__"]').length;
        deductionsGroupTh.colSpan = taxColumnCount + 1; // +1 for PensionContribution
      }
      // Refresh dynamic group border markers after potential header changes
      try { if (this.webUI && typeof this.webUI.updateGroupBorders === 'function') { this.webUI.updateGroupBorders(); } } catch (_) {}
    }

    // Get the order of columns from the table header, only visible ones with data-key attributes
    const headers = Array.from(document.querySelectorAll('#Data thead th[data-key]')).filter(h => h.style.display !== 'none');

    // Create cells and format values in the order of the headers
    headers.forEach((header, headerIndex) => {
      const key = header.dataset.key;
      let v = (data[key] == null ? 0 : data[key]);
      let originalValue, originalCurrency, fxMultiplier;
      let displayCurrencyCode, displayCountryForLocale;

      const isMonetary = !(key === 'Age' || key === 'Year' || key === 'WithdrawalRate');

      if (isMonetary && this.currencyMode === 'unified' && this.reportingCurrency) {
        const age = data.Age;
        const year = Config.getInstance().getSimulationStartYear() + age;
        const fromCountry = RelocationUtils.getCountryForAge(age, this);
        const toCountry = RelocationUtils.getRepresentativeCountryForCurrency(this.reportingCurrency);

        const fromCurrency = Config.getInstance().getCachedTaxRuleSet(fromCountry)?.getCurrencyCode();
        
        if (fromCurrency !== this.reportingCurrency) {
            const economicData = Config.getInstance().getEconomicData();
            if (economicData && economicData.ready) {
                const cacheKey = `${year}-${fromCountry}-${toCountry}`;
                let fxMult = this.conversionCache[cacheKey];
                if (fxMult === undefined) {
                    fxMult = economicData.convert(1, fromCountry, toCountry, year, {
                        fxMode: 'ppp',
                        baseYear: Config.getInstance().getSimulationStartYear()
                    });
                    if (fxMult !== null) {
                        this.conversionCache[cacheKey] = fxMult;
                    }
                }

                if (fxMult !== null) {
                    originalValue = v;
                    originalCurrency = fromCurrency;
                    fxMultiplier = fxMult;
                    v = v * fxMult;
                }
            }
        }
      }

      const td = document.createElement('td');
      
      // Create a container for the cell content
      const contentContainer = document.createElement('div');
      contentContainer.className = 'cell-content';
      
      // Add the formatted value
      if (key === 'Age' || key === 'Year') {
        contentContainer.textContent = v.toString();
      } else if (key === 'WithdrawalRate') {
        contentContainer.textContent = FormatUtils.formatPercentage(v);
      } else {
        const age = data.Age;
        const fromCountry = RelocationUtils.getCountryForAge(age, this);
        const fromCurrency = Config.getInstance().getCachedTaxRuleSet(fromCountry)?.getCurrencyCode();

        if (this.currencyMode === 'unified') {
            // Only use reporting currency if currencies match or conversion succeeded
            const currenciesMatch = fromCurrency === this.reportingCurrency;
            const conversionSucceeded = fxMultiplier !== undefined;
            
            if (currenciesMatch || conversionSucceeded) {
                displayCurrencyCode = this.reportingCurrency;
                displayCountryForLocale = RelocationUtils.getRepresentativeCountryForCurrency(this.reportingCurrency);
            } else {
                // Fall back to natural formatting when conversion isn't available
                displayCurrencyCode = fromCurrency;
                displayCountryForLocale = fromCountry;
            }
        } else { // natural mode
            displayCurrencyCode = fromCurrency;
            displayCountryForLocale = fromCountry;
        }
        contentContainer.textContent = FormatUtils.formatCurrency(v, displayCurrencyCode, displayCountryForLocale);
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
                // Special handling for dynamic tax columns: map 'Tax__<id>' to attribution key 'tax:<id>'
                if (!breakdown && key.indexOf('Tax__') === 0) {
                    try {
                        const taxId = key.substring(5);
                        breakdown = data.Attributions['tax:' + taxId] || data.Attributions['tax:' + taxId.toLowerCase()] || breakdown;
                    } catch (_) {}
                }
                if (!breakdown && key.startsWith('income') && data.Attributions.income) {
                    breakdown = data.Attributions.income;
                }

                // Consolidated display for capital gains tax: show pre-relief by category and relief at end
                if (key === 'Tax__capitalGains' && data.Attributions) {
                    try {
                        const cap = data.Attributions['tax:capitalGains'] || {};
                        let fundsPost = 0;
                        let sharesPost = 0;
                        let relief = 0; // positive value for magnitude
                        for (const src in cap) {
                            const amt = cap[src] || 0;
                            if (src === 'CGT Relief' && amt < 0) { relief += (-amt); continue; }
                            const s = String(src).toLowerCase();
                            // Heuristics: index funds and deemed disposal entries belong to funds/exit tax
                            if (s.includes('index') || s.includes('fund')) {
                                fundsPost += amt;
                            } else if (s.includes('deemed')) {
                                fundsPost += amt;
                            } else if (s.includes('share')) {
                                sharesPost += amt;
                            } else {
                                // Unknown label: assign to shares by default (CGT category)
                                sharesPost += amt;
                            }
                        }
                        const fundsPre = fundsPost; // exit tax not subject to CGT relief
                        const sharesPre = sharesPost + relief; // reconstruct pre-relief tax for shares
                        const synthetic = {};
                        synthetic['Index Funds gains'] = fundsPre;
                        synthetic['Shares gains'] = sharesPre;
                        synthetic['CGT Relief'] = -relief;
                        breakdown = synthetic;
                    } catch (_) {}
                }
            }
            
            if (breakdown) {
                let tooltipText = '';
                
                // Determine display currency and locale exactly as used for the cell
                if (!displayCurrencyCode || !displayCountryForLocale) {
                    const age = data.Age;
                    const fromCountry = RelocationUtils.getCountryForAge(age, this);
                    const fromCurrency = Config.getInstance().getCachedTaxRuleSet(fromCountry)?.getCurrencyCode();
                    
                    if (this.currencyMode === 'unified') {
                        // Only use reporting currency if currencies match or conversion succeeded
                        const currenciesMatch = fromCurrency === this.reportingCurrency;
                        const conversionSucceeded = fxMultiplier !== undefined;
                        
                        if (currenciesMatch || conversionSucceeded) {
                            displayCurrencyCode = this.reportingCurrency;
                            displayCountryForLocale = RelocationUtils.getRepresentativeCountryForCurrency(this.reportingCurrency);
                        } else {
                            // Fall back to natural formatting when conversion isn't available
                            displayCurrencyCode = fromCurrency;
                            displayCountryForLocale = fromCountry;
                        }
                    } else {
                        displayCurrencyCode = fromCurrency;
                        displayCountryForLocale = fromCountry;
                    }
                }
                
                // Special handling for asset columns (FundsCapital and SharesCapital)
                if (key === 'FundsCapital' || key === 'SharesCapital') {
                    const orderedKeys = ['Bought', 'Sold', 'Principal', 'P/L'];
                    
                    // Pre-format all amounts and calculate max width
                    const formattedAmounts = orderedKeys.map(source => {
                        let amount = breakdown[source] || 0;
                        if (amount === 0) return null;
                        
                        // Apply FX conversion if in unified mode and conversion occurred
                        if (this.currencyMode === 'unified' && originalValue !== undefined && fxMultiplier !== undefined) {
                            amount = amount * fxMultiplier;
                        }
                        
                        // Special handling for P/L
                        let displaySource = source;
                        if (source === 'P/L') {
                            displaySource = amount > 0 ? 'Accum. Gains' : 'Accum. Losses';
                        }
                        
                        return {
                            source: displaySource,
                            formatted: FormatUtils.formatCurrency(Math.abs(amount), displayCurrencyCode, displayCountryForLocale)
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
                    const formattedAmounts = breakdownEntries.map(([source, amount]) => {
                        let adjustedAmount = amount;
                        // Apply FX conversion if in unified mode and conversion occurred
                        if (this.currencyMode === 'unified' && originalValue !== undefined && fxMultiplier !== undefined) {
                            adjustedAmount = amount * fxMultiplier;
                        }
                        return {
                            source,
                            amount: adjustedAmount,
                            formatted: FormatUtils.formatCurrency(adjustedAmount, displayCurrencyCode, displayCountryForLocale)
                        };
                    });
                    
                    // Calculate max width including potential tax amount
                    let potentialTax = 0;
                    for (const dataKey in data) {
                        if (dataKey.startsWith('Tax__')) {
                            potentialTax += (data[dataKey] || 0);
                        }
                    }
                    const formattedTax = FormatUtils.formatCurrency(potentialTax, displayCurrencyCode, displayCountryForLocale);
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
                
                if (originalValue !== undefined) {
                    const age = data.Age;
                    const originalCountry = RelocationUtils.getCountryForAge(age, this);
                    tooltipText += `\n\nOriginal: ${FormatUtils.formatCurrency(originalValue, originalCurrency, originalCountry)}`;
                }

                // Only attach tooltip and show 'i' icon if there's meaningful content to display
                // Guard with non-zero check to allow tooltips for negative and small positive values
                if ((breakdown || originalValue !== undefined) && tooltipText.trim() !== '' && Math.abs(v) > 0) {
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

      // Apply dynamic group border alignment based on header markers
      try {
        if (header.hasAttribute('data-group-end')) {
          td.setAttribute('data-group-end', '1');
          td.style.borderRight = '3px solid #666';
        }
        // Ensure last data cell closes the table with a right border
        if (headerIndex === headers.length - 1) {
          td.setAttribute('data-group-end', '1');
          td.style.borderRight = '3px solid #666';
        }
      } catch (_) {}

      row.appendChild(td);
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

    // Build a complete list of header keys (include hidden ones as well)
    const headerThs = Array.from(headerRow.querySelectorAll('th[data-key]'));
    const headerKeys = headerThs.map(th => th.getAttribute('data-key'));
    const headerLabels = headerThs.map(th => (th.textContent || '').trim());

    // Determine number of data rows from dataSheet (authoritative), fallback to DOM if unavailable
    const ds = (typeof dataSheet !== 'undefined' && Array.isArray(dataSheet)) ? dataSheet : null;
    const totalRows = ds ? Math.max(0, ds.length - 1) : Array.from(table.querySelectorAll('tbody tr')).length;
    if (totalRows === 0) {
      throw new Error('No data to export. Please run a simulation first.');
    }

    // Determine scaling (Monte Carlo average) if available
    let scale = 1;
    try {
      const runs = (this.webUI && this.webUI.lastSimulationResults && this.webUI.lastSimulationResults.runs) ? this.webUI.lastSimulationResults.runs : 1;
      if (typeof runs === 'number' && runs > 0) scale = runs;
    } catch (_) {}

    // Helper to fetch a numeric value from a dataSheet row by header key
    const getValueForKey = (rowObj, key) => {
      if (!rowObj) return 0;
      try {
        if (key === 'Age') return rowObj.age / scale;
        if (key === 'Year') return rowObj.year / scale;
        if (key === 'WithdrawalRate') return rowObj.withdrawalRate / scale;

        // Dynamic income per investment type
        if (key.indexOf('Income__') === 0) {
          const k = key.substring('Income__'.length);
          const map = rowObj.investmentIncomeByKey || {};
          return (map[k] || 0) / scale;
        }

        // Dynamic capital per investment type
        if (key.indexOf('Capital__') === 0) {
          const k = key.substring('Capital__'.length);
          const map = rowObj.investmentCapitalByKey || {};
          return (map[k] || 0) / scale;
        }

        // Dynamic tax totals
        if (key.indexOf('Tax__') === 0) {
          // Prefer flattened key if present, else use taxByKey map
          if (typeof rowObj[key] === 'number') return rowObj[key] / scale;
          const taxId = key.substring('Tax__'.length);
          const tmap = rowObj.taxByKey || {};
          return (tmap[taxId] || 0) / scale;
        }

        // Standard fields: derive row key by lowercasing first letter
        // Special-case legacy FundsCapital → indexFundsCapital
        let dsKey = key.charAt(0).toLowerCase() + key.slice(1);
        if (key === 'FundsCapital') dsKey = 'indexFundsCapital';
        if (typeof rowObj[dsKey] === 'number') return rowObj[dsKey] / scale;
      } catch (_) { /* fall through to zero */ }
      return 0;
    };

    // Build CSV header
    let csvContent = headerLabels.join(',') + '\n';

    // Build CSV rows directly from dataSheet to include hidden columns as zeros
    for (let i = 1; i <= totalRows; i++) {
      const rowObj = ds ? ds[i] : null;
      const rowValues = headerKeys.map(key => {
        let raw = getValueForKey(rowObj, key);
        // Format based on key semantics
        let text = '';
        if (key === 'Age' || key === 'Year') {
          text = (typeof raw === 'number') ? String(Math.round(raw)) : '';
        } else if (key === 'WithdrawalRate' || /rate$/i.test(key)) {
          try { text = FormatUtils.formatPercentage(raw); } catch (_) { text = String(raw); }
        } else {
          try { text = FormatUtils.formatCurrency(raw); } catch (_) { text = String(raw); }
        }
        // Quote if contains comma
        if (text.indexOf(',') !== -1) text = '"' + text + '"';
        return text;
      });
      csvContent += rowValues.join(',') + '\n';
    }

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
  
  setupTableCurrencyControls() {
    const cfg = Config.getInstance();
    if (!cfg.isRelocationEnabled()) return;

    const container = document.getElementById('data-table-controls');
    if (!container) return;

    RelocationUtils.createCurrencyControls(container, this, this.webUI);
  }

  handleCurrencyModeChange(newMode) {
    if (this.currencyMode === newMode) return;
    this.currencyMode = newMode;
    this.conversionCache = {}; // Clear cache on mode change
    this.storedCountryTimeline = null; // Invalidate stored timeline on mode change
    this.updateCurrencyControlVisibility();
    this.webUI.rerenderData();
  }

  updateCurrencyControlVisibility() {
    const naturalToggle = document.getElementById(`currencyModeNatural_${this.constructor.name}`);
    const unifiedToggle = document.getElementById(`currencyModeUnified_${this.constructor.name}`);
    const dropdownContainer = document.querySelector(`#data-table-controls .currency-dropdown-container`);

    if (this.currencyMode === 'natural') {
        if (naturalToggle) naturalToggle.classList.add('mode-toggle-active');
        if (unifiedToggle) unifiedToggle.classList.remove('mode-toggle-active');
        if (dropdownContainer) dropdownContainer.style.display = 'none';
    } else {
        if (unifiedToggle) unifiedToggle.classList.add('mode-toggle-active');
        if (naturalToggle) naturalToggle.classList.remove('mode-toggle-active');
        if (dropdownContainer) dropdownContainer.style.display = 'block';
    }
  }
  applyIncomeVisibilityAfterSimulation() {
    const incomeVisibility = this.webUI.getIncomeColumnVisibility();
    const config = Config.getInstance();
    const taxRuleSet = config.getCachedTaxRuleSet();
    const investmentTypes = taxRuleSet.getInvestmentTypes();
    
    // Apply visibility to table
    this.webUI.applyDynamicColumns(investmentTypes, incomeVisibility);
    
    // Apply visibility to chart to match table
    this.webUI.chartManager.applyIncomeVisibility(incomeVisibility);

    // Persist last computed visibility for end-of-run application in a single step
    try { this.webUI.lastIncomeVisibility = incomeVisibility; } catch (_) {}

  }

}
 
