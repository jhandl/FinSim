const assert = require('assert');

// Shims for global functions used in RelocationImpactDetector
global.getRelocationCountryCode = function(event) {
  return String(event.name || '').trim().toLowerCase();
};
global.isRelocationEvent = function(event) {
  return event && event.type === 'MV';
};

module.exports = {
  name: 'RelocationEventCreationAndEditing',
  description: 'Test relocation impact detection when creating and editing events.',
  isCustomTest: true,
  async runCustomTest() {
    // Shim minimal Config expected by the detector.
    const configStub = {
      isRelocationEnabled() { return true; },
      getCountryNameByCode(code) { return String(code).toUpperCase(); },
      getStartCountry() { return 'ie'; },
      getAvailableCountries() {
        return [
          { code: 'IE', name: 'Ireland' },
          { code: 'AR', name: 'Argentina' },
          { code: 'US', name: 'USA' }
        ];
      },
      getCachedTaxRuleSet(code) {
        return {
          getCurrencyCode() { 
            const c = String(code).toLowerCase();
            if (c === 'ie') return 'EUR';
            if (c === 'ar') return 'ARS';
            if (c === 'us') return 'USD';
            return 'EUR';
          },
          getPensionSystemType() { return 'mixed'; }
        };
      },
      getEconomicData() { return null; }
    };
    global.Config = { getInstance: () => configStub };

    const { RelocationImpactDetector } = require('../src/frontend/web/components/RelocationImpactDetector.js');
    
    const startCountry = 'ie';
    
    // Scenario: Relocation to AR at age 40
    const mvEvent = { type: 'MV', name: 'ar', fromAge: 40, toAge: 40 };
    const events = [mvEvent];
    const mvTimeline = RelocationImpactDetector.buildRelocationTimeline(events);

    // 1. Event creation at age 30 (before relocation)
    const event1 = { fromAge: 30, toAge: 35 };
    const inference1 = RelocationImpactDetector.inferEventCurrency(event1, mvTimeline, startCountry);
    assert.strictEqual(inference1.currency, null, 'Inference at 30 currency should be null');
    assert.strictEqual(inference1.linkedCountry, null, 'Inference at 30 linkedCountry should be null');

    // 2. Event creation at age 45 (entirely after relocation)
    const event2 = { fromAge: 45, toAge: 50 };
    const inference2 = RelocationImpactDetector.inferEventCurrency(event2, mvTimeline, startCountry);
    assert.strictEqual(inference2.currency, 'ARS', 'Inference at 45 currency should be ARS');
    assert.strictEqual(inference2.linkedCountry, 'ar', 'Inference at 45 linkedCountry should be ar');

    // 3. Event spanning relocation boundary (35 to 45)
    const event3 = { fromAge: 35, toAge: 45 };
    const inference3 = RelocationImpactDetector.inferEventCurrency(event3, mvTimeline, startCountry);
    assert.strictEqual(inference3.currency, null, 'Inference spanning relocation currency should be null');
    assert.strictEqual(inference3.linkedCountry, null, 'Inference spanning relocation linkedCountry should be null');

    // 4. Jurisdiction change detection
    // Create an event that was linked to IE, but now edited to age 45 (AR)
    const event4 = { type: 'S', id: 'Salary', amount: 50000, fromAge: 45, toAge: 65, linkedCountry: 'ie' };
    const eventsToAnalyze = [mvEvent, event4];
    
    RelocationImpactDetector.analyzeEvents(eventsToAnalyze, startCountry);
    assert.ok(event4.relocationImpact, 'Event 4 should have relocation impact');
    assert.strictEqual(event4.relocationImpact.category, 'jurisdiction_change', 'Event 4 impact category should be jurisdiction_change');

    // 5. Boundary spanning detection on edit
    const event5 = { type: 'S', id: 'Salary 2', amount: 60000, fromAge: 35, toAge: 45 }; // Spans 40
    const eventsToAnalyze2 = [mvEvent, event5];
    RelocationImpactDetector.analyzeEvents(eventsToAnalyze2, startCountry);
    assert.ok(event5.relocationImpact, 'Event 5 should have relocation impact');
    assert.strictEqual(event5.relocationImpact.category, 'boundary', 'Event 5 impact category should be boundary');

    // 6. Multiple relocations (IE->AR at 40, AR->US at 60)
    const mv2 = { type: 'MV', name: 'us', fromAge: 60, toAge: 60 };
    const events3 = [mvEvent, mv2];
    const mvTimeline3 = RelocationImpactDetector.buildRelocationTimeline(events3);
    
    const event6 = { fromAge: 50, toAge: 55 };
    const inference6 = RelocationImpactDetector.inferEventCurrency(event6, mvTimeline3, startCountry);
    assert.strictEqual(inference6.currency, 'ARS', 'Inference at 50 should be ARS');
    assert.strictEqual(inference6.linkedCountry, 'ar', 'Inference at 50 should be ar');

    const event7 = { fromAge: 65, toAge: 70 };
    const inference7 = RelocationImpactDetector.inferEventCurrency(event7, mvTimeline3, startCountry);
    assert.strictEqual(inference7.currency, 'USD', 'Inference at 65 should be USD');
    assert.strictEqual(inference7.linkedCountry, 'us', 'Inference at 65 should be us');

    // 7. Missing linkedCountry should be treated as simple relocation review.
    // Create an event at age 30 (IE) without linkedCountry, then move it to age 45 (AR)
    const event8 = { type: 'S', id: 'Salary 3', amount: 70000, fromAge: 45, toAge: 65 }; // Moved from 30 to 45
    const eventsToAnalyze3 = [mvEvent, event8];
    RelocationImpactDetector.analyzeEvents(eventsToAnalyze3, startCountry);
    assert.ok(event8.relocationImpact, 'Event 8 should have relocation impact');
    assert.strictEqual(event8.relocationImpact.category, 'simple', 'Event 8 impact category should be simple');
    return { success: true };
  }
};
