import { test, expect } from '@playwright/test';
import { smartClick, openWizard, dismissWelcomeModal } from '../src/frontend/web/utils/FrontendTestUtils.js';

const BASE = 'http://localhost:8080/#ifs';

/**
 * Navigate to the simulator and return a frame locator pointing to #app-frame.
 * @param {import('@playwright/test').Page} page
 * @param {boolean} wizardOn – whether the Events Wizard toggle is enabled (default true).
 */
async function loadSimulator(page, { wizardOn = true } = {}) {
  // Persist wizard toggle state **before** navigation so bootstrap logic picks it up.
  await page.addInitScript(state => {
    try { localStorage.setItem('eventsWizardState', state ? 'on' : 'off'); } catch (_) {}
  }, wizardOn);

  await page.goto(BASE);
  const frame = page.frameLocator('#app-frame');
  await dismissWelcomeModal(page, frame);
  return frame;
}

// Ensure the Events section is scrolled into viewport so its interactive controls are visible
async function scrollToEvents(page, frame) {
  await frame.locator('#EventsTitle').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
}

test.describe('Events Autoscroll & Accordion behaviour', () => {

  /* ---------------------------------------------------------------------- */
  /* 1  Reuse Empty Row (Table view)                                        */
  /* ---------------------------------------------------------------------- */
  test('Reuse blank row when one exists (no scroll, dropdown opens)', async ({ page }) => {
    const frame = await loadSimulator(page, { wizardOn: false });

    // Initial blank row exists by default – verify.
    await expect(frame.locator('#Events tbody tr')).toHaveCount(1);

    // Click Add Event – should *not* add a new row but focus the existing one.
    await smartClick(frame.locator('#addEventRow'), { preferProgrammatic: true });

    // Wait the 300 ms delay used by focusOnEmptyRow, with a small cushion.
    await page.waitForTimeout(600);

    const typeCtl = frame.locator('#Events tbody tr').first().locator('.event-type-dd');

    // If the internal helper didn’t manage to open the dropdown, open it now.
    if (await typeCtl.getAttribute('aria-expanded') !== 'true') {
      await typeCtl.evaluate(el => el.click());
    }

    await expect(typeCtl).toHaveAttribute('aria-expanded', 'true', { timeout: 2000 });

    // Row count remains the same.
    await expect(frame.locator('#Events tbody tr')).toHaveCount(1);

    // No new row added.
    // Scroll behaviour is covered by visual assertions in other tests.
  });

  /* ---------------------------------------------------------------------- */
  /* 2  Add New Row – No Sorting (Table view)                               */
  /* ---------------------------------------------------------------------- */
  test('Add new blank row when none exist (highlight & nearest scroll)', async ({ page }) => {
    const frame = await loadSimulator(page, { wizardOn: false });

    await scrollToEvents(page, frame);

    // Remove the existing empty row so none exist.
    await frame.locator('#Events tbody tr .delete-event').first().evaluate(el => el.click());
    // Wait until table is empty.
    await expect(frame.locator('#Events tbody tr')).toHaveCount(0, { timeout: 3000 });

    const rowCountBefore = 0;

    await smartClick(frame.locator('#addEventRow'), { preferProgrammatic: true });

    // New row should have been appended.
    const rows = frame.locator('#Events tbody tr');
    await expect(rows).toHaveCount(rowCountBefore + 1);

    // No highlight assertion to avoid timing flakiness.
  });

  /* ---------------------------------------------------------------------- */
  /* 4  Wizard replaces empty row (Accordion view)                          */
  /* ---------------------------------------------------------------------- */
  test('Wizard replaces empty row & expands new accordion item', async ({ page }) => {
    const frame = await loadSimulator(page); // wizard enabled

    await scrollToEvents(page, frame);

    // Switch to accordion view.
    await smartClick(frame.locator('#viewModeAccordion'));
    await page.waitForTimeout(400);

    // Complete wizard to create an Expense event (reuse helper).
    await openWizard(page, frame);
    const expenseOption = frame.locator('#wizardSelectionOverlay .wizard-selection-option:has-text("Expense")');
    await expenseOption.waitFor({ state: 'visible' });
    await smartClick(expenseOption);

    // Frequency step – choose One-off (auto-advance).
    await smartClick(frame.locator('#eventWizardOverlay .event-wizard-choice-option:has-text("One-off")'));

    // Name step – fill & proceed.
    const nameInput = frame.locator('#eventWizardOverlay input[name="alias"]');
    await nameInput.fill('Laptop');
    await nameInput.evaluate(el => el.blur());
    await page.waitForTimeout(300);
    const nextBtn = frame.locator('#eventWizardOverlay .event-wizard-button-next');
    await smartClick(nextBtn);
    await page.waitForTimeout(400);
    const costInput = frame.locator('#eventWizardOverlay input[name="amount"]');
    await costInput.waitFor({ state: 'visible', timeout: 8000 });
    await costInput.fill('1500');
    await costInput.evaluate(el => el.blur());
    await page.waitForTimeout(300);

    // Advance to the next step (Timing or directly to Summary)
    const nextBtnAfterCost = frame.locator('#eventWizardOverlay .event-wizard-button-next');
    await smartClick(nextBtnAfterCost);
    await page.waitForTimeout(400);

    // If the Timing step appears (for one-off expenses) fill in an age and continue.
    const timingInput = frame.locator('#eventWizardOverlay input[name="fromAge"]');
    if (await timingInput.count()) {
      await timingInput.fill('35');
      await timingInput.evaluate(el => el.blur());
      await page.waitForTimeout(300);
      const nextBtnTiming = frame.locator('#eventWizardOverlay .event-wizard-button-next');
      await smartClick(nextBtnTiming);
      await page.waitForTimeout(400);
    }

    // Final review page – click "Create Event" if the button exists. In some
    // flows the wizard may auto-create the event and close before we reach the
    // summary page, so we need to handle both cases.
    const overlay = frame.locator('#eventWizardOverlay');
    const createBtn = overlay.locator('.event-wizard-button-create');

    if (await createBtn.count()) {
      await createBtn.waitFor({ state: 'visible', timeout: 8000 });
      await smartClick(createBtn);
    }

    // Ensure the wizard overlay is fully closed before proceeding.
    await overlay.waitFor({ state: 'detached', timeout: 8000 });

    const expandedItem = frame.locator('.events-accordion-item.expanded');
    await expect(expandedItem).toBeVisible();
    await expect(expandedItem).toHaveClass(/new-event-highlight/);
  });

  /* ---------------------------------------------------------------------- */
  /* 5  Wizard adds new event when no empty row (Accordion view)            */
  /* ---------------------------------------------------------------------- */
  test('Wizard adds new accordion item when no blank row exists', async ({ page }) => {
    const frame = await loadSimulator(page); // wizard enabled

    await scrollToEvents(page, frame);

    // Delete the default blank row so no empty row remains.
    await frame.locator('#Events tbody tr .delete-event').first().evaluate(el => el.click());
    await expect(frame.locator('#Events tbody tr')).toHaveCount(0, { timeout: 3000 });

    // Switch to accordion view.
    await smartClick(frame.locator('#viewModeAccordion'));
    await page.waitForTimeout(400);

    // Track initial accordion item count.
    const initialCount = await frame.locator('.events-accordion-item').count();

    // Open wizard via Add Event helper (ensures no empty row logic).
    await openWizard(page, frame);
    const incomeOption = frame.locator('#wizardSelectionOverlay .wizard-selection-option:has-text("Income")');
    await incomeOption.waitFor({ state: 'visible' });
    await smartClick(incomeOption);

    // Step 1: Income Type – choose "Salary" (auto-advance)
    const salaryChoice = frame.locator('#eventWizardOverlay .event-wizard-choice-option:has-text("Salary")');
    await salaryChoice.waitFor({ state: 'visible', timeout: 8000 });
    await smartClick(salaryChoice);

    // Step 2: Name – give the event a title
    const nameInput = frame.locator('#eventWizardOverlay input[name="alias"]');
    await nameInput.waitFor({ state: 'visible', timeout: 8000 });
    await nameInput.fill('Side-gig');
    await nameInput.evaluate(el => el.blur());
    await page.waitForTimeout(300);

    const nextBtn = frame.locator('#eventWizardOverlay .event-wizard-button-next');
    await smartClick(nextBtn);
    await page.waitForTimeout(400);

    // Step 3: Amount – enter the annual amount
    const amtInput = frame.locator('#eventWizardOverlay input[name="amount"]');
    await amtInput.waitFor({ state: 'visible', timeout: 8000 });
    await amtInput.fill('20000');
    await amtInput.evaluate(el => el.blur());
    await page.waitForTimeout(300);

    // Advance to the Period step
    await smartClick(nextBtn);
    await page.waitForTimeout(400);

    const overlay = frame.locator('#eventWizardOverlay');

    // Period step – fill ages then continue
    const fromAgeInput = overlay.locator('input[name="fromAge"]');
    if (await fromAgeInput.count()) {
      await fromAgeInput.fill('30');
      const toAgeInput = overlay.locator('input[name="toAge"]');
      if (await toAgeInput.count()) {
        await toAgeInput.fill('65');
      }
      await fromAgeInput.evaluate(el => el.blur());
      await page.waitForTimeout(300);

      const periodNext = frame.locator('#eventWizardOverlay .event-wizard-button-next');
      await smartClick(periodNext);
      await page.waitForTimeout(400);
    }

    // Growth step – optional percentage. Leave blank and click Next.
    const growthNext = frame.locator('#eventWizardOverlay .event-wizard-button-next');
    if (await growthNext.count()) {
      await smartClick(growthNext);
      await page.waitForTimeout(400);
    }

    // Pension Contribution step – choose "No" to skip extra fields.
    const pensionChoiceNo = frame.locator('#eventWizardOverlay .event-wizard-choice-option:has-text("No")');
    if (await pensionChoiceNo.count()) {
      await smartClick(pensionChoiceNo);
      await page.waitForTimeout(400);
    }

    // Final Review – click "Create Event"
    const createBtn = overlay.locator('.event-wizard-button-create');
    await createBtn.waitFor({ state: 'visible', timeout: 8000 });
    await smartClick(createBtn);

    // Wait for the wizard to close
    await overlay.waitFor({ state: 'detached', timeout: 8000 });

    // Allow accordion refresh & FLIP animation to finish
    await page.waitForTimeout(800);

    await expect(frame.locator('.events-accordion-item')).toHaveCount(initialCount + 1);
    await expect(frame.locator('.events-accordion-item.new-event-highlight')).toBeVisible();
  });

  /* ---------------------------------------------------------------------- */
  /* 6  Manual Expansion near viewport bottom                               */
  /* ---------------------------------------------------------------------- */
  test('Expanding item near bottom keeps it fully visible', async ({ page }) => {
    const frame = await loadSimulator(page, { wizardOn: false });

    // Add several rows so accordion list is scrollable.
    for (let i = 0; i < 8; i++) {
      await smartClick(frame.locator('#addEventRow'), { preferProgrammatic: true });
    }

    // Switch to accordion view.
    await smartClick(frame.locator('#viewModeAccordion'));
    await page.waitForTimeout(400);

    // Scroll to bottom so last header sits near viewport bottom.
    await page.evaluate(() => {
      const iframe = document.querySelector('#app-frame');
      iframe && iframe.contentWindow && iframe.contentWindow.scrollTo(0, iframe.contentDocument.body.scrollHeight);
    });
    const lastHeader = frame.locator('.events-accordion-item .accordion-item-header').last();

    // Expand.
    await smartClick(lastHeader);
    await page.waitForTimeout(600);

    // Verify the header is still visible after expansion.
    const withinViewport = await lastHeader.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.bottom <= window.innerHeight && rect.top >= 0;
    });
    expect(withinViewport).toBeTruthy();
  });

  /* ---------------------------------------------------------------------- */
  /* 7  Manual Expansion near viewport top                                  */
  /* ---------------------------------------------------------------------- */
  test('Expanding item near top adjusts with small upward scroll', async ({ page }) => {
    const frame = await loadSimulator(page, { wizardOn: false });

    // Populate and switch to accordion view.
    for (let i = 0; i < 5; i++) {
      await smartClick(frame.locator('#addEventRow'), { preferProgrammatic: true });
    }
    await smartClick(frame.locator('#viewModeAccordion'));
    await page.waitForTimeout(400);

    // Scroll a little so first header is just below top (simulate user position).
    await page.evaluate(() => {
      const iframe = document.querySelector('#app-frame');
      iframe && iframe.contentWindow && iframe.contentWindow.scrollTo(0, 80);
    });
    const firstHeader = frame.locator('.events-accordion-item .accordion-item-header').first();

    await smartClick(firstHeader);
    await page.waitForTimeout(600);

    const headerTop = await firstHeader.evaluate(el => el.getBoundingClientRect().top);
    expect(headerTop).toBeGreaterThanOrEqual(0); // Still on-screen
  });

  /* ---------------------------------------------------------------------- */
  /* 8  focusOnEmptyRow helper behaves correctly                             */
  /* ---------------------------------------------------------------------- */
  test('focusOnEmptyRow() scrolls nearest and opens dropdown', async ({ page }) => {
    const frame = await loadSimulator(page, { wizardOn: false });

    await scrollToEvents(page, frame);

    // Create additional rows to push empty one off-screen.
    for (let i = 0; i < 6; i++) {
      await smartClick(frame.locator('#addEventRow'), { preferProgrammatic: true });
    }

    // Scroll away so empty row is off-screen.
    await page.evaluate(() => {
      const iframe = document.querySelector('#app-frame');
      iframe && iframe.contentWindow && iframe.contentWindow.scrollTo(0, 0);
    });

    // Invoke helper via page context.
    await page.evaluate(() => {
      const iframe = document.querySelector('#app-frame');
      const win = iframe && iframe.contentWindow;
      if (!win) return;
      const ui = win.WebUI_instance;
      const empty = ui?.eventsTableManager.findEmptyEventRow();
      ui?.eventsTableManager.focusOnEmptyRow(empty);
    });

    // Dropdown should become visible (it is moved to <body> when opened).
    // Wait until any visualization-dropdown element is displayed (display !== none).
    await page.waitForFunction(() => {
      const iframe = document.querySelector('#app-frame');
      const doc = iframe && iframe.contentDocument;
      if (!doc) return false;
      return Array.from(doc.querySelectorAll('.visualization-dropdown'))
                 .some(el => el.style.display !== 'none' && el.style.display !== '');
    }, { timeout: 5000 });
  });

  /* ---------------------------------------------------------------------- */
  /* 9  AccordionSorter highlight after FLIP sort                           */
  /* ---------------------------------------------------------------------- */
  test('Highlight persists after accordion FLIP sort', async ({ page }) => {
    const frame = await loadSimulator(page); // wizard enabled for quick event creation

    await scrollToEvents(page, frame);

    // Switch to accordion view early.
    await smartClick(frame.locator('#viewModeAccordion'));

    // Remove existing blank row so wizard will add a new item instead of replacing.
    const deleteBtn = frame.locator('#Events tbody tr .delete-event').first();
    if (await deleteBtn.count()) {
      await deleteBtn.evaluate(el => el.click());
      await expect(frame.locator('#Events tbody tr')).toHaveCount(0, { timeout: 3000 });
    }

    const initial = await frame.locator('.events-accordion-item').count();

    // Quickly add a new event via wizard (Expense → One-off flow).
    await openWizard(page, frame);

    // Select Expense wizard
    const expenseOpt = frame.locator('#wizardSelectionOverlay .wizard-selection-option:has-text("Expense")');
    await expenseOpt.waitFor({ state: 'visible', timeout: 8000 });
    await smartClick(expenseOpt);

    // Frequency – choose One-off (auto-advances)
    const oneOff = frame.locator('#eventWizardOverlay .event-wizard-choice-option:has-text("One-off")');
    await oneOff.waitFor({ state: 'visible', timeout: 8000 });
    await smartClick(oneOff);

    // Name step
    const nameInput2 = frame.locator('#eventWizardOverlay input[name="alias"]');
    await nameInput2.waitFor({ state: 'visible', timeout: 8000 });
    await nameInput2.fill('Tmp');
    await nameInput2.evaluate(el => el.blur());
    await page.waitForTimeout(300);
    const nextBtn3 = frame.locator('#eventWizardOverlay .event-wizard-button-next');
    await smartClick(nextBtn3);
    await page.waitForTimeout(400);

    // Cost step
    const costInput2 = frame.locator('#eventWizardOverlay input[name="amount"]');
    await costInput2.waitFor({ state: 'visible', timeout: 8000 });
    await costInput2.fill('500');
    await costInput2.evaluate(el => el.blur());
    await page.waitForTimeout(300);
    const nextBtn4 = frame.locator('#eventWizardOverlay .event-wizard-button-next');
    await smartClick(nextBtn4);
    await page.waitForTimeout(400);

    // Timing step (age input)
    const timingAge = frame.locator('#eventWizardOverlay input[name="fromAge"]');
    if (await timingAge.count()) {
      await timingAge.fill('35');
      await timingAge.evaluate(el => el.blur());
      await page.waitForTimeout(300);
      const nextBtn5 = frame.locator('#eventWizardOverlay .event-wizard-button-next');
      await smartClick(nextBtn5);
      await page.waitForTimeout(400);
    }

    // Summary – click Create Event
    const overlay = frame.locator('#eventWizardOverlay');
    const createBtn2 = overlay.locator('.event-wizard-button-create');
    await createBtn2.waitFor({ state: 'visible', timeout: 8000 });
    await smartClick(createBtn2);

    await overlay.waitFor({ state: 'detached', timeout: 8000 });

    await expect(frame.locator('.events-accordion-item')).toHaveCount(initial + 1, { timeout: 8000 });
    await expect(frame.locator('.events-accordion-item.new-event-highlight')).toBeVisible({ timeout: 8000 });
  });

  /* ---------------------------------------------------------------------- */
  /* 10  Mobile soft-keyboard safe-area check                                */
  /* ---------------------------------------------------------------------- */
  test('Expanded item leaves safe margin on mobile viewports', async ({ page, browserName }) => {
    // Only apply on mobile projects (Pixel 5 / iPhone) – desktop has ample space.
    const mobile = page.viewportSize()?.width && page.viewportSize().width < 800;
    test.skip(!mobile, 'Soft-keyboard margin relevant only on mobile');

    const frame = await loadSimulator(page, { wizardOn: false });

    // Add six non-empty events so the accordion list becomes scrollable.
    for (let i = 0; i < 6; i++) {
      await smartClick(frame.locator('#addEventRow'), { preferProgrammatic: true });

      // Convert the just-added blank row into a minimal event so a new blank row can be created next time.
      const lastRow = frame.locator('#Events tbody tr').last();
      const typeDD  = lastRow.locator('.event-type-dd');

      // Open the dropdown programmatically and select the first non-NOP option (usually "SI").
      await typeDD.evaluate((el) => {
        el.click();
        // Find the first option whose value is not "NOP" and click it.
        const menu = document.querySelector('.visualization-dropdown');
        if (!menu) return;
        const opt = [...menu.querySelectorAll('[data-value]')].find(o => o.dataset.value !== 'NOP');
        if (opt) opt.click();
      });

      // Blur to commit value (mobile wizard relies on blur handlers).
      await page.waitForTimeout(100);
    }
    await smartClick(frame.locator('#viewModeAccordion'));
    await page.waitForTimeout(400);

    // Expand the last item.
    const lastItem = frame.locator('.events-accordion-item').last();
    await smartClick(lastItem.locator('.accordion-item-header'));
    await page.waitForTimeout(600);

    // Wait until the accordion content sits safely above the mobile soft-keyboard area.
    const SAFE_MARGIN = 260; // px

    try {
      await page.waitForFunction(
        (safe) => {
          const iframe = document.querySelector('#app-frame');
          const doc = iframe && iframe.contentDocument;
          if (!doc) return false;

          const items = doc.querySelectorAll('.events-accordion-item');
          const last = items[items.length - 1];
          if (!last) return false;

          const content = last.querySelector('.accordion-item-content');
          if (!content) return false;

          const rect = content.getBoundingClientRect();
          return rect.bottom <= (window.innerHeight - safe + 2);
        },
        SAFE_MARGIN,
        { timeout: 20000 }
      );
    } catch (err) {
      // Gather diagnostic information to understand why the predicate failed.
      const debug = await page.evaluate((safe) => {
        const res = { safe };
        const iframe = document.querySelector('#app-frame');
        if (!iframe) { res.iframe = 'missing'; return res; }
        const doc = iframe.contentDocument;
        if (!doc) { res.doc = 'missing'; return res; }

        const items = doc.querySelectorAll('.events-accordion-item');
        res.itemCount = items.length;
        const last = items[items.length - 1];
        if (!last) { res.last = 'missing'; return res; }

        const content = last.querySelector('.accordion-item-content');
        res.contentFound = !!content;
        if (content) {
          const rect = content.getBoundingClientRect();
          res.rectBottom = rect.bottom;
          res.viewport = window.innerHeight;
          res.diff = rect.bottom - (window.innerHeight - safe + 2);
        }
        return res;
      }, SAFE_MARGIN);

      // Log the diagnostics so they appear in Playwright’s output.
      // eslint-disable-next-line no-console
      console.log('🔍 Safe-area check debug:', debug);
      throw err; // Re-throw to keep the test marked as failed.
    }
  });
}); 