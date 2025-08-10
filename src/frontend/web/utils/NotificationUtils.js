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

  setError(error) {
    // Log error and stack trace for debugging
    console.error('NotificationUtils.setError:', error, error.stack || '');
    let message = "Unknown error";
    if (error instanceof String) {
      message = `${error}`;
    } else if (error instanceof Error) {
      message = `${error.message}`;
    } else if (typeof error === 'object' && error !== null && error.stack) {
      message = `${error.message || 'Unknown error'}`;
    }
    if (this.errorModalUtils) {
      this.errorModalUtils.setError("Simulation failed: " + message);
    } else {
      this.setStatus("Error", STATUS_COLORS.ERROR);
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

  async showAlert(message, title = 'Warning', buttons = false) {
    if (!this.errorModalUtils) {
      // Fallback to native alert if modal not available
      if (buttons) {
        return confirm(message);
      } else {
        alert(message);
        return null;
      }
    }
    return this.errorModalUtils.showModal(message, title, buttons);
  }

  showToast(message, title, timeout=10) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    // Render markdown by default for better formatting
    const html = this._renderMarkdown(title, message);
    toast.innerHTML = html;
    // Ensure line breaks are respected for any leftover plain text
    toast.style.whiteSpace = 'normal';
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, timeout * 1000);
  }

  _renderMarkdown(title, message) {
    const escapeHtml = (str) => {
      const div = document.createElement('div');
      div.textContent = String(str == null ? '' : str);
      return div.innerHTML;
    };

    const toHtml = (md) => {
      if (!md) return '';
      // Work on escaped version to avoid XSS, then allow our markdown replacements
      let s = escapeHtml(md);
      // Inline code
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      // Bold and italics (process bold first)
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1<\/strong>');
      s = s.replace(/\*([^*]+)\*/g, '<em>$1<\/em>');
      s = s.replace(/_([^_]+)_/g, '<em>$1<\/em>');
      // Links: [text](url)
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1<\/a>');
      // Lists: lines starting with - or * → <ul><li>..</li></ul>
      const lines = s.split(/\r?\n/);
      const out = [];
      let inList = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isBullet = /^\s*[-*]\s+/.test(line);
        if (isBullet) {
          if (!inList) { out.push('<ul>'); inList = true; }
          out.push('<li>' + line.replace(/^\s*[-*]\s+/, '') + '</li>');
        } else {
          if (inList) { out.push('</ul>'); inList = false; }
          if (line.trim() === '') {
            out.push('<br/>');
          } else {
            // Preserve explicit newlines in plain text by inserting <br/>
            out.push(line + '<br/>');
          }
        }
      }
      if (inList) out.push('</ul>');
      // Avoid inserting raw newlines which some mobile browsers collapse
      return out.join('');
    };

    const titleHtml = title ? `<strong>${toHtml(title)}</strong><br/>` : '';
    const bodyHtml = toHtml(message);
    return titleHtml + bodyHtml;
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
    
    // Check if this is a dropdown element with a wrapper reference
    if (element._dropdownWrapper) {
      // Apply warning class to the wrapper instead of changing background color
      element._dropdownWrapper.classList.add('warning');
      element._dropdownWrapper.setAttribute('data-tooltip', message);
      this.clearElementWarningListeners(element._dropdownWrapper);
      
      // Set up tooltip event listeners on the wrapper
      this.setupElementWarningListeners(element._dropdownWrapper);
    } else {
      // Apply warning directly to the element (for non-dropdown elements)
      element.style.backgroundColor = STATUS_COLORS.WARNING;
      element.setAttribute('data-tooltip', message);
      
      // Remove existing event listeners to prevent duplicates
      this.clearElementWarningListeners(element);
      
      // Set up tooltip event listeners
      this.setupElementWarningListeners(element);
    }
  }

  setupElementWarningListeners(element) {
    const message = element.getAttribute('data-tooltip');
    
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
    // Check if this is a dropdown element with a wrapper reference
    if (element._dropdownWrapper) {
      element._dropdownWrapper.classList.remove('warning');
      element._dropdownWrapper.removeAttribute('data-tooltip');
      this.clearElementWarningListeners(element._dropdownWrapper);
    } else {
      element.style.backgroundColor = STATUS_COLORS.WHITE;
      element.removeAttribute('data-tooltip');
      this.clearElementWarningListeners(element);
    }
  }

  clearAllWarnings() {
    const warningRGB = `rgb(${parseInt(STATUS_COLORS.WARNING.slice(1,3), 16)}, ${parseInt(STATUS_COLORS.WARNING.slice(3,5), 16)}, ${parseInt(STATUS_COLORS.WARNING.slice(5,7), 16)})`;
    
    // Find all input elements with warning background color
    const elements = document.querySelectorAll('input[style], h2[style]');
    const warningElements = Array.from(elements).filter(element => {
      const bgColor = element.style.backgroundColor;
      return bgColor === warningRGB;
    });
    
    // Find all elements with _dropdownWrapper that have warning class
    const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
    hiddenInputs.forEach(input => {
      if (input._dropdownWrapper && input._dropdownWrapper.classList.contains('warning')) {
        warningElements.push(input);
      }
    });
    
    // Check for EventsTitle specifically
    const eventsTitle = document.getElementById('EventsTitle');
    if (eventsTitle && eventsTitle.style.backgroundColor === warningRGB) {
      warningElements.push(eventsTitle);
    }
    
    warningElements.forEach(element => {
      this.clearElementWarning(element);
    });
  }

} 