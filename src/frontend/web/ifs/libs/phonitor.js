/*
 * Phonitor.js – Minimal Debug Overlay for Mobile Web
 * -------------------------------------------------
 * Purpose:
 *   Provide a single-line, live-updating overlay at the top of the page that
 *   can be appended with short debug tokens (characters, words, numbers…).
 *   This is ideal for on-device debugging where the browser console is hard to
 *   reach (e.g. phones, tablets, Smart TVs).
 *
 * Usage:
 *   1. Import or include this script in your page **before** you need it.
 *      <script src="/ifs/libs/phonitor.js"></script>
 *
 *   2. Initialise once in your app startup code:
 *        const dbg = Phonitor.init();           // default yellow bar
 *      // or with options:
 *        const dbg = Phonitor.init({
 *          id: 'myDbgLine',                     // element id (default 'phonitorLine')
 *          bg: '#ffeb3b',                       // background colour
 *          fg: '#000',                          // text colour
 *          font: '12px monospace',              // CSS font string
 *          maxLen: 40                           // maximum characters kept
 *        });
 *
 *   3. Anywhere in your code push characters/tokens:
 *        dbg.push('N');         // e.g. Next button clicked
 *        dbg.push('S' + step);  // step shown
 *
 *      Each call updates the overlay immediately. The string never exceeds
 *      `options.maxLen` (oldest characters are dropped).
 *
 *   4. Optional helpers:
 *        dbg.flush();   // (re)render current buffer (rarely needed)
 *        dbg.clear();   // clear buffer & hide overlay
 *        dbg.off();     // disable overlay entirely (keeps buffer)
 *        dbg.on();      // re-enable overlay
 *
 *   5. Remove Phonitor from production builds simply by not including the
 *      script or calling Phonitor.init(). It has zero side-effects when idle.
 *
 * Notes:
 *   – Designed to be dependency-free and ES5-compatible.
 *   – The overlay (`position:fixed; top:0; width:100%`) uses `pointer-events:none`
 *     so it never intercepts touches/clicks.
 *   – Name origin: Phone Monitor → Phonitor.
 */

(function (global) {
  'use strict';

  var defaultOpts = {
    id: 'phonitorLine',
    bg: '#ffeb3b',
    fg: '#000',
    font: '12px monospace',
    maxLen: 40
  };

  function createLine(opts) {
    var line = document.createElement('div');
    line.id = opts.id;
    var style = line.style;
    style.position = 'fixed';
    style.top = '0';
    style.left = '0';
    style.width = '100%';
    style.background = opts.bg;
    style.color = opts.fg;
    style.font = opts.font;
    style.zIndex = '2147483647'; // always on top
    style.textAlign = 'center';
    style.pointerEvents = 'none';
    style.whiteSpace = 'nowrap';
    style.overflow = 'hidden';
    style.textOverflow = 'clip';
    return line;
  }

  function PhonitorInstance(opts) {
    this.opts = opts;
    this.buffer = '';
    this.enabled = true;
    // Lazy-create DOM element on first push for zero cost when unused
    this._el = null;
  }

  PhonitorInstance.prototype._ensureEl = function () {
    if (!this._el) {
      var existing = document.getElementById(this.opts.id);
      this._el = existing || createLine(this.opts);
      if (!existing) {
        document.body.appendChild(this._el);
      }
    }
  };

  PhonitorInstance.prototype.push = function (token) {
    if (!this.enabled) return;
    if (token == null) return;
    token = String(token);
    var max = this.opts.maxLen;
    this.buffer = (this.buffer + token).slice(-max);
    this._ensureEl();
    this._el.textContent = this.buffer;
  };

  PhonitorInstance.prototype.flush = function () {
    if (!this.enabled || !this.buffer) return;
    this._ensureEl();
    this._el.textContent = this.buffer;
  };

  PhonitorInstance.prototype.clear = function () {
    this.buffer = '';
    if (this._el) this._el.textContent = '';
  };

  PhonitorInstance.prototype.off = function () {
    this.enabled = false;
    if (this._el) this._el.style.display = 'none';
  };

  PhonitorInstance.prototype.on = function () {
    this.enabled = true;
    if (this._el) this._el.style.display = '';
  };

  // Public namespace
  var Phonitor = {
    init: function (options) {
      options = options || {};
      var opts = {
        id: options.id || defaultOpts.id,
        bg: options.bg || defaultOpts.bg,
        fg: options.fg || defaultOpts.fg,
        font: options.font || defaultOpts.font,
        maxLen: typeof options.maxLen === 'number' ? options.maxLen : defaultOpts.maxLen
      };
      return new PhonitorInstance(opts);
    }
  };

  // Expose globally (non-module environment)
  global.Phonitor = Phonitor;

  // Support CommonJS / ES Module environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Phonitor;
  }
})(typeof window !== 'undefined' ? window : this); 