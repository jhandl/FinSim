/**
 * CountryTabSyncManager
 * ---------------------
 * Singleton manager that coordinates country tab selection across panels.
 *
 * - When synced: all panels share a single selected country.
 * - When not synced: each panel maintains its own selected country.
 *
 * Persistence:
 * - localStorage key: `countryTabsSynced` (default: true)
 */
class CountryTabSyncManager {
  constructor() {
    this._countryListeners = [];
    this._syncListeners = [];

    this._panelSelected = {};
    this._globalSelected = null;

    const raw = localStorage.getItem('countryTabsSynced');
    if (raw === null) this._synced = true;
    else this._synced = (raw === 'true');
  }

  static getInstance() {
    if (!CountryTabSyncManager._instance) {
      CountryTabSyncManager._instance = new CountryTabSyncManager();
    }
    return CountryTabSyncManager._instance;
  }

  getSyncState() {
    return !!this._synced;
  }

  setSyncState(enabled) {
    const next = !!enabled;
    if (next === this._synced) return;

    this._synced = next;
    localStorage.setItem('countryTabsSynced', next ? 'true' : 'false');

    if (next) {
      // Snap all panels to a single country.
      if (!this._globalSelected) {
        const panelIds = Object.keys(this._panelSelected);
        if (panelIds.length) this._globalSelected = this._panelSelected[panelIds[0]];
      }
      if (this._globalSelected) {
        const ids = Object.keys(this._panelSelected);
        for (let i = 0; i < ids.length; i++) this._panelSelected[ids[i]] = this._globalSelected;
        this._emitCountryChange(null, this._globalSelected, null);
      }
    }

    this._emitSyncChange(next);
  }

  getSelectedCountry(panelId) {
    if (this._synced) return this._globalSelected;
    const pid = (panelId || '').toString();
    return this._panelSelected[pid] || null;
  }

  setSelectedCountry(panelId, countryCode) {
    const pid = (panelId || '').toString();
    const code = (countryCode || '').toString().trim().toLowerCase();
    if (!pid || !code) return;

    if (this._synced) {
      this._globalSelected = code;
      const ids = Object.keys(this._panelSelected);
      if (!ids.length) {
        this._panelSelected[pid] = code;
      } else {
        for (let i = 0; i < ids.length; i++) this._panelSelected[ids[i]] = code;
      }
      this._emitCountryChange(null, code, pid);
      return;
    }

    this._panelSelected[pid] = code;
    this._emitCountryChange(pid, code, pid);
  }

  addCountryChangeListener(cb) {
    if (typeof cb !== 'function') return;
    this._countryListeners.push(cb);
  }

  removeCountryChangeListener(cb) {
    const next = [];
    for (let i = 0; i < this._countryListeners.length; i++) {
      if (this._countryListeners[i] !== cb) next.push(this._countryListeners[i]);
    }
    this._countryListeners = next;
  }

  addSyncStateListener(cb) {
    if (typeof cb !== 'function') return;
    this._syncListeners.push(cb);
  }

  removeSyncStateListener(cb) {
    const next = [];
    for (let i = 0; i < this._syncListeners.length; i++) {
      if (this._syncListeners[i] !== cb) next.push(this._syncListeners[i]);
    }
    this._syncListeners = next;
  }

  _emitCountryChange(panelIdOrNull, countryCode, sourcePanelIdOrNull) {
    for (let i = 0; i < this._countryListeners.length; i++) {
      this._countryListeners[i]({
        panelId: panelIdOrNull,
        countryCode: countryCode,
        sourcePanelId: sourcePanelIdOrNull
      });
    }
  }

  _emitSyncChange(enabled) {
    for (let i = 0; i < this._syncListeners.length; i++) {
      this._syncListeners[i]({ enabled: !!enabled });
    }
  }
}

// Explicit global export (keeps non-module script loading compatible).
this.CountryTabSyncManager = CountryTabSyncManager;

