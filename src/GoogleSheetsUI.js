class GoogleSheetsUI extends AbstractUI {
  constructor() {
    super();
    this.spreadsheet = null;
    this.namedRanges = new Map();
    this.STATUS_COLORS = {
      ERROR: "#ff8080",
      WARNING: "#ffe066",
      SUCCESS: "#9fdf9f",
      NEUTRAL: "#E0E0E0",
      WHITE: "#FFFFFF"
    };
  }

  initialize() {
    this.spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    this.statusCell = this.spreadsheet.getRangeByName("Progress").getCell(1, 1);
    this.cacheNamedRanges();
  }

  cacheNamedRanges() {
    const ranges = this.spreadsheet.getNamedRanges();
    ranges.forEach(range => {
      this.namedRanges.set(range.getName(), range.getRange());
    });
  }

  getValue(elementId) {
    const range = this.namedRanges.get(elementId);
    if (!range) throw new Error(`Element not found: ${elementId}`);
    return range.getValue();
  }

  setValue(elementId, value) {
    const range = this.namedRanges.get(elementId);
    if (!range) throw new Error(`Element not found: ${elementId}`);
    range.setValue(value);
  }

  getTableData(groupId, columnCount = 1) {
    const elements = [];
    const range = this.namedRanges.get(groupId);
    if (!range) throw new Error(`Group not found: ${groupId}`);
    
    for (let i = 1; i <= range.getHeight(); i++) {
      const row = [];
      for (let j = 1; j <= columnCount; j++) {
        const value = range.getCell(i, j).getValue();
        row.push(value);
      }
      if (row[0] === "") break;
      elements.push(row);
    }
    return elements;
  }

  setStatus(message, color) {
    this.statusCell.setValue(message);
    if (color) {
      this.statusCell.setBackground(color);
    }
    this.flush();
  }

  setProgress(message) {
    this.setStatus(message, this.STATUS_COLORS.NEUTRAL);
  }

  clearContent(groupId) {
    const range = this.namedRanges.get(groupId);
    if (!range) throw new Error(`Group not found: ${groupId}`);
    range.clearContent();
  }

  setWarning(elementId, message) {
    const range = this.namedRanges.get(elementId);
    if (!range) throw new Error(`Element not found: ${elementId}`);
    range.setNote(message);
    range.setBackground(this.STATUS_COLORS.WARNING);
  }

  clearWarning(elementId) {
    const range = this.namedRanges.get(elementId);
    if (!range) throw new Error(`Element not found: ${elementId}`);
    range.clearNote();
    range.setBackground(this.STATUS_COLORS.WHITE);
  }

  setBackground(elementId, color) {
    const range = this.namedRanges.get(elementId);
    if (!range) throw new Error(`Element not found: ${elementId}`);
    range.setBackground(color);
  }

  flush() {
    SpreadsheetApp.flush();
  }

  // Helper method for data rows
  setDataRow(rowIndex, data) {
    Object.entries(data).forEach(([field, value]) => {
      const range = this.namedRanges.get(field);
      if (range) {
        range.getCell(rowIndex, 1).setValue(value);
      } else {
        console.log("Missing range name: "+field);
        throw "Missing range name!"
      }
    });
  }

} 

function onEdit(e) {
  if (e.range.getA1Notation() == 'F2') {
    e.range.setValue("");
    run()
  }
}
