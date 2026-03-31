import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { loadSimulator } from './helpers/PlaywrightFinsim.js';
import { openWizard, smartClick } from '../src/frontend/web/utils/FrontendTestUtils.js';

test.use({ actionTimeout: 20000 });
test.skip(({ isMobile }) => isMobile, 'This spec drives desktop table-row badges; mobile defaults to accordion view.');

const WORKSPACE_ROOT = process.cwd();
const DEMO_CSV = fs.readFileSync(path.resolve(process.cwd(), 'src/frontend/web/assets/demo.csv'), 'utf8');
const OVERRIDE_FILES = {
  '/src/frontend/web/ifs/index.html': path.resolve(WORKSPACE_ROOT, 'src/frontend/web/ifs/index.html'),
  '/src/frontend/web/components/EventsTableManager.js': path.resolve(WORKSPACE_ROOT, 'src/frontend/web/components/EventsTableManager.js'),
  '/src/frontend/web/components/RelocationImpactDetector.js': path.resolve(WORKSPACE_ROOT, 'src/frontend/web/components/RelocationImpactDetector.js'),
  '/src/frontend/web/components/RelocationImpactAssistant.js': path.resolve(WORKSPACE_ROOT, 'src/frontend/web/components/RelocationImpactAssistant.js')
};

async function overrideWorkspaceAssets(page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const filePath = OVERRIDE_FILES[url.pathname];
    if (!filePath) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: url.pathname.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8',
      body: fs.readFileSync(filePath, 'utf8')
    });
  });
}

async function loadDemoScenario(frame) {
  await frame.locator('body').evaluate(async (_, csv) => {
    const webUI = window.WebUI && window.WebUI.getInstance ? window.WebUI.getInstance() : null;
    if (!webUI || !webUI.fileManager || typeof webUI.fileManager.loadFromString !== 'function') {
      throw new Error('FileManager.loadFromString is unavailable');
    }
    const loaded = await webUI.fileManager.loadFromString(csv, 'Demo');
    if (!loaded) throw new Error('Failed to load demo.csv');
  }, DEMO_CSV);
}

async function createRelocationViaWizard(page, frame, countryCode, age) {
  await openWizard(page, frame);

  const relocationOption = frame.locator('#wizardSelectionOverlay .wizard-selection-option:has-text("Relocation")');
  await relocationOption.waitFor({ state: 'visible', timeout: 15000 });
  await smartClick(relocationOption, { preferProgrammatic: true });

  const overlay = frame.locator('#eventWizardOverlay');
  await overlay.waitFor({ state: 'visible', timeout: 15000 });
  await overlay.locator('h3:has-text("Destination Country")').waitFor({ state: 'visible', timeout: 10000 });

  const normalizedCountryCode = String(countryCode || '').trim().toUpperCase();
  const countryToggle = overlay.locator('#wizard-destCountryCode-toggle');
  await countryToggle.waitFor({ state: 'visible', timeout: 10000 });
  await smartClick(countryToggle, { preferProgrammatic: true });
  const countryOption = frame.locator(`#wizard-destCountryCode-options [data-value="${normalizedCountryCode}"]`);
  await countryOption.waitFor({ state: 'visible', timeout: 10000 });
  await smartClick(countryOption, { preferProgrammatic: true });
  await smartClick(overlay.locator('.event-wizard-button-next'));
  await overlay.locator('h3:has-text("Relocation Cost")').waitFor({ state: 'visible', timeout: 10000 });

  const amountInput = overlay.locator('#wizard-amount, input[name="amount"]');
  await amountInput.waitFor({ state: 'visible', timeout: 10000 });
  await amountInput.fill('0');
  await amountInput.evaluate((el) => el.blur());
  await page.waitForTimeout(300);
  await smartClick(overlay.locator('.event-wizard-button-next'));
  await overlay.locator('h3:has-text("Relocation Timing")').waitFor({ state: 'visible', timeout: 10000 });

  const ageInput = overlay.locator('#wizard-fromAge, input[name="fromAge"]');
  await ageInput.waitFor({ state: 'visible', timeout: 10000 });
  await ageInput.fill(String(age));
  await ageInput.evaluate((el) => el.blur());
  await page.waitForTimeout(300);
  await smartClick(overlay.locator('.event-wizard-button-next'));
  await createButtonOrSummary(overlay);

  const createButton = overlay.locator('.event-wizard-button-create');
  await createButton.waitFor({ state: 'visible', timeout: 10000 });
  await smartClick(createButton, { preferProgrammatic: true });
  await overlay.waitFor({ state: 'detached', timeout: 15000 });
}

async function createButtonOrSummary(overlay) {
  const summaryHeading = overlay.locator('h3:has-text("Review & Create")');
  await summaryHeading.waitFor({ state: 'visible', timeout: 10000 });
}

async function getWorkflowState(frame) {
  return await frame.locator('body').evaluate(() => {
    function snapshot(type, name) {
      const rows = Array.from(document.querySelectorAll('#Events tbody tr')).filter((row) => {
        if (!row || (row.classList && row.classList.contains('resolution-panel-row'))) return false;
        const typeInput = row.querySelector('.event-type');
        const nameInput = row.querySelector('.event-name');
        return typeInput && nameInput && typeInput.value === type && nameInput.value === name;
      });
      const row = rows[0];
      if (!row) {
        return {
          present: false
        };
      }
      const badge = row.querySelector('.relocation-impact-badge');
      const sellMarker = row.querySelector('.event-relocation-sell-mv-id');
      const sellAnchorAge = row.querySelector('.event-relocation-sell-anchor-age');
      const rentMarker = row.querySelector('.event-relocation-rent-mv-id');
      const override = row.querySelector('.event-resolution-override');
      const linkId = row.querySelector('.event-relocation-link-id');
      const impactDetails = row.dataset && row.dataset.relocationImpactDetails ? row.dataset.relocationImpactDetails : '';
      return {
        present: true,
        rowId: row.dataset ? row.dataset.rowId || '' : '',
        impactCategory: row.dataset ? row.dataset.relocationImpactCategory || '' : '',
        impactMvId: row.dataset ? row.dataset.relocationImpactMvId || '' : '',
        hasBadge: !!badge,
        sellMarker: sellMarker ? sellMarker.value || '' : '',
        sellAnchorAge: sellAnchorAge ? sellAnchorAge.value || '' : '',
        rentMarker: rentMarker ? rentMarker.value || '' : '',
        resolutionOverride: override ? override.value || '' : '',
        relocationLinkId: linkId ? linkId.value || '' : '',
        fromAge: row.querySelector('.event-from-age') ? row.querySelector('.event-from-age').value || '' : '',
        toAge: row.querySelector('.event-to-age') ? row.querySelector('.event-to-age').value || '' : '',
        impactDetails: impactDetails
      };
    }

    return {
      property: snapshot('R', 'Family House'),
      mortgage: snapshot('M', 'Family House'),
      payoff: snapshot('MP', 'Family House'),
      rental: snapshot('RI', 'Family House'),
      relocation: snapshot('MV', 'AR')
    };
  });
}

async function clickImpactAction(frame, type, name, action) {
  const state = await getWorkflowState(frame);
  const target = type === 'R'
    ? state.property
    : type === 'M'
      ? state.mortgage
      : type === 'MP'
        ? state.payoff
        : state.rental;

  if (!target || !target.present || !target.rowId) {
    throw new Error('Missing target row for ' + type + '/' + name);
  }

  const badge = frame.locator(`tr[data-row-id="${target.rowId}"] .relocation-impact-badge`);
  await badge.waitFor({ state: 'visible', timeout: 10000 });
  await smartClick(badge, { preferProgrammatic: true });

  const actionButton = frame.locator(`tr[data-row-id="${target.rowId}"] + tr.resolution-panel-row button[data-action="${action}"]`);
  await actionButton.waitFor({ state: 'visible', timeout: 10000 });
  await smartClick(actionButton, { preferProgrammatic: true });
}

test('deleting a relocation re-surfaces orphan sale-marker badges in the real browser flow', async ({ page }) => {
  await overrideWorkspaceAssets(page);
  const frame = await loadSimulator(page, { wizardOn: true });
  await loadDemoScenario(frame);

  await expect.poll(async () => {
    const state = await getWorkflowState(frame);
    return state.property.present && state.mortgage.present;
  }, { timeout: 15000 }).toBe(true);

  await createRelocationViaWizard(page, frame, 'AR', 40);

  await expect.poll(async () => {
    const state = await getWorkflowState(frame);
    return {
      relocation: state.relocation.present,
      relocationLinkId: !!state.relocation.relocationLinkId,
      propertyImpact: state.property.impactCategory
    };
  }, { timeout: 15000 }).toEqual({
    relocation: true,
    relocationLinkId: true,
    propertyImpact: 'boundary'
  });

  await clickImpactAction(frame, 'R', 'Family House', 'rent_out');

  await expect.poll(async () => {
    const state = await getWorkflowState(frame);
    return {
      propertyImpact: state.property.impactCategory,
      rentalPresent: state.rental.present,
      rentalMarker: !!state.rental.rentMarker,
      mortgageImpact: state.mortgage.impactCategory,
      mortgageBadge: state.mortgage.hasBadge
    };
  }, { timeout: 15000 }).toEqual({
    propertyImpact: '',
    rentalPresent: true,
    rentalMarker: true,
    mortgageImpact: 'boundary',
    mortgageBadge: true
  });

  await clickImpactAction(frame, 'M', 'Family House', 'sell_property');

  await expect.poll(async () => {
    const state = await getWorkflowState(frame);
    return {
      mortgageImpact: state.mortgage.impactCategory,
      mortgageMarker: !!state.mortgage.sellMarker,
      mortgageAnchor: !!state.mortgage.sellAnchorAge,
      payoffPresent: state.payoff.present,
      payoffMarker: !!state.payoff.sellMarker,
      payoffAnchor: !!state.payoff.sellAnchorAge
    };
  }, { timeout: 15000 }).toEqual({
    mortgageImpact: '',
    mortgageMarker: true,
    mortgageAnchor: true,
    payoffPresent: true,
    payoffMarker: true,
    payoffAnchor: true
  });

  const stateBeforeDelete = await getWorkflowState(frame);
  await frame.locator(`tr[data-row-id="${stateBeforeDelete.relocation.rowId}"] .delete-event`).evaluate((el) => el.click());

  await expect.poll(async () => {
    const state = await getWorkflowState(frame);
    return {
      relocationPresent: state.relocation.present,
      propertyImpact: state.property.impactCategory,
      propertyBadge: state.property.hasBadge,
      mortgageImpact: state.mortgage.impactCategory,
      mortgageBadge: state.mortgage.hasBadge,
      payoffImpact: state.payoff.impactCategory,
      payoffBadge: state.payoff.hasBadge,
      rentalImpact: state.rental.impactCategory,
      rentalBadge: state.rental.hasBadge
    };
  }, { timeout: 15000 }).toEqual({
    relocationPresent: false,
    propertyImpact: 'sale_marker_orphan',
    propertyBadge: true,
    mortgageImpact: 'sale_marker_orphan',
    mortgageBadge: true,
    payoffImpact: 'sale_marker_orphan',
    payoffBadge: true,
    rentalImpact: 'simple',
    rentalBadge: true
  });
});

test('restoring the mortgage plan removes the relocation payoff in the real browser flow', async ({ page }) => {
  await overrideWorkspaceAssets(page);
  const frame = await loadSimulator(page, { wizardOn: true });
  await loadDemoScenario(frame);

  await expect.poll(async () => {
    const state = await getWorkflowState(frame);
    return state.property.present && state.mortgage.present;
  }, { timeout: 15000 }).toBe(true);

  await createRelocationViaWizard(page, frame, 'AR', 40);
  await clickImpactAction(frame, 'R', 'Family House', 'rent_out');
  await clickImpactAction(frame, 'M', 'Family House', 'sell_property');

  const stateBeforeDelete = await getWorkflowState(frame);
  await frame.locator(`tr[data-row-id="${stateBeforeDelete.relocation.rowId}"] .delete-event`).evaluate((el) => el.click());

  await expect.poll(async () => {
    const state = await getWorkflowState(frame);
    return {
      mortgageImpact: state.mortgage.impactCategory,
      payoffImpact: state.payoff.impactCategory
    };
  }, { timeout: 15000 }).toEqual({
    mortgageImpact: 'sale_marker_orphan',
    payoffImpact: 'sale_marker_orphan'
  });

  await clickImpactAction(frame, 'R', 'Family House', 'restore_mortgage_plan');

  await expect.poll(async () => {
    const state = await getWorkflowState(frame);
    return {
      propertyImpact: state.property.impactCategory,
      mortgageImpact: state.mortgage.impactCategory,
      mortgageToAge: state.mortgage.toAge,
      mortgageMarker: state.mortgage.sellMarker,
      payoffPresent: state.payoff.present,
      rentalImpact: state.rental.impactCategory
    };
  }, { timeout: 15000 }).toEqual({
    propertyImpact: '',
    mortgageImpact: '',
    mortgageToAge: '60',
    mortgageMarker: '',
    payoffPresent: false,
    rentalImpact: 'simple'
  });
});
