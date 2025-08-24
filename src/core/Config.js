/* This file has to work on both the website and Google Apps Script */

var Config_instance = null;

class Config {

  constructor(ui) {
    this.ui = ui;
    this.thisVersion = this.ui.getVersion();
    this._taxRuleSets = {}; // cache by country code (lowercase)
    // defaultCountry will be loaded from config JSON (finsim-<version>.json).
  }

  // Singleton
  static getInstance() {
    if (!Config_instance) {
      throw new Error("Config has not been initialized. Call Config.initialize() first.");
    }
    return Config_instance;
  }

  static async initialize(ui) {
    if (!Config_instance) {
      Config_instance = new Config(ui);
      try {
        // Load the newest available config by following the latestVersion chain.
        // This guarantees we don't keep or use obsolete fields from older files in this session.
        const visited = {};
        let startingVersion = String(Config_instance.thisVersion);
        let currentVersion = startingVersion;
        let previousVersionLoaded = null;
        const aggregatedMessages = [];
        while (true) {
          if (visited[currentVersion]) {
            break;
          }
          visited[currentVersion] = true;

          await Config_instance.load(currentVersion);

          // Collect code update message for this loaded version if it's an update step
          if (previousVersionLoaded !== null) {
            var codeMsg = (typeof Config_instance.codeUpdateMessage === 'string') ? Config_instance.codeUpdateMessage.trim() : '';
            if (codeMsg && codeMsg.length > 0) {
              aggregatedMessages.push(codeMsg);
            }
          }
          previousVersionLoaded = currentVersion;

          const hasLatest = (Config_instance.latestVersion !== undefined && Config_instance.latestVersion !== null);
          const latest = hasLatest ? String(Config_instance.latestVersion) : null;

          // Warn if latestVersion is missing to aid versioning diagnostics (used by tests as well)
          if (!hasLatest) {
            try { console.error('Config update check: latestVersion missing in loaded config for version ' + currentVersion); } catch (_) {}
          }

          // If no latest or already at latest, stop
          if (!latest || latest === currentVersion) {
            break;
          }

          // Found a newer version – discard the just loaded one and fetch the newer
          currentVersion = latest;
          // Also update thisVersion so subsequent comparisons/logs reflect the new target
          Config_instance.thisVersion = currentVersion;
        }

        // Persist the final version if it differs from what was stored
        if (startingVersion !== currentVersion) {
          Config_instance.ui.setVersion(currentVersion);
          if (aggregatedMessages.length > 0) {
            var combined = '\n• ' + aggregatedMessages.join('\n• ');
            Config_instance.ui.showToast(combined, 'New Features!', 10);
          }
        } else {
          Config_instance.clearVersionAlert();
        }

        // Preload default country's tax ruleset so core engine has it synchronously
        await Config_instance.getTaxRuleSet(Config_instance.getDefaultCountry());
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
      const url = "/src/core/config/finsim-" + version + ".json";
      const jsonString = await this.ui.fetchUrl(url);
      const config = JSON.parse(jsonString);
      Object.assign(this, config);
    } catch (err) {
      console.error('Error loading configuration:', err);
      this.ui.showAlert("Can't load configuration file for version " + version);
      throw new Error("Error loading configuration:" + err);
    }
  }

  /**
   * Return the default country code configured in the loaded app config.
   * Falls back to 'ie' for backward compatibility if not set yet.
   */
  getDefaultCountry() {
    return (this && typeof this.defaultCountry === 'string' && this.defaultCountry.trim().length > 0)
      ? this.defaultCountry.trim().toLowerCase()
      : 'ie';
  }

  /**
   * Return the application name configured in the loaded app config.
   * Falls back to 'Financial Simulator' if not set.
   */
  getApplicationName() {
    return this.applicationName || 'Financial Simulator';
  }

  /**
   * Lazily load and cache a TaxRuleSet for a given country code (e.g., 'ie').
   * Returns the loaded TaxRuleSet instance, or null if loading fails.
   * NOTE: Keep async to avoid blocking UI; callers that need sync access should
   *       use getCachedTaxRuleSet() after preloading.
   */
  async getTaxRuleSet(countryCode) {
    try {
      const code = (countryCode || this.getDefaultCountry()).toLowerCase();
      if (this._taxRuleSets[code]) {
        return this._taxRuleSets[code];
      }
      const url = "/src/core/config/tax-rules-" + code + ".json";
      const jsonString = await this.ui.fetchUrl(url);
      const rawRules = JSON.parse(jsonString);
      // TaxRuleSet is defined globally by src/core/TaxRuleSet.js
      const ruleset = new TaxRuleSet(rawRules);
      this._taxRuleSets[code] = ruleset;

      // Persist and notify about tax rules updates per country (non-blocking)
      var storageKey = 'taxRules:' + code;
      var storedVersion = localStorage.getItem(storageKey);
      var currentVersion = String(ruleset.raw.version);
      if (!storedVersion || storedVersion !== currentVersion) {
        var raw = ruleset.raw || {};
        var message = (typeof raw.updateMessage === 'string') ? raw.updateMessage.trim() : '';
        var country = (typeof raw.countryName === 'string') ? raw.countryName.trim() : code.toUpperCase();
        if (message.length > 0) {
          this.ui.showToast('\n' + message, 'Tax rules updated for ' + country + ':', 10);
        }
        localStorage.setItem(storageKey, currentVersion)
      }
      return ruleset;
    } catch (err) {
      console.error('Error loading tax ruleset:', err);
      return null;
    }
  }

  /**
   * Return a cached TaxRuleSet if available, otherwise null. Does not trigger loading.
   */
  getCachedTaxRuleSet(countryCode) {
    const code = (countryCode || this.getDefaultCountry()).toLowerCase();
    return this._taxRuleSets ? this._taxRuleSets[code] || null : null;
  }

  newCodeVersion() {
    try {
      var msg = (typeof this.codeUpdateMessage === 'string' && this.codeUpdateMessage.trim().length > 0)
        ? (this.codeUpdateMessage.trim() + ' (v' + this.latestVersion + ')')
        : null;
      if (msg && this.ui && typeof this.ui.showToast === 'function') {
        this.ui.showToast(msg, 'App Updated', 10);
      }
    } catch (_) {}
  }

  clearVersionAlert() {
    this.ui.clearVersionNote();
    this.ui.setVersionHighlight(false);
  }

}

// Make Config available in the context (e.g., for tests)
this.Config = Config;
