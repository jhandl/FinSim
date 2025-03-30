/* DOM manipulation utility functions */

import FormatUtils from './FormatUtils.js'; // Import local utility

export default class DOMUtils {

  static getValue(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`Element not found: ${elementId}`);
        return undefined;
    }
    if (element.value !== undefined) {
      let value = element.value;
      // If value is empty string, return undefined
      if (value === '') {
        return undefined;
      }
      if (element.classList.contains('currency')) {
        return FormatUtils.parseCurrency(value);
      }
      if (element.classList.contains('percentage')) {
        return FormatUtils.parsePercentage(value);
      }
      if (element.classList.contains('boolean')) {
        return value === 'Yes';
      }
      // Try parsing as float, return undefined if NaN, otherwise return the number
      const parsed = parseFloat(value);
      return isNaN(parsed) ? undefined : parsed;
    }
    // Fallback for non-input elements (though less common for getValue)
    return element.textContent;
  }

  static setValue(elementId, value) {
    const element = document.getElementById(elementId);
     if (!element) {
        console.warn(`Element not found: ${elementId}`);
        return;
    }
    const displayValue = (value === null || value === undefined) ? '' : value;

    if (element.value !== undefined) {
      if (displayValue === '') {
          element.value = '';
      } else if (element.classList.contains('currency')) {
        element.value = FormatUtils.formatCurrency(displayValue);
      } else if (element.classList.contains('percentage')) {
        // FormatUtils.formatPercentage returns string with '%', remove it for input value
        element.value = FormatUtils.formatPercentage(displayValue).replace('%', '');
      } else if (element.classList.contains('boolean')) {
        element.value = FormatUtils.formatBoolean(displayValue);
      } else {
        element.value = displayValue; // Set the raw value for other input types
      }
      // Trigger change event manually if needed, as programmatic changes don't fire it
      // element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // For non-input elements, set textContent
      element.textContent = displayValue;
    }
  }

}