// Playwright front-end testing utilities
// Import in specs:
//   import { smartClick, openWizard, waitForOverlayGone, dismissWelcomeModal } from '../src/frontend/web/utils/FrontendTestUtils.js';
// (Path may vary – adjust relative path from the spec file.)

/** Unified click helper – desktop+mobile safe */
export async function smartClick(locator, { preferProgrammatic = false } = {}) {
  // Wait until the element is attached (visibility not always required for programmatic clicks).
  await locator.waitFor({ state: 'attached', timeout: 10000 });

  // 1. Fast path – if caller explicitly prefers a programmatic click, try it immediately
  if (preferProgrammatic) {
    try {
      await locator.evaluate(el => el.click());
      return;
    } catch {/* fall through to full sequence */}
  }

  // 2. Ensure the element is visible & stable before physical interactions.
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  await locator.scrollIntoViewIfNeeded();

  const attempts = preferProgrammatic
    ? [() => locator.evaluate(el => el.click()),
       () => locator.tap({ force: true })]
    : [() => locator.tap({ force: true }),
       () => locator.evaluate(el => el.click())];
  for (const fn of attempts) {
    try { await fn(); return; } catch { /* next */ }
  }
  await locator.click({ force: true });
}

export async function waitForOverlayGone(page, timeout = 5000) {
  await page.waitForFunction(() => {
    const iframe=document.querySelector('#app-frame');
    const doc=iframe&&iframe.contentDocument;
    const m=doc?.querySelector('.welcome-modal');
    return !m||m.offsetParent===null;
  },{timeout});
}

export async function dismissWelcomeModal(page, frame){
  const sel='.welcome-modal.visible';
  if(!(await frame.locator(sel).count())) return;
  const close=frame.locator(`${sel} .welcome-modal-close`);
  if(await close.count()) await smartClick(close,{preferProgrammatic:true});
  await page.waitForTimeout(300);
  if(await frame.locator(sel).count()) await frame.locator('body').press('Escape').catch(()=>{});
  await page.waitForTimeout(300);
  if(await frame.locator(sel).count()){
    const ov=frame.locator(sel);const box=await ov.boundingBox();
    if(box) await ov.click({position:{x:box.width-3,y:box.height-3},force:true});
  }
  await frame.locator(sel).waitFor({state:'hidden',timeout:5000});
  await page.waitForTimeout(600);
}

export async function openWizard(page, frame){
  const addBtn=frame.locator('#addEventRow');
  const wizard=frame.locator('#wizardSelectionOverlay');
  await waitForOverlayGone(page);
  for(let i=0;i<3;i++){
    await smartClick(addBtn,{preferProgrammatic:true});
    try{await wizard.waitFor({state:'visible',timeout:1000});return;}catch{}
    await page.waitForTimeout(300);
  }
  await wizard.waitFor({state:'visible',timeout:4000});
} 