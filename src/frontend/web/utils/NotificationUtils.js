/* Version and notification utility functions */

class NotificationUtils {

  constructor() {
    this.statusElement = document.getElementById('progress');
    this.errorModalUtils = null; // Will be initialized later
  }

  setStatus(message, color=STATUS_COLORS.INFO) {
    // Clear any existing error state
    if (this.errorModalUtils) {
      this.errorModalUtils.clearError();
    }
    
    // Set normal status
    this.statusElement.innerHTML = message;
    this.statusElement.style.backgroundColor = color;
    this.statusElement.classList.remove('error');
  }

  setError(message) {
    // This method is for actual errors that should trigger the modal
    if (this.errorModalUtils) {
      this.errorModalUtils.setError(message);
    } else {
      // Fallback if error modal utils not available
      this.setStatus(message, STATUS_COLORS.ERROR);
    }
  }

  setErrorModalUtils(errorModalUtils) {
    this.errorModalUtils = errorModalUtils;
  }

  setVersionNote(message) {
    const versionSpan = document.querySelector('.version');
    if (versionSpan) {
      versionSpan.title = message;
    }
  }

  clearVersionNote() {
    const versionSpan = document.querySelector('.version');
    if (versionSpan) {
      versionSpan.title = '';
    }
  }

  setVersionHighlight(warning) {
    const versionSpan = document.querySelector('.version');
    if (versionSpan) {
          versionSpan.style.backgroundColor = warning ? STATUS_COLORS.WARNING : 'transparent';
    }
  }

  showAlert(message, buttons = false) {
    if (buttons) {
      return confirm(message); // Returns true for OK/Yes, false for Cancel/No
    } else {
      alert(message);
      return null;
    }
  }

  showToast(message, title, timeout) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = title ? `${title}: ${message}` : message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, timeout * 1000);
  }

  newDataVersion(latestVersion) {
    if (this.showAlert(`New configuration version available (${latestVersion}):\n\n${config.dataUpdateMessage})\n\nDo you want to update?`, true)) {
      this.setVersion(latestVersion);
      this.showToast(`Configuration updated to version ${latestVersion}`, "", 15);
    }
  }

  setWarning(elementId, message) {
    const tableMatch = elementId.match(/^(\w+)\[(\d+),(\d+)\]$/);
    let element = null;
    
    if (tableMatch) {
      const [_, tableName, row, col] = tableMatch;
      const table = document.getElementById(tableName);
      if (!table) throw new Error(`Table not found: ${tableName}`);
      const tbody = table.getElementsByTagName('tbody')[0];
      const rows = tbody.getElementsByTagName('tr');
      const rowIndex = parseInt(row);
      const colIndex = parseInt(col);
      if (rowIndex - 1 >= rows.length) return;
      const cells = rows[rowIndex - 1].getElementsByTagName('td');
      if (colIndex - 1 >= cells.length) return;
      element = cells[colIndex].querySelector('input') || cells[colIndex];
    } else {
      element = document.getElementById(elementId);
      if (!element) throw new Error(`Element not found: ${elementId}`);
    }
    
    element.style.backgroundColor = STATUS_COLORS.WARNING;
    element.setAttribute('data-tooltip', message);
    
    // Remove existing event listeners to prevent duplicates
    this.clearElementWarningListeners(element);
    
    const showTooltip = () => {
      // Remove any existing tooltip first
      const existingTooltip = document.querySelector('.input-tooltip');
      if (existingTooltip) existingTooltip.remove();
      
      const tooltip = document.createElement('div');
      tooltip.className = 'input-tooltip';
      tooltip.textContent = message;
      document.body.appendChild(tooltip);
      
      const elementRect = element.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Calculate horizontal position (centered on element, but constrained to viewport)
      let left = elementRect.left + (elementRect.width / 2) - (tooltipRect.width / 2);
      const margin = 10; // Minimum margin from screen edges
      
      // Ensure tooltip doesn't go off the left edge
      if (left < margin) {
        left = margin;
      }
      // Ensure tooltip doesn't go off the right edge
      else if (left + tooltipRect.width > viewportWidth - margin) {
        left = viewportWidth - tooltipRect.width - margin;
      }
      
      // Calculate vertical position (above element, but below if not enough space)
      let top = elementRect.top - tooltipRect.height - 10;
      
      // If tooltip would go above viewport, show it below the element instead
      if (top < margin) {
        top = elementRect.bottom + 10;
        // If it would also go below viewport when positioned below, center it vertically
        if (top + tooltipRect.height > viewportHeight - margin) {
          top = Math.max(margin, (viewportHeight - tooltipRect.height) / 2);
        }
      }
      
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };
    
    const hideTooltip = () => {
      const tooltip = document.querySelector('.input-tooltip');
      if (tooltip) tooltip.remove();
    };
    
    // Store references for cleanup
    element._tooltipListeners = {
      showTooltip,
      hideTooltip
    };
    
    // Desktop events
    element.addEventListener('mouseenter', showTooltip);
    element.addEventListener('mouseleave', hideTooltip);
    
    // Mobile events (focus/blur work for touch on input fields)
    element.addEventListener('focus', showTooltip);
    element.addEventListener('blur', hideTooltip);
  }

  clearElementWarningListeners(element) {
    // Remove any existing tooltip event listeners
    if (element._tooltipListeners) {
      element.removeEventListener('mouseenter', element._tooltipListeners.showTooltip);
      element.removeEventListener('mouseleave', element._tooltipListeners.hideTooltip);
      element.removeEventListener('focus', element._tooltipListeners.showTooltip);
      element.removeEventListener('blur', element._tooltipListeners.hideTooltip);
      delete element._tooltipListeners;
    }
  }

  clearElementWarning(element) {
    element.style.backgroundColor = STATUS_COLORS.WHITE;
    element.removeAttribute('data-tooltip');
    this.clearElementWarningListeners(element);
  }

  clearAllWarnings() {
    const warningRGB = `rgb(${parseInt(STATUS_COLORS.WARNING.slice(1,3), 16)}, ${parseInt(STATUS_COLORS.WARNING.slice(3,5), 16)}, ${parseInt(STATUS_COLORS.WARNING.slice(5,7), 16)})`;
    const elements = document.querySelectorAll('input[style]');
    const warningElements = Array.from(elements).filter(element => {
      const bgColor = element.style.backgroundColor;
      return bgColor === warningRGB;
    });
    
    warningElements.forEach(element => {
      this.clearElementWarning(element);
    });
  }

} 