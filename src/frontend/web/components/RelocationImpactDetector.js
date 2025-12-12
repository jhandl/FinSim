/* This file has to work on both the website and Google Apps Script */

/**
 * RelocationImpactDetector analyzes events for impacts when MV-* relocations are added or edited.
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
      if (mvEvents.length === 0) {
        this.clearAllImpacts(events);
        return { totalImpacted: 0 };
      }

      // IMPORTANT: Start fresh every time – clear ALL impacts so stale flags don't persist
      // when MV dates move or event spans change.
      this.clearAllImpacts(events);

      // Analyze for each MV event
      for (var idx = 0; idx < mvEvents.length; idx++) {
        var mvEvent = mvEvents[idx];
        var nextMvEvent = (idx + 1 < mvEvents.length) ? mvEvents[idx + 1] : null;
        var destinationCountry = mvEvent.type.substring(3).toLowerCase();
        var mvFromAge = Number(mvEvent.fromAge);
        var nextMvFromAge = nextMvEvent ? Number(nextMvEvent.fromAge) : NaN;

        // Determine origin country (the country being left)
        var originCountry = startCountry;
        if (idx > 0) {
          originCountry = mvEvents[idx - 1].type.substring(3).toLowerCase();
        }

        // Check if destination country ruleset is missing
        var destinationRuleset = Config.getInstance().getCachedTaxRuleSet(destinationCountry);
        if (!destinationRuleset) {
          var message = 'Tax rules for ' + Config.getInstance().getCountryNameByCode(destinationCountry) + ' are not available. Please remove or change this relocation event.';
          this.addImpact(mvEvent, 'missing_ruleset', message, mvEvent.id, false);
        }

        // Boundary crossers: events that span THIS MV's boundary only
        for (var j = 0; j < events.length; j++) {
          var event = events[j];
          // Skip MV events and Stock Market events
          if (event.type && (event.type.indexOf('MV-') === 0 || event.type === 'SM')) continue;
          // Skip events explicitly overridden or parts of a split chain
          if (event.resolutionOverride) continue;
          if (event.linkedEventId) continue;

          // Check if event crosses THIS MV's boundary (not the next one)
          var eFrom = Number(event.fromAge);
          var eTo = Number(event.toAge);
          if (!isNaN(eTo) && !isNaN(eFrom) && eFrom < mvFromAge && eTo > mvFromAge) {
            var message = this.generateImpactMessage('boundary', event, mvEvent, destinationCountry);
            this.addImpact(event, 'boundary', message, mvEvent.id, false);
          }
        }

        // Events in jurisdiction: classify as simple (time-only) within [mvAge, nextMvAge)
        for (var j = 0; j < events.length; j++) {
          var event = events[j];
          // Skip MV events and Stock Market events
          if (event.type && (event.type.indexOf('MV-') === 0 || event.type === 'SM')) continue;
          if (event.resolutionOverride) continue;

          var eFrom2 = Number(event.fromAge);
          if (!isNaN(eFrom2) && eFrom2 >= mvFromAge && (!nextMvEvent || eFrom2 < nextMvFromAge)) {
            var message = this.generateImpactMessage('simple', event, mvEvent, destinationCountry);
            this.addImpact(event, 'simple', message, mvEvent.id, true);
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
            this.addImpact(mvEvent, 'local_holdings', localHoldingsMessage, mvEvent.id, false, serializedLocalHoldings || undefined);
          }
        }
      }

      // Final pass: remove impacts for events that are already resolved
      for (var k = 0; k < events.length; k++) {
        this.clearResolvedImpacts(events[k]);
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
   * Builds and returns a sorted array of MV-* events by fromAge.
   * @param {Array} events - Array of SimEvent objects
   * @returns {Array} Sorted array of MV-* events
   */
  buildRelocationTimeline: function (events) {
    var mvEvents = [];
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (event && event.type && event.type.indexOf('MV-') === 0) {
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
        if (this.checkPensionConflict(event, destinationCountry, mvEvent.fromAge)) {
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
   */
  clearResolvedImpacts: function (event) {
    if (!event || !event.relocationImpact) return;
    if (event.resolutionOverride) { delete event.relocationImpact; return; }
    var resolved = false;
    if (event.relocationImpact.category === 'boundary') {
      // Consider boundary resolved if the event was explicitly split/linked, pegged to a currency,
      // or for real-estate events if a linked country has been set (indicating jurisdiction is tied).
      resolved = !!(event.linkedEventId || event.currency || ((event.type === 'R' || event.type === 'M') && event.linkedCountry));
    } else if (event.relocationImpact.category === 'simple') {
      // Consider simple resolved if currency or linked country is set or converted type acknowledged
      resolved = !!(event.currency || event.linkedCountry || event.type === 'SInp' || event.type === 'SI2np');
    } else if (event.relocationImpact.category === 'local_holdings') {
      // Consider resolved if user has marked as reviewed
      // (Keep/sell/reinvest actions will be handled via custom resolution, not field changes)
      resolved = !!(event.resolutionOverride);
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
