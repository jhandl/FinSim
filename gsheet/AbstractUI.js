class AbstractUI {
  constructor() {
    if (this.constructor === AbstractUI) {
      throw new Error("Abstract class cannot be instantiated");
    }
  }

  initialize() {
    throw new Error("Method 'initialize' must be implemented");
  }

  getValue(elementId) {
    throw new Error("Method 'getValue' must be implemented");
  }

  setValue(elementId, value) {
    throw new Error("Method 'getValue' must be implemented");
  }

  getTableData(groupId, columnCount) {
    throw new Error("Method 'getTableData' must be implemented");
  }

  setStatus(message, color) {
    throw new Error("Method 'setStatus' must be implemented");
  }

  setProgress(percentage) {
    throw new Error("Method 'setProgress' must be implemented");
  }

  clearContent(groupId) {
    throw new Error("Method 'clearContent' must be implemented");
  }

  setWarning(elementId, message) {
    throw new Error("Method 'setWarning' must be implemented");
  }

  clearWarning(elementId) {
    throw new Error("Method 'clearWarning' must be implemented");
  }

  setBackground(elementId, color) {
    throw new Error("Method 'setBackground' must be implemented");
  }

  onEdit(callback) {
    throw new Error("Method 'onEdit' must be implemented");
  }

  flush() {
    throw new Error("Method 'flush' must be implemented");
  }
} 