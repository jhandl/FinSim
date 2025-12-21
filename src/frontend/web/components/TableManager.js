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
    this.countryInflationOverrides = {}; // MV event rate overrides: country -> inflation rate (decimal)
    this.conversionCache = {};
    this.storedCountryTimeline = null; // Persisted timeline from last simulation run
    this.presentValueMode = false; // Display monetary values in today's terms when enabled
  }

  setPresentValueMode(enabled) {
    const flag = !!enabled;
    if (this.presentValueMode === flag) return;
    this.presentValueMode = flag;
    this.conversionCache = {}; // safe to clear; FX cache keys remain valid but amounts will be recomputed on rerender
    this.refreshDisplayedCurrencies();
  }

  getPresentValueMode() {
    return !!this.presentValueMode;
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
      try { if (row.classList && row.classList.contains('resolution-panel-row')) continue; } catch (_) { }
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
      const existingKeys = new Set(Array.from(headerRow.querySelectorAll('th[data-key]')).map(h => h.dataset.key));
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
        } catch (_) { }

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
          } catch (_) { }
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
        // Exclude PV keys (Tax__*PV) - those are for value lookup, not column headers
        try {
          const currentTaxKeys = Object.keys(data).filter(k => k.indexOf('Tax__') === 0 && !k.endsWith('PV')).map(k => k.substring(5));
          const inOrder = {};
          for (let i = 0; i < order.length; i++) inOrder[String(order[i]).toLowerCase()] = true;
          for (let j = 0; j < currentTaxKeys.length; j++) {
            const low = String(currentTaxKeys[j]).toLowerCase();
            if (!inOrder[low]) order.push(currentTaxKeys[j]);
          }
        } catch (_) { }

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
          } catch (_) { }
          th.textContent = displayName;
          let tip = displayName + ' tax paid'; try { const cfg3 = Config.getInstance(); const rs3 = cfg3.getCachedTaxRuleSet ? cfg3.getCachedTaxRuleSet() : null; const t = rs3 && rs3.getTooltipForTax && rs3.getTooltipForTax(taxId); if (t) tip = t; } catch (_) { }
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
      try { if (this.webUI && typeof this.webUI.updateGroupBorders === 'function') { this.webUI.updateGroupBorders(); } } catch (_) { }
    }

    // Get the order of columns from the table header, only visible ones with data-key attributes
    const headers = Array.from(document.querySelectorAll('#Data thead th[data-key]')).filter(h => h.style.display !== 'none');

    // Create cells and format values in the order of the headers
    headers.forEach((header, headerIndex) => {
      const key = header.dataset.key;
      // Nominal and (optional) PV values from the core data sheet
      const nominalValue = (data[key] == null ? 0 : data[key]);
      const pvKey = key + 'PV';
      const pvValue = Object.prototype.hasOwnProperty.call(data, pvKey) ? data[pvKey] : null;
      let v = nominalValue;
      let originalValue, originalCurrency, fxMultiplier;
      let displayCurrencyCode, displayCountryForLocale;

      const isMonetary = !(key === 'Age' || key === 'Year' || key === 'WithdrawalRate');

      let deflationFactor = 1;
      if (isMonetary && this.presentValueMode) {
        // Prefer core-computed PV aggregates when available; otherwise stay in nominal terms.
        if (pvValue !== null && pvValue !== undefined && isFinite(pvValue)) {
          v = pvValue;
          if (isFinite(nominalValue) && nominalValue !== 0) {
            deflationFactor = pvValue / nominalValue;
          } else {
            deflationFactor = 1;
          }
        } else {
          deflationFactor = 1;
        }
      }

      // Currency conversion (unified mode): Uses evolution FX (inflation-driven cross-rates)
      // to convert deflated values to reporting currency. PPP mode is NOT used here (reserved
      // for event suggestions only).
      if (isMonetary && Config.getInstance().isRelocationEnabled() && this.currencyMode === 'unified' && this.reportingCurrency) {
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
              // Evolution FX conversion (default mode) - not PPP.
              fxMult = economicData.convert(1, fromCountry, toCountry, year, {
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

        if (this.currencyMode === 'unified' && Config.getInstance().isRelocationEnabled()) {
          // Always format using the selected reporting currency in unified mode
          displayCurrencyCode = this.reportingCurrency;
          displayCountryForLocale = RelocationUtils.getRepresentativeCountryForCurrency(this.reportingCurrency);
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
            } catch (_) { }
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
            } catch (_) { }
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
              // Always format using the selected reporting currency in unified mode
              displayCurrencyCode = this.reportingCurrency;
              displayCountryForLocale = RelocationUtils.getRepresentativeCountryForCurrency(this.reportingCurrency);
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

              // Apply deflation for present-value display using the same deflationFactor
              // as the main cell value so tooltip amounts sum to the displayed total
              if (this.presentValueMode && deflationFactor !== 1) {
                amount = amount * deflationFactor;
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

              for (const { source, formatted } of formattedAmounts) {
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
              // Apply deflation for present-value display using the same deflationFactor
              // as the main cell value so tooltip amounts remain consistent
              if (this.presentValueMode && deflationFactor !== 1) {
                adjustedAmount = adjustedAmount * deflationFactor;
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

            for (const { source, amount, formatted } of formattedAmounts) {
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

      // Store nominal (pre-deflation, pre-conversion) value on monetary cells for future refresh without re-simulating
      try {
        if (isMonetary) {
          td.setAttribute('data-nominal-value', String(nominalValue));
          if (pvValue !== null && pvValue !== undefined && isFinite(pvValue)) {
            td.setAttribute('data-pv-value', String(pvValue));
          }
        }
      } catch (_) { }

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
      } catch (_) { }

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

    // Build a list of visible header keys only (exclude hidden columns)
    // Note: Cells are created only for visible headers in setDataRow, so cells match visible header order
    const allHeaderThs = Array.from(headerRow.querySelectorAll('th[data-key]'));
    const headerThs = allHeaderThs.filter(th => {
      // Include only visible headers (exclude those with display: none)
      const style = window.getComputedStyle(th);
      return style.display !== 'none';
    });
    const headerKeys = headerThs.map(th => th.getAttribute('data-key'));
    const headerLabels = headerThs.map(th => (th.textContent || '').trim());

    // Get data rows from the table
    const dataRows = Array.from(table.querySelectorAll('tbody tr'));
    const totalRows = dataRows.length;
    if (totalRows === 0) {
      throw new Error('No data to export. Please run a simulation first.');
    }

    // Determine scaling (Monte Carlo average) if available
    let scale = 1;
    try {
      const runs = (this.webUI && this.webUI.lastSimulationResults && this.webUI.lastSimulationResults.runs) ? this.webUI.lastSimulationResults.runs : 1;
      if (typeof runs === 'number' && runs > 0) scale = runs;
    } catch (_) { }

    // Helper to get age from a row (used for PV and currency calculations)
    const getAgeFromRow = (row) => {
      const cells = Array.from(row.querySelectorAll('td'));
      // Cells are in the same order as visible headers, so we can use index directly
      const ageKeyIndex = headerKeys.indexOf('Age');
      if (ageKeyIndex >= 0 && ageKeyIndex < cells.length) {
        const ageCell = cells[ageKeyIndex];
        if (ageCell) {
          const contentContainer = ageCell.querySelector('.cell-content');
          const ageText = contentContainer ? contentContainer.textContent.trim() : ageCell.textContent.trim();
          const age = parseInt(ageText, 10);
          if (!isNaN(age)) return age;
        }
      }
      return null;
    };

    // Helper to get cell value from displayed table cell
    // This respects present-value mode and currency mode by reading what's actually displayed
    // Note: Cells are created only for visible headers, so cell index matches visible header index
    const getCellValue = (row, visibleKeyIndex) => {
      const cells = Array.from(row.querySelectorAll('td'));
      // Cells are in the same order as visible headers, so we can use index directly
      if (visibleKeyIndex >= cells.length) return '';

      const cell = cells[visibleKeyIndex];
      if (!cell) return '';

      const key = headerKeys[visibleKeyIndex];
      if (!key) return '';

      // Get the displayed text from the cell (already formatted with correct currency and PV mode)
      // The .cell-content div contains the formatted value
      const contentContainer = cell.querySelector('.cell-content');
      let displayedText = contentContainer ? contentContainer.textContent.trim() : cell.textContent.trim();

      // Remove the 'i' icon text if present (tooltip indicator)
      displayedText = displayedText.replace(/i\s*$/, '').trim();

      // If no displayed text, try to compute from stored nominal/PV values
      if (!displayedText || displayedText === '') {
        const nominalStr = cell.getAttribute('data-nominal-value');
        const pvStr = cell.getAttribute('data-pv-value');
        if (nominalStr) {
          let value = parseFloat(nominalStr);
          if (isNaN(value)) return '';

          // Get age for PV and currency calculations
          const age = getAgeFromRow(row);

          // Apply present-value mode by preferring core-computed PV values when available.
          if (this.presentValueMode && key !== 'Age' && key !== 'Year' && key !== 'WithdrawalRate' && age !== null) {
            if (pvStr != null && pvStr !== '' && isFinite(Number(pvStr))) {
              value = Number(pvStr);
            }
          }

          // Apply currency conversion if in unified mode
          if (Config.getInstance().isRelocationEnabled() && this.currencyMode === 'unified' && this.reportingCurrency && key !== 'Age' && key !== 'Year' && key !== 'WithdrawalRate' && age !== null) {
            try {
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
                      baseYear: Config.getInstance().getSimulationStartYear()
                    });
                    if (fxMult !== null) this.conversionCache[cacheKey] = fxMult;
                  }
                  if (fxMult !== null) {
                    value = value * fxMult;
                  }
                }
              }
            } catch (_) { /* keep as is */ }
          }

          // Format the value with the correct currency
          if (key === 'WithdrawalRate' || /rate$/i.test(key)) {
            return FormatUtils.formatPercentage(value);
          } else if (key === 'Age' || key === 'Year') {
            return String(Math.round(value));
          } else {
            // Determine display currency
            let displayCurrencyCode, displayCountryForLocale;
            try {
              const fromCountry = age != null ? RelocationUtils.getCountryForAge(age, this) : (Config.getInstance().getDefaultCountry && Config.getInstance().getDefaultCountry());

              if (this.currencyMode === 'unified' && Config.getInstance().isRelocationEnabled()) {
                displayCurrencyCode = this.reportingCurrency;
                displayCountryForLocale = RelocationUtils.getRepresentativeCountryForCurrency(this.reportingCurrency);
              } else {
                const fromCurrency = Config.getInstance().getCachedTaxRuleSet(fromCountry)?.getCurrencyCode();
                displayCurrencyCode = fromCurrency;
                displayCountryForLocale = fromCountry;
              }
            } catch (_) {
              // Fallback to default
              displayCurrencyCode = null;
              displayCountryForLocale = null;
            }
            return FormatUtils.formatCurrency(value, displayCurrencyCode, displayCountryForLocale);
          }
        }
        return '';
      }

      // Use the displayed text directly (it's already formatted correctly)
      return displayedText;
    };

    // Build CSV header
    let csvContent = headerLabels.join(',') + '\n';

    // Build CSV rows from displayed table cells
    for (let i = 0; i < totalRows; i++) {
      const row = dataRows[i];
      const rowValues = headerKeys.map((key, keyIndex) => {
        const text = getCellValue(row, keyIndex);
        // Ensure text is a string
        const textStr = String(text || '');
        // Quote if contains comma
        if (textStr.indexOf(',') !== -1) return '"' + textStr + '"';
        return textStr;
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
    // Ensure reportingCurrency is set when switching to unified mode
    if (newMode === 'unified' && !this.reportingCurrency) {
      this.reportingCurrency = RelocationUtils.getDefaultReportingCurrency(this.webUI);
    }
    this.updateCurrencyControlVisibility();
    this.refreshDisplayedCurrencies();
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

  // Reformat existing table cells to reflect current currency mode/reportingCurrency
  refreshDisplayedCurrencies() {
    const table = document.getElementById('Data');
    if (!table) return;
    const headerRow = table.querySelector('thead tr:nth-child(2)');
    if (!headerRow) return;
    const headerCells = Array.from(headerRow.querySelectorAll('th[data-key]')).filter(h => h.style.display !== 'none');
    const isMonetaryKey = (key) => !(key === 'Age' || key === 'Year' || key === 'WithdrawalRate');

    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length === 0) return;

    // Pre-scan: if any monetary cell is missing its nominal value, trigger a single full rerender
    // to ensure we never double-deflate by attempting to parse already-deflated display text.
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const cells = Array.from(row.querySelectorAll('td'));
      for (let c = 0; c < headerCells.length && c < cells.length; c++) {
        const key = headerCells[c].getAttribute('data-key');
        if (!isMonetaryKey(key)) continue;
        const nominalStr = cells[c].getAttribute('data-nominal-value');
        // Check for missing, null, or empty string values - these indicate the cell wasn't properly initialized
        if (nominalStr == null || nominalStr === '') {
          try { if (this.webUI && typeof this.webUI.rerenderData === 'function') { this.webUI.rerenderData(); } } catch (_) { }
          return;
        }
        const nominal = Number(nominalStr);
        if (isNaN(nominal)) {
          try { if (this.webUI && typeof this.webUI.rerenderData === 'function') { this.webUI.rerenderData(); } } catch (_) { }
          return;
        }
      }
    }

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const cells = Array.from(row.querySelectorAll('td'));
      // Derive age from the first column (assumed Age) if present
      let age = undefined;
      try {
        const ageIdx = headerCells.findIndex(h => h.getAttribute('data-key') === 'Age');
        if (ageIdx >= 0 && cells[ageIdx]) {
          const t = cells[ageIdx].querySelector('.cell-content')?.textContent || cells[ageIdx].textContent || '';
          const parsedAge = parseInt(t, 10);
          // Only use age if it's a valid number
          if (!isNaN(parsedAge) && isFinite(parsedAge)) {
            age = parsedAge;
          }
        }
      } catch (_) { }

      for (let c = 0; c < headerCells.length && c < cells.length; c++) {
        const key = headerCells[c].getAttribute('data-key');
        if (!isMonetaryKey(key)) continue;
        const contentEl = cells[c].querySelector('.cell-content') || cells[c];
        // Use the stored nominal value; pre-scan above guarantees presence here
        const nominalStr = cells[c].getAttribute('data-nominal-value');
        const pvStr = cells[c].getAttribute('data-pv-value');
        let nominal = Number(nominalStr);

        // Guard: if nominal is invalid, skip this cell (shouldn't happen after pre-scan, but be safe)
        if (isNaN(nominal) || !isFinite(nominal)) {
          continue;
        }

        /*
         * Reformatting without re-simulation:
         * - This method recomputes cell display when currency mode or present-value mode changes.
         * - Nominal source: Uses data-nominal-value set by setDataRow() to avoid double-deflation.
         * - PV source: Uses data-pv-value when present so PV mode is driven entirely by the core
         *   PV layer rather than recomputing deflation in the UI.
         * - Currency Conversion Mode: After selecting nominal vs PV, unified-mode conversion uses
         *   evolution FX cross-rates (default inflation-driven mode), NOT PPP. This matches setDataRow()
         *   and preserves exchange-rate realities for display. PPP remains reserved for event-management
         *   suggestions.
         */
        // Compute present-value in source currency when enabled:
        // prefer core-computed PV stored on the cell; otherwise stay nominal.
        let value = nominal;
        let fromCountry = age != null && isFinite(age) ? RelocationUtils.getCountryForAge(age, this) : (Config.getInstance().getDefaultCountry && Config.getInstance().getDefaultCountry());
        let displayCurrencyCode, displayCountryForLocale;
        if (this.presentValueMode) {
          if (pvStr != null && pvStr !== '' && isFinite(Number(pvStr))) {
            value = Number(pvStr);
          }
        }

        // Unified mode: convert deflated source value to reporting currency using evolution FX
        // (inflation-driven cross-rates, not PPP) to preserve exchange-rate realities for display.
        if (this.currencyMode === 'unified' && this.reportingCurrency) {
          displayCurrencyCode = this.reportingCurrency;
          displayCountryForLocale = RelocationUtils.getRepresentativeCountryForCurrency(this.reportingCurrency);
          try {
            // Only convert if we have a valid age for year calculation
            if (age != null && isFinite(age)) {
              const toCountry = displayCountryForLocale;
              const year = Config.getInstance().getSimulationStartYear() + age;
              const fromCurrency = Config.getInstance().getCachedTaxRuleSet(fromCountry)?.getCurrencyCode();
              if (fromCurrency && fromCurrency !== this.reportingCurrency) {
                const economicData = Config.getInstance().getEconomicData();
                if (economicData && economicData.ready) {
                  const cacheKey = `${year}-${fromCountry}-${toCountry}`;
                  let fxMult = this.conversionCache[cacheKey];
                  if (fxMult === undefined) {
                    // Evolution FX conversion (default mode) - not PPP.
                    fxMult = economicData.convert(1, fromCountry, toCountry, year, { baseYear: Config.getInstance().getSimulationStartYear() });
                    if (fxMult !== null && isFinite(fxMult)) this.conversionCache[cacheKey] = fxMult;
                  }
                  if (fxMult !== null && isFinite(fxMult)) {
                    value = value * fxMult;
                  }
                }
              }
            }
          } catch (_) { /* keep as is */ }
        } else {
          // natural mode formatting: use local currency (or fallback if unified mode but no reportingCurrency)
          const fromCurrency = Config.getInstance().getCachedTaxRuleSet(fromCountry)?.getCurrencyCode();
          displayCurrencyCode = fromCurrency;
          displayCountryForLocale = fromCountry;
        }

        // Final guard: ensure value is valid before formatting
        if (isNaN(value) || !isFinite(value)) {
          value = nominal; // Fall back to nominal value if calculation failed
        }

        contentEl.textContent = FormatUtils.formatCurrency(value, displayCurrencyCode, displayCountryForLocale);
      }
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
    try { this.webUI.lastIncomeVisibility = incomeVisibility; } catch (_) { }

  }

}

