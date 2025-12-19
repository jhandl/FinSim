/**
 * Money: Lightweight value object for currency-tagged monetary amounts.
 *
 * Design for performance:
 * - Mutable: arithmetic helpers modify target.amount in place
 * - Direct access: use money.amount in hot paths (no getter overhead)
 * - Validation: only at construction/boundaries, not in loops
 *
 * @constructor
 * @param {number} amount - Monetary value (must be finite)
 * @param {string} currency - Currency code (e.g., 'EUR', 'ARS')
 * @param {string} country - Country code (e.g., 'ie', 'ar')
 * @throws {Error} If amount is not finite or currency/country are invalid
 *
 * @example
 * var holding = Money.create(10000, 'EUR', 'ie'); // Struct for hot paths
 * holding.amount += 500; // Direct access in hot paths
 * new Money(1000, 'EUR', 'ie').add(new Money(250, 'EUR', 'ie')); // Boundary usage
 */
function Money(amount, currency, country) {
  Money_validate(amount, currency, country);
  this.amount = amount;
  this.currency = currency;
  this.country = country;
}

// Parity checks are expensive and should be disabled for production/performance.
// Enable explicitly in tests/debug runs via Money.enableParityChecks(true).
Money._parityChecksEnabled = (typeof FINSIM_MONEY_PARITY_CHECKS !== 'undefined') ? !!FINSIM_MONEY_PARITY_CHECKS : false;

Money.enableParityChecks = function(enabled) {
  Money._parityChecksEnabled = !!enabled;
};

Money.parityChecksEnabled = function() {
  return !!Money._parityChecksEnabled;
};

function Money_validate(amount, currency, country) {
  if (typeof amount !== 'number' || !isFinite(amount)) {
    throw new Error('Money amount must be a finite number: ' + amount);
  }
  if (typeof currency !== 'string' || currency.length === 0) {
    throw new Error('Money currency must be a non-empty string');
  }
  if (typeof country !== 'string' || country.length === 0) {
    throw new Error('Money country must be a non-empty string');
  }
}

Money.create = function(amount, currency, country) {
  Money_validate(amount, currency, country);
  return {amount: amount, currency: currency, country: country};
};

Money.add = function(target, other) {
  if (target.currency !== other.currency) {
    throw new Error('Currency mismatch: ' + target.currency + ' vs ' + other.currency);
  }
  if (target.country !== other.country) {
    throw new Error('Country mismatch: ' + target.country + ' vs ' + other.country);
  }
  target.amount += other.amount;
  return target;
};

Money.subtract = function(target, other) {
  if (target.currency !== other.currency) {
    throw new Error('Currency mismatch: ' + target.currency + ' vs ' + other.currency);
  }
  if (target.country !== other.country) {
    throw new Error('Country mismatch: ' + target.country + ' vs ' + other.country);
  }
  target.amount -= other.amount;
  return target;
};

Money.multiply = function(target, scalar) {
  if (typeof scalar !== 'number' || !isFinite(scalar)) {
    throw new Error('Money multiply scalar must be a finite number: ' + scalar);
  }
  target.amount *= scalar;
  return target;
};

Money.convertTo = function(money, targetCurrency, targetCountry, year, economicData) {
  var converted = economicData.convert(money.amount, money.country, targetCountry, year, {fxMode: 'evolution'});
  if (converted == null) {
    throw new Error('Conversion failed: ' + money.country + ' to ' + targetCountry + ' for year ' + year);
  }
  return new Money(converted, targetCurrency, targetCountry);
};

Money.equals = function(left, right) {
  return left.amount === right.amount &&
    left.currency === right.currency &&
    left.country === right.country;
};

Money.isZero = function(money) {
  return money.amount === 0;
};

Money.isPositive = function(money) {
  return money.amount > 0;
};

Money.isNegative = function(money) {
  return money.amount < 0;
};

Money.clone = function(money) {
  return new Money(money.amount, money.currency, money.country);
};

Money.prototype.add = function(other) {
  return Money.add(this, other);
};

Money.prototype.subtract = function(other) {
  return Money.subtract(this, other);
};

Money.prototype.multiply = function(scalar) {
  return Money.multiply(this, scalar);
};

Money.prototype.convertTo = function(targetCurrency, targetCountry, year, economicData) {
  return Money.convertTo(this, targetCurrency, targetCountry, year, economicData);
};

Money.prototype.equals = function(other) {
  return Money.equals(this, other);
};

Money.prototype.isZero = function() {
  return Money.isZero(this);
};

Money.prototype.isPositive = function() {
  return Money.isPositive(this);
};

Money.prototype.isNegative = function() {
  return Money.isNegative(this);
};

Money.prototype.getAmount = function() {
  return this.amount;
};

Money.prototype.clone = function() {
  return Money.clone(this);
};

Money.zero = function(currency, country) {
  return new Money(0, currency, country);
};

Money.from = function(amount, currency, country) {
  return new Money(amount, currency, country);
};

Money.fromNullable = function(amount, currency, country) {
  if (amount == null) {
    return Money.zero(currency, country);
  }
  return Money.from(amount, currency, country);
};

function MoneyPerfTest(options) {
  console.log('=== Money Performance Benchmark ===');

  var opts = options || {};
  var iterations = (opts.iterations != null) ? opts.iterations : 10000000;
  var warmupIterations = (opts.warmupIterations != null) ? opts.warmupIterations : 200000;
  var currency = 'EUR';
  var country = 'ie';
  var growth = 1.05;
  var interestGrowth = 1.02;
  var holdingsCount = (opts.holdingsCount != null) ? opts.holdingsCount : 500;
  var years = (opts.years != null) ? opts.years : 1000;

  function warmupPlain(n) {
    var sum = 0;
    for (var i = 0; i < n; i++) {
      sum += 100;
      sum *= growth;
    }
    return sum;
  }

  function warmupObject(n) {
    var obj = {amount: 0, currency: currency, country: country};
    for (var i = 0; i < n; i++) {
      obj.amount += 100;
      obj.amount *= growth;
    }
    return obj.amount;
  }

  function warmupStructDirect(n) {
    var m = Money.create(0, currency, country);
    for (var i = 0; i < n; i++) {
      m.amount += 100;
      m.amount *= growth;
    }
    return m.amount;
  }

  function warmupInstanceDirect(n) {
    var m = new Money(0, currency, country);
    for (var i = 0; i < n; i++) {
      m.amount += 100;
      m.amount *= growth;
    }
    return m.amount;
  }

  function warmupStatic(n) {
    var m1 = Money.create(0, currency, country);
    var m2 = Money.create(100, currency, country);
    for (var i = 0; i < n; i++) {
      Money.add(m1, m2);
      Money.multiply(m1, growth);
    }
    return m1.amount;
  }

  warmupPlain(warmupIterations);
  warmupObject(warmupIterations);
  warmupStructDirect(warmupIterations);
  warmupInstanceDirect(warmupIterations);
  warmupStatic(warmupIterations);

  // Test 1: Plain number arithmetic (baseline)
  var startPlain = performance.now();
  var sumPlain = 0;
  for (var i = 0; i < iterations; i++) {
    sumPlain += 100;
    sumPlain *= growth;
  }
  var timePlain = performance.now() - startPlain;
  console.log('Plain numbers (' + (iterations / 1000000) + 'M ops): ' + timePlain.toFixed(2) + 'ms');

  // Test 2: Plain object .amount (baseline for property access)
  var startObject = performance.now();
  var obj = {amount: 0, currency: currency, country: country};
  for (var j = 0; j < iterations; j++) {
    obj.amount += 100;
    obj.amount *= growth;
  }
  var timeObject = performance.now() - startObject;
  console.log('Plain object .amount (' + (iterations / 1000000) + 'M ops): ' + timeObject.toFixed(2) + 'ms');

  // Test 3: Money struct direct .amount access
  var startStructDirect = performance.now();
  var structDirect = Money.create(0, currency, country);
  for (var k = 0; k < iterations; k++) {
    structDirect.amount += 100;
    structDirect.amount *= growth;
  }
  var timeStructDirect = performance.now() - startStructDirect;
  console.log('Money struct .amount (' + (iterations / 1000000) + 'M ops): ' + timeStructDirect.toFixed(2) + 'ms');

  // Test 4: Money instance direct .amount access
  var startInstanceDirect = performance.now();
  var instanceDirect = new Money(0, currency, country);
  for (var l = 0; l < iterations; l++) {
    instanceDirect.amount += 100;
    instanceDirect.amount *= growth;
  }
  var timeInstanceDirect = performance.now() - startInstanceDirect;
  console.log('Money instance .amount (' + (iterations / 1000000) + 'M ops): ' + timeInstanceDirect.toFixed(2) + 'ms');

  // Test 5: Money static helpers (struct)
  var startStatic = performance.now();
  var staticTarget = Money.create(0, currency, country);
  var staticOther = Money.create(100, currency, country);
  for (var m = 0; m < iterations; m++) {
    Money.add(staticTarget, staticOther);
    Money.multiply(staticTarget, growth);
  }
  var timeStatic = performance.now() - startStatic;
  console.log('Money static helpers (' + (iterations / 1000000) + 'M ops): ' + timeStatic.toFixed(2) + 'ms');

  // Calculate overhead
  var overheadStructVsPlain = ((timeStructDirect - timePlain) / timePlain * 100).toFixed(2);
  var overheadInstanceVsPlain = ((timeInstanceDirect - timePlain) / timePlain * 100).toFixed(2);
  var overheadStaticVsPlain = ((timeStatic - timePlain) / timePlain * 100).toFixed(2);
  var overheadStructVsObject = ((timeStructDirect - timeObject) / timeObject * 100).toFixed(2);
  var overheadInstanceVsObject = ((timeInstanceDirect - timeObject) / timeObject * 100).toFixed(2);
  var overheadStaticVsObject = ((timeStatic - timeObject) / timeObject * 100).toFixed(2);
  console.log('Overhead (struct vs plain): ' + overheadStructVsPlain + '%');
  console.log('Overhead (instance vs plain): ' + overheadInstanceVsPlain + '%');
  console.log('Overhead (static vs plain): ' + overheadStaticVsPlain + '%');
  console.log('Overhead (struct vs object): ' + overheadStructVsObject + '%');
  console.log('Overhead (instance vs object): ' + overheadInstanceVsObject + '%');
  console.log('Overhead (static vs object): ' + overheadStaticVsObject + '%');
  console.log('Target: <5% overhead vs plain object .amount (struct direct)');

  function buildHoldingsNumbers(count) {
    var holdings = new Array(count);
    for (var i = 0; i < count; i++) {
      holdings[i] = {amount: 1000, interest: 100};
    }
    return holdings;
  }

  function buildHoldingsStruct(count) {
    var holdings = new Array(count);
    for (var i = 0; i < count; i++) {
      holdings[i] = {
        amount: Money.create(1000, currency, country),
        interest: Money.create(100, currency, country)
      };
    }
    return holdings;
  }

  function runHoldingsNumbers(holdings, yearsToRun) {
    var total = 0;
    for (var y = 0; y < yearsToRun; y++) {
      for (var i = 0; i < holdings.length; i++) {
        var h = holdings[i];
        h.amount += h.interest;
        h.amount *= growth;
        h.interest *= interestGrowth;
        total += h.amount;
      }
    }
    return total;
  }

  function runHoldingsStructDirect(holdings, yearsToRun) {
    var total = 0;
    for (var y = 0; y < yearsToRun; y++) {
      for (var i = 0; i < holdings.length; i++) {
        var h = holdings[i];
        h.amount.amount += h.interest.amount;
        h.amount.amount *= growth;
        h.interest.amount *= interestGrowth;
        total += h.amount.amount;
      }
    }
    return total;
  }

  function runHoldingsStructStatic(holdings, yearsToRun) {
    var total = 0;
    for (var y = 0; y < yearsToRun; y++) {
      for (var i = 0; i < holdings.length; i++) {
        var h = holdings[i];
        Money.add(h.amount, h.interest);
        Money.multiply(h.amount, growth);
        Money.multiply(h.interest, interestGrowth);
        total += h.amount.amount;
      }
    }
    return total;
  }

  var holdingsNumbers = buildHoldingsNumbers(holdingsCount);
  var holdingsStructDirect = buildHoldingsStruct(holdingsCount);
  var holdingsStructStatic = buildHoldingsStruct(holdingsCount);

  var startHoldingsNumbers = performance.now();
  runHoldingsNumbers(holdingsNumbers, years);
  var timeHoldingsNumbers = performance.now() - startHoldingsNumbers;
  console.log('Holdings numbers (' + holdingsCount + 'x' + years + '): ' + timeHoldingsNumbers.toFixed(2) + 'ms');

  var startHoldingsStructDirect = performance.now();
  runHoldingsStructDirect(holdingsStructDirect, years);
  var timeHoldingsStructDirect = performance.now() - startHoldingsStructDirect;
  console.log('Holdings Money struct direct (' + holdingsCount + 'x' + years + '): ' + timeHoldingsStructDirect.toFixed(2) + 'ms');

  var startHoldingsStructStatic = performance.now();
  runHoldingsStructStatic(holdingsStructStatic, years);
  var timeHoldingsStructStatic = performance.now() - startHoldingsStructStatic;
  console.log('Holdings Money struct static (' + holdingsCount + 'x' + years + '): ' + timeHoldingsStructStatic.toFixed(2) + 'ms');

  var overheadHoldingsStructDirect = ((timeHoldingsStructDirect - timeHoldingsNumbers) / timeHoldingsNumbers * 100).toFixed(2);
  var overheadHoldingsStructStatic = ((timeHoldingsStructStatic - timeHoldingsNumbers) / timeHoldingsNumbers * 100).toFixed(2);
  console.log('Holdings overhead (struct direct): ' + overheadHoldingsStructDirect + '%');
  console.log('Holdings overhead (struct static): ' + overheadHoldingsStructStatic + '%');

  return {
    timePlain: timePlain,
    timeObject: timeObject,
    timeStructDirect: timeStructDirect,
    timeInstanceDirect: timeInstanceDirect,
    timeStatic: timeStatic,
    timeHoldingsNumbers: timeHoldingsNumbers,
    timeHoldingsStructDirect: timeHoldingsStructDirect,
    timeHoldingsStructStatic: timeHoldingsStructStatic,
    overheadStructVsPlain: parseFloat(overheadStructVsPlain),
    overheadInstanceVsPlain: parseFloat(overheadInstanceVsPlain),
    overheadStaticVsPlain: parseFloat(overheadStaticVsPlain),
    overheadStructVsObject: parseFloat(overheadStructVsObject),
    overheadInstanceVsObject: parseFloat(overheadInstanceVsObject),
    overheadStaticVsObject: parseFloat(overheadStaticVsObject),
    overheadHoldingsStructDirect: parseFloat(overheadHoldingsStructDirect),
    overheadHoldingsStructStatic: parseFloat(overheadHoldingsStructStatic),
    iterations: iterations,
    holdingsCount: holdingsCount,
    years: years
  };
}

(function expose(global) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Money: Money, MoneyPerfTest: MoneyPerfTest };
  }
  if (typeof exports !== 'undefined') {
    exports.Money = Money;
    exports.MoneyPerfTest = MoneyPerfTest;
  }
  global.Money = Money;
  global.MoneyPerfTest = MoneyPerfTest;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
