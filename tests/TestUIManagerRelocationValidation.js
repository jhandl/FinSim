const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = {
  name: 'UIManagerRelocationValidation',
  description: 'Validates strict MV destination handling and optional MV amount in UIManager.',
  isCustomTest: true,
  runCustomTest: async function () {
    const errors = [];
    const ctx = vm.createContext({ console: console });

    try {
      const utilsPath = path.join(__dirname, '..', 'src', 'core', 'Utils.js');
      const uiManagerPath = path.join(__dirname, '..', 'src', 'frontend', 'UIManager.js');
      vm.runInContext(fs.readFileSync(utilsPath, 'utf8'), ctx, { filename: 'Utils.js' });
      vm.runInContext(fs.readFileSync(uiManagerPath, 'utf8'), ctx, { filename: 'UIManager.js' });
    } catch (err) {
      return { success: false, errors: ['Failed to load sources: ' + (err.message || String(err))] };
    }

    try {
      vm.runInContext(`
        errors = false;
        document = {
          querySelectorAll: function () { return []; },
          getElementById: function () { return null; }
        };
        ValidationUtils = {
          validateValue: function (type, value) {
            if (value === undefined || value === null || value === '') return null;
            var n = Number(value);
            if (!isFinite(n) || n < 0) return null;
            return n;
          }
        };
        SimEvent = function (type, id, amount, fromAge, toAge, rate, match) {
          this.type = type;
          this.id = id;
          this.name = id;
          this.amount = amount;
          this.fromAge = (fromAge === '' || fromAge === undefined || fromAge === null) ? '' : Number(fromAge);
          this.toAge = (toAge === '' || toAge === undefined || toAge === null) ? '' : Number(toAge);
          this.rate = rate;
          this.match = match;
        };
        Config = {
          getInstance: function () {
            return {
              isRelocationEnabled: function () { return true; },
              getAvailableCountries: function () {
                return [
                  { code: 'IE', name: 'Ireland' },
                  { code: 'US', name: 'United States' }
                ];
              }
            };
          }
        };

        function createUi(rows) {
          var warnings = {};
          return {
            eventsTableManager: null,
            _warnings: warnings,
            getTableData: function () { return rows; },
            setWarning: function (key, msg) { warnings[key] = msg; },
            clearElementWarning: function () {},
            getValue: function (key) {
              if (key === 'simulation_mode') return 'single';
              if (key === 'StartingAge') return '30';
              if (key === 'P2StartingAge') return '';
              return '';
            }
          };
        }

        // Valid destination from parsed id should pass (proves we do not validate full "MV:US" token)
        var uiValid = createUi([['MV:US', '', '40', '', '', '']]);
        var mgrValid = new UIManager(uiValid);
        var validEvents = mgrValid.readEvents(true);
        if (!validEvents || validEvents.length !== 1) throw new Error('Expected one valid MV event.');
        if (uiValid._warnings['Events[1,2]']) throw new Error('MV amount should be optional; got amount warning: ' + uiValid._warnings['Events[1,2]']);
        if (uiValid._warnings['Events[1,1]']) throw new Error('Unexpected type warning for valid MV row.');

        // Invalid destination not in available countries should fail on Events[row,2]
        var uiInvalidCode = createUi([['MV:ZZ', '', '40', '', '', '']]);
        var mgrInvalidCode = new UIManager(uiInvalidCode);
        mgrInvalidCode.readEvents(true);
        if (uiInvalidCode._warnings['Events[1,2]'] !== 'Relocation destination country is required.') {
          throw new Error('Expected strict invalid-destination warning for non-listed country.');
        }

        // Blank destination should fail on Events[row,2]
        var uiBlankCode = createUi([['MV:', '', '40', '', '', '']]);
        var mgrBlankCode = new UIManager(uiBlankCode);
        mgrBlankCode.readEvents(true);
        if (uiBlankCode._warnings['Events[1,2]'] !== 'Relocation destination country is required.') {
          throw new Error('Expected strict warning for blank MV destination.');
        }
      `, ctx);
    } catch (err) {
      errors.push(err.message || String(err));
    }

    return { success: errors.length === 0, errors: errors };
  }
};
