import { test, expect } from '@playwright/test';
import {
  smartClick,
  openWizard,
  waitForOverlayGone,
  dismissWelcomeModal
} from '../src/frontend/web/utils/FrontendTestUtils.js';

// Base URL for the simulator (served by the dev/preview server)
const BASE_URL = 'http://localhost:8080/#ifs';

// Extracted test logic so it runs across all configured Playwright projects
async function runBasicWizardNavigationTest(page) {
  // 1. Navigate directly to the simulator route
  await page.goto(BASE_URL);

  // All simulator UI lives inside the iframe created by spa-router.js
  const frame = page.frameLocator('#app-frame');

  // Dismiss the welcome modal if it appears (mobile/first-visit)
  await dismissWelcomeModal(page, frame);

  // 2. Open the Events Wizard via the "Add Event" button
  await openWizard(page, frame);

  // 3. Choose "Income" from the wizard selection overlay
  const incomeOption = frame.locator('#wizardSelectionOverlay .wizard-selection-option:has-text("Income")');
  await incomeOption.waitFor({ state: 'visible' });
  const wizardOverlay = frame.locator('#eventWizardOverlay');
  for (let attempt = 0; attempt < 3; attempt++) {
    await smartClick(incomeOption);
    try {
      await wizardOverlay.waitFor({ state: 'visible', timeout: 4000 });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }

  // 4. Click Back to return to the wizard selection overlay
  const backBtn = wizardOverlay.locator('.event-wizard-button-back');
  await smartClick(backBtn);

  // 5. Verify that the wizard selection overlay is visible again
  await incomeOption.waitFor({ state: 'visible' });
  await expect(frame.locator('#wizardSelectionOverlay')).toBeVisible();
}

// ---------------------------------------------------------------------------
// Define a single reusable test that Playwright will execute for every
// configured browser/device project (Chrome/Firefox/Safari + mobile).
// ---------------------------------------------------------------------------

test('Wizard back-navigation returns to selection screen after choosing Income', async ({ page }) => {
  await runBasicWizardNavigationTest(page);
}); 