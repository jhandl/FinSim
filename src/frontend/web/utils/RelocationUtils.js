class RelocationUtils {

  static getScenarioCountryCodes(webUI) {
    const cfg = Config.getInstance();
    const startCountry = String(cfg.getStartCountry() || cfg.getDefaultCountry() || '').trim().toLowerCase();
    const set = {};
    if (startCountry) set[startCountry] = true;

    const uiManager = new UIManager(webUI);
    const events = uiManager.readEvents(false) || [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev || ev.type !== 'MV') continue;
      const code = getRelocationCountryCode(ev);
      if (code) set[code] = true;
    }
    return Object.keys(set);
  }

  static hasMultipleScenarioCurrencies(webUI) {
    return RelocationUtils.getCurrencyOptions(webUI).length > 1;
  }

  static extractRelocationTransitions(webUI, instance) {
    const cfg = Config.getInstance();
    if (!cfg.isRelocationEnabled()) return;
    const available = cfg.getAvailableCountries() || [];
    const validCodes = {};
    for (let i = 0; i < available.length; i++) {
      const code = String((available[i] || {}).code || '').trim().toLowerCase();
      if (code) validCodes[code] = true;
    }

    const uiManager = new UIManager(webUI);
    const events = uiManager.readEvents(false);
    const startCountry = cfg.getStartCountry();

    instance.relocationTransitions = [];
    instance.countryInflationOverrides = {};

    const mvEvents = events.filter(e => isRelocationEvent(e)).sort((a, b) => a.fromAge - b.fromAge);
    let prevCountry = startCountry.toLowerCase();
    mvEvents.forEach(ev => {
      const destCountry = getRelocationCountryCode(ev);
      if (!destCountry || !validCodes[destCountry]) return;
      instance.relocationTransitions.push({ age: ev.fromAge, fromCountry: prevCountry, toCountry: destCountry });
      prevCountry = destCountry;

      if (ev.rate !== null && ev.rate !== undefined && ev.rate !== '') {
        const parsed = parseFloat(ev.rate);
        if (!isNaN(parsed) && isFinite(parsed)) {
          instance.countryInflationOverrides[destCountry] = parsed;
        }
      }
    });
  }

  static getCountryForAge(age, webUI) {
    const uiManager = new UIManager(webUI);
    const events = uiManager.readEvents(false);
    const startCountry = Config.getInstance().getStartCountry();
    return getCountryForAge(age, events, startCountry);
  }

  static getCurrencyOptions(webUI) {
    const cfg = Config.getInstance();
    const currencySet = new Set();
    const startCountry = String(cfg.getStartCountry() || '').toLowerCase();
    const scenarioCountries = RelocationUtils.getScenarioCountryCodes(webUI);

    // Only include currencies for countries actually present in this scenario.
    for (let i = 0; i < scenarioCountries.length; i++) {
      const rs = cfg.getCachedTaxRuleSet(String(scenarioCountries[i]).toLowerCase());
      if (!rs || typeof rs.getCurrencyCode !== 'function') continue;
      const cur = rs.getCurrencyCode();
      if (cur) currencySet.add(String(cur).toUpperCase());
    }

    // Ensure start-country currency is included (must exist).
    const startRs = cfg.getCachedTaxRuleSet(String(startCountry).toLowerCase());
    if (!startRs || typeof startRs.getCurrencyCode !== 'function') {
      throw new Error('RelocationUtils.getCurrencyOptions: missing ruleset for StartCountry ' + String(startCountry));
    }
    const startCur = startRs.getCurrencyCode();
    if (!startCur) {
      throw new Error('RelocationUtils.getCurrencyOptions: StartCountry ruleset missing currency code for ' + String(startCountry));
    }
    currencySet.add(String(startCur).toUpperCase());

    const options = [];
    currencySet.forEach((code) => {
      options.push({ value: code, label: code });
    });

    // Sort options alphabetically by currency code
    options.sort((a, b) => a.value.localeCompare(b.value));

    return options;
  }

  static getDefaultReportingCurrency(webUI) {
    const cfg = Config.getInstance();
    const startCountry = cfg.getStartCountry();
    const rs = cfg.getCachedTaxRuleSet(String(startCountry).toLowerCase());
    if (!rs || typeof rs.getCurrencyCode !== 'function') {
      throw new Error('RelocationUtils.getDefaultReportingCurrency: missing ruleset for StartCountry ' + String(startCountry));
    }
    const cur = rs.getCurrencyCode();
    if (!cur) {
      throw new Error('RelocationUtils.getDefaultReportingCurrency: StartCountry ruleset missing currency code for ' + String(startCountry));
    }
    return String(cur).toUpperCase();
  }

  static getRepresentativeCountryForCurrency(code) {
    const cfg = Config.getInstance();
    const countries = cfg.getAvailableCountries();
    for (let i = 0; i < countries.length; i++) {
      const country = countries[i];
      const rs = cfg.getCachedTaxRuleSet(country.code.toLowerCase());
      if (rs && rs.getCurrencyCode() === code) {
        return country.code.toLowerCase();
      }
    }
    throw new Error('RelocationUtils.getRepresentativeCountryForCurrency: no country found for currency ' + String(code));
  }

  static createCurrencyControls(container, manager, webUI) {
    container.innerHTML = ''; // Clear existing controls

    const isChartManager = manager.constructor.name === 'ChartManager';
    if (isChartManager) {
      // For ChartManager, always use unified mode
      manager.currencyMode = 'unified';
    }

    // --- Reporting Currency Dropdown ---
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'currency-dropdown-container';

    manager.reportingCurrency = manager.reportingCurrency || RelocationUtils.getDefaultReportingCurrency(webUI);
    const options = RelocationUtils.getCurrencyOptions(webUI) || [];
    const tableOptions = [{ value: 'LOCAL', label: 'Local' }].concat(options);

    // Validate that the current reporting currency is still a valid option
    const validCodes = new Set(options.map(o => o.value));
    if (manager.reportingCurrency && !validCodes.has(manager.reportingCurrency)) {
      manager.reportingCurrency = RelocationUtils.getDefaultReportingCurrency(webUI);
    }

    // For ChartManager, only show the dropdown if there's more than one currency option
    if (isChartManager) {
      dropdownContainer.style.display = 'block';
    }

    const select = document.createElement('select');
    select.id = `reportingCurrencySelect_${manager.constructor.name}`;
    const label = document.createElement('span');
    label.className = 'currency-dropdown-label';
    label.textContent = 'Currency ';
    const renderedOptions = isChartManager ? options : tableOptions;
    renderedOptions.forEach(opt => {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      if ((!isChartManager && manager.currencyMode === 'natural' && opt.value === 'LOCAL') ||
        (opt.value === manager.reportingCurrency)) {
        optionEl.selected = true;
      }
      select.appendChild(optionEl);
    });

    select.addEventListener('change', (event) => {
      const selected = event.target.value;
      if (manager.constructor.name === 'TableManager') {
        if (selected === 'LOCAL') {
          manager.handleCurrencyModeChange('natural');
          return;
        }
        manager.reportingCurrency = selected;
        manager.conversionCache = {}; // Clear cache on currency change
        if (manager.currencyMode !== 'unified') {
          manager.handleCurrencyModeChange('unified');
          return;
        }
      } else {
        manager.reportingCurrency = selected;
      }
      if (manager.currencyMode === 'unified') {
        // Let the dropdown selection paint before heavy refresh work.
        setTimeout(() => {
          if (manager.currencyMode !== 'unified') return;
          if (manager.constructor.name === 'TableManager') {
            manager.refreshDisplayedCurrencies({ recomputeDynamicSectionWidths: true });
          } else {
            manager.refreshChartsWithCurrency();
          }
        }, 0);
      }
    });

    if (isChartManager && options.length <= 1) {
      try {
        select.disabled = true;
      } catch (_) { }
    }

    dropdownContainer.appendChild(label);
    dropdownContainer.appendChild(select);
    container.appendChild(dropdownContainer);

    // Set initial state (only for TableManager, ChartManager doesn't need this)
    if (!isChartManager) {
      manager.updateCurrencyControlVisibility();
    }
  }
}
