/* TooltipUtils.js - reusable hover / long-press tooltip helper */

class TooltipUtils {
  /**
   * Attach a visualization-style tooltip to a DOM element.
   * @param {HTMLElement} element            – Target element.
   * @param {string}      text               – Tooltip text.
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

    const createTooltip = (msg) => {
      const el = document.createElement('div');
      el.className = 'visualization-tooltip';
      el.textContent = msg;
      document.body.appendChild(el);
      return el;
    };

    const positionTooltip = (el, targetRect) => {
      const rect     = el.getBoundingClientRect();
      const vpW      = window.innerWidth;
      const margin   = 10;

      let left = targetRect.left + (targetRect.width - rect.width) / 2;
      if (left < margin) left = margin;
      if (left + rect.width > vpW - margin) left = vpW - rect.width - margin;

      let top = targetRect.top - rect.height - 10;
      if (top < margin) top = targetRect.bottom + 10;

      el.style.position = 'fixed';
      el.style.left     = `${left}px`;
      el.style.top      = `${top}px`;
      el.style.transform = 'none';
    };

    const showTooltip = () => {
      if (tooltipEl) return;
      tooltipEl = createTooltip(text);
      requestAnimationFrame(() => {
        positionTooltip(tooltipEl, element.getBoundingClientRect());
        tooltipEl.classList.add('visible');
      });
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
        tooltipEl.remove();
        tooltipEl = null;
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
} 