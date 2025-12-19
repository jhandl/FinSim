const { TestFramework } = require('../src/core/TestFramework.js');
const vm = require('vm');

module.exports = {
  name: 'MoneyCurrencyMixing',
  description: 'Verifies that mixing currencies throws errors as expected',
  isCustomTest: true,
  async runCustomTest() {
    const framework = new TestFramework();
    const errors = [];

    if (!framework.loadCoreModules()) {
      return { success: false, errors: ['Failed to load core modules'] };
    }

    const ctx = framework.simulationContext;
    framework.ensureVMUIManagerMocks(null, null);
    await vm.runInContext('Config.initialize(WebUI.getInstance())', ctx);

    // Test 1: Money.add with different currencies should throw
    try {
      vm.runInContext(`
        var eur = Money.create(1000, 'EUR', 'ie');
        var ars = Money.create(1000, 'ARS', 'ar');
        Money.add(eur, ars); // Should throw
      `, ctx);
      errors.push('Money.add should throw when mixing EUR and ARS');
    } catch (err) {
      if (!err.message.includes('Currency mismatch')) {
        errors.push('Money.add threw wrong error: ' + err.message);
      }
    }

    // Test 2: Money.subtract with different currencies should throw
    try {
      vm.runInContext(`
        var eur = Money.create(1000, 'EUR', 'ie');
        var ars = Money.create(500, 'ARS', 'ar');
        Money.subtract(eur, ars); // Should throw
      `, ctx);
      errors.push('Money.subtract should throw when mixing EUR and ARS');
    } catch (err) {
      if (!err.message.includes('Currency mismatch')) {
        errors.push('Money.subtract threw wrong error: ' + err.message);
      }
    }

    // Test 3: Money.add with different countries should throw
    try {
      vm.runInContext(`
        var eurIE = Money.create(1000, 'EUR', 'ie');
        var eurDE = Money.create(1000, 'EUR', 'de');
        Money.add(eurIE, eurDE); // Should throw
      `, ctx);
      errors.push('Money.add should throw when mixing different countries');
    } catch (err) {
      if (!err.message.includes('Country mismatch')) {
        errors.push('Money.add threw wrong error: ' + err.message);
      }
    }

    // Test 4: Same currency/country should succeed
    try {
      const result = vm.runInContext(`
        var eur1 = Money.create(1000, 'EUR', 'ie');
        var eur2 = Money.create(500, 'EUR', 'ie');
        Money.add(eur1, eur2);
        eur1.amount;
      `, ctx);
      if (result !== 1500) {
        errors.push('Money.add with same currency/country should succeed: expected 1500, got ' + result);
      }
    } catch (err) {
      errors.push('Money.add with same currency/country should not throw: ' + err.message);
    }

    // Test 5: Invalid amount should throw
    try {
      vm.runInContext(`
        Money.create(NaN, 'EUR', 'ie'); // Should throw
      `, ctx);
      errors.push('Money.create should throw for NaN amount');
    } catch (err) {
      if (!err.message.includes('finite number')) {
        errors.push('Money.create threw wrong error for NaN: ' + err.message);
      }
    }

    // Test 6: Invalid currency should throw
    try {
      vm.runInContext(`
        Money.create(1000, '', 'ie'); // Should throw
      `, ctx);
      errors.push('Money.create should throw for empty currency');
    } catch (err) {
      if (!err.message.includes('non-empty string')) {
        errors.push('Money.create threw wrong error for empty currency: ' + err.message);
      }
    }

    return { success: errors.length === 0, errors: errors };
  }
};

