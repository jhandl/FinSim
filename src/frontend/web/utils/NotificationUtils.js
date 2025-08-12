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
    const html = this._renderMarkdown(title, message);
    toast.innerHTML = html;
    // Ensure line breaks are respected for any leftover plain text
    toast.style.whiteSpace = 'normal';
    // Make the toast itself interactive; we'll absorb outside via overlay
    try { toast.style.pointerEvents = 'auto'; } catch (_) {}
    document.body.appendChild(toast);

    // Full-viewport transparent overlay to catch and absorb outside clicks/taps
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:transparent;z-index:10019;';
    document.body.appendChild(overlay);

    // Setup outside-click/tap dismissal
    let timeoutId;
    const cleanup = () => {
      try { if (timeoutId) clearTimeout(timeoutId); } catch (_) {}
      try {
        document.removeEventListener('pointerdown', onDocPointerDown, true);
        document.removeEventListener('mousedown', onDocPointerDown, true);
        document.removeEventListener('touchstart', onDocPointerDown, true);
        document.removeEventListener('click', onDocPointerDown, true);
      } catch (_) {}
      try { overlay.remove(); } catch (_) {}
      try { toast.remove(); } catch (_) {}
    };

    // Keep toast non-interactive (CSS pointer-events: none) to avoid blocking UI.
    // Detect outside clicks using pointer coordinates vs toast bounding box.
    const onDocPointerDown = (ev) => {
      try {
        const rect = toast.getBoundingClientRect();
        const x = ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] ? ev.touches[0].clientX : -1);
        const y = ev.clientY != null ? ev.clientY : (ev.touches && ev.touches[0] ? ev.touches[0].clientY : -1);
        const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        if (!inside) { ev.stopImmediatePropagation && ev.stopImmediatePropagation(); ev.stopPropagation(); ev.preventDefault(); ev.cancelBubble = true; cleanup(); }
      } catch (_) {
        cleanup();
      }
    };

    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('mousedown', onDocPointerDown, true);
    document.addEventListener('touchstart', onDocPointerDown, { capture: true, passive: false });
    document.addEventListener('click', onDocPointerDown, true);

    // Overlay absorbs interactions and closes the toast
    const onOverlayDown = (ev) => { try { ev.stopImmediatePropagation && ev.stopImmediatePropagation(); ev.stopPropagation(); ev.preventDefault(); ev.cancelBubble = true; } catch (_) {} cleanup(); };
    overlay.addEventListener('pointerdown', onOverlayDown, { capture: true });
    overlay.addEventListener('mousedown', onOverlayDown, { capture: true });
    overlay.addEventListener('touchstart', onOverlayDown, { capture: true, passive: false });
    overlay.addEventListener('click', onOverlayDown, { capture: true });

    // Auto close after timeout
    timeoutId = setTimeout(cleanup, timeout * 1000);
  }

  _renderMarkdown(title, message) {
    const safeTitle = title == null ? '' : String(title);
    const safeMessage = message == null ? '' : String(message);
    const combinedMarkdown = (safeTitle ? `**${safeTitle}**\n\n` : '') + safeMessage;
    return marked.parse(combinedMarkdown);
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