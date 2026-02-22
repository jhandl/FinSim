const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = {
  name: 'MortgageEventValidation',
  description: 'Validates mortgage/property alignment rules block invalid scenarios.',
  isCustomTest: true,
  runCustomTest: async function() {
    const errors = [];
    const uiManagerPath = path.join(__dirname, '..', 'src', 'frontend', 'UIManager.js');
    const uiManagerCode = fs.readFileSync(uiManagerPath, 'utf8');
    const ctx = vm.createContext({ console: console, errors: false });

    try {
      vm.runInContext(uiManagerCode, ctx, { filename: 'UIManager.js' });
    } catch (err) {
      return { success: false, errors: [`Failed to load UIManager.js: ${err.message}`] };
    }

    function runCase(events) {
      const script = `
        warnings = [];
        errors = false;
        var ui = { setWarning: function(id, msg) { warnings.push({ id: id, msg: msg }); } };
        var mgr = new UIManager(ui);
        var events = ${JSON.stringify(events)};
        mgr.validateRealEstateEvents(events);
        mgr.validateMortgageEvents(events);
        ({ errors: errors, warnings: warnings });
      `;
      return vm.runInContext(script, ctx);
    }

    function expectWarningIds(result, ids) {
      const got = (result.warnings || []).map(w => w.id);
      ids.forEach(id => {
        assert.ok(got.indexOf(id) !== -1, `Expected warning id ${id}, got ${JSON.stringify(got)}`);
      });
    }

    try {
      // Case 1: fromAge mismatch blocks.
      {
        const result = runCase([
          { type: 'R', id: 'Home', fromAge: 30, toAge: 60 },
          { type: 'M', id: 'Home', fromAge: 31, toAge: 60 }
        ]);
        assert.strictEqual(result.errors, true, 'fromAge mismatch should set errors');
        expectWarningIds(result, ['Events[2,3]']);
      }

      // Case 2: mortgage ends after property sale blocks.
      {
        const result = runCase([
          { type: 'R', id: 'Home', fromAge: 30, toAge: 50 },
          { type: 'M', id: 'Home', fromAge: 30, toAge: 55 }
        ]);
        assert.strictEqual(result.errors, true, 'toAge mismatch should set errors');
        expectWarningIds(result, ['Events[2,4]']);
      }

      // Case 3: missing property blocks.
      {
        const result = runCase([
          { type: 'M', id: 'Home', fromAge: 30, toAge: 40 }
        ]);
        assert.strictEqual(result.errors, true, 'missing property should set errors');
        expectWarningIds(result, ['Events[1,1]']);
      }

      // Case 4: aligned mortgage/property passes.
      {
        const result = runCase([
          { type: 'R', id: 'Home', fromAge: 30, toAge: 60 },
          { type: 'M', id: 'Home', fromAge: 30, toAge: 60 }
        ]);
        assert.strictEqual(result.errors, false, 'aligned mortgage/property should not set errors');
        assert.strictEqual((result.warnings || []).length, 0, 'aligned mortgage/property should have no warnings');
      }

      // Case 5: multiple mortgages for same property blocks.
      {
        const result = runCase([
          { type: 'R', id: 'Home', fromAge: 30, toAge: 60 },
          { type: 'M', id: 'Home', fromAge: 30, toAge: 60 },
          { type: 'M', id: 'Home', fromAge: 30, toAge: 50 }
        ]);
        assert.strictEqual(result.errors, true, 'multiple mortgages should set errors');
        expectWarningIds(result, ['Events[3,1]']);
      }

      // Case 6: multiple property events with same name blocks.
      {
        const result = runCase([
          { type: 'R', id: 'Home', fromAge: 30, toAge: 60 },
          { type: 'R', id: 'Home', fromAge: 40, toAge: 70 },
          { type: 'M', id: 'Home', fromAge: 30, toAge: 60 }
        ]);
        assert.strictEqual(result.errors, true, 'ambiguous property should set errors');
        expectWarningIds(result, ['Events[2,1]', 'Events[3,1]']);
      }

      // Case 7: MO requires an existing M event.
      {
        const result = runCase([
          { type: 'R', id: 'Home', fromAge: 30, toAge: 60 },
          { type: 'MO', id: 'Home', amount: 1000, fromAge: 31, toAge: 40 }
        ]);
        assert.strictEqual(result.errors, true, 'MO without M should set errors');
        expectWarningIds(result, ['Events[2,1]']);
      }

      // Case 8: MP must be one-off and align with M.toAge.
      {
        const result = runCase([
          { type: 'R', id: 'Home', fromAge: 30, toAge: 60 },
          { type: 'M', id: 'Home', fromAge: 30, toAge: 45 },
          { type: 'MP', id: 'Home', fromAge: 44, toAge: 45 }
        ]);
        assert.strictEqual(result.errors, true, 'misaligned MP should set errors');
        expectWarningIds(result, ['Events[3,4]', 'Events[3,3]']);
      }

      // Case 9: MR requires an existing R event.
      {
        const result = runCase([
          { type: 'MR', id: 'Home', amount: 10000, fromAge: 40, toAge: 50, rate: 0.05 }
        ]);
        assert.strictEqual(result.errors, true, 'MR without R should set errors');
        expectWarningIds(result, ['Events[1,1]']);
      }
    } catch (err) {
      errors.push(err.message || String(err));
    }

    return { success: errors.length === 0, errors };
  }
};
