# Keep Entire Card Visible During Bubbles Tour

## Goal
When the guided tour (bubbles.js) highlights a field inside a form *card*, the browser should scroll so that **the whole card becomes (and stays) visible** beneath the fixed header, instead of positioning only the highlighted field at the very top of the viewport. This lets users see all related fields that were just explained.

---

## High-Level Strategy
1. **Detect the card element** associated with the current tour target.
2. **Determine if the card is already fully visible** in the viewport (taking the fixed header height into account).
3. **Scroll** only when necessary:
   * If the card fits in the remaining viewport height ⇒ scroll to show the card top just below the header.
   * If the card is taller than the viewport ⇒ scroll just enough so the highlighted field is nicely centred (fallback to current behaviour).
4. Leave horizontal-scroll logic untouched.

---

## Implementation Breakdown
- **File to update:** `src/frontend/web/ifs/libs/bubbles.js`
- **Function to modify:** `BubblesEngine.scrollIntoView(target)`
  1. Retrieve `const card = target.closest('.card');`.
  2. Compute `cardRect = card?.getBoundingClientRect()` (fallback to `targetRect`).
  3. Check visibility:
     ```javascript
     const hdrH = headerHeight;
     const topVisible    = cardRect.top    >= hdrH + margin;
     const bottomVisible = cardRect.bottom <= window.innerHeight - margin;
     ```
  4. If both `topVisible && bottomVisible` ⇒ **no vertical scroll required**.
  5. Else, decide `dest`:
     * **Card fits** (`cardRect.height <= window.innerHeight - hdrH - 2*margin`):
       `dest = cardRect.top + window.scrollY - hdrH - margin;`
     * **Card too tall**: retain existing logic centred on `target` (current behaviour).
  6. Apply the same smooth/instant scroll mechanics already implemented.
- **Edge Cases**
  * Pages with no `.card` ancestor ⇒ keep existing behaviour.
  * Mobile devices where the card spans full width ⇒ logic still works; header height is already accounted for.

---

## Testing Checklist
- [ ] Desktop ≥1024px: Tour through a short card; verify the card stays fully visible.
- [ ] Desktop: Very tall card; verify behaviour falls back gracefully.
- [ ] Tablet & Mobile breakpoints (portrait + landscape).
- [ ] Regression test: Tour steps targeting detached elements (no `.card`) still work.

---

## Progress Tracking
- [ ] Confirm `.card` selector is correct for all wizard cards.
- [ ] Implement logic in `scrollIntoView`.
- [ ] Manual cross-device tests (checklist above).
- [ ] Code review & merge.

---

Once approved, we can proceed to implementation following this guide. 