/* Formatting utility functions */

class FormatUtils {
  
  static getLocaleSettings() {
    let numberLocale = 'en-IE';
    let currencyCode = 'EUR';
    let currencySymbol = '€';
    
    try {
      const config = Config.getInstance();
      const ruleset = config.getCachedTaxRuleSet();
      if (ruleset) {
        numberLocale = ruleset.getNumberLocale();
        currencyCode = ruleset.getCurrencyCode();
        currencySymbol = ruleset.getCurrencySymbol();
      }
    } catch (err) {
      // Config not available or not initialized, use fallbacks
    }
    
    return {
      numberLocale,
      currencyCode,
      currencySymbol
    };
  }

  static formatCurrency(value, currencyCode, countryCode) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return value;

    let localeSettings = FormatUtils.getLocaleSettings();
    let numberLocale = localeSettings.numberLocale;

    if (countryCode) {
        try {
            const config = Config.getInstance();
            const ruleset = config.getCachedTaxRuleSet(countryCode);
            if (ruleset) {
                numberLocale = ruleset.getNumberLocale();
            }
        } catch (err) {
            // Fallback to default locale if config or ruleset not available
        }
    }

    const options = {
        style: 'currency',
        currency: currencyCode || localeSettings.currencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    };

    return numValue.toLocaleString(numberLocale, options).replace(/\s/g, '');
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
    const { numberLocale, currencySymbol, currencyCode } = FormatUtils.getLocaleSettings();
    const escSym = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Remove symbol (anywhere) and spaces
    let s = value.replace(new RegExp(escSym, 'g'), '').replace(/\s+/g, '');

    // Derive separators using formatToParts
    const parts = new Intl.NumberFormat(numberLocale).formatToParts(12345.6);
    const group = parts.find(p => p.type === 'group')?.value || ',';
    const decimal = parts.find(p => p.type === 'decimal')?.value || '.';

    // If decimals are not allowed (app policy), reject values containing a decimal separator
    // Policy: allow decimals if locale uses a decimal separator in currency formatting
    const allowDecimals = !!(new Intl.NumberFormat(numberLocale, { style: 'currency', currency: currencyCode }).formatToParts(1.1).find(p => p.type === 'decimal'));

    // Remove group separators
    s = s.split(group).join('');

    // If value contains locale decimal and decimals are disallowed, reject
    if (!allowDecimals && s.indexOf(decimal) !== -1) return undefined;

    // Normalise decimal to '.' for parseFloat
    if (decimal !== '.') s = s.replace(decimal, '.');

    const num = parseFloat(s);
    return isNaN(num) ? undefined : num;
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
    
    // Helpers to derive per-input locale settings using hidden row hints
    const getInputLocaleSettings = (input) => {
      try {
        const row = input.closest('tr');
        // Prefer explicit country hint when present (unambiguous for shared currencies)
        const countryHint = row && row.querySelector ? (row.querySelector('.event-country')?.value || '') : '';
        const code = row && row.querySelector ? (row.querySelector('.event-currency')?.value || '') : '';
        const cfg = Config.getInstance();
        if (countryHint) {
          try {
            const rs = cfg.getCachedTaxRuleSet(countryHint.toLowerCase());
            if (rs) {
              return {
                numberLocale: (rs.getNumberLocale && rs.getNumberLocale()) || FormatUtils.getLocaleSettings().numberLocale,
                currencyCode: (rs.getCurrencyCode && rs.getCurrencyCode()) || FormatUtils.getLocaleSettings().currencyCode,
                currencySymbol: (rs.getCurrencySymbol && rs.getCurrencySymbol()) || ''
              };
            }
          } catch(_) { /* fall through to currency-based lookup */ }
        }
        if (code) {
          const countries = (typeof cfg.getAvailableCountries === 'function') ? cfg.getAvailableCountries() : [];
          for (let i = 0; i < countries.length; i++) {
            try {
              const c = countries[i];
              const rs = cfg.getCachedTaxRuleSet(c.code.toLowerCase());
              if (rs && typeof rs.getCurrencyCode === 'function' && rs.getCurrencyCode() === code) {
                return {
                  numberLocale: (rs.getNumberLocale && rs.getNumberLocale()) || FormatUtils.getLocaleSettings().numberLocale,
                  currencyCode: rs.getCurrencyCode(),
                  currencySymbol: (rs.getCurrencySymbol && rs.getCurrencySymbol()) || ''
                };
              }
            } catch(_) { /* try next */ }
          }
        }
      } catch(_) {}
      return FormatUtils.getLocaleSettings();
    };

    const parseWithLocale = (text, ls) => {
      if (text == null) return undefined;
      if (typeof text !== 'string') text = String(text);
      const escSym = (ls.currencySymbol || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let s = text.replace(new RegExp(escSym, 'g'), '').replace(/\s+/g, '');
      const parts = new Intl.NumberFormat(ls.numberLocale).formatToParts(12345.6);
      const group = parts.find(p => p.type === 'group')?.value || ',';
      const decimal = parts.find(p => p.type === 'decimal')?.value || '.';
      s = s.split(group).join('');
      if (decimal !== '.') s = s.split(decimal).join('.');
      const num = parseFloat(s);
      return isNaN(num) ? undefined : num;
    };

    const formatWithLocale = (num, ls) => {
      const n = parseFloat(num);
      if (isNaN(n)) return num;
      try {
        return n.toLocaleString(ls.numberLocale, { style: 'currency', currency: ls.currencyCode, minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/\s/g, '');
      } catch(_) {
        return String(Math.round(n));
      }
    };

    // Create container elements and apply per-input patterns
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

      const ls = getInputLocaleSettings(input);
      const currencySymbolEscaped = (ls.currencySymbol || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const parts = new Intl.NumberFormat(ls.numberLocale).formatToParts(12345.6);
      const groupSep = parts.find(p => p.type === 'group')?.value || ',';
      const decimalSep = parts.find(p => p.type === 'decimal')?.value || '.';
      const escGroup = groupSep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escDecimal = decimalSep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const symbolToken = currencySymbolEscaped ? `(?:${currencySymbolEscaped})?` : '';
      input.pattern = `^-?${symbolToken}[0-9${escGroup}]*?(?:${escDecimal}[0-9]*)?$`;
    });

    // Use direct event listeners instead of delegation for better reliability
    currencyInputs.forEach(input => {
      input.addEventListener('focus', function() {
        const ls = getInputLocaleSettings(this);
        const value = parseWithLocale(this.value, ls);
        if (!isNaN(value)) {
          this.value = value;
        }
      });

      input.addEventListener('blur', function() {
        const ls = getInputLocaleSettings(this);
        const value = parseWithLocale(this.value, ls);
        if (!isNaN(value)) {
          this.value = formatWithLocale(value, ls);
        }
      });

      // Format initial value if it exists and isn't already formatted according to its locale
      const ls = getInputLocaleSettings(input);
      const value = input.value;
      if (value && (ls.currencySymbol && value.indexOf(ls.currencySymbol) === -1)) {
        const number = parseWithLocale(value, ls);
        if (!isNaN(number)) {
          input.value = formatWithLocale(number, ls);
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

  // Expand ${var,format} placeholders using Config values and optional runtime context.
  // Runs iteratively so placeholders introduced by replacements are also resolved.
  static processVariables(text, context = null) {
    if (!text || typeof text !== 'string') return text;

    let current = text;
    const maxPasses = 6;
    for (let pass = 0; pass < maxPasses; pass++) {
      const next = FormatUtils._processVariablesSinglePass(current, context);
      if (next === current) return next;
      current = next;
    }
    return current;
  }

  static _processVariablesSinglePass(text, context = null) {
    let config = null;
    try {
      if (typeof Config !== 'undefined') {
        // Do NOT instantiate WebUI here; just get existing Config if initialized
        config = Config.getInstance();
      }
    } catch (_) {
      // Config not initialized yet; continue with null to allow fallbacks
    }

    return text.replace(/\${([^}]+)}/g, (match, variable) => {
      let [varToken, format] = variable.split(',').map(s => s.trim());

      if (varToken.startsWith('investmentType.')) {
        if (context && context.investmentType) {
          const path = varToken.substring('investmentType.'.length).split('.');
          let value = context.investmentType;
          for (let i = 0; i < path.length && value !== undefined && value !== null; i++) {
            value = value[path[i]];
          }
          if (value !== undefined && value !== null) {
            return FormatUtils.formatValue(value, format);
          }
        }
        return match;
      }

      if (varToken.startsWith('taxRules.') && context && context.taxRules) {
        const path = varToken.substring('taxRules.'.length).split('.');
        let value = context.taxRules;
        for (let i = 0; i < path.length && value !== undefined && value !== null; i++) {
          value = value[path[i]];
        }
        if (value !== undefined && value !== null) {
          return FormatUtils.formatValue(value, format);
        }
      }

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

      // Support nested paths like pensionContributionRateBands.min within Config only if available
      if (config && varToken.includes('.')) {
        const tokens = varToken.split('.');
        let value = config;
        for (let i = 0; i < tokens.length && value !== undefined && value !== null; i++) {
          const token = tokens[i];
          if ((token === 'min' || token === 'max') && i === tokens.length - 1 && typeof value === 'object') {
            const numericValues = Object.values(value).map(v => parseFloat(v)).filter(v => !isNaN(v));
            if (numericValues.length === 0) {
              value = undefined; // allow fallback
              break;
            }
            value = token === 'min' ? Math.min(...numericValues) : Math.max(...numericValues);
          } else {
            value = value[token];
          }
        }
        if (value !== undefined && value !== null) {
          return FormatUtils.formatValue(value, format);
        }
        // If config nested lookup failed, allow fallthrough to tax rules / other fallbacks
      }

      if (config && Object.prototype.hasOwnProperty.call(config, varToken)) {
        return FormatUtils.formatValue(config[varToken], format);
      }

      // Fallback: resolve variables from active country tax rules
      try {
        const ruleset = (config && typeof config.getCachedTaxRuleSet === 'function') ? config.getCachedTaxRuleSet(config.getDefaultCountry()) : null;
        if (ruleset) {
          const rawRules = ruleset.raw || {};

          // Generic access to tax rules: ${taxRules.path.to.value}
          if (varToken.startsWith('taxRules.')) {
            const path = varToken.substring('taxRules.'.length);
            const parts = path.split('.');
            let val = rawRules;
            for (let i = 0; i < parts.length && val !== undefined; i++) {
              val = val[parts[i]];
            }
            if (val !== undefined) {
              return FormatUtils.formatValue(val, format);
            }
          }

          // Currently needed by help text for index funds deemed disposal
          if (varToken === 'deemedDisposalYears') {
            let dd;
            try {
              const types = (typeof ruleset.getResolvedInvestmentTypes === 'function') ? ruleset.getResolvedInvestmentTypes() : [];
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

      console.warn(`Variable ${varToken} not found in config.`);
      return match;
    });
  }

  // Recursively process variables in strings within an object/array structure
  static processVariablesInObject(obj, context = null) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return FormatUtils.processVariables(obj, context);
    if (Array.isArray(obj)) return obj.map(item => FormatUtils.processVariablesInObject(item, context));
    if (typeof obj === 'object') {
      const processed = {};
      for (const [key, value] of Object.entries(obj)) {
        processed[key] = FormatUtils.processVariablesInObject(value, context);
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
      // Avoid constructing WebUI; rely on existing global instance if present
      const existingWebUI = (typeof window !== 'undefined' && window.WebUI_instance) ? window.WebUI_instance : null;
      if (existingWebUI && existingWebUI.eventsTableManager && existingWebUI.eventsTableManager.ageYearMode) {
        currentMode = existingWebUI.eventsTableManager.ageYearMode;
      }
    } catch (err) {
      // Silently ignore errors and keep default
    }
    return text.replace(/\{\{age_or_year\}\}/g, currentMode);
  }

} 
