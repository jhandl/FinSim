/* This file has to work on both the website and Google Apps Script */

var EconomicDataClass = (typeof EconomicData !== 'undefined') ? EconomicData : null;
if (!EconomicDataClass) {
  try {
    if (typeof require === 'function') {
      EconomicDataClass = require('./EconomicData.js').EconomicData;
    }
  } catch (_) { }
}

function ensureEconomicDataClass() {
  if (!EconomicDataClass && typeof EconomicData !== 'undefined') {
    EconomicDataClass = EconomicData;
  }
}

var Config_instance = null;

class Config {

  constructor(ui) {
    this.ui = ui;
    this.thisVersion = this.ui.getVersion();
    this._taxRuleSets = {}; // cache by country code (lowercase)
    this._globalTaxRules = null; // cache for global tax rules
    this._economicData = null;
    this._simulationStartYear = null;
    this._countryCodeToName = null; // lazy-built map for O(1) name lookup
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
            try { console.error('Config update check: latestVersion missing in loaded config for version ' + currentVersion); } catch (_) { }
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
          // Only show the aggregated "New Features" toast if the client had
          // previously stored a version in localStorage. New or private sessions
          // (no stored version) should not receive this one-time toast.
          try {
            const hasStored = !!(Config_instance.ui && Config_instance.ui._hasStoredVersion);
            if (hasStored && aggregatedMessages.length > 0) {
              var combined = '\n• ' + aggregatedMessages.join('\n• ');
              Config_instance.ui.showToast(combined, 'New Features!', 10);
            }
          } catch (_) {
            // If anything goes wrong, fall back to previous behaviour and show the toast
            if (aggregatedMessages.length > 0) {
              var combined = '\n• ' + aggregatedMessages.join('\n• ');
              Config_instance.ui.showToast(combined, 'New Features!', 10);
            }
          }
        } else {
          Config_instance.clearVersionAlert();
        }

        // Load global tax rules
        await Config_instance.loadGlobalTaxRules();

        Config_instance._simulationStartYear = new Date().getFullYear();
        // Preload default country's tax ruleset so core engine has it synchronously
        await Config_instance.getTaxRuleSet(Config_instance.getDefaultCountry());
        ensureEconomicDataClass();
        if (EconomicDataClass) {
          Config_instance._economicData = new EconomicDataClass();
          Config_instance._economicData.refreshFromConfig(Config_instance);
        } else {
          Config_instance._economicData = null;
        }
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
      // Invalidate derived maps so they rebuild against the loaded config
      this._countryCodeToName = null;
    } catch (err) {
      console.error('Error loading configuration:', err);
      this.ui.showAlert("Can't load configuration file for version " + version);
      throw new Error("Error loading configuration:" + err);
    }
  }

  async loadGlobalTaxRules() {
    try {
      const url = "/src/core/config/tax-rules-global.json";
      const jsonString = await this.ui.fetchUrl(url);
      this._globalTaxRules = JSON.parse(jsonString);
    } catch (err) {
      console.error('Error loading global tax rules:', err);
      this.ui.showAlert("Can't load global tax rules configuration file");
      throw new Error("Error loading global tax rules:" + err);
    }
  }

  /**
   * Return the cached global tax rules object.
   * Must be called after Config.initialize() has completed.
   * @returns {Object} The global tax rules object
   */
  getGlobalTaxRules() {
    if (!this._globalTaxRules) {
      throw new Error("Global tax rules not loaded. Ensure Config.initialize() completed successfully.");
    }
    return this._globalTaxRules;
  }

  /**
   * Return the array of investment base types from global tax rules.
   * @returns {Array} Array of investment base type definitions
   */
  getInvestmentBaseTypes() {
    const globalRules = this.getGlobalTaxRules();
    return Array.isArray(globalRules.investmentBaseTypes) ? globalRules.investmentBaseTypes : [];
  }

  /**
   * Look up an investment base type by its baseKey.
   * @param {string} baseKey - The unique identifier for the base type
   * @returns {Object|null} The investment base type object, or null if not found
   */
  getInvestmentBaseTypeByKey(baseKey) {
    if (!baseKey) return null;
    const types = this.getInvestmentBaseTypes();
    for (var i = 0; i < types.length; i++) {
      if (types[i] && types[i].baseKey === baseKey) {
        return types[i];
      }
    }
    return null;
  }

  /**
   * Get the withholding tax rate for a specific tax type and asset country.
   * @param {string} taxType - The type of tax (e.g., 'dividend', 'interest', 'capitalGains')
   * @param {string} assetCountry - The country code where the asset is domiciled (e.g., 'us')
   * @returns {number} The withholding tax rate (0-1), or 0 if not defined
   */
  getAssetTax(taxType, assetCountry) {
    if (!taxType || !assetCountry) return 0;
    const globalRules = this.getGlobalTaxRules();
    const assetTaxes = globalRules.assetTaxes || {};
    const typeRates = assetTaxes[taxType] || {};
    const rate = typeRates[assetCountry.toLowerCase()];
    return (typeof rate === 'number') ? rate : 0;
  }

  /**
   * Return the default country code configured in the loaded app config.
   */
  getDefaultCountry() {
    return this.defaultCountry.trim().toLowerCase();
  }

  /**
   * Get the start country from UI, falling back to defaultCountry.
   * Always returns a valid lowercase country code.
   */
  getStartCountry() {
    if (Config.getInstance().isRelocationEnabled()) {
      const raw = this.ui.getStartCountryRaw();
      if (!raw) throw new Error('StartCountry is required when relocation is enabled');
      return raw.trim().toLowerCase();
    }
    return this.getDefaultCountry();
  }

  /**
   * Return the application name configured in the loaded app config.
   * Falls back to 'Financial Simulator' if not set.
   */
  getApplicationName() {
    return this.applicationName || 'Financial Simulator';
  }

  /**
   * Return whether relocation features are enabled in the loaded app config.
   * Falls back to false if not set.
   */
  isRelocationEnabled() {
    // Only enable when explicitly enabled AND a non-empty availableCountries list is provided in config
    return (this.relocationEnabled === true)
      && Array.isArray(this.availableCountries)
      && this.availableCountries.length > 0;
  }

  /**
   * Return the available countries array configured in the loaded app config.
   * Falls back to a default array with the default country if not set.
   */
  getAvailableCountries() {
    return Array.isArray(this.availableCountries) ? this.availableCountries : [{ code: this.getDefaultCountry(), name: 'Default' }];
  }

  getEconomicData() {
    // Fast path: return cached instance if available
    if (this._economicData) return this._economicData;
    // Slow path: create and initialize (only happens once)
    ensureEconomicDataClass();
    if (!EconomicDataClass) return null;
    this._economicData = new EconomicDataClass();
    if (this._economicData && typeof this._economicData.refreshFromConfig === 'function') {
      this._economicData.refreshFromConfig(this);
    }
    return this._economicData;
  }

  getSimulationStartYear() {
    return this._simulationStartYear;
  }

  getCountryMap() {
    if (!this._countryCodeToName) {
      var list = this.getAvailableCountries();
      var map = {};
      for (var i = 0; i < list.length; i++) {
        var item = list[i] || {};
        var code = (item.code || '').toString().trim().toLowerCase();
        if (code) {
          map[code] = item.name || code.toUpperCase();
        }
      }
      this._countryCodeToName = map;
    }
    return this._countryCodeToName;
  }

  /**
   * Return the country display name for a given code using availableCountries.
   * Falls back to the uppercased code when not found.
   */
  getCountryNameByCode(code) {
    var c = (code || '').toString().trim().toLowerCase();
    if (!c) return '';
    var map = this.getCountryMap();
    return map[c] || c.toUpperCase();
  }

  /**
   * Lazily load and cache a TaxRuleSet for a given country code (e.g., 'ie').
   * Returns the loaded TaxRuleSet instance.
   * Throws an error if loading or parsing fails.
   * NOTE: Keep async to avoid blocking UI; callers that need sync access should
   *       use getCachedTaxRuleSet() after preloading.
   */
  async getTaxRuleSet(countryCode) {
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
    if (this._economicData) {
      this._economicData.refreshFromConfig(this);
    }
    return ruleset;
  }

  /**
   * Return a cached TaxRuleSet if available, otherwise null. Does not trigger loading.
   */
  getCachedTaxRuleSet(countryCode) {
    const code = (countryCode || this.getDefaultCountry()).toLowerCase();
    return this._taxRuleSets ? this._taxRuleSets[code] || null : null;
  }

  /**
   * Return a shallow copy of the cached TaxRuleSet map keyed by country code.
   * Exposed so other modules no longer need to read the private _taxRuleSets field.
   */
  listCachedRuleSets() {
    var source = this._taxRuleSets || {};
    var copy = {};
    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        copy[key] = source[key];
      }
    }
    return copy;
  }

  /**
   * Synchronize cached tax rulesets with the events in the scenario.
   * Loads rulesets for countries referenced by MV-* events and startCountry.
   * Discards cached rulesets for countries not referenced.
   * Always keeps the default country ruleset loaded.
   * @param {Array} events - Array of SimEvent objects
   * @param {string} startCountry - The starting country code from scenario parameters
   * @returns {Promise} Resolves with { failed: Array<string> } containing country codes that failed to load
   */
  async syncTaxRuleSetsWithEvents(events, startCountry) {
    if (!this.isRelocationEnabled()) return Promise.resolve({ failed: [] });
    var required = new Set();
    required.add(this.getDefaultCountry());
    if (startCountry && typeof startCountry === 'string') {
      required.add(startCountry.toLowerCase());
    }

    if (Array.isArray(events)) {
      for (var i = 0; i < events.length; i++) {
        var evt = events[i];
        if (evt && typeof evt.type === 'string' && evt.type.indexOf('MV-') === 0) {
          var code = evt.type.substring(3).toLowerCase();
          if (code) {
            required.add(code);
          }
        }
        if (evt && evt.linkedCountry && typeof evt.linkedCountry === 'string') {
          var linked = evt.linkedCountry.toLowerCase();
          if (linked) {
            required.add(linked);
          }
        }
      }
    }

    // Ensure we also load countries referenced by investment types (e.g. AR resident buying USD assets).
    // This keeps EconomicData complete enough for FX conversions implied by investmentTypes.assetCountry.
    var preload = [];
    required.forEach(function (code) {
      if (!this._taxRuleSets[code]) {
        preload.push(this.getTaxRuleSet(code).catch(function (err) {
          return { error: err, countryCode: code };
        }));
      }
    }.bind(this));
    if (preload.length > 0) {
      var preloadResults = await Promise.all(preload);
      // If any preload failed, we still continue; the existing "toLoad" logic below will report failures.
    }
    // Now that base rulesets are present, include any assetCountry references from their investment types.
    var cachedNow = Object.keys(this._taxRuleSets || {});
    for (var ii = 0; ii < cachedNow.length; ii++) {
      var rsNow = this._taxRuleSets[cachedNow[ii]];
      if (!rsNow || typeof rsNow.getResolvedInvestmentTypes !== 'function') continue;
      var types = rsNow.getResolvedInvestmentTypes() || [];
      for (var ti = 0; ti < types.length; ti++) {
        var t = types[ti] || {};
        if (t.assetCountry && typeof t.assetCountry === 'string') {
          required.add(t.assetCountry.toLowerCase());
        }
      }
    }

    var cached = Object.keys(this._taxRuleSets || {});
    for (var j = 0; j < cached.length; j++) {
      if (!required.has(cached[j])) {
        delete this._taxRuleSets[cached[j]];
      }
    }

    var toLoad = [];
    var countryCodes = [];
    required.forEach(function (code) {
      if (!this._taxRuleSets[code]) {
        toLoad.push(this.getTaxRuleSet(code).catch(function (err) {
          return { error: err, countryCode: code };
        }));
        countryCodes.push(code);
      }
    }.bind(this));

    var results = await Promise.all(toLoad);
    var failed = [];
    for (var k = 0; k < results.length; k++) {
      var result = results[k];
      if (result && result.error) {
        failed.push(result.countryCode);
      } else if (!result || !(result instanceof TaxRuleSet)) {
        failed.push(countryCodes[k]);
      }
    }

    if (this._economicData) {
      this._economicData.refreshFromConfig(this);
    }
    return { failed: failed };
  }

  newCodeVersion() {
    try {
      var msg = (typeof this.codeUpdateMessage === 'string' && this.codeUpdateMessage.trim().length > 0)
        ? (this.codeUpdateMessage.trim() + ' (v' + this.latestVersion + ')')
        : null;
      if (msg && this.ui && typeof this.ui.showToast === 'function') {
        this.ui.showToast(msg, 'App Updated', 10);
      }
    } catch (_) { }
  }

  clearVersionAlert() {
    this.ui.clearVersionNote();
    this.ui.setVersionHighlight(false);
  }

}

// Make Config available in the context (e.g., for tests)
this.Config = Config;
