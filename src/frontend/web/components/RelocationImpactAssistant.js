/* RelocationImpactAssistant centralizes inline resolution panel rendering and actions for both table and accordion views. The legacy relocation modal has been removed. */

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
    const impactCategory = event && event.relocationImpact ? event.relocationImpact.category : '';
    const mvEventId = event && event.relocationImpact ? event.relocationImpact.mvEventId : null;
    let mvEvent = events.find(function (e) {
      return e && (e.id === mvEventId || e._mvRuntimeId === mvEventId);
    });
    if (!mvEvent && mvEventId) {
      // Fallback: find mvEvent from DOM by looking for the row with matching event name/id
      try {
        const nameInputs = document.querySelectorAll('#Events tbody tr .event-name');
        for (let i = 0; i < nameInputs.length; i++) {
          const nameInput = nameInputs[i];
          if (nameInput.value === mvEventId) {
            const mvRow = nameInput.closest('tr');
            if (mvRow) {
              const typeInput = mvRow.querySelector('.event-type');
              const fromAgeInput = mvRow.querySelector('.event-from-age');
              if (typeInput && typeInput.value && typeInput.value.startsWith('MV-')) {
                mvEvent = {
                  id: mvEventId,
                  type: typeInput.value,
                  fromAge: fromAgeInput ? fromAgeInput.value : null
                };
                break;
              }
            }
          }
        }
      } catch (e) {
        // Fallback failed, continue with null mvEvent
      }
    }
    const startCountry = Config.getInstance().getStartCountry();
    if (!mvEvent && impactCategory !== 'split_orphan' && impactCategory !== 'split_relocation_shift' && impactCategory !== 'sale_relocation_shift') return '';
    const destCountry = mvEvent ? mvEvent.type.substring(3).toLowerCase() : startCountry;
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

    const addAction = function (arr, cfg) { if (!cfg || !cfg.action) return; cfg.tabId = 'resolution-tab-' + rowId + '-' + cfg.action; cfg.detailId = 'resolution-detail-' + rowId + '-' + cfg.action; arr.push(cfg); };
    const actions = [];
    let containerAttributes = '';

    if (event.relocationImpact.category === 'boundary') {
      if (event.type === 'R' || event.type === 'M') {
        const fromRuleSet = Config.getInstance().getCachedTaxRuleSet(originCountry);
        const originCurrency = fromRuleSet ? fromRuleSet.getCurrencyCode() : 'EUR';
        const originCountryCode = originCountry ? originCountry.toUpperCase() : '';
        addAction(actions, { action: 'keep_property', tabLabel: 'Keep Property', buttonLabel: 'Apply', buttonClass: 'event-wizard-button event-wizard-button-secondary resolution-apply', buttonAttrs: ' data-row-id="' + rowId + '"', bodyHtml: '<div class="resolution-quick-action"><p class="micro-note">Keep the property and associated mortgage. We will link both to ' + originCountryCode + ' and keep values in ' + originCurrency + '.</p></div>' });
        addAction(actions, { action: 'rent_out', tabLabel: 'Rent Out', buttonLabel: 'Apply', buttonClass: 'event-wizard-button event-wizard-button-secondary resolution-apply', buttonAttrs: ' data-row-id="' + rowId + '"', bodyHtml: '<div class="resolution-quick-action"><p class="micro-note">Keep the property and start renting it out. We will create a Rental Income event starting at the relocation age.</p></div>' });
        addAction(actions, { action: 'sell_property', tabLabel: 'Sell Property', buttonLabel: 'Apply', buttonClass: 'event-wizard-button resolution-apply', buttonAttrs: ' data-row-id="' + rowId + '"', bodyHtml: '<div class="resolution-quick-action"><p class="micro-note">Sell the property at the relocation boundary and stop the associated mortgage payments from that age.</p></div>' });
      } else {
        const pppSuggestionNum = Number(this.calculatePPPSuggestion(event.amount, originCountry, destCountry));
        const fromRuleSet = Config.getInstance().getCachedTaxRuleSet(originCountry);
        const toRuleSet = Config.getInstance().getCachedTaxRuleSet(destCountry);
        const originCurrency = fromRuleSet ? fromRuleSet.getCurrencyCode() : 'EUR';
        const destCurrency = toRuleSet ? toRuleSet.getCurrencyCode() : 'EUR';
        const isIncomeOrExpenseType = ['S', 'PP', 'SI', 'SI2', 'SInp', 'SI2np', 'UI', 'RI', 'DBI', 'FI', 'E'].indexOf(event.type) !== -1;
        const relocationAgeNum = Number(relocationAge);
        const cutShortToAge = isNaN(relocationAgeNum) ? relocationAge : (relocationAgeNum - 1);
        const fromMeta = getSymbolAndLocaleByCountry(originCountry);
        const toMeta = getSymbolAndLocaleByCountry(destCountry);
        const destCurrencyCode = destCurrency ? destCurrency.toUpperCase() : destCurrency;
        const part1AmountFormatted = fmtWithSymbol(fromMeta.symbol, fromMeta.locale, baseAmountSanitized);
        const inputFormatted = !isNaN(pppSuggestionNum) ? fmtWithSymbol(toMeta.symbol, toMeta.locale, pppSuggestionNum) : '';
        containerAttributes = ' data-from-country="' + originCountry + '" data-to-country="' + destCountry + '" data-from-currency="' + originCurrency + '" data-to-currency="' + destCurrency + '" data-base-amount="' + (isNaN(baseAmountSanitized) ? '' : String(baseAmountSanitized)) + '" data-fx="' + (fxRate != null ? fxRate : '') + '" data-fx-date="' + (fxDate || '') + '" data-ppp="' + (pppRatio != null ? pppRatio : '') + '" data-fx-amount="' + (fxAmount != null ? fxAmount : '') + '" data-ppp-amount="' + (pppAmount != null ? pppAmount : '') + '"';
        addAction(actions, { action: 'split', tabLabel: 'Split Event', buttonLabel: 'Apply', buttonClass: 'event-wizard-button resolution-apply', buttonAttrs: ' data-row-id="' + rowId + '"', bodyHtml: '<div class="split-preview-inline compact"><div class="split-parts-container"><div class="split-part-info"><div class="part-label">Part 1: Age ' + event.fromAge + '-' + cutShortToAge + '</div><div class="part-detail">' + part1AmountFormatted + ' (read-only)</div></div><div class="split-part-info"><div class="part-label">Part 2: Age ' + relocationAge + '-' + event.toAge + '</div><div class="part-detail"><input type="text" class="part2-amount-input" value="' + inputFormatted + '" placeholder="Amount">' + destCurrency + '</div><div class="ppp-hint">PPP suggestion</div></div></div><p class="micro-note">Apply creates a new event starting at age ' + relocationAge + ' in ' + (destCurrencyCode || destCurrency) + '. Adjust the Part 2 amount to what the move will cost in the destination currency.</p></div>' });
        if (isIncomeOrExpenseType) {
          addAction(actions, { action: 'cut_short', tabLabel: 'Cut Short', buttonLabel: 'Apply', buttonClass: 'event-wizard-button event-wizard-button-secondary resolution-apply', buttonAttrs: ' data-row-id="' + rowId + '"', bodyHtml: '<div class="resolution-quick-action"><p class="micro-note">Apply ends this event before relocation by setting To Age to ' + cutShortToAge + '.</p></div>' });
        }
        addAction(actions, { action: 'peg', tabLabel: 'Keep as is', buttonLabel: 'Apply', buttonClass: 'event-wizard-button event-wizard-button-secondary resolution-apply', buttonAttrs: ' data-row-id="' + rowId + '" data-currency="' + originCurrency + '"', bodyHtml: '<div class="resolution-quick-action"><p class="micro-note">Apply keeps this event denominated in ' + originCurrency + ', leaving the current value (' + (part1AmountFormatted || originCurrency) + ') unchanged after the move.</p><p class="micro-note">Choose this when you prefer to convert the amount manually later.</p></div>' });
      }
    } else if (event.relocationImpact.category === 'simple') {
      if ((event.type === 'R' || event.type === 'M') && !event.linkedCountry) {
        const countries = Config.getInstance().getAvailableCountries();
        const detectedCountry = (env && env.eventsTableManager && env.eventsTableManager.detectPropertyCountry) ? env.eventsTableManager.detectPropertyCountry(event.fromAge, startCountry) : startCountry;
        const detectedCountryObj = countries.find(function (c) { return c.code.toLowerCase() === detectedCountry; });
        const detectedCountryName = detectedCountryObj ? detectedCountryObj.name : (detectedCountry ? detectedCountry.toUpperCase() : '');

        // Find the original country from the event's currency
        const eventCurrency = event.currency ? String(event.currency).toUpperCase().trim() : null;
        let originalCountry = null;
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

        let optionsHTML = '';
        countries.forEach(function (country) { const selected = country.code.toLowerCase() === detectedCountry ? 'selected' : ''; optionsHTML += '<option value="' + country.code.toLowerCase() + '" ' + selected + '>' + country.name + '</option>'; });
        containerAttributes = ' data-from-country="' + originalCountry + '" data-to-country="' + detectedCountry + '" data-from-currency="' + originCurrency + '" data-to-currency="' + toCurrency + '" data-base-amount="' + (isNaN(baseAmountSanitized) ? '' : String(baseAmountSanitized)) + '" data-fx="' + (fxRate != null ? fxRate : '') + '" data-fx-date="' + (fxDate || '') + '" data-ppp="' + (pppRatio != null ? pppRatio : '') + '" data-fx-amount="' + (fxAmount != null ? fxAmount : '') + '" data-ppp-amount="' + (pppAmount != null ? pppAmount : '') + '"';
        addAction(actions, { action: 'link', tabLabel: 'Link To Country', buttonLabel: 'Apply', buttonClass: 'event-wizard-button resolution-apply', buttonAttrs: ' data-row-id="' + rowId + '"', bodyHtml: '<p class="micro-note">Detected country: ' + detectedCountryName + '. Change if the property belongs to a different jurisdiction.</p><div class="country-selector-inline"><label for="country-select-' + rowId + '">Country</label><select class="country-selector link-country-selector" id="country-select-' + rowId + '" data-row-id="' + rowId + '" data-from-country="' + originalCountry + '" data-base-amount="' + (isNaN(baseAmountSanitized) ? '' : String(baseAmountSanitized)) + '">' + optionsHTML + '</select></div><div class="split-preview-inline compact"><div class="split-parts-container"><div class="split-part-info"><div class="part-label">Current</div><div class="part-detail">' + currentFormatted + ' (read-only)</div></div><div class="split-part-info"><div class="part-label">Converted Amount</div><div class="part-detail"><input type="text" class="link-amount-input" value="' + suggestedFormatted + '" placeholder="Amount"></div><div class="ppp-hint">PPP suggestion</div></div></div><p class="micro-note">Apply links this property to the selected country, converts the amount using purchasing power parity, and updates the currency to match.</p>' });
      } else if (event.type === 'S' || event.type === 'PP' || event.type === 'SI' || event.type === 'SI2' || event.type === 'SInp' || event.type === 'SI2np') {
        const countries = Config.getInstance().getAvailableCountries();
        const selectedCountry = (event.linkedCountry ? String(event.linkedCountry).toLowerCase() : '') || destCountry || originCountry || startCountry;
        const selectedCountryObj = countries.find(function (c) { return c.code.toLowerCase() === selectedCountry; });
        const selectedCountryName = selectedCountryObj ? selectedCountryObj.name : (selectedCountry ? selectedCountry.toUpperCase() : '');
        const amountCountry = selectedCountry || originCountry;
        const amountMeta = getSymbolAndLocaleByCountry(amountCountry);
        const amountFormatted = fmtWithSymbol(amountMeta.symbol, amountMeta.locale, baseAmountSanitized);
        let optionsHTML = '';
        countries.forEach(function (country) {
          const code = String(country.code || '').toLowerCase();
          const selected = code === selectedCountry ? 'selected' : '';
          optionsHTML += '<option value="' + code + '" ' + selected + '>' + country.name + '</option>';
        });
        addAction(actions, {
          action: 'link',
          tabLabel: 'Link To Country',
          buttonLabel: 'Apply',
          buttonClass: 'event-wizard-button resolution-apply',
          buttonAttrs: ' data-row-id="' + rowId + '"',
          bodyHtml: '<p class="micro-note">Select the source country for this income stream. Amount stays unchanged.</p><div class="country-selector-inline"><label for="country-select-' + rowId + '">Country</label><select class="country-selector" id="country-select-' + rowId + '" data-row-id="' + rowId + '">' + optionsHTML + '</select></div><div class="resolution-quick-action"><p class="micro-note">Current amount: ' + (amountFormatted || String(baseAmountSanitized || '')) + ' (read-only).</p><p class="micro-note">Apply links this salary/pension event to ' + selectedCountryName + ' for source-country taxation. No PPP conversion is applied.</p></div>'
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
        const percentage = (!isNaN(pppSuggestionNum) && !isNaN(currentAmountNum) && currentAmountNum !== 0) ? (((pppSuggestionNum / currentAmountNum - 1) * 100).toFixed(1)) : '0.0';
        const currentFormatted = fmtWithSymbol(fromMeta.symbol, fromMeta.locale, currentAmountNum);
        const suggestedFormatted = !isNaN(pppSuggestionNum) ? fmtWithSymbol(toMeta.symbol, toMeta.locale, pppSuggestionNum) : '';
        const destCurrencyCode = destCurrency ? destCurrency.toUpperCase() : destCurrency;
        const destCountryLabel = (destCountry ? destCountry.toUpperCase() : '') || 'destination country';
        containerAttributes = ' data-from-country="' + originCountry + '" data-to-country="' + destCountry + '" data-from-currency="' + originCurrency + '" data-to-currency="' + destCurrency + '" data-base-amount="' + (isNaN(baseAmountSanitized) ? '' : String(baseAmountSanitized)) + '" data-fx="' + (fxRate != null ? fxRate : '') + '" data-fx-date="' + (fxDate || '') + '" data-ppp="' + (pppRatio != null ? pppRatio : '') + '" data-fx-amount="' + (fxAmount != null ? fxAmount : '') + '" data-ppp-amount="' + (pppAmount != null ? pppAmount : '') + '"';
        addAction(actions, { action: 'accept', tabLabel: 'Apply Suggested Amount', buttonLabel: 'Apply', buttonClass: 'event-wizard-button resolution-apply', buttonAttrs: ' data-row-id="' + rowId + '" data-suggested-amount="' + (isNaN(pppSuggestionNum) ? '' : String(pppSuggestionNum)) + '" data-suggested-currency="' + destCurrency + '"', bodyHtml: '<div class="suggestion-comparison compact"><div class="comparison-row"><span class="comparison-label">Current</span><span class="comparison-value">' + currentFormatted + '</span></div><div class="comparison-row"><span class="comparison-label">Suggested</span><span class="comparison-value">' + suggestedFormatted + '</span></div><div class="difference">Δ ' + percentage + '%</div></div><p class="micro-note">Apply updates the amount to ' + suggestedFormatted + ' (' + (destCurrencyCode || destCurrency) + ') so it reflects purchasing power in ' + destCountryLabel + '.</p>' });
        addAction(actions, { action: 'peg', tabLabel: 'Keep as is', buttonLabel: 'Apply', buttonClass: 'event-wizard-button event-wizard-button-secondary resolution-apply', buttonAttrs: ' data-row-id="' + rowId + '" data-currency="' + originCurrency + '"', bodyHtml: '<div class="resolution-quick-action"><p class="micro-note">Apply keeps the current value (' + (currentFormatted || originCurrency) + ') in ' + originCurrency + '. No conversion to ' + (destCurrencyCode || destCurrency || 'the destination currency') + ' will occur.</p></div>' });
        addAction(actions, { action: 'review', tabLabel: 'Mark As Reviewed', buttonLabel: 'Apply', buttonClass: 'event-wizard-button event-wizard-button-tertiary resolution-apply', buttonAttrs: ' data-row-id="' + rowId + '"', bodyHtml: '<div class="resolution-quick-action"><p class="micro-note">Apply records this relocation impact as reviewed without changing the amount or currency.</p></div>' });
      }
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
        tabLabel: 'Adapt Split Age',
        buttonLabel: 'Apply',
        buttonClass: 'event-wizard-button resolution-apply',
        buttonAttrs: ' data-row-id="' + rowId + '"',
        bodyHtml: '<div class="resolution-quick-action"><p class="micro-note">Adjust this split to the new relocation age (' + relocationAgeLabel + ').</p><p class="micro-note">Apply updates Part 1 to end at age ' + expectedPart1ToAge + ' and Part 2 to start at age ' + relocationAgeLabel + '.</p></div>'
      });
      addAction(actions, {
        action: 'keep_split_as_is',
        tabLabel: 'Leave As Is',
        buttonLabel: 'Apply',
        buttonClass: 'event-wizard-button event-wizard-button-secondary resolution-apply',
        buttonAttrs: ' data-row-id="' + rowId + '"',
        bodyHtml: '<div class="resolution-quick-action"><p class="micro-note">Keep both halves at their current ages. The split remains linked and will be marked as reviewed.</p></div>'
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
        tabLabel: 'Adapt Sale Age',
        buttonLabel: 'Apply',
        buttonClass: 'event-wizard-button resolution-apply',
        buttonAttrs: ' data-row-id="' + rowId + '"',
        bodyHtml: '<div class="resolution-quick-action"><p class="micro-note">This property sale is currently set to age ' + currentToAge + '.</p><p class="micro-note">Apply aligns the sale with relocation by setting To Age to ' + expectedToAge + '.</p></div>'
      });
      addAction(actions, {
        action: 'keep_sale_as_is',
        tabLabel: 'Leave As Is',
        buttonLabel: 'Apply',
        buttonClass: 'event-wizard-button event-wizard-button-secondary resolution-apply',
        buttonAttrs: ' data-row-id="' + rowId + '"',
        bodyHtml: '<div class="resolution-quick-action"><p class="micro-note">Keep the current sale timing and mark this impact as reviewed.</p></div>'
      });
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
        tabLabel: 'Join Halves',
        buttonLabel: 'Apply',
        buttonClass: 'event-wizard-button resolution-apply',
        buttonAttrs: ' data-row-id="' + rowId + '"',
        bodyHtml: '<div class="resolution-quick-action"><p class="micro-note">This split no longer matches a relocation boundary. Join both halves back into one event.</p><p class="micro-note">Apply restores a single event from age ' + mergedFromAge + ' to ' + mergedToAge + ' using ' + amountLabel + '.</p></div>'
      });
    } else if (event.relocationImpact.category === 'local_holdings') {
      // Local investment holdings resolution panel
      const localHoldingsDetails = (function parseLocalHoldings(detailsPayload) {
        if (!detailsPayload) return [];
        let parsed = detailsPayload;
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch (_) {
            return [];
          }
        }
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.holdings)) return parsed.holdings;
        if (parsed && Array.isArray(parsed.localHoldings)) return parsed.localHoldings;
        return [];
      })(event.relocationImpact.details);
      const holdingsContextHtml = (function renderLocalHoldingsSummary(items) {
        if (!items || !items.length) return '';
        const listItems = items.map(function (item) {
          const label = item && item.label ? String(item.label) : 'Holding';
          const currency = item && item.currency ? String(item.currency).toUpperCase() : '';
          const currencySuffix = currency ? ' (' + currency + ')' : '';
          return '<li>' + label + currencySuffix + '</li>';
        }).join('');
        return '<div class="local-holdings-summary"><p class="micro-note">Local holdings detected:</p><ul class="micro-note local-holdings-list">' + listItems + '</ul></div>';
      })(localHoldingsDetails);

      addAction(actions, {
        action: 'keep_holdings',
        tabLabel: 'Keep Holdings',
        buttonLabel: 'Mark as Reviewed',
        buttonClass: 'event-wizard-button event-wizard-button-secondary resolution-apply',
        buttonAttrs: ' data-row-id="' + rowId + '"',
        bodyHtml: holdingsContextHtml + '<div class="resolution-quick-action"><p class="micro-note">Keep your local investment holdings as-is. You can continue to hold these investments after relocation, though they remain tied to the origin country\'s market and currency.</p><p class="micro-note">Note: Tax treatment will follow your new country of residence.</p></div>'
      });

      addAction(actions, {
        action: 'plan_sale',
        tabLabel: 'Plan to Sell',
        buttonLabel: 'Mark as Reviewed',
        buttonClass: 'event-wizard-button resolution-apply',
        buttonAttrs: ' data-row-id="' + rowId + '"',
        bodyHtml: holdingsContextHtml + '<div class="resolution-quick-action"><p class="micro-note">Plan to sell these holdings around the time of relocation. You can model the sale by adding a stock market event (SM) at the relocation age with negative growth to simulate liquidation.</p><p class="micro-note">Proceeds will be converted to your new residence currency.</p></div>'
      });

      addAction(actions, {
        action: 'plan_reinvest',
        tabLabel: 'Plan to Reinvest',
        buttonLabel: 'Mark as Reviewed',
        buttonClass: 'event-wizard-button event-wizard-button-tertiary resolution-apply',
        buttonAttrs: ' data-row-id="' + rowId + '"',
        bodyHtml: holdingsContextHtml + '<div class="resolution-quick-action"><p class="micro-note">Plan to sell local holdings and reinvest in global or destination-country investments. Model this by:</p><ol class="micro-note"><li>Add a stock market event (SM) at relocation age to simulate sale</li><li>Adjust your investment mix parameters to reflect new allocation</li></ol><p class="micro-note">The simulator will automatically invest surplus in your configured mix.</p></div>'
      });
    }

    if (!actions.length) return content;
    const impactCause = (event.relocationImpact.message || '').trim() || 'Relocation impact detected for this event.';
    const tabsHtml = actions.map(function (ac) { return '<button type="button" class="resolution-tab" id="' + ac.tabId + '" role="tab" aria-selected="false" aria-controls="' + ac.detailId + '" data-action="' + ac.action + '" tabindex="0">' + ac.tabLabel + '</button>'; }).join('');
    const detailsHtml = actions.map(function (ac) { const btnClass = ac.buttonClass || 'event-wizard-button resolution-apply'; const attrs = ac.buttonAttrs || ''; const eventAttrs = eventId ? ' data-event-id="' + eventId + '"' : ''; return '<div class="resolution-detail" id="' + ac.detailId + '" role="tabpanel" aria-labelledby="' + ac.tabId + '" data-action="' + ac.action + '" hidden aria-hidden="true"><div class="resolution-detail-content">' + ac.bodyHtml + '</div><div class="resolution-detail-footer"><button type="button" class="' + btnClass + '" data-action="' + ac.action + '"' + attrs + eventAttrs + '>' + ac.buttonLabel + '</button></div></div>'; }).join('');
    content = '<div class="resolution-panel-expander"><div class="resolution-panel-container"' + containerAttributes + '><div class="resolution-panel-header"><h4>' + impactCause + '</h4><button class="panel-close-btn">×</button></div><div class="resolution-panel-body"><div class="resolution-tab-strip" role="tablist" aria-label="Resolution actions" aria-orientation="horizontal">' + tabsHtml + '</div><div class="resolution-details">' + detailsHtml + '</div></div></div></div>';
    return content;
  },

  handlePanelAction: function (event, action, payload, env) {
    if (!env || !env.eventsTableManager) return;
    const etm = env.eventsTableManager;
    const rowId = payload && payload.rowId;
    const eventId = payload && payload.eventId;
    switch (action) {
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
        const fromCountry = payload && payload.fromCountry;
        if (typeof etm.pegCurrencyToOriginal === 'function') etm.pegCurrencyToOriginal(rowId, currency, fromCountry, eventId);
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
      case 'review': {
        if (typeof etm.markAsReviewed === 'function') etm.markAsReviewed(rowId, eventId);
        break;
      }
      case 'join_split': {
        if (typeof etm.joinSplitEvents === 'function') etm.joinSplitEvents(rowId, eventId);
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
      case 'adapt_sale_to_move': {
        if (typeof etm.adaptSaleToRelocationAge === 'function') etm.adaptSaleToRelocationAge(rowId, eventId);
        break;
      }
      case 'keep_sale_as_is': {
        if (typeof etm.keepSaleAsIs === 'function') etm.keepSaleAsIs(rowId, eventId);
        break;
      }
      case 'keep_property': {
        try { this._keepProperty(event, payload, env); } catch (_) { }
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
      case 'keep_holdings':
      case 'plan_sale':
      case 'plan_reinvest': {
        // All three actions simply mark the impact as reviewed
        if (typeof etm.markAsReviewed === 'function') etm.markAsReviewed(rowId, eventId);
        break;
      }
      default:
        break;
    }
  },

  calculatePPPSuggestion: function (amount, fromCountry, toCountry) {
    var raw = (amount == null) ? '' : String(amount);
    var sanitized = raw.replace(/[^0-9.\-]/g, '');
    var numeric = Number(sanitized);
    if (isNaN(numeric)) numeric = Number(amount);
    const economicData = Config.getInstance().getEconomicData();
    if (!economicData || !economicData.ready) return numeric;
    const pppRatio = economicData.getPPP(fromCountry, toCountry);
    if (pppRatio === null) {
      const fxRate = economicData.getFX(fromCountry, toCountry);
      return fxRate !== null ? Math.round(numeric * fxRate) : numeric;
    }
    return Math.round(numeric * pppRatio);
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
        const onOpened = function (e) { if (e.target !== expander) return; expander.style.height = 'auto'; expander.removeEventListener('transitionend', onOpened); };
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
      });
    }

    interactionRoot.addEventListener('click', function (e) {
      const tab = e.target && e.target.closest && e.target.closest('.resolution-tab');
      if (tab) { e.preventDefault(); self._handleTabSelection(interactionRoot, tab); return; }
      const btn = e.target && e.target.closest && e.target.closest('.resolution-apply');
      if (!btn) return; e.preventDefault(); e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const panelContainer = (interactionRoot.classList && interactionRoot.classList.contains('resolution-panel-container'))
        ? interactionRoot
        : (interactionRoot.querySelector && interactionRoot.querySelector('.resolution-panel-container'));
      const payload = {
        rowId: (btn.getAttribute('data-row-id') || (ctx && ctx.rowId)),
        eventId: (btn.getAttribute('data-event-id') || (ctx && ctx.eventId)),
        currency: btn.getAttribute('data-currency'),
        suggestedAmount: btn.getAttribute('data-suggested-amount'),
        suggestedCurrency: btn.getAttribute('data-suggested-currency'),
        fromCountry: panelContainer ? panelContainer.getAttribute('data-from-country') : null,
        toCountry: panelContainer ? panelContainer.getAttribute('data-to-country') : null
      };
      if (action === 'split') { const detail = btn.closest('.resolution-detail'); const input = detail ? detail.querySelector('.part2-amount-input') : null; payload.part2Amount = input ? input.value : undefined; }
      else if (action === 'link') { const detail = btn.closest('.resolution-detail'); const sel = detail ? detail.querySelector('.country-selector') : null; const amountInput = detail ? detail.querySelector('.link-amount-input') : null; payload.country = sel ? sel.value : undefined; payload.convertedAmount = amountInput ? amountInput.value : undefined; }
      self.handlePanelAction(ctx.event, action, payload, ctx.env);
    });
    this._bindTabKeyboard(interactionRoot);
  },

  _handleTabSelection: function (rootEl, tabButton) {
    if (!rootEl || !tabButton) return;
    const action = tabButton.getAttribute('data-action'); if (!action) return;
    const tabs = rootEl.querySelectorAll('.resolution-tab');
    tabs.forEach(function (tab) { const isActive = (tab === tabButton); tab.classList.toggle('resolution-tab-active', isActive); tab.setAttribute('aria-selected', isActive ? 'true' : 'false'); tab.setAttribute('tabindex', isActive ? '0' : '-1'); });
    const details = rootEl.querySelectorAll('.resolution-detail');
    let selectedDetail = null; const self = this;
    details.forEach(function (detail) { const matches = detail.getAttribute('data-action') === action; if (matches) { selectedDetail = detail; if (!detail.classList.contains('resolution-detail-active') || detail.hasAttribute('hidden')) { self._animateOpenResolutionDetail(detail); } else { detail.setAttribute('aria-hidden', 'false'); detail.style.pointerEvents = ''; } } else if (!detail.hasAttribute('hidden') || detail.classList.contains('resolution-detail-active')) { self._animateCloseResolutionDetail(detail); } });
  },

  _bindTabKeyboard: function (rootEl) {
    if (!rootEl || rootEl._resolutionTabKeyboardBound) return;
    const self = this;
    const keyHandler = function (event) {
      const tab = event.target && event.target.closest && event.target.closest('.resolution-tab'); if (!tab) return; const key = event.key; if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'Home' && key !== 'End') return; const tabs = Array.from(rootEl.querySelectorAll('.resolution-tab')); if (!tabs.length) return; const currentIndex = tabs.indexOf(tab); if (currentIndex === -1) return; let nextIndex = currentIndex; if (key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length; else if (key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length; else if (key === 'Home') nextIndex = 0; else if (key === 'End') nextIndex = tabs.length - 1; if (nextIndex === currentIndex) return; event.preventDefault(); const nextTab = tabs[nextIndex]; if (nextTab) { try { if (typeof nextTab.focus === 'function') nextTab.focus(); } catch (_) { } self._handleTabSelection(rootEl, nextTab); }
    };
    rootEl.addEventListener('keydown', keyHandler);
    rootEl._resolutionTabKeyboardBound = true;
  },

  _animateOpenResolutionDetail: function (detail) {
    if (!detail) return; this._clearResolutionDetailTransition(detail); detail.classList.add('resolution-detail-active'); detail.removeAttribute('hidden'); detail.setAttribute('aria-hidden', 'false'); detail.style.pointerEvents = 'auto'; const targetHeight = detail.scrollHeight; detail.style.overflow = 'hidden'; detail.style.transition = 'none'; detail.style.height = '0px'; detail.style.opacity = '0'; // eslint-disable-next-line no-unused-expressions
    detail.offsetHeight; detail.style.transition = 'height 0.24s ease, opacity 0.18s ease'; detail.style.height = targetHeight + 'px'; detail.style.opacity = '1';
    const onEnd = function (evt) { if (evt && evt.target !== detail) return; if (detail._resolutionDetailTimer) { clearTimeout(detail._resolutionDetailTimer); detail._resolutionDetailTimer = null; } detail.style.transition = ''; detail.style.height = 'auto'; detail.style.opacity = ''; detail.style.overflow = ''; detail.style.pointerEvents = ''; detail._resolutionDetailHandler = null; detail.removeEventListener('transitionend', onEnd); };
    detail._resolutionDetailHandler = onEnd; detail.addEventListener('transitionend', onEnd); detail._resolutionDetailTimer = setTimeout(function () { if (detail._resolutionDetailHandler) { onEnd({ target: detail }); } }, 320);
  },

  _animateCloseResolutionDetail: function (detail) {
    if (!detail) return; this._clearResolutionDetailTransition(detail); detail.style.pointerEvents = 'none'; detail.setAttribute('aria-hidden', 'true'); const startHeight = detail.scrollHeight; if (!startHeight) { detail.classList.remove('resolution-detail-active'); detail.setAttribute('hidden', 'hidden'); detail.style.transition = ''; detail.style.height = ''; detail.style.opacity = ''; detail.style.overflow = ''; detail.style.pointerEvents = ''; detail._resolutionDetailHandler = null; return; } const computedStyle = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(detail) : null; detail.style.overflow = 'hidden'; detail.style.transition = 'none'; detail.style.height = startHeight + 'px'; detail.style.opacity = computedStyle ? computedStyle.opacity || '1' : '1'; // eslint-disable-next-line no-unused-expressions
    detail.offsetHeight; detail.style.transition = 'height 0.24s ease, opacity 0.18s ease'; detail.style.height = '0px'; detail.style.opacity = '0'; const onEnd = function (evt) { if (evt && evt.target !== detail) return; if (detail._resolutionDetailTimer) { clearTimeout(detail._resolutionDetailTimer); detail._resolutionDetailTimer = null; } detail.classList.remove('resolution-detail-active'); detail.setAttribute('hidden', 'hidden'); detail.style.transition = ''; detail.style.height = ''; detail.style.opacity = ''; detail.style.overflow = ''; detail.style.pointerEvents = ''; detail._resolutionDetailHandler = null; detail.removeEventListener('transitionend', onEnd); }; detail._resolutionDetailHandler = onEnd; detail.addEventListener('transitionend', onEnd); detail._resolutionDetailTimer = setTimeout(function () { if (detail._resolutionDetailHandler) { onEnd({ target: detail }); } }, 320);
  },

  _clearResolutionDetailTransition: function (detail) {
    if (!detail) return; if (detail._resolutionDetailTimer) { try { clearTimeout(detail._resolutionDetailTimer); } catch (_) { } detail._resolutionDetailTimer = null; } if (detail._resolutionDetailHandler) { try { detail.removeEventListener('transitionend', detail._resolutionDetailHandler); } catch (_) { } detail._resolutionDetailHandler = null; }
  },

  _setupCollapseTriggers: function (opts) {
    if (!opts || !opts.anchorEl) return;
    const anchor = opts.anchorEl;
    const self = this;
    const clickOutsideHandler = function (e) {
      try {
        if (opts.context === 'table') {
          const row = anchor.previousElementSibling;
          if (row && !anchor.contains(e.target) && !row.contains(e.target)) { self.collapsePanelForTableRow(row); }
        } else if (opts.context === 'accordion') {
          if (!anchor.contains(e.target)) self._collapseAccordionPanel(anchor);
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
      const onClosed = function (e) { if (e.target !== expander) return; expander.removeEventListener('transitionend', onClosed); const wrapperToRemove = expander; if (wrapperToRemove && wrapperToRemove.parentNode) { wrapperToRemove.remove(); } };
      expander.addEventListener('transitionend', onClosed);
    } else if (container) {
      setTimeout(function () { if (container.parentNode) container.parentNode.remove(); }, 300);
    }
    this._teardownCollapseTriggers(item);
  },

  // Property helpers (used by keep/sell actions)
  _keepProperty: function (event, payload, env) {
    var webUI = env && env.webUI ? env.webUI : null;
    var etm = env && env.eventsTableManager ? env.eventsTableManager : null;
    if (!webUI || !etm || typeof etm._applyToRealEstatePair !== 'function') return;

    var rowId = payload && payload.rowId;
    var eventId = payload && payload.eventId;
    var baseRow = null;
    if (typeof etm._findEventRow === 'function') baseRow = etm._findEventRow(rowId, eventId);
    if (!baseRow && rowId) baseRow = document.querySelector('tr[data-row-id="' + rowId + '"]');
    if (!baseRow) return;

    var startCountry = Config.getInstance().getStartCountry();
    var origin = typeof etm.detectPropertyCountry === 'function' ? etm.detectPropertyCountry(Number(event.fromAge), startCountry) : startCountry;
    var rs = Config.getInstance().getCachedTaxRuleSet(origin);
    var originCurrency = rs && typeof rs.getCurrencyCode === 'function' ? rs.getCurrencyCode() : null;

    etm._applyToRealEstatePair(baseRow, function (row) {
      if (typeof etm._removeHiddenInput === 'function') etm._removeHiddenInput(row, 'event-relocation-sell-mv-id');
      if (typeof etm._removeHiddenInput === 'function') etm._removeHiddenInput(row, 'event-relocation-sell-anchor-age');
      etm.getOrCreateHiddenInput(row, 'event-linked-country', origin);
      if (originCurrency) etm.getOrCreateHiddenInput(row, 'event-currency', originCurrency);
    });
    this._refreshImpacts(env);
  },

  _sellProperty: function (event, payload, env) {
    var webUI = env && env.webUI ? env.webUI : null;
    var etm = env && env.eventsTableManager ? env.eventsTableManager : null;
    if (!webUI || !etm || typeof etm._applyToRealEstatePair !== 'function') return;

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
    etm._applyToRealEstatePair(baseRow, function (row) {
      setToAgeGuarded(row, cutoffAge);
      if (sellMarkerId) etm.getOrCreateHiddenInput(row, 'event-relocation-sell-mv-id', sellMarkerId);
      etm.getOrCreateHiddenInput(row, 'event-relocation-sell-anchor-age', String(relocationAge));
    });
    etm._suppressSellMarkerClear = previousSuppress;
    this._refreshImpacts(env);
  },

  _rentOutProperty: function (event, payload, env) {
    this._keepProperty(event, payload, env);

    var webUI = env && env.webUI ? env.webUI : null;
    var etm = env && env.eventsTableManager ? env.eventsTableManager : null;
    if (!webUI || !etm) return;

    var events = webUI.readEvents(false) || [];
    var mvImpactId = event.relocationImpact && event.relocationImpact.mvEventId;
    var mv = events.find(function (e) { return e && (e.id === mvImpactId || e._mvRuntimeId === mvImpactId); });
    var relocationAge = mv ? mv.fromAge : null;

    if (relocationAge && typeof etm.addEventFromWizardWithSorting === 'function') {
      etm.addEventFromWizardWithSorting({
        eventType: 'RI',
        name: event.id,
        amount: '',
        fromAge: relocationAge,
        toAge: event.toAge
      });
    }

    this._refreshImpacts(env);
  },

  _refreshImpacts: function (env) {
    var webUI = env && env.webUI ? env.webUI : null;
    var etm = env && env.eventsTableManager ? env.eventsTableManager : null;
    if (!webUI || !etm) return;
    if (typeof etm.recomputeRelocationImpacts === 'function') {
      etm.recomputeRelocationImpacts();
      return;
    }
    var events = webUI.readEvents(false);
    var startCountry = Config.getInstance().getStartCountry();
    if (typeof RelocationImpactDetector !== 'undefined') RelocationImpactDetector.analyzeEvents(events, startCountry);
    etm.updateRelocationImpactIndicators(events);
    if (typeof webUI.updateStatusForRelocationImpacts === 'function') webUI.updateStatusForRelocationImpacts(events);
    if (webUI.eventAccordionManager && typeof webUI.eventAccordionManager.refresh === 'function') webUI.eventAccordionManager.refresh();
  }
};

this.RelocationImpactAssistant = RelocationImpactAssistant;
