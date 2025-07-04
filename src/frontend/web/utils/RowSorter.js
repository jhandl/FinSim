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

  function compareValues(aVal, bVal, dir) {
    const aNum = parseFloat(aVal);
    const bNum = parseFloat(bVal);
    const aIsNum = !isNaN(aNum);
    const bIsNum = !isNaN(bNum);

    // If sorting ascending, treat empty/zero as high values to sink them
    if (dir === 'asc') {
      if (aIsNum && aNum === 0 && bIsNum && bNum !== 0) return 1;
      if (bIsNum && bNum === 0 && aIsNum && aNum !== 0) return -1;
      if (!aVal && bVal) return 1;
      if (aVal && !bVal) return -1;
    }

    if (aIsNum && bIsNum) {
      if (aNum < bNum) return -1;
      if (aNum > bNum) return 1;
      return 0;
    }
    // Fallback to locale-aware string compare
    return aVal.toString().localeCompare(bVal.toString(), undefined, { sensitivity: 'accent' });
  }

  function sortRows(tbody, sortKeys, { flash = false } = {}) {
    if (!tbody || !Array.isArray(sortKeys) || sortKeys.length === 0) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));

    // Capture initial positions
    const firstPos = new Map();
    rows.forEach(r => firstPos.set(r, r.getBoundingClientRect().top));

    // Sort rows
    const sorted = rows.slice().sort((a, b) => {
      for (const { col, dir } of sortKeys) {
        const cmp = compareValues(getCellValue(a, col), getCellValue(b, col), dir);
        if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });

    // Re-insert in new order
    sorted.forEach(r => tbody.appendChild(r));

    // Capture final positions
    const lastPos = new Map();
    sorted.forEach(r => lastPos.set(r, r.getBoundingClientRect().top));

    // FLIP animation via Web Animations API (works on table rows)
    sorted.forEach(row => {
      const delta = firstPos.get(row) - lastPos.get(row);
      if (!delta) return;
      try {
        row.animate([
          { transform: `translateY(${delta}px)` },
          { transform: 'translateY(0)' }
        ], {
          duration: 350,
          easing: 'ease'
        });
      } catch (e) {
        // Fallback if WAAPI unsupported
        row.style.transition = 'transform 0.35s ease';
        row.style.transform = `translateY(${delta}px)`;
        requestAnimationFrame(() => row.style.transform = '');
      }

      if (flash) {
        row.classList.add('flash');
        setTimeout(() => row.classList.remove('flash'), 1000);
      }
    });
  }

  global.RowSorter = { sortRows };
})(window); 