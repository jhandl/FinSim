/* Event Accordion Management functionality */

class EventAccordionManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.eventCounter = 0;
    // Track current toggle mode (load from localStorage if available)
    const storedMode = (() => {
      try {
        return localStorage.getItem('ageYearMode');
      } catch (_) {
        return null;
      }
    })();
    this.ageYearMode = (storedMode === 'year') ? 'year' : 'age';
    this.accordionContainer = null;
    this.events = []; // Store event data for accordion items
    this.expandedItems = new Set(); // Track which items are expanded
    this._newEventId = null;
    // Track auto-collapse timers per accordion item (wizard-created expansions)
    this._autoCollapseTimers = new Map();
    this.fieldLabelsManager = FieldLabelsManager.getInstance();
    this.setupAccordionContainer();
    this.setupResizeListener();
    this.setupAutoSortOnBlur();
  }

  /**
   * Initialize the accordion container
   */
  setupAccordionContainer() {
    // Find or create the accordion container
    let container = document.querySelector('.events-accordion-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'events-accordion-container';

      // Insert after the table container (not the table itself)
      const tableContainer = document.querySelector('.events-section .table-container');
      if (tableContainer && tableContainer.parentNode) {
        tableContainer.parentNode.insertBefore(container, tableContainer.nextSibling);
      } else {
        // Fallback: append to events section
        const eventsSection = document.querySelector('.events-section');
        if (eventsSection) {
          eventsSection.appendChild(container);
        }
      }
    }

    this.accordionContainer = container;

    // Apply initial year-mode class if needed
    if (this.ageYearMode === 'year') {
      container.classList.add('year-mode');
    }

    this.renderAccordion();
  }

  /**
   * Render the complete accordion interface
   */
  renderAccordion() {
    if (!this.accordionContainer) return;

    // Build minimal inline header + items
    const header = document.createElement('div');
    header.className = 'events-accordion-header';
    header.innerHTML = `
      <div class="accordion-header-row">
        <div class="accordion-header-left"></div>
        <div class="accordion-header-main">
          <div class="accordion-col sortable" data-col="event-type">Event Type <span class="sort-caret">⇅</span></div>
          <div class="accordion-col sortable" data-col="event-name">Name <span class="sort-caret">⇅</span></div>
          <div class="accordion-col sortable" data-col="event-amount">Amount <span class="sort-caret">⇅</span></div>
          <div class="accordion-col sortable" data-col="from-age">${this.ageYearMode === 'year' ? 'Year' : 'Period'} <span class="sort-caret">⇅</span></div>
        </div>
        <div class="accordion-header-right"></div>
      </div>
    `;

    const tableManager = this.webUI && this.webUI.eventsTableManager;
    if (tableManager) {
      // Click-to-sort
      header.querySelectorAll('.sortable').forEach(colEl => {
        colEl.addEventListener('click', () => {
          const col = colEl.getAttribute('data-col');
          if (!col) return;
          if (tableManager.sortColumn !== col) {
            tableManager.sortColumn = col;
            tableManager.sortDir = 'asc';
          } else {
            if (tableManager.sortDir === 'asc') tableManager.sortDir = 'desc';
            else if (tableManager.sortDir === 'desc') { tableManager.sortColumn = null; tableManager.sortDir = null; }
            else tableManager.sortDir = 'asc';
          }
          setTimeout(() => { tableManager.applySort(); updateIndicators(); }, 0);
        });
      });

      // Indicator sync (minimal)
      const updateIndicators = () => {
        header.querySelectorAll('.sortable').forEach(h => {
          h.classList.remove('sorted-asc', 'sorted-desc', 'sorted-secondary');
          const c = h.querySelector('.sort-caret'); if (c) c.textContent = '⇅';
        });
        const keys = tableManager.sortKeys || [];
        if (keys.length) {
          const p = keys[0];
          const ph = header.querySelector(`.sortable[data-col="${p.col}"]`);
          if (ph) {
            ph.classList.add(p.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
            const c = ph.querySelector('.sort-caret'); if (c) c.textContent = p.dir === 'asc' ? '▲' : '▼';
          }
        }
      };
      // Initialize
      updateIndicators();
    }

    const items = this.createAccordionItems();

    this.accordionContainer.innerHTML = '';
    if (header) this.accordionContainer.appendChild(header);
    this.accordionContainer.appendChild(items);

  }



  /**
   * Create accordion items container
   */
  createAccordionItems() {
    const container = document.createElement('div');
    container.className = 'events-accordion-items';
    
    // Get events from table and convert to accordion items
    this.syncEventsFromTable();
    
    if (this.events.length === 0) {
      // Create empty state message directly without the box
      const emptyState = document.createElement('div');
      emptyState.className = 'accordion-empty-state';
      emptyState.innerHTML = '<p>No events yet. Add events with the wizard or using the Add Event button.</p>';
      
      return emptyState; // Return the empty state directly instead of the container
    } else {
      this.events.forEach((event, index) => {
        const item = this.createAccordionItem(event, index);
        container.appendChild(item);
      });
      
      return container;
    }
  }


  /**
   * Sync events from the table to accordion data structure
   */
  syncEventsFromTable() {
    this.events = [];
    // Align with readEvents: only consider visible rows
    const tableRows = Array.from(document.querySelectorAll('#Events tbody tr')).filter(r => r && r.style.display !== 'none');
    
    tableRows.forEach((row, index) => {
      const event = this.extractEventFromRow(row);
      if (event) {
        event.accordionId = `accordion-item-${index}`;
        event.tableRowIndex = index;
        
        // Generate a unique ID if one doesn't exist on the row
        if (!row.dataset.eventId) {
          row.dataset.eventId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${index}`;
        }
        
        event.id = row.dataset.eventId;
        
        this.events.push(event);
      }
    });
  }

  /**
   * Extract event data from a table row
   */
  extractEventFromRow(row) {
    try {
      const typeInput = row.querySelector('.event-type');
      const nameInput = row.querySelector('.event-name');
      const amountInput = row.querySelector('.event-amount');
      const fromAgeInput = row.querySelector('.event-from-age');
      const toAgeInput = row.querySelector('.event-to-age');
      const rateInput = row.querySelector('.event-rate');
      const matchInput = row.querySelector('.event-match');

      if (!typeInput) return null;

      const event = {
        type: typeInput.value || '',
        name: nameInput?.value || '',
        amount: amountInput?.value || '',
        fromAge: fromAgeInput?.value || '',
        toAge: toAgeInput?.value || '',
        rate: rateInput?.value || '',
        match: matchInput?.value || '',
        rowId: row.dataset.rowId || ''
      };

      // Extract currency field
      const currencyInput = row.querySelector('.event-currency');
      if (currencyInput && currencyInput.value) {
        event.currency = currencyInput.value;
      }

      // Extract linkedCountry field
      const linkedCountryInput = row.querySelector('.event-linked-country');
      if (linkedCountryInput && linkedCountryInput.value) {
        event.linkedCountry = linkedCountryInput.value;
      }

      // Extract linkedEventId field
      const linkedEventIdInput = row.querySelector('.event-linked-event-id');
      if (linkedEventIdInput && linkedEventIdInput.value) {
        event.linkedEventId = linkedEventIdInput.value;
      }

      // Extract resolutionOverride field
      const overrideInput = row.querySelector('.event-resolution-override');
      if (overrideInput && overrideInput.value) {
        event.resolutionOverride = overrideInput.value;
      }

      // Prefer robust dataset-based relocation impact propagated by table manager
      if (row.dataset && row.dataset.relocationImpact === '1') {
        event.relocationImpact = {
          category: row.dataset.relocationImpactCategory || '',
          message: row.dataset.relocationImpactMessage || '',
          autoResolvable: row.dataset.relocationImpactAuto === '1',
          mvEventId: row.dataset.relocationImpactMvId || undefined
        };
      } else {
        // Fallback to reading from events array via matching by eventId when available
        try {
          const tableEvents = this.webUI.readEvents(false);
          const tableRows = document.querySelectorAll('#Events tbody tr');
          const currentIndex = Array.from(tableRows).indexOf(row);
          const tableEvent = tableEvents[currentIndex];
          if (tableEvent && tableEvent.relocationImpact) {
            event.relocationImpact = tableEvent.relocationImpact;
          }
        } catch (_) {}
      }

      return event;
    } catch (error) {
      console.warn('Error extracting event from row:', error);
      return null;
    }
  }

  /**
   * Create a single accordion item
   */
  createAccordionItem(event, index) {
    const item = document.createElement('div');
    item.className = 'events-accordion-item';
    item.dataset.eventIndex = index;
    item.dataset.accordionId = event.accordionId;
    
    // Apply color coding based on event type
    const colorClass = this.getEventColorClass(event.type);
    if (colorClass) {
      item.classList.add(colorClass);
    }

    // Mark No-Operation events for special styling
    if (event.type === 'NOP') {
      item.classList.add('nop');
    }

    const isExpanded = this.expandedItems.has(event.accordionId);
    
    // Create summary renderer instance
    const summaryRenderer = new EventSummaryRenderer(this.webUI);
    const summary = summaryRenderer.generateSummary(event);
    
    item.innerHTML = `
      <div class="accordion-item-header" data-accordion-id="${event.accordionId}">
        <div class="accordion-item-controls-left">
          <button class="accordion-expand-btn ${isExpanded ? 'expanded' : ''}" title="${isExpanded ? 'Collapse' : 'Expand'}">
            ▶
          </button>
        </div>
        <div class="accordion-item-summary">
          ${summary}
        </div>
        <div class="accordion-item-controls-right">
          <button class="accordion-delete-btn" data-event-id="${event.accordionId}" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="accordion-item-content ${isExpanded ? 'expanded' : ''}">
        <!-- Details will be rendered when expanded -->
      </div>
    `;

    // Setup click handlers
    this.setupAccordionItemHandlers(item, event);
    
    // Render details if expanded
    if (isExpanded) {
      this.renderItemDetails(item, event);
    }

    // Attach tooltip
    const badge = item.querySelector('.relocation-impact-badge');
    if (badge && event.relocationImpact) {
      TooltipUtils.attachTooltip(badge, event.relocationImpact.message, {hoverDelay: 300, touchDelay: 400});
    }

    return item;
  }

  /**
   * Get color class for event type (same as table)
   */
  getEventColorClass(eventType) {
    if (this.isStockMarket(eventType)) {
      return 'stock-market';
    } else if (this.isRealEstate(eventType)) {
      return 'real-estate';
    } else if (this.isInflow(eventType)) {
      return 'inflow';
    } else if (this.isOutflow(eventType)) {
      return 'outflow';
    }
    return '';
  }

  // Event type classification methods (same as EventsTableManager)
  isInflow(eventType) {
    return ['SI', 'SInp', 'SI2', 'SI2np', 'UI', 'RI', 'DBI', 'FI'].includes(eventType);
  }

  isOutflow(eventType) {
    return ['E'].includes(eventType);
  }

  isStockMarket(eventType) {
    return ['SM'].includes(eventType);
  }

  isRealEstate(eventType) {
    return ['R', 'M'].includes(eventType);
  }

  /**
   * Setup event handlers for accordion item
   */
  setupAccordionItemHandlers(item, event) {
    const header = item.querySelector('.accordion-item-header');
    const expandBtn = item.querySelector('.accordion-expand-btn');
    const deleteBtn = item.querySelector('.accordion-delete-btn');

    if (header) {
      header.addEventListener('click', (e) => {
        // Don't toggle if clicking on buttons
        if (e.target.closest('.accordion-expand-btn') || 
            e.target.closest('.accordion-delete-btn') || 
            e.target.closest('.relocation-impact-badge')) {
          return;
        }
        e.preventDefault();
        this.toggleAccordionItem(event.accordionId);
      });
    }

    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleAccordionItem(event.accordionId);
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteEvent(event);
      });
    }

    // Add click handler for badge
    const impactBadge = item.querySelector('.relocation-impact-badge');
    if (impactBadge) {
      impactBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        const accordionId = event.accordionId;
        this.expandResolutionPanel(accordionId);
      });
    }
  }

  /**
   * Expand inline resolution panel below the accordion item
   */
  expandResolutionPanel(accordionId) {
    // Select the root accordion item, not just the header
    const item = (document.querySelector(`.events-accordion-item[data-accordion-id="${accordionId}"]`) ||
                 (document.querySelector(`[data-accordion-id="${accordionId}"]`) && document.querySelector(`[data-accordion-id="${accordionId}"]`).closest('.events-accordion-item')));
    if (!item) return;

    const event = this.events.find(e => e.accordionId === accordionId);
    if (!event || !event.relocationImpact) return;

    // Check if item is expanded
    if (!this.expandedItems.has(accordionId)) {
      this.toggleAccordionItem(accordionId);
    }

    const content = item.querySelector('.accordion-item-content');
    if (!content) return;

    // Check if panel already exists (support both wrapped and unwrapped markup)
    const existingPanel = content.querySelector('.resolution-panel-container') || content.querySelector('.resolution-panel-expander');
    if (existingPanel) return;

    // Generate panel content with real table rowId so data-row-id on buttons matches table
    const panelContent = this.webUI.eventsTableManager.createResolutionPanelContent(event, event.rowId);

    // Inject panel HTML at the start of .accordion-item-content-wrapper
    const wrapper = content.querySelector('.accordion-item-content-wrapper');
    if (wrapper) {
      wrapper.insertAdjacentHTML('afterbegin', panelContent);
    }

    // Animate expansion using inner expander for smoother layout change
    const expander = content.querySelector('.resolution-panel-expander');
    const containerEl = content.querySelector('.resolution-panel-container');
    if (expander) {
      // Ensure starting state
      expander.style.height = '0px';
      expander.style.overflow = 'hidden';
      if (containerEl) {
        try { containerEl.classList.add('panel-anim'); } catch (_) {}
      }
      // Next frame, expand to content height and fade-in content
      requestAnimationFrame(() => {
        const fullHeight = expander.scrollHeight;
        if (containerEl) {
          try { containerEl.classList.add('visible'); } catch (_) {}
        }
        expander.style.height = fullHeight + 'px';
        const onOpened = (e) => {
          if (e.target !== expander) return;
          expander.style.height = 'auto';
          expander.removeEventListener('transitionend', onOpened);
        };
        expander.addEventListener('transitionend', onOpened);
      });
    }

    // Setup close button handler
    const closeBtn = content.querySelector('.panel-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.collapseResolutionPanel(accordionId));
    }

    // Delegated click handler for resolution actions in accordion view
    const interactionRoot = containerEl || content;
    const etm = this.webUI && this.webUI.eventsTableManager;
    if (interactionRoot && etm) {
      interactionRoot.addEventListener('click', (ev) => {
        const tab = ev.target && ev.target.closest && ev.target.closest('.resolution-tab');
        if (tab) {
          ev.preventDefault();
          etm.handleResolutionTabSelection(interactionRoot, tab);
          return;
        }

        const btn = ev.target && ev.target.closest && ev.target.closest('.resolution-apply');
        if (!btn) return;
        ev.stopPropagation();
        ev.preventDefault();

        const action = btn.getAttribute('data-action');
        const rowId = btn.getAttribute('data-row-id') || event.rowId;
        if (!action) return;

        switch (action) {
          case 'split': {
            const detail = btn.closest('.resolution-detail');
            const input = detail ? detail.querySelector('.part2-amount-input') : null;
            const part2Amount = input ? input.value : undefined;
            etm.splitEventAtRelocation(rowId, part2Amount);
            break;
          }
          case 'peg': {
            const currency = btn.getAttribute('data-currency');
            etm.pegCurrencyToOriginal(rowId, currency);
            break;
          }
          case 'accept': {
            const amount = btn.getAttribute('data-suggested-amount');
            const currency = btn.getAttribute('data-suggested-currency');
            etm.acceptSuggestion(rowId, amount, currency);
            break;
          }
          case 'link': {
            const detail = btn.closest('.resolution-detail');
            const sel = detail ? detail.querySelector('.country-selector') : null;
            const selectedCountry = sel ? sel.value : undefined;
            etm.linkPropertyToCountry(rowId, selectedCountry);
            break;
          }
          case 'convert':
            etm.convertToPensionless(rowId);
            break;
          case 'review':
            etm.markAsReviewed(rowId);
            break;
          default:
            break;
        }
      });
      etm.bindResolutionTabAccessibility(interactionRoot);
    }

    // Attach tooltip for PPP suggestion input in accordion view as well
    try {
      if (this.webUI && this.webUI.eventsTableManager && typeof this.webUI.eventsTableManager.attachSplitTooltip === 'function') {
        this.webUI.eventsTableManager.attachSplitTooltip(containerEl || content);
      }
    } catch (_) {}

    // Mark item as having panel
    item.dataset.hasResolutionPanel = '1';

    // Setup collapse triggers (outside click and ESC)
    this._setupPanelCollapseTriggers(accordionId, item);
  }

  /**
   * Collapse the resolution panel for the given accordion item
   */
  collapseResolutionPanel(accordionId) {
    // Ensure we operate on the root item
    const item = (document.querySelector(`.events-accordion-item[data-accordion-id="${accordionId}"]`) ||
                 (document.querySelector(`[data-accordion-id="${accordionId}"]`) && document.querySelector(`[data-accordion-id="${accordionId}"]`).closest('.events-accordion-item')));
    if (!item) return;

    // Support both wrapped and unwrapped markup; prefer expander for smooth height animation
    const expander = item.querySelector('.resolution-panel-expander');
    const containerEl = item.querySelector('.resolution-panel-container');
    if (!expander && !containerEl) return;

    // Fade out content
    if (containerEl) {
      try { containerEl.classList.remove('visible'); } catch (_) {}
    }

    if (expander) {
      // Set explicit current height, then transition to 0
      const current = expander.scrollHeight;
      expander.style.height = current + 'px';
      // Force reflow
      // eslint-disable-next-line no-unused-expressions
      expander.offsetHeight;
      requestAnimationFrame(() => {
        expander.style.height = '0px';
      });
      const onClosed = (e) => {
        if (e.target !== expander) return;
        expander.removeEventListener('transitionend', onClosed);
        // Remove the entire expander block
        const wrapperToRemove = expander;
        if (wrapperToRemove && wrapperToRemove.parentNode) {
          wrapperToRemove.remove();
        }
      };
      expander.addEventListener('transitionend', onClosed);
    } else if (containerEl) {
      // Fallback: no expander; remove after fade
      setTimeout(() => { if (containerEl.parentNode) containerEl.parentNode.remove(); }, 300);
    }

    // Clear reference
    delete item.dataset.hasResolutionPanel;

    // Remove collapse triggers
    this._removePanelCollapseTriggers(item);
  }

  /**
   * Setup event listeners for panel collapse triggers (outside click and ESC)
   */
  _setupPanelCollapseTriggers(accordionId, item) {
    // Clean up any existing handlers first to avoid duplicates
    this._removePanelCollapseTriggers(item);

    // Click-outside handler: collapse when clicking anywhere outside this accordion item
    const clickOutsideHandler = (e) => {
      try {
        if (item && !item.contains(e.target)) {
          this.collapseResolutionPanel(accordionId);
        }
      } catch (_) { /* ignore */ }
    };
    document.addEventListener('click', clickOutsideHandler);
    item._panelClickOutsideHandler = clickOutsideHandler;

    // ESC key handler
    const escHandler = (e) => {
      if (e && e.key === 'Escape') {
        this.collapseResolutionPanel(accordionId);
      }
    };
    document.addEventListener('keydown', escHandler);
    item._panelEscHandler = escHandler;
  }

  /**
   * Remove event listeners for panel collapse triggers
   */
  _removePanelCollapseTriggers(item) {
    if (!item) return;
    try {
      if (item._panelClickOutsideHandler) {
        document.removeEventListener('click', item._panelClickOutsideHandler);
        delete item._panelClickOutsideHandler;
      }
    } catch (_) { /* ignore */ }
    try {
      if (item._panelEscHandler) {
        document.removeEventListener('keydown', item._panelEscHandler);
        delete item._panelEscHandler;
      }
    } catch (_) { /* ignore */ }
  }

  /**
   * Toggle accordion item expanded/collapsed state with smooth animation
   */
  toggleAccordionItem(accordionId) {
    const item = document.querySelector(`[data-accordion-id="${accordionId}"]`).closest('.events-accordion-item');
    if (!item) return;

    const content = item.querySelector('.accordion-item-content');
    const expandBtn = item.querySelector('.accordion-expand-btn');

    if (!content || !expandBtn) return;

    const isExpanded = this.expandedItems.has(accordionId);

    if (isExpanded) {
      // Cancel any pending auto-collapse when collapsing manually/programmatically
      this._cancelAutoCollapse(accordionId);
      // Collapse with animation - first update the button state
      expandBtn.classList.remove('expanded');
      expandBtn.title = 'Expand';

      // Temporarily mark as collapsing to delay bottom border
      item.classList.add('collapsing');

      // Remove expanded class from root item for styling
      item.classList.remove('expanded');
      
      // Then start the collapse animation
      content.classList.remove('expanded');
      
      // Wait for collapse transition (matching CSS 300ms) before clearing collapsing class
      setTimeout(() => {
        item.classList.remove('collapsing');
      }, 300);

      // Update tracking state
      this.expandedItems.delete(accordionId);
    } else {
      // First render details if not already rendered
      const event = this.events.find(e => e.accordionId === accordionId);
      if (event) {
        // CRITICAL FIX: Get fresh data from table before rendering details
        const tableRow = this.findTableRowForEvent(event);
        if (tableRow) {
          const freshEvent = this.extractEventFromRow(tableRow);
          if (freshEvent) {
            freshEvent.accordionId = event.accordionId;
            freshEvent.tableRowIndex = event.tableRowIndex;
            // Update the cached event with fresh data
            Object.assign(event, freshEvent);
          }
        }

        this.renderItemDetails(item, event);
      }

      // Then expand with animation
      requestAnimationFrame(() => {
        content.classList.add('expanded');
        // Add expanded class to root item for styling and ensure collapsing flag cleared
        item.classList.add('expanded');
        item.classList.remove('collapsing');
        expandBtn.classList.add('expanded');
        expandBtn.title = 'Collapse';
        this.expandedItems.add(accordionId);
        // Do not auto-open resolution panels; user will open explicitly if desired
        // Ensure the expanded item is fully visible in the viewport (see scroll helper below)
        // Use a transitionend listener to ensure we scroll *after* the panel
        // is fully expanded (covers manual clicks as well as programmatic).
        let scrollCalled = false;
        
        const onTransitionEnd = (ev) => {
          if (ev.target === content && ev.propertyName === 'max-height') {
            content.removeEventListener('transitionend', onTransitionEnd);
            if (!scrollCalled) {
              scrollCalled = true;
              this._scrollExpandedItemIntoView(item);
            }
          }
        };
        content.addEventListener('transitionend', onTransitionEnd);
        
        // Fallback timeout in case transitionend doesn't fire (Safari compatibility)
        // Use longer timeout on mobile devices which may be slower under load
        const isMobile = window.innerWidth < 800;
        const fallbackTimeout = isMobile ? 800 : 500;
        setTimeout(() => {
          if (!scrollCalled) {
            scrollCalled = true;
            content.removeEventListener('transitionend', onTransitionEnd);
            this._scrollExpandedItemIntoView(item);
          }
        }, fallbackTimeout);
      });
    }
  }

  /**
   * Schedule auto-collapse for a specific accordion item after a delay.
   * Cancels on user interaction (click, focus, input) within the item.
   */
  _scheduleAutoCollapse(accordionId, delayMs = 5000) {
    // Clear any existing timer for this item
    this._cancelAutoCollapse(accordionId);

    const item = document.querySelector('.events-accordion-item[data-accordion-id="' + accordionId + '"]');
    if (!item) return;

    const timerId = setTimeout(() => {
      this._autoCollapseTimers.delete(accordionId);
      // Only collapse if still expanded
      if (this.expandedItems && this.expandedItems.has(accordionId)) {
        this.toggleAccordionItem(accordionId);
      }
    }, delayMs);

    this._autoCollapseTimers.set(accordionId, timerId);

    // Cancel on first user interaction
    const cancel = () => this._cancelAutoCollapse(accordionId);
    try {
      item.addEventListener('click', cancel, { once: true, passive: true });
      item.addEventListener('focusin', cancel, { once: true, passive: true });
      item.addEventListener('input', cancel, { once: true, passive: true });
    } catch (_) {
      // No-op if addEventListener options unsupported
      item.addEventListener('click', cancel, true);
      item.addEventListener('focusin', cancel, true);
      item.addEventListener('input', cancel, true);
    }
  }

  /**
   * Cancel an existing auto-collapse timer for the given accordion item.
   */
  _cancelAutoCollapse(accordionId) {
    const existing = this._autoCollapseTimers && this._autoCollapseTimers.get(accordionId);
    if (existing) {
      clearTimeout(existing);
      this._autoCollapseTimers.delete(accordionId);
    }
  }

  /**
   * Render detailed editing interface for an accordion item
   */
  renderItemDetails(item, event) {
    const contentContainer = item.querySelector('.accordion-item-content');
    if (!contentContainer) return;

    // Create detailed summary using EventSummaryRenderer (now with editable fields)
    const summaryRenderer = new EventSummaryRenderer(this.webUI);
    const detailedSummary = summaryRenderer.generateDetailedSummary(event);

    // Wrap the content in a container to maintain position during transitions
    contentContainer.innerHTML = `<div class="accordion-item-content-wrapper">${detailedSummary}</div>`;

    // Setup editable field handlers for direct editing
    this.setupEditableFieldHandlers(contentContainer, event);
  }



  /**
   * Refresh the accordion view with current table data
   */
  refresh() {
    // Before re-render, collapse any open resolution panels to avoid leaking listeners
    try {
      const items = document.querySelectorAll('.events-accordion-item');
      items.forEach((item) => {
        const hasPanelFlag = item && item.dataset && item.dataset.hasResolutionPanel === '1';
        const hasPanelDom = item && (item.querySelector('.resolution-panel-container') || item.querySelector('.resolution-panel-expander'));
        if (hasPanelFlag || hasPanelDom) {
          const id = item.dataset && item.dataset.accordionId;
          if (id) {
            this.collapseResolutionPanel(id);
          } else {
            // Fallback: ensure any collapse triggers are removed
            this._removePanelCollapseTriggers(item);
          }
        }
      });
    } catch (_) {}

    // Re-render the accordion
    this.renderAccordion();
    this.applySortingWithAnimation();
    
    // Update grid columns and check for wrapping after rendering
    setTimeout(() => {
      this.updateGridColumns();
      this.checkAndApplyWrapping();
    }, 50);
    
    // Restore expanded state
    [...this.expandedItems].forEach(id => {
      const item = document.querySelector(`[data-accordion-id="${id}"]`);
      if (item) {
        this.toggleAccordionItem(id, true);
      }
    });
  }

  /**
   * Refresh the accordion with animation for newly created event
   */
  refreshWithNewEventAnimation(eventData, id) {
    // Store reference to identify new item by unique ID
    this._newEventId = id;

    // First refresh the accordion to get the new event (unsorted)
    this.renderAccordion();

    // Then apply sorting with animation and highlight the new item
    setTimeout(() => {
      this.applySortingWithAnimation(true); // true = highlight new item
    }, 50);
  }

  /**
   * Apply sorting with FLIP animation using AccordionSorter
   */
  applySortingWithAnimation(highlightNew = false) {
    const tableManager = this.webUI.eventsTableManager;
    if (!tableManager || !tableManager.sortKeys || tableManager.sortKeys.length === 0) {
      // No sorting active, just highlight if needed
      if (highlightNew && this._newEventId) {
        this.highlightNewEvent();
      }
      return;
    }

    const container = this.accordionContainer.querySelector('.events-accordion-items');
    if (!container || !window.AccordionSorter) return;

    // Apply sorting with animation to accordion
    window.AccordionSorter.sortAccordionItems(container, tableManager.sortKeys, this);

    // Also sort the table (without notification to avoid recursion)
    const tbody = document.querySelector('#Events tbody');
    if (tbody && window.RowSorter) {
      // Close any open inline resolution panels in the table before DOM reorder
      try { tableManager && tableManager.collapseAllResolutionPanels && tableManager.collapseAllResolutionPanels(); } catch (_) {}
      window.RowSorter.sortRows(tbody, tableManager.sortKeys);
    }

    // Highlight the new event after sorting animation
    if (highlightNew && this._newEventId) {
      setTimeout(() => {
        this.highlightNewEvent();
      }, 400); // After animation completes
    }

    // Clear the new event reference
    if (highlightNew) {
      setTimeout(() => {
        this._newEventId = null;
      }, 1000);
    }
  }

  /**
   * Highlight the newly created event
   */
  highlightNewEvent() {
    if (!this._newEventId) return;

    const container = this.accordionContainer.querySelector('.events-accordion-items');
    if (!container || !window.AccordionSorter) return;

    // Use AccordionSorter to find and highlight the new item
    const foundItem = window.AccordionSorter.highlightNewItem(container, (item) => {
      return this.isNewlyCreatedAccordionItem(item, this._newEventId);
    });
    
    // If we found the item, expand it
    if (foundItem) {
      const accordionId = foundItem.dataset.accordionId;
      if (accordionId) {
        // Expand the item after a short delay to allow the highlight animation to start
        setTimeout(() => {
          // Only expand if not already expanded
          if (!this.expandedItems.has(accordionId)) {
            this.toggleAccordionItem(accordionId);
          }
          // Schedule auto-collapse ~5s after expansion for wizard-created item
          this._scheduleAutoCollapse(accordionId);
        }, 100);
      }
    }
  }

  /**
   * Check if an accordion item corresponds to newly created event by unique ID
   */
  isNewlyCreatedAccordionItem(item, id) {
    const accordionId = item.dataset.accordionId;
    const event = this.events.find(e => e.accordionId === accordionId);

    if (!event || !id) return false;

    // Match on unique ID - simple and reliable
    return event.id === id;
  }

  /**
   * Setup auto-sort on blur for accordion input fields
   */
  setupAutoSortOnBlur() {
    if (!this.accordionContainer) return;

    this.accordionContainer.addEventListener('blur', (e) => {
      // Check if the blurred element is an input field in an accordion item
      if (e.target.matches('input') && e.target.closest('.events-accordion-item')) {
        const tableManager = this.webUI.eventsTableManager;

        if (tableManager && tableManager.sortKeys && tableManager.sortKeys.length > 0) {
          // Only trigger auto-sort if the blurred field matches the current sort column
          const fieldSortKey = e.target.dataset.sortKey;
          const currentSortKey = tableManager.sortKeys[0].col;

          if (fieldSortKey === currentSortKey) {
            // Sync accordion data from table first to get the updated values
            this.syncEventsFromTable();
            this.applySortingWithAnimation(false); // false = no highlight, just sort
          }
        }
      }
    }, true);
  }



  /**
   * Setup handlers for editable fields in the accordion
   */
  setupEditableFieldHandlers(container, event) {
    // Handle event type custom dropdown (same as table view)
    const typeInput = container.querySelector('.accordion-edit-type');
    const toggleEl = container.querySelector(`#AccordionEventTypeToggle_${event.rowId}`);
    const dropdownEl = container.querySelector(`#AccordionEventTypeOptions_${event.rowId}`);

    if (typeInput && toggleEl && dropdownEl && this.webUI.eventsTableManager) {
      // Set current value
      typeInput.value = event.type;

      // Get event type options from table manager
      const optionObjects = this.webUI.eventsTableManager.getEventTypeOptionObjects();

      // Create custom dropdown using DropdownUtils
      const dropdown = DropdownUtils.create({
        toggleEl,
        dropdownEl,
        options: optionObjects,
        selectedValue: event.type,
        onSelect: async (val, label) => {
          // Handle Relocation (MV) specially to open country selection modal in card mode
          if (val === 'MV' && this.webUI && this.webUI.eventsTableManager) {
            const etm = this.webUI.eventsTableManager;
            // If underlying table row for this accordion event is empty NOP, mark for replacement
            try {
              const rowRef = this.findTableRowForEvent(event);
              const wasEmpty = rowRef && typeof etm.isEventEmpty === 'function' ? etm.isEventEmpty(rowRef) : false;
              if (wasEmpty) {
                etm.pendingEmptyRowForReplacement = rowRef;
              }
            } catch (_) {}

            // Open country selection using centralized modal
            etm.showCountrySelectionModal((code, name) => {
              const full = `MV-${code.toUpperCase()}`;
              // Sync to table without defaults and update local state/label
              this.syncFieldToTableWithoutDefaults(event, '.event-type', full);
              event.type = full;
              if (toggleEl) toggleEl.textContent = `→ ${name}`;

              // Honor wizard toggle: if off, stop here; fields stay blank
              if (!etm.isEventsWizardEnabled()) {
                return;
              }

              // Preload destination ruleset so currency/inflation are available immediately
              try {
                const cfg = (typeof Config !== 'undefined' && Config.getInstance) ? Config.getInstance() : null;
                if (cfg && typeof cfg.getTaxRuleSet === 'function') {
                  Promise.resolve(cfg.getTaxRuleSet(code.toLowerCase()))
                    .catch(() => {})
                    .finally(() => {
                      // Launch MV wizard with destination context; name remains optional
                      etm.startWizardForEventType('MV', {
                        eventType: full,
                        destCountryCode: code,
                        destCountryName: name
                      });
                    });
                  return;
                }
              } catch (_) {}
              // Fallback: start wizard without preloading if cfg not ready
              etm.startWizardForEventType('MV', {
                eventType: full,
                destCountryCode: code,
                destCountryName: name
              });
            });
            return;
          }

          if (val !== event.type) {
            // Update the hidden input
            typeInput.value = val;

            // Clear any validation errors for the dropdown
            this.clearFieldValidation(typeInput);

            // Preserve current field values before updating table
            const currentValues = this.preserveCurrentFieldValues(container);

            // Update the table with the new event type (without setting defaults)
            this.syncFieldToTableWithoutDefaults(event, '.event-type', val);

            // Update the event object for immediate UI refresh
            event.type = val;

            // Update field visibility in accordion view without regenerating
            this.updateAccordionFieldVisibility(container, event, currentValues);

            // Refresh accordion header summary to reflect new type
            this.refreshEventSummary(event);

            // Update color-coding/shadow of the accordion item
            const accordionItem = container.closest('.events-accordion-item');
            if (accordionItem) {
              accordionItem.classList.remove('inflow', 'outflow', 'real-estate', 'stock-market');
              const newColorClass = this.getEventColorClass(val);
              if (newColorClass) {
                accordionItem.classList.add(newColorClass);
              }
            }
            // If sorting is active, re-apply sorting to move item to correct position
            this.applySortingWithAnimation();
          }
        }
      });

      // Store reference for potential future updates
      container._eventTypeDropdown = dropdown;

      // Make the hidden input point to the visible wrapper so Driver.js can
      // highlight the dropdown (same trick used in table view)
      if (dropdown && dropdown.wrapper) {
        typeInput._dropdownWrapper = dropdown.wrapper;
        //
      }
    }

    // Define editable fields and their validation types
    const editableFields = [
      { selector: '.accordion-edit-name', tableClass: '.event-name', type: 'text' },
      { selector: '.accordion-edit-amount', tableClass: '.event-amount', type: 'currency' },
      { selector: '.accordion-edit-fromage', tableClass: '.event-from-age', type: 'age' },
      { selector: '.accordion-edit-toage', tableClass: '.event-to-age', type: 'age' },
      { selector: '.accordion-edit-rate', tableClass: '.event-rate', type: 'percentage' },
      { selector: '.accordion-edit-match', tableClass: '.event-match', type: 'percentage' }
    ];

    // Setup handlers for each editable field
    editableFields.forEach(field => {
      const input = container.querySelector(field.selector);
      if (input) {
        // Real-time validation on input
        input.addEventListener('input', (e) => {
          const value = e.target.value;
          const validation = this.validateField(value, field.type, event);
          
          if (validation.isValid) {
            this.clearFieldValidation(input);
            this.syncFieldToTable(event, field.tableClass, value);
          } else {
            this.showFieldValidation(input, validation.message, validation.isWarningOnly);
            // Still sync to table for non-critical errors
            if (validation.isWarningOnly) {
              this.syncFieldToTable(event, field.tableClass, value);
            }
          }
        });
        
        // Final validation and summary refresh on blur
        input.addEventListener('blur', (e) => {
          const value = e.target.value;
          
          const validation = this.validateField(value, field.type, event);

          if (validation.isValid) {
            this.clearFieldValidation(input);
            this.syncFieldToTable(event, field.tableClass, value);
            // Refresh accordion summary to reflect changes
            this.refreshEventSummary(event);
          } else {
            this.showFieldValidation(input, validation.message, validation.isWarningOnly);
            // For critical errors, don't update the summary
            if (validation.isWarningOnly) {
              this.syncFieldToTable(event, field.tableClass, value);
              this.refreshEventSummary(event);
            }
          }
        });
      }
    });

    // Setup currency and percentage formatting for new inputs
    if (this.webUI.formatUtils) {
      this.webUI.formatUtils.setupCurrencyInputs();
      this.webUI.formatUtils.setupPercentageInputs();
    }
  }

  /**
   * Sync accordion field value to corresponding table input
   */
  syncFieldToTable(event, tableFieldClass, value) {
    const tableRow = this.findTableRowForEvent(event);
    if (!tableRow) return;

    // Handle event type changes specially
    if (tableFieldClass === '.event-type') {
      const typeInput = tableRow.querySelector('.event-type');

      if (typeInput && typeInput.value !== value) {
        typeInput.value = value;

        // Update the stored original event type
        tableRow.dataset.originalEventType = value;

        // CRITICAL FIX: Also update the visible dropdown toggle and dropdown object
        const toggleEl = tableRow.querySelector('.dd-toggle');
        const dropdown = tableRow._eventTypeDropdown;

        if (toggleEl && dropdown && this.webUI.eventsTableManager) {
          // Get the label for the new event type
          const optionObjects = this.webUI.eventsTableManager.getEventTypeOptionObjects();
          const selectedOption = optionObjects.find(opt => opt.value === value);

          if (selectedOption) {
            // Update the visible toggle text
            toggleEl.textContent = selectedOption.label;

            // Update the dropdown's selected state by manipulating DOM classes
            const dropdownContainer = tableRow.querySelector('.visualization-dropdown');
            if (dropdownContainer) {
              // Remove selected class from all options
              dropdownContainer.querySelectorAll('[data-value]').forEach(el => {
                el.classList.remove('selected');
              });

              // Add selected class to the new option
              const newSelectedOption = dropdownContainer.querySelector(`[data-value="${value}"]`);
              if (newSelectedOption) {
                newSelectedOption.classList.add('selected');
              }
            }
          }
        }

        // Update field visibility and coloring for the new event type
        if (this.webUI.eventsTableManager) {
          this.webUI.eventsTableManager.updateFieldVisibility(typeInput);
          this.webUI.eventsTableManager.applyTypeColouring(tableRow);
        }

        // Set appropriate default values based on event type
        const summaryRenderer = new EventSummaryRenderer(this.webUI);
        const fromAgeInput = tableRow.querySelector('.event-from-age');
        const toAgeInput = tableRow.querySelector('.event-to-age');
        const rateInput = tableRow.querySelector('.event-rate');
        const matchInput = tableRow.querySelector('.event-match');

        // Handle special cases for different event types
        switch (value) {
          case 'E': // Expense
            // Default to one-off: set toAge = fromAge and rate = '' (inflation)
            if (fromAgeInput && toAgeInput && fromAgeInput.value) {
              toAgeInput.value = fromAgeInput.value; // One-off expense

              // Force a change event on toAge to ensure it's recognized as a one-off expense
              const changeEvent = new Event('change', { bubbles: true });
              toAgeInput.dispatchEvent(changeEvent);
            }
            if (rateInput) {
              rateInput.value = ''; // Use inflation rate by default
            }
            if (matchInput) {
              matchInput.value = ''; // No match for expenses
            }
            break;


          case 'R': // Real Estate (Property)
            // Property has purchase date (fromAge) and sale date (toAge)
            // Keep existing toAge - user needs to set sale date
            if (rateInput) {
              rateInput.value = ''; // Property appreciation - let user set
            }
            if (matchInput) {
              matchInput.value = ''; // No match for property
            }
            break;

          case 'SM': // Stock Market
            // Stock market events need fromAge and toAge (period-based)
            // Keep existing toAge if available
            if (rateInput) {
              rateInput.value = ''; // Market growth override - let user set
            }
            if (matchInput) {
              matchInput.value = ''; // No match for stock market
            }
            break;

          case 'M': // Mortgage
            // Mortgages need fromAge and toAge (payment period)
            // Keep existing toAge if available
            if (rateInput) {
              rateInput.value = ''; // Interest rate - no default, user must set
            }
            if (matchInput) {
              matchInput.value = ''; // No match for mortgages
            }
            break;

          case 'SI': case 'SI2': // Salary Income WITH pension
            // Keep existing toAge if available
            if (rateInput) {
              rateInput.value = ''; // Salary growth - let user set
            }
            if (matchInput) {
              matchInput.value = ''; // Employer match - let user set
            }
            break;

          case 'SInp': case 'SI2np': // Salary Income WITHOUT pension
            // Keep existing toAge if available
            if (rateInput) {
              rateInput.value = ''; // Salary growth - let user set
            }
            if (matchInput) {
              matchInput.value = ''; // No match field for no-pension salary
            }
            break;

          default: // Other income types (UI, RI, DBI, FI)
            // Keep existing toAge if available
            if (rateInput) {
              rateInput.value = ''; // Growth rate - let user set
            }
            if (matchInput) {
              matchInput.value = ''; // No match for other income types
            }
            break;
        }

        // Trigger change event to ensure any table-side validation/formatting occurs
        const changeEvent = new Event('change', { bubbles: true });
        typeInput.dispatchEvent(changeEvent);
      }
      return;
    }

    const tableInput = tableRow.querySelector(tableFieldClass);
    if (tableInput && tableInput.value !== value) {
      // Apply appropriate formatting based on field type
      let formattedValue = value;
      
      if (tableInput.classList.contains('currency')) {
        // Format currency values
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          formattedValue = FormatUtils.formatCurrency(numValue);
        }
      } else if (tableInput.classList.contains('percentage')) {
        // Format percentage values
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          formattedValue = FormatUtils.formatPercentage(numValue);
        }
      }
      
      tableInput.value = formattedValue;

      // Trigger change event to ensure any table-side validation/formatting occurs
      const changeEvent = new Event('change', { bubbles: true });
      tableInput.dispatchEvent(changeEvent);
    }
  }

  /**
   * Refresh the detailed view to show appropriate fields for the event type
   */
  refreshDetailedView(container, event) {
    // Find the content wrapper container
    const contentWrapper = container.querySelector('.accordion-item-content-wrapper');
    if (!contentWrapper) {
      return;
    }

    // Get updated event data from table to ensure we have current values
    const tableRow = this.findTableRowForEvent(event);
    if (tableRow) {
      const updatedEvent = this.extractEventFromRow(tableRow);
      if (updatedEvent) {
        updatedEvent.accordionId = event.accordionId;
        event = updatedEvent; // Use the updated event data
      }
    }

    // Re-render the detailed summary with new event type
    const summaryRenderer = new EventSummaryRenderer(this.webUI);
    const newDetailedSummary = summaryRenderer.generateDetailedSummary(event);

    // Replace the content
    contentWrapper.innerHTML = newDetailedSummary;

    // Re-setup handlers for the new content
    this.setupEditableFieldHandlers(container, event);
  }

  /**
   * Find the table row corresponding to an accordion event
   */
  findTableRowForEvent(event) {
    // First try to find by event ID (most reliable)
    if (event.id) {
      const tableRows = document.querySelectorAll('#Events tbody tr');
      const rowByEventId = Array.from(tableRows).find(row => row.dataset.eventId === event.id);
      
      if (rowByEventId) {
        // Update tableRowIndex to match current position
        const currentIndex = Array.from(tableRows).indexOf(rowByEventId);
        if (currentIndex !== -1 && event.tableRowIndex !== currentIndex) {
          event.tableRowIndex = currentIndex;
        }
        return rowByEventId;
      }
    }
    
    // Fallback to index-based lookup if ID matching failed
    if (event.tableRowIndex !== undefined) {
      const tableRows = document.querySelectorAll('#Events tbody tr');
      return tableRows[event.tableRowIndex] || null;
    }

    // Last resort: match by data fields
    const tableRows = document.querySelectorAll('#Events tbody tr');
    return Array.from(tableRows).find(row => {
      const rowEvent = this.extractEventFromRow(row);
      return rowEvent &&
             rowEvent.name === event.name &&
             rowEvent.amount === event.amount &&
             rowEvent.fromAge === event.fromAge &&
             rowEvent.toAge === event.toAge;
    });
  }

  /**
   * Handle event type change (triggers wizard with pre-populated values)
   */
  handleEventTypeChange(event, newType) {
    // Get the wizard manager
    const wizardManager = (this.webUI.eventsWizard && this.webUI.eventsWizard.manager) || this.webUI.eventsWizard;
    if (!wizardManager) {
      console.error('Wizard manager not available');
      return;
    }

    // Find the wizard for the new event type
    const wizards = wizardManager.wizardData?.EventWizards || [];
    const targetWizard = wizards.find(w => w.eventType === newType);

    if (!targetWizard) {
      console.error('No wizard found for event type:', newType);
      return;
    }

    // Pre-populate wizard data with current event values
    const prePopulatedData = {
      name: event.name,
      amount: event.amount,
      fromAge: event.fromAge,
      toAge: event.toAge,
      rate: event.rate,
      match: event.match
    };

    // Start wizard with pre-populated data
    wizardManager.startWizard(newType, prePopulatedData, (wizardData) => {
      // On wizard completion, update the table row and refresh accordion
      this.updateEventFromWizard(event, wizardData);
    });
  }

  /**
   * Update an existing event from wizard data
   */
  updateEventFromWizard(originalEvent, wizardData) {
    const tableRow = this.findTableRowForEvent(originalEvent);
    if (!tableRow) return;

    // Update table row with new wizard data
    const typeInput = tableRow.querySelector('.event-type');
    const nameInput = tableRow.querySelector('.event-name');
    const amountInput = tableRow.querySelector('.event-amount');
    const fromAgeInput = tableRow.querySelector('.event-from-age');
    const toAgeInput = tableRow.querySelector('.event-to-age');
    const rateInput = tableRow.querySelector('.event-rate');
    const matchInput = tableRow.querySelector('.event-match');

    if (typeInput) typeInput.value = wizardData.eventType || '';
    if (nameInput) nameInput.value = wizardData.name || '';
    if (amountInput) amountInput.value = wizardData.amount || '';
    if (fromAgeInput) fromAgeInput.value = wizardData.fromAge || '';
    if (toAgeInput) toAgeInput.value = wizardData.toAge || '';
    if (rateInput) rateInput.value = wizardData.rate || '';
    if (matchInput) matchInput.value = wizardData.match || '';

    // Update the stored original event type
    tableRow.dataset.originalEventType = wizardData.eventType || '';

    // For MV-* ensure visible label shows as arrow + country in table dropdown
    try {
      const tVal = wizardData && wizardData.eventType;
      if (tVal && typeof tVal === 'string' && tVal.indexOf('MV-') === 0) {
        const code = tVal.substring(3).toLowerCase();
        const countries = Config.getInstance().getAvailableCountries();
        const match = Array.isArray(countries) ? countries.find(c => String(c.code).toLowerCase() === code) : null;
        const label = match ? `→ ${match.name}` : tVal;
        const toggleEl = tableRow.querySelector(`#EventTypeToggle_${tableRow.dataset.rowId}`);
        if (toggleEl) toggleEl.textContent = label;
        const dropdown = tableRow._eventTypeDropdown;
        if (dropdown) {
          const baseOpts = this.webUI.eventsTableManager.getEventTypeOptionObjects();
          const synthetic = match ? { value: tVal, label, description: `Relocation to ${match.name}` } : { value: tVal, label: tVal };
          const opts = baseOpts.find(o => o.value === tVal) ? baseOpts : baseOpts.concat([synthetic]);
          try { dropdown.setOptions(opts); } catch (_) {}
        }
      }
    } catch (_) {}

    // Refresh accordion to show updated data
    this.refresh();

    // Also refresh the detailed view if this item is currently expanded
    const accordionItem = document.querySelector(`[data-accordion-id="${originalEvent.accordionId}"]`);
    if (accordionItem && accordionItem.classList.contains('expanded')) {
      // Get the updated event data and refresh the detailed view
      const updatedEvent = this.extractEventFromRow(tableRow);
      if (updatedEvent) {
        updatedEvent.accordionId = originalEvent.accordionId;
        const detailsContainer = accordionItem.querySelector('.accordion-item-details');
        if (detailsContainer) {
          this.renderItemDetails(accordionItem, updatedEvent);
        }
      }
    }
  }

  /**
   * Refresh the summary display for a specific event
   */
  refreshEventSummary(event) {
    // Find the accordion item
    const accordionItem = document.querySelector(`[data-accordion-id="${event.accordionId}"]`);
    if (!accordionItem) return;

    // Get updated event data from table
    const tableRow = this.findTableRowForEvent(event);
    if (!tableRow) return;

    const updatedEvent = this.extractEventFromRow(tableRow);
    if (!updatedEvent) return;

    updatedEvent.accordionId = event.accordionId;

    // Update the summary in the header
    const summaryContainer = accordionItem.querySelector('.accordion-item-summary');
    if (summaryContainer) {
      const summaryRenderer = new EventSummaryRenderer(this.webUI);
      summaryContainer.innerHTML = summaryRenderer.generateSummary(updatedEvent);
    }
  }

  /**
   * Delete event with smooth animation
   */
  deleteEvent(event) {
    // Find the accordion item element
    const accordionItem = document.querySelector(`[data-accordion-id="${event.accordionId}"]`)?.closest('.events-accordion-item');

    if (accordionItem) {
      // Check if this is the last event in the list (nothing below to slide up)
      const allAccordionItems = document.querySelectorAll('.events-accordion-item');
      const currentIndex = Array.from(allAccordionItems).indexOf(accordionItem);
      const isLastInList = currentIndex === allAccordionItems.length - 1;

      // Store the current height for the animation
      const currentHeight = accordionItem.offsetHeight;
      accordionItem.style.setProperty('--item-height', `${currentHeight}px`);

      // Add the appropriate deleting class
      if (isLastInList) {
        accordionItem.classList.add('deleting-last');
      } else {
        accordionItem.classList.add('deleting');
      }

      // Wait for animation to complete before removing from table
      setTimeout(() => {
        // Find and remove the corresponding table row
        const tableRows = document.querySelectorAll('#Events tbody tr');
        const matchingRow = Array.from(tableRows).find(row => {
          const rowEvent = this.extractEventFromRow(row);
          return rowEvent && rowEvent.name === event.name && rowEvent.type === event.type;
        });

        if (matchingRow) {
          matchingRow.remove();
          this.refresh(); // Refresh accordion after deletion
          // Re-analyze relocation impacts after deletion and refresh badges/status
          try {
            if (Config.getInstance().isRelocationEnabled()) {
              var events = this.webUI.readEvents(false);
              var startCountry = this.webUI.eventsTableManager && this.webUI.eventsTableManager.getStartCountry ? this.webUI.eventsTableManager.getStartCountry() : undefined;
              RelocationImpactDetector.analyzeEvents(events, startCountry);
              if (this.webUI.eventsTableManager && typeof this.webUI.eventsTableManager.updateRelocationImpactIndicators === 'function') {
                this.webUI.eventsTableManager.updateRelocationImpactIndicators(events);
              }
              this.webUI.updateStatusForRelocationImpacts(events);
            // Ensure accordion view reflects latest table state
            this.refresh();
            }
          } catch (_) { /* non-fatal */ }
        }
      }, 400); // Match the animation duration
    } else {
      // Fallback: if accordion item not found, delete immediately
      const tableRows = document.querySelectorAll('#Events tbody tr');
      const matchingRow = Array.from(tableRows).find(row => {
        const rowEvent = this.extractEventFromRow(row);
        return rowEvent && rowEvent.name === event.name && rowEvent.type === event.type;
      });

      if (matchingRow) {
        matchingRow.remove();
        this.refresh();
      }
    }
  }

  /**
   * Add event from wizard data
   */
  addEventFromWizard(eventData) {
    // Create the event in the table (just creates, no sorting/refreshing)
    let id = null;
    if (this.webUI.eventsTableManager) {
      const result = this.webUI.eventsTableManager.createEventFromWizard(eventData);
      id = result.id;
    }

    // Handle sorting and animation for accordion view
    // This will also sort the table when it applies accordion sorting
    this.refreshWithNewEventAnimation(eventData, id);
    
    // After animation, find and expand the newly added event
    setTimeout(() => {
      if (!id) return;
      
      // Find the accordion item with matching eventId
      const accordionItems = document.querySelectorAll('.events-accordion-item');
      for (const item of accordionItems) {
        const accordionId = item.dataset.accordionId;
        if (!accordionId) continue;
        
        // Find the corresponding event in the events array
        const event = this.events.find(e => e.accordionId === accordionId);
        if (event && event.id === id) {
          // Expand only if not already expanded to avoid a double-toggle that would
          // immediately collapse the item again when no empty row existed before.
          if (!this.expandedItems.has(accordionId)) {
            this.toggleAccordionItem(accordionId);
          }
          // Regardless of whether it was already expanded or just expanded now,
          // schedule auto-collapse after ~5 seconds if the user doesn't interact.
          this._scheduleAutoCollapse(accordionId);
          break;
        }
      }
    }, 500); // Delay to ensure animations have completed
  }

  /**
   * Update age/year mode for accordion
   */
  updateAgeYearMode(mode) {
    this.ageYearMode = mode;

    // Update CSS class on accordion container for year mode styling
    const accordionContainer = document.querySelector('.events-accordion-container');
    if (accordionContainer) {
      if (mode === 'year') {
        accordionContainer.classList.add('year-mode');
      } else {
        accordionContainer.classList.remove('year-mode');
      }
    }

    // Refresh to update any age/year displays
    this.refresh();
  }

  /**
   * Calculate optimal width for event type name column
   */
  calculateOptimalEventTypeWidth() {
    // Get all possible event type labels, but only after Config is initialized
    let eventTypeOptions = [];
    try { Config.getInstance(); eventTypeOptions = this.webUI.eventsTableManager?.getEventTypeOptionObjects() || []; } catch (_) { eventTypeOptions = []; }

    // Create a temporary element to measure text width
    const testElement = document.createElement('span');
    testElement.style.position = 'absolute';
    testElement.style.visibility = 'hidden';
    testElement.style.whiteSpace = 'nowrap';
    testElement.style.fontSize = 'inherit';
    testElement.style.fontFamily = 'inherit';
    testElement.style.fontWeight = 'inherit';
    document.body.appendChild(testElement);

    let maxWidth = 0;

    // Measure each event type label
    eventTypeOptions.forEach(option => {
      testElement.textContent = option.label;
      const width = testElement.getBoundingClientRect().width;
      maxWidth = Math.max(maxWidth, width);
    });

    // Clean up
    document.body.removeChild(testElement);

    // Add some margin (20px) so badge doesn't touch the type name
    return Math.ceil(maxWidth) + 20;
  }

  /**
   * Update CSS grid columns with calculated optimal width
   */
  updateGridColumns() {
    const optimalWidth = this.calculateOptimalEventTypeWidth();

    // Update CSS custom property for the event type column width
    this.accordionContainer.style.setProperty('--event-type-width', `${optimalWidth}px`);
  }

  /**
   * Check if any accordion item needs wrapping and apply consistent wrapping to all
   */
  checkAndApplyWrapping() {
    if (!this.accordionContainer) return;

    const accordionItems = this.accordionContainer.querySelectorAll('.events-accordion-item');
    let needsWrapping = false;

    // Store the current state before testing
    const wasWrapped = this.accordionContainer.classList.contains('force-wrap');

    // First, ensure we're in no-wrap mode to test
    this.accordionContainer.classList.remove('force-wrap');

    // Create a temporary test element to measure natural content width
    const testContainer = document.createElement('div');
    testContainer.style.position = 'absolute';
    testContainer.style.visibility = 'hidden';
    testContainer.style.whiteSpace = 'nowrap';
    testContainer.style.display = 'flex';
    testContainer.style.alignItems = 'center';
    testContainer.style.gap = '0.75rem';
    document.body.appendChild(testContainer);

    accordionItems.forEach(item => {
      const summaryMain = item.querySelector('.event-summary-main');
      const accordionSummary = item.querySelector('.accordion-item-summary');
      if (!summaryMain || !accordionSummary) return;

      const name = summaryMain.querySelector('.event-summary-name');
      const badge = summaryMain.querySelector('.event-summary-badge');
      const amount = summaryMain.querySelector('.event-summary-amount');
      const period = summaryMain.querySelector('.event-summary-period');

      if (!name || !badge || !amount || !period) return;

      // Clone the content to measure natural width in a flex layout
      const nameClone = name.cloneNode(true);
      const badgeClone = badge.cloneNode(true);
      const amountClone = amount.cloneNode(true);
      const periodClone = period.cloneNode(true);

      // Clear test container and add clones in flex layout
      testContainer.innerHTML = '';
      testContainer.style.display = 'flex';
      testContainer.style.gap = '0.75rem';
      testContainer.style.alignItems = 'center';
      testContainer.appendChild(nameClone);
      testContainer.appendChild(badgeClone);
      testContainer.appendChild(amountClone);
      testContainer.appendChild(periodClone);

      // Calculate the total grid width based on current CSS
      const eventTypeWidth = parseInt(this.accordionContainer.style.getPropertyValue('--event-type-width')) || 140;
      const isYearMode = this.accordionContainer.classList.contains('year-mode');
      const badgeWidth = 120;
      const amountWidth = 90;
      const periodWidth = isYearMode ? 120 : 100;
      const gapWidth = 0.5 * 16 * 3; // 0.5rem * 3 gaps in px

      const totalGridWidth = eventTypeWidth + badgeWidth + amountWidth + periodWidth + gapWidth;

      // Get available width by measuring the actual accordion-item-summary container
      const accordionSummaryRect = accordionSummary.getBoundingClientRect();
      const availableWidth = accordionSummaryRect.width;

      // If total grid width exceeds available width, we need wrapping
      if (totalGridWidth > availableWidth - 10) { // 10px tolerance for safety
        needsWrapping = true;
      }
    });

    // Clean up test container
    document.body.removeChild(testContainer);

    // Apply the appropriate class
    if (needsWrapping !== wasWrapped) {
      if (needsWrapping) {
        this.accordionContainer.classList.add('force-wrap');
      }
    }

    if (needsWrapping) {
      this.accordionContainer.classList.add('force-wrap');
    }
  }

  /**
   * Validate a field value using ValidationUtils
   */
  validateField(value, fieldType, event) {
    // Allow blank values – required-field logic is handled elsewhere
    if (!value || value.trim() === '') {
      return { isValid: true };
    }

    switch (fieldType) {
      case 'text':
        return { isValid: true }; // No length restrictions

      case 'currency': {
        const parsed = ValidationUtils.validateValue('money', value);
        return parsed === null ? { isValid: false, message: 'Please enter a valid amount' } : { isValid: true };
      }

      case 'age': {
        const parsed = ValidationUtils.validateValue('age', value);
        if (parsed === null) {
          return { isValid: false, message: 'Please enter a valid age' };
        }

        // Check age relationship if both ages present
        if (event && event.fromAge && event.toAge) {
          const relationship = ValidationUtils.validateAgeRelationship(event.fromAge, event.toAge);
          if (!relationship.isValid) {
            return relationship;
          }
        }
        return { isValid: true };
      }

      case 'percentage': {
        const parsed = ValidationUtils.validateValue('percentage', value);
        return parsed === null ? { isValid: false, message: 'Please enter a valid percentage' } : { isValid: true };
      }

      default:
        return { isValid: true };
    }
  }

  /**
   * Show validation error for a field
   */
  showFieldValidation(input, message, isWarningOnly = false) {
    // Remove any existing validation
    this.clearFieldValidation(input);

    // Add error styling to input
    input.classList.add(isWarningOnly ? 'validation-warning' : 'validation-error');

    // Create and show validation message
    const validationMessage = document.createElement('div');
    validationMessage.className = `validation-message ${isWarningOnly ? 'warning' : 'error'}`;
    validationMessage.textContent = message;

    // Insert validation message after the input
    input.parentNode.appendChild(validationMessage);
  }

  /**
   * Clear validation error for a field
   */
  clearFieldValidation(input) {
    // Remove error styling
    input.classList.remove('validation-error', 'validation-warning');

    // Remove validation message
    const existingMessage = input.parentNode.querySelector('.validation-message');
    if (existingMessage) {
      existingMessage.remove();
    }
  }

  /**
   * Preserve current field values from accordion inputs
   */
  preserveCurrentFieldValues(container) {
    const values = {};
    const fields = [
      { selector: '.accordion-edit-name', key: 'name' },
      { selector: '.accordion-edit-amount', key: 'amount' },
      { selector: '.accordion-edit-fromage', key: 'fromAge' },
      { selector: '.accordion-edit-toage', key: 'toAge' },
      { selector: '.accordion-edit-rate', key: 'rate' },
      { selector: '.accordion-edit-match', key: 'match' }
    ];

    fields.forEach(field => {
      const input = container.querySelector(field.selector);
      if (input) {
        values[field.key] = input.value;
      }
    });

    return values;
  }

  /**
   * Sync field to table without setting default values
   */
  syncFieldToTableWithoutDefaults(event, tableFieldClass, value) {
    const tableRow = this.findTableRowForEvent(event);
    if (!tableRow) return;

    // Handle event type changes specially
    if (tableFieldClass === '.event-type') {
      const typeInput = tableRow.querySelector('.event-type');

      if (typeInput && typeInput.value !== value) {
        typeInput.value = value;

        // Update the stored original event type
        tableRow.dataset.originalEventType = value;

        // Update the visible dropdown toggle and dropdown object
        const toggleEl = tableRow.querySelector('.dd-toggle');
        const dropdown = tableRow._eventTypeDropdown;

        if (toggleEl && dropdown && this.webUI.eventsTableManager) {
          // Get the label for the new event type
          const optionObjects = this.webUI.eventsTableManager.getEventTypeOptionObjects();
          let selectedOption = optionObjects.find(opt => opt.value === value);
          // If MV-* and not present in options, synthesize arrow label for display
          if (!selectedOption && value && typeof value === 'string' && value.indexOf('MV-') === 0) {
            try {
              const code = value.substring(3).toLowerCase();
              const countries = (typeof Config !== 'undefined' && Config.getInstance) ? Config.getInstance().getAvailableCountries() : [];
              const match = Array.isArray(countries) ? countries.find(c => String(c.code).toLowerCase() === code) : null;
              if (match) {
                selectedOption = { value: value, label: `→ ${match.name}`, description: `Relocation to ${match.name}` };
              }
            } catch (_) {}
          }

          if (selectedOption) {
            // Update the visible toggle text
            toggleEl.textContent = selectedOption.label;

            // Update the dropdown's selected state
            const dropdownContainer = tableRow.querySelector('.visualization-dropdown');
            if (dropdownContainer) {
              // Remove selected class from all options
              dropdownContainer.querySelectorAll('[data-value]').forEach(el => {
                el.classList.remove('selected');
              });

              // Add selected class to the new option
              const newSelectedOption = dropdownContainer.querySelector(`[data-value="${value}"]`);
              if (newSelectedOption) {
                newSelectedOption.classList.add('selected');
              }
            }
          }
        }

        // Update field visibility and coloring for the new event type
        if (this.webUI.eventsTableManager) {
          this.webUI.eventsTableManager.updateFieldVisibility(typeInput);
          this.webUI.eventsTableManager.applyTypeColouring(tableRow);
        }

        // DO NOT set default values - preserve existing values
      }
    } else {
      // Handle other field types normally
      const input = tableRow.querySelector(tableFieldClass);
      if (input) {
        // Apply appropriate formatting based on field type
        let formattedValue = value;
        
        if (input.classList.contains('currency')) {
          // Format currency values
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            formattedValue = FormatUtils.formatCurrency(numValue);
          }
        } else if (input.classList.contains('percentage')) {
          // Format percentage values
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            formattedValue = FormatUtils.formatPercentage(numValue);
          }
        }
        
        input.value = formattedValue;
      }
    }
  }

  /**
   * Update field visibility in accordion view without regenerating DOM
   */
  updateAccordionFieldVisibility(container, event, preservedValues) {
    const summaryRenderer = new EventSummaryRenderer(this.webUI);

    // Update the accordion dropdown toggle text to show the new event type
    this.updateAccordionDropdownToggle(container, event);

    // Update field visibility based on event type
    const fields = [
      { selector: '.accordion-edit-amount', key: 'amount', showMethod: 'showsAmountField' },
      { selector: '.accordion-edit-toage', key: 'toAge', showMethod: 'showsToAgeField' },
      { selector: '.accordion-edit-rate', key: 'rate', showMethod: 'showsGrowthRateField' },
      { selector: '.accordion-edit-match', key: 'match', showMethod: 'showsEmployerMatchField' }
    ];

    fields.forEach(field => {
      const input = container.querySelector(field.selector);
      const row = input?.closest('.detail-row');

      if (input && row) {
        const shouldShow = summaryRenderer[field.showMethod](event.type, event);

        if (shouldShow) {
          row.style.display = '';
          // Restore preserved value if available
          if (preservedValues[field.key] !== undefined) {
            input.value = preservedValues[field.key];
          }

          // Update the field label based on event type if supported
          const labelEl = row.querySelector('label');
          if (labelEl) {
            let lbl;
            switch(field.key) {
              case 'amount':
                lbl = this.fieldLabelsManager.getFieldLabel(event.type, 'amount'); break;
              case 'toAge':
                lbl = this.fieldLabelsManager.getFieldLabel(event.type, 'toAge'); break;
              case 'rate':
                lbl = this.fieldLabelsManager.getFieldLabel(event.type, 'rate'); break;
              case 'match':
                lbl = this.fieldLabelsManager.getFieldLabel(event.type, 'match'); break;
            }
            if (lbl) labelEl.textContent = `${lbl}:`;
          }
        } else {
          row.style.display = 'none';
        }
      }
    });

    // Always show name and fromAge fields and restore their values
    const alwaysVisibleFields = [
      { selector: '.accordion-edit-name', key: 'name' },
      { selector: '.accordion-edit-fromage', key: 'fromAge' }
    ];

    alwaysVisibleFields.forEach(field => {
      const input = container.querySelector(field.selector);
      if (input && preservedValues && preservedValues[field.key] !== undefined) {
        input.value = preservedValues[field.key];
      }
    });

    // Update the event object with preserved values
    Object.assign(event, preservedValues);

    // Sync preserved values back to table to keep table in sync
    this.syncPreservedValuesToTable(event, preservedValues);
  }

  /**
   * Update the rate field label based on event type
   */
  updateRateFieldLabel(row, eventType) {
    const label = row.querySelector('label');
    if (label) {
      const rateLabel = this.fieldLabelsManager.getFieldLabel(eventType, 'rate');
      label.textContent = `${rateLabel}:`;
    }
  }

  /**
   * Update the accordion dropdown toggle text to show the new event type
   */
  updateAccordionDropdownToggle(container, event) {
    const toggleEl = container.querySelector(`#AccordionEventTypeToggle_${event.rowId}`);
    const dropdown = container._eventTypeDropdown;

    if (toggleEl && dropdown && this.webUI.eventsTableManager) {
      // Get the label for the new event type
      const optionObjects = this.webUI.eventsTableManager.getEventTypeOptionObjects();
      let selectedOption = optionObjects.find(opt => opt.value === event.type);
      // If MV-* and not present in options, synthesize arrow label for display
      if (!selectedOption && event.type && typeof event.type === 'string' && event.type.indexOf('MV-') === 0) {
        try {
          const code = event.type.substring(3).toLowerCase();
          const countries = (typeof Config !== 'undefined' && Config.getInstance) ? Config.getInstance().getAvailableCountries() : [];
          const match = Array.isArray(countries) ? countries.find(c => String(c.code).toLowerCase() === code) : null;
          if (match) {
            selectedOption = { value: event.type, label: `→ ${match.name}`, description: `Relocation to ${match.name}` };
          }
        } catch (_) {}
      }

      if (selectedOption) {
        // Update the visible toggle text
        toggleEl.textContent = selectedOption.label;

        // Update the dropdown's selected state
        const dropdownContainer = container.querySelector(`#AccordionEventTypeOptions_${event.rowId}`);
        if (dropdownContainer) {
          // Remove selected class from all options
          dropdownContainer.querySelectorAll('[data-value]').forEach(el => {
            el.classList.remove('selected');
          });

          // Add selected class to the new option
          const newSelectedOption = dropdownContainer.querySelector(`[data-value="${event.type}"]`);
          if (newSelectedOption) {
            newSelectedOption.classList.add('selected');
          }
        }
      }
    }
  }

  /**
   * Sync preserved values back to table inputs
   */
  syncPreservedValuesToTable(event, preservedValues) {
    const tableRow = this.findTableRowForEvent(event);
    if (!tableRow) return;

    const fieldMappings = [
      { key: 'name', selector: '.event-name' },
      { key: 'amount', selector: '.event-amount' },
      { key: 'fromAge', selector: '.event-from-age' },
      { key: 'toAge', selector: '.event-to-age' },
      { key: 'rate', selector: '.event-rate' },
      { key: 'match', selector: '.event-match' }
    ];

    fieldMappings.forEach(mapping => {
      if (preservedValues[mapping.key] !== undefined) {
        const input = tableRow.querySelector(mapping.selector);
        if (input) {
          // Apply appropriate formatting based on field type
          let formattedValue = preservedValues[mapping.key];
          
          if (input.classList.contains('currency')) {
            // Format currency values
            const numValue = parseFloat(formattedValue);
            if (!isNaN(numValue)) {
              formattedValue = FormatUtils.formatCurrency(numValue);
            }
          } else if (input.classList.contains('percentage')) {
            // Format percentage values
            const numValue = parseFloat(formattedValue);
            if (!isNaN(numValue)) {
              formattedValue = FormatUtils.formatPercentage(numValue);
            }
          }
          
          input.value = formattedValue;
        }
      }
    });
  }

  /**
   * Setup resize listener to recheck wrapping when window size changes
   */
  setupResizeListener() {
    this.resizeHandler = () => {
      // Debounce the resize handler
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        this.checkAndApplyWrapping();
      }, 100);
    };

    window.addEventListener('resize', this.resizeHandler);
  }

  /**
   * Cleanup method to remove event listeners
   */
  destroy() {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
  }

  /**
   * Ensure an expanded accordion item is fully visible in the viewport.
   * If the expanded details would be clipped beneath the bottom (taking
   * into account on-screen keyboards / phone chins), the page is scrolled
   * just enough to reveal the full content. Similarly, if the item ends
   * up too close to the very top we nudge it down slightly so the header
   * remains readable.
   *
   * This helper replaces the previous centre-on-row behaviour and applies
   * to ALL expansions (user-initiated or programmatic).
   * @param {HTMLElement} item – The root .events-accordion-item element.
   */
  _scrollExpandedItemIntoView(item) {
    if (!item) return;

    const content = item.querySelector('.accordion-item-content.expanded');
    if (!content) return;

    // Use requestAnimationFrame to ensure DOM is fully updated after expansion
    requestAnimationFrame(() => {
      // Prefer visualViewport if available (adjusts for on-screen keyboard)
      const viewportHeight = (window.visualViewport && window.visualViewport.height) || window.innerHeight || document.documentElement.clientHeight;

      // Reserve some space for soft-keyboard / phone chin. Tuned empirically.
      const SOFT_BOTTOM_MARGIN = 260; // px
      const TOP_MARGIN = 60;          // px – keep header from sticking to very top

      const rect = content.getBoundingClientRect();

      // Capture header top before any scroll to compute safe limits
      const itemTopBefore = item.getBoundingClientRect().top;

      // Calculate how much we need to scroll so that the bottom of the
      // expanded content sits above the soft bottom margin.
      const bottomLimit = viewportHeight - SOFT_BOTTOM_MARGIN;
      if (rect.bottom > bottomLimit) {
        const diff = rect.bottom - bottomLimit;
        // Do not scroll so far that the header moves above TOP_MARGIN
        const maxAllowedDownScroll = Math.max(0, itemTopBefore - TOP_MARGIN);
        const appliedDownScroll = Math.min(diff, maxAllowedDownScroll);
        if (appliedDownScroll > 0) {
          window.scrollBy({ top: appliedDownScroll, behavior: 'smooth' });
        }
        // Do not early-return; we will perform a follow-up top safety check below
      }

      // If the top of the accordion item is too close to the top, scroll up
      // slightly so the header is comfortably visible.
      const ensureTopSafety = () => {
        const itemTopNow = item.getBoundingClientRect().top;
        if (itemTopNow < TOP_MARGIN) {
          const adjust = itemTopNow - TOP_MARGIN;
          window.scrollBy({ top: adjust, behavior: 'smooth' });
        }
      };

      // Allow smooth scroll to start before checking top safety; slightly longer on mobile
      const isMobile = window.innerWidth < 800;
      setTimeout(ensureTopSafety, isMobile ? 250 : 120);
    });
  }
}
