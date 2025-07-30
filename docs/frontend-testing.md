# Front-End UI Testing – Developer Guide

This repo uses **Playwright** with a single, portable helper (`smartClick`) that hides all platform quirks.  Adding new UI-level acceptance tests therefore boils down to three steps.

---
## 1  Create a new spec file

* Location: `tests/`
* Naming: `Test<FeatureName>.spec.js`
* Boiler-plate:

```js
import { test, expect } from '@playwright/test';
import {
  smartClick,
  openWizard,
  waitForOverlayGone,
  dismissWelcomeModal
} from '../src/frontend/web/utils/FrontendTestUtils.js';

const BASE = 'http://localhost:8080/#ifs';

test('Scenario description', async ({ page }) => {
  await page.goto(BASE);
  const frame = page.frameLocator('#app-frame');

  /* If the Welcome modal can appear, always dismiss it first */
  await waitForOverlayGone(page);

  // …continue with smartClick / expect logic
});
```

---
## 2  Use **smartClick** everywhere

`smartClick(locator [, { preferProgrammatic:true }])`

• Scrolls the target into view.  
• Attempts, in order:
  1. **tap** (real pointer-down) – needed for mobile logic.
  2. **programmatic click** (`evaluate(el => el.click())`) – bypasses pointer-event interception.
  3. Fallback DOM click (forced).

Use the default order for anything that relies on mobile pointer-down handlers (wizard Next / Back buttons, choice cards).  When you need to bypass an overlay (e.g. closing a modal, opening the Add-Event wizard) call with `{ preferProgrammatic:true }`.

Example:
```js
await smartClick(frame.locator('#someButton'));
await smartClick(frame.locator('.modal-close'), { preferProgrammatic:true });
```

---
## 3  Wait utilities

### waitForOverlayGone(page)
```js
await waitForOverlayGone(page);   // ensures Welcome modal is removed/hidden
```
Always call this before interacting with the simulator if the Welcome modal might appear.

### openWizard(page, frame)
```js
await openWizard(page, frame);     // clicks “Add Event” and waits for wizard picker
```
This encapsulates the retry/poll logic; reuse instead of duplicating.

---
## Writing reliable steps

1. **Locate inside the iframe** – all simulator content lives in `#app-frame`:
   ```js
   const frame = page.frameLocator('#app-frame');
   const nextBtn = frame.locator('.event-wizard-button-next');
   ```
2. **Wait before interacting** – use Playwright’s `locator.waitFor({ state:'visible' })` to ensure the element exists.
3. **Blur inputs when required** – mobile wizard advances only after the active input blurs:
   ```js
   await input.evaluate(el => el.blur());
   await smartClick(nextBtn);
   ```
4. **Validate UI state with `expect`** – check headings, validation messages, focused input, etc.
   5. **Give the wizard time after blur** – on mobile the internal blur-handler updates state *before* the Next button becomes active. Wait ~300 ms after blurring, then click **Next**, and (optionally) another ~400 ms for the next step’s DOM to render before asserting:
   ```js
   await input.evaluate(el => el.blur());
   await page.waitForTimeout(300);   // allow wizard to commit blur
   await smartClick(nextBtn);
   await page.waitForTimeout(400);   // new step animates in
   await expect(frame.locator('h3')).toHaveText(/Cost/);
   ```

---
## Running the Playwright suite

Most of the time you can simply execute:

```bash
./run-tests.sh
```

The wrapper script now runs all Playwright specs after the custom Node tests and Jest suite, reporting the result as a single line:

```
✅ PASSED: PlaywrightTests
```

If you want to run a single Playwright spec without the rest of the test suite you have two options:

```bash
# via the wrapper (counts & formatting handled automatically)
./run-tests.sh TestExpenseWizardNavigation

# or directly via Playwright if you need custom flags
npx playwright test --project="Pixel 5" tests/TestExpenseWizardNavigation.spec.js
```

The wrapper prints a single pass/fail line in the standard format, whereas the direct Playwright call shows the full Playwright output.

---
## Adding a device/browser
Update **`playwright.config.js`** – add another entry to `projects`.  No test-code change is necessary because all helper functions are device-agnostic.

---
## Troubleshooting cheatsheet
| Symptom | Fix |
|---------|-----|
| Click intercepted by overlay | Use `smartClick(locator, { preferProgrammatic:true })` |
| Wizard fails to advance on mobile | Blur the input, then `smartClick` the Next button |
| Timeout waiting for modal | Ensure element selector is correct and state is `visible` not `attached` |

Happy testing! :rocket: 