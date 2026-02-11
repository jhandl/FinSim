class EventsTableManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.eventRowCounter = 0;
    this.ageYearMode = 'age'; // Track current toggle mode
    this.viewMode = 'table'; // Track current view mode (table/accordion)
    this.tooltipElement = null; // Reference to current tooltip
    this.tooltipTimeout = null; // Reference to tooltip delay timeout
    this._detectorTimeout = null; // For debouncing detector calls
    this._lastDetectorRun = 0; // Timestamp of last detector run (for throttling)
    this._mvAgesByRowId = {};
    this._mvAgeShiftByMarkerId = {};
    this.setupAddEventButton();
    this.setupEventTableRowDelete();
    this.setupEventTypeChangeHandler();
    this.setupSimulationModeChangeHandler();
    this.setupViewToggle();
    this.setupAgeYearToggle();
    this.setupTooltipHandlers();
    this.sortColumn = null;
    this.sortDir = null;
    this.sortKeys = [];
    this.setupColumnSortHandlers();
    this.setupAutoSortOnBlur();
    // Restore saved sort (if any) before initial apply
    this.restoreSavedSort();
    // Apply initial sort after DOM settles
    setTimeout(() => this.applySort(), 0);
    this.initializeCarets();
    // Check for empty state on initial load
    setTimeout(() => this.checkEmptyState(), 0);
    setTimeout(() => this._captureRelocationAges(), 0);

    /* NEW: Apply saved preferences (view mode + age/year mode) & defaults */
    setTimeout(() => this._applySavedPreferences(), 0);
  }

  /**
   * Attach tooltip to Part 2 suggestion input explaining PPP vs FX basis.
   */
  attachSplitTooltip(rootEl) {
    const container = rootEl.closest('.resolution-panel-container') || rootEl.querySelector('.resolution-panel-container') || rootEl;
    if (!container) return;
    const input = container.querySelector('.part2-amount-input');
    if (!input || typeof TooltipUtils === 'undefined' || !TooltipUtils.attachTooltip) return;

    const baseAmt = container.getAttribute('data-base-amount');
    const fromCur = container.getAttribute('data-from-currency') || '';
    const toCur = container.getAttribute('data-to-currency') || '';
    const fxStr = container.getAttribute('data-fx');
    const fxAmtStr = container.getAttribute('data-fx-amount');
    const fxDate = container.getAttribute('data-fx-date');
    const pppStr = container.getAttribute('data-ppp');
    const pppAmtStr = container.getAttribute('data-ppp-amount');

    function getSymbolAndLocale(countryCode) {
      try {
        const rs = Config.getInstance().getCachedTaxRuleSet(countryCode);
        const ls = (FormatUtils && typeof FormatUtils.getLocaleSettings === 'function') ? FormatUtils.getLocaleSettings() : { numberLocale: 'en-US', currencySymbol: '' };
        return {
          symbol: rs && typeof rs.getCurrencySymbol === 'function' ? rs.getCurrencySymbol() : (ls.currencySymbol || ''),
          locale: rs && typeof rs.getNumberLocale === 'function' ? rs.getNumberLocale() : (ls.numberLocale || 'en-US')
        };
      } catch (_) {
        const ls = (FormatUtils && typeof FormatUtils.getLocaleSettings === 'function') ? FormatUtils.getLocaleSettings() : { numberLocale: 'en-US', currencySymbol: '' };
        return { symbol: ls.currencySymbol || '', locale: ls.numberLocale || 'en-US' };
      }
    }

    function fmtWithSymbol(symbol, locale, value) {
      if (value == null || value === '' || isNaN(Number(value))) return '';
      const num = Number(value);
      try {
        const formatted = new Intl.NumberFormat(locale || 'en-US', { style: 'decimal', maximumFractionDigits: 0 }).format(num);
        return `${symbol || ''}${formatted}`;
      } catch (_) {
        return `${symbol || ''}${String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
      }
    }

    const provider = () => {
      const fromCountry = container.getAttribute('data-from-country');
      const toCountry = container.getAttribute('data-to-country');
      const fromMeta = getSymbolAndLocale(fromCountry);
      const toMeta = getSymbolAndLocale(toCountry);

      const fxAmt = fmtWithSymbol(toMeta.symbol, toMeta.locale, fxAmtStr);
      const pppAmt = fmtWithSymbol(toMeta.symbol, toMeta.locale, pppAmtStr);
      const amtBase = fmtWithSymbol(fromMeta.symbol, fromMeta.locale, baseAmt);
      const fxD = fxDate ? new Date(fxDate).toISOString().substring(0, 10) : 'latest';
      return `${amtBase} in ${toCur} is ${fxAmt} as of ${fxD}.\nAdjusting for purchasing power it's ≈ ${pppAmt}.`;
    };

    TooltipUtils.attachTooltip(input, provider, { hoverDelay: 300, touchDelay: 400, showOnFocus: true, persistWhileFocused: true, hideOnWizard: true });
  }

  /**
   * NEW: Apply saved view/age-year preferences from localStorage.
   * - viewMode key: 'viewMode' (values: 'table' | 'accordion')
   * - ageYearMode key: 'ageYearMode' (values: 'age' | 'year')
   *
   * Defaults when nothing is stored:
   *   • viewMode -> 'accordion' on mobile devices, otherwise 'table'
   *   • ageYearMode -> 'age'
   */
  _applySavedPreferences() {
    try {
      // Skip until Config is initialized to avoid early calls into Config-dependent code (e.g., relocation labels)
      Config.getInstance();
      // Retrieve stored preferences
      const storedView = localStorage.getItem('viewMode');
      const storedAgeYear = localStorage.getItem('ageYearMode');

      // Determine preferred view mode
      let preferredView = storedView;
      if (!preferredView) {
        // Default: accordion for mobile, table for desktop
        preferredView = (typeof DeviceUtils !== 'undefined' && DeviceUtils.isMobile()) ? 'accordion' : 'table';
      }

      // Determine preferred age/year mode (default = age)
      const preferredAgeYear = (storedAgeYear === 'year') ? 'year' : 'age';

      // Apply view preference if different
      if (preferredView !== this.viewMode) {
        this.handleViewToggle(preferredView);
      }

      // Apply age/year preference if different
      if (preferredAgeYear !== this.ageYearMode) {
        this.handleAgeYearToggle(preferredAgeYear);
      }

      // Ensure accordion manager (once created) is synced with age/year mode
      setTimeout(() => {
        if (this.webUI.eventAccordionManager) {
          this.webUI.eventAccordionManager.updateAgeYearMode(this.ageYearMode);
        }
      }, 0);
    } catch (err) {
      console.warn('Failed to apply saved preferences:', err);
    }
  }

  setupAddEventButton() {
    const addEventButton = document.getElementById('addEventRow');
    if (addEventButton) {
      addEventButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleAddEventClick();
      });

      // NEW: Set initial icon state based on wizard toggle
      this.updateAddEventButtonIcons();

      // NEW: Listen for wizard toggle changes to update icon dynamically
      window.addEventListener('eventsWizardToggle', (ev) => {
        const enabled = ev?.detail?.enabled;
        this.updateAddEventButtonIcons(enabled);
      });
    }
  }

  /**
   * Handle Add Event button click - either show wizard or add empty event based on toggle state
   */
  handleAddEventClick() {
    // Check if Events Wizard toggle is enabled
    const eventsWizardEnabled = this.isEventsWizardEnabled();

    if (eventsWizardEnabled) {
      // Show wizard selection (will handle empty row detection internally)
      this.showWizardSelection();
    } else {
      // Check for existing empty row first
      const existingEmptyRow = this.findEmptyEventRow();
      if (existingEmptyRow) {
        // Only use focusOnEmptyRow in table mode
        if (this.viewMode !== 'accordion') {
          this.focusOnEmptyRow(existingEmptyRow);
        }
      } else {
        // Add empty event row
        this.addEventRow();
      }

      // In accordion mode, open the empty event after a delay
      if (this.viewMode === 'accordion') {
        setTimeout(() => this.openEmptyInAccordion(), 200);
      }
    }
  }

  /**
   * Check if Events Wizard is enabled via localStorage
   * @returns {boolean} True if Events Wizard is enabled
   */
  isEventsWizardEnabled() {
    const savedState = localStorage.getItem('eventsWizardState') || 'on';
    return savedState === 'on';
  }

  /**
   * Update the Add Event button icons depending on whether the Events Wizard is enabled.
   * Shows a star icon on both sides of the text when enabled.
   * @param {boolean} [wizardEnabled] – optional explicit state; falls back to localStorage lookup when omitted.
   */
  updateAddEventButtonIcons(wizardEnabled = undefined) {
    const addEventButton = document.getElementById('addEventRow');
    if (!addEventButton) return;

    const enabled = (typeof wizardEnabled === 'boolean') ? wizardEnabled : this.isEventsWizardEnabled();

    if (enabled) {
      // Show star icons on both sides of the label
      addEventButton.innerHTML = '🌟 Add Event 🌟';
      addEventButton.classList.add('wizard-active');
    } else {
      // Revert to plain label
      addEventButton.textContent = 'Add Event';
      addEventButton.classList.remove('wizard-active');
    }
  }


  setupEventTableRowDelete() {
    const eventsTable = document.getElementById('Events');
    if (eventsTable) {
      eventsTable.addEventListener('click', (e) => {
        // Check if the clicked element or its parent is the delete button
        const deleteButton = e.target.closest('.delete-event');
        if (deleteButton) {
          const row = deleteButton.closest('tr');
          if (row) {
            this.deleteTableRowWithAnimation(row);
            // Single unconditional recompute after deletion, independent of animation path
            setTimeout(() => { this.recomputeRelocationImpacts(); }, 600);
          }
        }
      });
    }
  }

  /**
   * Delete table row with smooth animation
   */
  deleteTableRowWithAnimation(row) {
    // If an inline resolution panel is open for this row, collapse it first to clean up listeners
    const maybePanel = row && row.nextElementSibling;
    if (maybePanel && maybePanel.classList && maybePanel.classList.contains('resolution-panel-row')) {
      this.collapseResolutionPanel(row.dataset.rowId);
    }

    // Check if this is the only row
    const allRows = document.querySelectorAll('#Events tbody tr');
    const isLastRow = allRows.length === 1;

    if (isLastRow) {
      // Simple fade for last row
      row.classList.add('deleting-last');
      setTimeout(() => {
        row.remove();
        // Check empty state after deletion
        this.checkEmptyState();
        // Refresh accordion if it's active
        if (this.viewMode === 'accordion' && this.webUI.eventAccordionManager) {
          this.webUI.eventAccordionManager.refresh();
        }
        // Refresh chart relocation transitions
        if (this.webUI.chartManager) {
          RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.chartManager);
          this.webUI.chartManager.setupChartCurrencyControls(this.webUI);
          this.webUI.chartManager.refreshChartsWithCurrency();
        }
        // Refresh table currency controls
        if (this.webUI.tableManager) {
          RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.tableManager);
          this.webUI.tableManager.setupTableCurrencyControls();
        }
      }, 400);
    } else {
      // Complex animation with slide-up for multiple rows
      this.deleteRowWithSlideUp(row);
    }
  }

  /**
   * Delete row with slide-up animation for remaining rows
   */
  deleteRowWithSlideUp(rowToDelete) {
    // If an inline resolution panel is open for this row, collapse it first to clean up listeners
    const maybePanel = rowToDelete && rowToDelete.nextElementSibling;
    if (maybePanel && maybePanel.classList && maybePanel.classList.contains('resolution-panel-row')) {
      this.collapseResolutionPanel(rowToDelete.dataset.rowId);
    }

    const allRows = Array.from(document.querySelectorAll('#Events tbody tr'));
    const deleteIndex = allRows.indexOf(rowToDelete);
    const rowsBelow = allRows.slice(deleteIndex + 1);
    const isLastRowAfterDelete = allRows.length <= 1;

    // Get the height of the row being deleted (including borders/padding)
    const deletedRowHeight = rowToDelete.offsetHeight;

    // Phase 1: Fade out the row being deleted
    rowToDelete.classList.add('deleting-fade');

    setTimeout(() => {
      // Phase 2: Remove the row first, then slide up the rows below
      rowToDelete.remove();

      // If this was the last row, show empty state message
      if (isLastRowAfterDelete) {
        this.checkEmptyState();
      }

      // Now animate the rows below sliding up
      rowsBelow.forEach(row => {
        // Start them displaced down by the deleted row height
        row.style.transform = `translateY(${deletedRowHeight}px)`;
        row.style.transition = 'none'; // No transition for initial position
      });

      // Force a reflow to ensure the initial position is applied
      rowsBelow[0]?.offsetHeight;

      // Now animate them back to their natural position
      rowsBelow.forEach(row => {
        row.style.transition = 'transform 0.3s ease-out';
        row.style.transform = 'translateY(0)';
      });

      // Clean up after animation completes
      setTimeout(() => {
        rowsBelow.forEach(row => {
          row.style.transform = '';
          row.style.transition = '';
        });

        // Refresh accordion if it's active
        if (this.viewMode === 'accordion' && this.webUI.eventAccordionManager) {
          this.webUI.eventAccordionManager.refresh();
        }
        // Refresh chart relocation transitions
        if (this.webUI.chartManager) {
          RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.chartManager);
          this.webUI.chartManager.setupChartCurrencyControls(this.webUI);
          this.webUI.chartManager.refreshChartsWithCurrency();
        }
        // Refresh table currency controls
        if (this.webUI.tableManager) {
          RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.tableManager);
          this.webUI.tableManager.setupTableCurrencyControls();
        }

      }, 300); // Wait for slide animation to complete
    }, 200); // Wait for fade to complete
  }

  // Single recomputation call used post-deletion regardless of row position/animation path
  recomputeRelocationImpacts() {
    const cfg = (typeof Config !== 'undefined' && Config.getInstance) ? Config.getInstance() : null;
    if (!cfg || !cfg.isRelocationEnabled || !cfg.isRelocationEnabled()) return;
    const events = this.webUI.readEvents(false);
    const startCountry = Config.getInstance().getStartCountry();

    // Gather investment context from simulator if available
    var investmentContext = null;
    if (typeof Simulator !== 'undefined' && Simulator.getInvestmentContext) {
      investmentContext = Simulator.getInvestmentContext();
    }

    if (typeof RelocationImpactDetector !== 'undefined') {
      RelocationImpactDetector.analyzeEvents(events, startCountry, investmentContext);
    }
    this.updateRelocationImpactIndicators(events);
    this.webUI.updateStatusForRelocationImpacts(events);
    // Ensure accordion view reflects latest table state
    if (this.webUI.eventAccordionManager) this.webUI.eventAccordionManager.refresh();
  }

  setupEventTypeChangeHandler() {
    const eventsTable = document.getElementById('Events');
    if (eventsTable) {
      eventsTable.addEventListener('change', (e) => {
        if (e.target.classList.contains('event-from-age')) {
          const row = e.target.closest('tr');
          const typeInput = row ? row.querySelector('.event-type') : null;
          const typeValue = typeInput ? typeInput.value : '';
          if (typeValue && typeValue.indexOf('MV-') === 0) {
            const rowKey = row && row.dataset ? (row.dataset.rowId || row.dataset.eventId || '') : '';
            const cachedOldAge = Number(rowKey ? this._mvAgesByRowId[rowKey] : NaN);
            const focusedOldAge = Number(e.target.dataset ? e.target.dataset.mvPrevAge : NaN);
            const newAge = Number(e.target.value);
            const oldAge = !isNaN(focusedOldAge) ? focusedOldAge : cachedOldAge;
            if (!isNaN(oldAge) && !isNaN(newAge) && oldAge !== newAge) {
              this._recordRelocationAgeShiftForRow(row, oldAge, newAge);
            }
            if (rowKey && !isNaN(newAge)) this._mvAgesByRowId[rowKey] = newAge;
            if (!isNaN(newAge) && e.target.dataset) e.target.dataset.mvPrevAge = String(newAge);
            // No auto-adjustment when relocation age changes.
            // Split/sold events are flagged for explicit resolution.
          }
        }

        if (e.target.classList.contains('event-to-age')) {
          const row = e.target.closest('tr');
          const typeInput = row ? row.querySelector('.event-type') : null;
          const typeValue = typeInput ? typeInput.value : '';
          if ((typeValue === 'R' || typeValue === 'M') && !this._suppressSellMarkerClear) {
            this._applyToRealEstatePair(row, (pairRow) => {
              this._removeHiddenInput(pairRow, 'event-relocation-sell-mv-id');
              this._removeHiddenInput(pairRow, 'event-relocation-sell-anchor-age');
            });
          }
        }
        // Always re-analyze on any change to table inputs
        this._scheduleRelocationReanalysis();

        if (e.target.classList.contains('event-type')) {
          const row = e.target.closest('tr');
          if (row) {
            // Update the stored original type to the new user selection
            const oldType = row.dataset.originalEventType || '';
            const newType = e.target.value || '';
            row.dataset.originalEventType = newType;
            // If event type changed to/from MV- relocation, update currency selector
            const isOldRelocation = oldType && oldType.indexOf('MV-') === 0;
            const isNewRelocation = newType && newType.indexOf('MV-') === 0;
            const rowKey = row && row.dataset ? (row.dataset.rowId || row.dataset.eventId || '') : '';
            if (isNewRelocation) {
              this._getOrCreateRelocationLinkId(row);
              const fromAgeInput = row.querySelector('.event-from-age');
              const fromAge = Number(fromAgeInput ? fromAgeInput.value : '');
              if (rowKey && !isNaN(fromAge)) this._mvAgesByRowId[rowKey] = fromAge;
            } else if (rowKey && this._mvAgesByRowId[rowKey] !== undefined) {
              delete this._mvAgesByRowId[rowKey];
            }
            if (isOldRelocation !== isNewRelocation) {
              if (Config.getInstance().isRelocationEnabled()) {
                if (this.webUI.chartManager) {
                  RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.chartManager);
                  this.webUI.chartManager.setupChartCurrencyControls(this.webUI);
                }
                if (this.webUI.tableManager) {
                  RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.tableManager);
                  this.webUI.tableManager.setupTableCurrencyControls();
                }
              }
            }
          }
          this.updateFieldVisibility(e.target);
          this.updateWizardIconsVisibility(row);
        }
      });

      // Also listen for input changes on all event fields to update wizard icons
      eventsTable.addEventListener('focusin', (e) => {
        if (!e.target.classList.contains('event-from-age')) return;
        const row = e.target.closest('tr');
        const typeInput = row ? row.querySelector('.event-type') : null;
        const typeValue = typeInput ? typeInput.value : '';
        if (typeValue && typeValue.indexOf('MV-') === 0) {
          e.target.dataset.mvPrevAge = e.target.value;
        }
      });

      eventsTable.addEventListener('input', (e) => {
        if (e.target.matches('.event-name, .event-amount, .event-from-age, .event-to-age, .event-rate, .event-match')) {
          const row = e.target.closest('tr');
          if (row) {
            this.updateWizardIconsVisibility(row);
          }
        }
        // Re-analyze (debounced) after input changes
        this._scheduleRelocationReanalysis();
      });
    }
  }

  _scheduleRelocationReanalysis() {
    const cfg = (typeof Config !== 'undefined' && Config.getInstance) ? Config.getInstance() : null;
    if (!cfg || !cfg.isRelocationEnabled || !cfg.isRelocationEnabled()) return;
    // Debounce
    if (this._detectorTimeout) clearTimeout(this._detectorTimeout);
    this._detectorTimeout = setTimeout(() => {
      try {
        var events = this.webUI.readEvents(false);
        var startCountry = Config.getInstance().getStartCountry();

        // Gather investment context from simulator if available
        var investmentContext = null;
        if (typeof Simulator !== 'undefined' && Simulator.getInvestmentContext) {
          investmentContext = Simulator.getInvestmentContext();
        }

        if (typeof RelocationImpactDetector !== 'undefined') {
          RelocationImpactDetector.analyzeEvents(events, startCountry, investmentContext);
        }
        this.updateRelocationImpactIndicators(events);
        this.webUI.updateStatusForRelocationImpacts(events);
        // Keep charts in sync with relocation changes (country timeline + markers)
        if (this.webUI && this.webUI.chartManager) {
          RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.chartManager);
          this.webUI.chartManager.setupChartCurrencyControls(this.webUI);
          this.webUI.chartManager.refreshChartsWithCurrency();
        }
        // Refresh table currency controls
        if (this.webUI && this.webUI.tableManager) {
          RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.tableManager);
          this.webUI.tableManager.setupTableCurrencyControls();
        }
        // Intentionally avoid refreshing the accordion here to preserve focus/expansion after edit + outside click.
        // Accordion will refresh through explicit actions (sorting, deletions, wizard actions) and on initial load.
      } catch (err) {
        console.error('Error analyzing relocation impacts:', err);
      }
    }, 400);
  }

  _removeHiddenInput(row, className) {
    if (!row || !className) return;
    const input = row.querySelector('.' + className);
    if (input && input.parentNode) input.remove();
  }

  _captureRelocationAges() {
    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const typeInput = row.querySelector('.event-type');
      const typeValue = typeInput ? String(typeInput.value || '') : '';
      if (!typeValue || typeValue.indexOf('MV-') !== 0) continue;
      const fromAgeInput = row.querySelector('.event-from-age');
      const fromAge = Number(fromAgeInput ? fromAgeInput.value : '');
      if (isNaN(fromAge)) continue;
      const rowKey = row && row.dataset ? (row.dataset.rowId || row.dataset.eventId || '') : '';
      if (!rowKey) continue;
      this._mvAgesByRowId[rowKey] = fromAge;
    }
  }

  _recordRelocationAgeShiftForRow(row, oldAge, newAge) {
    if (!row) return;
    if (isNaN(oldAge) || isNaN(newAge) || oldAge === newAge) return;
    const delta = newAge - oldAge;
    if (!delta) return;
    const markerIds = this._getRelocationMarkerIdsForRow(row);
    for (let i = 0; i < markerIds.length; i++) {
      const key = String(markerIds[i] || '');
      if (!key) continue;
      const prev = Number(this._mvAgeShiftByMarkerId[key] || 0);
      this._mvAgeShiftByMarkerId[key] = prev + delta;
    }
  }

  _consumeRelocationAgeShift(markerIds) {
    if (!markerIds || !markerIds.length) return null;
    let foundValue = null;
    for (let i = 0; i < markerIds.length; i++) {
      const key = String(markerIds[i] || '');
      if (!key) continue;
      if (this._mvAgeShiftByMarkerId[key] === undefined) continue;
      const value = Number(this._mvAgeShiftByMarkerId[key]);
      if (foundValue === null && !isNaN(value)) foundValue = value;
      delete this._mvAgeShiftByMarkerId[key];
    }
    return foundValue;
  }

  _clearRelocationAgeShift(markerIds) {
    if (!markerIds || !markerIds.length) return;
    for (let i = 0; i < markerIds.length; i++) {
      const key = String(markerIds[i] || '');
      if (!key) continue;
      delete this._mvAgeShiftByMarkerId[key];
    }
  }

  _clearLinkedSplitMarker(row) {
    if (!row) return;
    const linkedInput = row.querySelector('.event-linked-event-id');
    const linkedId = linkedInput ? String(linkedInput.value || '') : '';
    if (!linkedId) return;

    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    for (let i = 0; i < rows.length; i++) {
      const chainInput = rows[i].querySelector('.event-linked-event-id');
      const chainId = chainInput ? String(chainInput.value || '') : '';
      if (chainId !== linkedId) continue;
      this._removeHiddenInput(rows[i], 'event-linked-event-id');
      this._removeHiddenInput(rows[i], 'event-relocation-split-mv-id');
    }
  }

  _getRelocationMarkerIdsForRow(row) {
    if (!row) return [];
    const ids = [];
    const linkId = this._getOrCreateRelocationLinkId(row);
    if (linkId) ids.push(String(linkId));
    const nameInput = row.querySelector('.event-name');
    const rowName = nameInput ? String(nameInput.value || '') : '';
    if (rowName) ids.push(rowName);
    const runtimeId = row && row.dataset ? String(row.dataset.eventId || '') : '';
    if (runtimeId) ids.push(runtimeId);
    return Array.from(new Set(ids));
  }

  _getOrCreateRelocationLinkId(row) {
    if (!row) return '';
    const existing = row.querySelector('.event-relocation-link-id');
    if (existing && existing.value) return String(existing.value);
    const linkId = 'mvlink_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    this.getOrCreateHiddenInput(row, 'event-relocation-link-id', linkId);
    return linkId;
  }

  _getRelocationLinkIdByImpactId(mvImpactId) {
    const needle = String(mvImpactId || '');
    if (!needle) return '';
    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));

    // Runtime row ids are stable and unique; prefer them to names.
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const typeInput = row.querySelector('.event-type');
      const typeValue = typeInput ? String(typeInput.value || '') : '';
      if (!typeValue || typeValue.indexOf('MV-') !== 0) continue;
      const rowRuntimeId = row && row.dataset ? String(row.dataset.eventId || '') : '';
      if (rowRuntimeId === needle) return this._getOrCreateRelocationLinkId(row);
    }

    // Name fallback is only safe when exactly one MV row has that name.
    let nameMatch = null;
    let nameMatches = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const typeInput = row.querySelector('.event-type');
      const typeValue = typeInput ? String(typeInput.value || '') : '';
      if (!typeValue || typeValue.indexOf('MV-') !== 0) continue;
      const nameInput = row.querySelector('.event-name');
      const rowName = nameInput ? String(nameInput.value || '') : '';
      if (rowName === needle) {
        nameMatches++;
        nameMatch = row;
      }
    }
    return (nameMatches === 1 && nameMatch) ? this._getOrCreateRelocationLinkId(nameMatch) : '';
  }

  _removeRowAndResolutionPanel(row) {
    if (!row) return;
    const next = row.nextElementSibling;
    if (next && next.classList && next.classList.contains('resolution-panel-row')) next.remove();
    row.remove();
  }

  _syncSplitChainsForRelocationAgeShift(oldAge, newAge) {
    if (isNaN(oldAge) || isNaN(newAge) || oldAge === newAge) return;

    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    const chains = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const linkedInput = row.querySelector('.event-linked-event-id');
      const linkedId = linkedInput ? String(linkedInput.value || '') : '';
      if (!linkedId) continue;
      if (!chains[linkedId]) chains[linkedId] = [];
      chains[linkedId].push(row);
    }

    const chainIds = Object.keys(chains);
    for (let i = 0; i < chainIds.length; i++) {
      const splitRows = chains[chainIds[i]];
      if (!splitRows || splitRows.length !== 2) continue;

      splitRows.sort((a, b) => {
        const aFrom = Number(a.querySelector('.event-from-age') ? a.querySelector('.event-from-age').value : '');
        const bFrom = Number(b.querySelector('.event-from-age') ? b.querySelector('.event-from-age').value : '');
        if (aFrom !== bFrom) return aFrom - bFrom;
        const aTo = Number(a.querySelector('.event-to-age') ? a.querySelector('.event-to-age').value : '');
        const bTo = Number(b.querySelector('.event-to-age') ? b.querySelector('.event-to-age').value : '');
        return aTo - bTo;
      });

      const firstRow = splitRows[0];
      const secondRow = splitRows[1];
      const firstFromInput = firstRow.querySelector('.event-from-age');
      const firstToInput = firstRow.querySelector('.event-to-age');
      const secondFromInput = secondRow.querySelector('.event-from-age');
      const secondToInput = secondRow.querySelector('.event-to-age');
      if (!firstFromInput || !firstToInput || !secondFromInput || !secondToInput) continue;

      const firstFrom = Number(firstFromInput.value);
      const firstTo = Number(firstToInput.value);
      const secondFrom = Number(secondFromInput.value);
      const secondTo = Number(secondToInput.value);
      if (isNaN(firstFrom) || isNaN(firstTo) || isNaN(secondFrom) || isNaN(secondTo)) continue;

      const matchesOldBoundary = (secondFrom === oldAge) || (firstTo === oldAge) || (firstTo + 1 === oldAge);
      if (!matchesOldBoundary) continue;

      const isOverlappingBoundary = (firstTo === secondFrom);
      const nextPart1To = isOverlappingBoundary ? newAge : (newAge - 1);

      // Relocation moved before the split range: keep destination-side row only.
      if (nextPart1To < firstFrom) {
        secondFromInput.value = String(firstFrom);
        this._removeHiddenInput(secondRow, 'event-linked-event-id');
        this._removeHiddenInput(secondRow, 'event-relocation-split-mv-id');
        this._removeRowAndResolutionPanel(firstRow);
        continue;
      }

      // Relocation moved after the split range: keep origin-side row only.
      if (newAge > secondTo) {
        firstToInput.value = String(secondTo);
        this._removeHiddenInput(firstRow, 'event-linked-event-id');
        this._removeHiddenInput(firstRow, 'event-relocation-split-mv-id');
        this._removeRowAndResolutionPanel(secondRow);
        continue;
      }

      firstToInput.value = String(nextPart1To);
      secondFromInput.value = String(newAge);
    }
  }

  _syncSoldRealEstateForRelocationAgeShift(newAge, mvImpactIds) {
    if (isNaN(newAge)) return;
    if (!mvImpactIds || mvImpactIds.length === 0) return;

    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    const cutoffAge = newAge - 1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const markerInput = row.querySelector('.event-relocation-sell-mv-id');
      const markerValue = markerInput ? String(markerInput.value || '') : '';
      if (!markerValue || mvImpactIds.indexOf(markerValue) === -1) continue;

      const typeInput = row.querySelector('.event-type');
      const typeValue = typeInput ? typeInput.value : '';
      if (typeValue !== 'R' && typeValue !== 'M') continue;

      const fromAgeInput = row.querySelector('.event-from-age');
      const fromAge = Number(fromAgeInput ? fromAgeInput.value : '');
      if (!isNaN(fromAge) && cutoffAge < fromAge) {
        this._removeHiddenInput(row, 'event-relocation-sell-mv-id');
        continue;
      }

      const toAgeInput = row.querySelector('.event-to-age');
      if (!toAgeInput) continue;
      this._suppressSellMarkerClear = true;
      toAgeInput.value = String(cutoffAge);
      toAgeInput.dispatchEvent(new Event('change', { bubbles: true }));
      this._suppressSellMarkerClear = false;
    }
  }

  setupSimulationModeChangeHandler() {
    const simulationModeSelect = document.getElementById('simulation_mode');
    if (simulationModeSelect) {
      simulationModeSelect.addEventListener('change', () => {
        this.updateEventRowsVisibilityAndTypes();
      });
      setTimeout(() => this.updateEventRowsVisibilityAndTypes(), 0);
    }
  }

  setupViewToggle() {
    const tableToggle = document.getElementById('viewModeTable');
    const accordionToggle = document.getElementById('viewModeAccordion');

    if (tableToggle) {
      tableToggle.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleViewToggle('table');
      });
    }

    if (accordionToggle) {
      accordionToggle.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleViewToggle('accordion');
      });
    }

    // Attach tooltips to view toggles
    if (typeof TooltipUtils !== 'undefined') {
      if (tableToggle) {
        TooltipUtils.attachTooltip(tableToggle, "Table view is ideal for larger screens and when you know your way around these events.");
      }
      if (accordionToggle) {
        TooltipUtils.attachTooltip(accordionToggle, "Cards view is best for smaller screens and while you're learning the ropes.");
      }
    }
  }

  setupAgeYearToggle() {
    const ageToggle = document.getElementById('ageYearModeAge');
    const yearToggle = document.getElementById('ageYearModeYear');

    if (ageToggle) {
      ageToggle.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleAgeYearToggle('age');
      });
    }

    if (yearToggle) {
      yearToggle.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleAgeYearToggle('year');
      });
    }
  }

  handleViewToggle(newMode) {
    // Don't do anything if already in the requested mode
    if (this.viewMode === newMode) {
      return;
    }

    // CRITICAL FIX: Force blur on any active accordion input before switching
    if (this.viewMode === 'accordion' && newMode === 'table') {
      const activeElement = document.activeElement;
      if (activeElement && activeElement.matches('.accordion-edit-name, .accordion-edit-amount, .accordion-edit-fromage, .accordion-edit-toage, .accordion-edit-rate, .accordion-edit-match')) {
        activeElement.blur();
        // Give a small delay to allow the blur event and sync to complete
        setTimeout(() => {
          this.completeViewToggle(newMode);
        }, 50);
        return;
      }
    }

    this.completeViewToggle(newMode);
  }

  completeViewToggle(newMode) {
    // Update the mode
    this.viewMode = newMode;

    // Update visual state of toggle buttons
    const tableToggle = document.getElementById('viewModeTable');
    const accordionToggle = document.getElementById('viewModeAccordion');

    if (tableToggle && accordionToggle) {
      if (newMode === 'table') {
        tableToggle.classList.add('mode-toggle-active');
        accordionToggle.classList.remove('mode-toggle-active');
      } else {
        accordionToggle.classList.add('mode-toggle-active');
        tableToggle.classList.remove('mode-toggle-active');
      }
    }

    // Switch between table and accordion views
    this.switchView(newMode);

    // NEW: Persist preference
    localStorage.setItem('viewMode', newMode);
  }

  handleAgeYearToggle(newMode) {
    // Prevent switching to "year" mode if current age has not been provided
    if (newMode === 'year') {
      const startingAgeInput = 'StartingAge';
      const startingAgeVal = parseInt(this.webUI.getValue(startingAgeInput)) || 0;

      if (startingAgeVal === 0) {
        // Inform the user and highlight the missing field
        if (typeof this.webUI.showToast === 'function') {
          this.webUI.showToast('Please enter your current age in order to switch to year mode.', 'Current Age Needed', 7);
        } else {
          alert('Please enter your current age in order to switch to year mode.');
        }

        // Highlight the missing age field so the user knows where to act
        if (typeof this.webUI.setWarning === 'function') {
          this.webUI.setWarning(startingAgeInput, 'Current age is required');
        }

        // Keep the toggle in its existing state
        return;
      }
    }
    // Don't do anything if already in the requested mode
    if (this.ageYearMode === newMode) {
      return;
    }

    // Convert existing input values before changing the mode
    this.convertExistingInputValues(this.ageYearMode, newMode);

    // Update the mode
    this.ageYearMode = newMode;

    // Update visual state of toggle buttons
    const ageToggle = document.getElementById('ageYearModeAge');
    const yearToggle = document.getElementById('ageYearModeYear');

    if (ageToggle && yearToggle) {
      if (newMode === 'age') {
        ageToggle.classList.add('mode-toggle-active');
        yearToggle.classList.remove('mode-toggle-active');
      } else {
        yearToggle.classList.add('mode-toggle-active');
        ageToggle.classList.remove('mode-toggle-active');
      }
    }

    // Update table headers
    this.updateTableHeaders();

    // Update accordion age/year mode if it exists
    if (this.webUI.eventAccordionManager) {
      this.webUI.eventAccordionManager.updateAgeYearMode(newMode);
    }

    // Clear warnings and revalidate events to ensure warning messages
    // use the correct terminology (age vs year) for the new mode
    this.webUI.clearAllWarnings();
    this.webUI.validateEvents();

    // Persist preference
    localStorage.setItem('ageYearMode', newMode);
  }

  updateTableHeaders() {
    const fromHeader = document.getElementById('fromAgeHeader');
    const toHeader = document.getElementById('toAgeHeader');

    if (fromHeader && toHeader) {
      const setText = (el, txt) => { const span = el.querySelector('.header-text'); if (span) { span.textContent = txt; } else { el.childNodes[0].textContent = txt; } };
      if (this.ageYearMode === 'age') {
        setText(fromHeader, 'From Age');
        setText(toHeader, 'To Age');
        fromHeader.classList.remove('year-mode');
        toHeader.classList.remove('year-mode');
      } else {
        setText(fromHeader, 'From Year');
        setText(toHeader, 'To Year');
        fromHeader.classList.add('year-mode');
        toHeader.classList.add('year-mode');
      }
    }
  }

  switchView(viewMode) {
    const tableContainer = document.querySelector('.events-section .table-container');
    const addEventContainer = document.querySelector('.events-section div[style*="text-align: right"]');

    if (viewMode === 'table') {
      // Show table view
      if (tableContainer) {
        tableContainer.style.display = 'block';
      }
      if (addEventContainer) {
        addEventContainer.style.display = 'block';
      }
      // Hide accordion view
      const accordionContainer = document.querySelector('.events-accordion-container');
      if (accordionContainer) {
        accordionContainer.style.display = 'none';
      }

      // Check for empty state in table view
      this.checkEmptyState();
    } else {
      // Hide table view
      if (tableContainer) {
        tableContainer.style.display = 'none';
      }
      if (addEventContainer) {
        addEventContainer.style.display = 'none';
      }
      // Show accordion view
      this.showAccordionView();
    }
  }

  showAccordionView() {
    // Show accordion view using the accordion manager
    const accordionContainer = document.querySelector('.events-accordion-container');
    if (accordionContainer) {
      accordionContainer.style.display = 'block';

      // Refresh accordion to sync with current table data
      if (this.webUI.eventAccordionManager) {
        this.webUI.eventAccordionManager.refresh();
        // Ensure accordion header sort indicators reflect current state
        if (typeof this.webUI.eventAccordionManager.updateAccordionHeaderIndicators === 'function') {
          this.webUI.eventAccordionManager.updateAccordionHeaderIndicators();
        }
      }
    }
  }

  convertExistingInputValues(currentMode, newMode) {
    const startingAge = parseInt(this.webUI.getValue('StartingAge')) || 0;
    const p2StartingAge = parseInt(this.webUI.getValue('P2StartingAge')) || 0;

    if (startingAge === 0) return;

    const currentYear = Config.getInstance().getSimulationStartYear();
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    tbody.querySelectorAll('tr').forEach(row => {
      if (row.style.display === 'none') return;

      const eventType = row.querySelector('.event-type')?.value;
      if (!eventType) return;

      const isP2Event = eventType === 'SI2' || eventType === 'SI2np';
      const relevantStartingAge = isP2Event ? p2StartingAge : startingAge;
      if (relevantStartingAge === 0) return;

      const birthYear = currentYear - relevantStartingAge;

      ['.event-from-age', '.event-to-age'].forEach(selector => {
        const input = row.querySelector(selector);
        if (!input?.value) return;

        const currentValue = parseInt(input.value);
        if (isNaN(currentValue)) return;

        if (currentMode === 'age' && newMode === 'year') {
          input.value = birthYear + currentValue;
        } else if (currentMode === 'year' && newMode === 'age') {
          input.value = currentValue - birthYear;
        }
      });
    });
  }



  updateFieldVisibility(typeSelect) {
    const row = typeSelect.closest('tr');
    const eventType = typeSelect.value;
    const required = UIManager.getRequiredFields(eventType);
    UIManager.getFields().forEach(field => {
      const colIndex = UIManager.getIndexForField(field);
      const cell = row.cells[colIndex];
      if (cell) {
        const input = cell.querySelector('input');
        if (input) {
          const isHidden = required[field] === 'hidden';
          input.style.visibility = isHidden ? 'hidden' : 'visible';

          // For percentage inputs, also hide the container with the % symbol
          const container = input.closest('.percentage-container');
          if (container) {
            container.style.visibility = isHidden ? 'hidden' : 'visible';
          }
        }
      }
    });
    const rateInput = row.querySelector('.event-rate');
    if (rateInput) {
      rateInput.placeholder = (!required || !required.rate || required.rate === 'optional') ? 'inflation' : '';
    }
  }

  updateEventRowsVisibilityAndTypes() {
    const simulationMode = this.webUI.getValue('simulation_mode');
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    tbody.querySelectorAll('tr').forEach((row) => {
      const typeInput = row.querySelector('.event-type');
      const originalEventType = row.dataset.originalEventType || (typeInput ? typeInput.value : '');

      /* Handle row visibility for P2-specific events */
      const shouldHide = simulationMode === 'single' && (originalEventType === 'SI2' || originalEventType === 'SI2np');
      row.style.display = shouldHide ? 'none' : '';

      /* Refresh dropdown options to reflect simulation mode */
      const dropdown = row._eventTypeDropdown;
      if (dropdown) {
        const baseOpts = this.getEventTypeOptionObjects();
        const curVal = typeInput.value;
        let opts = baseOpts;
        // Special-case relocation events so existing MV-* rows show correct label
        if (curVal && typeof curVal === 'string' && curVal.indexOf('MV-') === 0) {
          const code = curVal.substring(3).toLowerCase();
          const countries = Config.getInstance().getAvailableCountries();
          const match = Array.isArray(countries) ? countries.find(c => String(c.code).toLowerCase() === code) : null;
          if (match) {
            const label = match ? `→ ${match.name}` : curVal;
            const synthetic = match ? { value: curVal, label, description: `Relocation to ${match.name}` } : { value: curVal, label: curVal };
            if (!baseOpts.find(o => o.value === curVal)) {
              opts = baseOpts.concat([synthetic]);
            }
          }
        }
        dropdown.setOptions(opts);
        const curOpt = opts.find((o) => o.value === curVal)
          || opts.find((o) => o.value === 'NOP')
          || opts[0];
        const toggleEl = row.querySelector(`#EventTypeToggle_${row.dataset.rowId}`);
        if (toggleEl && curOpt) toggleEl.textContent = curOpt.label;
      }
    });
  }


  updateRelocationImpactIndicators(analyzedEvents) {
    var tbody = this.eventsTableBody || document.querySelector('#Events tbody');
    if (!tbody) return;
    // Align DOM rows with events array by considering only visible DATA rows (exclude inline panels),
    // since readEvents skips hidden rows and ignores resolution panel rows
    var rows = Array.from(tbody.querySelectorAll('tr')).filter(function (r) {
      return r && r.style.display !== 'none' && !(r.classList && r.classList.contains('resolution-panel-row'));
    });
    var events = Array.isArray(analyzedEvents) ? analyzedEvents : this.webUI.readEvents(false);

    rows.forEach((row, index) => {
      if (index >= events.length) return;
      var event = events[index];

      // Reset category-specific classes
      row.classList.remove('relocation-impact-boundary', 'relocation-impact-simple', 'relocation-impact-property', 'relocation-impact-pension');

      // NEW: Find event-type-container instead of actions cell
      var container = row.querySelector('.event-type-container');
      if (!container) return;
      var dropdown = container.querySelector('.event-type-dd');
      if (!dropdown) return;

      // Remove any existing .relocation-impact-badge from the container
      var existingBadge = container.querySelector('.relocation-impact-badge');
      if (existingBadge) existingBadge.remove();

      // Remove `has-impact-badge` class from dropdown
      dropdown.classList.remove('has-impact-badge');

      // Default: clear dataset flags
      delete row.dataset.relocationImpact;
      delete row.dataset.relocationImpactCategory;
      delete row.dataset.relocationImpactMessage;
      delete row.dataset.relocationImpactAuto;
      delete row.dataset.relocationImpactMvId;
      delete row.dataset.relocationImpactDetails;

      // Add/update indicator if event has impact
      if (event && event.relocationImpact) {
        var category = event.relocationImpact.category;

        // Persist impact data on the row for robust downstream lookups
        row.dataset.relocationImpact = '1';
        row.dataset.relocationImpactCategory = category || '';
        row.dataset.relocationImpactMessage = event.relocationImpact.message || '';
        row.dataset.relocationImpactAuto = event.relocationImpact.autoResolvable ? '1' : '0';
        // Also persist the associated MV event id to support panel rendering across views
        row.dataset.relocationImpactMvId = event.relocationImpact.mvEventId || '';
        if (event.relocationImpact.details != null) {
          var detailValue = event.relocationImpact.details;
          if (typeof detailValue === 'object') {
            try { detailValue = JSON.stringify(detailValue); } catch (_) { detailValue = ''; }
          }
          if (detailValue) {
            row.dataset.relocationImpactDetails = detailValue;
          } else {
            delete row.dataset.relocationImpactDetails;
          }
        } else {
          delete row.dataset.relocationImpactDetails;
        }

        // NEW: Create badge and insert before dropdown
        var badge = document.createElement('button');
        badge.className = 'relocation-impact-badge';
        badge.type = 'button';
        badge.title = event.relocationImpact.message || 'Relocation impact';
        badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        badge.dataset.impactCategory = category;

        // Insert before dropdown: container.insertBefore(badge, dropdown)
        container.insertBefore(badge, dropdown);

        // Add class to dropdown: dropdown.classList.add('has-impact-badge')
        dropdown.classList.add('has-impact-badge');

        // Attach or refresh tooltip
        TooltipUtils.attachTooltip(badge, event.relocationImpact.message, { hoverDelay: 300, touchDelay: 400 });

        // Click handler: toggle resolution panel (open/close)
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.visualization-tooltip').forEach(function (tooltipEl) {
            TooltipUtils.hideTooltip(tooltipEl);
          });
          const rowId = row.dataset.rowId;
          const isOpen = (row.nextElementSibling && row.nextElementSibling.classList && row.nextElementSibling.classList.contains('resolution-panel-row'));
          if (isOpen) {
            this.collapseResolutionPanel(rowId);
          } else {
            this.expandResolutionPanel(rowId);
          }
        });
      } else {
        // Auto-collapse any open resolution panel if impact is cleared
        const next = row.nextElementSibling;
        if (next && next.classList && next.classList.contains('resolution-panel-row')) {
          this.collapseResolutionPanel(row.dataset.rowId);
        }
      }
    });
  }

  /**
   * Expand inline resolution panel below the event row
   */
  expandResolutionPanel(rowId) {
    const row = document.querySelector(`tr[data-row-id="${rowId}"]`);
    if (!row) return;

    // Check if row has impact dataset - if not, no panel needed
    if (row.dataset.relocationImpact !== '1') return;

    const tableRows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => r && r.style.display !== 'none' && !(r.classList && r.classList.contains('resolution-panel-row')));
    const rowIndex = tableRows.indexOf(row);
    if (rowIndex === -1) return;

    // Try to get event from readEvents, but reconstruct from row if needed
    let event = null;
    const events = this.webUI.readEvents(false);
    if (events && events.length > rowIndex) {
      event = events[rowIndex];
    }

    // If readEvents didn't return the event, reconstruct it from the row DOM
    if (!event) {
      try {
        const typeInput = row.querySelector('.event-type');
        const nameInput = row.querySelector('.event-name');
        const amountInput = row.querySelector('.event-amount');
        const fromAgeInput = row.querySelector('.event-from-age');
        const toAgeInput = row.querySelector('.event-to-age');
        const rateInput = row.querySelector('.event-rate');
        const matchInput = row.querySelector('.event-match');

        if (typeInput && nameInput) {
          // Create a plain object (SimEvent-like) with required properties
          event = {
            type: typeInput.value || '',
            id: nameInput.value || '',
            amount: amountInput ? amountInput.value : '',
            fromAge: fromAgeInput ? fromAgeInput.value : '',
            toAge: toAgeInput ? toAgeInput.value : '',
            rate: rateInput ? rateInput.value : undefined,
            match: matchInput ? matchInput.value : undefined
          };

          // Read hidden fields
          const currencyInput = row.querySelector('.event-currency');
          if (currencyInput && currencyInput.value) event.currency = currencyInput.value;
          const linkedCountryInput = row.querySelector('.event-linked-country');
          if (linkedCountryInput && linkedCountryInput.value) event.linkedCountry = linkedCountryInput.value;
        }
      } catch (e) {
        // If reconstruction fails, can't proceed
        return;
      }
    }

    if (!event) return;

    // Reconstruct relocationImpact from row dataset if readEvents didn't preserve it
    if (!event.relocationImpact && row.dataset.relocationImpact === '1') {
      event.relocationImpact = {
        category: row.dataset.relocationImpactCategory || '',
        message: row.dataset.relocationImpactMessage || '',
        mvEventId: row.dataset.relocationImpactMvId || '',
        autoResolvable: row.dataset.relocationImpactAuto === '1'
      };
      if (row.dataset.relocationImpactDetails) {
        event.relocationImpact.details = row.dataset.relocationImpactDetails;
      }
    }
    if (event.relocationImpact && row.dataset.relocationImpactDetails && event.relocationImpact.details == null) {
      event.relocationImpact.details = row.dataset.relocationImpactDetails;
    }

    if (!event.relocationImpact) return;
    const env = { webUI: this.webUI, eventsTableManager: this, config: (typeof Config !== 'undefined' ? Config.getInstance() : null), formatUtils: this.webUI && this.webUI.formatUtils };
    RelocationImpactAssistant.renderPanelForTableRow(row, event, env);
  }

  /**
   * Collapse the resolution panel for the given row
   */
  collapseResolutionPanel(rowId) {
    const row = document.querySelector(`tr[data-row-id="${rowId}"]`);
    if (!row) return;
    RelocationImpactAssistant.collapsePanelForTableRow(row);
  }

  _findEventRow(rowId, eventId) {
    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    // Row id is the canonical table identity; prefer it over event ids (which can be duplicated).
    if (rowId) {
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].dataset && rows[i].dataset.rowId === rowId) return rows[i];
      }
    }
    if (eventId) {
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].dataset && rows[i].dataset.eventId === eventId) return rows[i];
      }
    }
    return null;
  }

  splitEventAtRelocation(rowId, part2AmountOverride, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    // Get event data from events array using row index (avoid relying on dataset.eventId)
    const tableRows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => r && r.style.display !== 'none' && !(r.classList && r.classList.contains('resolution-panel-row')));
    const rowIndex = tableRows.indexOf(row);
    if (rowIndex === -1) return;
    const events = this.webUI.readEvents(false);
    const event = events[rowIndex];
    if (!event || !event.relocationImpact) return;
    // Prefer explicit override (accordion) else read from adjacent table panel input
    let part2AmountRaw = part2AmountOverride;
    if (part2AmountRaw === undefined || part2AmountRaw === null) {
      const adjPanelInput = row.nextElementSibling && row.nextElementSibling.querySelector && row.nextElementSibling.querySelector('.part2-amount-input');
      part2AmountRaw = adjPanelInput ? adjPanelInput.value : '';
    }
    // Identify MV event and destination up-front for robust locale parsing
    const mvImpactId = event.relocationImpact.mvEventId;
    const mvEvent = events.find(e => e && (e.id === mvImpactId || e._mvRuntimeId === mvImpactId));
    if (!mvEvent) return;
    const relocationAge = mvEvent.fromAge;
    const relocationAgeNum = Number(relocationAge);
    const part1ToAge = isNaN(relocationAgeNum) ? relocationAge : (relocationAgeNum - 1);
    const destCountry = mvEvent.type.substring(3).toLowerCase();

    // Determine locale hints from the inline resolution panel
    const panelContainer = row.nextElementSibling && row.nextElementSibling.querySelector && row.nextElementSibling.querySelector('.resolution-panel-container');
    let toCountryHint = panelContainer ? panelContainer.getAttribute('data-to-country') : null;
    let fromCountryHint = panelContainer ? panelContainer.getAttribute('data-from-country') : null;
    if (!toCountryHint) toCountryHint = destCountry;
    if (!fromCountryHint) {
      fromCountryHint = this.getOriginCountry(mvEvent, Config.getInstance().getStartCountry());
    }

    // Locale-aware parser using a specific country's number formatting
    const parseByCountry = (val, countryCode) => {
      if (val == null) return undefined;
      let s = String(val);
      try {
        const cfg = Config.getInstance();
        const rs = countryCode ? cfg.getCachedTaxRuleSet(countryCode) : null;
        const locale = rs && rs.getNumberLocale ? rs.getNumberLocale() : (FormatUtils.getLocaleSettings ? FormatUtils.getLocaleSettings().numberLocale : 'en-US');
        const symbol = rs && rs.getCurrencySymbol ? rs.getCurrencySymbol() : (FormatUtils.getLocaleSettings ? FormatUtils.getLocaleSettings().currencySymbol : '');
        if (symbol) {
          const escSym = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          s = s.replace(new RegExp(escSym, 'g'), '');
        }
        s = s.replace(/\s+/g, '');
        const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
        const group = (parts.find(p => p.type === 'group') || {}).value || ',';
        const decimal = (parts.find(p => p.type === 'decimal') || {}).value || '.';
        // Remove group separators and normalise decimal
        s = s.split(group).join('');
        if (decimal !== '.') s = s.split(decimal).join('.');
        const n = parseFloat(s);
        return isNaN(n) ? undefined : n;
      } catch (_) {
        // Fallback to generic parser
        try {
          const n = FormatUtils.parseCurrency(s);
          return (typeof n === 'number' && !isNaN(n)) ? n : undefined;
        } catch (__) { return undefined; }
      }
    };

    const part2AmountNum = parseByCountry(part2AmountRaw, toCountryHint);
    const part2Amount = (typeof part2AmountNum === 'number') ? String(part2AmountNum) : '';
    const destRuleSet = Config.getInstance().getCachedTaxRuleSet(destCountry);
    const destCurrency = destRuleSet ? destRuleSet.getCurrencyCode() : 'EUR';

    let part2EventType = event.type;
    if (destRuleSet && typeof destRuleSet.hasPrivatePensions === 'function' && !destRuleSet.hasPrivatePensions()) {
      if (event.type === 'SI') part2EventType = 'SInp';
      else if (event.type === 'SI2') part2EventType = 'SI2np';
    }

    const linkedEventId = 'split_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const splitMvId = this._getRelocationLinkIdByImpactId(mvImpactId) || String(mvImpactId || '');
    // Prefer parsing the original row's displayed amount using the origin country's locale
    const originalAmountRaw = (row.querySelector && row.querySelector('.event-amount') ? row.querySelector('.event-amount').value : (event && event.amount));
    const part1AmountNum = parseByCountry(originalAmountRaw, fromCountryHint);
    const part1Amount = (typeof part1AmountNum === 'number') ? String(part1AmountNum) : '';

    // Normalize percentage fields for inputs: inputs expect percentage (e.g., 3.5 for 3.5%)
    const normalizePercentForInput = (v) => {
      if (v === undefined || v === null || v === '') return '';
      const num = (typeof v === 'number') ? v : parseFloat(v);
      if (isNaN(num)) return String(v);
      const round = (x, dp = 6) => {
        const m = Math.pow(10, dp);
        return Math.round(x * m) / m;
      };
      const abs = Math.abs(num);
      if (abs > 0 && abs <= 1) return String(round(num * 100));
      return String(round(num));
    };

    const rateForInput = normalizePercentForInput(event && event.rate);
    const matchForInput = normalizePercentForInput(event && event.match);

    const part1Row = this.createEventRow(event.type, event.id, part1Amount, event.fromAge, part1ToAge, rateForInput, matchForInput);
    this.getOrCreateHiddenInput(part1Row, 'event-linked-event-id', linkedEventId);
    if (splitMvId) this.getOrCreateHiddenInput(part1Row, 'event-relocation-split-mv-id', splitMvId);
    if (!isNaN(relocationAgeNum)) this.getOrCreateHiddenInput(part1Row, 'event-relocation-split-anchor-age', String(relocationAgeNum));
    if (fromCountryHint) this.getOrCreateHiddenInput(part1Row, 'event-country', String(fromCountryHint).toLowerCase());
    const part2Row = this.createEventRow(part2EventType, event.id, part2Amount, relocationAge, event.toAge, rateForInput, matchForInput);
    this.getOrCreateHiddenInput(part2Row, 'event-linked-event-id', linkedEventId);
    if (splitMvId) this.getOrCreateHiddenInput(part2Row, 'event-relocation-split-mv-id', splitMvId);
    if (!isNaN(relocationAgeNum)) this.getOrCreateHiddenInput(part2Row, 'event-relocation-split-anchor-age', String(relocationAgeNum));
    this.getOrCreateHiddenInput(part2Row, 'event-currency', destCurrency);
    if (toCountryHint) this.getOrCreateHiddenInput(part2Row, 'event-country', String(toCountryHint).toLowerCase());

    row.insertAdjacentElement('afterend', part1Row);
    part1Row.insertAdjacentElement('afterend', part2Row);

    // Mark the new (second-half) event row; highlight will be applied after sorting/refresh
    if (part2Row && part2Row.classList) part2Row.classList.add('just-created');

    // Prepare accordion highlight context for the new (second-half) event
    const newEventId = part2Row && part2Row.dataset ? part2Row.dataset.eventId : null;
    const newEventData = {
      eventType: event && event.type || '',
      name: event && event.id || '',
      amount: part2Amount || '',
      fromAge: String(relocationAge || ''),
      toAge: String(event && event.toAge || ''),
      rate: rateForInput || '',
      match: matchForInput || ''
    };
    // Ensure resolution panel is collapsed/removed before deleting the original row to avoid orphaned panel DOM
    this.collapseResolutionPanel(resolvedRowId);
    row.classList.add('deleting-fade');
    setTimeout(() => {
      row.remove();
      // Recompute after original row removal so counts and badges align
      this._afterResolutionAction(resolvedRowId);
      // After table and accordion refresh/sort, animate the new table row
      if (typeof this.animateNewTableRow === 'function') {
        setTimeout(() => { this.animateNewTableRow(newEventData); }, 400);
      }
      // After base refresh, trigger accordion highlight for the new event
      if (this.viewMode === 'accordion' && this.webUI && this.webUI.eventAccordionManager && newEventId) {
        this.webUI.eventAccordionManager.refreshWithNewEventAnimation(newEventData, newEventId);
      }
    }, 200);

    // If splitting a property or mortgage, also end its paired counterpart at the same boundary
    if ((event.type === 'R' || event.type === 'M') && event.id) {
      this._applyToRealEstatePair(part1Row, (r) => {
        const toAgeInput = r.querySelector('.event-to-age');
        if (!toAgeInput) return;
        // Keep earlier end if it already ends before relocation
        const existing = Number(toAgeInput.value);
        if (isNaN(existing) || existing > part1ToAge) {
          toAgeInput.value = String(part1ToAge);
          toAgeInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    // Reapply currency/percentage input formatting for newly inserted rows
    if (this.webUI && this.webUI.formatUtils) {
      this.webUI.formatUtils.setupCurrencyInputs();
      this.webUI.formatUtils.setupPercentageInputs();
    }

    // After inserting part rows and removing the original, ensure sorting is applied
    // Prefer existing sort apply path; otherwise, trigger existing auto-sort via blur
    if (this.sortKeys && this.sortKeys.length > 0 && typeof this.applySort === 'function') {
      this.applySort();
    } else {
      const ageInput = document.querySelector('#Events tbody tr .event-from-age');
      if (ageInput) {
        ageInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }
  }

  cutShortEventAtRelocation(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    const tableRows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => r && r.style.display !== 'none' && !(r.classList && r.classList.contains('resolution-panel-row')));
    const rowIndex = tableRows.indexOf(row);
    if (rowIndex === -1) return;
    const events = this.webUI.readEvents(false);
    const event = events[rowIndex];
    if (!event || !event.relocationImpact) return;
    const mvImpactId = event.relocationImpact.mvEventId;
    const mvEvent = events.find(e => e && (e.id === mvImpactId || e._mvRuntimeId === mvImpactId));
    if (!mvEvent) return;
    const relocationAge = Number(mvEvent.fromAge);
    const cutShortToAge = relocationAge - 1;
    const toAgeInput = row.querySelector('.event-to-age');
    if (toAgeInput) {
      const existingToAge = Number(toAgeInput.value);
      if (isNaN(existingToAge) || existingToAge > cutShortToAge) {
        toAgeInput.value = String(cutShortToAge);
        toAgeInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    this._afterResolutionAction(resolvedRowId);
  }

  joinSplitEvents(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    const linkedEventIdInput = row.querySelector('.event-linked-event-id');
    const linkedEventId = linkedEventIdInput ? linkedEventIdInput.value : '';
    if (!linkedEventId) return;

    const allRows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    const splitRows = allRows.filter(r => {
      const idInput = r.querySelector('.event-linked-event-id');
      return idInput && idInput.value === linkedEventId;
    });
    if (splitRows.length < 2) return;

    const getNum = (rowEl, selector) => {
      const input = rowEl.querySelector(selector);
      const n = Number(input ? input.value : '');
      return isNaN(n) ? Number.POSITIVE_INFINITY : n;
    };
    splitRows.sort((a, b) => {
      const fromDiff = getNum(a, '.event-from-age') - getNum(b, '.event-from-age');
      if (fromDiff !== 0) return fromDiff;
      return getNum(a, '.event-to-age') - getNum(b, '.event-to-age');
    });

    const firstRow = splitRows[0];
    const lastRow = splitRows[splitRows.length - 1];

    const mergedType = firstRow.querySelector('.event-type') ? firstRow.querySelector('.event-type').value : '';
    const mergedName = firstRow.querySelector('.event-name') ? firstRow.querySelector('.event-name').value : '';
    const mergedAmount = firstRow.querySelector('.event-amount') ? firstRow.querySelector('.event-amount').value : '';
    const mergedFromAge = firstRow.querySelector('.event-from-age') ? firstRow.querySelector('.event-from-age').value : '';
    const mergedToAge = lastRow.querySelector('.event-to-age') ? lastRow.querySelector('.event-to-age').value : '';
    const mergedRate = firstRow.querySelector('.event-rate') ? firstRow.querySelector('.event-rate').value : '';
    const mergedMatch = firstRow.querySelector('.event-match') ? firstRow.querySelector('.event-match').value : '';

    const mergedRow = this.createEventRow(
      mergedType,
      mergedName,
      mergedAmount,
      mergedFromAge,
      mergedToAge,
      mergedRate,
      mergedMatch
    );

    const firstCurrency = firstRow.querySelector('.event-currency');
    if (firstCurrency && firstCurrency.value) this.getOrCreateHiddenInput(mergedRow, 'event-currency', firstCurrency.value);
    const firstLinkedCountry = firstRow.querySelector('.event-linked-country');
    if (firstLinkedCountry && firstLinkedCountry.value) this.getOrCreateHiddenInput(mergedRow, 'event-linked-country', firstLinkedCountry.value);
    const firstCountryHint = firstRow.querySelector('.event-country');
    if (firstCountryHint && firstCountryHint.value) this.getOrCreateHiddenInput(mergedRow, 'event-country', firstCountryHint.value);

    this.collapseResolutionPanel(resolvedRowId);
    firstRow.insertAdjacentElement('beforebegin', mergedRow);
    for (let i = 0; i < splitRows.length; i++) splitRows[i].remove();

    if (this.webUI && this.webUI.formatUtils) {
      this.webUI.formatUtils.setupCurrencyInputs();
      this.webUI.formatUtils.setupPercentageInputs();
    }

    if (this.sortKeys && this.sortKeys.length > 0 && typeof this.applySort === 'function') {
      this.applySort();
    } else {
      const ageInput = document.querySelector('#Events tbody tr .event-from-age');
      if (ageInput) {
        ageInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }

    const mergedRowId = mergedRow && mergedRow.dataset ? mergedRow.dataset.rowId : resolvedRowId;
    this._afterResolutionAction(mergedRowId);
  }

  _findRelocationEventForImpactedRow(row) {
    if (!row) return null;
    const tableRows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => r && r.style.display !== 'none' && !(r.classList && r.classList.contains('resolution-panel-row')));
    const rowIndex = tableRows.indexOf(row);
    if (rowIndex === -1) return null;
    const events = this.webUI.readEvents(false) || [];
    const event = events[rowIndex];
    if (!event || !event.relocationImpact || !event.relocationImpact.mvEventId) return null;
    const mvImpactId = event.relocationImpact.mvEventId;
    const mvEvent = events.find(e => e && (e.id === mvImpactId || e._mvRuntimeId === mvImpactId || e.relocationLinkId === mvImpactId));
    if (!mvEvent) return null;
    return { events: events, event: event, mvEvent: mvEvent, mvImpactId: mvImpactId };
  }

  adaptSplitToRelocationAge(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    const linkedEventIdInput = row.querySelector('.event-linked-event-id');
    const linkedEventId = linkedEventIdInput ? linkedEventIdInput.value : '';
    if (!linkedEventId) return;

    const impacted = this._findRelocationEventForImpactedRow(row);
    if (!impacted || !impacted.mvEvent) return;
    const relocationAge = Number(impacted.mvEvent.fromAge);
    if (isNaN(relocationAge)) return;
    const splitMarkerInput = row.querySelector('.event-relocation-split-mv-id');
    const splitMarkerId = splitMarkerInput ? String(splitMarkerInput.value || '') : '';
    const markerCandidates = [];
    if (splitMarkerId) markerCandidates.push(splitMarkerId);
    if (impacted.mvImpactId) markerCandidates.push(String(impacted.mvImpactId));
    if (impacted.mvEvent && impacted.mvEvent.relocationLinkId) markerCandidates.push(String(impacted.mvEvent.relocationLinkId));
    const fallbackLinkId = this._getRelocationLinkIdByImpactId(impacted.mvImpactId);
    if (fallbackLinkId) markerCandidates.push(String(fallbackLinkId));
    const ageShift = this._consumeRelocationAgeShift(Array.from(new Set(markerCandidates)));

    const allRows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    const splitRows = allRows.filter(r => {
      const idInput = r.querySelector('.event-linked-event-id');
      return idInput && idInput.value === linkedEventId;
    });
    if (splitRows.length < 2) return;

    splitRows.sort((a, b) => {
      const aFrom = Number(a.querySelector('.event-from-age') ? a.querySelector('.event-from-age').value : '');
      const bFrom = Number(b.querySelector('.event-from-age') ? b.querySelector('.event-from-age').value : '');
      if (aFrom !== bFrom) return aFrom - bFrom;
      const aTo = Number(a.querySelector('.event-to-age') ? a.querySelector('.event-to-age').value : '');
      const bTo = Number(b.querySelector('.event-to-age') ? b.querySelector('.event-to-age').value : '');
      return aTo - bTo;
    });

    const firstRow = splitRows[0];
    const secondRow = splitRows[1];
    const firstFromInput = firstRow.querySelector('.event-from-age');
    const firstToInput = firstRow.querySelector('.event-to-age');
    const secondFromInput = secondRow.querySelector('.event-from-age');
    const secondToInput = secondRow.querySelector('.event-to-age');
    if (!firstFromInput || !firstToInput || !secondFromInput || !secondToInput) return;

    const firstFrom = Number(firstFromInput.value);
    const firstTo = Number(firstToInput.value);
    const secondFrom = Number(secondFromInput.value);
    const secondTo = Number(secondToInput.value);
    if (isNaN(firstFrom) || isNaN(firstTo) || isNaN(secondFrom) || isNaN(secondTo)) return;
    let nextPart1To;
    let nextPart2From;
    if (ageShift !== null && !isNaN(Number(ageShift))) {
      const shift = Number(ageShift);
      nextPart1To = firstTo + shift;
      nextPart2From = secondFrom + shift;
    } else {
      const isOverlappingBoundary = (firstTo === secondFrom);
      nextPart1To = isOverlappingBoundary ? relocationAge : (relocationAge - 1);
      nextPart2From = relocationAge;
    }

    // Relocation moved before the split range: keep destination-side row only.
    if (nextPart1To < firstFrom) {
      secondFromInput.value = String(firstFrom);
      this._removeHiddenInput(secondRow, 'event-linked-event-id');
      this._removeHiddenInput(secondRow, 'event-relocation-split-mv-id');
      this._removeHiddenInput(secondRow, 'event-relocation-split-anchor-age');
      this._removeHiddenInput(secondRow, 'event-resolution-override');
      this._removeRowAndResolutionPanel(firstRow);
      this._afterResolutionAction(resolvedRowId);
      return;
    }

    // Relocation moved after the split range: keep origin-side row only.
    if (nextPart2From > secondTo) {
      firstToInput.value = String(secondTo);
      this._removeHiddenInput(firstRow, 'event-linked-event-id');
      this._removeHiddenInput(firstRow, 'event-relocation-split-mv-id');
      this._removeHiddenInput(firstRow, 'event-relocation-split-anchor-age');
      this._removeHiddenInput(firstRow, 'event-resolution-override');
      this._removeRowAndResolutionPanel(secondRow);
      this._afterResolutionAction(resolvedRowId);
      return;
    }

    firstToInput.value = String(nextPart1To);
    secondFromInput.value = String(nextPart2From);
    this.getOrCreateHiddenInput(firstRow, 'event-relocation-split-anchor-age', String(relocationAge));
    this.getOrCreateHiddenInput(secondRow, 'event-relocation-split-anchor-age', String(relocationAge));
    this._removeHiddenInput(firstRow, 'event-resolution-override');
    this._removeHiddenInput(secondRow, 'event-resolution-override');
    this._afterResolutionAction(resolvedRowId);
  }

  keepSplitAsIs(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    const linkedEventIdInput = row.querySelector('.event-linked-event-id');
    const linkedEventId = linkedEventIdInput ? linkedEventIdInput.value : '';
    if (!linkedEventId) return;
    const impacted = this._findRelocationEventForImpactedRow(row);
    const splitMarkerInput = row.querySelector('.event-relocation-split-mv-id');
    const splitMarkerId = splitMarkerInput ? String(splitMarkerInput.value || '') : '';
    const splitMarkerCandidates = [];
    if (splitMarkerId) splitMarkerCandidates.push(splitMarkerId);
    if (impacted && impacted.mvImpactId) splitMarkerCandidates.push(String(impacted.mvImpactId));
    if (impacted && impacted.mvEvent && impacted.mvEvent.relocationLinkId) splitMarkerCandidates.push(String(impacted.mvEvent.relocationLinkId));
    if (splitMarkerCandidates.length) this._clearRelocationAgeShift(Array.from(new Set(splitMarkerCandidates)));

    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    for (let i = 0; i < rows.length; i++) {
      const idInput = rows[i].querySelector('.event-linked-event-id');
      if (idInput && idInput.value === linkedEventId) {
        this.getOrCreateHiddenInput(rows[i], 'event-resolution-override', '1');
      }
    }
    this._afterResolutionAction(resolvedRowId);
  }

  adaptSaleToRelocationAge(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    const impacted = this._findRelocationEventForImpactedRow(row);
    if (!impacted || !impacted.mvEvent) return;

    const relocationAge = Number(impacted.mvEvent.fromAge);
    if (isNaN(relocationAge)) return;
    const cutoffAge = relocationAge - 1;
    const mvImpactId = impacted.mvImpactId;
    const saleMarkerInput = row.querySelector('.event-relocation-sell-mv-id');
    const existingSaleMarker = saleMarkerInput ? String(saleMarkerInput.value || '') : '';
    const sellMarkerId = this._getRelocationLinkIdByImpactId(mvImpactId) || String(mvImpactId || '');
    const saleMarkerCandidates = [];
    if (existingSaleMarker) saleMarkerCandidates.push(existingSaleMarker);
    if (sellMarkerId) saleMarkerCandidates.push(sellMarkerId);
    if (mvImpactId) saleMarkerCandidates.push(String(mvImpactId));
    if (impacted.mvEvent && impacted.mvEvent.relocationLinkId) saleMarkerCandidates.push(String(impacted.mvEvent.relocationLinkId));
    const saleAgeShift = this._consumeRelocationAgeShift(Array.from(new Set(saleMarkerCandidates)));

    const previousSuppress = this._suppressSellMarkerClear;
    this._suppressSellMarkerClear = true;
    this._applyToRealEstatePair(row, (pairRow) => {
      const fromAgeInput = pairRow.querySelector('.event-from-age');
      const fromAge = Number(fromAgeInput ? fromAgeInput.value : '');
      const toAgeInput = pairRow.querySelector('.event-to-age');
      const currentToAge = Number(toAgeInput ? toAgeInput.value : '');
      const targetToAge = (saleAgeShift !== null && !isNaN(Number(saleAgeShift)) && !isNaN(currentToAge))
        ? (currentToAge + Number(saleAgeShift))
        : cutoffAge;
      if (!isNaN(fromAge) && targetToAge < fromAge) {
        this._removeHiddenInput(pairRow, 'event-relocation-sell-mv-id');
        this._removeHiddenInput(pairRow, 'event-relocation-sell-anchor-age');
        this._removeHiddenInput(pairRow, 'event-resolution-override');
        return;
      }
      if (toAgeInput) toAgeInput.value = String(targetToAge);
      if (sellMarkerId) this.getOrCreateHiddenInput(pairRow, 'event-relocation-sell-mv-id', sellMarkerId);
      this.getOrCreateHiddenInput(pairRow, 'event-relocation-sell-anchor-age', String(relocationAge));
      this._removeHiddenInput(pairRow, 'event-resolution-override');
    });
    this._suppressSellMarkerClear = previousSuppress;
    this._afterResolutionAction(resolvedRowId);
  }

  keepSaleAsIs(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (row) {
      const impacted = this._findRelocationEventForImpactedRow(row);
      const saleMarkerInput = row.querySelector('.event-relocation-sell-mv-id');
      const saleMarkerId = saleMarkerInput ? String(saleMarkerInput.value || '') : '';
      const markerCandidates = [];
      if (saleMarkerId) markerCandidates.push(saleMarkerId);
      if (impacted && impacted.mvImpactId) markerCandidates.push(String(impacted.mvImpactId));
      if (impacted && impacted.mvEvent && impacted.mvEvent.relocationLinkId) markerCandidates.push(String(impacted.mvEvent.relocationLinkId));
      if (markerCandidates.length) this._clearRelocationAgeShift(Array.from(new Set(markerCandidates)));
    }
    this.markAsReviewed(rowId, eventId);
  }

  pegCurrencyToOriginal(rowId, currencyCode, linkedCountry, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    let resolvedLinkedCountry = linkedCountry ? String(linkedCountry).toLowerCase() : '';
    if (!resolvedLinkedCountry) {
      const events = this.webUI.readEvents(false) || [];
      let mvEvent = null;
      const mvImpactId = row.dataset ? row.dataset.relocationImpactMvId : '';
      if (mvImpactId) mvEvent = events.find(e => e && (e.id === mvImpactId || e._mvRuntimeId === mvImpactId));
      if (!mvEvent) {
        const visibleRows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => r && r.style.display !== 'none' && !(r.classList && r.classList.contains('resolution-panel-row')));
        const rowIndex = visibleRows.indexOf(row);
        const rowEvent = (rowIndex >= 0 && rowIndex < events.length) ? events[rowIndex] : null;
        const rowMvId = rowEvent && rowEvent.relocationImpact ? rowEvent.relocationImpact.mvEventId : '';
        if (rowMvId) mvEvent = events.find(e => e && (e.id === rowMvId || e._mvRuntimeId === rowMvId));
        if (!mvEvent && rowEvent) {
          const mvEvents = events
            .filter(e => e && e.type && e.type.indexOf('MV-') === 0)
            .sort((a, b) => Number(a.fromAge) - Number(b.fromAge));
          const fromAge = Number(rowEvent.fromAge);
          const toAge = Number(rowEvent.toAge);
          for (let i = 0; i < mvEvents.length; i++) {
            const mvAge = Number(mvEvents[i].fromAge);
            if (!isNaN(fromAge) && !isNaN(toAge) && fromAge < mvAge && toAge >= mvAge) {
              mvEvent = mvEvents[i];
              break;
            }
          }
          if (!mvEvent) {
            for (let i = 0; i < mvEvents.length; i++) {
              const mvAge = Number(mvEvents[i].fromAge);
              if (!isNaN(fromAge) && fromAge >= mvAge) mvEvent = mvEvents[i];
              else break;
            }
          }
        }
      }
      if (mvEvent) resolvedLinkedCountry = this.getOriginCountry(mvEvent, Config.getInstance().getStartCountry());
      if (!resolvedLinkedCountry) resolvedLinkedCountry = Config.getInstance().getStartCountry();
    }
    // Set currency on current row
    this.getOrCreateHiddenInput(row, 'event-currency', currencyCode);
    if (resolvedLinkedCountry) this.getOrCreateHiddenInput(row, 'event-linked-country', resolvedLinkedCountry);
    this.getOrCreateHiddenInput(row, 'event-resolution-override', '1');
    // Also apply to paired real-estate rows if applicable
    this._applyToRealEstatePair(row, (r) => {
      this.getOrCreateHiddenInput(r, 'event-currency', currencyCode);
      if (resolvedLinkedCountry) this.getOrCreateHiddenInput(r, 'event-linked-country', resolvedLinkedCountry);
      this.getOrCreateHiddenInput(r, 'event-resolution-override', '1');
    });
    this._afterResolutionAction(resolvedRowId);
  }

  acceptSuggestion(rowId, suggestedAmount, suggestedCurrency, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    const amountInput = row.querySelector('.event-amount');
    if (amountInput) {
      const num = Number(suggestedAmount);
      amountInput.value = isNaN(num) ? '' : String(num);
      amountInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Set currency on current row
    this.getOrCreateHiddenInput(row, 'event-currency', suggestedCurrency);
    // Also apply to paired real-estate rows if applicable
    this._applyToRealEstatePair(row, (r) => this.getOrCreateHiddenInput(r, 'event-currency', suggestedCurrency));

    // If SI/SI2 and destination pension is state_only, auto-convert to non-pensionable
    const typeInput = row.querySelector('.event-type');
    const currentType = typeInput ? typeInput.value : null;
    if (currentType === 'SI' || currentType === 'SI2') {
      // Derive dest country from context container if present
      const container = row.nextElementSibling && row.nextElementSibling.querySelector && row.nextElementSibling.querySelector('.resolution-panel-container');
      let dest = null;
      if (container) {
        dest = container.getAttribute('data-to-country');
      } else {
        // Fallback via MV event referenced on the event if available
        const events = this.webUI.readEvents(false);
        const visibleRows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(rr => rr && rr.style.display !== 'none' && !(rr.classList && rr.classList.contains('resolution-panel-row')));
        const idx = visibleRows.indexOf(row);
        const ev = idx >= 0 ? events[idx] : null;
        const mvImpactId = ev && ev.relocationImpact ? ev.relocationImpact.mvEventId : null;
        const mv = mvImpactId ? events.find(e => e && (e.id === mvImpactId || e._mvRuntimeId === mvImpactId)) : null;
        dest = mv ? mv.type.substring(3).toLowerCase() : null;
      }
      if (dest) {
        const rs = Config.getInstance().getCachedTaxRuleSet(dest);
        if (rs && typeof rs.getPensionSystemType === 'function' && rs.getPensionSystemType() === 'state_only') {
          const newType = currentType === 'SI' ? 'SInp' : 'SI2np';
          typeInput.value = newType;
          const toggleEl = row.querySelector(`#EventTypeToggle_${resolvedRowId}`);
          if (toggleEl) toggleEl.textContent = newType;
          if (row._eventTypeDropdown && typeof row._eventTypeDropdown.setValue === 'function') {
            row._eventTypeDropdown.setValue(newType);
          }
          this.updateFieldVisibility(typeInput);
          typeInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
    this._afterResolutionAction(resolvedRowId);
  }

  linkPropertyToCountry(rowId, selectedCountryOverride, convertedAmountOverride, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    // Prefer override (accordion) else read from adjacent table panel select
    let selectedCountry = selectedCountryOverride;
    if (!selectedCountry) {
      const adjPanelSelect = row.nextElementSibling && row.nextElementSibling.querySelector && row.nextElementSibling.querySelector('.country-selector');
      selectedCountry = adjPanelSelect ? adjPanelSelect.value : '';
    }
    // Get converted amount from override or panel input
    let convertedAmountRaw = convertedAmountOverride;
    if (convertedAmountRaw === undefined || convertedAmountRaw === null) {
      const adjPanelInput = row.nextElementSibling && row.nextElementSibling.querySelector && row.nextElementSibling.querySelector('.link-amount-input');
      convertedAmountRaw = adjPanelInput ? adjPanelInput.value : '';
    }
    // Apply to both the property (R) and its associated mortgage (M) with the same id
    const idVal = row.querySelector('.event-name')?.value;
    if (!idVal) return;
    function rowsBy(id, type) {
      const rows = Array.from(document.querySelectorAll('#Events tbody tr'));
      return rows.filter(r => {
        const t = r.querySelector('.event-type');
        const n = r.querySelector('.event-name');
        return t && n && t.value === type && n.value === id;
      });
    }
    const targetRows = [...rowsBy(idVal, 'R'), ...rowsBy(idVal, 'M')];
    const ruleSet = Config.getInstance().getCachedTaxRuleSet(selectedCountry);
    const currency = ruleSet ? ruleSet.getCurrencyCode() : null;

    // Parse converted amount using locale-aware parser (similar to splitEventAtRelocation)
    const parseByCountry = (val, countryCode) => {
      if (val == null) return undefined;
      let s = String(val);
      try {
        const cfg = Config.getInstance();
        const rs = countryCode ? cfg.getCachedTaxRuleSet(countryCode) : null;
        const locale = rs && rs.getNumberLocale ? rs.getNumberLocale() : (FormatUtils.getLocaleSettings ? FormatUtils.getLocaleSettings().numberLocale : 'en-US');
        const symbol = rs && rs.getCurrencySymbol ? rs.getCurrencySymbol() : (FormatUtils.getLocaleSettings ? FormatUtils.getLocaleSettings().currencySymbol : '');
        if (symbol) {
          const escSym = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          s = s.replace(new RegExp(escSym, 'g'), '');
        }
        s = s.replace(/\s+/g, '');
        const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
        const group = (parts.find(p => p.type === 'group') || {}).value || ',';
        const decimal = (parts.find(p => p.type === 'decimal') || {}).value || '.';
        s = s.split(group).join('');
        if (decimal !== '.') s = s.split(decimal).join('.');
        const n = parseFloat(s);
        return isNaN(n) ? undefined : n;
      } catch (_) {
        try {
          const n = FormatUtils.parseCurrency(s);
          return (typeof n === 'number' && !isNaN(n)) ? n : undefined;
        } catch (__) { return undefined; }
      }
    };

    const convertedAmountNum = parseByCountry(convertedAmountRaw, selectedCountry);

    for (let i = 0; i < targetRows.length; i++) {
      this.getOrCreateHiddenInput(targetRows[i], 'event-linked-country', selectedCountry);
      this._removeHiddenInput(targetRows[i], 'event-relocation-sell-mv-id');
      this._removeHiddenInput(targetRows[i], 'event-relocation-sell-anchor-age');
      if (currency) this.getOrCreateHiddenInput(targetRows[i], 'event-currency', currency);
      // Update amount if conversion was provided
      if (typeof convertedAmountNum === 'number' && !isNaN(convertedAmountNum)) {
        const amountInput = targetRows[i].querySelector('.event-amount');
        if (amountInput) {
          amountInput.value = String(convertedAmountNum);
          amountInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
    // Reapply currency/percentage input formatting to ensure proper formatting
    if (this.webUI && this.webUI.formatUtils) {
      this.webUI.formatUtils.setupCurrencyInputs();
      this.webUI.formatUtils.setupPercentageInputs();
    }
    this._afterResolutionAction(resolvedRowId);
  }

  linkIncomeToCountry(rowId, country, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    let selectedCountry = country;
    if (!selectedCountry) {
      const adjPanelSelect = row.nextElementSibling && row.nextElementSibling.querySelector && row.nextElementSibling.querySelector('.country-selector');
      selectedCountry = adjPanelSelect ? adjPanelSelect.value : '';
    }
    if (!selectedCountry) return;
    this.getOrCreateHiddenInput(row, 'event-linked-country', selectedCountry);
    this._afterResolutionAction(resolvedRowId);
  }

  convertToPensionless(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    const typeInput = row.querySelector('.event-type');
    if (!typeInput) return;
    const currentType = typeInput.value;
    // Only handle SI and SI2. Return early for all other types.
    if (currentType !== 'SI' && currentType !== 'SI2') return;
    const newType = currentType === 'SI' ? 'SInp' : 'SI2np';
    typeInput.value = newType;
    const toggleEl = row.querySelector(`#EventTypeToggle_${resolvedRowId}`);
    if (toggleEl) toggleEl.textContent = newType;
    if (row._eventTypeDropdown) row._eventTypeDropdown.setValue(newType);
    this.updateFieldVisibility(typeInput);
    typeInput.dispatchEvent(new Event('change', { bubbles: true }));
    this._afterResolutionAction(resolvedRowId);
  }

  // Helper: apply function to all rows with same id for both R and M
  _applyToRealEstatePair(row, fn) {
    const idVal = row && row.querySelector ? (row.querySelector('.event-name')?.value) : null;
    if (!idVal) return;
    const rows = Array.from(document.querySelectorAll('#Events tbody tr'));
    const targets = rows.filter(r => {
      const t = r.querySelector('.event-type');
      const n = r.querySelector('.event-name');
      return t && n && (t.value === 'R' || t.value === 'M') && n.value === idVal;
    });
    for (let i = 0; i < targets.length; i++) fn(targets[i]);
  }

  markAsReviewed(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    // Always apply review override to the current row
    this.getOrCreateHiddenInput(row, 'event-resolution-override', '1');
    // Also apply to paired real-estate rows if applicable (R/M with same id)
    this._applyToRealEstatePair(row, (r) => this.getOrCreateHiddenInput(r, 'event-resolution-override', '1'));
    this._afterResolutionAction(resolvedRowId);
  }

  _afterResolutionAction(rowId) {
    this.collapseResolutionPanel(rowId);
    const events = this.webUI.readEvents(false);
    const startCountry = Config.getInstance().getStartCountry();
    RelocationImpactDetector.analyzeEvents(events, startCountry);
    this.updateRelocationImpactIndicators(events);
    this.webUI.updateStatusForRelocationImpacts(events);
    if (this.webUI.eventAccordionManager) this.webUI.eventAccordionManager.refresh();
    // Do not auto-expand resolution panels; only show toast if none remain
    const anyImpacts = Array.from(document.querySelectorAll('tr[data-relocation-impact="1"]')).length > 0;
    if (!anyImpacts) {
      const nu = this.webUI && this.webUI.notificationUtils;
      if (nu && typeof nu.showToast === 'function') {
        nu.showToast('All relocation impacts resolved!', 'Success', 3);
      }
    }
  }

  getOrCreateHiddenInput(row, className, value) {
    let input = row.querySelector('.' + className);
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.className = className;
      const container = row.querySelector('.event-type-container');
      if (container) {
        container.appendChild(input);
      } else {
        const firstCell = row.querySelector('td');
        if (firstCell) {
          firstCell.appendChild(input);
        } else {
          row.appendChild(input);
        }
      }
    }
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input;
  }

  generateEconomicContextHTML(fromCountry, toCountry, amount) {
    const amountNum = Number(amount);
    const economicData = Config.getInstance().getEconomicData();
    const fromRuleSet = Config.getInstance().getCachedTaxRuleSet(fromCountry);
    const toRuleSet = Config.getInstance().getCachedTaxRuleSet(toCountry);
    const fromCurrency = fromRuleSet ? fromRuleSet.getCurrencyCode() : 'EUR';
    const toCurrency = toRuleSet ? toRuleSet.getCurrencyCode() : 'EUR';
    const inflationFrom = economicData && economicData.ready ? economicData.getInflation(fromCountry) : (fromRuleSet ? fromRuleSet.getInflationRate() * 100 : null);
    const inflationTo = economicData && economicData.ready ? economicData.getInflation(toCountry) : (toRuleSet ? toRuleSet.getInflationRate() * 100 : null);
    const fxRate = economicData && economicData.ready ? economicData.getFX(fromCountry, toCountry) : null;
    const pppRatio = economicData && economicData.ready ? economicData.getPPP(fromCountry, toCountry) : null;
    const colRatio = (pppRatio != null && fxRate != null && fxRate > 0) ? (pppRatio / fxRate) : null;
    const fxAmount = (fxRate && !isNaN(amountNum)) ? (amountNum * fxRate) : null;
    const pppAmount = (pppRatio && !isNaN(amountNum)) ? (amountNum * pppRatio) : null;
    let html = '<h5>Economic Context</h5><table class="economic-data-table"><thead><tr><th>Metric</th><th>From</th><th>To</th></tr></thead><tbody>';
    html += `<tr><td>Currency</td><td>${fromCurrency}</td><td>${toCurrency}</td></tr>`;
    html += `<tr><td>Inflation (%)</td><td>${inflationFrom !== null ? inflationFrom.toFixed(1) : 'N/A'}</td><td>${inflationTo !== null ? inflationTo.toFixed(1) : 'N/A'}</td></tr>`;
    html += `<tr><td>FX Rate</td><td>1 ${fromCurrency} = ${fxRate !== null ? fxRate.toFixed(3) : 'N/A'} ${toCurrency}</td><td></td></tr>`;
    html += `<tr><td>PPP Cross-Rate</td><td>1 ${fromCurrency} = ${pppRatio !== null ? pppRatio.toFixed(3) : 'N/A'} ${toCurrency}</td><td></td></tr>`;
    html += `<tr><td>Cost of Living (PPP/FX)</td><td>${colRatio !== null ? (colRatio.toFixed(2) + 'x') : 'N/A'}</td><td></td></tr>`;
    html += '</tbody></table>';
    if (fxAmount !== null || pppAmount !== null) {
      html += '<div class="conversion-preview"><strong>Conversions for ' + (isNaN(amountNum) ? amount : amountNum) + ' ' + fromCurrency + ':</strong>';
      if (fxAmount !== null) html += '<div>FX: ' + FormatUtils.formatCurrency(fxAmount) + ' ' + toCurrency + '</div>';
      if (pppAmount !== null) html += '<div>PPP: ' + FormatUtils.formatCurrency(pppAmount) + ' ' + toCurrency + '</div>';
      html += '</div>';
    }
    return html;
  }

  calculatePPPSuggestion(amount, fromCountry, toCountry) {
    // Sanitize amount robustly: accept numbers or strings with currency symbols/grouping
    var raw = (amount == null) ? '' : String(amount);
    var sanitized = raw.replace(/[^0-9.\-]/g, '');
    var numeric = Number(sanitized);
    if (isNaN(numeric)) numeric = Number(amount); // fallback if already numeric

    const economicData = Config.getInstance().getEconomicData();
    if (!economicData || !economicData.ready) return numeric;
    const pppRatio = economicData.getPPP(fromCountry, toCountry);
    if (pppRatio === null) {
      const fxRate = economicData.getFX(fromCountry, toCountry);
      return fxRate !== null ? Math.round(numeric * fxRate) : numeric;
    }
    return Math.round(numeric * pppRatio);
  }

  detectPropertyCountry(eventFromAge, startCountry) {
    const events = this.webUI.readEvents(false);
    const mvEvents = events.filter(e => e.type && e.type.indexOf('MV-') === 0).sort((a, b) => a.fromAge - b.fromAge);
    if (eventFromAge < mvEvents[0]?.fromAge) return startCountry;
    for (let i = mvEvents.length - 1; i >= 0; i--) {
      if (eventFromAge >= mvEvents[i].fromAge) {
        return mvEvents[i].type.substring(3).toLowerCase();
      }
    }
    return startCountry;
  }

  getOriginCountry(mvEvent, startCountry) {
    const events = this.webUI.readEvents(false);
    const mvEvents = events.filter(e => e.type && e.type.indexOf('MV-') === 0).sort((a, b) => a.fromAge - b.fromAge);
    const mvImpactId = mvEvent ? (mvEvent.id || mvEvent._mvRuntimeId || '') : '';
    const index = mvEvents.findIndex(e => e && (e.id === mvImpactId || e._mvRuntimeId === mvImpactId));
    if (index > 0) {
      return mvEvents[index - 1].type.substring(3).toLowerCase();
    }
    return startCountry;
  }

  generateEventRowId() {
    return `row_${++this.eventRowCounter}`;
  }

  /* ------------------------------------------------------------
     Inflow / Outflow visual helpers
  ------------------------------------------------------------ */
  isInflow(eventType) {
    return ['SI', 'SInp', 'SI2', 'SI2np', 'UI', 'RI', 'DBI', 'FI'].includes(eventType);
  }

  isOutflow(eventType) {
    return ['E'].includes(eventType); // SM handled separately
  }

  isStockMarket(eventType) {
    return ['SM'].includes(eventType);
  }

  isRealEstate(eventType) {
    return ['R', 'M'].includes(eventType);
  }

  applyTypeColouring(row) {
    const typeVal = row.querySelector('.event-type')?.value;
    const toggle = row.querySelector('.dd-toggle');
    if (!toggle) return;
    /* Reset all possible styling classes, including the new 'nop' marker */
    toggle.classList.remove('inflow', 'outflow', 'real-estate', 'stock-market', 'nop');

    /* Apply appropriate class based on the event type */
    if (typeVal === 'NOP') {
      toggle.classList.add('nop');
    } else if (this.isStockMarket(typeVal)) {
      toggle.classList.add('stock-market');
    } else if (this.isRealEstate(typeVal)) {
      toggle.classList.add('real-estate');
    } else if (this.isInflow(typeVal)) {
      toggle.classList.add('inflow');
    } else if (this.isOutflow(typeVal)) {
      toggle.classList.add('outflow');
    }
  }

  /**
   * Check if an event row is empty (NOP type and all fields blank)
   */
  isEventEmpty(row) {
    const typeInput = row.querySelector('.event-type');
    const nameInput = row.querySelector('.event-name');
    const amountInput = row.querySelector('.event-amount');
    const fromAgeInput = row.querySelector('.event-from-age');
    const toAgeInput = row.querySelector('.event-to-age');
    const rateInput = row.querySelector('.event-rate');
    const matchInput = row.querySelector('.event-match');

    // Check if type is NOP and all other fields are blank
    return typeInput?.value === 'NOP' &&
      (!nameInput?.value || nameInput.value.trim() === '') &&
      (!amountInput?.value || amountInput.value.trim() === '') &&
      (!fromAgeInput?.value || fromAgeInput.value.trim() === '') &&
      (!toAgeInput?.value || toAgeInput.value.trim() === '') &&
      (!rateInput?.value || rateInput.value.trim() === '') &&
      (!matchInput?.value || matchInput.value.trim() === '');
  }

  /**
   * Find the first empty event row in the table
   * @returns {HTMLElement|null} The first empty row or null if none found
   */
  findEmptyEventRow() {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return null;

    const rows = tbody.querySelectorAll('tr');
    for (const row of rows) {
      if (this.isEventEmpty(row)) {
        return row;
      }
    }
    return null;
  }

  /**
   * Focus on an existing empty row and open its event type dropdown
   * @param {HTMLElement} row - The empty row to focus on
   */
  focusOnEmptyRow(row) {
    // Ensure the row is visible – scroll only if it's outside the viewport
    const rect = row.getBoundingClientRect();
    const viewportHeight = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    const needsScroll = rect.top < 0 || rect.bottom > viewportHeight;
    if (needsScroll) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    const openDropdownProgrammatically = () => {
      // Prefer programmatic API when available for robustness
      if (row._eventTypeDropdown && typeof row._eventTypeDropdown.open === 'function') {
        row._eventTypeDropdown.open();
        return;
      }
      const toggle = row.querySelector('.event-type-dd');
      if (toggle) {
        toggle.click();
      }
    };

    // If we scrolled, wait until the row position stabilizes before opening (Safari-friendly)
    if (needsScroll) {
      const start = Date.now();
      let lastTop = row.getBoundingClientRect().top;
      let stableCount = 0;
      const checkStable = () => {
        const nowTop = row.getBoundingClientRect().top;
        if (Math.abs(nowTop - lastTop) < 1) {
          stableCount++;
        } else {
          stableCount = 0;
        }
        lastTop = nowTop;
        if (stableCount >= 3 || Date.now() - start > 1500) {
          openDropdownProgrammatically();
        } else {
          requestAnimationFrame(checkStable);
        }
      };
      requestAnimationFrame(checkStable);
    } else {
      // Already in view – open on next frame
      requestAnimationFrame(openDropdownProgrammatically);
    }

    // Safety retry in case the first attempt gets ignored under load
    setTimeout(() => openDropdownProgrammatically(), 1200);
  }

  /**
   * Open empty event in accordion mode
   */
  openEmptyInAccordion() {
    const emptyRow = this.findEmptyEventRow();
    if (!emptyRow || !this.webUI.eventAccordionManager) return;

    const rowId = emptyRow.dataset.rowId;

    // Fast-path: if the accordion item for this empty row is already open, show its dropdown
    const toggleNow = document.querySelector(`#AccordionEventTypeToggle_${rowId}`);
    if (toggleNow) {
      const contentEl = toggleNow.closest('.accordion-item-content');
      if (contentEl && contentEl.classList.contains('expanded')) {
        toggleNow.click();
        return;
      }
    }

    // Otherwise sync accordion with current table state and proceed
    this.webUI.eventAccordionManager.refresh();

    const emptyEvent = this.webUI.eventAccordionManager.events.find(e => e.rowId === rowId);
    if (!emptyEvent) return;

    const accordionId = emptyEvent.accordionId;

    // Locate the DOM element for this accordion item
    const accordionEl = document.querySelector(`[data-accordion-id="${accordionId}"]`)?.closest('.events-accordion-item');

    // Determine current expanded state BEFORE any potential toggle below
    const isExpanded = this.webUI.eventAccordionManager.expandedItems.has(accordionId);

    if (accordionEl) {
      if (isExpanded) {
        // Item is already open – ensure it's fully visible (no double-scroll)
        this.webUI.eventAccordionManager._scrollExpandedItemIntoView?.(accordionEl);
      } else {
        // Item collapsed – only scroll if it's off-screen. Use block:"nearest" to
        // avoid forcing the header to the middle which causes the later upward
        // correction.
        const rect = accordionEl.getBoundingClientRect();
        const viewportHeight = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        if (rect.top < 0 || rect.bottom > viewportHeight) {
          accordionEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }

    if (isExpanded) {
      // Accordion already open – auto-show dropdown
      const toggle = document.querySelector(`#AccordionEventTypeToggle_${rowId}`);
      if (toggle) toggle.click();
    } else {
      // Accordion collapsed – just expand, leave dropdown closed
      this.webUI.eventAccordionManager.toggleAccordionItem(accordionId);
    }
  }

  /**
   * Replace an empty row with event data from wizard
   * @param {HTMLElement} emptyRow - The empty row to replace
   * @param {Object} eventData - Data from the wizard
   */
  replaceEmptyRowWithEvent(emptyRow, eventData) {
    // Create a new properly structured row with the wizard data
    const newRow = this.createEventRow(
      eventData.eventType || '',
      eventData.name || '',
      eventData.amount || '',
      eventData.fromAge || '',
      eventData.toAge || '',
      eventData.rate || '',
      eventData.match || ''
    );
    const newEventId = newRow.dataset.eventId; // capture ID for accordion highlight

    // Preserve the position by inserting the new row before the empty row
    const tbody = emptyRow.parentNode;
    if (tbody) {
      tbody.insertBefore(newRow, emptyRow);
      // Remove the empty row
      emptyRow.remove();
    }

    // Setup formatting for new inputs
    this.webUI.formatUtils.setupCurrencyInputs();
    this.webUI.formatUtils.setupPercentageInputs();

    // Apply highlight animation to the new row
    this.applyHighlightAnimation(newRow);

    // Trigger sorting if needed
    if (this.sortKeys && this.sortKeys.length > 0) {
      this.applySortingWithAnimation();
    } else {
      // No sorting active – let highlight animation handle any needed scrolling
    }

    // Refresh accordion with highlight if it's active
    if (this.viewMode === 'accordion' && this.webUI.eventAccordionManager) {
      this.webUI.eventAccordionManager.refreshWithNewEventAnimation(eventData, newEventId);
    }

    // Call detector after replacing row
    if (Config.getInstance().isRelocationEnabled()) {
      try {
        var events = this.webUI.readEvents(false);
        var startCountry = Config.getInstance().getStartCountry();
        RelocationImpactDetector.analyzeEvents(events, startCountry);
        this.updateRelocationImpactIndicators(events);
        this.webUI.updateStatusForRelocationImpacts(events);
      } catch (err) {
        console.error('Error analyzing relocation impacts:', err);
      }
    }
    // Refresh chart relocation transitions
    if (this.webUI.chartManager) {
      RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.chartManager);
      this.webUI.chartManager.setupChartCurrencyControls(this.webUI);
      this.webUI.chartManager.refreshChartsWithCurrency();
    }
    // Refresh table currency controls
    if (this.webUI.tableManager) {
      RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.tableManager);
      this.webUI.tableManager.setupTableCurrencyControls();
    }
  }

  /**
   * Apply highlight animation to a table row
   * @param {HTMLElement} row - The row to animate
   */
  applyHighlightAnimation(row) {
    if (!row) return;

    // Find the table container to temporarily allow overflow
    const tableContainer = row.closest('.table-container');
    const eventsTable = document.getElementById('Events');

    // Temporarily allow overflow to prevent clipping
    if (tableContainer) {
      tableContainer.style.overflow = 'visible';
    }
    if (eventsTable) {
      eventsTable.style.overflow = 'visible';
    }

    // Add pulse animation class
    row.classList.add('new-event-highlight');

    // Remove highlight and restore overflow after animation completes
    setTimeout(() => {
      row.classList.remove('new-event-highlight');

      // Restore original overflow settings
      if (tableContainer) {
        tableContainer.style.overflow = '';
      }
      if (eventsTable) {
        eventsTable.style.overflow = '';
      }
    }, 800); // Match animation duration
  }

  /**
   * Update wizard button visibility based on whether event is empty
   */
  updateWizardIconsVisibility(row) {
    const wizardButton = row.querySelector('.wizard-icons');
    const dropdown = row.querySelector('.event-type-dd');

    if (!wizardButton || !dropdown) return;

    const isEmpty = this.isEventEmpty(row);

    if (isEmpty) {
      wizardButton.style.display = 'flex';
      dropdown.classList.add('has-wizard-icons');
    } else {
      wizardButton.style.display = 'none';
      dropdown.classList.remove('has-wizard-icons');
    }
  }

  createEventRow(type = '', name = '', amount = '', fromAge = '', toAge = '', rate = '', match = '') {
    const rowId = this.generateEventRowId();
    const row = document.createElement('tr');
    row.dataset.rowId = rowId;
    row.dataset.originalEventType = type;

    // Store creation index for natural sorting order
    row.dataset.creationIndex = this.eventRowCounter;

    // Generate unique ID for this event to track it in accordion view
    const eventId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    row.dataset.eventId = eventId;

    // Build dropdown options & find label for current selection
    let optionObjects = this.getEventTypeOptionObjects();
    let direct = optionObjects.find((o) => o.value === type);
    // If incoming type is MV-* and not present, synthesize an option so we don't downgrade to NOP
    if (!direct && type && typeof type === 'string' && type.indexOf('MV-') === 0) {
      const code = type.substring(3).toLowerCase();
      const countries = Config.getInstance().getAvailableCountries();
      const match = Array.isArray(countries) ? countries.find(c => String(c.code).toLowerCase() === code) : null;
      if (match) {
        const label = match ? `→ ${match.name}` : type;
        const synthetic = match ? { value: type, label, description: `Relocation to ${match.name}` } : { value: type, label: type };
        if (!optionObjects.find(o => o.value === type)) {
          optionObjects = optionObjects.concat([synthetic]);
        }
        direct = synthetic;
      }
    }
    const selectedObj = direct || optionObjects.find((o) => o.value === 'NOP') || optionObjects[0];
    if (!direct) {
      // Check relocation enabled status (variable unused but kept for potential future use)
      const cfg = (typeof Config !== 'undefined' && Config.getInstance) ? Config.getInstance() : null;
      const relocationEnabled = !!(cfg && cfg.isRelocationEnabled && cfg.isRelocationEnabled());
    }
    const selectedLabel = selectedObj.label;

    row.innerHTML = `
      <td>
          <input type="hidden" id="EventTypeValue_${rowId}" class="event-type" value="${type || selectedObj.value}">
          <div class="event-type-container">
              <button class="wizard-icons" style="display: none;" id="EventWizard_${rowId}" title="Launch wizard to create event" type="button">🌟</button>
              <div class="event-type-dd visualization-control" id="EventType_${rowId}">
                  <span id="EventTypeToggle_${rowId}" class="dd-toggle pseudo-select">${selectedLabel}</span>
                  <div id="EventTypeOptions_${rowId}" class="visualization-dropdown" style="display:none;"></div>
              </div>
          </div>
      </td>
      <td><input type="text" id="EventAlias_${rowId}" class="event-name" value="${name}"></td>
      <td><input type="text" id="EventAmount_${rowId}" class="event-amount currency" inputmode="numeric" pattern="[0-9]*" step="1000" value="${amount}"></td>
      <td><input type="text" id="EventFromAge_${rowId}" class="event-from-age" inputmode="numeric" pattern="[0-9]*" value="${fromAge}"></td>
      <td><input type="text" id="EventToAge_${rowId}" class="event-to-age" inputmode="numeric" pattern="[0-9]*" value="${toAge}"></td>
      <td><div class="percentage-container"><input type="text" id="EventRate_${rowId}" class="event-rate percentage" inputmode="numeric" pattern="[0-9]*" placeholder="inflation" value="${rate}"></div></td>
      <td><div class="percentage-container"><input type="text" id="EventMatch_${rowId}" class="event-match percentage" inputmode="numeric" pattern="[0-9]*" value="${match}"></div></td>
      <td>
          <button class="delete-event" title="Delete event">
            <i class="fas fa-trash"></i>
          </button>
      </td>
    `;

    /* =============================================================
       Instantiate dropdown for this row
    ============================================================= */
    const typeInput = row.querySelector(`#EventTypeValue_${rowId}`);
    const toggleEl = row.querySelector(`#EventTypeToggle_${rowId}`);
    const dropdownEl = row.querySelector(`#EventTypeOptions_${rowId}`);

    const dropdown = DropdownUtils.create({
      toggleEl,
      dropdownEl,
      options: optionObjects,
      selectedValue: selectedObj.value,
      onSelect: async (val, label) => {
        if (val === 'MV') {
          // Guard relocation flow if disabled
          const relocationEnabled = (typeof Config !== 'undefined' && Config.getInstance && Config.getInstance().isRelocationEnabled && Config.getInstance().isRelocationEnabled());
          if (!relocationEnabled) {
            if (this.webUI && typeof this.webUI.showToast === 'function') {
              this.webUI.showToast('Relocation is not available in this build.', 'Feature Disabled', 6);
            }
            return;
          }
          // Show country selection modal
          this.showCountrySelectionModal(async (selectedCountryCode, selectedCountryName) => {
            // User selected a country - update event type to MV-XX
            const fullEventType = `MV-${selectedCountryCode.toUpperCase()}`;
            typeInput.value = fullEventType;
            toggleEl.textContent = `→ ${selectedCountryName}`;
            row.dataset.originalEventType = fullEventType;
            this.updateFieldVisibility(typeInput);
            this.applyTypeColouring(row);
            typeInput.dispatchEvent(new Event('change', { bubbles: true }));

            // Sync tax rulesets
            var currentEvents = null;
            var startCountry = null;
            try {
              const config = Config.getInstance();
              startCountry = config.getStartCountry();
              if (this.webUI && typeof this.webUI.readEvents === 'function') {
                currentEvents = this.webUI.readEvents(false);
              } else if (typeof uiManager !== 'undefined' && uiManager && typeof uiManager.readEvents === 'function') {
                currentEvents = uiManager.readEvents(false);
              }
              if (currentEvents) {
                await config.syncTaxRuleSetsWithEvents(currentEvents, startCountry);
              }
            } catch (err) {
              console.error('Error syncing tax rulesets:', err);
            }

            // Call detector after MV-* event selection
            if (Config.getInstance().isRelocationEnabled()) {
              try {
                var summary = RelocationImpactDetector.analyzeEvents(currentEvents, startCountry);
                if (summary.totalImpacted > 0) {
                  console.log('Relocation impact analysis:', summary);
                  // Optional: Show subtle notification
                  // this.webUI.showToast(summary.totalImpacted + ' events need review', 'Relocation Impact', 3);
                }
                this.updateRelocationImpactIndicators();
                this.webUI.updateStatusForRelocationImpacts(currentEvents);
              } catch (err) {
                console.error('Error analyzing relocation impacts:', err);
              }
            }

            // If wizard mode is OFF, finish here (type set, other fields remain blank)
            if (!this.isEventsWizardEnabled()) {
              return;
            }

            // Launch relocation wizard (do not set name; pass destination for defaults)
            this.startWizardForEventType('MV', { eventType: fullEventType, destCountryCode: selectedCountryCode, destCountryName: selectedCountryName });
          });
          return; // Don't continue with normal selection flow
        }
        // Normal behaviour for genuine event type selections
        typeInput.value = val;
        toggleEl.textContent = label;
        row.dataset.originalEventType = val;
        this.updateFieldVisibility(typeInput);
        this.applyTypeColouring(row);
        typeInput.dispatchEvent(new Event('change', { bubbles: true }));

        // If this is a relocation event (MV-*), sync tax rulesets
        if (val && typeof val === 'string' && val.indexOf('MV-') === 0) {
          try {
            const config = Config.getInstance();
            const startCountry = config.getStartCountry();
            let currentEvents = null;
            if (this.webUI && typeof this.webUI.readEvents === 'function') {
              currentEvents = this.webUI.readEvents(false);
            } else if (typeof uiManager !== 'undefined' && uiManager && typeof uiManager.readEvents === 'function') {
              currentEvents = uiManager.readEvents(false);
            }
            if (currentEvents) {
              await config.syncTaxRuleSetsWithEvents(currentEvents, startCountry);
            }
          } catch (err) {
            console.error('Error loading tax ruleset:', err);
          }
        }
      },
    });
    // Keep reference for later refreshes
    row._eventTypeDropdown = dropdown;

    // Store reference to the dropdown wrapper on the hidden input element
    // This allows the validation system to find the visible element to style
    if (dropdown.wrapper) {
      typeInput._dropdownWrapper = dropdown.wrapper;
    }

    // Initial visibility update
    this.updateFieldVisibility(typeInput);
    this.applyTypeColouring(row);
    this.updateWizardIconsVisibility(row);

    // Add click handler for wizard button
    const wizardButton = row.querySelector('.wizard-icons');
    // Attach tooltip to wizard button when available
    if (wizardButton && typeof TooltipUtils !== 'undefined') {
      TooltipUtils.attachTooltip(wizardButton, "Launch wizard to create event");
    }
    if (wizardButton) {
      wizardButton.addEventListener('click', (e) => {
        e.preventDefault();
        // Explicitly close the event-type dropdown (if open) before launching the wizard
        if (row._eventTypeDropdown && typeof row._eventTypeDropdown.close === 'function') {
          row._eventTypeDropdown.close();
        }
        e.stopPropagation();

        // Get current row data to pre-fill wizard
        const initialData = {
          name: row.querySelector('.event-name')?.value || '',
          amount: row.querySelector('.event-amount')?.value || '',
          fromAge: row.querySelector('.event-from-age')?.value || '',
          toAge: row.querySelector('.event-to-age')?.value || '',
          rate: row.querySelector('.event-rate')?.value || '',
          match: row.querySelector('.event-match')?.value || '',
        };

        // Launch wizard selection modal
        this.showWizardSelection(initialData);
      });
    }

    return row;
  }

  addEventRow() {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    // Store the current scroll position to prevent page jumping
    const currentScrollY = window.scrollY;

    const row = this.createEventRow();
    const eventId = row.dataset.eventId;
    /* Debug log removed */

    // Assign a stable data-row-id like row_1, row_2,...
    const tbodyRows = tbody.querySelectorAll('tr');
    const index = tbodyRows ? (tbodyRows.length + 1) : 1;
    row.setAttribute('data-row-id', 'row_' + index);

    tbody.appendChild(row);

    // Update empty state after adding a row
    this.updateEmptyStateMessage(true);

    this.webUI.formatUtils.setupCurrencyInputs();
    this.webUI.formatUtils.setupPercentageInputs();

    // Refresh accordion if it's active
    if (this.viewMode === 'accordion' && this.webUI.eventAccordionManager) {
      /* Debug log removed */

      // First refresh the accordion to include the new event
      this.webUI.eventAccordionManager.refresh();
    }

    // Prevent any automatic focus that might cause scrolling
    // Use setTimeout to ensure this runs after any potential focus events
    setTimeout(() => {
      // Restore scroll position if it changed (prevents mobile page jumping)
      if (window.scrollY !== currentScrollY) {
        window.scrollTo(0, currentScrollY);
      }
    }, 0);

    // Call detector if event type is MV-*
    if (Config.getInstance().isRelocationEnabled()) {
      try {
        var events = this.webUI.readEvents(false);
        var startCountry = Config.getInstance().getStartCountry();
        RelocationImpactDetector.analyzeEvents(events, startCountry);
        this.updateRelocationImpactIndicators(events);
        // Update currency selector when relocation events are added
        if (this.webUI.chartManager) {
          RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.chartManager);
          this.webUI.chartManager.setupChartCurrencyControls(this.webUI);
        }
        if (this.webUI.tableManager) {
          RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.tableManager);
          this.webUI.tableManager.setupTableCurrencyControls();
        }
      } catch (err) {
        console.error('Error analyzing relocation impacts:', err);
      }
    }

    // Do not apply sort immediately.
    // The row will be sorted on blur after being edited.

    return { row, id: eventId };
  }

  getEventTypeOptionObjects() {
    const simulationMode = this.webUI.getValue('simulation_mode');

    const salaryTypesConfig = [
      { code: 'SI', singleLabel: 'Salary Income', jointLabel: 'Your Salary' },
      { code: 'SInp', singleLabel: 'Salary (no pension)', jointLabel: 'Your Salary (no pension)' },
      { code: 'SI2', singleLabel: null, jointLabel: 'Their Salary' },
      { code: 'SI2np', singleLabel: null, jointLabel: 'Their Salary (no pension)' },
    ];

    const eventTypes = [
      { value: 'NOP', label: 'No Operation' },
    ];

    salaryTypesConfig.forEach((stc) => {
      if (simulationMode === 'single') {
        if (stc.singleLabel) eventTypes.push({ value: stc.code, label: stc.singleLabel });
      } else {
        eventTypes.push({ value: stc.code, label: stc.jointLabel });
      }
    });

    eventTypes.push(
      ...[
        { value: 'UI', label: 'RSU Income' },
        { value: 'RI', label: 'Rental Income' },
        { value: 'DBI', label: 'Defined Benefit Income' },
        { value: 'FI', label: 'Tax-free Income' },
        { value: 'E', label: 'Expense' },
        { value: 'R', label: 'Real Estate' },
        { value: 'M', label: 'Mortgage' },
        { value: 'SM', label: 'Stock Market' },
      ],
    );

    if (Config.getInstance().isRelocationEnabled()) {
      eventTypes.push({
        value: 'MV',
        label: 'Relocation',
        description: 'Move to another country'
      });
    }

    /* ------------------------------------------------------------
       Enrich option objects with real descriptions from help.yml
    -------------------------------------------------------------*/
    let descMap = {};
    try {
      const help = window.driver?.js?.getHelpData?.();
      if (help && Array.isArray(help.WizardSteps)) {
        help.WizardSteps.forEach((step) => {
          if (step.element === '#EventType' && Array.isArray(step.eventTypes) && step.eventTypes.length === 1) {
            const code = step.eventTypes[0];
            let desc = step.popover && step.popover.description ? step.popover.description : '';
            // Strip HTML tags for plain-text tooltip
            desc = desc.replace(/<[^>]+>/g, '').trim();
            if (desc) descMap[code] = desc;
          }
        });
      }
    } catch (err) {
      console.warn('EventsTableManager: failed to extract event type descriptions', err);
    }

    // Attach description so DropdownUtils can show tooltips.
    // Preserve any description explicitly set on the option object.
    return eventTypes.map((et) => ({
      ...et,
      description: et.description || descMap[et.value] || et.label,
    }));
  }

  setupTooltipHandlers() {
    const eventsTable = document.getElementById('Events');
    if (eventsTable) {
      // Use event delegation to handle dynamically added rows
      eventsTable.addEventListener('mouseenter', (e) => {
        if (e.target.classList.contains('event-from-age') || e.target.classList.contains('event-to-age')) {
          this.scheduleTooltip(e.target);
        }
      }, true);

      eventsTable.addEventListener('mouseleave', (e) => {
        if (e.target.classList.contains('event-from-age') || e.target.classList.contains('event-to-age')) {
          this.cancelTooltip();
        }
      }, true);
    }

    // Hide event tooltips on scroll
    document.addEventListener('scroll', () => {
      this.cancelTooltip();
    }, { passive: true });
  }

  showAlternativeTooltip(inputElement) {
    const currentValue = parseInt(inputElement.value);
    if (isNaN(currentValue) || currentValue === 0) return;

    const row = inputElement.closest('tr');
    const eventType = row.querySelector('.event-type')?.value;
    if (!eventType) return;

    const alternativeValue = this.getAlternativeValue(currentValue, eventType);
    if (alternativeValue === null) return;

    const alternativeMode = this.ageYearMode === 'year' ? 'age' : 'year';
    const tooltipText = this.formatTooltipText(alternativeValue, alternativeMode);

    this.createTooltip(inputElement, tooltipText);
  }

  getAlternativeValue(inputValue, eventType) {
    const startingAge = parseInt(this.webUI.getValue('StartingAge')) || 0;
    const p2StartingAge = parseInt(this.webUI.getValue('P2StartingAge')) || 0;
    const currentYear = Config.getInstance().getSimulationStartYear();

    const isP2Event = eventType === 'SI2' || eventType === 'SI2np';
    const relevantStartingAge = isP2Event ? p2StartingAge : startingAge;
    if (relevantStartingAge === 0) return null;

    const birthYear = currentYear - relevantStartingAge;

    if (this.ageYearMode === 'age') {
      // Converting from age to year
      return birthYear + inputValue;
    } else {
      // Converting from year to age
      return inputValue - birthYear;
    }
  }

  formatTooltipText(alternativeValue, alternativeMode) {
    const modeLabel = alternativeMode === 'year' ? 'Year' : 'Age';
    return `${modeLabel} ${alternativeValue}`;
  }

  createTooltip(inputElement, text) {
    this.hideTooltip(); // Remove any existing tooltip

    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'conversion-tooltip';
    this.tooltipElement.textContent = text;
    document.body.appendChild(this.tooltipElement);

    const rect = inputElement.getBoundingClientRect();
    this.tooltipElement.style.left = `${rect.left + rect.width / 2}px`;
    this.tooltipElement.style.top = `${rect.top}px`;

    // Trigger the visible state
    requestAnimationFrame(() => {
      if (this.tooltipElement) {
        this.tooltipElement.classList.add('visible');
      }
    });
  }

  scheduleTooltip(inputElement) {
    // Clear any existing timeout
    this.cancelTooltip();

    // Schedule tooltip to show after delay
    this.tooltipTimeout = setTimeout(() => {
      this.showAlternativeTooltip(inputElement);
    }, 600); // 600ms delay
  }

  cancelTooltip() {
    // Clear any pending timeout
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }

    // Hide any visible tooltip
    this.hideTooltip();
  }

  hideTooltip() {
    if (this.tooltipElement) {
      this.tooltipElement.remove();
      this.tooltipElement = null;
    }
  }

  /* ---------------- Sorting Helpers ---------------- */

  setupColumnSortHandlers() {
    const headers = document.querySelectorAll('#Events thead th.sortable');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const col = header.dataset.col;
        if (!col) return;

        if (this.sortColumn !== col) {
          this.sortColumn = col;
          this.sortDir = 'asc';
        } else {
          if (this.sortDir === 'asc') {
            this.sortDir = 'desc';
          } else if (this.sortDir === 'desc') {
            this.sortColumn = null;
            this.sortDir = null;
          } else {
            this.sortDir = 'asc';
          }
        }

        // Apply the sort
        setTimeout(() => this.applySort(true), 0);
      });
    });
  }

  setupAutoSortOnBlur() {
    const eventsTable = document.getElementById('Events');
    if (!eventsTable) return;
    const shouldSuppressSortForTarget = (target) => {
      if (!target || typeof target.closest !== 'function') return false;
      return !!(
        target.closest('.relocation-impact-badge') ||
        target.closest('.resolution-panel-row') ||
        target.closest('.resolution-panel-container') ||
        target.closest('.resolution-apply') ||
        target.closest('.resolution-tab') ||
        target.closest('.panel-close-btn')
      );
    };
    const markSuppressSort = (target) => {
      if (!shouldSuppressSortForTarget(target)) return;
      this._suppressAutoSortUntil = Date.now() + 750;
    };
    eventsTable.addEventListener('pointerdown', (e) => {
      markSuppressSort(e.target);
    }, true);
    eventsTable.addEventListener('mousedown', (e) => {
      markSuppressSort(e.target);
    }, true);
    eventsTable.addEventListener('touchstart', (e) => {
      markSuppressSort(e.target);
    }, true);
    eventsTable.addEventListener('blur', (e) => {
      if (this._suppressAutoSortUntil && Date.now() < this._suppressAutoSortUntil) return;
      const related = e.relatedTarget;
      const relatedIsRelocationBadge = !!(
        related &&
        (
          (related.classList && related.classList.contains('relocation-impact-badge')) ||
          (typeof related.closest === 'function' && related.closest('.relocation-impact-badge'))
        )
      );
      const relatedIsResolutionControl = !!(
        related &&
        (
          (related.classList && related.classList.contains('resolution-apply')) ||
          (typeof related.closest === 'function' && (
            related.closest('.resolution-panel-row') ||
            related.closest('.resolution-panel-container') ||
            related.closest('.resolution-tab') ||
            related.closest('.panel-close-btn')
          ))
        )
      );
      if (relatedIsRelocationBadge) return;
      if (relatedIsResolutionControl) return;
      if (e.target.matches('input') && this.sortKeys.length > 0) {
        this.applySort();
      }
    }, true);
  }

  applySort() {
    // Collapse any open inline resolution panels before reordering rows
    RelocationImpactAssistant.collapseAllPanels();
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    // Build sortKeys array from current column/dir selection
    this.sortKeys = (this.sortColumn && this.sortDir)
      ? [{ col: this.sortColumn, dir: this.sortDir }]
      : [];

    // Persist or clear saved sort state
    try {
      if (this.sortKeys.length === 0) {
        localStorage.removeItem('eventsSortColumn');
        localStorage.removeItem('eventsSortDir');
      } else {
        localStorage.setItem('eventsSortColumn', String(this.sortColumn));
        localStorage.setItem('eventsSortDir', String(this.sortDir));
      }
    } catch (_) { /* ignore storage errors */ }

    if (this.sortKeys.length === 0) {
      // When sorting is deactivated, restore natural creation order
      if (window.RowSorter) {
        RowSorter.sortRows(tbody, [{ col: 'creation-index', dir: 'asc' }]);
      }
      this.updateHeaderIndicators();
      // Update accordion row indices after restoring natural order
      this.updateAccordionRowIndices();
      // Notify accordion that sorting was cleared
      this.notifyAccordionOfSortChange();
      return;
    }

    if (window.RowSorter) {
      RowSorter.sortRows(tbody, this.sortKeys);
    }

    this.updateHeaderIndicators();

    // CRITICAL FIX: Update tableRowIndex values in accordion manager after sorting
    this.updateAccordionRowIndices();

    // Notify accordion of sort change
    this.notifyAccordionOfSortChange();

    // Call updateRelocationImpactIndicators after sorting
    if (Config.getInstance().isRelocationEnabled()) {
      const events = this.webUI.readEvents(false);
      this.updateRelocationImpactIndicators(events);
      this.webUI.updateStatusForRelocationImpacts(events);
      // Recompute relocation transitions and refresh charts so markers/currency mapping stay aligned
      if (this.webUI && this.webUI.chartManager) {
        RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.chartManager);
        this.webUI.chartManager.refreshChartsWithCurrency();
      }
    }
  }

  /**
   * Restore saved table sort state from localStorage
   */
  restoreSavedSort() {
    try {
      const savedCol = localStorage.getItem('eventsSortColumn');
      const savedDir = localStorage.getItem('eventsSortDir');
      if (!savedCol || !savedDir) return;

      // Validate saved column against current sortable headers
      const header = document.querySelector(`#Events thead th.sortable[data-col="${savedCol}"]`);
      if (!header) return; // ignore invalid/obsolete column keys

      // Validate direction
      const dir = (savedDir === 'asc' || savedDir === 'desc') ? savedDir : null;
      if (!dir) return;

      this.sortColumn = savedCol;
      this.sortDir = dir;
    } catch (_) { /* ignore */ }
  }

  /**
   * Update tableRowIndex values in accordion manager after sorting
   * This ensures that the accordion view can correctly map to table rows
   * even after the table has been sorted
   */
  updateAccordionRowIndices() {
    if (!this.webUI.eventAccordionManager) return;

    const tableRows = document.querySelectorAll('#Events tbody tr');
    const eventIdToIndexMap = new Map();

    // Create a map of eventId to new table row index
    Array.from(tableRows).forEach((row, index) => {
      const eventId = row.dataset.eventId;
      if (eventId) {
        eventIdToIndexMap.set(eventId, index);
      }
    });

    // Update tableRowIndex for each event in the accordion manager
    this.webUI.eventAccordionManager.events.forEach(event => {
      const newIndex = eventIdToIndexMap.get(event.id);
      if (newIndex !== undefined) {
        event.tableRowIndex = newIndex;
      }
    });
  }

  /**
   * Notify accordion manager of sorting changes
   */
  notifyAccordionOfSortChange() {
    if (this.webUI.eventAccordionManager) {
      // Always update row indices when sorting changes
      this.updateAccordionRowIndices();

      // Only refresh if accordion is currently visible
      if (this.viewMode === 'accordion') {
        this.webUI.eventAccordionManager.refresh();
      }
    }
  }

  updateHeaderIndicators() {
    const headers = document.querySelectorAll('#Events thead th.sortable');
    headers.forEach(h => {
      h.classList.remove('sorted-asc', 'sorted-desc', 'sorted-secondary');
      const caret = h.querySelector('.sort-caret');
      if (caret) caret.textContent = '⇅';
    });

    if (!this.sortKeys.length) return;

    // Primary key
    const primary = this.sortKeys[0];
    const primaryHeader = document.querySelector(`#Events thead th.sortable[data-col="${primary.col}"]`);
    if (primaryHeader) {
      primaryHeader.classList.add(primary.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      const caret = primaryHeader.querySelector('.sort-caret');
      if (caret) caret.textContent = primary.dir === 'asc' ? '▲' : '▼';
    }

    // Secondary keys (if any)
    if (this.sortKeys.length > 1) {
      this.sortKeys.slice(1).forEach(sec => {
        const secHeader = document.querySelector(`#Events thead th.sortable[data-col="${sec.col}"]`);
        if (secHeader) {
          secHeader.classList.add('sorted-secondary');
          const caret = secHeader.querySelector('.sort-caret');
          if (caret) caret.textContent = sec.dir === 'asc' ? '▲' : '▼';
        }
      });
    }
  }

  // After constructor, ensure unsorted carets show correctly
  initializeCarets() {
    document.querySelectorAll('#Events thead th.sortable .sort-caret').forEach(c => {
      c.textContent = '⇅';
    });
  }

  /**
   * Show wizard selection modal for event types
   */
  showWizardSelection(initialData = {}) {
    // Get available wizards from the wizard manager
    const wizardManager = (this.webUI.eventsWizard && this.webUI.eventsWizard.manager) || this.webUI.eventsWizard;
    if (!wizardManager || !wizardManager.wizardData) {
      console.error('Wizard manager not available');
      return;
    }

    const wizards = wizardManager.wizardData.EventWizards;
    if (!wizards || wizards.length === 0) {
      console.error('No wizards available');
      return;
    }

    // Check for existing empty row and store reference for replacement
    // This ensures consistent behavior regardless of how the wizard was invoked
    if (!this.pendingEmptyRowForReplacement) {
      const existingEmptyRow = this.findEmptyEventRow();
      if (existingEmptyRow) {
        this.pendingEmptyRowForReplacement = existingEmptyRow;
      }
    }

    // Filter out relocation wizard when relocation is disabled
    const relocationEnabled = (typeof Config !== 'undefined' && Config.getInstance && Config.getInstance().isRelocationEnabled && Config.getInstance().isRelocationEnabled());
    const filtered = relocationEnabled ? wizards : wizards.filter(w => w.eventType !== 'MV');

    // Create selection modal
    this.createWizardSelectionModal(filtered, initialData);
  }

  /**
   * Create and display wizard selection modal
   * @param {Array} wizards - Available wizard configurations
   */
  createWizardSelectionModal(wizards, initialData = {}) {
    // Remove any existing modal
    const existingModal = document.getElementById('wizardSelectionOverlay');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'wizard-overlay';
    overlay.id = 'wizardSelectionOverlay';

    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'event-wizard-modal event-wizard-selection-modal';

    // Modal header
    const header = document.createElement('div');
    header.className = 'event-wizard-step-header';

    const title = document.createElement('h3');
    title.textContent = 'Choose Event Type';
    header.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Select the type of event you want to create:';
    subtitle.className = 'event-wizard-selection-subtitle';
    header.appendChild(subtitle);

    modal.appendChild(header);

    // Modal body with wizard options
    const body = document.createElement('div');
    body.className = 'event-wizard-step-body';

    const wizardGrid = document.createElement('div');
    wizardGrid.className = 'wizard-selection-grid';

    wizards.forEach(wizard => {
      const option = document.createElement('div');
      option.className = 'wizard-selection-option';
      option.dataset.eventType = wizard.eventType;
      option.dataset.category = wizard.category; // expose category to CSS
      option.classList.add(`wizard-category-${wizard.category}`);

      option.innerHTML = `
        <div class="wizard-option-content">
          <h4>${wizard.name}</h4>
        </div>
      `;

      // Add click handler
      option.addEventListener('click', () => {
        // Special handling for Relocation: show country selection first
        if (wizard.eventType === 'MV') {
          // Guard relocation flow if disabled
          const relocationEnabled = (typeof Config !== 'undefined' && Config.getInstance && Config.getInstance().isRelocationEnabled && Config.getInstance().isRelocationEnabled());
          if (!relocationEnabled) {
            if (this.webUI && typeof this.webUI.showToast === 'function') {
              this.webUI.showToast('Relocation is not available in this build.', 'Feature Disabled', 6);
            }
            return;
          }
          // Ensure pending empty row reference is set if there is an empty NOP row
          if (!this.pendingEmptyRowForReplacement) {
            const existingEmptyRow = this.findEmptyEventRow();
            if (existingEmptyRow) {
              this.pendingEmptyRowForReplacement = existingEmptyRow;
            }
          }
          // Close wizard selection before opening the country modal
          overlay.remove();
          // Open country selection modal; after selection launch MV wizard with destination context
          this.showCountrySelectionModal(async (code, name) => {
            const full = `MV-${code.toUpperCase()}`;
            const cfg = (typeof Config !== 'undefined' && Config.getInstance) ? Config.getInstance() : null;
            if (cfg && typeof cfg.getTaxRuleSet === 'function') {
              try {
                await cfg.getTaxRuleSet(code.toLowerCase());
              } catch (_) {
                // Ruleset loading failed; wizard will still launch but may show warnings
              }
            }
            this.startWizardForEventType('MV', {
              eventType: full,
              destCountryCode: code,
              destCountryName: name
            });
          });
          return;
        }
        this.startWizardForEventType(wizard.eventType, initialData);
        overlay.remove();
      });

      wizardGrid.appendChild(option);
    });

    body.appendChild(wizardGrid);
    modal.appendChild(body);

    // Modal footer
    const footer = document.createElement('div');
    footer.className = 'event-wizard-step-footer';

    // Use a button container to apply consistent right-alignment styles
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'event-wizard-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'event-wizard-button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
      // Clear pending empty row reference when wizard selection is cancelled
      this.pendingEmptyRowForReplacement = null;
      overlay.remove();
    });

    // Append the cancel button to the container, then container to footer
    buttonContainer.appendChild(cancelButton);
    footer.appendChild(buttonContainer);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      // Mobile fix: if the previous Back navigation set the ignore flag, consume
      // this first overlay click without closing the selection modal. This
      // prevents the tap sequence that triggered Back from immediately
      // dismissing the newly opened wizard-selection overlay on touch devices.
      const wizardMgr = (this.webUI?.eventsWizard && this.webUI.eventsWizard.manager) || this.webUI?.eventsWizard;
      if (wizardMgr && wizardMgr._ignoreNextOverlayClick) {
        wizardMgr._ignoreNextOverlayClick = false;
        return;
      }

      if (e.target === overlay) {
        // Clear pending empty row reference when wizard selection is cancelled
        this.pendingEmptyRowForReplacement = null;
        overlay.remove();
      }
    });

    // ESC key to close
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Clear pending empty row reference when wizard selection is cancelled
        this.pendingEmptyRowForReplacement = null;
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  }

  /**
   * Start wizard for specific event type
   * @param {string} eventType - The event type code
   */
  startWizardForEventType(eventType, initialData = {}) {
    const wizardManager = (this.webUI.eventsWizard && this.webUI.eventsWizard.manager) || this.webUI.eventsWizard;
    if (wizardManager) {
      // Guard direct MV wizard launches when relocation is disabled
      if (eventType === 'MV') {
        const relocationEnabled = (typeof Config !== 'undefined' && Config.getInstance && Config.getInstance().isRelocationEnabled && Config.getInstance().isRelocationEnabled());
        if (!relocationEnabled) {
          if (this.webUI && typeof this.webUI.showToast === 'function') {
            this.webUI.showToast('Relocation is not available in this build.', 'Feature Disabled', 6);
          }
          return;
        }
      }
      // Check for existing empty row and store reference for replacement
      // This ensures consistent behavior regardless of how the wizard was invoked
      if (!this.pendingEmptyRowForReplacement) {
        const existingEmptyRow = this.findEmptyEventRow();
        if (existingEmptyRow) {
          this.pendingEmptyRowForReplacement = existingEmptyRow;
        }
      }

      // Pass pre-populated data along with completion and cancellation callbacks
      wizardManager.startWizard(eventType, initialData,
        // onComplete callback
        (eventData) => {
          // Check if we need to replace an empty row
          if (this.pendingEmptyRowForReplacement) {
            this.replaceEmptyRowWithEvent(this.pendingEmptyRowForReplacement, eventData);
            this.pendingEmptyRowForReplacement = null; // Clear the reference
          } else {
            // Normal flow - create new event
            if (this.viewMode === 'accordion' && this.webUI.eventAccordionManager) {
              // In accordion mode, let accordion manager handle creation and animation
              this.webUI.eventAccordionManager.addEventFromWizard(eventData);
            } else {
              // In table mode, handle creation and sorting here
              this.addEventFromWizardWithSorting(eventData);
            }
          }
        },
        // onCancel callback
        () => {
          // Clear the pending empty row reference if wizard is cancelled
          this.pendingEmptyRowForReplacement = null;
        }
      );
    }
  }

  /**
   * Create event from wizard data
   * @param {Object} eventData - Data collected from wizard
   * @returns {HTMLElement} The created table row
   */
  createEventFromWizard(eventData) {
    // Generate unique ID for this event
    const id = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create a new event row with the wizard data
    const row = this.createEventRow(
      eventData.eventType || '',
      eventData.name || '',
      eventData.amount || '',
      eventData.fromAge || '',
      eventData.toAge || '',
      eventData.rate || '',
      eventData.match || ''
    );

    // Store the unique ID on the row
    row.dataset.eventId = id;

    // Ensure MV-* rows display as "→ Country" in the visible toggle immediately
    const typeVal = eventData && eventData.eventType;
    if (typeVal && typeof typeVal === 'string' && typeVal.indexOf('MV-') === 0) {
      const code = typeVal.substring(3).toLowerCase();
      const countries = Config.getInstance().getAvailableCountries();
      const match = Array.isArray(countries) ? countries.find(c => String(c.code).toLowerCase() === code) : null;
      const label = match ? `→ ${match.name}` : typeVal;
      const toggleEl = row.querySelector(`#EventTypeToggle_${row.dataset.rowId}`);
      if (toggleEl) toggleEl.textContent = label;
      // Also enrich dropdown options with synthetic MV-* so later refreshes keep the label
      if (row._eventTypeDropdown) {
        const baseOpts = this.getEventTypeOptionObjects();
        const synthetic = match ? { value: typeVal, label, description: `Relocation to ${match.name}` } : { value: typeVal, label: typeVal };
        const opts = baseOpts.find(o => o.value === typeVal) ? baseOpts : baseOpts.concat([synthetic]);
        if (row._eventTypeDropdown) row._eventTypeDropdown.setOptions(opts);
      }
      // Keep original type for logic but show arrow label
      row.dataset.originalEventType = typeVal;
    }

    // Add to table
    const tbody = document.querySelector('#Events tbody');
    if (tbody) {
      tbody.appendChild(row);

      // Update empty state after adding a row
      this.updateEmptyStateMessage(true);

      // Setup formatting for new inputs
      this.webUI.formatUtils.setupCurrencyInputs();
      this.webUI.formatUtils.setupPercentageInputs();
    }

    return { row, id };
  }

  /**
   * Add event from wizard data with sorting and animation for table view
   * @param {Object} eventData - Data collected from wizard
   */
  addEventFromWizardWithSorting(eventData) {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    // Create a new event row at the end
    const newRow = this.createEventRow(
      eventData.eventType || '',
      eventData.name || '',
      eventData.amount || '',
      eventData.fromAge || '',
      eventData.toAge || '',
      eventData.rate || '',
      eventData.match || ''
    );
    const newEventId = newRow.dataset.eventId;

    // Append to table
    tbody.appendChild(newRow);

    // Assign stable data-row-id for the new row
    const index = Array.from(tbody.querySelectorAll('tr')).indexOf(newRow) + 1;
    if (index > 0) newRow.setAttribute('data-row-id', 'row_' + index);

    // Setup formatting for new inputs
    this.webUI.formatUtils.setupCurrencyInputs();
    this.webUI.formatUtils.setupPercentageInputs();

    // Mark as just-created so animateNewTableRow can target it reliably
    newRow.classList.add('just-created');

    // Apply sorting animation
    this.applySort(); // Apply FLIP animation for moved rows

    // After sorting completes, animate the new table row highlight smoothly
    if (typeof this.animateNewTableRow === 'function') {
      setTimeout(() => { this.animateNewTableRow(eventData); }, 400);
    }

    // Refresh accordion if active
    if (this.viewMode === 'accordion' && this.webUI.eventAccordionManager) {
      this.webUI.eventAccordionManager.refreshWithNewEventAnimation(eventData, newEventId);
    }
    // Refresh chart relocation transitions
    if (this.webUI.chartManager) {
      RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.chartManager);
      this.webUI.chartManager.setupChartCurrencyControls(this.webUI);
      this.webUI.chartManager.refreshChartsWithCurrency();
    }
    // Refresh table currency controls
    if (this.webUI.tableManager) {
      RelocationUtils.extractRelocationTransitions(this.webUI, this.webUI.tableManager);
      this.webUI.tableManager.setupTableCurrencyControls();
    }
  }



  /**
   * Format category name for display
   * @param {string} category - Category name
   * @returns {string} Formatted category
   */
  formatCategory(category) {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  /**
   * Animate the newly created table row
   */
  animateNewTableRow(eventData) {
    // The new row is always the one that was just added to the DOM
    // After sorting, we need to find it by marking it during creation
    const tableRows = document.querySelectorAll('#Events tbody tr');
    let targetRow = null;

    // Look for the row that was just created (should have a temporary marker)
    targetRow = document.querySelector('#Events tbody tr.just-created');

    // If no marker found, fall back to finding by data
    if (!targetRow) {
      for (const row of tableRows) {
        if (this.isRowMatchingEventData(row, eventData)) {
          targetRow = row;
          break;
        }
      }
    }

    // Final fallback to last row
    if (!targetRow && tableRows.length > 0) {
      targetRow = tableRows[tableRows.length - 1];
    }

    if (targetRow) {
      // Find the table container to temporarily allow overflow
      const tableContainer = targetRow.closest('.table-container');
      const eventsTable = document.getElementById('Events');

      // Temporarily allow overflow to prevent clipping
      if (tableContainer) {
        tableContainer.style.overflow = 'visible';
      }
      if (eventsTable) {
        eventsTable.style.overflow = 'visible';
      }

      // Add pulse animation class
      targetRow.classList.add('new-event-highlight');

      // Make sure the row is visible before highlighting; scroll only if off-screen
      const rect = targetRow.getBoundingClientRect();
      const viewportHeight = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      if (rect.top < 0 || rect.bottom > viewportHeight) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Remove highlight and restore overflow after animation completes
      setTimeout(() => {
        targetRow.classList.remove('new-event-highlight');
        targetRow.classList.remove('just-created'); // Remove the marker

        // Restore original overflow settings
        if (tableContainer) {
          tableContainer.style.overflow = '';
        }
        if (eventsTable) {
          eventsTable.style.overflow = '';
        }
      }, 800);
    }
  }

  /**
   * Check if a table row matches the given event data
   */
  isRowMatchingEventData(row, eventData) {
    const typeInput = row.querySelector('.event-type');
    const nameInput = row.querySelector('.event-name');
    const amountInput = row.querySelector('.event-amount');
    const fromAgeInput = row.querySelector('.event-from-age');
    const toAgeInput = row.querySelector('.event-to-age');

    // Clean the amount from the table (remove currency formatting)
    const cleanRowAmount = amountInput?.value ? amountInput.value.replace(/[^0-9\.]/g, '') : '';
    const cleanEventAmount = eventData.amount ? eventData.amount.toString() : '';

    return typeInput && typeInput.value === eventData.eventType &&
      nameInput && nameInput.value === eventData.name &&
      cleanRowAmount === cleanEventAmount &&
      fromAgeInput && fromAgeInput.value === eventData.fromAge &&
      toAgeInput && toAgeInput.value === eventData.toAge;
  }

  /**
   * Check if the events table is empty and show appropriate message
   */
  checkEmptyState() {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return;

    const hasRows = tbody.querySelectorAll('tr').length > 0;
    this.updateEmptyStateMessage(hasRows);
  }

  /**
   * Update empty state message visibility
   * @param {boolean} hasEvents - Whether there are events in the table
   */
  updateEmptyStateMessage(hasEvents) {
    let emptyStateEl = document.querySelector('.table-empty-state');

    if (!hasEvents) {
      // No events - show empty state message
      if (!emptyStateEl) {
        const tableContainer = document.querySelector('.events-section .table-container');
        if (tableContainer) {
          // Create empty state element
          emptyStateEl = document.createElement('div');
          emptyStateEl.className = 'table-empty-state';
          emptyStateEl.innerHTML = `
            <p>No events yet. Add events with the wizard or using the Add Event button.</p>
          `;

          // Position it properly within the table container
          const table = tableContainer.querySelector('#Events');
          if (table) {
            // Insert after the table
            table.insertAdjacentElement('afterend', emptyStateEl);
          } else {
            // Fallback: append to container
            tableContainer.appendChild(emptyStateEl);
          }
        }
      } else {
        emptyStateEl.style.display = 'block';
      }
    } else if (emptyStateEl) {
      // Has events - hide empty state message
      emptyStateEl.style.display = 'none';
    }
  }

  /**
   * Show country selection modal
   * @param {Function} onCountrySelected - Callback function that receives (countryCode, countryName) when user selects a country
   */
  showCountrySelectionModal(onCountrySelected) {
    // Remove any existing overlay with same id
    const prev = document.getElementById('countrySelectionOverlay');
    if (prev) prev.remove();

    // Overlay using existing class naming
    const overlay = document.createElement('div');
    overlay.className = 'wizard-overlay';
    overlay.id = 'countrySelectionOverlay';

    // Modal container reusing wizard classes
    const modal = document.createElement('div');
    modal.className = 'event-wizard-modal country-selection-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'event-wizard-step-header';
    const title = document.createElement('h3');
    title.textContent = 'Select Destination Country';
    header.appendChild(title);
    modal.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'event-wizard-step-body';

    // Search
    const searchDiv = document.createElement('div');
    searchDiv.className = 'country-search';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search countries...';
    searchDiv.appendChild(searchInput);
    body.appendChild(searchDiv);

    // List
    const listDiv = document.createElement('div');
    listDiv.className = 'country-list';

    let countries = [];
    try {
      countries = Config.getInstance().getAvailableCountries();
    } catch (e) {
      console.error('Error getting available countries:', e);
      const errorDiv = document.createElement('div');
      errorDiv.textContent = 'No countries available';
      listDiv.appendChild(errorDiv);
    }

    const renderCountries = (filter = '') => {
      listDiv.innerHTML = '';
      const filtered = countries.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
      if (filtered.length === 0) {
        const noResults = document.createElement('div');
        noResults.textContent = 'No countries found';
        listDiv.appendChild(noResults);
        return;
      }
      filtered.forEach(country => {
        const option = document.createElement('div');
        option.className = 'country-option';
        option.dataset.countryCode = country.code;
        const nameDiv = document.createElement('div');
        nameDiv.className = 'country-name';
        nameDiv.textContent = country.name;
        option.appendChild(nameDiv);
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'country-details';
        detailsDiv.textContent = `Currency: ${country.currency || 'N/A'}`;
        option.appendChild(detailsDiv);
        // Hover highlight
        option.addEventListener('mouseenter', () => option.classList.add('hover'));
        option.addEventListener('mouseleave', () => option.classList.remove('hover'));
        // Click selection
        option.addEventListener('click', () => {
          option.classList.add('selected');
          onCountrySelected(country.code, country.name);
          overlay.remove();
        });
        listDiv.appendChild(option);
      });
    };

    renderCountries();
    searchInput.addEventListener('input', () => renderCountries(searchInput.value));

    body.appendChild(listDiv);
    modal.appendChild(body);

    // Footer with Cancel
    const footer = document.createElement('div');
    footer.className = 'event-wizard-step-footer';
    const buttons = document.createElement('div');
    buttons.className = 'event-wizard-buttons';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'event-wizard-button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    buttons.appendChild(cancelBtn);
    footer.appendChild(buttons);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // ESC handling
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  }

}

// Make EventsTableManager available to CommonJS consumers and browser global
this.EventsTableManager = EventsTableManager;
