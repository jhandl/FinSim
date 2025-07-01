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

## Weird issue with cards jumping up and down

This works perfectly for some cards: Starting Position and Allocations. But it has a weird behaviour in the Personal Circumstances, Targets, Economy and Events cards. On those cards the page shifts up for the odd fields (1, 3, 5), exactly to the position they were placed in before we implemented this plan, and then goes back to the position we implemented in this plan (whole card visible) for the even fields (2, 4).

I already investigated the issue and discarded a number of potential root causes:

- It's not that some cards may have fields arranged in two columns. The cards with the issue have only one column.
- It's not that the cards are taller than the viewport. All the cards are shorter than 1/3 of the viewport height. Also they don't exceed the viewport width.
- It's not that some cards have extra elements in their headers. Starting Position has extra elements, but Allocations and Targets don't, so that doesn't explain the issue.
- It's not that the browser is scrolling the field into view asynchronously. The field is already in view: This happens after the card has been brought entirely into view at the top of the viewport under the header, with all its fields perfectly visible.
- It's not that the cards are too tall for fitsVertically to be false. Starting Position and Personal Circumstances both have 5 fields (in one column), so are the same height, yet one works and the other doesn't. Targets and Allocations are both shorter card, yet one works and the other doesn't.

---

## Root Cause (confirmed)

The alternating up-and-down scroll was a race condition:

1. `Wizard.js` sets focus on the next input → browsers start an **implicit smooth scroll** to bring that input into view.
2. Almost immediately our `scrollIntoView()` runs. If it measures the card *before* the smooth-scroll ends, the card header still sits at ≈0 px, so `topVisible` is `false`. One frame later the scroll completes and the card lands at 80 px, but we never re-measure.
3. When `topVisible` is `true` (measurement happened *after* the implicit scroll settled) the predicate `fitsVertically && !(topVisible && bottomVisible)` chooses the **field** rectangle → the page scrolls down, hiding the header.
4. On the next step `topVisible` becomes `false` and the predicate flips back to the **card** rectangle, restoring the correct position.

Which branch we took depended on sub-frame timing and fractional-pixel rounding, hence the odd/even behaviour.  Waiting two `requestAnimationFrame`s before measuring guarantees the browser's own scroll has finished, eliminating the race entirely.