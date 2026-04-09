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
   * @returns {Object} { open, close, getSelected, setOptions, wrapper }
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

    // BEGIN ADD: Global Escape key handler (one-time registration)
    if (!window.__dropdownEscHandlerRegistered) {
      window.__dropdownEscHandlerRegistered = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
          if (window.__openDropdowns && window.__openDropdowns.size > 0) {
            // Clone set to avoid mutation during iteration
            const openDropdowns = Array.from(window.__openDropdowns);
            openDropdowns.forEach((closer) => {
              try { closer(); } catch (_) { /* ignore individual errors */ }
            });
          }
        }
      });
    }
    // END ADD: Global Escape key handler

    if (!toggleEl || !dropdownEl) {
      console.error('DropdownUtils: toggleEl and dropdownEl are required');
      return null;
    }

    // Create a wrapper around the toggle element to make it compatible with validation
    const wrapper = document.createElement('div');
    wrapper.className = 'dropdown-wrapper';
    
    // Insert the wrapper in the DOM
    if (toggleEl.parentNode) {
      toggleEl.parentNode.insertBefore(wrapper, toggleEl);
      wrapper.appendChild(toggleEl);
    }

    // Forward properties and methods to make the wrapper compatible with validation system
    wrapper.style = toggleEl.style;
    wrapper.setAttribute = function(name, value) {
      if (name === 'data-tooltip') {
        toggleEl.setAttribute(name, value);
      }
      return HTMLElement.prototype.setAttribute.call(this, name, value);
    };
    wrapper.removeAttribute = function(name) {
      if (name === 'data-tooltip') {
        toggleEl.removeAttribute(name);
      }
      return HTMLElement.prototype.removeAttribute.call(this, name);
    };

    // Forward relevant events from wrapper to toggle element
    const forwardEvents = ['mouseenter', 'mouseleave', 'focus', 'blur'];
    forwardEvents.forEach(eventName => {
      wrapper.addEventListener(eventName, (e) => {
        // Stop the original event from propagating to prevent infinite recursion
        e.stopPropagation();
        
        // Create a new event that doesn't bubble to prevent it from coming back to the wrapper
        const newEvent = new Event(eventName, { bubbles: false });
        toggleEl.dispatchEvent(newEvent);
      });
    });

    // Historical behavior let callers pass a fixed width. We now size to content.
    // Keep any provided width only as a soft hint for minimum width; the actual width
    // is computed on open() to fit the widest option (no wrapping).
    if (width) {
      const hinted = typeof width === 'number' ? `${width}px` : width;
      dropdownEl.style.minWidth = hinted;
      // Do NOT set dropdownEl.style.width here; we'll compute exact width on open.
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
    let __dropdownTouchStartY = 0;
    const measureSafeAreaTop = () => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);';
      document.body.appendChild(probe);
      const value = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      probe.remove();
      return value;
    };
    const measureSafeAreaBottom = () => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:0;bottom:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom);';
      document.body.appendChild(probe);
      const value = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      probe.remove();
      return value;
    };
    const updateScrollIndicators = () => {
      const canScroll = dropdownEl.scrollHeight > (dropdownEl.clientHeight + 1);
      const atTop = dropdownEl.scrollTop <= 1;
      const atBottom = (dropdownEl.scrollTop + dropdownEl.clientHeight) >= (dropdownEl.scrollHeight - 1);
      dropdownEl.classList.toggle('dd-scrollable', canScroll);
      dropdownEl.classList.toggle('dd-scroll-top', atTop);
      dropdownEl.classList.toggle('dd-scroll-bottom', atBottom);
    };
    dropdownEl.addEventListener('scroll', updateScrollIndicators, { passive: true });

    // ---------------------------------------------------------------------
    // DOM helpers
    // ---------------------------------------------------------------------
    const rebuildOptions = (opts) => {
      if (!Array.isArray(opts)) return;
      const hasExplicitSelected = opts.some(opt => opt && Object.prototype.hasOwnProperty.call(opt, 'selected'));
      if (hasExplicitSelected) {
        selected = undefined;
        for (let i = 0; i < opts.length; i++) {
          const opt = opts[i];
          if (opt && opt.selected) {
            selected = opt.value;
            break;
          }
        }
      }
      const hdrNode = dropdownEl.querySelector('.dropdown-header');
      dropdownEl.innerHTML = '';
      if (hdrNode) dropdownEl.appendChild(hdrNode);
      opts.forEach((opt) => {
        if (!opt) return;
        const div = document.createElement('div');
        div.setAttribute('data-value', opt.value);
        div.setAttribute('role', 'option');
        div.textContent = opt.label;

        // Apply optional description for tooltip support
        if (opt.description) div.setAttribute('data-description', opt.description);

        // Generic support for additional class names (single string or array)
        if (opt.className) {
          (Array.isArray(opt.className) ? opt.className : [opt.className])
            .forEach(cls => div.classList.add(cls));
        }

        // Optional inline style string (e.g., "font-size: 1rem; font-weight:600;")
        if (opt.style) {
          div.style.cssText += opt.style;
        }

        const isSelected = hasExplicitSelected ? !!opt.selected : opt.value === selected;
        if (isSelected) div.classList.add('selected');
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
      window.__openDropdowns.forEach((closer) => closer());

      dropdownEl.style.display = 'block';
      dropdownEl.style.visibility = 'hidden';

      const iconRect = toggleEl.getBoundingClientRect();
      const ddRect = dropdownEl.getBoundingClientRect();
      const vpH = window.innerHeight;
      const vv = window.visualViewport;
      const viewportTop = vv ? vv.offsetTop : 0;
      const viewportHeight = vv ? vv.height : vpH;
      const isTouchViewport = (window.innerWidth <= 768) && ((navigator && navigator.maxTouchPoints > 0) || ('ontouchstart' in window));
      const browserUiReserve = isTouchViewport ? Math.min(80, Math.max(0, (window.outerHeight || vpH) - vpH)) : 0;
      const safeAreaTop = measureSafeAreaTop();
      const safeAreaBottom = measureSafeAreaBottom();
      const topUiReserve = isTouchViewport ? Math.max(24, Math.round(safeAreaTop + 8)) : Math.round(safeAreaTop);
      const bottomUiReserve = isTouchViewport ? Math.max(Math.round(safeAreaBottom), Math.round(browserUiReserve + 24)) : Math.round(safeAreaBottom);
      const viewportTopAdjusted = viewportTop + topUiReserve;
      const viewportBottomAdjusted = viewportTop + Math.max(120, viewportHeight - bottomUiReserve);
      const spaceBelow = viewportBottomAdjusted - iconRect.bottom;
      const spaceAbove = iconRect.top - viewportTopAdjusted;
      const availableDropdownHeight = Math.max(120, Math.floor(viewportBottomAdjusted - viewportTopAdjusted - 20));
      const maxDropdownHeight = availableDropdownHeight;
      dropdownEl.style.maxHeight = `${maxDropdownHeight}px`;
      dropdownEl.style.overflowY = 'auto';
      dropdownEl.style.overflowX = 'hidden';
      dropdownEl.style.webkitOverflowScrolling = 'touch';
      dropdownEl.style.touchAction = 'pan-y';
      const ddH = Math.min(ddRect.height, maxDropdownHeight);



      dropdownEl.style.position = 'fixed';
      dropdownEl.style.zIndex = '10051';

      // Compute natural width based on content (no wrap) and add a small margin
      // Steps:
      // 1) Temporarily allow the dropdown to shrink-to-fit content
      // 2) Force no-wrapping to avoid multi-line items affecting width
      // 3) Measure scrollWidth, then apply an extra margin
      const previousWidth = dropdownEl.style.width;
      const previousWhiteSpace = dropdownEl.style.whiteSpace;
      dropdownEl.style.whiteSpace = 'nowrap';
      dropdownEl.style.width = 'auto';

      // If the dropdown lives in a constrained container before body-append,
      // use scrollWidth which reflects full content width even if overflowed.
      const contentWidth = Math.ceil(dropdownEl.scrollWidth);
      const EXTRA_MARGIN_PX = 12; // small padding so text isn't cramped
      let desiredWidth = contentWidth + EXTRA_MARGIN_PX;

      // Ensure width is at least any hinted minWidth
      const hintedMin = parseFloat(getComputedStyle(dropdownEl).minWidth) || 0;
      if (hintedMin > 0) desiredWidth = Math.max(desiredWidth, Math.ceil(hintedMin));

      // Apply computed width
      dropdownEl.style.width = `${desiredWidth}px`;

      // Vertical placement (with centered fallback in constrained mobile viewports)
      let placementStrategy = 'center-fallback';
      let topValue = viewportTopAdjusted + 10;
      if (spaceBelow >= ddH + 10) {
        placementStrategy = 'below';
        topValue = iconRect.bottom + 2;
      } else {
        const aboveTop = iconRect.top - ddH - 2;
        if (spaceAbove >= ddH + 10 && aboveTop >= viewportTopAdjusted + 10) {
          placementStrategy = 'above';
          topValue = aboveTop;
        } else {
          placementStrategy = 'center-fallback';
          const centeredTop = viewportTopAdjusted + ((viewportBottomAdjusted - viewportTopAdjusted - ddH) / 2);
          topValue = centeredTop;
        }
      }
      topValue = Math.max(viewportTopAdjusted + 10, Math.min(topValue, viewportBottomAdjusted - ddH - 10));
      dropdownEl.style.top = `${topValue}px`;

      // Horizontal placement: align to toggle's left, but keep within viewport
      const vpW = window.innerWidth;
      let left = iconRect.left;
      const overflowRight = left + desiredWidth + 8 - vpW; // 8px safety margin
      if (overflowRight > 0) {
        left = Math.max(8, vpW - desiredWidth - 8);
      }
      dropdownEl.style.left = `${left}px`;

      // Restore visibility and finalize
      dropdownEl.style.whiteSpace = previousWhiteSpace || 'nowrap';

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
      updateScrollIndicators();
    }

    const close = () => {
      dropdownEl.style.display = 'none';
      dropdownEl.querySelectorAll('.highlighted').forEach((n) => n.classList.remove('highlighted'));
      window.__openDropdowns.delete(close);
      dropdownEl.classList.remove('dd-scrollable', 'dd-scroll-top', 'dd-scroll-bottom');
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
      removeTooltip();
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
      // Don't show tooltip if the wrapper has a warning class
      if (wrapper.classList.contains('warning')) return;
      
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
        const touch = e.touches && e.touches[0];
        __dropdownTouchStartY = touch ? touch.clientY : 0;
        // Always prefer showing the item's own tooltip on long-press when the menu is open
        longPressTimer = setTimeout(() => {
          const desc = tgt.getAttribute('data-description');
          if (desc) {
            tooltipEl = TooltipUtils.showTooltip(desc, tgt);
          }
        }, 600);
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
    dropdownEl.addEventListener('touchmove', (e) => {
      cancelLongPress();
      const touch = e.touches && e.touches[0];
      const currentY = touch ? touch.clientY : __dropdownTouchStartY;
      const deltaY = currentY - __dropdownTouchStartY;
      const canScroll = dropdownEl.scrollHeight > dropdownEl.clientHeight;
      const atTop = dropdownEl.scrollTop <= 0;
      const atBottom = (dropdownEl.scrollTop + dropdownEl.clientHeight) >= (dropdownEl.scrollHeight - 1);
      if (!canScroll || ((atTop && deltaY > 0) || (atBottom && deltaY < 0))) {
        e.preventDefault();
      }
      e.stopPropagation();
    }, { passive: false });
    dropdownEl.addEventListener('wheel', (e) => {
      const canScroll = dropdownEl.scrollHeight > dropdownEl.clientHeight;
      const atTop = dropdownEl.scrollTop <= 0;
      const atBottom = (dropdownEl.scrollTop + dropdownEl.clientHeight) >= (dropdownEl.scrollHeight - 1);
      if (!canScroll || ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0))) {
        e.preventDefault();
      }
      e.stopPropagation();
    }, { passive: false });
    dropdownEl.addEventListener('touchcancel', cancelLongPress, { passive: true });

    // Prevent native context menu/callouts on long-press within dropdown items
    dropdownEl.addEventListener('contextmenu', (e) => {
      try { e.preventDefault(); } catch (_) {}
    }, { capture: true });

    /* ---------------------------------------------------------------
       Mobile long-press on the control itself (when dropdown closed)
       Opens help wizard for the control; falls back to tooltip
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
        
        // Don't show tooltip if the wrapper has a warning class
        if (wrapper.classList.contains('warning')) return;

        ctrlLongPressTimer = setTimeout(() => {
          try {
            const wizard = (typeof Wizard !== 'undefined' && typeof Wizard.getInstance === 'function') ? Wizard.getInstance() : null;
            if (wizard && !wizard.wizardActive) {
              // Focus the toggle element for exact step match
              wizard.lastFocusedField = toggleEl;
              wizard.lastFocusedWasInput = true;
              wizard.start({ type: 'help' });
              return;
            }
          } catch (_) {}
          const sel = dropdownEl.querySelector('.selected');
          if (!sel) return;
          const desc = sel.getAttribute('data-description');
          if (!desc) return;
          tooltipEl = TooltipUtils.showTooltip(desc, controlContainer);
        }, 600);
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
    const setValue = (value, label) => {
      selected = (value === undefined || value === null) ? '' : String(value);
      let matched = null;
      dropdownEl.querySelectorAll('[data-value]').forEach((el) => {
        const isSelected = String(el.getAttribute('data-value') || '') === selected;
        el.classList.toggle('selected', isSelected);
        if (isSelected) matched = el;
      });
      if (toggleEl) {
        if (label !== undefined && label !== null && String(label) !== '') {
          toggleEl.textContent = String(label);
        } else if (matched) {
          toggleEl.textContent = matched.textContent;
        }
      }
    };

    return {
      open,
      close,
      getSelected: () => selected,
      setOptions: rebuildOptions,
      setValue,
      wrapper // Expose wrapper for reference
    };
  }
}
