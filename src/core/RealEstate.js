/* This file has to work on both the website and Google Sheets */

class RealEstate {

  constructor() {
    this.properties = {}
  }

  buy(id, downpayment, appreciation, currency, linkedCountry) {
    if (!(id in this.properties)) {
      this.properties[id] = new Property();
    }
    this.properties[id].buy(downpayment, appreciation, currency, linkedCountry);
    return this.properties[id];
  }

  sell(id) {
    if (id in this.properties) {
      let value = this.properties[id].getValue();
      delete this.properties[id];
      return value;
    }
    return 0;
  }

  mortgage(id, years, rate, payment, currency, linkedCountry) {
    if (!(id in this.properties)) {
      this.properties[id] = new Property();
    }
    this.properties[id].mortgage(years, rate, payment, currency, linkedCountry);
    return this.properties[id];
  }

  getValue(id) {
    if (id in this.properties) {
      return this.properties[id].getValue();
    }
    return 0;
  }

  getPayment(id) {
    if (id in this.properties) {
      return this.properties[id].getPayment();
    }
    return 0;
  }

  getCurrency(id) {
    if (id in this.properties) {
      return this.properties[id].getCurrency();
    }
    return null;
  }

  getLinkedCountry(id) {
    if (id in this.properties) {
      return this.properties[id].getLinkedCountry();
    }
    return null;
  }

  /**
   * Get total value of all properties in their native currencies (summed without conversion).
   * 
   * @deprecated This method sums property values without currency conversion and may produce
   * incorrect results when properties span multiple currencies. Use getTotalValueConverted()
   * instead, which properly converts all properties to a target currency before summing.
   * 
   * @returns {number} Sum of property values (may mix currencies - use with caution)
   */
  getTotalValue() {
    let sum = 0;
    for (let id of Object.keys(this.properties)) {
      sum += this.properties[id].getValue();
    }
    return sum;
  }

  getTotalValueConverted(targetCurrency, currentCountry, currentYear) {
    if (typeof convertCurrencyAmount !== 'function') {
      return this.getTotalValue();
    }
    let sum = 0;
    const currency = (typeof normalizeCurrency === 'function') ? normalizeCurrency : function (code) { return (code || '').toString().trim().toUpperCase(); };
    const country = (typeof normalizeCountry === 'function') ? normalizeCountry : function (code) { return (code || '').toString().trim().toLowerCase(); };
    for (let id of Object.keys(this.properties)) {
      const property = this.properties[id];
      const value = property.getValue();
      const fromCurrency = currency(property.getCurrency());
      let fromCountry = country(property.getLinkedCountry());
      if (!fromCountry) {
        fromCountry = country(currentCountry);
      }
      var converted = convertCurrencyAmount(value, fromCurrency, fromCountry, targetCurrency, currentCountry, currentYear, true);
      if (converted === null) {
        // Strict mode failure: return null to signal error
        return null;
      }
      sum += converted;
    }
    return sum;
  }

  addYear() {
    for (let id of Object.keys(this.properties)) {
      this.properties[id].addYear();
    }
  }

}


/**
 * Property represents a single real estate asset with optional mortgage.
 * 
 * @invariant Same currency per property: All monetary fields (paid, borrowed, payment)
 *            must share the same currency and country. This is enforced at buy/mortgage
 *            time and validated in getValue() to prevent silent currency mixing.
 */
class Property {

  constructor() {
    this.appreciation = 0;
    this.periods = 0;
    this.terms = 1;
    this.paymentsMade = 0;
    this.fractionRepaid = 0;
    this.paid = null;
    this.borrowed = null;
    this.payment = null;
  }

  buy(paid, appreciation, currency, linkedCountry) {
    this.appreciation = appreciation;
    var normalizedCurrency = (currency !== undefined && currency !== null && currency !== '') ? String(currency).toUpperCase() : 'EUR';
    var normalizedCountry = (linkedCountry !== undefined && linkedCountry !== null && linkedCountry !== '') ? String(linkedCountry).toLowerCase() : 'ie';
    this.paid = Money.create(paid, normalizedCurrency, normalizedCountry);
  }

  mortgage(years, rate, payment, currency, linkedCountry) {
    const n = years * 12;
    const r = rate / 12;
    const c = Math.pow(1 + r, n);
    var borrowedAmount = payment / 12 * (c - 1) / (r * c);
    this.terms = years;
    this.paymentsMade = 0;
    this.fractionRepaid = 0;
    var normalizedCurrency = (currency !== undefined && currency !== null && currency !== '') ? String(currency).toUpperCase() : (this.paid ? this.paid.currency : 'EUR');
    var normalizedCountry = (linkedCountry !== undefined && linkedCountry !== null && linkedCountry !== '') ? String(linkedCountry).toLowerCase() : (this.paid ? this.paid.country : 'ie');
    if (!this.paid) {
      this.paid = Money.create(0, normalizedCurrency, normalizedCountry);
    }
    this.payment = Money.create(payment, normalizedCurrency, normalizedCountry);
    this.borrowed = Money.create(borrowedAmount, normalizedCurrency, normalizedCountry);
  }

  addYear() {
    this.periods++;
    if (this.paymentsMade < this.terms) {
      this.paymentsMade++;
    }
    this.fractionRepaid = this.paymentsMade / this.terms;
  }

  getPayment() {
    return this.payment ? this.payment.amount : 0;
  }

  /**
   * Calculate current property value including appreciation and mortgage repayment.
   * 
   * @returns {number} Property value in native currency
   * @assumes Same currency per property - paid, borrowed, and payment must share currency/country.
   *          This invariant is enforced at buy/mortgage time and validated here.
   * @performance Rare call (yearly per property), direct .amount arithmetic for zero overhead.
   */
  getValue() {
    // Money path: safe currency-aware calculation
    var baseMoney;
    if (this.paid) {
      baseMoney = Money.create(this.paid.amount, this.paid.currency, this.paid.country);
      if (this.borrowed && this.fractionRepaid > 0) {
        var borrowedFraction = Money.create(this.borrowed.amount, this.borrowed.currency, this.borrowed.country);
        Money.multiply(borrowedFraction, this.fractionRepaid);
        Money.add(baseMoney, borrowedFraction);
      }
    } else if (this.borrowed) {
      baseMoney = Money.create(0, this.borrowed.currency, this.borrowed.country);
    } else {
      return 0; // No property data
    }

    // Safety: enforce same-currency invariant per property
    if (this.paid && this.borrowed) {
      if (this.paid.currency !== this.borrowed.currency) {
        throw new Error('Property currency mismatch: paid=' + this.paid.currency + ', borrowed=' + this.borrowed.currency);
      }
    }

    var resolvedRate = null;

    // Preserve legacy behaviour when an explicit appreciation rate is set.
    if (this.appreciation !== null && this.appreciation !== undefined && this.appreciation !== '') {
      resolvedRate = this.appreciation;
    } else {
      // When no explicit rate is provided, resolve an inflation rate for the
      // asset's country so that nominal growth is pegged to the property's
      // own country, not the simulator's current residency.
      try {
        if (typeof InflationService !== 'undefined' &&
          InflationService &&
          typeof InflationService.resolveInflationRate === 'function') {

          // Determine the asset country: linkedCountry -> params.StartCountry -> '' (let service decide).
          var assetCountry = '';
          var derivedCountry = this.getLinkedCountry();
          if (derivedCountry !== null && derivedCountry !== undefined && derivedCountry !== '') {
            assetCountry = derivedCountry;
          } else {
            try {
              if (typeof params !== 'undefined' && params && params.StartCountry) {
                assetCountry = params.StartCountry;
              }
            } catch (_) {
              assetCountry = '';
            }
          }

          // Prefer the current simulation year when available; otherwise let the
          // service fall back to its own defaults.
          var currentYear = null;
          try {
            if (typeof year === 'number') {
              currentYear = year;
            }
          } catch (_) {
            currentYear = null;
          }

          resolvedRate = InflationService.resolveInflationRate(assetCountry, currentYear, {
            params: (function () {
              try { return (typeof params !== 'undefined') ? params : null; } catch (_) { return null; }
            })(),
            countryInflationOverrides: (function () {
              try { return (typeof countryInflationOverrides !== 'undefined') ? countryInflationOverrides : null; } catch (_) { return null; }
            })()
          });
        }
      } catch (_) {
        resolvedRate = null;
      }

      // Fallback for environments without InflationService (legacy tests/GAS).
      if (resolvedRate === null || resolvedRate === undefined) {
        var fallbackRate = 0;
        try {
          if (typeof params !== 'undefined' && params && typeof params.inflation === 'number') {
            fallbackRate = params.inflation;
          }
        } catch (_) {
          fallbackRate = 0;
        }
        resolvedRate = fallbackRate;
      }
    }

    // Inflate: extract .amount, adjust, return
    var inflatedAmount = adjust(baseMoney.amount, resolvedRate, this.periods);

    return inflatedAmount;
  }

  getCurrency() {
    if (this.paid) return this.paid.currency;
    if (this.borrowed) return this.borrowed.currency;
    if (this.payment) return this.payment.currency;
    return null;
  }

  getLinkedCountry() {
    if (this.paid) return this.paid.country;
    if (this.borrowed) return this.borrowed.country;
    if (this.payment) return this.payment.country;
    return null;
  }

}
