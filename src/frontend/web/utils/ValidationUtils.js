/* Validation utility functions */

class ValidationUtils {
  /**
   * Validate a value according to its type.
   *
   * Supported types:
   *   money / currency  – euro amount strings (e.g. "100000", "€100,000", "100K", "-20")
   *   percentage        – percentage strings (e.g. "10", "-20", "10%", "0.5%")
   *   age / year        – positive integer strings (e.g. "35", "2000")
   *   name              – any non-empty string
   *
   * @param {string} type  One of 'money', 'currency', 'percentage', 'age', 'year', 'name'
   * @param {string|number} value  The value to validate
   * @param {boolean} allowEmpty   Whether empty / undefined values are permitted
   * @returns The value if valid, null if invalid, or "" if empty and allowed
   */
  static validateValue(type, value, allowEmpty = false) {
    if (value === undefined || value === null) {
      return allowEmpty ? "" : null;
    }
    const str = value.toString().trim();
    if (str === '') {
      return allowEmpty ? "" : null;
    }

    switch (type) {
      case 'money':
      case 'currency': {
        // First, try locale-aware parsing if available
        try {
          if (typeof FormatUtils !== 'undefined' && typeof FormatUtils.parseCurrency === 'function') {
            const parsedLocale = FormatUtils.parseCurrency(str);
            if (parsedLocale !== undefined) {
              return parsedLocale;
            }
          }
        } catch (_) {
          // Fall back to generic parsing below
        }

        // Preserve an optional leading minus sign (possibly separated by spaces
        // from the currency symbol), then strip formatting characters and symbols.
        let sign = 1;
        let tmp = str;
        const leadingMinusMatch = tmp.match(/^\s*-\s*/);
        if (leadingMinusMatch) {
          sign = -1;
          tmp = tmp.replace(/^\s*-\s*/, '');
        }

        // Start with whitespace stripped
        let s = tmp.replace(/\s+/g, '');

        // Remove ANY currency symbols present (not just the active locale's)
        // Prefer Unicode currency class when available; fall back to a common set.
        try {
          s = s.replace(/[\p{Sc}]/gu, '');
        } catch (_) {
          s = s.replace(/[$€£¥₩₹₽₺₫₦₱₪₴₡₲฿₭₮₸₼₽]/g, '');
        }

        // Detect multiplier suffix (K, M, k, m)
        let multiplier = 1;
        if (/[Kk]$/.test(s)) {
          multiplier = 1000;
          s = s.slice(0,  -1);
        } else if (/[Mm]{2}$/.test(s)) {
          multiplier = 1000000;
          s = s.slice(0, -2);
        } else if (/[Mm]$/.test(s)) {
          multiplier = 1000000;
          s = s.slice(0, -1);
        }

        // Strip any remaining non-numeric tokens except decimal/group separators
        s = s.replace(/[^0-9.,]/g, '');

        // Normalise thousands and decimal separators robustly
        if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
          // Both present: decide decimal by whichever appears last
          if (s.lastIndexOf('.') > s.lastIndexOf(',')) {
            // '.' is decimal; remove all commas (groups)
            s = s.replace(/,/g, '');
          } else {
            // ',' is decimal; remove all dots (groups), then normalise decimal to '.'
            s = s.replace(/\./g, '');
            s = s.replace(',', '.');
          }
        } else if (s.indexOf(',') !== -1) {
          // Only comma present: if looks like grouping (3 digits after), drop commas; else treat as decimal
          if (/,\d{3}(?:,|$)/.test(s)) {
            s = s.replace(/,/g, '');
          } else {
            s = s.replace(',', '.');
          }
        } else if (s.indexOf('.') !== -1) {
          // Only dot present: if looks like grouping, drop group dots
          if (/\.+\d{3}(?:\.|$)/.test(s) || /\d\.\d{3}(?:\.|$)/.test(s)) {
            s = s.replace(/\.(?=\d{3}(?:\.|$))/g, '');
          }
        }

        // Allow optional leading minus sign and exactly one decimal point, no other characters
        // e.g. "-1200", "1000.50", "1.5" (after suffix removed)
        if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;

        const num = parseFloat(s);
        return num * multiplier * sign;
      }
      case 'percentage': {
        let s = str.replace(/%/g, '').replace(/\s+/g, '');
        // Strict numeric pattern: optional leading -, digits, optional decimal
        if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
        const num = parseFloat(s);
        return num / 100; // normalise to decimal representation
      }
      case 'age':
      case 'year': {
        if (/^\d+$/.test(str)) {
          const num = parseInt(str, 10);
          return num;
        }
        return null;
      }
      case 'name':
        return str.length > 0 ? str : null;
      default:
        return null;
    }
  }

  /**
   * Validate age relationship (toAge >= fromAge)
   */
  static validateAgeRelationship(fromAge, toAge) {
    if (!fromAge || !toAge) return { isValid: true };
    
    const from = ValidationUtils.validateValue('age', fromAge);
    const to = ValidationUtils.validateValue('age', toAge);
    
    if (from === null || to === null) {
      return { isValid: false, message: 'Please enter valid ages' };
    }
    
    if (to < from) {
      return { isValid: false, message: 'End age cannot be before start age' };
    }
    
    return { isValid: true };
  }

  /**
   * Validate required field presence
   */
  static validateRequired(value, fieldName) {
    if (!value || value.toString().trim() === '') {
      return { isValid: false, message: `${fieldName} is required` };
    }
    return { isValid: true };
  }

  /**
   * Validate percentage with min/max bounds
   */
  static validatePercentageWithBounds(value, fieldName, min, max, unit = '%', allowExceedMax = false, exceedMaxMessage = null) {
    const parsed = ValidationUtils.validateValue('percentage', value);
    if (parsed === null) {
      return { isValid: false, message: "Please enter a valid number" };
    }

    if (min !== undefined && parsed < min) {
      return { isValid: false, message: `${fieldName} cannot be less than ${min * 100}${unit}` };
    }
    
    if (max !== undefined && parsed > max) {
      if (allowExceedMax && exceedMaxMessage) {
        return { isValid: false, message: exceedMaxMessage, isWarningOnly: true };
      }
      return { isValid: false, message: `${fieldName} cannot be greater than ${max * 100}${unit}` };
    }

    return { isValid: true };
  }
}

// Expose globally for non-module scripts
if (typeof window !== 'undefined') {
  window.ValidationUtils = ValidationUtils;
}

// For environments that support exports (e.g. Jest/node) – this is safe in browser too
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = ValidationUtils;
} 
