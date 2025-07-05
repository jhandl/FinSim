/* This file has to work on both the website and Google Apps Script */

var Config_instance = null;

class Config {

  constructor(ui) {
    this.ui = ui;
    this.thisVersion = this.ui.getVersion();
    // Do NOT call this.load(this.thisVersion) here.
    // Do NOT call this.checkForUpdates() here yet, as it depends on loaded config data.
  }

  // Singleton
  static getInstance() {
    if (!Config_instance) {
      // This indicates that initialize was not called or failed.
      // Depending on strictness, could throw an error or return null.
      // Throwing is safer to catch incorrect usage early.
      throw new Error("Config has not been initialized. Call Config.initialize() first.");
    }
    return Config_instance;
  }

  static async initialize(ui) {
    if (!Config_instance) {
      Config_instance = new Config(ui); // Constructor is now simpler
      try {
        await Config_instance.load(Config_instance.thisVersion); // Load data
        Config_instance.checkForUpdates(); // Now check for updates
      } catch (error) {
        // Error is already handled and alerted by load()
        // We might want to prevent the app from fully starting if config fails.
        // For now, load() throws, so this will propagate.
        console.error("Failed to initialize Config:", error);
        Config_instance = null; // Ensure getInstance doesn't return a partial instance
        throw error; // Re-throw to signal catastrophic failure
      }
    }
    return Config_instance;
  }

  async load(version) {
    try {
      // Simple relative path for the configuration file
      const url = "/src/core/config/finance-simulation-config-" + version + ".json";
      const jsonString = await this.ui.fetchUrl(url);
      const config = JSON.parse(jsonString);
      Object.assign(this, config);
    } catch (err) {
      console.error('Error loading configuration:', err);
      this.ui.showAlert("Can't load configuration file for version " + version);
      throw new Error("Error loading configuration:" + err);
    }
  }

  checkForUpdates() {
    // Check if latestVersion field exists in the loaded config
    if (!this.latestVersion) {
      console.error('Warning: latestVersion field missing from config file. Skipping update check.');
      this.clearVersionAlert(); // Clear any existing version alerts
      return;
    }

    let latest = this.latestVersion.toString().split('.').map(Number);
    let current = this.thisVersion.toString().split('.').map(Number);
    if (latest.length > 0 && current.length > 0 && latest[0] !== current[0]) {
      this.newCodeVersion();
    } else if (latest.length > 1 && current.length > 1 && latest[1] !== current[1]) {
      this.newDataVersion();
    } else {
      this.clearVersionAlert();
    }
  }

  newCodeVersion() {
    this.ui.newCodeVersion(this.latestVersion);
  }

  newDataVersion() {
    this.ui.newDataVersion(this.latestVersion, this.dataUpdateMessage);
  }

  clearVersionAlert() {
    this.ui.clearVersionNote();
    this.ui.setVersionHighlight(false);
  }

}

// Make Config available in the context (e.g., for tests)
this.Config = Config;