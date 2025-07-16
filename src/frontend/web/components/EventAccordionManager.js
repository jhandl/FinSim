/* Event Accordion Management functionality */

class EventAccordionManager {

  constructor(webUI) {
    this.webUI = webUI;
    this.eventCounter = 0;
    this.ageYearMode = 'age'; // Track current toggle mode
    this.accordionContainer = null;
    this.events = []; // Store event data for accordion items
    this.expandedItems = new Set(); // Track which items are expanded
    this.setupAccordionContainer();
    this.setupResizeListener();
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
    this.renderAccordion();
  }

  /**
   * Render the complete accordion interface
   */
  renderAccordion() {
    if (!this.accordionContainer) return;

    // Create accordion items for existing events
    const items = this.createAccordionItems();

    this.accordionContainer.innerHTML = '';
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
      container.innerHTML = `
        <div class="accordion-empty-state">
          <p>No events yet. Use the table view to add events.</p>
        </div>
      `;
    } else {
      this.events.forEach((event, index) => {
        const item = this.createAccordionItem(event, index);
        container.appendChild(item);
      });
    }
    
    return container;
  }

  /**
   * Sync events from the table to accordion data structure
   */
  syncEventsFromTable() {
    this.events = [];
    const tableRows = document.querySelectorAll('#Events tbody tr');

    tableRows.forEach((row, index) => {
      const event = this.extractEventFromRow(row);
      if (event) {
        event.accordionId = `accordion-item-${index}`;
        // CRITICAL FIX: Store table row reference for reliable lookup
        event.tableRowIndex = index;
        this.events.push(event);
      }
    });

    // Apply sorting if table has active sort
    this.applySortingToAccordion();
  }

  /**
   * Get current sort state from table manager and apply to accordion
   */
  applySortingToAccordion() {
    const tableManager = this.webUI.eventsTableManager;
    if (!tableManager || !tableManager.sortKeys || tableManager.sortKeys.length === 0) {
      return; // No sorting active
    }

    // Use the same sorting logic as the table
    this.events.sort((a, b) => {
      for (const { col, dir } of tableManager.sortKeys) {
        const cmp = this.compareEventValues(a, b, col, dir);
        if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  /**
   * Compare two events for sorting (reuses table sorting logic)
   */
  compareEventValues(eventA, eventB, col, dir) {
    const aVal = this.getEventValueForColumn(eventA, col);
    const bVal = this.getEventValueForColumn(eventB, col);

    // Use the same comparison logic as RowSorter
    const aNum = parseFloat(aVal);
    const bNum = parseFloat(bVal);
    const aIsNum = !isNaN(aNum);
    const bIsNum = !isNaN(bNum);

    // If sorting ascending, treat empty/zero as high values to sink them
    if (dir === 'asc') {
      if (aIsNum && aNum === 0 && bIsNum && bNum !== 0) return 1;
      if (bIsNum && bNum === 0 && aIsNum && aNum !== 0) return -1;
      if (!aVal && bVal) return 1;
      if (aVal && !bVal) return -1;
    }

    if (aIsNum && bIsNum) {
      if (aNum < bNum) return -1;
      if (aNum > bNum) return 1;
      return 0;
    }
    // Fallback to locale-aware string compare
    return aVal.toString().localeCompare(bVal.toString(), undefined, { sensitivity: 'accent' });
  }

  /**
   * Get event value for a specific column (maps to table column selectors)
   */
  getEventValueForColumn(event, col) {
    switch (col) {
      case 'event-type':
        return event.type || '';
      case 'event-name':
        return event.name || '';
      case 'event-amount':
        // Clean amount like table does
        const amount = event.amount || '';
        return amount.replace(/[^0-9\.]/g, '');
      case 'from-age':
        return event.fromAge || '';
      case 'to-age':
        return event.toAge || '';
      case 'event-rate':
        return event.rate || '';
      case 'event-match':
        return event.match || '';
      default:
        return '';
    }
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

      return {
        type: typeInput.value || '',
        name: nameInput?.value || '',
        amount: amountInput?.value || '',
        fromAge: fromAgeInput?.value || '',
        toAge: toAgeInput?.value || '',
        rate: rateInput?.value || '',
        match: matchInput?.value || '',
        rowId: row.dataset.rowId || ''
      };
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

    const isExpanded = this.expandedItems.has(event.accordionId);
    
    // Create summary renderer instance
    const summaryRenderer = new EventSummaryRenderer(this.webUI);
    const summary = summaryRenderer.generateSummary(event);
    
    item.innerHTML = `
      <div class="accordion-item-header" data-accordion-id="${event.accordionId}">
        <div class="accordion-item-controls-left">
          <button class="accordion-expand-btn ${isExpanded ? 'expanded' : ''}" title="${isExpanded ? 'Collapse' : 'Expand'}">
            +
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
        if (e.target.closest('.accordion-expand-btn') || e.target.closest('.accordion-delete-btn')) {
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
      // Collapse with animation
      content.classList.remove('expanded');
      expandBtn.classList.remove('expanded');
      expandBtn.title = 'Expand';
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
      content.classList.add('expanded');
      expandBtn.classList.add('expanded');
      expandBtn.title = 'Collapse';
      this.expandedItems.add(accordionId);
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

    contentContainer.innerHTML = detailedSummary;

    // Setup editable field handlers for direct editing
    this.setupEditableFieldHandlers(contentContainer, event);
  }



  /**
   * Refresh the accordion display
   */
  refresh() {
    this.renderAccordion();
    // Check for wrapping after rendering
    setTimeout(() => this.checkAndApplyWrapping(), 50);
  }

  /**
   * Refresh the accordion with animation for newly created event
   */
  refreshWithNewEventAnimation(eventData) {
    // Don't refresh if we already refreshed recently (to avoid double refresh)
    if (this._recentlyRefreshed) {
      // Just animate the existing items
      setTimeout(() => {
        this.animateNewEventWithSorting(eventData);
      }, 100);
      return;
    }

    // Mark as recently refreshed
    this._recentlyRefreshed = true;
    setTimeout(() => { this._recentlyRefreshed = false; }, 200);

    // First refresh the accordion to get the new event
    this.renderAccordion();

    // Then find and animate the newly created event
    setTimeout(() => {
      this.animateNewEventWithSorting(eventData);
    }, 100);
  }

  /**
   * Animate the newly created event, accounting for its sorted position
   */
  animateNewEventWithSorting(eventData) {
    // Find the accordion item that corresponds to the new event
    // Since sorting may have moved it, we need to find it by matching data
    const accordionItems = document.querySelectorAll('.events-accordion-item');
    let targetItem = null;

    // Look for the item that matches our event data
    for (const item of accordionItems) {
      const accordionId = item.dataset.accordionId;
      const event = this.events.find(e => e.accordionId === accordionId);

      if (event && this.isNewlyCreatedEvent(event, eventData)) {
        targetItem = item;
        break;
      }
    }

    if (targetItem) {
      // Add highlight animation class
      targetItem.classList.add('new-event-highlight');

      // Scroll the new event into view
      targetItem.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      // Remove highlight after animation completes
      setTimeout(() => {
        targetItem.classList.remove('new-event-highlight');
      }, 800);
    }
  }

  /**
   * Check if an event matches newly created event data
   */
  isNewlyCreatedEvent(event, eventData) {
    return event.type === eventData.eventType &&
           event.name === eventData.name &&
           event.amount === eventData.amount &&
           event.fromAge === eventData.fromAge &&
           event.toAge === eventData.toAge;
  }

  /**
   * Animate the newly created event to draw attention
   */
  animateNewEvent(eventData) {
    // Find the accordion items
    const accordionItems = document.querySelectorAll('.events-accordion-item');

    // New events are added at the end, so animate the last item
    const lastItem = accordionItems[accordionItems.length - 1];

    if (lastItem) {
      // Add highlight animation class
      lastItem.classList.add('new-event-highlight');

      // Scroll the new event into view
      lastItem.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      // Remove highlight after animation completes
      setTimeout(() => {
        lastItem.classList.remove('new-event-highlight');
      }, 800);
    }
  }





  /**
   * Setup handlers for editable fields in accordion item
   */
  setupEditableFieldHandlers(container, event) {
    // Handle event type custom dropdown (same as table view)
    const typeInput = container.querySelector('.accordion-edit-type');
    const toggleEl = container.querySelector(`#AccordionEventTypeToggle_${event.accordionId}`);
    const dropdownEl = container.querySelector(`#AccordionEventTypeOptions_${event.accordionId}`);

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
        width: 200,
        header: 'Event Type',
        onSelect: (newType, label) => {
          if (newType !== event.type) {
            // Update the hidden input
            typeInput.value = newType;

            // Clear any validation errors for the dropdown
            this.clearFieldValidation(typeInput);

            // Preserve current field values before updating table
            const currentValues = this.preserveCurrentFieldValues(container);

            // Update the table with the new event type (without setting defaults)
            this.syncFieldToTableWithoutDefaults(event, '.event-type', newType);

            // Update the event object for immediate UI refresh
            event.type = newType;

            // Update field visibility in accordion view without regenerating
            this.updateAccordionFieldVisibility(container, event, currentValues);
          }
        }
      });

      // Store reference for potential future updates
      container._eventTypeDropdown = dropdown;
    }

    // Handle direct field editing with validation
    const editableFields = [
      { selector: '.accordion-edit-name', tableClass: '.event-name', type: 'text' },
      { selector: '.accordion-edit-amount', tableClass: '.event-amount', type: 'currency' },
      { selector: '.accordion-edit-fromage', tableClass: '.event-from-age', type: 'age' },
      { selector: '.accordion-edit-toage', tableClass: '.event-to-age', type: 'age' },
      { selector: '.accordion-edit-rate', tableClass: '.event-rate', type: 'percentage' },
      { selector: '.accordion-edit-match', tableClass: '.event-match', type: 'percentage' }
    ];

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
      tableInput.value = value;

      // Trigger change event to ensure any table-side validation/formatting occurs
      const changeEvent = new Event('change', { bubbles: true });
      tableInput.dispatchEvent(changeEvent);
    }
  }

  /**
   * Refresh the detailed view to show appropriate fields for the event type
   */
  refreshDetailedView(container, event) {
    // Find the detailed summary container
    const summaryContainer = container.querySelector('.event-detailed-summary');
    if (!summaryContainer) {
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
    summaryContainer.outerHTML = newDetailedSummary;

    // Re-setup handlers for the new content
    const newContainer = container.querySelector('.accordion-item-content-wrapper');
    if (newContainer) {
      this.setupEditableFieldHandlers(newContainer, event);
    }
  }

  /**
   * Find the table row corresponding to an accordion event
   */
  findTableRowForEvent(event) {
    // CRITICAL FIX: Use table row index for reliable lookup instead of data matching
    if (event.tableRowIndex !== undefined) {
      const tableRows = document.querySelectorAll('#Events tbody tr');
      return tableRows[event.tableRowIndex] || null;
    }

    // Fallback to old method if no index available
    const tableRows = document.querySelectorAll('#Events tbody tr');
    return Array.from(tableRows).find(row => {
      const rowEvent = this.extractEventFromRow(row);
      return rowEvent &&
             rowEvent.name === event.name &&
             rowEvent.type === event.type &&
             rowEvent.amount === event.amount &&
             rowEvent.fromAge === event.fromAge;
    });
  }

  /**
   * Handle event type change (triggers wizard with pre-populated values)
   */
  handleEventTypeChange(event, newType) {
    // Get the wizard manager
    const wizardManager = this.webUI.eventWizardManager;
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
   * Delete event
   */
  deleteEvent(event) {
    if (!confirm(`Are you sure you want to delete "${event.name}"?`)) {
      return;
    }

    // Find and remove the corresponding table row
    const tableRows = document.querySelectorAll('#Events tbody tr');
    const matchingRow = Array.from(tableRows).find(row => {
      const rowEvent = this.extractEventFromRow(row);
      return rowEvent && rowEvent.name === event.name && rowEvent.type === event.type;
    });

    if (matchingRow) {
      matchingRow.remove();
      this.refresh(); // Refresh accordion after deletion
    }
  }

  /**
   * Add event from wizard data
   */
  addEventFromWizard(eventData) {
    // First add to table (maintains data consistency)
    if (this.webUI.eventsTableManager) {
      this.webUI.eventsTableManager.createEventFromWizard(eventData);
    }

    // Animation is handled by the table manager based on current view mode
  }

  /**
   * Update age/year mode for accordion
   */
  updateAgeYearMode(mode) {
    this.ageYearMode = mode;
    // Refresh to update any age/year displays
    this.refresh();
  }

  /**
   * Check if any accordion item needs wrapping and apply consistent wrapping to all
   */
  checkAndApplyWrapping() {
    if (!this.accordionContainer) return;

    const accordionItems = this.accordionContainer.querySelectorAll('.events-accordion-item');
    let needsWrapping = false;

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
      if (!summaryMain) return;

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

      // Get natural width requirement
      const naturalWidth = testContainer.getBoundingClientRect().width;

      // Get available width for this item
      const summaryMainRect = summaryMain.getBoundingClientRect();
      const availableWidth = summaryMainRect.width;

      // If natural width exceeds available width, we need wrapping
      if (naturalWidth > availableWidth + 5) { // 5px tolerance
        needsWrapping = true;
      }
    });

    // Clean up test container
    document.body.removeChild(testContainer);

    // Apply the appropriate class
    if (needsWrapping) {
      this.accordionContainer.classList.add('force-wrap');
    }
  }

  /**
   * Validate a field value based on its type
   */
  validateField(value, fieldType, event) {
    // Empty values are generally allowed (will be handled by required field validation)
    if (!value || value.trim() === '') {
      return { isValid: true };
    }

    switch (fieldType) {
      case 'text':
        return this.validateTextField(value);
      case 'currency':
        return this.validateCurrencyField(value);
      case 'age':
        return this.validateAgeField(value, event);
      case 'percentage':
        return this.validatePercentageField(value, event);
      default:
        return { isValid: true };
    }
  }

  /**
   * Validate text field (name)
   */
  validateTextField(value) {
    if (value.length > 100) {
      return { isValid: false, message: 'Name is too long (max 100 characters)' };
    }
    return { isValid: true };
  }

  /**
   * Validate currency field (amount)
   */
  validateCurrencyField(value) {
    // Remove currency symbols and commas for validation
    const cleanValue = value.replace(/[€,$]/g, '');
    const numValue = parseFloat(cleanValue);

    if (isNaN(numValue)) {
      return { isValid: false, message: 'Please enter a valid amount' };
    }

    if (numValue < 0) {
      return { isValid: false, message: 'Amount cannot be negative' };
    }

    if (numValue > 10000000) {
      return { isValid: false, message: 'Amount seems unreasonably high', isWarningOnly: true };
    }

    return { isValid: true };
  }

  /**
   * Validate age field (fromAge, toAge)
   */
  validateAgeField(value, event) {
    const numValue = parseInt(value);

    if (isNaN(numValue)) {
      return { isValid: false, message: 'Please enter a valid age' };
    }

    if (numValue < 0) {
      return { isValid: false, message: 'Age cannot be negative' };
    }

    if (numValue > 120) {
      return { isValid: false, message: 'Age seems unreasonably high', isWarningOnly: true };
    }

    // Additional validation for toAge vs fromAge
    if (event && event.fromAge && event.toAge) {
      const fromAge = parseInt(event.fromAge);
      const toAge = parseInt(event.toAge);

      if (!isNaN(fromAge) && !isNaN(toAge) && toAge < fromAge) {
        return { isValid: false, message: 'End age cannot be before start age' };
      }
    }

    return { isValid: true };
  }

  /**
   * Validate percentage field (rate, match)
   */
  validatePercentageField(value, event) {
    // Remove percentage symbol for validation
    const cleanValue = value.replace('%', '');
    const numValue = parseFloat(cleanValue);

    if (isNaN(numValue)) {
      return { isValid: false, message: 'Please enter a valid percentage' };
    }

    // Convert to decimal for validation (assuming input is in percentage form)
    const decimalValue = numValue / 100;

    // General percentage validation
    if (Math.abs(decimalValue) > 1) {
      return { isValid: false, message: 'Percentage seems very high', isWarningOnly: true };
    }

    // Specific validation based on field context
    if (event && event.type) {
      // Growth rate validation
      if (Math.abs(decimalValue) > 0.3) {
        return { isValid: false, message: 'Growth rate seems unrealistic', isWarningOnly: true };
      }

      // Match percentage should be reasonable
      if (decimalValue > 0.2) {
        return { isValid: false, message: 'Match percentage seems very high', isWarningOnly: true };
      }
    }

    return { isValid: true };
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
          const selectedOption = optionObjects.find(opt => opt.value === value);

          if (selectedOption) {
            // Update the visible toggle text
            toggleEl.textContent = selectedOption.label;

            // Update the dropdown's selected state
            const dropdownContainer = tableRow.querySelector('.visualization-dropdown');
            if (dropdownContainer) {
              dropdownContainer.querySelectorAll('[data-value]').forEach(el => {
                el.classList.remove('selected');
              });

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
        input.value = value;
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

          // Update rate field label based on event type
          if (field.key === 'rate') {
            this.updateRateFieldLabel(row, event.type);
          }
        } else {
          row.style.display = 'none';
        }
      }
    });

    // Always show name, amount, and fromAge fields and restore their values
    const alwaysVisibleFields = [
      { selector: '.accordion-edit-name', key: 'name' },
      { selector: '.accordion-edit-amount', key: 'amount' },
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
      let rateLabel = "Growth Rate:";

      if (eventType === 'R') {
        rateLabel = "Appreciation Rate:";
      } else if (eventType === 'SM') {
        rateLabel = "Market Growth:";
      } else if (eventType === 'M') {
        rateLabel = "Interest Rate:";
      }

      label.textContent = rateLabel;
    }
  }

  /**
   * Update the accordion dropdown toggle text to show the new event type
   */
  updateAccordionDropdownToggle(container, event) {
    const toggleEl = container.querySelector(`#AccordionEventTypeToggle_${event.accordionId}`);
    const dropdown = container._eventTypeDropdown;

    if (toggleEl && dropdown && this.webUI.eventsTableManager) {
      // Get the label for the new event type
      const optionObjects = this.webUI.eventsTableManager.getEventTypeOptionObjects();
      const selectedOption = optionObjects.find(opt => opt.value === event.type);

      if (selectedOption) {
        // Update the visible toggle text
        toggleEl.textContent = selectedOption.label;

        // Update the dropdown's selected state
        const dropdownContainer = container.querySelector(`#AccordionEventTypeOptions_${event.accordionId}`);
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
          input.value = preservedValues[mapping.key];
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
}
