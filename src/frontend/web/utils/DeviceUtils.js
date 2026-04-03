// DeviceUtils - unified device capability detection utilities
// Provides a single source of truth for mobile / touch checks that are
// currently duplicated across multiple components.

(function (global) {
  const DeviceUtils = {
    /**
     * Returns true when running on a handheld/touch-first device where the
     * on-screen keyboard is expected (phones, tablets, small touch laptops).
     */
    isMobile() {
      // Basic UA sniff as first heuristic
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      // Generic capability checks – catch e.g. Chrome on Android tablet or
      // desktop browsers in responsive mode with touch emulation.
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const smallScreen = window.innerWidth <= 768; // common tablet breakpoint
      const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

      return isMobileUA || (hasTouch && (smallScreen || coarsePointer));
    },

    /** True if the primary input mechanism is touch (coarse pointer) */
    isTouchDevice() {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0 ||
             (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    },

    /**
     * Extra space to reserve at the bottom of the layout viewport when positioning
     * fixed UI (help bubbles). Narrow phones use screen-vs-inner delta; touch UIs
     * with no hover (tablets, phones) also use outer-inner and visualViewport gap
     * so controls are not placed under browser chrome or the home indicator.
     */
    popoverBottomInset() {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const isNarrow = vw < 500;
      let raw = 0;
      if (isNarrow) {
        raw = Math.max(raw, Math.max(0, window.screen.height - vh));
      }
      const expand = isNarrow || (this.isTouchDevice() && window.matchMedia &&
        window.matchMedia('(hover: none)').matches);
      if (expand) {
        raw = Math.max(raw, Math.min(120, Math.max(0, window.outerHeight - vh)));
        const vv = window.visualViewport;
        if (vv) {
          raw = Math.max(raw, Math.max(0, vh - vv.offsetTop - vv.height));
        }
      }
      return raw + (expand ? 12 : 0);
    }
  };

  // Expose in global namespace for non-module scripts
  global.DeviceUtils = DeviceUtils;

  // Also export for module environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeviceUtils;
  }
})(typeof window !== 'undefined' ? window : this); 