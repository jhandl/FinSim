/**
 * DynamicSectionsManager
 *
 * Owns a set of DynamicSectionManager instances keyed by sectionId, built from
 * DYNAMIC_SECTIONS.
 */
class DynamicSectionsManager {
  constructor(sectionsConfig) {
    this.sections = sectionsConfig;
    this._sectionById = new Map();
    this._managerById = new Map();

    this.sections.forEach((cfg) => {
      this._sectionById.set(cfg.id, cfg);
      this._managerById.set(cfg.id, new DynamicSectionManager(cfg));
    });
  }

  initialize(instance) {
    const uiManager = new UIManager(instance.webUI);
    const events = uiManager.readEvents(false);
    const startCountry = Config.getInstance().getStartCountry();
    const uniqueCountries = getUniqueCountries(events, startCountry);

    this.sections.forEach((cfg) => {
      const mgr = this._managerById.get(cfg.id);
      mgr.initialize(uniqueCountries);
    });
  }

  getSections() {
    return this.sections.slice();
  }

  getSectionConfig(sectionId) {
    return this._sectionById.get(sectionId) || null;
  }

  getMaxColumnCount(sectionId) {
    const mgr = this._managerById.get(sectionId);
    return mgr.getMaxColumnCount();
  }

  getColumnsFor(sectionId, context) {
    const mgr = this._managerById.get(sectionId);
    return mgr.getColumnsForCountry(context && context.countryCode);
  }

  finalizeSectionWidths(tbody) {
    this.sections.forEach((cfg) => {
      const mgr = this._managerById.get(cfg.id);
      mgr.finalizeSectionWidths(tbody);
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DynamicSectionsManager };
}
