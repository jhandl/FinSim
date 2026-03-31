var RelocationSplitSuggestionLib = this.RelocationSplitSuggestion;
if (!RelocationSplitSuggestionLib && typeof require === 'function') {
  RelocationSplitSuggestionLib = require('./RelocationSplitSuggestion.js').RelocationSplitSuggestion;
}

class EventsTableManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.eventRowCounter = 0;
    this._compactIdCounters = {};
    this.ageYearMode = 'age'; // Track current toggle mode
    this.viewMode = 'table'; // Track current view mode (table/accordion)
    this.tooltipElement = null; // Reference to current tooltip
    this.tooltipTimeout = null; // Reference to tooltip delay timeout
    this._detectorTimeout = null; // For debouncing detector calls
    this._mortgageImpactTimeout = null;
    this._suppressMortgagePlanSync = false;
    this._pendingAutoPayoffIds = {};
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
    const deletedType = row && row.querySelector('.event-type') ? String(row.querySelector('.event-type').value || '') : '';
    const deletedId = row && row.querySelector('.event-name') ? String(row.querySelector('.event-name').value || '').trim() : '';
    // If an inline resolution panel is open for this row, collapse it first to clean up listeners
    const maybePanel = row && row.nextElementSibling;
    if (maybePanel && maybePanel.classList && maybePanel.classList.contains('resolution-panel-row')) {
      this.collapseResolutionPanel(row.dataset.rowId);
    }
    const relocationMarkerIds = this._getRelocationMarkerIdsForDeletedRow(row);
    if (relocationMarkerIds.length) {
      this._clearResolutionOverridesForRelocationMarkers(relocationMarkerIds);
      this._clearRelocationAgeShift(relocationMarkerIds);
    }

    // Handle orphan mortgage-linked events if an 'R' event is deleted
    const typeInput = row.querySelector('.event-type');
    const nameInput = row.querySelector('.event-name');
    if (typeInput && typeInput.value === 'R' && nameInput) {
      const oldName = nameInput.value;
      const tbody = row.closest('tbody');
      if (oldName && tbody) {
        tbody.querySelectorAll('tr').forEach(mRow => {
          const mTypeInput = mRow.querySelector('.event-type');
          const mNameInput = mRow.querySelector('.event-name');
          if (mTypeInput && this.isPropertyLinkedEvent(mTypeInput.value) && mNameInput && mNameInput.value === oldName) {
            mNameInput.value = '';
            mNameInput.dispatchEvent(new Event('change', { bubbles: true }));
            if (mRow._eventMortgageDropdown) {
              this.updateMortgageOptions(mRow);
            }
          }
        });
      }
    }
    if (typeInput && typeInput.value === 'M' && nameInput) {
      const oldName = nameInput.value;
      const tbody = row.closest('tbody');
      if (oldName && tbody) {
        tbody.querySelectorAll('tr').forEach(linkedRow => {
          const linkedTypeInput = linkedRow.querySelector('.event-type');
          const linkedNameInput = linkedRow.querySelector('.event-name');
          if (!linkedTypeInput || !linkedNameInput) return;
          if ((linkedTypeInput.value === 'MO' || linkedTypeInput.value === 'MP') && linkedNameInput.value === oldName) {
            linkedNameInput.value = '';
            linkedNameInput.dispatchEvent(new Event('change', { bubbles: true }));
            if (linkedRow._eventMortgageDropdown) {
              this.updateMortgageOptions(linkedRow);
            }
          }
        });
      }
    }

    // Check if this is the only row
    const allRows = document.querySelectorAll('#Events tbody tr');
    const isLastRow = allRows.length === 1;

    if (isLastRow) {
      // Simple fade for last row
      row.classList.add('deleting-last');
      setTimeout(() => {
        row.remove();
        this._syncMortgagePlanAfterDeletion(deletedType, deletedId);
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
        this.updateEventRowsVisibilityAndTypes();
        this._refreshValidation();
      }, 400);
    } else {
      // Complex animation with slide-up for multiple rows
      this.deleteRowWithSlideUp(row);
    }
  }

  /**
   * Delete row with slide-up animation for remaining rows
   */
  deleteRowWithSlideUp(rowToDelete, options = {}) {
    // If an inline resolution panel is open for this row, collapse it first to clean up listeners
    const maybePanel = rowToDelete && rowToDelete.nextElementSibling;
    if (maybePanel && maybePanel.classList && maybePanel.classList.contains('resolution-panel-row')) {
      this.collapseResolutionPanel(rowToDelete.dataset.rowId);
    }

    const deletedType = rowToDelete && rowToDelete.querySelector('.event-type') ? String(rowToDelete.querySelector('.event-type').value || '') : '';
    const deletedId = rowToDelete && rowToDelete.querySelector('.event-name') ? String(rowToDelete.querySelector('.event-name').value || '').trim() : '';
    const skipMortgageSync = !!(options && options.skipMortgageSync);
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
      if (!skipMortgageSync) this._syncMortgagePlanAfterDeletion(deletedType, deletedId);

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
        this.updateEventRowsVisibilityAndTypes();
        this._refreshValidation();
      }, 300); // Wait for slide animation to complete
    }, 200); // Wait for fade to complete
  }

  _syncMortgagePlanAfterDeletion(deletedType, deletedId) {
    const type = String(deletedType || '');
    const id = String(deletedId || '').trim();
    if (!id) return;
    if (type !== 'MO' && type !== 'MP') return;
    this._syncMortgagePlanById(id, { sourceType: type, sourceField: 'delete', forceAutoAlign: true });
  }

  // Single recomputation call used post-deletion regardless of row position/animation path
  recomputeRelocationImpacts(options = {}) {
    const cfg = (typeof Config !== 'undefined' && Config.getInstance) ? Config.getInstance() : null;
    if (!cfg || !cfg.isRelocationEnabled || !cfg.isRelocationEnabled()) return;
    const events = this.webUI.readEvents(false);
    const startCountry = Config.getInstance().getStartCountry();

    if (typeof RelocationImpactDetector !== 'undefined') {
      RelocationImpactDetector.analyzeEvents(events, startCountry);
    }
    this.updateRelocationImpactIndicators(events);
    this.webUI.updateStatusForRelocationImpacts(this._getRelocationStatusEvents(events));
    // Ensure accordion view reflects latest table state
    if (!options.skipAccordionRefresh && this.webUI.eventAccordionManager) this.webUI.eventAccordionManager.refresh();

  }

  _refreshValidation() {
    if (this.webUI) {
      this.webUI.clearAllWarnings();
      const uiMgr = (typeof uiManager !== 'undefined') ? uiManager : (this.webUI.uiManager);
      if (uiMgr && typeof uiMgr.readEvents === 'function') {
        uiMgr.readEvents(true);
      }
    }
  }

  setupEventTypeChangeHandler() {
    const eventsTable = document.getElementById('Events');
    if (eventsTable) {
      eventsTable.addEventListener('change', (e) => {
        if (e.target.classList.contains('event-from-age')) {
          const row = e.target.closest('tr');
          const typeInput = row ? row.querySelector('.event-type') : null;
          const typeValue = typeInput ? typeInput.value : '';
          if (typeValue === 'MV') {
            const rowKey = row && row.dataset ? (row.dataset.rowId || row.dataset.eventId || '') : '';
            const cachedOldAge = Number(rowKey ? this._mvAgesByRowId[rowKey] : NaN);
            const focusedOldAge = Number(e.target.dataset ? e.target.dataset.mvPrevAge : NaN);
            const newAge = Number(e.target.value);
            const oldAge = !isNaN(focusedOldAge) ? focusedOldAge : cachedOldAge;
            if (!isNaN(oldAge) && !isNaN(newAge) && oldAge !== newAge) {
              const cfg = (typeof Config !== 'undefined' && Config.getInstance) ? Config.getInstance() : null;
              if (cfg && cfg.shouldAutoShiftOnRelocationAgeChange && cfg.shouldAutoShiftOnRelocationAgeChange()) {
                const markerIds = this._getRelocationMarkerIdsForRow(row);
                const delta = newAge - oldAge;
                this._syncSplitChainsForRelocationAgeShift(delta, markerIds, newAge);
                this._syncSoldRealEstateForRelocationAgeShift(delta, markerIds, newAge);
                this._clearRelocationAgeShift(markerIds);
              } else {
                this._recordRelocationAgeShiftForRow(row, oldAge, newAge);
              }
            }
            if (rowKey && !isNaN(newAge)) this._mvAgesByRowId[rowKey] = newAge;
            if (!isNaN(newAge) && e.target.dataset) e.target.dataset.mvPrevAge = String(newAge);
          }
        }

        if (e.target.classList.contains('event-to-age')) {
          const row = e.target.closest('tr');
          const typeInput = row ? row.querySelector('.event-type') : null;
          const typeValue = typeInput ? typeInput.value : '';
          if ((typeValue === 'R' || this.isMortgageLinkedEvent(typeValue)) && !this._suppressSellMarkerClear) {
            this._applyToRealEstatePair(row, (pairRow) => {
              this._removeHiddenInput(pairRow, 'event-relocation-sell-mv-id');
              this._removeHiddenInput(pairRow, 'event-relocation-sell-anchor-age');
            });
          }
        }
        // Always re-analyze relocation impacts on any change to table inputs
        this._scheduleRelocationReanalysis();

        if (e.target.classList.contains('event-type')) {
          const row = e.target.closest('tr');
          if (row) {
            // Update the stored original type to the new user selection
            const oldType = row.dataset.originalEventType || '';
            const newType = e.target.value || '';
            row.dataset.originalEventType = newType;

            // Refresh all mortgage dropdowns if property/mortgage source rows changed type
            if (oldType === 'R' || newType === 'R' || this.isPropertyLinkedEvent(oldType) || this.isPropertyLinkedEvent(newType)) {
              const tbody = row.closest('tbody');
              if (tbody) {
                tbody.querySelectorAll('tr').forEach(mRow => {
                  const mTypeInput = mRow.querySelector('.event-type');
                  if (mTypeInput && this.isPropertyLinkedEvent(mTypeInput.value) && mRow._eventMortgageDropdown) {
                    this.updateMortgageOptions(mRow);
                  }
                });
              }
            }

            // If event type changed to/from relocation, update currency selector
            const isOldRelocation = oldType === 'MV';
            const isNewRelocation = newType === 'MV';
            if (!isOldRelocation && isNewRelocation) {
              this._clearRelocationDestinationSelection(row);
            }
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

        const row = e.target.closest('tr');
        if (row && !this._suppressMortgagePlanSync && e.target.classList.contains('event-amount')) {
          const typeInput = row.querySelector('.event-type');
          const typeValue = typeInput ? String(typeInput.value || '') : '';
          if (typeValue === 'MP') {
            this._removeHiddenInput(row, 'event-payoff-expected-amount');
            this._removeHiddenInput(row, 'event-resolution-override');
          }
        }
        if (row && e.target.classList.contains('event-amount') && e.isTrusted) {
          this._markSplitPart2ValueCustom(row);
        }
        if (row && !this._suppressMortgagePlanSync && e.target.matches('.event-type, .event-name, .event-amount, .event-from-age, .event-to-age, .event-rate')) {
          this._handleMortgagePlanFieldChange(row, e.target);
        }
      });

      // Also listen for input changes on all event fields to update wizard icons
      eventsTable.addEventListener('focusin', (e) => {
        if (!e.target.matches('.event-from-age, .event-to-age')) return;
        e.target.dataset.prevAgeValue = e.target.value;
        if (!e.target.classList.contains('event-from-age')) return;
        const row = e.target.closest('tr');
        const typeInput = row ? row.querySelector('.event-type') : null;
        const typeValue = typeInput ? typeInput.value : '';
        if (typeValue === 'MV') {
          e.target.dataset.mvPrevAge = e.target.value;
        }
      });

      eventsTable.addEventListener('input', (e) => {
        const row = e.target.closest('tr');
        if (e.target.matches('.event-name, .event-amount, .event-from-age, .event-to-age, .event-rate, .event-match')) {
          if (row) {
            this.updateWizardIconsVisibility(row);
          }
        }
        // Handle Real Estate name propagation to linked Mortgage events
        if (e.target.matches('.event-name') && row) {
          const typeInput = row.querySelector('.event-type');
          // Skip refresh if typing in an 'R' event name field - we'll handle propagation on blur
          if (typeInput && typeInput.value === 'R') {
            return;
          }

          // Refresh all mortgage dropdowns when any other event name changes
          const tbody = row.closest('tbody');
          if (tbody) {
            tbody.querySelectorAll('tr').forEach(mRow => {
              const mTypeInput = mRow.querySelector('.event-type');
              if (mTypeInput && this.isPropertyLinkedEvent(mTypeInput.value) && mRow._eventMortgageDropdown) {
                this.updateMortgageOptions(mRow);
              }
            });
          }
        }
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

        if (typeof RelocationImpactDetector !== 'undefined') {
          RelocationImpactDetector.analyzeEvents(events, startCountry);
        }
        this.updateRelocationImpactIndicators(events);
        this.webUI.updateStatusForRelocationImpacts(this._getRelocationStatusEvents(events));
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
        // Accordion summaries refresh after impact update via updateRelocationImpactIndicators.
      } catch (err) {
        console.error('Error analyzing relocation impacts:', err);
      }
    }, 300);
  }

  _clearRelocationDestinationSelection(row) {
    if (!row) return;
    const nameInput = row.querySelector('.event-name');
    if (nameInput) nameInput.value = '';
    const rowId = row.dataset ? row.dataset.rowId : '';
    const toggleEl = rowId
      ? row.querySelector(`#EventCountryToggle_${rowId}`)
      : row.querySelector('.event-country-dd .dd-toggle');
    if (toggleEl) toggleEl.textContent = 'Select country';
    if (row._eventCountryDropdown && typeof row._eventCountryDropdown.setOptions === 'function') {
      const countries = Config.getInstance().getAvailableCountries();
      const opts = Array.isArray(countries)
        ? countries.map(c => ({ value: String(c.code).toUpperCase(), label: c.name, selected: false }))
        : [];
      row._eventCountryDropdown.setOptions(opts);
    }
  }

  _removeHiddenInput(row, className) {
    if (!row || !className) return;
    const input = row.querySelector('.' + className);
    if (input && input.parentNode) input.remove();
    if (className === 'event-resolution-override') {
      const scopeInput = row.querySelector('.event-resolution-mv-id');
      if (scopeInput && scopeInput.parentNode) scopeInput.remove();
      const categoryInput = row.querySelector('.event-resolution-category');
      if (categoryInput && categoryInput.parentNode) categoryInput.remove();
    }
  }

  _captureRelocationAges() {
    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const typeInput = row.querySelector('.event-type');
      const typeValue = typeInput ? String(typeInput.value || '') : '';
      if (typeValue !== 'MV') continue;
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
      this._removeHiddenInput(rows[i], 'event-relocation-split-segment-id');
      this._removeHiddenInput(rows[i], 'event-relocation-split-anchor-age');
      this._removeHiddenInput(rows[i], 'event-relocation-split-anchor-amount');
      this._removeHiddenInput(rows[i], 'event-relocation-split-value-mode');
      this._clearSplitSuggestionTracking(rows[i]);
    }
  }

  _getRelocationMarkerIdsForRow(row) {
    if (!row) return [];
    const ids = [];
    const linkId = this._getOrCreateRelocationLinkId(row);
    if (linkId) ids.push(String(linkId));
    const runtimeId = row && row.dataset ? String(row.dataset.eventId || '') : '';
    if (runtimeId) ids.push(runtimeId);
    return Array.from(new Set(ids));
  }

  _getRelocationMarkerIdsForDeletedRow(row) {
    if (!row) return [];
    const typeInput = row.querySelector('.event-type');
    const typeValue = typeInput ? String(typeInput.value || '') : '';
    if (typeValue !== 'MV') return [];
    const ids = [];
    const linkInput = row.querySelector('.event-relocation-link-id');
    const linkId = linkInput ? String(linkInput.value || '') : '';
    if (linkId) ids.push(linkId);
    const runtimeId = row && row.dataset ? String(row.dataset.eventId || '') : '';
    if (runtimeId) ids.push(runtimeId);
    return Array.from(new Set(ids));
  }

  _clearResolutionOverridesForRelocationMarkers(markerIds) {
    if (!markerIds || !markerIds.length) return;
    const markerSet = new Set(markerIds.map(id => String(id || '')).filter(Boolean));
    if (markerSet.size === 0) return;
    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const overrideMvIdInput = row.querySelector('.event-resolution-mv-id');
      const overrideMvId = overrideMvIdInput ? String(overrideMvIdInput.value || '') : '';
      if (!overrideMvId || !markerSet.has(overrideMvId)) continue;
      const typeInput = row.querySelector('.event-type');
      const typeValue = typeInput ? String(typeInput.value || '') : '';
      this._removeHiddenInput(row, 'event-resolution-override');
      if (typeValue === 'R' || typeValue === 'M') {
        this._removeHiddenInput(row, 'event-linked-country');
        this._removeHiddenInput(row, 'event-currency');
      }
    }
  }

  _getOrCreateRelocationLinkId(row) {
    if (!row) return '';
    const existing = row.querySelector('.event-relocation-link-id');
    if (existing && existing.value) return String(existing.value);
    const linkId = this._nextCompactId('mvlink');
    this.getOrCreateHiddenInput(row, 'event-relocation-link-id', linkId);
    return linkId;
  }

  _nextCompactId(prefix) {
    const key = String(prefix || 'id');
    const next = (this._compactIdCounters[key] || 0) + 1;
    this._compactIdCounters[key] = next;
    return key + '_' + next.toString(36);
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
      if (typeValue !== 'MV') continue;
      const rowRuntimeId = row && row.dataset ? String(row.dataset.eventId || '') : '';
      if (rowRuntimeId === needle) return this._getOrCreateRelocationLinkId(row);
    }

    return '';
  }

  _getResolutionScopeForRow(row) {
    if (!row) return { mvId: '', category: '' };
    const impacted = this._findRelocationEventForImpactedRow(row);
    let mvId = '';
    if (impacted && impacted.mvEvent) {
      mvId = impacted.mvEvent.relocationLinkId || impacted.mvImpactId || '';
    } else if (impacted && impacted.mvImpactId) {
      mvId = impacted.mvImpactId;
    } else if (row.dataset) {
      mvId = row.dataset.relocationImpactMvId || '';
    }
    const category = row.dataset ? String(row.dataset.relocationImpactCategory || '') : '';
    return { mvId: String(mvId || ''), category: category };
  }

  _getSegmentRowsForImpact(row) {
    if (!row) return [];
    let segmentId = '';
    let linkedEventId = '';
    let details = null;
    if (row.dataset && row.dataset.relocationImpactDetails) {
      try {
        details = JSON.parse(row.dataset.relocationImpactDetails);
      } catch (_) {
        details = null;
      }
    }
    if (details && details.relocationSplitSegmentId) {
      segmentId = String(details.relocationSplitSegmentId || '');
    }
    if (details && details.linkedEventId) {
      linkedEventId = String(details.linkedEventId || '');
    }
    if (!segmentId) {
      const segmentInput = row.querySelector('.event-relocation-split-segment-id');
      segmentId = segmentInput ? String(segmentInput.value || '') : '';
    }
    if (!linkedEventId) {
      const linkedEventIdInput = row.querySelector('.event-linked-event-id');
      linkedEventId = linkedEventIdInput ? String(linkedEventIdInput.value || '') : '';
    }
    if (!segmentId || !linkedEventId) return [];

    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter((candidate) => {
      if (!candidate || (candidate.classList && candidate.classList.contains('resolution-panel-row'))) return false;
      const segmentInput = candidate.querySelector('.event-relocation-split-segment-id');
      const linkedInput = candidate.querySelector('.event-linked-event-id');
      return segmentInput && linkedInput
        && String(segmentInput.value || '') === segmentId
        && String(linkedInput.value || '') === linkedEventId;
    });

    rows.sort((a, b) => {
      const aFrom = Number(a.querySelector('.event-from-age') ? a.querySelector('.event-from-age').value : '');
      const bFrom = Number(b.querySelector('.event-from-age') ? b.querySelector('.event-from-age').value : '');
      if (aFrom !== bFrom) return aFrom - bFrom;
      const aTo = Number(a.querySelector('.event-to-age') ? a.querySelector('.event-to-age').value : '');
      const bTo = Number(b.querySelector('.event-to-age') ? b.querySelector('.event-to-age').value : '');
      return aTo - bTo;
    });

    return rows;
  }

  _setResolutionOverride(row, scope) {
    if (!row) return;
    this.getOrCreateHiddenInput(row, 'event-resolution-override', '1');
    const mvId = scope && scope.mvId ? String(scope.mvId) : '';
    const category = scope && scope.category ? String(scope.category) : '';
    if (mvId) this.getOrCreateHiddenInput(row, 'event-resolution-mv-id', mvId);
    else this._removeHiddenInput(row, 'event-resolution-mv-id');
    if (category) this.getOrCreateHiddenInput(row, 'event-resolution-category', category);
    else this._removeHiddenInput(row, 'event-resolution-category');
  }

  _isSplitPart2Row(row) {
    return !!(row && row.querySelector && row.querySelector('.event-relocation-split-anchor-amount'));
  }

  _getSplitValueMode(row) {
    if (!row || !row.querySelector) return '';
    const input = row.querySelector('.event-relocation-split-value-mode');
    return input && input.value ? String(input.value).toLowerCase() : '';
  }

  _setSplitValueMode(row, mode) {
    if (!row || !mode) return;
    this.getOrCreateHiddenInput(row, 'event-relocation-split-value-mode', String(mode).toLowerCase());
  }

  _clearSplitSuggestionTracking(row) {
    if (!row) return;
    this._removeHiddenInput(row, 'event-relocation-split-reviewed-suggested-amount');
    this._removeHiddenInput(row, 'event-relocation-split-suggestion-model-version');
  }

  _resolveSplitSuggestionCountries(row, fallbackPart1Row) {
    const panelContainer = row.nextElementSibling && row.nextElementSibling.querySelector
      ? row.nextElementSibling.querySelector('.resolution-panel-container')
      : null;
    let fromCountry = panelContainer ? String(panelContainer.getAttribute('data-from-country') || '').toLowerCase() : '';
    let toCountry = panelContainer ? String(panelContainer.getAttribute('data-to-country') || '').toLowerCase() : '';
    if (fromCountry && toCountry) return { fromCountry, toCountry };

    const impacted = this._findRelocationEventForImpactedRow(row);
    if (!toCountry && impacted && impacted.mvEvent) {
      toCountry = String(impacted.mvEvent.name || '').trim().toLowerCase();
    }
    if (!fromCountry && impacted && impacted.mvEvent) {
      fromCountry = this.getOriginCountry(impacted.mvEvent, Config.getInstance().getStartCountry());
    }

    if (!toCountry) {
      const linkedCountryInput = row.querySelector('.event-linked-country');
      toCountry = linkedCountryInput && linkedCountryInput.value ? String(linkedCountryInput.value).toLowerCase() : toCountry;
    }
    if (!fromCountry && fallbackPart1Row) {
      const part1CountryInput = fallbackPart1Row.querySelector('.event-country');
      const part1LinkedCountryInput = fallbackPart1Row.querySelector('.event-linked-country');
      if (part1CountryInput && part1CountryInput.value) fromCountry = String(part1CountryInput.value).toLowerCase();
      else if (part1LinkedCountryInput && part1LinkedCountryInput.value) fromCountry = String(part1LinkedCountryInput.value).toLowerCase();
    }
    if (!fromCountry) fromCountry = Config.getInstance().getStartCountry();
    return { fromCountry, toCountry };
  }

  _setSplitSuggestionReviewBaseline(part2Row, part1Amount, fromCountry, toCountry) {
    if (!part2Row) return NaN;
    this.getOrCreateHiddenInput(part2Row, 'event-relocation-split-suggestion-model-version', String(RelocationSplitSuggestionLib.SPLIT_SUGGESTION_MODEL_VERSION));
    const suggestedAmount = RelocationSplitSuggestionLib.getSuggestedAmount(part1Amount, fromCountry, toCountry);
    if (!isNaN(suggestedAmount)) {
      this.getOrCreateHiddenInput(part2Row, 'event-relocation-split-reviewed-suggested-amount', String(suggestedAmount));
    }
    return suggestedAmount;
  }

  _markSplitPart2ValueCustom(row) {
    if (!this._isSplitPart2Row(row)) return;
    if (this._getSplitValueMode(row) === 'custom') return;
    this._setSplitValueMode(row, 'custom');
  }

  _removeRowAndResolutionPanel(row) {
    if (!row) return;
    const next = row.nextElementSibling;
    if (next && next.classList && next.classList.contains('resolution-panel-row')) next.remove();
    row.remove();
  }

  _deleteRowWithExistingAnimation(row, options = {}) {
    if (!row) return;
    const skipMortgageSync = !!options.skipMortgageSync;
    const deletedType = row.querySelector('.event-type') ? String(row.querySelector('.event-type').value || '') : '';
    const deletedId = row.querySelector('.event-name') ? String(row.querySelector('.event-name').value || '').trim() : '';

    const maybePanel = row.nextElementSibling;
    if (maybePanel && maybePanel.classList && maybePanel.classList.contains('resolution-panel-row')) {
      this.collapseResolutionPanel(row.dataset.rowId);
    }

    const allRows = document.querySelectorAll('#Events tbody tr');
    const isLastRow = allRows.length === 1;

    if (isLastRow) {
      row.classList.add('deleting-last');
      setTimeout(() => {
        row.remove();
        if (!skipMortgageSync) this._syncMortgagePlanAfterDeletion(deletedType, deletedId);
        this.updateEventRowsVisibilityAndTypes();
        this._refreshValidation();
        this._scheduleMortgagePlanReanalysis();
      }, 400);
      return;
    }

    this.deleteRowWithSlideUp(row, { skipMortgageSync: skipMortgageSync });
  }

  _flashInput(input) {
    if (!input || !input.classList) return;
    input.classList.remove('age-auto-changed');
    input.offsetHeight;
    input.classList.add('age-auto-changed');
    setTimeout(() => { input.classList.remove('age-auto-changed'); }, 3000);
  }

  _parseNumericValue(value, options = {}) {
    if (value === null || value === undefined) return NaN;
    if (typeof value === 'number') return isNaN(value) ? NaN : value;
    const preferThousands = !!options.preferThousands;
    let sanitized = String(value).trim();
    if (!sanitized) return NaN;
    sanitized = sanitized.replace(/\s+/g, '').replace(/[^0-9,.\-]/g, '');
    if (
      sanitized === '' ||
      sanitized === '-' ||
      sanitized === '.' ||
      sanitized === ',' ||
      sanitized === '-.' ||
      sanitized === '-,'
    ) return NaN;

    const hasDot = sanitized.indexOf('.') !== -1;
    const hasComma = sanitized.indexOf(',') !== -1;
    if (hasDot && hasComma) {
      const lastDot = sanitized.lastIndexOf('.');
      const lastComma = sanitized.lastIndexOf(',');
      const decimalSep = lastDot > lastComma ? '.' : ',';
      const groupSep = decimalSep === '.' ? ',' : '.';
      sanitized = sanitized.split(groupSep).join('');
      if (decimalSep === ',') sanitized = sanitized.replace(/,/g, '.');
    } else if (hasDot || hasComma) {
      const sep = hasDot ? '.' : ',';
      const firstIdx = sanitized.indexOf(sep);
      const lastIdx = sanitized.lastIndexOf(sep);
      const hasMultiple = firstIdx !== lastIdx;
      const fractionLen = sanitized.length - lastIdx - 1;
      const treatAsGrouping = hasMultiple || (preferThousands && fractionLen === 3);
      if (treatAsGrouping) {
        sanitized = sanitized.split(sep).join('');
      } else if (sep === ',') {
        sanitized = sanitized.replace(',', '.');
      }
    }

    const parsed = Number(sanitized);
    return isNaN(parsed) ? NaN : parsed;
  }

  _parseAgeValue(value) {
    const parsed = parseInt(String(value == null ? '' : value), 10);
    return isNaN(parsed) ? NaN : parsed;
  }

  _normalizeRate(rateValue) {
    const raw = this._parseNumericValue(rateValue, { preferThousands: false });
    if (!(raw > 0)) return 0;
    return raw > 1 ? raw / 100 : raw;
  }

  _ensureMortgageTermInput(mRow) {
    if (!mRow) return NaN;
    let termInput = mRow.querySelector('.event-mortgage-term');
    const fromAgeInput = mRow.querySelector('.event-from-age');
    const toAgeInput = mRow.querySelector('.event-to-age');
    const fromAge = this._parseAgeValue(fromAgeInput ? fromAgeInput.value : '');
    const toAge = this._parseAgeValue(toAgeInput ? toAgeInput.value : '');
    const fallbackTerm = (!isNaN(fromAge) && !isNaN(toAge) && toAge > fromAge) ? (toAge - fromAge) : 30;

    if (!termInput) {
      termInput = document.createElement('input');
      termInput.type = 'hidden';
      termInput.className = 'event-mortgage-term';
      const container = mRow.querySelector('.event-type-container') || mRow.querySelector('td') || mRow;
      container.appendChild(termInput);
      termInput.value = String(fallbackTerm);
    }

    const parsedTerm = parseInt(String(termInput.value || ''), 10);
    if (parsedTerm > 0) return parsedTerm;
    termInput.value = String(fallbackTerm);
    return fallbackTerm;
  }

  _buildMortgageModel(fromAge, toAge, annualPayment, rateValue, mortgageTermValue) {
    const parsedFrom = this._parseAgeValue(fromAge);
    const parsedTo = this._parseAgeValue(toAge);
    const parsedPayment = this._parseNumericValue(annualPayment, { preferThousands: true });
    if (!(parsedPayment > 0) || isNaN(parsedFrom)) return null;

    const parsedTerm = parseInt(String(mortgageTermValue == null ? '' : mortgageTermValue), 10);
    let termYears = parsedTerm;
    if (!(termYears > 0)) termYears = (isNaN(parsedTo) ? NaN : (parsedTo - parsedFrom));
    if (!(termYears > 0)) termYears = 30;

    const rate = this._normalizeRate(rateValue);
    const months = termYears * 12;
    const monthlyPayment = parsedPayment / 12;
    let principal;
    if (rate === 0) {
      principal = monthlyPayment * months;
    } else {
      const monthlyRate = rate / 12;
      const c = Math.pow(1 + monthlyRate, months);
      principal = monthlyPayment * (c - 1) / (monthlyRate * c);
    }
    if (!(principal > 0)) return null;

    return {
      fromAge: parsedFrom,
      toAge: isNaN(parsedTo) ? (parsedFrom + termYears) : parsedTo,
      annualPayment: parsedPayment,
      rate: rate,
      principal: principal,
      termYears: termYears
    };
  }

  _buildMortgageModelFromRow(mRow) {
    if (!mRow) return null;
    const fromAgeInput = mRow.querySelector('.event-from-age');
    const toAgeInput = mRow.querySelector('.event-to-age');
    const amountInput = mRow.querySelector('.event-amount');
    const rateInput = mRow.querySelector('.event-rate');
    const termYears = this._ensureMortgageTermInput(mRow);
    return this._buildMortgageModel(
      fromAgeInput ? fromAgeInput.value : '',
      toAgeInput ? toAgeInput.value : '',
      amountInput ? amountInput.value : '',
      rateInput ? rateInput.value : '',
      termYears
    );
  }

  _buildMortgageModelFromEvent(event) {
    if (!event) return null;
    return this._buildMortgageModel(event.fromAge, event.toAge, event.amount, event.rate, event.mortgageTerm);
  }

  _buildOverpayWindowsFromRows(moRows) {
    const rows = Array.isArray(moRows) ? moRows : [];
    return rows.map(row => {
      const fromAgeInput = row.querySelector('.event-from-age');
      const toAgeInput = row.querySelector('.event-to-age');
      const amountInput = row.querySelector('.event-amount');
      const fromAge = this._parseAgeValue(fromAgeInput ? fromAgeInput.value : '');
      const toAge = this._parseAgeValue(toAgeInput ? toAgeInput.value : '');
      const amount = this._parseNumericValue(amountInput ? amountInput.value : '', { preferThousands: true });
      return {
        fromAge: fromAge,
        toAge: isNaN(toAge) ? null : toAge,
        amount: amount
      };
    }).filter(w => !isNaN(w.fromAge) && (w.toAge === null || w.toAge >= w.fromAge) && (w.amount > 0));
  }

  _buildOverpayWindowsFromEvents(moEvents) {
    const events = Array.isArray(moEvents) ? moEvents : [];
    return events.map(event => {
      const fromAge = this._parseAgeValue(event.fromAge);
      const toAge = this._parseAgeValue(event.toAge);
      const amount = this._parseNumericValue(event.amount, { preferThousands: true });
      return {
        fromAge: fromAge,
        toAge: isNaN(toAge) ? null : toAge,
        amount: amount
      };
    }).filter(w => !isNaN(w.fromAge) && (w.toAge === null || w.toAge >= w.fromAge) && (w.amount > 0));
  }

  _sumOverpayAtAge(overpayWindows, age) {
    let total = 0;
    for (let i = 0; i < overpayWindows.length; i++) {
      const w = overpayWindows[i];
      if (age >= w.fromAge && (w.toAge === null || age <= w.toAge)) {
        total += w.amount;
      }
    }
    return total;
  }

  _amortizeOneYear(remaining, annualPayment, rate) {
    const epsilon = 1e-6;
    if (!(remaining > epsilon)) return 0;
    if (!(annualPayment > 0)) return remaining;
    if (rate === 0) {
      const nextZeroRate = remaining - annualPayment;
      return nextZeroRate > epsilon ? nextZeroRate : 0;
    }
    const monthlyRate = rate / 12;
    const monthlyPayment = annualPayment / 12;
    const annualGrowth = Math.pow(1 + monthlyRate, 12);
    const annuityFactor = (annualGrowth - 1) / monthlyRate;
    const nextBalance = remaining * annualGrowth - monthlyPayment * annuityFactor;
    return nextBalance > epsilon ? nextBalance : 0;
  }

  _remainingPrincipalAtAge(model, overpayWindows, targetAge) {
    const epsilon = 1e-6;
    if (!model || isNaN(targetAge)) return 0;
    if (targetAge < model.fromAge) return model.principal;
    let remaining = model.principal;
    for (let age = model.fromAge; age <= targetAge; age++) {
      if (age > model.fromAge) {
        remaining = this._amortizeOneYear(remaining, model.annualPayment, model.rate);
      }
      if (!(remaining > epsilon)) return 0;
      const overpay = this._sumOverpayAtAge(overpayWindows, age);
      if (overpay > 0) remaining -= overpay;
      if (!(remaining > epsilon)) return 0;
    }
    return remaining;
  }

  _estimatePayoff(model, overpayWindows) {
    const epsilon = 1e-6;
    if (!model) return { payoffAge: NaN, payoffAmount: 0 };
    const maxAge = Math.max(model.toAge, model.fromAge + model.termYears + 60);
    let remaining = model.principal;
    for (let age = model.fromAge; age <= maxAge; age++) {
      if (age > model.fromAge) {
        remaining = this._amortizeOneYear(remaining, model.annualPayment, model.rate);
      }
      if (!(remaining > epsilon)) return { payoffAge: age, payoffAmount: 0 };
      const overpay = this._sumOverpayAtAge(overpayWindows, age);
      if (overpay > 0) remaining -= overpay;
      if (!(remaining > epsilon)) return { payoffAge: age, payoffAmount: 0 };
    }
    const fallbackAge = isNaN(model.toAge) ? model.fromAge : model.toAge;
    return {
      payoffAge: fallbackAge,
      payoffAmount: this._remainingPrincipalAtAge(model, overpayWindows, fallbackAge)
    };
  }

  _collectMortgageRowsById(id) {
    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    const sameIdRows = rows.filter(r => {
      const nameInput = r.querySelector('.event-name');
      return nameInput && String(nameInput.value || '').trim() === id;
    });
    const mRow = sameIdRows.find(r => {
      const typeInput = r.querySelector('.event-type');
      return typeInput && typeInput.value === 'M';
    }) || null;
    const mpRow = sameIdRows.find(r => {
      const typeInput = r.querySelector('.event-type');
      return typeInput && typeInput.value === 'MP';
    }) || null;
    const mrRow = sameIdRows.find(r => {
      const typeInput = r.querySelector('.event-type');
      return typeInput && typeInput.value === 'MR';
    }) || null;
    const moRows = sameIdRows.filter(r => {
      const typeInput = r.querySelector('.event-type');
      return typeInput && typeInput.value === 'MO';
    });
    return { mRow, mpRow, mrRow, moRows, all: sameIdRows };
  }

  _setInputValueWithFlash(input, nextValue, shouldDispatch = true) {
    if (!input) return false;
    const next = (nextValue === undefined || nextValue === null) ? '' : String(nextValue);
    if (String(input.value || '') === next) return false;
    input.value = next;
    this._flashInput(input);
    if (shouldDispatch) input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  _createMortgagePayoffEvent(id, rows, model, overpayWindows) {
    if (!id || !rows || !rows.mRow || rows.mpRow) return;
    if (this._pendingAutoPayoffIds[id]) return;

    const mToInput = rows.mRow.querySelector('.event-to-age');
    const payoffAge = this._parseAgeValue(mToInput ? mToInput.value : '');
    if (isNaN(payoffAge)) return;

    const rawPayoffAmount = this._remainingPrincipalAtAge(model, overpayWindows, payoffAge);
    const payoffAmount = Math.max(0, Math.round(rawPayoffAmount));
    if (!(payoffAmount > 0)) return;
    const linkedCountryInput = rows.mRow.querySelector('.event-linked-country');
    const currencyInput = rows.mRow.querySelector('.event-currency');
    const sellMvIdInput = rows.mRow.querySelector('.event-relocation-sell-mv-id');
    const sellAnchorAgeInput = rows.mRow.querySelector('.event-relocation-sell-anchor-age');

    const createPromise = this.addEventFromWizardWithSorting({
      eventType: 'MP',
      name: id,
      amount: payoffAmount,
      fromAge: payoffAge,
      toAge: payoffAge,
      relocationSellMvId: sellMvIdInput ? sellMvIdInput.value : '',
      relocationSellAnchorAge: sellAnchorAgeInput ? sellAnchorAgeInput.value : '',
      linkedCountry: linkedCountryInput ? linkedCountryInput.value : '',
      currency: currencyInput ? currencyInput.value : ''
    }).then((result) => {
      if (result && result.row) {
        this.getOrCreateHiddenInput(result.row, 'event-auto-payoff', '1');
        if (sellMvIdInput && sellMvIdInput.value) {
          this.getOrCreateHiddenInput(result.row, 'event-relocation-sell-mv-id', sellMvIdInput.value);
        }
        if (sellAnchorAgeInput && sellAnchorAgeInput.value) {
          this.getOrCreateHiddenInput(result.row, 'event-relocation-sell-anchor-age', sellAnchorAgeInput.value);
        }
      }
      this._syncMortgagePlanById(id, { sourceType: 'M', sourceField: 'toAge', forceAutoAlign: true });
      // Ensure validation runs after the auto-created payoff row is fully synced.
      if (typeof this._refreshValidation === 'function') {
        setTimeout(() => this._refreshValidation(), 0);
      }
    }).catch((err) => {
      console.error('Error creating mortgage payoff event:', err);
    }).finally(() => {
      delete this._pendingAutoPayoffIds[id];
      this._scheduleMortgagePlanReanalysis();
    });

    this._pendingAutoPayoffIds[id] = createPromise;
  }

  _syncMortgagePlanById(id, context = {}) {
    if (!id) return;
    const rows = this._collectMortgageRowsById(id);
    if (!rows.mRow) return;

    const model = this._buildMortgageModelFromRow(rows.mRow);
    if (!model) return;
    const overpayWindows = this._buildOverpayWindowsFromRows(rows.moRows);
    const estimate = this._estimatePayoff(model, overpayWindows);
    const hasOverpay = rows.moRows.length > 0;

    const sourceType = context.sourceType || '';
    const sourceField = context.sourceField || '';
    const forceAutoAlign = !!context.forceAutoAlign;
    const forceCreatePayoff = !!context.forceCreatePayoff;
    const preserveManualAmount = !!context.preserveManualAmount;

    const mToInput = rows.mRow.querySelector('.event-to-age');

    if (!rows.mpRow) {
      const shouldCreatePayoff = forceCreatePayoff || (sourceType === 'M' && sourceField === 'toAge');
      if (shouldCreatePayoff) {
        this._createMortgagePayoffEvent(id, rows, model, overpayWindows);
        this._scheduleMortgagePlanReanalysis();
        return;
      }
      if (forceAutoAlign || sourceType === 'MO' || sourceType === 'MP' || (sourceType === 'M' && sourceField !== 'toAge')) {
        this._suppressMortgagePlanSync = true;
        try {
          this._setInputValueWithFlash(mToInput, estimate.payoffAge, true);
        } finally {
          this._suppressMortgagePlanSync = false;
        }
      }
      this._scheduleMortgagePlanReanalysis();
      return;
    }

    const mpFromInput = rows.mpRow.querySelector('.event-from-age');
    const mpToInput = rows.mpRow.querySelector('.event-to-age');
    const mpAmountInput = rows.mpRow.querySelector('.event-amount');

    let mToAge = this._parseAgeValue(mToInput ? mToInput.value : '');
    let mpAge = this._parseAgeValue(mpFromInput ? mpFromInput.value : '');

    let autoAlignAges = true;
    const isManualMpAgeEdit = sourceType === 'MP' && (sourceField === 'fromAge' || sourceField === 'toAge');
    if (hasOverpay && !forceAutoAlign) {
      if ((sourceType === 'M' && sourceField === 'toAge') || isManualMpAgeEdit || (sourceType === 'R' && sourceField === 'toAge')) {
        autoAlignAges = false;
      }
    }

    let removedAutoPayoff = false;
    const prevSuppressSellMarkerClear = this._suppressSellMarkerClear;
    this._suppressMortgagePlanSync = true;
    this._suppressSellMarkerClear = true;
    try {
      if (hasOverpay) {
        if (isManualMpAgeEdit && !isNaN(mpAge)) {
          this._setInputValueWithFlash(mToInput, mpAge, true);
          this._setInputValueWithFlash(mpToInput, mpAge, true);
          for (let i = 0; i < rows.moRows.length; i++) {
            const moRow = rows.moRows[i];
            const moFromInput = moRow.querySelector('.event-from-age');
            const moToInput = moRow.querySelector('.event-to-age');
            const moFromAge = this._parseAgeValue(moFromInput ? moFromInput.value : '');
            if (!isNaN(moFromAge) && moFromAge > mpAge) {
              this._setInputValueWithFlash(moFromInput, mpAge, true);
            }
            this._setInputValueWithFlash(moToInput, mpAge, true);
          }
          mToAge = mpAge;
        } else if (autoAlignAges || forceAutoAlign || sourceType === 'MO') {
          const expectedAge = estimate.payoffAge;
          this._setInputValueWithFlash(mToInput, expectedAge, true);
          this._setInputValueWithFlash(mpFromInput, expectedAge, true);
          this._setInputValueWithFlash(mpToInput, expectedAge, true);
          mToAge = expectedAge;
          mpAge = expectedAge;
        }
      } else {
        // No overpay chain: keep M and MP aligned both ways.
        if (sourceType === 'MO') {
          const expectedAge = estimate.payoffAge;
          this._setInputValueWithFlash(mToInput, expectedAge, true);
          this._setInputValueWithFlash(mpFromInput, expectedAge, true);
          this._setInputValueWithFlash(mpToInput, expectedAge, true);
          mToAge = expectedAge;
          mpAge = expectedAge;
        } else if (sourceType === 'MP' && (sourceField === 'fromAge' || sourceField === 'toAge')) {
          if (!isNaN(mpAge)) {
            this._setInputValueWithFlash(mToInput, mpAge, true);
            this._setInputValueWithFlash(mpToInput, mpAge, true);
            mToAge = mpAge;
          }
        } else {
          if (!isNaN(mToAge)) {
            this._setInputValueWithFlash(mpFromInput, mToAge, true);
            this._setInputValueWithFlash(mpToInput, mToAge, true);
            mpAge = mToAge;
          }
        }
      }

      const payoffAge = !isNaN(mpAge) ? mpAge : (!isNaN(mToAge) ? mToAge : estimate.payoffAge);
      const payoffOverpayWindows = this._buildOverpayWindowsFromRows(rows.moRows);
      const payoffAmount = this._remainingPrincipalAtAge(model, payoffOverpayWindows, payoffAge);
      const roundedPayoff = Math.max(0, Math.round(payoffAmount));
      const currentPayoff = this._parseNumericValue(mpAmountInput ? mpAmountInput.value : '', { preferThousands: true });
      const autoPayoffInput = rows.mpRow.querySelector('.event-auto-payoff');
      if (autoPayoffInput && !(roundedPayoff > 0)) {
        // Keep the explicit MP event chain stable when payoff reaches zero.
        // Convert auto-created row into a normal row instead of deleting it.
        this._removeHiddenInput(rows.mpRow, 'event-auto-payoff');
        this._setInputValueWithFlash(mpAmountInput, '0', true);
      }
      if (removedAutoPayoff) return;
      const hasManualAmountConflict = preserveManualAmount && !isNaN(currentPayoff) && Math.round(currentPayoff) !== roundedPayoff;
      if (hasManualAmountConflict) {
        this.getOrCreateHiddenInput(rows.mpRow, 'event-payoff-expected-amount', String(roundedPayoff));
      } else {
        this._removeHiddenInput(rows.mpRow, 'event-payoff-expected-amount');
        const formattedPayoff = (typeof FormatUtils !== 'undefined' && FormatUtils.formatCurrency)
          ? FormatUtils.formatCurrency(roundedPayoff)
          : String(roundedPayoff);
        this._setInputValueWithFlash(mpAmountInput, formattedPayoff, true);
      }
    } finally {
      this._suppressMortgagePlanSync = false;
      this._suppressSellMarkerClear = prevSuppressSellMarkerClear;
    }

    if (removedAutoPayoff) {
      this._refreshValidation();
      this._scheduleMortgagePlanReanalysis();
      if (this.webUI && this.webUI.eventAccordionManager) {
        this.webUI.eventAccordionManager.refresh({ skipSortAnimation: true });
      }
      return;
    }

    this._scheduleMortgagePlanReanalysis();
  }

  _handleMortgagePlanFieldChange(row, target) {
    if (!row || !target) return;
    const typeInput = row.querySelector('.event-type');
    const nameInput = row.querySelector('.event-name');
    const eventType = typeInput ? typeInput.value : '';
    const eventId = nameInput ? String(nameInput.value || '').trim() : '';

    if (!eventId || (!this.isMortgageLinkedEvent(eventType) && eventType !== 'R')) return;

    let sourceField = '';
    if (target.classList.contains('event-from-age')) sourceField = 'fromAge';
    else if (target.classList.contains('event-to-age')) sourceField = 'toAge';
    else if (target.classList.contains('event-amount')) sourceField = 'amount';
    else if (target.classList.contains('event-rate')) sourceField = 'rate';
    else if (target.classList.contains('event-name')) sourceField = 'name';
    else if (target.classList.contains('event-type')) sourceField = 'type';
    if (sourceField === 'name') return;

    if (eventType === 'MP' && (sourceField === 'fromAge' || sourceField === 'type')) {
      const fromAgeInput = row.querySelector('.event-from-age');
      const toAgeInput = row.querySelector('.event-to-age');
      const fromAge = this._parseAgeValue(fromAgeInput ? fromAgeInput.value : '');
      if (!isNaN(fromAge)) {
        this._suppressMortgagePlanSync = true;
        try {
          this._setInputValueWithFlash(toAgeInput, fromAge, true);
        } finally {
          this._suppressMortgagePlanSync = false;
        }
      }
    }

    if (eventType === 'MP' && sourceField) {
      this._removeHiddenInput(row, 'event-auto-payoff');
    }

    if (eventType === 'R' && sourceField === 'toAge') {
      this._syncLinkedMortgageEventsToPropertyAge(eventId);
      return;
    }

    if (this.isMortgagePlanEvent(eventType)) {
      this._syncMortgagePlanById(eventId, { sourceType: eventType, sourceField: sourceField });
    }

    if (eventType === 'R' || eventType === 'MR') {
      this._scheduleMortgagePlanReanalysis();
    }
  }

  ensureMortgagePayoffEvent(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const typeInput = row.querySelector('.event-type');
    if (!typeInput || typeInput.value !== 'M') return;
    const nameInput = row.querySelector('.event-name');
    const id = nameInput ? String(nameInput.value || '').trim() : '';
    if (!id) return;
    this._syncMortgagePlanById(id, { sourceType: 'M', sourceField: 'toAge', forceCreatePayoff: true });
  }

  _syncLinkedMortgageEventsToPropertyAge(id) {
    if (!id) return;
    const rows = this._collectMortgageRowsById(id);
    const riRows = rows.all.filter(r => {
      const typeInput = r.querySelector('.event-type');
      return typeInput && typeInput.value === 'RI';
    });
    const rRow = rows.all.find(r => {
      const typeInput = r.querySelector('.event-type');
      return typeInput && typeInput.value === 'R';
    }) || null;
    if (!rRow) return;

    const propertyToAgeInput = rRow.querySelector('.event-to-age');
    const propertyToAge = this._parseAgeValue(propertyToAgeInput ? propertyToAgeInput.value : '');
    if (isNaN(propertyToAge)) return;
    let targetMortgageToAge = propertyToAge;
    if (rows.mRow) {
      const mortgageFromInput = rows.mRow.querySelector('.event-from-age');
      const mortgageFromAge = this._parseAgeValue(mortgageFromInput ? mortgageFromInput.value : '');
      const mortgageTermYears = this._ensureMortgageTermInput(rows.mRow);
      const baselineMortgageToAge = (!isNaN(mortgageFromAge) && mortgageTermYears > 0)
        ? (mortgageFromAge + mortgageTermYears)
        : NaN;
      if (!isNaN(baselineMortgageToAge) && targetMortgageToAge > baselineMortgageToAge) {
        targetMortgageToAge = baselineMortgageToAge;
      }
    }
    let preserveManualAmount = false;
    if (rows.mRow && rows.mpRow) {
      const currentModel = this._buildMortgageModelFromRow(rows.mRow);
      const currentOverpayWindows = this._buildOverpayWindowsFromRows(rows.moRows);
      const currentPayoffAge = this._parseAgeValue(rows.mpRow.querySelector('.event-from-age') ? rows.mpRow.querySelector('.event-from-age').value : '');
      const currentPayoffAmount = this._parseNumericValue(rows.mpRow.querySelector('.event-amount') ? rows.mpRow.querySelector('.event-amount').value : '', { preferThousands: true });
      this._removeHiddenInput(rows.mpRow, 'event-resolution-override');
      if (currentModel && !isNaN(currentPayoffAge) && !isNaN(currentPayoffAmount)) {
        const computedCurrentAmount = Math.max(0, Math.round(this._remainingPrincipalAtAge(currentModel, currentOverpayWindows, currentPayoffAge)));
        preserveManualAmount = Math.round(currentPayoffAmount) !== computedCurrentAmount;
      }
    }

    this._suppressMortgagePlanSync = true;
    try {
      if (rows.mRow) {
        const mToInput = rows.mRow.querySelector('.event-to-age');
        const mToAge = this._parseAgeValue(mToInput ? mToInput.value : '');
        if (!isNaN(mToAge) && !isNaN(targetMortgageToAge) && mToAge !== targetMortgageToAge) {
          this._setInputValueWithFlash(mToInput, targetMortgageToAge, true);
        }
      }
      if (rows.mpRow) {
        const mpFromInput = rows.mpRow.querySelector('.event-from-age');
        const mpToInput = rows.mpRow.querySelector('.event-to-age');
        const mpFromAge = this._parseAgeValue(mpFromInput ? mpFromInput.value : '');
        const mpToAge = this._parseAgeValue(mpToInput ? mpToInput.value : '');
        if (!isNaN(mpFromAge) && !isNaN(targetMortgageToAge) && mpFromAge !== targetMortgageToAge) {
          this._setInputValueWithFlash(mpFromInput, targetMortgageToAge, true);
        }
        if (!isNaN(mpToAge) && !isNaN(targetMortgageToAge) && mpToAge !== targetMortgageToAge) {
          this._setInputValueWithFlash(mpToInput, targetMortgageToAge, true);
        }
      }
      for (let i = 0; i < rows.moRows.length; i++) {
        const moToInput = rows.moRows[i].querySelector('.event-to-age');
        if (!moToInput) continue;
        const moToAge = this._parseAgeValue(moToInput.value);
        if (!isNaN(moToAge) && moToAge > propertyToAge) {
          this._setInputValueWithFlash(moToInput, propertyToAge, true);
        }
      }
      if (rows.mrRow) {
        const mrToInput = rows.mrRow.querySelector('.event-to-age');
        const mrToAge = this._parseAgeValue(mrToInput ? mrToInput.value : '');
        if (!isNaN(mrToAge) && mrToAge > propertyToAge) {
          this._setInputValueWithFlash(mrToInput, propertyToAge, true);
        }
      }
      for (let i = 0; i < riRows.length; i++) {
        const riToInput = riRows[i].querySelector('.event-to-age');
        const riToAge = this._parseAgeValue(riToInput ? riToInput.value : '');
        if (!isNaN(riToAge) && riToAge > propertyToAge) {
          this._setInputValueWithFlash(riToInput, propertyToAge, true);
        }
      }
    } finally {
      this._suppressMortgagePlanSync = false;
    }

    if (rows.mRow) {
      this._syncMortgagePlanById(id, { sourceType: 'M', sourceField: 'toAge', forceCreatePayoff: !rows.mpRow, preserveManualAmount: preserveManualAmount });
    }
  }

  _scheduleMortgagePlanReanalysis() {
    if (this._mortgageImpactTimeout) clearTimeout(this._mortgageImpactTimeout);
    this._mortgageImpactTimeout = setTimeout(() => {
      try {
        this._refreshValidation();
      } catch (err) {
        console.error('Error revalidating mortgage plan:', err);
      }
    }, 120);
  }

  _getRelocationStatusEvents(events) {
    return Array.isArray(events) ? events : [];
  }

  _handleAgeFieldBlur(row, fieldType) {
    if (!row) return;
    const cfg = Config.getInstance();
    if (!cfg.isRelocationEnabled()) return;

    const fromAgeInput = row.querySelector('.event-from-age');
    const toAgeInput = row.querySelector('.event-to-age');
    const fromAge = fromAgeInput ? fromAgeInput.value : '';
    const toAge = toAgeInput ? toAgeInput.value : '';

    // Only infer if we have at least fromAge
    if (!fromAge) return;
    const activeAgeInput = fieldType === 'to' ? toAgeInput : fromAgeInput;
    const previousAgeValue = activeAgeInput && activeAgeInput.dataset ? String(activeAgeInput.dataset.prevAgeValue || '') : '';
    const currentAgeValue = activeAgeInput ? String(activeAgeInput.value || '') : '';
    if (activeAgeInput && previousAgeValue !== currentAgeValue) {
      this._removeHiddenInput(row, 'event-resolution-override');
      this._applyToRealEstatePair(row, (r) => this._removeHiddenInput(r, 'event-resolution-override'));
    }

    // Auto-infer for truly new rows: either still empty, or first-time from-age entry.
    // Existing events edited later should still surface jurisdiction_change impacts.
    const nameInput = row.querySelector('.event-name');
    const amountInput = row.querySelector('.event-amount');
    const fromAgeWasEmpty = !fromAgeInput || !String((fromAgeInput.dataset && fromAgeInput.dataset.prevAgeValue) || '').trim();
    const isFirstFromAgeEntry = fieldType === 'from' && fromAgeWasEmpty;
    const isNewEvent = ((!nameInput || !nameInput.value.trim()) && (!amountInput || !amountInput.value.trim())) || isFirstFromAgeEntry;

    if (isNewEvent) {
      const events = this.webUI.readEvents(false);
      const startCountry = cfg.getStartCountry();
      const mvEvents = RelocationImpactDetector.buildRelocationTimeline(events);

      const inferred = RelocationImpactDetector.inferEventCurrency({
        fromAge: fromAge,
        toAge: toAge
      }, mvEvents, startCountry);

      let inferredJurisdiction = false;
      if (inferred.linkedCountry) {
        // Only set if not already set or if it's a property/mortgage (which might need auto-linking)
        const existingLinked = row.querySelector('.event-linked-country');
        if (!existingLinked || !existingLinked.value) {
          this.getOrCreateHiddenInput(row, 'event-linked-country', inferred.linkedCountry);
          this.getOrCreateHiddenInput(row, 'event-country', inferred.linkedCountry);
          inferredJurisdiction = true;
        }
      }
      if (inferred.currency) {
        const existingCurrency = row.querySelector('.event-currency');
        if (!existingCurrency || !existingCurrency.value) {
          this.getOrCreateHiddenInput(row, 'event-currency', inferred.currency);
          inferredJurisdiction = true;
        }
      }
      if (inferredJurisdiction && amountInput && amountInput.value) {
        const normalizedAmount = String(amountInput.value).replace(/[^0-9\-]/g, '');
        const numericAmount = Number(normalizedAmount);
        if (!isNaN(numericAmount)) amountInput.value = String(numericAmount);
        if (this.webUI && this.webUI.formatUtils && typeof this.webUI.formatUtils.setupCurrencyInputs === 'function') {
          this.webUI.formatUtils.setupCurrencyInputs(true);
        }
      }
    }

    this._scheduleRelocationReanalysis();
  }

  _syncSplitChainsForRelocationAgeShift(delta, markerIds, newRelocationAge) {
    if (typeof delta !== 'number' || isNaN(delta) || !markerIds || !markerIds.length) return;
    const markerSet = new Set(markerIds.map(m => String(m || '')).filter(Boolean));
    if (markerSet.size === 0) return;

    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    const chains = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const linkedInput = row.querySelector('.event-linked-event-id');
      const linkedId = linkedInput ? String(linkedInput.value || '') : '';
      if (!linkedId) continue;
      const splitMvInput = row.querySelector('.event-relocation-split-mv-id');
      const splitMvId = splitMvInput ? String(splitMvInput.value || '') : '';
      if (!splitMvId || !markerSet.has(splitMvId)) continue;
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

      const nextPart1To = firstTo + delta;
      const nextPart2From = secondFrom + delta;

      // Relocation moved before the split range: keep destination-side row only.
      if (nextPart1To < firstFrom) {
        secondFromInput.value = String(firstFrom);
        this._flashInput(secondFromInput);
        this._removeHiddenInput(secondRow, 'event-linked-event-id');
        this._removeHiddenInput(secondRow, 'event-relocation-split-mv-id');
        this._removeHiddenInput(secondRow, 'event-relocation-split-anchor-age');
        this._removeHiddenInput(secondRow, 'event-relocation-split-anchor-amount');
        this._removeHiddenInput(secondRow, 'event-relocation-split-value-mode');
        this._clearSplitSuggestionTracking(secondRow);
        this._removeHiddenInput(secondRow, 'event-resolution-override');
        this._deleteRowWithExistingAnimation(firstRow);
        continue;
      }

      // Relocation moved after the split range: keep origin-side row only.
      if (nextPart2From > secondTo) {
        firstToInput.value = String(secondTo);
        this._flashInput(firstToInput);
        this._removeHiddenInput(firstRow, 'event-linked-event-id');
        this._removeHiddenInput(firstRow, 'event-relocation-split-mv-id');
        this._removeHiddenInput(firstRow, 'event-relocation-split-anchor-age');
        this._removeHiddenInput(firstRow, 'event-relocation-split-anchor-amount');
        this._removeHiddenInput(firstRow, 'event-relocation-split-value-mode');
        this._clearSplitSuggestionTracking(firstRow);
        this._removeHiddenInput(firstRow, 'event-resolution-override');
        this._deleteRowWithExistingAnimation(secondRow);
        continue;
      }

      firstToInput.value = String(nextPart1To);
      secondFromInput.value = String(nextPart2From);
      this._flashInput(firstToInput);
      this._flashInput(secondFromInput);
      this.getOrCreateHiddenInput(firstRow, 'event-relocation-split-anchor-age', String(newRelocationAge));
      this.getOrCreateHiddenInput(secondRow, 'event-relocation-split-anchor-age', String(newRelocationAge));
      this._removeHiddenInput(firstRow, 'event-resolution-override');
      this._removeHiddenInput(secondRow, 'event-resolution-override');
    }
  }

  _syncSoldRealEstateForRelocationAgeShift(delta, markerIds, newRelocationAge) {
    if (typeof delta !== 'number' || isNaN(delta) || !markerIds || !markerIds.length) return;
    const markerSet = new Set(markerIds.map(m => String(m || '')).filter(Boolean));
    if (markerSet.size === 0) return;

    const prevMortgageSync = this._suppressMortgagePlanSync;
    this._suppressMortgagePlanSync = true;
    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const markerInput = row.querySelector('.event-relocation-sell-mv-id');
        const markerValue = markerInput ? String(markerInput.value || '') : '';
        if (!markerValue || !markerSet.has(markerValue)) continue;

        const typeInput = row.querySelector('.event-type');
        const typeValue = typeInput ? typeInput.value : '';
        if (typeValue !== 'R' && !this.isMortgageLinkedEvent(typeValue)) continue;

        const fromAgeInput = row.querySelector('.event-from-age');
        const fromAge = Number(fromAgeInput ? fromAgeInput.value : '');
        const toAgeInput = row.querySelector('.event-to-age');
        if (!toAgeInput) continue;
        const currentToAge = Number(toAgeInput.value);
        if (isNaN(currentToAge)) continue;

        const targetToAge = currentToAge + delta;
        if (!isNaN(fromAge) && targetToAge < fromAge) {
          this._removeHiddenInput(row, 'event-relocation-sell-mv-id');
          this._removeHiddenInput(row, 'event-relocation-sell-anchor-age');
          this._removeHiddenInput(row, 'event-resolution-override');
          continue;
        }

        this._suppressSellMarkerClear = true;
        toAgeInput.value = String(targetToAge);
        this._flashInput(toAgeInput);
        toAgeInput.dispatchEvent(new Event('change', { bubbles: true }));
        this._suppressSellMarkerClear = false;
        this.getOrCreateHiddenInput(row, 'event-relocation-sell-anchor-age', String(newRelocationAge));
        this._removeHiddenInput(row, 'event-resolution-override');
      }
    } finally {
      this._suppressMortgagePlanSync = prevMortgageSync;
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
      const hasConfiguredEvents = this.hasConfiguredEvents();

      if (startingAgeVal === 0 && hasConfiguredEvents) {
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

  hasConfiguredEvents() {
    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(row =>
      !(row.classList && row.classList.contains('resolution-panel-row')) &&
      row.style.display !== 'none'
    );
    return rows.some(row => !this.isEventEmpty(row));
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
    if (eventType === 'MP') {
      const mpToInput = row.querySelector('.event-to-age');
      if (mpToInput) {
        mpToInput.style.visibility = 'hidden';
      }
    }
    const rateInput = row.querySelector('.event-rate');
    if (eventType === 'MV' && rateInput) {
      rateInput.value = '';
    }
    if (rateInput) {
      rateInput.placeholder = (!required || !required.rate || required.rate === 'optional') ? 'inflation' : '';
    }

    const nameInput = row.querySelector('.event-name');
    const countryDropdown = row.querySelector('.event-country-dd');
    const mortgageDropdown = row.querySelector('.event-mortgage-dd');
    if (nameInput && countryDropdown && mortgageDropdown) {
      const isRelocation = eventType === 'MV';
      const isPropertyLinked = this.isPropertyLinkedEvent(eventType);

      nameInput.style.display = (isRelocation || isPropertyLinked) ? 'none' : '';
      countryDropdown.style.display = isRelocation ? '' : 'none';
      mortgageDropdown.style.display = isPropertyLinked ? '' : 'none';

      // Update nameInput._dropdownWrapper for validation logic
      if (isRelocation && row._eventCountryDropdown) {
        nameInput._dropdownWrapper = row._eventCountryDropdown.wrapper;
      } else if (isPropertyLinked && row._eventMortgageDropdown) {
        nameInput._dropdownWrapper = row._eventMortgageDropdown.wrapper;
        this.updateMortgageOptions(row);
      } else {
        nameInput._dropdownWrapper = null;
      }
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
        const curVal = typeInput.value;
        const baseOpts = this.getEventTypeOptionObjects(curVal);
        const opts = baseOpts;
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
      if (event && event.relocationImpact && String(event.relocationImpact.category || '').indexOf('mortgage_') === 0) {
        delete event.relocationImpact;
      }

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
          const isOpen = (row.nextElementSibling && row.nextElementSibling.classList && row.nextElementSibling.classList.contains('resolution-panel-row'));
          if (isOpen) {
            this.collapseResolutionPanel(row);
          } else {
            this.expandResolutionPanel(row);
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

    if (this.viewMode === 'accordion' && this.webUI && this.webUI.eventAccordionManager) {
      const accordionManager = this.webUI.eventAccordionManager;
      if (accordionManager.events && accordionManager.events.length) {
        accordionManager.events.forEach((ev) => {
          accordionManager.refreshEventSummary(ev);
        });
      }
    }
  }

  /**
   * Expand inline resolution panel below the event row
   */
  expandResolutionPanel(rowRef) {
    const row = (rowRef && rowRef.nodeType === 1)
      ? rowRef
      : document.querySelector(`tr[data-row-id="${rowRef}"]`);
    if (!row) return;

    // Check if row has impact dataset - if not, no panel needed
    if (row.dataset.relocationImpact !== '1') return;

    const typeInput = row.querySelector('.event-type');
    const nameInput = row.querySelector('.event-name');
    const amountInput = row.querySelector('.event-amount');
    const fromAgeInput = row.querySelector('.event-from-age');
    const toAgeInput = row.querySelector('.event-to-age');
    const rateInput = row.querySelector('.event-rate');
    const matchInput = row.querySelector('.event-match');
    if (!typeInput || !nameInput) return;

    const event = {
      type: typeInput.value || '',
      id: nameInput.value || '',
      amount: amountInput ? amountInput.value : '',
      fromAge: fromAgeInput ? fromAgeInput.value : '',
      toAge: toAgeInput ? toAgeInput.value : '',
      rate: rateInput ? rateInput.value : undefined,
      match: matchInput ? matchInput.value : undefined
    };
    const currencyInput = row.querySelector('.event-currency');
    if (currencyInput && currencyInput.value) event.currency = currencyInput.value;
    const linkedCountryInput = row.querySelector('.event-linked-country');
    if (linkedCountryInput && linkedCountryInput.value) event.linkedCountry = linkedCountryInput.value;
    const linkedEventIdInput = row.querySelector('.event-linked-event-id');
    if (linkedEventIdInput && linkedEventIdInput.value) event.linkedEventId = linkedEventIdInput.value;
    const rentMvIdInput = row.querySelector('.event-relocation-rent-mv-id');
    if (rentMvIdInput && rentMvIdInput.value) event.relocationRentMvId = rentMvIdInput.value;
    event.relocationImpact = {
      category: row.dataset.relocationImpactCategory || '',
      message: row.dataset.relocationImpactMessage || '',
      mvEventId: row.dataset.relocationImpactMvId || '',
      autoResolvable: row.dataset.relocationImpactAuto === '1'
    };
    if (row.dataset.relocationImpactDetails) event.relocationImpact.details = row.dataset.relocationImpactDetails;

    if (!event.relocationImpact) return;
    const env = { webUI: this.webUI, eventsTableManager: this, config: (typeof Config !== 'undefined' ? Config.getInstance() : null), formatUtils: this.webUI && this.webUI.formatUtils };
    RelocationImpactAssistant.renderPanelForTableRow(row, event, env);
  }

  /**
   * Collapse the resolution panel for the given row
   */
  collapseResolutionPanel(rowRef) {
    const row = (rowRef && rowRef.nodeType === 1)
      ? rowRef
      : document.querySelector(`tr[data-row-id="${rowRef}"]`);
    if (!row) return;
    RelocationImpactAssistant.collapsePanelForTableRow(row);
  }

  _findEventRow(rowId, eventId) {
    const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
    if (rowId && eventId) {
      for (let i = 0; i < rows.length; i++) {
        const rid = rows[i].dataset ? rows[i].dataset.rowId : '';
        const eid = rows[i].dataset ? rows[i].dataset.eventId : '';
        if (rid === rowId && eid === eventId) return rows[i];
      }
    }
    // eventId is globally unique and remains stable after sorting.
    if (eventId) {
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].dataset && rows[i].dataset.eventId === eventId) return rows[i];
      }
    }
    // Row id fallback for legacy callers that don't pass eventId.
    if (rowId) {
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].dataset && rows[i].dataset.rowId === rowId) return rows[i];
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
    const destCountry = String(mvEvent && mvEvent.name ? mvEvent.name : '').trim().toLowerCase();

    // Determine locale hints from the inline resolution panel
    const panelContainer = row.nextElementSibling && row.nextElementSibling.querySelector && row.nextElementSibling.querySelector('.resolution-panel-container');
    let toCountryHint = panelContainer ? panelContainer.getAttribute('data-to-country') : null;
    let fromCountryHint = panelContainer ? panelContainer.getAttribute('data-from-country') : null;
    if (!toCountryHint) toCountryHint = destCountry;
    if (!fromCountryHint) {
      fromCountryHint = this.getOriginCountry(mvEvent, Config.getInstance().getStartCountry());
    }
    toCountryHint = toCountryHint ? String(toCountryHint).toLowerCase() : '';
    fromCountryHint = fromCountryHint ? String(fromCountryHint).toLowerCase() : '';

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

    let part2AmountNum = parseByCountry(part2AmountRaw, toCountryHint);
    let part2Amount = (typeof part2AmountNum === 'number') ? String(part2AmountNum) : '';
    const effectiveDestinationCountry = toCountryHint || destCountry;
    const destRuleSet = Config.getInstance().getCachedTaxRuleSet(effectiveDestinationCountry);
    const destCurrency = destRuleSet ? destRuleSet.getCurrencyCode() : 'EUR';

    let part2EventType = event.type;
    if (destRuleSet && typeof destRuleSet.hasPrivatePensions === 'function' && !destRuleSet.hasPrivatePensions()) {
      if (event.type === 'SI') part2EventType = 'SInp';
      else if (event.type === 'SI2') part2EventType = 'SI2np';
    }

    const linkedEventIdInput = row.querySelector('.event-linked-event-id');
    const linkedEventId = (linkedEventIdInput && linkedEventIdInput.value)
      ? String(linkedEventIdInput.value)
      : ((event && event.linkedEventId) ? String(event.linkedEventId) : this._nextCompactId('split'));
    const usedSegIds = new Set(
      Array.from(document.querySelectorAll('#Events tbody tr .event-relocation-split-segment-id'))
        .map(input => String(input.value || ''))
        .filter(Boolean)
    );
    let segId = this._nextCompactId('seg');
    while (usedSegIds.has(segId)) segId = this._nextCompactId('seg');
    const splitMvId = this._getRelocationLinkIdByImpactId(mvImpactId) || String(mvImpactId || '');
    // Prefer parsing the original row's displayed amount using the row's current locale/country hint.
    // This avoids blank amount issues when an event was first created post-relocation and later moved
    // before the relocation boundary (display may still be in destination locale/currency at split time).
    const originalAmountRaw = (row.querySelector && row.querySelector('.event-amount') ? row.querySelector('.event-amount').value : (event && event.amount));
    const rowCountryHintInput = row.querySelector('.event-country');
    const rowLinkedCountryInput = row.querySelector('.event-linked-country');
    const rowCountryHint = rowCountryHintInput && rowCountryHintInput.value
      ? String(rowCountryHintInput.value).toLowerCase()
      : (rowLinkedCountryInput && rowLinkedCountryInput.value ? String(rowLinkedCountryInput.value).toLowerCase() : '');
    let part1AmountNum = parseByCountry(originalAmountRaw, rowCountryHint || fromCountryHint);
    if ((typeof part1AmountNum !== 'number' || isNaN(part1AmountNum)) && fromCountryHint && rowCountryHint !== fromCountryHint) {
      part1AmountNum = parseByCountry(originalAmountRaw, fromCountryHint);
    }
    if ((typeof part1AmountNum !== 'number' || isNaN(part1AmountNum)) && toCountryHint && toCountryHint !== fromCountryHint) {
      part1AmountNum = parseByCountry(originalAmountRaw, toCountryHint);
    }
    const part1Amount = (typeof part1AmountNum === 'number') ? String(part1AmountNum) : '';
    if ((typeof part2AmountNum !== 'number' || isNaN(part2AmountNum)) && typeof part1AmountNum === 'number' && !isNaN(part1AmountNum)) {
      const fallbackFromCountry = (fromCountryHint ? String(fromCountryHint).toLowerCase() : Config.getInstance().getStartCountry());
      const fallbackToCountry = (toCountryHint ? String(toCountryHint).toLowerCase() : destCountry);
      const fallbackSuggested = RelocationSplitSuggestionLib.getSuggestedAmount(part1AmountNum, fallbackFromCountry, fallbackToCountry);
      if (!isNaN(fallbackSuggested)) {
        part2AmountNum = fallbackSuggested;
        part2Amount = String(fallbackSuggested);
      }
    }

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
    this.getOrCreateHiddenInput(part1Row, 'event-relocation-split-segment-id', segId);
    if (splitMvId) this.getOrCreateHiddenInput(part1Row, 'event-relocation-split-mv-id', splitMvId);
    if (!isNaN(relocationAgeNum)) this.getOrCreateHiddenInput(part1Row, 'event-relocation-split-anchor-age', String(relocationAgeNum));
    if (fromCountryHint) this.getOrCreateHiddenInput(part1Row, 'event-country', String(fromCountryHint).toLowerCase());
    const originalLinkedCountry = event && event.linkedCountry ? String(event.linkedCountry).toLowerCase() : '';
    const originalCurrency = event && event.currency ? String(event.currency).toUpperCase() : '';
    if (originalLinkedCountry) {
      this.getOrCreateHiddenInput(part1Row, 'event-linked-country', originalLinkedCountry);
      this.getOrCreateHiddenInput(part1Row, 'event-country', originalLinkedCountry);
    }
    if (originalCurrency) this.getOrCreateHiddenInput(part1Row, 'event-currency', originalCurrency);
    const originalRentMvId = event && event.relocationRentMvId ? String(event.relocationRentMvId) : '';
    if (originalRentMvId) this.getOrCreateHiddenInput(part1Row, 'event-relocation-rent-mv-id', originalRentMvId);
    const part2Row = this.createEventRow(part2EventType, event.id, part2Amount, relocationAge, event.toAge, rateForInput, matchForInput);
    this.getOrCreateHiddenInput(part2Row, 'event-linked-event-id', linkedEventId);
    this.getOrCreateHiddenInput(part2Row, 'event-relocation-split-segment-id', segId);
    if (splitMvId) this.getOrCreateHiddenInput(part2Row, 'event-relocation-split-mv-id', splitMvId);
    if (!isNaN(relocationAgeNum)) this.getOrCreateHiddenInput(part2Row, 'event-relocation-split-anchor-age', String(relocationAgeNum));
    if (typeof part1AmountNum === 'number' && !isNaN(part1AmountNum)) {
      this.getOrCreateHiddenInput(part2Row, 'event-relocation-split-anchor-amount', String(part1AmountNum));
    }
    this._setSplitValueMode(part2Row, 'suggested');
    const part2LinkedCountry = toCountryHint ? String(toCountryHint).toLowerCase() : destCountry;
    this._setSplitSuggestionReviewBaseline(
      part2Row,
      part1AmountNum,
      fromCountryHint || Config.getInstance().getStartCountry(),
      part2LinkedCountry || destCountry
    );
    this.getOrCreateHiddenInput(part2Row, 'event-currency', destCurrency);
    if (part2LinkedCountry) {
      this.getOrCreateHiddenInput(part2Row, 'event-country', part2LinkedCountry);
      this.getOrCreateHiddenInput(part2Row, 'event-linked-country', part2LinkedCountry);
    }
    if (originalRentMvId) this.getOrCreateHiddenInput(part2Row, 'event-relocation-rent-mv-id', originalRentMvId);

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
      this._afterResolutionAction(row.dataset.rowId); // No animation on the "deleting" ID
      
      // Animate the new rows
      if (part1Row) {
        this._flashInput(part1Row.querySelector('.event-to-age'));
      }

      // After table and accordion refresh/sort, animate the new table row (pulse)
      if (typeof this.animateNewTableRow === 'function') {
        setTimeout(() => { this.animateNewTableRow(newEventData, { flashFields: ['.event-amount'] }); }, 400);
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
    this._afterResolutionAction(row.dataset.rowId, { flashFields: ['.event-to-age'], pulse: true });
  }

  joinSplitEvents(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    const linkedEventIdInput = row.querySelector('.event-linked-event-id');
    const linkedEventId = linkedEventIdInput ? linkedEventIdInput.value : '';
    if (!linkedEventId) return;
    const segmentRows = this._getSegmentRowsForImpact(row);

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

    const useSegmentPair = segmentRows.length >= 2;
    let firstRow = splitRows[0];
    let lastRow = splitRows[splitRows.length - 1];
    let rowsToRemove = splitRows;
    if (useSegmentPair) {
      const scopedRows = segmentRows.slice(0, 2).sort((a, b) => {
        const fromDiff = getNum(a, '.event-from-age') - getNum(b, '.event-from-age');
        if (fromDiff !== 0) return fromDiff;
        return getNum(a, '.event-to-age') - getNum(b, '.event-to-age');
      });
      firstRow = scopedRows[0];
      lastRow = scopedRows[1];
      rowsToRemove = scopedRows;
    }

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
    for (let i = 0; i < rowsToRemove.length; i++) rowsToRemove[i].remove();
    if (useSegmentPair) {
      const remainingRows = Array.from(document.querySelectorAll('#Events tbody tr')).filter((candidate) => {
        if (!candidate || (candidate.classList && candidate.classList.contains('resolution-panel-row'))) return false;
        const idInput = candidate.querySelector('.event-linked-event-id');
        return idInput && idInput.value === linkedEventId;
      });
      const remainingSegmentRows = remainingRows.filter((candidate) => {
        const segmentInput = candidate.querySelector('.event-relocation-split-segment-id');
        return !!(segmentInput && String(segmentInput.value || ''));
      });
      if (remainingSegmentRows.length > 0) {
        this.getOrCreateHiddenInput(mergedRow, 'event-linked-event-id', linkedEventId);
      } else {
        for (let i = 0; i < remainingRows.length; i++) {
          const segmentInput = remainingRows[i].querySelector('.event-relocation-split-segment-id');
          const segmentId = segmentInput ? String(segmentInput.value || '') : '';
          if (!segmentId) this._removeHiddenInput(remainingRows[i], 'event-linked-event-id');
        }
      }
    }

    if (this.webUI && this.webUI.formatUtils) {
      this.webUI.formatUtils.setupCurrencyInputs();
      this.webUI.formatUtils.setupPercentageInputs();
    }

    if (this.sortKeys && this.sortKeys.length > 0 && typeof this.applySort === 'function') {
      this.applySort({ skipAnimation: true });
    } else {
      const ageInput = document.querySelector('#Events tbody tr .event-from-age');
      if (ageInput) {
        ageInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }

    const mergedRowId = mergedRow && mergedRow.dataset ? mergedRow.dataset.rowId : resolvedRowId;
    this._afterResolutionAction(mergedRowId, { flashFields: ['.event-to-age'], pulse: true });
  }

  joinSplitWithPrevious(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    const linkedEventIdInput = row.querySelector('.event-linked-event-id');
    const linkedEventId = linkedEventIdInput ? String(linkedEventIdInput.value || '') : '';
    if (!linkedEventId) return;

    const allRows = Array.from(document.querySelectorAll('#Events tbody tr')).filter((r) => !(r.classList && r.classList.contains('resolution-panel-row')));
    const splitRows = allRows.filter((r) => {
      const idInput = r.querySelector('.event-linked-event-id');
      return idInput && String(idInput.value || '') === linkedEventId;
    });
    if (splitRows.length < 3) return;

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

    const rowIndex = splitRows.indexOf(row);
    if (rowIndex <= 0 || rowIndex >= splitRows.length - 1) return;
    const previousRow = splitRows[rowIndex - 1];
    const currentRow = splitRows[rowIndex];

    const mergedType = previousRow.querySelector('.event-type') ? previousRow.querySelector('.event-type').value : '';
    const mergedName = previousRow.querySelector('.event-name') ? previousRow.querySelector('.event-name').value : '';
    const mergedAmount = previousRow.querySelector('.event-amount') ? previousRow.querySelector('.event-amount').value : '';
    const mergedFromAge = previousRow.querySelector('.event-from-age') ? previousRow.querySelector('.event-from-age').value : '';
    const mergedToAge = currentRow.querySelector('.event-to-age') ? currentRow.querySelector('.event-to-age').value : '';
    const mergedRate = previousRow.querySelector('.event-rate') ? previousRow.querySelector('.event-rate').value : '';
    const mergedMatch = previousRow.querySelector('.event-match') ? previousRow.querySelector('.event-match').value : '';

    const mergedRow = this.createEventRow(
      mergedType,
      mergedName,
      mergedAmount,
      mergedFromAge,
      mergedToAge,
      mergedRate,
      mergedMatch
    );

    const copyHiddenValue = (sourceRow, targetRow, selector, className, preserveCase) => {
      const input = sourceRow ? sourceRow.querySelector(selector) : null;
      const value = input ? String(input.value || '') : '';
      if (!value) return;
      const normalized = preserveCase ? value : value.toLowerCase();
      this.getOrCreateHiddenInput(targetRow, className, normalized);
    };
    // Keep user-visible financial identity from the previous segment (origin-side amount/currency).
    copyHiddenValue(previousRow, mergedRow, '.event-currency', 'event-currency', true);
    copyHiddenValue(previousRow, mergedRow, '.event-linked-country', 'event-linked-country', false);
    copyHiddenValue(previousRow, mergedRow, '.event-country', 'event-country', false);
    copyHiddenValue(previousRow, mergedRow, '.event-relocation-rent-mv-id', 'event-relocation-rent-mv-id', true);
    copyHiddenValue(currentRow, mergedRow, '.event-currency', 'event-currency', true);
    copyHiddenValue(currentRow, mergedRow, '.event-linked-country', 'event-linked-country', false);
    copyHiddenValue(currentRow, mergedRow, '.event-country', 'event-country', false);
    copyHiddenValue(currentRow, mergedRow, '.event-relocation-rent-mv-id', 'event-relocation-rent-mv-id', true);

    // Keep downstream split linkage from the current segment so part 3 remains chain-linked.
    this.getOrCreateHiddenInput(mergedRow, 'event-linked-event-id', linkedEventId);
    copyHiddenValue(currentRow, mergedRow, '.event-relocation-split-mv-id', 'event-relocation-split-mv-id', true);
    copyHiddenValue(currentRow, mergedRow, '.event-relocation-split-segment-id', 'event-relocation-split-segment-id', true);
    copyHiddenValue(currentRow, mergedRow, '.event-relocation-split-anchor-age', 'event-relocation-split-anchor-age', true);
    copyHiddenValue(currentRow, mergedRow, '.event-relocation-split-anchor-amount', 'event-relocation-split-anchor-amount', true);
    copyHiddenValue(currentRow, mergedRow, '.event-relocation-split-value-mode', 'event-relocation-split-value-mode', true);
    copyHiddenValue(currentRow, mergedRow, '.event-relocation-split-reviewed-suggested-amount', 'event-relocation-split-reviewed-suggested-amount', true);
    copyHiddenValue(currentRow, mergedRow, '.event-relocation-split-suggestion-model-version', 'event-relocation-split-suggestion-model-version', true);

    this.collapseResolutionPanel(resolvedRowId);
    previousRow.insertAdjacentElement('beforebegin', mergedRow);
    previousRow.remove();
    currentRow.remove();

    if (this.webUI && this.webUI.formatUtils) {
      this.webUI.formatUtils.setupCurrencyInputs();
      this.webUI.formatUtils.setupPercentageInputs();
    }

    if (this.sortKeys && this.sortKeys.length > 0 && typeof this.applySort === 'function') {
      this.applySort({ skipAnimation: true });
    } else {
      const ageInput = document.querySelector('#Events tbody tr .event-from-age');
      if (ageInput) ageInput.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    const mergedRowId = mergedRow && mergedRow.dataset ? mergedRow.dataset.rowId : resolvedRowId;
    this._afterResolutionAction(mergedRowId, { flashFields: ['.event-to-age'], pulse: true });
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
    const segmentRows = this._getSegmentRowsForImpact(row);
    let firstRow = null;
    let secondRow = null;
    if (segmentRows.length >= 2) {
      firstRow = segmentRows[0];
      secondRow = segmentRows[1];
    } else {
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
      firstRow = splitRows[0];
      secondRow = splitRows[1];
    }
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
      this._removeHiddenInput(secondRow, 'event-relocation-split-segment-id');
      this._removeHiddenInput(secondRow, 'event-relocation-split-anchor-age');
      this._removeHiddenInput(secondRow, 'event-relocation-split-anchor-amount');
      this._removeHiddenInput(secondRow, 'event-relocation-split-value-mode');
      this._clearSplitSuggestionTracking(secondRow);
      this._removeHiddenInput(secondRow, 'event-resolution-override');
      this._removeRowAndResolutionPanel(firstRow);
      this._afterResolutionAction(row.dataset.rowId, { flashFields: ['.event-from-age'], pulse: true });
      return;
    }

    // Relocation moved after the split range: keep origin-side row only.
    if (nextPart2From > secondTo) {
      firstToInput.value = String(secondTo);
      this._removeHiddenInput(firstRow, 'event-linked-event-id');
      this._removeHiddenInput(firstRow, 'event-relocation-split-mv-id');
      this._removeHiddenInput(firstRow, 'event-relocation-split-segment-id');
      this._removeHiddenInput(firstRow, 'event-relocation-split-anchor-age');
      this._removeHiddenInput(firstRow, 'event-relocation-split-anchor-amount');
      this._removeHiddenInput(firstRow, 'event-relocation-split-value-mode');
      this._clearSplitSuggestionTracking(firstRow);
      this._removeHiddenInput(firstRow, 'event-resolution-override');
      this._removeRowAndResolutionPanel(secondRow);
      this._afterResolutionAction(row.dataset.rowId, { flashFields: ['.event-to-age'], pulse: true });
      return;
    }

    firstToInput.value = String(nextPart1To);
    secondFromInput.value = String(nextPart2From);
    this.getOrCreateHiddenInput(firstRow, 'event-relocation-split-anchor-age', String(relocationAge));
    this.getOrCreateHiddenInput(secondRow, 'event-relocation-split-anchor-age', String(relocationAge));
    this._removeHiddenInput(firstRow, 'event-resolution-override');
    this._removeHiddenInput(secondRow, 'event-resolution-override');
    this._afterResolutionAction(row.dataset.rowId, { flashFields: ['.event-to-age', '.event-from-age'], pulse: true });
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
    const resolutionScope = this._getResolutionScopeForRow(row);
    const segmentRows = this._getSegmentRowsForImpact(row);
    if (segmentRows.length > 0) {
      for (let i = 0; i < segmentRows.length; i++) {
        this._setResolutionOverride(segmentRows[i], resolutionScope);
      }
    } else if (segmentRows.length === 0) {
      const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => !(r.classList && r.classList.contains('resolution-panel-row')));
      for (let i = 0; i < rows.length; i++) {
        const idInput = rows[i].querySelector('.event-linked-event-id');
        if (idInput && idInput.value === linkedEventId) {
          this._setResolutionOverride(rows[i], resolutionScope);
        }
      }
    }
    this._afterResolutionAction(row.dataset.rowId, { pulse: true });
  }

  keepSplitValueAsIs(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    const linkedEventIdInput = row.querySelector('.event-linked-event-id');
    const linkedEventId = linkedEventIdInput ? linkedEventIdInput.value : '';
    if (!linkedEventId) return;
    const segmentRows = this._getSegmentRowsForImpact(row);
    let part1Row = null;
    let part2Row = null;
    if (segmentRows.length >= 2) {
      part1Row = segmentRows[0];
      part2Row = segmentRows[1];
    } else {
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
      part1Row = splitRows[0];
      part2Row = splitRows[1];
    }
    const part1AmountInput = part1Row.querySelector('.event-amount');
    if (!part1AmountInput) return;
    const part1Amount = RelocationSplitSuggestionLib.parseAmountValue(part1AmountInput.value);
    if (isNaN(part1Amount)) return;
    this.getOrCreateHiddenInput(part2Row, 'event-relocation-split-anchor-amount', String(part1Amount));
    this._setSplitValueMode(part2Row, 'suggested');
    const countries = this._resolveSplitSuggestionCountries(row, part1Row);
    this._setSplitSuggestionReviewBaseline(part2Row, part1Amount, countries.fromCountry, countries.toCountry);
    this._afterResolutionAction(row.dataset.rowId, { pulse: true });
  }

  updateSplitValue(rowId, suggestedAmount, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    const amountInput = row.querySelector('.event-amount');
    if (amountInput) {
      const panelContainer = row.nextElementSibling && row.nextElementSibling.querySelector && row.nextElementSibling.querySelector('.resolution-panel-container');
      const toCountryHint = panelContainer ? panelContainer.getAttribute('data-to-country') : null;
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
      const amountNum = parseByCountry(suggestedAmount, toCountryHint);
      amountInput.value = isNaN(amountNum) ? '' : String(amountNum);
      if (this.webUI && this.webUI.formatUtils && typeof this.webUI.formatUtils.setupCurrencyInputs === 'function') {
        this.webUI.formatUtils.setupCurrencyInputs();
        amountInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      amountInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.keepSplitValueAsIs(row.dataset.rowId, eventId);
    this._afterResolutionAction(row.dataset.rowId, { flashFields: ['.event-amount'], pulse: true });
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
    this._suppressSellMarkerClear = false;
    this._afterResolutionAction(row.dataset.rowId, { flashFields: ['.event-to-age'], pulse: true });
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

  _getOrphanSaleMarkerContext(row) {
    if (!row) return { realEstateId: '', markerId: '', rows: [] };

    const nameInput = row.querySelector('.event-name');
    const realEstateId = nameInput ? String(nameInput.value || '').trim() : '';
    let markerId = '';
    let details = null;

    if (row.dataset && row.dataset.relocationImpactDetails) {
      try {
        details = JSON.parse(row.dataset.relocationImpactDetails);
      } catch (_) {
        details = null;
      }
    }
    if (details && details.sellMvId) markerId = String(details.sellMvId || '');
    if (!markerId) {
      const markerInput = row.querySelector('.event-relocation-sell-mv-id');
      markerId = markerInput ? String(markerInput.value || '') : '';
    }

    const workflowRows = Array.from(document.querySelectorAll('#Events tbody tr')).filter((candidate) => {
      if (!candidate || (candidate.classList && candidate.classList.contains('resolution-panel-row'))) return false;
      const candidateName = candidate.querySelector('.event-name');
      const typeInput = candidate.querySelector('.event-type');
      const candidateId = candidateName ? String(candidateName.value || '').trim() : '';
      const typeValue = typeInput ? String(typeInput.value || '') : '';
      return candidateId === realEstateId && this.isRealEstate(typeValue);
    });

    return {
      realEstateId: realEstateId,
      markerId: markerId,
      rows: workflowRows
    };
  }

  _rowMatchesSaleMarker(row, markerId) {
    if (!row) return false;
    const markerInput = row.querySelector('.event-relocation-sell-mv-id');
    let rowMarkerId = markerInput ? String(markerInput.value || '') : '';
    if (!rowMarkerId && row.dataset && row.dataset.relocationImpactDetails) {
      try {
        const details = JSON.parse(row.dataset.relocationImpactDetails);
        rowMarkerId = details && details.sellMvId ? String(details.sellMvId || '') : '';
      } catch (_) {
        rowMarkerId = '';
      }
    }
    if (!markerId) return !!rowMarkerId;
    return rowMarkerId === String(markerId);
  }

  _clearOrphanSaleWorkflowState(rows, markerId) {
    const workflowRows = Array.isArray(rows) ? rows : [];
    for (let i = 0; i < workflowRows.length; i++) {
      const workflowRow = workflowRows[i];
      this._removeHiddenInput(workflowRow, 'event-resolution-override');
      this._removeHiddenInput(workflowRow, 'event-resolution-mv-id');
      this._removeHiddenInput(workflowRow, 'event-resolution-category');
      if (!this._rowMatchesSaleMarker(workflowRow, markerId)) continue;
      this._removeHiddenInput(workflowRow, 'event-relocation-sell-mv-id');
      this._removeHiddenInput(workflowRow, 'event-relocation-sell-anchor-age');
    }
  }

  keepSaleTimingAfterDeletedRelocation(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;

    const context = this._getOrphanSaleMarkerContext(row);
    if (!context.rows.length) return;
    if (context.markerId) this._clearRelocationAgeShift([context.markerId]);
    this._clearOrphanSaleWorkflowState(context.rows, context.markerId);
    this._afterResolutionAction(row.dataset.rowId, { pulse: true });
  }

  restoreMortgagePlanAfterDeletedRelocation(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;

    const context = this._getOrphanSaleMarkerContext(row);
    if (!context.rows.length || !context.realEstateId) return;

    const mortgageRows = this._collectMortgageRowsById(context.realEstateId);
    if (!mortgageRows.mRow) {
      this.keepSaleTimingAfterDeletedRelocation(rowId, eventId);
      return;
    }

    const mFromInput = mortgageRows.mRow.querySelector('.event-from-age');
    const mToInput = mortgageRows.mRow.querySelector('.event-to-age');
    const mortgageFromAge = this._parseAgeValue(mFromInput ? mFromInput.value : '');
    const mortgageTermYears = this._ensureMortgageTermInput(mortgageRows.mRow);
    if (isNaN(mortgageFromAge) || !(mortgageTermYears > 0) || !mToInput) {
      this.keepSaleTimingAfterDeletedRelocation(rowId, eventId);
      return;
    }

    const restoredMortgageToAge = mortgageFromAge + mortgageTermYears;
    const prevMortgageSync = this._suppressMortgagePlanSync;
    this._suppressMortgagePlanSync = true;
    try {
      mToInput.value = String(restoredMortgageToAge);
      mToInput.dispatchEvent(new Event('change', { bubbles: true }));

      const propertyRow = context.rows.find((candidate) => {
        const typeInput = candidate.querySelector('.event-type');
        return typeInput && typeInput.value === 'R';
      }) || null;
      if (propertyRow) {
        const propertyToInput = propertyRow.querySelector('.event-to-age');
        const propertyToAge = this._parseAgeValue(propertyToInput ? propertyToInput.value : '');
        if (propertyToInput && (isNaN(propertyToAge) || propertyToAge < restoredMortgageToAge)) {
          propertyToInput.value = String(restoredMortgageToAge);
          propertyToInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    } finally {
      this._suppressMortgagePlanSync = prevMortgageSync;
    }

    const removablePayoffRows = context.rows.filter((candidate) => {
      const typeInput = candidate.querySelector('.event-type');
      return typeInput && typeInput.value === 'MP' && this._rowMatchesSaleMarker(candidate, context.markerId);
    });
    for (let i = 0; i < removablePayoffRows.length; i++) {
      this._removeRowAndResolutionPanel(removablePayoffRows[i]);
    }

    this._clearOrphanSaleWorkflowState(context.rows, context.markerId);
    if (context.markerId) this._clearRelocationAgeShift([context.markerId]);
    this._scheduleMortgagePlanReanalysis();

    const focusRow = mortgageRows.mRow && mortgageRows.mRow.isConnected ? mortgageRows.mRow : row;
    const focusRowId = focusRow && focusRow.dataset ? focusRow.dataset.rowId : rowId;
    this._afterResolutionAction(focusRowId, { flashFields: ['.event-to-age'], pulse: true });
  }

  pegCurrencyToOriginal(rowId, currencyCode, linkedCountry, eventId, convertedAmount) {
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
            .filter(e => isRelocationEvent(e))
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
    const resolutionScope = this._getResolutionScopeForRow(row);
    const hasConvertedAmount = convertedAmount !== undefined && convertedAmount !== null && String(convertedAmount).trim() !== '';
    const convertedAmountNum = hasConvertedAmount ? Number(convertedAmount) : NaN;
    if (hasConvertedAmount && !isNaN(convertedAmountNum)) {
      const amountInput = row.querySelector('.event-amount');
      if (amountInput) {
        amountInput.value = String(convertedAmountNum);
        amountInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    const normalizeAmountForCurrencyFormatting = (targetRow) => {
      const amountInput = targetRow ? targetRow.querySelector('.event-amount') : null;
      if (!amountInput || !amountInput.value) return;
      const normalizedAmount = String(amountInput.value).replace(/[^0-9\-]/g, '');
      const numericAmount = Number(normalizedAmount);
      if (!isNaN(numericAmount)) amountInput.value = String(numericAmount);
    };
    // Set currency on current row
    this.getOrCreateHiddenInput(row, 'event-currency', currencyCode);
    if (resolvedLinkedCountry) {
      this.getOrCreateHiddenInput(row, 'event-linked-country', resolvedLinkedCountry);
      this.getOrCreateHiddenInput(row, 'event-country', resolvedLinkedCountry);
    }
    normalizeAmountForCurrencyFormatting(row);
    this._setResolutionOverride(row, resolutionScope);
    // Also apply to paired real-estate rows if applicable
    this._applyToRealEstatePair(row, (r) => {
      this.getOrCreateHiddenInput(r, 'event-currency', currencyCode);
      if (resolvedLinkedCountry) {
        this.getOrCreateHiddenInput(r, 'event-linked-country', resolvedLinkedCountry);
        this.getOrCreateHiddenInput(r, 'event-country', resolvedLinkedCountry);
      }
      normalizeAmountForCurrencyFormatting(r);
      this._setResolutionOverride(r, resolutionScope);
    });
    if (this.webUI && this.webUI.formatUtils && typeof this.webUI.formatUtils.setupCurrencyInputs === 'function') {
      this.webUI.formatUtils.setupCurrencyInputs(true);
    }
    this._afterResolutionAction(row.dataset.rowId, { pulse: true });
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

    // If SI/SI2 and destination pension is state_only, auto-convert to non-pensionable.
    // This is specifically correct for the destination-side (second half) of split salary events.
    const typeInput = row.querySelector('.event-type');
    const currentType = typeInput ? typeInput.value : null;
    if (currentType === 'SI' || currentType === 'SI2') {
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
        dest = mv ? String(mv.name || '').trim().toLowerCase() : null;
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
          const matchInput = row.querySelector('.event-match');
          if (matchInput) {
            matchInput.value = '';
            matchInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
    }
    this._afterResolutionAction(row.dataset.rowId, { flashFields: ['.event-amount'], pulse: true });
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
          const formattedAmount = (typeof FormatUtils !== 'undefined' && typeof FormatUtils.formatCurrency === 'function')
            ? FormatUtils.formatCurrency(convertedAmountNum, currency, selectedCountry)
            : String(convertedAmountNum);
          amountInput.value = formattedAmount;
          amountInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
    // Reapply currency/percentage input formatting to ensure proper formatting
    if (this.webUI && this.webUI.formatUtils) {
      this.webUI.formatUtils.setupCurrencyInputs();
      this.webUI.formatUtils.setupPercentageInputs();
    }
    this._afterResolutionAction(row.dataset.rowId, { flashFields: ['.event-amount'], pulse: true });
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
    this._afterResolutionAction(row.dataset.rowId, { pulse: true });
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
    if (toggleEl) {
      const opts = this.getEventTypeOptionObjects(newType);
      const opt = opts.find(o => o && o.value === newType);
      toggleEl.textContent = (opt && opt.label) ? opt.label : newType;
    }
    if (row._eventTypeDropdown && typeof row._eventTypeDropdown.setValue === 'function') row._eventTypeDropdown.setValue(newType);
    this.updateFieldVisibility(typeInput);
    typeInput.dispatchEvent(new Event('change', { bubbles: true }));
    const matchInput = row.querySelector('.event-match');
    if (matchInput) {
      matchInput.value = '';
      matchInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this._afterResolutionAction(row.dataset.rowId, { pulse: true });
  }

  // Helper: apply function to all rows with same id for real-estate + mortgage-linked events
  _applyToRealEstatePair(row, fn) {
    const idVal = row && row.querySelector ? (row.querySelector('.event-name')?.value) : null;
    if (!idVal) return;
    const rows = Array.from(document.querySelectorAll('#Events tbody tr'));
    const targets = rows.filter(r => {
      const t = r.querySelector('.event-type');
      const n = r.querySelector('.event-name');
      return t && n && (t.value === 'R' || this.isMortgageLinkedEvent(t.value)) && n.value === idVal;
    });
    for (let i = 0; i < targets.length; i++) fn(targets[i]);
  }

  markAsReviewed(rowId, eventId) {
    const row = this._findEventRow(rowId, eventId);
    if (!row) return;
    const resolvedRowId = row.dataset ? row.dataset.rowId : rowId;
    const resolutionScope = this._getResolutionScopeForRow(row);
    // Always apply review override to the current row
    this._setResolutionOverride(row, resolutionScope);
    // Also apply to paired real-estate rows if applicable (R/M with same id)
    this._applyToRealEstatePair(row, (r) => this._setResolutionOverride(r, resolutionScope));
    this._afterResolutionAction(row.dataset.rowId, { pulse: true });
  }

  _afterResolutionAction(rowId, options = {}) {
    this.collapseResolutionPanel(rowId);
    const events = this.webUI.readEvents(false);
    const startCountry = Config.getInstance().getStartCountry();
    
    RelocationImpactDetector.analyzeEvents(events, startCountry);
    this.updateRelocationImpactIndicators(events);
    this.webUI.updateStatusForRelocationImpacts(this._getRelocationStatusEvents(events));
    if (this.webUI.eventAccordionManager) {
      // Relocation resolution impacts should generally skip the "flying" sort animation
      // unless they involve creating a second event (which is handled by split/rent actions explicitly calling applySort)
      this.webUI.eventAccordionManager.refresh({ skipSortAnimation: true });
      // In accordion mode, the refresh re-renders everything.
      if (rowId && options.pulse) {
        setTimeout(() => {
          if (typeof this.webUI.eventAccordionManager.highlightEventByRowId === 'function') {
            this.webUI.eventAccordionManager.highlightEventByRowId(rowId);
          }
        }, 100);
      }
    }

    // Handle animations for table view
    const row = this._findEventRow(rowId);
    if (row) {
      if (options.pulse) {
        // Small delay to let the resolution panel collapse animation start
        setTimeout(() => this.animateRowHighlight(row, { skipScrollIfVisible: true }), 100);
      }
      if (options.flashFields && options.flashFields.length) {
        options.flashFields.forEach(selector => {
          const input = row.querySelector(selector);
          if (input) this._flashInput(input);
        });
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
    return RelocationSplitSuggestionLib.getSuggestedAmount(amount, fromCountry, toCountry);
  }

  detectPropertyCountry(eventFromAge, startCountry) {
    const events = this.webUI.readEvents(false);
    const mvEvents = events.filter(e => e && e.type === 'MV').sort((a, b) => a.fromAge - b.fromAge);
    if (eventFromAge < mvEvents[0]?.fromAge) return startCountry;
    for (let i = mvEvents.length - 1; i >= 0; i--) {
      if (eventFromAge >= mvEvents[i].fromAge) {
        return String(mvEvents[i] && mvEvents[i].name ? mvEvents[i].name : '').trim().toLowerCase();
      }
    }
    return startCountry;
  }

  getOriginCountry(mvEvent, startCountry) {
    const events = this.webUI.readEvents(false);
    const mvEvents = events.filter(e => e && e.type === 'MV').sort((a, b) => a.fromAge - b.fromAge);
    const mvImpactId = mvEvent ? (mvEvent.id || mvEvent._mvRuntimeId || '') : '';
    const index = mvEvents.findIndex(e => e && (e.id === mvImpactId || e._mvRuntimeId === mvImpactId));
    if (index > 0) {
      return String(mvEvents[index - 1] && mvEvents[index - 1].name ? mvEvents[index - 1].name : '').trim().toLowerCase();
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
    return ['R', 'M', 'MO', 'MP', 'MR'].includes(eventType);
  }

  isMortgageLinkedEvent(eventType) {
    return ['M', 'MO', 'MP', 'MR'].includes(eventType);
  }

  isPropertyLinkedEvent(eventType) {
    return this.isMortgageLinkedEvent(eventType) || eventType === 'RI';
  }

  isMortgagePlanEvent(eventType) {
    return ['M', 'MO', 'MP'].includes(eventType);
  }

  getMortgageDisclosureFlags() {
    const events = (this.webUI && typeof this.webUI.readEvents === 'function')
      ? (this.webUI.readEvents(false) || [])
      : [];
    return {
      hasPropertyEvent: events.some(evt => evt && evt.type === 'R'),
      hasMortgageEvent: events.some(evt => evt && evt.type === 'M')
    };
  }

  passesMortgageDisclosure(eventType, disclosureFlags, forcedVisibleEventType = '') {
    if (!eventType) return true;
    if (forcedVisibleEventType && eventType === forcedVisibleEventType) return true;
    const isMortgageRelated = eventType === 'M' || eventType === 'MO' || eventType === 'MP' || eventType === 'MR';
    if (isMortgageRelated && !disclosureFlags.hasPropertyEvent) return false;
    const requiresMortgage = eventType === 'MO' || eventType === 'MP';
    if (requiresMortgage && !disclosureFlags.hasMortgageEvent) return false;
    return true;
  }

  isRelocation(eventType) {
    return eventType === 'MV';
  }

  applyTypeColouring(row) {
    const typeVal = row.querySelector('.event-type')?.value;
    const toggle = row.querySelector('.dd-toggle');
    if (!toggle) return;
    /* Reset all possible styling classes, including the new 'nop' marker */
    toggle.classList.remove('inflow', 'outflow', 'real-estate', 'stock-market', 'relocation', 'nop');

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
    } else if (this.isRelocation(typeVal)) {
      toggle.classList.add('relocation');
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
    if (typeof window === 'undefined') return;
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
        const skipScroll = !!(typeof window !== 'undefined' && window.event && window.event.detail && window.event.detail.skipScroll);
        if (!skipScroll) {
          this.webUI.eventAccordionManager._scrollExpandedItemIntoView?.(accordionEl);
        }
      } else {
        // Item collapsed – only scroll if it's off-screen. Use block:"nearest" to
        // avoid forcing the header to the middle which causes the later upward
        // correction.
        if (typeof window === 'undefined') return;
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

  async syncTaxRuleSetsForCurrentEvents() {
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
  }

  async applyEventTypeSelection(row, eventType, label) {
    if (!row) return;
    const typeInput = row.querySelector('.event-type');
    if (!typeInput) return;

    typeInput.value = eventType || '';
    const rowId = row.dataset ? row.dataset.rowId : '';
    let toggleEl = rowId
      ? row.querySelector(`#EventTypeToggle_${rowId}`)
      : row.querySelector('.event-type-dd .dd-toggle');
    if (!toggleEl) toggleEl = row.querySelector('.event-type-dd .dd-toggle');
    if (toggleEl && label) toggleEl.textContent = label;

    this.updateFieldVisibility(typeInput);
    this.applyTypeColouring(row);
    typeInput.dispatchEvent(new Event('change', { bubbles: true }));
    this.updateEventRowsVisibilityAndTypes();

    if (typeInput.value === 'MV') {
      await this.syncTaxRuleSetsForCurrentEvents();
      this._scheduleRelocationReanalysis();
    }
  }

  async applyCountrySelection(row, countryCode, label) {
    if (!row) return;
    const nameInput = row.querySelector('.event-name');
    if (!nameInput) return;

    const upperCode = String(countryCode || '').trim().toUpperCase();
    nameInput.value = upperCode;

    const rowId = row.dataset ? row.dataset.rowId : '';
    let countryToggleEl = rowId
      ? row.querySelector(`#EventCountryToggle_${rowId}`)
      : row.querySelector('.event-country-dd .dd-toggle');
    if (!countryToggleEl) countryToggleEl = row.querySelector('.event-country-dd .dd-toggle');
    if (countryToggleEl) {
      countryToggleEl.textContent = label || 'Select country';
    }

    if (row._eventCountryDropdown && typeof row._eventCountryDropdown.setOptions === 'function') {
      const countries = Config.getInstance().getAvailableCountries();
      const countryOptions = Array.isArray(countries)
        ? countries.map(c => ({
          value: String(c.code).toUpperCase(),
          label: c.name,
          selected: String(c.code).toUpperCase() === upperCode
        }))
        : [];
      row._eventCountryDropdown.setOptions(countryOptions);
    }

    nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    await this.syncTaxRuleSetsForCurrentEvents();
    this._scheduleRelocationReanalysis();
  }

  async applyMortgageSelection(row, propertyName, label, options = {}) {
    if (!row) return;
    const nameInput = row.querySelector('.event-name');
    if (!nameInput) return;
    const rowType = row.querySelector('.event-type') ? row.querySelector('.event-type').value : '';
    const previousName = String(nameInput.value || '').trim();
    nameInput.value = propertyName || '';

    const rowId = row.dataset ? row.dataset.rowId : '';
    let mortgageToggleEl = rowId
      ? row.querySelector(`#EventMortgageToggle_${rowId}`)
      : row.querySelector('.event-mortgage-dd .dd-toggle');
    if (!mortgageToggleEl) mortgageToggleEl = row.querySelector('.event-mortgage-dd .dd-toggle');
    const placeholder = this.getMortgageDropdownPlaceholder(rowType);
    if (mortgageToggleEl) {
      mortgageToggleEl.textContent = label || placeholder;
    }

    // Update internal selected value in the dropdown object
    if (row._eventMortgageDropdown && typeof row._eventMortgageDropdown.setOptions === 'function') {
      this.updateMortgageOptions(row);
    }

    if (rowType === 'M' && previousName && previousName !== propertyName) {
      const tbody = row.closest('tbody');
      if (tbody) {
        tbody.querySelectorAll('tr').forEach(linkedRow => {
          const linkedTypeInput = linkedRow.querySelector('.event-type');
          const linkedNameInput = linkedRow.querySelector('.event-name');
          if (!linkedTypeInput || !linkedNameInput) return;
          if ((linkedTypeInput.value === 'MO' || linkedTypeInput.value === 'MP') && linkedNameInput.value.trim() === previousName) {
            linkedNameInput.value = propertyName || '';
            linkedNameInput.dispatchEvent(new Event('change', { bubbles: true }));
            if (linkedRow._eventMortgageDropdown) this.updateMortgageOptions(linkedRow);
          }
        });
      }
    }

    // Clear warnings and re-run validation to update the ready state
    const skipValidation = !!(options && options.skipValidation);
    if (!skipValidation && this.webUI) {
      this.webUI.clearAllWarnings();
      // Re-run validation. uiManager is global or accessible via webUI.
      const uiMgr = (typeof uiManager !== 'undefined') ? uiManager : (this.webUI.uiManager);
      if (uiMgr && typeof uiMgr.readEvents === 'function') {
        uiMgr.readEvents(true);
      }
    }

    nameInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  getMortgageDropdownPlaceholder(eventType) {
    return (eventType === 'MO' || eventType === 'MP') ? 'Select Mortgage' : 'Select Property';
  }

  getMortgageDropdownOptionNames(row) {
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) return [];

    const rowType = row && row.querySelector('.event-type') ? row.querySelector('.event-type').value : '';
    const sourceType = (rowType === 'MO' || rowType === 'MP') ? 'M' : 'R';
    const primary = Array.from(tbody.querySelectorAll('tr')).filter(r => {
      const typeInput = r.querySelector('.event-type');
      return typeInput && typeInput.value === sourceType;
    }).map(r => {
      const nameEl = r.querySelector('.event-name');
      return nameEl ? String(nameEl.value || '').trim() : '';
    }).filter(name => !!name);

    if (sourceType === 'R' || primary.length > 0) {
      return Array.from(new Set(primary));
    }

    // Fallback for MP/MO editing: if no mortgage row exists yet, allow selecting a property name.
    const fallback = Array.from(tbody.querySelectorAll('tr')).filter(r => {
      const typeInput = r.querySelector('.event-type');
      return typeInput && typeInput.value === 'R';
    }).map(r => {
      const nameEl = r.querySelector('.event-name');
      return nameEl ? String(nameEl.value || '').trim() : '';
    }).filter(name => !!name);

    return Array.from(new Set(fallback));
  }

  updateMortgageOptions(row) {
    if (!row || !row._eventMortgageDropdown) return;

    const nameInput = row.querySelector('.event-name');
    const currentValue = String(nameInput ? nameInput.value : '').trim();
    const optionNames = this.getMortgageDropdownOptionNames(row);
    const options = optionNames.map(name => ({
      value: name,
      label: name,
      selected: name === currentValue
    }));

    row._eventMortgageDropdown.setOptions(options);

    // Update toggle text if it doesn't match current selection (e.g. after rename or initial load)
    const rowId = row.dataset ? row.dataset.rowId : '';
    const toggleById = rowId ? row.querySelector(`#EventMortgageToggle_${rowId}`) : null;
    const toggleByClass = row.querySelector('.event-mortgage-dd .dd-toggle');
    const toggleEl = toggleById || toggleByClass;
    if (toggleEl) {
      const matched = options.find(o => o.value === currentValue);
      const rowType = row.querySelector('.event-type') ? row.querySelector('.event-type').value : '';
      toggleEl.textContent = matched ? matched.label : this.getMortgageDropdownPlaceholder(rowType);
    }
  }

  setRowFieldValue(row, selector, value) {
    if (!row) return;
    const input = row.querySelector(selector);
    if (!input) return;
    input.value = (value === undefined || value === null) ? '' : String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async populateRowFromWizardData(row, eventData) {
    if (!row) return;

    const desiredType = String((eventData && eventData.eventType) || '');
    const typeOptions = this.getEventTypeOptionObjects(desiredType);
    const typeOption = typeOptions.find(opt => opt.value === desiredType)
      || typeOptions.find(opt => opt.value === 'NOP')
      || typeOptions[0];

    if (row._eventTypeDropdown && typeof row._eventTypeDropdown.setOptions === 'function') {
      row._eventTypeDropdown.setOptions(typeOptions);
    }
    await this.applyEventTypeSelection(row, typeOption ? typeOption.value : '', typeOption ? typeOption.label : '');

    const resolvedType = typeOption ? typeOption.value : '';
    if (resolvedType === 'MV') {
      const countries = Config.getInstance().getAvailableCountries();
      const code = String((eventData && (eventData.destCountryCode || eventData.name)) || '').trim().toUpperCase();
      const matchedCountry = Array.isArray(countries)
        ? countries.find(c => String(c.code).toUpperCase() === code)
        : null;
      await this.applyCountrySelection(row, code, matchedCountry ? matchedCountry.name : code);
    } else if (this.isPropertyLinkedEvent(resolvedType)) {
      const propertyName = eventData && eventData.name != null ? eventData.name : '';
      await this.applyMortgageSelection(
        row,
        propertyName,
        propertyName || this.getMortgageDropdownPlaceholder(resolvedType),
        { skipValidation: true }
      );
    } else {
      const nameValue = eventData && eventData.name != null ? eventData.name : '';
      this.setRowFieldValue(row, '.event-name', nameValue);
    }

    const amountValue = eventData && eventData.amount != null ? eventData.amount : '';
    const fromAgeValue = eventData && eventData.fromAge != null ? eventData.fromAge : '';
    const toAgeValue = eventData && eventData.toAge != null ? eventData.toAge : '';
    const normalizedToAgeValue = (resolvedType === 'MP') ? fromAgeValue : toAgeValue;
    const rateValue = eventData && eventData.rate != null ? eventData.rate : '';
    const matchValue = eventData && eventData.match != null ? eventData.match : '';
    const sellMvIdValue = eventData && eventData.relocationSellMvId ? String(eventData.relocationSellMvId) : '';
    const sellAnchorAgeValue = eventData && eventData.relocationSellAnchorAge != null ? String(eventData.relocationSellAnchorAge) : '';
    const previousSuppressSellMarkerClear = this._suppressSellMarkerClear;
    const protectSellMarkersDuringPopulate = !!(sellMvIdValue || sellAnchorAgeValue);

    if (protectSellMarkersDuringPopulate) {
      this._suppressSellMarkerClear = true;
      if (sellMvIdValue) this.getOrCreateHiddenInput(row, 'event-relocation-sell-mv-id', sellMvIdValue);
      if (sellAnchorAgeValue) this.getOrCreateHiddenInput(row, 'event-relocation-sell-anchor-age', sellAnchorAgeValue);
    }

    try {
      this.setRowFieldValue(row, '.event-amount', amountValue);
      this.setRowFieldValue(row, '.event-from-age', fromAgeValue);
      this.setRowFieldValue(row, '.event-to-age', normalizedToAgeValue);
      this.setRowFieldValue(row, '.event-rate', rateValue);
      this.setRowFieldValue(row, '.event-match', matchValue);
    } finally {
      this._suppressSellMarkerClear = previousSuppressSellMarkerClear;
    }

    if (resolvedType === 'M') {
      const explicitTerm = eventData && eventData.mortgageTerm != null ? parseInt(String(eventData.mortgageTerm), 10) : NaN;
      const fromAgeNum = this._parseAgeValue(fromAgeValue);
      const toAgeNum = this._parseAgeValue(normalizedToAgeValue);
      const inferredTerm = (!isNaN(fromAgeNum) && !isNaN(toAgeNum) && toAgeNum > fromAgeNum) ? (toAgeNum - fromAgeNum) : NaN;
      const termYears = (explicitTerm > 0) ? explicitTerm : inferredTerm;
      if (termYears > 0) this.getOrCreateHiddenInput(row, 'event-mortgage-term', String(termYears));
    }

    if (eventData && eventData.linkedCountry) {
      this.getOrCreateHiddenInput(row, 'event-linked-country', eventData.linkedCountry);
      this.getOrCreateHiddenInput(row, 'event-country', eventData.linkedCountry);
    }
    if (eventData && eventData.currency) {
      this.getOrCreateHiddenInput(row, 'event-currency', eventData.currency);
    }
    if (eventData && eventData.relocationRentMvId) {
      this.getOrCreateHiddenInput(row, 'event-relocation-rent-mv-id', eventData.relocationRentMvId);
    }

    // Infer currency/linkedCountry if not explicitly provided and relocation is enabled
    if (Config.getInstance().isRelocationEnabled() && resolvedType !== 'MV' && (!eventData || (!eventData.linkedCountry && !eventData.currency))) {
      const events = this.webUI.readEvents(false);
      const startCountry = Config.getInstance().getStartCountry();
      const mvEvents = RelocationImpactDetector.buildRelocationTimeline(events);
      const inferred = RelocationImpactDetector.inferEventCurrency({
        fromAge: fromAgeValue,
        toAge: toAgeValue
      }, mvEvents, startCountry);
      if (inferred.linkedCountry) {
        this.getOrCreateHiddenInput(row, 'event-linked-country', inferred.linkedCountry);
        this.getOrCreateHiddenInput(row, 'event-country', inferred.linkedCountry);
      }
      if (inferred.currency) {
        this.getOrCreateHiddenInput(row, 'event-currency', inferred.currency);
      }
    }

    if (eventData && eventData.relocationReviewed) {
      const scope = {
        mvId: eventData.relocationImpact ? eventData.relocationImpact.mvEventId : '',
        category: eventData.relocationImpact ? eventData.relocationImpact.category : ''
      };
      this._setResolutionOverride(row, scope);
    }

    row.dataset.originalEventType = resolvedType;
    this._refreshValidation();
  }

  /**
   * Replace an empty row with event data from wizard
   * @param {HTMLElement} emptyRow - The empty row to replace
   * @param {Object} eventData - Data from the wizard
   */
  async replaceEmptyRowWithEvent(emptyRow, eventData) {
    if (!emptyRow) return null;

    await this.populateRowFromWizardData(emptyRow, eventData);
    const eventId = emptyRow.dataset.eventId || null;

    this.webUI.formatUtils.setupCurrencyInputs(true);
    this.webUI.formatUtils.setupPercentageInputs();
    this.animateRowHighlight(emptyRow, { skipScrollIfVisible: true });
    if (eventData && eventData.eventType === 'M') {
      const amountInput = emptyRow.querySelector('.event-amount');
      if (amountInput) this._flashInput(amountInput);
    }

    if (this.sortKeys && this.sortKeys.length > 0) {
      this.applySort();
    }

    if (this.viewMode === 'accordion' && this.webUI.eventAccordionManager) {
      this.webUI.eventAccordionManager.refreshWithNewEventAnimation(eventData, eventId);
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
    return { row: emptyRow, id: eventId };
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
    const eventId = this._nextCompactId('event');
    row.dataset.eventId = eventId;

    // Build dropdown options & find label for current selection
    let optionObjects = this.getEventTypeOptionObjects(type);
    let direct = optionObjects.find((o) => o.value === type);
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
      <td>
          <input type="text" id="EventAlias_${rowId}" class="event-name" value="${name}">
          <div class="event-country-dd visualization-control" id="EventCountry_${rowId}" style="display:none;">
              <span id="EventCountryToggle_${rowId}" class="dd-toggle pseudo-select">Select country</span>
              <div id="EventCountryOptions_${rowId}" class="visualization-dropdown" style="display:none;"></div>
          </div>
          <div class="event-mortgage-dd visualization-control" id="EventMortgage_${rowId}" style="display:none;">
              <span id="EventMortgageToggle_${rowId}" class="dd-toggle pseudo-select">Select Property</span>
              <div id="EventMortgageOptions_${rowId}" class="visualization-dropdown" style="display:none;"></div>
          </div>
      </td>
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

    const initialType = type || selectedObj.value;
    if (initialType === 'M') {
      const fromAgeNum = this._parseAgeValue(fromAge);
      const toAgeNum = this._parseAgeValue(toAge);
      const termYears = (!isNaN(fromAgeNum) && !isNaN(toAgeNum) && toAgeNum > fromAgeNum) ? (toAgeNum - fromAgeNum) : NaN;
      if (termYears > 0) this.getOrCreateHiddenInput(row, 'event-mortgage-term', String(termYears));
    }

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
        try {
          await this.applyEventTypeSelection(row, val, label);
        } catch (err) {
          console.error('Error selecting event type:', err);
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

    // Country dropdown for relocation (stores country code in name input)
    const nameInput = row.querySelector(`#EventAlias_${rowId}`);
    const countryToggleEl = row.querySelector(`#EventCountryToggle_${rowId}`);
    const countryDropdownEl = row.querySelector(`#EventCountryOptions_${rowId}`);
    if (nameInput && countryToggleEl && countryDropdownEl) {
      const countries = Config.getInstance().getAvailableCountries();
      const countryOptions = Array.isArray(countries)
        ? countries.map(c => ({ value: String(c.code).toUpperCase(), label: c.name }))
        : [];
      const currentCode = String(nameInput.value || '').trim().toUpperCase();
      const currentOption = countryOptions.find(opt => opt.value === currentCode) || null;
      countryToggleEl.textContent = currentOption ? currentOption.label : 'Select country';
      const countryDropdown = DropdownUtils.create({
        toggleEl: countryToggleEl,
        dropdownEl: countryDropdownEl,
        options: countryOptions,
        selectedValue: currentOption ? currentOption.value : undefined,
        onSelect: async (val, label) => {
          try {
            await this.applyCountrySelection(row, val, label);
          } catch (err) {
            console.error('Error selecting relocation country:', err);
          }
        },
      });
      row._eventCountryDropdown = countryDropdown;
      if (countryDropdown && countryDropdown.wrapper) {
        nameInput._dropdownWrapper = countryDropdown.wrapper;
      }
    }

    // Mortgage dropdown (stores linked property name in name input)
    const mortgageToggleEl = row.querySelector(`#EventMortgageToggle_${rowId}`);
    const mortgageDropdownEl = row.querySelector(`#EventMortgageOptions_${rowId}`);
    if (nameInput && mortgageToggleEl && mortgageDropdownEl) {
      const mortgageDropdown = DropdownUtils.create({
        toggleEl: mortgageToggleEl,
        dropdownEl: mortgageDropdownEl,
        options: [], // Populated on-demand via updateMortgageOptions
        selectedValue: String(nameInput.value || '').trim(),
        onSelect: async (val, label) => {
          try {
            await this.applyMortgageSelection(row, val, label);
          } catch (err) {
            console.error('Error selecting mortgage property:', err);
          }
        },
      });
      row._eventMortgageDropdown = mortgageDropdown;
      if (mortgageDropdown && mortgageDropdown.wrapper) {
        // Reuse same wrapper for nameInput when in mortgage mode
        // Note: nameInput._dropdownWrapper is used by validation system
        // We'll update it in updateFieldVisibility
      }
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

    // Direct listeners to enforce unique property names and handle propagation
    if (nameInput) {
      nameInput.addEventListener('focusin', () => {
        const currentType = typeInput.value;
        if (currentType === 'R') {
          nameInput.dataset.prevName = nameInput.value.trim();
        }
      });

      nameInput.addEventListener('blur', (e) => {
        const currentType = typeInput.value;
        if (currentType === 'R') {
          let newName = nameInput.value.trim();
          if (!newName) return;

          const oldName = nameInput.dataset.prevName || '';
          
          // Check for duplicates
          const tbody = row.closest('tbody') || document.querySelector('#Events tbody');
          if (!tbody) return;

          const otherRRows = Array.from(tbody.querySelectorAll('tr')).filter(r => {
            if (r === row) return false;
            const t = r.querySelector('.event-type');
            return t && t.value === 'R';
          });

          let finalName = newName;
          let counter = 2;
          
          const isDuplicate = (name) => otherRRows.some(r => {
            const n = r.querySelector('.event-name');
            return n && n.value.trim().toLowerCase() === name.toLowerCase();
          });

          while (isDuplicate(finalName)) {
            finalName = `${newName} ${counter}`;
            counter++;
          }

          if (finalName !== newName) {
            nameInput.value = finalName;
            newName = finalName;
            // Trigger input to update icons etc
            nameInput.dispatchEvent(new Event('input', { bubbles: true }));
          }

                // Propagate change to all events linked by property name.
          if (oldName && oldName !== newName) {
            tbody.querySelectorAll('tr').forEach(mRow => {
              const mTypeInput = mRow.querySelector('.event-type');
              const mNameInput = mRow.querySelector('.event-name');
              const linkedType = mTypeInput ? String(mTypeInput.value || '') : '';
              if (mNameInput && this.isPropertyLinkedEvent(linkedType) && mNameInput.value.trim() === oldName.trim()) {
                mNameInput.value = newName;
                mNameInput.dispatchEvent(new Event('change', { bubbles: true }));
                if (mRow._eventMortgageDropdown) {
                  this.updateMortgageOptions(mRow);
                }
              }
            });
          }
          
          nameInput.dataset.prevName = newName;
          
          // Refresh all mortgage dropdowns to reflect the new/updated R name
          tbody.querySelectorAll('tr').forEach(mRow => {
            const mTypeInput = mRow.querySelector('.event-type');
            const linkedType = mTypeInput ? String(mTypeInput.value || '') : '';
            if (this.isPropertyLinkedEvent(linkedType) && mRow._eventMortgageDropdown) {
              this.updateMortgageOptions(mRow);
            }
          });

          // Refresh validation to clear any "missing property" or "duplicate name" warnings
          this._refreshValidation();
        }
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

    // Call detector if relocation is enabled
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

  getEventTypeOptionObjects(forcedVisibleEventType = '') {
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
        { value: 'MO', label: 'Mortgage Overpay' },
        { value: 'MP', label: 'Mortgage Payoff' },
        { value: 'MR', label: 'Reverse Mortgage' },
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

    const disclosureFlags = this.getMortgageDisclosureFlags();
    const filteredEventTypes = eventTypes.filter((et) =>
      this.passesMortgageDisclosure(et && et.value, disclosureFlags, forcedVisibleEventType)
    );

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
    return filteredEventTypes.map((et) => ({
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

      // Handle age field blur for currency inference and relocation re-analysis
      if (e.target.matches('.event-from-age, .event-to-age')) {
        const row = e.target.closest('tr');
        if (row) {
          this._handleAgeFieldBlur(row, e.target.classList.contains('event-from-age') ? 'from' : 'to');
        }
      }
    }, true);
  }

  applySort(options = {}) {
    const skipAnimation = !!(options && options.skipAnimation);
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
      RowSorter.sortRows(tbody, this.sortKeys, { skipAnimation: skipAnimation });
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
      this.webUI.updateStatusForRelocationImpacts(this._getRelocationStatusEvents(events));
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
    const relocationFiltered = relocationEnabled ? wizards : wizards.filter(w => w.eventType !== 'MV');

    // Progressive disclosure for mortgage-related wizard options.
    const disclosureFlags = this.getMortgageDisclosureFlags();
    const filtered = relocationFiltered.filter((wizard) => {
      const eventType = wizard && wizard.eventType;
      return this.passesMortgageDisclosure(eventType, disclosureFlags);
    });

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

    const propertyWizards = wizards.filter(wizard => wizard && wizard.category === 'property');
    const showPropertySecondPage = propertyWizards.length > 1;
    const propertyHeaderOption = {
      eventType: '__property_group__',
      name: 'Property',
      category: 'property',
      isCategoryHeader: true
    };
    const firstPageWizards = [];
    let insertedPropertyHeader = false;
    wizards.forEach((wizard) => {
      const isPropertyWizard = wizard && wizard.category === 'property';
      if (!isPropertyWizard) {
        firstPageWizards.push(wizard);
        return;
      }
      if (!showPropertySecondPage) {
        firstPageWizards.push(wizard);
        return;
      }
      if (!insertedPropertyHeader) {
        firstPageWizards.push(propertyHeaderOption);
        insertedPropertyHeader = true;
      }
    });

    body.appendChild(wizardGrid);
    modal.appendChild(body);

    // Modal footer
    const footer = document.createElement('div');
    footer.className = 'event-wizard-step-footer';

    // Use a button container to apply consistent right-alignment styles
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'event-wizard-buttons';

    const backButton = document.createElement('button');
    backButton.className = 'event-wizard-button';
    backButton.textContent = 'Back';
    backButton.style.display = 'none';
    buttonContainer.appendChild(backButton);

    const cancelButton = document.createElement('button');
    cancelButton.className = 'event-wizard-button';
    cancelButton.textContent = 'Cancel';
    buttonContainer.appendChild(cancelButton);

    let handleKeyDown = null;
    const dismissSelectionModal = () => {
      overlay.remove();
      if (handleKeyDown) document.removeEventListener('keydown', handleKeyDown);
    };
    const cancelSelectionModal = () => {
      // Clear pending empty row reference when wizard selection is cancelled
      this.pendingEmptyRowForReplacement = null;
      dismissSelectionModal();
    };
    const renderWizardOptions = (wizardOptions) => {
      wizardGrid.innerHTML = '';
      wizardOptions.forEach((wizard) => {
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

        option.addEventListener('click', () => {
          if (wizard.isCategoryHeader) {
            renderSelectionPage('property');
            return;
          }
          this.startWizardForEventType(wizard.eventType, initialData);
          dismissSelectionModal();
        });

        wizardGrid.appendChild(option);
      });
    };
    const renderSelectionPage = (page) => {
      const isPropertyPage = page === 'property' && showPropertySecondPage;
      if (isPropertyPage) {
        title.textContent = 'Property Events';
        subtitle.textContent = 'Select the property event you want to create:';
        backButton.style.display = '';
        renderWizardOptions(propertyWizards);
      } else {
        title.textContent = 'Choose Event Type';
        subtitle.textContent = 'Select the type of event you want to create:';
        backButton.style.display = 'none';
        renderWizardOptions(firstPageWizards);
      }
    };
    backButton.addEventListener('click', () => {
      renderSelectionPage('main');
    });
    cancelButton.addEventListener('click', () => {
      cancelSelectionModal();
    });
    renderSelectionPage('main');

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
        cancelSelectionModal();
      }
    });

    // ESC key to close
    handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        cancelSelectionModal();
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
        async (eventData) => {
          // Check if we need to replace an empty row
          if (this.pendingEmptyRowForReplacement) {
            await this.replaceEmptyRowWithEvent(this.pendingEmptyRowForReplacement, eventData);
            this.pendingEmptyRowForReplacement = null; // Clear the reference
          } else {
            // Normal flow - create new event
            await this.addEventFromWizardWithSorting(eventData);
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
  async createEventFromWizard(eventData) {
    const result = this.addEventRow();
    if (!result || !result.row) return { row: null, id: null };
    await this.populateRowFromWizardData(result.row, eventData);
    if (this.webUI && this.webUI.formatUtils) {
      this.webUI.formatUtils.setupCurrencyInputs(true);
      this.webUI.formatUtils.setupPercentageInputs();
    }
    return result;
  }

  /**
   * Add event from wizard data with sorting and animation for table view
   * @param {Object} eventData - Data collected from wizard
   */
  async addEventFromWizardWithSorting(eventData) {
    const result = await this.createEventFromWizard(eventData);
    if (!result || !result.row) return null;

    const newRow = result.row;
    const newEventId = result.id;

    // Mark as just-created so animateNewTableRow can target it reliably
    newRow.classList.add('just-created');

    // Apply sorting animation
    this.applySort(); // Apply FLIP animation for moved rows
    this._scheduleRelocationReanalysis();

    // After sorting completes, animate the new table row highlight smoothly
    if (typeof this.animateNewTableRow === 'function') {
      setTimeout(() => { this.animateNewTableRow(eventData, { flashFields: ['.event-amount'] }); }, 400);
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
    return result;
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
  animateNewTableRow(eventData, options = {}) {
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
      this.animateRowHighlight(targetRow, { skipScrollIfVisible: true });

      // Also flash specific fields if requested
      if (options.flashFields && options.flashFields.length) {
        options.flashFields.forEach(selector => {
          const input = targetRow.querySelector(selector);
          if (input) this._flashInput(input);
        });
      }
    }
  }

  /**
   * Apply a pulse/zoom animation to a table row to highlight it
   */
  animateRowHighlight(row, options = {}) {
    if (!row) return;

    // Find the table container to temporarily allow overflow
    const tableContainer = row.closest('.table-container');
    const eventsTable = document.getElementById('Events');

    // Temporarily allow overflow to prevent clipping
    if (tableContainer) {
      tableContainer._originalOverflow = tableContainer.style.overflow;
      tableContainer.style.overflow = 'visible';
    }
    if (eventsTable) {
      eventsTable.style.overflow = 'visible';
    }

    // Add pulse animation class
    row.classList.add('new-event-highlight');

    // Make sure the row is visible before highlighting; scroll only if off-screen
    if (typeof window === 'undefined') return;
    const rect = row.getBoundingClientRect();
    const viewportHeight = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    const isVisible = rect.top >= 0 && rect.bottom <= viewportHeight;
    
    if (!isVisible || !options.skipScrollIfVisible) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Remove highlight and restore overflow after animation completes
    setTimeout(() => {
      row.classList.remove('new-event-highlight');
      row.classList.remove('just-created'); // Remove the marker if it exists

      // Restore original overflow settings
      if (tableContainer) {
        tableContainer.style.overflow = tableContainer._originalOverflow || '';
        delete tableContainer._originalOverflow;
      }
      if (eventsTable) {
        eventsTable.style.overflow = '';
      }
    }, 800);
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

}

// Make EventsTableManager available to CommonJS consumers and browser global
this.EventsTableManager = EventsTableManager;
