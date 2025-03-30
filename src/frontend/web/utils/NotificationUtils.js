/* Version and notification utility functions */

// Assume STATUS_COLORS is loaded globally
export default class NotificationUtils {

  constructor() {
    this.statusElement = document.getElementById('progress');
  }

  setStatus(message, color=STATUS_COLORS.INFO) {
    if (this.statusElement) {
        this.statusElement.innerHTML = message;
        this.statusElement.style.backgroundColor = color;
    } else {
        console.warn("Status element 'progress' not found.");
    }
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
      this.webUI.setVersion(latestVersion);
      this.showToast(`Configuration updated to version ${latestVersion}`, "", 15);
    }
  }

  setWarning(elementId, message) {
    const tableMatch = elementId.match(/^(\w+)\[(\d+),(\d+)\]$/);
    let element = null;

    if (tableMatch) {
      const [_, tableName, row, col] = tableMatch;
      const table = document.getElementById(tableName);
      if (!table) {
          console.error(`Table not found: ${tableName}`);
          return; // Exit if table not found
      }
      const tbody = table.getElementsByTagName('tbody')[0];
      if (!tbody) return; // Exit if tbody not found
      const rows = tbody.getElementsByTagName('tr');
      const rowIndex = parseInt(row);
      const colIndex = parseInt(col);
      if (rowIndex - 1 >= rows.length) return;
      const cells = rows[rowIndex - 1].getElementsByTagName('td');
      if (colIndex - 1 >= cells.length) return;
      element = cells[colIndex].querySelector('input') || cells[colIndex];
    } else {
      element = document.getElementById(elementId);
      if (!element) {
          console.error(`Element not found: ${elementId}`);
          return; // Exit if element not found
      }
    }

    if (!element) return; // Exit if element is still null

    element.style.backgroundColor = STATUS_COLORS.WARNING;
    element.setAttribute('data-tooltip', message);

    // Remove existing listeners before adding new ones to prevent duplicates
    element.removeEventListener('mouseenter', this._handleMouseEnter);
    element.removeEventListener('mouseleave', this._handleMouseLeave);

    // Store message for handlers
    element._tooltipMessage = message;

    element.addEventListener('mouseenter', this._handleMouseEnter);
    element.addEventListener('mouseleave', this._handleMouseLeave);
  }

  // Separate handler functions to allow removal
  _handleMouseEnter(event) {
      const element = event.target;
      const message = element._tooltipMessage;
      if (!message) return;

      const tooltip = document.createElement('div');
      tooltip.className = 'input-tooltip';
      tooltip.textContent = message;
      // Append to body to avoid positioning issues within tables/containers
      document.body.appendChild(tooltip);
      element._tooltipElement = tooltip; // Store reference

      const rect = element.getBoundingClientRect();
      // Position relative to viewport
      tooltip.style.left = `${rect.left + window.scrollX}px`;
      tooltip.style.top = `${rect.top + window.scrollY - tooltip.offsetHeight - 5}px`;
  }

  _handleMouseLeave(event) {
      const element = event.target;
      if (element._tooltipElement) {
          element._tooltipElement.remove();
          element._tooltipElement = null;
      }
  }


  clearElementWarning(element) {
    if (element) {
        element.style.backgroundColor = ''; // Revert to default/CSS background
        element.removeAttribute('data-tooltip');
        element.removeEventListener('mouseenter', this._handleMouseEnter);
        element.removeEventListener('mouseleave', this._handleMouseLeave);
        delete element._tooltipMessage;
        if (element._tooltipElement) {
            element._tooltipElement.remove();
            delete element._tooltipElement;
        }
    }
  }

  clearAllWarnings() {
    // Select elements based on the tooltip attribute which is more reliable
    const warningElements = document.querySelectorAll('[data-tooltip]');

    warningElements.forEach(element => {
      this.clearElementWarning(element);
    });
  }

}