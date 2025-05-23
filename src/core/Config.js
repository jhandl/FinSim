/* This file has to work on both the website and Google Sheets */

var Config_instance = null;

class Config {

  constructor(ui) {
    this.ui = ui;
    this.thisVersion = this.ui.getVersion();
    this.taxmanConfig = null; // Initialize Taxman config holder
    this.load(this.thisVersion);
    this.loadTaxmanConfig(); // Load Taxman config separately
    this.checkForUpdates();
  }

  // Singleton
  static getInstance(ui) {
    if (!Config_instance) {
      Config_instance = new Config(ui);
    }
    return Config_instance;
  }

  load(version) {
    try {
      // Simple relative path for the configuration file
      const url = "/src/core/config/finance-simulation-config-" + version + ".json";
      const config = JSON.parse(this.ui.fetchUrl(url));
      Object.assign(this, config);
    } catch (err) {
      console.error('Error loading configuration:', err);
      this.ui.showAlert("Can't load configuration file for version " + version);
      throw new Error("Error loading configuration:" + err);
    }
  }

  loadTaxmanConfig() {
    // Load Taxman config (using minimal for now as per Step 1.3)
    // TODO: Make the Taxman config file selection dynamic later (e.g., based on main config or scenario)
    const taxmanConfigFilename = "IE-2026.json"; // Changed for Phase 6.2 comparison
    try {
      const taxmanConfigUrl = `/src/core/config/${taxmanConfigFilename}`;
      console.log(`Loading Taxman config from: ${taxmanConfigUrl}`);
      const taxmanConfigContent = this.ui.fetchUrl(taxmanConfigUrl);
       if (!taxmanConfigContent) throw new Error("Taxman config content is empty or fetch failed.");
      this.taxmanConfig = JSON.parse(taxmanConfigContent);
      console.log("Taxman config loaded successfully:", this.taxmanConfig);

      // Basic validation (Taxman constructor also checks schemaName)
       if (!this.taxmanConfig || typeof this.taxmanConfig !== 'object') {
           throw new Error("Loaded tax config is not a valid object.");
       }
       if (!this.taxmanConfig.schemaName || this.taxmanConfig.schemaName !== 'GenericTaxSystem') {
            console.warn("Taxman Config Warning: Invalid or missing 'schemaName'. Expected 'GenericTaxSystem'.");
            // Decide if this should be a hard error or just a warning
            // throw new Error("Invalid Taxman configuration schemaName.");
       }
        if (!this.taxmanConfig.schemaVersion) {
            console.warn("Taxman Config Warning: Missing 'schemaVersion'.");
        }
        if (!this.taxmanConfig.countryCode) {
            console.warn("Taxman Config Warning: Missing 'countryCode'.");
        }

    } catch (err) {
      console.error(`Error loading Taxman configuration (${taxmanConfigFilename}):`, err);
      this.ui.showAlert(`Can't load Taxman configuration file: ${taxmanConfigFilename}`);
      this.taxmanConfig = null; // Ensure it's null if loading fails
      // Decide if this should be a fatal error for the whole simulation
      // throw new Error(`Error loading Taxman configuration: ${err.message || err}`);
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