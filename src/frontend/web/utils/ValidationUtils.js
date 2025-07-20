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
        let s = str.replace(/[,\s]/g, '');
        s = s.replace(/^[€\$]/, '');
        let multiplier = 1;
        if (/[Kk]$/.test(s)) {
          multiplier = 1000;
          s = s.slice(0, -1);
        } else if (/[Mm]{1,2}$/.test(s)) {
          multiplier = 1000000;
          s = s.replace(/[Mm]/, '');
        }
        const num = parseFloat(s);
        if (isNaN(num)) return null;
        return num * multiplier;
      }
      case 'percentage': {
        let s = str.replace(/%/g, '');
        s = s.replace(/\s+/g, '');
        const num = parseFloat(s);
        if (isNaN(num)) return null;
        return num / 100; // always return decimal representation
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