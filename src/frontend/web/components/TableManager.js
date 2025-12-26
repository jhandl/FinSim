/* Table management functionality */

class TableManager {

  constructor(webUI) {
    this.webUI = webUI;
    // Flag to track if income visibility has been initialized
    this._incomeVisibilityInitialized = false;
    this.currencyMode = 'natural'; // 'natural' or 'unified'
    this.reportingCurrency = null;
    this.countryTimeline = [];
    this.countryInflationOverrides = {}; // MV event rate overrides: country -> inflation rate (decimal)
    this.conversionCache = {};
    this.storedCountryTimeline = null; // Persisted timeline from last simulation run
    this.presentValueMode = false; // Display monetary values in today's terms when enabled
    // Dynamic section manager for elastic column layouts during relocations
    this.dynamicSectionManager = null;
    // Dynamic tax header management
    this._taxHeaderObserver = null;
    this._activeTaxHeader = null;
    this._taxHeaders = [];
    this._lastCountry = null;
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
      this.conversionCache = {}; // Clear cache for new simulation
      // Always clear stored timeline at start to force recomputation for current dataSheet
      this.storedCountryTimeline = null;
      RelocationUtils.extractRelocationTransitions(this.webUI, this);
      // Store the computed timeline for reuse during display of this dataSheet
      this.storedCountryTimeline = this.countryTimeline.slice();

      // Initialize dynamic section manager for elastic Deductions section
      if (Config.getInstance().isRelocationEnabled()) {
        this.dynamicSectionManager = new DynamicSectionManager(DEDUCTIONS_SECTION_CONFIG);
        this.dynamicSectionManager.calculateMaxWidth(this);
      } else {
        this.dynamicSectionManager = null;
      }

      // Cleanup previous tax headers for new simulation
      this._cleanupTaxHeaders();
      this._lastCountry = null;
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

    // Detect relocation boundaries for dynamic tax headers
    let needsNewTaxHeader = false;
    let currentCountry = null;

    if (Config.getInstance().isRelocationEnabled() && this.countryTimeline && this.countryTimeline.length > 0) {
      currentCountry = RelocationUtils.getCountryForAge(data.Age, this);

      // Check if this is the first data row or if country changed from previous row
      if (rowIndex === 1) {
        needsNewTaxHeader = true;
        this._lastCountry = currentCountry;
      } else if (this._lastCountry !== currentCountry) {
        needsNewTaxHeader = true;
        this._lastCountry = currentCountry;
      }
    } else if (!Config.getInstance().isRelocationEnabled()) {
      // Fallback: create a single tax header row at the start for non-relocation scenarios
      if (rowIndex === 1 && this.dynamicSectionManager && this.dynamicSectionManager.isInitialized()) {
        const defaultCountry = Config.getInstance().getDefaultCountry() || 'ie';
        currentCountry = defaultCountry;
        needsNewTaxHeader = true;
        this._lastCountry = currentCountry;
      } else if (rowIndex === 1) {
        // Even without dynamicSectionManager, insert a header for the default country
        const defaultCountry = Config.getInstance().getDefaultCountry() || 'ie';
        currentCountry = defaultCountry;
        needsNewTaxHeader = true;
        this._lastCountry = currentCountry;
      }
    }

    // Insert country-specific tax header row when needed
    if (needsNewTaxHeader && currentCountry) {
      const taxHeaderRow = this._createTaxHeaderRow(currentCountry, data.Age);

      // Insert before the current data row
      const existingRow = document.getElementById(`data_row_${rowIndex}`);
      if (existingRow) {
        tbody.insertBefore(taxHeaderRow, existingRow);
      } else {
        tbody.appendChild(taxHeaderRow);
      }

      // Register with IntersectionObserver for sticky behavior
      this._registerTaxHeader(taxHeaderRow);
    }

    // Before building row, update Deductions group header colspan
    const headerRow = document.querySelector('#Data thead tr:nth-child(2)');
    if (headerRow) {
      // Find the Deductions group header cell via data attribute for robustness
      let deductionsGroupTh = null;
      try {
        deductionsGroupTh = document.querySelector('#Data thead tr.header-groups th[data-group="deductions"]');
      } catch (_) { deductionsGroupTh = null; }

      // Update Deductions colspan using dynamicSectionManager max column count
      if (deductionsGroupTh && this.dynamicSectionManager && this.dynamicSectionManager.isInitialized()) {
        const maxTaxColumns = this.dynamicSectionManager.getMaxColumnCount();
        deductionsGroupTh.colSpan = Math.max(1, maxTaxColumns);
      } else if (deductionsGroupTh) {
        // Fallback: count actual rendered tax columns + PensionContribution
        const taxColumnCount = headerRow.querySelectorAll('th[data-key^="Tax__"]').length;
        const pensionContribTh = headerRow.querySelector('th[data-key="PensionContribution"]');
        const deductionsColspan = taxColumnCount + (pensionContribTh ? 1 : 0);
        deductionsGroupTh.colSpan = Math.max(1, deductionsColspan);
      }

      // Refresh dynamic group border markers after potential header changes
      try { if (this.webUI && typeof this.webUI.updateGroupBorders === 'function') { this.webUI.updateGroupBorders(); } } catch (_) { }
    }

    // Get the order of columns from the table header, only visible ones with data-key attributes
    // Note: <thead> doesn't have Tax__ columns - we inject them dynamically per-country
    const baseHeaders = Array.from(document.querySelectorAll('#Data thead th[data-key]')).filter(h => h.style.display !== 'none');

    // Build a virtual headers list that includes country-specific tax columns
    // Find PensionContribution - tax columns go AFTER it (PensionContribution comes first in deductions)
    const pensionContribIndex = baseHeaders.findIndex(h => h.getAttribute('data-key') === 'PensionContribution');

    // Get tax columns for the current country (excludes PensionContribution)
    let taxColumns = [];
    const rowCountry = currentCountry || RelocationUtils.getCountryForAge(data.Age, this) || Config.getInstance().getDefaultCountry() || 'ie';
    if (this.dynamicSectionManager && this.dynamicSectionManager.isInitialized()) {
      const countryColumns = this.dynamicSectionManager.getColumnsForCountry(rowCountry) || [];
      // Filter out PensionContribution since it's already in baseHeaders
      taxColumns = countryColumns.filter(c => c.key !== 'PensionContribution');
    } else {
      // Fallback: get from DEDUCTIONS_SECTION_CONFIG
      try {
        const allCols = DEDUCTIONS_SECTION_CONFIG.getColumns(rowCountry);
        taxColumns = allCols.filter(c => c.key !== 'PensionContribution');
      } catch (_) {
        taxColumns = [];
      }
    }

    // Build virtual headers: baseHeaders with tax columns inserted AFTER PensionContribution
    // Each tax column needs a virtual header object with dataset.key
    const virtualTaxHeaders = taxColumns.map(col => ({
      dataset: { key: col.key },
      getAttribute: (attr) => attr === 'data-key' ? col.key : null,
      textContent: col.label,
      style: { display: '' }
    }));

    let headers;
    if (pensionContribIndex >= 0) {
      // Insert tax columns AFTER PensionContribution (it comes first in deductions)
      headers = [
        ...baseHeaders.slice(0, pensionContribIndex + 1),  // up to and including PensionContribution
        ...virtualTaxHeaders,
        ...baseHeaders.slice(pensionContribIndex + 1)      // rest of columns
      ];
    } else {
      // PensionContribution not found - append tax columns at end
      headers = [...baseHeaders, ...virtualTaxHeaders];
    }


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

      // Apply dynamic group border alignment based on data-key predicates
      // (mirrors updateGroupBorders logic so borders work even without original thead attributes)
      try {
        // Determine if this cell is at a group boundary
        const isIncome = (k) => k && k.indexOf('Income') === 0;
        const isTax = (k) => k && k.indexOf('Tax__') === 0;
        const isAsset = (k) => k && (k === 'PensionFund' || k === 'Cash' || k === 'RealEstateCapital' ||
          k.indexOf('Capital__') === 0 || k === 'FundsCapital' || k === 'SharesCapital');

        // Find indices of group boundaries within the headers array
        const allKeys = headers.map(h => h.dataset?.key || h.getAttribute?.('data-key'));
        const yearBoundaryIdx = allKeys.indexOf('Year');
        const incomeLastIdx = (() => { for (let i = allKeys.length - 1; i >= 0; i--) if (isIncome(allKeys[i])) return i; return -1; })();
        let deductionsLastIdx = (() => { for (let i = allKeys.length - 1; i >= 0; i--) if (isTax(allKeys[i])) return i; return -1; })();
        if (deductionsLastIdx === -1) deductionsLastIdx = allKeys.indexOf('PensionContribution');
        const expensesBoundaryIdx = allKeys.indexOf('Expenses');
        const assetsLastIdx = (() => { for (let i = allKeys.length - 1; i >= 0; i--) if (isAsset(allKeys[i])) return i; return -1; })();
        const lastIdx = allKeys.length - 1;

        const boundarySet = new Set([yearBoundaryIdx, incomeLastIdx, deductionsLastIdx, expensesBoundaryIdx, assetsLastIdx, lastIdx].filter(i => i >= 0));

        if (boundarySet.has(headerIndex)) {
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
    const tbody = document.querySelector('#Data tbody');
    const allRows = document.querySelectorAll('#Data tbody tr');
    // Filter to only data rows (exclude tax header rows)
    const dataRows = Array.from(allRows).filter(row => !row.classList.contains('tax-header'));
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
      // Remove all data rows starting after the first maxAge row
      for (let i = dataRows.length - 1; i >= maxAgeRowIndex; i--) {
        dataRows[i].remove();
      }
    }

    // Remove tax header rows beyond maxAge
    const taxHeaders = tbody.querySelectorAll('tr.tax-header');
    taxHeaders.forEach(header => {
      const age = parseInt(header.getAttribute('data-age'), 10);
      if (!isNaN(age) && age > maxAge) {
        if (this._taxHeaderObserver) {
          this._taxHeaderObserver.unobserve(header);
        }
        header.remove();
        // Also remove from tracking array
        const idx = this._taxHeaders.indexOf(header);
        if (idx > -1) {
          this._taxHeaders.splice(idx, 1);
        }
      }
    });
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

  /**
   * Creates a country-specific tax header row for insertion into tbody
   * @param {string} country - Country code (lowercase)
   * @param {number} age - The age at which this header starts
   * @returns {HTMLTableRowElement} The created header row
   */
  _createTaxHeaderRow(country, age) {
    const headerRow = document.createElement('tr');
    headerRow.className = 'tax-header';
    headerRow.setAttribute('data-country', country);
    headerRow.setAttribute('data-age', age);

    // Get column definitions from DynamicSectionManager (PensionContribution first, then taxes)
    let deductionColumns = [];

    if (this.dynamicSectionManager && this.dynamicSectionManager.isInitialized()) {
      deductionColumns = this.dynamicSectionManager.getColumnsForCountry(country) || [];
    } else {
      // Fallback: get columns directly from config
      try {
        deductionColumns = DEDUCTIONS_SECTION_CONFIG.getColumns(country);
      } catch (_) {
        deductionColumns = [{ key: 'PensionContribution', label: 'P.Contrib', tooltip: 'Amount contributed to private pensions' }];
      }
    }

    // Get the main header row to understand column structure
    const mainHeaderRow = document.querySelector('#Data thead tr:last-child');
    if (!mainHeaderRow) {
      console.warn('_createTaxHeaderRow: Main header row not found');
      return headerRow;
    }

    // Get base headers from <thead>
    const baseHeaders = Array.from(mainHeaderRow.querySelectorAll('th[data-key]')).filter(h => h.style.display !== 'none');

    // Find PensionContribution position - deduction columns go AFTER it
    const pensionContribIndex = baseHeaders.findIndex(h => h.getAttribute('data-key') === 'PensionContribution');

    // Separate PensionContribution from tax columns
    const pensionColumn = deductionColumns.find(c => c.key === 'PensionContribution');
    const taxColumns = deductionColumns.filter(c => c.key !== 'PensionContribution');

    // Build the complete list of cells we'll create with their data-keys
    // This lets us determine group boundaries after all cells are defined
    const cellDefs = [];

    // Cells for headers before PensionContribution
    for (let i = 0; i < pensionContribIndex && i < baseHeaders.length; i++) {
      const th = baseHeaders[i];
      cellDefs.push({
        label: th.textContent,
        key: th.getAttribute('data-key'),
        tooltip: null,
        originalTh: th
      });
    }

    // PensionContribution cell (comes first in deductions)
    if (pensionColumn) {
      cellDefs.push({
        label: pensionColumn.label,
        key: 'PensionContribution',
        tooltip: pensionColumn.tooltip,
        originalTh: null
      });
    }

    // Tax columns (country-specific)
    taxColumns.forEach(col => {
      cellDefs.push({
        label: col.label,
        key: col.key,
        tooltip: col.tooltip,
        originalTh: null
      });
    });

    // Cells for headers after PensionContribution
    for (let i = pensionContribIndex + 1; i < baseHeaders.length; i++) {
      const th = baseHeaders[i];
      cellDefs.push({
        label: th.textContent,
        key: th.getAttribute('data-key'),
        tooltip: null,
        originalTh: th
      });
    }

    // Helper predicates for group identification (mirrors updateGroupBorders in WebUI.js)
    const isIncome = (k) => k && k.indexOf('Income') === 0;
    const isTax = (k) => k && k.indexOf('Tax__') === 0;
    const isAsset = (k) => k && (k === 'PensionFund' || k === 'Cash' || k === 'RealEstateCapital' ||
      k.indexOf('Capital__') === 0 || k === 'FundsCapital' || k === 'SharesCapital');

    // Find group boundary indices
    const yearIdx = cellDefs.findIndex(c => c.key === 'Year');
    const incomeLastIdx = (() => { for (let i = cellDefs.length - 1; i >= 0; i--) if (isIncome(cellDefs[i].key)) return i; return -1; })();
    let deductionsLastIdx = (() => { for (let i = cellDefs.length - 1; i >= 0; i--) if (isTax(cellDefs[i].key)) return i; return -1; })();
    if (deductionsLastIdx === -1) deductionsLastIdx = cellDefs.findIndex(c => c.key === 'PensionContribution');
    const expensesIdx = cellDefs.findIndex(c => c.key === 'Expenses');
    const assetsLastIdx = (() => { for (let i = cellDefs.length - 1; i >= 0; i--) if (isAsset(cellDefs[i].key)) return i; return -1; })();

    // Build set of boundary indices
    const boundaryIdxs = new Set([yearIdx, incomeLastIdx, deductionsLastIdx, expensesIdx, assetsLastIdx, cellDefs.length - 1].filter(i => i >= 0));

    // Create the actual th cells
    cellDefs.forEach((def, idx) => {
      const cell = document.createElement('th');
      cell.textContent = def.label;
      if (def.key) cell.setAttribute('data-key', def.key);

      // Set group border if this is a boundary column
      if (boundaryIdxs.has(idx)) {
        cell.setAttribute('data-group-end', '1');
        cell.style.borderRight = '3px solid #666';
      }

      // Attach tooltip if provided
      if (def.tooltip) {
        TooltipUtils.attachTooltip(cell, def.tooltip, { hoverDelay: 300, touchDelay: 400 });
      }

      headerRow.appendChild(cell);
    });

    return headerRow;
  }





  /**
   * Initializes the IntersectionObserver for tracking tax header visibility
   * Note: Sticky positioning is now handled entirely by CSS
   */
  _initializeTaxHeaderObserver() {
    // CSS handles sticky positioning natively with `position: sticky; top: 38px`
    // Observer is kept for potential future use (e.g., tracking active country)
    if (this._taxHeaderObserver) return;
    this._taxHeaderObserver = { observe: () => { }, disconnect: () => { } }; // No-op placeholder
  }

  /**
   * Registers a tax header row (for tracking purposes)
   * @param {HTMLTableRowElement} headerRow - The tax header row to track
   */
  _registerTaxHeader(headerRow) {
    this._taxHeaders.push(headerRow);
  }

  /**
   * Cleans up tax headers for a new simulation
   */
  _cleanupTaxHeaders() {
    // Remove all tax header rows from DOM
    const tbody = document.querySelector('#Data tbody');
    if (tbody) {
      const existingHeaders = tbody.querySelectorAll('tr.tax-header');
      existingHeaders.forEach(header => header.remove());
    }

    // Reset tracking arrays
    this._taxHeaders = [];
    this._activeTaxHeader = null;
    this._taxHeaderObserver = null;
  }

}



