import { test, expect } from '@playwright/test';
import {
  smartClick,
  openWizard,
  waitForOverlayGone,
  dismissWelcomeModal
} from '../src/frontend/web/utils/FrontendTestUtils.js';

const BASE_URL = 'http://localhost:8080/#ifs';

async function runSalaryWizardRegressionTest(page) {
  // 1. Load simulator directly on the IFS route
  await page.goto(BASE_URL);

  // All simulator UI lives inside the iframe
  const frame = page.frameLocator('#app-frame');

  // Dismiss welcome modal if it appears
  await dismissWelcomeModal(page, frame);

  // 2. Open the Events Wizard via the "Add Event" button
  await openWizard(page, frame);

  // 3. Choose "Income" from the wizard selection overlay (Salary is a subtype)
  const incomeTile = frame.locator('#wizardSelectionOverlay .wizard-selection-option:has-text("Income")');
  await incomeTile.waitFor({ state: 'visible' });
  await smartClick(incomeTile);

  // --- Wizard Step: Income Type (choice) ---
  const salaryChoice = frame.locator('#eventWizardOverlay .event-wizard-choice-option:has-text("Salary")');
  await salaryChoice.waitFor({ state: 'visible' });
  await smartClick(salaryChoice);

  // The wizard may auto-advance; ensure Name step is visible next.
  const nameInput = frame.locator('#eventWizardOverlay input[name="alias"]');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill('Main Salary');
  await nameInput.evaluate(el => el.blur());
  await page.waitForTimeout(300);

  const nextBtn = frame.locator('#eventWizardOverlay .event-wizard-button-next');
  await smartClick(nextBtn);

  // --- Wizard Step: Amount ---
  const amountInput = frame.locator('#eventWizardOverlay input[name="amount"]');
  await amountInput.waitFor({ state: 'visible' });
  await amountInput.fill('50000');

  // Blur to trigger validation logic and keep helpers consistent across mobile/desktop
  await amountInput.evaluate(el => el.blur());
  await page.waitForTimeout(300);

  // Proceed to Period step
  await smartClick(nextBtn);

  // 5. Starting age – fill From Age only (leave To Age blank to trigger validation)
  const fromAgeInput = frame.locator('#eventWizardOverlay input[name="fromAge"]');
  await fromAgeInput.waitFor({ state: 'visible' });
  await fromAgeInput.fill('30');

  // 6. Press Enter – wizard focuses the "To Age" input; blur it so mobile can register Next
  await fromAgeInput.press('Enter');
  const toAgeInput = frame.locator('#eventWizardOverlay input[name="toAge"]');
  await toAgeInput.waitFor({ state: 'visible' });
  await toAgeInput.evaluate(el => el.blur());
  await page.waitForTimeout(400);

  // 7. Attempt to proceed by clicking Next
  await smartClick(nextBtn);

  // 8. Verify we are still on the Period step (navigation blocked)
  const periodHeading = frame.locator('#eventWizardOverlay h3:has-text("Income Period")');
  await periodHeading.waitFor({ state: 'visible', timeout: 5000 });
  await expect(fromAgeInput).toBeVisible();

  // 9. Click Back to return to the Amount step
  const backBtn = frame.locator('#eventWizardOverlay .event-wizard-button-back');
  await smartClick(backBtn);

  // 10. Confirm the Amount input is visible and focused, implying keyboard is active
  const amountInputBack = frame.locator('#eventWizardOverlay input[name="amount"]');
  await amountInputBack.waitFor({ state: 'visible' });
  await expect(amountInputBack).toBeFocused();
}

// ---------------------------------------------------------------------------
// Define a single reusable test that runs across all configured Playwright
// projects (Desktop Chrome/Firefox/Safari + mobile Pixel 5/iPhone 13).
// ---------------------------------------------------------------------------

test('Salary wizard back-navigation retains focus after validation error', async ({ page }) => {
  await runSalaryWizardRegressionTest(page);
}); 