/* DOM manipulation utility functions */

class DOMUtils {

  static getValue(elementId) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
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
      const parsed = parseFloat(value);
      return isNaN(parsed) ? undefined : parsed;
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
  }

} 