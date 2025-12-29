class RelocationUtils {

  static extractRelocationTransitions(webUI, instance) {
    const cfg = Config.getInstance();
    if (!cfg.isRelocationEnabled()) return;

    const uiManager = new UIManager(webUI);
    const events = uiManager.readEvents(false);
    const startCountry = cfg.getStartCountry();

    instance.relocationTransitions = [];
    // Store MV event rate overrides: country -> inflation rate (decimal)
    instance.countryInflationOverrides = {};

    const mvEvents = events.filter(e => e.type && e.type.indexOf('MV-') === 0).sort((a, b) => a.fromAge - b.fromAge);
    let prevCountry = startCountry.toLowerCase();
    mvEvents.forEach(ev => {
      const destCountry = ev.type.substring(3).toLowerCase();
      instance.relocationTransitions.push({ age: ev.fromAge, fromCountry: prevCountry, toCountry: destCountry });
      prevCountry = destCountry;

      // Store MV event rate as inflation override for destination country (if provided)
      // event.rate is already a decimal (parsePercentage divides by 100)
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
    const startCountry = cfg.getStartCountry();

    const startRs = cfg.getCachedTaxRuleSet(String(startCountry).toLowerCase());
    const startCur = startRs && startRs.getCurrencyCode ? startRs.getCurrencyCode() : null;
    if (startCur) currencySet.add(startCur);

    const uiManager = new UIManager(webUI);
    const events = uiManager.readEvents(false) || [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i]; if (!e) continue;
      if (e.type && e.type.indexOf('MV-') === 0) {
        const dest = e.type.substring(3).toLowerCase();
        const rs = cfg.getCachedTaxRuleSet(dest);
        const cur = rs && rs.getCurrencyCode ? rs.getCurrencyCode() : null;
        if (cur) currencySet.add(cur);
      }
      if (e.currency) {
        currencySet.add(String(e.currency).toUpperCase());
      }
      if (e.linkedCountry) {
        const rs = cfg.getCachedTaxRuleSet(String(e.linkedCountry).toLowerCase());
        const cur = rs && rs.getCurrencyCode ? rs.getCurrencyCode() : null;
        if (cur) currencySet.add(cur);
      }
    }

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
    return rs && rs.getCurrencyCode ? (rs.getCurrencyCode() || 'EUR') : 'EUR';
  }

  static getRepresentativeCountryForCurrency(code) {
    const cfg = Config.getInstance();
    const startCountry = cfg.getStartCountry();
    const countries = cfg.getAvailableCountries();
    for (let i = 0; i < countries.length; i++) {
      const country = countries[i];
      const rs = cfg.getCachedTaxRuleSet(country.code.toLowerCase());
      if (rs && rs.getCurrencyCode() === code) {
        return country.code.toLowerCase();
      }
    }
    return startCountry.toLowerCase();
  }

  static createCurrencyControls(container, manager, webUI) {
    container.innerHTML = ''; // Clear existing controls

    const isChartManager = manager.constructor.name === 'ChartManager';

    // --- Currency Mode Toggle ---
    // Only create mode toggle for TableManager, not for ChartManager
    if (!isChartManager) {
      const toggleContainer = document.createElement('div');
      toggleContainer.className = 'age-year-toggle';

      const naturalToggle = document.createElement('span');
      naturalToggle.id = `currencyModeNatural_${manager.constructor.name}`;
      naturalToggle.className = 'mode-toggle-option';
      naturalToggle.textContent = 'Natural';
      naturalToggle.addEventListener('click', () => manager.handleCurrencyModeChange('natural'));
      toggleContainer.appendChild(naturalToggle);

      const unifiedToggle = document.createElement('span');
      unifiedToggle.id = `currencyModeUnified_${manager.constructor.name}`;
      unifiedToggle.className = 'mode-toggle-option';
      unifiedToggle.textContent = 'Unified';
      unifiedToggle.addEventListener('click', () => manager.handleCurrencyModeChange('unified'));
      toggleContainer.appendChild(unifiedToggle);

      container.appendChild(toggleContainer);
    } else {
      // For ChartManager, always use unified mode
      manager.currencyMode = 'unified';
    }

    // --- Reporting Currency Dropdown ---
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'currency-dropdown-container';

    manager.reportingCurrency = manager.reportingCurrency || RelocationUtils.getDefaultReportingCurrency(webUI);
    const options = RelocationUtils.getCurrencyOptions(webUI) || [];

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
    options.forEach(opt => {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      if (opt.value === manager.reportingCurrency) {
        optionEl.selected = true;
      }
      select.appendChild(optionEl);
    });

    select.addEventListener('change', (event) => {
      manager.reportingCurrency = event.target.value;
      if (manager.constructor.name === 'TableManager') {
        manager.conversionCache = {}; // Clear cache on currency change
      }
      if (manager.currencyMode === 'unified') {
        if (manager.constructor.name === 'TableManager') {
          manager.refreshDisplayedCurrencies();
        } else {
          manager.refreshChartsWithCurrency();
        }
      }
    });

    if (isChartManager && options.length <= 1) {
      try {
        select.disabled = true;
      } catch (_) { }
    }

    dropdownContainer.appendChild(select);
    container.appendChild(dropdownContainer);

    // Set initial state (only for TableManager, ChartManager doesn't need this)
    if (!isChartManager) {
      manager.updateCurrencyControlVisibility();
    }
  }
}
