module.exports = {
  name: 'ValidationUtils Currency Parsing',
  description: 'Unit tests for currency parsing in ValidationUtils',
  isCustomTest: true,
  async runCustomTest() {
    const errors = [];

    // Ensure FormatUtils.getLocaleSettings returns the Euro symbol for this test
    global.FormatUtils = {
      getLocaleSettings: () => ({ currencySymbol: '€' })
    };

    let ValidationUtils;
    try {
      ValidationUtils = require('../src/frontend/web/utils/ValidationUtils');
    } catch (e) {
      return { success: false, errors: ['Failed to load ValidationUtils: ' + (e && e.message)] };
    }

    try {
      const a = ValidationUtils.validateValue('currency', '- € 1,000');
      if (a !== -1000) errors.push('Expected -1000 for "- € 1,000", got ' + a);

      const b = ValidationUtils.validateValue('currency', '€1000');
      if (b !== 1000) errors.push('Expected 1000 for "€1000", got ' + b);

      const c = ValidationUtils.validateValue('currency', '1000 €');
      if (c !== 1000) errors.push('Expected 1000 for "1000 €", got ' + c);

      // Mixed/foreign symbol cases should also parse even when locale symbol differs
      const d = ValidationUtils.validateValue('currency', '$1,234');
      if (d !== 1234) errors.push('Expected 1234 for "$1,234", got ' + d);

      const e = ValidationUtils.validateValue('currency', 'US$12,345');
      if (e !== 12345) errors.push('Expected 12345 for "US$12,345", got ' + e);
    } catch (e) {
      errors.push('Exception during assertions: ' + (e && e.stack ? e.stack : e));
    }

    return { success: errors.length === 0, errors };
  }
};


