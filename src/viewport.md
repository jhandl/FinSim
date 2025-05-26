## Implementation Plan

Based on the expert's recommendations, here's my proposed solution:

### Phase 1: Update Viewport Meta Tag ✅ COMPLETED
- Add `viewport-fit=cover` to explicitly handle safe areas
- This tells the browser we're prepared to handle edge-to-edge content

### Phase 2: Replace Static Viewport Units ✅ COMPLETED
- Replace `100vh` with `100dvh` (dynamic viewport height)
- Replace `100vw` with `100dvw` where appropriate
- Add safe area insets for proper spacing

### Phase 3: Implement Safe Area Handling ✅ COMPLETED
- Add CSS environment variables for safe areas
- Apply appropriate padding/margins to prevent content from being hidden
- Ensure header and footer respect safe areas

### Phase 4: Test and Refine
- Test on actual devices to verify the fix
- Adjust spacing and layout as needed

## Specific Changes Made

1. **index.html**: ✅ Updated viewport meta tag and container styles
2. **simulator.css**: ✅ Updated body, header, and main layout styles
3. **layout.css**: ✅ Updated main content area and responsive breakpoints
4. **landing/index.html**: ✅ Updated viewport meta tag
5. **landing/styles.css**: ✅ Added safe area support

## Changes Implemented

### Viewport Meta Tags
- Added `viewport-fit=cover` to all HTML files
- This enables edge-to-edge content handling

### Dynamic Viewport Units
- Replaced `100vh` with `100dvh` (with fallbacks)
- Replaced `100vw` with `100dvw` 
- Added CSS custom properties for browser compatibility

### Safe Area Insets
- Added `env(safe-area-inset-*)` with fallback values
- Applied to body, header, and footer elements
- Ensures content doesn't get hidden behind browser UI

### Browser Compatibility
- Added `@supports` queries for dynamic viewport units
- Provided fallback values for all `env()` functions
- Maintains compatibility with older browsers

### Landscape Mode Optimizations
- Added `@media (orientation: landscape)` queries for short screens
- Reduced header padding and margins in landscape mode
- Made graphs more compact (280px-400px vs 360px-540px)
- Enhanced safe area handling for landscape orientation
- Optimized mobile header layout for landscape viewing

## Testing Instructions

1. **Test on Physical Device**: Access the site on your Pixel 7 in landscape mode
2. **Check Header Layout**: Verify header stays in 2 rows instead of wrapping to 3
3. **Verify Content Space**: Ensure adequate space for main content
4. **Test Rotation**: Check both portrait and landscape orientations
5. **Browser UI Behavior**: Test with address bar visible/hidden states

## Expected Results

- Header should maintain 2-row layout on Pixel 7 landscape
- More consistent behavior between Chrome DevTools and real device
- Better utilization of available screen space
- Content should not be hidden behind browser UI elements
