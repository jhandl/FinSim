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

Money.create = function (amount, currency, country) {
  Money_validate(amount, currency, country);
  return { amount: amount, currency: currency, country: country };
};

Money.add = function (target, other) {
  if (target.currency !== other.currency) {
    throw new Error('Currency mismatch: ' + target.currency + ' vs ' + other.currency);
  }
  if (target.country !== other.country) {
    throw new Error('Country mismatch: ' + target.country + ' vs ' + other.country);
  }
  target.amount += other.amount;
  return target;
};

Money.subtract = function (target, other) {
  if (target.currency !== other.currency) {
    throw new Error('Currency mismatch: ' + target.currency + ' vs ' + other.currency);
  }
  if (target.country !== other.country) {
    throw new Error('Country mismatch: ' + target.country + ' vs ' + other.country);
  }
  target.amount -= other.amount;
  return target;
};

Money.multiply = function (target, scalar) {
  if (typeof scalar !== 'number' || !isFinite(scalar)) {
    throw new Error('Money multiply scalar must be a finite number: ' + scalar);
  }
  target.amount *= scalar;
  return target;
};

/**
 * Scalar multiplication returning a new Money object (non-mutating).
 * Optimized for tax calculation patterns where original amount must be preserved.
 * 
 * @param {Money} money - Source Money object
 * @param {number} scalar - Multiplier (e.g., tax rate)
 * @returns {Money} New Money object with amount * scalar
 * @throws {Error} If scalar is not finite
 */
Money.scalarMultiply = function (money, scalar) {
  // No validation: follows Money design principle "Validation: only at construction/boundaries, not in loops"
  // Called in hot paths (tax calculations). Callers trusted to pass finite numbers.
  return { amount: money.amount * scalar, currency: money.currency, country: money.country };
};

Money.convertTo = function (money, targetCurrency, targetCountry, year, economicData) {
  var converted = economicData.convert(money.amount, money.country, targetCountry, year, { fxMode: 'evolution' });
  if (converted == null) {
    throw new Error('Conversion failed: ' + money.country + ' to ' + targetCountry + ' for year ' + year);
  }
  return new Money(converted, targetCurrency, targetCountry);
};

Money.equals = function (left, right) {
  return left.amount === right.amount &&
    left.currency === right.currency &&
    left.country === right.country;
};

Money.isZero = function (money) {
  return money.amount === 0;
};

Money.isPositive = function (money) {
  return money.amount > 0;
};

Money.isNegative = function (money) {
  return money.amount < 0;
};

Money.clone = function (money) {
  return new Money(money.amount, money.currency, money.country);
};

Money.prototype.add = function (other) {
  return Money.add(this, other);
};

Money.prototype.subtract = function (other) {
  return Money.subtract(this, other);
};

Money.prototype.multiply = function (scalar) {
  return Money.multiply(this, scalar);
};

Money.prototype.scalarMultiply = function (scalar) {
  return Money.scalarMultiply(this, scalar);
};

Money.prototype.convertTo = function (targetCurrency, targetCountry, year, economicData) {
  return Money.convertTo(this, targetCurrency, targetCountry, year, economicData);
};

Money.prototype.equals = function (other) {
  return Money.equals(this, other);
};

Money.prototype.isZero = function () {
  return Money.isZero(this);
};

Money.prototype.isPositive = function () {
  return Money.isPositive(this);
};

Money.prototype.isNegative = function () {
  return Money.isNegative(this);
};

Money.prototype.getAmount = function () {
  return this.amount;
};

Money.prototype.clone = function () {
  return Money.clone(this);
};

Money.zero = function (currency, country) {
  return Money.create(0, currency, country);
};

Money.from = function (amount, currency, country) {
  return new Money(amount, currency, country);
};

Money.fromNullable = function (amount, currency, country) {
  if (amount == null) {
    return Money.zero(currency, country);
  }
  return Money.from(amount, currency, country);
};

(function expose(global) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Money: Money };
  }
  if (typeof exports !== 'undefined') {
    exports.Money = Money;
  }
  global.Money = Money;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
