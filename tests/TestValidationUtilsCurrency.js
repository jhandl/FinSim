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
    } catch (e) {
      errors.push('Exception during assertions: ' + (e && e.stack ? e.stack : e));
    }

    return { success: errors.length === 0, errors };
  }
};


