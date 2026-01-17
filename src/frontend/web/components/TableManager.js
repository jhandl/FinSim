/* Table management functionality */

class TableManager {

  constructor(webUI) {
    this.webUI = webUI;
    // Flag to track if column visibility has been initialized
    this._incomeVisibilityInitialized = false; // kept for backward compatibility with existing initialization flow
    this.currencyMode = 'natural'; // 'natural' or 'unified'
    this.reportingCurrency = null;
    this.countryInflationOverrides = {}; // MV event rate overrides: country -> inflation rate (decimal)
    this.conversionCache = {};
    this.presentValueMode = false; // Display monetary values in today's terms when enabled
    // Dynamic sections manager for elastic column layouts during relocations
    this.dynamicSectionsManager = new DynamicSectionsManager(DYNAMIC_SECTIONS);
    // Dynamic tax header management
    this._taxHeaderObserver = null;
    this._activeTaxHeader = null;
    this._taxHeaders = [];
    this._lastCountry = null;
    this._lastColumnVisibilityMap = null;
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
    try { row.setAttribute('data-age', String(data.Age)); } catch (_) { }
    try { row.setAttribute('data-year', String(data.Year)); } catch (_) { }

    // Reset header init at the start of each simulation (first row)
    if (rowIndex === 0 || rowIndex === 1) {
      this.conversionCache = {}; // Clear cache for new simulation
      RelocationUtils.extractRelocationTransitions(this.webUI, this);

      // Initialize dynamic sections manager for elastic dynamic sections
      this.dynamicSectionsManager.initialize(this);

      // Cleanup previous tax headers for new simulation
      this._cleanupTaxHeaders();
      this._lastCountry = null;
    }

    // Initialize pinned-only visibility map (used until end-of-run visibility is computed)
    if (!this._incomeVisibilityInitialized) {
      const taxRuleSet = Config.getInstance().getCachedTaxRuleSet();
      const pinned = (taxRuleSet && typeof taxRuleSet.getPinnedIncomeTypes === 'function') ? (taxRuleSet.getPinnedIncomeTypes() || []) : [];
      const initialVisibility = {};
      for (let i = 0; i < pinned.length; i++) {
        initialVisibility[String(pinned[i]).toLowerCase()] = true;
      }
      initialVisibility.pensionfund = true;
      initialVisibility.cash = true;
      initialVisibility.realestatecapital = true;
      this._lastColumnVisibilityMap = initialVisibility;
      this._incomeVisibilityInitialized = true;
    }

    // Detect relocation boundaries for dynamic tax headers
    let needsNewTaxHeader = false;
    let currentCountry = null;

    currentCountry = RelocationUtils.getCountryForAge(data.Age, this.webUI) || Config.getInstance().getDefaultCountry();

    // Check if this is the first data row or if country changed from previous row
    if (rowIndex === 1) {
      needsNewTaxHeader = true;
      this._lastCountry = currentCountry;
    } else if (this._lastCountry !== currentCountry) {
      needsNewTaxHeader = true;
      this._lastCountry = currentCountry;
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

      // Empty table (pre-simulation): distribute dynamic header cells across
      // the full dynamic section width so they don't bunch to the left.
      try {
        const age = data ? data.Age : null;
        if (age === null || age === undefined || !isFinite(age)) {
          this._applyEmptyStateFlexLayoutToDynamicSectionHeaderRow(taxHeaderRow);
        }
      } catch (_) { }

      // Register with IntersectionObserver for sticky behavior
      this._registerTaxHeader(taxHeaderRow);
      try { this._applyVisibilityEngineToEnabledSections(tbody); } catch (_) { }
    }

    this._updateDynamicSectionGroupColSpans();

    const blueprint = this._buildRowBlueprint(currentCountry);
    const boundarySet = this._computeGroupBoundarySet(blueprint);

    const renderValueCell = (key, isDynamicSectionCell) => {
      // Nominal and (optional) PV values from the core data sheet
      let nominalValue = (data[key] == null ? 0 : data[key]);
      let pvValue = null;

      if (key.indexOf('Income__') === 0) {
        const mapKey = key.substring(8);
        const map = data.investmentIncomeByKey;
        if (map && Object.prototype.hasOwnProperty.call(map, mapKey)) {
          nominalValue = map[mapKey];
        }
        const pvMap = data.investmentIncomeByKeyPV;
        if (pvMap && Object.prototype.hasOwnProperty.call(pvMap, mapKey)) {
          pvValue = pvMap[mapKey];
        }
      } else if (key.indexOf('Capital__') === 0) {
        const mapKey = key.substring(9);
        const map = data.investmentCapitalByKey;
        if (map && Object.prototype.hasOwnProperty.call(map, mapKey)) {
          nominalValue = map[mapKey];
        }
        const pvMap = data.investmentCapitalByKeyPV;
        if (pvMap && Object.prototype.hasOwnProperty.call(pvMap, mapKey)) {
          pvValue = pvMap[mapKey];
        }
      }

      // Default PV lookup (fixed columns and any other dynamic keys)
      if (pvValue === null) {
        const pvKey = key + 'PV';
        pvValue = Object.prototype.hasOwnProperty.call(data, pvKey) ? data[pvKey] : null;
      }
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
        const startYear = Config.getInstance().getSimulationStartYear();
        const year = this.presentValueMode ? startYear : (data.Year != null ? data.Year : (startYear + age));
        const fromCountry = RelocationUtils.getCountryForAge(age, this.webUI);
        const toCountry = RelocationUtils.getRepresentativeCountryForCurrency(this.reportingCurrency);

        const fromCurrency = Config.getInstance().getCachedTaxRuleSet(fromCountry)?.getCurrencyCode();

        if (fromCurrency !== this.reportingCurrency) {
          const economicData = Config.getInstance().getEconomicData();
          if (economicData && economicData.ready) {
            const cacheKey = `${year}-${fromCountry}-${toCountry}-${this.presentValueMode ? 'pv' : 'nom'}`;
            let fxMult = this.conversionCache[cacheKey];
            if (fxMult === undefined) {
              // Evolution FX conversion (default mode) - not PPP.
              fxMult = economicData.convert(1, fromCountry, toCountry, year, {
                baseYear: startYear
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

      // Determine the element to create (td for regular, div for dynamic section flex item)
      let cellElement;
      let contentContainer;

      if (isDynamicSectionCell) {
        // === DYNAMIC SECTION: Use flexbox layout ===
        cellElement = document.createElement('div');
        cellElement.className = 'dynamic-section-cell';
        cellElement.setAttribute('data-key', key);
        // Width will be set by DynamicSectionManager.finalizeSectionWidths() after simulation completes

        contentContainer = document.createElement('span');
        contentContainer.className = 'cell-content';
      } else {
        // === REGULAR COLUMN: Standard td ===
        cellElement = document.createElement('td');
        cellElement.setAttribute('data-key', key);

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

          {
            // Original logic for all columns (legacy special-cases removed)
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

      return cellElement;
    };

    for (let i = 0; i < blueprint.length; i++) {
      const seg = blueprint[i];
      if (seg.type === 'section') {
        const sectionId = seg.sectionId;
        const columns = seg.columns || [];
        const maxCols = Math.max(1, this.dynamicSectionsManager.getMaxColumnCount(sectionId));

        const sectionContainerCell = document.createElement('td');
        sectionContainerCell.className = 'dynamic-section-container';
        sectionContainerCell.setAttribute('data-section', sectionId);
        sectionContainerCell.colSpan = maxCols;
        const cfg = this.dynamicSectionsManager.getSectionConfig(sectionId);
        const applyBoundaryBorder = boundarySet.has(i) && (!cfg || cfg.isGroupBoundary !== false);
        if (applyBoundaryBorder) {
          sectionContainerCell.setAttribute('data-group-end', '1');
          sectionContainerCell.style.borderRight = '3px solid #666';
        }

        const sectionFlexDiv = document.createElement('div');
        sectionFlexDiv.className = 'dynamic-section-flex';
        sectionContainerCell.appendChild(sectionFlexDiv);

        for (let c = 0; c < columns.length; c++) {
          const flexItem = renderValueCell(columns[c].key, true);
          sectionFlexDiv.appendChild(flexItem);
        }

        row.appendChild(sectionContainerCell);
      } else {
        const cell = renderValueCell(seg.key, false);
        if (boundarySet.has(i)) {
          cell.setAttribute('data-group-end', '1');
          cell.style.borderRight = '3px solid #666';
        }
        row.appendChild(cell);
      }
    }
  }

  setDataRowBackgroundColor(rowIndex, backgroundColor) {
    const row = document.getElementById(`data_row_${rowIndex}`);
    if (row) {
      row.style.backgroundColor = backgroundColor;
    }
  }

  finalizeDataTableLayout() {
    try {
      const tbody = document.querySelector('#Data tbody');
      if (!tbody) return;
      try { this._applyVisibilityEngineToEnabledSections(tbody); } catch (_) { }
      this._applyPeriodZeroHideToDynamicSections(tbody);
      this.dynamicSectionsManager.finalizeSectionWidths(tbody);
    } catch (_) { }
  }

  clearExtraDataRows(maxAge) {
    // Special case used by scenario loading: clear everything and reset header visibility
    // to match a fresh page state (no data rows, only the empty tax header).
    if (maxAge === 0) {
      const tbody = document.querySelector('#Data tbody');
      if (tbody) tbody.innerHTML = '';
      try { this._cleanupTaxHeaders(); } catch (_) { }
      this._lastCountry = null;
      this._incomeVisibilityInitialized = false;
      this._lastColumnVisibilityMap = null;
      try { if (this.webUI) this.webUI.lastIncomeVisibility = null; } catch (_) { }

      // Restore static column headers (2nd thead row) in case a previous run hid them.
      try {
        const headerRow = document.querySelector('#Data thead tr:nth-child(2)');
        if (headerRow) {
          const headers = Array.from(headerRow.querySelectorAll('th[data-key]'));
          for (let i = 0; i < headers.length; i++) {
            headers[i].style.display = '';
          }
        }
      } catch (_) { }
      return;
    }

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
    this.finalizeDataTableLayout();
  }


  exportDataTableAsCSV() {
    const table = document.getElementById('Data');
    if (!table) {
      throw new Error('Data table not found');
    }

    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };

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
        const sectionCells = Array.from(container.querySelectorAll('.dynamic-section-cell')).filter(isVisible);
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
      const cells = Array.from(row.querySelectorAll(':scope > td')).filter(isVisible);

      cells.forEach(cell => {
        // Check if this is a dynamic section container with nested flex cells
        if (cell.classList.contains('dynamic-section-container')) {
          const sectionName = cell.getAttribute('data-section') || 'default';
          const sectionCells = Array.from(cell.querySelectorAll('.dynamic-section-cell')).filter(isVisible);
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
      const cells = Array.from(row.querySelectorAll(':scope > th, :scope > td')).filter(isVisible);
      cells.forEach(cell => {
        // Check if this is a dynamic section container with nested flex cells
        if (cell.classList.contains('dynamic-section-container')) {
          const sectionName = cell.getAttribute('data-section') || 'default';
          const sectionCells = Array.from(cell.querySelectorAll('.dynamic-section-cell')).filter(isVisible);
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
    this.refreshDisplayedCurrencies({ recomputeDynamicSectionWidths: true });
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
  refreshDisplayedCurrencies(options) {
    const opts = options || {};
    const table = document.getElementById('Data');
    if (!table) return;
    const isMonetaryKey = (key) => !(key === 'Age' || key === 'Year' || key === 'WithdrawalRate');

    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => !r.classList.contains('tax-header'));
    if (rows.length === 0) return;

    // Pre-scan: if any monetary cell is missing its nominal value, trigger a single full rerender.
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const cells = Array.from(row.querySelectorAll('[data-nominal-value]'));
      for (let c = 0; c < cells.length; c++) {
        const key = cells[c].getAttribute('data-key');
        if (!key || !isMonetaryKey(key)) continue;
        const nominalStr = cells[c].getAttribute('data-nominal-value');
        if (nominalStr == null || nominalStr === '') { try { this.webUI.rerenderData(); } catch (_) { } return; }
        const nominal = Number(nominalStr);
        if (isNaN(nominal)) { try { this.webUI.rerenderData(); } catch (_) { } return; }
      }
    }

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const age = (() => {
        const a = parseInt(row.getAttribute('data-age') || '', 10);
        return (isNaN(a) || !isFinite(a)) ? undefined : a;
      })();

      const cells = Array.from(row.querySelectorAll('[data-nominal-value]'));
      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        const key = cell.getAttribute('data-key');
        if (!key || !isMonetaryKey(key)) continue;
        const contentEl = cell.querySelector('.cell-content') || cell;
        const nominalStr = cell.getAttribute('data-nominal-value');
        const pvStr = cell.getAttribute('data-pv-value');
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
        if (this.currencyMode === 'unified' && this.reportingCurrency && Config.getInstance().isRelocationEnabled()) {
          displayCurrencyCode = this.reportingCurrency;
          displayCountryForLocale = RelocationUtils.getRepresentativeCountryForCurrency(this.reportingCurrency);
          try {
            // Only convert if we have a valid age for year calculation
            if (age != null && isFinite(age)) {
              const toCountry = displayCountryForLocale;
              const startYear = Config.getInstance().getSimulationStartYear();
              const rowYearRaw = row.getAttribute('data-year');
              const rowYear = rowYearRaw != null ? parseInt(rowYearRaw, 10) : NaN;
              const year = this.presentValueMode ? startYear : (isFinite(rowYear) ? rowYear : (startYear + age));
              const fromCurrency = Config.getInstance().getCachedTaxRuleSet(fromCountry)?.getCurrencyCode();
              if (fromCurrency && fromCurrency !== this.reportingCurrency) {
                const economicData = Config.getInstance().getEconomicData();
                if (economicData && economicData.ready) {
                  const cacheKey = `${year}-${fromCountry}-${toCountry}-${this.presentValueMode ? 'pv' : 'nom'}`;
                  let fxMult = this.conversionCache[cacheKey];
                  if (fxMult === undefined) {
                    // Evolution FX conversion (default mode) - not PPP.
                    fxMult = economicData.convert(1, fromCountry, toCountry, year, { baseYear: startYear });
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

    if (opts.recomputeDynamicSectionWidths) {
      try { this.finalizeDataTableLayout(); } catch (_) { }
    }
  }

  applyVisibilityAfterSimulation(getVisibilityMapFn) {
    const getMap = (typeof getVisibilityMapFn === 'function')
      ? getVisibilityMapFn
      : (() => this.webUI.getIncomeColumnVisibility());

    const visibilityMap = getMap() || {};
    this._lastColumnVisibilityMap = Object.assign({}, visibilityMap);

    // Apply visibility to chart to match table
    this.webUI.chartManager.applyIncomeVisibility(visibilityMap);

    // Persist last computed visibility for end-of-run application in a single step
    try { this.webUI.lastIncomeVisibility = visibilityMap; } catch (_) { }

    try { this.finalizeDataTableLayout(); } catch (_) { }
  }

  // Back-compat entrypoint used by UIManager
  applyIncomeVisibilityAfterSimulation() {
    return this.applyVisibilityAfterSimulation();
  }

  _getTaxHeaderPeriods(tbody) {
    const periods = [];
    let current = null;
    const rows = Array.from((tbody || document.querySelector('#Data tbody'))?.querySelectorAll?.('tr') || []);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.classList && row.classList.contains('tax-header')) {
        current = { headerRow: row, dataRows: [] };
        periods.push(current);
        continue;
      }
      if (current) current.dataRows.push(row);
    }
    return periods;
  }

  _applyVisibilityEngineToEnabledSections(tbody) {
    const periods = this._getTaxHeaderPeriods(tbody);
    if (!periods.length) return;

    const sections = this.dynamicSectionsManager.getSections();
    for (let s = 0; s < sections.length; s++) {
      const cfg = sections[s];
      if (!cfg || !cfg.enableVisibilityEngine) continue;
      const sectionId = cfg.id;

      // Per-country pinned key resolution (periods may differ due to relocations)
      const periodsByCountry = new Map();
      for (let p = 0; p < periods.length; p++) {
        const country = (periods[p].headerRow && periods[p].headerRow.getAttribute)
          ? (periods[p].headerRow.getAttribute('data-country') || '')
          : '';
        const key = String(country || '').toLowerCase();
        if (!periodsByCountry.has(key)) periodsByCountry.set(key, []);
        periodsByCountry.get(key).push(periods[p]);
      }

      periodsByCountry.forEach((bucket, country) => {
        const pinnedKeys = Array.isArray(cfg.pinnedKeys) ? cfg.pinnedKeys : [];
        DynamicSectionVisibilityEngine.apply(sectionId, pinnedKeys, this._lastColumnVisibilityMap, bucket);
      });
    }
  }

  _updateDynamicSectionGroupColSpans() {
    const sections = this.dynamicSectionsManager.getSections();
    for (let i = 0; i < sections.length; i++) {
      const cfg = sections[i];
      const groupKey = cfg.groupKey;
      const groupTh = document.querySelector(`#Data thead tr.header-groups th[data-group="${groupKey}"]`);
      if (!groupTh) continue;
      groupTh.colSpan = Math.max(1, this.dynamicSectionsManager.getMaxColumnCount(cfg.id));
    }
    try { if (this.webUI && typeof this.webUI.updateGroupBorders === 'function') { this.webUI.updateGroupBorders(); } } catch (_) { }
  }

  _buildRowBlueprint(countryCode) {
    const mainHeaderRow = document.querySelector('#Data thead tr:last-child');
    if (!mainHeaderRow) throw new Error('Data table header row not found');

    const baseHeaders = Array.from(mainHeaderRow.querySelectorAll('th[data-key]')).filter(h => h.style.display !== 'none');
    const sectionByAnchor = new Map();
    const sections = this.dynamicSectionsManager.getSections();
    for (let i = 0; i < sections.length; i++) {
      sectionByAnchor.set(sections[i].anchorKey, sections[i].id);
    }

    const blueprint = [];
    for (let i = 0; i < baseHeaders.length; i++) {
      const th = baseHeaders[i];
      const key = th.getAttribute('data-key');
      const sectionId = sectionByAnchor.get(key);
      if (sectionId) {
        const columns = this.dynamicSectionsManager.getColumnsFor(sectionId, { countryCode });
        blueprint.push({ type: 'section', sectionId, columns });
      } else {
        blueprint.push({
          type: 'key',
          key,
          label: th.textContent,
          tooltip: th.getAttribute('data-tooltip') || th.getAttribute('title') || null
        });
      }
    }
    return blueprint;
  }

  _computeGroupBoundarySet(blueprint) {
    const isIncome = (k) => k && k.indexOf('Income') === 0;
    const isAsset = (k) => k && (k === 'PensionFund' || k === 'Cash' || k === 'RealEstateCapital' ||
      k.indexOf('Capital__') === 0);
    const isDeduction = (k) => k && (k === 'PensionContribution' || k.indexOf('Tax__') === 0);

    let yearIdx = -1;
    let incomeLastIdx = -1;
    let expensesIdx = -1;
    let assetsLastIdx = -1;
    let deductionsLastIdx = -1;

    const considerKey = (key, idx) => {
      if (key === 'Year') yearIdx = idx;
      if (key === 'Expenses') expensesIdx = idx;
      if (isIncome(key)) incomeLastIdx = idx;
      if (isDeduction(key)) deductionsLastIdx = idx;
      if (isAsset(key)) assetsLastIdx = idx;
    };

    for (let i = 0; i < blueprint.length; i++) {
      const seg = blueprint[i];
      if (seg.type === 'key') {
        considerKey(seg.key, i);
      } else if (seg.type === 'section') {
        const cols = seg.columns || [];
        if (seg.sectionId === 'deductions') deductionsLastIdx = i;
        for (let c = 0; c < cols.length; c++) {
          considerKey(cols[c].key, i);
        }
      }
    }

    const lastIdx = blueprint.length - 1;
    return new Set([yearIdx, incomeLastIdx, deductionsLastIdx, expensesIdx, assetsLastIdx, lastIdx].filter(i => i >= 0));
  }

  _applyPeriodZeroHideToDynamicSections(tbody) {
    const sections = this.dynamicSectionsManager.getSections();
    if (sections.length === 0) return;

    const periods = [];
    let current = null;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.classList && row.classList.contains('tax-header')) {
        current = { headerRow: row, dataRows: [] };
        periods.push(current);
        continue;
      }
      if (current) current.dataRows.push(row);
    }

    for (let s = 0; s < sections.length; s++) {
      const cfg = sections[s];
      if (cfg && cfg.enableVisibilityEngine) continue; // migrated section owns its own visibility
      const zeroHideCfg = cfg.zeroHide || {};
      const explicitKeys = Array.isArray(zeroHideCfg.keys) ? zeroHideCfg.keys.slice() : [];
      if (Array.isArray(cfg.periodZeroHideKeys)) {
        explicitKeys.push(...cfg.periodZeroHideKeys);
      }
      const prefixList = zeroHideCfg.keyPrefixes || zeroHideCfg.hideZeroKeysPrefix || [];
      const matcher = (typeof zeroHideCfg.matcher === 'function') ? zeroHideCfg.matcher : null;
      const hasPrefixRule = Array.isArray(prefixList) && prefixList.length > 0;
      if (!explicitKeys.length && !hasPrefixRule && !matcher) continue;

      const sectionId = cfg.id;
      const containerSelector = `.dynamic-section-container[data-section="${sectionId}"]`;

      for (let p = 0; p < periods.length; p++) {
        const period = periods[p];
        const headerContainer = period.headerRow.querySelector(`th${containerSelector}`);
        if (!headerContainer) continue;

        const headerCells = Array.from(headerContainer.querySelectorAll('.dynamic-section-cell[data-key]'));
        const keysToCheck = new Set();
        for (let h = 0; h < headerCells.length; h++) {
          const key = headerCells[h].getAttribute('data-key');
          if (!key) continue;
          if (headerCells[h].style && headerCells[h].style.display === 'none') continue;
          if (explicitKeys.indexOf(key) !== -1) { keysToCheck.add(key); continue; }
          if (hasPrefixRule && prefixList.some(pref => key.indexOf(pref) === 0)) { keysToCheck.add(key); continue; }
          if (matcher) {
            try { if (matcher(key)) { keysToCheck.add(key); continue; } } catch (_) { }
          }
        }

        keysToCheck.forEach((key) => {
          const headerCell = headerContainer.querySelector(`.dynamic-section-cell[data-key="${key}"]`);
          if (!headerCell) return;

          let anyNonZero = false;
          for (let r = 0; r < period.dataRows.length; r++) {
            const row = period.dataRows[r];
            const container = row.querySelector(`td${containerSelector}`);
            if (!container) continue;
            const cell = container.querySelector(`.dynamic-section-cell[data-key="${key}"]`);
            if (!cell) continue;
            const raw = cell.getAttribute('data-nominal-value');
            const v = raw ? parseFloat(raw) : 0;
            if (isFinite(v) && v !== 0) { anyNonZero = true; break; }
          }

          const display = anyNonZero ? '' : 'none';
          try { headerCell.style.display = display; } catch (_) { }
          for (let r = 0; r < period.dataRows.length; r++) {
            const row = period.dataRows[r];
            const container = row.querySelector(`td${containerSelector}`);
            if (!container) continue;
            const cell = container.querySelector(`.dynamic-section-cell[data-key="${key}"]`);
            if (!cell) continue;
            try { cell.style.display = display; } catch (_) { }
          }
        });
      }
    }
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

    const blueprint = this._buildRowBlueprint(country);
    const boundarySet = this._computeGroupBoundarySet(blueprint);

    for (let i = 0; i < blueprint.length; i++) {
      const seg = blueprint[i];

      if (seg.type === 'section') {
        const sectionId = seg.sectionId;
        const columns = seg.columns || [];
        const maxCols = Math.max(1, this.dynamicSectionsManager.getMaxColumnCount(sectionId));
        const cfg = this.dynamicSectionsManager.getSectionConfig(sectionId);

        const sectionContainerCell = document.createElement('th');
        sectionContainerCell.className = 'dynamic-section-container';
        sectionContainerCell.setAttribute('data-section', sectionId);
        sectionContainerCell.colSpan = maxCols;
        const applyBoundaryBorder = boundarySet.has(i) && (!cfg || cfg.isGroupBoundary !== false);
        if (applyBoundaryBorder) {
          sectionContainerCell.setAttribute('data-group-end', '1');
          sectionContainerCell.style.borderRight = '3px solid #666';
        }

        const sectionFlexDiv = document.createElement('div');
        sectionFlexDiv.className = 'dynamic-section-flex';
        sectionContainerCell.appendChild(sectionFlexDiv);

        for (let c = 0; c < columns.length; c++) {
          const def = columns[c];
          const flexItem = document.createElement('div');
          flexItem.className = 'dynamic-section-cell';
          flexItem.setAttribute('data-key', def.key);
          flexItem.textContent = def.label;
          if (def.tooltip) {
            TooltipUtils.attachTooltip(flexItem, def.tooltip, { hoverDelay: 300, touchDelay: 400 });
          }
          sectionFlexDiv.appendChild(flexItem);
        }

        headerRow.appendChild(sectionContainerCell);
      } else {
        const cell = document.createElement('th');
        cell.textContent = seg.label;
        if (seg.key) cell.setAttribute('data-key', seg.key);

        if (boundarySet.has(i)) {
          cell.setAttribute('data-group-end', '1');
          cell.style.borderRight = '3px solid #666';
        }

        if (seg.tooltip) {
          TooltipUtils.attachTooltip(cell, seg.tooltip, { hoverDelay: 300, touchDelay: 400 });
        }

        headerRow.appendChild(cell);
      }
    }

    return headerRow;
  }

  /**
   * Pre-simulation empty-state layout for dynamic (flexbox) section headers.
   * When the table has no data rows yet, DynamicSectionManager.finalizeSectionWidths()
   * hasn't run, so flex items have no explicit widths and can bunch up visually.
   *
   * finalizeSectionWidths() will override these styles once real data exists.
   *
   * @param {HTMLTableRowElement} headerRow
   */
  _applyEmptyStateFlexLayoutToDynamicSectionHeaderRow(headerRow) {
    if (!headerRow) return;

    const containers = Array.from(headerRow.querySelectorAll('th.dynamic-section-container'));
    if (containers.length === 0) return;

    containers.forEach((container) => {
      const sectionId = container.getAttribute('data-section');
      const sectionCfg = this.dynamicSectionsManager.getSectionConfig(sectionId);
      const emptyState = (sectionCfg && sectionCfg.emptyState) ? sectionCfg.emptyState : {};
      const minWidthByKey = emptyState.minWidthByKey || {};
      const minWeightAvgFactorByKey = emptyState.minWeightAvgFactorByKey || {};

      const flex = container.querySelector('.dynamic-section-flex');
      if (!flex) return;

      const cells = Array.from(flex.querySelectorAll('.dynamic-section-cell')).filter((cell) => {
        const disp = (cell && cell.style) ? cell.style.display : '';
        return disp !== 'none';
      });
      if (cells.length === 0) return;

      const weights = [];
      const labelWidths = [];
      for (let i = 0; i < cells.length; i++) {
        const w = cells[i].scrollWidth || 0;
        weights.push(Math.max(1, Math.round(w)));
        labelWidths.push(w);
      }

      let avgWeight = 0;
      for (let i = 0; i < weights.length; i++) avgWeight += weights[i];
      avgWeight = weights.length ? (avgWeight / weights.length) : 0;

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const key = cell.getAttribute('data-key');
        let weight = weights[i] || 1;

        const factor = minWeightAvgFactorByKey[key];
        if (factor && avgWeight) {
          weight = Math.max(weight, Math.round(avgWeight * factor));
        }

        try { cell.style.width = ''; } catch (_) { }

        const minWidthPolicy = minWidthByKey[key];
        if (minWidthPolicy === 'label') {
          const labelWidth = labelWidths[i] || 0;
          try { cell.style.minWidth = labelWidth ? `${labelWidth}px` : '0px'; } catch (_) { }
        } else {
          try { cell.style.minWidth = '0px'; } catch (_) { }
        }

        try { cell.style.flexGrow = String(weight); } catch (_) { }
        try { cell.style.flexShrink = '1'; } catch (_) { }
        try { cell.style.flexBasis = '0px'; } catch (_) { }
        try { cell.style.overflow = 'hidden'; } catch (_) { }
        try { cell.style.textOverflow = 'ellipsis'; } catch (_) { }
      }
    });
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
