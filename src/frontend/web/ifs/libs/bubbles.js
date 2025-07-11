/**
 * Bubbles.js - A Custom Tour Library for FinSim
 * 
 * A lightweight, purpose-built tour library designed to give absolute control 
 * over the user experience, specifically addressing issues with header movement 
 * and off-screen popovers that were problematic with driver.js.
 * 
 * Key Features:
 * - Fixed Header Integrity: Header never moves or scrolls out of view
 * - Always-Visible Popovers: Help bubbles always render within viewport
 * - Smooth, Controlled Scrolling: Elements scroll into perfect position
 * - Elegant UX: Modern, fluid animations
 * - Maintainable: Clean, well-documented codebase
 */

// Bubbles.js - Lightweight Guided Tour Library compatible with FinSim Wizard
// This library replaces Driver.js while keeping the exact public API that Wizard.js
// expects via `window.driver.js.driver`.
// It solves header scrolling and popover visibility issues by:
//  * custom scroll offset accounting for fixed header height
//  * 4-segment overlay that carves a transparent hole around the target element
//  * robust bubble positioning with fall-backs to guarantee on-screen visibility
//
// The implementation purposefully stays small (~400 LOC) yet covers all features
// required by Wizard.js: drive(), moveNext(), movePrevious(), getActiveIndex(),
// getStepsCount(),   onNextClick/onPrevClick callbacks, dynamic highlight,
// overlay cleanup and responsive handling on resize.

(function () {
    "use strict";

    /************** Helper Utils **************/
    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function createEl(tag, className, id) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (id) el.id = id;
        return el;
    }

    /************** Help Data Loader (shared) **************/
    // Cache for parsed help.yml so we only fetch & parse once per page load
    let __helpDataCache = null;

    /**
     * Synchronously fetches and parses help.yml the first time it is requested.
     * Subsequent calls return the cached object.
     * We purposefully keep this synchronous so callers (dropdown builders, etc.)
     * can obtain the data without promises or callbacks.
     */
    function loadHelpDataSync() {
        if (__helpDataCache !== null) return __helpDataCache;
        try {
            const ts = Date.now(); // cache-bust in dev / refresh scenarios
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `/src/frontend/web/assets/help.yml?t=${ts}`, false); // synchronous
            xhr.send(null);
            if (xhr.status === 200) {
                __helpDataCache = (typeof jsyaml !== 'undefined' && jsyaml.load)
                    ? jsyaml.load(xhr.responseText)
                    : {};
            } else {
                console.warn('bubbles.js – failed to load help.yml:', xhr.status);
                __helpDataCache = {};
            }
        } catch (err) {
            console.error('bubbles.js – error loading help.yml:', err);
            __helpDataCache = {};
        }
        return __helpDataCache;
    }

    /************** Core Engine **************/
    class BubblesEngine {
        constructor(options = {}) {
            this.opts = options;
            this.steps = Array.isArray(options.steps) ? options.steps : [];
            this.activeIdx = -1;
            this.header = document.querySelector("header");

            // Callbacks
            this.cbNext = typeof options.onNextClick === "function" ? options.onNextClick : () => {};
            this.cbPrev = typeof options.onPrevClick === "function" ? options.onPrevClick : () => {};
            this.cbDestroy = typeof options.onDestroyStarted === "function" ? options.onDestroyStarted : () => {};
            this.cbHighlight = typeof options.onHighlighted === "function" ? options.onHighlighted : () => {};

            // DOM refs (lazy)
            this.overlay = null; // {container, t,b,l,r}
            this.pop = null;     // {root,title,desc,btnPrev,btnNext,btnClose}
            this.highlightBox = null; // rectangular halo around the active element

            // bindings
            this.onResize = this.onResize.bind(this);
            this.handleNext = this.handleNext.bind(this);
            this.handlePrev = this.handlePrev.bind(this);
            this.handleClose = this.handleClose.bind(this);
            this.onScroll = this.onScroll.bind(this);
            this._scrollRaf = null;

            this._destroying = false; // guard against recursive destroy
        }

        /************** Public API **************/
        drive(start = 0) {
            if (!this.steps.length) return;

            // Build DOM only on first run
            if (!this.overlay) {
                this.buildDOM();
                window.addEventListener("resize", this.onResize);
                window.addEventListener("scroll", this.onScroll, { passive: true });
            }

            this.showStep(clamp(start, 0, this.steps.length - 1));
        }

        moveNext() { this.showStep(this.activeIdx + 1); }
        movePrevious() { this.showStep(this.activeIdx - 1); }
        getActiveIndex() { return this.activeIdx; }
        getStepsCount() { return this.steps.length; }
        hasNextStep() {
            if (this.activeIdx < 0 || this.activeIdx >= this.steps.length - 1) return false;
            const btns = this.steps[this.activeIdx].popover?.showButtons;
            if (Array.isArray(btns) && !btns.includes('next')) return false;
            return true;
        }
        hasPreviousStep() {
            if (this.activeIdx <= 0) return false;
            const btns = this.steps[this.activeIdx].popover?.showButtons;
            if (Array.isArray(btns) && !btns.includes('prev')) return false;
            return true;
        }

        /************** DOM Builders **************/
        buildDOM() {
            // Overlay container
            const cont = createEl("div", "driver-overlay-container", "bubbles-overlay-container");
            Object.assign(cont.style, {
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 9998
            });

            const makeSeg = pos => {
                const seg = createEl("div", "driver-overlay bubbles-overlay-" + pos);
                Object.assign(seg.style, {
                    position: "absolute",
                    background: `rgba(0,0,0,${this.opts.overlayOpacity ?? 0.5})`,
                    pointerEvents: "auto"
                });
                cont.appendChild(seg);
                return seg;
            };
            const segTop = makeSeg("top");
            const segBottom = makeSeg("bottom");
            const segLeft = makeSeg("left");
            const segRight = makeSeg("right");
            document.body.appendChild(cont);
            this.overlay = { container: cont, segTop, segBottom, segLeft, segRight };

            // Decorative highlight box with soft halo
            const hl = createEl("div", "bubbles-highlight-box");
            Object.assign(hl.style, {
                position: "absolute",
                pointerEvents: "none",
                border: "2px solid rgba(255,255,255,0.9)",
                borderRadius: "6px",
                boxShadow: "0 0 12px 4px rgba(255,255,255,0.75)",
                transition: "all .15s ease",
                zIndex: 1 // above the overlay segments, below the popover
            });
            cont.appendChild(hl);
            this.highlightBox = hl;

            // Popover
            const pop = createEl("div", "driver-popover", "bubbles-popover");
            Object.assign(pop.style, {
                position: "absolute",
                zIndex: 9999,
                background: "#fff",
                borderRadius: "8px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                padding: "16px",
                minWidth: "280px",
                maxWidth: "340px",
                opacity: 0,
                transform: "scale(0.95)",
                transition: "opacity .25s ease, transform .25s ease"
            });

            const title = createEl("h3", "driver-popover-title");
            const desc = createEl("div", "driver-popover-description");

            const footer = createEl("div", "driver-popover-footer");
            Object.assign(footer.style, { marginTop: "12px", textAlign: "right" });

            const btnPrev = createEl("button", "driver-btn driver-prev driver-popover-prev-btn");
            btnPrev.textContent = "Previous";
            btnPrev.addEventListener("click", this.handlePrev);

            const btnNext = createEl("button", "driver-btn driver-next driver-popover-next-btn");
            btnNext.textContent = "Next";
            btnNext.addEventListener("click", this.handleNext);

            const btnClose = createEl("button", "driver-btn driver-close driver-popover-close-btn");
            btnClose.innerHTML = "&times;";
            btnClose.setAttribute('aria-label', 'Close');
            btnClose.addEventListener("click", this.handleClose);

            footer.append(btnPrev, btnNext);
            pop.append(title, desc, footer);
            pop.appendChild(btnClose);
            document.body.appendChild(pop);

            this.pop = { root: pop, title, desc, btnPrev, btnNext, btnClose };
        }

        /************** Step Handling **************/
        async showStep(idx) {
            this.activeIdx = idx;
            const step = this.steps[idx];
            let target = step.element ? document.querySelector(step.element) : null;
            if (target) {
                await this.scrollIntoView(target);
                await this.ensureHorizontalVisibility(target);
                await this.waitForScrollSettled();
                this.applyHighlight(target);
            } else {
                // detach overlays (full dim) with no transparent hole
                if (this.overlay) {
                    const { segTop, segBottom, segLeft, segRight } = this.overlay;
                    // cover whole viewport with segTop; collapse others
                    segTop.style.top = 0; segTop.style.left = 0; segTop.style.width = '100%'; segTop.style.height = '100%';
                    segBottom.style.height = '0'; segLeft.style.height = '0'; segRight.style.height = '0';
                }
                if (this.highlightBox) {
                    this.highlightBox.style.display = 'none';
                }
            }

            this.updatePopover(step, target);
            this.cbHighlight(target);
        }

        async scrollIntoView(target) {
            // Wait two animation frames to let any implicit browser scroll
            // triggered by element.focus() settle before we take measurements.
            await new Promise(requestAnimationFrame);
            await new Promise(requestAnimationFrame);
            const hdrH = this.header ? this.header.offsetHeight : 0;
            const margin = 20;

            const rect = target.getBoundingClientRect();
            const card = target.closest('.card');
            const cardRect = card ? card.getBoundingClientRect() : null;

            // Decide which rectangle we want to keep in view (card if possible, otherwise target)
            let desiredRect = rect;
            if (cardRect) {
                // Always align section header directly below fixed header so the
                // highlighted field sits at a predictable position and the
                // popover doesn’t jump around depending on its size.
                desiredRect = cardRect;

                // If the header is already within a small tolerance of its
                // target position, no scrolling is needed.
                const curOffset = cardRect.top - (hdrH + margin);
                if (Math.abs(curOffset) < 4) {
                    return; // already aligned; skip further work
                }
            }

            const rawDest = desiredRect.top + window.scrollY - hdrH - margin;
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            const dest = Math.min(maxScroll, Math.max(0, rawDest));

            return new Promise(res => {
                const distance = Math.abs(window.scrollY - dest);
                if (distance < 5) { res(); return; }

                // For long jumps (> viewport height) scroll instantly for snappier UX
                if (distance > window.innerHeight) {
                    window.scrollTo({ top: dest, behavior: "auto" });
                    // give browser a moment to render
                    requestAnimationFrame(() => res());
                    return;
                }

                // Otherwise smooth scroll and wait
                window.scrollTo({ top: dest, behavior: "smooth" });

                const start = Date.now();
                const tick = () => {
                    if (Math.abs(window.scrollY - dest) < 5 || Date.now() - start > 500) {
                        res();
                    } else {
                        requestAnimationFrame(tick);
                    }
                };
                tick();
            });
        }

        ensureHorizontalVisibility(target) {
            if (!target) return;
            // Find nearest horizontally scrollable ancestor
            let container = target.parentElement;
            while (container && container !== document.body) {
                const hasOverflowX = container.scrollWidth > container.clientWidth;
                const style = window.getComputedStyle(container);
                if (hasOverflowX && (style.overflowX === 'auto' || style.overflowX === 'scroll')) {
                    break;
                }
                container = container.parentElement;
            }
            if (container && container !== document.body) {
                const rect = target.getBoundingClientRect();
                const cRect = container.getBoundingClientRect();
                const leftVisible = rect.left >= cRect.left;
                const rightVisible = rect.right <= cRect.right;
                if (!leftVisible || !rightVisible) {
                    const scrollOffset = rect.left - cRect.left - (cRect.width - rect.width)/2;
                    container.scrollTo({ left: container.scrollLeft + scrollOffset, behavior: 'smooth' });
                    // wait briefly for smooth scroll
                    return new Promise(r=>setTimeout(r,300));
                }
            }
        }

        waitForScrollSettled() {
            return new Promise(resolve => {
                const idleFramesRequired = 2; // consecutive frames with no scroll change
                const maxWaitMs = 1000; // upper bound to avoid hanging indefinitely
                let idleFrames = 0;
                let lastX = window.scrollX;
                let lastY = window.scrollY;
                const start = Date.now();

                const check = () => {
                    const curX = window.scrollX;
                    const curY = window.scrollY;

                    if (Math.abs(curX - lastX) < 1 && Math.abs(curY - lastY) < 1) {
                        idleFrames++;
                        if (idleFrames >= idleFramesRequired) {
                            return resolve();
                        }
                    } else {
                        idleFrames = 0;
                        lastX = curX;
                        lastY = curY;
                    }

                    if (Date.now() - start > maxWaitMs) {
                        return resolve(); // give up waiting – should be close enough
                    }

                    requestAnimationFrame(check);
                };

                requestAnimationFrame(check);
            });
        }

        applyHighlight(target) {
            // Guard against cases where the tour was destroyed while asynchronous
            // work (eg. smooth-scroll promises) was still pending. In such a case
            // the overlay elements get cleaned up and this.overlay is reset to
            // null inside destroy(). Trying to access it would throw.
            if (!this.overlay) {
                return; // Nothing to highlight – the walkthrough has ended.
            }
            // clear previous
            document.querySelectorAll('.driver-active-element').forEach(el => el.classList.remove('driver-active-element'));
            target.classList.add('driver-active-element');

            const r = target.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            const pad = this.opts.highlightPadding ?? 6; // extra space around the target for nicer halo (default reduced by 25%)
            const topEdge = Math.max(0, r.top - pad);
            const bottomEdge = Math.min(vh, r.bottom + pad);
            const leftEdge = Math.max(0, r.left - pad);
            const rightEdge = Math.min(vw, r.right + pad);

            // Update overlay segments to carve a slightly larger hole
            const { segTop: t, segBottom: b, segLeft: l, segRight: rgt } = this.overlay;
            t.style.top = 0; t.style.left = 0; t.style.width = '100%'; t.style.height = `${topEdge}px`;
            b.style.top = `${bottomEdge}px`; b.style.left = 0; b.style.width = '100%'; b.style.height = `${vh - bottomEdge}px`;
            l.style.top = `${topEdge}px`; l.style.left = 0; l.style.width = `${leftEdge}px`; l.style.height = `${bottomEdge - topEdge}px`;
            rgt.style.top = `${topEdge}px`; rgt.style.left = `${rightEdge}px`; rgt.style.width = `${vw - rightEdge}px`; rgt.style.height = `${bottomEdge - topEdge}px`;

            // Position / size decorative highlight box
            if (this.highlightBox) {
                this.highlightBox.style.display = 'block';
                this.highlightBox.style.top = `${topEdge}px`;
                this.highlightBox.style.left = `${leftEdge}px`;
                this.highlightBox.style.width = `${rightEdge - leftEdge}px`;
                this.highlightBox.style.height = `${bottomEdge - topEdge}px`;
            }
        }

        updatePopover(step, target) {
            // It is possible that the tour has been destroyed (eg. by an
            // onDestroyStarted callback) while an awaited task inside showStep
            // was still in flight. Bail out early if the popover DOM nodes have
            // already been removed.
            if (!this.pop) {
                return;
            }
            const { root, title, desc, btnPrev, btnNext, btnClose } = this.pop;
            // Apply custom popover class for this step (e.g., "tour-complete-popover") so
            // external handlers can identify specific popovers (used by Wizard.js for the
            // final step Enter-key shortcut).
            const customClasses = ['tour-complete-popover', 'welcome-popover', 'howto-popover'];
            // Remove any previously applied custom classes
            customClasses.forEach(cls => root.classList.remove(cls));
            if (step.popover?.popoverClass) {
                root.classList.add(step.popover.popoverClass);
            }
            // content
            title.textContent = step.popover?.title || '';
            title.style.display = title.textContent ? '' : 'none';
            if (step.popover?.description) {
                desc.innerHTML = step.popover.description;
                desc.style.display = '';
            } else {
                desc.style.display = 'none';
            }

            // Allow per-step customisation of button labels (e.g. show "Done" on the
            // final step instead of "Next"). Accept either a plain string or a
            // single-element array for compatibility with YAML syntax used in
            // help.yml.
            const normaliseLabel = (lbl, fallback) => {
                if (Array.isArray(lbl)) return lbl.length > 0 ? String(lbl[0]) : fallback;
                if (typeof lbl === 'string') return lbl;
                return fallback;
            };

            btnPrev.textContent = normaliseLabel(step.popover?.prevBtnText, 'Previous');
            btnNext.textContent = normaliseLabel(step.popover?.nextBtnText, 'Next');

            const prevLbl = btnPrev.textContent.trim().toLowerCase();
            const nextLbl = btnNext.textContent.trim().toLowerCase();

            btnPrev.classList.toggle('arrow-prev', prevLbl === 'previous' || prevLbl === 'back');
            btnNext.classList.toggle('arrow-next', nextLbl === 'next');

            // button visibility
            let buttons = step.popover?.showButtons;
            if (!Array.isArray(buttons)) {
                buttons = [];
                if (this.activeIdx > 0) buttons.push('prev');
                if (this.activeIdx < this.steps.length - 1) buttons.push('next');
                buttons.push('close');
            }
            btnPrev.style.display = buttons.includes('prev') ? '' : 'none';
            btnNext.style.display = buttons.includes('next') ? '' : 'none';
            btnClose.style.display = buttons.includes('close') ? '' : 'none';

            // position
            this.positionPopover(step, target);
        }

        positionPopover(step, target) {
            if (!target) {
                // Center popover in viewport
                const pop = this.pop.root;
                pop.style.maxWidth = '500px';
                pop.style.width = '90vw';
                pop.style.position = 'fixed';
                pop.style.top = '50%';
                pop.style.left = '50%';
                pop.style.transform = 'translate(-50%, -50%) scale(1)';
                pop.style.opacity = '1';
                return;
            }

            const prefSide = step.popover?.side || 'right';
            // DEBUG: capture info about viewport and popover metrics
            const debugInfo = { stepIndex: this.activeIdx, prefSide, vw: window.innerWidth, vh: window.innerHeight };
            const margin = 12;
            const pop = this.pop.root;
            pop.style.opacity = 0;
            pop.style.transform = 'none'; // reset to measure actual size
            pop.style.display = 'block';

            const measuredWidth = pop.offsetWidth;
            const measuredHeight = pop.offsetHeight;

            Object.assign(debugInfo, { measuredWidth, measuredHeight });

            // restore initial scale for animation
            pop.style.transform = 'scale(0.95)';

            const tr = target.getBoundingClientRect();
            debugInfo.targetRect = { top: tr.top, right: tr.right, bottom: tr.bottom, left: tr.left, width: tr.width, height: tr.height };
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            // Prefer the parent card as anchor; fall back to the element rect
            let anchorRect = tr;
            const cardEl = target.closest('.card');
            if (cardEl) anchorRect = cardEl.getBoundingClientRect();

            // Anchor to burger menu container if target resides inside it (overrides card)
            const burgerMenu = target.closest('#mobileMenu');
            if (burgerMenu) {
                anchorRect = burgerMenu.getBoundingClientRect();
            }

            // Compute safe bottom inset only on narrow/mobile viewports where bottom
            // navigation bars may overlay the visual viewport.
            const isNarrow = vw < 500;
            const bottomInset = isNarrow ? Math.max(0, window.screen.height - vh) : 0;
            const chinPadding = isNarrow ? 12 : 0;
            const effectiveInset = bottomInset + chinPadding;
            debugInfo.bottomInset = bottomInset;

            const defaultLeft = anchorRect.left + anchorRect.width/2 - measuredWidth/2;
            const centredLeft = vw/2 - measuredWidth/2; // center of viewport

            // If the anchor rectangle is narrower than the popover itself (common on desktop)
            // or when anchoring to header buttons, horizontally centre the popover.
            let leftPos = defaultLeft;
            if (anchorRect.width < measuredWidth || target.tagName === 'HEADER') {
                leftPos = centredLeft;
            }

            const sides = [prefSide, opposite(prefSide), 'bottom', 'top', 'right', 'left'];
            let placed = false;
            for (const side of sides) {
                const pos = coords(side);
                if (fits(pos)) { apply(pos); placed = true; debugInfo.chosenSide = side; debugInfo.finalPos = pos; break; }
            }
            if (!placed) {
                // As a last-ditch effort detach the popover and pin it above the bottom inset
                // so that it is always fully visible.
                const fallback = { fixed: true, top: vh - measuredHeight - margin - effectiveInset, left: Math.max(margin, (vw - measuredWidth) / 2) };
                apply(fallback);
                debugInfo.chosenSide = 'detached';
                debugInfo.finalPos = fallback;
            }
            
            requestAnimationFrame(()=>{
                pop.style.opacity = 1;
                pop.style.transform = 'scale(1)';
            });

            /* helpers */
            function opposite(s) { return { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[s] || 'right'; }
            function coords(side) {
                // Prefer the parent card as anchor; fall back to the element rect
                let anchorRect = tr;
                const cardEl = target.closest('.card');
                if (cardEl) anchorRect = cardEl.getBoundingClientRect();

                const defaultLeft = anchorRect.left + anchorRect.width/2 - measuredWidth/2;
                const centredLeft = vw/2 - measuredWidth/2; // center of viewport

                // If the anchor rectangle is narrower than the popover itself (common on desktop)
                // or when anchoring to header buttons, horizontally centre the popover.
                let leftPos = defaultLeft;
                if (anchorRect.width < measuredWidth || target.tagName === 'HEADER') {
                    leftPos = centredLeft;
                }

                switch (side) {
                    case 'top':
                        return { fixed: true, top: anchorRect.top - measuredHeight - margin, left: leftPos };
                    case 'bottom':
                        return { fixed: true, top: anchorRect.bottom + margin, left: leftPos };
                    case 'left':
                        return { fixed: true, top: anchorRect.top + anchorRect.height/2 - measuredHeight/2, left: anchorRect.left - measuredWidth - margin };
                    case 'right':
                        return { fixed: true, top: anchorRect.top + anchorRect.height/2 - measuredHeight/2, left: anchorRect.right + margin };
                    default:
                        return null;
                }
            }
            function fits(p) {
                if (!p) return false;
                const { top, left } = p;
                // Ensure the popover rect is fully within the viewport *and* does not
                // overlap the bottom inset area.
                return (
                    top >= 0 &&
                    left >= 0 &&
                    (left + measuredWidth) <= vw &&
                    (top + measuredHeight) <= vh - effectiveInset
                );
            }
            function apply(p) {
                // Always use fixed positioning so bubble remains viewport-locked
                pop.style.position = 'fixed';
                const rawTop = p.top ?? 0;
                const rawLeft = p.left ?? 0;
                const clampedTop = clamp(rawTop, margin, vh - measuredHeight - effectiveInset - margin);
                const clampedLeft = clamp(rawLeft, 8, vw - measuredWidth - 8);
                pop.style.top = clampedTop + 'px';
                pop.style.left = clampedLeft + 'px';
            }
        }

        /************** Events **************/
        handleNext() {
            const target = document.querySelector(this.steps[this.activeIdx].element);
            this.cbNext(target);
        }
        handlePrev() {
            const target = document.querySelector(this.steps[this.activeIdx].element);
            this.cbPrev(target);
        }
        handleClose() { this.destroy(); }
        onResize() {
            if (this.activeIdx < 0) return;
            const step = this.steps[this.activeIdx];
            const target = document.querySelector(step.element);
            if (target) { this.applyHighlight(target); this.positionPopover(step, target); }
        }

        // Called on every scroll (throttled with rAF) to keep highlight aligned.
        onScroll() {
            if (this._scrollRaf) return; // throttle to animation frame
            this._scrollRaf = requestAnimationFrame(()=>{
                this._scrollRaf = null;
                if (this.activeIdx < 0) return;
                const step = this.steps[this.activeIdx];
                const target = step?.element ? document.querySelector(step.element) : null;
                if (target) {
                    this.applyHighlight(target);
                    // Intentionally NOT repositioning popover so it remains fixed in viewport
                }
            });
        }

        /************** Cleanup **************/
        updateOptions(options = {}) {
            this.opts = options;
            this.steps = Array.isArray(options.steps) ? options.steps : [];
            this.cbNext = typeof options.onNextClick === "function" ? options.onNextClick : () => {};
            this.cbPrev = typeof options.onPrevClick === "function" ? options.onPrevClick : () => {};
            this.cbDestroy = typeof options.onDestroyStarted === "function" ? options.onDestroyStarted : () => {};
            this.cbHighlight = typeof options.onHighlighted === "function" ? options.onHighlighted : () => {};
        }

        destroy() {
            if (this._destroying) return;
            this._destroying = true;

            window.removeEventListener("resize", this.onResize);
            window.removeEventListener("scroll", this.onScroll);

            // fire callback once
            this.cbDestroy();

            if (this.overlay) { this.overlay.container.remove(); this.overlay = null; }
            if (this.highlightBox) { this.highlightBox.remove(); this.highlightBox = null; }
            if (this.pop) { this.pop.root.remove(); this.pop = null; }
            document.querySelectorAll('.driver-active-element').forEach(el => el.classList.remove('driver-active-element'));
            
            // Nullify the singleton so a fresh one is created next time
            if (bubblesSingleton === this) {
                bubblesSingleton = null;
            }
        }
    }

    /************** Public shim **************/
    let bubblesSingleton = null;

    if (!window.driver) window.driver = {};
    if (!window.driver.js) window.driver.js = {};
    window.driver.js.driver = function (opts) {
        if (!bubblesSingleton) {
            bubblesSingleton = new BubblesEngine(opts);
        } else {
            bubblesSingleton.updateOptions(opts);
        }

        return {
            drive: idx => bubblesSingleton.drive(idx),
            moveNext: () => bubblesSingleton.moveNext(),
            movePrevious: () => bubblesSingleton.movePrevious(),
            getActiveIndex: () => bubblesSingleton.getActiveIndex(),
            getStepsCount: () => bubblesSingleton.getStepsCount(),
            hasNextStep: () => bubblesSingleton.hasNextStep(),
            hasPreviousStep: () => bubblesSingleton.hasPreviousStep(),
            destroy: () => bubblesSingleton.destroy()
        };
    };

    // --------------------------------------------------------------
    // Public helper: expose synchronous help.yml access for any UI
    // component (Events table, etc.) that needs contextual text.
    // --------------------------------------------------------------
    if (typeof window.driver.js.getHelpData !== 'function') {
        window.driver.js.getHelpData = () => loadHelpDataSync();
    }
})(); 