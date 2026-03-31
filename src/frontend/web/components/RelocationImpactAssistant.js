/* RelocationImpactAssistant centralizes inline resolution panel rendering and actions for both table and accordion views. The legacy relocation modal has been removed. */

var RelocationSplitSuggestionLib = this.RelocationSplitSuggestion;
if (!RelocationSplitSuggestionLib && typeof require === 'function') {
  RelocationSplitSuggestionLib = require('./RelocationSplitSuggestion.js').RelocationSplitSuggestion;
}

var RelocationImpactAssistant = {

  // Public API
  renderPanelForTableRow: function (rowEl, event, env) {
    if (!rowEl || !event || !event.relocationImpact) return;
    const existingPanel = rowEl.nextElementSibling;
    const rowId = rowEl && rowEl.dataset ? rowEl.dataset.rowId : undefined;
    const eventId = rowEl && rowEl.dataset ? rowEl.dataset.eventId : undefined;
    if (existingPanel && existingPanel.classList && existingPanel.classList.contains('resolution-panel-row')) return;
    this.collapseAllPanels();
    const panelRow = document.createElement('tr');
    panelRow.className = 'resolution-panel-row';
    const panelCell = document.createElement('td');
    const colCount = (rowEl && rowEl.children && rowEl.children.length) || (document.querySelectorAll('#Events thead th').length) || 1;
    panelCell.colSpan = colCount;
    panelCell.innerHTML = this.createPanelHtml(event, rowId, env, eventId);
    panelRow.appendChild(panelCell);
    rowEl.insertAdjacentElement('afterend', panelRow);
    this._animateOpen(panelCell);
    this._bindPanelInteractions(panelCell, { context: 'table', rowId: rowId, eventId: eventId, event: event, env: env });
    this._setupCollapseTriggers({ context: 'table', anchorEl: panelRow, rowId: rowId });
    if (panelCell) this.attachSplitTooltip(panelCell);
  },

  collapsePanelForTableRow: function (rowEl) {
    if (!rowEl) return;
    const panelRow = rowEl.nextElementSibling;
    if (!panelRow || !panelRow.classList || !panelRow.classList.contains('resolution-panel-row')) return;
    const expander = panelRow.querySelector('.resolution-panel-expander');
    const container = panelRow.querySelector('.resolution-panel-container');
    if (container) { try { container.classList.remove('visible'); } catch (_) { } }
    if (expander) {
      const current = expander.scrollHeight; expander.style.height = current + 'px';
      // eslint-disable-next-line no-unused-expressions
      expander.offsetHeight; requestAnimationFrame(function () { expander.style.height = '0px'; });
      const onClosed = function (e) {
        if (e.target !== expander) return;
        expander.removeEventListener('transitionend', onClosed);
        if (panelRow.parentNode) panelRow.remove();
        // Trigger resize after panel removal to update layout
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('resize', { detail: { skipScroll: true } }));
      };
      expander.addEventListener('transitionend', onClosed);
    } else {
      if (panelRow.parentNode) panelRow.remove();
    }
    this._teardownCollapseTriggers(panelRow);
  },

  collapseAllPanels: function () {
    // Table
    try {
      const panelRows = document.querySelectorAll('.resolution-panel-row');
      panelRows.forEach((panelRow) => { const eventRow = panelRow.previousElementSibling; if (eventRow) this.collapsePanelForTableRow(eventRow); });
    } catch (_) { }
    // Accordion
    try {
      const items = document.querySelectorAll('.events-accordion-item');
      items.forEach((item) => { const expander = item.querySelector('.resolution-panel-expander'); if (expander) this._collapseAccordionPanel(item); });
    } catch (_) { }
  },

  renderPanelInAccordion: function (itemEl, event, env) {
    if (!itemEl || !event || !event.relocationImpact) return;
    const content = itemEl.querySelector('.accordion-item-content');
    if (!content) return;
    const existing = content.querySelector('.resolution-panel-container') || content.querySelector('.resolution-panel-expander');
    if (existing) return;
    const eventId = itemEl && itemEl.dataset ? itemEl.dataset.eventId : undefined;
    const wrapper = content.querySelector('.accordion-item-content-wrapper') || content;
    const html = this.createPanelHtml(event, event.rowId, env, eventId);
    wrapper.insertAdjacentHTML('afterbegin', html);
    const container = content.querySelector('.resolution-panel-container');
    const expander = content.querySelector('.resolution-panel-expander');
    this._animateOpen(expander || container);
    this._bindPanelInteractions(container || content, { context: 'accordion', accordionItem: itemEl, eventId: eventId, event: event, env: env });
    this._setupCollapseTriggers({ context: 'accordion', anchorEl: itemEl, accordionId: event.accordionId });
    if (container) this.attachSplitTooltip(container);
  },

  // Public API: collapse inline resolution panel within an accordion item
  // Delegates to the internal implementation to keep animations consistent
  collapsePanelInAccordion: function (itemEl) {
    this._collapseAccordionPanel(itemEl);
  },

  createPanelHtml: function (event, rowId, env, eventId) {
    // Based on table manager implementation
    const events = (env && env.webUI && typeof env.webUI.readEvents === 'function') ? env.webUI.readEvents(false) : [];
    const doc = (typeof document !== 'undefined') ? document : null;
    const eventRow = (function () {
      if (!doc) return null;
      if (rowId) {
        const byRow = doc.querySelector('tr[data-row-id="' + rowId + '"]');
        if (byRow && !(byRow.classList && byRow.classList.contains('resolution-panel-row'))) return byRow;
      }
      if (eventId) {
        const byEvent = doc.querySelector('tr[data-event-id="' + eventId + '"]');
        if (byEvent && !(byEvent.classList && byEvent.classList.contains('resolution-panel-row'))) return byEvent;
      }
      return null;
    })();
    const canJoinWithPreviousSplitSegment = (function () {
      if (!doc || !eventRow || !event || !event.linkedEventId) return false;
      const linkedId = String(event.linkedEventId || '');
      if (!linkedId) return false;
      const rows = Array.from(doc.querySelectorAll('#Events tbody tr')).filter(function (r) {
        return r && r.style.display !== 'none' && !(r.classList && r.classList.contains('resolution-panel-row'));
      });
      const chainRows = rows.filter(function (candidate) {
        const linkedInput = candidate.querySelector('.event-linked-event-id');
        return linkedInput && String(linkedInput.value || '') === linkedId;
      });
      if (chainRows.length < 3) return false;
      chainRows.sort(function (a, b) {
        const aFrom = Number(a.querySelector('.event-from-age') ? a.querySelector('.event-from-age').value : '');
        const bFrom = Number(b.querySelector('.event-from-age') ? b.querySelector('.event-from-age').value : '');
        if (aFrom !== bFrom) return aFrom - bFrom;
        const aTo = Number(a.querySelector('.event-to-age') ? a.querySelector('.event-to-age').value : '');
        const bTo = Number(b.querySelector('.event-to-age') ? b.querySelector('.event-to-age').value : '');
        return aTo - bTo;
      });
      const idx = chainRows.indexOf(eventRow);
      if (idx <= 0 || idx >= chainRows.length - 1) return false;
      const prev = chainRows[idx - 1];
      const cur = chainRows[idx];
      const prevTo = Number(prev.querySelector('.event-to-age') ? prev.querySelector('.event-to-age').value : '');
      const curFrom = Number(cur.querySelector('.event-from-age') ? cur.querySelector('.event-from-age').value : '');
      if (isNaN(prevTo) || isNaN(curFrom)) return true;
      return prevTo === curFrom || prevTo + 1 === curFrom;
    })();
    const impactCategory = event && event.relocationImpact ? event.relocationImpact.category : '';
    let impactDetails = event && event.relocationImpact ? event.relocationImpact.details : null;
    if (typeof impactDetails === 'string') {
      try { impactDetails = JSON.parse(impactDetails); } catch (_) { impactDetails = null; }
    }
    const isRelocationRentalOrphan = !!(impactDetails && impactDetails.relocationRentalOrphan === true);
    const mvEventId = event && event.relocationImpact ? event.relocationImpact.mvEventId : null;
    let mvEvent = events.find(function (e) {
      return e && (e.id === mvEventId || e._mvRuntimeId === mvEventId || e.relocationLinkId === mvEventId);
    });
    if (!mvEvent && mvEventId && doc) {
      // Fallback: find mvEvent from DOM by matching row id
      try {
        const rows = doc.querySelectorAll('#Events tbody tr');
        for (let i = 0; i < rows.length; i++) {
          const mvRow = rows[i];
          const rowId = mvRow && mvRow.dataset ? mvRow.dataset.eventId : '';
          const linkIdInput = mvRow ? mvRow.querySelector('.event-relocation-link-id') : null;
          const linkId = linkIdInput ? linkIdInput.value : '';
          if (rowId !== mvEventId && linkId !== mvEventId) continue;
          const typeInput = mvRow.querySelector('.event-type');
          const fromAgeInput = mvRow.querySelector('.event-from-age');
          const nameInput = mvRow.querySelector('.event-name');
          if (typeInput && typeInput.value === 'MV') {
            mvEvent = {
              id: mvEventId,
              type: typeInput.value,
              name: nameInput ? nameInput.value : '',
              fromAge: fromAgeInput ? fromAgeInput.value : null
            };
            break;
          }
        }
      } catch (e) {
        // Fallback failed, continue with null mvEvent
      }
    }
    const startCountry = Config.getInstance().getStartCountry();
    const canRenderWithoutMv = (impactCategory === 'simple' && (event.type === 'R' || event.type === 'M' || (event.type === 'RI' && isRelocationRentalOrphan))) ||
      impactCategory === 'pension_conflict';
    if (!mvEvent && !canRenderWithoutMv && impactCategory !== 'split_orphan' && impactCategory !== 'split_relocation_shift' && impactCategory !== 'sale_relocation_shift' && impactCategory !== 'sale_marker_orphan' && impactCategory !== 'split_amount_shift' && impactCategory !== 'split_suggestion_shift') return '';
    let destCountry = mvEvent ? String(mvEvent.name || '').trim().toLowerCase() : startCountry;
    if (impactCategory === 'pension_conflict' && impactDetails && impactDetails.country) {
      destCountry = String(impactDetails.country || '').trim().toLowerCase() || destCountry;
    }
    const originCountry = mvEvent && (env && env.eventsTableManager && typeof env.eventsTableManager.getOriginCountry === 'function') ? env.eventsTableManager.getOriginCountry(mvEvent, startCountry) : startCountry;
    const relocationAge = mvEvent ? mvEvent.fromAge : null;

    let content = '';
    const econ = Config.getInstance().getEconomicData();
    const baseAmountSanitized = (function (a) { var s = (a == null) ? '' : String(a); s = s.replace(/[^0-9.\-]/g, ''); var n = Number(s); return isNaN(n) ? Number(a) : n; })(event.amount);
    const fxRate = econ && econ.ready ? econ.getFX(originCountry, destCountry) : null;
    const pppRatio = econ && econ.ready ? econ.getPPP(originCountry, destCountry) : null;
    const fxAmount = (fxRate != null && !isNaN(baseAmountSanitized)) ? Math.round(baseAmountSanitized * fxRate) : null;
    const pppAmount = (pppRatio != null && !isNaN(baseAmountSanitized)) ? Math.round(baseAmountSanitized * pppRatio) : null;
    let fxDate = null; try { if (econ && econ.data) { var toEntry = econ.data[String(destCountry).toUpperCase()]; fxDate = toEntry && toEntry.fx_date ? toEntry.fx_date : null; } } catch (_) { }

    function getSymbolAndLocaleByCountry(countryCode) {
      try {
        const rs = Config.getInstance().getCachedTaxRuleSet(countryCode);
        const ls = (typeof FormatUtils !== 'undefined' && typeof FormatUtils.getLocaleSettings === 'function') ? FormatUtils.getLocaleSettings() : { numberLocale: 'en-US', currencySymbol: '' };
        return { symbol: rs && rs.getCurrencySymbol ? rs.getCurrencySymbol() : (ls.currencySymbol || ''), locale: rs && rs.getNumberLocale ? rs.getNumberLocale() : (ls.numberLocale || 'en-US') };
      } catch (_) { const ls = (typeof FormatUtils !== 'undefined' && typeof FormatUtils.getLocaleSettings === 'function') ? FormatUtils.getLocaleSettings() : { numberLocale: 'en-US', currencySymbol: '' }; return { symbol: ls.currencySymbol || '', locale: ls.numberLocale || 'en-US' }; }
    }
    function fmtWithSymbol(symbol, locale, value) {
      if (value == null || value === '' || isNaN(Number(value))) return '';
      const num = Number(value);
      try { const formatted = new Intl.NumberFormat(locale || 'en-US', { style: 'decimal', maximumFractionDigits: 0 }).format(num); return (symbol || '') + formatted; } catch (_) { return (symbol || '') + String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    }
    function parseAmountByCountry(value, countryCode) {
      if (value == null || value === '') return NaN;
      let s = String(value);
      try {
        const rs = Config.getInstance().getCachedTaxRuleSet(countryCode);
        const ls = (typeof FormatUtils !== 'undefined' && typeof FormatUtils.getLocaleSettings === 'function') ? FormatUtils.getLocaleSettings() : { numberLocale: 'en-US', currencySymbol: '' };
        const locale = rs && rs.getNumberLocale ? rs.getNumberLocale() : (ls.numberLocale || 'en-US');
        const symbol = rs && rs.getCurrencySymbol ? rs.getCurrencySymbol() : (ls.currencySymbol || '');
        if (symbol) {
          const escSym = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          s = s.replace(new RegExp(escSym, 'g'), '');
        }
        s = s.replace(/\s+/g, '');
        const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
        const group = (parts.find(p => p.type === 'group') || {}).value || ',';
        const decimal = (parts.find(p => p.type === 'decimal') || {}).value || '.';
        s = s.split(group).join('');
        if (decimal !== '.') s = s.split(decimal).join('.');
        const n = parseFloat(s);
        if (!isNaN(n)) return n;
      } catch (_) { }
      const cleaned = String(value).replace(/[^0-9,\.\-]/g, '');
      if (!cleaned) return NaN;
      const lastComma = cleaned.lastIndexOf(',');
      const lastDot = cleaned.lastIndexOf('.');
      let normalized = cleaned;
      if (lastComma !== -1 && lastDot !== -1) {
        if (lastComma > lastDot) {
          normalized = normalized.split('.').join('');
          normalized = normalized.replace(',', '.');
        } else {
          normalized = normalized.split(',').join('');
        }
      } else if (lastComma !== -1 && lastDot === -1) {
        normalized = normalized.replace(',', '.');
      }
      const fallback = Number(normalized);
      return isNaN(fallback) ? NaN : fallback;
    }

    const addAction = function (arr, cfg) {
      if (!cfg || !cfg.action) return;
      cfg.tabId = 'resolution-tab-' + rowId + '-' + cfg.action;
      cfg.detailId = 'resolution-detail-' + rowId + '-' + cfg.action;
      arr.push(cfg);
    };
    const actions = [];
    let containerAttributes = '';

    if (event.relocationImpact.category === 'boundary') {
      if (event.type === 'R') {
        const fromRuleSet = Config.getInstance().getCachedTaxRuleSet(originCountry);
        const toRuleSet = Config.getInstance().getCachedTaxRuleSet(destCountry);
        const originCurrency = fromRuleSet ? fromRuleSet.getCurrencyCode() : 'EUR';
        const destCurrency = toRuleSet ? toRuleSet.getCurrencyCode() : 'EUR';
        const fromMeta = getSymbolAndLocaleByCountry(originCountry);

        var yieldRate = 0.04; // Default 4%
        var econData = fromRuleSet ? fromRuleSet.getEconomicData() : null;
        if (econData && typeof econData.typicalRentalYield === 'number') {
          yieldRate = econData.typicalRentalYield / 100;
        }
        var estimatedRentOrigin = Math.round(baseAmountSanitized * yieldRate);
        var inputFormatted = !isNaN(estimatedRentOrigin) ? fmtWithSymbol(fromMeta.symbol, fromMeta.locale, estimatedRentOrigin) : '';

        addAction(actions, { action: 'keep_property', tabLabel: 'Keep property', instantApply: true, tooltip: 'Keep this property after relocation.', buttonAttrs: ' data-row-id="' + rowId + '"' });
        addAction(actions, { action: 'rent_out', tabLabel: 'Rent out', instantApply: true, tooltip: 'Keep the property and start renting it out after the relocation. Estimated rental income: ' + inputFormatted + ' ' + (originCurrency || '') + '.', buttonAttrs: ' data-row-id="' + rowId + '"' });
        addAction(actions, { action: 'sell_property', tabLabel: 'Sell property', instantApply: true, tooltip: 'Sell the property when relocating.', buttonAttrs: ' data-row-id="' + rowId + '"' });
      } else if (event.type === 'M') {
        const fromRuleSet = Config.getInstance().getCachedTaxRuleSet(originCountry);
        const originCurrency = fromRuleSet ? fromRuleSet.getCurrencyCode() : 'EUR';
        addAction(actions, { action: 'keep_property', tabLabel: 'Keep debt', instantApply: true, tooltip: 'Continue paying the mortgage in ' + (originCurrency || 'origin currency') + '. You will be subject to exchange rate fluctuations.', buttonAttrs: ' data-row-id="' + rowId + '"' });
        addAction(actions, { action: 'sell_property', tabLabel: 'Pay off', instantApply: true, tooltip: 'Fully repay the remaining balance of the mortgage at the time of relocation.', buttonAttrs: ' data-row-id="' + rowId + '"' });
      } else {
        const sourceLinkedCountry = (event.type === 'RI' && event.linkedCountry)
          ? String(event.linkedCountry).toLowerCase()
          : '';
        const conversionFromCountry = sourceLinkedCountry || originCountry;
        const conversionToCountry = sourceLinkedCountry || destCountry;
        const pppSuggestionNum = Number(this.calculatePPPSuggestion(event.amount, conversionFromCountry, conversionToCountry));
        const fromRuleSet = Config.getInstance().getCachedTaxRuleSet(conversionFromCountry);
        const toRuleSet = Config.getInstance().getCachedTaxRuleSet(conversionToCountry);
        const originCurrency = fromRuleSet ? fromRuleSet.getCurrencyCode() : 'EUR';
        const destCurrency = toRuleSet ? toRuleSet.getCurrencyCode() : 'EUR';
        const isIncomeOrExpenseType = ['S', 'PP', 'SI', 'SI2', 'SInp', 'SI2np', 'UI', 'RI', 'DBI', 'FI', 'E'].indexOf(event.type) !== -1;
        const fromMeta = getSymbolAndLocaleByCountry(conversionFromCountry);
        const toMeta = getSymbolAndLocaleByCountry(conversionToCountry);
        const inputFormatted = !isNaN(pppSuggestionNum) ? fmtWithSymbol(toMeta.symbol, toMeta.locale, pppSuggestionNum) : '';
        const currentFormatted = fmtWithSymbol(fromMeta.symbol, fromMeta.locale, baseAmountSanitized);
        
        containerAttributes = ' data-from-country="' + conversionFromCountry + '" data-to-country="' + conversionToCountry + '" data-from-currency="' + originCurrency + '" data-to-currency="' + destCurrency + '" data-base-amount="' + (isNaN(baseAmountSanitized) ? '' : String(baseAmountSanitized)) + '" data-fx="' + (fxRate != null ? fxRate : '') + '" data-fx-date="' + (fxDate || '') + '" data-ppp="' + (pppRatio != null ? pppRatio : '') + '" data-fx-amount="' + (fxAmount != null ? fxAmount : '') + '" data-ppp-amount="' + (pppAmount != null ? pppAmount : '') + '"';
        
        addAction(actions, { 
          action: 'split', 
          tabLabel: 'Split event', 
          instantApply: true, 
          tooltip: 'Splits this event at the move. The second half will start with a PPP-adjusted value of ' + inputFormatted + ' ' + (destCurrency || '') + '.',
          buttonAttrs: ' data-row-id="' + rowId + '" data-part2-amount="' + (isNaN(pppSuggestionNum) ? '' : String(pppSuggestionNum)) + '"' 
        });
        if (isIncomeOrExpenseType) {
          addAction(actions, { action: 'cut_short', tabLabel: 'Cut short', instantApply: true, tooltip: 'End this event before relocation.', buttonAttrs: ' data-row-id="' + rowId + '"' });
        }
        addAction(actions, { action: 'peg', tabLabel: 'Keep as is', instantApply: true, tooltip: 'Let this event continue unchanged after the relocation (keeping its current value of ' + currentFormatted + ' ' + (originCurrency || '') + ').', buttonAttrs: ' data-row-id="' + rowId + '" data-currency="' + originCurrency + '"' });
      }
    } else if (event.relocationImpact.category === 'pension_conflict') {
      addAction(actions, { action: 'convert', tabLabel: 'Convert to "Salary (no pension)"', instantApply: true, tooltip: 'Converts this to a non-pensionable salary event.', buttonAttrs: ' data-row-id="' + rowId + '"' });
      addAction(actions, { action: 'delete', tabLabel: 'Remove', instantApply: true, tooltip: 'Delete this event.', buttonAttrs: ' data-row-id="' + rowId + '"' });
    } else if (event.relocationImpact.category === 'simple') {
      if (event.type === 'RI' && isRelocationRentalOrphan) {
        addAction(actions, { action: 'keep_renting', tabLabel: 'Keep renting', instantApply: true, tooltip: 'Keep this rental income event unchanged.', buttonAttrs: ' data-row-id="' + rowId + '"' });
        addAction(actions, { action: 'delete', tabLabel: 'Remove', instantApply: true, tooltip: 'Delete this rental income event.', buttonAttrs: ' data-row-id="' + rowId + '"' });
      } else {
      const hasStaleRealEstateLink = !!(impactDetails && impactDetails.previousLinkedCountry);
      if ((event.type === 'R' || event.type === 'M') && (!event.linkedCountry || hasStaleRealEstateLink)) {
        const countries = Config.getInstance().getAvailableCountries();
        const detectedCountryFromDetails = impactDetails && impactDetails.detectedCountry ? String(impactDetails.detectedCountry).toLowerCase() : '';
        const detectedCountry = detectedCountryFromDetails || ((env && env.eventsTableManager && env.eventsTableManager.detectPropertyCountry) ? env.eventsTableManager.detectPropertyCountry(event.fromAge, startCountry) : startCountry);
        const detectedCountryObj = countries.find(function (c) { return c.code.toLowerCase() === detectedCountry; });
        const detectedCountryName = detectedCountryObj ? detectedCountryObj.name : (detectedCountry ? detectedCountry.toUpperCase() : '');

        // Find the original country from the event's currency
        const eventCurrency = event.currency ? String(event.currency).toUpperCase().trim() : null;
        const staleLinkedCountry = impactDetails && impactDetails.previousLinkedCountry ? String(impactDetails.previousLinkedCountry).toLowerCase() : '';
        let originalCountry = staleLinkedCountry || null;
        if (eventCurrency) {
          for (let i = 0; i < countries.length; i++) {
            const rs = Config.getInstance().getCachedTaxRuleSet(countries[i].code.toLowerCase());
            if (rs && rs.getCurrencyCode && String(rs.getCurrencyCode()).toUpperCase().trim() === eventCurrency) {
              originalCountry = countries[i].code.toLowerCase();
              break;
            }
          }
        }
        // Fallback: if no currency or country found, use startCountry
        if (!originalCountry) originalCountry = startCountry;

        const originalCountryObj = countries.find(function (c) { return c.code.toLowerCase() === originalCountry; });
        const originalCountryName = originalCountryObj ? originalCountryObj.name : (originalCountry ? originalCountry.toUpperCase() : '');

        const fromRuleSet = Config.getInstance().getCachedTaxRuleSet(originalCountry);
        const originCurrency = fromRuleSet ? fromRuleSet.getCurrencyCode() : 'EUR';
        const fromMeta = getSymbolAndLocaleByCountry(originalCountry);
        const currentAmountNum = Number(baseAmountSanitized);
        const currentFormatted = fmtWithSymbol(fromMeta.symbol, fromMeta.locale, currentAmountNum);

        // Calculate conversion from original country to detected country (initially selected)
        const pppSuggestionNum = Number(this.calculatePPPSuggestion(event.amount, originalCountry, detectedCountry));
        const toRuleSet = Config.getInstance().getCachedTaxRuleSet(detectedCountry);
        const toCurrency = toRuleSet ? toRuleSet.getCurrencyCode() : 'EUR';
        const toMeta = getSymbolAndLocaleByCountry(detectedCountry);
        const suggestedFormatted = !isNaN(pppSuggestionNum) ? fmtWithSymbol(toMeta.symbol, toMeta.locale, pppSuggestionNum) : '';

        const label1 = hasStaleRealEstateLink ? ('In ' + originalCountryName) : 'Before move';
        const label2 = hasStaleRealEstateLink ? ('In ' + detectedCountryName) : 'After move';

        containerAttributes = ' data-from-country="' + originalCountry + '" data-to-country="' + detectedCountry + '" data-from-currency="' + originCurrency + '" data-to-currency="' + toCurrency + '" data-base-amount="' + (isNaN(baseAmountSanitized) ? '' : String(baseAmountSanitized)) + '" data-fx="' + (fxRate != null ? fxRate : '') + '" data-fx-date="' + (fxDate || '') + '" data-ppp="' + (pppRatio != null ? pppRatio : '') + '" data-fx-amount="' + (fxAmount != null ? fxAmount : '') + '" data-ppp-amount="' + (pppAmount != null ? pppAmount : '') + '"';
        
        addAction(actions, { action: 'delete', tabLabel: 'Remove', instantApply: true, tooltip: 'Delete this event.', buttonAttrs: ' data-row-id="' + rowId + '"' });
        addAction(actions, { action: 'mark_reviewed', tabLabel: 'Keep as is', instantApply: true, tooltip: 'Ignore this impact and keep the event as it is.', buttonAttrs: ' data-row-id="' + rowId + '"' });
        addAction(actions, { 
          action: 'link', 
          tabLabel: 'Change to ' + detectedCountryName, 
          instantApply: true, 
          tooltip: 'Changes the jurisdiction to ' + detectedCountryName + ' and updates the value to ' + suggestedFormatted + ' ' + (toCurrency || '') + ' based on PPP.',
          buttonAttrs: ' data-row-id="' + rowId + '" data-country="' + detectedCountry + '" data-converted-amount="' + (isNaN(pppSuggestionNum) ? '' : String(pppSuggestionNum)) + '"' 
        });
      } else if (event.type === 'S' || event.type === 'PP' || event.type === 'SI' || event.type === 'SI2' || event.type === 'SInp' || event.type === 'SI2np') {
        const countries = Config.getInstance().getAvailableCountries();
        const selectedCountry = (event.linkedCountry ? String(event.linkedCountry).toLowerCase() : '') || destCountry || originCountry || startCountry;
        const selectedCountryObj = countries.find(function (c) { return c.code.toLowerCase() === selectedCountry; });
        const selectedCountryName = selectedCountryObj ? selectedCountryObj.name : (selectedCountry ? selectedCountry.toUpperCase() : '');
        
        addAction(actions, {
          action: 'link',
          tabLabel: 'Link to ' + selectedCountryName,
          instantApply: true,
          tooltip: 'Links this income stream to ' + selectedCountryName + ' for source-country taxation. Amount stays unchanged.',
          buttonAttrs: ' data-row-id="' + rowId + '" data-country="' + selectedCountry + '"'
        });
      } else {
        const pppSuggestionNum = Number(this.calculatePPPSuggestion(event.amount, originCountry, destCountry));
        const fromRuleSet = Config.getInstance().getCachedTaxRuleSet(originCountry);
        const toRuleSet = Config.getInstance().getCachedTaxRuleSet(destCountry);
        const originCurrency = fromRuleSet ? fromRuleSet.getCurrencyCode() : 'EUR';
        const destCurrency = toRuleSet ? toRuleSet.getCurrencyCode() : 'EUR';
        const fromMeta = getSymbolAndLocaleByCountry(originCountry);
        const toMeta = getSymbolAndLocaleByCountry(destCountry);
        const currentAmountNum = Number(baseAmountSanitized);
        const currentFormatted = fmtWithSymbol(fromMeta.symbol, fromMeta.locale, currentAmountNum);
        const suggestedFormatted = !isNaN(pppSuggestionNum) ? fmtWithSymbol(toMeta.symbol, toMeta.locale, pppSuggestionNum) : '';
        const destCurrencyCode = destCurrency ? destCurrency.toUpperCase() : destCurrency;
        const destCountryLabel = (destCountry ? destCountry.toUpperCase() : '') || 'destination country';
        containerAttributes = ' data-from-country="' + originCountry + '" data-to-country="' + destCountry + '" data-from-currency="' + originCurrency + '" data-to-currency="' + destCurrency + '" data-base-amount="' + (isNaN(baseAmountSanitized) ? '' : String(baseAmountSanitized)) + '" data-fx="' + (fxRate != null ? fxRate : '') + '" data-fx-date="' + (fxDate || '') + '" data-ppp="' + (pppRatio != null ? pppRatio : '') + '" data-fx-amount="' + (fxAmount != null ? fxAmount : '') + '" data-ppp-amount="' + (pppAmount != null ? pppAmount : '') + '"';
        addAction(actions, { action: 'accept', tabLabel: 'Apply suggested amount', instantApply: true, tooltip: 'Updates the amount to ' + suggestedFormatted + ' (' + (destCurrencyCode || destCurrency) + ') so it reflects purchasing power in ' + destCountryLabel + '.', buttonAttrs: ' data-row-id="' + rowId + '" data-suggested-amount="' + (isNaN(pppSuggestionNum) ? '' : String(pppSuggestionNum)) + '" data-suggested-currency="' + destCurrency + '"' });
        addAction(actions, { action: 'peg', tabLabel: 'Keep as is', instantApply: true, tooltip: 'Keeps the current value (' + (currentFormatted || originCurrency) + ') in ' + originCurrency + '. No conversion will occur.', buttonAttrs: ' data-row-id="' + rowId + '" data-currency="' + originCurrency + '"' });
      }
      }
    } else if (event.relocationImpact.category === 'jurisdiction_change') {
      const fromCountry = impactDetails && impactDetails.fromCountry
        ? String(impactDetails.fromCountry).toLowerCase()
        : event.linkedCountry;
      const toCountry = impactDetails && impactDetails.toCountry
        ? String(impactDetails.toCountry).toLowerCase()
        : destCountry;
      const fromRuleSet = Config.getInstance().getCachedTaxRuleSet(fromCountry);
      const toRuleSet = Config.getInstance().getCachedTaxRuleSet(toCountry);
      const originCurrency = fromRuleSet ? fromRuleSet.getCurrencyCode() : 'EUR';
      const destCurrency = toRuleSet ? toRuleSet.getCurrencyCode() : 'EUR';
      const jurisdictionBaseAmount = !isNaN(baseAmountSanitized)
        ? baseAmountSanitized
        : parseAmountByCountry(event.amount, fromCountry);
      let convertedAmount = null;
      if (!isNaN(jurisdictionBaseAmount)) {
        const modelConverted = RelocationSplitSuggestionLib.getSuggestedAmount(jurisdictionBaseAmount, fromCountry, toCountry);
        if (!isNaN(modelConverted)) convertedAmount = modelConverted;
      }
      const fxRateForJurisdiction = econ && econ.ready ? econ.getFX(fromCountry, toCountry) : null;
      const pppForJurisdiction = econ && econ.ready ? econ.getPPP(fromCountry, toCountry) : null;
      const fxConvertedAmount = (fxRateForJurisdiction != null && !isNaN(jurisdictionBaseAmount))
        ? Math.round(jurisdictionBaseAmount * fxRateForJurisdiction)
        : null;
      const pppConvertedAmount = (pppForJurisdiction != null && !isNaN(jurisdictionBaseAmount))
        ? Math.round(jurisdictionBaseAmount * pppForJurisdiction)
        : null;
      if (convertedAmount == null) convertedAmount = fxConvertedAmount;

      containerAttributes = ' data-from-country="' + fromCountry + '" data-to-country="' + toCountry + '" data-from-currency="' + originCurrency + '" data-to-currency="' + destCurrency + '" data-base-amount="' + (isNaN(jurisdictionBaseAmount) ? '' : String(jurisdictionBaseAmount)) + '" data-fx="' + (fxRateForJurisdiction != null ? fxRateForJurisdiction : '') + '" data-fx-date="' + (fxDate || '') + '" data-ppp="' + (pppForJurisdiction != null ? pppForJurisdiction : '') + '" data-fx-amount="' + (fxConvertedAmount != null ? fxConvertedAmount : '') + '" data-ppp-amount="' + (pppConvertedAmount != null ? pppConvertedAmount : '') + '"';

      addAction(actions, {
        action: 'peg',
        tabLabel: 'Keep as ' + (originCurrency || 'origin currency'),
        instantApply: true,
        tooltip: 'Maintains ' + (originCurrency || 'original currency') + ' for this event, linked to ' + (fromCountry || 'original country') + '.',
        buttonAttrs: ' data-row-id="' + rowId + '" data-currency="' + originCurrency + '" data-country="' + fromCountry + '" data-from-country="' + fromCountry + '"'
      });
      if (canJoinWithPreviousSplitSegment) {
        addAction(actions, {
          action: 'join_previous',
          tabLabel: 'Join with previous',
          instantApply: true,
          tooltip: 'Rejoins this segment with the previous one while keeping later segments linked.',
          buttonAttrs: ' data-row-id="' + rowId + '"'
        });
      }
      addAction(actions, {
        action: 'peg',
        tabLabel: 'Change to ' + (destCurrency || 'new currency'),
        instantApply: true,
        tooltip: 'Changes currency to ' + (destCurrency || 'new currency') + ' and links to ' + (toCountry || 'new country') + '.',
        buttonAttrs: ' data-row-id="' + rowId + '" data-currency="' + destCurrency + '" data-country="' + toCountry + '" data-from-country="' + toCountry + '"' + (convertedAmount != null ? (' data-converted-amount="' + String(convertedAmount) + '"') : '')
      });
    } else if (event.relocationImpact.category === 'split_amount_shift' || event.relocationImpact.category === 'split_suggestion_shift') {
      let splitAmountDetails = event.relocationImpact.details;
      if (typeof splitAmountDetails === 'string') {
        try { splitAmountDetails = JSON.parse(splitAmountDetails); } catch (_) { splitAmountDetails = null; }
      }
      const suggestedAmount = splitAmountDetails && splitAmountDetails.suggestedAmount != null ? Number(splitAmountDetails.suggestedAmount) : NaN;
      const originCountryForSplit = splitAmountDetails && splitAmountDetails.originCountry
        ? String(splitAmountDetails.originCountry).toLowerCase()
        : originCountry;
      const destinationCountry = splitAmountDetails && splitAmountDetails.destinationCountry
        ? String(splitAmountDetails.destinationCountry).toLowerCase()
        : destCountry;
      const baseAmount = splitAmountDetails && splitAmountDetails.part1Amount != null ? Number(splitAmountDetails.part1Amount) : NaN;
      const fxForSplit = econ && econ.ready ? econ.getFX(originCountryForSplit, destinationCountry) : null;
      const pppForSplit = econ && econ.ready ? econ.getPPP(originCountryForSplit, destinationCountry) : null;
      const fxAmountForSplit = (fxForSplit != null && !isNaN(baseAmount)) ? Math.round(baseAmount * fxForSplit) : null;
      const pppAmountForSplit = (pppForSplit != null && !isNaN(baseAmount)) ? Math.round(baseAmount * pppForSplit) : null;
      const toRuleSet = Config.getInstance().getCachedTaxRuleSet(destinationCountry);
      const destCurrency = toRuleSet && toRuleSet.getCurrencyCode ? toRuleSet.getCurrencyCode() : '';
      containerAttributes = ' data-from-country="' + originCountryForSplit + '" data-to-country="' + destinationCountry + '" data-to-currency="' + destCurrency + '" data-base-amount="' + (isNaN(baseAmount) ? '' : String(baseAmount)) + '" data-fx="' + (fxForSplit != null ? fxForSplit : '') + '" data-fx-date="' + (fxDate || '') + '" data-ppp="' + (pppForSplit != null ? pppForSplit : '') + '" data-fx-amount="' + (fxAmountForSplit != null ? fxAmountForSplit : '') + '" data-ppp-amount="' + (pppAmountForSplit != null ? pppAmountForSplit : '') + '"';
      const toMeta = getSymbolAndLocaleByCountry(destinationCountry);
      const suggestedFormatted = !isNaN(suggestedAmount) ? fmtWithSymbol(toMeta.symbol, toMeta.locale, suggestedAmount) : '';
      const splitReason = splitAmountDetails && splitAmountDetails.reason ? String(splitAmountDetails.reason) : '';
      const updateTooltip = (splitReason === 'model')
        ? ('Updates Part 2 to ' + suggestedFormatted + ' ' + (destCurrency || '') + ' using the latest split-suggestion formula.')
        : ('Updates the Part 2 value to ' + suggestedFormatted + ' ' + (destCurrency || '') + ' based on current PPP data.');
      addAction(actions, {
        action: 'keep_split_value_as_is',
        tabLabel: 'Leave as is',
        instantApply: true,
        tooltip: 'Keep Part 2 at its current value.',
        buttonAttrs: ' data-row-id="' + rowId + '"'
      });
      addAction(actions, {
        action: 'update_split_value',
        tabLabel: 'Update value',
        instantApply: true,
        tooltip: updateTooltip,
        buttonAttrs: ' data-row-id="' + rowId + '" data-suggested-amount="' + (isNaN(suggestedAmount) ? '' : String(suggestedAmount)) + '"'
      });
    } else if (event.relocationImpact.category === 'split_relocation_shift') {
      let splitShiftDetails = event.relocationImpact.details;
      if (typeof splitShiftDetails === 'string') {
        try { splitShiftDetails = JSON.parse(splitShiftDetails); } catch (_) { splitShiftDetails = null; }
      }
      const relocationAgeFromDetails = splitShiftDetails && splitShiftDetails.relocationAge != null ? Number(splitShiftDetails.relocationAge) : NaN;
      const relocationAgeResolved = !isNaN(relocationAgeFromDetails) ? relocationAgeFromDetails : Number(relocationAge);
      const relocationAgeLabel = !isNaN(relocationAgeResolved) ? relocationAgeResolved : relocationAge;
      const expectedPart1ToAge = !isNaN(relocationAgeResolved) ? (relocationAgeResolved - 1) : '';
      addAction(actions, {
        action: 'adapt_split_to_move',
        tabLabel: 'Adapt split age',
        instantApply: true,
        tooltip: 'Updates Part 1 to end at age ' + expectedPart1ToAge + ' and Part 2 to start at age ' + relocationAgeLabel + '.',
        buttonAttrs: ' data-row-id="' + rowId + '"'
      });
      addAction(actions, {
        action: 'keep_split_as_is',
        tabLabel: 'Leave as is',
        instantApply: true,
        tooltip: 'Keep both halves at their current ages. The split remains linked and will be marked as reviewed.',
        buttonAttrs: ' data-row-id="' + rowId + '"'
      });
    } else if (event.relocationImpact.category === 'sale_relocation_shift') {
      let saleShiftDetails = event.relocationImpact.details;
      if (typeof saleShiftDetails === 'string') {
        try { saleShiftDetails = JSON.parse(saleShiftDetails); } catch (_) { saleShiftDetails = null; }
      }
      const relocationAgeFromDetails = saleShiftDetails && saleShiftDetails.relocationAge != null ? Number(saleShiftDetails.relocationAge) : NaN;
      const relocationAgeResolved = !isNaN(relocationAgeFromDetails) ? relocationAgeFromDetails : Number(relocationAge);
      const expectedToAge = !isNaN(relocationAgeResolved) ? (relocationAgeResolved - 1) : '';
      const currentToAge = saleShiftDetails && saleShiftDetails.currentToAge != null ? saleShiftDetails.currentToAge : event.toAge;
      addAction(actions, {
        action: 'adapt_sale_to_move',
        tabLabel: 'Adapt sale age',
        instantApply: true,
        tooltip: 'Aligns the sale with relocation by setting To Age to ' + expectedToAge + '.',
        buttonAttrs: ' data-row-id="' + rowId + '"'
      });
      addAction(actions, {
        action: 'keep_sale_as_is',
        tabLabel: 'Leave as is',
        instantApply: true,
        tooltip: 'Keep the current sale timing and mark this impact as reviewed.',
        buttonAttrs: ' data-row-id="' + rowId + '"'
      });
    } else if (event.relocationImpact.category === 'sale_marker_orphan') {
      let saleMarkerDetails = event.relocationImpact.details;
      if (typeof saleMarkerDetails === 'string') {
        try { saleMarkerDetails = JSON.parse(saleMarkerDetails); } catch (_) { saleMarkerDetails = null; }
      }
      addAction(actions, {
        action: 'keep_sale_timing',
        tabLabel: 'Keep current timing',
        instantApply: true,
        tooltip: 'Keep the current timing and detach this real-estate workflow from the deleted relocation.',
        buttonAttrs: ' data-row-id="' + rowId + '"'
      });
      if (saleMarkerDetails && saleMarkerDetails.canRestoreMortgagePlan) {
        addAction(actions, {
          action: 'restore_mortgage_plan',
          tabLabel: 'Restore mortgage plan',
          instantApply: true,
          tooltip: 'Restores the base mortgage timing and removes relocation-linked payoff rows when possible.',
          buttonAttrs: ' data-row-id="' + rowId + '"'
        });
      }
    } else if (event.relocationImpact.category === 'split_orphan') {
      let splitDetails = event.relocationImpact.details;
      if (typeof splitDetails === 'string') {
        try { splitDetails = JSON.parse(splitDetails); } catch (_) { splitDetails = null; }
      }
      const mergedFromAge = splitDetails && splitDetails.fromAge != null ? splitDetails.fromAge : event.fromAge;
      const mergedToAge = splitDetails && splitDetails.toAge != null ? splitDetails.toAge : event.toAge;
      const firstHalfAmount = splitDetails && splitDetails.amount != null ? splitDetails.amount : event.amount;
      const firstHalfCurrency = splitDetails && splitDetails.currency ? String(splitDetails.currency).toUpperCase() : (event.currency ? String(event.currency).toUpperCase() : '');
      const amountLabel = (firstHalfAmount != null && firstHalfAmount !== '') ? String(firstHalfAmount) + (firstHalfCurrency ? ' ' + firstHalfCurrency : '') : 'the first-half amount';
      addAction(actions, {
        action: 'join_split',
        tabLabel: 'Join halves',
        instantApply: true,
        tooltip: 'Restores a single event from age ' + mergedFromAge + ' to ' + mergedToAge + ' using ' + amountLabel + '.',
        buttonAttrs: ' data-row-id="' + rowId + '"'
      });
    }

    if (!actions.length) return content;
    const impactCause = (event.relocationImpact.message || '').trim() || 'Relocation impact detected for this event.';
    const instantButtonsHtml = actions.map(function (ac) {
      const attrs = (ac.buttonAttrs || '') + (eventId ? ' data-event-id="' + eventId + '"' : '');
      const tooltipAttr = ac.tooltip ? ' data-tooltip="' + String(ac.tooltip).replace(/"/g, '&quot;') + '"' : '';
      return '<button type="button" class="resolution-tab resolution-instant-btn" id="' + ac.tabId + '" data-action="' + ac.action + '"' + attrs + tooltipAttr + '>' + ac.tabLabel + '</button>';
    }).join('');
    
    let bodyContent = '<div class="resolution-tab-strip" role="tablist" aria-label="Resolution actions" aria-orientation="horizontal">' + instantButtonsHtml + '</div>';
    content = '<div class="resolution-panel-expander"><div class="resolution-panel-container"' + containerAttributes + '><div class="resolution-panel-header"><h4>' + impactCause + '</h4><button class="panel-close-btn">×</button></div><div class="resolution-panel-body">' + bodyContent + '</div></div></div>';
    return content;
  },

  handlePanelAction: function (event, action, payload, env) {
    if (!env || !env.eventsTableManager) return;
    const etm = env.eventsTableManager;
    const rowId = payload && payload.rowId;
    const eventId = payload && payload.eventId;
    switch (action) {
      case 'delete': {
        const row = document.querySelector('tr[data-row-id="' + rowId + '"]');
        if (row && typeof etm.deleteTableRowWithAnimation === 'function') {
          etm.deleteTableRowWithAnimation(row);
          setTimeout(() => { if (typeof etm.recomputeRelocationImpacts === 'function') etm.recomputeRelocationImpacts(); }, 600);
        }
        break;
      }
      case 'mark_reviewed': {
        if (typeof etm.markAsReviewed === 'function') etm.markAsReviewed(rowId, eventId);
        break;
      }
      case 'split': {
        const override = payload && payload.part2Amount;
        if (typeof etm.splitEventAtRelocation === 'function') etm.splitEventAtRelocation(rowId, override, eventId);
        break;
      }
      case 'cut_short': {
        if (typeof etm.cutShortEventAtRelocation === 'function') etm.cutShortEventAtRelocation(rowId, eventId);
        break;
      }
      case 'peg': {
        const currency = payload && payload.currency;
        const linkedCountry = payload && (payload.country || payload.fromCountry);
        const convertedAmount = payload && payload.convertedAmount;
        if (typeof etm.pegCurrencyToOriginal === 'function') etm.pegCurrencyToOriginal(rowId, currency, linkedCountry, eventId, convertedAmount);
        break;
      }
      case 'accept': {
        const amount = payload && payload.suggestedAmount;
        const currency = payload && payload.suggestedCurrency;
        if (typeof etm.acceptSuggestion === 'function') etm.acceptSuggestion(rowId, amount, currency, eventId);
        break;
      }
      case 'link': {
        const country = payload && payload.country;
        const convertedAmount = payload && payload.convertedAmount;
        if (event && (event.type === 'S' || event.type === 'PP' || event.type === 'SI' || event.type === 'SI2' || event.type === 'SInp' || event.type === 'SI2np')) {
          if (typeof etm.linkIncomeToCountry === 'function') etm.linkIncomeToCountry(rowId, country, eventId);
        } else {
          if (typeof etm.linkPropertyToCountry === 'function') etm.linkPropertyToCountry(rowId, country, convertedAmount, eventId);
        }
        break;
      }
      case 'convert': {
        if (typeof etm.convertToPensionless === 'function') etm.convertToPensionless(rowId, eventId);
        break;
      }
      case 'join_split': {
        if (typeof etm.joinSplitEvents === 'function') etm.joinSplitEvents(rowId, eventId);
        break;
      }
      case 'join_previous': {
        if (typeof etm.joinSplitWithPrevious === 'function') etm.joinSplitWithPrevious(rowId, eventId);
        break;
      }
      case 'adapt_split_to_move': {
        if (typeof etm.adaptSplitToRelocationAge === 'function') etm.adaptSplitToRelocationAge(rowId, eventId);
        break;
      }
      case 'keep_split_as_is': {
        if (typeof etm.keepSplitAsIs === 'function') etm.keepSplitAsIs(rowId, eventId);
        break;
      }
      case 'keep_split_value_as_is': {
        if (typeof etm.keepSplitValueAsIs === 'function') etm.keepSplitValueAsIs(rowId, eventId);
        break;
      }
      case 'update_split_value': {
        const amount = payload && payload.suggestedAmount;
        if (typeof etm.updateSplitValue === 'function') etm.updateSplitValue(rowId, amount, eventId);
        break;
      }
      case 'adapt_sale_to_move': {
        if (typeof etm.adaptSaleToRelocationAge === 'function') etm.adaptSaleToRelocationAge(rowId, eventId);
        break;
      }
      case 'keep_sale_as_is': {
        if (typeof etm.keepSaleAsIs === 'function') etm.keepSaleAsIs(rowId, eventId);
        break;
      }
      case 'keep_sale_timing': {
        if (typeof etm.keepSaleTimingAfterDeletedRelocation === 'function') etm.keepSaleTimingAfterDeletedRelocation(rowId, eventId);
        break;
      }
      case 'restore_mortgage_plan': {
        if (typeof etm.restoreMortgagePlanAfterDeletedRelocation === 'function') etm.restoreMortgagePlanAfterDeletedRelocation(rowId, eventId);
        break;
      }
      case 'keep_property': {
        try { this._keepProperty(event, payload, env); } catch (_) { }
        break;
      }
      case 'keep_renting': {
        try { this._keepRenting(event, payload, env); } catch (_) { }
        break;
      }
      case 'rent_out': {
        try { this._rentOutProperty(event, payload, env); } catch (_) { }
        break;
      }
      case 'sell_property': {
        try { this._sellProperty(event, payload, env); } catch (_) { }
        break;
      }
      default:
        break;
    }
  },

  calculatePPPSuggestion: function (amount, fromCountry, toCountry) {
    return RelocationSplitSuggestionLib.getSuggestedAmount(amount, fromCountry, toCountry);
  },

  // Internal helpers
  attachSplitTooltip: function (rootEl) {
    try {
      const container = (rootEl.closest && rootEl.closest('.resolution-panel-container')) || (rootEl.querySelector && rootEl.querySelector('.resolution-panel-container')) || rootEl;
      if (!container) return;
      const input = container.querySelector('.part2-amount-input');
      if (!input || typeof TooltipUtils === 'undefined' || !TooltipUtils.attachTooltip) return;
      function getSymbolAndLocale(countryCode) {
        try {
          const rs = Config.getInstance().getCachedTaxRuleSet(countryCode);
          const ls = (typeof FormatUtils !== 'undefined' && typeof FormatUtils.getLocaleSettings === 'function') ? FormatUtils.getLocaleSettings() : { numberLocale: 'en-US', currencySymbol: '' };
          return { symbol: rs && rs.getCurrencySymbol ? rs.getCurrencySymbol() : (ls.currencySymbol || ''), locale: rs && rs.getNumberLocale ? rs.getNumberLocale() : (ls.numberLocale || 'en-US') };
        } catch (_) { const ls = (typeof FormatUtils !== 'undefined' && typeof FormatUtils.getLocaleSettings === 'function') ? FormatUtils.getLocaleSettings() : { numberLocale: 'en-US', currencySymbol: '' }; return { symbol: ls.currencySymbol || '', locale: ls.numberLocale || 'en-US' }; }
      }
      function fmtWithSymbol(symbol, locale, value) {
        if (value == null || value === '' || isNaN(Number(value))) return '';
        const num = Number(value);
        try { const formatted = new Intl.NumberFormat(locale || 'en-US', { style: 'decimal', maximumFractionDigits: 0 }).format(num); return (symbol || '') + formatted; } catch (_) { return (symbol || '') + String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
      }
      const provider = function () {
        const baseAmt = container.getAttribute('data-base-amount');
        const fromCountry = container.getAttribute('data-from-country');
        const toCountry = container.getAttribute('data-to-country');
        const toMeta = getSymbolAndLocale(toCountry);
        const fromMeta = getSymbolAndLocale(fromCountry);
        const fxAmtStr = container.getAttribute('data-fx-amount');
        const pppAmtStr = container.getAttribute('data-ppp-amount');
        const fxDate = container.getAttribute('data-fx-date');
        const toCur = container.getAttribute('data-to-currency') || '';
        const fxAmt = fmtWithSymbol(toMeta.symbol, toMeta.locale, fxAmtStr);
        const pppAmt = fmtWithSymbol(toMeta.symbol, toMeta.locale, pppAmtStr);
        const amtBase = fmtWithSymbol(fromMeta.symbol, fromMeta.locale, baseAmt);
        const fxD = fxDate ? new Date(fxDate).toISOString().substring(0, 10) : 'latest';
        try {
          const cfg = Config.getInstance();
          const econ = cfg && cfg.getEconomicData ? cfg.getEconomicData() : null;
          const fromEntry = econ && econ.data ? econ.data[String(fromCountry).toUpperCase()] : null;
          const toEntry = econ && econ.data ? econ.data[String(toCountry).toUpperCase()] : null;
          const projectionWindow = (fromEntry && fromEntry.projectionWindowYears) || (toEntry && toEntry.projectionWindowYears) || 5;
          const hasFxSeries = (fromEntry && fromEntry.series && fromEntry.series.fx) || (toEntry && toEntry.series && toEntry.series.fx);
          const hasPppSeries = (fromEntry && fromEntry.series && fromEntry.series.ppp) || (toEntry && toEntry.series && toEntry.series.ppp);
          let details = '';
          if (hasFxSeries || hasPppSeries) {
            details = '\n\nConversion details:\n';
            if (hasFxSeries) {
              details += '• FX uses year-specific rates (step function). Falls back to base FX (' + fxD + ') when year data unavailable.\n';
            } else {
              details += '• FX uses base rate (' + fxD + ') as no year-specific series available.\n';
            }
            if (hasPppSeries) {
              details += '• PPP uses year-specific values when available, otherwise extrapolates from base PPP using CPI differentials.\n';
            } else {
              details += '• PPP uses base value adjusted by CPI differentials.\n';
            }
            details += '• Forward projections beyond available data use a ' + projectionWindow + '-year weighted average.';
          }
          return amtBase + ' in ' + toCur + ' is ' + fxAmt + ' as of ' + fxD + '.\nAdjusting for purchasing power it\'s ≈ ' + pppAmt + '.' + details;
        } catch (_) {
          return amtBase + ' in ' + toCur + ' is ' + fxAmt + ' as of ' + fxD + '.\nAdjusting for purchasing power it\'s ≈ ' + pppAmt + '.';
        }
      };
      TooltipUtils.attachTooltip(input, provider, { hoverDelay: 300, touchDelay: 400, showOnFocus: true, persistWhileFocused: true, hideOnWizard: true });
    } catch (_) { }
  },

  _animateOpen: function (expanderContainer) {
    if (!expanderContainer) return;
    const expander = (expanderContainer.classList && expanderContainer.classList.contains('resolution-panel-expander')) ? expanderContainer : (expanderContainer.querySelector && expanderContainer.querySelector('.resolution-panel-expander'));
    const containerEl = (expanderContainer.querySelector && expanderContainer.querySelector('.resolution-panel-container')) || (expanderContainer.classList && expanderContainer.classList.contains('resolution-panel-container') ? expanderContainer : null);
    if (expander) {
      expander.style.height = '0px'; expander.style.overflow = 'hidden';
      if (containerEl) { try { containerEl.classList.add('panel-anim'); } catch (_) { } }
      requestAnimationFrame(function () {
        const fullHeight = expander.scrollHeight;
        if (containerEl) { try { containerEl.classList.add('visible'); } catch (_) { } }
        expander.style.height = fullHeight + 'px';
        const onOpened = function (e) {
          if (e.target !== expander) return;
          expander.style.height = 'auto';
          // Trigger resize to ensure parent containers adapt to growing height
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('resize', { detail: { skipScroll: true } }));
          expander.removeEventListener('transitionend', onOpened);
        };
        expander.addEventListener('transitionend', onOpened);
      });
    } else if (containerEl) {
      try { containerEl.classList.add('visible'); } catch (_) { }
    }
  },

  _bindPanelInteractions: function (root, ctx) {
    if (!root) return;
    const closeBtn = root.querySelector('.panel-close-btn');
    if (closeBtn) {
      const self = this;
      closeBtn.addEventListener('click', function () {
        if (ctx.context === 'table') self.collapsePanelForTableRow(document.querySelector('tr[data-row-id="' + ctx.rowId + '"]'));
        else if (ctx.context === 'accordion') self._collapseAccordionPanel(ctx.accordionItem);
      });
    }
    const interactionRoot = (root.closest && root.closest('.resolution-panel-container')) || root;
    const self = this;

    // Handle country selector changes for link action to update conversion preview
    const linkCountrySelector = interactionRoot.querySelector('.link-country-selector');
    if (linkCountrySelector) {
      linkCountrySelector.addEventListener('change', function () {
        const fromCountry = linkCountrySelector.getAttribute('data-from-country');
        const toCountry = linkCountrySelector.value;
        const baseAmount = linkCountrySelector.getAttribute('data-base-amount');
        if (!fromCountry || !toCountry || !baseAmount) return;
        const pppSuggestion = self.calculatePPPSuggestion(baseAmount, fromCountry, toCountry);
        function getSymbolAndLocale(countryCode) {
          try {
            const rs = Config.getInstance().getCachedTaxRuleSet(countryCode);
            const ls = (typeof FormatUtils !== 'undefined' && typeof FormatUtils.getLocaleSettings === 'function') ? FormatUtils.getLocaleSettings() : { numberLocale: 'en-US', currencySymbol: '' };
            return { symbol: rs && rs.getCurrencySymbol ? rs.getCurrencySymbol() : (ls.currencySymbol || ''), locale: rs && rs.getNumberLocale ? rs.getNumberLocale() : (ls.numberLocale || 'en-US') };
          } catch (_) { const ls = (typeof FormatUtils !== 'undefined' && typeof FormatUtils.getLocaleSettings === 'function') ? FormatUtils.getLocaleSettings() : { numberLocale: 'en-US', currencySymbol: '' }; return { symbol: ls.currencySymbol || '', locale: ls.numberLocale || 'en-US' }; }
        }
        function fmtWithSymbol(symbol, locale, value) {
          if (value == null || value === '' || isNaN(Number(value))) return '';
          const num = Number(value);
          try { const formatted = new Intl.NumberFormat(locale || 'en-US', { style: 'decimal', maximumFractionDigits: 0 }).format(num); return (symbol || '') + formatted; } catch (_) { return (symbol || '') + String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
        }
        const toMeta = getSymbolAndLocale(toCountry);
        const suggestedFormatted = !isNaN(pppSuggestion) ? fmtWithSymbol(toMeta.symbol, toMeta.locale, pppSuggestion) : '';
        const amountInput = interactionRoot.querySelector('.link-amount-input');
        if (amountInput) amountInput.value = suggestedFormatted;

        const currencyLabel = interactionRoot.querySelector('.link-to-currency-label');
        if (currencyLabel) {
          const rs = Config.getInstance().getCachedTaxRuleSet(toCountry);
          const toCurrency = rs && rs.getCurrencyCode ? rs.getCurrencyCode() : 'EUR';
          currencyLabel.textContent = '(' + (toCurrency || '') + ')';
        }
      });
    }

    interactionRoot.addEventListener('click', function (e) {
      const instantBtn = e.target && e.target.closest && e.target.closest('.resolution-instant-btn');
      if (instantBtn) {
        e.preventDefault(); e.stopPropagation();
        const action = instantBtn.getAttribute('data-action');
        const panelContainer = (interactionRoot.classList && interactionRoot.classList.contains('resolution-panel-container'))
          ? interactionRoot
          : (interactionRoot.querySelector && interactionRoot.querySelector('.resolution-panel-container'));
        const payload = {
          rowId: (instantBtn.getAttribute('data-row-id') || (ctx && ctx.rowId)),
          eventId: (instantBtn.getAttribute('data-event-id') || (ctx && ctx.eventId)),
          currency: instantBtn.getAttribute('data-currency'),
          suggestedAmount: instantBtn.getAttribute('data-suggested-amount'),
          suggestedCurrency: instantBtn.getAttribute('data-suggested-currency'),
          part2Amount: instantBtn.getAttribute('data-part2-amount'),
          country: instantBtn.getAttribute('data-country'),
          convertedAmount: instantBtn.getAttribute('data-converted-amount'),
          fromCountry: panelContainer ? panelContainer.getAttribute('data-from-country') : null,
          toCountry: panelContainer ? panelContainer.getAttribute('data-to-country') : null
        };
        self.handlePanelAction(ctx.event, action, payload, ctx.env);
        return;
      }
    });
    
    if (typeof TooltipUtils !== 'undefined' && TooltipUtils.attachTooltip) {
      const instantBtns = interactionRoot.querySelectorAll('.resolution-instant-btn[data-tooltip]');
      instantBtns.forEach(function (btn) {
        const tooltip = btn.getAttribute('data-tooltip');
        if (tooltip) TooltipUtils.attachTooltip(btn, tooltip, { hoverDelay: 300, touchDelay: 400 });
      });
    }
  },

  _setupCollapseTriggers: function (opts) {
    if (!opts || !opts.anchorEl) return;
    const anchor = opts.anchorEl;
    const self = this;
    if (opts.context === 'accordion') {
      const escHandlerAccordion = function (e) { if (e && e.key === 'Escape') { self._collapseAccordionPanel(anchor); } };
      document.addEventListener('keydown', escHandlerAccordion);
      anchor._panelEscHandler = escHandlerAccordion;
      return;
    }
    const clickOutsideHandler = function (e) {
      try {
        if (opts.context === 'table') {
          const row = anchor.previousElementSibling;
          if (row && !anchor.contains(e.target) && !row.contains(e.target)) { self.collapsePanelForTableRow(row); }
        }
      } catch (_) { }
    };
    document.addEventListener('click', clickOutsideHandler);
    anchor._panelClickOutsideHandler = clickOutsideHandler;
    const escHandler = function (e) { if (e && e.key === 'Escape') { if (opts.context === 'table') { const row = anchor.previousElementSibling; if (row) self.collapsePanelForTableRow(row); } else if (opts.context === 'accordion') { self._collapseAccordionPanel(anchor); } } };
    document.addEventListener('keydown', escHandler);
    anchor._panelEscHandler = escHandler;
  },

  _teardownCollapseTriggers: function (anchor) {
    if (!anchor) return;
    try { if (anchor._panelClickOutsideHandler) { document.removeEventListener('click', anchor._panelClickOutsideHandler); anchor._panelClickOutsideHandler = null; } } catch (_) { }
    try { if (anchor._panelEscHandler) { document.removeEventListener('keydown', anchor._panelEscHandler); anchor._panelEscHandler = null; } } catch (_) { }
  },

  _collapseAccordionPanel: function (item) {
    if (!item) return;
    const expander = item.querySelector('.resolution-panel-expander');
    const container = item.querySelector('.resolution-panel-container');
    if (!expander && !container) return;
    if (container) { try { container.classList.remove('visible'); } catch (_) { } }
    if (expander) {
      const current = expander.scrollHeight; expander.style.height = current + 'px';
      // eslint-disable-next-line no-unused-expressions
      expander.offsetHeight; requestAnimationFrame(function () { expander.style.height = '0px'; });
      const onClosed = function (e) {
        if (e.target !== expander) return;
        expander.removeEventListener('transitionend', onClosed);
        const wrapperToRemove = expander;
        if (wrapperToRemove && wrapperToRemove.parentNode) { wrapperToRemove.remove(); }
        // Trigger resize after panel removal
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('resize', { detail: { skipScroll: true } }));
      };
      expander.addEventListener('transitionend', onClosed);
    } else if (container) {
      setTimeout(function () {
        if (container.parentNode) container.parentNode.remove();
        // Trigger resize after panel removal
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('resize', { detail: { skipScroll: true } }));
      }, 300);
    }
    this._teardownCollapseTriggers(item);
  },

  // Property helpers (used by keep/sell actions)
  _keepRenting: function (event, payload, env) {
    var etm = env && env.eventsTableManager ? env.eventsTableManager : null;
    if (!etm) return;
    var rowId = payload && payload.rowId;
    var eventId = payload && payload.eventId;
    var row = null;
    if (typeof etm._findEventRow === 'function') row = etm._findEventRow(rowId, eventId);
    if (!row && rowId) row = document.querySelector('tr[data-row-id="' + rowId + '"]');
    if (!row) return;
    if (typeof etm._removeHiddenInput === 'function') etm._removeHiddenInput(row, 'event-relocation-rent-mv-id');
    if (typeof etm._afterResolutionAction === 'function') etm._afterResolutionAction(rowId, { pulse: true });
  },

  _keepProperty: function (event, payload, env) {
    var webUI = env && env.webUI ? env.webUI : null;
    var etm = env && env.eventsTableManager ? env.eventsTableManager : null;
    if (!webUI || !etm) return;

    var rowId = payload && payload.rowId;
    var eventId = payload && payload.eventId;
    var baseRow = null;
    if (typeof etm._findEventRow === 'function') baseRow = etm._findEventRow(rowId, eventId);
    if (!baseRow && rowId) baseRow = document.querySelector('tr[data-row-id="' + rowId + '"]');
    if (!baseRow) return;
    var resolutionScope = (typeof etm._getResolutionScopeForRow === 'function') ? etm._getResolutionScopeForRow(baseRow) : null;

    var startCountry = Config.getInstance().getStartCountry();
    var origin = typeof etm.detectPropertyCountry === 'function' ? etm.detectPropertyCountry(Number(event.fromAge), startCountry) : startCountry;
    var rs = Config.getInstance().getCachedTaxRuleSet(origin);
    var originCurrency = rs && typeof rs.getCurrencyCode === 'function' ? rs.getCurrencyCode() : null;

    // Decoupled: only apply to the target row (keep property OR keep debt)
    if (typeof etm._removeHiddenInput === 'function') etm._removeHiddenInput(baseRow, 'event-relocation-sell-mv-id');
    if (typeof etm._removeHiddenInput === 'function') etm._removeHiddenInput(baseRow, 'event-relocation-sell-anchor-age');
    etm.getOrCreateHiddenInput(baseRow, 'event-linked-country', origin);
    if (originCurrency) etm.getOrCreateHiddenInput(baseRow, 'event-currency', originCurrency);
    if (resolutionScope && typeof etm._setResolutionOverride === 'function') etm._setResolutionOverride(baseRow, resolutionScope);

    if (etm && typeof etm._afterResolutionAction === 'function') {
      etm._afterResolutionAction(rowId);
    }
  },

  _sellProperty: function (event, payload, env) {
    var webUI = env && env.webUI ? env.webUI : null;
    var etm = env && env.eventsTableManager ? env.eventsTableManager : null;
    if (!webUI || !etm) return;

    var events = webUI.readEvents(false) || [];
    var mvImpactId = event.relocationImpact && event.relocationImpact.mvEventId;
    var mv = events.find(function (e) { return e && (e.id === mvImpactId || e._mvRuntimeId === mvImpactId); });
    if (!mv) return;

    var sellMarkerId = '';
    if (typeof etm._getRelocationLinkIdByImpactId === 'function') {
      sellMarkerId = String(etm._getRelocationLinkIdByImpactId(mvImpactId) || '');
    }
    if (!sellMarkerId && mvImpactId) sellMarkerId = String(mvImpactId);

    var relocationAge = Number(mv.fromAge);
    var cutoffAge = relocationAge - 1;
    var rowId = payload && payload.rowId;
    var eventId = payload && payload.eventId;
    var baseRow = null;
    if (typeof etm._findEventRow === 'function') baseRow = etm._findEventRow(rowId, eventId);
    if (!baseRow && rowId) baseRow = document.querySelector('tr[data-row-id="' + rowId + '"]');
    if (!baseRow) return;

    function setToAgeGuarded(row, age) {
      var toAgeInput = row.querySelector('.event-to-age');
      if (!toAgeInput) return;
      var existing = Number(toAgeInput.value);
      if (isNaN(existing) || existing > age) {
        toAgeInput.value = String(age);
        toAgeInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    var previousSuppress = etm._suppressSellMarkerClear;
    etm._suppressSellMarkerClear = true;

    // Decoupled logic:
    // If it's a property sale (R), we usually want to clear the mortgage too.
    // If it's a mortgage payoff (M), we only want to clear the debt.
    if (event.type === 'R' && typeof etm._applyToRealEstatePair === 'function') {
      etm._applyToRealEstatePair(baseRow, function (row) {
        if (sellMarkerId) etm.getOrCreateHiddenInput(row, 'event-relocation-sell-mv-id', sellMarkerId);
        etm.getOrCreateHiddenInput(row, 'event-relocation-sell-anchor-age', String(relocationAge));
        setToAgeGuarded(row, cutoffAge);
      });
    } else {
      // Single row action (e.g. Mortgage Pay Off only)
      if (sellMarkerId) etm.getOrCreateHiddenInput(baseRow, 'event-relocation-sell-mv-id', sellMarkerId);
      etm.getOrCreateHiddenInput(baseRow, 'event-relocation-sell-anchor-age', String(relocationAge));
      setToAgeGuarded(baseRow, cutoffAge);
    }

    etm._suppressSellMarkerClear = previousSuppress;
    if (event.type === 'M' && typeof etm.ensureMortgagePayoffEvent === 'function') {
      etm.ensureMortgagePayoffEvent(rowId, eventId);
    }
    if (etm && typeof etm._afterResolutionAction === 'function') {
      etm._afterResolutionAction(rowId, { flashFields: ['.event-to-age'] });
    }
  },

  _rentOutProperty: function (event, payload, env) {
    var webUI = env && env.webUI ? env.webUI : null;
    var etm = env && env.eventsTableManager ? env.eventsTableManager : null;
    if (!webUI || !etm) return;

    this._keepProperty(event, payload, env);

    var events = webUI.readEvents(false) || [];
    var mvImpactId = event.relocationImpact && event.relocationImpact.mvEventId;
    var rentMarkerId = '';
    if (typeof etm._getRelocationLinkIdByImpactId === 'function') {
      rentMarkerId = String(etm._getRelocationLinkIdByImpactId(mvImpactId) || '');
    }
    if (!rentMarkerId && mvImpactId) rentMarkerId = String(mvImpactId);
    var mv = events.find(function (e) { return e && (e.id === mvImpactId || e._mvRuntimeId === mvImpactId); });
    var relocationAge = mv ? mv.fromAge : null;

    var amount = '';
    if (relocationAge && typeof etm.addEventFromWizardWithSorting === 'function') {
      try {
        var startCountry = Config.getInstance().getStartCountry();
        var origin = typeof etm.detectPropertyCountry === 'function' ? etm.detectPropertyCountry(Number(event.fromAge), startCountry) : startCountry;
        var dest = mv ? String(mv.name || '').trim().toLowerCase() : startCountry;
        
        // Estimate rental income based on property value and yield
        var propertyValue = (function (a) { var s = (a == null) ? '' : String(a); s = s.replace(/[^0-9.\-]/g, ''); var n = Number(s); return isNaN(n) ? Number(a) : n; })(event.amount);
        if (!isNaN(propertyValue) && propertyValue > 0) {
          var yieldRate = 0.04; // Default 4%
          var originRuleSet = Config.getInstance().getCachedTaxRuleSet(origin);
          var econ = originRuleSet ? originRuleSet.getEconomicData() : null;
          if (econ && typeof econ.typicalRentalYield === 'number') {
            yieldRate = econ.typicalRentalYield / 100;
          }
          var estimatedRentOrigin = Math.round(propertyValue * yieldRate);
          var originCurrency = originRuleSet ? originRuleSet.getCurrencyCode() : 'EUR';
          amount = (typeof FormatUtils !== 'undefined' && typeof FormatUtils.formatCurrency === 'function')
            ? FormatUtils.formatCurrency(estimatedRentOrigin, originCurrency, origin)
            : String(estimatedRentOrigin);
        }
      } catch (_) { }

      etm.addEventFromWizardWithSorting({
        eventType: 'RI',
        name: event.name || event.id,
        amount: amount,
        fromAge: relocationAge,
        toAge: event.toAge,
        relocationReviewed: true,
        relocationImpact: event.relocationImpact,
        relocationRentMvId: rentMarkerId,
        linkedCountry: origin,
        currency: originCurrency
      });
    }

    // No need for separate refresh here as _keepProperty (now using _afterResolutionAction) or addEventFromWizardWithSorting will handle it
  }
};

this.RelocationImpactAssistant = RelocationImpactAssistant;
