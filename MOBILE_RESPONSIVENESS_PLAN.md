# Mobile Responsiveness Fix Plan

## Overview

This plan addresses critical mobile usability issues reported by users, focusing on header layout optimization, and content adaptation for mobile devices while preserving the desktop experience.

## Reported Issues

- Landing page header takes up almost half the screen
- Navigation links wrap poorly and title is too big
- Simulator header buttons bunch up and overlap
- Horizontal scrolling shows empty space
- Data table is unusable on mobile screens

## **Phase 1: Landing Page Header Optimization**

**Problem**: Header takes up half screen, navigation wraps poorly, title too big

### 1.1 Header Height Reduction
- Reduce header padding from `20px` to `12px` on mobile (≤768px)
- Reduce logo font-size from `1.8rem` to `1.4rem` on mobile
- Adjust navigation margins and spacing

### 1.2 Navigation Improvements
- At ≤576px: Stack navigation vertically with reduced gaps
- Implement collapsible hamburger menu for very small screens (≤480px)
- Use better text wrapping for navigation links

### 1.3 Hero Section Optimization
- Reduce hero title from `3rem → 2rem` on mobile
- Reduce subtitle from `2.2rem → 1.8rem` on mobile 
- Reduce hero padding from `80px 0` to `40px 0` on mobile

## **Phase 2: Simulator Page Header Fixes**

**Problem**: Buttons bunch up, overlap, "Buy me a coffee" not visible, logo wraps

### 2.1 Logo Protection
- Ensure "Ireland Financial Simulator" never wraps by:
  - Setting appropriate `min-width` and `flex-shrink: 0` on `.header-left`
  - Reducing font-size progressively on smaller screens if needed
  - Using `white-space: nowrap` and `overflow: hidden` as fallback

### 2.2 Two Layout Approaches to Explore

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

### 2.3 Button Priority System (for both approaches)
- **Always Visible**: Run Simulation, Status, Demo, Help
- **Secondary**: Save, Load (visible when space allows)
- **Tertiary**: Coffee (lowest priority for space)

### 2.4 Horizontal Overflow Prevention
- Add `overflow-x: hidden` to header container
- Ensure header width never exceeds `100vw`
- Remove fixed `min-width` constraints that cause overflow

## **Phase 3: Data Table Mobile Strategy**

**Problem**: Table too wide, unusable horizontal scrolling

### 3.1 Progressive Table Hiding
- **≤768px**: Hide data table section entirely
- Show message: "Data table available on larger screens" with button to "View in Desktop Mode"

## **Phase 4: Content Layout Adjustments**

### 4.1 Grid Layout Optimizations
- **≤576px**: Parameters section becomes single column earlier
- Reduce card padding and margins on mobile
- Ensure graphs section remains usable

## **Phase 5: CSS Architecture Changes**

### 5.1 Breakpoint Strategy
```css
/* Mobile-specific media queries - desktop remains unchanged */
@media (max-width: 480px)  /* Small phones */
@media (max-width: 576px)  /* Large phones */  
@media (max-width: 768px)  /* Tablets portrait */
@media (max-width: 992px)  /* Tablets landscape */
```

### 5.2 New CSS Custom Properties (mobile-only)
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

2. **Phase 1** (Landing header) - Test navigation usability  
3. **Phase 2A** (Multi-row approach) - Test button accessibility and layout
4. **Phase 2B** (Hamburger approach) - Compare with 2A, choose best solution
5. **Phase 3** (Table hiding) - Verify no layout breaks
6. **Phase 4** (Content) - Full mobile workflow testing
7. **Phase 5** (Architecture) - Performance and maintenance

## **Key Design Principles**

- **Desktop-First Preservation**: Zero changes to desktop experience (≥992px)
- **Mobile Adaptation**: Site works well on phones without forcing desktop mode
- **Essential Function Access**: Demo and Help buttons always visible for user onboarding
- **Content Priority**: Critical functions accessible, secondary functions space-permitting
- **No Horizontal Scroll**: Never require horizontal scrolling on mobile
- **Progressive Enhancement**: Enhanced experience on larger screens, functional on all screens

## **Phase 2 Decision Criteria**

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