class AbstractUI {
  
  constructor() {
    if (this.constructor === AbstractUI) {
      throw new Error("Abstract class cannot be instantiated");
    }
  }

  getInstance() {
    throw new Error("Method 'getInstance' must be implemented");
  }

  initialize() {
    throw new Error("Method 'initialize' must be implemented");
  }

  getValue(elementId) {
    throw new Error("Method 'getValue' must be implemented");
  }

  setValue(elementId, value) {
    throw new Error("Method 'setValue' must be implemented");
  }

  getTableData(groupId, columnCount) {
    throw new Error("Method 'getTableData' must be implemented");
  }

  setDataRow(rowIndex, data) {
    throw new Error("Method 'setDataRow' must be implemented");
  }

  setChartsRow(rowIndex, data) {
    throw new Error("Method 'setChartsRow' must be implemented");
  } 

  setStatus(message, color) {
    throw new Error("Method 'setStatus' must be implemented");
  }

  clearContent(groupId) {
    throw new Error("Method 'clearContent' must be implemented");
  }

  setWarning(elementId, message) {
    throw new Error("Method 'setWarning' must be implemented");
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

  getVersion() {
    throw new Error("Method 'getVersion' must be implemented");
  }

  setVersion(version) {
    throw new Error("Method 'setVersion' must be implemented");
  }

  fetchUrl(url) {
    throw new Error("Method 'fetchUrl' must be implemented");
  }

  showAlert(message, buttons) {
    throw new Error("Method 'showAlert' must be implemented");
  }

  showToast(message, title, timeout) {
    throw new Error("Method 'showToast' must be implemented");
  }

  setVersionNote(message) {
    throw new Error("Method 'setVersionNote' must be implemented");
  }

  clearVersionNote() {
    throw new Error("Method 'clearVersionNote' must be implemented");
  }

  setVersionHighlight(warning) {
    throw new Error("Method 'setVersionHighlight' must be implemented");
  }

  newCodeVersion(latestVersion) {
    throw new Error("Method 'newCodeVersion' must be implemented");
  }

  newDataVersion(latestVersion) {
    throw new Error("Method 'newDataVersion' must be implemented");
  }

  clearAllWarnings() {
    throw new Error("Method 'clearAllWarnings' must be implemented");
  }

  isPercentage(elementId) {
    throw new Error("Method 'isPercentage' must be implemented");
  }

  saveToFile() {
    throw new Error("Method 'saveToFile' must be implemented");
  }

  loadFromFile(file) {
    throw new Error("Method 'loadFromFile' must be implemented");
  }

  clearExtraDataRows(maxAge) {
    throw new Error("Method 'clearExtraDataRows' must be implemented");
  }

} 
