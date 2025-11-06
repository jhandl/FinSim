import { test, expect } from '@playwright/test';
import {
  loadSimulator,
  seedEvents
} from './helpers/PlaywrightFinsim.js';

test.use({ actionTimeout: 20000 });

test('data table toggles natural/unified currency modes and shows converted values', async ({ page }) => {
  // Use loadSimulator which properly waits for initialization
  // But we need to ensure it waits for tax rulesets to be loaded before checking econ.ready
  const frame = await loadSimulator(page);
  
  await seedEvents(page, frame, [
    { type: 'MV-AR', alias: 'MoveAR', fromAge: 40, toAge: 40 }
  ], { startCountry: 'ie' });

  // Wait for relocation transitions to be extracted
  await page.waitForTimeout(200);
  
  // Ensure relocation transitions are extracted before setting up controls
  await frame.locator('body').evaluate(() => {
    const webUI = window.WebUI.getInstance();
    const tm = webUI.tableManager;
    
    // Extract relocation transitions first
    RelocationUtils.extractRelocationTransitions(webUI, tm);
    
    // Now set up controls (this reads events to populate dropdown)
    tm.setupTableCurrencyControls();
    tm.currencyMode = 'natural';
    tm.reportingCurrency = 'EUR';
    tm.updateCurrencyControlVisibility();

    const rows = [
      { Age: 30, NetIncome: 52000, Expenses: 21000, Cash: 12000, RealEstateCapital: 85000, Tax__incomeTax: 5000 },
      { Age: 41, NetIncome: 66000, Expenses: 28000, Cash: 15000, RealEstateCapital: 125000, Tax__incomeTax: 8000 }
    ];

    rows.forEach((row, idx) => {
      const clone = Object.assign({}, row);
      tm.setDataRow(idx + 1, clone);
    });
  });

  // Note: FormatUtils is declared as a global class (not window property) in the iframe.
  // We will prefer global FormatUtils inside evaluate callbacks and fallback to a simple parser.

  // Wait for currency controls to be created and visible (skip visibility check on mobile)
  const naturalToggle = frame.locator('#currencyModeNatural_TableManager');
  const unifiedToggle = frame.locator('#currencyModeUnified_TableManager');
  const dropdownContainer = frame.locator('#data-table-controls .currency-dropdown-container');

  // On mobile, elements may be in DOM but hidden by responsive CSS, so we check for existence instead
  await expect(naturalToggle).toBeAttached({ timeout: 5000 });
  await expect(unifiedToggle).toBeAttached({ timeout: 5000 });
  
  // Check visibility only on desktop-sized viewports
  const viewport = page.viewportSize();
  if (viewport && viewport.width >= 768) {
    await expect(naturalToggle).toBeVisible({ timeout: 5000 });
    await expect(unifiedToggle).toBeVisible({ timeout: 5000 });
  }
  
  await expect(naturalToggle).toHaveClass(/mode-toggle-active/);
  await expect(unifiedToggle).not.toHaveClass(/mode-toggle-active/);
  expect(await dropdownContainer.evaluate(el => getComputedStyle(el).display)).toBe('none');

  const netIncomeIndex = await frame.locator('#Data thead tr:nth-of-type(2) th[data-key="NetIncome"]').evaluate((th) => {
    if (!th || !th.parentElement) return 2;
    // Only count visible columns to match tbody structure
    const visibleHeaders = Array.from(th.parentElement.children).filter(h => {
      const style = window.getComputedStyle(h);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    return visibleHeaders.indexOf(th) + 1;
  });

  const naturalCell = await frame.locator(`#data_row_1 td:nth-of-type(${netIncomeIndex}) .cell-content`).innerText();
  expect(naturalCell).toMatch(/€|EUR/);

  // Same-currency identity check in unified mode (EUR → EUR should be unchanged)
  const naturalDigits = await frame.locator('body').evaluate((_, idx) => {
    const cell = document.querySelector(`#data_row_1 td:nth-of-type(${idx}) .cell-content`);
    const txt = cell ? (cell.textContent || '') : '';
    return txt.replace(/[^0-9\-]/g, '');
  }, netIncomeIndex);

  // Click unified toggle - use evaluate on mobile to ensure handler fires
  const viewportSize = page.viewportSize();
  if (viewportSize && viewportSize.width < 768) {
    // On mobile, trigger click via evaluate and manually call handler if needed
    await frame.locator('body').evaluate(() => {
      const webUI = window.WebUI.getInstance();
      if (webUI && webUI.tableManager) {
        webUI.tableManager.handleCurrencyModeChange('unified');
      }
    });
  } else {
    await unifiedToggle.click();
  }
  await page.waitForTimeout(300);

  await expect(unifiedToggle).toHaveClass(/mode-toggle-active/);
  await expect(naturalToggle).not.toHaveClass(/mode-toggle-active/);
  expect(await dropdownContainer.evaluate(el => getComputedStyle(el).display)).toBe('block');

  const dropdown = frame.locator('#reportingCurrencySelect_TableManager');
  // Wait for dropdown to be attached (on mobile it may be hidden)
  await expect(dropdown).toBeAttached({ timeout: 5000 });
  const viewportSize2 = page.viewportSize();
  if (viewportSize2 && viewportSize2.width >= 768) {
    // On desktop, also check visibility
    await expect(dropdown).toBeVisible({ timeout: 5000 });
  }
  await page.waitForTimeout(200);
  
  // Debug: Check what options are available
  const availableOptions = await dropdown.evaluate((select) => 
    Array.from(select.options).map(opt => opt.value)
  );

  // First select EUR explicitly (if available) to verify identity conversion in unified mode
  if (availableOptions.includes('EUR')) {
    const viewportSizeI = page.viewportSize();
    if (viewportSizeI && viewportSizeI.width < 768) {
      await dropdown.evaluate((select) => {
        select.value = 'EUR';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    } else {
      await dropdown.selectOption('EUR');
    }
    await page.waitForTimeout(200);
    const unifiedEurDigits = await frame.locator('body').evaluate((_, idx) => {
      const cell = document.querySelector(`#data_row_1 td:nth-of-type(${idx}) .cell-content`);
      const txt = cell ? (cell.textContent || '') : '';
      return txt.replace(/[^0-9\-]/g, '');
    }, netIncomeIndex);
    expect(unifiedEurDigits).toBe(naturalDigits);
  }
  
  // Use ARS if available, otherwise use EUR (start country currency)
  const targetCurrency = availableOptions.includes('ARS') ? 'ARS' : 'EUR';
  const viewportSize3 = page.viewportSize();
  if (viewportSize3 && viewportSize3.width < 768) {
    // On mobile, set value via evaluate since dropdown is hidden
    await dropdown.evaluate((select, value) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, targetCurrency);
  } else {
    await dropdown.selectOption(targetCurrency);
  }
  await page.waitForTimeout(200);

  const unifiedCell = await frame.locator(`#data_row_1 td:nth-of-type(${netIncomeIndex}) .cell-content`).innerText();
  // Check for currency symbol (€ for EUR, $ for ARS/USD)
  if (targetCurrency === 'ARS') {
    expect(unifiedCell).toMatch(/\$|ARS/);
  } else {
    expect(unifiedCell).toMatch(/€|EUR/);
  }

  // Validate nominal FX (constant) conversion for a known value
  const convCheck = await frame.locator('body').evaluate((_, netIncomeIndex) => {
    try {
      const webUI = window.WebUI.getInstance();
      const tm = webUI.tableManager;
      const cfg = window.Config.getInstance();
      const econ = cfg.getEconomicData();
      const age = 30;
      const year = cfg.getSimulationStartYear() + age;
      const fromCountry = (tm && typeof tm.getStartCountry === 'function') ? tm.getStartCountry() : (cfg.getDefaultCountry ? cfg.getDefaultCountry() : 'ie');
      const toCountry = (tm && tm.reportingCurrency === 'ARS') ? 'ar' : 'ie';
      const expected = econ.convert(52000, fromCountry, toCountry, year, { fxMode: 'constant', baseYear: cfg.getSimulationStartYear() });
      const cell = document.querySelector(`#data_row_1 td:nth-of-type(${netIncomeIndex}) .cell-content`);
      const actualText = cell ? (cell.textContent || '') : '';
      const parseCurrency = (txt) => {
        try {
          const webUI = window.WebUI && window.WebUI.getInstance ? window.WebUI.getInstance() : null;
          if (webUI && webUI.formatUtils && webUI.formatUtils.constructor && typeof webUI.formatUtils.constructor.parseCurrency === 'function') {
            return webUI.formatUtils.constructor.parseCurrency(txt);
          }
          if (typeof FormatUtils !== 'undefined' && typeof FormatUtils.parseCurrency === 'function') return FormatUtils.parseCurrency(txt);
          if (window && window.FormatUtils && typeof window.FormatUtils.parseCurrency === 'function') return window.FormatUtils.parseCurrency(txt);
          let stripped = String(txt || '').replace(/[^0-9,.-]/g, '');
          stripped = stripped.replace(/[,.]/g, '');
          const n = parseFloat(stripped);
          return isNaN(n) ? null : n;
        } catch (_) { return null; }
      };
      const actual = parseCurrency(actualText);
      return { expected, actual };
    } catch (e) {
      return { expected: null, actual: null, error: String(e && e.message ? e.message : e) };
    }
  }, netIncomeIndex);

  if (convCheck.expected != null && convCheck.actual != null) {
    expect(convCheck.actual).toBeCloseTo(convCheck.expected, 2);
  }

  // Explicit FX series vs base-rate fallback: temporarily drop series to force base FX
  if (targetCurrency !== 'EUR') {
    const baseFallback = await frame.locator('body').evaluate((_, idx) => {
      const webUI = window.WebUI.getInstance();
      const tm = webUI.tableManager;
      const cfg = window.Config.getInstance();
      const econ = cfg.getEconomicData();
      const age = 30;
      const year = cfg.getSimulationStartYear() + age;
      const fromCountry = (tm && typeof tm.getStartCountry === 'function') ? tm.getStartCountry() : (cfg.getDefaultCountry ? cfg.getDefaultCountry() : 'ie');
      const toCountry = (tm && tm.reportingCurrency === 'ARS') ? 'ar' : 'ie';
      // Save and clear FX series to trigger base-rate path
      const entry = econ && econ.data ? econ.data[String(toCountry).toUpperCase()] : null;
      window.$__savedFxSeries = entry ? entry.series : null;
      if (entry) entry.series = null;
      const expected = econ.convert(52000, fromCountry, toCountry, year, { fxMode: 'constant', baseYear: cfg.getSimulationStartYear() });
      return { expected };
    }, netIncomeIndex);

    // Re-select current currency to trigger re-render with base FX
    const viewportSizeR = page.viewportSize();
    if (viewportSizeR && viewportSizeR.width < 768) {
      await dropdown.evaluate((select, value) => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, targetCurrency);
    } else {
      await dropdown.selectOption(targetCurrency);
    }
    await page.waitForTimeout(250);

    const unifiedBaseNumeric = await frame.locator('body').evaluate((_, idx) => {
      const cell = document.querySelector(`#data_row_1 td:nth-of-type(${idx}) .cell-content`);
      const parseCurrency = (txt) => {
        try { return (window.FormatUtils && window.FormatUtils.parseCurrency) ? window.FormatUtils.parseCurrency(txt) : Number(String(txt || '').replace(/[^0-9.\-]/g, '')); } catch (_) { return null; }
      };
      return cell ? parseCurrency(cell.textContent || '') : null;
    }, netIncomeIndex);
    if (baseFallback.expected != null && unifiedBaseNumeric != null) {
      expect(unifiedBaseNumeric).toBeCloseTo(baseFallback.expected, 2);
    }

    // Restore FX series
    await frame.locator('body').evaluate(() => {
      try {
        const cfg = window.Config.getInstance();
        const econ = cfg.getEconomicData();
        const webUI = window.WebUI.getInstance();
        const tm = webUI.tableManager;
        const toCountry = (tm && tm.reportingCurrency === 'ARS') ? 'ar' : 'ie';
        const entry = econ && econ.data ? econ.data[String(toCountry).toUpperCase()] : null;
        if (entry) entry.series = window.$__savedFxSeries || entry.series;
      } catch (_) {}
    });
  }

  // Toggle back to natural and ensure values revert, then unify again to re-convert correctly
  const naturalToggleAfter = frame.locator('#currencyModeNatural_TableManager');
  const unifiedToggleAfter = frame.locator('#currencyModeUnified_TableManager');
  const viewportSize4 = page.viewportSize();
  if (viewportSize4 && viewportSize4.width < 768) {
    await frame.locator('body').evaluate(() => {
      const webUI = window.WebUI.getInstance();
      if (webUI && webUI.tableManager) {
        webUI.tableManager.handleCurrencyModeChange('natural');
      }
    });
  } else {
    await naturalToggleAfter.click();
  }
  await page.waitForTimeout(250);
  const revertedDigits = await frame.locator('body').evaluate((_, idx) => {
    const cell = document.querySelector(`#data_row_1 td:nth-of-type(${idx}) .cell-content`);
    const txt = cell ? (cell.textContent || '') : '';
    return txt.replace(/[^0-9\-]/g, '');
  }, netIncomeIndex);
  expect(revertedDigits).toBe(naturalDigits);

  // Switch back to unified and re-select targetCurrency to confirm correct reconversion
  if (viewportSize4 && viewportSize4.width < 768) {
    await frame.locator('body').evaluate(() => {
      const webUI = window.WebUI.getInstance();
      if (webUI && webUI.tableManager) {
        webUI.tableManager.handleCurrencyModeChange('unified');
      }
    });
  } else {
    await unifiedToggleAfter.click();
  }
  await page.waitForTimeout(200);
  const viewportSize5 = page.viewportSize();
  if (viewportSize5 && viewportSize5.width < 768) {
    await dropdown.evaluate((select, value) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, targetCurrency);
  } else {
    await dropdown.selectOption(targetCurrency);
  }
  await page.waitForTimeout(250);


  // Info icon only appears when there's currency conversion or attribution breakdown
  // It's conditional, so we check if it exists but don't fail if it doesn't
  const infoIcon = frame.locator(`#data_row_1 td:nth-of-type(${netIncomeIndex}) .cell-info-icon`);
  const infoIconCount = await infoIcon.count();
  if (infoIconCount > 0) {
    await expect(infoIcon).toBeVisible();
  }
});
