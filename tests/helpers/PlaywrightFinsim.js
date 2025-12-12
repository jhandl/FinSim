import { expect } from '@playwright/test';
import { dismissWelcomeModal, waitForOverlayGone } from '../../src/frontend/web/utils/FrontendTestUtils.js';

export const BASE_URL = 'http://localhost:8080/#ifs';

export async function loadSimulator(page, { wizardOn = false } = {}) {
  await page.addInitScript(({ wizardEnabled }) => {
    try {
      localStorage.setItem('welcomeModalState', 'off');
      localStorage.setItem('eventsWizardState', wizardEnabled ? 'on' : 'off');
    } catch (_) { }
  }, { wizardEnabled: wizardOn });

  await page.goto(BASE_URL);
  const frame = page.frameLocator('#app-frame');
  await frame.locator('#addEventRow').first().waitFor({ state: 'visible', timeout: 20000 });

  await dismissWelcomeModal(page, frame);
  await waitForOverlayGone(page);

  // #addEventRow only appears after Config.initialize() completes and eventsTableManager is ready
  // No need to wait for econ.ready - EconomicData is initialized lazily when needed via
  // getEconomicData() which calls ensureEconomicDataClass() and refreshFromConfig() at that time.

  return frame;
}

export async function seedEvents(frameOrPage, frameOrEvents, eventsOrOptions, options = {}) {
  // Handle both signatures: seedEvents(frame, events, options) and seedEvents(page, frame, events, options)
  let page, frame, events, opts;
  if (frameOrEvents && Array.isArray(frameOrEvents)) {
    // Old signature: seedEvents(frame, events, options)
    page = null;
    frame = frameOrPage;
    events = frameOrEvents;
    opts = eventsOrOptions || {};
  } else {
    // New signature: seedEvents(page, frame, events, options)
    page = frameOrPage;
    frame = frameOrEvents;
    events = eventsOrOptions;
    opts = options;
  }

  const { startCountry = 'ie' } = opts;

  // Ensure events is an array
  if (!Array.isArray(events)) {
    events = [];
  }

  // Wait for Events table body to exist - this is a more reliable indicator than WebUI
  // The table body is created when eventsTableManager is initialized
  await frame.locator('#Events tbody').waitFor({ state: 'attached', timeout: 5000 });

  // Wait for WebUI class to be available in the iframe's window
  // Use page.waitForFunction for reliable cross-frame access
  if (page) {
    try {
      await page.waitForFunction(() => {
        const iframe = document.querySelector('#app-frame');
        if (!iframe || !iframe.contentWindow) return false;
        const win = iframe.contentWindow;
        // Check if WebUI class exists and getInstance method is available
        try {
          return !!(win.WebUI && typeof win.WebUI.getInstance === 'function'
            && win.WebUI.getInstance()
            && win.WebUI.getInstance().eventsTableManager);
        } catch (e) {
          return false;
        }
      }, { timeout: 15000 });
    } catch (e) {
      // If waitForFunction times out, try proceeding anyway since DOM elements exist
      // This handles cases where WebUI might not be exposed but functionality still works
    }
  } else {
    // Fallback: wait with delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const evaluateArgs = { eventsData: events, startCountry: startCountry };

  await frame.locator('body').evaluate(async (el, { eventsData: evts, startCountry: sc }) => {
    const events = evts || [];
    const startCountry = sc || 'ie';

    // Try to get WebUI instance - check both window.WebUI and global WebUI
    let webUI = null;
    let lastError = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const WebUIClass = window.WebUI || (typeof WebUI !== 'undefined' ? WebUI : null);
        if (WebUIClass && typeof WebUIClass.getInstance === 'function') {
          webUI = WebUIClass.getInstance();
          if (webUI && webUI.eventsTableManager) break;
        }
      } catch (e) {
        lastError = e;
      }
      // Yield to allow scripts to load (synchronous busy wait won't help)
      if (attempt < 19) {
        // Use a small delay - in evaluate context we can't use setTimeout
        const start = performance.now();
        while (performance.now() - start < 50) {
          // Busy wait - not ideal but necessary in evaluate context
        }
      }
    }

    if (!webUI) {
      const errorMsg = lastError ? lastError.message : 'WebUI class not found';
      throw new Error('Cannot access WebUI: ' + errorMsg);
    }

    if (!webUI.eventsTableManager) {
      throw new Error('webUI.eventsTableManager is missing - WebUI may not be fully initialized');
    }
    const etm = webUI.eventsTableManager;
    const tbody = document.querySelector('#Events tbody');
    if (!tbody) throw new Error('Events table body not found');

    tbody.innerHTML = '';
    etm.eventRowCounter = 0;

    const ensureHiddenInput = function (row, suffix, value) {
      const selector = `.event-${suffix}`;
      const existing = row.querySelector(selector);
      if (existing) {
        existing.value = value;
        return existing;
      }
      const input = document.createElement('input');
      input.type = 'hidden';
      input.className = `event-${suffix}`;
      input.value = value;
      row.appendChild(input);
      return input;
    };

    events.forEach((evt, idx) => {
      const row = etm.createEventRow(
        evt.type || '',
        evt.alias || evt.id || `evt-${idx + 1}`,
        evt.amount != null ? String(evt.amount) : '',
        evt.fromAge != null ? String(evt.fromAge) : '',
        evt.toAge != null ? String(evt.toAge) : '',
        evt.rate != null ? String(evt.rate) : '',
        evt.match != null ? String(evt.match) : ''
      );
      row.dataset.rowId = `row_${idx + 1}`;
      row.dataset.originalEventType = evt.type || '';
      tbody.appendChild(row);
      if (evt.currency) ensureHiddenInput(row, 'currency', evt.currency);
      if (evt.linkedCountry) ensureHiddenInput(row, 'linked-country', evt.linkedCountry);
    });

    const startInput = document.getElementById('StartCountry');
    const toggle = document.getElementById('StartCountryToggle');
    if (startInput) {
      startInput.value = startCountry;
      // Trigger change event to ensure UI recognizes the change
      startInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (toggle && toggle.textContent.trim() === '') {
      const countries = (window.Config && window.Config.getInstance)
        ? window.Config.getInstance().getAvailableCountries()
        : [];
      const match = countries.find(c => String(c.code).toLowerCase() === String(startCountry).toLowerCase());
      toggle.textContent = match ? match.name : startCountry.toUpperCase();
    }

    if (webUI.formatUtils && typeof webUI.formatUtils.setupCurrencyInputs === 'function') {
      webUI.formatUtils.setupCurrencyInputs();
    }
    if (webUI.formatUtils && typeof webUI.formatUtils.setupPercentageInputs === 'function') {
      webUI.formatUtils.setupPercentageInputs();
    }
    if (webUI.eventAccordionManager && typeof webUI.eventAccordionManager.refresh === 'function') {
      webUI.eventAccordionManager.refresh();
    }

    // Ensure relocation is enabled before analysis
    const config = window.Config && window.Config.getInstance ? window.Config.getInstance() : null;
    const relocationEnabled = config && typeof config.isRelocationEnabled === 'function' && config.isRelocationEnabled();

    const eventsData = webUI.readEvents(false);

    // Analyze relocation impacts if relocation is enabled
    if (relocationEnabled && window.RelocationImpactDetector && typeof window.RelocationImpactDetector.analyzeEvents === 'function') {
      const currentStart = etm.getStartCountry();
      if (currentStart) {
        window.RelocationImpactDetector.analyzeEvents(eventsData, currentStart);
        // Force update indicators immediately after analysis
        if (typeof etm.updateRelocationImpactIndicators === 'function') {
          etm.updateRelocationImpactIndicators(eventsData);
        }
      }
    } else {
      // Even if relocation is disabled, still update indicators (they'll just clear)
      if (typeof etm.updateRelocationImpactIndicators === 'function') {
        etm.updateRelocationImpactIndicators(eventsData);
      }
    }

    if (typeof webUI.updateStatusForRelocationImpacts === 'function') {
      webUI.updateStatusForRelocationImpacts(eventsData);
    }

    // Also refresh accordion view if it exists
    if (webUI.eventAccordionManager && typeof webUI.eventAccordionManager.refresh === 'function') {
      webUI.eventAccordionManager.refresh();
    }

    const cfg = window.Config && window.Config.getInstance ? window.Config.getInstance() : null;
    if (cfg && typeof cfg.syncTaxRuleSetsWithEvents === 'function') {
      try {
        await cfg.syncTaxRuleSetsWithEvents(eventsData, etm.getStartCountry ? etm.getStartCountry() : startCountry);
      } catch (syncError) {
        console.error('syncTaxRuleSetsWithEvents failed', syncError);
      }
    }
  }, evaluateArgs);
}

export async function expectNoImpact(frame, rowId) {
  const result = await frame.locator(`tr[data-row-id="${rowId}"]`).evaluate((row) => {
    if (!row) return { badge: false, dataset: null };
    return {
      badge: !!row.querySelector('.relocation-impact-badge'),
      dataset: row.dataset.relocationImpact === '1'
    };
  });
  expect(result.badge).toBeFalsy();
  expect(result.dataset).toBeFalsy();
}
