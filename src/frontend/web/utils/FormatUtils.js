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
    return `${displayValue}%`;
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
    return parseFloat(value);
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
          const typeSelect = document.querySelector(`#EventType_${rowId}`);
          const eventType = typeSelect ? typeSelect.value.split(':')[0] : '';
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
            this.value = value;
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

} 