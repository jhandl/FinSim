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
        const parsed = FormatUtils.parseCurrency(value);
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