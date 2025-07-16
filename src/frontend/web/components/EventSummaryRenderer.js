/* Event Summary Rendering for Accordion Interface */

class EventSummaryRenderer {

  constructor(webUI) {
    this.webUI = webUI;
  }

  /**
   * Generate a compact summary for an event
   * @param {Object} event - Event data object
   * @returns {string} HTML string for the event summary
   */
  generateSummary(event) {
    if (!event || !event.type) {
      return '<span class="event-summary-error">Invalid event data</span>';
    }

    const eventTypeInfo = this.getEventTypeInfo(event.type);
    const category = this.getEventCategory(event.type);
    
    // Extract individual components for grid layout
    const amount = this.formatCurrency(event.amount);
    const period = this.formatPeriod(event.fromAge, event.toAge);

    return `
      <div class="event-summary">
        <div class="event-summary-header">
          <div class="event-summary-main">
            <div class="event-summary-name">
              <span class="event-name">${eventTypeInfo.label}</span>
            </div>
            <div class="event-summary-badge">
              <span class="event-type-badge">${this.escapeHtml(event.name || 'Unnamed Event')}</span>
            </div>
            <div class="event-summary-amount">
              ${amount ? `<span class="detail-amount">${amount}</span>` : '<span class="detail-empty">—</span>'}
            </div>
            <div class="event-summary-period">
              ${period ? `<span class="detail-period">${period}</span>` : '<span class="detail-empty">—</span>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate details text based on event type and data
   */
  generateDetailsText(event, eventTypeInfo) {
    const details = [];

    // Amount (if present and relevant)
    if (event.amount && event.amount !== '0') {
      details.push(`<span class="detail-amount">${this.formatCurrency(event.amount)}</span>`);
    }

    // Period (if present)
    const periodText = this.formatPeriod(event.fromAge, event.toAge);
    if (periodText) {
      details.push(`<span class="detail-period">${periodText}</span>`);
    }

    return details.length > 0 ? details.join(' • ') : '<span class="detail-empty">No details</span>';
  }

  /**
   * Format currency amount
   */
  formatCurrency(amount) {
    if (!amount || amount === '0') return '';

    const num = parseFloat(amount.toString().replace(/[€,$]/g, ''));
    if (isNaN(num)) return amount;

    return FormatUtils.formatCurrency(num);
  }

  /**
   * Format age period
   */
  formatPeriod(fromAge, toAge) {
    if (!fromAge) return '';
    
    const from = parseInt(fromAge);
    const to = parseInt(toAge);
    
    if (isNaN(from)) return '';
    
    if (isNaN(to) || to === 999) {
      return `from age ${from}`;
    } else if (from === to) {
      return `at age ${from}`;
    } else {
      return `ages ${from}-${to}`;
    }
  }

  /**
   * Get event type information
   */
  getEventTypeInfo(eventType) {
    // Get event type options from table manager
    if (this.webUI.eventsTableManager) {
      const options = this.webUI.eventsTableManager.getEventTypeOptionObjects();
      const option = options.find(opt => opt.value === eventType);
      if (option) {
        return {
          label: option.label,
          description: option.description
        };
      }
    }
    
    // Fallback mapping
    const typeMap = {
      'SI': 'Salary Income',
      'SInp': 'Salary (no pension)',
      'SI2': 'Their Salary',
      'SI2np': 'Their Salary (no pension)',
      'UI': 'RSU Income',
      'RI': 'Rental Income',
      'DBI': 'Defined Benefit Income',
      'FI': 'Tax-free Income',
      'E': 'Expense',
      'R': 'Real Estate',
      'M': 'Mortgage',
      'SM': 'Stock Market',
      'NOP': 'No Operation'
    };
    
    return {
      label: typeMap[eventType] || eventType,
      description: typeMap[eventType] || eventType
    };
  }

  /**
   * Get event category for styling
   */
  getEventCategory(eventType) {
    if (this.isInflow(eventType)) {
      return 'income';
    } else if (this.isOutflow(eventType)) {
      return 'expense';
    } else if (this.isRealEstate(eventType)) {
      return 'property';
    } else if (this.isStockMarket(eventType)) {
      return 'investment';
    }
    return 'other';
  }

  /**
   * Get icon for category
   */
  getCategoryIcon(category) {
    const iconMap = {
      'income': 'plus-circle',
      'expense': 'minus-circle',
      'property': 'home',
      'investment': 'chart-line',
      'other': 'circle'
    };
    return iconMap[category] || 'circle';
  }

  /**
   * Event type classification methods (same as EventsTableManager)
   */
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

  isSalaryEvent(eventType) {
    return ['SI', 'SInp', 'SI2', 'SI2np'].includes(eventType);
  }

  /**
   * Check if event should show Employer Match field
   * Only salary events WITH pension contributions show this field
   */
  showsEmployerMatchField(eventType) {
    // Only SI and SI2 (salary WITH pension) show employer match
    // SInp and SI2np (salary WITHOUT pension) don't show this field
    return ['SI', 'SI2'].includes(eventType);
  }

  /**
   * Check if event should show To Age field in UI
   * Based on actual simulation behavior and event type meanings
   */
  showsToAgeField(eventType, event = null) {
    // Expenses (E): Check if it's a one-off expense
    if (eventType === 'E' && event) {
      // If toAge equals fromAge, it's a one-off expense - don't show To Age field
      return event.toAge !== event.fromAge;
    }

    // All event types show To Age field (including Property for sale date)
    return true;
  }

  /**
   * Check if event should show Growth Rate field in UI
   * Based on what the rate field means for each event type
   */
  showsGrowthRateField(eventType, event = null) {
    // Mortgages (M): Rate is interest rate, not growth rate - don't show
    if (eventType === 'M') {
      return false;
    }

    // Property purchases (R): Rate is property appreciation - show
    if (eventType === 'R') {
      return true;
    }

    // Stock Market overrides (SM): Rate is market growth override - show
    if (eventType === 'SM') {
      return true;
    }

    // Expenses (E): Check if it's a one-off expense
    if (eventType === 'E' && event) {
      // One-off expenses don't have growth rates
      return event.toAge !== event.fromAge;
    }

    // All income types (SI, UI, RI, etc.) show growth rate
    return true;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Generate a detailed summary for expanded view with editable fields
   */
  generateDetailedSummary(event) {
    const eventTypeInfo = this.getEventTypeInfo(event.type);
    const category = this.getEventCategory(event.type);

    // Event type will use custom dropdown (no options needed here)

    // Create editable fields
    const details = [];

    // Event type custom dropdown (same as table view)
    const currentEventTypeInfo = this.getEventTypeInfo(event.type);
    details.push(`
      <div class="detail-row">
        <label>Event Type:</label>
        <div class="editable-field">
          <input type="hidden" class="accordion-edit-type" value="${event.type}" data-accordion-id="${event.accordionId}" data-original-type="${event.type}" data-sort-key="event-type">
          <div class="event-type-dd visualization-control" id="AccordionEventType_${event.accordionId}">
            <span id="AccordionEventTypeToggle_${event.accordionId}" class="dd-toggle pseudo-select">${currentEventTypeInfo.label}</span>
            <div id="AccordionEventTypeOptions_${event.accordionId}" class="visualization-dropdown" style="display:none;"></div>
          </div>
        </div>
      </div>
    `);

    // Event name (editable text input)
    details.push(`
      <div class="detail-row">
        <label>Name:</label>
        <div class="editable-field">
          <input type="text" class="accordion-edit-name" value="${this.escapeHtml(event.name || '')}" data-accordion-id="${event.accordionId}" data-sort-key="event-name">
        </div>
      </div>
    `);

    // Amount (editable currency input) - shown for all event types
    details.push(`
      <div class="detail-row">
        <label>Amount:</label>
        <div class="editable-field">
          <input type="text" class="accordion-edit-amount currency" inputmode="numeric" pattern="[0-9]*" value="${event.amount || ''}" data-accordion-id="${event.accordionId}" data-sort-key="event-amount">
        </div>
      </div>
    `);

    // From Age (editable numeric input) - shown for all event types
    details.push(`
      <div class="detail-row">
        <label>From Age:</label>
        <div class="editable-field">
          <input type="text" class="accordion-edit-fromage" inputmode="numeric" pattern="[0-9]*" value="${event.fromAge || ''}" data-accordion-id="${event.accordionId}" data-sort-key="from-age">
        </div>
      </div>
    `);

    // To Age (editable numeric input) - always generate but hide if not needed
    const showToAge = this.showsToAgeField(event.type, event);
    details.push(`
      <div class="detail-row" style="display: ${showToAge ? '' : 'none'}">
        <label>To Age:</label>
        <div class="editable-field">
          <input type="text" class="accordion-edit-toage" inputmode="numeric" pattern="[0-9]*" value="${event.toAge || ''}" data-accordion-id="${event.accordionId}" data-sort-key="to-age">
        </div>
      </div>
    `);

    // Growth Rate (editable percentage input) - always generate but hide if not needed
    const showGrowthRate = this.showsGrowthRateField(event.type, event);

    // Customize label based on event type
    let rateLabel = "Growth Rate:";
    let placeholder = "inflation";

    if (event.type === 'R') {
      rateLabel = "Appreciation Rate:";
      placeholder = "inflation";
    } else if (event.type === 'SM') {
      rateLabel = "Market Growth:";
      placeholder = "";
    } else if (event.type === 'M') {
      rateLabel = "Interest Rate:";
      placeholder = "";
    }

    details.push(`
      <div class="detail-row" style="display: ${showGrowthRate ? '' : 'none'}">
        <label>${rateLabel}</label>
        <div class="editable-field percentage-container">
          <input type="text" class="accordion-edit-rate percentage" inputmode="numeric" pattern="[0-9]*" placeholder="${placeholder}" value="${event.rate || ''}" data-accordion-id="${event.accordionId}" data-sort-key="event-rate">
        </div>
      </div>
    `);

    // Employer Match (always generate but hide if not needed)
    const showEmployerMatch = this.showsEmployerMatchField(event.type);
    details.push(`
      <div class="detail-row" style="display: ${showEmployerMatch ? '' : 'none'}">
        <label>Employer Match:</label>
        <div class="editable-field percentage-container">
          <input type="text" class="accordion-edit-match percentage" inputmode="numeric" pattern="[0-9]*" value="${event.match || ''}" data-accordion-id="${event.accordionId}" data-sort-key="event-match">
        </div>
      </div>
    `);

    return details.join('');
  }

  /**
   * Generate summary for wizard preview
   */
  generateWizardPreview(eventData) {
    return this.generateSummary(eventData);
  }


}
