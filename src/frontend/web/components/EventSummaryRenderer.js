/* Event Summary Rendering for Accordion Interface */

class EventSummaryRenderer {

  constructor(webUI) {
    this.webUI = webUI;
    this.fieldLabelsManager = FieldLabelsManager.getInstance();
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
    // For stock market events, show rate instead of amount
    let displayValue;
    if (this.isStockMarket(event.type)) {
      displayValue = this.formatRate(event.rate);
    } else {
      displayValue = this.formatCurrency(event.amount, event);
    }
    const period = this.formatPeriod(event.fromAge, event.toAge);

    const hasImpact = event.relocationImpact;
    const impactIcon = hasImpact ? '<i class="fa-solid fa-triangle-exclamation"></i>' : '';
    const impactCategory = hasImpact ? event.relocationImpact.category : '';

    return `
      <div class="event-summary">
        <div class="event-summary-header">
          <div class="event-summary-main">
            <div class="event-summary-name">
              ${hasImpact ? `<span class="relocation-impact-badge accordion-impact-badge" data-impact-category="${impactCategory}">${impactIcon}</span>` : ''}<span class="event-name">${eventTypeInfo.label}</span>
            </div>
            <div class="event-summary-badge">
              <span class="event-type-badge">${this.escapeHtml(event.name || '—')}</span>
            </div>
            <div class="event-summary-amount">
              ${displayValue ? `<span class="detail-amount">${displayValue}</span>` : '<span class="detail-empty">—</span>'}
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
      details.push(`<span class="detail-amount">${this.formatCurrency(event.amount, event)}</span>`);
    }

    // Period (if present)
    const periodText = this.formatPeriod(event.fromAge, event.toAge);
    if (periodText) {
      details.push(`<span class="detail-period">${periodText}</span>`);
    }

    return details.length > 0 ? details.join(' • ') : '<span class="detail-empty">No details</span>';
  }

  /**
   * Format currency amount using linked country when available
   */
  formatCurrency(amount, event) {
    if (!amount || amount === '0') return '';

    // Robust numeric parsing: strip all non-digits except leading minus
    let s = amount.toString().trim();
    // Preserve a single leading minus sign if present
    const isNegative = /^-/.test(s);
    s = s.replace(/[^0-9]/g, '');
    if (s === '') return '';
    let num = parseFloat(s);
    if (isNaN(num)) return amount;
    if (isNegative) num = -num;

    // Default to active locale settings
    let numberLocale = FormatUtils.getLocaleSettings().numberLocale;
    let currencyCode = FormatUtils.getLocaleSettings().currencyCode;

    // If the event has a linked country or explicit currency, prefer those
    try {
      const cfg = (typeof Config !== 'undefined' && Config.getInstance) ? Config.getInstance() : null;
      if (cfg) {
        let rs = null;
        if (event && event.linkedCountry) {
          try { rs = cfg.getCachedTaxRuleSet(String(event.linkedCountry).toLowerCase()); } catch (_) {}
        }
        if (!rs && event && event.currency) {
          try {
            const countries = (typeof cfg.getAvailableCountries === 'function') ? cfg.getAvailableCountries() : [];
            for (let i = 0; i < countries.length; i++) {
              const c = countries[i];
              try {
                const crs = cfg.getCachedTaxRuleSet(String(c.code).toLowerCase());
                if (crs && typeof crs.getCurrencyCode === 'function' && crs.getCurrencyCode() === event.currency) {
                  rs = crs;
                  break;
                }
              } catch (_) { /* try next */ }
            }
          } catch (_) {}
        }
        if (rs) {
          try { numberLocale = (rs.getNumberLocale && rs.getNumberLocale()) || numberLocale; } catch (_) {}
          try { currencyCode = (rs.getCurrencyCode && rs.getCurrencyCode()) || currencyCode; } catch (_) {}
        }
      }
    } catch (_) { /* fall back to defaults */ }

    try {
      return num.toLocaleString(numberLocale, {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).replace(/\s/g, '');
    } catch (_) {
      // Fallback to generic formatter
      return FormatUtils.formatCurrency(num);
    }
  }

  /**
   * Format rate as percentage
   */
  formatRate(rate) {
    if (!rate || rate === '0' || rate === '') return '';

    const num = parseFloat(rate.toString().replace(/[%]/g, ''));
    if (isNaN(num)) return rate;

    // Convert to decimal format for FormatUtils.formatPercentage
    // If the value is > 1, assume it's already in percentage form (like 20 for 20%)
    // If the value is <= 1, assume it's in decimal form (like 0.2 for 20%)
    const decimalValue = Math.abs(num) > 1 ? num / 100 : num;

    return FormatUtils.formatPercentage(decimalValue);
  }

  /**
   * Format age period
   */
  formatPeriod(fromAge, toAge) {
    if (!fromAge) return '';

    const from = parseInt(fromAge);
    const to = parseInt(toAge);

    if (isNaN(from)) return '';

    // Get current age/year mode
    let timeUnit = 'age';
    try {
      if (this.webUI && this.webUI.eventsTableManager && this.webUI.eventsTableManager.ageYearMode) {
        timeUnit = this.webUI.eventsTableManager.ageYearMode;
      }
    } catch (err) {
      // Silently ignore errors and keep default
    }

    const timeUnitPlural = timeUnit === 'age' ? 'ages' : 'years';

    if (isNaN(to) || to === 999) {
      return `from ${timeUnit} ${from}`;
    } else if (from === to) {
      return `at ${timeUnit} ${from}`;
    } else {
      return `${timeUnitPlural} ${from}-${to}`;
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
    // Special-case relocation MV-* to show arrow + country name
    try {
      if (typeof eventType === 'string' && eventType.indexOf('MV-') === 0) {
        const code = eventType.substring(3).toLowerCase();
        const countries = (typeof Config !== 'undefined' && Config.getInstance) ? Config.getInstance().getAvailableCountries() : [];
        const match = Array.isArray(countries) ? countries.find(c => String(c.code).toLowerCase() === code) : null;
        if (match) {
          return {
            label: `→ ${match.name}`,
            description: `Relocation to ${match.name}`
          };
        }
      }
    } catch (_) {}
    
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
    // Only salary events WITH pension show this field. Explicitly hide for MV-* and NOP during debugging.
    if (typeof eventType === 'string' && eventType.indexOf('MV-') === 0) return false;
    return ['SI', 'SI2'].includes(eventType);
  }

  /**
   * Check if an event is a one-off expense
   * One-off expenses are type 'E' events where fromAge equals toAge
   */
  isOneOffExpense(event) {
    if (!event || event.type !== 'E') {
      return false;
    }

    const fromAge = parseInt(event.fromAge);
    const toAge = parseInt(event.toAge);

    return !isNaN(fromAge) && !isNaN(toAge) && fromAge === toAge;
  }

  /**
   * Check if event should show To Age field in UI
   * Based on actual simulation behavior and event type meanings
   */
  showsToAgeField(eventType, event = null) {
    // Hide To Age for relocation MV-*; otherwise show (one-off expenses may equal fromAge)
    if (typeof eventType === 'string' && eventType.indexOf('MV-') === 0) return false;
    return true;
  }

  /**
   * Check if event should show Growth Rate field in UI
   * Based on what the rate field means for each event type
   */
  showsGrowthRateField(eventType, event = null) {
    if (typeof eventType === 'string' && eventType.indexOf('MV-') === 0) {
      return false;
    }
    // One-off expenses: Never show Growth Rate field since it occurs only once
    if (event && this.isOneOffExpense(event)) {
      return false;
    }

    // Mortgages (M): Rate is interest rate - show it
    if (eventType === 'M') {
      return true;
    }

    // Property purchases (R): Rate is property appreciation - show
    if (eventType === 'R') {
      return true;
    }

    // Stock Market overrides (SM): Rate is market growth override - show
    if (eventType === 'SM') {
      return true;
    }

    // Expenses (E): Always show growth rate field for recurring expenses
    if (eventType === 'E') {
      return true;
    }

    // All income types (SI, UI, RI, etc.) show growth rate
    return true;
  }

  /**
   * Check if event should show Amount field in UI
   * Stock market events don't use the amount field
   */
  showsAmountField(eventType, event = null) {
    // Stock Market events (SM): Don't show amount field - they use rate instead
    if (eventType === 'SM') {
      return false;
    }

    // All other event types show amount field
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
          <div class="event-type-dd visualization-control" id="AccordionEventType_${event.rowId}">
            <span id="AccordionEventTypeToggle_${event.rowId}" class="dd-toggle pseudo-select">${currentEventTypeInfo.label}</span>
            <div id="AccordionEventTypeOptions_${event.rowId}" class="visualization-dropdown" style="display:none;"></div>
          </div>
        </div>
      </div>
    `);

    // Event name (editable text input)
    const nameLabel = this.fieldLabelsManager.getFieldLabel(event.type, 'name');
    details.push(`
      <div class="detail-row">
        <label>${nameLabel}:</label>
        <div class="editable-field">
          <input type="text" class="accordion-edit-name" value="${this.escapeHtml(event.name || '')}" data-accordion-id="${event.accordionId}" data-sort-key="event-name">
        </div>
      </div>
    `);

    // Amount (editable currency input) - always generate but hide if not needed
    const showAmount = this.showsAmountField(event.type, event);
    const amountLabel = this.fieldLabelsManager.getFieldLabel(event.type, 'amount');
    // Fallback: if event.amount is empty (e.g., just after split via accordion), read the table value
    let initialAmountValue = event.amount || '';
    if (!initialAmountValue && event && event.rowId) {
      try {
        const row = document.querySelector('#Events tbody tr[data-row-id="' + event.rowId + '"]');
        if (row) {
          const amtEl = row.querySelector('.event-amount');
          initialAmountValue = (amtEl && amtEl.value) ? amtEl.value : '';
        }
      } catch (_) {}
    }
    
    details.push(`
      <div class="detail-row" style="display: ${showAmount ? '' : 'none'}">
        <label>${amountLabel}:</label>
        <div class="editable-field">
          <input type="text" class="accordion-edit-amount currency" inputmode="numeric" pattern="[0-9]*" value="${initialAmountValue}" data-accordion-id="${event.accordionId}" data-sort-key="event-amount">
        </div>
      </div>
    `);

    // From Age (editable numeric input) - shown for all event types
    const fromAgeLabel = this.fieldLabelsManager.getFieldLabel(event.type, 'fromAge');
    details.push(`
      <div class="detail-row">
        <label>${fromAgeLabel}:</label>
        <div class="editable-field">
          <input type="text" class="accordion-edit-fromage" inputmode="numeric" pattern="[0-9]*" value="${event.fromAge || ''}" data-accordion-id="${event.accordionId}" data-sort-key="from-age">
        </div>
      </div>
    `);

    // To Age (editable numeric input) - always generate but hide if not needed
    const showToAge = this.showsToAgeField(event.type, event);
    const toAgeLabel = this.fieldLabelsManager.getFieldLabel(event.type, 'toAge');
    details.push(`
      <div class="detail-row" style="display: ${showToAge ? '' : 'none'}">
        <label>${toAgeLabel}:</label>
        <div class="editable-field">
          <input type="text" class="accordion-edit-toage" inputmode="numeric" pattern="[0-9]*" value="${event.toAge || ''}" data-accordion-id="${event.accordionId}" data-sort-key="to-age">
        </div>
      </div>
    `);

    // Growth Rate (editable percentage input) - always generate but hide if not needed
    const showGrowthRate = this.showsGrowthRateField(event.type, event);
    const rateLabel = this.fieldLabelsManager.getFieldLabel(event.type, 'rate');
    const ratePlaceholder = this.fieldLabelsManager.getFieldPlaceholder(event.type, 'rate');

    details.push(`
      <div class="detail-row" style="display: ${showGrowthRate ? '' : 'none'}">
        <label>${rateLabel}:</label>
        <div class="editable-field percentage-container">
          <input type="text" class="accordion-edit-rate percentage" inputmode="numeric" pattern="[0-9]*" placeholder="${ratePlaceholder}" value="${event.rate || ''}" data-accordion-id="${event.accordionId}" data-sort-key="event-rate">
        </div>
      </div>
    `);

    // Employer Match (always generate but hide if not needed)
    const showEmployerMatch = this.showsEmployerMatchField(event.type);
    const matchLabel = this.fieldLabelsManager.getFieldLabel(event.type, 'match');
    const matchPlaceholder = this.fieldLabelsManager.getFieldPlaceholder(event.type, 'match');
    details.push(`
      <div class="detail-row" style="display: ${showEmployerMatch ? '' : 'none'}">
        <label>${matchLabel}:</label>
        <div class="editable-field percentage-container">
          <input type="text" class="accordion-edit-match percentage" inputmode="numeric" pattern="[0-9]*" placeholder="${matchPlaceholder}" value="${event.match || ''}" data-accordion-id="${event.accordionId}" data-sort-key="event-match">
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
