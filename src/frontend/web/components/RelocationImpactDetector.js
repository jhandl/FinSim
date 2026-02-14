/* This file has to work on both the website and Google Apps Script */

/**
 * RelocationImpactDetector analyzes events for impacts when MV relocations are added or edited.
 * It modifies events in-place by adding/removing a relocationImpact property.
 * This module is standalone and integrates with EventsTableManager.
 */
var RelocationImpactDetector = {

  /**
   * Main entry point: analyzes all events for relocation impacts and modifies them in-place.
   * Returns a summary of impacted events.
   * @param {Array} events - Array of SimEvent objects
   * @param {string} startCountry - Starting country code (optional, uses default if missing)
   * @returns {Object} Summary: { totalImpacted }
   */
  analyzeEvents: function (events, startCountry, investmentContext) {
    try {
      if (!Config.getInstance().isRelocationEnabled()) {
        this.clearAllImpacts(events);
        return { totalImpacted: 0 };
      }

      var mvEvents = this.buildRelocationTimeline(events);
      // IMPORTANT: Start fresh every time – clear ALL impacts so stale flags don't persist
      // when MV dates move or event spans change.
      this.clearAllImpacts(events);

      if (mvEvents.length > 0) {
        // Analyze for each MV event
        for (var idx = 0; idx < mvEvents.length; idx++) {
          var mvEvent = mvEvents[idx];
          var mvImpactId = this.getMvImpactId(mvEvent);
          var nextMvEvent = (idx + 1 < mvEvents.length) ? mvEvents[idx + 1] : null;
          var destinationCountry = getRelocationCountryCode(mvEvent);
          var mvFromAge = Number(mvEvent.fromAge);
          var nextMvFromAge = nextMvEvent ? Number(nextMvEvent.fromAge) : NaN;

          // Determine origin country (the country being left)
          var originCountry = startCountry;
          if (idx > 0) {
            originCountry = getRelocationCountryCode(mvEvents[idx - 1]);
          }

          // Check if destination country ruleset is missing
          var destinationRuleset = Config.getInstance().getCachedTaxRuleSet(destinationCountry);
          if (!destinationRuleset) {
            var message = 'Tax rules for ' + Config.getInstance().getCountryNameByCode(destinationCountry) + ' are not available. Please remove or change this relocation event.';
            this.addImpact(mvEvent, 'missing_ruleset', message, mvImpactId, false);
          }

          // Boundary crossers: events that span THIS MV's boundary only
          for (var j = 0; j < events.length; j++) {
            var event = events[j];
            // Skip MV events and Stock Market events
            if (event.type && (isRelocationEvent(event) || event.type === 'SM')) continue;
            // Skip events explicitly reviewed for this relocation/category, or parts of a split chain
            if (this.hasMatchingResolutionOverrideFor(event, mvImpactId, 'boundary', mvEvent)) continue;
            if (event.linkedEventId) continue;
            // Sold real-estate rows linked to a relocation are handled by
            // addSoldRealEstateShiftImpacts so users can explicitly re-align
            // sale timing when relocation age changes.
            if (this.isProtectedBySellMarkerForMv(event, mvEvents, mvImpactId)) continue;

            // Check if event crosses THIS MV's boundary (not the next one)
            var eFrom = Number(event.fromAge);
            var eTo = Number(event.toAge);
            if (!isNaN(eTo) && !isNaN(eFrom) && eFrom < mvFromAge && eTo >= mvFromAge) {
              var message = this.generateImpactMessage('boundary', event, mvEvent, destinationCountry);
              this.addImpact(event, 'boundary', message, mvImpactId, false);
            }
          }

          // Events in jurisdiction: classify as simple (time-only) within [mvAge, nextMvAge)
          for (var j = 0; j < events.length; j++) {
            var event = events[j];
            // Skip MV events and Stock Market events
            if (event.type && (isRelocationEvent(event) || event.type === 'SM')) continue;
            if (this.hasMatchingResolutionOverrideFor(event, mvImpactId, 'simple', mvEvent)) continue;
            if (this.isProtectedBySellMarkerForMv(event, mvEvents, mvImpactId)) continue;

            var eFrom2 = Number(event.fromAge);
            if (!isNaN(eFrom2) && eFrom2 >= mvFromAge && (!nextMvEvent || eFrom2 < nextMvFromAge)) {
              var message = this.generateImpactMessage('simple', event, mvEvent, destinationCountry);
              this.addImpact(event, 'simple', message, mvImpactId, true);
            }
          }

          // Detect local investment holdings for each MV event
          if (investmentContext) {
            var localHoldings = [];
            for (var i = 0; i < investmentContext.investmentAssets.length; i++) {
              var invAsset = investmentContext.investmentAssets[i];
              var capital = investmentContext.capsByKey[invAsset.key];
              if (invAsset.residenceScope === 'local' &&
                invAsset.assetCountry === originCountry &&
                capital > 0) {
                localHoldings.push({
                  key: invAsset.key,
                  label: invAsset.label,
                  currency: invAsset.baseCurrency,
                  capital: capital
                });
              }
            }

            if (localHoldings.length > 0) {
              var localHoldingsMessage = this.generateLocalHoldingsMessage(localHoldings, mvEvent, destinationCountry);
              var serializedLocalHoldings = '';
              try {
                serializedLocalHoldings = JSON.stringify(localHoldings);
              } catch (_) {
                serializedLocalHoldings = '';
              }
              this.addImpact(mvEvent, 'local_holdings', localHoldingsMessage, mvImpactId, false, serializedLocalHoldings || undefined);
            }
          }
        }
        this.addSoldRealEstateShiftImpacts(events, mvEvents);
      }

      this.validateRealEstateLinkedCountries(events, mvEvents, startCountry);
      this.addSplitAmountShiftImpacts(events, mvEvents, startCountry);
      this.addOrphanSplitImpacts(events, mvEvents);

      // Final pass: remove impacts for events that are already resolved
      for (var k = 0; k < events.length; k++) {
        this.clearResolvedImpacts(events[k], mvEvents);
      }

      // Build summary
      var summary = { totalImpacted: 0 };
      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        if (event.relocationImpact) {
          summary.totalImpacted++;
        }
      }
      return summary;
    } catch (err) {
      console.error('Error in RelocationImpactDetector.analyzeEvents:', err);
      return { totalImpacted: 0 };
    }
  },

  /**
   * Builds and returns a sorted array of MV events by fromAge.
   * @param {Array} events - Array of SimEvent objects
   * @returns {Array} Sorted array of MV events
   */
  buildRelocationTimeline: function (events) {
    var mvEvents = [];
    var available = Config.getInstance().getAvailableCountries() || [];
    var validCodes = {};
    for (var c = 0; c < available.length; c++) {
      var code = String((available[c] || {}).code || '').trim().toLowerCase();
      if (code) validCodes[code] = true;
    }
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (isRelocationEvent(event)) {
        var destinationCountry = getRelocationCountryCode(event);
        if (!destinationCountry || !validCodes[destinationCountry]) continue;
        var fa = Number(event.fromAge);
        if (!isNaN(fa)) {
          // normalize numeric for sorting comparisons
          event.fromAge = fa;
          mvEvents.push(event);
        }
      }
    }
    mvEvents.sort(function (a, b) { return Number(a.fromAge) - Number(b.fromAge); });
    return mvEvents;
  },

  getCountryAtAge: function (mvEvents, startCountry, age) {
    var current = startCountry;
    for (var i = 0; i < mvEvents.length; i++) {
      var mvAge = Number(mvEvents[i].fromAge);
      if (age >= mvAge) current = getRelocationCountryCode(mvEvents[i]);
      else break;
    }
    return current;
  },

  getMvEventForAge: function (mvEvents, age) {
    var chosen = mvEvents[0];
    for (var i = 0; i < mvEvents.length; i++) {
      if (age >= Number(mvEvents[i].fromAge)) chosen = mvEvents[i];
      else break;
    }
    return chosen;
  },

  getMvImpactId: function (mvEvent) {
    return mvEvent ? (mvEvent._mvRuntimeId || mvEvent.id || '') : '';
  },

  getImpactReferenceCandidates: function (mvImpactId, mvEvent) {
    var candidates = [];
    if (mvImpactId) candidates.push(String(mvImpactId));
    if (mvEvent) {
      if (mvEvent._mvRuntimeId) candidates.push(String(mvEvent._mvRuntimeId));
      if (mvEvent.id) candidates.push(String(mvEvent.id));
      if (mvEvent.relocationLinkId) candidates.push(String(mvEvent.relocationLinkId));
    }
    return candidates;
  },

  hasMatchingResolutionOverrideFor: function (event, mvImpactId, category, mvEvent) {
    if (!event || !event.resolutionOverride) return false;
    var overrideCategory = String(event.resolutionOverrideCategory || '');
    if (overrideCategory && category && overrideCategory !== String(category)) return false;
    var overrideRef = String(event.resolutionOverrideMvId || '');
    if (!overrideRef) return false;
    var candidates = this.getImpactReferenceCandidates(mvImpactId, mvEvent);
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] === overrideRef) return true;
    }
    return false;
  },

  isProtectedBySellMarkerForMv: function (event, mvEvents, mvImpactId) {
    if (!event || (event.type !== 'R' && event.type !== 'M')) return false;
    if (!event.relocationSellMvId) return false;
    var markerMv = this.getMvEventByImpactRef(mvEvents, String(event.relocationSellMvId));
    if (!markerMv) return false;
    return this.getMvImpactId(markerMv) === String(mvImpactId || '');
  },

  ensureSimpleImpact: function (event, mvEvents, startCountry, details) {
    if (event.relocationImpact && event.relocationImpact.category === 'simple') return;
    if (event.relocationImpact) delete event.relocationImpact;
    var mvEvent = this.getMvEventForAge(mvEvents, Number(event.fromAge));
    var destinationCountry = mvEvent ? getRelocationCountryCode(mvEvent) : startCountry;
    var message = this.generateImpactMessage('simple', event, mvEvent, destinationCountry);
    this.addImpact(event, 'simple', message, this.getMvImpactId(mvEvent), true, details);
  },

  getMvEventByImpactRef: function (mvEvents, ref) {
    if (!mvEvents || !mvEvents.length) return null;
    var needle = String(ref || '');
    if (!needle) return null;
    for (var i = 0; i < mvEvents.length; i++) {
      var mv = mvEvents[i];
      if (!mv) continue;
      if ((mv._mvRuntimeId && String(mv._mvRuntimeId) === needle) ||
        (mv.id && String(mv.id) === needle) ||
        (mv.relocationLinkId && String(mv.relocationLinkId) === needle)) {
        return mv;
      }
    }
    return null;
  },

  addSoldRealEstateShiftImpacts: function (events, mvEvents) {
    if (!events || !events.length || !mvEvents || !mvEvents.length) return;
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (!event) continue;
      if (event.type !== 'R' && event.type !== 'M') continue;
      if (!event.relocationSellMvId) continue;

      var markerId = String(event.relocationSellMvId);
      var mvEvent = this.getMvEventByImpactRef(mvEvents, markerId);
      if (!mvEvent) continue;
      if (this.hasMatchingResolutionOverrideFor(event, this.getMvImpactId(mvEvent), 'sale_relocation_shift', mvEvent)) continue;

      var relocationAge = Number(mvEvent.fromAge);
      var anchorAge = Number(event.relocationSellAnchorAge);
      if (isNaN(relocationAge) || isNaN(anchorAge)) continue;
      if (relocationAge === anchorAge) continue;

      var expectedToAge = relocationAge - 1;
      var message = 'Relocation age changed from ' + anchorAge + ' to ' + relocationAge + '. Update this sale timing or keep it as-is.';
      var details = {
        relocationAge: relocationAge,
        previousRelocationAge: anchorAge,
        expectedToAge: expectedToAge,
        currentToAge: event.toAge,
        sellMarkerId: markerId
      };
      this.addImpact(event, 'sale_relocation_shift', message, this.getMvImpactId(mvEvent), true, details);
    }
  },

  addOrphanSplitImpacts: function (events, mvEvents) {
    var chains = {};
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (!event || !event.linkedEventId) continue;
      var key = String(event.linkedEventId);
      if (!chains[key]) chains[key] = [];
      chains[key].push(event);
    }

    var chainIds = Object.keys(chains);
    for (var j = 0; j < chainIds.length; j++) {
      var chain = chains[chainIds[j]];
      if (!chain || chain.length < 2) continue;
      chain.sort(function (a, b) {
        var aFrom = Number(a.fromAge);
        var bFrom = Number(b.fromAge);
        if (aFrom !== bFrom) return aFrom - bFrom;
        return Number(a.toAge) - Number(b.toAge);
      });
      var first = chain[0];
      var last = chain[chain.length - 1];
      var splitMarkerId = '';
      for (var n = 0; n < chain.length; n++) {
        if (chain[n] && chain[n].relocationSplitMvId) {
          splitMarkerId = String(chain[n].relocationSplitMvId);
          break;
        }
      }

      if (splitMarkerId) {
        var markerMv = this.getMvEventByImpactRef(mvEvents, splitMarkerId);
        if (markerMv) {
          var markerAge = Number(markerMv.fromAge);
          var anchorAge = NaN;
          for (var a = 0; a < chain.length; a++) {
            var candidateAnchor = Number(chain[a] && chain[a].relocationSplitAnchorAge);
            if (!isNaN(candidateAnchor)) { anchorAge = candidateAnchor; break; }
          }
          if (!isNaN(anchorAge) && markerAge !== anchorAge) {
            var shiftDetails = {
              linkedEventId: String(chainIds[j]),
              relocationAge: markerAge,
              previousRelocationAge: anchorAge,
              part1ToAge: first ? first.toAge : '',
              part2FromAge: (chain.length > 1 && chain[1]) ? chain[1].fromAge : '',
              amount: first ? first.amount : '',
              currency: (first && first.currency) ? String(first.currency).toUpperCase() : ''
            };
            var shiftMessage = 'Relocation age changed from ' + anchorAge + ' to ' + markerAge + '. Update both halves or keep their current ages.';
            for (var s = 0; s < chain.length; s++) {
              this.addImpact(chain[s], 'split_relocation_shift', shiftMessage, this.getMvImpactId(markerMv), true, shiftDetails);
            }
          }
          continue;
        }
      }

      if (this.hasRelocationBoundaryForSplitChain(chain, mvEvents)) continue;

      var details = {
        linkedEventId: String(chainIds[j]),
        amount: first ? first.amount : '',
        currency: (first && first.currency) ? String(first.currency).toUpperCase() : '',
        fromAge: first ? first.fromAge : '',
        toAge: last ? last.toAge : ''
      };
      var message = 'This split no longer matches any relocation boundary. Join both halves back into a single event.';
      for (var k = 0; k < chain.length; k++) {
        this.addImpact(chain[k], 'split_orphan', message, '', true, details);
      }
    }
  },

  parseSplitAmountValue: function (amount) {
    var raw = (amount == null) ? '' : String(amount);
    var sanitized = raw.replace(/[^0-9.\-]/g, '');
    var numeric = Number(sanitized);
    if (isNaN(numeric)) numeric = Number(amount);
    return isNaN(numeric) ? NaN : numeric;
  },

  amountsRoughlyEqual: function (a, b) {
    if (isNaN(a) || isNaN(b)) return false;
    return Math.abs(a - b) < 0.5;
  },

  calculateSplitAmountSuggestion: function (baseAmount, fromCountry, toCountry) {
    var numeric = this.parseSplitAmountValue(baseAmount);
    if (isNaN(numeric)) return NaN;
    var economicData = Config.getInstance().getEconomicData();
    if (!economicData || !economicData.ready) return Math.round(numeric);
    var pppRatio = economicData.getPPP(fromCountry, toCountry);
    if (pppRatio === null) {
      var fxRate = economicData.getFX(fromCountry, toCountry);
      if (fxRate === null) return Math.round(numeric);
      return Math.round(numeric * fxRate);
    }
    return Math.round(numeric * pppRatio);
  },

  addSplitAmountShiftImpacts: function (events, mvEvents, startCountry) {
    if (!events || !events.length) return;
    var chains = {};
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (!event || !event.linkedEventId) continue;
      var key = String(event.linkedEventId);
      if (!chains[key]) chains[key] = [];
      chains[key].push(event);
    }

    var chainIds = Object.keys(chains);
    for (var j = 0; j < chainIds.length; j++) {
      var chain = chains[chainIds[j]];
      if (!chain || chain.length < 2) continue;
      chain.sort(function (a, b) {
        var aFrom = Number(a.fromAge);
        var bFrom = Number(b.fromAge);
        if (aFrom !== bFrom) return aFrom - bFrom;
        return Number(a.toAge) - Number(b.toAge);
      });
      var first = chain[0];
      var second = chain[1];
      if (!first || !second) continue;
      if (second.relocationSplitAnchorAmount == null || second.relocationSplitAnchorAmount === '') continue;

      var splitMarkerId = '';
      for (var n = 0; n < chain.length; n++) {
        if (chain[n] && chain[n].relocationSplitMvId) {
          splitMarkerId = String(chain[n].relocationSplitMvId);
          break;
        }
      }
      if (!splitMarkerId) continue;
      var markerMv = this.getMvEventByImpactRef(mvEvents, splitMarkerId);
      if (!markerMv) continue;

      var anchorAmount = this.parseSplitAmountValue(second.relocationSplitAnchorAmount);
      var updatedPart1Amount = this.parseSplitAmountValue(first.amount);
      if (isNaN(anchorAmount) || isNaN(updatedPart1Amount)) continue;
      if (this.amountsRoughlyEqual(anchorAmount, updatedPart1Amount)) continue;

      var markerAge = Number(markerMv.fromAge);
      if (isNaN(markerAge)) continue;
      var originCountry = this.getCountryAtAge(mvEvents, startCountry, markerAge - 1);
      var destinationCountry = getRelocationCountryCode(markerMv);
      var suggestedAmount = this.calculateSplitAmountSuggestion(updatedPart1Amount, originCountry, destinationCountry);
      var destinationRuleSet = Config.getInstance().getCachedTaxRuleSet(destinationCountry);
      var suggestedCurrency = destinationRuleSet && destinationRuleSet.getCurrencyCode ? String(destinationRuleSet.getCurrencyCode()).toUpperCase() : '';
      var currentPart2Amount = this.parseSplitAmountValue(second.amount);
      if (!isNaN(currentPart2Amount) && this.amountsRoughlyEqual(currentPart2Amount, suggestedAmount)) {
        continue;
      }

      var suggestedLabel = !isNaN(suggestedAmount) ? (String(suggestedAmount) + (suggestedCurrency ? (' ' + suggestedCurrency) : '')) : '';
      var message = suggestedLabel
        ? ('Part 1 amount changed. Suggested Part 2 value: ' + suggestedLabel + '. Update Part 2 value or leave it as is.')
        : 'Part 1 amount changed. Update Part 2 value or leave it as is.';
      var details = {
        linkedEventId: String(chainIds[j]),
        anchorAmount: anchorAmount,
        part1Amount: updatedPart1Amount,
        suggestedAmount: suggestedAmount,
        suggestedCurrency: suggestedCurrency,
        currentPart2Amount: isNaN(currentPart2Amount) ? second.amount : currentPart2Amount,
        originCountry: originCountry,
        destinationCountry: destinationCountry
      };
      this.addImpact(second, 'split_amount_shift', message, this.getMvImpactId(markerMv), true, details);
    }
  },

  hasRelocationBoundaryForSplitChain: function (chain, mvEvents) {
    if (!chain || chain.length < 2 || !mvEvents || mvEvents.length === 0) return false;
    var boundaries = [];
    for (var i = 0; i < chain.length - 1; i++) {
      var leftTo = Number(chain[i].toAge);
      var rightFrom = Number(chain[i + 1].fromAge);
      if (!isNaN(leftTo) && !isNaN(rightFrom) && (leftTo === rightFrom || leftTo + 1 === rightFrom)) {
        boundaries.push(rightFrom);
      }
    }
    if (!boundaries.length) return false;
    for (var j = 0; j < mvEvents.length; j++) {
      var mvAge = Number(mvEvents[j].fromAge);
      if (isNaN(mvAge)) continue;
      for (var k = 0; k < boundaries.length; k++) {
        if (mvAge === boundaries[k]) return true;
      }
    }
    return false;
  },

  validateRealEstateLinkedCountries: function (events, mvEvents, startCountry) {
    var pairs = {};
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (event && (event.type === 'R' || event.type === 'M')) {
        var id = String(event.id);
        if (!pairs[id]) pairs[id] = { r: null, m: null };
        if (event.type === 'R') pairs[id].r = event;
        else pairs[id].m = event;
      }
    }

    var ids = Object.keys(pairs);
    for (var j = 0; j < ids.length; j++) {
      var pair = pairs[ids[j]];
      var r = pair.r;
      var m = pair.m;
      var rCountry = r ? this.getCountryAtAge(mvEvents, startCountry, Number(r.fromAge)) : null;
      var mCountry = m ? this.getCountryAtAge(mvEvents, startCountry, Number(m.fromAge)) : null;
      var rLinked = r && r.linkedCountry ? String(r.linkedCountry).toLowerCase() : '';
      var mLinked = m && m.linkedCountry ? String(m.linkedCountry).toLowerCase() : '';
      var mismatch = false;

      if (r && rLinked && rCountry && rLinked !== rCountry) mismatch = true;
      if (m && mLinked && mCountry && mLinked !== mCountry) mismatch = true;
      if (r && m && rCountry && mCountry && rCountry !== mCountry) mismatch = true;

      if (!mismatch) continue;

      var rDetails = null;
      var mDetails = null;
      if (r) {
        rDetails = {
          previousLinkedCountry: rLinked || '',
          previousCurrency: r.currency ? String(r.currency).toUpperCase() : '',
          detectedCountry: rCountry || ''
        };
        r.linkedCountry = null; r.currency = null;
      }
      if (m) {
        mDetails = {
          previousLinkedCountry: mLinked || '',
          previousCurrency: m.currency ? String(m.currency).toUpperCase() : '',
          detectedCountry: mCountry || ''
        };
        m.linkedCountry = null; m.currency = null;
      }

      if (r) this.ensureSimpleImpact(r, mvEvents, startCountry, rDetails);
      if (m) this.ensureSimpleImpact(m, mvEvents, startCountry, mDetails);
    }
  },

  /**
   * Checks if an event is a pension conflict.
   * @param {Object} event - SimEvent object
   * @param {string} destinationCountry - Destination country code
   * @param {number} mvAge - Age of the move
   * @returns {boolean}
   */
  checkPensionConflict: function (event, destinationCountry, mvAge) {
    if ((event.type === 'SI' || event.type === 'SI2') && event.fromAge >= mvAge) {
      var taxRuleSet = Config.getInstance().getCachedTaxRuleSet(destinationCountry);
      return taxRuleSet && taxRuleSet.getPensionSystemType() === 'state_only';
    }
    return false;
  },
  /**
   * Generates a user-friendly message for the impact.
   * @param {string} category - Impact category
   * @param {Object} event - SimEvent object
   * @param {Object} mvEvent - The MV event
   * @param {string} destinationCountry - Destination country code
   * @returns {string}
   */
  generateImpactMessage: function (category, event, mvEvent, destinationCountry) {
    var destinationCountryName = Config.getInstance().getCountryNameByCode(destinationCountry);
    var noun;
    switch (event.type) {
      case 'E': noun = 'expense'; break;
      case 'R': noun = 'property'; break;
      case 'M': noun = 'mortgage'; break;
      default: noun = 'income'; break;
    }
    switch (category) {
      case 'boundary':
        if (noun === 'property' || noun === 'mortgage') {
          return 'Are you keeping this property after your move to ' + destinationCountryName + '?';
        } else {
          return 'Does this ' + noun + ' continue after your move to ' + destinationCountryName + '?';
        }
      case 'simple':
        if (mvEvent && this.checkPensionConflict(event, destinationCountry, mvEvent.fromAge)) {
          return 'Are you converting this salary to a non-pensionable salary after your move to ' + destinationCountryName + '?';
        } else {
          return 'Is this ' + noun + ' still relevant after your move to ' + destinationCountryName + '?';
        }
      default:
        return 'Relocation impact detected for this event.';
    }
  },

  /**
   * Generates a user-friendly message for local investment holdings impact.
   * @param {Array} localHoldings - Array of affected local holdings
   * @param {Object} mvEvent - The MV event
   * @param {string} destinationCountry - Destination country code
   * @returns {string}
   */
  generateLocalHoldingsMessage: function (localHoldings, mvEvent, destinationCountry) {
    var destinationCountryName = Config.getInstance().getCountryNameByCode(destinationCountry);
    var holdingsList = localHoldings.map(function (h) {
      return h.label + ' (' + h.currency + ')';
    }).join(', ');

    if (localHoldings.length === 1) {
      return 'You hold ' + localHoldings[0].label + ' tied to your current country. What would you like to do after moving to ' + destinationCountryName + '?';
    } else {
      return 'You hold local investments (' + holdingsList + ') tied to your current country. What would you like to do after moving to ' + destinationCountryName + '?';
    }
  },

  /**
   * Removes relocationImpact if the event is resolved.
   * @param {Object} event - SimEvent object
   * @param {Array} mvEvents - Relocation timeline for scoped resolution matching
   */
  clearResolvedImpacts: function (event, mvEvents) {
    if (!event || !event.relocationImpact) return;
    var impactMvId = event.relocationImpact ? event.relocationImpact.mvEventId : '';
    var impactCategory = event.relocationImpact ? event.relocationImpact.category : '';
    var impactMvEvent = this.getMvEventByImpactRef(mvEvents, impactMvId);
    if (this.hasMatchingResolutionOverrideFor(event, impactMvId, impactCategory, impactMvEvent)) { delete event.relocationImpact; return; }
    var resolved = false;
    if (event.relocationImpact.category === 'boundary') {
      // Consider boundary resolved if the event was explicitly split/linked, pegged to a currency,
      // or for real-estate events if a linked country has been set (indicating jurisdiction is tied).
      resolved = !!(event.linkedEventId || (event.currency && event.linkedCountry) || ((event.type === 'R' || event.type === 'M') && event.linkedCountry));
    } else if (event.relocationImpact.category === 'simple') {
      // Consider simple resolved if the event belongs to a split chain, has explicit jurisdiction, or salary conversion is acknowledged
      resolved = !!(event.linkedEventId || event.linkedCountry || event.type === 'SInp' || event.type === 'SI2np');
    }
    if (resolved) delete event.relocationImpact;
  },

  /**
   * Adds or updates the relocationImpact property on an event.
   * @param {Object} event - SimEvent object
   * @param {string} category - Category
   * @param {string} message - Message
   * @param {string} mvEventId - ID of the MV event
   * @param {boolean} autoResolvable - Whether auto-resolvable
   * @param {*} details - Optional payload to persist with the impact
   */
  addImpact: function (event, category, message, mvEventId, autoResolvable, details) {
    if (event && isRelocationEvent(event)) return;
    // Do not overwrite higher-priority impacts (boundary, missing_ruleset)
    if (event.relocationImpact && (event.relocationImpact.category === 'boundary' || event.relocationImpact.category === 'missing_ruleset')) return;
    var impact = {
      category: category,
      message: message,
      mvEventId: mvEventId,
      autoResolvable: autoResolvable
    };
    if (details != null) {
      impact.details = details;
    }
    event.relocationImpact = impact;
  },

  /**
   * Clears all relocationImpact properties from events.
   * @param {Array} events - Array of SimEvent objects
   */
  clearAllImpacts: function (events) {
    for (var i = 0; i < events.length; i++) {
      if (events[i].relocationImpact) delete events[i].relocationImpact;
    }
  }
};

// Make RelocationImpactDetector available globally
this.RelocationImpactDetector = RelocationImpactDetector;
