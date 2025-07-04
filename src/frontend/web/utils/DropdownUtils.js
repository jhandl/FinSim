/* DropdownUtils.js – Reusable floating dropdown helper (visualization + events sorting)
 * Exposed globally as window.DropdownUtils
 */

class DropdownUtils {
  /**
   * Factory to initialise a dropdown.
   * @param {Object} cfg                       – Configuration object.
   * @param {HTMLElement} cfg.toggleEl         – Toggle icon / button.
   * @param {HTMLElement} cfg.dropdownEl       – Container holding option <div>s.
   * @param {Array<Object>} [cfg.options]      – Optional array of options to (re)build DOM.
   *                                            Each: { value, label, description, selected }
   * @param {string}        [cfg.selectedValue]– Initially selected value.
   * @param {Function}      [cfg.onSelect]     – Callback(value, label) when user selects.
   * @param {Function}      [cfg.tooltipFormatter] – fn(text) → html/string for tooltips.
   * @param {string}        [cfg.width]        – Optional width for the dropdown.
   * @param {string}        [cfg.header]       – Optional header text for the dropdown.
   * @returns {Object} { open, close, getSelected, setOptions }
   */
  static create(cfg = {}) {
    const {
      toggleEl,
      dropdownEl,
      options,
      selectedValue,
      onSelect,
      tooltipFormatter,
      width,
      header,
    } = cfg;

    // Track all open dropdowns globally
    if (!window.__openDropdowns) window.__openDropdowns = new Set();

    if (!toggleEl || !dropdownEl) {
      console.error('DropdownUtils: toggleEl and dropdownEl are required');
      return null;
    }

    // Apply custom width if provided
    if (width) {
      dropdownEl.style.width = typeof width === 'number' ? `${width}px` : width;
    }

    // -----------------------------------------------------------------
    // Header handling
    // -----------------------------------------------------------------
    const ensureHeader = (text) => {
      if (!text) return;
      if (!dropdownEl.querySelector('.dropdown-header')) {
        const div = document.createElement('div');
        div.className = 'dropdown-header';
        dropdownEl.prepend(div);
      }
      const hdr = dropdownEl.querySelector('.dropdown-header');
      if (hdr) hdr.textContent = text;
    };
    ensureHeader(header);

    // Keep dropdown hidden until explicitly opened
    if (dropdownEl.style.display === '' || dropdownEl.style.display === 'block') {
      dropdownEl.style.display = 'none';
    }

    // --- Internal state ---------------------------------------------------
    let selected = selectedValue;
    const format = tooltipFormatter || ((txt) => txt);
    let tooltipEl = null;
    let tooltipTimer = null;
    const originalParent = dropdownEl.parentNode;

    // ---------------------------------------------------------------------
    // DOM helpers
    // ---------------------------------------------------------------------
    const rebuildOptions = (opts) => {
      if (!Array.isArray(opts)) return;
      const hdrNode = dropdownEl.querySelector('.dropdown-header');
      dropdownEl.innerHTML = '';
      if (hdrNode) dropdownEl.appendChild(hdrNode);
      opts.forEach((opt) => {
        if (!opt) return;
        const div = document.createElement('div');
        div.setAttribute('data-value', opt.value);
        div.textContent = opt.label;
        if (opt.description) div.setAttribute('data-description', opt.description);
        if (opt.selected || opt.value === selected) div.classList.add('selected');
        dropdownEl.appendChild(div);
      });
    };

    // Build list if caller provided options
    if (options && Array.isArray(options)) {
      rebuildOptions(options);
    } else if (selected !== undefined) {
      // Ensure selected highlight
      dropdownEl.querySelectorAll('[data-value]').forEach((el) => {
        el.classList.toggle('selected', el.getAttribute('data-value') === selected);
      });
    }

    // ---------------------------------------------------------------------
    // Tooltip logic (shared for desktop & mobile)
    // ---------------------------------------------------------------------
    const removeTooltip = () => {
      if (tooltipTimer) {
        clearTimeout(tooltipTimer);
        tooltipTimer = null;
      }
      if (tooltipEl) {
        tooltipEl.remove();
        tooltipEl = null;
      }
    };

    const createTooltip = (html) => {
      const t = document.createElement('div');
      t.className = 'visualization-tooltip';
      if (/<[a-z][\s\S]*>/i.test(html)) {
        t.innerHTML = html;
      } else {
        t.textContent = html;
      }
      document.body.appendChild(t);
      return t;
    };

    const positionTooltip = (tt, targetRect) => {
      const isMobile = window.innerWidth <= 768;
      const vpH = window.innerHeight;
      const vpW = window.innerWidth;
      const margin = isMobile ? 20 : 10;
      const spacing = isMobile ? 15 : 10;

      const ttRect = tt.getBoundingClientRect();
      let left = targetRect.left + (targetRect.width - ttRect.width) / 2;
      let top = targetRect.top - ttRect.height - spacing;

      if (top < margin) top = targetRect.bottom + spacing;
      if (top + ttRect.height > vpH - margin) top = Math.max(margin, vpH - ttRect.height - margin);

      if (left < margin) left = margin;
      if (left + ttRect.width > vpW - margin) left = vpW - ttRect.width - margin;

      tt.style.position = 'fixed';
      tt.style.left = `${left}px`;
      tt.style.top = `${top}px`;
      tt.style.transform = 'none';
    };

    const showTooltipDelayed = (text, rect) => {
      if (!text) return;
      if (tooltipTimer) clearTimeout(tooltipTimer);
      removeTooltip();
      tooltipTimer = setTimeout(() => {
        tooltipEl = createTooltip(format(text));
        requestAnimationFrame(() => {
          positionTooltip(tooltipEl, rect);
          tooltipEl.classList.add('visible');
        });
        tooltipTimer = null;
      }, 600);
    };

    // ---------------------------------------------------------------------
    // Dropdown opening / closing
    // ---------------------------------------------------------------------
    const open = () => {
      // Close any other open dropdowns first
      window.__openDropdowns.forEach((closer) => closer());

      dropdownEl.style.display = 'block';
      dropdownEl.style.visibility = 'hidden';

      const iconRect = toggleEl.getBoundingClientRect();
      const ddRect = dropdownEl.getBoundingClientRect();
      const vpH = window.innerHeight;
      const spaceBelow = vpH - iconRect.bottom;
      const spaceAbove = iconRect.top;
      const ddH = ddRect.height;

      dropdownEl.style.position = 'fixed';
      dropdownEl.style.zIndex = '10051';

      if (spaceBelow >= ddH + 10) {
        dropdownEl.style.left = `${iconRect.left}px`;
        dropdownEl.style.top = `${iconRect.bottom + 2}px`;
      } else if (spaceAbove >= ddH + 10) {
        dropdownEl.style.left = `${iconRect.left}px`;
        dropdownEl.style.top = `${iconRect.top - ddH - 2}px`;
      } else {
        dropdownEl.style.left = `${iconRect.left}px`;
        dropdownEl.style.top = `${Math.max(10, vpH - ddH - 10)}px`;
      }

      // Override mobile CSS centering by clearing transform so we keep calculated position
      dropdownEl.style.transform = 'none';

      dropdownEl.style.visibility = 'visible';

      const sel = dropdownEl.querySelector('.selected');
      dropdownEl.querySelectorAll('.highlighted').forEach((n) => n.classList.remove('highlighted'));
      if (sel) sel.classList.add('highlighted');

      window.__openDropdowns.add(close);

      // Move dropdownEl to body to avoid clipping/stacking issues
      if (dropdownEl.parentNode !== document.body) {
        document.body.appendChild(dropdownEl);
      }
    };

    const close = () => {
      dropdownEl.style.display = 'none';
      dropdownEl.querySelectorAll('.highlighted').forEach((n) => n.classList.remove('highlighted'));
      window.__openDropdowns.delete(close);
    };

    // ---------------------------------------------------------------------
    // Event listeners
    // ---------------------------------------------------------------------
    const controlContainer = toggleEl.closest('.visualization-control') || toggleEl;

    // Toggle click
    controlContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdownEl.style.display !== 'none' && dropdownEl.style.display !== '';
      if (isVisible) {
        close();
      } else {
        removeTooltip();
        open();
      }
    });

    // Option click
    dropdownEl.addEventListener('click', (e) => {
      const tgt = e.target;
      if (!tgt.hasAttribute('data-value')) return;
      const val = tgt.getAttribute('data-value');
      const label = tgt.textContent;
      selected = val;
      dropdownEl.querySelectorAll('[data-value]').forEach((el) => el.classList.remove('selected'));
      tgt.classList.add('selected');
      close();
      if (typeof onSelect === 'function') onSelect(val, label);
      e.stopPropagation();
    });

    // Hover highlight + tooltip (desktop)
    dropdownEl.addEventListener('mouseover', (e) => {
      if (window.innerWidth <= 768) return;
      const tgt = e.target;
      if (!tgt.hasAttribute('data-value')) return;
      dropdownEl.querySelectorAll('.highlighted').forEach((n) => n.classList.remove('highlighted'));
      tgt.classList.add('highlighted');
      const desc = tgt.getAttribute('data-description');
      if (desc) showTooltipDelayed(desc, tgt.getBoundingClientRect());
    });
    dropdownEl.addEventListener('mouseout', () => {
      if (window.innerWidth > 768) removeTooltip();
    });

    // Control container hover tooltip (selected option)
    controlContainer.addEventListener('mouseover', () => {
      if (window.innerWidth <= 768) return;
      const sel = dropdownEl.querySelector('.selected');
      if (sel) {
        const desc = sel.getAttribute('data-description');
        if (desc) showTooltipDelayed(desc, controlContainer.getBoundingClientRect());
      }
    });
    controlContainer.addEventListener('mouseout', () => {
      if (window.innerWidth > 768) removeTooltip();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!dropdownEl.contains(e.target) && !controlContainer.contains(e.target)) {
        close();
        removeTooltip();
      }
    });

    // Mobile specific touch interactions
    document.addEventListener(
      'touchstart',
      (e) => {
        if (window.innerWidth > 768) return;
        if (dropdownEl.style.display !== 'none') return; // dropdown open – leave to its own handlers
        if (!controlContainer.contains(e.target) && tooltipEl) removeTooltip();
      },
      { passive: true },
    );

    // Long-press tooltip for options (mobile)
    let longPressTimer = null;
    dropdownEl.addEventListener(
      'touchstart',
      (e) => {
        if (window.innerWidth > 768) return;
        const tgt = e.target;
        if (!tgt.hasAttribute('data-value')) return;
        longPressTimer = setTimeout(() => {
          const desc = tgt.getAttribute('data-description');
          if (desc) {
            tooltipEl = createTooltip(format(desc));
            requestAnimationFrame(() => {
              positionTooltip(tooltipEl, tgt.getBoundingClientRect());
              tooltipEl.classList.add('visible');
            });
          }
        }, 500);
      },
      { passive: true },
    );
    const cancelLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      removeTooltip();
    };
    dropdownEl.addEventListener('touchend', cancelLongPress, { passive: true });
    dropdownEl.addEventListener('touchmove', cancelLongPress, { passive: true });
    dropdownEl.addEventListener('touchcancel', cancelLongPress, { passive: true });

    /* ---------------------------------------------------------------
       Mobile long-press on the control itself (when dropdown closed)
       Shows tooltip for the currently selected option – mirrors
       previous bespoke implementations.                       
    ----------------------------------------------------------------*/
    let ctrlLongPressTimer = null;
    const cancelCtrlLongPress = () => {
      if (ctrlLongPressTimer) {
        clearTimeout(ctrlLongPressTimer);
        ctrlLongPressTimer = null;
      }
      removeTooltip();
    };

    controlContainer.addEventListener(
      'touchstart',
      (e) => {
        if (window.innerWidth > 768) return; // desktop skip

        // Don't trigger when dropdown is open – options handler covers that
        if (dropdownEl.style.display !== 'none') return;

        ctrlLongPressTimer = setTimeout(() => {
          const sel = dropdownEl.querySelector('.selected');
          if (!sel) return;
          const desc = sel.getAttribute('data-description');
          if (!desc) return;
          tooltipEl = createTooltip(format(desc));
          requestAnimationFrame(() => {
            positionTooltip(tooltipEl, controlContainer.getBoundingClientRect());
            tooltipEl.classList.add('visible');
          });
        }, 500);
      },
      { passive: true },
    );
    controlContainer.addEventListener('touchend', cancelCtrlLongPress, { passive: true });
    controlContainer.addEventListener('touchmove', cancelCtrlLongPress, { passive: true });
    controlContainer.addEventListener('touchcancel', cancelCtrlLongPress, { passive: true });

    // Public API
    return {
      open,
      close,
      getSelected: () => selected,
      setOptions: rebuildOptions,
    };
  }
} 