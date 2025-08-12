/* TooltipUtils.js - reusable hover / long-press tooltip helper */

class TooltipUtils {
  /**
   * Attach a visualization-style tooltip to a DOM element.
   * @param {HTMLElement} element                 – Target element.
   * @param {string|Function} textOrProvider      – Tooltip text or a function () => string (supports markdown).
   * @param {Object}      [opts]                  – Optional settings.
   * @param {number}      [opts.hoverDelay]       – Delay (ms) before showing on hover.
   * @param {number}      [opts.touchDelay]       – Delay (ms) before showing on long-press (touch).
   * @param {boolean}     [opts.showOnFocus]      – If true, show immediately when the element receives focus.
   * @param {boolean}     [opts.persistWhileFocused] – If true, keep visible while the element has focus (hide on blur).
   * @param {boolean}     [opts.suppressTouchLongPress] – If true, disable touch long-press behavior for this tooltip.
   * @param {boolean}     [opts.hideOnWizard]     – If true, hide the tooltip when the help wizard (driver popover) appears.
   */
  static attachTooltip(element, textOrProvider, opts = {}) {
    if (!element || !textOrProvider) return;

    // Remove native browser tooltip to avoid duplication
    element.removeAttribute('title');

    const HOVER_DELAY  = opts.hoverDelay  ?? 600;
    const TOUCH_DELAY  = opts.touchDelay  ?? 500;
    const SHOW_ON_FOCUS = !!opts.showOnFocus;
    const PERSIST_FOCUS = !!opts.persistWhileFocused;
    const SUPPRESS_TOUCH = !!opts.suppressTouchLongPress;
    const HIDE_ON_WIZARD = !!opts.hideOnWizard;

    let tooltipEl      = null;
    let hoverTimeout   = null;
    let longPressTimer = null;
    let liveUpdateHandler = null;
    let wizardObserver = null;

    const showTooltip = () => {
      if (tooltipEl) return;
      tooltipEl = TooltipUtils.showTooltip(textOrProvider, element, opts);
      
      // Add highlight effect for TD elements
      if (element.tagName === 'TD') {
        element.classList.add('tooltip-highlighted');
      }

      // Live update tooltip content while the user edits the input value
      if (tooltipEl && element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
        liveUpdateHandler = () => {
          try {
            TooltipUtils.refreshTooltip(tooltipEl, textOrProvider, element, opts);
          } catch (_) {}
        };
        element.addEventListener('input', liveUpdateHandler);
        element.addEventListener('change', liveUpdateHandler);
      }
      // Hide when the help wizard appears (optional)
      if (HIDE_ON_WIZARD) {
        try {
          // Observe both attribute changes on body and popover insertions
          const body = document.body;
          const callback = (mutationsList) => {
            for (const m of mutationsList) {
              if (m.type === 'attributes' && m.attributeName === 'data-wizard-active') {
                if (body.getAttribute('data-wizard-active') === 'true') {
                  hideTooltip();
                  return;
                }
              }
              if (m.type === 'childList') {
                const added = Array.from(m.addedNodes || []);
                if (added.some((n) => n.nodeType === 1 && n.classList && n.classList.contains('driver-popover'))) {
                  hideTooltip();
                  return;
                }
              }
            }
          };
          wizardObserver = new MutationObserver(callback);
          wizardObserver.observe(body, { attributes: true, attributeFilter: ['data-wizard-active'], childList: true, subtree: true });
        } catch (_) {}
      }
    };

    const hideTooltip = () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (wizardObserver) {
        try { wizardObserver.disconnect(); } catch (_) {}
        wizardObserver = null;
      }
      if (tooltipEl) {
        TooltipUtils.hideTooltip(tooltipEl);
        tooltipEl = null;
      }
      
      // Remove highlight effect for TD elements
      if (element.tagName === 'TD') {
        element.classList.remove('tooltip-highlighted');
      }

      // Remove live update listeners
      if (liveUpdateHandler && element) {
        try { element.removeEventListener('input', liveUpdateHandler); } catch (_) {}
        try { element.removeEventListener('change', liveUpdateHandler); } catch (_) {}
        liveUpdateHandler = null;
      }
    };

    // Desktop hover events
    element.addEventListener('mouseenter', () => {
      if (window.innerWidth <= 768) return;
      hoverTimeout = setTimeout(showTooltip, HOVER_DELAY);
    });
    element.addEventListener('mouseleave', () => {
      if (PERSIST_FOCUS && (document.activeElement === element || (element.matches && element.matches(':focus')))) {
        return; // keep tooltip visible while focused
      }
      hideTooltip();
    });

    // Mobile long-press events
    if (!SUPPRESS_TOUCH) {
      element.addEventListener('touchstart', () => {
        if (window.innerWidth > 768) return;
        longPressTimer = setTimeout(showTooltip, TOUCH_DELAY);
      }, { passive: true });
      const touchHide = () => {
        if (PERSIST_FOCUS && (document.activeElement === element || (element.matches && element.matches(':focus')))) {
          return; // keep visible while focused
        }
        hideTooltip();
      };
      element.addEventListener('touchend',   touchHide, { passive: true });
      element.addEventListener('touchmove',  touchHide, { passive: true });
      element.addEventListener('touchcancel',touchHide, { passive: true });
    }

    // Focus behavior (optional)
    if (SHOW_ON_FOCUS) {
      element.addEventListener('focus', () => {
        // Show immediately on focus
        try { showTooltip(); } catch (_) {}
      });
      element.addEventListener('blur', () => {
        try { hideTooltip(); } catch (_) {}
      });
    }
  }

  /**
   * Show a tooltip programmatically.
   * Performs variable substitution like the Wizard does.
   * @param {string|Function} textOrProvider - Tooltip text (or provider) with optional ${} variables/markdown
   * @param {HTMLElement|DOMRect} target - Target element or its bounding rectangle
   * @param {Object} [opts] - Options
   * @param {boolean} [opts.isMobile] - Whether to use mobile positioning
   * @param {number} [opts.margin] - Margin from viewport edges
   * @param {number} [opts.spacing] - Spacing from target element
   * @returns {HTMLElement} - The created tooltip element
   */
  static showTooltip(textOrProvider, target, opts = {}) {
    if (!textOrProvider) return null;

    // Resolve text value if a provider function was passed
    let rawText;
    try {
      rawText = (typeof textOrProvider === 'function') ? textOrProvider() : textOrProvider;
    } catch (_) {
      rawText = '';
    }
    if (!rawText) return null;

    // Apply variable substitution and placeholders in the same way Wizard does
    try {
      if (typeof FormatUtils !== 'undefined') {
        // Guard against re-entrant WebUI/Config initialization from very early calls
        rawText = String(rawText);
        rawText = FormatUtils.processVariables(rawText);
        rawText = FormatUtils.replaceAgeYearPlaceholders(rawText);
      }
    } catch (_) {}

    const tooltipEl = TooltipUtils.createTooltipElement(rawText);
    // Allow callers to specify an extra class to customize styling
    try {
      if (opts && typeof opts.tooltipClass === 'string' && opts.tooltipClass.trim().length > 0) {
        tooltipEl.classList.add(opts.tooltipClass.trim());
      }
    } catch (_) {}
    document.body.appendChild(tooltipEl);

    const targetRect = target instanceof HTMLElement ? target.getBoundingClientRect() : target;
    
    requestAnimationFrame(() => {
      TooltipUtils.positionTooltip(tooltipEl, targetRect, opts);
      tooltipEl.classList.add('visible');
    });

    return tooltipEl;
  }

  /**
   * Refresh an existing tooltip's content and reposition it.
   * @param {HTMLElement} tooltipEl - The tooltip element to update
   * @param {string|Function} textOrProvider - Tooltip text or provider
   * @param {HTMLElement|DOMRect} target - Target to position against
   * @param {Object} [opts] - Options for positioning
   */
  static refreshTooltip(tooltipEl, textOrProvider, target, opts = {}) {
    if (!tooltipEl || !textOrProvider) return;
    let rawText;
    try {
      rawText = (typeof textOrProvider === 'function') ? textOrProvider() : textOrProvider;
    } catch (_) {
      rawText = '';
    }
    if (!rawText) return;

    try {
      if (typeof FormatUtils !== 'undefined') {
        rawText = String(rawText);
        rawText = FormatUtils.processVariables(rawText);
        rawText = FormatUtils.replaceAgeYearPlaceholders(rawText);
      }
    } catch (_) {}

    // Format markdown and update DOM
    try {
      const hasBasicMarkdown = /[*_`#\[\]()>]/.test(rawText);
      const hasMarkdownTable = /(^|\n)\|[^\n]*\|\s*(\n)\|\s*[-: ]+\s*\|/m.test(rawText) || /(^|\n)\|[^\n]*\|/m.test(rawText);
      if (typeof marked !== 'undefined' && (hasBasicMarkdown || hasMarkdownTable)) {
        tooltipEl.innerHTML = marked.parse(rawText);
      } else {
        tooltipEl.textContent = rawText;
      }
    } catch (_) {
      tooltipEl.textContent = rawText;
    }

    const targetRect = target instanceof HTMLElement ? target.getBoundingClientRect() : target;
    if (targetRect) {
      requestAnimationFrame(() => {
        TooltipUtils.positionTooltip(tooltipEl, targetRect, opts);
      });
    }
  }

  /**
   * Hide a tooltip element.
   * @param {HTMLElement} tooltipEl - The tooltip element to hide
   */
  static hideTooltip(tooltipEl) {
    if (tooltipEl && tooltipEl.parentNode) {
      tooltipEl.remove();
    }
  }

  /**
   * Create a tooltip element with formatted text (supports markdown).
   * Variable placeholders are expected to be resolved before calling this.
   * @param {string} text - Tooltip text
   * @returns {HTMLElement} - The created tooltip element
   */
  static createTooltipElement(text) {
    const el = document.createElement('div');
    el.className = 'visualization-tooltip';
    
    // Format markdown if available and text contains markdown/table syntax
    let formattedText = text;
    try {
      const hasBasicMarkdown = /[*_`#\[\]()>]/.test(text);
      const hasMarkdownTable = /(^|\n)\|[^\n]*\|\s*(\n)\|\s*[-: ]+\s*\|/m.test(text) || /(^|\n)\|[^\n]*\|/m.test(text);
      if (typeof marked !== 'undefined' && (hasBasicMarkdown || hasMarkdownTable)) {
        formattedText = marked.parse(text);
      }
    } catch (_) {}
    
    if (formattedText !== text) {
      el.innerHTML = formattedText;
    } else {
      el.textContent = text;
    }
    
    return el;
  }

  /**
   * Position a tooltip element relative to a target element.
   * @param {HTMLElement} tooltipEl - The tooltip element to position
   * @param {DOMRect} targetRect - The target element's bounding rectangle
   * @param {Object} [opts] - Positioning options
   * @param {boolean} [opts.isMobile] - Whether to use mobile positioning
   * @param {number} [opts.margin] - Margin from viewport edges
   * @param {number} [opts.spacing] - Spacing from target element
   */
  static positionTooltip(tooltipEl, targetRect, opts = {}) {
    const isMobile = opts.isMobile ?? window.innerWidth <= 768;
    const vpH = window.innerHeight;
    const vpW = window.innerWidth;
    const margin = opts.margin ?? (isMobile ? 20 : 10);
    const spacing = opts.spacing ?? (isMobile ? 15 : 10);

    const ttRect = tooltipEl.getBoundingClientRect();
    let left = targetRect.left + (targetRect.width - ttRect.width) / 2;
    let top = targetRect.top - ttRect.height - spacing;

    if (top < margin) top = targetRect.bottom + spacing;
    if (top + ttRect.height > vpH - margin) top = Math.max(margin, vpH - ttRect.height - margin);

    if (left < margin) left = margin;
    if (left + ttRect.width > vpW - margin) left = vpW - ttRect.width - margin;

    tooltipEl.style.position = 'fixed';
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.transform = 'none';
  }
} 