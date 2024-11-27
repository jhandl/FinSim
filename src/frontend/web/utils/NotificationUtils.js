/* Version and notification utility functions */

class NotificationUtils {

  constructor() {
    this.statusElement = document.getElementById('progress');
  }

  setStatus(message, color=STATUS_COLORS.INFO) {
    this.statusElement.innerHTML = message;
    this.statusElement.style.backgroundColor = color;
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
    
    element.addEventListener('mouseenter', function() {
      const tooltip = document.createElement('div');
      tooltip.className = 'input-tooltip';
      tooltip.textContent = message;
      element.parentNode.appendChild(tooltip);
      const rect = element.getBoundingClientRect();
      tooltip.style.left = `${rect.left}px`;
      tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;
    });
    
    element.addEventListener('mouseleave', function() {
      const tooltip = document.querySelector('.input-tooltip');
      if (tooltip) tooltip.remove();
    });
  }

  clearElementWarning(element) {
    element.style.backgroundColor = STATUS_COLORS.WHITE;
    element.removeAttribute('data-tooltip');
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