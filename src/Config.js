class Config {
  constructor(ui) {
    this.ui = ui;
    this.thisVersion = this.ui.getVersion();
    this.load(this.thisVersion);
    this.checkForUpdates();
  }

  load(version) {
    try {
      // const url = "https://storage.googleapis.com/financial-simulator-bucket/finance-simulation-config-"+version+".json";
      const url = "https://finsim.ie/config/finance-simulation-config-"+version+".json";
      const config = JSON.parse(this.ui.fetchUrl(url));
      Object.assign(this, config);
    } catch (err) {
      console.error('Error loading configuration:', err);
      this.ui.showAlert("Can't load configuration file for version "+version);
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

  newCodeVersion() {
    this.ui.newCodeVersion(this.latestVersion);
  }

  newDataVersion() {
    this.ui.newDataVersion(this.latestVersion);
  }

  clearVersionAlert() {
    this.ui.clearVersionNote();
    this.ui.setVersionHighlight(false);
  }

}