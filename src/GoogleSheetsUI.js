class GoogleSheetsUI extends AbstractUI {

  constructor() {
    super();
    this.spreadsheet = null;
    this.namedRanges = new Map();
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
    this.setStatus(message, STATUS_COLORS.NEUTRAL);
  }

  clearContent(groupId) {
    const range = this.namedRanges.get(groupId);
    if (!range) throw new Error(`Group not found: ${groupId}`);
    range.clearContent();
  }

  setWarning(elementId, message) {
    // Parse table cell reference if in format "TableName[row,col]"
    const tableMatch = elementId.match(/^(\w+)\[(\d+),(\d+)\]$/);
    if (tableMatch) {
      const [_, tableName, row, col] = tableMatch;
      this.setTableCellWarning(tableName, parseInt(row), parseInt(col), message);
    } else {    
      const range = this.namedRanges.get(elementId);
      if (!range) throw new Error(`Element not found: ${elementId}`);
      range.setNote(message);
      range.setBackground(STATUS_COLORS.WARNING);
      }
  }

  setTableCellWarning(tableName, row, col, message) {
    const range = this.namedRanges.get(tableName);
    if (!range) throw new Error(`Table not found: ${tableName}`);
    const cell = range.getCell(row, col);
    cell.setNote(message);
    cell.setBackground(STATUS_COLORS.WARNING);
  }
  clearWarning(elementId) {
    const range = this.namedRanges.get(elementId);
    if (!range) throw new Error(`Element not found: ${elementId}`);
    range.clearNote();
    range.setBackground(STATUS_COLORS.WHITE);
  }

  clearAllWarnings() {
    this.clearWarning("Parameters");
  }

  setBackground(elementId, color) {
    const range = this.namedRanges.get(elementId);
    if (!range) throw new Error(`Element not found: ${elementId}`);
    range.setBackground(color);
  }

  flush() {
    SpreadsheetApp.flush();
  }

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

  getVersion() {
    let title = this.spreadsheet.getRange("Main!B2").getCell(1,1).getValue();
    return title.match(/\d+\.\d+/g)[0];
  }

  setVersion(version) {
    this.spreadsheet.getRange("Main!B2").getCell(1,1).setValue("Version " + version);
  }

  fetchUrl(url) {
    return UrlFetchApp.fetch(url).getContentText();
  }

  showAlert(message, buttons = false) {
    if (buttons) {
        var result = SpreadsheetApp.getUi().alert(
            message, 
            SpreadsheetApp.getUi().ButtonSet.YES_NO
        );
        return result === SpreadsheetApp.getUi().Button.YES;
    } else {
        SpreadsheetApp.getUi().alert(message);
        return null;
    }
  }

  showToast(message, title, timeout) {
    SpreadsheetApp.getActive().toast(message, title, timeout);
  }

  setVersionNote(message) {
    let titleCell = this.spreadsheet.getRange("Main!B2").getCell(1,1);
    titleCell.setNote(message);
  }

  clearVersionNote() {
    let titleCell = this.spreadsheet.getRange("Main!B2").getCell(1,1);
    titleCell.clearNote();
  }

  setVersionHighlight(warning) {
    let titleCell = this.spreadsheet.getRange("Main!B2").getCell(1,1);
    titleCell.setBackground(warning ? "#ffe066" : "#c9daf8");
  }

  newCodeVersion(latestVersion) {
    SpreadsheetApp.getUi().alert("*** New spreadsheet version available: "+latestVersion+" ***\n\nhttps://tinyurl.com/financial-simulator");
    let titleCell = this.spreadsheet.getRange("Main!B2").getCell(1,1);
    titleCell.setNote("A new version ("+latestVersion+") of this spreadsheet is available at https://tinyurl.com/financial-simulator");
    titleCell.setBackground("#ffe066");
  }

  newDataVersion(latestVersion) {
    const result = this.showAlert(config.dataUpdateMessage+"\n\nDo you want to update?", true);
    if (result === true) {
      this.setVersion(latestVersion);
      this.showToast("Version updated!", "", 15);
    }
  }

}


function onEdit(e) {
  if (e.range.getA1Notation() == 'F2') {
    e.range.setValue("");
    run()
  }
}
