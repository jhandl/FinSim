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
  const MAX_ATTEMPTS = 3;
  for(let attempt=0; attempt<MAX_ATTEMPTS; attempt++){
    try{
      // Re-resolve the iframe each attempt to survive reload/navigation
      const curFrame = page.frameLocator('#app-frame');
      if(!(await curFrame.locator(sel).count())) return;

      const close=curFrame.locator(`${sel} .welcome-modal-close`);
      if(await close.count()) await smartClick(close,{preferProgrammatic:true});
      await page.waitForTimeout(300);

      if(await curFrame.locator(sel).count()){
        await curFrame.locator('body').press('Escape').catch(()=>{});
      }
      await page.waitForTimeout(300);

      if(await curFrame.locator(sel).count()){
        const ov=curFrame.locator(sel);
        const box=await ov.boundingBox();
        if(box) await ov.click({position:{x:box.width-3,y:box.height-3},force:true});
      }

      await curFrame.locator(sel).waitFor({state:'hidden',timeout:5000});
      await page.waitForTimeout(600);
      return;
    }catch(err){
      const msg = (err && err.message) ? err.message : String(err);
      const transient = msg.includes('Execution context was destroyed') || msg.includes('frame was detached');
      if(transient && attempt < MAX_ATTEMPTS-1){
        // Wait for the iframe element to be attached again, then retry
        await page.locator('#app-frame').waitFor({ state:'attached', timeout: 5000 }).catch(()=>{});
        await page.waitForTimeout(200);
        continue;
      }
      throw err;
    }
  }
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