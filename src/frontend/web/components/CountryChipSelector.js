/**
 * CountryChipSelector
 * -------------------
 * A small, reusable country selector that acts as a context switcher
 * for per-country parameter editing (Allocations, Personal Circumstances, etc).
 *
 * Refactored to a tab-style UI to match existing toggle patterns.
 *
 * API:
 *   const selector = new CountryChipSelector(countries, selectedCountry, onCountryChange, panelId)
 *   selector.render(containerEl)
 *   selector.getSelectedCountry()
 *   selector.setSelectedCountry('ie')
 *   selector.show()
 *   selector.hide()
 *
 * `countries` is an array of { code, name } objects (code is expected lowercased).
 */
class CountryChipSelector {
  constructor(countries, selectedCountry, onCountryChange, panelId) {
    this.countries = Array.isArray(countries) ? countries : [];
    this.selectedCountry = (selectedCountry || '').toString().trim().toLowerCase();
    this.onCountryChange = (typeof onCountryChange === 'function') ? onCountryChange : null;
    this.panelId = (panelId || '').toString();
    this.containerElement = null;
    this._countryListener = null;
  }

  getSelectedCountry() {
    return this.selectedCountry;
  }

  setSelectedCountry(code) {
    this.selectedCountry = (code || '').toString().trim().toLowerCase();
    this._updateActiveState();
  }

  show() {
    if (this.containerElement) this.containerElement.style.display = '';
  }

  hide() {
    if (this.containerElement) this.containerElement.style.display = 'none';
  }

  render(containerElement) {
    this.containerElement = containerElement;
    if (!this.containerElement) return;

    // Clear container
    while (this.containerElement.firstChild) {
      this.containerElement.removeChild(this.containerElement.firstChild);
    }

    const syncManager = CountryTabSyncManager.getInstance();

    // Root tab row
    const row = document.createElement('div');
    row.className = 'country-tab-selector';

    for (let i = 0; i < this.countries.length; i++) {
      const c = this.countries[i] || {};
      const code = (c.code || '').toString().trim().toLowerCase();
      if (!code) continue;
      const name = (c.name || code.toUpperCase()).toString();

      const tab = document.createElement('span');
      tab.className = 'mode-toggle-option';
      tab.setAttribute('data-country-code', code);
      tab.title = name;
      tab.textContent = this._flagEmojiFromCountryCode(code);

      tab.addEventListener('click', () => {
        if (this.selectedCountry === code) return;
        syncManager.setSelectedCountry(this.panelId, code);
      });

      row.appendChild(tab);
    }

    this.containerElement.appendChild(row);
    this._bindToSyncManager();
    this._updateActiveState();
  }

  _updateActiveState() {
    if (!this.containerElement) return;
    const tabs = this.containerElement.querySelectorAll('.country-tab-selector [data-country-code]');
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const code = (tab.getAttribute('data-country-code') || '').toLowerCase();
      const active = code === this.selectedCountry;
      if (active) tab.classList.add('mode-toggle-active');
      else tab.classList.remove('mode-toggle-active');
    }
  }

  _bindToSyncManager() {
    const mgr = CountryTabSyncManager.getInstance();

    if (this._countryListener) mgr.removeCountryChangeListener(this._countryListener);
    this._countryListener = (ev) => {
      if (!ev) return;
      const targetPanel = ev.panelId;
      if (targetPanel && targetPanel !== this.panelId) return;
      if (!ev.countryCode) return;
      this.selectedCountry = String(ev.countryCode).toLowerCase();
      this._updateActiveState();
      if (this.onCountryChange) this.onCountryChange(this.selectedCountry);
    };

    mgr.addCountryChangeListener(this._countryListener);
  }

  _flagEmojiFromCountryCode(code) {
    // Convert ISO country code to regional indicator symbol letters (emoji flag).
    // e.g. "ie" -> 🇮🇪
    const cc = (code || '').toString().trim().toUpperCase();
    if (cc.length !== 2) return cc;
    const A = 65;
    const OFFSET = 0x1F1E6;
    const c1 = cc.charCodeAt(0);
    const c2 = cc.charCodeAt(1);
    return String.fromCodePoint(OFFSET + (c1 - A), OFFSET + (c2 - A));
  }
}

// Explicit global export (keeps non-module script loading compatible).
this.CountryChipSelector = CountryChipSelector;

