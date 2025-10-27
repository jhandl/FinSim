/* This file is web-only and provides a modal to review relocation impacts before simulation */

/**
 * RelocationImpactAssistant provides a modal interface to review and acknowledge relocation impacts
 * before running a simulation. It reads impact data from events and presents it in a user-friendly way.
 */
var RelocationImpactAssistant = {

  /**
   * Main entry point: shows the impact modal if there are unresolved impacts.
   * @param {Array} events - Array of SimEvent objects
   * @param {Function} onClose - Callback with boolean: true to continue simulation, false to cancel
   * @returns {boolean} True if modal was shown, false if no impacts
   */
  showImpactModal: function(events, onClose) {
    try {
      if (!Config.getInstance().isRelocationEnabled()) {
        return false; // Do not invoke onClose when no modal is shown
      }
      var impactSummary = this.buildImpactSummary(events);
      if (impactSummary.totalImpacted === 0) {
        return false; // Do not invoke onClose when no modal is shown
      }
      this.createModal(impactSummary, onClose);
      return true;
    } catch (err) {
      console.error('Error in showImpactModal:', err);
      onClose(false);
      return false;
    }
  },

  /**
   * Builds a summary of impacts by scanning events.
   * @param {Array} events - Array of SimEvent objects
   * @returns {Object} Impact summary
   */
  buildImpactSummary: function(events) {
    var summary = {
      totalImpacted: 0,
      byCategory: {
        boundaryCrossers: [],
        simpleEvents: []
      }
    };
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (event.relocationImpact) {
        summary.totalImpacted++;
        var cat = event.relocationImpact.category;
        if (cat === 'boundary') summary.byCategory.boundaryCrossers.push(event);
        else if (cat === 'simple') summary.byCategory.simpleEvents.push(event);
      }
    }
    return summary;
  },

  /**
   * Creates and displays the modal.
   * @param {Object} impactSummary - Summary from buildImpactSummary
   * @param {Function} onClose - Callback for modal close
   */
  createModal: function(impactSummary, onClose) {
    var overlay = document.createElement('div');
    overlay.className = 'wizard-overlay';
    
    var modal = document.createElement('div');
    modal.className = 'event-wizard-modal relocation-impact-modal';
    // Ensure modal can anchor absolutely positioned close button
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    
    // Header
    var header = document.createElement('div');
    header.className = 'event-wizard-step-header';
    var title = document.createElement('h3');
    title.textContent = 'Relocation Impact Review';
    header.appendChild(title);
    var subtitle = document.createElement('p');
    subtitle.textContent = 'Some events need attention due to relocations in your timeline';
    header.appendChild(subtitle);
    var closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.closeModal(overlay, onClose, false));
    header.appendChild(closeBtn);
    modal.appendChild(header);
    
    // Body
    var body = document.createElement('div');
    body.className = 'event-wizard-step-body';
    
    // Category sections
    var categories = ['boundaryCrossers', 'simpleEvents'];
    for (var cat of categories) {
      if (impactSummary.byCategory[cat].length > 0) {
        var section = this.createCategorySection(cat, impactSummary.byCategory[cat]);
        body.appendChild(section);
      }
    }
    modal.appendChild(body);
    
    // Footer
    var footer = document.createElement('div');
    footer.className = 'event-wizard-step-footer';
    var note = document.createElement('p');
    note.textContent = 'You can run the simulation with unresolved impacts, but results may be inaccurate';
    footer.appendChild(note);
    var buttons = document.createElement('div');
    buttons.className = 'event-wizard-buttons';
    var reviewBtn = document.createElement('button');
    reviewBtn.className = 'event-wizard-button primary';
    reviewBtn.textContent = 'Review Events';
    reviewBtn.addEventListener('click', () => this.closeModal(overlay, onClose, false));
    var continueBtn = document.createElement('button');
    continueBtn.className = 'event-wizard-button secondary';
    continueBtn.textContent = 'Continue Anyway';
    continueBtn.addEventListener('click', () => this.closeModal(overlay, onClose, true));
    buttons.appendChild(reviewBtn);
    buttons.appendChild(continueBtn);
    footer.appendChild(buttons);
    modal.appendChild(footer);
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    // Prevent background scroll while modal is open
    try { document.body.classList.add('modal-open'); } catch (_) {}
    
    // Event listeners
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeModal(overlay, onClose, false);
      }
    });
    var handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.closeModal(overlay, onClose, false);
      }
    };
    // store handler reference on overlay to ensure cleanup on all close paths
    overlay._escHandler = handleKeyDown;
    document.addEventListener('keydown', handleKeyDown);
  },

  /**
   * Creates the overview section.
   * @param {Object} impactSummary - Summary object
   * @returns {HTMLElement} Overview element
   */
  createOverviewSection: function(impactSummary) {
    var section = document.createElement('div');
    section.className = 'impact-overview';
    
    var catMappings = {
      boundaryCrossers: { name: 'Boundary Crossers', icon: '⚠️' },
      simpleEvents: { name: 'Simple Events', icon: 'ℹ️' }
    };
    
    for (var key in catMappings) {
      if (impactSummary.byCategory[key].length > 0) {
        var catDiv = document.createElement('div');
        catDiv.className = 'impact-category-summary';
        catDiv.innerHTML = `${catMappings[key].icon} ${catMappings[key].name}: ${impactSummary.byCategory[key].length}`;
        section.appendChild(catDiv);
      }
    }
    return section;
  },

  /**
   * Creates a category section.
   * @param {string} category - Category key
   * @param {Array} events - Events in this category
   * @returns {HTMLElement} Section element
   */
  createCategorySection: function(category, events) {
    var catMappings = {
      boundaryCrossers: { name: 'Boundary Crossers', guidance: 'boundary' },
      simpleEvents: { name: 'Simple Events', guidance: 'simple' }
    };
    
    var mapping = catMappings[category];
    var section = document.createElement('div');
    section.className = 'impact-category-section';

    // Header acts as toggle control
    var header = document.createElement('h4');
    header.textContent = `${mapping.name} (${events.length})`;
    // Initial state: collapsed for progressive disclosure
    header.setAttribute('aria-expanded', 'false');
    header.style.cursor = 'pointer';
    section.appendChild(header);

    // Collapsible body wrapper (guidance + list)
    var bodyContainer = document.createElement('div');
    bodyContainer.className = 'impact-category-body';
    bodyContainer.style.display = 'none';

    var guidance = document.createElement('p');
    guidance.className = 'impact-guidance';
    guidance.textContent = this.getCategoryGuidance(mapping.guidance);
    bodyContainer.appendChild(guidance);

    var list = document.createElement('ul');
    list.className = 'impact-event-list';
    for (var event of events) {
      var item = document.createElement('li');
      item.className = 'impact-event-item';
      var name = event.id || event.name || 'Unnamed Event';
      var ageRange = `${event.fromAge || '?'} - ${event.toAge || '?'}`;
      var message = event.relocationImpact.message;
      var typeLabel = this.getEventTypeLabel(event);
      var quotedName = name ? '"' + name + '"' : '';
      var nameAndAge = quotedName && ageRange ? (quotedName + ', ' + ageRange) : (quotedName || ageRange);
      item.innerHTML = `<strong>${typeLabel}</strong> (${nameAndAge}): ${message}`;

      // For boundary-crossing properties/mortgages, provide explicit Keep/Sell controls
      if (category === 'boundaryCrossers' && (event.type === 'R' || event.type === 'M')) {
        var actions = document.createElement('div');
        actions.className = 'impact-event-actions';

        var keepBtn = document.createElement('button');
        keepBtn.className = 'event-wizard-button event-wizard-button-secondary';
        keepBtn.textContent = 'Keep Property';
        keepBtn.addEventListener('click', (function(ev) {
          return () => {
            try { RelocationImpactAssistant._keepProperty(ev); } catch (e) { console.error(e); }
          };
        })(event));

        var sellBtn = document.createElement('button');
        sellBtn.className = 'event-wizard-button primary';
        sellBtn.textContent = 'Sell Property';
        sellBtn.addEventListener('click', (function(ev) {
          return () => {
            try { RelocationImpactAssistant._sellProperty(ev); } catch (e) { console.error(e); }
          };
        })(event));

        actions.appendChild(keepBtn);
        actions.appendChild(sellBtn);
        item.appendChild(actions);
      }

      list.appendChild(item);
    }
    bodyContainer.appendChild(list);

    section.appendChild(bodyContainer);

    // Toggle visibility on header click
    header.addEventListener('click', function() {
      var isExpanded = header.getAttribute('aria-expanded') === 'true';
      var nextState = !isExpanded;
      header.setAttribute('aria-expanded', nextState ? 'true' : 'false');
      bodyContainer.style.display = nextState ? '' : 'none';
    });

    return section;
  },

  /**
   * Keep property: auto-link to origin country and clear impact without changing currency.
   * Also links any associated mortgage to the same country.
   */
  _keepProperty: function(event) {
    try {
      var webUI = typeof WebUI !== 'undefined' ? WebUI.getInstance() : null;
      var etm = webUI && webUI.eventsTableManager ? webUI.eventsTableManager : null;
      if (!etm) return;
      var startCountry = typeof etm.getStartCountry === 'function' ? etm.getStartCountry() : Config.getInstance().getDefaultCountry();
      var origin = typeof etm.detectPropertyCountry === 'function' ? etm.detectPropertyCountry(Number(event.fromAge), startCountry) : startCountry;

      // Helper to find table rows by id and type
      function findRowsByIdAndType(id, type) {
        var rows = Array.from(document.querySelectorAll('#Events tbody tr'));
        return rows.filter(function(r) {
          var t = r.querySelector('.event-type');
          var n = r.querySelector('.event-name');
          return t && n && t.value === type && n.value === id;
        });
      }

      // Link the property row
      var propRows = findRowsByIdAndType(event.id, 'R');
      for (var i = 0; i < propRows.length; i++) {
        etm.getOrCreateHiddenInput(propRows[i], 'event-linked-country', origin);
      }
      // Link any associated mortgage rows
      var mortRows = findRowsByIdAndType(event.id, 'M');
      for (var j = 0; j < mortRows.length; j++) {
        etm.getOrCreateHiddenInput(mortRows[j], 'event-linked-country', origin);
      }

      RelocationImpactAssistant._refreshImpacts();
    } catch (e) {
      console.error('Error in _keepProperty:', e);
    }
  },

  /**
   * Sell property: set property and associated mortgage to end at relocation age.
   */
  _sellProperty: function(event) {
    try {
      var webUI = typeof WebUI !== 'undefined' ? WebUI.getInstance() : null;
      var etm = webUI && webUI.eventsTableManager ? webUI.eventsTableManager : null;
      if (!etm) return;

      // Find the relocation boundary age
      var events = webUI.readEvents(false) || [];
      var mv = events.find(function(e) { return e && e.id === (event.relocationImpact && event.relocationImpact.mvEventId); });
      if (!mv) return;
      var relocationAge = Number(mv.fromAge);

      function findRowsByIdAndType(id, type) {
        var rows = Array.from(document.querySelectorAll('#Events tbody tr'));
        return rows.filter(function(r) {
          var t = r.querySelector('.event-type');
          var n = r.querySelector('.event-name');
          return t && n && t.value === type && n.value === id;
        });
      }

      function setToAge(row, age) {
        var toAgeInput = row.querySelector('.event-to-age');
        if (toAgeInput) {
          toAgeInput.value = String(age);
          toAgeInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // End property at relocation boundary
      var propRows = findRowsByIdAndType(event.id, 'R');
      for (var i = 0; i < propRows.length; i++) setToAge(propRows[i], relocationAge);

      // End associated mortgage at relocation boundary
      var mortRows = findRowsByIdAndType(event.id, 'M');
      for (var j = 0; j < mortRows.length; j++) setToAge(mortRows[j], relocationAge);

      RelocationImpactAssistant._refreshImpacts();
    } catch (e) {
      console.error('Error in _sellProperty:', e);
    }
  },

  // Re-analyze impacts and refresh modal content (if open)
  _refreshImpacts: function() {
    try {
      var webUI = typeof WebUI !== 'undefined' ? WebUI.getInstance() : null;
      var etm = webUI && webUI.eventsTableManager ? webUI.eventsTableManager : null;
      if (!etm) return;
      var events = webUI.readEvents(false);
      var startCountry = typeof etm.getStartCountry === 'function' ? etm.getStartCountry() : Config.getInstance().getDefaultCountry();
      if (typeof RelocationImpactDetector !== 'undefined') {
        RelocationImpactDetector.analyzeEvents(events, startCountry);
      }
      etm.updateRelocationImpactIndicators(events);
      if (typeof webUI.updateStatusForRelocationImpacts === 'function') {
        webUI.updateStatusForRelocationImpacts(events);
      }
      if (webUI.eventAccordionManager && typeof webUI.eventAccordionManager.refresh === 'function') {
        webUI.eventAccordionManager.refresh();
      }

      // If a modal is open, rebuild its body content
      var overlay = document.querySelector('.wizard-overlay');
      var modal = overlay && overlay.querySelector('.relocation-impact-modal');
      if (modal) {
        var body = modal.querySelector('.event-wizard-step-body');
        if (body) {
          // Rebuild body with fresh data
          var summary = RelocationImpactAssistant.buildImpactSummary(events);
          var newBody = document.createElement('div');
          newBody.className = 'event-wizard-step-body';
          var categories = ['boundaryCrossers', 'simpleEvents'];
          for (var c = 0; c < categories.length; c++) {
            var key = categories[c];
            if (summary.byCategory[key].length > 0) {
              newBody.appendChild(RelocationImpactAssistant.createCategorySection(key, summary.byCategory[key]));
            }
          }
          body.replaceWith(newBody);
        }
      }
    } catch (e) {
      console.error('Error refreshing relocation impacts:', e);
    }
  },

  /**
   * Returns a human-readable label for the event type, considering sim mode and relocation.
   * @param {Object} event - SimEvent-like object
   * @returns {string}
   */
  getEventTypeLabel: function(event) {
    try {
      var t = event && event.type ? String(event.type) : '';
      if (!t) return 'Event';

      // Relocation: MV-XX → country name
      if (t.indexOf('MV-') === 0 && t.length > 3) {
        var code = t.substring(3).toLowerCase();
        try {
          var countries = Config.getInstance().getAvailableCountries();
          var match = Array.isArray(countries) ? countries.find(function(c) { return String(c.code).toLowerCase() === code; }) : null;
          if (match && match.name) return 'Relocation to ' + match.name;
        } catch (_) {}
        return 'Relocation';
      }

      // Determine simulation mode
      var simMode = 'single';
      try { simMode = WebUI.getInstance().getValue('simulation_mode') || 'single'; } catch (_) {}

      // Salary labels depend on mode
      if (t === 'SI') return simMode === 'couple' ? 'Your Salary' : 'Salary Income';
      if (t === 'SInp') return simMode === 'couple' ? 'Your Salary (no pension)' : 'Salary (no pension)';
      if (t === 'SI2') return 'Their Salary';
      if (t === 'SI2np') return 'Their Salary (no pension)';

      // Other common types
      if (t === 'UI') return 'RSU Income';
      if (t === 'RI') return 'Rental Income';
      if (t === 'DBI') return 'Defined Benefit Income';
      if (t === 'FI') return 'Tax-free Income';
      if (t === 'E') return 'Expense';
      if (t === 'R') return 'Real Estate';
      if (t === 'M') return 'Mortgage';
      if (t === 'SM') return 'Stock Market';

      return t; // Fallback to raw type code
    } catch (_) {
      return 'Event';
    }
  },

  /**
   * Gets guidance text for a category.
   * @param {string} category - Category name
   * @returns {string} Guidance text
   */
  getCategoryGuidance: function(category) {
    switch (category) {
      case 'boundary':
        return 'These events span relocation boundaries. You can split them into separate events or peg their currency to maintain value.';
      case 'simple':
        return 'Review these events to ensure amounts reflect the cost of living in the destination country.';
      case 'property':
        return 'Property events should be linked to their original country to maintain correct inflation and currency.';
      case 'pension':
        return 'The destination country has a state-only pension system. Convert pensionable salary events to non-pensionable (SInp).';
      default:
        return '';
    }
  },

  /**
   * Closes the modal and calls the callback.
   * @param {HTMLElement} overlay - The overlay element
   * @param {Function} onClose - Callback function
   * @param {boolean} continueSimulation - Whether to continue
   */
  closeModal: function(overlay, onClose, continueSimulation) {
    // Always remove the ESC key listener if present
    if (overlay && overlay._escHandler) {
      try { document.removeEventListener('keydown', overlay._escHandler); } catch (e) {}
      overlay._escHandler = null;
    }
    try { document.body.classList.remove('modal-open'); } catch (_) {}
    overlay.remove();
    onClose(continueSimulation);
  }
};

// Make RelocationImpactAssistant available globally
this.RelocationImpactAssistant = RelocationImpactAssistant;