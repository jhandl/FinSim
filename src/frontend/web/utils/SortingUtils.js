/* Shared sorting utilities for both table and accordion views */
(function (global) {
  
  /**
   * Compare two values for sorting with proper handling of numbers, empty values, etc.
   * This is the core comparison logic used by both table and accordion sorting.
   */
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

  /**
   * Apply FLIP animation to elements that have moved
   */
  function applyFLIPAnimation(elements, firstPositions, lastPositions, options = {}) {
    const { duration = 350, easing = 'ease' } = options;

    elements.forEach(element => {
      const delta = firstPositions.get(element) - lastPositions.get(element);
      if (!delta) return;

      try {
        element.animate([
          { transform: `translateY(${delta}px)` },
          { transform: 'translateY(0)' }
        ], {
          duration,
          easing
        });
      } catch (e) {
        // Fallback if WAAPI unsupported
        element.style.transition = `transform ${duration}ms ${easing}`;
        element.style.transform = `translateY(${delta}px)`;
        requestAnimationFrame(() => element.style.transform = '');
      }
    });
  }

  /**
   * Generic sort function that can work with any container and value extraction function
   */
  function sortElements(container, elements, sortKeys, getValueFn, options = {}) {
    if (!container || !Array.isArray(elements) || !Array.isArray(sortKeys) || sortKeys.length === 0) {
      return;
    }

    // Capture initial positions
    const firstPos = new Map();
    elements.forEach(el => firstPos.set(el, el.getBoundingClientRect().top));

    // Sort elements
    const sorted = elements.slice().sort((a, b) => {
      for (const { col, dir } of sortKeys) {
        const cmp = compareValues(getValueFn(a, col), getValueFn(b, col), dir);
        if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });

    // Re-insert in new order
    sorted.forEach(el => container.appendChild(el));

    // Capture final positions
    const lastPos = new Map();
    sorted.forEach(el => lastPos.set(el, el.getBoundingClientRect().top));

    // Apply FLIP animation
    applyFLIPAnimation(sorted, firstPos, lastPos, options);
  }

  // Export utilities
  global.SortingUtils = {
    compareValues,
    applyFLIPAnimation,
    sortElements
  };

})(window);
