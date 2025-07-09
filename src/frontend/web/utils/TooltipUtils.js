/* TooltipUtils.js - reusable hover / long-press tooltip helper */

class TooltipUtils {
  /**
   * Attach a visualization-style tooltip to a DOM element.
   * @param {HTMLElement} element            – Target element.
   * @param {string}      text               – Tooltip text (supports markdown).
   * @param {Object}      [opts]             – Optional settings.
   * @param {number}      [opts.hoverDelay]  – Delay (ms) before showing on hover.
   * @param {number}      [opts.touchDelay]  – Delay (ms) before showing on long-press (touch).
   */
  static attachTooltip(element, text, opts = {}) {
    if (!element || !text) return;

    // Remove native browser tooltip to avoid duplication
    element.removeAttribute('title');

    const HOVER_DELAY  = opts.hoverDelay  ?? 600;
    const TOUCH_DELAY  = opts.touchDelay  ?? 500;

    let tooltipEl      = null;
    let hoverTimeout   = null;
    let longPressTimer = null;

    const showTooltip = () => {
      if (tooltipEl) return;
      tooltipEl = TooltipUtils.showTooltip(text, element);
      
      // Add highlight effect for TD elements
      if (element.tagName === 'TD') {
        element.classList.add('tooltip-highlighted');
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
      if (tooltipEl) {
        TooltipUtils.hideTooltip(tooltipEl);
        tooltipEl = null;
      }
      
      // Remove highlight effect for TD elements
      if (element.tagName === 'TD') {
        element.classList.remove('tooltip-highlighted');
      }
    };

    // Desktop hover events
    element.addEventListener('mouseenter', () => {
      if (window.innerWidth <= 768) return;
      hoverTimeout = setTimeout(showTooltip, HOVER_DELAY);
    });
    element.addEventListener('mouseleave', hideTooltip);

    // Mobile long-press events
    element.addEventListener('touchstart', () => {
      if (window.innerWidth > 768) return;
      longPressTimer = setTimeout(showTooltip, TOUCH_DELAY);
    }, { passive: true });
    element.addEventListener('touchend',   hideTooltip, { passive: true });
    element.addEventListener('touchmove',  hideTooltip, { passive: true });
    element.addEventListener('touchcancel',hideTooltip, { passive: true });
  }

  /**
   * Show a tooltip programmatically.
   * @param {string} text - Tooltip text (supports markdown)
   * @param {HTMLElement|DOMRect} target - Target element or its bounding rectangle
   * @param {Object} [opts] - Options
   * @param {boolean} [opts.isMobile] - Whether to use mobile positioning
   * @param {number} [opts.margin] - Margin from viewport edges
   * @param {number} [opts.spacing] - Spacing from target element
   * @returns {HTMLElement} - The created tooltip element
   */
  static showTooltip(text, target, opts = {}) {
    if (!text) return null;

    const tooltipEl = TooltipUtils.createTooltipElement(text);
    document.body.appendChild(tooltipEl);

    const targetRect = target instanceof HTMLElement ? target.getBoundingClientRect() : target;
    
    requestAnimationFrame(() => {
      TooltipUtils.positionTooltip(tooltipEl, targetRect, opts);
      tooltipEl.classList.add('visible');
    });

    return tooltipEl;
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
   * Create a tooltip element with formatted text.
   * @param {string} text - Tooltip text (supports markdown)
   * @returns {HTMLElement} - The created tooltip element
   */
  static createTooltipElement(text) {
    const el = document.createElement('div');
    el.className = 'visualization-tooltip';
    
    // Format markdown if available and text contains markdown syntax
    const formattedText = typeof marked !== 'undefined' && /[*_`#\[\]()>]/.test(text) 
      ? marked.parse(text) 
      : text;
    
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