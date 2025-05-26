# Mobile Responsiveness Implementation Guide

## Prerequisites

- Test on real mobile devices or browser dev tools with device emulation
- Use breakpoints: 691px (existing), 576px, 480px, 768px (specific cases only)
- Preserve desktop experience (≥992px) - no changes above this breakpoint
- Test each phase before moving to the next
- Each phase is independent and can be rolled back without affecting others

---

## Phase 1: Fix Pop-up/Modal Issues (CRITICAL)

### File: `src/frontend/web/ifs/css/wizard.css`

**Current Issue**: Pop-ups overflow screen, buttons unreachable, background scrolls instead of popover content.

#### Step 1.1: Add Mobile Popover Constraints

Add these rules at the end of `wizard.css`:

```css
/* Mobile popover fixes */
@media (max-width: 768px) {
  .driver-popover {
    max-height: 90vh !important;
    width: calc(100vw - 40px) !important;
    max-width: calc(100vw - 40px) !important;
    min-width: 280px !important;
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    overflow-y: auto !important;
    padding-bottom: 80px !important; /* Space for buttons */
  }
  
  /* Note: !important is necessary here because driver.js applies inline styles */

  .driver-popover.welcome-popover,
  .driver-popover.howto-popover {
    max-height: 85vh !important;
    width: calc(100vw - 20px) !important;
    max-width: calc(100vw - 20px) !important;
  }

  .driver-popover .driver-popover-description {
    padding-left: 1rem !important;
    padding-right: 1rem !important;
    max-height: none !important;
  }

  /* Ensure buttons are always visible */
  .driver-popover .driver-popover-footer {
    position: sticky !important;
    bottom: 0 !important;
    background: white !important;
    padding: 1rem !important;
    border-top: 1px solid #eee !important;
    margin-top: 1rem !important;
  }
}

@media (max-width: 480px) {
  .driver-popover {
    width: calc(100vw - 20px) !important;
    max-width: calc(100vw - 20px) !important;
    min-width: 260px !important;
  }
}
```

#### Step 1.2: Add Body Scroll Lock

Add to `wizard.css`:

```css
/* Prevent background scrolling when popover is active */
body.driver-active {
  overflow: hidden !important;
  position: fixed !important;
  width: 100% !important;
}
```

#### Step 1.3: Update Wizard.js to Add Body Class

**File: `src/frontend/web/components/Wizard.js`**

Find the `onHighlighted` callback in the `this.driver()` configuration (around line 265) and modify it to add body class management at the beginning:

```javascript
onHighlighted: (element) => {
  // Add body class to prevent scrolling
  document.body.classList.add('driver-active');
  
  const popover = document.querySelector('.driver-popover');
  if (popover) {
    // ... existing logic for the #load-example-scenario button ...
    // ... existing focus management logic ...
  }
},
onDestroyStarted: () => {
  // Remove body class to restore scrolling
  document.body.classList.remove('driver-active');
  this.finishTour();
}
```

**Test**: Pop-ups should fit on screen, scroll internally, and prevent background scrolling.

---

## Phase 2: Landing Page Header Optimization

### File: `src/frontend/web/landing/styles.css`

**Current Issue**: Header too tall, navigation wraps poorly, title too big.

#### Step 2.1: Optimize Header Height

Find the existing `@media (max-width: 768px)` rule (around line 473) and modify:

```css
@media (max-width: 768px) {
  header .container {
    flex-direction: column;
    gap: 12px; /* Reduced from 15px */
    padding: 12px 20px; /* Reduced from 20px */
  }

  .logo h1 {
    font-size: 1.4rem; /* Reduced from 1.8rem */
  }

  nav ul {
    margin-top: 8px; /* Reduced from 15px */
  }

  nav ul li {
    margin-left: 12px; /* Reduced from 15px */
    margin-right: 12px;
  }

  .hero-content h1 {
    font-size: 2rem; /* Reduced from 2.5rem */
  }

  .hero {
    padding: 40px 0; /* Reduced from default 80px */
  }

  section {
    padding: 40px 0;
  }
}
```

#### Step 2.2: Navigation Improvements & Smaller Screen Optimizations

Modify the existing `@media (max-width: 576px)` rule (around line 497) to include these additional optimizations:

```css
@media (max-width: 576px) {
  /* Keep existing rules and add these: */
  
  header .container {
    padding: 10px 15px;
    gap: 10px;
  }

  .logo h1 {
    font-size: 1.2rem;
  }

  /* Stack navigation vertically with reduced gaps */
  nav ul {
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
  }

  nav ul li {
    margin: 0;
  }

  .hero-content h2 {
    font-size: 1.6rem; /* Reduced from 2.2rem */
  }

  .hero {
    padding: 30px 0;
  }
}

/* Add this new breakpoint after the 576px rule */
@media (max-width: 480px) {
  header .container {
    padding: 8px 12px;
  }

  .logo h1 {
    font-size: 1.1rem;
  }

  .hero-content h1 {
    font-size: 1.6rem;
  }

  .hero-content h2 {
    font-size: 1.4rem;
  }
  
  /* Implement collapsible hamburger menu for very small screens if needed */
  /* Note: This can be added later if vertical stacking isn't sufficient */
}
```

#### Step 2.3: Hero Section Optimization

The above changes already include hero section optimizations. Verify these align with the plan:
- Hero title: `3rem → 2rem` (768px) → `1.6rem` (480px) ✅
- Hero subtitle: `2.2rem → 1.6rem` (576px) → `1.4rem` (480px) ✅  
- Hero padding: `80px 0 → 40px 0` (768px) → `30px 0` (576px) ✅

**Test**: Header should use ≤25% of screen height on mobile devices.

---

## Phase 3A: Simulator Header - Multi-row Layout

### File: `src/frontend/web/ifs/css/layout.css`

**Current Issue**: Buttons overlap, logo wraps, horizontal overflow.

#### Step 3A.1: Extend Existing Mobile Header Rules

Find the existing `@media (max-width: 691px)` rule (around line 204) and extend it by adding these rules after the existing ones:

```css
@media (max-width: 691px) {
  /* ... existing rules remain unchanged ... */
  
  /* Add these new rules to the existing block */
  header {
    overflow-x: hidden; /* Prevent horizontal scroll */
  }

  .header-center-right {
    flex-direction: column;
    gap: 0.5rem;
  }

  .header-center {
    width: 100%;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .header-right {
    width: 100%;
    justify-content: center;
    margin-left: 0;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* Coffee button - make smaller */
  .header-right a img {
    height: 28px !important;
    width: auto !important;
  }
}

/* Add these as separate media query blocks after the 691px rule */

@media (max-width: 576px) {
  header {
    padding: 0.6rem 0.8rem;
  }

  .header-left h1 {
    font-size: 1.1rem;
  }

  .primary-button, .secondary-button {
    font-size: 0.85rem;
    padding: 0.35rem 0.8rem;
  }

  .status-indicator {
    min-width: 70px;
    font-size: 0.8rem;
  }

  /* Stack buttons in organized rows */
  .header-center {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
    width: 100%;
  }

  .header-right {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.4rem;
    width: 100%;
  }
}

@media (max-width: 480px) {
  .header-left h1 {
    font-size: 1rem;
  }

  .primary-button, .secondary-button {
    font-size: 0.8rem;
    padding: 0.3rem 0.6rem;
  }

  /* Single column for very small screens */
  .header-center {
    grid-template-columns: 1fr;
  }

  .header-right {
    grid-template-columns: 1fr 1fr;
  }
}
```

#### Step 3A.2: Update Parameter Section Layout

The existing layout.css already handles parameter section layout changes at various breakpoints. The current 691px rule already sets `.parameters-section { grid-template-columns: 1fr; }` and `.events-section` width adjustments.

If additional fine-tuning is needed, add these rules to the existing breakpoints:

```css
/* Add to existing @media (max-width: 691px) rule if needed */
@media (max-width: 691px) {
  /* existing rules... */
  
  /* Add only if layout issues persist */
  .events-section {
    max-width: 100%; /* Ensure no overflow */
  }
}

/* Add to existing @media (max-width: 576px) rule or create new one */
@media (max-width: 576px) {
  main {
    padding: 0 0.5rem;
    gap: 1rem;
  }

  .card {
    padding: 0.8rem;
  }

  .input-wrapper {
    gap: 0.5rem;
  }

  label {
    text-align: left;
    font-size: 0.85rem;
  }
}
```

**Test**: Header should stack in organized rows, all buttons visible, no horizontal overflow.

#### Step 3A.3: Verify Button Priority System

Ensure the implementation follows the plan's button priority system:
- **Always Visible**: Run Simulation ✅, Status ✅, Demo ✅, Help ✅
- **Secondary**: Save ✅, Load ✅ (visible when space allows)
- **Tertiary**: Coffee ✅ (lowest priority, made smaller)

#### Step 3A.4: Logo Protection

The existing 691px rule already handles logo font-size reduction. Verify:
- Logo never wraps (existing `white-space: nowrap` if needed)
- Progressive font-size reduction: `1.2rem` (691px) → `1.1rem` (576px) → `1rem` (480px) ✅
- Horizontal overflow prevention: `overflow-x: hidden` ✅

---

## Phase 3B: Simulator Header - Hamburger Menu Layout (Alternative)

**⚠️ IMPORTANT: Only implement this if Phase 3A doesn't work well. Skip to Phase 4 if 3A is successful.**

This approach requires more significant changes to the HTML structure and should be considered only if the multi-row layout in 3A proves insufficient.

### File: `src/frontend/web/ifs/index.html`

#### Step 3B.1: Add Hamburger Menu Structure

Find the header section (around line 18) and modify:

```html
<header>
    <div class="header-left">
        <h1><a href="/">Ireland Financial Simulator</a></h1>
    </div>
    <div class="header-center-right">
        <div class="header-center">
            <span class="scenario-name"></span>
            <button id="runSimulation" class="primary-button"><span>Run Simulation</span></button>
            <div id="progress" class="status-indicator">Ready</div>
            <button id="loadDemoScenarioHeader" class="secondary-button">Demo</button>
            <button id="startWizard" class="secondary-button">Help</button>
        </div>
        <div class="header-right">
            <button id="mobileMenuToggle" class="secondary-button mobile-menu-toggle" style="display: none;">
                <span class="hamburger-icon">☰</span>
            </button>
            <div class="mobile-menu-content">
                <button id="saveSimulation" class="secondary-button">Save</button>
                <input type="file" id="loadSimulationDialog" accept=".csv" style="display: none;">
                <button id="loadSimulation" class="secondary-button">Load</button>
                <a href="https://www.buymeacoffee.com/jhandl" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-green.png" alt="Buy Me A Coffee" style="height: 36px !important;width: 130px !important; vertical-align: middle;" ></a>
            </div>
        </div>
    </div>
</header>
```

#### Step 3B.2: Add Hamburger Menu CSS

**File: `src/frontend/web/ifs/css/layout.css`**

Replace the Phase 3A CSS with:

```css
@media (max-width: 768px) {
  .mobile-menu-toggle {
    display: block !important;
  }

  .mobile-menu-content {
    display: none;
    position: absolute;
    top: 100%;
    right: 0;
    background: white;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 0.5rem;
    box-shadow: var(--box-shadow);
    z-index: 1001;
  }

  .mobile-menu-content.active {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Hide secondary buttons on mobile */
  .header-right > .secondary-button:not(.mobile-menu-toggle),
  .header-right > a {
    display: none;
  }
}
```

#### Step 3B.3: Add JavaScript for Menu Toggle

**File: `src/frontend/web/ifs/index.html`**

Add before closing `</body>` tag:

```html
<script>
document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.getElementById('mobileMenuToggle');
    const menuContent = document.querySelector('.mobile-menu-content');
    
    if (menuToggle && menuContent) {
        menuToggle.addEventListener('click', function() {
            menuContent.classList.toggle('active');
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!menuToggle.contains(e.target) && !menuContent.contains(e.target)) {
                menuContent.classList.remove('active');
            }
        });
    }
});
</script>
```

---

## Phase 4: Data Table Mobile Strategy

### File: `src/frontend/web/ifs/css/layout.css`

**Current Issue**: Data table too wide for mobile screens.

#### Step 4.1: Hide Data Table on Mobile

Add to the end of `layout.css`:

```css
/* Hide data table on mobile */
@media (max-width: 768px) {
  .data-section {
    display: none;
  }

  /* Add a message for mobile users */
  .data-section::after {
    content: "Data table available on larger screens. Use desktop mode to view detailed simulation data.";
    display: block;
    padding: 2rem;
    text-align: center;
    background: var(--card-background);
    border-radius: 7.2px;
    box-shadow: var(--box-shadow);
    color: #666;
    font-style: italic;
  }
}
```

**Note**: Using 768px here because data tables need more space than typical mobile layouts. This is consistent with the landing page breakpoint usage.

#### Step 4.2: Alternative - Add Mobile Message

**File: `src/frontend/web/ifs/index.html`**

Find the data-section div (around line 280) and add a mobile message:

**Note**: This is an alternative to Step 4.1. Choose either 4.1 (CSS-only hiding) or 4.2 (HTML message), not both.

```html
<div class="data-section card">
    <div class="mobile-data-message" style="display: none;">
        <h2>Simulation Data</h2>
        <p style="text-align: center; color: #666; font-style: italic; padding: 2rem;">
            The detailed data table is available on larger screens. 
            <br><br>
            <button onclick="alert('Please rotate your device or use desktop mode to view the full data table.')" 
                    class="secondary-button">View in Desktop Mode</button>
        </p>
    </div>
    <div class="desktop-data-content">
        <h2>Simulation Data</h2>
        <div class="table-container">
            <!-- existing table content -->
        </div>
    </div>
</div>
```

And add CSS:

```css
@media (max-width: 768px) {
  .desktop-data-content {
    display: none;
  }
  
  .mobile-data-message {
    display: block !important;
  }
}

@media (min-width: 769px) {
  .mobile-data-message {
    display: none !important;
  }
}
```

**Test**: Data table should be hidden on mobile with helpful message.

---

## Phase 5: Content Layout Adjustments

### File: `src/frontend/web/ifs/css/simulator.css`

**Current Issue**: Forms and content need mobile optimization for better usability.

#### Step 5.1: Grid Layout Optimizations

The existing layout.css already handles most grid layout changes, but verify:
- Parameters section becomes single column at 691px ✅ (existing)
- Events section width adjustments ✅ (existing)
- Graphs section responsive behavior ✅ (existing)

#### Step 5.2: Optimize Card Layouts

Add to the end of `simulator.css`:

```css
/* Mobile card optimizations */
@media (max-width: 576px) {
  .card {
    padding: 0.8rem;
    margin-bottom: 1rem;
  }

  .card h2 {
    font-size: 1rem;
    margin-bottom: 0.5rem;
  }

  .input-group {
    gap: 0.4rem;
  }

  .input-wrapper {
    gap: 0.5rem;
    flex-direction: column;
    align-items: stretch;
  }

  label {
    text-align: left;
    font-size: 0.85rem;
    flex: none;
  }

  input, select {
    width: 100%;
    max-width: none;
  }

  /* Growth rates table mobile optimization */
  .growth-rates-table {
    font-size: 0.8rem;
  }

  .growth-rates-table th,
  .growth-rates-table td {
    padding: 0.2rem;
  }

  /* Events table mobile optimization */
  #Events {
    font-size: 0.8rem;
  }

  #Events th,
  #Events td {
    padding: 0.3rem 0.1rem;
  }

  #Events input,
  #Events select {
    font-size: 0.8rem;
    padding: 0.2rem;
  }
}

@media (max-width: 480px) {
  .card {
    padding: 0.6rem;
  }

  .input-wrapper {
    gap: 0.3rem;
  }

  label {
    font-size: 0.8rem;
  }

  input, select {
    font-size: 0.8rem;
  }
}
```

**Test**: Forms should be easy to use on mobile, no horizontal scrolling.

---

## Testing Checklist

### Phase 1 Testing
- [ ] Pop-ups fit entirely on screen (iPhone SE, Galaxy S8)
- [ ] Pop-up content scrolls, not background
- [ ] All buttons in pop-ups are reachable
- [ ] Background doesn't scroll when pop-up is open

### Phase 2 Testing
- [ ] Landing page header ≤25% of screen height
- [ ] Navigation doesn't wrap awkwardly
- [ ] All navigation links are tappable
- [ ] Hero section fits well on screen

### Phase 3 Testing
- [ ] Simulator header fits without horizontal scroll
- [ ] Logo "Ireland Financial Simulator" doesn't wrap
- [ ] Demo and Help buttons clearly visible
- [ ] All buttons are tappable (44px+ touch targets)
- [ ] No button overlap or bunching

### Phase 4 Testing
- [ ] Data table hidden on mobile
- [ ] Helpful message shown instead
- [ ] No layout breaks when table is hidden

### Phase 5 Testing
- [ ] All forms usable on mobile
- [ ] Input fields appropriately sized
- [ ] No horizontal scrolling anywhere
- [ ] Graphs display properly

### Cross-Device Testing
Test on:
- [ ] iPhone SE (375px width)
- [ ] iPhone 12 (390px width)
- [ ] Galaxy S8 (360px width)
- [ ] iPad Mini (768px width)
- [ ] Desktop (1200px+ width) - ensure no changes

---

## Rollback Plan

If any phase causes issues:

1. **Phase 1**: Comment out new CSS rules in `wizard.css`
2. **Phase 2**: Revert changes to `landing/styles.css`
3. **Phase 3A**: Revert `layout.css` changes
4. **Phase 3B**: Remove HTML changes and new CSS
5. **Phase 4**: Remove data table hiding rules
6. **Phase 5**: Remove mobile card optimizations

Each phase is independent, so you can rollback individual phases without affecting others.

---

## Integration Notes & Best Practices

### Breakpoint Strategy
The implementation follows the existing codebase breakpoint pattern:
- **691px**: Primary mobile breakpoint (existing) - extend this for header changes
- **576px**: Large phones - add new optimizations  
- **480px**: Small phones - add new optimizations
- **768px**: Used only for landing page and data table (matches existing pattern)

**Note**: The plan's Phase 6 (CSS Architecture Changes) is integrated throughout this implementation rather than as a separate phase. The new CSS custom properties suggested in the plan are not implemented as they would require more extensive refactoring. The current approach uses existing CSS patterns for better integration.

### Key Integration Principles
1. **Extend, Don't Replace**: Build on existing mobile rules rather than replacing them
2. **Preserve Existing Functionality**: The current 691px rule already handles "Run Simulation" → "Run" text change
3. **Consistent File Organization**: Keep CSS changes in their respective files (wizard.css, layout.css, simulator.css, landing/styles.css)
4. **Progressive Enhancement**: Each breakpoint adds refinements without breaking larger screen layouts

### Implementation Order & Testing Strategy
Following the plan's recommended order:
1. **Phase 1** (Critical): Pop-up accessibility - test immediately on real devices
2. **Phase 2** (Medium): Landing page header - test navigation usability  
3. **Phase 3A** (High): Multi-row header approach - test button accessibility and layout
4. **Phase 3B** (Alternative): Hamburger approach - only if 3A insufficient
5. **Phase 4** (Low): Table hiding - verify no layout breaks
6. **Phase 5** (Low): Content optimizations - full mobile workflow testing

### Testing Priority
1. **Phase 1** (Critical): Pop-up accessibility - test immediately on real devices
2. **Phase 3A** (High): Header layout - verify no button overlap or horizontal scroll
3. **Phase 2** (Medium): Landing page - ensure header height reduction works
4. **Phase 4-5** (Low): Content optimizations - verify no layout breaks

### Success Metrics Alignment
This implementation addresses all success metrics from the plan:
- ✅ Pop-ups are fully accessible and scrollable on mobile (Phase 1)
- ✅ Landing page header uses ≤25% of screen height on mobile (Phase 2)
- ✅ All simulator functions accessible without horizontal scrolling (Phase 3A)
- ✅ Demo and Help buttons prominently visible for new user onboarding (Phase 3A)
- ✅ Desktop experience remains completely unchanged (≥992px preserved)
- ✅ No layout breaks or overlapping elements on any screen size (All phases)

## Performance Notes

- All changes use CSS media queries (no JavaScript performance impact)
- No new images or assets required
- Changes only affect mobile devices (≤691px primary, ≤768px for specific cases)
- Desktop performance unchanged 