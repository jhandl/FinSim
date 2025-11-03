const assert = require('assert');

module.exports = {
  name: 'RelocationImpactDetection',
  description: 'Validates RelocationImpactDetector classification, resolution, and guard rails.',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // Shim minimal Config expected by the detector.
    const pensionSystems = {};
    const configStub = {
      relocationEnabled: true,
      availableCountries: {
        aa: 'Country A',
        bb: 'Country B',
        cc: 'Country C'
      },
      isRelocationEnabled() { return this.relocationEnabled; },
      getCountryNameByCode(code) {
        const normalized = (code || '').toString().toLowerCase();
        return this.availableCountries[normalized] || normalized.toUpperCase();
      },
      getCachedTaxRuleSet(code) {
        const normalized = (code || '').toString().toLowerCase();
        const system = pensionSystems[normalized] || 'mixed';
        return {
          getPensionSystemType() { return system; }
        };
      }
    };
    global.Config = { getInstance: () => configStub };

    const { RelocationImpactDetector } = require('../src/frontend/web/components/RelocationImpactDetector.js');

    function makeEvent(overrides) {
      return Object.assign({
        id: overrides && overrides.id || Math.random().toString(36).slice(2),
        type: 'SI',
        amount: 1000,
        fromAge: 30,
        toAge: 40,
        currency: null,
        linkedEventId: null,
        linkedCountry: null
      }, overrides || {});
    }

    function runDetector(events, startCountry) {
      // Deep clone events to avoid cross-test contamination
      const cloned = events.map(evt => JSON.parse(JSON.stringify(evt)));
      RelocationImpactDetector.analyzeEvents(cloned, startCountry || 'aa');
      return cloned;
    }

    try {
      // Test 1: Boundary crossing detection.
      (function() {
        const mv = makeEvent({ id: 'mv1', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const salary = makeEvent({ id: 'salary_pre', type: 'SI', fromAge: 30, toAge: 40 });
        const expense = makeEvent({ id: 'expense_pre', type: 'E', fromAge: 32, toAge: 37 });
        const postSalary = makeEvent({ id: 'salary_post', type: 'SI', fromAge: 36, toAge: 45 });
        const result = runDetector([salary, expense, postSalary, mv], 'aa');

        const salaryResult = result.find(e => e.id === 'salary_pre');
        assert(salaryResult.relocationImpact, 'Expected boundary impact for salary spanning relocation');
        assert.strictEqual(salaryResult.relocationImpact.category, 'boundary');
        assert.strictEqual(salaryResult.relocationImpact.mvEventId, 'mv1');

        const expenseResult = result.find(e => e.id === 'expense_pre');
        assert(expenseResult.relocationImpact, 'Expected boundary impact for expense spanning relocation');
        assert.strictEqual(expenseResult.relocationImpact.category, 'boundary');

        const postResult = result.find(e => e.id === 'salary_post');
        assert(postResult.relocationImpact, 'Expected simple impact for post-relocation salary');
        assert.strictEqual(postResult.relocationImpact.category, 'simple');
      })();

      // Test 2: Simple event classification for same-country range.
      (function() {
        const mv = makeEvent({ id: 'mv_simple', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const expense = makeEvent({ id: 'expense_post', type: 'E', fromAge: 36, toAge: 37 });
        const salary = makeEvent({ id: 'salary_post', type: 'SI', fromAge: 37, toAge: 38 });
        const result = runDetector([expense, salary, mv], 'aa');

        ['expense_post', 'salary_post'].forEach(id => {
          const evt = result.find(e => e.id === id);
          assert(evt.relocationImpact, 'Post-relocation event should be flagged for review');
          assert.strictEqual(evt.relocationImpact.category, 'simple');
        });
      })();

      // Test 3: Property boundary detection retains message specificity.
      (function() {
        const mv = makeEvent({ id: 'mv_property', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const rental = makeEvent({ id: 'rent', type: 'RI', fromAge: 30, toAge: 50 });
        const mortgage = makeEvent({ id: 'mortgage', type: 'M', fromAge: 32, toAge: 60 });
        const result = runDetector([rental, mortgage, mv], 'aa');

        const rentalImpact = result.find(e => e.id === 'rent').relocationImpact;
        const mortgageImpact = result.find(e => e.id === 'mortgage').relocationImpact;
        assert(rentalImpact && rentalImpact.category === 'boundary', 'Rental should be flagged as boundary');
        assert(mortgageImpact && mortgageImpact.category === 'boundary', 'Mortgage should be flagged as boundary');
        assert(rentalImpact.message && rentalImpact.message.indexOf('move to') !== -1, 'Rental impact message should reference relocation destination');
      })();

      // Test 4: Pension conflict detection when destination is state-only.
      (function() {
        pensionSystems.bb = 'state_only';
        const mv = makeEvent({ id: 'mv_state', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const pensionableSalary = makeEvent({ id: 'si_event', type: 'SI', fromAge: 36, toAge: 45 });
        const result = runDetector([pensionableSalary, mv], 'aa');
        const impact = result.find(e => e.id === 'si_event').relocationImpact;
        assert(impact, 'Salary should be flagged when moving to state-only pension system');
        assert.strictEqual(impact.category, 'simple');
        assert(impact.message.indexOf('non-pensionable') !== -1, 'Impact message should suggest conversion');
      })();

      // Test 5: Multiple relocations respect nearest boundary.
      (function() {
        const mv1 = makeEvent({ id: 'mv_bb', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const mv2 = makeEvent({ id: 'mv_cc', type: 'MV-cc', fromAge: 45, toAge: 45 });
        const salary = makeEvent({ id: 'salary_multi', type: 'SI', fromAge: 30, toAge: 50 });
        const result = runDetector([salary, mv1, mv2], 'aa');
        const impact = result.find(e => e.id === 'salary_multi').relocationImpact;
        assert(impact, 'Multi-span salary should be impacted');
        assert.strictEqual(impact.mvEventId, 'mv_bb', 'Impact should point to earliest boundary crossing');
      })();

      // Test 6: Stock market events ignored.
      (function() {
        const mv = makeEvent({ id: 'mv_ignore', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const stock = makeEvent({ id: 'stock_evt', type: 'SM', fromAge: 36, toAge: 36 });
        const result = runDetector([stock, mv], 'aa');
        assert(!result.find(e => e.id === 'stock_evt').relocationImpact, 'Stock market events should be ignored');
      })();

      // Test 7: Resolution detection via currency peg clears impact.
      (function() {
        const mv = makeEvent({ id: 'mv_currency', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const salary = makeEvent({ id: 'salary_currency', type: 'SI', fromAge: 30, toAge: 40 });
        const flagged = runDetector([salary, mv], 'aa');
        flagged.find(e => e.id === 'salary_currency').currency = 'AAA';
        RelocationImpactDetector.clearResolvedImpacts(flagged.find(e => e.id === 'salary_currency'));
        assert(!flagged.find(e => e.id === 'salary_currency').relocationImpact, 'Currency peg should resolve impact');
      })();

      // Test 8: Resolution detection via split linkage clears boundary impact.
      (function() {
        const mv = makeEvent({ id: 'mv_split', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const salary = makeEvent({ id: 'salary_split', type: 'SI', fromAge: 30, toAge: 40 });
        const flagged = runDetector([salary, mv], 'aa');
        const salaryEvt = flagged.find(e => e.id === 'salary_split');
        salaryEvt.linkedEventId = 'split_123';
        RelocationImpactDetector.clearResolvedImpacts(salaryEvt);
        assert(!salaryEvt.relocationImpact, 'Linked split should resolve boundary impact');
      })();

      // Test 9: Resolution detection via property linking.
      (function() {
        const mv = makeEvent({ id: 'mv_prop_res', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const property = makeEvent({ id: 'property_link', type: 'R', fromAge: 30, toAge: 50 });
        const flagged = runDetector([property, mv], 'aa');
        const propertyEvt = flagged.find(e => e.id === 'property_link');
        propertyEvt.linkedCountry = 'aa';
        RelocationImpactDetector.clearResolvedImpacts(propertyEvt);
        assert(!propertyEvt.relocationImpact, 'Linking property to country should clear impact');
      })();

      // Test 10: Resolution detection via pension conversion.
      (function() {
        pensionSystems.bb = 'state_only';
        const mv = makeEvent({ id: 'mv_pension', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const salary = makeEvent({ id: 'salary_convert', type: 'SI', fromAge: 36, toAge: 45 });
        const flagged = runDetector([salary, mv], 'aa');
        const salaryEvt = flagged.find(e => e.id === 'salary_convert');
        salaryEvt.type = 'SInp';
        RelocationImpactDetector.clearResolvedImpacts(salaryEvt);
        assert(!salaryEvt.relocationImpact, 'Converting to non-pensionable should clear impact');
      })();

      // Test 11: Manual override skips analysis.
      (function() {
        const mv = makeEvent({ id: 'mv_override', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const expense = makeEvent({ id: 'expense_override', type: 'E', fromAge: 36, toAge: 38, resolutionOverride: '1' });
        const result = runDetector([expense, mv], 'aa');
        assert(!result.find(e => e.id === 'expense_override').relocationImpact, 'Override should prevent flagging');
      })();

      // Negative case: No MV events clears impacts.
      (function() {
        const salary = makeEvent({ id: 'no_mv_salary', type: 'SI', fromAge: 30, toAge: 40 });
        const result = runDetector([salary], 'aa');
        assert(!result.find(e => e.id === 'no_mv_salary').relocationImpact, 'Without MV events nothing should be flagged');
      })();

      // Negative case: Relocation disabled clears impacts.
      (function() {
        configStub.relocationEnabled = false;
        const mv = makeEvent({ id: 'mv_disabled', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const salary = makeEvent({ id: 'salary_disabled', type: 'SI', fromAge: 30, toAge: 40 });
        const result = runDetector([salary, mv], 'aa');
        assert(!result.find(e => e.id === 'salary_disabled').relocationImpact, 'When relocation disabled nothing is flagged');
        configStub.relocationEnabled = true;
      })();

      // Edge case: MV event at age 0.
      (function() {
        const mv = makeEvent({ id: 'mv_zero', type: 'MV-bb', fromAge: 0, toAge: 0 });
        const salary = makeEvent({ id: 'salary_zero', type: 'SI', fromAge: -1, toAge: 1 });
        const result = runDetector([salary, mv], 'aa');
        assert(result.find(e => e.id === 'salary_zero').relocationImpact, 'Boundary at age 0 should be detected');
      })();

      // Edge case: Event ending exactly at relocation age - should not be flagged as boundary.
      (function() {
        const mv = makeEvent({ id: 'mv_edge', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const salary = makeEvent({ id: 'salary_edge', type: 'SI', fromAge: 30, toAge: 35 });
        const result = runDetector([salary, mv], 'aa');
        assert(!result.find(e => e.id === 'salary_edge').relocationImpact, 'Event ending at relocation age should not cross boundary');
      })();

      // Edge case: Event starting exactly at relocation age - treated as simple.
      (function() {
        const mv = makeEvent({ id: 'mv_start', type: 'MV-bb', fromAge: 35, toAge: 35 });
        const salary = makeEvent({ id: 'salary_start', type: 'SI', fromAge: 35, toAge: 40 });
        const result = runDetector([salary, mv], 'aa');
        const impact = result.find(e => e.id === 'salary_start').relocationImpact;
        assert(impact && impact.category === 'simple', 'Event starting at relocation age should be simple impact');
      })();

    } catch (err) {
      errors.push(err.message || String(err));
    }

    return { success: errors.length === 0, errors };
  }
};
