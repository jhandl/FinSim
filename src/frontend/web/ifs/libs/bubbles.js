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

            this._destroying = false; // guard against recursive destroy
        }

        /************** Public API **************/
        drive(start = 0) {
            if (!this.steps.length) return;
            if (this.overlay) this.destroy();
            // Build DOM once
            this.buildDOM();

            window.addEventListener("resize", this.onResize);
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
            if (idx < 0 || idx >= this.steps.length) {
                this.destroy();
                return;
            }
            
            this.activeIdx = idx;
            const step = this.steps[idx];
            let target = step.element ? document.querySelector(step.element) : null;
            if (!target) {
                // If element missing but defined, skip step, otherwise treat as detached full popover
                if (step.element) { this.showStep(idx + 1); return; }
            }

            if (target) {
                await this.scrollIntoView(target);
                await this.ensureHorizontalVisibility(target);
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
                const fitsVertically = cardRect.height <= (window.innerHeight - hdrH - 2 * margin);
                const topVisible = cardRect.top >= hdrH + margin;
                const bottomVisible = cardRect.bottom <= window.innerHeight - margin;

                // If card fits and is not already fully visible, scroll to reveal full card
                if (fitsVertically && !(topVisible && bottomVisible)) {
                    desiredRect = cardRect;
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
            // content
            title.textContent = step.popover?.title || '';
            title.style.display = title.textContent ? '' : 'none';
            if (step.popover?.description) {
                desc.innerHTML = step.popover.description;
                desc.style.display = '';
            } else {
                desc.style.display = 'none';
            }

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
            const margin = 12;
            const pop = this.pop.root;
            pop.style.opacity = 0;
            pop.style.transform = 'none'; // reset to measure actual size
            pop.style.display = 'block';

            const measuredWidth = pop.offsetWidth;
            const measuredHeight = pop.offsetHeight;

            // restore initial scale for animation
            pop.style.transform = 'scale(0.95)';

            const tr = target.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            // On some mobile browsers (e.g. Android Chrome) a bottom navigation bar overlays
            // part of the visual viewport. The height of that bar is *not* included in
            // window.innerHeight, so popovers positioned flush with the bottom edge can become
            // partially hidden.  We approximate this inset as the difference between the full
            // screen height and the reported viewport height. If that value is negative we clamp
            // it to 0 to avoid distorting layout on desktop browsers.
            const bottomInset = Math.max(0, window.screen.height - vh);
            const chinPadding = 12; // extra offset to keep popovers away from phone UI chin
            const effectiveInset = bottomInset + chinPadding;

            const sides = [prefSide, opposite(prefSide), 'bottom', 'top', 'right', 'left'];
            let placed = false;
            for (const side of sides) {
                const pos = coords(side);
                if (fits(pos)) { apply(pos); placed = true; break; }
            }
            if (!placed) {
                // As a last-ditch effort detach the popover and pin it above the bottom inset
                // so that it is always fully visible.
                apply({ fixed: true, top: vh - measuredHeight - margin - effectiveInset, left: Math.max(margin, (vw - measuredWidth) / 2) });
            }

            requestAnimationFrame(()=>{
                pop.style.opacity = 1;
                pop.style.transform = 'scale(1)';
            });

            /* helpers */
            function opposite(s) { return { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[s] || 'right'; }
            function coords(side) {
                const isMobile = window.innerWidth < 500;
                // Determine anchor rect: card container for mobile if exists, otherwise element itself
                let anchorRect = tr;
                if (isMobile) {
                    const card = target.closest('.card');
                    if (card) anchorRect = card.getBoundingClientRect();
                }
                // Anchor to burger menu container if target resides inside it (regardless of viewport)
                const burgerMenu = target.closest('#mobileMenu');
                if (burgerMenu) {
                    anchorRect = burgerMenu.getBoundingClientRect();
                }

                const defaultLeft = anchorRect.left + anchorRect.width/2 - measuredWidth/2 + window.scrollX;
                const centredLeft = window.scrollX + vw/2 - measuredWidth/2; // center of viewport

                let leftPos = defaultLeft;
                if (isMobile && (anchorRect.width < measuredWidth || target.tagName === 'HEADER')) {
                    leftPos = centredLeft;
                }

                switch (side) {
                    case 'top':
                        return { top: anchorRect.top - measuredHeight - margin + window.scrollY, left: leftPos };
                    case 'bottom':
                        return { top: anchorRect.bottom + margin + window.scrollY, left: leftPos };
                    case 'left':
                        return { top: tr.top + tr.height/2 - measuredHeight/2 + window.scrollY, left: tr.left - measuredWidth - margin + window.scrollX };
                    case 'right':
                        return { top: tr.top + tr.height/2 - measuredHeight/2 + window.scrollY, left: tr.right + margin + window.scrollX };
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
                    top >= window.scrollY &&
                    left >= window.scrollX &&
                    (left + measuredWidth) <= window.scrollX + vw &&
                    (top + measuredHeight) <= window.scrollY + vh - effectiveInset
                );
            }
            function apply(p) {
                if (p.fixed) {
                    pop.style.position = 'fixed';
                    pop.style.top = p.top + 'px';
                    pop.style.left = p.left + 'px';
                } else {
                    pop.style.position = 'absolute';
                    // Clamp top so the popover never intrudes into the bottom inset area.
                    const clampedTop = Math.min(Math.max(window.scrollY, p.top), window.scrollY + vh - measuredHeight - effectiveInset - margin);
                    pop.style.top = clampedTop + 'px';
                    const clampedLeft = Math.max(window.scrollX + 8, Math.min(p.left, window.scrollX + vw - measuredWidth - 8));
                    pop.style.left = clampedLeft + 'px';
                }
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

        /************** Cleanup **************/
        destroy() {
            if (this._destroying) return;
            this._destroying = true;

            window.removeEventListener("resize", this.onResize);

            // fire callback once
            this.cbDestroy();

            if (this.overlay) { this.overlay.container.remove(); this.overlay = null; }
            if (this.highlightBox) { this.highlightBox.remove(); this.highlightBox = null; }
            if (this.pop) { this.pop.root.remove(); this.pop = null; }
            document.querySelectorAll('.driver-active-element').forEach(el => el.classList.remove('driver-active-element'));
        }
    }

    /************** Public shim **************/
    if (!window.driver) window.driver = {};
    if (!window.driver.js) window.driver.js = {};
    window.driver.js.driver = function (opts) {
        const engine = new BubblesEngine(opts);
        return {
            drive: idx => engine.drive(idx),
            moveNext: () => engine.moveNext(),
            movePrevious: () => engine.movePrevious(),
            getActiveIndex: () => engine.getActiveIndex(),
            getStepsCount: () => engine.getStepsCount(),
            hasNextStep: () => engine.hasNextStep(),
            hasPreviousStep: () => engine.hasPreviousStep(),
            destroy: () => engine.destroy()
        };
    };
})(); 