# Mobile Responsiveness Fix Plan

## Overview

This plan addresses critical mobile usability issues reported by users, focusing on pop-up accessibility, header layout optimization, and content adaptation for mobile devices while preserving the desktop experience.

## Reported Issues

- Pop-up buttons are off-screen and unreachable on mobile
- Pop-up content doesn't scroll properly (page scrolls behind it)
- Landing page header takes up almost half the screen
- Navigation links wrap poorly and title is too big
- Simulator header buttons bunch up and overlap
- Horizontal scrolling shows empty space
- Data table is unusable on mobile screens

## **Phase 1: Fix Pop-up/Modal Issues (Critical Priority)**

**Problem**: Pop-up buttons are off-screen, page scrolls behind pop-up instead of pop-up content scrolling

### 1.1 Driver.js Popover Mobile Fixes
- Modify `wizard.css` to add mobile-specific breakpoints for `.driver-popover`
- Add constraints for mobile viewports: 
  - Use `max-height: 90vh` to ensure popovers fit on screen
  - Add `overflow-y: auto` for content scrolling within popover
  - Use `position: fixed` with proper centering
  - Add responsive width: `width: calc(100vw - 40px)` on small screens
- Ensure buttons are always visible by adding `padding-bottom` for button area

### 1.2 Body Scroll Lock During Popover
- Prevent background scrolling when popover is open
- Add CSS class `.driver-active` that sets `body { overflow: hidden; }`

## **Phase 2: Landing Page Header Optimization**

**Problem**: Header takes up half screen, navigation wraps poorly, title too big

### 2.1 Header Height Reduction
- Reduce header padding from `20px` to `12px` on mobile (≤768px)
- Reduce logo font-size from `1.8rem` to `1.4rem` on mobile
- Adjust navigation margins and spacing

### 2.2 Navigation Improvements
- At ≤576px: Stack navigation vertically with reduced gaps
- Implement collapsible hamburger menu for very small screens (≤480px)
- Use better text wrapping for navigation links

### 2.3 Hero Section Optimization
- Reduce hero title from `3rem → 2rem` on mobile
- Reduce subtitle from `2.2rem → 1.8rem` on mobile 
- Reduce hero padding from `80px 0` to `40px 0` on mobile

## **Phase 3: Simulator Page Header Fixes**

**Problem**: Buttons bunch up, overlap, "Buy me a coffee" not visible, logo wraps

### 3.1 Logo Protection
- Ensure "Ireland Financial Simulator" never wraps by:
  - Setting appropriate `min-width` and `flex-shrink: 0` on `.header-left`
  - Reducing font-size progressively on smaller screens if needed
  - Using `white-space: nowrap` and `overflow: hidden` as fallback

### 3.2 Two Layout Approaches to Explore

#### Approach A: Multi-row Layout
- **≤768px**: Stack header content in 2-3 organized rows:
  - Row 1: Logo
  - Row 2: Run Simulation + Status + Demo + Help  
  - Row 3: Save + Load + Coffee (if space allows)
- Optimize spacing and button sizes to fit comfortably
- Ensure Demo and Help buttons remain prominently visible

#### Approach B: Hamburger Menu Layout
- **≤768px**: Keep essential buttons visible (Run Simulation, Status, Demo, Help)
- Move secondary actions (Save, Load, Coffee) to hamburger menu
- **≤576px**: Move more items to hamburger but keep Demo + Help visible
- Hamburger menu slides down from header, doesn't overlay content

### 3.3 Button Priority System (for both approaches)
- **Always Visible**: Run Simulation, Status, Demo, Help
- **Secondary**: Save, Load (visible when space allows)
- **Tertiary**: Coffee (lowest priority for space)

### 3.4 Horizontal Overflow Prevention
- Add `overflow-x: hidden` to header container
- Ensure header width never exceeds `100vw`
- Remove fixed `min-width` constraints that cause overflow

## **Phase 4: Data Table Mobile Strategy**

**Problem**: Table too wide, unusable horizontal scrolling

### 4.1 Progressive Table Hiding
- **≤768px**: Hide data table section entirely
- Show message: "Data table available on larger screens" with button to "View in Desktop Mode"

## **Phase 5: Content Layout Adjustments**

### 5.1 Grid Layout Optimizations
- **≤576px**: Parameters section becomes single column earlier
- Reduce card padding and margins on mobile
- Ensure graphs section remains usable

## **Phase 6: CSS Architecture Changes**

### 6.1 Breakpoint Strategy
```css
/* Mobile-specific media queries - desktop remains unchanged */
@media (max-width: 480px)  /* Small phones */
@media (max-width: 576px)  /* Large phones */  
@media (max-width: 768px)  /* Tablets portrait */
@media (max-width: 992px)  /* Tablets landscape */
```

### 6.2 New CSS Custom Properties (mobile-only)
```css
@media (max-width: 768px) {
  :root {
    --mobile-header-height: 120px;  /* vs desktop 60px */
    --mobile-padding: 16px;         /* vs desktop 20px+ */
    --mobile-gap: 12px;            /* vs desktop 18px+ */
  }
}
```

## **Implementation Order & Testing Strategy**

1. **Phase 1** (Pop-ups) - Test on real devices immediately
2. **Phase 2** (Landing header) - Test navigation usability  
3. **Phase 3A** (Multi-row approach) - Test button accessibility and layout
4. **Phase 3B** (Hamburger approach) - Compare with 3A, choose best solution
5. **Phase 4** (Table hiding) - Verify no layout breaks
6. **Phase 5** (Content) - Full mobile workflow testing
7. **Phase 6** (Architecture) - Performance and maintenance

## **Key Design Principles**

- **Desktop-First Preservation**: Zero changes to desktop experience (≥992px)
- **Mobile Adaptation**: Site works well on phones without forcing desktop mode
- **Essential Function Access**: Demo and Help buttons always visible for user onboarding
- **Content Priority**: Critical functions accessible, secondary functions space-permitting
- **No Horizontal Scroll**: Never require horizontal scrolling on mobile
- **Progressive Enhancement**: Enhanced experience on larger screens, functional on all screens

## **Phase 3 Decision Criteria**

We'll implement both approaches and test:
- **Multi-row**: Better for immediate access to all functions
- **Hamburger**: Cleaner look, might be more familiar to mobile users
- **Decision factors**: User testing feedback, visual clarity, ease of use for new users

## **Success Metrics**

- Pop-ups are fully accessible and scrollable on mobile
- Landing page header uses ≤25% of screen height on mobile
- All simulator functions accessible without horizontal scrolling
- Demo and Help buttons prominently visible for new user onboarding
- Desktop experience remains completely unchanged
- No layout breaks or overlapping elements on any screen size

## **Files to Modify**

- `src/frontend/web/ifs/css/wizard.css` - Pop-up fixes
- `src/frontend/web/landing/styles.css` - Landing page header
- `src/frontend/web/ifs/css/simulator.css` - Simulator header
- `src/frontend/web/ifs/css/layout.css` - Grid and table layout
- `src/frontend/web/ifs/index.html` - Potential header structure changes
- `src/frontend/web/landing/index.html` - Landing page structure if needed 