import { test, expect } from '@playwright/test';
import {
  loadSimulator,
  seedEvents
} from './helpers/PlaywrightFinsim.js';

test.use({ actionTimeout: 20000 });

async function configureDeterministic(frame, startCountry = 'ie') {
  await frame.locator('body').evaluate((_, country) => {
    const webUI = window.WebUI && window.WebUI.getInstance ? window.WebUI.getInstance() : null;
    if (!webUI) throw new Error('WebUI instance unavailable');

    webUI.setValue('simulation_mode', 'single');
    webUI.setValue('economy_mode', 'deterministic');
    webUI.setValue('StartingAge', 30);
    webUI.setValue('TargetAge', 40);
    webUI.setValue('RetirementAge', 65);
    webUI.setValue('StartCountry', country);

    // Ensure deterministic mode cannot inherit stale Monte Carlo volatility values.
    const volatilityInputs = Array.from(document.querySelectorAll('input[id$="GrowthStdDev"], input[id^="GlobalAssetVolatility_"]'));
    for (let i = 0; i < volatilityInputs.length; i++) {
      volatilityInputs[i].value = '0';
      volatilityInputs[i].dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, startCountry);
}

async function runSimulation(frame) {
  await frame.locator('body').evaluate(async () => {
    if (typeof run !== 'function') throw new Error('run() is not available');
    await run();
  });
}

async function waitForDataRows(frame) {
  await expect.poll(async () => {
    return await frame.locator('#Data tbody tr:not(.tax-header)').count();
  }, { timeout: 60000 }).toBeGreaterThan(0);
}

async function ensureDetailedDataTableVisible(frame) {
  const showAnyway = frame.getByRole('link', { name: 'Show anyway' });
  if (await showAnyway.count() > 0 && await showAnyway.first().isVisible()) {
    await showAnyway.first().click();
  }
}

async function getRowWarningText(frame, rowIndex1Based) {
  return await frame.locator('body').evaluate((_, rowIndex) => {
    const row = document.querySelector(`#Events tbody tr:nth-child(${rowIndex})`);
    if (!row) return '';
    const warned = Array.from(row.querySelectorAll('[data-tooltip]'))
      .map(el => el.getAttribute('data-tooltip') || '')
      .filter(Boolean);
    return warned.join('\n');
  }, rowIndex1Based);
}

test('matching foreign tax types are aggregated into residence columns', async ({ page }) => {
  const frame = await loadSimulator(page);
  await seedEvents(page, frame, [
    { type: 'SI', alias: 'Domestic Salary', amount: '50000', fromAge: 30, toAge: 35, currency: 'USD' },
    { type: 'SI', alias: 'IE Salary', amount: '40000', fromAge: 30, toAge: 35, currency: 'EUR', linkedCountry: 'ie' }
  ], { startCountry: 'us' });
  await configureDeterministic(frame, 'us');

  await runSimulation(frame);
  await waitForDataRows(frame);
  await ensureDetailedDataTableVisible(frame);

  const hasSplitIncomeTaxColumn = await frame.locator('body').evaluate(() => {
    const taxHeaderCells = Array.from(document.querySelectorAll('#Data tbody tr.tax-header .dynamic-section-cell[data-key]'));
    const visibleCells = taxHeaderCells.filter(cell => {
      const style = window.getComputedStyle(cell);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    const keys = visibleCells.map(cell => (cell.dataset && cell.dataset.key) ? cell.dataset.key : '');
    return keys.some(key => /^Tax__incomeTax:[a-z]{2}$/i.test(key));
  });
  expect(hasSplitIncomeTaxColumn).toBeFalsy();
});

test('attribution tooltip shows source tax, residence tax, and foreign tax credit', async ({ page }) => {
  const frame = await loadSimulator(page);
  await seedEvents(page, frame, [
    { type: 'SI', alias: 'Domestic Salary', amount: '50000', fromAge: 30, toAge: 35, currency: 'USD' },
    { type: 'SI', alias: 'IE Salary', amount: '40000', fromAge: 30, toAge: 35, currency: 'EUR', linkedCountry: 'ie' }
  ], { startCountry: 'us' });
  await configureDeterministic(frame, 'us');

  await runSimulation(frame);
  await waitForDataRows(frame);
  await ensureDetailedDataTableVisible(frame);

  const taxCell = frame.locator('#data_row_1 .dynamic-section-cell[data-key="Tax__incomeTax"]').first();
  await taxCell.scrollIntoViewIfNeeded();
  await expect(taxCell).toBeVisible({ timeout: 5000 });
  const isMobileViewport = await frame.locator('body').evaluate(() => window.innerWidth <= 768);
  if (isMobileViewport) {
    await taxCell.dispatchEvent('touchstart');
    await page.waitForTimeout(700);
  } else {
    await taxCell.hover();
  }
  await expect(frame.locator('.visualization-tooltip').last()).toBeVisible({ timeout: 5000 });

  const tooltip = frame.locator('.visualization-tooltip').last();
  await expect(tooltip).toContainText(/Foreign Tax Credit/i);
  await expect(tooltip).toContainText(/IE|US/i);
});

test('drawdown priority list shows country suffixes for foreign investments', async ({ page }) => {
  const frame = await loadSimulator(page);
  await seedEvents(page, frame, [
    { type: 'MV-US', alias: 'MoveUS', fromAge: 35, toAge: 35 }
  ]);
  await configureDeterministic(frame, 'ie');

  await frame.locator('body').evaluate(async () => {
    const webUI = window.WebUI.getInstance();
    await webUI.dragAndDrop.renderPriorities();
  });

  const priorityLabels = frame.locator('.priorities-container .priority-label');
  await expect(priorityLabels.first()).toBeVisible();
  const labelsText = await priorityLabels.allTextContents();
  const hasCountrySuffix = labelsText.some(text => /\([A-Z]{2}\)/.test((text || '').trim()));
  expect(hasCountrySuffix).toBeTruthy();
});

test('rental income validation blocks simulation when property missing', async ({ page }) => {
  const frame = await loadSimulator(page);
  await seedEvents(page, frame, [
    { type: 'RI', alias: 'Rental', amount: '10000', fromAge: 30, toAge: 40 }
  ]);
  await configureDeterministic(frame, 'ie');

  await runSimulation(frame);

  await expect.poll(async () => {
    return await getRowWarningText(frame, 1);
  }, { timeout: 10000 }).toMatch(/property event/i);

  const dataRows = await frame.locator('#Data tbody tr:not(.tax-header)').count();
  expect(dataRows).toBe(0);
});

test('rental income validation blocks when timeline invalid', async ({ page }) => {
  const frame = await loadSimulator(page);
  await seedEvents(page, frame, [
    { type: 'R', alias: 'Property', amount: '300000', fromAge: 35, toAge: 60 },
    { type: 'RI', alias: 'Property', amount: '10000', fromAge: 30, toAge: 40 }
  ]);
  await configureDeterministic(frame, 'ie');

  await runSimulation(frame);

  await expect.poll(async () => {
    return await getRowWarningText(frame, 2);
  }, { timeout: 10000 }).toMatch(/cannot start before/i);
});
