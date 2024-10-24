class Config {
  
    constructor() {
      this.sheet = SpreadsheetApp.getActiveSpreadsheet();
      this.thisVersion = this.getVersionFromSheet();
      this.load(this.thisVersion);
      this.checkForUpdates()
    }
  
    load(version) {
      try {
        const url = "https://storage.googleapis.com/financial-simulator-bucket/finance-simulation-config-"+version+".json";
        const config = JSON.parse(UrlFetchApp.fetch(url).getContentText());
        Object.assign(this, config); // Assign all properties from config to 'this'
      } catch (err) {
        console.error('Error loading configuration:', err);
        SpreadsheetApp.getUi().alert("Can't load configuration file for version "+version);
        throw new Error("Error loading configuration:"+err);
      }
    }
  
    checkForUpdates() {
      let latest = this.latestVersion.toString().split('.').map(Number);
      let current = this.thisVersion.toString().split('.').map(Number);
      if (latest[0] !== current[0]) {
        this.newCodeVersion();
      } else if (latest[1] !== current[1]) {
        this.newDataVersion();
      } else {
        this.clearVersionAlert();
      }
    }
  
    getVersionFromSheet() {
      let title = this.sheet.getRange("Main!B2").getCell(1,1).getValue();
      return title.match(/\d+\.\d+/g)[0];
    }
  
    saveVersionToSheet(version) {
      this.sheet.getRange("Main!B2").getCell(1,1).setValue("Version "+version);
    }
  
    newCodeVersion() {
      // Code update: Tell the user. They'll need to create a new copy from the source.
      SpreadsheetApp.getUi().alert("*** New spreadsheet version available: "+this.latestVersion+" ***\n\nhttps://tinyurl.com/financial-simulator");
      let titleCell = this.sheet.getRange("Main!B2").getCell(1,1);
      titleCell.setNote("A new version ("+this.latestVersion+") of this spreadsheet is available at https://tinyurl.com/financial-simulator");
      titleCell.setBackground("#ffe066");
    }
  
    newDataVersion() {
      // Configuration update: Ask the user. If they agree, reload and update spreadsheet version.
      var result = SpreadsheetApp.getUi().alert(this.dataUpdateMessage+"\n\nDo you want to update?", SpreadsheetApp.getUi().ButtonSet.YES_NO);
      if (result === SpreadsheetApp.getUi().Button.YES) {
        // this.load(this.latestVersion);
        this.saveVersionToSheet(this.latestVersion);
        SpreadsheetApp.getActive().toast("", "Version updated!", 15);
      }
    }
  
    clearVersionAlert(sheet) {
      let titleCell = this.sheet.getRange("Main!B2").getCell(1,1);
      titleCell.clearNote()
      titleCell.setBackground("#c9daf8");
    }
  
  }