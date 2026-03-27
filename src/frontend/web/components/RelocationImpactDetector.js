/* This file has to work on both the website and Google Apps Script */

var RelocationSplitSuggestionLib = this.RelocationSplitSuggestion;
if (!RelocationSplitSuggestionLib && typeof require === 'function') {
  RelocationSplitSuggestionLib = require('./RelocationSplitSuggestion.js').RelocationSplitSuggestion;
}

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
  analyzeEvents: function (events, startCountry) {
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
          var mvFromAge = this.parseAgeValue(mvEvent.fromAge);
          var nextMvFromAge = nextMvEvent ? this.parseAgeValue(nextMvEvent.fromAge) : NaN;

          // Determine origin country (the country being left)
          var originCountry = startCountry;
          if (idx > 0) {
            originCountry = getRelocationCountryCode(mvEvents[idx - 1]);
          }

          // Boundary crossers: events that span THIS MV's boundary only
          for (var j = 0; j < events.length; j++) {
            var event = events[j];
            // Skip MV events and Stock Market events
            if (event.type && (isRelocationEvent(event) || event.type === 'SM')) continue;
            if (!this.isEventAgeReadyForRelocationAnalysis(event)) continue;
            // Skip events explicitly reviewed for this relocation/category, or parts of a split chain
            if (this.hasMatchingResolutionOverrideFor(event, mvImpactId, 'boundary', mvEvent)) continue;
            if (event.linkedEventId && this.isProtectedSplitChainForMv(event, events, mvEvent)) continue;
            // Sold real-estate rows linked to a relocation are handled by
            // addSoldRealEstateShiftImpacts so users can explicitly re-align
            // sale timing when relocation age changes.
            if (this.isProtectedBySellMarkerForMv(event, mvEvents, mvImpactId)) continue;
            if (this.shouldDeferMortgageBoundaryImpact(event, events, mvFromAge)) continue;

            // Check if event crosses THIS MV's boundary (not the next one)
            var eFrom = this.parseAgeValue(event.fromAge);
            var eTo = this.parseAgeValue(event.toAge);
            if (!isNaN(eFrom) && !isNaN(eTo) && eFrom < mvFromAge && eTo >= mvFromAge) {
              var message = this.generateImpactMessage('boundary', event, mvEvent, destinationCountry, originCountry);
              this.addImpact(event, 'boundary', message, mvImpactId, false);
            }
          }

          // Events in jurisdiction: classify as simple (time-only) within [mvAge, nextMvAge)
          for (var j = 0; j < events.length; j++) {
            var event = events[j];
            // Skip MV events and Stock Market events
            if (event.type && (isRelocationEvent(event) || event.type === 'SM')) continue;
            if (!this.isEventAgeReadyForRelocationAnalysis(event)) continue;
            if (this.hasMatchingResolutionOverrideFor(event, mvImpactId, 'simple', mvEvent)) continue;
            if (this.isProtectedBySellMarkerForMv(event, mvEvents, mvImpactId)) continue;

            var eFrom2 = this.parseAgeValue(event.fromAge);
            if (!isNaN(eFrom2) && eFrom2 >= mvFromAge && (!nextMvEvent || eFrom2 < nextMvFromAge)) {
              // Skip simple only for explicit stale links. Unlinked events in a moved
              // jurisdiction are still simple review candidates.
              var explicitLinkForSimple = event.linkedCountry ? String(event.linkedCountry).toLowerCase() : '';
              if (explicitLinkForSimple && explicitLinkForSimple !== destinationCountry.toLowerCase()) continue;

              var message = this.generateImpactMessage('simple', event, mvEvent, destinationCountry, originCountry);
              this.addImpact(event, 'simple', message, mvImpactId, true);
            }
          }

        }
        this.addSoldRealEstateShiftImpacts(events, mvEvents);

        // Jurisdiction Change: detect stale explicit links after age edits/relocation shifts.
        for (var l = 0; l < events.length; l++) {
          var ev = events[l];
          if (!ev || (ev.type && isRelocationEvent(ev)) || ev.type === 'SM') continue;
          if (!this.isEventAgeReadyForRelocationAnalysis(ev)) continue;
          if (ev.relocationImpact) continue; // Boundary takes precedence
          var explicitLink = ev.linkedCountry ? String(ev.linkedCountry).toLowerCase() : '';
          if (!explicitLink) continue;
          if (ev.type === 'RI' && ev.relocationRentMvId) {
            var rentMv = this.getMvEventByImpactRef(mvEvents, String(ev.relocationRentMvId));
            if (rentMv) continue;
          }

          var evFromAge = this.parseAgeValue(ev.fromAge);
          var currentJurisdiction = this.getCountryAtAge(mvEvents, startCountry, evFromAge);
          var mvEv = this.getMvEventForAge(mvEvents, evFromAge);
          if (this.hasMatchingResolutionOverrideFor(ev, this.getMvImpactId(mvEv), 'jurisdiction_change', mvEv)) continue;
          if (explicitLink !== String(currentJurisdiction).toLowerCase()) {
            var origin = explicitLink;
            var destination = currentJurisdiction;
            var msg = this.generateImpactMessage('jurisdiction_change', ev, mvEv, destination, origin);
            this.addImpact(ev, 'jurisdiction_change', msg, this.getMvImpactId(mvEv), true, {
              fromCountry: origin,
              toCountry: destination
            });
          }
        }
      }

      this.validateRealEstateLinkedCountries(events, mvEvents, startCountry);
      this.addSplitAmountShiftImpacts(events, mvEvents, startCountry);
      this.addOrphanSplitImpacts(events, mvEvents);
      this.addOrphanRentalImpacts(events, mvEvents);
      this.addOrphanSaleMarkerImpacts(events, mvEvents);

      // Pension conflicts: pensionable salary in a state-only pension system.
      // This blocks simulation until converted to a non-pensionable salary type.
      for (var p = 0; p < events.length; p++) {
        var evP = events[p];
        if (!evP || (evP.type && isRelocationEvent(evP)) || evP.type === 'SM') continue;
        if (evP.type !== 'SI' && evP.type !== 'SI2') continue;

        var evFromAgeP = this.parseAgeValue(evP.fromAge);
        if (isNaN(evFromAgeP)) continue;
        var countryP = this.getCountryAtAge(mvEvents, startCountry, evFromAgeP);
        var rsP = Config.getInstance().getCachedTaxRuleSet(countryP);
        if (rsP && rsP.getPensionSystemType && rsP.getPensionSystemType() === 'state_only') {
          var mvP = (mvEvents && mvEvents.length) ? this.getMvEventForAge(mvEvents, evFromAgeP) : null;
          var msgP = this.generateImpactMessage('pension_conflict', evP, mvP, countryP, null);
          this.addImpact(evP, 'pension_conflict', msgP, mvP ? this.getMvImpactId(mvP) : '', false, {
            country: countryP,
            pensionConflict: true
          });
        }
      }

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
        var fa = this.parseAgeValue(event.fromAge);
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
    if (isNaN(age)) return current;
    for (var i = 0; i < mvEvents.length; i++) {
      var mvAge = this.parseAgeValue(mvEvents[i].fromAge);
      if (age >= mvAge) current = getRelocationCountryCode(mvEvents[i]);
      else break;
    }
    return current;
  },

  parseAgeValue: function (value) {
    if (value === undefined || value === null) return NaN;
    var text = String(value).trim();
    if (!text) return NaN;
    var parsed = Number(text);
    return isNaN(parsed) ? NaN : parsed;
  },

  eventRequiresToAge: function (event) {
    if (!event || !event.type) return false;
    if (typeof UIManager !== 'undefined' && UIManager && typeof UIManager.getRequiredFields === 'function') {
      var required = UIManager.getRequiredFields(String(event.type));
      return !!(required && required.toAge === 'required');
    }
    var type = String(event.type);
    return type !== 'R' && type !== 'DBI' && type !== 'MV' && type !== 'NOP';
  },

  isEventAgeReadyForRelocationAnalysis: function (event) {
    var fromAge = this.parseAgeValue(event ? event.fromAge : null);
    if (isNaN(fromAge)) return false;
    if (!this.eventRequiresToAge(event)) return true;
    var toAge = this.parseAgeValue(event ? event.toAge : null);
    return !isNaN(toAge);
  },

  /**
   * Infers the natural currency and linkedCountry for an event based on its age.
   * Returns { currency, linkedCountry } if event falls entirely within a jurisdiction.
   * @param {Object} event - Event data object
   * @param {Array} mvEvents - Sorted MV events
   * @param {string} startCountry - Starting country code
   * @returns {Object} { currency, linkedCountry } or nulls
   */
  inferEventCurrency: function (event, mvEvents, startCountry) {
    var fromAge = this.parseAgeValue(event.fromAge);
    var toAge = this.parseAgeValue(event.toAge);
    if (isNaN(fromAge)) return { currency: null, linkedCountry: null };

    // Check if event spans multiple jurisdictions
    var countryAtStart = this.getCountryAtAge(mvEvents, startCountry, fromAge);
    if (!isNaN(toAge)) {
      var countryAtEnd = this.getCountryAtAge(mvEvents, startCountry, toAge);
      if (countryAtStart !== countryAtEnd) {
        return { currency: null, linkedCountry: null };
      }
    }

    // If it falls entirely within start country, return nulls (default behavior)
    if (countryAtStart === startCountry) {
      return { currency: null, linkedCountry: null };
    }

    // Entirely within a relocated jurisdiction
    var rs = Config.getInstance().getCachedTaxRuleSet(countryAtStart);
    var currency = rs ? rs.getCurrencyCode() : null;
    return {
      currency: currency ? String(currency).toUpperCase() : null,
      linkedCountry: countryAtStart
    };
  },

  getMvEventForAge: function (mvEvents, age) {
    var chosen = mvEvents[0];
    for (var i = 0; i < mvEvents.length; i++) {
      if (age >= this.parseAgeValue(mvEvents[i].fromAge)) chosen = mvEvents[i];
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
    if (!event || !this.isSaleMarkerEventType(event.type)) return false;
    if (!event.relocationSellMvId) return false;
    var markerMv = this.getMvEventByImpactRef(mvEvents, String(event.relocationSellMvId));
    if (!markerMv) return false;
    return this.getMvImpactId(markerMv) === String(mvImpactId || '');
  },

  isSaleMarkerEventType: function (type) {
    return type === 'R' || type === 'M' || type === 'MO' || type === 'MP' || type === 'MR';
  },

  shouldDeferMortgageBoundaryImpact: function (event, events, mvFromAge) {
    if (!event || event.type !== 'M') return false;
    var mortgageId = String(event.id || '');
    if (!mortgageId) return false;
    for (var i = 0; i < events.length; i++) {
      var candidate = events[i];
      if (!candidate || candidate.type !== 'R') continue;
      if (String(candidate.id || '') !== mortgageId) continue;
      var pFrom = Number(candidate.fromAge);
      var pTo = Number(candidate.toAge);
      if (isNaN(pFrom) || isNaN(pTo) || !(pFrom < mvFromAge && pTo >= mvFromAge)) continue;
      if (!candidate.linkedCountry) return true;
    }
    return false;
  },

  isProtectedSplitChainForMv: function (event, events, mvEvent) {
    if (!event || !event.linkedEventId || !events || !events.length) return false;
    var linkedId = String(event.linkedEventId || '');
    if (!linkedId) return false;
    var chain = [];
    for (var i = 0; i < events.length; i++) {
      var candidate = events[i];
      if (!candidate || !candidate.linkedEventId) continue;
      if (String(candidate.linkedEventId) !== linkedId) continue;
      chain.push(candidate);
    }
    if (chain.length < 2) return false;
    chain.sort(function (a, b) {
      var aFrom = RelocationImpactDetector.parseAgeValue(a.fromAge);
      var bFrom = RelocationImpactDetector.parseAgeValue(b.fromAge);
      if (aFrom !== bFrom) return aFrom - bFrom;
      var aTo = RelocationImpactDetector.parseAgeValue(a.toAge);
      var bTo = RelocationImpactDetector.parseAgeValue(b.toAge);
      return aTo - bTo;
    });
    return this.hasRelocationBoundaryForSplitChain(chain, mvEvent ? [mvEvent] : []);
  },

  ensureSimpleImpact: function (event, mvEvents, startCountry, details) {
    // Overwrite existing simple impacts if jurisdiction details are provided
    if (event.relocationImpact && event.relocationImpact.category === 'simple' && !details) return;
    if (event.relocationImpact) delete event.relocationImpact;
    var mvEvent = this.getMvEventForAge(mvEvents, Number(event.fromAge));
    var destinationCountry = mvEvent ? getRelocationCountryCode(mvEvent) : startCountry;
    var originCountry = (details && details.previousLinkedCountry) ? details.previousLinkedCountry : null;
    var message = this.generateImpactMessage('simple', event, mvEvent, destinationCountry, originCountry);
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
      if (!this.isSaleMarkerEventType(event.type)) continue;
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
      var message = 'Relocation age changed from ' + anchorAge + ' to ' + relocationAge + '.';
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
            var shiftMessage = 'Relocation age changed from ' + anchorAge + ' to ' + markerAge + '. Do you want to update the events?';
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
      var message = 'This split no longer matches any relocation boundary.';
      for (var k = 0; k < chain.length; k++) {
        this.addImpact(chain[k], 'split_orphan', message, '', true, details);
      }
    }
  },

  addOrphanRentalImpacts: function (events, mvEvents) {
    if (!events || !events.length) return;
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (!event || event.type !== 'RI') continue;
      if (event.relocationImpact) continue;
      var rentMarkerId = String(event.relocationRentMvId || '');
      if (!rentMarkerId) continue;
      var markerMv = this.getMvEventByImpactRef(mvEvents, rentMarkerId);
      if (markerMv) continue;
      var details = {
        relocationRentalOrphan: true,
        rentMvId: rentMarkerId
      };
      var message = 'This rental income was created for a relocation that no longer exists.';
      this.addImpact(event, 'simple', message, '', true, details);
    }
  },

  addOrphanSaleMarkerImpacts: function (events, mvEvents) {
    if (!events || !events.length) return;

    var orphanGroups = {};
    var boundaryIds = {};
    for (var i = 0; i < events.length; i++) {
      var impactedEvent = events[i];
      if (!impactedEvent || !this.isSaleMarkerEventType(impactedEvent.type)) continue;
      if (impactedEvent.relocationImpact && impactedEvent.relocationImpact.category === 'boundary') {
        boundaryIds[String(impactedEvent.id || '')] = true;
      }
    }

    for (var j = 0; j < events.length; j++) {
      var event = events[j];
      if (!event || !this.isSaleMarkerEventType(event.type)) continue;
      if (!event.relocationSellMvId) continue;

      var markerId = String(event.relocationSellMvId || '');
      if (!markerId) continue;
      if (this.getMvEventByImpactRef(mvEvents, markerId)) continue;

      var realEstateId = String(event.id || '');
      var groupKey = realEstateId + '::' + markerId;
      if (!orphanGroups[groupKey]) {
        orphanGroups[groupKey] = {
          id: realEstateId,
          markerId: markerId,
          anchorAge: event.relocationSellAnchorAge,
          markerTypes: {}
        };
      }
      orphanGroups[groupKey].markerTypes[String(event.type || '')] = true;
      if (orphanGroups[groupKey].anchorAge == null && event.relocationSellAnchorAge != null) {
        orphanGroups[groupKey].anchorAge = event.relocationSellAnchorAge;
      }
    }

    var groupKeys = Object.keys(orphanGroups);
    for (var k = 0; k < groupKeys.length; k++) {
      var group = orphanGroups[groupKeys[k]];
      if (!group || !group.id) continue;
      if (boundaryIds[group.id]) continue;

      var hasMortgageRow = false;
      var hasMarkerRows = false;
      var groupRows = [];
      for (var n = 0; n < events.length; n++) {
        var candidate = events[n];
        if (!candidate || !this.isSaleMarkerEventType(candidate.type)) continue;
        if (String(candidate.id || '') !== group.id) continue;
        groupRows.push(candidate);
        if (candidate.type === 'M') hasMortgageRow = true;
        if (candidate.relocationSellMvId && String(candidate.relocationSellMvId) === group.markerId) {
          hasMarkerRows = true;
        }
      }

      if (!groupRows.length || !hasMarkerRows) continue;

      var affectedTypes = [];
      var markerTypeKeys = Object.keys(group.markerTypes);
      for (var m = 0; m < markerTypeKeys.length; m++) {
        affectedTypes.push(markerTypeKeys[m]);
      }
      affectedTypes.sort();

      var message = hasMortgageRow
        ? 'This sale or payoff plan was tied to a relocation that no longer exists.'
        : 'This sale timing was tied to a relocation that no longer exists.';

      for (var r = 0; r < groupRows.length; r++) {
        var rowEvent = groupRows[r];
        var details = {
          saleMarkerOrphan: true,
          sellMvId: group.markerId,
          realEstateId: group.id,
          anchorAge: group.anchorAge,
          canRestoreMortgagePlan: hasMortgageRow,
          affectedTypes: affectedTypes
        };
        this.addImpact(rowEvent, 'sale_marker_orphan', message, '', true, details);
      }
    }
  },

  parseSplitAmountValue: function (amount) {
    return RelocationSplitSuggestionLib.parseAmountValue(amount);
  },

  amountsRoughlyEqual: function (a, b) {
    return RelocationSplitSuggestionLib.amountsRoughlyEqual(a, b);
  },

  calculateSplitAmountSuggestion: function (baseAmount, fromCountry, toCountry) {
    return RelocationSplitSuggestionLib.getSuggestedAmount(baseAmount, fromCountry, toCountry);
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
      if (String(second.relocationSplitValueMode || '').toLowerCase() === 'custom') continue;

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

      var markerAge = Number(markerMv.fromAge);
      if (isNaN(markerAge)) continue;
      var originCountry = this.getCountryAtAge(mvEvents, startCountry, markerAge - 1);
      var destinationCountry = getRelocationCountryCode(markerMv);
      var suggestedAmount = this.calculateSplitAmountSuggestion(updatedPart1Amount, originCountry, destinationCountry);
      var destinationRuleSet = Config.getInstance().getCachedTaxRuleSet(destinationCountry);
      var suggestedCurrency = destinationRuleSet && destinationRuleSet.getCurrencyCode ? String(destinationRuleSet.getCurrencyCode()).toUpperCase() : '';
      var currentPart2Amount = this.parseSplitAmountValue(second.amount);
      if (isNaN(suggestedAmount) || isNaN(currentPart2Amount)) continue;
      if (this.amountsRoughlyEqual(currentPart2Amount, suggestedAmount)) continue;

      var reviewedSuggestedAmount = this.parseSplitAmountValue(second.relocationSplitReviewedSuggestedAmount);
      if (isNaN(reviewedSuggestedAmount)) reviewedSuggestedAmount = currentPart2Amount;
      var reviewedDistance = Math.abs(reviewedSuggestedAmount - currentPart2Amount);
      var currentDistance = Math.abs(suggestedAmount - currentPart2Amount);
      if (!RelocationSplitSuggestionLib.isMaterialDistanceIncrease(currentDistance, reviewedDistance)) continue;

      var suggestedLabel = String(suggestedAmount) + (suggestedCurrency ? (' ' + suggestedCurrency) : '');
      var isAmountDrift = !this.amountsRoughlyEqual(anchorAmount, updatedPart1Amount);
      if (isAmountDrift) {
        var amountMessage = 'Part 1 amount changed. Suggested Part 2 value: ' + suggestedLabel + '.';
        var amountDetails = {
          linkedEventId: String(chainIds[j]),
          anchorAmount: anchorAmount,
          part1Amount: updatedPart1Amount,
          suggestedAmount: suggestedAmount,
          suggestedCurrency: suggestedCurrency,
          currentPart2Amount: currentPart2Amount,
          reviewedSuggestedAmount: reviewedSuggestedAmount,
          previousDistance: reviewedDistance,
          currentDistance: currentDistance,
          originCountry: originCountry,
          destinationCountry: destinationCountry,
          splitSuggestionModelVersion: RelocationSplitSuggestionLib.SPLIT_SUGGESTION_MODEL_VERSION,
          reviewedSuggestionModelVersion: second.relocationSplitSuggestionModelVersion
        };
        this.addImpact(second, 'split_amount_shift', amountMessage, this.getMvImpactId(markerMv), true, amountDetails);
        continue;
      }

      if (this.amountsRoughlyEqual(suggestedAmount, reviewedSuggestedAmount)) continue;

      var reviewedModelVersion = Number(second.relocationSplitSuggestionModelVersion);
      var isModelDrift = !isNaN(reviewedModelVersion) &&
        reviewedModelVersion !== RelocationSplitSuggestionLib.SPLIT_SUGGESTION_MODEL_VERSION;
      var reason = isModelDrift ? 'model' : 'economic';
      var driftedFurther = reviewedDistance > 0 &&
        RelocationSplitSuggestionLib.isMaterialDistanceIncrease(currentDistance, reviewedDistance);
      var suggestionMessage;
      if (driftedFurther) {
        suggestionMessage = 'You decided to leave the original Part 2 value last time, but the suggested value has drifted further now.';
      } else if (reason === 'model') {
        suggestionMessage = 'The suggested Part 2 value changed because the suggestion formula changed.';
      } else {
        suggestionMessage = 'The suggested Part 2 value changed due to updated economic data.';
      }

      var suggestionDetails = {
        linkedEventId: String(chainIds[j]),
        reason: reason,
        anchorAmount: anchorAmount,
        part1Amount: updatedPart1Amount,
        suggestedAmount: suggestedAmount,
        suggestedCurrency: suggestedCurrency,
        currentPart2Amount: currentPart2Amount,
        reviewedSuggestedAmount: reviewedSuggestedAmount,
        previousDistance: reviewedDistance,
        currentDistance: currentDistance,
        originCountry: originCountry,
        destinationCountry: destinationCountry,
        splitSuggestionModelVersion: RelocationSplitSuggestionLib.SPLIT_SUGGESTION_MODEL_VERSION,
        reviewedSuggestionModelVersion: second.relocationSplitSuggestionModelVersion
      };
      this.addImpact(second, 'split_suggestion_shift', suggestionMessage, this.getMvImpactId(markerMv), true, suggestionDetails);
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
   * @param {string} originCountry - Origin country code (optional)
   * @returns {string}
   */
  generateImpactMessage: function (category, event, mvEvent, destinationCountry, originCountry) {
    var destinationCountryName = Config.getInstance().getCountryNameByCode(destinationCountry);
    var originCountryName = originCountry ? Config.getInstance().getCountryNameByCode(originCountry) : null;
    var noun;
    switch (event.type) {
      case 'E': noun = 'expense'; break;
      case 'R': noun = 'property'; break;
      case 'M': noun = 'mortgage'; break;
      default: noun = 'income'; break;
    }

    if (category === 'pension_conflict') {
      return 'This salary is in ' + destinationCountryName + ', which has no private pension system.';
    }

    var countryForQuestion = originCountryName || destinationCountryName;

    if (category === 'boundary') {
      return 'What should happen with this ' + noun + ' after your move to ' + destinationCountryName + '?';
    }

    if (category === 'jurisdiction_change') {
      var originCurrencyCode = 'original currency';
      var destinationCurrencyCode = 'new currency';
      try {
        var rsOrig = Config.getInstance().getCachedTaxRuleSet(originCountry);
        if (rsOrig) originCurrencyCode = rsOrig.getCurrencyCode();
        var rsDest = Config.getInstance().getCachedTaxRuleSet(destinationCountry);
        if (rsDest) destinationCurrencyCode = rsDest.getCurrencyCode();
      } catch (_) { }
      return 'This ' + noun + ' moved from ' + originCountryName + ' to ' + destinationCountryName + '. Keep as ' + originCurrencyCode + ' or change to ' + destinationCurrencyCode + '?';
    }

    switch (category) {
      case 'simple':
        if (mvEvent && this.checkPensionConflict(event, destinationCountry, mvEvent.fromAge)) {
          return 'Are you converting this salary to a non-pensionable salary after your move to ' + destinationCountryName + '?';
        } else if (noun === 'property' || noun === 'mortgage') {
          return 'Is this ' + noun + ' in ' + countryForQuestion + ' still relevant?';
        } else {
          return 'Is this ' + noun + ' still relevant after your move to ' + destinationCountryName + '?';
        }
      default:
        return 'Relocation impact detected for this event.';
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
    // Pension conflicts are hard errors and cannot be dismissed via "keep as is".
    if (impactCategory !== 'pension_conflict' && this.hasMatchingResolutionOverrideFor(event, impactMvId, impactCategory, impactMvEvent)) { delete event.relocationImpact; return; }
    var resolved = false;
    if (event.relocationImpact.category === 'boundary') {
      // Boundary impacts are only cleared by explicit boundary-scoped overrides.
      // Keeping linked/currency values should not auto-resolve a boundary crossing.
      resolved = false;
    } else if (event.relocationImpact.category === 'pension_conflict') {
      resolved = (event.type === 'SInp' || event.type === 'SI2np');
    } else if (event.relocationImpact.category === 'simple') {
      var simpleDetails = event.relocationImpact ? event.relocationImpact.details : null;
      if (typeof simpleDetails === 'string') {
        try { simpleDetails = JSON.parse(simpleDetails); } catch (_) { simpleDetails = null; }
      }
      var isRelocationRentalOrphan = !!(event.type === 'RI' && simpleDetails && simpleDetails.relocationRentalOrphan === true);
      // Consider simple resolved if the event belongs to a split chain, has explicit jurisdiction, or salary conversion was applied
      if (isRelocationRentalOrphan) {
        resolved = !event.relocationRentMvId;
      } else {
        resolved = !!(event.linkedEventId || event.linkedCountry || event.type === 'SInp' || event.type === 'SI2np');
      }
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
    // Do not overwrite higher-priority impacts (boundary)
    if (event.relocationImpact && event.relocationImpact.category === 'boundary') return;
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
