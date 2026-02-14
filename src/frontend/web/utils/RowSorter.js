/* RowSorter utility – provides FLIP-animated row sorting for the Events table */
(function (global) {
  const COL_SELECTORS = {
    'event-type': '.event-type',
    'event-name': '.event-name',
    'event-amount': '.event-amount',
    'from-age': '.event-from-age',
    'to-age': '.event-to-age',
    'event-rate': '.event-rate',
    'event-match': '.event-match'
  };

  function getCellValue(row, col) {
    // Handle creation-index as a special case
    if (col === 'creation-index') {
      return row.dataset.creationIndex || '0';
    }

    const selector = COL_SELECTORS[col];
    if (!selector) return '';
    const el = row.querySelector(selector);
    if (!el) return '';
    if (el.tagName === 'SELECT') return el.value;
    if (el.tagName === 'INPUT') {
      let val = el.value;
      if (col === 'event-amount') {
        val = val.replace(/[^0-9\.]/g, '');
      }
      return val;
    }
    return el.textContent || '';
  }

  // Use shared comparison logic
  const compareValues = window.SortingUtils ? window.SortingUtils.compareValues : function(aVal, bVal, dir) {
    // Fallback if SortingUtils not loaded
    return aVal.toString().localeCompare(bVal.toString());
  };

  function sortRows(tbody, sortKeys, options = {}) {
    if (!tbody || !Array.isArray(sortKeys) || sortKeys.length === 0) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));

    // Use shared sorting utility if available
    if (window.SortingUtils) {
      // Inject relocation-first tie-breaker when sorting by from-age
      const enhancedKeys = sortKeys.map(function(k) {
        if (k && k.col === 'from-age') {
          const tieBreaker = function(a, b) {
            const aType = getCellValue(a, 'event-type') || '';
            const bType = getCellValue(b, 'event-type') || '';
            const aIsReloc = aType === 'MV';
            const bIsReloc = bType === 'MV';
            if (aIsReloc && !bIsReloc) return -1;
            if (!aIsReloc && bIsReloc) return 1;
            return 0;
          };
          return { col: k.col, dir: k.dir, tieBreaker: tieBreaker };
        }
        return k;
      });
      window.SortingUtils.sortElements(tbody, rows, enhancedKeys, getCellValue, options);
    } else {
      // Fallback to original implementation
      const sorted = rows.slice().sort((a, b) => {
        for (const { col, dir } of sortKeys) {
          const cmp = compareValues(getCellValue(a, col), getCellValue(b, col), dir);
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
      sorted.forEach(r => tbody.appendChild(r));
    }
  }

  global.RowSorter = { sortRows };
})(window); 