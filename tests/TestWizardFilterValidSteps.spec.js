import { test, expect } from '@playwright/test';
import {
  smartClick,
  dismissWelcomeModal,
  waitForOverlayGone
} from '../src/frontend/web/utils/FrontendTestUtils.js';

// URL that serves the SPA (dev server started by Playwright test runner)
const BASE_URL = 'http://localhost:8080/#ifs';

/**
 * Navigate to the simulator iframe and dismiss the welcome modal
 * @param {import('@playwright/test').Page} page
 * @returns {import('@playwright/test').FrameLocator}
 */
/** Ensure the simulator iframe finishes loading its JS and DOM */
async function waitForSimulatorReady(page) {
  const frame = page.frameLocator('#app-frame');
  // Wait for the Add Event button to appear (initial markup)
  await frame.locator('#addEventRow').first().waitFor({ state: 'visible', timeout: 5000 });
  // DEBUG: Log initial script presence after Add Event button becomes visible
  await frame.locator('body').evaluate(() => {
    if (typeof Wizard !== 'undefined' && !window.Wizard) {
      window.Wizard = Wizard;
    }
    if (typeof WebUI !== 'undefined' && !window.WebUI) {
      window.WebUI = WebUI;
    }
  });
  // Additional readiness check: ensure WebUI + Wizard are fully instantiated
  await page.waitForFunction(() => {
    const iframe = document.querySelector('#app-frame');
    if (!iframe || !iframe.contentWindow) return false;
    const win = iframe.contentWindow;
    const webUIReady = win.WebUI && win.WebUI.getInstance && win.WebUI.getInstance();
    const wizardReady = win.Wizard && win.Wizard.getInstance && win.Wizard.getInstance();
    return !!(webUIReady && wizardReady && webUIReady.eventsTableManager);
  }, null, { timeout: 10000 });
}

async function loadSimulator(page, { wizardOn = false } = {}) {
  // Persist wizard toggle state before navigation so bootstrap logic picks it up.
  await page.addInitScript(state => {
    try { localStorage.setItem('eventsWizardState', state ? 'on' : 'off'); } catch (_) {}
  }, wizardOn);

  await page.goto(BASE_URL);
  const frame = page.frameLocator('#app-frame');
  // Ensure the simulator UI is fully ready before dismissing any overlays
  await waitForSimulatorReady(page);
  // The welcome modal may appear with a slight delay after the SPA boots. Try to dismiss it now.
  await dismissWelcomeModal(page, frame);
  // As an extra guard, wait until the overlay is actually gone so subsequent
  // interactions aren't blocked.
  await waitForOverlayGone(page);
  return frame;
}

/** Click the "Add Event" button N times */
async function addEventRows(frame, count = 1) {
  for (let i = 0; i < count; i++) {
    await frame.locator('body').evaluate(() => {
      const ui = window.WebUI && window.WebUI.getInstance ? window.WebUI.getInstance() : null;
      if (ui && ui.eventsTableManager) {
        ui.eventsTableManager.addEventRow();
      }
    });
    // Wait until the newly added row is attached (append at end)
    const rows = frame.locator('#Events tbody tr');
    await rows.last().waitFor({ state: 'attached' });
  }
}

/**
 * Patch the hidden `.event-type` input for a given table row and refresh the accordion.
 * This avoids interacting with the dropdown which would require substantial UI work
 * while still reflecting the real DOM state that Wizard relies on.
 */
async function setEventType(frame, rowNumber, eventType) {
  await frame.locator('body').evaluate((el, { rowNumber, eventType }) => {
    const rowId = `row_${rowNumber}`;
    const row = document.querySelector(`#Events tbody tr[data-row-id="${rowId}"]`);
    if (!row) throw new Error(`Row ${rowId} not found`);
    const hidden = row.querySelector('.event-type');
    if (hidden) hidden.value = eventType;

    const webUI = window.WebUI && window.WebUI.getInstance ? window.WebUI.getInstance() : null;
    if (webUI && webUI.eventAccordionManager) {
      webUI.eventAccordionManager.refresh();
    }
  }, { rowNumber, eventType });
}

/** Switch the Events section to accordion view */
async function switchToAccordion(frame) {
  await frame.locator('body').evaluate(() => {
    const ui = window.WebUI && window.WebUI.getInstance ? window.WebUI.getInstance() : null;
    if (ui && ui.eventsTableManager) {
      // Use handleViewToggle to properly update internal state flags
      ui.eventsTableManager.handleViewToggle('accordion');
    }
  });
  // Wait until accordion container becomes visible
  await frame.locator('.events-accordion-container').first().waitFor({ state: 'visible' });
}

/**
 * Expand the accordion item for the provided zero-based index and focus its name field
 * so Wizard links the upcoming call to that specific row.
 */
async function focusAccordionRow(frame, index) {
  await frame.locator('body').evaluate((el, idx) => {
    const accId = `accordion-item-${idx}`;
    const ui = window.WebUI && window.WebUI.getInstance ? window.WebUI.getInstance() : null;
    if (ui && ui.eventAccordionManager) {
      ui.eventAccordionManager.toggleAccordionItem(accId);
    }

    const input = document.querySelector(
      `.events-accordion-item[data-accordion-id="${accId}"] .accordion-edit-name`
    );
    if (input) input.focus();
  }, index);
}

/**
 * Utility that runs Wizard.filterValidSteps in the browser context and returns the
 * filtered list so expectations can run in the Node context.
 */
async function runFilterValidSteps(frame, steps, extra = {}) {
  return await frame.locator('body').evaluate((el, { steps, extra }) => {
    const wizard = window.Wizard && window.Wizard.getInstance ? window.Wizard.getInstance() : null;
    if (!wizard) {
      return [];
    }
    if (extra && extra.tourId) wizard.currentTourId = extra.tourId;
    return wizard.filterValidSteps(steps);
  }, { steps, extra });
}

//----------------------------------------------------------------------------------------------------------------------
// TEST 1 – Generic NOP rule (only empty row present)
//----------------------------------------------------------------------------------------------------------------------

test('Wizard.filterValidSteps keeps generic steps when only a single empty NOP row exists', async ({ page }) => {
  const frame = await loadSimulator(page);
  // No additional rows/events – initial row is NOP and empty
  await switchToAccordion(frame);

  // Generic step (no eventTypes)
  const steps = [
    {
      element: '.accordion-edit-toage',
      'accordion-element': '.accordion-edit-toage'
    }
  ];

  const filtered = await runFilterValidSteps(frame, steps);
  expect(filtered.length).toBe(1);
  expect(filtered[0].element.startsWith(
    '.events-accordion-item[data-accordion-id="accordion-item-0"]'
  )).toBe(true);
});

//----------------------------------------------------------------------------------------------------------------------
// TEST 2 – Deduplication & scoping logic (generic vs specific SALARY)
//----------------------------------------------------------------------------------------------------------------------

test('Wizard.filterValidSteps prefers event-specific step over generic and scopes selector', async ({ page }) => {
  const frame = await loadSimulator(page);

  // Create one additional row so we have at least row_1
  // Use the add event button as requested
  // row_1 already exists, we just repurpose it
  await setEventType(frame, 1, 'SI');
  await switchToAccordion(frame);
  await focusAccordionRow(frame, 0); // row_1 → accordion-item-0

  const steps = [
    { element: '#AccordionEventTypeToggle_row_1', eventTypes: ['SI'] },
    { element: '.accordion-edit-name', 'accordion-element': '.accordion-edit-name' },
    { element: '.accordion-edit-name', 'accordion-element': '.accordion-edit-name', eventTypes: ['SI'] }
  ];

  const filtered = await runFilterValidSteps(frame, steps);

  // Expect toggle and SALARY-specific name step
  expect(filtered.length).toBe(2);
  const nameStep = filtered.find((s) => s.element.includes('.accordion-edit-name'));
  expect(nameStep).toBeDefined();
  expect(nameStep.eventTypes).toEqual(['SI']);
  expect(nameStep.element.startsWith(
    '.events-accordion-item[data-accordion-id="accordion-item-0"]'
  )).toBe(true);
});

//----------------------------------------------------------------------------------------------------------------------
// TEST 3 – Generic vs event-specific precedence (fallback to generic when mismatch)
//----------------------------------------------------------------------------------------------------------------------

test('Wizard.filterValidSteps falls back to generic step when no event-specific match exists', async ({ page }) => {
  const frame = await loadSimulator(page);

  // Create BONUS row under row_2
  await addEventRows(frame, 1); // row_2
  await setEventType(frame, 2, 'SM');

  await switchToAccordion(frame);
  await focusAccordionRow(frame, 1); // row_2 → accordion-item-1

  const steps = [
    { element: '.accordion-edit-amount', 'accordion-element': '.accordion-edit-amount' },
    { element: '.accordion-edit-amount', 'accordion-element': '.accordion-edit-amount', eventTypes: ['SI'] }
  ];

  const filtered = await runFilterValidSteps(frame, steps);

  expect(filtered.length).toBe(1);
  const amtStep = filtered[0];
  expect(amtStep.eventTypes).toBeUndefined();
  expect(amtStep.element.startsWith(
    '.events-accordion-item[data-accordion-id="accordion-item-1"]'
  )).toBe(true);
});

//----------------------------------------------------------------------------------------------------------------------
// TEST 4 – Generic NOP rule when other events exist (step must be omitted)
//----------------------------------------------------------------------------------------------------------------------

test('Wizard.filterValidSteps omits generic step when empty NOP row exists alongside other events', async ({ page }) => {
  const frame = await loadSimulator(page);

  // Create one real event (SALARY) in row_1, leave row_2 empty (NOP)
  await setEventType(frame, 1, 'SI');
  await addEventRows(frame, 1); // row_2 remains empty NOP

  await switchToAccordion(frame);
  await focusAccordionRow(frame, 1); // Empty row – accordion-item-1

  const steps = [
    { element: '.accordion-edit-rate', 'accordion-element': '.accordion-edit-rate' }
  ];

  const filtered = await runFilterValidSteps(frame, steps);
  expect(filtered.length).toBe(0);
});

//----------------------------------------------------------------------------------------------------------------------
// TEST 5 – Consecutive row tours maintain correct scoping across different rows
//----------------------------------------------------------------------------------------------------------------------

test('Wizard.filterValidSteps correctly updates selector scoping across consecutive rows', async ({ page }) => {
  const frame = await loadSimulator(page);

  // Setup events so we have SALARY in row_2 (index 1) and MORTGAGE in row_6 (index 5)
  await addEventRows(frame, 1); // row_2
  await setEventType(frame, 2, 'SI');

  // Add four more rows so row_6 exists
  await addEventRows(frame, 4); // rows 3-6
  await setEventType(frame, 6, 'M');

  await switchToAccordion(frame);

  const baseSteps = [
    { element: '.accordion-edit-name', 'accordion-element': '.accordion-edit-name', eventTypes: ['SI'] },
    { element: '.accordion-edit-name', 'accordion-element': '.accordion-edit-name', eventTypes: ['M'] }
  ];

  // First run – SALARY on row_2 (accordion-item-1)
  await focusAccordionRow(frame, 1);
  let filtered = await runFilterValidSteps(frame, baseSteps);
  expect(filtered.length).toBe(1);
  expect(filtered[0].eventTypes).toEqual(['SI']);
  expect(filtered[0].element).toContain('accordion-item-1');

  // Second run – MORTGAGE on row_6 (accordion-item-5)
  await focusAccordionRow(frame, 5);
  filtered = await runFilterValidSteps(frame, baseSteps);
  expect(filtered.length).toBe(1);
  expect(filtered[0].eventTypes).toEqual(['M']);
  expect(filtered[0].element).toContain('accordion-item-5');
});

//----------------------------------------------------------------------------------------------------------------------
// TEST 6 – Mini tour UI highlighting in table view
//----------------------------------------------------------------------------------------------------------------------

test('Mini tour in table view highlights each first-row field', async ({ page }) => {
  const frame = await loadSimulator(page);

  // Make row_1 a SALARY event so it is non-NOP
  await setEventType(frame, 1, 'SI');

  // Ensure we are in TABLE view (default) just to be explicit
  await frame.locator('body').evaluate(() => {
    const ui = window.WebUI && window.WebUI.getInstance ? window.WebUI.getInstance() : null;
    if (ui && ui.eventsTableManager) {
      ui.eventsTableManager.handleViewToggle('table');
    }
  });

  // Start mini-tour for the events card
  await frame.locator('body').evaluate(() => {
    const wiz = window.Wizard && window.Wizard.getInstance ? window.Wizard.getInstance() : null;
    if (wiz) {
      wiz.start({ type: 'mini', card: 'events' });
    }
  });

  // Iterate through the tour steps until the tour finishes
  for (let guard = 0; guard < 30; guard++) { // safety guard
    // Wait for pop-over to appear
    await frame.locator('.driver-popover').waitFor({ state: 'visible' });
    // On some overview steps there might be no highlighted element – only check when present
    const highlightLocator = frame.locator('.driver-highlighted-element');
    if (await highlightLocator.count() > 0) {
      await expect(highlightLocator).toBeVisible();
    }

    // Get current selector from the wizard instance
    const selector = await frame.locator('body').evaluate(() => {
      const wiz = window.Wizard && window.Wizard.getInstance ? window.Wizard.getInstance() : null;
      return (() => {
        if (!wiz || !wiz.tour) return null;
        if (typeof wiz.tour.getActiveStep === 'function') {
          return wiz.tour.getActiveStep()?.element;
        }
        if (typeof wiz.tour.getActiveIndex === 'function' && wiz.validSteps) {
          const i = wiz.tour.getActiveIndex();
          return wiz.validSteps[i]?.element ?? null;
        }
        return null;
      })();
    });

    // If the step targets a specific event-row element, it must belong to row_1
    if (selector && selector.includes('_row_')) {
      expect(selector).toContain('_row_1');
    }

    // Locate the "Next" / "Done" button inside the popover and click it
    const nextBtn = frame.locator('.driver-popover button:has-text("Next"), .driver-popover button:has-text("Done")');
    const text = (await nextBtn.innerText()).trim();
    await nextBtn.click();

    if (text === 'Done') {
      // Tour finished successfully
      break;
    }
    // Small delay to allow DOM updates before next iteration; BubblesEngine reuses the same popover element
    await page.waitForTimeout(100);
  }
});

//----------------------------------------------------------------------------------------------------------------------
// TEST 7 – Mini tour in accordion view auto-expands first event, highlights each field, then collapses
//----------------------------------------------------------------------------------------------------------------------

test('Mini tour in accordion view auto-expands and collapses first event', async ({ page }) => {
  const frame = await loadSimulator(page);

  // Make row_1 a SALARY event
  await setEventType(frame, 1, 'SI');

  // Switch to accordion view (no events expanded)
  await switchToAccordion(frame);

  // Confirm no expanded accordion items
  await expect(frame.locator('.events-accordion-item .accordion-item-content.expanded')).toHaveCount(0);

  // Start mini tour (events card)
  await frame.locator('body').evaluate(() => {
    const wiz = window.Wizard && window.Wizard.getInstance ? window.Wizard.getInstance() : null;
    if (wiz) wiz.start({ type: 'mini', card: 'events' });
  });

     // The first accordion item will expand automatically once the tour reaches the
   // first field-specific step. Capture its selector here for later assertions.
   const firstAccSelector = '.events-accordion-item[data-accordion-id="accordion-item-0"] .accordion-item-content.expanded';
   let expandedSeen = false;

  // Iterate through tour steps and ensure they point to first accordion item
  for (let guard = 0; guard < 40; guard++) {
    await frame.locator('.driver-popover').waitFor({ state: 'visible' });
    const highlightLocator = frame.locator('.driver-highlighted-element');
    if (await highlightLocator.count() > 0) {
      await expect(highlightLocator).toBeVisible();
    }

    // Track whether accordion has expanded yet
    if (!expandedSeen) {
      try {
        if (await frame.locator(firstAccSelector).isVisible()) {
          expandedSeen = true;
        }
      } catch (_) {}
    }

    const selector = await frame.locator('body').evaluate(() => {
      const wiz = window.Wizard && window.Wizard.getInstance ? window.Wizard.getInstance() : null;
      return (() => {
        if (!wiz || !wiz.tour) return null;
        if (typeof wiz.tour.getActiveStep === 'function') {
          return wiz.tour.getActiveStep()?.element;
        }
        if (typeof wiz.tour.getActiveIndex === 'function' && wiz.validSteps) {
          const i = wiz.tour.getActiveIndex();
          return wiz.validSteps[i]?.element ?? null;
        }
        return null;
      })();
    });

    if (selector && selector.includes('.events-accordion-item')) {
      expect(selector).toContain('accordion-item-0');
    }

    const nextBtn = frame.locator('.driver-popover button:has-text("Next"), .driver-popover button:has-text("Done")');
    const text = (await nextBtn.innerText()).trim();
    await nextBtn.click();

    if (text === 'Done') break;
    await page.waitForTimeout(100);
  }

  // Ensure the accordion actually expanded at least once during the tour
  expect(expandedSeen).toBe(true);

  // Tour finished – accordion item should collapse back automatically
  await frame.locator(firstAccSelector).waitFor({ state: 'hidden' });
});

//----------------------------------------------------------------------------------------------------------------------
// TEST 8 – Mini tour in accordion view uses pre-expanded second event
//----------------------------------------------------------------------------------------------------------------------

test('Mini tour in accordion view uses pre-expanded second event', async ({ page }) => {
  const frame = await loadSimulator(page);

  // Set up two events; second row becomes SALARY (non-NOP)
  await setEventType(frame, 1, 'SI');
  await addEventRows(frame, 1); // adds row_2
  await setEventType(frame, 2, 'SI');

  // Switch to accordion view and expand second event only
  await switchToAccordion(frame);
  await focusAccordionRow(frame, 1);

  const secondAccSel = '.events-accordion-item[data-accordion-id="accordion-item-1"] .accordion-item-content.expanded';
  await frame.locator(secondAccSel).waitFor({ state: 'visible' });

  // Start mini tour
  await frame.locator('body').evaluate(() => {
    const wiz = window.Wizard && window.Wizard.getInstance ? window.Wizard.getInstance() : null;
    wiz && wiz.start({ type: 'mini', card: 'events' });
  });

  for (let guard = 0; guard < 40; guard++) {
    await frame.locator('.driver-popover').waitFor({ state: 'visible' });
    const highlightLocator = frame.locator('.driver-highlighted-element');
    if ((await highlightLocator.count()) > 0) {
      await expect(highlightLocator).toBeVisible();
    }

    const sel = await frame.locator('body').evaluate(() => {
      const wiz = window.Wizard && window.Wizard.getInstance ? window.Wizard.getInstance() : null;
      return (() => {
        if (!wiz || !wiz.tour) return null;
        if (typeof wiz.tour.getActiveStep === 'function') {
          return wiz.tour.getActiveStep()?.element;
        }
        if (typeof wiz.tour.getActiveIndex === 'function' && wiz.validSteps) {
          const i = wiz.tour.getActiveIndex();
          return wiz.validSteps[i]?.element ?? null;
        }
        return null;
      })();
    });
    if (sel && sel.includes('.events-accordion-item')) {
      expect(sel).toContain('accordion-item-1');
    }

    const nextBtn = frame.locator('.driver-popover button:has-text("Next"), .driver-popover button:has-text("Done")');
    const txt = (await nextBtn.innerText()).trim();
    await nextBtn.click();
    if (txt === 'Done') break;
    await page.waitForTimeout(100);
  }

  // Second accordion item should remain expanded after tour ends
  await expect(frame.locator(secondAccSel)).toBeVisible();
});

//----------------------------------------------------------------------------------------------------------------------
// TEST 9 – Mini tour in accordion view shows only visible fields for EXPENSE event
//----------------------------------------------------------------------------------------------------------------------

test('Mini tour in accordion view shows only visible fields for EXPENSE event', async ({ page }) => {
  const frame = await loadSimulator(page);

  // Configure first row as EXPENSE and expand it
  await setEventType(frame, 1, 'E');
  await switchToAccordion(frame);
  await focusAccordionRow(frame, 0);

  const firstAccSel = '.events-accordion-item[data-accordion-id="accordion-item-0"] .accordion-item-content.expanded';
  await frame.locator(firstAccSel).waitFor({ state: 'visible' });

  await frame.locator('body').evaluate(() => {
    const wiz = window.Wizard && window.Wizard.getInstance ? window.Wizard.getInstance() : null;
    wiz && wiz.start({ type: 'mini', card: 'events' });
  });

  const encountered = new Set();

  for (let guard = 0; guard < 40; guard++) {
    await frame.locator('.driver-popover').waitFor({ state: 'visible' });
    const sel = await frame.locator('body').evaluate(() => {
      const wiz = window.Wizard && window.Wizard.getInstance ? window.Wizard.getInstance() : null;
      return (() => {
        if (!wiz || !wiz.tour) return null;
        if (typeof wiz.tour.getActiveStep === 'function') {
          return wiz.tour.getActiveStep()?.element;
        }
        if (typeof wiz.tour.getActiveIndex === 'function' && wiz.validSteps) {
          const i = wiz.tour.getActiveIndex();
          return wiz.validSteps[i]?.element ?? null;
        }
        return null;
      })();
    });
    if (sel) encountered.add(sel);
    const nextBtn = frame.locator('.driver-popover button:has-text("Next"), .driver-popover button:has-text("Done")');
    const txt = (await nextBtn.innerText()).trim();
    await nextBtn.click();
    if (txt === 'Done') break;
    await page.waitForTimeout(100);
  }

  // Expense events should NOT include employer match field
  [...encountered].forEach((s) => {
    expect(s).not.toContain('.accordion-edit-match');
    if (s.includes('.events-accordion-item')) expect(s).toContain('accordion-item-0');
  });
});

//----------------------------------------------------------------------------------------------------------------------
// TEST 10 – Mini tour in accordion view shows only visible fields for STOCK MARKET event
//----------------------------------------------------------------------------------------------------------------------

test('Mini tour in accordion view shows only visible fields for STOCK MARKET event', async ({ page }) => {
  const frame = await loadSimulator(page);

  // Configure first row as SM and expand it
  await setEventType(frame, 1, 'SM');
  await switchToAccordion(frame);
  await focusAccordionRow(frame, 0);

  const firstAccSel = '.events-accordion-item[data-accordion-id="accordion-item-0"] .accordion-item-content.expanded';
  await frame.locator(firstAccSel).waitFor({ state: 'visible' });

  await frame.locator('body').evaluate(() => {
    const wiz = window.Wizard && window.Wizard.getInstance ? window.Wizard.getInstance() : null;
    wiz && wiz.start({ type: 'mini', card: 'events' });
  });

  const encountered = new Set();

  for (let guard = 0; guard < 40; guard++) {
    await frame.locator('.driver-popover').waitFor({ state: 'visible' });
    const sel = await frame.locator('body').evaluate(() => {
      const wiz = window.Wizard && window.Wizard.getInstance ? window.Wizard.getInstance() : null;
      return (() => {
        if (!wiz || !wiz.tour) return null;
        if (typeof wiz.tour.getActiveStep === 'function') {
          return wiz.tour.getActiveStep()?.element;
        }
        if (typeof wiz.tour.getActiveIndex === 'function' && wiz.validSteps) {
          const i = wiz.tour.getActiveIndex();
          return wiz.validSteps[i]?.element ?? null;
        }
        return null;
      })();
    });
    if (sel) encountered.add(sel);
    const nextBtn = frame.locator('.driver-popover button:has-text("Next"), .driver-popover button:has-text("Done")');
    const txt = (await nextBtn.innerText()).trim();
    await nextBtn.click();
    if (txt === 'Done') break;
    await page.waitForTimeout(100);
  }

  // Stock Market events should NOT include amount field
  [...encountered].forEach((s) => {
    expect(s).not.toContain('.accordion-edit-amount');
    if (s.includes('.events-accordion-item')) expect(s).toContain('accordion-item-0');
  });
});

//----------------------------------------------------------------------------------------------------------------------
// TEST 11 – Tour-level filtering: full / quick / mini
//----------------------------------------------------------------------------------------------------------------------

test.describe('Wizard.filterValidSteps respects tour-level visibility tags', () => {
  const stepsByTour = [
    { element: '.events-section', tours: ['full'] },
    { element: '.graphs-section', tours: ['quick'] },
    { element: '.data-section', tours: ['mini'] },
    { element: '.parameters-section', tours: ['full', 'quick'] },
    { element: 'header' } // untagged – visible everywhere
  ];

  async function expectElements(frame, tourId, shouldContain, shouldNotContain) {
    const filtered = await runFilterValidSteps(frame, stepsByTour, { tourId });
    const el = filtered.map((s) => s.element);
    shouldContain.forEach((sel) => {
      if (Array.isArray(sel)) {
        // At least one of the alternatives should be present
        const found = sel.some((alt) => el.includes(alt));
        expect(found).toBe(true);
      } else {
        expect(el).toContain(sel);
      }
    });
    shouldNotContain.forEach((sel) => expect(el).not.toContain(sel));
  }

  test('Full tour keeps only full and untagged steps', async ({ page }) => {
    const frame = await loadSimulator(page);
    await switchToAccordion(frame);
    await expectElements(
      frame,
      'full',
      ['.events-section', '.parameters-section', 'header'],
      ['.graphs-section', '.data-section']
    );
  });

  test('Quick tour keeps quick, shared full/quick and untagged steps', async ({ page }) => {
    const frame = await loadSimulator(page);
    await switchToAccordion(frame);
    await expectElements(
      frame,
      'quick',
      ['.graphs-section', '.parameters-section', 'header'],
      ['.events-section', '.data-section']
    );
  });

  test('Mini tour keeps mini and untagged steps', async ({ page }) => {
    const frame = await loadSimulator(page);
    await switchToAccordion(frame);
    await expectElements(
      frame,
      'mini',
      [['.data-section', '#mobile-data-message'], 'header'],
      ['.events-section', '.graphs-section', '.parameters-section']
    );
  });
});

