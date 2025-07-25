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
    }
  };

  // Expose in global namespace for non-module scripts
  global.DeviceUtils = DeviceUtils;

  // Also export for module environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeviceUtils;
  }
})(typeof window !== 'undefined' ? window : this); 