/* Table management functionality */

class TableManager {

  constructor(webUI) {
    this.webUI = webUI;
    // Flag to track if income visibility has been initialized
    this._incomeVisibilityInitialized = false;
    this.currencyMode = 'natural'; // 'natural' or 'unified'
    this.reportingCurrency = null;
    this.countryInflationOverrides = {}; // MV event rate overrides: country -> inflation rate (decimal)
    this.conversionCache = {};
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
      RelocationUtils.extractRelocationTransitions(this.webUI, this);

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

    if (Config.getInstance().isRelocationEnabled()) {
      currentCountry = RelocationUtils.getCountryForAge(data.Age, this.webUI);

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
    const rowCountry = currentCountry || RelocationUtils.getCountryForAge(data.Age, this.webUI) || Config.getInstance().getDefaultCountry() || 'ie';
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

    // ---- Flexbox Deductions Container Setup ----
    // Identify deduction columns (PensionContribution + Tax__*) for flexbox layout
    const isDeductionKey = (k) => k === 'PensionContribution' || (k && k.indexOf('Tax__') === 0);
    const allKeys = headers.map(h => h.dataset?.key || h.getAttribute?.('data-key'));
    const deductionIndices = allKeys.map((k, i) => isDeductionKey(k) ? i : -1).filter(i => i >= 0);
    const firstDeductionIdx = deductionIndices.length > 0 ? deductionIndices[0] : -1;
    const lastDeductionIdx = deductionIndices.length > 0 ? deductionIndices[deductionIndices.length - 1] : -1;

    // Get max column count for colspan (if dynamicSectionManager available)
    const maxDeductionColumns = (this.dynamicSectionManager && this.dynamicSectionManager.isInitialized())
      ? this.dynamicSectionManager.getMaxColumnCount()
      : deductionIndices.length;

    // Create cells and format values in the order of the headers
    // Deduction columns use flexbox layout for consistent section width
    let deductionsContainerCell = null;
    let deductionsFlexDiv = null;

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
        const fromCountry = RelocationUtils.getCountryForAge(age, this.webUI);
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

      // Check if this is a deduction column
      const isCurrentDeduction = isDeductionKey(key);

      // Determine the element to create (td for regular, div for deduction flex item)
      let cellElement;
      let contentContainer;

      if (isCurrentDeduction && firstDeductionIdx >= 0) {
        // === DYNAMIC SECTION: Use flexbox layout ===
        const sectionName = this.dynamicSectionManager ? this.dynamicSectionManager.getSectionName() : 'deductions';

        // Create container cell on first column
        if (headerIndex === firstDeductionIdx) {
          deductionsContainerCell = document.createElement('td');
          deductionsContainerCell.className = 'dynamic-section-container';
          deductionsContainerCell.setAttribute('data-section', sectionName);
          deductionsContainerCell.colSpan = maxDeductionColumns;
          // Apply group border to the container
          deductionsContainerCell.setAttribute('data-group-end', '1');
          deductionsContainerCell.style.borderRight = '3px solid #666';

          deductionsFlexDiv = document.createElement('div');
          deductionsFlexDiv.className = 'dynamic-section-flex';
          deductionsContainerCell.appendChild(deductionsFlexDiv);
        }

        // Create flex item for this column
        cellElement = document.createElement('div');
        cellElement.className = 'dynamic-section-cell';
        cellElement.setAttribute('data-key', key);
        // Width will be set by DynamicSectionManager.finalizeSectionWidths() after simulation completes

        contentContainer = document.createElement('span');
        contentContainer.className = 'cell-content';
      } else {
        // === REGULAR COLUMN: Standard td ===
        cellElement = document.createElement('td');

        contentContainer = document.createElement('div');
        contentContainer.className = 'cell-content';
      }

      // Add the formatted value
      if (key === 'Age' || key === 'Year') {
        contentContainer.textContent = v.toString();
      } else if (key === 'WithdrawalRate') {
        contentContainer.textContent = FormatUtils.formatPercentage(v);
      } else {
        const age = data.Age;
        const fromCountry = RelocationUtils.getCountryForAge(age, this.webUI);
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
            const fromCountry = RelocationUtils.getCountryForAge(age, this.webUI);
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
            const originalCountry = RelocationUtils.getCountryForAge(age, this.webUI);
            tooltipText += `\n\nOriginal: ${FormatUtils.formatCurrency(originalValue, originalCurrency, originalCountry)}`;
          }

          // Only attach tooltip and show 'i' icon if there's meaningful content to display
          // Guard with non-zero check to allow tooltips for negative and small positive values
          if ((breakdown || originalValue !== undefined) && tooltipText.trim() !== '' && Math.abs(v) > 0) {
            TooltipUtils.attachTooltip(cellElement, tooltipText);
            hasTooltip = true;
          }
        }
      }

      // Add the content container to the cell
      cellElement.appendChild(contentContainer);

      // Store nominal (pre-deflation, pre-conversion) value on monetary cells for future refresh without re-simulating
      try {
        if (isMonetary) {
          cellElement.setAttribute('data-nominal-value', String(nominalValue));
          if (pvValue !== null && pvValue !== undefined && isFinite(pvValue)) {
            cellElement.setAttribute('data-pv-value', String(pvValue));
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

      // Handle appending the element
      if (isCurrentDeduction && deductionsFlexDiv) {
        // Append flex item to the flexbox container
        deductionsFlexDiv.appendChild(cellElement);

        // After last deduction column, append the container cell to the row
        if (headerIndex === lastDeductionIdx) {
          row.appendChild(deductionsContainerCell);
        }
      } else {
        // Regular cell: apply group border logic and append to row
        try {
          // Determine if this cell is at a group boundary
          const isIncome = (k) => k && k.indexOf('Income') === 0;
          const isTax = (k) => k && k.indexOf('Tax__') === 0;
          const isAsset = (k) => k && (k === 'PensionFund' || k === 'Cash' || k === 'RealEstateCapital' ||
            k.indexOf('Capital__') === 0 || k === 'FundsCapital' || k === 'SharesCapital');

          // Find indices of group boundaries within the headers array
          const yearBoundaryIdx = allKeys.indexOf('Year');
          const incomeLastIdx = (() => { for (let i = allKeys.length - 1; i >= 0; i--) if (isIncome(allKeys[i])) return i; return -1; })();
          // Skip deductions boundary check - handled by container cell
          const expensesBoundaryIdx = allKeys.indexOf('Expenses');
          const assetsLastIdx = (() => { for (let i = allKeys.length - 1; i >= 0; i--) if (isAsset(allKeys[i])) return i; return -1; })();
          const lastIdx = allKeys.length - 1;

          const boundarySet = new Set([yearBoundaryIdx, incomeLastIdx, expensesBoundaryIdx, assetsLastIdx, lastIdx].filter(i => i >= 0));

          if (boundarySet.has(headerIndex)) {
            cellElement.setAttribute('data-group-end', '1');
            cellElement.style.borderRight = '3px solid #666';
          }
        } catch (_) { }

        row.appendChild(cellElement);
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

    // Finalize dynamic section column widths after all rows are rendered
    if (this.dynamicSectionManager && this.dynamicSectionManager.isInitialized()) {
      this.dynamicSectionManager.finalizeSectionWidths(tbody);
    }
  }


  exportDataTableAsCSV() {
    const table = document.getElementById('Data');
    if (!table) {
      throw new Error('Data table not found');
    }

    // Get all rows from tbody - these include both tax-header rows and data rows
    const dataRows = Array.from(table.querySelectorAll('tbody tr'));
    if (dataRows.length === 0) {
      throw new Error('No data to export. Please run a simulation first.');
    }

    // === PASS 1: Scan all rows to find max column count per dynamic section ===
    // Map of section name -> max column count found across all rows
    const maxSectionColumns = new Map();

    dataRows.forEach(row => {
      // Check both th and td elements for dynamic section containers
      const containers = row.querySelectorAll('.dynamic-section-container');
      containers.forEach(container => {
        const sectionName = container.getAttribute('data-section') || 'default';
        const sectionCells = container.querySelectorAll('.dynamic-section-cell');
        const columnCount = sectionCells.length;

        const currentMax = maxSectionColumns.get(sectionName) || 0;
        if (columnCount > currentMax) {
          maxSectionColumns.set(sectionName, columnCount);
        }
      });
    });

    // === PASS 2: Extract values with padding for dynamic sections ===

    /**
     * Strip formatting from a value for CSV export.
     * - Percentages: convert to decimal (e.g., "3.5%" → "0.035")
     * - Currency values: filter to digits only (and minus sign for negatives)
     * - Non-numeric values (text): return as-is
     */
    const stripFormatting = (text) => {
      if (!text || text === '') return '';

      const trimmed = text.trim();

      // Check if it's a percentage (ends with %)
      if (trimmed.endsWith('%')) {
        // Extract numeric part, preserving decimal point and minus sign
        const numericPart = trimmed.replace('%', '').replace(/[^\d.\-]/g, '');
        const parsed = parseFloat(numericPart);
        if (!isNaN(parsed)) {
          // Convert percentage to decimal (e.g., 3.5 → 0.035)
          // Round to 3 decimal places to avoid floating point precision issues
          const decimal = parsed / 100;
          return String(Math.round(decimal * 1000) / 1000);
        }
        return trimmed; // Return as-is if parsing fails
      }

      // Check if it looks like a formatted number (contains digits)
      if (/\d/.test(trimmed)) {
        // Check if negative (has minus sign or parentheses for accounting format)
        const isNegative = trimmed.includes('-') || (trimmed.startsWith('(') && trimmed.endsWith(')'));

        // Filter to digits only
        const digitsOnly = trimmed.replace(/[^\d]/g, '');

        if (digitsOnly === '') return trimmed; // No digits found, return as-is

        return isNegative ? '-' + digitsOnly : digitsOnly;
      }

      // Non-numeric value (text like column headers) - return as-is
      return trimmed;
    };

    /**
     * Extract all cell values from a data row, handling the flexbox dynamic sections.
     * For dynamic section container cells, extracts values from nested .dynamic-section-cell elements
     * and pads to the max column count for that section.
     * Strips formatting from values for spreadsheet compatibility.
     */
    const getDataRowValues = (row) => {
      const values = [];
      const cells = row.querySelectorAll(':scope > td');

      cells.forEach(cell => {
        // Check if this is a dynamic section container with nested flex cells
        if (cell.classList.contains('dynamic-section-container')) {
          const sectionName = cell.getAttribute('data-section') || 'default';
          const sectionCells = cell.querySelectorAll('.dynamic-section-cell');
          const maxColumns = maxSectionColumns.get(sectionName) || sectionCells.length;

          // Extract actual values
          sectionCells.forEach(sectionCell => {
            const contentContainer = sectionCell.querySelector('.cell-content');
            let text = contentContainer ? contentContainer.textContent.trim() : sectionCell.textContent.trim();
            // Remove tooltip indicator ('i' icon)
            text = text.replace(/i\s*$/, '').trim();
            values.push(stripFormatting(text));
          });

          // Pad to max columns for this section
          const padding = maxColumns - sectionCells.length;
          for (let p = 0; p < padding; p++) {
            values.push('');
          }
        } else {
          // Regular cell
          const contentContainer = cell.querySelector('.cell-content');
          let text = contentContainer ? contentContainer.textContent.trim() : cell.textContent.trim();
          // Remove tooltip indicator ('i' icon)
          text = text.replace(/i\s*$/, '').trim();
          values.push(stripFormatting(text));
        }
      });

      return values;
    };

    /**
     * Extract header labels from a tax-header row.
     * Tax header rows have th elements for fixed columns and a flexbox container for dynamic sections.
     * Processes cells in DOM order to maintain correct column positions.
     * Pads dynamic sections to max column count.
     * NOTE: Header labels are NOT stripped - they remain as human-readable text.
     */
    const getTaxHeaderValues = (row) => {
      const values = [];

      // Process all direct children (th and td) in DOM order
      const cells = row.querySelectorAll(':scope > th, :scope > td');
      cells.forEach(cell => {
        // Check if this is a dynamic section container with nested flex cells
        if (cell.classList.contains('dynamic-section-container')) {
          const sectionName = cell.getAttribute('data-section') || 'default';
          const sectionCells = cell.querySelectorAll('.dynamic-section-cell');
          const maxColumns = maxSectionColumns.get(sectionName) || sectionCells.length;

          // Extract actual values (headers - not stripped)
          sectionCells.forEach(sectionCell => {
            values.push(sectionCell.textContent.trim());
          });

          // Pad to max columns for this section
          const padding = maxColumns - sectionCells.length;
          for (let p = 0; p < padding; p++) {
            values.push('');
          }
        } else if (cell.classList.contains('spacer')) {
          // Skip empty spacer cells - don't add anything
          values.push('');
        } else {
          values.push(cell.textContent.trim());
        }
      });

      return values;
    };

    /**
     * Format values for CSV output - quote values containing commas
     */
    const formatRowForCSV = (values) => {
      return values.map(val => {
        const textStr = String(val || '');
        if (textStr.indexOf(',') !== -1) return '"' + textStr + '"';
        return textStr;
      }).join(',');
    };

    // Build CSV content by iterating through all rows
    // Tax-header rows become section headers, data rows become data
    let csvContent = '';

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      let rowValues;

      if (row.classList.contains('tax-header')) {
        // Tax header row - extract column headers for this country
        rowValues = getTaxHeaderValues(row);
      } else {
        // Data row - extract values
        rowValues = getDataRowValues(row);
      }

      csvContent += formatRowForCSV(rowValues) + '\n';
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
        let fromCountry = age != null && isFinite(age) ? RelocationUtils.getCountryForAge(age, this.webUI) : (Config.getInstance().getDefaultCountry && Config.getInstance().getDefaultCountry());
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
        deductionColumns = [{ key: 'PensionContribution', label: 'P.Contrib', tooltip: 'Amount contributed to private pensions (excluding employer match)' }];
      }
    }

    // Get max column count for colspan
    const maxDeductionColumns = (this.dynamicSectionManager && this.dynamicSectionManager.isInitialized())
      ? this.dynamicSectionManager.getMaxColumnCount()
      : deductionColumns.length;

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

    // Helper predicates for group identification
    const isIncome = (k) => k && k.indexOf('Income') === 0;
    const isAsset = (k) => k && (k === 'PensionFund' || k === 'Cash' || k === 'RealEstateCapital' ||
      k.indexOf('Capital__') === 0 || k === 'FundsCapital' || k === 'SharesCapital');
    const isDeductionKey = (k) => k === 'PensionContribution' || (k && k.indexOf('Tax__') === 0);

    // Build the complete list of cells we'll create with their data-keys
    const cellDefs = [];

    // Cells for headers before PensionContribution
    for (let i = 0; i < pensionContribIndex && i < baseHeaders.length; i++) {
      const th = baseHeaders[i];
      cellDefs.push({
        label: th.textContent,
        key: th.getAttribute('data-key'),
        tooltip: th.getAttribute('data-tooltip') || th.getAttribute('title') || null,
        isDeduction: false
      });
    }

    // Deduction cells (PensionContribution first, then tax columns)
    if (pensionColumn) {
      cellDefs.push({
        label: pensionColumn.label,
        key: 'PensionContribution',
        tooltip: pensionColumn.tooltip,
        isDeduction: true
      });
    }
    taxColumns.forEach(col => {
      cellDefs.push({
        label: col.label,
        key: col.key,
        tooltip: col.tooltip,
        isDeduction: true
      });
    });

    // Cells for headers after PensionContribution (skip original PensionContribution in baseHeaders)
    for (let i = pensionContribIndex + 1; i < baseHeaders.length; i++) {
      const th = baseHeaders[i];
      cellDefs.push({
        label: th.textContent,
        key: th.getAttribute('data-key'),
        tooltip: th.getAttribute('data-tooltip') || th.getAttribute('title') || null,
        isDeduction: false
      });
    }

    // Find group boundary indices (excluding deductions - handled by container)
    const allKeys = cellDefs.map(c => c.key);
    const yearIdx = allKeys.indexOf('Year');
    const incomeLastIdx = (() => { for (let i = allKeys.length - 1; i >= 0; i--) if (isIncome(allKeys[i])) return i; return -1; })();
    const expensesIdx = allKeys.indexOf('Expenses');
    const assetsLastIdx = (() => { for (let i = allKeys.length - 1; i >= 0; i--) if (isAsset(allKeys[i])) return i; return -1; })();
    const boundaryIdxs = new Set([yearIdx, incomeLastIdx, expensesIdx, assetsLastIdx, cellDefs.length - 1].filter(i => i >= 0));

    // Create the cells - using flexbox for dynamic sections
    let sectionContainerCell = null;
    let sectionFlexDiv = null;
    let firstSectionCellProcessed = false;
    const sectionName = this.dynamicSectionManager ? this.dynamicSectionManager.getSectionName() : 'deductions';

    cellDefs.forEach((def, idx) => {
      if (def.isDeduction) {
        // === DYNAMIC SECTION: Use flexbox layout ===

        // Create container cell on first dynamic section cell
        if (!firstSectionCellProcessed) {
          sectionContainerCell = document.createElement('th');
          sectionContainerCell.className = 'dynamic-section-container';
          sectionContainerCell.setAttribute('data-section', sectionName);
          sectionContainerCell.colSpan = maxDeductionColumns;
          sectionContainerCell.setAttribute('data-group-end', '1');
          sectionContainerCell.style.borderRight = '3px solid #666';

          sectionFlexDiv = document.createElement('div');
          sectionFlexDiv.className = 'dynamic-section-flex';
          sectionContainerCell.appendChild(sectionFlexDiv);

          firstSectionCellProcessed = true;
        }

        // Create flex item for this header cell
        const flexItem = document.createElement('div');
        flexItem.className = 'dynamic-section-cell';
        flexItem.setAttribute('data-key', def.key);
        flexItem.textContent = def.label;
        // Width will be set by DynamicSectionManager.finalizeSectionWidths() after simulation

        // Attach tooltip if provided
        if (def.tooltip) {
          TooltipUtils.attachTooltip(flexItem, def.tooltip, { hoverDelay: 300, touchDelay: 400 });
        }

        sectionFlexDiv.appendChild(flexItem);

        // Check if this is the last section cell - if so, append container to row
        const isLastSectionCell = !cellDefs.slice(idx + 1).some(c => c.isDeduction);
        if (isLastSectionCell) {
          headerRow.appendChild(sectionContainerCell);
        }
      } else {
        // === REGULAR COLUMN: Standard th ===
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
      }
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


