# Plan: Fix Scroll Behaviour in Bubbles Guided-Tour Library

## Problem Statement
Currently, when the user scrolls while a tour step is active:
1. **Popover (bubble)** is positioned with `position: absolute` (document-anchored) and therefore *scrolls with the page*, sometimes moving completely off-screen.
2. **Highlight overlay** (`highlightBox` + overlay segments) is attached to the viewport and *does not follow* the target element, so the visual cue and element drift apart.

Desired behaviour:
* **Highlight** should stay locked to the target element at all times, even while the page is scrolling.
* **Popover** should stay visible inside the viewport, ideally clamped to its edges, so the user never loses the navigation controls.

---
## Affected Components
* `src/frontend/web/ifs/libs/bubbles.js`
  * `applyHighlight()` – draws halo & overlay segments.
  * `positionPopover()` – computes popover position.
  * `drive()` / `destroy()` – lifecycle hooks; currently wire the `resize` listener only.

No CSS changes are expected; existing `.driver-popover` styles already support `position: fixed`.

---
## Implementation Steps
1. **Add Scroll Listener**
   * Create `this.onScroll = this.onScroll.bind(this)` in constructor.
   * In `drive()` register: `window.addEventListener('scroll', this.onScroll, { passive: true });`
   * In `destroy()` unregister.

2. **Implement `onScroll()`**
   * Guard: return if no active step.
   * Retrieve active `step` & `target` like in `onResize()`.
   * Call `applyHighlight(target)` to relocate overlay.
   * **Do NOT** call `positionPopover()` here. The popover purposely *remains fixed* once positioned so it never scrolls off-screen or jitters. The highlight alone tracks the element.

3. **Switch Popover Positioning to `position: fixed`**
   * Inside `positionPopover()` set `pop.style.position = 'fixed'` for the normal code-path (not only for fallback).
   * Update `coords(side)` helper:
     * Stop adding `window.scrollX` / `scrollY` – compute using the element's `getBoundingClientRect()` which is already viewport-relative.
     * Continue side-based calculations (top/left).
   * In `apply(p)` clamp using viewport (`vw`, `vh`) instead of scroll offsets.
   * Remove now-unused absolute-position logic or retain for legacy but behind feature flag if needed.

4. **Viewport Clamping Logic**
   * Ensure popover never exceeds viewport bounds:
     ```js
     const clampedTop  = clamp(p.top, margin, vh - measuredHeight - margin - effectiveInset);
     const clampedLeft = clamp(p.left, 8, vw - measuredWidth - 8);
     ```
   * If preferred side doesn't fit, fall back to alternative sides (existing algorithm already handles this).

5. **Optimisations & Edge Cases**
   * Debounce heavy calculations in `onScroll` with `requestAnimationFrame` if performance issues arise.
   * Consider ignoring horizontal scroll events if the app disables them.
   * Ensure cleanup guards (`this.overlay` / `this.pop` null checks) remain intact.

---
## Testing Matrix
| Scenario | Expectation |
| -------- | ----------- |
| Scroll large page (desktop) | Highlight tracks element; popover stays visible, clamped to viewport |
| Scroll within horizontally scrollable container | Same as above; horizontal repositioning remains correct |
| Mobile viewport with bottom inset (browser UI) | Popover stays above inset; highlight accurate |
| Window resize during scroll | No jitter; both overlay & popover settle correctly |

Manual tests can be executed by launching the wizard tour and scrolling at each step.

---
## Progress Tracker
- [ ] Add `onScroll` listener & handler
- [ ] Convert popover to `position: fixed`
- [ ] Update coordinate maths & clamping
- [ ] Clean up absolute fallback path (optional)
- [ ] Cross-browser manual QA per testing matrix

---
Once all tasks are checked and behaviour is validated, remove any temporary console logs and consider bumping version number if the library is exported independently. 