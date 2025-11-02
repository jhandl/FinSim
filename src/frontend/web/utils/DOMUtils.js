/* DOM manipulation utility functions */

class DOMUtils {

  static getValue(elementId) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    if (element.value !== undefined) {
      let value = element.value;        
      // Check if element is in a parameter section (not in events table or other special sections)
      const isInParameterSection = element.closest('.parameters-section') && 
                                   !element.closest('#Events, .events-section') &&
                                   element.type !== 'hidden';
      
      // If value is empty string, return 0 for parameter section numeric inputs, undefined for others
      if (value === '') {
        // For numeric input types in parameter sections only, return 0
        if (isInParameterSection && (element.type === 'number' || 
            element.classList.contains('currency') || 
            element.classList.contains('percentage'))) {
          return 0;
        }
        return undefined;
      }
      if (element.classList.contains('currency')) {
        // Try to parse using per-row locale hints (event country/currency) first
        let parsed;
        try {
          // Detect if this input is inside an Events table row and derive locale
          const row = element.closest('tr');
          const inEventsTable = !!(row && row.closest && row.closest('#Events'));
          if (inEventsTable) {
            // Prefer explicit country hint, else infer by currency code
            const countryHint = row && row.querySelector ? (row.querySelector('.event-country')?.value || '') : '';
            const currencyCode = row && row.querySelector ? (row.querySelector('.event-currency')?.value || '') : '';
            let numberLocale = null;
            let currencySymbol = '';
            let currencyCodeEff = '';
            try {
              const cfg = Config.getInstance();
              if (countryHint) {
                const rs = cfg.getCachedTaxRuleSet(countryHint.toLowerCase());
                if (rs) {
                  numberLocale = (rs.getNumberLocale && rs.getNumberLocale()) || null;
                  currencySymbol = (rs.getCurrencySymbol && rs.getCurrencySymbol()) || '';
                  currencyCodeEff = (rs.getCurrencyCode && rs.getCurrencyCode()) || '';
                }
              }
              if (!numberLocale && currencyCode) {
                const countries = (typeof cfg.getAvailableCountries === 'function') ? cfg.getAvailableCountries() : [];
                for (let i = 0; i < countries.length && !numberLocale; i++) {
                  try {
                    const c = countries[i];
                    const rs = cfg.getCachedTaxRuleSet(c.code.toLowerCase());
                    if (rs && typeof rs.getCurrencyCode === 'function' && rs.getCurrencyCode() === currencyCode) {
                      numberLocale = (rs.getNumberLocale && rs.getNumberLocale()) || null;
                      currencySymbol = (rs.getCurrencySymbol && rs.getCurrencySymbol()) || '';
                      currencyCodeEff = rs.getCurrencyCode();
                    }
                  } catch (_) { /* try next */ }
                }
              }
            } catch (_) { /* fall back to global */ }

            if (numberLocale) {
              // Locale-aware parse: strip symbol, normalise group/decimal
              const escSym = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              let s = String(value).replace(new RegExp(escSym, 'g'), '').replace(/\s+/g, '');
              try {
                const parts = new Intl.NumberFormat(numberLocale).formatToParts(12345.6);
                const group = parts.find(p => p.type === 'group')?.value || ',';
                const decimal = parts.find(p => p.type === 'decimal')?.value || '.';
                s = s.split(group).join('');
                if (decimal !== '.') s = s.split(decimal).join('.');
              } catch (_) { /* leave s as-is */ }
              const num = parseFloat(s);
              parsed = isNaN(num) ? undefined : num;
            }
          }
        } catch (_) { /* ignore and fall back */ }

        if (parsed === undefined) {
          // Fall back to global/active-locale parsing
          parsed = FormatUtils.parseCurrency(value);
        }
        // Return 0 for parameter section if parsing fails
        return (parsed === undefined && isInParameterSection) ? 0 : parsed;
      }
      if (element.classList.contains('percentage')) {
        const parsed = FormatUtils.parsePercentage(value);
        // Return 0 for parameter section if parsing fails
        return (parsed === undefined && isInParameterSection) ? 0 : parsed;
      }
      if (element.classList.contains('boolean')) {
        return value === 'Yes';
      }
      if (element.classList.contains('string')) {
        return value; // Return string value as-is
      }
      const parsed = parseFloat(value);
      // Return 0 for parameter section numeric inputs if parsing fails, undefined otherwise
      return isNaN(parsed) ? (isInParameterSection ? 0 : undefined) : parsed;
    } 
    return element.textContent;
  }

  static setValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    if (element.value !== undefined) {
      if (element.classList.contains('currency')) {
        element.value = FormatUtils.formatCurrency(value);
      } else if (element.classList.contains('percentage')) {
        element.value = FormatUtils.formatPercentage(value).replace('%', '');
      } else if (element.classList.contains('boolean')) {
        element.value = FormatUtils.formatBoolean(value);
      } else {
        element.value = value;
      }
    } else {
      element.textContent = value;
    }
    // Dispatch a change event so that listeners can react to programmatic changes
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

} 