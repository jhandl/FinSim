/**
 * DynamicSectionVisibilityEngine
 *
 * Generic per-section visibility engine for dynamic section flexbox columns.
 *
 * Semantics:
 * - If pinnedKeys is empty:
 *   - Columns are never hidden due to being zero.
 *   - If visibilityMap is provided, it can still explicitly hide columns.
 * - If pinnedKeys is non-empty:
 *   - Pinned columns are always visible.
 *   - Non-pinned columns are:
 *     - Hidden in empty periods (no data rows in that period)
 *     - Otherwise visible iff (visibilityMap allows it) AND (any row is non-zero for that key in that period)
 *
 * visibilityMap keys are matched lowercased against the dynamic column key.
 * If visibilityMap is provided, missing keys are treated as hidden.
 */
class DynamicSectionVisibilityEngine {
  static _toLowerKey(key) {
    return String(key || '').toLowerCase();
  }

  static _getSectionContainer(rowEl, sectionId, tagPrefix) {
    const sel = `${tagPrefix}.dynamic-section-container[data-section="${sectionId}"]`;
    return rowEl ? rowEl.querySelector(sel) : null;
  }

  static _getHeaderKeysForPeriod(period, sectionId) {
    const header = period ? period.headerRow : null;
    const container = this._getSectionContainer(header, sectionId, 'th');
    if (!container) return [];
    const cells = Array.from(container.querySelectorAll('.dynamic-section-cell[data-key]'));
    const keys = [];
    for (let i = 0; i < cells.length; i++) {
      const k = cells[i].getAttribute('data-key');
      if (k) keys.push(k);
    }
    return keys;
  }

  static _anyNonZeroInPeriod(period, sectionId, key) {
    const rows = (period && Array.isArray(period.dataRows)) ? period.dataRows : [];
    if (!rows.length) return false;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const container = this._getSectionContainer(row, sectionId, 'td');
      if (!container) continue;
      const cell = container.querySelector(`.dynamic-section-cell[data-key="${key}"]`);
      if (!cell) continue;
      const raw = cell.getAttribute('data-nominal-value');
      const v = raw ? parseFloat(raw) : 0;
      if (isFinite(v) && v !== 0) return true;
    }
    return false;
  }

  static computeVisibleKeysByPeriod(sectionId, pinnedKeys, visibilityMap, periods) {
    const pinned = Array.isArray(pinnedKeys) ? pinnedKeys : [];
    const pinnedSet = new Set(pinned);
    const hasPinned = pinned.length > 0;
    const hasVisMap = !!visibilityMap;

    const out = [];
    const list = Array.isArray(periods) ? periods : [];
    for (let p = 0; p < list.length; p++) {
      const period = list[p];
      const keys = this._getHeaderKeysForPeriod(period, sectionId);
      const visible = new Set();

      // Always show pinned keys that exist in this period
      for (let i = 0; i < keys.length; i++) {
        if (pinnedSet.has(keys[i])) visible.add(keys[i]);
      }

      const isEmptyPeriod = !(period && Array.isArray(period.dataRows) && period.dataRows.length > 0);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (pinnedSet.has(k)) continue;

        // visibilityMap layer (authoritative when present)
        if (hasVisMap) {
          const lk = this._toLowerKey(k);
          if (visibilityMap[lk] !== true) continue;
        }

        // pinnedKeys-empty means no zero gating; otherwise apply per-period non-zero gating
        if (!hasPinned) {
          visible.add(k);
          continue;
        }

        // Empty state (no data rows): only pinned
        if (isEmptyPeriod) continue;

        if (this._anyNonZeroInPeriod(period, sectionId, k)) {
          visible.add(k);
        }
      }

      out.push(visible);
    }
    return out;
  }

  static apply(sectionId, pinnedKeys, visibilityMap, periods) {
    const list = Array.isArray(periods) ? periods : [];
    if (!sectionId || !list.length) return;

    const visibleByPeriod = this.computeVisibleKeysByPeriod(sectionId, pinnedKeys, visibilityMap, list);

    for (let p = 0; p < list.length; p++) {
      const period = list[p];
      const visible = visibleByPeriod[p] || new Set();

      const header = period ? period.headerRow : null;
      const headerContainer = this._getSectionContainer(header, sectionId, 'th');
      if (headerContainer) {
        const headerCells = Array.from(headerContainer.querySelectorAll('.dynamic-section-cell[data-key]'));
        for (let i = 0; i < headerCells.length; i++) {
          const k = headerCells[i].getAttribute('data-key');
          if (!k) continue;
          try { headerCells[i].style.display = visible.has(k) ? '' : 'none'; } catch (_) { }
        }
      }

      const rows = (period && Array.isArray(period.dataRows)) ? period.dataRows : [];
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const container = this._getSectionContainer(row, sectionId, 'td');
        if (!container) continue;
        const cells = Array.from(container.querySelectorAll('.dynamic-section-cell[data-key]'));
        for (let i = 0; i < cells.length; i++) {
          const k = cells[i].getAttribute('data-key');
          if (!k) continue;
          try { cells[i].style.display = visible.has(k) ? '' : 'none'; } catch (_) { }
        }
      }
    }
  }
}

// Make available in both browser and Node test contexts
this.DynamicSectionVisibilityEngine = DynamicSectionVisibilityEngine;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DynamicSectionVisibilityEngine };
}

