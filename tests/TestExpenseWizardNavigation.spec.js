import { test, expect } from '@playwright/test';
import { smartClick, openWizard, waitForOverlayGone, dismissWelcomeModal } from '../src/frontend/web/utils/FrontendTestUtils.js';

// helpers imported above; no local redefinitions

// Base URL for the simulator (served by the dev/preview server)
const BASE_URL = 'http://localhost:8080/#ifs';

// Slightly relax per-action timeout for this spec to accommodate mobile devices
test.use({ actionTimeout: 20000 });

// Test runner logic extracted into a helper for reuse across browser/device combos
async function runWizardRegressionTest(page) {
  // 1. Load the simulator directly on the IFS route
  await page.goto(BASE_URL);

  // The simulator is loaded inside an iframe created by spa-router.js.
  const frame = page.frameLocator('#app-frame');

  // Dismiss welcome modal if it appears
  await dismissWelcomeModal(page, frame);

  // 2. Open the Events Wizard via the "Add Event" button using robust helper
  await openWizard(page, frame);

  // 3. In the wizard selection modal choose "Expense".
  const expenseOption = frame.locator('#wizardSelectionOverlay .wizard-selection-option:has-text("Expense")');
  await expenseOption.waitFor({ state: 'visible' });
  await smartClick(expenseOption);

  // 4. On the Frequency step, pick "One-off". This should auto-advance.
  const oneOffChoice = frame.locator('#eventWizardOverlay .event-wizard-choice-option:has-text("One-off")');
  await oneOffChoice.waitFor({ state: 'visible', timeout: 30000 });
  await smartClick(oneOffChoice);

  // 5. Name step – enter a name and proceed.
  const nameInput = frame.locator('#eventWizardOverlay input[name="alias"]');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill('Car purchase');

  // Force the input to blur so the wizard's pointerdown → blur listener fires.
  await nameInput.evaluate(el => el.blur());
  await page.waitForTimeout(300);

  // Wait until we are on the Cost step (heading changes)
  const costHeading = frame.locator('#eventWizardOverlay h3:has-text("Cost")');
  await smartClick(frame.locator('#eventWizardOverlay .event-wizard-button-next'));
  await page.waitForTimeout(400);
  await costHeading.waitFor({ state: 'visible', timeout: 15000 });

  // 6. Cost step – leave amount blank and attempt to continue to trigger validation.
  const costInput = frame.locator('#eventWizardOverlay input[name="amount"]');
  await costInput.waitFor({ state: 'visible' });
  await smartClick(frame.locator('#eventWizardOverlay .event-wizard-button-next'));

  // Give the wizard a moment to process validation logic
  await page.waitForTimeout(400);

  // Confirm we are still on the Cost step (i.e., navigation was blocked)
  await expect(frame.locator('#eventWizardOverlay h3')).toHaveText(/Cost/i);

  // 7. Click Back to return to the previous step.
  const backBtn = frame.locator('#eventWizardOverlay .event-wizard-button-back');
  await smartClick(backBtn);

  // Wait for the name input to re-appear and assert focus is correctly set.
  await nameInput.waitFor({ state: 'visible' });
  await expect(nameInput).toBeFocused();
}

// ---------------------------------------------------------------------------
// Define browser/device combinations we want to cover.
// ---------------------------------------------------------------------------


test('Wizard back-navigation retains focus after validation error', async ({ page }) => {
  await runWizardRegressionTest(page);
}); 