/* Formatting utility functions */

class FormatUtils {
  
  static formatCurrency(value) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return value;
    
    return numValue.toLocaleString('en-IE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  static formatPercentage(value) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return value;
    
    // If value is decimal (< 1), multiply by 100
    const displayValue = numValue <= 1 ? (numValue * 100) : numValue;
    // Format with at most 1 decimal place, and remove .0 if present
    return `${parseFloat(displayValue.toFixed(1)).toString()}%`;
  }

  static parsePercentage(value) {
    if (typeof value !== 'string') return value;
    value = value.replace('%', '');
    const numValue = parseFloat(value);
    return isNaN(numValue) ? undefined : numValue / 100;
  }

  static parseCurrency(value) {
    if (typeof value !== 'string') return value;
    value = value.replace(/[€,]/g, '');
    const numValue = parseFloat(value);
    return isNaN(numValue) ? undefined : numValue;
  }

  static formatBoolean(value) {
    if (typeof value === 'string') {
      value = value.toLowerCase();
      return (value === 'true' || value === 'yes') ? 'Yes' : 'No';
    }
    return value ? 'Yes' : 'No';
  }


  setupPercentageInputs() {
    const percentageInputs = document.querySelectorAll('input.percentage');
    percentageInputs.forEach(input => {
      // Only wrap if not already wrapped
      if (!input.parentElement.classList.contains('percentage-container')) {
        const container = document.createElement('div');
        container.className = 'percentage-container';
        input.parentNode.insertBefore(container, input);
        container.appendChild(input);
        
        // Add placeholder if it's an optional rate input
        if (input.classList.contains('event-rate')) {
          const rowId = input.id.split('_')[1];
          const rowEl = input.closest('tr');
          const typeInput = rowEl ? rowEl.querySelector('.event-type') : null;
          const eventType = typeInput ? typeInput.value.split(':')[0] : '';
          const required = UIManager.getRequiredFields(eventType);
          
          // Only show inflation placeholder if rate is not required
          if (!required || !required.rate || required.rate === 'optional') {
            input.placeholder = 'inflation';
          }
        }
      }

      // Function to update % symbol visibility
      const updatePercentageVisibility = () => {
        const container = input.parentElement;
        if (container && container.classList.contains('percentage-container')) {
          container.style.setProperty('--show-percentage', input.value.trim() !== '' ? '1' : '0');
        }
      };

      // Add event listeners
      input.addEventListener('input', updatePercentageVisibility);
      input.addEventListener('change', updatePercentageVisibility);

      // Initial state
      updatePercentageVisibility();

      // Focus/blur handlers for editing
      input.addEventListener('focus', function() {
        const value = this.value.replace('%', '');
        if (value !== this.value) {
          this.value = value;
        }
      });

      input.addEventListener('blur', function() {
        if (this.value.trim() !== '') {
          const value = parseFloat(this.value);
          if (!isNaN(value)) {
            // Format with at most 1 decimal place, and remove .0 if present
            this.value = parseFloat(value.toFixed(1)).toString();
          }
        }
        updatePercentageVisibility();
      });
    });
  }

  setupCurrencyInputs() {
    const currencyInputs = document.querySelectorAll('input.currency');
    
    // Create container elements all at once
    currencyInputs.forEach(input => {
      if (!input.parentElement.classList.contains('currency-container')) {
        const container = document.createElement('div');
        container.className = 'currency-container';
        input.parentNode.insertBefore(container, input);
        container.appendChild(input);
      }

      // Remove type="number" to prevent browser validation of formatted numbers
      input.type = 'text';
      input.inputMode = 'numeric';
      input.pattern = '[0-9\$€,]*';
    });

    // Use direct event listeners instead of delegation for better reliability
    currencyInputs.forEach(input => {
      input.addEventListener('focus', function() {
        // On focus, show the raw number
        const value = FormatUtils.parseCurrency(this.value);
        if (!isNaN(value)) {
          this.value = value;
        }
      });

      input.addEventListener('blur', function() {
        const value = FormatUtils.parseCurrency(this.value);
        if (!isNaN(value)) {
          this.value = FormatUtils.formatCurrency(value);
        }
      });

      // Format initial value if it exists and isn't already formatted
      const value = input.value;
      if (value && value.indexOf('€') === -1) {
        const number = parseFloat(value);
        if (!isNaN(number)) {
          input.value = FormatUtils.formatCurrency(number);
        }
      }
    });
  }

  static processMarkdownLinks(text) {
    if (!text) return text;
    return text.replace(
      /\[([^\]]+)\]\(([^\)]+)\)(?:\{[^\}]*\})?/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  }

  // Generic formatter that defers to existing helpers
  static formatValue(value, format) {
    if (format === 'currency') {
      return FormatUtils.formatCurrency(value);
    }
    if (format === 'percentage') {
      return FormatUtils.formatPercentage(value);
    }
    return value;
  }

  // Expand ${var,format} placeholders using Config values
  static processVariables(text) {
    const config = (typeof Config !== 'undefined') ? Config.getInstance(typeof WebUI !== 'undefined' ? WebUI.getInstance() : null) : null;
    if (!config || !text || typeof text !== 'string') return text;

    return text.replace(/\${([^}]+)}/g, (match, variable) => {
      let [varToken, format] = variable.split(',').map(s => s.trim());

      // Handle special timeUnit variable for age/year mode
      if (varToken === 'timeUnit') {
        let currentMode = 'age';
        try {
          const webUI = (typeof WebUI !== 'undefined') ? WebUI.getInstance() : null;
          if (webUI && webUI.eventsTableManager && webUI.eventsTableManager.ageYearMode) {
            currentMode = webUI.eventsTableManager.ageYearMode;
          }
        } catch (err) {
          // Silently ignore errors and keep default
        }
        return currentMode;
      }

      // Support nested paths like pensionContributionRateBands.min
      if (varToken.includes('.')) {
        const tokens = varToken.split('.');
        let value = config;
        for (let i = 0; i < tokens.length && value !== undefined; i++) {
          const token = tokens[i];

          // Handle synthetic properties like .min and .max on objects
          if ((token === 'min' || token === 'max') && i === tokens.length - 1 && typeof value === 'object' && value !== null) {
            const numericValues = Object.values(value).map(v => parseFloat(v)).filter(v => !isNaN(v));
            if (numericValues.length === 0) {
              return match; // Can't compute
            }
            value = token === 'min' ? Math.min(...numericValues) : Math.max(...numericValues);
          } else {
            value = value[token];
          }
        }
        if (value === undefined) return match;
        return FormatUtils.formatValue(value, format);
      }

      if (Object.prototype.hasOwnProperty.call(config, varToken)) {
        return FormatUtils.formatValue(config[varToken], format);
      }

      // Fallback: resolve select variables from active country tax rules
      try {
        const ruleset = (typeof config.getCachedTaxRuleSet === 'function') ? config.getCachedTaxRuleSet('ie') : null;
        if (ruleset) {
          // Currently needed by help text for index funds deemed disposal
          if (varToken === 'deemedDisposalYears') {
            let dd;
            try {
              const types = (typeof ruleset.getInvestmentTypes === 'function') ? ruleset.getInvestmentTypes() : [];
              const indexFunds = Array.isArray(types) ? types.find(t => t && t.key === 'indexFunds') : null;
              if (indexFunds && indexFunds.taxation && indexFunds.taxation.exitTax && typeof indexFunds.taxation.exitTax.deemedDisposalYears === 'number') {
                dd = indexFunds.taxation.exitTax.deemedDisposalYears;
              }
            } catch (_) {}
            if (typeof dd !== 'number' && ruleset.raw && ruleset.raw.capitalGainsTax && typeof ruleset.raw.capitalGainsTax.deemedDisposalYears === 'number') {
              dd = ruleset.raw.capitalGainsTax.deemedDisposalYears;
            }
            if (typeof dd === 'number') {
              return FormatUtils.formatValue(dd, format);
            }
          }
        }
      } catch (_) {}

      console.warn(`Variable ${varToken} not found in config`);
      return match;
    });
  }

  // Recursively process variables in strings within an object/array structure
  static processVariablesInObject(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return FormatUtils.processVariables(obj);
    if (Array.isArray(obj)) return obj.map(item => FormatUtils.processVariablesInObject(item));
    if (typeof obj === 'object') {
      const processed = {};
      for (const [key, value] of Object.entries(obj)) {
        processed[key] = FormatUtils.processVariablesInObject(value);
      }
      return processed;
    }
    return obj;
  }

  // Replace {{age_or_year}} placeholders with the current Events table mode
  static replaceAgeYearPlaceholders(text) {
    if (!text) return text;
    let currentMode = 'age';
    try {
      const webUI = (typeof WebUI !== 'undefined') ? WebUI.getInstance() : null;
      if (webUI && webUI.eventsTableManager && webUI.eventsTableManager.ageYearMode) {
        currentMode = webUI.eventsTableManager.ageYearMode;
      }
    } catch (err) {
      // Silently ignore errors and keep default
    }
    return text.replace(/\{\{age_or_year\}\}/g, currentMode);
  }

} 