/* This file has to work only on Google Sheets */

var GoogleSheetsUI_instance = null;

class GoogleSheetsUI extends AbstractUI {

  constructor() {
    super();
    this.spreadsheet = null;
    this.namedRanges = new Map();
    this.spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    this.statusCell = this.spreadsheet.getRangeByName("Progress").getCell(1, 1);
    this.cacheNamedRanges();
  }

  // Singleton
  static getInstance() {
    if (!GoogleSheetsUI_instance) {
      GoogleSheetsUI_instance = new GoogleSheetsUI();
    }
    return GoogleSheetsUI_instance;
  }

  cacheNamedRanges() {
    const ranges = this.spreadsheet.getNamedRanges();
    ranges.forEach(range => {
      this.namedRanges.set(range.getName(), range.getRange());
    });
  }

  getValue(elementId) {
    const value = this.spreadsheet.getRange(elementId).getValue();
    if (this.isBoolean(elementId)) {
      if (typeof value === 'string') {
        return value.toLowerCase() === 'yes';
      }
      return !!value; // Convert any other value to boolean
    }
    if (this.isPercentage(elementId)) {
      return Number(value.toFixed(4));
    }
    return value;
  }

  setValue(elementId, value) {
    if (this.isBoolean(elementId)) {
      // Convert various boolean formats to Yes/No
      if (typeof value === 'string') {
        value = value.toLowerCase();
        value = (value === 'true' || value === 'yes') ? 'Yes' : 'No';
      } else {
        value = value ? 'Yes' : 'No';
      }
    }
    this.spreadsheet.getRange(elementId).setValue(value);
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

  setStatus(message, color=STATUS_COLORS.INFO) {
    this.statusCell.setValue(message);
    if (color) {
      this.statusCell.setBackground(color);
    }
    this.flush();
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

  clearWarningById(elementId) {
    const range = this.namedRanges.get(elementId);
    if (!range) throw new Error(`Element not found: ${elementId}`);
    range.clearNote();
    range.setBackground(STATUS_COLORS.WHITE);
  }

  clearAllWarnings() {
    this.clearWarningById("Parameters");
    this.clearWarningById("Events");
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

  setChartsRow(rowIndex, data) {}

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

  saveToFile() {
    const csvContent = serializeSimulation(this); // 10306 ms
    this.setStatus("Saving", STATUS_COLORS.INFO);

    // Create an HTML dialog with filename input and download button
    const htmlOutput = HtmlService
        .createHtmlOutput(`
            <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        .form-group { margin-bottom: 15px; }
                        label { display: block; margin-bottom: 5px; }
                        input { width: 100%; padding: 5px; margin-bottom: 10px; }
                        button { 
                            background-color: #4CAF50; 
                            color: white; 
                            padding: 8px 15px; 
                            border: none; 
                            border-radius: 4px; 
                            cursor: pointer; 
                        }
                        button:hover { background-color: #45a049; }
                    </style>
                </head>
                <body>
                    <div class="form-group">
                        <label for="filename">Save as:</label>
                        <input type="text" 
                               id="filename" 
                               value="simulation.csv" 
                               onkeyup="validateFilename(this)">
                    </div>
                    <button onclick="downloadFile()">Download</button>
                    
                    <script>
                        function validateFilename(input) {
                            // Remove invalid filename characters
                            input.value = input.value.replace(/[<>:"/\\|?*]/g, '');
                            // Ensure it ends with .csv
                            if (!input.value.toLowerCase().endsWith('.csv')) {
                                input.value = input.value.replace(/\\.csv$/i, '') + '.csv';
                            }
                        }
                        
                        function downloadFile() {
                            const csvContent = ${JSON.stringify(csvContent)};
                            const filename = document.getElementById('filename').value;
                            const blob = new Blob([csvContent], { type: 'text/csv' });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            window.URL.revokeObjectURL(url);
                            google.script.host.close();
                        }
                    </script>
                </body>
            </html>
        `)
        .setWidth(300)
        .setHeight(200);
    
    SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Save Simulation');
  }

  loadFromFile() {
  }

  isPercentage(elementId) {
    try {
      const range = this.spreadsheet.getRange(elementId);
      // Check if the cell's number format contains a % symbol
      const numberFormat = range.getNumberFormat();
      return (numberFormat && numberFormat.includes('%'))
    } catch (error) {
      return false;
    }
  }

  isBoolean(elementId) {
    try {
        const range = this.spreadsheet.getRange(elementId);
        const validation = range.getDataValidation();
        if (!validation) return false;
        const criteria = validation.getCriteriaType();
        const values = validation.getCriteriaValues();
        // Check if it's a list validation with exactly two values: Yes and No
        return (criteria === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) &&
               (values.length === 1) &&
               (Array.isArray(values[0])) &&
               (values[0].length === 2) &&
               (values[0].every(v => ['Yes', 'No'].includes(v)));
    } catch (error) {
        return false;
    }
  }

  clearExtraDataRows(maxAge) {
    const dataRange = this.namedRanges.get("Data");
    if (!dataRange) throw new Error("Data range not found");

    const dataHeight = dataRange.getHeight();
    for (let i = maxAge + 1; i <= dataHeight; i++) {
      const row = dataRange.getCell(i, 1).getEntireRow();
      row.clearContent();
    }
  }

}


function onEdit(e) {
  if (e.range.getA1Notation() == 'F2') {
    e.range.setValue("");
    run()
  }
}
