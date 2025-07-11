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
    let tooltipEl = null;
    let tooltipTimer = null;

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
        div.setAttribute('role', 'option');
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
        TooltipUtils.hideTooltip(tooltipEl);
        tooltipEl = null;
      }
    };

    const showTooltipDelayed = (text, rect) => {
      if (!text) return;
      if (tooltipTimer) clearTimeout(tooltipTimer);
      removeTooltip();
      tooltipTimer = setTimeout(() => {
        tooltipEl = TooltipUtils.showTooltip(text, rect);
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
      controlContainer.setAttribute('aria-expanded', 'true');

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
      controlContainer.setAttribute('aria-expanded', 'false');
    };

    // ---------------------------------------------------------------------
    // Event listeners
    // ---------------------------------------------------------------------
    const controlContainer = toggleEl.closest('.visualization-control') || toggleEl;
    // Ensure focusability and ARIA compliance
    if (!controlContainer.hasAttribute('tabindex')) {
      controlContainer.setAttribute('tabindex', '0');
    }
    controlContainer.setAttribute('role', 'button');
    controlContainer.setAttribute('aria-haspopup', 'listbox');
    controlContainer.setAttribute('aria-expanded', 'false');
    dropdownEl.setAttribute('role', 'listbox');

    /* ---------------------------------------------------------------
       Keyboard accessibility helpers
    ----------------------------------------------------------------*/
    const getOptionsList = () => Array.from(dropdownEl.querySelectorAll('[data-value]'));
    const moveHighlight = (dir) => {
      const opts = getOptionsList();
      if (opts.length === 0) return;
      let idx = opts.findIndex((el) => el.classList.contains('highlighted'));
      if (idx === -1) idx = opts.findIndex((el) => el.classList.contains('selected'));
      let newIdx = idx + dir;
      if (newIdx < 0) newIdx = opts.length - 1;
      if (newIdx >= opts.length) newIdx = 0;
      opts.forEach((el) => el.classList.remove('highlighted'));
      opts[newIdx].classList.add('highlighted');
      opts[newIdx].scrollIntoView({ block: 'nearest' });
    };
    const selectHighlighted = () => {
      const hl = dropdownEl.querySelector('.highlighted') || dropdownEl.querySelector('.selected');
      if (hl) hl.click();
    };

    // Toggle click
    controlContainer.addEventListener('click', (e) => {
      // If the interactive onboarding wizard is active, close it before we proceed.
      // Wizard.js creates a singleton instance accessible via Wizard.getInstance().
      // However, depending on the bundler/load order, the instance may also be
      // available as a global variable (wizard_instance). We account for both.

      const activeWizard = (() => {
        if (typeof Wizard !== 'undefined' && typeof Wizard.getInstance === 'function') {
          const w = Wizard.getInstance();
          return w && w.wizardActive ? w : null;
        }
        if (typeof window !== 'undefined' && window.wizard_instance && window.wizard_instance.wizardActive) {
          return window.wizard_instance;
        }
        return null;
      })();

      if (activeWizard) {
        try { activeWizard.finishTour(); } catch (_) { /* safeguard – ignore */ }
      }

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
            tooltipEl = TooltipUtils.showTooltip(desc, tgt);
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
          tooltipEl = TooltipUtils.showTooltip(desc, controlContainer);
        }, 500);
      },
      { passive: true },
    );
    controlContainer.addEventListener('touchend', cancelCtrlLongPress, { passive: true });
    controlContainer.addEventListener('touchmove', cancelCtrlLongPress, { passive: true });
    controlContainer.addEventListener('touchcancel', cancelCtrlLongPress, { passive: true });

    // Keyboard interactions
    const handleKeyDown = (e) => {
      const key = e.key;
      const isOpen = dropdownEl.style.display !== 'none' && dropdownEl.style.display !== '';
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        if (!isOpen) {
          open();
        } else {
          selectHighlighted();
        }
        e.preventDefault();
      } else if (key === 'ArrowDown') {
        if (document.querySelector('.driver-popover')) {
          // Ignore arrow keys when help popover is visible
          e.preventDefault();
          return;
        }
        if (!isOpen) {
          open();
        } else {
          moveHighlight(1);
        }
        e.preventDefault();
      } else if (key === 'ArrowUp') {
        if (document.querySelector('.driver-popover')) {
          e.preventDefault();
          return;
        }
        if (!isOpen) {
          open();
        } else {
          moveHighlight(-1);
        }
        e.preventDefault();
      } else if (key === 'Escape') {
        if (isOpen) {
          close();
          controlContainer.focus();
        }
      }
    };
    controlContainer.addEventListener('keydown', handleKeyDown);
    dropdownEl.addEventListener('keydown', handleKeyDown);

    // Public API
    return {
      open,
      close,
      getSelected: () => selected,
      setOptions: rebuildOptions,
    };
  }
} 