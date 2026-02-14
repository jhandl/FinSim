
const assert = require('assert');
const { JSDOM } = require('jsdom');

// Mock classes
class MockConfig {
  constructor() {
    this.countries = [
      { code: 'ie', name: 'Ireland', currency: 'EUR' },
      { code: 'ar', name: 'Argentina', currency: 'ARS' }
    ];
  }
  static getInstance() {
    if (!MockConfig.instance) MockConfig.instance = new MockConfig();
    return MockConfig.instance;
  }
  getDefaultCountry() { return 'ie'; }
  getCachedTaxRuleSet(code) {
    const c = this.countries.find(x => x.code === code);
    return c ? { getCurrencyCode: () => c.currency } : null;
  }
  isRelocationEnabled() { return true; }
}
global.Config = MockConfig;

// Mock UIManager
class MockUIManager {
  constructor(webUI) { this.webUI = webUI; }
  readEvents(validate) { return this.webUI.events || []; }
}
global.UIManager = MockUIManager;

// Mock WebUI
class MockWebUI {
  constructor() {
    this.values = { 'StartCountry': 'ie' };
    this.events = [];
  }
  getValue(key) { return this.values[key]; }
  setValue(key, val) { this.values[key] = val; }
}

// Load RelocationUtils (we need to read it from file or mock it, but here we want to test the actual logic)
// Since we can't easily require the actual file due to dependencies, I will copy the relevant function for testing logic.
// OR better, I will use the actual file if I can load it.
// For now, let's replicate the logic to verify if the LOGIC itself is correct.

function getCurrencyOptions(webUI) {
  const cfg = Config.getInstance();
  const currencySet = new Set();
  let startCountry = webUI.getValue('StartCountry') || cfg.getDefaultCountry() || 'ie';

  const startRs = cfg.getCachedTaxRuleSet(String(startCountry).toLowerCase());
  const startCur = startRs && startRs.getCurrencyCode ? startRs.getCurrencyCode() : null;
  if (startCur) currencySet.add(startCur);

  const uiManager = new UIManager(webUI);
  const events = uiManager.readEvents(false) || [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i]; if (!e) continue;
    if (e.type === 'MV') {
      const dest = String(e.name || '').toLowerCase();
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
  options.sort((a, b) => a.value.localeCompare(b.value));
  return options;
}

// Test
const webUI = new MockWebUI();

// Scenario 1: Relocation to AR
webUI.events = [{ type: 'MV', name: 'AR', fromAge: 30 }];
let options = getCurrencyOptions(webUI);
console.log('Scenario 1 Options:', options.map(o => o.value));
assert(options.find(o => o.value === 'ARS'), 'Should have ARS');

// Scenario 2: No Relocation
webUI.events = [{ type: 'SI', fromAge: 30 }];
// Simulate FileManager reset
webUI.setValue('StartCountry', 'ie');

options = getCurrencyOptions(webUI);
console.log('Scenario 2 Options:', options.map(o => o.value));
assert(!options.find(o => o.value === 'ARS'), 'Should NOT have ARS');

console.log('Test Passed');
